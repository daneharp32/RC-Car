import { RoundedBoxGeometry } from "https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/geometries/RoundedBoxGeometry.js";

// Builds the detailed chassis, wheels, and the separately removable shell.
export function createCarVisualFactory({ THREE, CANNON, world, chassisBody, scene, VISUAL_CHASSIS_LENGTH_SCALE, vehicle, renderer, shellModel = null, rangerShellGeometry = null }) {
function makeCarVisual(color, playerName = "") {
  const root = new THREE.Group();
  const chassisGroup = new THREE.Group();
  const shellGroup = new THREE.Group();
  root.add(chassisGroup, shellGroup);

  // Fit axle-mounted components at the actual physics attachment points.
  // Keep the chassis at native proportions; the prerunner shell is pre-fitted
  // with one uniform scale before it reaches this visual factory.
  const frontAxleZ = vehicle.wheelInfos[0].chassisConnectionPointLocal.z;
  const rearAxleZ = vehicle.wheelInfos[2].chassisConnectionPointLocal.z;
  const chassisLengthScale = shellModel || rangerShellGeometry ? 1 : VISUAL_CHASSIS_LENGTH_SCALE;
  chassisGroup.scale.set(1, 1, chassisLengthScale);
  shellGroup.scale.set(1, 1, shellModel || rangerShellGeometry ? 1 : VISUAL_CHASSIS_LENGTH_SCALE);
  shellGroup.visible = true;

  const carbon = new THREE.MeshStandardMaterial({ color: 0x171e24, roughness: 0.78, metalness: 0.18 });
  const carbonEdge = new THREE.MeshStandardMaterial({ color: 0x303b43, roughness: 0.62, metalness: 0.24 });
  const alloy = new THREE.MeshStandardMaterial({ color: 0xaab5bb, roughness: 0.28, metalness: 0.82 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x39454d, roughness: 0.38, metalness: 0.72 });
  const blackPlastic = new THREE.MeshStandardMaterial({ color: 0x101519, roughness: 0.7 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x1766b6, roughness: 0.28, metalness: 0.52 });
  const blueDark = new THREE.MeshStandardMaterial({ color: 0x12395e, roughness: 0.42, metalness: 0.32 });
  const red = new THREE.MeshStandardMaterial({ color: 0xb93332, roughness: 0.35, metalness: 0.52 });
  const redBright = new THREE.MeshStandardMaterial({ color: 0xe04438, roughness: 0.34, metalness: 0.36 });
  const springSilver = new THREE.MeshStandardMaterial({ color: 0xe0e5e6, roughness: 0.24, metalness: 0.78 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x151719, roughness: 0.98 });
  const rubberSide = new THREE.MeshStandardMaterial({ color: 0x202528, roughness: 0.94 });
  const rimRed = new THREE.MeshStandardMaterial({ color: 0xb83236, roughness: 0.31, metalness: 0.67 });
  const rimSilver = new THREE.MeshStandardMaterial({ color: 0xd0d7da, roughness: 0.25, metalness: 0.8 });
  const wireRed = new THREE.MeshStandardMaterial({ color: 0xd9342c, roughness: 0.38, metalness: 0.16 });
  const wireBlack = new THREE.MeshStandardMaterial({ color: 0x171b20, roughness: 0.48, metalness: 0.12 });
  const wireBlue = new THREE.MeshStandardMaterial({ color: 0x168ad2, roughness: 0.42, metalness: 0.16 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xffbd58, emissive: 0x7d3100, emissiveIntensity: 0.18 });

  const damageParts = new Map();
  const frontSuspensionVisuals = [];
  let totalled = false;

  let chassisStyle = "standard";
  function isActiveDamageRecord(record) {
    if (record.chassisVariant && record.chassisVariant !== chassisStyle) return false;
    if (record.id === "uploaded-scx30-ranger-shell") {
      return shellStyle === "ranger" && shellGroup.visible && record.group.visible;
    }
    if (record.id === "prerunner-shell-visual") {
      return shellStyle === "prerunner" && shellGroup.visible && record.group.visible;
    }
    return true;
  }

  function getDamageProfile(id) {
    if (id === "main-chassis") return { health: 180, mass: 0.9, sensitivity: 0.34 };
    if (id.includes("shell-visual") || id.includes("ranger-shell")) return { health: 92, mass: 0.62, sensitivity: 1.22 };
    if (id.includes("bumper")) return { health: 76, mass: 0.24, sensitivity: 0.72 };
    if (id.endsWith("-wheel")) return { health: 54, mass: 0.27, sensitivity: 1.18 };
    if (id.includes("trailing-arm") || id === "rear-axle-housing") return { health: 58, mass: 0.18, sensitivity: 1.12 };
    if (id.includes("upper-link") || id.includes("limit-strap")) return { health: 40, mass: 0.065, sensitivity: 1.26 };
    if (id.includes("live-shock")) return { health: 48, mass: 0.11, sensitivity: 1.12 };
    if (id.includes("lower-arm") || id.includes("wheel-carrier")) return { health: 48, mass: 0.13, sensitivity: 1.18 };
    if (id.includes("camber-link")) return { health: 36, mass: 0.055, sensitivity: 1.38 };
    if (id.includes("oil-shock")) return { health: 44, mass: 0.10, sensitivity: 1.12 };
    if (id.includes("shock-tower")) return { health: 62, mass: 0.15, sensitivity: 0.98 };
    if (id === "steering-servo") return { health: 58, mass: 0.10, sensitivity: 1.05 };
    if (id === "lipo-battery") return { health: 66, mass: 0.24, sensitivity: 1.10 };
    if (id === "brushless-motor" || id === "electronic-speed-controller") return { health: 62, mass: 0.16, sensitivity: 1.08 };
    if (id.includes("wiring")) return { health: 38, mass: 0.035, sensitivity: 1.45 };
    if (id.includes("differential") || id.includes("driveshaft") || id.includes("gears")) return { health: 64, mass: 0.16, sensitivity: 1.05 };
    return { health: 60, mass: 0.09, sensitivity: 1.0 };
  }

  function makePart(parent, id, label, description, chassisVariant = null) {
    const group = new THREE.Group();
    group.name = id;
    group.userData.partInfo = { id, label, description };
    group.userData.damagePartId = id;
    if (chassisVariant) group.userData.chassisVariant = chassisVariant;
    if (chassisVariant === "live-axle") group.visible = false;
    parent.add(group);
    const profile = getDamageProfile(id);
    damageParts.set(id, {
      id,
      label,
      description,
      chassisVariant,
      group,
      maxHealth: profile.health,
      health: profile.health,
      mass: profile.mass,
      sensitivity: profile.sensitivity,
      detached: false,
      debrisBody: null,
      debrisAge: 0,
      debrisExpired: false,
      originalParent: null,
      originalPosition: null,
      originalQuaternion: null,
      originalScale: null,
      originalVisible: true
    });
    return group;
  }

  function addMesh(parent, geometry, material, position = [0, 0, 0], rotation = null) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...position);
    if (rotation) object.rotation.set(...rotation);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  function roundedBox(parent, size, material, position, rotation = null, requestedBevel = null) {
    const smallest = Math.min(...size);
    const bevel = Math.min(requestedBevel ?? 0.025, smallest * 0.22);
    return addMesh(
      parent,
      new RoundedBoxGeometry(size[0], size[1], size[2], 4, Math.max(0.001, bevel)),
      material,
      position,
      rotation
    );
  }

  function cylinderBetween(parent, start, end, radius, material, radialSegments = 14, endRadius = radius) {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const direction = b.clone().sub(a);
    const length = Math.max(0.001, direction.length());
    const object = addMesh(
      parent,
      new THREE.CylinderGeometry(endRadius, radius, length, radialSegments, 1, false),
      material,
      a.clone().add(b).multiplyScalar(0.5).toArray()
    );
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    object.userData.segmentRestLength = length;
    return object;
  }

  function updateCylinderBetween(object, start, end) {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const direction = b.clone().sub(a);
    const length = Math.max(0.001, direction.length());
    object.position.copy(a).add(b).multiplyScalar(0.5);
    object.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize()
    );
    object.scale.y = length / Math.max(0.001, object.userData.segmentRestLength || length);
  }

  function addBolt(parent, x, y, z, radius = 0.008, material = alloy) {
    const washer = addMesh(
      parent,
      new THREE.CylinderGeometry(radius * 1.55, radius * 1.55, 0.004, 12),
      darkMetal,
      [x, y - 0.002, z]
    );
    const head = addMesh(
      parent,
      new THREE.CylinderGeometry(radius, radius, 0.009, 6),
      material,
      [x, y + 0.004, z]
    );
    return [washer, head];
  }

  function addWire(parent, points, radius, material) {
    const curve = new THREE.CatmullRomCurve3(
      points.map((point) => new THREE.Vector3(point[0], point[1], point[2]))
    );
    return addMesh(parent, new THREE.TubeGeometry(curve, 28, radius, 7, false), material);
  }

  function addCoil(parent, start, end, coilRadius, turns, material) {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const axis = b.clone().sub(a).normalize();
    const reference = Math.abs(axis.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    const u = axis.clone().cross(reference).normalize();
    const v = axis.clone().cross(u).normalize();
    const points = [];
    const steps = Math.max(72, Math.ceil(turns * 18));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * turns * Math.PI * 2;
      const point = a.clone().lerp(b, t);
      point.addScaledVector(u, Math.cos(angle) * coilRadius);
      point.addScaledVector(v, Math.sin(angle) * coilRadius);
      points.push(point);
    }
    const curve = new THREE.CatmullRomCurve3(points);
    return addMesh(parent, new THREE.TubeGeometry(curve, steps, 0.0055, 7, false), material);
  }

  function addShock(parent, id, label, description, top, bottom, springMaterial, chassisVariant = null) {
    const group = makePart(parent, id, label, description, chassisVariant);
    const a = new THREE.Vector3(...top);
    const b = new THREE.Vector3(...bottom);
    const axis = b.clone().sub(a).normalize();
    const housingStart = a.clone().lerp(b, 0.20);
    const housingEnd = a.clone().lerp(b, 0.76);
    const shaftStart = a.clone().lerp(b, 0.58);
    const shaftEnd = b.clone().lerp(a, 0.06);

    cylinderBetween(group, housingStart.toArray(), housingEnd.toArray(), 0.022, blueDark, 16, 0.020);
    cylinderBetween(group, housingStart.clone().addScaledVector(axis, 0.02).toArray(),
      housingStart.clone().addScaledVector(axis, 0.055).toArray(), 0.029, red, 14);
    cylinderBetween(group, housingEnd.clone().addScaledVector(axis, -0.018).toArray(),
      housingEnd.clone().addScaledVector(axis, -0.052).toArray(), 0.025, darkMetal, 14);
    cylinderBetween(group, shaftStart.toArray(), shaftEnd.toArray(), 0.008, alloy, 12, 0.007);
    cylinderBetween(group, a.clone().addScaledVector(axis, 0.015).toArray(),
      a.clone().addScaledVector(axis, 0.055).toArray(), 0.025, blackPlastic, 12);
    cylinderBetween(group, b.clone().addScaledVector(axis, -0.045).toArray(),
      b.clone().addScaledVector(axis, -0.008).toArray(), 0.024, redBright, 12);
    addCoil(
      group,
      a.clone().lerp(b, 0.27).toArray(),
      a.clone().lerp(b, 0.72).toArray(),
      0.031,
      6.2,
      springMaterial
    );
    const eyeTop = addMesh(group, new THREE.SphereGeometry(0.028, 12, 10), carbonEdge, a.toArray());
    const eyeBottom = addMesh(group, new THREE.SphereGeometry(0.027, 12, 10), carbonEdge, b.toArray());
    eyeTop.scale.set(1.0, 1.0, 0.72);
    eyeBottom.scale.set(1.0, 1.0, 0.72);
    return group;
  }

  function makeDynamicFrontShock(id, label, description) {
    const group = makePart(chassisGroup, id, label, description);
    addMesh(group, new THREE.CylinderGeometry(0.024, 0.027, 0.43, 16), blueDark);
    addMesh(group, new THREE.CylinderGeometry(0.008, 0.008, 0.39, 12), alloy, [0, -0.13, 0]);
    for (let i = 0; i < 8; i++) {
      const spring = addMesh(group, new THREE.TorusGeometry(0.034, 0.0047, 8, 22), springSilver,
        [0, -0.235 + i * 0.066, 0]);
      spring.rotation.x = Math.PI / 2;
    }
    for (const y of [-0.20, 0.20]) {
      const seat = addMesh(group, new THREE.TorusGeometry(0.039, 0.006, 8, 22), alloy, [0, y, 0]);
      seat.rotation.x = Math.PI / 2;
    }
    addMesh(group, new THREE.CylinderGeometry(0.032, 0.032, 0.035, 16), red, [0, -0.12, 0]);
    addMesh(group, new THREE.SphereGeometry(0.028, 12, 10), carbonEdge, [0, -0.30, 0]);
    addMesh(group, new THREE.SphereGeometry(0.028, 12, 10), red, [0, 0.30, 0]);
    return group;
  }
  function updateDynamicFrontShock(group, start, end) {
    const direction = end.clone().sub(start);
    const length = Math.max(0.001, direction.length());
    group.position.copy(start).add(end).multiplyScalar(0.5);
    group.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize()
    );
    group.scale.set(1, length / 0.62, 1);
  }

  // Main molded tub / aluminum lower chassis plate. All other components are
  // mounted as individual named groups on top of this part.
  const chassis = makePart(
    chassisGroup,
    "main-chassis",
    "Main chassis plate",
    "The long structural tub that holds the drivetrain, battery, steering gear and electronics. The dark composite finish and raised side rails protect the components."
  );
  roundedBox(chassis, [0.49, 0.068, 1.04], carbon, [0, -0.045, 0], null, 0.035);
  roundedBox(chassis, [0.405, 0.015, 0.88], carbonEdge, [0, -0.005, 0.015], null, 0.014);
  roundedBox(chassis, [0.026, 0.035, 1.00], blackPlastic, [-0.218, 0.012, 0], null, 0.009);
  roundedBox(chassis, [0.026, 0.035, 1.00], blackPlastic, [0.218, 0.012, 0], null, 0.009);
  for (const x of [-0.16, 0.16]) {
    roundedBox(chassis, [0.018, 0.013, 0.76], alloy, [x, 0.008, 0.005], null, 0.005);
  }
  for (const z of [frontAxleZ * 0.92, frontAxleZ * 0.72, -0.19, 0.19, rearAxleZ * 0.72, rearAxleZ * 0.92]) {
    for (const x of [-0.17, 0.17]) addBolt(chassis, x, 0.026, z, 0.0065);
  }
  for (let i = 0; i < 7; i++) {
    roundedBox(chassis, [0.018, 0.012, 0.085], blackPlastic, [-0.105 + i * 0.035, 0.012, -0.32], null, 0.004);
    roundedBox(chassis, [0.018, 0.012, 0.085], blackPlastic, [-0.105 + i * 0.035, 0.012, 0.32], null, 0.004);
  }

  // Front and rear bulkheads / differential cases.
  for (const end of [
    { z: frontAxleZ, id: "front-differential", label: "Front differential housing", desc: "Sealed front gearcase transfers drive to the left and right front half-shafts." },
    { z: rearAxleZ, id: "rear-differential", label: "Rear differential housing", desc: "Rear gearcase distributes motor power to the rear half-shafts." }
  ]) {
    const diff = makePart(
      chassisGroup,
      end.id,
      end.label,
      end.desc,
      end.id === "rear-differential" ? "standard" : null
    );
    roundedBox(diff, [0.31, 0.115, 0.16], darkMetal, [0, 0.018, end.z], null, 0.035);
    roundedBox(diff, [0.19, 0.035, 0.17], carbonEdge, [0, 0.079, end.z], null, 0.018);
    addMesh(diff, new THREE.SphereGeometry(0.074, 20, 14), alloy, [0, 0.04, end.z]).scale.set(1.0, 0.62, 1.0);
    for (const side of [-1, 1]) {
      cylinderBetween(diff, [side * 0.12, 0.018, end.z], [side * 0.30, -0.005, end.z], 0.014, alloy, 12);
    }
    for (const x of [-0.12, 0.12]) addBolt(diff, x, 0.095, end.z, 0.006);
  }

  // Central longitudinal driveshaft with separate couplers and a center support.
  const driveshaft = makePart(
    chassisGroup,
    "center-driveshaft",
    "Center driveshaft",
    "The rotating shaft links the front and rear gearboxes. The silver shaft and dark couplers are visible along the center tunnel."
  );
  cylinderBetween(driveshaft, [0, 0.095, frontAxleZ * 0.72], [0, 0.095, rearAxleZ * 0.72], 0.014, alloy, 16);
  for (const z of [frontAxleZ * 0.65, rearAxleZ * 0.65]) {
    cylinderBetween(driveshaft, [0, 0.095, z - 0.018], [0, 0.095, z + 0.018], 0.027, darkMetal, 14);
    addMesh(driveshaft, new THREE.SphereGeometry(0.027, 12, 10), alloy, [0, 0.095, z]);
  }
  roundedBox(driveshaft, [0.075, 0.025, 0.11], blackPlastic, [0, 0.047, 0], null, 0.01);

  // Independent suspension arms, camber links and steering knuckles.
  for (const corner of [
    { side: -1, z: frontAxleZ, name: "Front-left" },
    { side: 1, z: frontAxleZ, name: "Front-right" },
    { side: -1, z: rearAxleZ, name: "Rear-left" },
    { side: 1, z: rearAxleZ, name: "Rear-right" }
  ]) {
    const isFront = corner.z < 0;
    const arm = makePart(
      chassisGroup,
      `${corner.name.toLowerCase().replace(" ", "-")}-lower-arm`,
      `${corner.name} lower suspension arm`,
      "Molded reinforced A-arm connects the chassis hinge pins to the wheel carrier and lets the wheel move vertically with the suspension.",
      isFront ? null : "standard"
    );
    const s = corner.side;
    const z = corner.z;
    const innerFront = [s * 0.075, -0.055, z - (isFront ? -0.075 : 0.075)];
    const innerRear = [s * 0.075, -0.055, z + (isFront ? -0.075 : 0.075)];
    const outer = [s * 0.292, -0.038, z];
    const lowerFrontRod = cylinderBetween(arm, innerFront, outer, 0.023, carbonEdge, 12, 0.018);
    const lowerRearRod = cylinderBetween(arm, innerRear, outer, 0.023, carbonEdge, 12, 0.018);
    cylinderBetween(arm, innerFront, innerRear, 0.018, blackPlastic, 10);
    const outerJoint = addMesh(arm, new THREE.SphereGeometry(0.025, 12, 10), alloy, outer);
    if (isFront) {
      frontSuspensionVisuals.push({
        side: s, z, innerFront, innerRear,
        lowerFrontRod, lowerRearRod, outerJoint,
        carrier: null, upperRod: null
      });
    }

    const upper = makePart(
      chassisGroup,
      `${corner.name.toLowerCase().replace(" ", "-")}-camber-link`,
      `${corner.name} upper camber link`,
      "Adjustable upper link controls wheel camber and keeps the upright aligned as the suspension travels.",
      isFront ? null : "standard"
    );
    const upperRodStart = [s * 0.10, 0.17, z + (isFront ? 0.025 : -0.025)];
    const upperRod = cylinderBetween(upper, upperRodStart,
      [s * 0.29, 0.13, z], 0.011, alloy, 10, 0.009);
    addMesh(upper, new THREE.SphereGeometry(0.015, 12, 10), red, upperRodStart);
    if (isFront) {
      const visual = frontSuspensionVisuals.find((item) => item.side === s);
      if (visual) { visual.upperRod = upperRod; visual.upperRodStart = upperRodStart; }
    }

    const carrier = makePart(
      chassisGroup,
      `${corner.name.toLowerCase().replace(" ", "-")}-wheel-carrier`,
      `${corner.name} wheel carrier / hub`,
      "The upright holds the axle bearings and connects the steering or rear toe links to the suspension arms.",
      isFront ? null : "standard"
    );
    roundedBox(carrier, [0.075, 0.13, 0.085], blackPlastic, [s * 0.295, 0.005, z], null, 0.018);
    cylinderBetween(carrier, [s * 0.25, 0.005, z], [s * 0.35, 0.005, z], 0.031, alloy, 16);
    cylinderBetween(carrier, [s * 0.335, 0.005, z], [s * 0.355, 0.005, z], 0.022, red, 12);
    addBolt(carrier, s * 0.30, 0.075, z, 0.007);
    if (isFront) {
      const visual = frontSuspensionVisuals.find((item) => item.side === s);
      if (visual) visual.carrier = carrier;
    }
  }

  // Front and rear shock towers. Holes and braces make the plates read as
  // structural towers rather than generic dark blocks.
  for (const end of [
    { z: frontAxleZ, id: "front-shock-tower", label: "Front shock tower" },
    { z: rearAxleZ, id: "rear-shock-tower", label: "Rear shock tower" }
  ]) {
    const tower = makePart(
      chassisGroup,
      end.id,
      end.label,
      "Reinforced vertical plate that anchors the upper shock eyes and suspension bracing.",
      end.id === "rear-shock-tower" ? "standard" : null
    );
    // Shorter tower plates keep the top mounts lower without changing any
    // wheel, arm, or physics attachment coordinates.
    roundedBox(tower, [0.47, 0.145, 0.032], carbonEdge, [0, 0.13, end.z], null, 0.012);
    roundedBox(tower, [0.30, 0.035, 0.045], blackPlastic, [0, 0.201, end.z], null, 0.010);
    for (const x of [-0.19, -0.11, 0, 0.11, 0.19]) {
      const hole = addMesh(tower, new THREE.CylinderGeometry(0.012, 0.012, 0.007, 12), blackPlastic,
        [x, 0.145, end.z + (end.z < 0 ? -0.02 : 0.02)], [Math.PI / 2, 0, 0]);
      hole.castShadow = false;
      addBolt(tower, x, 0.211, end.z, 0.0055);
    }
    for (const side of [-1, 1]) {
      cylinderBetween(tower, [side * 0.17, 0.07, end.z], [side * 0.21, 0.201, end.z], 0.012, alloy, 10);
    }
  }

  // Four individually selectable oil-filled coil-over dampers.
  for (const corner of [
    { side: -1, z: frontAxleZ, label: "Front-left" },
    { side: 1, z: frontAxleZ, label: "Front-right" },
    { side: -1, z: rearAxleZ, label: "Rear-left" },
    { side: 1, z: rearAxleZ, label: "Rear-right" }
  ]) {
    const s = corner.side;
    const z = corner.z;
    // The visible damper is shortened to meet the new tower height. Its
    // lower eye stays in the same visual position; physics shocks are separate.
    const top = [s * 0.19, 0.195, z + (z < 0 ? 0.045 : -0.045)];
    const bottom = [s * 0.272, -0.012, z];
    const shockId = `${corner.label.toLowerCase().replace(" ", "-")}-oil-shock`;
    const shockDescription = "Aluminum-bodied coil-over damper. The spring supports the truck while the oil-filled shock controls compression and rebound.";
    if (corner.z < 0) {
      const visual = frontSuspensionVisuals.find((item) => item.side === s);
      if (visual) {
        visual.shock = makeDynamicFrontShock(shockId, `${corner.label} independent coil-over`, shockDescription);
      }
    } else {
      addShock(chassisGroup, shockId, `${corner.label} oil-filled shock`,
        shockDescription, top, bottom, springSilver, "standard");
    }
  }

  // Steering servo, servo saver, rack and two front steering links.
  const frontSteeringZ = frontAxleZ + 0.14;
  const steering = makePart(
    chassisGroup,
    "steering-servo",
    "Water-resistant steering servo",
    "Compact high-torque servo turns the front wheels through the servo horn, steering rack and adjustable tie rods."
  );
  roundedBox(steering, [0.15, 0.072, 0.105], blue, [-0.105, 0.105, frontSteeringZ], null, 0.016);
  roundedBox(steering, [0.12, 0.012, 0.08], blueDark, [-0.105, 0.146, frontSteeringZ], null, 0.009);
  for (const x of [-0.16, -0.05]) {
    roundedBox(steering, [0.025, 0.012, 0.05], alloy, [x, 0.065, frontSteeringZ], null, 0.004);
  }
  cylinderBetween(steering, [-0.105, 0.15, frontSteeringZ], [-0.105, 0.188, frontSteeringZ], 0.013, alloy, 12);
  const servoHorn = addMesh(steering, new THREE.SphereGeometry(0.026, 12, 10), red, [-0.105, 0.19, frontSteeringZ]);
  servoHorn.scale.set(1.35, 0.5, 1.0);
  roundedBox(steering, [0.31, 0.025, 0.035], darkMetal, [0.025, 0.075, frontSteeringZ - 0.06], null, 0.009);
  for (const side of [-1, 1]) {
    cylinderBetween(steering, [0.02, 0.095, frontSteeringZ - 0.06], [side * 0.29, 0.045, frontAxleZ], 0.009, alloy, 10);
    addBolt(steering, side * 0.29, 0.07, frontAxleZ, 0.006);
  }

  // Battery tray, strapped LiPo pack and high-current connector.
  const battery = makePart(
    chassisGroup,
    "lipo-battery",
    "LiPo battery pack and hold-down straps",
    "Longitudinal battery pack sits low in the tub to keep the center of gravity down. Two cross-straps secure it to the tray."
  );
  roundedBox(battery, [0.165, 0.085, 0.405], blueDark, [-0.105, 0.105, -0.005], null, 0.019);
  roundedBox(battery, [0.15, 0.016, 0.36], blue, [-0.105, 0.153, -0.005], null, 0.009);
  for (let i = 0; i < 3; i++) {
    roundedBox(battery, [0.135, 0.008, 0.105], carbonEdge, [-0.105, 0.163, -0.125 + i * 0.12], null, 0.006);
  }
  for (const z of [-0.13, 0.12]) {
    roundedBox(battery, [0.205, 0.018, 0.025], blackPlastic, [-0.105, 0.179, z], null, 0.006);
    roundedBox(battery, [0.07, 0.012, 0.03], alloy, [-0.105, 0.19, z], null, 0.004);
  }
  roundedBox(battery, [0.055, 0.032, 0.045], red, [-0.105, 0.12, -0.225], null, 0.008);
  roundedBox(battery, [0.035, 0.025, 0.025], amber, [-0.105, 0.12, -0.25], null, 0.005);
  // Lower the complete battery assembly so its straps sit below the bed edge.
  battery.position.y = -0.045;

  // Brushless motor with anodized can, cooling fins, end bell and fan detail.
  const motor = makePart(
    chassisGroup,
    "brushless-motor",
    "Brushless electric motor",
    "Blue anodized brushless motor can with cooling ribs, end bell and shaft. It drives the center transmission through the pinion and spur gear."
  );
  cylinderBetween(motor, [0.015, 0.145, 0.205], [0.205, 0.145, 0.205], 0.055, blue, 28);
  for (let i = 0; i < 7; i++) {
    const x = 0.035 + i * 0.023;
    const fin = new THREE.Mesh(new THREE.TorusGeometry(0.053, 0.0045, 7, 28), alloy);
    fin.rotation.y = Math.PI / 2;
    fin.position.set(x, 0.145, 0.205);
    fin.castShadow = true;
    motor.add(fin);
  }
  cylinderBetween(motor, [0.202, 0.145, 0.205], [0.218, 0.145, 0.205], 0.045, darkMetal, 24);
  cylinderBetween(motor, [0.218, 0.145, 0.205], [0.229, 0.145, 0.205], 0.014, alloy, 16);
  const fan = addMesh(motor, new THREE.TorusGeometry(0.032, 0.004, 7, 24), redBright, [0.221, 0.145, 0.205]);
  fan.rotation.y = Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    cylinderBetween(
      motor,
      [0.222, 0.145, 0.205],
      [0.222, 0.145 + Math.cos(angle) * 0.027, 0.205 + Math.sin(angle) * 0.027],
      0.0035,
      alloy,
      7
    );
  }
  for (const y of [0.11, 0.18]) {
    cylinderBetween(motor, [0.045, y, 0.205], [0.175, y, 0.205], 0.003, darkMetal, 7);
  }
  // Translate the complete motor, preserving its shape and its relationship
  // to its cooling fins and end bell while lowering it into the chassis.
  motor.position.y = -0.055;

  // Motor gear mesh: exposed spur gear, pinion and protective side guard.
  const gearing = makePart(
    chassisGroup,
    "spur-pinion-gears",
    "Spur gear, pinion and gear guard",
    "The small pinion on the motor shaft drives the larger spur gear, transferring motor rotation into the drivetrain. The guard helps keep debris away from the gear mesh."
  );
  const spurX = 0.055, spurZ = 0.125, gearY = 0.073;
  addMesh(gearing, new THREE.CylinderGeometry(0.067, 0.067, 0.018, 36), alloy, [spurX, gearY, spurZ]);
  addMesh(gearing, new THREE.TorusGeometry(0.058, 0.006, 7, 36), red, [spurX, gearY + 0.012, spurZ]);
  for (let i = 0; i < 24; i++) {
    const angle = i * Math.PI * 2 / 24;
    roundedBox(gearing, [0.015, 0.012, 0.014], alloy,
      [spurX + Math.cos(angle) * 0.069, gearY, spurZ + Math.sin(angle) * 0.069],
      [0, -angle, 0], 0.003);
  }
  addMesh(gearing, new THREE.CylinderGeometry(0.027, 0.027, 0.025, 20), darkMetal,
    [0.178, gearY, 0.205]);
  roundedBox(gearing, [0.11, 0.026, 0.09], blackPlastic, [0.14, 0.045, 0.16], null, 0.012);

  // Electronic speed controller with a finned heat sink and power switch.
  const esc = makePart(
    chassisGroup,
    "electronic-speed-controller",
    "Electronic speed controller (ESC)",
    "The ESC regulates power from the LiPo battery to the brushless motor. Its heat sink helps dissipate heat during acceleration."
  );
  roundedBox(esc, [0.145, 0.068, 0.17], blackPlastic, [0.13, 0.105, -0.075], null, 0.016);
  roundedBox(esc, [0.125, 0.014, 0.135], darkMetal, [0.13, 0.146, -0.075], null, 0.007);
  for (let i = 0; i < 7; i++) {
    roundedBox(esc, [0.012, 0.018, 0.115], alloy, [0.075 + i * 0.018, 0.163, -0.075], null, 0.004);
  }
  roundedBox(esc, [0.035, 0.018, 0.045], red, [0.13, 0.164, -0.15], null, 0.006);
  addBolt(esc, 0.075, 0.18, -0.14, 0.0045);

  // Sealed receiver box and upright antenna tube.
  const receiver = makePart(
    chassisGroup,
    "radio-receiver",
    "Radio receiver and antenna",
    "The receiver gets steering and throttle commands from the transmitter and passes them to the servo and ESC. The antenna tube keeps the antenna wire upright and clear."
  );
  roundedBox(receiver, [0.14, 0.065, 0.115], blackPlastic, [-0.12, 0.11, 0.30], null, 0.016);
  roundedBox(receiver, [0.12, 0.012, 0.095], carbonEdge, [-0.12, 0.149, 0.30], null, 0.008);
  for (let i = 0; i < 3; i++) {
    roundedBox(receiver, [0.012, 0.008, 0.035], red, [-0.16 + i * 0.035, 0.158, 0.30], null, 0.003);
  }
  cylinderBetween(receiver, [-0.12, 0.15, 0.30], [-0.12, 0.39, 0.30], 0.006, blue, 8, 0.004);

  // Separate selectable wire looms, routed above the chassis so they remain
  // visible instead of disappearing inside the body shell.
  const powerWiring = makePart(
    chassisGroup,
    "power-wiring",
    "Battery and motor power leads",
    "Thick red and black silicone leads connect the battery, ESC and brushless motor. The looped routing leaves room for suspension movement."
  );
  addWire(powerWiring, [
    [-0.105, 0.14, -0.22], [-0.03, 0.22, -0.20],
    [0.11, 0.22, -0.13], [0.15, 0.19, -0.09]
  ], 0.006, wireRed);
  addWire(powerWiring, [
    [-0.105, 0.125, -0.22], [-0.02, 0.18, -0.18],
    [0.11, 0.18, -0.13], [0.16, 0.17, -0.08]
  ], 0.0055, wireBlack);
  addWire(powerWiring, [
    [0.15, 0.145, -0.015], [0.22, 0.19, 0.02],
    [0.225, 0.20, 0.12], [0.19, 0.20, 0.19]
  ], 0.0055, wireRed);
  addWire(powerWiring, [
    [0.135, 0.13, -0.015], [0.20, 0.17, 0.03],
    [0.205, 0.18, 0.12], [0.18, 0.18, 0.19]
  ], 0.005, wireBlack);
  // Lower both power leads as one routed assembly, keeping their curves intact.
  powerWiring.position.y = -0.045;

  const signalWiring = makePart(
    chassisGroup,
    "receiver-servo-wiring",
    "Receiver and servo signal wires",
    "Thin three-wire servo leads carry the steering and throttle signals between the receiver, steering servo and ESC."
  );
  addWire(signalWiring, [
    [-0.12, 0.16, 0.26], [-0.17, 0.20, 0.16],
    [-0.17, 0.19, -0.05], [-0.12, 0.17, -0.24]
  ], 0.0035, wireBlue);
  addWire(signalWiring, [
    [-0.105, 0.17, 0.25], [-0.08, 0.20, 0.12],
    [0.02, 0.19, 0.00], [0.13, 0.18, -0.05]
  ], 0.0035, wireRed);
  // Tuck the signal-wire runs slightly lower without altering their routing.
  signalWiring.position.y = -0.035;

  // Front / rear bumpers and body posts remain exposed with the shell removed.
  const frontBumper = makePart(
    chassisGroup,
    "front-bumper",
    "Front impact bumper",
    "Flexible front bumper and two mounting braces protect the nose of the chassis during light bumps."
  );
  const frontBumperZ = frontAxleZ - 0.25;
  // Narrower, shorter bumper pieces are modeled at their final dimensions.
  roundedBox(frontBumper, [0.54, 0.075, 0.055], blackPlastic, [0, -0.005, frontBumperZ], null, 0.018);
  roundedBox(frontBumper, [0.40, 0.038, 0.040], carbonEdge, [0, 0.032, frontBumperZ + 0.012], null, 0.010);
  for (const side of [-1, 1]) {
    cylinderBetween(frontBumper, [side * 0.12, -0.03, frontAxleZ - 0.08],
      [side * 0.20, -0.02, frontBumperZ + 0.02], 0.014, alloy, 10);
  }

  const rearStructure = makePart(
    chassisGroup,
    "rear-bumper",
    "Rear impact bumper",
    "Compact rear impact bumper with two reinforced mounting braces tied into the rear chassis rails."
  );
  const rearBumperZ = rearAxleZ + 0.31;
  roundedBox(rearStructure, [0.54, 0.065, 0.055], blackPlastic, [0, -0.005, rearBumperZ], null, 0.018);
  // Two angled mounts visibly tie the rear bumper back into the chassis rails.
  for (const side of [-1, 1]) {
    roundedBox(rearStructure, [0.075, 0.055, 0.060], darkMetal,
      [side * 0.19, -0.005, rearBumperZ - 0.018], null, 0.010);
    cylinderBetween(
      rearStructure,
      [side * 0.18, -0.01, rearAxleZ + 0.02],
      [side * 0.19, -0.005, rearBumperZ - 0.045],
      0.014,
      carbonEdge,
      12
    );
    addBolt(rearStructure, side * 0.19, 0.025, rearBumperZ - 0.018, 0.0055);
  }

  const bodyPosts = makePart(
    chassisGroup,
    "body-mount-posts",
    "Front and rear body-mount posts",
    "Adjustable vertical posts support the removable polycarbonate shell. They remain visible even with the shell removed."
  );
  for (const z of [frontAxleZ, rearAxleZ]) {
    for (const side of [-1, 1]) {
      cylinderBetween(bodyPosts, [side * 0.17, -0.01, z], [side * 0.17, 0.26, z], 0.012, blackPlastic, 10);
      cylinderBetween(bodyPosts, [side * 0.17, 0.20, z], [side * 0.17, 0.235, z], 0.017, red, 10);
    }
  }

  // Four independent tire / rim assemblies. Wheel pivots are still returned
  // in the same order and kept at the same suspension coordinates.
  const wheelPivots = [];
  const wheelLabels = [
    ["front-left-wheel", "Front-left tire and wheel"],
    ["front-right-wheel", "Front-right tire and wheel"],
    ["rear-left-wheel", "Rear-left tire and wheel"],
    ["rear-right-wheel", "Rear-right tire and wheel"]
  ];
  const wheelInfo = vehicle.wheelInfos.map((wheel, index) => ({
    x: wheel.chassisConnectionPointLocal.x,
    y: wheel.chassisConnectionPointLocal.y,
    z: wheel.chassisConnectionPointLocal.z,
    id: wheelLabels[index][0],
    label: wheelLabels[index][1]
  }));
  for (const info of wheelInfo) {
    const pivot = makePart(
      root,
      info.id,
      info.label,
      "Deep-tread all-terrain tire mounted on a red beadlock-style wheel with a silver multi-spoke center and metal hub hardware."
    );
    pivot.position.set(info.x, info.y, info.z);
    const tireRadius = 0.158;
    const tireWidth = 0.132;

    const tire = addMesh(
      pivot,
      new THREE.CylinderGeometry(tireRadius, tireRadius, tireWidth, 44, 1, false),
      rubber
    );
    tire.rotation.z = Math.PI / 2;

    const tread = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.039, 0.026, 0.031),
      rubber,
      96
    );
    const treadDummy = new THREE.Object3D();
    let treadIndex = 0;
    for (let n = 0; n < 32; n++) {
      const angle = (n / 32) * Math.PI * 2;
      for (const lane of [-0.043, 0, 0.043]) {
        treadDummy.position.set(
          lane,
          Math.cos(angle) * (tireRadius + 0.006),
          Math.sin(angle) * (tireRadius + 0.006)
        );
        treadDummy.rotation.set(-angle, 0, lane * 1.8);
        treadDummy.updateMatrix();
        tread.setMatrixAt(treadIndex++, treadDummy.matrix);
      }
    }
    tread.instanceMatrix.needsUpdate = true;
    tread.castShadow = true;
    tread.receiveShadow = true;
    pivot.add(tread);

    for (const side of [-1, 1]) {
      const faceX = side * (tireWidth * 0.5 + 0.002);
      const sidewall = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.006, 8, 44), rubberSide);
      sidewall.rotation.y = Math.PI / 2;
      sidewall.position.x = faceX;
      sidewall.castShadow = true;
      pivot.add(sidewall);

      const rimFace = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.098, 0.026, 36), rimRed);
      rimFace.rotation.z = Math.PI / 2;
      rimFace.position.x = side * 0.057;
      rimFace.castShadow = true;
      pivot.add(rimFace);

      const innerFace = new THREE.Mesh(new THREE.CylinderGeometry(0.076, 0.076, 0.012, 32), rimSilver);
      innerFace.rotation.z = Math.PI / 2;
      innerFace.position.x = side * 0.073;
      innerFace.castShadow = true;
      pivot.add(innerFace);

      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.101, 0.007, 8, 44), rimSilver);
      ring.rotation.y = Math.PI / 2;
      ring.position.x = side * 0.075;
      ring.castShadow = true;
      pivot.add(ring);

      for (let spoke = 0; spoke < 6; spoke++) {
        const angle = spoke * Math.PI / 3;
        cylinderBetween(
          pivot,
          [side * 0.078, Math.cos(angle) * 0.019, Math.sin(angle) * 0.019],
          [side * 0.078, Math.cos(angle) * 0.073, Math.sin(angle) * 0.073],
          0.007,
          rimSilver,
          8,
          0.005
        );
      }

      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.032, 24), darkMetal);
      hub.rotation.z = Math.PI / 2;
      hub.position.x = side * 0.087;
      hub.castShadow = true;
      pivot.add(hub);
      const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.034, 20), alloy);
      hubCap.rotation.z = Math.PI / 2;
      hubCap.position.x = side * 0.091;
      hubCap.castShadow = true;
      pivot.add(hubCap);

      for (let bolt = 0; bolt < 6; bolt++) {
        const angle = bolt * Math.PI / 3;
        const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.012, 8), alloy);
        nut.rotation.z = Math.PI / 2;
        nut.position.set(side * 0.093, Math.cos(angle) * 0.061, Math.sin(angle) * 0.061);
        pivot.add(nut);
      }
    }
    wheelPivots.push(pivot);
  }


  // Alternate desert live-axle hardware. The axle beam and wheels follow a
  // separate physics body; link bars, coil-overs and droop straps are updated
  // from that body's pose every frame instead of being static decoration.
  const liveAxleAssembly = new THREE.Group();
  liveAxleAssembly.name = "articulated-solid-rear-axle";
  liveAxleAssembly.visible = false;
  chassisGroup.add(liveAxleAssembly);
  const axleHousing = makePart(
    liveAxleAssembly,
    "rear-axle-housing",
    "Solid rear axle housing",
    "One continuous live axle connects both rear hubs. The differential pumpkin, axle tubes and hub ends move together as a single unsprung assembly.",
    "live-axle"
  );
  // One continuous axle tube with stepped ends, bearing carriers and a
  // clearly visible differential pumpkin / rear-facing inspection cover.
  cylinderBetween(axleHousing, [-0.39, 0, 0], [0.39, 0, 0], 0.034, darkMetal, 24);
  for (const side of [-1, 1]) {
    cylinderBetween(axleHousing, [side * 0.22, 0, 0], [side * 0.405, 0, 0], 0.050, blackPlastic, 20);
    cylinderBetween(axleHousing, [side * 0.365, 0, 0], [side * 0.435, 0, 0], 0.061, alloy, 20);
    cylinderBetween(axleHousing, [side * 0.405, 0, 0], [side * 0.455, 0, 0], 0.042, darkMetal, 18);
    const hubFlange = addMesh(
      axleHousing,
      new THREE.CylinderGeometry(0.073, 0.073, 0.026, 24),
      alloy,
      [side * 0.445, 0, 0],
      [0, 0, Math.PI / 2]
    );
    hubFlange.rotation.z = Math.PI / 2;
    addMesh(axleHousing, new THREE.TorusGeometry(0.060, 0.006, 8, 24), red, [side * 0.462, 0, 0])
      .rotation.y = Math.PI / 2;
  }
  addMesh(axleHousing, new THREE.SphereGeometry(0.122, 24, 18), darkMetal, [0, -0.004, 0])
    .scale.set(1.0, 0.90, 1.13);
  roundedBox(axleHousing, [0.215, 0.155, 0.035], carbonEdge, [0, -0.005, 0.112], null, 0.027);
  addMesh(axleHousing, new THREE.TorusGeometry(0.083, 0.007, 8, 32), alloy, [0, 0.005, 0.135]);
  addMesh(axleHousing, new THREE.CylinderGeometry(0.074, 0.074, 0.012, 32), darkMetal,
    [0, 0.005, 0.136], [Math.PI / 2, 0, 0]);
  for (let bolt = 0; bolt < 10; bolt++) {
    const angle = bolt * Math.PI * 2 / 10;
    addMesh(
      axleHousing,
      new THREE.CylinderGeometry(0.006, 0.006, 0.012, 8),
      alloy,
      [Math.cos(angle) * 0.091, 0.018, 0.137 + Math.sin(angle) * 0.091],
      [Math.PI / 2, 0, 0]
    );
  }
  const pinionNeck = addMesh(axleHousing, new THREE.CylinderGeometry(0.034, 0.045, 0.11, 16), alloy,
    [0, -0.005, -0.118], [Math.PI / 2, 0, 0]);
  pinionNeck.rotation.x = Math.PI / 2;
  addMesh(axleHousing, new THREE.TorusGeometry(0.035, 0.006, 8, 24), red, [0, -0.005, -0.17])
    .rotation.x = Math.PI / 2;
  for (const x of [-0.035, 0.035]) {
    addMesh(axleHousing, new THREE.CylinderGeometry(0.007, 0.007, 0.018, 8), alloy,
      [x, -0.005, -0.174], [Math.PI / 2, 0, 0]);
  }
  const rearAxleTray = makePart(
    chassisGroup,
    "front-electronics-tray",
    "Forward electronics deck",
    "Repositioned low-mounted battery, ESC and receiver tray shifts electrical mass toward the front half of the chassis.",
    "live-axle"
  );
  roundedBox(rearAxleTray, [0.37, 0.025, 0.39], carbon, [0, 0.025, -0.245], null, 0.016);
  for (const side of [-1, 1]) {
    roundedBox(rearAxleTray, [0.018, 0.045, 0.39], alloy, [side * 0.18, 0.055, -0.245], null, 0.006);
    for (const z of [-0.405, -0.085]) {
      roundedBox(rearAxleTray, [0.045, 0.038, 0.045], darkMetal,
        [side * 0.145, 0.060, z], null, 0.008);
      addBolt(rearAxleTray, side * 0.145, 0.086, z, 0.0055);
    }
  }
  // Two transverse battery restraints align over the relocated LiPo pack.
  for (const z of [-0.37, -0.12]) {
    roundedBox(rearAxleTray, [0.31, 0.012, 0.026], blackPlastic, [0, 0.112, z], null, 0.006);
    roundedBox(rearAxleTray, [0.31, 0.004, 0.006], red, [0, 0.120, z], null, 0.002);
  }

  // A separate rear ladder-frame module makes the swing-arm pivots, upper
  // link mounts and shock crossmember visibly tied into the chassis rails.
  const liveAxleFrame = makePart(
    chassisGroup,
    "live-axle-rear-frame",
    "Rear ladder frame and suspension crossmembers",
    "Twin reinforced side rails and boxed crossmembers carry the live-axle trailing-arm pivots, upper links and coil-over shock mounts.",
    "live-axle"
  );
  for (const side of [-1, 1]) {
    roundedBox(liveAxleFrame, [0.052, 0.068, 0.57], carbonEdge,
      [side * 0.205, 0.010, rearAxleZ - 0.18], null, 0.012);
    roundedBox(liveAxleFrame, [0.075, 0.038, 0.17], blackPlastic,
      [side * 0.205, -0.036, rearAxleZ - 0.30], null, 0.010);
    // Double-shear swing-arm pivot ears.
    for (const earSide of [-1, 1]) {
      roundedBox(liveAxleFrame, [0.014, 0.105, 0.095], alloy,
        [side * 0.22 + earSide * 0.032, -0.005, rearAxleZ - 0.40], null, 0.006);
      cylinderBetween(liveAxleFrame,
        [side * 0.22 + earSide * 0.032, -0.005, rearAxleZ - 0.40],
        [side * 0.22 + earSide * 0.032, -0.005, rearAxleZ - 0.40 + 0.01],
        0.023, red, 12);
      addBolt(liveAxleFrame, side * 0.22 + earSide * 0.032, 0.025, rearAxleZ - 0.40, 0.007);
    }
    // Upper link brackets and shock tower gussets.
    roundedBox(liveAxleFrame, [0.065, 0.13, 0.055], darkMetal,
      [side * 0.18, 0.10, rearAxleZ - 0.24], null, 0.009);
    cylinderBetween(liveAxleFrame,
      [side * 0.18, 0.12, rearAxleZ - 0.24],
      [side * 0.205, 0.16, rearAxleZ - 0.075],
      0.012, alloy, 10);
    for (const y of [0.135, 0.175]) {
      addBolt(liveAxleFrame, side * 0.205, y, rearAxleZ - 0.075, 0.006);
    }
  }
  roundedBox(liveAxleFrame, [0.46, 0.055, 0.065], carbon,
    [0, 0.015, rearAxleZ - 0.39], null, 0.012);
  roundedBox(liveAxleFrame, [0.44, 0.048, 0.070], darkMetal,
    [0, 0.11, rearAxleZ - 0.24], null, 0.012);
  roundedBox(liveAxleFrame, [0.49, 0.045, 0.060], carbonEdge,
    [0, 0.19, rearAxleZ - 0.075], null, 0.010);
  for (const side of [-1, 1]) {
    cylinderBetween(liveAxleFrame,
      [side * 0.12, 0.19, rearAxleZ - 0.075],
      [side * 0.205, 0.25, rearAxleZ - 0.075],
      0.012, alloy, 10);
  }

  function makeLiveAxleSegment(id, label, description, radius, material) {
    const group = makePart(chassisGroup, id, label, description, "live-axle");
    const mesh = addMesh(group, new THREE.CylinderGeometry(radius, radius, 1, 16), material);
    const outerRails = [];
    const crossBraces = [];
    if (radius > 0.02) {
      for (const offset of [-0.028, 0.028]) {
        const rail = addMesh(
          group,
          new THREE.CylinderGeometry(0.010, 0.010, 1, 10),
          carbonEdge,
          [offset, 0, 0]
        );
        outerRails.push(rail);
      }
      for (const t of [-0.34, 0.34]) {
        const brace = addMesh(
          group,
          new THREE.CylinderGeometry(0.009, 0.009, 0.065, 10),
          alloy,
          [0, t, 0]
        );
        brace.rotation.z = Math.PI / 2;
        brace.scale.y = 1;
        crossBraces.push(brace);
      }
      for (const end of [-0.48, 0.48]) {
        addMesh(group, new THREE.TorusGeometry(0.025, 0.006, 7, 18), alloy, [0, end, 0])
          .rotation.x = Math.PI / 2;
      }
    } else {
      addMesh(group, new THREE.SphereGeometry(0.021, 12, 10), red, [0, -0.48, 0]);
      addMesh(group, new THREE.SphereGeometry(0.021, 12, 10), red, [0, 0.48, 0]);
    }
    return { group, mesh, outerRails, crossBraces };
  }
  function updateLiveAxleSegment(segment, start, end) {
    const direction = end.clone().sub(start);
    const length = Math.max(0.001, direction.length());
    segment.group.position.copy(start).add(end).multiplyScalar(0.5);
    segment.group.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize()
    );
    segment.group.scale.set(1, length, 1);
    for (const brace of segment.crossBraces) {
      brace.scale.y = 1 / length;
    }
  }
  function makeLiveAxleShock(id, label, side) {
    const group = makePart(
      chassisGroup,
      id,
      label,
      "Long-travel oil-filled coil-over supports the live axle. Its body, shaft, spring seats and preload collar visibly follow axle articulation.",
      "live-axle"
    );
    addMesh(group, new THREE.CylinderGeometry(0.023, 0.026, 0.62, 16), blueDark);
    addMesh(group, new THREE.CylinderGeometry(0.008, 0.008, 0.53, 12), alloy)
      .position.x = side * 0.003;
    for (let i = 0; i < 8; i++) {
      const spring = addMesh(group, new THREE.TorusGeometry(0.034, 0.0048, 8, 24), springSilver);
      spring.rotation.x = Math.PI / 2;
      spring.position.y = -0.245 + i * 0.070;
    }
    for (const y of [-0.205, 0.205]) {
      const seat = addMesh(group, new THREE.TorusGeometry(0.039, 0.006, 8, 24), alloy, [0, y, 0]);
      seat.rotation.x = Math.PI / 2;
    }
    const adjuster = addMesh(group, new THREE.CylinderGeometry(0.032, 0.032, 0.035, 16), red, [0, -0.15, 0]);
    adjuster.rotation.x = Math.PI / 2;
    addMesh(group, new THREE.SphereGeometry(0.030, 14, 12), carbonEdge, [0, -0.31, 0]);
    addMesh(group, new THREE.SphereGeometry(0.030, 14, 12), red, [0, 0.31, 0]);
    addMesh(group, new THREE.CylinderGeometry(0.013, 0.013, 0.045, 12), alloy, [0, 0.31, 0]);
    return group;
  }
  function updateLiveAxleShock(group, start, end) {
    const direction = end.clone().sub(start);
    const length = Math.max(0.001, direction.length());
    group.position.copy(start).add(end).multiplyScalar(0.5);
    group.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize()
    );
    group.scale.set(1, length / 0.62, 1);
  }
  function makeLimitStrap(id, side) {
    const group = makePart(
      chassisGroup,
      id,
      side < 0 ? "Left rear limit strap" : "Right rear limit strap",
      "A reinforced droop strap stays loose during compression and tightens at maximum axle extension to protect the suspension links and shocks.",
      "live-axle"
    );
    const segments = [];
    for (let i = 0; i < 6; i++) {
      const piece = new THREE.Group();
      const webbing = addMesh(piece, new THREE.BoxGeometry(0.032, 1, 0.010), blackPlastic);
      const stitchLeft = addMesh(piece, new THREE.BoxGeometry(0.0028, 0.96, 0.012), redBright, [-0.0105, 0, 0]);
      const stitchRight = addMesh(piece, new THREE.BoxGeometry(0.0028, 0.96, 0.012), redBright, [0.0105, 0, 0]);
      group.add(piece);
      segments.push(piece);
    }
    const eyelets = [-1, 1].map(() => {
      const eye = addMesh(group, new THREE.TorusGeometry(0.018, 0.0045, 8, 16), alloy);
      eye.rotation.y = Math.PI / 2;
      return eye;
    });
    return { group, segments, eyelets };
  }
  function updateLimitStrap(strap, start, end, maxLength) {
    const delta = end.clone().sub(start);
    const distance = Math.max(0.001, delta.length());
    const direction = delta.clone().normalize();
    const slack = Math.max(0, maxLength - distance);
    const sag = Math.min(0.12, Math.sqrt(Math.max(0, maxLength * maxLength - distance * distance)) * 0.30);
    const sagDirection = new THREE.Vector3(0, 0, 1);
    sagDirection.addScaledVector(direction, -sagDirection.dot(direction));
    if (sagDirection.lengthSq() < 1e-5) sagDirection.set(1, 0, 0);
    sagDirection.normalize();
    const curvePoint = (t) => start.clone()
      .lerp(end, t)
      .addScaledVector(sagDirection, 4 * t * (1 - t) * sag);
    for (let i = 0; i < strap.segments.length; i++) {
      const a = curvePoint(i / strap.segments.length);
      const b = curvePoint((i + 1) / strap.segments.length);
      const segmentDirection = b.clone().sub(a);
      const length = Math.max(0.001, segmentDirection.length());
      const piece = strap.segments[i];
      piece.position.copy(a).add(b).multiplyScalar(0.5);
      piece.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), segmentDirection.normalize());
      piece.scale.set(1, length, 1);
    }
    strap.eyelets[0].position.copy(start);
    strap.eyelets[1].position.copy(end);
    strap.group.userData.isTaut = slack < 0.012;
  }

  const liveAxleDriveshaft = makeLiveAxleSegment(
    "live-axle-driveshaft",
    "Rear differential driveshaft",
    "The longitudinal prop shaft drives the live axle through a sliding coupling and articulated rear universal joint.",
    0.014,
    alloy
  );
  const driveshaftCoupler = addMesh(
    liveAxleDriveshaft.group,
    new THREE.CylinderGeometry(0.022, 0.022, 0.075, 16),
    darkMetal,
    [0, 0.12, 0]
  );
  const driveshaftJoint = addMesh(
    liveAxleDriveshaft.group,
    new THREE.SphereGeometry(0.028, 14, 12),
    red,
    [0, 0.48, 0]
  );
  const liveAxleLinks = [];
  const liveAxleShocks = [];
  const liveAxleStraps = [];
  for (const side of [-1, 1]) {
    const sideName = side < 0 ? "left" : "right";
    liveAxleLinks.push({
      side,
      kind: "trailing",
      segment: makeLiveAxleSegment(
        `rear-${sideName}-trailing-arm`,
        `${sideName === "left" ? "Left" : "Right"} rear trailing / swing arm`,
        "Long lower trailing arm pivots at the chassis and sweeps with the solid axle through suspension travel.",
        0.026,
        red
      )
    });
    liveAxleLinks.push({
      side,
      kind: "upper",
      segment: makeLiveAxleSegment(
        `rear-${sideName}-upper-link`,
        `${sideName === "left" ? "Left" : "Right"} triangulated upper link`,
        "Triangulated upper four-link locates the axle laterally and controls axle rotation under acceleration and braking.",
        0.014,
        alloy
      )
    });
    liveAxleShocks.push({
      side,
      group: makeLiveAxleShock(`rear-${sideName}-live-shock`, `${sideName} live-axle coil-over`, side)
    });
    liveAxleStraps.push({
      side,
      ...makeLimitStrap(`rear-${sideName}-limit-strap`, side)
    });
  }

  function setFrontSuspensionPose(index, position, quaternion = null) {
    const side = index === 0 ? -1 : index === 1 ? 1 : 0;
    if (!side || !position) return;
    const visual = frontSuspensionVisuals.find((item) => item.side === side);
    if (!visual) return;
    const wheel = new THREE.Vector3(position.x, position.y, position.z);
    const lowerOuter = wheel.clone();
    lowerOuter.x = side * 0.292;
    updateCylinderBetween(visual.lowerFrontRod, visual.innerFront, lowerOuter.toArray());
    updateCylinderBetween(visual.lowerRearRod, visual.innerRear, lowerOuter.toArray());
    visual.outerJoint.position.copy(lowerOuter);
    const upperOuter = lowerOuter.clone();
    upperOuter.y += 0.105;
    updateCylinderBetween(visual.upperRod, visual.upperRodStart, upperOuter.toArray());
    if (visual.carrier) {
      visual.carrier.position.set(
        wheel.x - side * 0.295,
        wheel.y - 0.005,
        wheel.z - visual.z
      );
      if (quaternion) visual.carrier.quaternion.copy(quaternion);
    }
    if (visual.shock) {
      updateDynamicFrontShock(
        visual.shock,
        new THREE.Vector3(side * 0.19, 0.195, visual.z + 0.045),
        new THREE.Vector3(side * 0.272, wheel.y + 0.03, wheel.z)
      );
    }
  }

  function setChassisStyle(style) {
    chassisStyle = style === "live-axle" ? "live-axle" : "standard";
    for (const record of damageParts.values()) {
      if (!record.chassisVariant) continue;
      const active = record.chassisVariant === chassisStyle;
      if (!record.detached) record.group.visible = active;
      record.originalVisible = active;
    }
    liveAxleAssembly.visible = chassisStyle === "live-axle";

    // Move the complete electrical package forward together so the relative
    // battery / motor / ESC / receiver clearances remain unchanged. The new
    // electronics tray is centered under this relocated package.
    const basePosition = (part) => part.userData.baseChassisPosition || new THREE.Vector3();
    for (const part of [battery, motor, gearing, esc, receiver, powerWiring, signalWiring]) {
      part.position.copy(basePosition(part));
      if (chassisStyle === "live-axle") part.position.z -= 0.24;
    }
    return chassisStyle;
  }

  function setRearAxlePose(state) {
    if (!state || chassisStyle !== "live-axle" ||
        !Array.isArray(state.position) || state.position.length < 3 ||
        !Array.isArray(state.quaternion) || state.quaternion.length < 4) return;
    const scale = Number.isFinite(state.hubHalfTrack)
      ? state.hubHalfTrack / 0.305
      : 1;
    const position = new THREE.Vector3(...state.position);
    const quaternion = new THREE.Quaternion(...state.quaternion).normalize();
    const rootScale = root.scale.x || 1;
    const visualScale = scale / rootScale;
    const visualScaleZ = visualScale / chassisLengthScale;
    const visualPosition = position.clone().divideScalar(rootScale);
    visualPosition.z /= chassisLengthScale;
    liveAxleAssembly.position.copy(visualPosition);
    liveAxleAssembly.quaternion.copy(quaternion);

    const axlePoint = (x, y, z) => new THREE.Vector3(
      x * visualScale, y * visualScale, z * visualScaleZ
    ).applyQuaternion(quaternion).add(visualPosition);
    for (const link of liveAxleLinks) {
      const side = link.side, isTrailing = link.kind === "trailing";
      const record = damageParts.get(link.segment.group.userData.damagePartId);
      if (record?.detached) continue;
      const chassisAnchor = isTrailing
        ? new THREE.Vector3(side * 0.22 * visualScale, -0.045 * visualScale, (rearAxleZ - 0.40) * visualScaleZ)
        : new THREE.Vector3(side * 0.18 * visualScale, 0.12 * visualScale, (rearAxleZ - 0.24) * visualScaleZ);
      const axleAnchor = isTrailing
        ? axlePoint(side * 0.24, 0, 0)
        : axlePoint(-side * 0.13, 0.055, 0);
      updateLiveAxleSegment(link.segment, chassisAnchor, axleAnchor);
    }
    for (const shock of liveAxleShocks) {
      const side = shock.side;
      if (damageParts.get(shock.group.userData.damagePartId)?.detached) continue;
      updateLiveAxleShock(
        shock.group,
        new THREE.Vector3(side * 0.205 * visualScale, 0.16 * visualScale, (rearAxleZ - 0.075) * visualScaleZ),
        axlePoint(side * 0.215, 0.065, 0)
      );
    }
    if (!damageParts.get(liveAxleDriveshaft.group.userData.damagePartId)?.detached) {
      updateLiveAxleSegment(
        liveAxleDriveshaft,
        new THREE.Vector3(0, 0.09 * visualScale, (rearAxleZ - 0.30) * visualScaleZ),
        axlePoint(0, -0.005, -0.17)
      );
      driveshaftCoupler.position.y = 0.18;
      driveshaftJoint.position.copy(axlePoint(0, -0.005, -0.17))
        .sub(liveAxleDriveshaft.group.position)
        .applyQuaternion(liveAxleDriveshaft.group.quaternion.clone().invert())
        .divide(new THREE.Vector3(1, Math.max(0.001, liveAxleDriveshaft.group.scale.y), 1));
    }
    for (let strapIndex = 0; strapIndex < liveAxleStraps.length; strapIndex++) {
      const strap = liveAxleStraps[strapIndex];
      const side = strap.side;
      if (damageParts.get(strap.group.userData.damagePartId)?.detached) continue;
      const strapMaxLength = Array.isArray(state.limitStrapLengths)
        ? (state.limitStrapLengths[strapIndex] || 0) / rootScale
        : 0.31 * visualScale;
      updateLimitStrap(
        strap,
        new THREE.Vector3(side * 0.235 * visualScale, 0.205 * visualScale, (rearAxleZ - 0.085) * visualScaleZ),
        axlePoint(side * 0.235, 0.12, 0),
        strapMaxLength
      );
    }

    const hubHalfTrack = Number.isFinite(state.hubHalfTrack) ? state.hubHalfTrack : 0.305;
    for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
      const side = sideIndex === 0 ? -1 : 1;
      const pivot = wheelPivots[sideIndex + 2];
      if (damageParts.get(pivot.userData.damagePartId)?.detached) continue;
      const hub = new THREE.Vector3(side * hubHalfTrack, -0.005 * scale, 0)
        .applyQuaternion(quaternion)
        .add(position);
      pivot.position.set(
        hub.x / rootScale,
        hub.y / rootScale,
        hub.z * chassisLengthScale / rootScale
      );
      const spin = Array.isArray(state.wheelRotations) ? state.wheelRotations[sideIndex] || 0 : 0;
      const spinQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), spin);
      pivot.quaternion.copy(quaternion).multiply(spinQuaternion);
    }
  }

  const rangerShellMaterial = new THREE.MeshStandardMaterial({
    color: 0xff581a,
    roughness: 0.58,
    metalness: 0.01,
    side: THREE.DoubleSide
  });
  const rangerShellVisual = makePart(
    shellGroup,
    "uploaded-scx30-ranger-shell",
    "Orange SCX30 Ranger shell",
    "The original orange SCX30 single-cab Ranger body shell uploaded for this project. This is the supplied mesh, not the procedural short-course replacement."
  );
  if (rangerShellGeometry) {
    const importedRangerMesh = addMesh(
      rangerShellVisual,
      rangerShellGeometry,
      rangerShellMaterial,
      [0, 0.15, 0]
    );
    importedRangerMesh.name = "Original uploaded SCX30 Ranger shell";
    importedRangerMesh.castShadow = false;
    importedRangerMesh.receiveShadow = false;
  }

  const prerunnerShellVisual = makePart(
    shellGroup,
    "prerunner-shell-visual",
    "Concept4 Desert Racer prerunner shell",
    "Painted blue Concept4 Desert Racer shell with its black hood and roof, racing number, grille, headlights, rear lamps and roof LED bar."
  );
  if (shellModel) {
    const importedShellVisual = shellModel.clone(true);
    importedShellVisual.name = "Concept4 Desert Racer painted body";
    importedShellVisual.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = false;
      object.frustumCulled = true;
    });
    prerunnerShellVisual.add(importedShellVisual);
  }

  // Keep the two actual uploaded body meshes available as separate choices.
  let shellStyle = "prerunner";
  function setShellStyle(style) {
    const requested = style === "ranger" ? "ranger" : "prerunner";
    shellStyle = requested === "ranger" && rangerShellGeometry
      ? "ranger"
      : "prerunner";
    rangerShellVisual.visible = shellStyle === "ranger";
    prerunnerShellVisual.visible = shellStyle === "prerunner";
    shellGroup.userData.partInfo = shellStyle === "ranger"
      ? {
          id: "short-course-body-shell",
          label: "Orange SCX30 Ranger shell",
          description: "The original uploaded orange SCX30 single-cab Ranger mesh, preserved as its own body option."
        }
      : {
          id: "short-course-body-shell",
          label: "Concept4 Desert Racer prerunner shell",
          description: "Painted blue Concept4 Desert Racer shell with its original proportions preserved and uniformly fitted to the chassis."
        };
    return shellStyle;
  }

  shellGroup.traverse((object) => {
    if (object !== shellGroup && object.userData) {
      delete object.userData.partInfo;
    }
  });
  setShellStyle(shellModel ? "prerunner" : "ranger");
  for (const part of [battery, motor, gearing, esc, receiver, powerWiring, signalWiring]) {
    part.userData.baseChassisPosition = part.position.clone();
  }
  setChassisStyle("standard");

  // Store the original hierarchy and transforms so every damaged component
  // can be restored by the existing vehicle reset command.
  root.updateMatrixWorld(true);
  for (const record of damageParts.values()) {
    record.originalParent = record.group.parent;
    record.originalPosition = record.group.position.clone();
    record.originalQuaternion = record.group.quaternion.clone();
    record.originalScale = record.group.scale.clone();
    record.originalVisible = record.group.visible;
  }

  function isPartAttached(record) {
    let node = record.group;
    while (node && node !== root) node = node.parent;
    return node === root;
  }

  function isPartVisible(record) {
    let node = record.group;
    while (node && node !== root) {
      if (!node.visible) return false;
      node = node.parent;
    }
    return node === root;
  }

  function getPartHealthRatio(id) {
    const record = damageParts.get(id);
    return record ? THREE.MathUtils.clamp(record.health / record.maxHealth, 0, 1) : 1;
  }

  function isPartDetached(id) {
    return damageParts.get(id)?.detached === true;
  }

  function getDamagePartOptions() {
    return [...damageParts.values()].map((record) => ({
      id: record.id,
      label: record.label,
      health: record.health,
      maxHealth: record.maxHealth,
      detached: record.detached,
      visible: isPartVisible(record)
    }));
  }

  function debugDamagePart(id, fraction = 0.45) {
    const record = damageParts.get(String(id || ""));
    if (!record || record.detached || !isPartAttached(record)) return false;
    const normalizedFraction = THREE.MathUtils.clamp(Number(fraction) || 0.45, 0.05, 1);
    const amount = record.maxHealth * normalizedFraction;
    damageRecord(record, amount, { speed: 5.2 });
    return {
      id: record.id,
      health: record.health,
      maxHealth: record.maxHealth,
      detached: record.detached
    };
  }

  function debugDetachPart(id) {
    const record = damageParts.get(String(id || ""));
    if (!record || record.detached || !isPartAttached(record)) return false;
    damageRecord(record, Math.max(0.01, record.health), { speed: 6.0 });
    return record.detached;
  }

  function detachPart(record, launch = {}) {
    if (record.detached || !record.group.parent) return false;

    const group = record.group;
    group.updateWorldMatrix(true, true);
    const worldPosition = group.getWorldPosition(new THREE.Vector3());
    const worldQuaternion = group.getWorldQuaternion(new THREE.Quaternion());
    const worldScale = group.getWorldScale(new THREE.Vector3());
    const worldBounds = new THREE.Box3().setFromObject(group);
    const inverseGroupMatrix = group.matrixWorld.clone().invert();
    const localBounds = worldBounds.clone().applyMatrix4(inverseGroupMatrix);
    const localCenter = localBounds.getCenter(new THREE.Vector3());
    const localSize = localBounds.getSize(new THREE.Vector3());

    scene.attach(group);
    record.detached = true;
    record.health = 0;
    record.debrisAge = 0;
    record.debrisExpired = false;
    group.userData.detached = true;

    if (CANNON && world) {
      const half = new THREE.Vector3(
        Math.max(0.014, localSize.x * worldScale.x * 0.5),
        Math.max(0.014, localSize.y * worldScale.y * 0.5),
        Math.max(0.014, localSize.z * worldScale.z * 0.5)
      );
      const center = new THREE.Vector3(
        localCenter.x * worldScale.x,
        localCenter.y * worldScale.y,
        localCenter.z * worldScale.z
      );
      const debrisBody = new CANNON.Body({
        mass: Math.max(0.025, record.mass),
        material: chassisBody?.material,
        linearDamping: 0.10,
        angularDamping: 0.28,
        allowSleep: true
      });
      debrisBody.addShape(
        new CANNON.Box(new CANNON.Vec3(half.x, half.y, half.z)),
        new CANNON.Vec3(center.x, center.y, center.z)
      );
      debrisBody.position.set(worldPosition.x, worldPosition.y, worldPosition.z);
      debrisBody.quaternion.set(
        worldQuaternion.x, worldQuaternion.y, worldQuaternion.z, worldQuaternion.w
      );

      if (Array.isArray(launch.position) && launch.position.length >= 3) {
        debrisBody.position.set(launch.position[0], launch.position[1], launch.position[2]);
      }
      if (Array.isArray(launch.quaternion) && launch.quaternion.length >= 4) {
        debrisBody.quaternion.set(
          launch.quaternion[0], launch.quaternion[1], launch.quaternion[2], launch.quaternion[3]
        );
      }

      if (Array.isArray(launch.velocity) && launch.velocity.length >= 3) {
        debrisBody.velocity.set(launch.velocity[0], launch.velocity[1], launch.velocity[2]);
      } else {
        const base = chassisBody?.velocity;
        const dx = worldPosition.x - (chassisBody?.position.x || 0);
        const dy = worldPosition.y - (chassisBody?.position.y || 0);
        const dz = worldPosition.z - (chassisBody?.position.z || 0);
        const length = Math.hypot(dx, dy, dz) || 1;
        const kick = Math.min(5.5, Math.max(0.8, (launch.speed || 4) * 0.22));
        debrisBody.velocity.set(
          (base?.x || 0) + dx / length * kick,
          (base?.y || 0) + dy / length * kick + 0.45,
          (base?.z || 0) + dz / length * kick
        );
      }

      if (Array.isArray(launch.angularVelocity) && launch.angularVelocity.length >= 3) {
        debrisBody.angularVelocity.set(
          launch.angularVelocity[0], launch.angularVelocity[1], launch.angularVelocity[2]
        );
      } else {
        const hash = record.id.split("").reduce((value, char) => value + char.charCodeAt(0), 0);
        const spin = 2.2 + (hash % 17) * 0.12;
        debrisBody.angularVelocity.set(
          ((hash % 3) - 1) * spin,
          (((hash >> 2) % 3) - 1) * spin,
          (((hash >> 4) % 3) - 1) * spin
        );
      }

      debrisBody.userData = { rcCarDebris: true, componentId: record.id };
      world.addBody(debrisBody);
      record.debrisBody = debrisBody;
    }

    return true;
  }

  function damageRecord(record, amount, launch) {
    if (!record || record.detached || amount <= 0) return false;
    record.health = Math.max(0, record.health - amount);
    if (record.health <= 0) {
      detachPart(record, launch);
      return true;
    }
    return false;
  }

  let damageMultiplier = 1;
  function setDamageMultiplier(value) { damageMultiplier = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0.1, 8) : 1; }
  function applyLaunchStress(stress = {}) {
    if (totalled) return null;

    const deltaVelocity = Array.isArray(stress.deltaVelocity)
      ? stress.deltaVelocity.map((value) => Number.isFinite(value) ? value : 0)
      : [0, 0, 0];
    const deltaAngular = Array.isArray(stress.deltaAngular)
      ? stress.deltaAngular.map((value) => Number.isFinite(value) ? value : 0)
      : [0, 0, 0];
    const linearChange = Number.isFinite(stress.linearChange)
      ? Math.max(0, stress.linearChange)
      : Math.hypot(...deltaVelocity);
    const angularChange = Number.isFinite(stress.angularChange)
      ? Math.max(0, stress.angularChange)
      : Math.hypot(...deltaAngular);

    // A rapid velocity change or sharp spin can flex body mounts and loosen
    // suspension hardware even without a direct collision with an obstacle.
    const severity = Math.max(linearChange / 4.8, angularChange / 7.5);
    if (!Number.isFinite(severity) || severity < 0.85) return null;

    root.updateWorldMatrix(true, false);
    const inverseRotation = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const localKick = new THREE.Vector3(
      deltaVelocity[0] + deltaAngular[0] * 0.18,
      deltaVelocity[1] + deltaAngular[1] * 0.18,
      deltaVelocity[2] + deltaAngular[2] * 0.18
    ).applyQuaternion(inverseRotation);

    const launchedVelocity = Array.isArray(stress.velocity)
      ? stress.velocity
      : chassisBody?.velocity
        ? [chassisBody.velocity.x, chassisBody.velocity.y, chassisBody.velocity.z]
        : [0, 0, 0];
    const launch = { speed: linearChange, velocity: launchedVelocity };
    const affected = [];

    const activeShell = [...damageParts.values()].find((record) =>
      (record.id === "uploaded-scx30-ranger-shell" ||
       record.id === "prerunner-shell-visual") &&
      isActiveDamageRecord(record) &&
      !record.detached
    );

    if (activeShell) {
      const shellDamage = (severity >= 2.65
        ? activeShell.health
        : 12 + Math.max(0, severity - 0.85) * 44) * damageMultiplier;
      const detached = damageRecord(activeShell, shellDamage, launch);
      affected.push({ id: activeShell.id, detached });
    }

    // Pick the exposed hardware most aligned with the direction of the fling.
    const horizontalX = Math.abs(localKick.x);
    const horizontalZ = Math.abs(localKick.z);
    let targetIds = [];
    if (Math.abs(localKick.y) > Math.max(horizontalX, horizontalZ) * 1.15) {
      const side = localKick.x < 0 ? "left" : "right";
      const axle = localKick.z < 0 ? "front" : "rear";
      targetIds = chassisStyle === "live-axle" && axle === "rear"
        ? [`rear-${side}-live-shock`]
        : [`${axle}-${side}-oil-shock`];
    } else if (horizontalX > horizontalZ * 1.12) {
      const side = localKick.x < 0 ? "left" : "right";
      const axle = localKick.z < 0 ? "front" : "rear";
      targetIds = chassisStyle === "live-axle" && axle === "rear"
        ? [`rear-${side}-trailing-arm`, `rear-${side}-upper-link`]
        : [
            `${axle}-${side}-lower-arm`,
            `${axle}-${side}-camber-link`
          ];
    } else {
      targetIds = [localKick.z < 0 ? "front-bumper" : "rear-bumper"];
    }

    if (severity >= 1.25) {
      const mount = damageParts.get("body-mount-posts");
      if (mount && !mount.detached) {
        const mountDamage = severity >= 3.0
          ? mount.health
          : 10 + (severity - 1.25) * 28;
        const detached = damageRecord(mount, mountDamage, launch);
        affected.push({ id: mount.id, detached });
      }
    }

    if (severity >= 1.4) {
      const componentDamage = (severity >= 2.7
        ? Infinity
        : 8 + (severity - 1.4) * 28) * damageMultiplier;
      for (const id of targetIds) {
        const record = damageParts.get(id);
        if (!record || record.detached || !isPartVisible(record)) continue;
        const detached = damageRecord(record, componentDamage, launch);
        affected.push({ id, detached });
        // A medium fling strains one part; only stronger launches spread
        // the load into a second nearby suspension link.
        if (severity < 2.15) break;
      }
    }

    return {
      severity,
      linearChange,
      angularChange,
      damaged: affected.map((item) => item.id),
      detached: affected.filter((item) => item.detached).map((item) => item.id)
    };
  }

  function applyImpact(impact) {
    const speed = Number(impact?.speed);
    if (!Number.isFinite(speed) || speed < 3.2 || !impact?.point) return null;

    root.updateMatrixWorld(true);
    const worldPoint = new THREE.Vector3(impact.point.x, impact.point.y, impact.point.z);
    const localPoint = root.worldToLocal(worldPoint.clone());
    const inverseRoot = root.matrixWorld.clone().invert();
    const candidates = [];

    for (const record of damageParts.values()) {
      if (record.detached || !isPartAttached(record) || !isPartVisible(record)) continue;
      record.group.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(record.group);
      if (bounds.isEmpty()) continue;
      const localBounds = bounds.clone().applyMatrix4(inverseRoot);
      const center = localBounds.getCenter(new THREE.Vector3());
      const size = localBounds.getSize(new THREE.Vector3());
      const radius = Math.max(0.12, size.length() * 0.5);
      let score = localPoint.distanceTo(center) / radius;

      // Prefer the actual exposed impact hardware over the broad shell and
      // chassis bounds, while still allowing roof/side impacts to damage the
      // body shell.
      if (record.id.includes("shell")) score += localPoint.y > 0.16 ? -0.35 : 0.46;
      if (record.id === "main-chassis") score += 0.72;
      if (record.id === "front-bumper" && localPoint.z < -0.34) score -= 0.48;
      if (record.id === "rear-bumper" && localPoint.z > 0.34) score -= 0.48;
      if (record.id.includes("front") && localPoint.z < -0.24) score -= 0.16;
      if (record.id.includes("rear") && localPoint.z > 0.24) score -= 0.16;
      if (record.id.includes("left") && localPoint.x < -0.13) score -= 0.12;
      if (record.id.includes("right") && localPoint.x > 0.13) score -= 0.12;
      candidates.push({ record, score });
    }

    candidates.sort((a, b) => a.score - b.score);
    const primary = candidates[0]?.record;
    if (!primary) return null;

    const applyTo = [];
    const damageAmount = (Math.max(0, speed - 3.0) * 13.0) * primary.sensitivity * damageMultiplier;
    const launch = {
      speed,
      velocity: impact.velocity ? [impact.velocity.x, impact.velocity.y, impact.velocity.z] : null
    };
    const primaryDetached = damageRecord(primary, damageAmount, launch);
    applyTo.push({ label: primary.label, detached: primaryDetached });

    if (speed >= 8.4 && candidates[1] && candidates[1].score - candidates[0].score < 0.48) {
      const secondary = candidates[1].record;
      const secondaryDetached = damageRecord(
        secondary,
        damageAmount * 0.36,
        { ...launch, speed: speed * 0.72 }
      );
      applyTo.push({ label: secondary.label, detached: secondaryDetached });
    }

    return {
      primary: primary.label,
      damaged: applyTo.map((item) => item.label),
      detached: applyTo.filter((item) => item.detached).map((item) => item.label),
      speed
    };
  }

  function updateDebris(delta = 0) {
    for (const record of damageParts.values()) {
      if (!record.detached || !record.debrisBody) continue;
      record.debrisAge += Math.max(0, delta);
      const body = record.debrisBody;
      record.group.position.set(body.position.x, body.position.y, body.position.z);
      record.group.quaternion.set(
        body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w
      );
      if (record.debrisAge > 18 || body.position.y < -35) {
        world?.removeBody?.(body);
        record.debrisBody = null;
        record.debrisExpired = true;
        scene.remove(record.group);
      }
    }
  }

  function restoreRecord(record) {
    if (record.debrisBody) {
      world?.removeBody?.(record.debrisBody);
      record.debrisBody = null;
    }
    if (record.group.parent) record.group.parent.remove(record.group);
    if (record.originalParent) record.originalParent.add(record.group);
    if (record.originalPosition) record.group.position.copy(record.originalPosition);
    if (record.originalQuaternion) record.group.quaternion.copy(record.originalQuaternion);
    if (record.originalScale) record.group.scale.copy(record.originalScale);
    if (record.id === "uploaded-scx30-ranger-shell") {
      record.group.visible = shellStyle === "ranger";
    } else if (record.id === "prerunner-shell-visual") {
      record.group.visible = shellStyle === "prerunner";
    } else {
      record.group.visible = record.originalVisible;
    }
    record.group.userData.detached = false;
    record.detached = false;
    record.health = record.maxHealth;
    record.debrisAge = 0;
    record.debrisExpired = false;
  }

  function repairAll() {
    for (const record of damageParts.values()) {
      if (record.detached || record.health < record.maxHealth) restoreRecord(record);
    }
    totalled = false;
    return getDamageSummary();
  }

  function triggerCatastrophicFailure() {
    if (totalled) return false;
    totalled = true;
    root.updateMatrixWorld(true);

    const vehicleCenter = root.getWorldPosition(new THREE.Vector3());
    const baseVelocity = chassisBody?.velocity || { x: 0, y: 0, z: 0 };
    let released = 0;
    let sequence = 0;

    for (const record of damageParts.values()) {
      if (!isActiveDamageRecord(record)) continue;

      if (record.detached) {
        const body = record.debrisBody;
        if (
          body &&
          body.position &&
          body.velocity &&
          body.angularVelocity
        ) {
          // Use scalar math here instead of chained Cannon Vec3 operations.
          // Debris can be mid-cleanup when a total-out is triggered.
          const dx = body.position.x - vehicleCenter.x;
          const dy = body.position.y - vehicleCenter.y;
          const dz = body.position.z - vehicleCenter.z;
          let length = Math.hypot(dx, dy, dz);
          let directionX = dx;
          let directionY = dy;
          let directionZ = dz;
          if (!Number.isFinite(length) || length < 0.1) {
            directionX = Math.sin(sequence * 2.1);
            directionY = 0.3;
            directionZ = Math.cos(sequence * 2.1);
            length = Math.hypot(directionX, directionY, directionZ) || 1;
          }
          directionX /= length;
          directionY /= length;
          directionZ /= length;
          body.velocity.x += directionX * 3.0;
          body.velocity.y += 3.6 + Math.max(0, directionY) * 1.2;
          body.velocity.z += directionZ * 3.0;
          body.angularVelocity.x += 5.0 + (sequence % 3) * 1.4;
          body.angularVelocity.y += 4.0 + (sequence % 4) * 1.1;
          body.angularVelocity.z += 3.5 + (sequence % 2) * 1.8;
        }
        sequence++;
        continue;
      }

      if (!isPartAttached(record) || !isPartVisible(record) || !record.group.parent) continue;
      record.group.updateWorldMatrix(true, true);
      const partPosition = record.group.getWorldPosition(new THREE.Vector3());
      const direction = partPosition.sub(vehicleCenter);
      if (direction.lengthSq() < 0.01) {
        direction.set(Math.sin(sequence * 2.399), 0.35, Math.cos(sequence * 2.399));
      }
      direction.normalize();

      const launchSpeed = 3.8 + (sequence % 5) * 0.55;
      const velocity = [
        (baseVelocity.x || 0) + direction.x * launchSpeed,
        (baseVelocity.y || 0) + 3.2 + Math.max(0, direction.y) * 1.2,
        (baseVelocity.z || 0) + direction.z * launchSpeed
      ];
      const angularVelocity = [
        4.5 + (sequence % 4) * 1.6,
        3.8 + (sequence % 5) * 1.3,
        4.2 + (sequence % 3) * 1.8
      ];

      record.health = 0;
      detachPart(record, { speed: 10, velocity, angularVelocity });
      released++;
      sequence++;
    }

    return released > 0 || totalled;
  }

  function getDamageSummary() {
    const records = [...damageParts.values()].filter(isActiveDamageRecord);
    const damaged = records.filter((record) => record.health < record.maxHealth - 0.01);
    const detached = records.filter((record) => record.detached);
    const totalHealth = records.reduce((sum, record) => sum + record.maxHealth, 0);
    const remainingHealth = records.reduce((sum, record) => sum + record.health, 0);
    const damagePercent = totalHealth > 0
      ? THREE.MathUtils.clamp(Math.round((1 - remainingHealth / totalHealth) * 100), 0, 100)
      : 0;
    return {
      damaged: damaged.length,
      detached: detached.length,
      damagePercent,
      totalled,
      damagedNames: damaged.map((record) => record.label),
      detachedNames: detached.map((record) => record.label)
    };
  }

  function getDamageSnapshot() {
    const parts = [];
    for (const record of damageParts.values()) {
      if (record.health >= record.maxHealth && !record.detached) continue;
      const body = record.debrisBody;
      parts.push({
        id: record.id,
        h: Math.max(0, Math.round(record.health * 10) / 10),
        d: record.detached,
        p: body ? [body.position.x, body.position.y, body.position.z] : null,
        q: body ? [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w] : null,
        v: body ? [body.velocity.x, body.velocity.y, body.velocity.z] : null,
        w: body ? [body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z] : null
      });
    }
    return { parts, totalled };
  }

  function applyDamageSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.parts)) return;
    const incoming = new Map(snapshot.parts.filter((part) => part && typeof part.id === "string")
      .map((part) => [part.id, part]));

    for (const record of damageParts.values()) {
      const data = incoming.get(record.id);
      if (!data) {
        if (record.detached || record.health < record.maxHealth) restoreRecord(record);
        continue;
      }

      const health = Number.isFinite(data.h)
        ? THREE.MathUtils.clamp(data.h, 0, record.maxHealth)
        : record.maxHealth;
      if (data.d === true) {
        if (!record.detached || (!record.debrisBody && Array.isArray(data.p) && record.debrisExpired)) {
          if (record.detached) restoreRecord(record);
          detachPart(record, {
            position: data.p,
            quaternion: data.q,
            velocity: data.v,
            angularVelocity: data.w
          });
        }
        record.health = 0;
        if (record.debrisBody && Array.isArray(data.p)) {
          record.debrisBody.position.set(data.p[0], data.p[1], data.p[2]);
          if (Array.isArray(data.q)) {
            record.debrisBody.quaternion.set(data.q[0], data.q[1], data.q[2], data.q[3]);
          }
          if (Array.isArray(data.v)) {
            record.debrisBody.velocity.set(data.v[0], data.v[1], data.v[2]);
          }
          if (Array.isArray(data.w)) {
            record.debrisBody.angularVelocity.set(data.w[0], data.w[1], data.w[2]);
          }
        }
      } else {
        if (record.detached) restoreRecord(record);
        record.health = health;
      }
    }
    totalled = snapshot.totalled === true;
  }

  // The detailed chassis remains unchanged beneath either removable shell.
  // All internal chassis components remain present and retain their original
  // dimensions; either body shell can be removed to inspect the running gear.

  let playerNameSprite = null;
  function setPlayerName(name, visible = true) {
    const safeName = String(name || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 18);
    if (!visible || !safeName) {
      if (playerNameSprite) {
        root.remove(playerNameSprite);
        playerNameSprite.material.map?.dispose();
        playerNameSprite.material.dispose();
        playerNameSprite = null;
      }
      return;
    }

    if (playerNameSprite) {
      root.remove(playerNameSprite);
      playerNameSprite.material.map?.dispose();
      playerNameSprite.material.dispose();
      playerNameSprite = null;
    }

    // Draw at a much higher source resolution so the text stays sharp when
    // the floating tag is reduced to its on-screen size.
    const labelCanvas = document.createElement("canvas");
    const canvasHeight = 256;
    const font = "700 176px Arial, sans-serif";
    const measureCanvas = document.createElement("canvas");
    const measureContext = measureCanvas.getContext("2d");
    if (!measureContext) return;
    measureContext.font = font;
    const measuredTextWidth = measureContext.measureText(safeName).width;
    const horizontalPadding = 160;
    labelCanvas.height = canvasHeight;
    labelCanvas.width = Math.ceil(Math.max(1024, measuredTextWidth + horizontalPadding));

    const ctx = labelCanvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.font = font;
    ctx.fillStyle = "rgba(13,20,29,.88)";
    ctx.beginPath();
    ctx.roundRect(12, 18, labelCanvas.width - 24, canvasHeight - 36, 58);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(safeName, labelCanvas.width / 2, canvasHeight / 2);

    const texture = new THREE.CanvasTexture(labelCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
    playerNameSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture, transparent: true, depthWrite: false, toneMapped: false
    }));
    playerNameSprite.position.set(0, 1.02, 0);

    // Calculate width from the canvas aspect ratio, then cap the overall
    // world width so long driver names do not become oversized billboards.
    const aspect = labelCanvas.width / labelCanvas.height;
    const labelWidth = Math.min(1.85, 0.36 * aspect);
    const labelHeight = labelWidth / aspect;
    playerNameSprite.scale.set(labelWidth, labelHeight, 1);
    root.add(playerNameSprite);
  }
  setPlayerName(playerName, !!playerName);

  scene.add(root);
  return {
    root,
    wheelPivots,
    shellGroup,
    chassisGroup,
    liveAxleAssembly,
    setShellVisible(visible) { shellGroup.visible = !!visible; },
    setShellStyle,
    setChassisStyle,
    get chassisStyle() { return chassisStyle; },
    setFrontSuspensionPose,
    setRearAxlePose,
    get shellStyle() { return shellStyle; },
    setPlayerName,
    applyImpact,
    applyLaunchStress,
    setDamageMultiplier,
    updateDebris,
    repairAll,
    getDamageSummary,
    getDamageSnapshot,
    applyDamageSnapshot,
    getPartHealthRatio,
    isPartDetached,
    getDamagePartOptions,
    debugDamagePart,
    debugDetachPart,
    triggerCatastrophicFailure,
    isTotalled() { return totalled; }
  };
}
  return makeCarVisual;
}
