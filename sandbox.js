// Multiplayer stunt builder, spring fields, jump pads, and RC-car boost effects.
export function createSandboxSystem(game) {
  const { THREE, CANNON, scene, chassisBody, localCar, $ } = game;
  const builderPanel = $("sandboxBuilderPanel");
  const controlsPanel = $("sandboxControlsCard");
  const loadout = new Set();
  const attachmentCache = new WeakMap();
  const pads = [];
  const waves = [];
  const seenEvents = new Set();
  const cooldowns = { spring: 0, pad: 0, boost: 0 };
  const PARTS = [
    { id: "spring", title: "SPRING BUMPER FIELD" },
    { id: "pad", title: "FOLD-OUT JUMP PAD" },
    { id: "boost", title: "TWIN BOOST VENTS" }
  ];

  let active = false;
  let inMap = false;
  let playerCount = 1;
  let localAttachmentGroup = null;
  const standardAngularDamping = chassisBody.angularDamping;

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

  function addCylinder(parent, radius, height, position, material, rotation = [0, 0, 0]) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 16), material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function addBeam(parent, start, end, width, material) {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const direction = b.clone().sub(a);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, direction.length(), width), material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function makeSpringBumper(root) {
    const group = new THREE.Group();
    const rubber = new THREE.MeshStandardMaterial({ color: 0x202a31, roughness: 0.92 });
    const orange = new THREE.MeshStandardMaterial({ color: 0xf07832, roughness: 0.45, metalness: 0.18 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x8d9ba3, roughness: 0.35, metalness: 0.72 });
    addBox(group, [0.72, 0.12, 0.12], [0, 0.20, -0.57], rubber);
    for (const side of [-1, 1]) {
      addBox(group, [0.10, 0.18, 0.14], [side * 0.32, 0.20, -0.57], orange);
      addCylinder(group, 0.045, 0.16, [side * 0.24, 0.20, -0.45], metal, [Math.PI / 2, 0, 0]);
      for (let turn = 0; turn < 4; turn++) {
        const loop = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.009, 7, 18), orange);
        loop.position.set(side * 0.24, 0.20, -0.52 + turn * 0.035);
        loop.rotation.x = Math.PI / 2;
        group.add(loop);
      }
    }
    root.add(group);
  }

  function makeFoldOutJumpPad(root) {
    const group = new THREE.Group();
    group.name = "fold-out-jump-pad";
    group.position.set(0, 0.17, 0.34);
    const frame = new THREE.MeshStandardMaterial({ color: 0x303a43, roughness: 0.54, metalness: 0.72 });
    const deck = new THREE.MeshStandardMaterial({ color: 0x6a7d8c, roughness: 0.62, metalness: 0.24 });
    const blue = new THREE.MeshStandardMaterial({
      color: 0x38baff, emissive: 0x0878d8, emissiveIntensity: 1.25
    });
    addBox(group, [0.42, 0.055, 0.34], [0, 0, 0.08], frame);
    addBox(group, [0.36, 0.028, 0.30], [0, 0.042, 0.08], deck);
    for (const side of [-1, 1]) {
      addBeam(group, [side * 0.16, 0.08, 0.18], [side * 0.16, 0.30, -0.30], 0.035, frame);
      addCylinder(group, 0.025, 0.20, [side * 0.17, 0.15, -0.06], blue);
    }
    addBox(group, [0.38, 0.025, 0.08], [0, 0.30, -0.30], blue, [-0.35, 0, 0]);
    root.add(group);
  }

  function makeBoostVents(root) {
    const group = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x18232b, roughness: 0.46, metalness: 0.72 });
    const blue = new THREE.MeshStandardMaterial({
      color: 0x39baff, emissive: 0x0878d8, emissiveIntensity: 1.5,
      roughness: 0.34, metalness: 0.24
    });
    for (const side of [-1, 1]) {
      const x = side * 0.205;
      addBox(group, [0.16, 0.08, 0.30], [x, 0.25, 0.30], dark);
      addBox(group, [0.13, 0.018, 0.22], [x, 0.297, 0.30], blue);
      for (let slat = 0; slat < 4; slat++) {
        addBox(group, [0.12, 0.012, 0.018], [x, 0.31, 0.20 + slat * 0.055], dark);
      }
      const outlet = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 8, 24), blue);
      outlet.position.set(x, 0.26, 0.13);
      outlet.rotation.x = Math.PI / 2;
      group.add(outlet);
    }
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
      return;
    }
    if (previous) {
      visual.root.remove(previous.group);
      dispose(previous.group);
    }
    const group = new THREE.Group();
    group.name = "sandbox-stunt-parts";
    if (ids.includes("spring")) makeSpringBumper(group);
    if (ids.includes("pad")) makeFoldOutJumpPad(group);
    if (ids.includes("boost")) makeBoostVents(group);
    group.visible = visual === localCar ? active : true;
    visual.root.add(group);
    attachmentCache.set(visual, { key, group });
    if (visual === localCar) localAttachmentGroup = group;
  }

  function getLoadout() {
    return [...loadout];
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
        : "NO STUNT PARTS EQUIPPED";
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
    document.querySelectorAll("[data-sandbox-control]").forEach((item) => {
      const equipped = loadout.has(item.dataset.sandboxControl);
      item.classList.toggle("equipped", equipped);
      const state = item.querySelector("small");
      if (state) state.textContent = equipped ? "READY" : "NOT EQUIPPED";
    });
  }

  function updatePlayerCount(count) {
    playerCount = Math.max(1, Math.min(8, Number(count) || 1));
    renderBuilder();
  }

  function showBuilder() {
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
    if (localAttachmentGroup) localAttachmentGroup.visible = true;
    for (const pad of pads) pad.group.visible = false;
    renderBuilder();
    renderControlHints();
  }

  function beginSession() {
    showBuilder();
    game.showToast("Sandbox joined — build first, then enter whenever you're ready");
  }

  function enterMap() {
    if (!active || inMap) return;
    chassisBody.angularDamping = 0.32;
    inMap = true;
    builderPanel.style.display = "none";
    for (const pad of pads) pad.group.visible = true;
    game.garage.showDriveScreen();
    localCar.setPlayerName?.(game.multiplayer?.driverName || "Driver", true);
    renderControlHints();
    game.showToast("Sandbox: Q spring field · E jump pad · F boost vents");
  }

  function endSession() {
    active = false;
    inMap = false;
    chassisBody.angularDamping = standardAngularDamping;
    builderPanel.style.display = "none";
    for (const pad of pads) {
      scene.remove(pad.group);
      dispose(pad.group);
    }
    pads.length = 0;
    for (const wave of waves) {
      scene.remove(wave.group);
      dispose(wave.group);
    }
    waves.length = 0;
    if (localAttachmentGroup) localAttachmentGroup.visible = false;
    renderControlHints();
    seenEvents.clear();
  }

  function makeEventId() {
    return globalThis.crypto?.randomUUID?.() ||
      ("stunt-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10));
  }

  function validStuntEvent(event) {
    return event && typeof event.id === "string" && event.id.length <= 80 &&
      ["spring-bounce", "jump-pad"].includes(event.type) &&
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
      color, transparent: true, opacity: 0.78, depthWrite: false
    });
    const waveMaterial = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.92, depthWrite: false
    });
    const outerMaterial = new THREE.MeshBasicMaterial({
      color: 0xb4edff, transparent: true, opacity: 0.65, depthWrite: false
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
    waves.push({ group, age: 0, duration: 1.15, core, innerRing, outerRing, coreMaterial, waveMaterial, outerMaterial });
  }

  function applySpringImpulse(origin, radius = 9) {
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
    const impulse = 54 + 42 * falloff;
    chassisBody.applyImpulse(new CANNON.Vec3(
      horizontal.x * 12 * falloff,
      impulse,
      horizontal.z * 12 * falloff
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

  function activateSpringField() {
    const position = new THREE.Vector3(chassisBody.position.x, chassisBody.position.y, chassisBody.position.z);
    const event = { id: makeEventId(), type: "spring-bounce", x: position.x, y: position.y, z: position.z, yaw: 0 };
    applySpringImpulse(position);
    createBounceWave(position, 0xffad54, 1.15);
    game.multiplayer.sendSandboxEvent?.(event);
  }

  function createJumpPad(event) {
    if (!validStuntEvent(event)) return false;
    if (!rememberEvent(event.id)) return false;
    const group = new THREE.Group();
    group.name = "multiplayer-sandbox-jump-pad";
    const frame = new THREE.MeshStandardMaterial({ color: 0x26333d, roughness: 0.55, metalness: 0.68 });
    const deck = new THREE.MeshStandardMaterial({ color: 0x738796, roughness: 0.65, metalness: 0.18 });
    const blue = new THREE.MeshStandardMaterial({
      color: 0x39bbff, emissive: 0x0878d8, emissiveIntensity: 1.4
    });
    addBox(group, [1.65, 0.15, 2.15], [0, 0.08, 0], frame);
    addBox(group, [1.46, 0.05, 1.92], [0, 0.18, 0], deck);
    for (const side of [-1, 1]) {
      addBox(group, [0.12, 0.11, 1.72], [side * 0.72, 0.24, 0], blue);
      for (const z of [-0.68, 0.68]) {
        addCylinder(group, 0.105, 0.23, [side * 0.58, 0.28, z], frame);
        addCylinder(group, 0.075, 0.25, [side * 0.58, 0.39, z], blue);
      }
    }
    group.position.set(event.x, sampleGroundHeight(event.x, event.z), event.z);
    group.rotation.y = event.yaw;
    group.visible = inMap;
    scene.add(group);
    pads.push({
      id: event.id,
      group,
      x: event.x,
      z: event.z,
      yaw: event.yaw,
      createdAt: performance.now(),
      nextTriggerAt: 0
    });
    return true;
  }

  function triggerJumpPad(pad, now) {
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(
      new THREE.Vector3(0, 1, 0), pad.yaw
    );
    chassisBody.applyImpulse(new CANNON.Vec3(
      forward.x * 38,
      72,
      forward.z * 38
    ));
    chassisBody.angularVelocity.x = THREE.MathUtils.clamp(chassisBody.angularVelocity.x + 3.8, -13, 13);
    chassisBody.angularVelocity.y = THREE.MathUtils.clamp(chassisBody.angularVelocity.y + 2.4, -13, 13);
    chassisBody.angularVelocity.z = THREE.MathUtils.clamp(chassisBody.angularVelocity.z - 4.4, -13, 13);
    chassisBody.wakeUp();
    pad.nextTriggerAt = now + 1800;
    createBounceWave(new THREE.Vector3(pad.x, chassisBody.position.y, pad.z), 0x42c5ff, 0.9);
  }

  function deployJumpPad() {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(localCar.root.quaternion).normalize();
    const position = new THREE.Vector3(chassisBody.position.x, 0, chassisBody.position.z)
      .addScaledVector(forward, 2.0);
    position.y = sampleGroundHeight(position.x, position.z);
    const event = {
      id: makeEventId(),
      type: "jump-pad",
      x: position.x,
      y: position.y,
      z: position.z,
      yaw: Math.atan2(-forward.x, -forward.z)
    };
    createJumpPad(event);
    game.multiplayer.sendSandboxEvent?.(event);
  }

  function activateBoost() {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(localCar.root.quaternion).normalize();
    chassisBody.applyImpulse(new CANNON.Vec3(forward.x * 46, 4.5, forward.z * 46));
    chassisBody.wakeUp();
    const position = new THREE.Vector3(chassisBody.position.x, chassisBody.position.y + 0.16, chassisBody.position.z)
      .addScaledVector(forward, 0.58);
    createBounceWave(position, 0x40baff, 0.42);
  }

  function activatePart(id) {
    if (!active || !inMap || !game.multiplayer?.joined) return false;
    if (!loadout.has(id)) {
      const part = PARTS.find((item) => item.id === id);
      game.showToast("Equip " + (part?.title || "that part") + " in the builder first");
      return false;
    }
    const now = performance.now();
    if (now < cooldowns[id]) return false;
    cooldowns[id] = now + (id === "spring" ? 2200 : id === "pad" ? 1700 : 950);
    if (id === "spring") activateSpringField();
    else if (id === "pad") deployJumpPad();
    else if (id === "boost") activateBoost();
    return true;
  }

  function receiveRemoteStuntEvent(peerId, event) {
    if (!active || typeof peerId !== "string" || !validStuntEvent(event)) return false;
    if (event.type === "jump-pad") return createJumpPad(event);
    if (!rememberEvent(event.id)) return false;
    if (inMap) {
      const position = new THREE.Vector3(event.x, event.y, event.z);
      applySpringImpulse(position);
      createBounceWave(position, 0xffad54, 1.15);
    }
    return true;
  }

  function update(delta) {
    const now = performance.now();
    if (active && inMap) {
      for (const pad of pads) {
        if (now < pad.nextTriggerAt) continue;
        const dx = chassisBody.position.x - pad.x;
        const dz = chassisBody.position.z - pad.z;
        if (Math.hypot(dx, dz) < 1.15 &&
            chassisBody.position.y < pad.group.position.y + 1.45) {
          triggerJumpPad(pad, now);
        }
      }
    }

    for (let i = pads.length - 1; i >= 0; i--) {
      const pad = pads[i];
      if (now - pad.createdAt > 40_000) {
        scene.remove(pad.group);
        dispose(pad.group);
        pads.splice(i, 1);
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
    if (!active || !inMap || !game.multiplayer?.joined) return false;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return false;
    const part = ({ q: "spring", e: "pad", f: "boost" })[key];
    if (!part) return false;
    event?.preventDefault?.();
    activatePart(part);
    return true;
  }

  document.querySelectorAll("[data-sandbox-part]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.sandboxPart;
      if (loadout.has(id)) loadout.delete(id);
      else loadout.add(id);
      applyLoadout(localCar, getLoadout());
      if (localAttachmentGroup) localAttachmentGroup.visible = active;
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
    handleKeyDown,
    receiveRemoteStuntEvent,
    getLoadout,
    applyRemoteLoadout: applyLoadout,
    updatePlayerCount,
    get active() { return active; },
    get inMap() { return inMap; }
  };
}
