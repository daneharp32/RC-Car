// Multiplayer Sandbox builder, vehicle gadgets, and shared physics events.
export function createSandboxSystem(game) {
  const { THREE, CANNON, scene, chassisBody, localCar, $ } = game;
  const builderPanel = $("sandboxBuilderPanel");
  const controlsPanel = $("sandboxControlsCard");
  const secretMenuPanel = $("sandboxSecretMenu");
  const secretMenuStatus = $("sandboxSecretStatus");
  const loadout = new Set();
  const attachmentCache = new WeakMap();
  const beacons = [];
  const waves = [];
  const projectiles = [];
  const seenEvents = new Set();
  const held = { lift: false, forward: false };
  const heldAssignments = Object.create(null);
  const launcherCharge = { key: null, startedAt: 0, charge: 0, lastUiAt: 0 };
  const cooldowns = { beacon: 0, launcher: 0, orbitalLaser: 0 };
  const secretSettings = {
    infiniteGadgets: false,
    gravityOrbRadius: 1,
    gravityOrbPower: 1,
    jumpThrusterPower: 26,
    forwardThrusterPower: 48
  };
  const secretChordKeys = new Set();
  const orbitalLaserSequences = [];
  let secretChordLatched = false;
  let secretMenuOpen = false;
  let orbitalScreenEffects = null;
  const BEACON_ARM_DELAY = 3000;
  const BEACON_TRIGGER_RADIUS = 8;
  const MAX_EQUIPPED_GADGETS = 3;
  const SLOT_KEYS = ["q", "e", "f"];
  const LAUNCHER_MAX_CHARGE_MS = 1800;
  const LAUNCHER_COOLDOWN_MS = 900;
  const ORBITAL_LASER_COOLDOWN_MS = 28_000;
  const ORBITAL_LASER_WARNING_MS = 10_000;
  const ORBITAL_LASER_EXPANSION_MS = 900;
  const ORBITAL_LASER_RESET_MS = ORBITAL_LASER_WARNING_MS + ORBITAL_LASER_EXPANSION_MS;
  const ORBITAL_LASER_CLEANUP_MS = ORBITAL_LASER_RESET_MS + 2400;
  const ORB_GRAVITY = 9.82;
  const ORB_RADIUS = 0.22;
  const GRAVITY_ORB_ELEVATION = 0.34;
  // Constant acceleration while Q is held. This is a directional thruster,
  // not a height- or speed-hold controller.
  const JUMP_THRUSTER_ACCELERATION = 26;
  const PARTS = [
    { id: "lift", title: "JUMP THRUSTERS" },
    { id: "forward", title: "FORWARD THRUSTERS" },
    { id: "beacon", title: "IMPULSE BEACON" },
    { id: "gravity-orb", title: "GRAVITY ORB LAUNCHER" },
    { id: "orbital-laser", title: "ORBITAL LASER" }
  ];

  let active = false;
  let inMap = false;
  let playerCount = 1;
  let localAttachment = null;
  const standardAngularDamping = chassisBody.angularDamping;
  let flightControlArmed = false;

  function dispose(root) {
    root.traverse((object) => {
      object.geometry?.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      }
    });
  }

  function addBox(parent, size, position, material, rotation = null) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function addCylinder(parent, radiusTop, radiusBottom, height, position, material, rotation = [0, 0, 0]) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 16),
      material
    );
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function makeGroundWash() {
    const group = new THREE.Group();
    group.name = "sandbox-thruster-ground-wash";

    const hazeMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float radius = length(p);
          float edge = 1.0 - smoothstep(0.56, 1.0, radius);
          float center = 1.0 - smoothstep(0.0, 0.86, radius);
          float angle = atan(p.y, p.x);
          float wisps = 0.82 + 0.18 * sin(radius * 38.0 - uTime * 7.2 + sin(angle * 7.0) * 1.55);
          float grain = 0.88 + 0.12 * sin(dot(p, vec2(47.0, 31.0)) + uTime * 3.1);
          float alpha = edge * (0.11 + 0.16 * center) * wisps * grain * uOpacity;
          vec3 color = mix(vec3(0.28, 0.21, 0.15), vec3(0.56, 0.46, 0.34), center * 0.42);
          gl_FragColor = vec4(color, alpha);
        }
      `
    });
    const haze = new THREE.Mesh(new THREE.CircleGeometry(1, 56), hazeMaterial);
    haze.rotation.x = -Math.PI / 2;
    haze.position.y = 0.018;
    group.add(haze);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xc8b49a, transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false
    });
    const outerRingMaterial = new THREE.MeshBasicMaterial({
      color: 0x9d8870, transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false
    });
    const innerRing = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.49, 56), ringMaterial);
    const outerRing = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.81, 56), outerRingMaterial);
    innerRing.rotation.x = outerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.026;
    outerRing.position.y = 0.024;
    group.add(innerRing, outerRing);

    const puffs = [];
    const puffGeometry = new THREE.SphereGeometry(0.28, 9, 7);
    const puffSpecs = [
      [0.00, 0.00, 0.38], [0.62, 0.10, 0.27], [1.22, -0.08, 0.34],
      [1.92, 0.07, 0.29], [2.58, -0.04, 0.36], [3.18, 0.10, 0.27],
      [3.86, -0.07, 0.34], [4.55, 0.06, 0.29], [5.22, -0.04, 0.35]
    ];
    for (const [angle, height, size] of puffSpecs) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x9b8975, transparent: true, opacity: 0,
        depthWrite: false, toneMapped: false
      });
      const mesh = new THREE.Mesh(puffGeometry, material);
      mesh.position.set(Math.cos(angle) * 0.48, 0.07 + height, Math.sin(angle) * 0.48);
      mesh.scale.set(size, size * 0.44, size);
      group.add(mesh);
      puffs.push({ mesh, material, angle, size });
    }

    const particles = [];
    const particleGeometry = new THREE.SphereGeometry(0.075, 7, 6);
    for (let i = 0; i < 16; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xc3b19a : 0x8b7a68,
        transparent: true, opacity: 0,
        depthWrite: false, toneMapped: false
      });
      const mesh = new THREE.Mesh(particleGeometry, material);
      group.add(mesh);
      particles.push({
        mesh, material,
        angle: i * 2.399963,
        phase: i / 16,
        speed: 0.38 + (i % 5) * 0.055,
        drift: 0.7 + (i % 4) * 0.16
      });
    }

    group.visible = false;
    scene.add(group);
    return { group, hazeMaterial, innerRing, outerRing, ringMaterial, outerRingMaterial, puffs, particles };
  }

  function updateGroundWash(wash, position, distance, strength, direction, now) {
    if (!wash) return;
    wash.group.visible = strength > 0.015;
    if (!wash.group.visible) return;

    wash.group.position.copy(position);
    wash.group.rotation.y = Math.atan2(direction.x, direction.z);
    const spread = 0.9 + Math.min(distance, 4.2) * 0.22;
    wash.group.scale.setScalar(spread);
    wash.hazeMaterial.uniforms.uTime.value = now * 0.001;
    wash.hazeMaterial.uniforms.uOpacity.value = strength;
    const flicker = 0.82 + Math.sin(now * 0.021) * 0.08 + Math.sin(now * 0.047) * 0.05;
    wash.ringMaterial.opacity = strength * (0.22 + flicker * 0.10);
    wash.outerRingMaterial.opacity = strength * (0.12 + flicker * 0.07);
    wash.innerRing.scale.setScalar(0.9 + Math.sin(now * 0.012) * 0.08);
    wash.outerRing.scale.setScalar(0.95 + Math.sin(now * 0.009 + 1.4) * 0.09);

    for (const puff of wash.puffs) {
      const swell = 0.88 + Math.sin(now * 0.012 + puff.angle * 1.7) * 0.16;
      puff.mesh.material.opacity = strength * (0.10 + flicker * 0.12);
      puff.mesh.scale.set(
        puff.size * swell,
        puff.size * 0.44 * swell,
        puff.size * swell
      );
    }

    for (const particle of wash.particles) {
      const progress = (now * 0.001 * particle.speed + particle.phase) % 1;
      const radius = 0.22 + progress * particle.drift * (0.95 + distance * 0.12);
      const flutter = Math.sin(now * 0.014 + particle.phase * 18) * 0.09;
      particle.mesh.position.set(
        Math.cos(particle.angle) * (radius + flutter),
        0.035 + progress * 0.24,
        Math.sin(particle.angle) * (radius - flutter)
      );
      particle.mesh.scale.setScalar(0.48 + (1 - progress) * 0.75);
      particle.material.opacity = strength * (1 - progress) * 0.48;
    }
  }

  function makeColdGasPlume(parent, position, direction, length, radius) {
    const plume = new THREE.Group();
    plume.position.set(...position);
    if (direction === "down") plume.rotation.z = Math.PI;
    else if (direction === "rear") plume.rotation.x = Math.PI / 2;
    else plume.rotation.x = -Math.PI / 2;

    // Overlapping translucent shells give the cold gas a soft, volumetric core
    // and a wider feathered edge instead of a single hard-edged cone.
    const layers = [];
    const layerSpecs = [
      { scale: 1.30, opacity: 0.105, color: 0x9edff0 },
      { scale: 1.00, opacity: 0.19, color: 0xd9f6ff },
      { scale: 0.67, opacity: 0.23, color: 0xa9eaff },
      { scale: 0.34, opacity: 0.30, color: 0xffffff }
    ];
    for (const spec of layerSpecs) {
      const material = new THREE.MeshBasicMaterial({
        color: spec.color, transparent: true, opacity: spec.opacity,
        depthWrite: false, blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide, toneMapped: false
      });
      const mesh = new THREE.Mesh(
        new THREE.ConeGeometry(radius * spec.scale, length * spec.scale, 24, 12),
        material
      );
      mesh.position.y = length * spec.scale * 0.5;
      plume.add(mesh);
      layers.push({ mesh, material, baseOpacity: spec.opacity, scale: spec.scale });
    }

    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xe7fbff, transparent: true, opacity: 0.32,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
    });
    const baseGlow = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), glowMaterial);
    baseGlow.position.y = length * 0.10;
    baseGlow.scale.set(radius * 0.82, length * 0.17, radius * 0.82);
    plume.add(baseGlow);

    const particles = [];
    for (let i = 0; i < 20; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: i % 4 === 0 ? 0xffffff : 0xc9f2ff,
        transparent: true, opacity: 0.24,
        depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
      });
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius * (0.075 + (i % 3) * 0.018), 7, 6),
        material
      );
      plume.add(mesh);
      particles.push({
        mesh, material,
        phase: i / 20,
        angle: i * 2.399963,
        speed: 0.52 + (i % 6) * 0.085,
        spread: 0.34 + (i % 5) * 0.14,
        seed: i
      });
    }

    plume.visible = false;
    parent.add(plume);
    return { group: plume, layers, particles, baseGlow, length, radius };
  }

  function makeJumpThrusters(root, createGroundEffects = true) {
    const group = new THREE.Group();
    group.name = "sandbox-jump-thrusters";
    const housing = new THREE.MeshStandardMaterial({color:0x202c36,roughness:0.42,metalness:0.82});
    const nozzle = new THREE.MeshStandardMaterial({color:0x91a7b2,roughness:0.24,metalness:0.9});
    const aperture = new THREE.MeshStandardMaterial({color:0x07131c,roughness:0.3,metalness:0.5});
    const jets=[];
    for(const x of [-0.31,0.31]){
      for(const z of [-0.39,0.39]){
        addBox(group,[0.19,0.075,0.21],[x,0.13,z],housing);
        addCylinder(group,0.074,0.096,0.12,[x,0.055,z],nozzle);
        addCylinder(group,0.052,0.052,0.012,[x,-0.012,z],aperture);
        const rim=new THREE.Mesh(new THREE.TorusGeometry(0.073,0.009,8,24),new THREE.MeshBasicMaterial({color:0x9cecff,transparent:true,opacity:0.55}));
        rim.position.set(x,-0.022,z); rim.rotation.x=Math.PI/2; group.add(rim);
        jets.push({
          side: x < 0 ? "left" : "right",
          end: z < 0 ? "rear" : "front",
          position: new THREE.Vector3(x, -0.035, z),
          plume: makeColdGasPlume(group, [x, -0.035, z], "down", 1.42, 0.145),
          groundWash: createGroundEffects ? makeGroundWash() : null
        });
      }
    }
    root.add(group); return jets;
  }
  function makeForwardThrusters(root) {
    const group = new THREE.Group();
    group.name = "sandbox-forward-thrusters";
    const housing = new THREE.MeshStandardMaterial({
      color: 0x18242e, roughness: 0.38, metalness: 0.84
    });
    const nozzle = new THREE.MeshStandardMaterial({
      color: 0x9aadb7, roughness: 0.23, metalness: 0.9
    });
    const aperture = new THREE.MeshStandardMaterial({
      color: 0x07131c, roughness: 0.28, metalness: 0.55
    });
    const jets = [];
    for (const x of [-0.22, 0.22]) {
      // The truck's front is local -Z, so its rear is local +Z. Keep the
      // nozzle axis, aperture, and exhaust plume aligned rearward on +Z.
      addBox(group, [0.19, 0.105, 0.23], [x, 0.22, 0.36], housing);
      addCylinder(group, 0.079, 0.102, 0.15, [x, 0.22, 0.48], nozzle,
        [Math.PI / 2, 0, 0]);
      addCylinder(group, 0.055, 0.055, 0.012, [x, 0.22, 0.56], aperture,
        [Math.PI / 2, 0, 0]);
      jets.push(makeColdGasPlume(group, [x, 0.22, 0.57], "rear", 1.32, 0.17));
    }
    root.add(group);
    return jets;
  }
  function makeImpulseBeaconModule(root) {
    const group = new THREE.Group();
    group.name = "sandbox-impulse-beacon-module";
    const dark = new THREE.MeshStandardMaterial({
      color: 0x202b35, roughness: 0.46, metalness: 0.72
    });
    const glow = new THREE.MeshBasicMaterial({
      color: 0x62dcff, toneMapped: false
    });
    addBox(group, [0.34, 0.08, 0.27], [0, 0.18, 0.37], dark);
    addCylinder(group, 0.085, 0.10, 0.10, [0, 0.25, 0.37], dark);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), glow);
    orb.position.set(0, 0.34, 0.37);
    group.add(orb);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.15, 0.012, 8, 24),
      glow
    );
    ring.position.set(0, 0.34, 0.37);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    root.add(group);
  }

  function makeGravityOrbLauncherModule(root) {
    const group = new THREE.Group();
    group.name = "sandbox-gravity-orb-launcher-module";
    const mount = new THREE.MeshStandardMaterial({
      color: 0x202b35, roughness: 0.42, metalness: 0.78
    });
    const barrel = new THREE.MeshStandardMaterial({
      color: 0x344b5d, roughness: 0.28, metalness: 0.86
    });
    const blue = new THREE.MeshBasicMaterial({
      color: 0x168fff, toneMapped: false
    });
    addBox(group, [0.48, 0.10, 0.52], [0, 0.24, -0.12], mount);
    addBox(group, [0.13, 0.20, 0.15], [0, 0.39, -0.20], mount);
    const tube = addCylinder(
      group, 0.115, 0.15, 0.82, [0, 0.51, -0.42], barrel,
      [-Math.PI / 2 + GRAVITY_ORB_ELEVATION, 0, 0]
    );
    tube.castShadow = true;
    // Match the muzzle ring and glowing chamber to the barrel's reduced angle.
    const muzzlePosition = new THREE.Vector3(
      0,
      0.51 + 0.41 * Math.sin(GRAVITY_ORB_ELEVATION),
      -0.42 - 0.41 * Math.cos(GRAVITY_ORB_ELEVATION)
    );
    const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 8, 28), blue);
    muzzle.position.copy(muzzlePosition);
    muzzle.rotation.x = GRAVITY_ORB_ELEVATION;
    group.add(muzzle);
    const statusOrb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), blue);
    statusOrb.position.copy(muzzlePosition);
    group.add(statusOrb);
    root.add(group);
  }

  function makeOrbitalLaserModule(root) {
    const group = new THREE.Group();
    group.name = "sandbox-orbital-laser-beacon";
    const dark = new THREE.MeshStandardMaterial({
      color: 0x182633, roughness: 0.34, metalness: 0.86
    });
    const alloy = new THREE.MeshStandardMaterial({
      color: 0x9fb8c8, roughness: 0.22, metalness: 0.82
    });
    const blue = new THREE.MeshBasicMaterial({
      color: 0x168dff, toneMapped: false
    });
    addBox(group, [0.56, 0.12, 0.48], [0, 0.30, 0.04], dark);
    addCylinder(group, 0.16, 0.20, 0.18, [0, 0.43, 0.04], alloy);
    addCylinder(group, 0.055, 0.07, 0.68, [0, 0.84, 0.04], dark);
    const beaconRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.27, 0.025, 10, 36), blue
    );
    beaconRing.position.set(0, 1.13, 0.04);
    beaconRing.rotation.x = Math.PI / 2;
    group.add(beaconRing);
    const emitter = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 18, 14),
      new THREE.MeshBasicMaterial({
        color: 0xa6e8ff, toneMapped: false
      })
    );
    emitter.position.set(0, 1.23, 0.04);
    group.add(emitter);
    addCylinder(group, 0.19, 0.19, 0.045, [0, 1.08, 0.04], blue);
    root.add(group);
  }

  function applyLoadout(visual, requested) {
    if (!visual?.root) return;
    const ids = [...new Set((Array.isArray(requested) ? requested : []).filter((id) =>
      PARTS.some((part) => part.id === id)
    ))];
    const key = ids.join("|");
    const previous = attachmentCache.get(visual);
    if (previous?.key === key) {
      previous.group.visible = visual === localCar ? active : true;
      if (visual === localCar) localAttachment = previous;
      return;
    }
    if (previous) {
      visual.root.remove(previous.group);
      dispose(previous.group);
      for (const jet of previous.liftFlames || []) {
        scene.remove(jet.groundWash?.group);
        if (jet.groundWash?.group) dispose(jet.groundWash.group);
      }
    }

    const group = new THREE.Group();
    group.name = "sandbox-gadget-attachments";
    const liftFlames = ids.includes("lift") ? makeJumpThrusters(group, visual === localCar) : [];
    const forwardFlames = ids.includes("forward") ? makeForwardThrusters(group) : [];
    if (ids.includes("beacon")) makeImpulseBeaconModule(group);
    if (ids.includes("gravity-orb")) makeGravityOrbLauncherModule(group);
    if (ids.includes("orbital-laser")) makeOrbitalLaserModule(group);
    group.visible = visual === localCar ? active : true;
    visual.root.add(group);

    const entry = { key, group, liftFlames, forwardFlames };
    attachmentCache.set(visual, entry);
    if (visual === localCar) localAttachment = entry;
  }

  function getLoadout() {
    return [...loadout];
  }

  function getSlotAssignments() {
    const equipped = getLoadout();
    const slots = { q: null, e: null, f: null };

    // Thrusters keep Q and E even when the loadout order changes.
    if (equipped.includes("lift")) slots.q = "lift";
    if (equipped.includes("forward")) slots.e = "forward";

    // The Orbital Laser takes the available action key when installed.
    // Other extra gadgets remain mounted even when they have no key slot.
    const extras = equipped.filter((id) => id !== "lift" && id !== "forward");
    slots.f = extras.includes("orbital-laser") ? "orbital-laser" : (extras[0] || null);
    return slots;
  }

  function getPartForKey(key) {
    return getSlotAssignments()[key] || null;
  }

  function getThrusterState() {
    const enabled = active && inMap && !game.isPaused?.();
    return {
      lift: enabled && held.lift && loadout.has("lift"),
      forward: enabled && held.forward && loadout.has("forward")
    };
  }

  function applyRemoteThrusterState(visual, state) {
    const entry = attachmentCache.get(visual);
    if (!entry) return;
    const lift = state?.lift === true;
    const forward = state?.forward === true;
    for (const jet of entry.liftFlames) setColdGasJet(jet.plume,lift,0);
    for (const jet of entry.forwardFlames) setColdGasJet(jet,forward,0);
  }

  function setColdGasJet(jet, active, now) {
    if (!jet?.group) return;
    jet.group.visible = active;
    if (!active) return;

    const pulse = 0.96 + Math.sin(now * 0.026) * 0.055 + Math.sin(now * 0.011) * 0.035;
    const flutter = Math.sin(now * 0.061 + 0.8) * 0.045;
    jet.group.scale.set(1 + flutter, 0.94 + pulse * 0.08, 1 - flutter * 0.65);

    jet.layers.forEach((layer, index) => {
      const flicker = 0.76 + Math.sin(now * (0.025 + index * 0.006) + index * 1.7) * 0.16
        + Math.sin(now * 0.071 + index * 2.4) * 0.08;
      layer.material.opacity = layer.baseOpacity * flicker;
      layer.mesh.scale.set(
        1 + Math.sin(now * 0.033 + index) * 0.055,
        0.94 + pulse * 0.08,
        1 + Math.cos(now * 0.029 + index) * 0.05
      );
    });

    if (jet.baseGlow) {
      jet.baseGlow.material.opacity = 0.24 + Math.sin(now * 0.052) * 0.07;
      jet.baseGlow.scale.x = jet.radius * (0.78 + pulse * 0.08);
      jet.baseGlow.scale.z = jet.radius * (0.78 + pulse * 0.08);
    }

    jet.particles.forEach((particle) => {
      const progress = (now * 0.001 * particle.speed + particle.phase) % 1;
      const radial = jet.radius * (0.12 + progress * particle.spread);
      const flicker = Math.sin(now * 0.047 + particle.seed * 2.1) * jet.radius * 0.09;
      particle.mesh.position.set(
        Math.cos(particle.angle) * (radial + flicker),
        jet.length * (0.08 + progress * 0.86),
        Math.sin(particle.angle) * (radial - flicker)
      );
      particle.mesh.scale.setScalar(0.62 + Math.sin(now * 0.039 + particle.seed) * 0.2);
      particle.material.opacity = (0.12 + (1 - progress) * 0.22)
        * (0.78 + Math.sin(now * 0.058 + particle.seed) * 0.22);
    });
  }

  function updateThrusterVisuals(now) {
    const state = getThrusterState();
    const keys = game.controls?.keys || {};
    const armed = flightControlArmed && isVehicleInFlight();
    const pitchInput = armed ? (keys.s ? 1 : 0) - (keys.w ? 1 : 0) : 0;
    const rollInput = armed ? (keys.a ? 1 : 0) - (keys.d ? 1 : 0) : 0;

    if (!localAttachment) return;
    localCar.root.updateMatrixWorld(true);
    const exhaustDirection = new THREE.Vector3(0, -1, 0)
      .applyQuaternion(localCar.root.quaternion)
      .normalize();

    for (const jet of localAttachment.liftFlames) {
      const firing = state.lift ||
        (rollInput < 0 && jet.side === "left") ||
        (rollInput > 0 && jet.side === "right") ||
        (pitchInput > 0 && jet.end === "rear") ||
        (pitchInput < 0 && jet.end === "front");
      setColdGasJet(jet.plume, firing, now);

      // When a downward-facing nozzle is close enough to the surface, project
      // its exhaust onto the terrain and animate a spreading dust/debris wash.
      const wash = jet.groundWash;
      if (!firing || exhaustDirection.y > -0.18) {
        if (wash) wash.group.visible = false;
        continue;
      }

      const nozzleWorld = localCar.root.localToWorld(jet.position.clone());
      const groundBelowNozzle = sampleGroundHeight(nozzleWorld.x, nozzleWorld.z);
      const nozzleClearance = nozzleWorld.y - groundBelowNozzle;
      if (nozzleClearance < 0.06 || nozzleClearance > 4.6) {
        if (wash) wash.group.visible = false;
        continue;
      }

      const distance = nozzleClearance / -exhaustDirection.y;
      if (distance > 4.8) {
        if (wash) wash.group.visible = false;
        continue;
      }

      const impact = nozzleWorld.clone().addScaledVector(exhaustDirection, distance);
      impact.y = sampleGroundHeight(impact.x, impact.z) + 0.028;
      const alignment = THREE.MathUtils.clamp((-exhaustDirection.y - 0.14) / 0.76, 0, 1);
      const strength = THREE.MathUtils.clamp(1 - distance / 5.0, 0, 1) * alignment;
      updateGroundWash(wash, impact, distance, strength, exhaustDirection, now);
    }

    for (const jet of localAttachment.forwardFlames) {
      setColdGasJet(jet, state.forward, now);
    }
  }
  function renderBuilder() {
    const slotAssignments = getSlotAssignments();
    document.querySelectorAll("[data-sandbox-part]").forEach((button) => {
      const id = button.dataset.sandboxPart;
      const equipped = loadout.has(id);
      const assignedKey = SLOT_KEYS.find((key) => slotAssignments[key] === id);
      button.classList.toggle("equipped", equipped);
      button.setAttribute("aria-pressed", equipped ? "true" : "false");
      const label = button.querySelector(".sandbox-part-action");
      if (label) {
        label.textContent = equipped
          ? (assignedKey ? assignedKey.toUpperCase() + " SLOT · REMOVE" : "MOUNTED · NO KEY")
          : (!secretSettings.infiniteGadgets && loadout.size >= MAX_EQUIPPED_GADGETS)
            ? "3 SLOTS FULL"
            : "ADD TO TRUCK";
      }
    });
    const equippedLabel = $("sandboxEquippedValue");
    if (equippedLabel) {
      equippedLabel.textContent = SLOT_KEYS
        .filter((key) => slotAssignments[key])
        .map((key) => key.toUpperCase() + ": " +
          (PARTS.find((part) => part.id === slotAssignments[key])?.title || slotAssignments[key]))
        .concat(getLoadout()
          .filter((id) => !Object.values(slotAssignments).includes(id))
          .map((id) => "MOUNTED: " + (PARTS.find((part) => part.id === id)?.title || id)))
        .concat(secretSettings.infiniteGadgets ? ["INFINITE GADGETS"] : [])
        .join(" · ") || "NO GADGETS EQUIPPED";
    }
    const mapLabel = $("sandboxBuilderMapLabel");
    if (mapLabel) {
      mapLabel.textContent = game.activeMapId === "gravel-basin" ? "GRAVEL BASIN" : "CLUB DIRT CIRCUIT";
    }
    const countLabel = $("sandboxPlayerCount");
    if (countLabel) countLabel.textContent = playerCount + " / 8 DRIVERS CONNECTED";
  }

  function renderControlHints() {
    if (!controlsPanel) return;
    controlsPanel.style.display = active && inMap ? "flex" : "none";
    const status = getThrusterState();
    const slotAssignments = getSlotAssignments();
    document.querySelectorAll("[data-sandbox-slot]").forEach((item) => {
      const slotIndex = Number(item.dataset.sandboxSlot);
      const key = SLOT_KEYS[slotIndex];
      const id = slotAssignments[key] || null;
      const part = PARTS.find((candidate) => candidate.id === id);
      const keyLabel = item.querySelector("kbd");
      const title = item.querySelector("strong");
      const label = item.querySelector("small");
      const isCharging = id === "gravity-orb" && launcherCharge.key === key;
      const isLaserActive = id === "orbital-laser" && orbitalLaserSequences.length > 0;
      const isActive = (id === "lift" && status.lift) ||
        (id === "forward" && status.forward) || isCharging || isLaserActive;
      if (keyLabel) keyLabel.textContent = key ? key.toUpperCase() : "?";
      if (title) title.textContent = part?.title || "EMPTY SLOT";
      if (label) {
        if (!part) label.textContent = "NO GADGET";
        else if (id === "lift") label.textContent = status.lift ? "ACTIVE" : "HOLD TO LIFT";
        else if (id === "forward") label.textContent = status.forward ? "ACTIVE" : "HOLD TO BOOST";
        else if (id === "beacon") label.textContent = "PRESS TO PLACE";
        else if (id === "orbital-laser") label.textContent =
          isLaserActive ? "SEQUENCE ACTIVE" :
            Date.now() < cooldowns.orbitalLaser ? "RECHARGING" : "ACTIVATE MAP RESET";
        else if (isCharging) label.textContent = "CHARGING " + Math.round(launcherCharge.charge * 100) + "%";
        else if (performance.now() < cooldowns.launcher) label.textContent = "RECHARGING";
        else label.textContent = "HOLD · RELEASE TO FIRE";
      }
      item.classList.toggle("equipped", Boolean(part));
      item.classList.toggle("active", isActive);
      item.classList.toggle("charging", isCharging);
    });
  }

  function renderSecretMenu() {
    if (!secretMenuPanel) return;
    const infinite = $("secretInfiniteGadgets");
    if (infinite) infinite.checked = secretSettings.infiniteGadgets;
    for (const [id, value] of [
      ["secretGravityOrbRadius", secretSettings.gravityOrbRadius],
      ["secretGravityOrbPower", secretSettings.gravityOrbPower],
      ["secretJumpThrusterPower", secretSettings.jumpThrusterPower],
      ["secretForwardThrusterPower", secretSettings.forwardThrusterPower]
    ]) {
      const input = $(id);
      if (input) input.value = String(value);
    }
    for (const [id, value] of [
      ["secretGravityOrbRadiusValue", secretSettings.gravityOrbRadius.toFixed(1) + "×"],
      ["secretGravityOrbPowerValue", secretSettings.gravityOrbPower.toFixed(1) + "×"],
      ["secretJumpThrusterPowerValue", String(Math.round(secretSettings.jumpThrusterPower))],
      ["secretForwardThrusterPowerValue", String(Math.round(secretSettings.forwardThrusterPower))]
    ]) {
      const label = $(id);
      if (label) label.textContent = value;
    }
    const laserButton = $("secretOrbitalLaserButton");
    if (laserButton) laserButton.textContent = loadout.has("orbital-laser")
      ? "REMOVE ORBITAL LASER" : "INSTALL ORBITAL LASER";
    if (secretMenuStatus) {
      secretMenuStatus.textContent = secretSettings.infiniteGadgets
        ? "UNLIMITED GADGET MOUNTS ENABLED"
        : "STANDARD LIMIT: 3 GADGETS";
    }
  }

  function setSecretMenuOpen(open) {
    secretMenuOpen = Boolean(open) && active && !inMap;
    if (secretMenuPanel) secretMenuPanel.style.display = secretMenuOpen ? "block" : "none";
    renderSecretMenu();
  }

  function toggleSecretMenu() {
    setSecretMenuOpen(!secretMenuOpen);
  }

  function updateSecretSetting(key, input, minimum, maximum) {
    const value = Number(input?.value);
    if (!Number.isFinite(value)) return;
    secretSettings[key] = THREE.MathUtils.clamp(value, minimum, maximum);
    renderSecretMenu();
    renderBuilder();
    renderControlHints();
  }

  function toggleInfiniteGadgets(enabled) {
    secretSettings.infiniteGadgets = enabled === true;
    if (!secretSettings.infiniteGadgets && loadout.size > MAX_EQUIPPED_GADGETS) {
      const keep = [];
      for (const id of ["lift", "forward", "orbital-laser"]) {
        if (loadout.has(id) && keep.length < MAX_EQUIPPED_GADGETS) keep.push(id);
      }
      for (const id of loadout) {
        if (!keep.includes(id) && keep.length < MAX_EQUIPPED_GADGETS) keep.push(id);
      }
      loadout.clear();
      for (const id of keep) loadout.add(id);
      clearHeldControls();
      applyLoadout(localCar, getLoadout());
      if (localAttachment) localAttachment.group.visible = active;
    }
    renderSecretMenu();
    renderBuilder();
    renderControlHints();
  }

  function toggleOrbitalLaserGadget() {
    if (loadout.has("orbital-laser")) {
      loadout.delete("orbital-laser");
    } else {
      if (!secretSettings.infiniteGadgets && loadout.size >= MAX_EQUIPPED_GADGETS) {
        game.showToast("Your truck has 3 gadget slots. Enable Infinite Gadgets or remove one first.");
        return;
      }
      loadout.add("orbital-laser");
    }
    clearHeldControls();
    applyLoadout(localCar, getLoadout());
    if (localAttachment) localAttachment.group.visible = active;
    renderSecretMenu();
    renderBuilder();
    renderControlHints();
  }

  function updatePlayerCount(count) {
    playerCount = Math.max(1, Math.min(8, Number(count) || 1));
    renderBuilder();
  }

  function clearHeldControls() {
    held.lift = false;
    held.forward = false;
    secretChordKeys.clear();
    secretChordLatched = false;
    for (const key of Object.keys(heldAssignments)) delete heldAssignments[key];
    launcherCharge.key = null;
    launcherCharge.startedAt = 0;
    launcherCharge.charge = 0;
    if (gravityOrbAimIndicator) gravityOrbAimIndicator.group.visible = false;
    flightControlArmed = false;
    updateThrusterVisuals(performance.now());
    renderControlHints();
  }

  function showBuilder() {
    clearHeldControls();
    active = true;
    inMap = false;
    setSecretMenuOpen(false);
    game.race?.leaveLobby?.();
    game.garage.viewMode = "sandbox-builder";
    game.garage.setArenaVisible(false);
    game.garage.parkCarForShowroom();
    game.mainMenuPanel.style.display = "none";
    game.modeSelectPanel.style.display = "none";
    game.garagePanel.style.display = "none";
    game.joinPanel.style.display = "none";
    game.hud.style.display = "none";
    builderPanel.style.display = "block";
    $("topStatus").style.display = "flex";
    localCar.setPlayerName?.("", false);
    applyLoadout(localCar, getLoadout());
    if (localAttachment) localAttachment.group.visible = true;
    for (const beacon of beacons) beacon.group.visible = false;
    renderBuilder();
    renderControlHints();
  }

  function beginSession() {
    showBuilder();
    game.showToast("Sandbox joined — equip up to three gadgets before entering");
  }

  function enterMap() {
    if (!active || inMap) return;
    clearHeldControls();
    setSecretMenuOpen(false);
    chassisBody.angularDamping = 0.32;
    inMap = true;
    builderPanel.style.display = "none";
    for (const beacon of beacons) beacon.group.visible = true;
    game.garage.showDriveScreen();
    localCar.setPlayerName?.(game.multiplayer?.driverName || "Driver", true);
    renderControlHints();
    game.showToast("Sandbox gadgets use their assigned Q / E / F slots. Hold the Gravity Orb Launcher key, then release to fire.");
  }

  function endSession() {
    clearHeldControls();
    active = false;
    inMap = false;
    setSecretMenuOpen(false);
    chassisBody.angularDamping = standardAngularDamping;
    builderPanel.style.display = "none";
    for (const beacon of beacons) {
      scene.remove(beacon.group);
      dispose(beacon.group);
    }
    beacons.length = 0;
    for (const wave of waves) {
      scene.remove(wave.group);
      dispose(wave.group);
    }
    waves.length = 0;
    for (const projectile of projectiles) removeGravityOrbVisual(projectile.visual);
    projectiles.length = 0;
    for (const sequence of orbitalLaserSequences) removeOrbitalLaserVisual(sequence.visual);
    orbitalLaserSequences.length = 0;
    hideOrbitalScreenEffects();
    if (gravityOrbAimIndicator) gravityOrbAimIndicator.group.visible = false;
    if (localAttachment) localAttachment.group.visible = false;
    renderControlHints();
    seenEvents.clear();
  }

  function makeEventId() {
    return globalThis.crypto?.randomUUID?.() ||
      ("stunt-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10));
  }

  function validStuntEvent(event) {
    if (!event || typeof event.id !== "string" || event.id.length > 80) return false;
    if (event.type === "impulse-beacon") {
      return [event.x, event.y, event.z, event.yaw].every(Number.isFinite);
    }
    if (event.type === "orbital-laser") {
      return [event.x, event.y, event.z, event.startedAt].every(Number.isFinite) &&
        Math.abs(event.startedAt - Date.now()) <= 120_000;
    }
    return event.type === "gravity-orb" &&
      [event.x, event.y, event.z, event.vx, event.vy, event.vz,
        event.charge, event.launchedAt].every(Number.isFinite) &&
      event.charge >= 0 && event.charge <= 1 &&
      Math.abs(event.vx) <= 80 && Math.abs(event.vy) <= 80 && Math.abs(event.vz) <= 80 &&
      Number.isFinite(event.radiusMultiplier ?? 1) &&
      Number.isFinite(event.powerMultiplier ?? 1) &&
      (event.radiusMultiplier ?? 1) >= 0.25 && (event.radiusMultiplier ?? 1) <= 5 &&
      (event.powerMultiplier ?? 1) >= 0.25 && (event.powerMultiplier ?? 1) <= 5;
  }

  function rememberEvent(id) {
    if (seenEvents.has(id)) return false;
    seenEvents.add(id);
    if (seenEvents.size > 400) seenEvents.delete(seenEvents.values().next().value);
    return true;
  }

  function sampleGroundHeight(x, z) {
    const layout = game.mapLayouts?.[game.activeMapId];
    const field = layout?.heightfield;
    if (!field?.heights?.length) {
      let surfaceY = 0;
      for (const feature of layout?.jumps || []) {
        const dx = x - feature.x;
        const dz = z - feature.z;
        const across = dx * feature.normalX + dz * feature.normalZ;
        const along = dx * feature.tangentX + dz * feature.tangentZ;
        const profile = feature.profile;
        if (!profile?.heights?.length || Math.abs(across) > profile.width / 2 ||
            Math.abs(along) > profile.length / 2) continue;
        const rows = profile.heights;
        const maxX = rows.length - 1;
        const maxZ = rows[0].length - 1;
        const gx = THREE.MathUtils.clamp((across + profile.width / 2) / profile.elementSize, 0, maxX);
        const gz = THREE.MathUtils.clamp((along + profile.length / 2) / profile.elementSize, 0, maxZ);
        const x0 = Math.min(maxX - 1, Math.floor(gx));
        const z0 = Math.min(maxZ - 1, Math.floor(gz));
        const tx = gx - x0;
        const tz = gz - z0;
        const a = rows[x0][z0] * (1 - tz) + rows[x0][z0 + 1] * tz;
        const b = rows[x0 + 1][z0] * (1 - tz) + rows[x0 + 1][z0 + 1] * tz;
        surfaceY = Math.max(surfaceY, 0.01 + a * (1 - tx) + b * tx);
      }
      return surfaceY;
    }
    const rows = field.heights;
    const count = rows.length - 1;
    const step = Number(field.elementSize) || 1;
    const gx = THREE.MathUtils.clamp((x - (field.originX || 0)) / step, 0, count);
    const originZ = Number.isFinite(field.originZ) ? field.originZ : count * step * 0.5;
    const gz = THREE.MathUtils.clamp((originZ - z) / step, 0, count);
    const x0 = Math.min(count - 1, Math.floor(gx));
    const z0 = Math.min(count - 1, Math.floor(gz));
    const tx = gx - x0;
    const tz = gz - z0;
    const a = rows[x0][z0] * (1 - tz) + rows[x0][z0 + 1] * tz;
    const b = rows[x0 + 1][z0] * (1 - tz) + rows[x0 + 1][z0 + 1] * tz;
    return a * (1 - tx) + b * tx;
  }

  function getMapCenterAndRadius() {
    const layout = game.mapLayouts?.[game.activeMapId] || {};
    const field = layout.heightfield;
    if (field?.heights?.length) {
      const count = field.heights.length - 1;
      const size = count * (Number(field.elementSize) || 1);
      const centerX = (Number(field.originX) || 0) + size / 2;
      const centerZ = (Number(field.originZ) || size / 2) - size / 2;
      return {
        x: centerX,
        z: centerZ,
        y: sampleGroundHeight(centerX, centerZ),
        radius: Math.hypot(size / 2, size / 2) + 18
      };
    }

    const samples = layout.centerlineSamples || [];
    const xs = samples.map((point) => point.x).filter(Number.isFinite);
    const zs = samples.map((point) => point.z).filter(Number.isFinite);
    if (!xs.length || !zs.length) {
      return { x: 0, z: 0, y: sampleGroundHeight(0, 0), radius: 90 };
    }
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const margin = (Number(layout.trackHalfWidth) || 8) + 22;
    return {
      x: centerX,
      z: centerZ,
      y: sampleGroundHeight(centerX, centerZ),
      radius: Math.hypot((maxX - minX) / 2 + margin, (maxZ - minZ) / 2 + margin)
    };
  }


  function ensureOrbitalScreenEffects() {
    if (orbitalScreenEffects?.root?.isConnected) return orbitalScreenEffects;
    const root = document.createElement("div");
    root.id = "orbitalLaserScreenEffects";
    Object.assign(root.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483000",
      pointerEvents: "none",
      overflow: "hidden",
      display: "none"
    });

    const whiteout = document.createElement("div");
    Object.assign(whiteout.style, {
      position: "absolute",
      inset: "0",
      background: "#ffffff",
      opacity: "0",
      willChange: "opacity"
    });

    const countdown = document.createElement("div");
    Object.assign(countdown.style, {
      position: "absolute",
      top: "16%",
      left: "50%",
      transform: "translateX(-50%)",
      display: "none",
      justifyItems: "center",
      gap: "9px",
      width: "min(92vw, 620px)",
      textAlign: "center",
      fontFamily: "Orbitron, ui-sans-serif, sans-serif",
      textShadow: "0 2px 14px rgba(0, 95, 170, .34)"
    });

    const number = document.createElement("div");
    Object.assign(number.style, {
      color: "#087fc4",
      fontSize: "clamp(58px, 11vw, 116px)",
      fontWeight: "1000",
      lineHeight: "0.95",
      letterSpacing: ".035em",
      fontVariantNumeric: "tabular-nums",
      textShadow: "0 0 22px rgba(40, 171, 255, .42), 0 3px 12px rgba(255,255,255,.96)"
    });

    const title = document.createElement("div");
    Object.assign(title.style, {
      color: "#103e5a",
      fontSize: "clamp(11px, 1.9vw, 17px)",
      fontWeight: "1000",
      letterSpacing: ".24em",
      lineHeight: "1.5"
    });

    const subtitle = document.createElement("div");
    Object.assign(subtitle.style, {
      color: "#28617c",
      fontSize: "clamp(8px, 1.2vw, 11px)",
      fontWeight: "900",
      letterSpacing: ".18em",
      lineHeight: "1.5"
    });

    countdown.append(number, title, subtitle);
    root.append(whiteout, countdown);
    (document.body || document.documentElement).appendChild(root);
    orbitalScreenEffects = { root, whiteout, countdown, number, title, subtitle };
    return orbitalScreenEffects;
  }

  function hideOrbitalScreenEffects() {
    if (!orbitalScreenEffects) return;
    orbitalScreenEffects.root.style.display = "none";
    orbitalScreenEffects.whiteout.style.opacity = "0";
    orbitalScreenEffects.countdown.style.display = "none";
  }

  function updateOrbitalScreenEffects(elapsed) {
    const ui = ensureOrbitalScreenEffects();
    const warning = smoothStep(elapsed / ORBITAL_LASER_WARNING_MS);
    const expansion = smoothStep(
      (elapsed - ORBITAL_LASER_WARNING_MS) / ORBITAL_LASER_EXPANSION_MS
    );
    let whiteOpacity = warning * 0.78;
    if (elapsed >= ORBITAL_LASER_WARNING_MS) {
      whiteOpacity = 0.78 + expansion * 0.22;
    }
    if (elapsed >= ORBITAL_LASER_RESET_MS) {
      const fadeOutProgress = (elapsed - ORBITAL_LASER_RESET_MS - 450) / 1600;
      whiteOpacity = 1 - smoothStep(fadeOutProgress);
    }

    ui.root.style.display = elapsed < ORBITAL_LASER_CLEANUP_MS ? "block" : "none";
    ui.whiteout.style.opacity = String(THREE.MathUtils.clamp(whiteOpacity, 0, 1));

    if (elapsed < ORBITAL_LASER_WARNING_MS) {
      ui.countdown.style.display = "grid";
      ui.number.textContent = String(
        Math.max(1, Math.ceil((ORBITAL_LASER_WARNING_MS - elapsed) / 1000))
      );
      ui.title.textContent = "ORBITAL LASER ACTIVATION";
      ui.subtitle.textContent = "GROUND FRACTURES DETECTED · MAP RESET IMMINENT";
    } else if (elapsed < ORBITAL_LASER_RESET_MS) {
      ui.countdown.style.display = "grid";
      ui.number.textContent = "0";
      ui.title.textContent = "ORBITAL LASER ACTIVATED";
      ui.subtitle.textContent = "MAP RESET INITIATED";
    } else {
      ui.countdown.style.display = "none";
    }
  }

  function makeOrbitalCrackPaths(center, maximumRadius) {
    let seed = 0x71c4a29d;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const reach = Math.max(18, maximumRadius * 0.72);
    const paths = [];

    const makePoint = (radius, angle) => {
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      return {
        x,
        z,
        y: sampleGroundHeight(center.x + x, center.z + z) + 0.055,
        reveal: THREE.MathUtils.clamp(radius / reach, 0, 1)
      };
    };

    const radialCount = 18;
    for (let i = 0; i < radialCount; i++) {
      const baseAngle = (i / radialCount) * Math.PI * 2 + (random() - 0.5) * 0.13;
      const mainLength = reach * (0.79 + random() * 0.19);
      const mainSteps = 11 + Math.floor(random() * 3);
      let angle = baseAngle;
      const main = [makePoint(0.45, angle)];

      for (let step = 1; step <= mainSteps; step++) {
        angle += (random() - 0.5) * 0.19;
        const radius = mainLength * step / mainSteps;
        main.push(makePoint(radius, angle));
      }
      paths.push({ points: main, width: 0.16 + random() * 0.105 });

      for (let branch = 0; branch < 2; branch++) {
        const startIndex = 3 + Math.floor(random() * 6);
        const origin = main[Math.min(startIndex, main.length - 2)];
        const originRadius = Math.hypot(origin.x, origin.z);
        let branchAngle = Math.atan2(origin.z, origin.x) +
          (branch === 0 ? -1 : 1) * (0.30 + random() * 0.62);
        const branchLength = reach * (0.105 + random() * 0.17);
        const branchSteps = 5 + Math.floor(random() * 3);
        const branchPoints = [origin];

        for (let step = 1; step <= branchSteps; step++) {
          branchAngle += (random() - 0.5) * 0.24;
          const radius = Math.min(
            reach * 0.995,
            originRadius + branchLength * step / branchSteps
          );
          branchPoints.push(makePoint(radius, branchAngle));
        }
        paths.push({ points: branchPoints, width: 0.095 + random() * 0.075 });
      }
    }
    return { paths, reach };
  }

  function makeOrbitalCrackGeometry(paths, widthScale, heightOffset) {
    const positions = [];
    const reveals = [];
    const indices = [];

    for (const path of paths) {
      for (let i = 0; i < path.points.length - 1; i++) {
        const a = path.points[i];
        const b = path.points[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const length = Math.hypot(dx, dz);
        if (length < 0.001) continue;

        const perpendicularX = -dz / length;
        const perpendicularZ = dx / length;
        const progressA = THREE.MathUtils.clamp(a.reveal, 0, 1);
        const progressB = THREE.MathUtils.clamp(b.reveal, 0, 1);
        const taperA = 0.42 + Math.sin(progressA * Math.PI) * 0.58;
        const taperB = 0.42 + Math.sin(progressB * Math.PI) * 0.58;
        const halfA = path.width * widthScale * taperA * 0.5;
        const halfB = path.width * widthScale * taperB * 0.5;
        const base = positions.length / 3;

        positions.push(
          a.x + perpendicularX * halfA, a.y + heightOffset, a.z + perpendicularZ * halfA,
          a.x - perpendicularX * halfA, a.y + heightOffset, a.z - perpendicularZ * halfA,
          b.x + perpendicularX * halfB, b.y + heightOffset, b.z + perpendicularZ * halfB,
          b.x - perpendicularX * halfB, b.y + heightOffset, b.z - perpendicularZ * halfB
        );
        reveals.push(progressA, progressA, progressB, progressB);
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("aReveal", new THREE.Float32BufferAttribute(reveals, 1));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }

  function makeOrbitalCrackMaterial(color, additive = false) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uProgress: { value: 0 },
        uOpacity: { value: 0 }
      },
      vertexShader: [
        "attribute float aReveal;",
        "varying float vReveal;",
        "void main() {",
        "  vReveal = aReveal;",
        "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
        "}"
      ].join("\n"),
      fragmentShader: [
        "uniform vec3 uColor;",
        "uniform float uProgress;",
        "uniform float uOpacity;",
        "varying float vReveal;",
        "void main() {",
        "  float reveal = smoothstep(vReveal - 0.018, vReveal + 0.018, uProgress);",
        "  float alpha = reveal * uOpacity;",
        "  if (alpha < 0.002) discard;",
        "  gl_FragColor = vec4(uColor, alpha);",
        "}"
      ].join("\n"),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: false
    });
  }

  function makeOrbitalLaserVisual(center, maximumRadius) {
    const group = new THREE.Group();
    group.name = "sandbox-orbital-laser-sequence";
    group.position.set(center.x, 0, center.z);

    const outerMaterial = new THREE.MeshBasicMaterial({
      color: 0x147eff, transparent: true, opacity: 0.06,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false
    });
    const innerMaterial = new THREE.MeshBasicMaterial({
      color: 0x76d9ff, transparent: true, opacity: 0.10,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false
    });
    const fieldMaterial = new THREE.MeshBasicMaterial({
      color: 0x168dff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false
    });
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x5bcaff, transparent: true, opacity: 0.13,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false
    });

    const outerBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 220, 48, 1, true),
      outerMaterial
    );
    outerBeam.position.y = 110;
    const innerBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 220, 32, 1, true),
      innerMaterial
    );
    innerBeam.position.y = 110;

    const groundRing = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.045, 10, 96),
      ringMaterial
    );
    groundRing.rotation.x = Math.PI / 2;
    groundRing.position.y = 0.10;

    const glowField = new THREE.Mesh(
      new THREE.SphereGeometry(1, 28, 18),
      fieldMaterial
    );
    glowField.position.y = 12;
    glowField.scale.set(1, 0.2, 1);

    // Jagged fissures spread radially across the dirt during the ten-second
    // countdown. The dark channel and narrow blue energy seam share a reveal
    // attribute so both grow outward from the impact center in sync.
    const crackData = makeOrbitalCrackPaths(center, maximumRadius);
    const crackGeometry = makeOrbitalCrackGeometry(crackData.paths, 1, 0);
    const crackGlowGeometry = makeOrbitalCrackGeometry(crackData.paths, 0.22, 0.018);
    const crackMaterial = makeOrbitalCrackMaterial(0x10151b, false);
    const crackGlowMaterial = makeOrbitalCrackMaterial(0x087dff, true);
    const cracks = new THREE.Mesh(crackGeometry, crackMaterial);
    const crackGlow = new THREE.Mesh(crackGlowGeometry, crackGlowMaterial);
    cracks.frustumCulled = false;
    crackGlow.frustumCulled = false;

    group.add(outerBeam, innerBeam, groundRing, glowField, cracks, crackGlow);
    scene.add(group);
    return {
      group, outerBeam, innerBeam, groundRing, glowField,
      outerMaterial, innerMaterial, fieldMaterial, ringMaterial,
      crackMaterial, crackGlowMaterial
    };
  }

  function removeOrbitalLaserVisual(visual) {
    if (!visual) return;
    scene.remove(visual.group);
    dispose(visual.group);
  }

  function clearArenaGadgetEffects() {
    for (const beacon of beacons) {
      scene.remove(beacon.group);
      dispose(beacon.group);
    }
    beacons.length = 0;
    for (const wave of waves) {
      scene.remove(wave.group);
      dispose(wave.group);
    }
    waves.length = 0;
    for (const projectile of projectiles) removeGravityOrbVisual(projectile.visual);
    projectiles.length = 0;
    if (gravityOrbAimIndicator) gravityOrbAimIndicator.group.visible = false;
    launcherCharge.key = null;
    launcherCharge.startedAt = 0;
    launcherCharge.charge = 0;
  }

  function createOrbitalLaserSequence(event) {
    if (!validStuntEvent(event) || event.type !== "orbital-laser" ||
        !rememberEvent(event.id) || orbitalLaserSequences.length > 0) return false;
    const center = {
      x: event.x,
      y: event.y,
      z: event.z
    };
    const map = getMapCenterAndRadius();
    const visual = makeOrbitalLaserVisual(center, Math.max(12, map.radius));
    ensureOrbitalScreenEffects();
    orbitalLaserSequences.push({
      id: event.id,
      startedAt: event.startedAt,
      center,
      maxRadius: Math.max(12, map.radius),
      visual,
      resetDone: false
    });
    cooldowns.orbitalLaser = Math.max(
      cooldowns.orbitalLaser,
      event.startedAt + ORBITAL_LASER_COOLDOWN_MS
    );
    return true;
  }

  function launchOrbitalLaser() {
    const now = Date.now();
    if (orbitalLaserSequences.length > 0 || now < cooldowns.orbitalLaser) {
      game.showToast(orbitalLaserSequences.length > 0
        ? "An Orbital Laser sequence is already underway"
        : "Orbital Laser is recharging");
      return false;
    }
    const center = getMapCenterAndRadius();
    const event = {
      id: makeEventId(),
      type: "orbital-laser",
      x: center.x,
      y: center.y,
      z: center.z,
      startedAt: now
    };
    if (!createOrbitalLaserSequence(event)) return false;
    cooldowns.orbitalLaser = now + ORBITAL_LASER_COOLDOWN_MS;
    game.multiplayer?.sendSandboxEvent?.(event);
    game.showToast("ORBITAL LASER: ENERGY BUILDUP DETECTED");
    return true;
  }

  function smoothStep(value) {
    const t = THREE.MathUtils.clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function updateOrbitalLaserSequences(now = Date.now()) {
    for (let i = orbitalLaserSequences.length - 1; i >= 0; i--) {
      const sequence = orbitalLaserSequences[i];
      const elapsed = Math.max(0, now - sequence.startedAt);
      const warning = smoothStep(elapsed / ORBITAL_LASER_WARNING_MS);
      const expansion = smoothStep(
        (elapsed - ORBITAL_LASER_WARNING_MS) / ORBITAL_LASER_EXPANSION_MS
      );
      const isExpanding = elapsed >= ORBITAL_LASER_WARNING_MS;
      const radius = isExpanding
        ? 2.5 + (sequence.maxRadius * 1.22 - 2.5) * expansion
        : 0.07 + warning * 2.43;
      const opacity = isExpanding ? 0.34 + expansion * 0.58 : 0.055 + warning * 0.29;
      const beamHeight = isExpanding ? 220 : 16 + warning * 204;
      const heightScale = beamHeight / 220;
      const visual = sequence.visual;
      updateOrbitalScreenEffects(elapsed);

      const crackFade = elapsed >= ORBITAL_LASER_RESET_MS
        ? 1 - smoothStep((elapsed - ORBITAL_LASER_RESET_MS) / 1100)
        : 1;
      visual.crackMaterial.uniforms.uProgress.value = warning;
      visual.crackGlowMaterial.uniforms.uProgress.value = warning;
      visual.crackMaterial.uniforms.uOpacity.value = 0.96 * crackFade;
      visual.crackGlowMaterial.uniforms.uOpacity.value = 0.82 * crackFade;

      visual.outerBeam.position.y = beamHeight / 2;
      visual.innerBeam.position.y = beamHeight / 2;
      visual.outerBeam.scale.set(radius, heightScale, radius);
      visual.innerBeam.scale.set(radius * 0.52, heightScale, radius * 0.52);
      const beamFade = elapsed >= ORBITAL_LASER_RESET_MS
        ? 1 - smoothStep((elapsed - ORBITAL_LASER_RESET_MS - 450) / 1400)
        : 1;
      visual.outerMaterial.opacity = opacity * beamFade;
      visual.innerMaterial.opacity = Math.min(1, opacity + 0.16) * beamFade;
      visual.groundRing.scale.setScalar(isExpanding
        ? radius
        : 0.5 + warning * 2.2);
      visual.ringMaterial.opacity =
        (0.12 + warning * 0.68 + expansion * 0.18) * beamFade;
      visual.glowField.scale.set(
        radius * (0.9 + expansion * 0.25),
        0.18 + expansion * 0.48,
        radius * (0.9 + expansion * 0.25)
      );
      visual.fieldMaterial.opacity = expansion * 0.19 * beamFade;

      if (!sequence.resetDone && elapsed >= ORBITAL_LASER_RESET_MS) {
        sequence.resetDone = true;
        for (const key of Object.keys(game.controls?.keys || {})) {
          game.controls.keys[key] = false;
        }
        clearHeldControls();
        game.controls?.resetCar?.();
        clearArenaGadgetEffects();
        game.showToast("ORBITAL RESET COMPLETE — ALL DRIVERS RETURNED TO SPAWN");
      }

      if (elapsed >= ORBITAL_LASER_CLEANUP_MS) {
        removeOrbitalLaserVisual(visual);
        orbitalLaserSequences.splice(i, 1);
        if (orbitalLaserSequences.length === 0) hideOrbitalScreenEffects();
      }
    }
  }

  function getCameraShakeOffset(now = Date.now()) {
    let intensity = 0;
    for (const sequence of orbitalLaserSequences) {
      const elapsed = Math.max(0, now - sequence.startedAt);
      const warning = smoothStep(elapsed / ORBITAL_LASER_WARNING_MS);
      const expansion = smoothStep(
        (elapsed - ORBITAL_LASER_WARNING_MS) / ORBITAL_LASER_EXPANSION_MS
      );
      let current = warning * warning * 0.34 + expansion * 0.28;
      if (elapsed >= ORBITAL_LASER_RESET_MS) {
        const fade = 1 - THREE.MathUtils.clamp(
          (elapsed - ORBITAL_LASER_RESET_MS) /
            (ORBITAL_LASER_CLEANUP_MS - ORBITAL_LASER_RESET_MS),
          0, 1
        );
        current *= fade;
      }
      intensity = Math.max(intensity, current);
    }
    if (intensity <= 0) return new THREE.Vector3();
    return new THREE.Vector3(
      Math.sin(now * 0.031) * intensity,
      Math.sin(now * 0.047 + 1.3) * intensity * 0.42,
      Math.cos(now * 0.027 + 0.7) * intensity * 0.34
    );
  }

  function getGravityOrbLaunchState(charge) {
    const orientation = new THREE.Quaternion(
      chassisBody.quaternion.x,
      chassisBody.quaternion.y,
      chassisBody.quaternion.z,
      chassisBody.quaternion.w
    );
    const origin = new THREE.Vector3(
      chassisBody.position.x,
      chassisBody.position.y,
      chassisBody.position.z
    ).add(new THREE.Vector3(
      0,
      0.51 + 0.41 * Math.sin(GRAVITY_ORB_ELEVATION),
      -0.42 - 0.41 * Math.cos(GRAVITY_ORB_ELEVATION)
    ).applyQuaternion(orientation));
    const direction = new THREE.Vector3(
      0,
      Math.sin(GRAVITY_ORB_ELEVATION),
      -Math.cos(GRAVITY_ORB_ELEVATION)
    ).applyQuaternion(orientation).normalize();
    const speed = 12 + THREE.MathUtils.clamp(charge, 0, 1) * 15;
    return { origin, velocity: direction.multiplyScalar(speed) };
  }

  function getOrbPosition(start, velocity, time) {
    return new THREE.Vector3(
      start.x + velocity.x * time,
      start.y + velocity.y * time - 0.5 * ORB_GRAVITY * time * time,
      start.z + velocity.z * time
    );
  }

  function predictOrbImpact(start, velocity) {
    const step = 0.04;
    const maxTime = 6;
    for (let time = step; time <= maxTime; time += step) {
      const position = getOrbPosition(start, velocity, time);
      const groundY = sampleGroundHeight(position.x, position.z);
      if (position.y - ORB_RADIUS <= groundY) {
        return {
          time,
          position: new THREE.Vector3(position.x, groundY + ORB_RADIUS, position.z)
        };
      }
    }
    const position = getOrbPosition(start, velocity, maxTime);
    const groundY = sampleGroundHeight(position.x, position.z);
    return {
      time: maxTime,
      position: new THREE.Vector3(position.x, groundY + ORB_RADIUS, position.z)
    };
  }

  function makeGravityOrbAimIndicator() {
    const group = new THREE.Group();
    group.name = "gravity-orb-landing-indicator";
    const diskMaterial = new THREE.MeshBasicMaterial({
      color: 0xff3030, transparent: true, opacity: 0.14,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false
    });
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xff4545, transparent: true, opacity: 0.88,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false
    });
    const centerMaterial = new THREE.MeshBasicMaterial({
      color: 0xff7777, transparent: true, opacity: 0.92,
      depthWrite: false, toneMapped: false
    });
    const disk = new THREE.Mesh(new THREE.CircleGeometry(1.18, 48), diskMaterial);
    disk.rotation.x = -Math.PI / 2;
    disk.position.y = 0.018;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.045, 8, 48), ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.035;
    const center = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), centerMaterial);
    center.rotation.x = -Math.PI / 2;
    center.position.y = 0.04;
    group.add(disk, ring, center);
    group.visible = false;
    scene.add(group);
    return { group, diskMaterial, ringMaterial };
  }

  function updateGravityOrbAimIndicator(prediction, charge) {
    if (!gravityOrbAimIndicator || !prediction) return;
    const indicator = gravityOrbAimIndicator;
    indicator.group.position.set(
      prediction.position.x,
      sampleGroundHeight(prediction.position.x, prediction.position.z) + 0.045,
      prediction.position.z
    );
    indicator.group.scale.setScalar(0.9 + charge * 0.18);
    indicator.diskMaterial.opacity = 0.10 + charge * 0.12;
    indicator.ringMaterial.opacity = 0.72 + charge * 0.25;
    indicator.group.visible = true;
  }

  function makeGravityOrbVisual() {
    const group = new THREE.Group();
    group.name = "bright-blue-gravity-orb";
    const shellMaterial = new THREE.MeshBasicMaterial({
      color: 0x168fff, transparent: true, opacity: 0.62,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    });
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xc8f5ff, toneMapped: false
    });
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: 0x087dff, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 14), haloMaterial);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.25, 18, 14), shellMaterial);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.145, 16, 12), coreMaterial);
    group.add(halo, shell, core);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x5ecaff, transparent: true, opacity: 0.88,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.022, 7, 28), ringMaterial);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    scene.add(group);

    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(54), 3));
    trailGeometry.setDrawRange(0, 0);
    const trailMaterial = new THREE.LineBasicMaterial({
      color: 0x168fff, transparent: true, opacity: 0.88,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    });
    const trail = new THREE.Line(trailGeometry, trailMaterial);
    trail.frustumCulled = false;
    scene.add(trail);
    return {
      group, halo, ring, trail, trailGeometry, trailMaterial,
      trailPoints: [], shellMaterial, haloMaterial, ringMaterial
    };
  }

  function updateGravityOrbVisual(visual, position, age) {
    visual.group.position.copy(position);
    visual.halo.scale.setScalar(1 + Math.sin(age * 22) * 0.08);
    visual.ring.rotation.z += 0.11;
    const points = visual.trailPoints;
    if (!points.length || points[points.length - 1].distanceToSquared(position) > 0.012) {
      points.push(position.clone());
      if (points.length > 18) points.shift();
    }
    const attribute = visual.trailGeometry.getAttribute("position");
    points.forEach((point, index) => attribute.setXYZ(index, point.x, point.y, point.z));
    attribute.needsUpdate = true;
    visual.trailGeometry.setDrawRange(0, points.length);
  }

  function removeGravityOrbVisual(visual) {
    if (!visual) return;
    scene.remove(visual.group);
    scene.remove(visual.trail);
    dispose(visual.group);
    visual.trailGeometry.dispose();
    visual.trailMaterial.dispose();
  }

  function applyGravityBurst(
    origin,
    charge,
    radiusMultiplier = secretSettings.gravityOrbRadius,
    powerMultiplier = secretSettings.gravityOrbPower
  ) {
    const dx = chassisBody.position.x - origin.x;
    const dy = (chassisBody.position.y - origin.y) * 0.48;
    const dz = chassisBody.position.z - origin.z;
    const radius = (10 + charge * 6) * radiusMultiplier;
    const distance = Math.hypot(dx, dy, dz);
    if (distance >= radius) return false;

    const falloff = THREE.MathUtils.clamp(1 - distance / radius, 0, 1);
    const strength = Math.pow(falloff, 0.72);
    const outward = new THREE.Vector3(dx, 0, dz);
    if (outward.lengthSq() < 0.0001) outward.set(0.6, 0, -0.4);
    outward.normalize();

    // A brief upward-and-outward game impulse sends nearby RC cars skyward.
    // The impulse is mass-scaled by Cannon, so every truck gets the same feel.
    const horizontalImpulse = (42 + charge * 48) * powerMultiplier * strength;
    const verticalImpulse = (135 + charge * 120) * powerMultiplier * strength;
    chassisBody.applyImpulse(new CANNON.Vec3(
      outward.x * horizontalImpulse,
      verticalImpulse,
      outward.z * horizontalImpulse
    ));
    const spin = (2.5 + charge * 3.5) * strength;
    chassisBody.angularVelocity.x = THREE.MathUtils.clamp(
      chassisBody.angularVelocity.x + outward.z * spin, -13, 13
    );
    chassisBody.angularVelocity.z = THREE.MathUtils.clamp(
      chassisBody.angularVelocity.z - outward.x * spin, -13, 13
    );
    chassisBody.wakeUp();
    return true;
  }

  function triggerGravityOrbImpact(
    position,
    charge,
    radiusMultiplier = secretSettings.gravityOrbRadius,
    powerMultiplier = secretSettings.gravityOrbPower
  ) {
    applyGravityBurst(position, charge, radiusMultiplier, powerMultiplier);
    createBounceWave(
      new THREE.Vector3(position.x, position.y + 0.12, position.z),
      0x168fff,
      1.28 + charge * 0.48
    );
  }

  function createGravityOrbProjectile(event) {
    if (!validStuntEvent(event) || !rememberEvent(event.id)) return false;
    const start = new THREE.Vector3(event.x, event.y, event.z);
    const velocity = new THREE.Vector3(event.vx, event.vy, event.vz);
    const charge = THREE.MathUtils.clamp(event.charge, 0, 1);
    const radiusMultiplier = THREE.MathUtils.clamp(
      event.radiusMultiplier ?? secretSettings.gravityOrbRadius, 0.25, 5
    );
    const powerMultiplier = THREE.MathUtils.clamp(
      event.powerMultiplier ?? secretSettings.gravityOrbPower, 0.25, 5
    );
    const impact = predictOrbImpact(start, velocity);
    const age = Math.max(0, Math.min(7, (Date.now() - event.launchedAt) / 1000));

    if (age >= impact.time) {
      triggerGravityOrbImpact(impact.position, charge, radiusMultiplier, powerMultiplier);
      return true;
    }

    const visual = makeGravityOrbVisual();
    const projectile = {
      id: event.id, start, velocity, charge, radiusMultiplier, powerMultiplier,
      age, impact, visual
    };
    projectiles.push(projectile);
    updateGravityOrbVisual(visual, getOrbPosition(start, velocity, age), age);
    return true;
  }

  function launchGravityOrb(charge) {
    const launch = getGravityOrbLaunchState(charge);
    const event = {
      id: makeEventId(),
      type: "gravity-orb",
      x: launch.origin.x,
      y: launch.origin.y,
      z: launch.origin.z,
      vx: launch.velocity.x,
      vy: launch.velocity.y,
      vz: launch.velocity.z,
      charge: THREE.MathUtils.clamp(charge, 0, 1),
      radiusMultiplier: secretSettings.gravityOrbRadius,
      powerMultiplier: secretSettings.gravityOrbPower,
      launchedAt: Date.now()
    };
    if (!createGravityOrbProjectile(event)) return false;
    game.multiplayer?.sendSandboxEvent?.(event);
    game.showToast("Gravity orb launched");
    return true;
  }

  function beginGravityOrbCharge(key, now) {
    if (now < cooldowns.launcher) {
      game.showToast("Gravity Orb Launcher is recharging");
      return false;
    }
    launcherCharge.key = key;
    launcherCharge.startedAt = now;
    launcherCharge.charge = 0;
    launcherCharge.lastUiAt = 0;
    const launch = getGravityOrbLaunchState(0);
    const prediction = predictOrbImpact(launch.origin, launch.velocity);
    updateGravityOrbAimIndicator(prediction, 0);
    renderControlHints();
    return true;
  }

  function updateGravityOrbCharge(now) {
    if (!launcherCharge.key) {
      gravityOrbAimIndicator.group.visible = false;
      return;
    }
    launcherCharge.charge = THREE.MathUtils.clamp(
      (now - launcherCharge.startedAt) / LAUNCHER_MAX_CHARGE_MS, 0, 1
    );
    const launch = getGravityOrbLaunchState(launcherCharge.charge);
    const prediction = predictOrbImpact(launch.origin, launch.velocity);
    updateGravityOrbAimIndicator(prediction, launcherCharge.charge);
    if (now - launcherCharge.lastUiAt >= 100) {
      launcherCharge.lastUiAt = now;
      renderControlHints();
    }
  }

  function releaseGravityOrbCharge(key, now) {
    if (launcherCharge.key !== key) return false;
    const charge = THREE.MathUtils.clamp(
      (now - launcherCharge.startedAt) / LAUNCHER_MAX_CHARGE_MS, 0, 1
    );
    launcherCharge.key = null;
    launcherCharge.startedAt = 0;
    launcherCharge.charge = 0;
    gravityOrbAimIndicator.group.visible = false;
    cooldowns.launcher = now + LAUNCHER_COOLDOWN_MS;
    launchGravityOrb(charge);
    renderControlHints();
    return true;
  }

  function updateGravityOrbProjectiles(delta) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i];
      projectile.age += Math.max(0, delta);
      if (projectile.age >= projectile.impact.time) {
        triggerGravityOrbImpact(
          projectile.impact.position,
          projectile.charge,
          projectile.radiusMultiplier,
          projectile.powerMultiplier
        );
        removeGravityOrbVisual(projectile.visual);
        projectiles.splice(i, 1);
        continue;
      }
      const position = getOrbPosition(projectile.start, projectile.velocity, projectile.age);
      updateGravityOrbVisual(projectile.visual, position, projectile.age);
    }
  }

  function createBounceWave(position, color = 0x40c5ff, scale = 1) {
    const group = new THREE.Group();
    group.position.copy(position);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.78, depthWrite: false, toneMapped: false
    });
    const waveMaterial = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.92, depthWrite: false, toneMapped: false
    });
    const outerMaterial = new THREE.MeshBasicMaterial({
      color: 0xb4edff, transparent: true, opacity: 0.65, depthWrite: false, toneMapped: false
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 14), coreMaterial);
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.045, 9, 56), waveMaterial);
    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.028, 9, 64), outerMaterial);
    innerRing.rotation.x = Math.PI / 2;
    outerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = -0.03;
    outerRing.position.y = -0.02;
    group.add(core, innerRing, outerRing);
    group.scale.setScalar(scale);
    scene.add(group);
    waves.push({
      group, age: 0, duration: 1.15, core, innerRing, outerRing,
      coreMaterial, waveMaterial, outerMaterial
    });
  }

  function applyImpulseField(origin, radius = 14) {
    const offset = new THREE.Vector3(
      chassisBody.position.x - origin.x,
      chassisBody.position.y - origin.y,
      chassisBody.position.z - origin.z
    );
    const distance = offset.length();
    if (distance >= radius) return false;

    const falloff = 1 - THREE.MathUtils.clamp(distance / radius, 0, 1);
    const horizontal = new THREE.Vector3(offset.x, 0, offset.z);
    if (horizontal.lengthSq() < 0.0001) horizontal.set(0.25, 0, -0.35);
    horizontal.normalize();

    // Stronger spring pulse, with extra reach but still no damage or vehicle health effects.
    const horizontalImpulse = 30 + 30 * falloff;
    const verticalImpulse = 90 + 60 * falloff;
    chassisBody.applyImpulse(new CANNON.Vec3(
      horizontal.x * horizontalImpulse * falloff,
      verticalImpulse,
      horizontal.z * horizontalImpulse * falloff
    ));

    const spin = 3.0 + 6.0 * falloff;
    chassisBody.angularVelocity.x = THREE.MathUtils.clamp(
      chassisBody.angularVelocity.x + (offset.z >= 0 ? 1 : -1) * spin * 1.15, -13, 13
    );
    chassisBody.angularVelocity.y = THREE.MathUtils.clamp(
      chassisBody.angularVelocity.y + (offset.x >= 0 ? -1 : 1) * spin * 0.85, -13, 13
    );
    chassisBody.angularVelocity.z = THREE.MathUtils.clamp(
      chassisBody.angularVelocity.z + (offset.x >= 0 ? 1 : -1) * spin * 1.2, -13, 13
    );
    chassisBody.wakeUp();
    return true;
  }

  function createImpulseBeacon(event) {
    if (!validStuntEvent(event) || !rememberEvent(event.id)) return false;

    const group = new THREE.Group();
    group.name = "shared-impulse-beacon";
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0x26343f, roughness: 0.44, metalness: 0.72
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x5cddff, toneMapped: false
    });
    const orbMaterial = new THREE.MeshBasicMaterial({
      color: 0xb5f4ff, toneMapped: false
    });

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.19, 0.09, 20),
      baseMaterial
    );
    base.position.y = 0.05;
    base.castShadow = true;
    group.add(base);

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.045, 0.18, 12),
      baseMaterial
    );
    stem.position.y = 0.17;
    group.add(stem);

    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), orbMaterial);
    orb.position.y = 0.31;
    group.add(orb);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.018, 8, 32),
      glowMaterial
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.10;
    group.add(ring);

    group.position.set(event.x, event.y, event.z);
    group.visible = inMap;
    scene.add(group);

    const createdAt = performance.now();
    beacons.push({
      id: event.id,
      group,
      orb,
      ring,
      origin: new THREE.Vector3(event.x, event.y, event.z),
      createdAt,
      pulseAt: createdAt + BEACON_ARM_DELAY,
      triggered: false
    });
    return true;
  }

  function deployImpulseBeacon() {
    const forward = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(localCar.root.quaternion)
      .normalize();
    const position = new THREE.Vector3(
      chassisBody.position.x,
      0,
      chassisBody.position.z
    ).addScaledVector(forward, 3.5);
    position.y = sampleGroundHeight(position.x, position.z);

    const event = {
      id: makeEventId(),
      type: "impulse-beacon",
      x: position.x,
      y: position.y,
      z: position.z,
      yaw: 0
    };
    if (!createImpulseBeacon(event)) return false;
    game.multiplayer?.sendSandboxEvent?.(event);
    game.showToast("Impulse beacon placed — 3-second charge; it pulses when a car gets close");
    return true;
  }

  function isVehicleInFlight() {
    const wheels = game.vehicle?.wheelInfos || [];
    const groundedWheels = wheels.reduce(
      (count, wheel) => count + (wheel.isInContact ? 1 : 0),
      0
    );
    return chassisBody.position.y > 0.42 && (wheels.length === 0 || groundedWheels <= 1);
  }

  function postPhysicsUpdate(delta) {
    const state = getThrusterState();
    const inFlight = active && inMap && !game.isPaused?.() && isVehicleInFlight();
    const wheels = game.vehicle?.wheelInfos || [];
    const groundedWheels = wheels.reduce((count,wheel)=>count+(wheel.isInContact?1:0),0);
    if(state.lift) flightControlArmed=true;
    else if(!inFlight&&groundedWheels>=2) flightControlArmed=false;
    const attitudeControlActive=inFlight&&flightControlArmed;
    if(!state.lift&&!state.forward&&!attitudeControlActive)return;

    // Work in the truck's local coordinate frame: X = pitch, Y = yaw,
    // Z = roll. Flight inputs are only read while the vehicle is airborne.
    const orientation = new THREE.Quaternion(
      chassisBody.quaternion.x,
      chassisBody.quaternion.y,
      chassisBody.quaternion.z,
      chassisBody.quaternion.w
    );
    const inverseOrientation = orientation.clone().invert();
    const localAngularVelocity = new THREE.Vector3(
      chassisBody.angularVelocity.x,
      chassisBody.angularVelocity.y,
      chassisBody.angularVelocity.z
    ).applyQuaternion(inverseOrientation);

    if (attitudeControlActive) {
      const keys = game.controls?.keys || {};
      // W raises the nose, S lowers it. A rolls left, D rolls right.
      const pitchInput = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
      const rollInput = (keys.a ? 1 : 0) - (keys.d ? 1 : 0);
      const response = 1 - Math.exp(-24 * Math.max(0, delta));

      // Faster attitude response gives the driver enough authority to redirect
      // the jump-thruster vector quickly while airborne.
      const targetPitchRate = pitchInput * 3.4;
      const targetRollRate = rollInput * 3.7;
      localAngularVelocity.x += (targetPitchRate - localAngularVelocity.x) * response;
      localAngularVelocity.z += (targetRollRate - localAngularVelocity.z) * response;
      // Keep yaw calm; A/D are reserved for roll while in Sandbox flight.
      localAngularVelocity.y *= Math.exp(-5 * Math.max(0, delta));
      localAngularVelocity.x = THREE.MathUtils.clamp(localAngularVelocity.x, -3.4, 3.4);
      localAngularVelocity.z = THREE.MathUtils.clamp(localAngularVelocity.z, -3.7, 3.7);
    } else {
      // On the ground, Q must not introduce any pitch or roll. When forward
      // boost is used, damp unwanted rotation without taking over steering.
      const pitchRollDamping = Math.exp(-(state.lift ? 24 : 8) * Math.max(0, delta));
      const yawDamping = Math.exp(-(state.lift ? 8 : 4) * Math.max(0, delta));
      localAngularVelocity.x = state.lift
        ? 0
        : THREE.MathUtils.clamp(localAngularVelocity.x * pitchRollDamping, -0.85, 0.85);
      localAngularVelocity.z = state.lift
        ? 0
        : THREE.MathUtils.clamp(localAngularVelocity.z * pitchRollDamping, -0.85, 0.85);
      localAngularVelocity.y = THREE.MathUtils.clamp(
        localAngularVelocity.y * yawDamping,
        state.lift ? -1.0 : -1.8,
        state.lift ? 1.0 : 1.8
      );
    }

    localAngularVelocity.applyQuaternion(orientation);
    chassisBody.angularVelocity.set(
      localAngularVelocity.x,
      localAngularVelocity.y,
      localAngularVelocity.z
    );

    if (state.lift && delta > 0) {
      // Q applies continuous acceleration along the truck's actual local-up
      // axis. Pitching nose-down redirects it forward; rolling redirects it
      // sideways; flipping over points it toward the ground. There is no
      // altitude ceiling or target-speed controller, so the car keeps
      // accelerating in the direction it is aimed for as long as Q is held.
      const localUp = new CANNON.Vec3(0, 1, 0);
      const thrustDirection = new CANNON.Vec3();
      chassisBody.quaternion.vmult(localUp, thrustDirection);
      thrustDirection.normalize();

      const velocityChange = secretSettings.jumpThrusterPower * delta;
      chassisBody.velocity.x += thrustDirection.x * velocityChange;
      chassisBody.velocity.y += thrustDirection.y * velocityChange;
      chassisBody.velocity.z += thrustDirection.z * velocityChange;
      chassisBody.wakeUp();
    }
  }

  function isLocalCarNearBeacon(beacon) {
    const dx = chassisBody.position.x - beacon.origin.x;
    const dy = chassisBody.position.y - beacon.origin.y;
    const dz = chassisBody.position.z - beacon.origin.z;
    return Math.hypot(dx, dy, dz) <= BEACON_TRIGGER_RADIUS;
  }

  function triggerBeacon(beacon) {
    if (beacon.triggered) return;
    beacon.triggered = true;
    if (active && inMap) {
      applyImpulseField(beacon.origin);
      createBounceWave(
        new THREE.Vector3(beacon.origin.x, beacon.origin.y + 0.12, beacon.origin.z),
        0x57d8ff,
        1.12
      );
    }
    beacon.group.visible = true;
    beacon.orb.material.color.setHex(0xe5fbff);
  }

  function update(delta, now = performance.now()) {
    const canDrive = active && inMap && !game.isPaused?.();

    updateThrusterVisuals(now);
    if (active && inMap) updateOrbitalLaserSequences(Date.now());
    if (canDrive) {
      updateGravityOrbCharge(now);
      updateGravityOrbProjectiles(delta);
      if (!launcherCharge.key && cooldowns.launcher && now >= cooldowns.launcher) {
        cooldowns.launcher = 0;
        renderControlHints();
      }
    } else if (gravityOrbAimIndicator) {
      gravityOrbAimIndicator.group.visible = false;
    }

    for (let i = beacons.length - 1; i >= 0; i--) {
      const beacon = beacons[i];
      if (!beacon.triggered) {
        const pulse = 1 + Math.sin((now - beacon.createdAt) * 0.012) * 0.12;
        beacon.orb.scale.setScalar(pulse);
        beacon.ring.scale.setScalar(
          now >= beacon.pulseAt ? 1.12 + Math.sin(now * 0.014) * 0.18 : 0.82 + pulse * 0.08
        );
        if (canDrive && now >= beacon.pulseAt && isLocalCarNearBeacon(beacon)) {
          triggerBeacon(beacon);
        }
      }
      if (now - beacon.createdAt > 30_000) {
        scene.remove(beacon.group);
        dispose(beacon.group);
        beacons.splice(i, 1);
      }
    }

    for (let i = waves.length - 1; i >= 0; i--) {
      const wave = waves[i];
      wave.age += delta;
      const t = THREE.MathUtils.clamp(wave.age / wave.duration, 0, 1);
      wave.core.scale.setScalar(0.6 + t * 3.2);
      wave.innerRing.scale.setScalar(0.55 + t * 5.8);
      wave.outerRing.scale.setScalar(0.42 + t * 7.0);
      wave.coreMaterial.opacity = Math.max(0, 0.78 * (1 - t));
      wave.waveMaterial.opacity = Math.max(0, 0.92 * (1 - t));
      wave.outerMaterial.opacity = Math.max(0, 0.65 * (1 - t));
      if (t >= 1) {
        scene.remove(wave.group);
        dispose(wave.group);
        waves.splice(i, 1);
      }
    }
  }

  function handleKeyDown(key, event) {
    if (active && !inMap && !game.isPaused?.()) {
      const focused = document.activeElement;
      if (!focused || !secretMenuPanel?.contains(focused)) {
        if (key === "d" || key === "h") {
          secretChordKeys.add(key);
          if (secretChordKeys.has("d") && secretChordKeys.has("h") && !secretChordLatched) {
            secretChordLatched = true;
            event?.preventDefault?.();
            toggleSecretMenu();
            return true;
          }
        }
      }
    }

    if (!active || !inMap || !game.multiplayer?.joined || game.isPaused?.()) return false;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return false;
    if (!SLOT_KEYS.includes(key)) return false;

    const part = getPartForKey(key);
    if (!part) return false;
    event?.preventDefault?.();
    if (event?.repeat) return true;

    if (part === "lift") {
      held.lift = true;
      heldAssignments[key] = part;
    } else if (part === "forward") {
      held.forward = true;
      heldAssignments[key] = part;
    } else if (part === "beacon") {
      const now = performance.now();
      if (now < cooldowns.beacon) return true;
      cooldowns.beacon = now + 2200;
      deployImpulseBeacon();
    } else if (part === "gravity-orb") {
      beginGravityOrbCharge(key, performance.now());
    } else if (part === "orbital-laser") {
      launchOrbitalLaser();
    }

    renderControlHints();
    return true;
  }

  function handleKeyUp(key) {
    let handled = false;
    if (key === "d" || key === "h") {
      const wasChordKey = secretChordKeys.has(key);
      secretChordKeys.delete(key);
      if (!secretChordKeys.has("d") || !secretChordKeys.has("h")) secretChordLatched = false;
      if (wasChordKey && active && !inMap) handled = true;
    }
    const assignedPart = heldAssignments[key];
    delete heldAssignments[key];
    if (assignedPart === "lift") {
      held.lift = false;
      handled = true;
    } else if (assignedPart === "forward") {
      held.forward = false;
      handled = true;
    }
    if (launcherCharge.key === key) {
      releaseGravityOrbCharge(key, performance.now());
      handled = true;
    }
    if (handled) renderControlHints();
    return handled;
  }

  document.querySelectorAll("[data-sandbox-part]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.sandboxPart;
      if (loadout.has(id)) {
        loadout.delete(id);
      } else {
        if (!secretSettings.infiniteGadgets && loadout.size >= MAX_EQUIPPED_GADGETS) {
          game.showToast("Your truck has 3 gadget slots. Enable Infinite Gadgets in the secret menu or remove one.");
          return;
        }
        loadout.add(id);
      }
      clearHeldControls();
      applyLoadout(localCar, getLoadout());
      if (localAttachment) localAttachment.group.visible = active;
      renderBuilder();
      renderControlHints();
    });
  });
  $("sandboxEnterMapButton").addEventListener("click", enterMap);
  $("sandboxLeaveButton").addEventListener("click", () => game.multiplayer?.leaveArena?.());
  $("secretMenuClose")?.addEventListener("click", () => setSecretMenuOpen(false));
  $("secretInfiniteGadgets")?.addEventListener("change", (event) =>
    toggleInfiniteGadgets(event.target.checked)
  );
  $("secretGravityOrbRadius")?.addEventListener("input", (event) =>
    updateSecretSetting("gravityOrbRadius", event.target, 0.5, 5)
  );
  $("secretGravityOrbPower")?.addEventListener("input", (event) =>
    updateSecretSetting("gravityOrbPower", event.target, 0.25, 5)
  );
  $("secretJumpThrusterPower")?.addEventListener("input", (event) =>
    updateSecretSetting("jumpThrusterPower", event.target, 8, 90)
  );
  $("secretForwardThrusterPower")?.addEventListener("input", (event) =>
    updateSecretSetting("forwardThrusterPower", event.target, 12, 130)
  );
  $("secretOrbitalLaserButton")?.addEventListener("click", toggleOrbitalLaserGadget);

  const gravityOrbAimIndicator = makeGravityOrbAimIndicator();
  applyLoadout(localCar, getLoadout());
  renderBuilder();
  renderSecretMenu();

  return {
    beginSession,
    showBuilder,
    enterMap,
    endSession,
    update,
    postPhysicsUpdate,
    handleKeyDown,
    handleKeyUp,
    clearHeldControls,
    receiveRemoteStuntEvent(peerId, event) {
      if (!active || !inMap || typeof peerId !== "string" || !validStuntEvent(event)) return false;
      if (event.type === "gravity-orb") return createGravityOrbProjectile(event);
      if (event.type === "orbital-laser") return createOrbitalLaserSequence(event);
      return createImpulseBeacon(event);
    },
    getLoadout,
    getThrusterState,
    getThrusterTuning() {
      return {
        jumpPower: secretSettings.jumpThrusterPower,
        forwardPower: secretSettings.forwardThrusterPower
      };
    },
    getCameraShakeOffset,
    applyRemoteLoadout: applyLoadout,
    applyRemoteThrusterState,
    updatePlayerCount,
    get active() { return active; },
    get inMap() { return inMap; }
  };
}
