import { RoundedBoxGeometry } from "https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/geometries/RoundedBoxGeometry.js";

// Builds the detailed chassis, wheels, and the separately removable shell.
export function createCarVisualFactory({ THREE, scene, VISUAL_CHASSIS_LENGTH_SCALE, vehicle, renderer }) {
function makeCarVisual(color, playerName = "") {
  const root = new THREE.Group();
  const chassisGroup = new THREE.Group();
  const shellGroup = new THREE.Group();
  root.add(chassisGroup, shellGroup);

  // The shell is a separate removable group, scaled to match the lengthened
  // chassis. Physics attachment points remain unchanged.
  chassisGroup.scale.set(1, 1, VISUAL_CHASSIS_LENGTH_SCALE);
  shellGroup.scale.set(1, 1, VISUAL_CHASSIS_LENGTH_SCALE);
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
  roundedBox(chassis, [0.49, 0.068, 0.94], carbon, [0, -0.045, 0], null, 0.035);
  roundedBox(chassis, [0.405, 0.015, 0.77], carbonEdge, [0, -0.005, 0.015], null, 0.014);
  roundedBox(chassis, [0.026, 0.035, 0.88], blackPlastic, [-0.218, 0.012, 0], null, 0.009);
  roundedBox(chassis, [0.026, 0.035, 0.88], blackPlastic, [0.218, 0.012, 0], null, 0.009);
  for (const x of [-0.16, 0.16]) {
    roundedBox(chassis, [0.018, 0.013, 0.76], alloy, [x, 0.008, 0.005], null, 0.005);
  }
  for (const z of [-0.39, -0.29, -0.19, 0.19, 0.29, 0.39]) {
    for (const x of [-0.17, 0.17]) addBolt(chassis, x, 0.026, z, 0.0065);
  }
  for (let i = 0; i < 7; i++) {
    roundedBox(chassis, [0.018, 0.012, 0.085], blackPlastic, [-0.105 + i * 0.035, 0.012, -0.32], null, 0.004);
    roundedBox(chassis, [0.018, 0.012, 0.085], blackPlastic, [-0.105 + i * 0.035, 0.012, 0.32], null, 0.004);
  }

  // Front and rear bulkheads / differential cases.
  for (const end of [
    { z: -0.355, id: "front-differential", label: "Front differential housing", desc: "Sealed front gearcase transfers drive to the left and right front half-shafts." },
    { z: 0.355, id: "rear-differential", label: "Rear differential housing", desc: "Rear gearcase distributes motor power to the rear half-shafts." }
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
  cylinderBetween(driveshaft, [0, 0.095, -0.275], [0, 0.095, 0.275], 0.014, alloy, 16);
  for (const z of [-0.245, 0.245]) {
    cylinderBetween(driveshaft, [0, 0.095, z - 0.018], [0, 0.095, z + 0.018], 0.027, darkMetal, 14);
    addMesh(driveshaft, new THREE.SphereGeometry(0.027, 12, 10), alloy, [0, 0.095, z]);
  }
  roundedBox(driveshaft, [0.075, 0.025, 0.11], blackPlastic, [0, 0.047, 0], null, 0.01);

  // Independent suspension arms, camber links and steering knuckles.
  for (const corner of [
    { side: -1, z: -0.29, name: "Front-left" },
    { side: 1, z: -0.29, name: "Front-right" },
    { side: -1, z: 0.29, name: "Rear-left" },
    { side: 1, z: 0.29, name: "Rear-right" }
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
    { z: -0.345, id: "front-shock-tower", label: "Front shock tower" },
    { z: 0.345, id: "rear-shock-tower", label: "Rear shock tower" }
  ]) {
    const tower = makePart(
      chassisGroup,
      end.id,
      end.label,
      "Reinforced vertical plate that anchors the upper shock eyes and suspension bracing."
    );
    roundedBox(tower, [0.47, 0.215, 0.032], carbonEdge, [0, 0.17, end.z], null, 0.012);
    roundedBox(tower, [0.30, 0.055, 0.045], blackPlastic, [0, 0.275, end.z], null, 0.012);
    for (const x of [-0.19, -0.11, 0, 0.11, 0.19]) {
      const hole = addMesh(tower, new THREE.CylinderGeometry(0.012, 0.012, 0.007, 12), blackPlastic,
        [x, 0.19, end.z + (end.z < 0 ? -0.02 : 0.02)], [Math.PI / 2, 0, 0]);
      hole.castShadow = false;
      addBolt(tower, x, 0.29, end.z, 0.0055);
    }
    for (const side of [-1, 1]) {
      cylinderBetween(tower, [side * 0.17, 0.07, end.z], [side * 0.21, 0.275, end.z], 0.012, alloy, 10);
    }
  }

  // Four individually selectable oil-filled coil-over dampers.
  for (const corner of [
    { side: -1, z: -0.29, label: "Front-left" },
    { side: 1, z: -0.29, label: "Front-right" },
    { side: -1, z: 0.29, label: "Rear-left" },
    { side: 1, z: 0.29, label: "Rear-right" }
  ]) {
    const s = corner.side;
    const z = corner.z;
    const top = [s * 0.19, 0.275, z + (z < 0 ? 0.045 : -0.045)];
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
  const steering = makePart(
    chassisGroup,
    "steering-servo",
    "Water-resistant steering servo",
    "Compact high-torque servo turns the front wheels through the servo horn, steering rack and adjustable tie rods."
  );
  roundedBox(steering, [0.15, 0.072, 0.105], blue, [-0.105, 0.105, -0.30], null, 0.016);
  roundedBox(steering, [0.12, 0.012, 0.08], blueDark, [-0.105, 0.146, -0.30], null, 0.009);
  for (const x of [-0.16, -0.05]) {
    roundedBox(steering, [0.025, 0.012, 0.05], alloy, [x, 0.065, -0.30], null, 0.004);
  }
  cylinderBetween(steering, [-0.105, 0.15, -0.30], [-0.105, 0.188, -0.30], 0.013, alloy, 12);
  const servoHorn = addMesh(steering, new THREE.SphereGeometry(0.026, 12, 10), red, [-0.105, 0.19, -0.30]);
  servoHorn.scale.set(1.35, 0.5, 1.0);
  roundedBox(steering, [0.31, 0.025, 0.035], darkMetal, [0.025, 0.075, -0.36], null, 0.009);
  for (const side of [-1, 1]) {
    cylinderBetween(steering, [0.02, 0.095, -0.36], [side * 0.29, 0.045, -0.29], 0.009, alloy, 10);
    addBolt(steering, side * 0.29, 0.07, -0.29, 0.006);
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

  // Front / rear bumpers and body posts remain exposed with the shell removed.
  const frontBumper = makePart(
    chassisGroup,
    "front-bumper",
    "Front impact bumper",
    "Flexible front bumper and two mounting braces protect the nose of the chassis during light bumps."
  );
  roundedBox(frontBumper, [0.68, 0.085, 0.09], blackPlastic, [0, -0.005, -0.55], null, 0.025);
  roundedBox(frontBumper, [0.48, 0.045, 0.06], carbonEdge, [0, 0.035, -0.535], null, 0.015);
  for (const side of [-1, 1]) {
    cylinderBetween(frontBumper, [side * 0.12, -0.03, -0.46], [side * 0.23, -0.02, -0.53], 0.018, alloy, 10);
  }

  const rearStructure = makePart(
    chassisGroup,
    "rear-bumper-wing-support",
    "Rear bumper and wing support frame",
    "The rear bumper protects the back of the chassis. The open tubular frame supports the rear wing when the body shell is removed."
  );
  roundedBox(rearStructure, [0.64, 0.07, 0.085], blackPlastic, [0, -0.005, 0.54], null, 0.022);
  for (const side of [-1, 1]) {
    cylinderBetween(rearStructure, [side * 0.19, 0.015, 0.40], [side * 0.19, 0.28, 0.57], 0.015, carbonEdge, 12);
    cylinderBetween(rearStructure, [side * 0.19, 0.28, 0.57], [side * 0.31, 0.31, 0.67], 0.014, alloy, 10);
    cylinderBetween(rearStructure, [side * 0.31, 0.31, 0.67], [side * 0.19, 0.015, 0.40], 0.012, blackPlastic, 10);
  }
  cylinderBetween(rearStructure, [-0.31, 0.31, 0.67], [0.31, 0.31, 0.67], 0.014, carbonEdge, 12);
  cylinderBetween(rearStructure, [-0.19, 0.28, 0.57], [0.19, 0.28, 0.57], 0.014, alloy, 12);
  roundedBox(rearStructure, [0.60, 0.035, 0.14], carbon, [0, 0.335, 0.66], [-0.10, 0, 0], 0.014);

  const bodyPosts = makePart(
    chassisGroup,
    "body-mount-posts",
    "Front and rear body-mount posts",
    "Adjustable vertical posts support the removable polycarbonate shell. They remain visible even with the shell removed."
  );
  for (const z of [-0.47, 0.47]) {
    for (const side of [-1, 1]) {
      cylinderBetween(bodyPosts, [side * 0.17, -0.01, z], [side * 0.17, 0.26, z], 0.012, blackPlastic, 10);
      cylinderBetween(bodyPosts, [side * 0.17, 0.20, z], [side * 0.17, 0.235, z], 0.017, red, 10);
    }
  }

  // Four independent tire / rim assemblies. Wheel pivots are still returned
  // in the same order and kept at the same suspension coordinates.
  const wheelPivots = [];
  const wheelInfo = [
    { x: -0.305, y: -0.018, z: -0.29, id: "front-left-wheel", label: "Front-left tire and wheel" },
    { x: 0.305, y: -0.018, z: -0.29, id: "front-right-wheel", label: "Front-right tire and wheel" },
    { x: -0.305, y: -0.018, z: 0.29, id: "rear-left-wheel", label: "Rear-left tire and wheel" },
    { x: 0.305, y: -0.018, z: 0.29, id: "rear-right-wheel", label: "Rear-right tire and wheel" }
  ];
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
  function makeBodyShell() {
    // Low, wide short-course proportions rebuilt around the existing wheelbase:
    // long low nose, shallow hood, broad fenders, low cab, and short rear bed.
    // Geometry is intentionally panelled and angular rather than lofted.
    const shellGeometryGroup = new THREE.Group();
    shellGeometryGroup.name = "shell-geometry";
    // 0.75 * the outer 1.26 visual scale gives an overall shell length close
    // to 1.70 times the current visual wheelbase.
    shellGeometryGroup.scale.z = 0.75;
    shellGroup.add(shellGeometryGroup);

    const orange = new THREE.MeshStandardMaterial({
      color: 0xff4b0b, roughness: 0.48, metalness: 0.02,
      side: THREE.DoubleSide
    });
    const orangeLight = new THREE.MeshStandardMaterial({
      color: 0xff6826, roughness: 0.45, metalness: 0.02,
      side: THREE.DoubleSide
    });
    const orangeDark = new THREE.MeshStandardMaterial({
      color: 0xc9360e, roughness: 0.58, metalness: 0.02,
      side: THREE.DoubleSide
    });
    const black = new THREE.MeshStandardMaterial({
      color: 0x11171c, roughness: 0.54, metalness: 0.06,
      side: THREE.DoubleSide
    });
    const charcoal = new THREE.MeshStandardMaterial({
      color: 0x30383e, roughness: 0.58, metalness: 0.12,
      side: THREE.DoubleSide
    });
    const graphite = new THREE.MeshStandardMaterial({
      color: 0x5a646a, roughness: 0.55, metalness: 0.2,
      side: THREE.DoubleSide
    });
    const silver = new THREE.MeshStandardMaterial({
      color: 0xb6bec2, roughness: 0.36, metalness: 0.58,
      side: THREE.DoubleSide
    });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x101c26,
      roughness: 0.3,
      metalness: 0.1,
      clearcoat: 0.7,
      clearcoatRoughness: 0.22,
      side: THREE.DoubleSide
    });
    const headlamp = new THREE.MeshStandardMaterial({
      color: 0xf4e4c7,
      emissive: 0x694626,
      emissiveIntensity: 0.12
    });
    const tailLamp = new THREE.MeshStandardMaterial({
      color: 0xb52a25,
      emissive: 0x390706,
      emissiveIntensity: 0.12
    });

    // Shell-local wheel centres account for the shell's inner 0.75 Z scale.
    const wheelCenterY =
      vehicle.wheelInfos[0].chassisConnectionPointLocal.y -
      vehicle.wheelInfos[0].suspensionRestLength + 0.028;
    const wheelRadius = vehicle.wheelInfos[0].radius || 0.13;
    const archCenterZ = [-0.29 / 0.75, 0.29 / 0.75];
    const archHalfLength = 0.164;
    const skirtY = -0.052;
    const archCrownY = wheelCenterY + wheelRadius + 0.026;

    // Body stations are short and close to the wheelbase. Each station is
    // [longitudinal position, half-width, deck height].
    const stations = [
      [-0.660, 0.215, 0.155],
      [-0.620, 0.295, 0.185],
      [-0.535, 0.350, 0.205],
      [-0.475, 0.378, 0.238],
      [-0.390, 0.382, 0.252],
      [-0.300, 0.376, 0.223],
      [-0.205, 0.365, 0.205],
      [-0.105, 0.355, 0.210],
      [0.185, 0.355, 0.210],
      [0.285, 0.370, 0.205],
      [0.380, 0.382, 0.250],
      [0.465, 0.378, 0.244],
      [0.545, 0.350, 0.205],
      [0.620, 0.295, 0.178],
      [0.660, 0.225, 0.150]
    ];

    function profileAt(z) {
      if (z <= stations[0][0]) {
        return { z: stations[0][0], width: stations[0][1], top: stations[0][2] };
      }
      const last = stations[stations.length - 1];
      if (z >= last[0]) return { z: last[0], width: last[1], top: last[2] };
      for (let i = 0; i < stations.length - 1; i++) {
        const a = stations[i];
        const b = stations[i + 1];
        if (z >= a[0] && z <= b[0]) {
          const t = (z - a[0]) / (b[0] - a[0]);
          return {
            z,
            width: THREE.MathUtils.lerp(a[1], b[1], t),
            top: THREE.MathUtils.lerp(a[2], b[2], t)
          };
        }
      }
      return { z: last[0], width: last[1], top: last[2] };
    }

    function lowerEdgeAt(z) {
      let y = skirtY;
      for (const center of archCenterZ) {
        const normalized = Math.abs(z - center) / archHalfLength;
        if (normalized < 1) {
          const t = THREE.MathUtils.clamp((1 - normalized) / 0.48, 0, 1);
          // A broad, slightly squared crown keeps the arch close to the tire
          // while avoiding the thin, overly round fender cut-out.
          const rise = t < 0.55 ? 1 : 1 - (t - 0.55) * 0.42;
          y = Math.max(y, skirtY + (archCrownY - skirtY) * rise);
        }
      }
      return y;
    }

    function box(parent, size, position, material, rotation = [0, 0, 0]) {
      return addMesh(
        parent,
        new THREE.BoxGeometry(size[0], size[1], size[2]),
        material,
        position,
        rotation
      );
    }

    function quad(parent, points, material) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(points.flat(), 3)
      );
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      geometry.computeVertexNormals();
      material.side = THREE.DoubleSide;
      return addMesh(parent, geometry, material);
    }

    function sidePolygon(parent, side, points, material, offset = 0.012) {
      const contour = points.map(([z, y]) => new THREE.Vector2(z, y));
      const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
      const positions = [];
      for (const [z, y] of points) {
        positions.push(side * (profileAt(z).width + offset), y, z);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
      );
      geometry.setIndex(triangles.flat());
      geometry.computeVertexNormals();
      material.side = THREE.DoubleSide;
      return addMesh(parent, geometry, material);
    }

    const shellBody = makePart(
      shellGeometryGroup,
      "shell-low-wide-main",
      "Low-profile short-course body shell",
      "Wide, low short-course shell with a long flat hood, low cab, broad fenders, short rear bed and wheel openings fitted to the tires."
    );

    // Build a flat, continuous deck from sampled longitudinal stations.
    // The raised shoulder line is deliberately subtle; the hood and bed read
    // as broad, nearly level surfaces rather than curved humps.
    const longitudinalSamples = [];
    for (let i = 0; i <= 120; i++) {
      longitudinalSamples.push(THREE.MathUtils.lerp(-0.660, 0.660, i / 120));
    }
    const deckRows = longitudinalSamples.length;
    const deckColumns = 12;
    const deckPositions = [];
    const deckIndices = [];
    for (let row = 0; row < deckRows; row++) {
      const z = longitudinalSamples[row];
      const profile = profileAt(z);
      for (let column = 0; column <= deckColumns; column++) {
        const across = -1 + 2 * column / deckColumns;
        const x = profile.width * across;
        const shoulderDrop = 0.010 * Math.pow(Math.abs(across), 3);
        deckPositions.push(x, profile.top - shoulderDrop, z);
      }
    }
    for (let row = 0; row < deckRows - 1; row++) {
      for (let column = 0; column < deckColumns; column++) {
        const a = row * (deckColumns + 1) + column;
        const b = a + 1;
        const c = a + deckColumns + 2;
        const d = a + deckColumns + 1;
        deckIndices.push(a, b, d, b, c, d);
      }
    }
    const deckGeometry = new THREE.BufferGeometry();
    deckGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(deckPositions, 3)
    );
    deckGeometry.setIndex(deckIndices);
    deckGeometry.computeVertexNormals();
    addMesh(shellBody, deckGeometry, orange);

    // Flat vertical side skins with an opening cut around each actual tire.
    const sideSamples = new Set(longitudinalSamples);
    for (const center of archCenterZ) {
      for (let i = 0; i <= 18; i++) {
        sideSamples.add(THREE.MathUtils.clamp(
          center - archHalfLength + (2 * archHalfLength * i / 18),
          -0.660,
          0.660
        ));
      }
    }
    const sortedSideSamples = [...sideSamples].sort((a, b) => a - b);
    for (const side of [-1, 1]) {
      const positions = [];
      const indices = [];
      for (const z of sortedSideSamples) {
        const profile = profileAt(z);
        const x = side * profile.width;
        positions.push(x, lowerEdgeAt(z), z);
        positions.push(x, profile.top, z);
      }
      for (let i = 0; i < sortedSideSamples.length - 1; i++) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices.push(a, c, b, b, c, d);
      }
      const sideGeometry = new THREE.BufferGeometry();
      sideGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
      );
      sideGeometry.setIndex(indices);
      sideGeometry.computeVertexNormals();
      const sideMesh = addMesh(shellBody, sideGeometry, orange);
      sideMesh.material.side = THREE.DoubleSide;

      // Broad block-style arch lips, made from short connected segments.
      for (const center of archCenterZ) {
        const archSamples = [-1, -0.72, -0.38, 0, 0.38, 0.72, 1];
        for (let i = 0; i < archSamples.length - 1; i++) {
          const z0 = center + archSamples[i] * archHalfLength;
          const z1 = center + archSamples[i + 1] * archHalfLength;
          const y0 = lowerEdgeAt(z0) + 0.007;
          const y1 = lowerEdgeAt(z1) + 0.007;
          const middle = (z0 + z1) * 0.5;
          const profile = profileAt(middle);
          const length = Math.sqrt((z1 - z0) ** 2 + (y1 - y0) ** 2) + 0.018;
          const angle = Math.atan2(y1 - y0, z1 - z0);
          box(
            shellBody,
            [0.022, 0.021, length],
            [side * (profile.width + 0.020), (y0 + y1) * 0.5, middle],
            black,
            [angle, 0, 0]
          );
        }
      }

      // Low black sill and two straight livery bands keep the side graphic
      // broad and horizontal, following the long flat short-course flank.
      sidePolygon(shellBody, side, [
        [-0.23, 0.010], [-0.12, 0.038], [0.30, 0.038],
        [0.60, 0.018], [0.62, -0.018], [0.30, -0.018],
        [-0.12, -0.018]
      ], black, 0.017);
      sidePolygon(shellBody, side, [
        [-0.22, 0.115], [-0.09, 0.158], [0.24, 0.143],
        [0.58, 0.105], [0.56, 0.082], [0.24, 0.105],
        [-0.09, 0.123]
      ], charcoal, 0.019);
      sidePolygon(shellBody, side, [
        [-0.16, 0.165], [-0.04, 0.190], [0.25, 0.171],
        [0.55, 0.135], [0.53, 0.151], [0.24, 0.190],
        [-0.04, 0.205]
      ], orangeLight, 0.020);
    }

    // Hood: long, very low, and almost flat. Its leading edge tapers gently
    // toward the nose, while the rear edge rises only into the windshield cowl.
    box(shellBody, [0.56, 0.012, 0.305], [0, 0.211, -0.435], orangeDark);
    box(shellBody, [0.535, 0.009, 0.286], [0, 0.220, -0.435], orange);
    box(shellBody, [0.34, 0.006, 0.235], [0, 0.226, -0.438], black);
    box(shellBody, [0.310, 0.004, 0.205], [0, 0.231, -0.438], orangeDark);
    for (const side of [-1, 1]) {
      box(shellBody, [0.012, 0.004, 0.25],
        [side * 0.292, 0.222, -0.44], orangeLight);
      for (let i = 0; i < 3; i++) {
        box(shellBody, [0.055, 0.004, 0.008],
          [side * 0.205, 0.235, -0.365 + i * 0.026], silver);
      }
    }

    // Low cab: the roof is only modestly higher than the fender tops. Its
    // footprint is broad and the front/rear glass slopes are long and shallow.
    quad(shellBody, [
      [-0.292, 0.222, -0.195],
      [0.292, 0.222, -0.195],
      [0.278, 0.322, -0.065],
      [-0.278, 0.322, -0.065]
    ], glass);
    quad(shellBody, [
      [-0.278, 0.322, 0.190],
      [0.278, 0.322, 0.190],
      [0.300, 0.222, 0.300],
      [-0.300, 0.222, 0.300]
    ], glass);

    const cabRoof = box(
      shellBody,
      [0.575, 0.018, 0.285],
      [0, 0.329, 0.064],
      black
    );
    cabRoof.castShadow = true;
    box(shellBody, [0.535, 0.006, 0.255], [0, 0.341, 0.064], charcoal);

    for (const side of [-1, 1]) {
      // Side windows follow the low roof line and remain wide enough to read
      // as a pickup-style cab rather than a tall upright cabin.
      sidePolygon(shellBody, side, [
        [-0.075, 0.224], [-0.025, 0.316],
        [0.055, 0.316], [0.055, 0.224]
      ], glass, 0.024);
      sidePolygon(shellBody, side, [
        [0.090, 0.316], [0.185, 0.316],
        [0.275, 0.224], [0.090, 0.224]
      ], glass, 0.024);

      // A-pillars, B-pillar and rear cab pillar, kept narrow and low.
      sidePolygon(shellBody, side, [
        [-0.205, 0.212], [-0.183, 0.212],
        [-0.045, 0.332], [-0.070, 0.332]
      ], black, 0.028);
      sidePolygon(shellBody, side, [
        [0.055, 0.332], [0.078, 0.332],
        [0.078, 0.212], [0.055, 0.212]
      ], black, 0.028);
      sidePolygon(shellBody, side, [
        [0.185, 0.332], [0.209, 0.332],
        [0.315, 0.205], [0.290, 0.205]
      ], black, 0.028);

      // Roof drip rail and compact mirror.
      box(shellBody, [0.018, 0.009, 0.285],
        [side * 0.300, 0.344, 0.064], orangeLight);
      box(shellBody, [0.020, 0.025, 0.065],
        [side * 0.385, 0.265, -0.165], black);
      box(shellBody, [0.050, 0.024, 0.050],
        [side * 0.405, 0.267, -0.192], charcoal);
    }

    // Rear bed is short, broad and nearly level with the hood. Shallow rails
    // and grooves make it read as a molded short-course pickup bed.
    box(shellBody, [0.650, 0.012, 0.270], [0, 0.211, 0.478], graphite);
    box(shellBody, [0.610, 0.006, 0.232], [0, 0.220, 0.478], charcoal);
    for (const side of [-1, 1]) {
      box(shellBody, [0.022, 0.027, 0.270],
        [side * 0.326, 0.230, 0.478], silver);
      box(shellBody, [0.010, 0.013, 0.235],
        [side * 0.306, 0.235, 0.478], black);
    }
    for (let i = 0; i < 5; i++) {
      box(shellBody, [0.010, 0.003, 0.190],
        [-0.235 + i * 0.117, 0.225, 0.478], graphite);
    }

    // Fictional number panel and side keylines. This keeps the existing
    // orange/black/gray livery while leaving the silhouette clean.
    const badgeCanvas = document.createElement("canvas");
    badgeCanvas.width = 256;
    badgeCanvas.height = 160;
    const badgeContext = badgeCanvas.getContext("2d");
    badgeContext.fillStyle = "#11171c";
    badgeContext.fillRect(0, 0, 256, 160);
    badgeContext.strokeStyle = "#b6bec2";
    badgeContext.lineWidth = 8;
    badgeContext.strokeRect(6, 6, 244, 148);
    badgeContext.fillStyle = "#ff6826";
    badgeContext.font = "900 17px Arial";
    badgeContext.textAlign = "center";
    badgeContext.fillText("SHORT COURSE", 128, 31);
    badgeContext.fillStyle = "#f7f7f4";
    badgeContext.font = "900 100px Arial";
    badgeContext.fillText("27", 128, 125);
    const badgeTexture = new THREE.CanvasTexture(badgeCanvas);
    badgeTexture.colorSpace = THREE.SRGBColorSpace;
    badgeTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const badgeMaterial = new THREE.MeshBasicMaterial({
      map: badgeTexture,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });
    for (const side of [-1, 1]) {
      sidePolygon(shellBody, side, [
        [0.015, 0.116], [0.215, 0.116],
        [0.215, 0.185], [0.015, 0.185]
      ], badgeMaterial, 0.030);
      sidePolygon(shellBody, side, [
        [-0.185, 0.205], [-0.105, 0.216],
        [0.220, 0.198], [0.510, 0.164],
        [0.490, 0.178], [0.215, 0.219],
        [-0.105, 0.235]
      ], silver, 0.025);
    }

    // Wide squared front bumper, slim grille and low rectangular headlights.
    box(shellBody, [0.470, 0.042, 0.024], [0, 0.176, -0.650], black);
    for (let i = 0; i < 7; i++) {
      box(shellBody, [0.012, 0.028, 0.008],
        [-0.18 + i * 0.06, 0.176, -0.666], silver);
    }
    for (const side of [-1, 1]) {
      box(shellBody, [0.085, 0.040, 0.018],
        [side * 0.242, 0.190, -0.635], charcoal);
      box(shellBody, [0.060, 0.022, 0.009],
        [side * 0.242, 0.191, -0.648], headlamp);
    }
    box(shellBody, [0.780, 0.065, 0.088],
      [0, 0.118, -0.682], graphite);
    box(shellBody, [0.610, 0.018, 0.028],
      [0, 0.153, -0.724], black);

    // Short tailgate, horizontal tail lamps and wide rear bumper.
    box(shellBody, [0.550, 0.050, 0.020], charcoal, [0, 0.190, 0.640]);
    box(shellBody, [0.300, 0.010, 0.008], black, [0, 0.218, 0.653]);
    for (const side of [-1, 1]) {
      box(shellBody, [0.075, 0.038, 0.018],
        [side * 0.244, 0.194, 0.656], tailLamp);
      box(shellBody, [0.110, 0.014, 0.014],
        [side * 0.242, 0.155, 0.661], silver);
    }
    box(shellBody, [0.780, 0.066, 0.090],
      [0, 0.112, 0.680], graphite);
    box(shellBody, [0.600, 0.018, 0.028],
      [0, 0.146, 0.722], black);

    // The entire low/wide shell remains one removable assembly and one hover
    // target; none of its individual mesh details receives partInfo.
  }

  makeBodyShell();

  // All painted shell surfaces share one garage hover identity. The chassis
  // retains its own individual component labels when the shell is removed.
  shellGroup.userData.partInfo = {
    id: "short-course-body-shell",
    label: "Short-course truck body shell",
    description: "Complete orange, black and graphite-gray short-course body shell, including the hood, cab, windows, rear bed, fenders and exterior trim."
  };
  shellGroup.traverse((object) => {
    if (object !== shellGroup && object.userData) {
      delete object.userData.partInfo;
    }
  });

  if (playerName) {
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 512;
    labelCanvas.height = 128;
    const ctx = labelCanvas.getContext("2d");
    ctx.fillStyle = "rgba(13,20,29,.82)";
    ctx.beginPath();
    ctx.roundRect(8, 14, 496, 100, 28);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 46px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(playerName.slice(0, 18), 256, 64);
    const texture = new THREE.CanvasTexture(labelCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture, transparent: true, depthWrite: false
    }));
    tag.position.set(0, 0.95, 0);
    tag.scale.set(1.34, 0.34, 1);
    root.add(tag);
  }

  scene.add(root);
  return {
    root,
    wheelPivots,
    shellGroup,
    chassisGroup,
    setShellVisible(visible) { shellGroup.visible = !!visible; }
  };
}
  return makeCarVisual;
}
