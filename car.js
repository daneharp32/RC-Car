import { RoundedBoxGeometry } from "https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/geometries/RoundedBoxGeometry.js";

// Builds the detailed chassis, wheels, and the separately removable shell.
export function createCarVisualFactory({ THREE, scene, VISUAL_CHASSIS_LENGTH_SCALE, vehicle, renderer, shellModel = null }) {
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
  const chassisLengthScale = shellModel ? 1 : VISUAL_CHASSIS_LENGTH_SCALE;
  chassisGroup.scale.set(1, 1, chassisLengthScale);
  shellGroup.scale.set(1, 1, shellModel ? 1 : VISUAL_CHASSIS_LENGTH_SCALE);
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

  function makePart(parent, id, label, description) {
    const group = new THREE.Group();
    group.name = id;
    group.userData.partInfo = { id, label, description };
    parent.add(group);
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
    return object;
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

  function addShock(parent, id, label, description, top, bottom, springMaterial) {
    const group = makePart(parent, id, label, description);
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
    const diff = makePart(chassisGroup, end.id, end.label, end.desc);
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
      "Molded reinforced A-arm connects the chassis hinge pins to the wheel carrier and lets the wheel move vertically with the suspension."
    );
    const s = corner.side;
    const z = corner.z;
    const innerFront = [s * 0.075, -0.055, z - (isFront ? -0.075 : 0.075)];
    const innerRear = [s * 0.075, -0.055, z + (isFront ? -0.075 : 0.075)];
    const outer = [s * 0.292, -0.038, z];
    cylinderBetween(arm, innerFront, outer, 0.023, carbonEdge, 12, 0.018);
    cylinderBetween(arm, innerRear, outer, 0.023, carbonEdge, 12, 0.018);
    cylinderBetween(arm, innerFront, innerRear, 0.018, blackPlastic, 10);
    addMesh(arm, new THREE.SphereGeometry(0.025, 12, 10), alloy, outer);

    const upper = makePart(
      chassisGroup,
      `${corner.name.toLowerCase().replace(" ", "-")}-camber-link`,
      `${corner.name} upper camber link`,
      "Adjustable upper link controls wheel camber and keeps the upright aligned as the suspension travels."
    );
    cylinderBetween(upper, [s * 0.10, 0.17, z + (isFront ? 0.025 : -0.025)],
      [s * 0.29, 0.13, z], 0.011, alloy, 10, 0.009);
    addMesh(upper, new THREE.SphereGeometry(0.015, 12, 10), red,
      [s * 0.12, 0.17, z + (isFront ? 0.025 : -0.025)]);

    const carrier = makePart(
      chassisGroup,
      `${corner.name.toLowerCase().replace(" ", "-")}-wheel-carrier`,
      `${corner.name} wheel carrier / hub`,
      "The upright holds the axle bearings and connects the steering or rear toe links to the suspension arms."
    );
    roundedBox(carrier, [0.075, 0.13, 0.085], blackPlastic, [s * 0.295, 0.005, z], null, 0.018);
    cylinderBetween(carrier, [s * 0.25, 0.005, z], [s * 0.35, 0.005, z], 0.031, alloy, 16);
    cylinderBetween(carrier, [s * 0.335, 0.005, z], [s * 0.355, 0.005, z], 0.022, red, 12);
    addBolt(carrier, s * 0.30, 0.075, z, 0.007);
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
      "Reinforced vertical plate that anchors the upper shock eyes and suspension bracing."
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
    addShock(
      chassisGroup,
      `${corner.label.toLowerCase().replace(" ", "-")}-oil-shock`,
      `${corner.label} oil-filled shock`,
      "Aluminum-bodied coil-over damper. The silver spring supports the truck while the oil-filled shock body controls how quickly the suspension compresses and rebounds.",
      top,
      bottom,
      springSilver
    );
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


  // Slash-inspired short-course polycarbonate shell. The lofted orange skin,
  // black roof/hood, gray rear quarters, windows and trim are separate parts.
  function makeBodyShell(parent = shellGroup) {
    // Clean, low-profile short-course shell. The body is one continuous
    // faceted surface; the separate pieces below are limited to windows,
    // subtle livery, lamps, and bumpers so the silhouette remains readable.
    const shellGeometryGroup = new THREE.Group();
    shellGeometryGroup.name = "shell-geometry";
    shellGeometryGroup.scale.z = classicShellDepthScale;
    parent.add(shellGeometryGroup);

    const orange = new THREE.MeshStandardMaterial({
      color: 0xff4b0b,
      roughness: 0.52,
      metalness: 0.02,
      side: THREE.DoubleSide
    });
    const orangeHighlight = new THREE.MeshStandardMaterial({
      color: 0xff6829,
      roughness: 0.5,
      metalness: 0.02,
      side: THREE.DoubleSide
    });
    const charcoal = new THREE.MeshStandardMaterial({
      color: 0x20282e,
      roughness: 0.62,
      metalness: 0.1,
      side: THREE.DoubleSide
    });
    const black = new THREE.MeshStandardMaterial({
      color: 0x101519,
      roughness: 0.58,
      metalness: 0.06,
      side: THREE.DoubleSide
    });
    const graphite = new THREE.MeshStandardMaterial({
      color: 0x59636a,
      roughness: 0.55,
      metalness: 0.2,
      side: THREE.DoubleSide
    });
    const glass = new THREE.MeshStandardMaterial({
      color: 0x101c27,
      roughness: 0.3,
      metalness: 0.08,
      side: THREE.DoubleSide
    });
    const silver = new THREE.MeshStandardMaterial({
      color: 0xb7c0c5,
      roughness: 0.36,
      metalness: 0.58
    });
    const headlamp = new THREE.MeshStandardMaterial({
      color: 0xf6e8cf,
      emissive: 0x604323,
      emissiveIntensity: 0.12
    });
    const tailLamp = new THREE.MeshStandardMaterial({
      color: 0xb72b27,
      emissive: 0x350605,
      emissiveIntensity: 0.12
    });

    // Reference target: Slash proportions are about 568 mm long, 296 mm
    // wide, 193 mm high, with a 324 mm wheelbase. The visual wheelbase here
    // is 0.58 * 1.26 = 0.7308 units, so target shell length is ~1.28 units.
    // This shell spans 1.34 * 0.75 * 1.26 = 1.266 units.
    // The actual rendered tires are ~0.158 radius and 0.132 wide.
    const wheelInfo = vehicle.wheelInfos[0];
    const wheelCenterY =
      wheelInfo.chassisConnectionPointLocal.y -
      wheelInfo.suspensionRestLength + 0.028;
    const visualTireRadius = 0.158;
    const classicShellDepthScale = 0.75;
    const shellWheelCenters = [
      frontAxleZ / classicShellDepthScale,
      rearAxleZ / classicShellDepthScale
    ];
    const wheelArchHalfLength = 0.18;
    const lowerSillY = -0.055;
    const wheelArchTopY = wheelCenterY + visualTireRadius + 0.014;

    // Longitudinal body blockout. Width, hood height, cab roof and bed top
    // are deliberately kept low and broad. Each row is [z, halfWidth, topY].
    const stations = [
      [-0.840, 0.235, 0.105],
      [-0.635, 0.365, 0.118],
      [-0.550, 0.340, 0.128],
      [-0.465, 0.365, 0.140],
      [-0.385, 0.370, 0.142],
      [-0.285, 0.360, 0.118],
      [-0.195, 0.340, 0.112],
      [-0.080, 0.292, 0.154],
      [0.165, 0.292, 0.154],
      [0.270, 0.340, 0.112],
      [0.370, 0.368, 0.132],
      [0.455, 0.370, 0.140],
      [0.550, 0.340, 0.120],
      [0.635, 0.365, 0.102],
      [0.840, 0.228, 0.090]
    ];

    function profileAt(z) {
      if (z <= stations[0][0]) {
        return { width: stations[0][1], top: stations[0][2] };
      }
      const last = stations[stations.length - 1];
      if (z >= last[0]) return { width: last[1], top: last[2] };

      for (let i = 0; i < stations.length - 1; i++) {
        const a = stations[i];
        const b = stations[i + 1];
        if (z >= a[0] && z <= b[0]) {
          const t = (z - a[0]) / (b[0] - a[0]);
          return {
            width: THREE.MathUtils.lerp(a[1], b[1], t),
            top: THREE.MathUtils.lerp(a[2], b[2], t)
          };
        }
      }
      return { width: last[1], top: last[2] };
    }

    function lowerEdgeAt(z) {
      let lower = lowerSillY;
      for (const center of shellWheelCenters) {
        const distance = Math.abs(z - center) / wheelArchHalfLength;
        if (distance < 1) {
          const rise = Math.sqrt(Math.max(0, 1 - distance * distance));
          lower = Math.max(
            lower,
            lowerSillY + (wheelArchTopY - lowerSillY) * rise
          );
        }
      }
      return lower;
    }

    function addBox(parent, size, position, material, rotation = [0, 0, 0]) {
      return addMesh(
        parent,
        new THREE.BoxGeometry(size[0], size[1], size[2]),
        material,
        position,
        rotation
      );
    }

    function addQuad(parent, corners, material) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(corners.flat(), 3)
      );
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      geometry.computeVertexNormals();
      material.side = THREE.DoubleSide;
      return addMesh(parent, geometry, material);
    }

    function addSideQuad(parent, side, points, material, offset = 0.008) {
      const corners = points.map(([z, y]) => {
        const profile = profileAt(z);
        return [
          side * (profile.width + offset),
          y,
          z
        ];
      });
      return addQuad(parent, corners, material);
    }

    const mainShell = makePart(
      shellGeometryGroup,
      "shell-low-wide-body",
      "Low-wide short-course truck shell",
      "A single molded short-course shell with low hood, broad fenders, compact flat-roof cab, sloped windows and a short rear bed."
    );

    // One closed cross-section per longitudinal sample. The ten vertices
    // describe a flat hood/roof, short shoulder bevels, vertical sides, and
    // a shallow underside. Connecting them creates one coherent shell mesh.
    const ringSize = 10;
    const ringPositions = [];
    const ringIndices = [];
    const sampleCount = 200;

    for (let row = 0; row <= sampleCount; row++) {
      const z = THREE.MathUtils.lerp(-0.840, 0.840, row / sampleCount);
      const profile = profileAt(z);
      const width = profile.width;
      const top = profile.top;
      const bottom = lowerEdgeAt(z);

      const ring = [
        [0, top],
        [width * 0.78, top],
        [width, top - 0.018],
        [width, bottom],
        [width * 0.78, bottom - 0.012],
        [0, bottom - 0.020],
        [-width * 0.78, bottom - 0.012],
        [-width, bottom],
        [-width, top - 0.018],
        [-width * 0.78, top]
      ];

      for (const [x, y] of ring) ringPositions.push(x, y, z);
    }

    for (let row = 0; row < sampleCount; row++) {
      for (let column = 0; column < ringSize; column++) {
        const nextColumn = (column + 1) % ringSize;
        const a = row * ringSize + column;
        const b = row * ringSize + nextColumn;
        const c = (row + 1) * ringSize + column;
        const d = (row + 1) * ringSize + nextColumn;
        ringIndices.push(a, b, c, b, d, c);
      }
    }

    // Close the front and rear ends with triangle fans.
    const startCap = ringPositions.length / 3;
    ringPositions.push(0, (stations[0][2] + lowerSillY) * 0.5, -0.840);
    const endCap = ringPositions.length / 3;
    ringPositions.push(0, (stations[stations.length - 1][2] + lowerSillY) * 0.5, 0.840);
    for (let column = 0; column < ringSize; column++) {
      const nextColumn = (column + 1) % ringSize;
      ringIndices.push(startCap, nextColumn, column);
      const lastRing = sampleCount * ringSize;
      ringIndices.push(endCap, lastRing + column, lastRing + nextColumn);
    }

    const shellGeometry = new THREE.BufferGeometry();
    shellGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(ringPositions, 3)
    );
    shellGeometry.setIndex(ringIndices);
    shellGeometry.computeVertexNormals();
    const shellMesh = addMesh(mainShell, shellGeometry, orange);
    shellMesh.material.side = THREE.DoubleSide;

    // Four restrained arch-edge strips sit just outside the tire openings.
    // They follow the actual wheel centres and visual tire radius.
    for (const side of [-1, 1]) {
      for (const center of shellWheelCenters) {
        const archPoints = [];
        for (let i = 0; i <= 20; i++) {
          const angle = Math.PI * (i / 20);
          const z = center + Math.cos(angle) * wheelArchHalfLength;
          const y = wheelCenterY + visualTireRadius + 0.016 +
            Math.sin(angle) * 0.004;
          const profile = profileAt(z);
          archPoints.push(new THREE.Vector3(
            side * (profile.width + 0.012),
            y,
            z
          ));
        }
        const archCurve = new THREE.CatmullRomCurve3(archPoints);
        const arch = new THREE.Mesh(
          new THREE.TubeGeometry(archCurve, 40, 0.006, 6, false),
          charcoal
        );
        arch.castShadow = false;
        arch.receiveShadow = true;
        mainShell.add(arch);
      }

      // Single horizontal lower door stripe, kept below the window line.
      addSideQuad(mainShell, side, [
        [-0.105, 0.035],
        [0.245, 0.035],
        [0.245, 0.067],
        [-0.105, 0.067]
      ], charcoal, 0.012);

      // Small graphite fender-side insert, one per axle.
      for (const center of shellWheelCenters) {
        addSideQuad(mainShell, side, [
          [center - 0.105, 0.095],
          [center + 0.105, 0.095],
          [center + 0.105, 0.118],
          [center - 0.105, 0.118]
        ], orangeHighlight, 0.013);
      }

      // Clean side windows: one front pane and one rear pane, with a narrow
      // body-colour B-pillar left between them.
      addSideQuad(mainShell, side, [
        [-0.155, 0.116],
        [-0.080, 0.150],
        [0.000, 0.150],
        [0.000, 0.116]
      ], glass, 0.014);
      addSideQuad(mainShell, side, [
        [0.040, 0.148],
        [0.155, 0.148],
        [0.238, 0.123],
        [0.040, 0.123]
      ], glass, 0.014);

      // Small black mirror; no extra side plates or layered racing shapes.
      addBox(mainShell, [0.018, 0.020, 0.035],
        [side * 0.354, 0.143, -0.170], charcoal);
    }

    // Windshield and rear window lie on shallow, accurately placed planes.
    addQuad(mainShell, [
      [-0.267, 0.109, -0.198],
      [0.267, 0.109, -0.198],
      [0.236, 0.150, -0.080],
      [-0.236, 0.150, -0.080]
    ], glass);
    addQuad(mainShell, [
      [-0.236, 0.150, 0.165],
      [0.236, 0.150, 0.165],
      [0.270, 0.109, 0.274],
      [-0.270, 0.109, 0.274]
    ], glass);

    // The flat roof is only slightly above the windshield top. It stays
    // compact and low instead of creating a tall, rounded cab.
    addBox(mainShell, [0.548, 0.009, 0.225],
      [0, 0.158, 0.043], charcoal);
    addBox(mainShell, [0.510, 0.004, 0.195],
      [0, 0.164, 0.043], black);

    // Flat hood: one subtle dark centre stripe and two narrow orange edges.
    addBox(mainShell, [0.205, 0.003, 0.215],
      [0, 0.142, -0.432], charcoal);
    for (const side of [-1, 1]) {
      addBox(mainShell, [0.010, 0.003, 0.235],
        [side * 0.142, 0.142, -0.430], orangeHighlight);
    }

    // Short flat rear bed with only a shallow graphite insert.
    addBox(mainShell, [0.535, 0.004, 0.222],
      [0, 0.143, 0.474], graphite);
    for (const side of [-1, 1]) {
      addBox(mainShell, [0.012, 0.009, 0.245],
        [side * 0.309, 0.149, 0.474], charcoal);
    }

    // Simple number decal on each door.
    const numberCanvas = document.createElement("canvas");
    numberCanvas.width = 128;
    numberCanvas.height = 96;
    const numberContext = numberCanvas.getContext("2d");
    numberContext.fillStyle = "#172027";
    numberContext.fillRect(0, 0, 128, 96);
    numberContext.fillStyle = "#f5f4ef";
    numberContext.font = "bold 68px Arial";
    numberContext.textAlign = "center";
    numberContext.textBaseline = "middle";
    numberContext.fillText("27", 64, 49);
    const numberTexture = new THREE.CanvasTexture(numberCanvas);
    numberTexture.colorSpace = THREE.SRGBColorSpace;
    const numberMaterial = new THREE.MeshBasicMaterial({
      map: numberTexture,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1
    });
    for (const side of [-1, 1]) {
      addSideQuad(mainShell, side, [
        [0.040, 0.078],
        [0.165, 0.078],
        [0.165, 0.112],
        [0.040, 0.112]
      ], numberMaterial, 0.016);
    }

    // Thin grille, small headlights and simple full-width impact bumpers.
    addBox(mainShell, [0.405, 0.030, 0.012],
      [0, 0.096, -0.816], charcoal);
    for (let i = 0; i < 5; i++) {
      addBox(mainShell, [0.010, 0.021, 0.005],
        [-0.12 + i * 0.060, 0.096, -0.822], silver);
    }
    for (const side of [-1, 1]) {
      addBox(mainShell, [0.070, 0.028, 0.012],
        [side * 0.240, 0.102, -0.810], headlamp);
      addBox(mainShell, [0.065, 0.032, 0.010],
        [side * 0.245, 0.090, 0.810], tailLamp);
    }
    addBox(mainShell, [0.735, 0.050, 0.060],
      [0, 0.035, -0.820], graphite);
    addBox(mainShell, [0.735, 0.050, 0.060],
      [0, 0.035, 0.820], graphite);
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

  const classicShellVisual = makePart(
    shellGroup,
    "classic-orange-shell-visual",
    "Classic orange short-course shell",
    "The original orange, black and graphite short-course shell, including its low cab, front and rear windows, side number panel, wheel arches, grille and bumpers."
  );
  makeBodyShell(classicShellVisual);

  // Keep both body options available. The old shell is generated around the
  // current wheelbase, so its wheel arches line up without distorting it.
  let shellStyle = "prerunner";
  function setShellStyle(style) {
    const requested = style === "classic" ? "classic" : "prerunner";
    shellStyle = requested === "prerunner" && shellModel ? "prerunner" : "classic";
    prerunnerShellVisual.visible = shellStyle === "prerunner";
    classicShellVisual.visible = shellStyle === "classic";
    shellGroup.userData.partInfo = shellStyle === "classic"
      ? {
          id: "short-course-body-shell",
          label: "Classic orange short-course shell",
          description: "The original orange, black and graphite short-course shell, with its original styling restored and its wheel arches fitted to the current chassis."
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
  setShellStyle(shellModel ? "prerunner" : "classic");

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
    setShellVisible(visible) { shellGroup.visible = !!visible; },
    setShellStyle,
    get shellStyle() { return shellStyle; },
    setPlayerName
  };
}
  return makeCarVisual;
}
