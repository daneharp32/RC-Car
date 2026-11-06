// Multiplayer Sandbox builder, continuous thrusters, and shared impulse beacons.
export function createSandboxSystem(game) {
  const { THREE, CANNON, scene, chassisBody, localCar, $ } = game;
  const builderPanel = $("sandboxBuilderPanel");
  const controlsPanel = $("sandboxControlsCard");
  const loadout = new Set();
  const attachmentCache = new WeakMap();
  const beacons = [];
  const waves = [];
  const seenEvents = new Set();
  const held = { lift: false, forward: false };
  const cooldowns = { beacon: 0 };
  const BEACON_ARM_DELAY = 3000;
  const BEACON_TRIGGER_RADIUS = 8;
  // Constant acceleration while Q is held. This is a directional thruster,
  // not a height- or speed-hold controller.
  const JUMP_THRUSTER_ACCELERATION = 26;
  const PARTS = [
    { id: "lift", title: "JUMP THRUSTERS" },
    { id: "forward", title: "FORWARD THRUSTERS" },
    { id: "beacon", title: "IMPULSE BEACON" }
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
    const group=new THREE.Group(); group.name="sandbox-forward-thrusters";
    const housing=new THREE.MeshStandardMaterial({color:0x18242e,roughness:0.38,metalness:0.84});
    const nozzle=new THREE.MeshStandardMaterial({color:0x9aadb7,roughness:0.23,metalness:0.9});
    const aperture=new THREE.MeshStandardMaterial({color:0x07131c,roughness:0.28,metalness:0.55});
    const jets=[];
    for(const x of [-0.22,0.22]){
      addBox(group,[0.19,0.105,0.23],[x,0.22,0.36],housing);
      addCylinder(group,0.079,0.102,0.15,[x,0.22,0.48],nozzle,[Math.PI/2,0,0]);
      addCylinder(group,0.055,0.055,0.012,[x,0.22,0.56],aperture,[Math.PI/2,0,0]);
      jets.push(makeColdGasPlume(group, [x, 0.22, 0.57], "back", 1.32, 0.17));
    }
    root.add(group); return jets;
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

  function applyLoadout(visual, requested) {
    if (!visual?.root) return;
    const ids = [...new Set((Array.isArray(requested) ? requested : []).filter((id) =>
      PARTS.some((part) => part.id === id)
    ))].sort();
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
    group.name = "sandbox-thruster-and-beacon-parts";
    const liftFlames = ids.includes("lift") ? makeJumpThrusters(group, visual === localCar) : [];
    const forwardFlames = ids.includes("forward") ? makeForwardThrusters(group) : [];
    if (ids.includes("beacon")) makeImpulseBeaconModule(group);
    group.visible = visual === localCar ? active : true;
    visual.root.add(group);

    const entry = { key, group, liftFlames, forwardFlames };
    attachmentCache.set(visual, entry);
    if (visual === localCar) localAttachment = entry;
  }

  function getLoadout() {
    return [...loadout].sort();
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
    document.querySelectorAll("[data-sandbox-part]").forEach((button) => {
      const equipped = loadout.has(button.dataset.sandboxPart);
      button.classList.toggle("equipped", equipped);
      button.setAttribute("aria-pressed", equipped ? "true" : "false");
      const label = button.querySelector(".sandbox-part-action");
      if (label) label.textContent = equipped ? "REMOVE PART" : "ADD TO TRUCK";
    });
    const equippedLabel = $("sandboxEquippedValue");
    if (equippedLabel) {
      equippedLabel.textContent = loadout.size
        ? getLoadout().map((id) => PARTS.find((part) => part.id === id).title).join(" · ")
        : "NO THRUSTER OR BEACON PARTS EQUIPPED";
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
    document.querySelectorAll("[data-sandbox-control]").forEach((item) => {
      const id = item.dataset.sandboxControl;
      const equipped = loadout.has(id);
      item.classList.toggle("equipped", equipped);
      const label = item.querySelector("small");
      if (!label) return;
      if (!equipped) label.textContent = "NOT EQUIPPED";
      else if (id === "lift") label.textContent = status.lift ? "ACTIVE" : "HOLD Q";
      else if (id === "forward") label.textContent = status.forward ? "ACTIVE" : "HOLD E";
      else label.textContent = "PRESS F";
      item.classList.toggle("active", (id === "lift" && status.lift) || (id === "forward" && status.forward));
    });
  }

  function updatePlayerCount(count) {
    playerCount = Math.max(1, Math.min(8, Number(count) || 1));
    renderBuilder();
  }

  function clearHeldControls() {
    held.lift = false;
    held.forward = false;
    flightControlArmed = false;
    updateThrusterVisuals(performance.now());
    renderControlHints();
  }

  function showBuilder() {
    clearHeldControls();
    active = true;
    inMap = false;
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
    game.showToast("Sandbox joined — equip your thrusters and beacon before entering");
  }

  function enterMap() {
    if (!active || inMap) return;
    clearHeldControls();
    chassisBody.angularDamping = 0.32;
    inMap = true;
    builderPanel.style.display = "none";
    for (const beacon of beacons) beacon.group.visible = true;
    game.garage.showDriveScreen();
    localCar.setPlayerName?.(game.multiplayer?.driverName || "Driver", true);
    renderControlHints();
    game.showToast("Sandbox: hold Q to fly · hold E to boost · F to place an impulse beacon");
  }

  function endSession() {
    clearHeldControls();
    active = false;
    inMap = false;
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
    if (localAttachment) localAttachment.group.visible = false;
    renderControlHints();
    seenEvents.clear();
  }

  function makeEventId() {
    return globalThis.crypto?.randomUUID?.() ||
      ("stunt-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10));
  }

  function validStuntEvent(event) {
    return event && typeof event.id === "string" && event.id.length <= 80 &&
      event.type === "impulse-beacon" &&
      [event.x, event.y, event.z, event.yaw].every(Number.isFinite);
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

      const velocityChange = JUMP_THRUSTER_ACCELERATION * delta;
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
    if (!active || !inMap || !game.multiplayer?.joined || game.isPaused?.()) return false;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return false;

    const part = ({ q: "lift", e: "forward", f: "beacon" })[key];
    if (!part) return false;
    event?.preventDefault?.();

    if (!loadout.has(part)) {
      if (!event?.repeat) {
        const title = PARTS.find((item) => item.id === part)?.title || "that part";
        game.showToast("Equip " + title + " in the builder first");
      }
      return true;
    }

    if (part === "lift") held.lift = true;
    else if (part === "forward") held.forward = true;
    else if (part === "beacon" && !event?.repeat) {
      const now = performance.now();
      if (now < cooldowns.beacon) return true;
      cooldowns.beacon = now + 2200;
      deployImpulseBeacon();
    }

    renderControlHints();
    return true;
  }

  function handleKeyUp(key) {
    let handled = false;
    if (key === "q") {
      held.lift = false;
      handled = true;
    } else if (key === "e") {
      held.forward = false;
      handled = true;
    }
    if (handled) renderControlHints();
    return handled;
  }

  document.querySelectorAll("[data-sandbox-part]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.sandboxPart;
      if (loadout.has(id)) loadout.delete(id);
      else loadout.add(id);
      clearHeldControls();
      applyLoadout(localCar, getLoadout());
      if (localAttachment) localAttachment.group.visible = active;
      renderBuilder();
      renderControlHints();
    });
  });
  $("sandboxEnterMapButton").addEventListener("click", enterMap);
  $("sandboxLeaveButton").addEventListener("click", () => game.multiplayer?.leaveArena?.());

  applyLoadout(localCar, getLoadout());
  renderBuilder();

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
      if (!active || typeof peerId !== "string" || !validStuntEvent(event)) return false;
      return createImpulseBeacon(event);
    },
    getLoadout,
    getThrusterState,
    applyRemoteLoadout: applyLoadout,
    applyRemoteThrusterState,
    updatePlayerCount,
    get active() { return active; },
    get inMap() { return inMap; }
  };
}
