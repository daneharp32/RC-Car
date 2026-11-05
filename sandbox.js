// Local arcade Sandbox: preview attachments, choose any installed map, and
// use purely fictional game gadgets with non-damaging visual effects.
export function createSandboxSystem(game) {
  const {
    THREE,
    CANNON,
    scene,
    chassisBody,
    localCar,
    mapLayouts,
    showToast
  } = game;
  const $ = game.$;

  const partsList = $("sandboxPartsList");
  const buildSummary = $("sandboxBuildSummary");
  const mapSelect = $("sandboxMapSelect");
  const startButton = $("sandboxStartButton");
  const backButton = $("sandboxBuilderBackButton");
  const boostButton = $("sandboxBoostButton");
  const foamButton = $("sandboxFoamButton");
  const bounceButton = $("sandboxBounceButton");

  const definitions = [
    {
      id: "boost-pods",
      name: "Rocket Boost Pods",
      type: "THRUST",
      description: "Twin sci-fi boost pods. Press 1 for a short forward-and-upward arcade boost."
    },
    {
      id: "foam-popper",
      name: "Rapid Foam Popper",
      type: "CONFETTI",
      description: "A colorful foam-and-confetti burst. Press 2 to spray harmless particles."
    },
    {
      id: "bounce-pod",
      name: "Bounce-Pulse Catapult",
      type: "BOUNCE",
      description: "Tosses a glowing cartoon pod. Press 3 for a bright pulse that bounces nearby cars."
    }
  ];

  const selectedParts = new Set();
  const mountedParts = new Map();
  const projectiles = [];
  const effects = [];
  const particleGeometry = new THREE.SphereGeometry(0.035, 8, 6);
  const podGeometry = new THREE.SphereGeometry(0.11, 14, 10);
  const shockwaveGeometry = new THREE.TorusGeometry(1, 0.045, 8, 48);
  const confettiColors = [0x62c6ff, 0xffb84d, 0x8ee2b1, 0xff78ae, 0xd6a0ff];
  const cooldownUntil = {
    boost: 0,
    foam: 0,
    bounce: 0
  };
  let active = false;

  const materials = {
    dark: new THREE.MeshStandardMaterial({ color: 0x17232e, roughness: 0.42, metalness: 0.48 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8ea5b7, roughness: 0.3, metalness: 0.76 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x178bd9, roughness: 0.3, metalness: 0.35, emissive: 0x062d55 }),
    cyan: new THREE.MeshStandardMaterial({ color: 0x65d8ff, roughness: 0.24, metalness: 0.22, emissive: 0x0c6b91, emissiveIntensity: 0.55 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xffa33d, roughness: 0.38, metalness: 0.22 }),
    purple: new THREE.MeshStandardMaterial({ color: 0x9365e8, roughness: 0.3, metalness: 0.2, emissive: 0x271052 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xffd45d, roughness: 0.26, metalness: 0.18, emissive: 0x6f3c00, emissiveIntensity: 0.35 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffe28a })
  };

  function addMesh(group, geometry, material, position, rotation = null) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function createAttachment(id) {
    const group = new THREE.Group();
    group.name = "sandbox-attachment-" + id;
    group.userData.sandboxAttachment = id;

    if (id === "boost-pods") {
      for (const side of [-1, 1]) {
        const pod = addMesh(
          group,
          new THREE.CylinderGeometry(0.052, 0.071, 0.30, 16),
          materials.blue,
          [side * 0.17, 0.31, 0.32],
          [Math.PI / 2, 0, 0]
        );
        pod.rotation.z = side * -0.06;
        addMesh(
          group,
          new THREE.TorusGeometry(0.055, 0.012, 8, 20),
          materials.cyan,
          [side * 0.17, 0.31, 0.475],
          [Math.PI / 2, 0, 0]
        );
        addMesh(
          group,
          new THREE.SphereGeometry(0.035, 12, 8),
          materials.orange,
          [side * 0.17, 0.31, 0.15]
        );
      }
      addMesh(group, new THREE.BoxGeometry(0.43, 0.055, 0.22), materials.dark, [0, 0.255, 0.32]);
    } else if (id === "foam-popper") {
      addMesh(group, new THREE.BoxGeometry(0.30, 0.075, 0.27), materials.dark, [0, 0.29, -0.02]);
      addMesh(
        group,
        new THREE.CylinderGeometry(0.095, 0.11, 0.16, 20),
        materials.purple,
        [0, 0.405, -0.02]
      );
      addMesh(
        group,
        new THREE.TorusGeometry(0.086, 0.014, 8, 24),
        materials.cyan,
        [0, 0.49, -0.02]
      );
      for (const [x, z, color] of [
        [-0.105, -0.12, materials.orange],
        [0.105, -0.12, materials.cyan],
        [-0.105, 0.075, materials.yellow],
        [0.105, 0.075, materials.purple]
      ]) {
        addMesh(group, new THREE.SphereGeometry(0.035, 10, 8), color, [x, 0.35, z]);
      }
    } else if (id === "bounce-pod") {
      addMesh(group, new THREE.BoxGeometry(0.31, 0.07, 0.28), materials.dark, [0, 0.285, 0.31]);
      addMesh(
        group,
        new THREE.CylinderGeometry(0.11, 0.13, 0.09, 18),
        materials.orange,
        [0, 0.365, 0.31]
      );
      addMesh(group, new THREE.SphereGeometry(0.085, 16, 12), materials.yellow, [0, 0.46, 0.25]);
      addMesh(
        group,
        new THREE.TorusGeometry(0.10, 0.012, 8, 24),
        materials.glow,
        [0, 0.46, 0.25]
      );
      addMesh(group, new THREE.SphereGeometry(0.025, 10, 8), materials.cyan, [0, 0.55, 0.25]);
    }

    localCar.root.add(group);
    return group;
  }

  function refreshMountedParts() {
    for (const [id, group] of mountedParts) {
      localCar.root.remove(group);
      group.traverse((object) => {
        if (object.isMesh) object.geometry?.dispose?.();
      });
      mountedParts.delete(id);
    }
    for (const definition of definitions) {
      if (selectedParts.has(definition.id)) {
        mountedParts.set(definition.id, createAttachment(definition.id));
      }
    }
  }

  function renderBuilder() {
    if (!partsList || !buildSummary) return;
    partsList.replaceChildren();

    for (const definition of definitions) {
      const selected = selectedParts.has(definition.id);
      const card = document.createElement("div");
      card.className = "sandbox-part-option" + (selected ? " selected" : "");

      const copy = document.createElement("div");
      copy.className = "sandbox-part-copy";
      const type = document.createElement("div");
      type.className = "sandbox-part-type";
      type.textContent = definition.type;
      const title = document.createElement("strong");
      title.textContent = definition.name;
      const description = document.createElement("p");
      description.textContent = definition.description;
      copy.append(type, title, description);

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "sandbox-part-toggle";
      toggle.textContent = selected ? "REMOVE" : "ADD";
      toggle.setAttribute("aria-pressed", selected ? "true" : "false");
      toggle.addEventListener("click", () => {
        if (selectedParts.has(definition.id)) {
          selectedParts.delete(definition.id);
        } else {
          selectedParts.add(definition.id);
        }
        refreshMountedParts();
        renderBuilder();
      });

      card.append(copy, toggle);
      partsList.appendChild(card);
    }

    const chosen = definitions.filter((definition) => selectedParts.has(definition.id));
    buildSummary.textContent = chosen.length
      ? chosen.map((definition) => definition.name).join(" · ")
      : "No attachments selected yet. Add any combination of the three arcade parts.";
  }

  function populateMapOptions() {
    if (!mapSelect) return;
    const previousValue = mapSelect.value || game.activeMapId;
    mapSelect.replaceChildren();

    for (const [mapId, layout] of Object.entries(mapLayouts || {})) {
      const option = document.createElement("option");
      option.value = mapId;
      option.textContent = layout.name || mapId.replace(/-/g, " ").toUpperCase();
      mapSelect.appendChild(option);
    }

    if (Object.prototype.hasOwnProperty.call(mapLayouts || {}, previousValue)) {
      mapSelect.value = previousValue;
    } else if (game.activeMapId && Object.prototype.hasOwnProperty.call(mapLayouts || {}, game.activeMapId)) {
      mapSelect.value = game.activeMapId;
    }
  }

  function openBuilder() {
    active = false;
    clearEffects();
    populateMapOptions();
    refreshMountedParts();
    renderBuilder();
    game.garage?.showSandboxBuilder?.();
  }

  function startSandbox() {
    const selectedMap = mapSelect?.value || game.activeMapId || "closed-course";
    if (!game.setActiveMap?.(selectedMap, { silent: true })) {
      showToast("That map could not be loaded.");
      return;
    }

    clearEffects();
    game.race?.leaveLobby?.();
    active = true;
    game.garage?.showSandboxDrive?.();
    const chosenCount = selectedParts.size;
    showToast(chosenCount
      ? "SANDBOX READY · " + chosenCount + " ARCADE PART" + (chosenCount === 1 ? "" : "S") + " EQUIPPED"
      : "SANDBOX READY · DRIVE AND EXPLORE");
  }

  function returnToBuilder() {
    active = false;
    clearEffects();
    openBuilder();
  }

  function leaveSandbox() {
    active = false;
    clearEffects();
    game.garage?.showMainMenu?.();
  }

  function currentForward() {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(localCar.root.quaternion).normalize();
  }

  function currentPosition(offsetForward = 0, offsetUp = 0) {
    return localCar.root.position.clone()
      .add(new THREE.Vector3(0, offsetUp, 0))
      .addScaledVector(currentForward(), offsetForward);
  }

  function addParticle(position, velocity, color, lifetime = 0.9, scale = 1) {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.94,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(particleGeometry, material);
    mesh.position.copy(position);
    mesh.scale.setScalar(scale);
    scene.add(mesh);
    effects.push({
      kind: "particle",
      mesh,
      velocity: velocity.clone(),
      age: 0,
      lifetime
    });
  }

  function spawnConfettiBurst() {
    const origin = currentPosition(0.68, 0.31);
    const forward = currentForward();
    for (let index = 0; index < 22; index++) {
      const velocity = forward.clone().multiplyScalar(4.5 + Math.random() * 3.2);
      velocity.x += (Math.random() - 0.5) * 5.0;
      velocity.y += 0.8 + Math.random() * 4.0;
      velocity.z += (Math.random() - 0.5) * 5.0;
      addParticle(
        origin,
        velocity,
        confettiColors[index % confettiColors.length],
        0.75 + Math.random() * 0.45,
        0.7 + Math.random() * 0.7
      );
    }
    showToast("FOAM POPPER · CONFETTI BURST");
  }

  function triggerBoost() {
    if (!active || !selectedParts.has("boost-pods")) {
      if (active) showToast("ADD ROCKET BOOST PODS IN THE BUILDER FIRST");
      return;
    }
    const now = performance.now();
    if (now < cooldownUntil.boost) return;
    cooldownUntil.boost = now + 1700;

    const forward = currentForward();
    chassisBody.applyImpulse(new CANNON.Vec3(
      forward.x * 34,
      7.5,
      forward.z * 34
    ));
    chassisBody.wakeUp();

    const rear = currentPosition(0.43, 0.22);
    for (let index = 0; index < 12; index++) {
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 1.6,
        0.8 + Math.random() * 2.0,
        (Math.random() - 0.5) * 1.6
      ).addScaledVector(forward, -1.8 - Math.random() * 2.4);
      addParticle(rear, velocity, index % 2 ? 0x69d8ff : 0xffc36b, 0.45, 0.65);
    }
    showToast("BOOST!");
  }

  function triggerFoamPopper() {
    if (!active || !selectedParts.has("foam-popper")) {
      if (active) showToast("ADD THE RAPID FOAM POPPER IN THE BUILDER FIRST");
      return;
    }
    const now = performance.now();
    if (now < cooldownUntil.foam) return;
    cooldownUntil.foam = now + 520;
    spawnConfettiBurst();
  }

  function createBounceProjectile() {
    const forward = currentForward();
    const position = currentPosition(0.58, 0.38);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffe28a,
      transparent: true,
      emissive: 0xffa72e
    });
    const mesh = new THREE.Mesh(podGeometry, material);
    mesh.position.copy(position);
    scene.add(mesh);
    projectiles.push({
      mesh,
      velocity: forward.multiplyScalar(6.3).add(new THREE.Vector3(0, 4.0, 0)),
      age: 0,
      lifetime: 1.0
    });
  }

  function launchBouncePod() {
    if (!active || !selectedParts.has("bounce-pod")) {
      if (active) showToast("ADD THE BOUNCE-PULSE CATAPULT IN THE BUILDER FIRST");
      return;
    }
    const now = performance.now();
    if (now < cooldownUntil.bounce) return;
    cooldownUntil.bounce = now + 2300;
    createBounceProjectile();
    showToast("BOUNCE POD AWAY!");
  }

  function applyBouncePulse(center) {
    const carPosition = new THREE.Vector3(
      chassisBody.position.x,
      chassisBody.position.y,
      chassisBody.position.z
    );
    const offset = carPosition.sub(center);
    const distance = offset.length();
    const radius = 8.5;

    if (distance < radius) {
      if (distance < 0.001) offset.set(0, 1, 0);
      else offset.normalize();

      const falloff = 1 - Math.max(0, distance) / radius;
      const strength = 48 * falloff;
      const vertical = (Math.max(0.42, offset.y) + 0.55) * strength;
      chassisBody.applyImpulse(new CANNON.Vec3(
        offset.x * strength,
        vertical,
        offset.z * strength
      ));
      chassisBody.wakeUp();
    }

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd66f,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ring = new THREE.Mesh(shockwaveGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(center);
    ring.position.y = Math.max(0.08, ring.position.y);
    scene.add(ring);
    effects.push({
      kind: "shockwave",
      mesh: ring,
      age: 0,
      lifetime: 0.72,
      maxRadius: radius
    });

    for (let index = 0; index < 30; index++) {
      const angle = (index / 30) * Math.PI * 2;
      const velocity = new THREE.Vector3(
        Math.cos(angle) * (2.0 + Math.random() * 2.0),
        1.2 + Math.random() * 3.0,
        Math.sin(angle) * (2.0 + Math.random() * 2.0)
      );
      addParticle(center, velocity, confettiColors[index % confettiColors.length], 0.65, 0.85);
    }
    showToast("BOUNCE PULSE · NEARBY TRUCKS GET FLUNG");
  }

  function clearEffects() {
    for (const item of projectiles) {
      scene.remove(item.mesh);
      item.mesh.material?.dispose?.();
    }
    projectiles.length = 0;

    for (const item of effects) {
      scene.remove(item.mesh);
      item.mesh.material?.dispose?.();
    }
    effects.length = 0;
  }

  function update(delta) {
    if (!active) return;

    for (let index = projectiles.length - 1; index >= 0; index--) {
      const projectile = projectiles[index];
      projectile.age += delta;
      projectile.velocity.y -= 8.0 * delta;
      projectile.mesh.position.addScaledVector(projectile.velocity, delta);
      projectile.mesh.rotation.x += delta * 5.0;
      projectile.mesh.rotation.z += delta * 3.5;

      if (projectile.age >= projectile.lifetime) {
        const impactPosition = projectile.mesh.position.clone();
        scene.remove(projectile.mesh);
        projectile.mesh.material.dispose();
        projectiles.splice(index, 1);
        applyBouncePulse(impactPosition);
      }
    }

    for (let index = effects.length - 1; index >= 0; index--) {
      const effect = effects[index];
      effect.age += delta;
      const progress = Math.min(1, effect.age / effect.lifetime);

      if (effect.kind === "shockwave") {
        const radius = 0.15 + progress * effect.maxRadius;
        effect.mesh.scale.set(radius, radius, radius);
        effect.mesh.material.opacity = 0.92 * (1 - progress);
      } else {
        effect.mesh.position.addScaledVector(effect.velocity, delta);
        effect.velocity.y -= 3.5 * delta;
        effect.mesh.rotation.x += delta * 4.0;
        effect.mesh.rotation.z += delta * 3.0;
        effect.mesh.material.opacity = 0.94 * (1 - progress);
        effect.mesh.scale.multiplyScalar(1 - delta * 0.35);
      }

      if (effect.age >= effect.lifetime) {
        scene.remove(effect.mesh);
        effect.mesh.material.dispose();
        effects.splice(index, 1);
      }
    }
  }

  function handleHotkeys(event) {
    if (!active || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const focused = document.activeElement;
    if (focused && (
      ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(focused.tagName) ||
      focused.isContentEditable
    )) return;

    if (event.code === "Digit1") {
      event.preventDefault();
      triggerBoost();
    } else if (event.code === "Digit2") {
      event.preventDefault();
      triggerFoamPopper();
    } else if (event.code === "Digit3") {
      event.preventDefault();
      launchBouncePod();
    }
  }

  window.addEventListener("keydown", handleHotkeys);
  startButton?.addEventListener("click", startSandbox);
  backButton?.addEventListener("click", leaveSandbox);
  boostButton?.addEventListener("click", triggerBoost);
  foamButton?.addEventListener("click", triggerFoamPopper);
  bounceButton?.addEventListener("click", launchBouncePod);

  populateMapOptions();
  renderBuilder();

  return {
    openBuilder,
    startSandbox,
    returnToBuilder,
    leaveSandbox,
    update,
    get active() { return active; },
    get selectedParts() { return [...selectedParts]; }
  };
}
