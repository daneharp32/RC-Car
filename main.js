import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js";
import { RoundedBoxGeometry } from "https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/geometries/RoundedBoxGeometry.js";
import * as CANNON from "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js";
import { joinRoom, selfId } from "https://esm.sh/trystero@0.26.0";

const $ = (id) => document.getElementById(id);
const canvas = $("gameCanvas");
const joinPanel = $("joinPanel");
const mainMenuPanel = $("mainMenuPanel");
const garagePanel = $("garagePanel");
const joinButton = $("joinButton");
const joinError = $("joinError");
const hud = $("hud");
const toast = $("toast");
const FIXED_STEP = 1 / 60;
const APP_ID = "io.daneharp32.rcpitlane";

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb6c8cc);
scene.fog = new THREE.Fog(0xb6c8cc, 65, 155);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 180);
camera.position.set(0, 3.1, 5.8);

const hemi = new THREE.HemisphereLight(0xe7f1f4, 0x6b5943, 1.45);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffe2bd, 2.15);
sun.position.set(-8, 15, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
sun.shadow.camera.left = -24;
sun.shadow.camera.right = 24;
sun.shadow.camera.top = 24;
sun.shadow.camera.bottom = -24;
sun.shadow.bias = -0.00015;
scene.add(sun);

const fill = new THREE.DirectionalLight(0xb8d8e9, 0.65);
fill.position.set(8, 6, -10);
scene.add(fill);

// Single large ground surface for the open practice field.
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xa18d70, roughness: 1 });
const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), groundMaterial);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.position.y = -0.025;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

const grid = new THREE.GridHelper(100, 50, 0x786d5d, 0xa99a81);
grid.position.y = 0.002;
grid.material.transparent = true;
grid.material.opacity = 0.09;
scene.add(grid);

const jumpLocations = [
  // Main, taller short-course kicker. The gradual approach keeps it drivable.
  { x: 0, z: -13, yaw: 0, width: 6.8, length: 6.2, height: 2.25 },
  { x: -15, z: 7, yaw: 0, width: 4.8, length: 4.8, height: 0.95 },
  { x: 16, z: 18, yaw: 0, width: 5.0, length: 5.0, height: 1.05 },
  { x: 4, z: 34, yaw: 0, width: 4.6, length: 4.8, height: 0.9 }
];
const jumpMaterial = new THREE.MeshStandardMaterial({ color: 0x806b50, roughness: 0.96 });
const arenaVisuals = [groundMesh, grid];
const rampVisuals = [];

function makeRampGeometry(width, length, height) {
  const w = width / 2;
  const l = length / 2;
  const vertices = [
    [-w, 0, l], [w, 0, l], [-w, 0, -l],
    [w, 0, -l], [-w, height, -l], [w, height, -l]
  ];
  const faces = [
    [0, 2, 3, 1], [0, 1, 5, 4], [0, 4, 2],
    [1, 3, 5], [2, 4, 5, 3]
  ];
  const indices = [];
  for (const face of faces) {
    for (let i = 1; i < face.length - 1; i++) indices.push(face[0], face[i], face[i + 1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices.flat(), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

for (const jump of jumpLocations) {
  const ramp = new THREE.Mesh(
    makeRampGeometry(jump.width, jump.length, jump.height),
    jumpMaterial
  );
  ramp.position.set(jump.x, 0, jump.z);
  ramp.rotation.y = jump.yaw;
  ramp.castShadow = true;
  ramp.receiveShadow = true;
  scene.add(ramp);
  rampVisuals.push(ramp);
}
arenaVisuals.push(...rampVisuals);

// Physics: Cannon's RaycastVehicle applies suspension and tire impulses only
// when each wheel ray has actually found a surface to touch.
const world = new CANNON.World({
  gravity: new CANNON.Vec3(0, -9.82, 0)
});
world.broadphase = new CANNON.SAPBroadphase(world);
world.solver.iterations = 14;
world.allowSleep = false;
world.defaultContactMaterial.friction = 0.35;
world.defaultContactMaterial.restitution = 0.02;

const groundBody = new CANNON.Body({ mass: 0, material: new CANNON.Material("dirt") });
groundBody.addShape(new CANNON.Plane());
groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
world.addBody(groundBody);

// Matching convex wedge colliders keep the approach edge flush with the ground.
for (const jump of jumpLocations) {
  const w = jump.width / 2;
  const l = jump.length / 2;
  const h = jump.height;
  const vertices = [
    new CANNON.Vec3(-w, 0, l), new CANNON.Vec3(w, 0, l),
    new CANNON.Vec3(-w, 0, -l), new CANNON.Vec3(w, 0, -l),
    new CANNON.Vec3(-w, h, -l), new CANNON.Vec3(w, h, -l)
  ];
  const faces = [
    [0, 2, 3, 1], [0, 1, 5, 4], [0, 4, 2],
    [1, 3, 5], [2, 4, 5, 3]
  ];
  const rampBody = new CANNON.Body({ mass: 0, material: groundBody.material });
  rampBody.addShape(new CANNON.ConvexPolyhedron({ vertices, faces }));
  rampBody.position.set(jump.x, 0, jump.z);
  rampBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), jump.yaw);
  world.addBody(rampBody);
}

const chassisMaterial = new CANNON.Material("chassis");
world.addContactMaterial(new CANNON.ContactMaterial(chassisMaterial, groundBody.material, {
  friction: 0.25,
  restitution: 0.02,
  contactEquationStiffness: 1e7
}));

let spawnHash = 0;
for (let i = 0; i < selfId.length; i++) spawnHash = (spawnHash * 31 + selfId.charCodeAt(i)) | 0;
const spawnAngle = (Math.abs(spawnHash) % 8) * (Math.PI / 4);
const spawnX = Math.cos(spawnAngle) * 3;
const spawnZ = Math.sin(spawnAngle) * 3;

const chassisBody = new CANNON.Body({
  mass: 8.0,
  material: chassisMaterial,
  position: new CANNON.Vec3(spawnX, 0.24, spawnZ),
  linearDamping: 0.10,
  angularDamping: 0.72
});
chassisBody.addShape(new CANNON.Box(new CANNON.Vec3(0.28, 0.075, 0.41)));
chassisBody.allowSleep = false;

const vehicle = new CANNON.RaycastVehicle({
  chassisBody,
  indexForwardAxis: 2,
  indexRightAxis: 0,
  indexUpAxis: 1
});

const wheelPositions = [
  [-0.305, -0.018, -0.29],
  [ 0.305, -0.018, -0.29],
  [-0.305, -0.018,  0.29],
  [ 0.305, -0.018,  0.29]
];

// Visual-only length increase. Physics wheel attachment points stay unchanged.
const VISUAL_CHASSIS_LENGTH_SCALE = 1.26;

for (let i = 0; i < 4; i++) {
  const [x, y, z] = wheelPositions[i];
  vehicle.addWheel({
    chassisConnectionPointLocal: new CANNON.Vec3(x, y, z),
    directionLocal: new CANNON.Vec3(0, -1, 0),
    axleLocal: new CANNON.Vec3(-1, 0, 0),
    suspensionRestLength: 0.12,
    suspensionStiffness: 46,
    dampingCompression: 5.0,
    dampingRelaxation: 4.2,
    maxSuspensionTravel: 0.16,
    maxSuspensionForce: 285,
    radius: 0.13,
    frictionSlip: 4.8,
    rollInfluence: 0.08,
    isFrontWheel: i < 2,
    useCustomSlidingRotationalSpeed: true,
    customSlidingRotationalSpeed: 18
  });
}
vehicle.addToWorld(world);

const rubberMaterial = new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.96 });
const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xabb5ba, metalness: 0.68, roughness: 0.34 });
const hubMaterial = new THREE.MeshStandardMaterial({ color: 0x333b40, metalness: 0.35, roughness: 0.55 });

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
    const shellGeometryGroup = new THREE.Group();
    shellGeometryGroup.name = "shell-geometry";
    // Chassis and shell have an overall visual length scale of 1.26.
    // This inner scale keeps the body length realistic relative to the wheelbase.
    shellGeometryGroup.scale.z = 0.75;
    shellGroup.add(shellGeometryGroup);

    const orange = new THREE.MeshStandardMaterial({
      color: 0xff4b0b, roughness: 0.36, metalness: 0.025
    });
    const orangeLight = new THREE.MeshStandardMaterial({
      color: 0xff6420, roughness: 0.38, metalness: 0.02
    });
    const deepOrange = new THREE.MeshStandardMaterial({
      color: 0xd83a08, roughness: 0.42, metalness: 0.02
    });
    const black = new THREE.MeshStandardMaterial({
      color: 0x10151a, roughness: 0.43, metalness: 0.08
    });
    const charcoal = new THREE.MeshStandardMaterial({
      color: 0x30383d, roughness: 0.5, metalness: 0.12
    });
    const gray = new THREE.MeshStandardMaterial({
      color: 0x737e84, roughness: 0.45, metalness: 0.24
    });
    const grayLight = new THREE.MeshStandardMaterial({
      color: 0xb0b8bc, roughness: 0.31, metalness: 0.68
    });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x0b1721, roughness: 0.2, metalness: 0.15,
      clearcoat: 0.85, clearcoatRoughness: 0.14,
      transparent: true, opacity: 0.96, side: THREE.DoubleSide
    });
    const lamp = new THREE.MeshStandardMaterial({
      color: 0xf7e7c8, emissive: 0x8b592a, emissiveIntensity: 0.16,
      roughness: 0.25
    });
    const redLamp = new THREE.MeshStandardMaterial({
      color: 0xb52724, emissive: 0x4d0807, emissiveIntensity: 0.15
    });

    // The longitudinal profile controls the entire continuous shell.
    // Negative Z is the nose; positive Z is the rear bed.
    const profilePoints = [
      [-0.72, 0.250, 0.215],
      [-0.64, 0.330, 0.264],
      [-0.49, 0.374, 0.294],
      [-0.30, 0.374, 0.304],
      [-0.19, 0.374, 0.344],
      [-0.075, 0.374, 0.474],
      [0.205, 0.374, 0.490],
      [0.305, 0.374, 0.370],
      [0.425, 0.374, 0.310],
      [0.605, 0.374, 0.286],
      [0.720, 0.286, 0.230]
    ];
    const profileCurve = new THREE.CatmullRomCurve3(
      profilePoints.map(([z, width, top]) => new THREE.Vector3(z, width, top)),
      false,
      "centripetal"
    );
    const shellSideSkirtY = -0.055;
    const shellWheelCenterY =
      vehicle.wheelInfos[0].chassisConnectionPointLocal.y -
      vehicle.wheelInfos[0].suspensionRestLength + 0.028;
    const shellWheelArchHalfLength = 0.19;
    const shellWheelArchCenters = [-0.29 / 0.75, 0.29 / 0.75];

    function shellLowerEdgeAt(z) {
      let edgeY = shellSideSkirtY;
      for (const centerZ of shellWheelArchCenters) {
        const t = Math.abs(z - centerZ) / shellWheelArchHalfLength;
        if (t < 1) {
          const archY = shellSideSkirtY +
            (shellWheelCenterY + 0.19 - shellSideSkirtY) *
            Math.cos(t * Math.PI * 0.5);
          edgeY = Math.max(edgeY, archY);
        }
      }
      return edgeY;
    }

    const sampledProfiles = profileCurve.getPoints(160).map((p) => ({
      z: p.x,
      width: p.y,
      top: p.z,
      bottom: shellLowerEdgeAt(p.x)
    }));

    function getProfile(z) {
      if (z <= sampledProfiles[0].z) return sampledProfiles[0];
      const last = sampledProfiles[sampledProfiles.length - 1];
      if (z >= last.z) return last;
      for (let i = 0; i < sampledProfiles.length - 1; i++) {
        const a = sampledProfiles[i];
        const b = sampledProfiles[i + 1];
        if (z >= a.z && z <= b.z) {
          const t = (z - a.z) / Math.max(0.00001, b.z - a.z);
          return {
            z,
            width: THREE.MathUtils.lerp(a.width, b.width, t),
            top: THREE.MathUtils.lerp(a.top, b.top, t),
            bottom: THREE.MathUtils.lerp(a.bottom, b.bottom, t)
          };
        }
      }
      return last;
    }

    // A superellipse-like cross-section creates broad, softly rounded sides
    // and a wide roof/hood crown rather than a pointed or faceted tube.
    const crossExponent = 0.28;
    function surfacePoint(z, across, upper = true) {
      const p = getProfile(z);
      const absAcross = THREE.MathUtils.clamp(Math.abs(across), 0, 1);
      const cosValue = Math.pow(absAcross, 1 / crossExponent);
      const sinMagnitude = Math.sqrt(Math.max(0, 1 - cosValue * cosValue));
      const y = upper
        ? p.bottom + (p.top - p.bottom) * Math.pow(sinMagnitude, crossExponent)
        : p.bottom - 0.045 * Math.pow(sinMagnitude, 0.65);
      return {
        x: p.width * across,
        y,
        z
      };
    }

    function makeSurfacePatch(parent, id, label, description, material, z0, z1, across0, across1, lift = 0.003) {
      const part = makePart(parent, id, label, description);
      const rows = 48;
      const columns = 20;
      const positions = [];
      const indices = [];
      for (let row = 0; row <= rows; row++) {
        const z = THREE.MathUtils.lerp(z0, z1, row / rows);
        for (let column = 0; column <= columns; column++) {
          const across = THREE.MathUtils.lerp(across0, across1, column / columns);
          const point = surfacePoint(z, across, true);
          positions.push(point.x, point.y + lift, point.z);
        }
      }
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const a = row * (columns + 1) + column;
          const b = a + 1;
          const d = (row + 1) * (columns + 1) + column;
          const c = d + 1;
          indices.push(a, d, b, b, d, c);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      material.side = THREE.DoubleSide;
      addMesh(part, geometry, material);
      return part;
    }

    function makeSidePatch(parent, id, label, description, material, side, z0, z1, vertical0, vertical1, offset = 0.003) {
      const part = makePart(parent, id, label, description);
      const rows = 42;
      const columns = 14;
      const positions = [];
      const indices = [];
      for (let row = 0; row <= rows; row++) {
        const z = THREE.MathUtils.lerp(z0, z1, row / rows);
        const p = getProfile(z);
        for (let column = 0; column <= columns; column++) {
          const v = THREE.MathUtils.clamp(
            THREE.MathUtils.lerp(vertical0, vertical1, column / columns),
            0, 1
          );
          const sinMagnitude = Math.pow(v, 1 / crossExponent);
          const cosValue = Math.sqrt(Math.max(0, 1 - sinMagnitude * sinMagnitude));
          const across = side * Math.pow(cosValue, crossExponent);
          const point = surfacePoint(z, across, true);
          positions.push(
            point.x + side * offset,
            point.y,
            z
          );
        }
      }
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const a = row * (columns + 1) + column;
          const b = a + 1;
          const d = (row + 1) * (columns + 1) + column;
          const c = d + 1;
          indices.push(a, d, b, b, d, c);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      material.side = THREE.DoubleSide;
      addMesh(part, geometry, material);
      return part;
    }

    // Surface-following graphic helpers: all stripes and decals sit on the
    // curved polycarbonate rather than floating as rectangular plates.
    function makeTopGraphic(points, material, lift = 0.008) {
      const contour = points.map(([z, across]) => new THREE.Vector2(z, across));
      const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
      const minZ = Math.min(...points.map((p) => p[0]));
      const maxZ = Math.max(...points.map((p) => p[0]));
      const minAcross = Math.min(...points.map((p) => p[1]));
      const maxAcross = Math.max(...points.map((p) => p[1]));
      const positions = [];
      const uvs = [];
      for (const [z, across] of points) {
        const point = surfacePoint(z, across, true);
        positions.push(point.x, point.y + lift, point.z);
        uvs.push(
          (z - minZ) / Math.max(0.0001, maxZ - minZ),
          (across - minAcross) / Math.max(0.0001, maxAcross - minAcross)
        );
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(triangles.flat());
      geometry.computeVertexNormals();
      material.side = THREE.DoubleSide;
      const mesh = addMesh(shellGeometryGroup, geometry, material);
      mesh.castShadow = false;
      return mesh;
    }

    function makeSideGraphic(side, points, material, offset = 0.009) {
      const contour = points.map(([z, vertical]) => new THREE.Vector2(z, vertical));
      const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
      const minZ = Math.min(...points.map((p) => p[0]));
      const maxZ = Math.max(...points.map((p) => p[0]));
      const minV = Math.min(...points.map((p) => p[1]));
      const maxV = Math.max(...points.map((p) => p[1]));
      const positions = [];
      const uvs = [];
      for (const [z, vertical] of points) {
        const p = getProfile(z);
        const v = THREE.MathUtils.clamp(vertical, 0, 1);
        const sine = Math.pow(v, 1 / crossExponent);
        const cosine = Math.sqrt(Math.max(0, 1 - sine * sine));
        const across = side * Math.pow(cosine, crossExponent);
        const point = surfacePoint(z, across, true);
        positions.push(point.x + side * offset, point.y + 0.002, point.z);
        uvs.push(
          (z - minZ) / Math.max(0.0001, maxZ - minZ),
          (vertical - minV) / Math.max(0.0001, maxV - minV)
        );
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(triangles.flat());
      geometry.computeVertexNormals();
      material.side = THREE.DoubleSide;
      const mesh = addMesh(shellGeometryGroup, geometry, material);
      mesh.castShadow = false;
      return mesh;
    }

    // One continuous, closed, smooth body surface. This replaces the former
    // disconnected orange side plates and floating hood/cab pieces.
    const mainBody = makePart(
      shellGeometryGroup,
      "shell-orange-main",
      "Continuous orange short-course body",
      "The single molded polycarbonate body shell. The hood, fenders, cab sides and rear body are formed as one continuous surface."
    );
    const longitudinalSegments = 160;
    const ringSegments = 64;
    const positions = [];
    const indices = [];
    for (let row = 0; row <= longitudinalSegments; row++) {
      const z = THREE.MathUtils.lerp(-0.72, 0.72, row / longitudinalSegments);
      for (let column = 0; column < ringSegments; column++) {
        const angle = (column / ringSegments) * Math.PI * 2;
        const cosValue = Math.cos(angle);
        const sinValue = Math.sin(angle);
        const x = Math.sign(cosValue) * Math.pow(Math.abs(cosValue), crossExponent);
        const p = getProfile(z);
        const y = sinValue >= 0
          ? p.bottom + (p.top - p.bottom) * Math.pow(sinValue, crossExponent)
          : p.bottom - 0.045 * Math.pow(Math.abs(sinValue), 0.65);
        positions.push(
          p.width * x,
          y,
          z
        );
      }
    }
    for (let row = 0; row < longitudinalSegments; row++) {
      for (let column = 0; column < ringSegments; column++) {
        const next = (column + 1) % ringSegments;
        const a = row * ringSegments + column;
        const b = row * ringSegments + next;
        const d = (row + 1) * ringSegments + column;
        const c = (row + 1) * ringSegments + next;
        indices.push(a, b, d, b, c, d);
      }
    }
    const frontCenter = positions.length / 3;
    const frontProfile = getProfile(-0.72);
    positions.push(0, (frontProfile.bottom + frontProfile.top) * 0.5, -0.72);
    const rearCenter = positions.length / 3;
    const rearProfile = getProfile(0.72);
    positions.push(0, (rearProfile.bottom + rearProfile.top) * 0.5, 0.72);
    for (let column = 0; column < ringSegments; column++) {
      const next = (column + 1) % ringSegments;
      indices.push(frontCenter, next, column);
      const last = longitudinalSegments * ringSegments;
      indices.push(rearCenter, last + column, last + next);
    }
    const bodyGeometry = new THREE.BufferGeometry();
    bodyGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    bodyGeometry.setIndex(indices);
    bodyGeometry.computeVertexNormals();
    addMesh(mainBody, bodyGeometry, orange).material.side = THREE.DoubleSide;

    // Tapered satin-black hood graphic with narrow silver/orange pinstripes.
    // All pieces conform to the curved hood instead of forming raised plates.
    const hoodGraphic = new THREE.MeshStandardMaterial({
      color: 0x171d22, roughness: 0.48, metalness: 0.12
    });
    makeTopGraphic([
      [-0.648, -0.19], [-0.628, -0.32], [-0.585, -0.37],
      [-0.285, -0.285], [-0.238, -0.22], [-0.238, 0.22],
      [-0.285, 0.285], [-0.585, 0.37], [-0.628, 0.32],
      [-0.648, 0.19]
    ], hoodGraphic, 0.006);
    for (const side of [-1, 1]) {
      makeTopGraphic([
        [-0.626, side * 0.385], [-0.594, side * 0.405],
        [-0.285, side * 0.315], [-0.257, side * 0.285],
        [-0.269, side * 0.267], [-0.302, side * 0.293],
        [-0.592, side * 0.377]
      ], grayLight, 0.009);
      makeTopGraphic([
        [-0.615, side * 0.421], [-0.584, side * 0.438],
        [-0.292, side * 0.35], [-0.278, side * 0.331],
        [-0.30, side * 0.326], [-0.59, side * 0.411]
      ], orangeLight, 0.01);
    }
    // Two short hood extraction vents with fine silver louver lines.
    for (const side of [-1, 1]) {
      makeTopGraphic([
        [-0.34, side * 0.22], [-0.31, side * 0.245],
        [-0.265, side * 0.228], [-0.292, side * 0.204]
      ], black, 0.01);
      makeTopGraphic([
        [-0.326, side * 0.225], [-0.32, side * 0.228],
        [-0.283, side * 0.216], [-0.289, side * 0.213]
      ], grayLight, 0.013);
    }

    // Black cab roof is a flush upper panel rather than a raised box.
    makeSurfacePatch(
      shellGeometryGroup,
      "shell-black-roof",
      "Black cab roof",
      "Low black roof panel with smooth transitions into the windshield and rear cab glass.",
      black,
      -0.055, 0.235, -0.77, 0.77, 0.004
    );

    // Two slim orange/gray roof stripes bring the hood graphics over the cab.
    for (const side of [-1, 1]) {
      makeTopGraphic([
        [-0.035, side * 0.56], [-0.018, side * 0.58],
        [0.215, side * 0.58], [0.232, side * 0.55],
        [0.215, side * 0.535], [-0.018, side * 0.535]
      ], orangeLight, 0.009);
      makeTopGraphic([
        [-0.018, side * 0.50], [0.0, side * 0.515],
        [0.218, side * 0.515], [0.228, side * 0.50]
      ], grayLight, 0.01);
    }

    // The windshield and rear glass are conforming surfaces on the same body.
    makeSurfacePatch(
      shellGeometryGroup,
      "shell-windscreen",
      "Tinted front windshield",
      "Dark smoked windshield fitted flush to the steeply sloped front cab. It is a surface panel, not a floating vertical sheet.",
      glass,
      -0.185, -0.065, -0.72, 0.72, 0.007
    );
    makeSurfacePatch(
      shellGeometryGroup,
      "shell-rear-window",
      "Tinted rear cab window",
      "Smoked rear cab glass follows the sloping transition between the roof and rear bed.",
      glass,
      0.235, 0.305, -0.70, 0.70, 0.007
    );

    // Narrow windshield header band and understated wiper at the cowl.
    makeSurfacePatch(
      shellGeometryGroup,
      "shell-windshield-banner",
      "Windshield racing banner",
      "A narrow charcoal header with a fine orange pinstripe, designed to sit neatly within the smoked windshield.",
      black,
      -0.178, -0.166, -0.62, 0.62, 0.009
    );
    makeSurfacePatch(
      shellGeometryGroup,
      "shell-windshield-banner-accent",
      "Windshield banner accent",
      "Fine orange line along the windshield header.",
      orangeLight,
      -0.179, -0.175, -0.56, 0.56, 0.011
    );

    // Both side windows conform to the curved cab flank.
    for (const side of [-1, 1]) {
      makeSidePatch(
        shellGeometryGroup,
        `shell-side-windows-${side}`,
        side < 0 ? "Left tinted side windows" : "Right tinted side windows",
        "Dark smoked driver/passenger glazing follows the cab side and sits flush with the body contour.",
        glass,
        side,
        -0.055, 0.225,
        0.72, 0.965,
        0.004
      );
    }

    // Graphite rear bed / quarter panels are separate paint regions on the
    // continuous shell, not independent upright blocks.
    makeSurfacePatch(
      shellGeometryGroup,
      "shell-gray-rear-bed",
      "Graphite-gray rear bed",
      "Dark graphite bed panel contrasts with the orange hood and black cab roof. Its edges follow the rear body crown.",
      charcoal,
      0.36, 0.665, -0.82, 0.82, 0.005
    );
    // Fine bed rails and shallow grooves make the rear deck read as a molded
    // short-course bed rather than a large blank gray rectangle.
    for (const side of [-1, 1]) {
      makeTopGraphic([
        [0.405, side * 0.73], [0.425, side * 0.76],
        [0.635, side * 0.74], [0.655, side * 0.69],
        [0.64, side * 0.675], [0.43, side * 0.70]
      ], grayLight, 0.012);
      makeTopGraphic([
        [0.425, side * 0.48], [0.625, side * 0.48],
        [0.625, side * 0.50], [0.425, side * 0.50]
      ], gray, 0.012);
    }
    makeTopGraphic([
      [0.43, -0.28], [0.62, -0.28],
      [0.62, 0.28], [0.43, 0.28]
    ], charcoal, 0.012);

    for (const side of [-1, 1]) {
      makeSidePatch(
        shellGeometryGroup,
        `shell-gray-rear-quarter-${side}`,
        side < 0 ? "Left graphite rear quarter" : "Right graphite rear quarter",
        "Graphite-gray rear quarter panel blends into the bed and rear fender.",
        gray,
        side,
        0.34, 0.68,
        0.50, 0.88,
        0.005
      );
      makeSidePatch(
        shellGeometryGroup,
        `shell-orange-door-${side}`,
        side < 0 ? "Left orange door" : "Right orange door",
        "Orange door section with a black and gray lower racing stripe.",
        orange,
        side,
        -0.20, 0.30,
        0.50, 0.72,
        0.006
      );
      makeSidePatch(
        shellGeometryGroup,
        `shell-gray-rocker-${side}`,
        side < 0 ? "Left gray lower rocker" : "Right gray lower rocker",
        "Low graphite-gray and silver rocker trim beneath the orange door.",
        charcoal,
        side,
        -0.18, 0.30,
        0.33, 0.43,
        0.008
      );
    }

    // Layered short-course side livery: broad charcoal sweep, silver blade,
    // fine orange keyline and a compact number panel. Shapes follow the side skin.
    const badgeCanvas = document.createElement("canvas");
    badgeCanvas.width = 768;
    badgeCanvas.height = 384;
    const badgeContext = badgeCanvas.getContext("2d");
    badgeContext.clearRect(0, 0, 768, 384);
    badgeContext.fillStyle = "rgba(12,17,22,0.96)";
    badgeContext.beginPath();
    badgeContext.moveTo(35, 54);
    badgeContext.lineTo(725, 25);
    badgeContext.lineTo(676, 328);
    badgeContext.lineTo(95, 348);
    badgeContext.closePath();
    badgeContext.fill();
    badgeContext.strokeStyle = "#8f999f";
    badgeContext.lineWidth = 15;
    badgeContext.beginPath();
    badgeContext.moveTo(62, 312);
    badgeContext.lineTo(695, 72);
    badgeContext.stroke();
    badgeContext.fillStyle = "#ff6420";
    badgeContext.font = "900 34px Arial";
    badgeContext.textAlign = "center";
    badgeContext.fillText("SHORT COURSE", 380, 326);
    badgeContext.fillStyle = "#f6f7f7";
    badgeContext.strokeStyle = "#080c10";
    badgeContext.lineWidth = 16;
    badgeContext.font = "italic 900 220px Arial";
    badgeContext.textBaseline = "middle";
    badgeContext.strokeText("27", 390, 177);
    badgeContext.fillText("27", 390, 177);
    const badgeTexture = new THREE.CanvasTexture(badgeCanvas);
    badgeTexture.colorSpace = THREE.SRGBColorSpace;
    badgeTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const badgeMaterial = new THREE.MeshBasicMaterial({
      map: badgeTexture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });

    for (const side of [-1, 1]) {
      // Main black/charcoal graphic sweeps rearward below the window line.
      makeSideGraphic(side, [
        [-0.235, 0.37], [-0.13, 0.50], [0.045, 0.535],
        [0.255, 0.485], [0.62, 0.405], [0.575, 0.325],
        [0.315, 0.37], [0.095, 0.405], [-0.105, 0.325]
      ], black, 0.010);

      // Satin-silver slash follows the upper edge and breaks up the dark panel.
      makeSideGraphic(side, [
        [-0.185, 0.475], [-0.115, 0.535], [0.055, 0.565],
        [0.27, 0.515], [0.59, 0.445], [0.565, 0.468],
        [0.27, 0.545], [0.055, 0.59], [-0.12, 0.56]
      ], grayLight, 0.013);

      // A narrow orange line separates the gray blade from the body paint.
      makeSideGraphic(side, [
        [-0.16, 0.575], [0.05, 0.605], [0.27, 0.56],
        [0.55, 0.49], [0.535, 0.505], [0.27, 0.58],
        [0.05, 0.625], [-0.14, 0.595]
      ], orangeLight, 0.015);

      // Number panel follows the door surface, with a small gray keyline.
      makeSideGraphic(side, [
        [-0.015, 0.405], [0.205, 0.405],
        [0.265, 0.505], [0.035, 0.52]
      ], badgeMaterial, 0.017);

      // Small door handle and fuel/access-panel detail.
      const handle = makeSideGraphic(side, [
        [0.105, 0.645], [0.185, 0.645],
        [0.185, 0.665], [0.105, 0.665]
      ], charcoal, 0.012);
      handle.castShadow = false;

      // Compact graphite quarter-panel hash marks behind the cab.
      makeSideGraphic(side, [
        [0.39, 0.55], [0.57, 0.505],
        [0.59, 0.525], [0.405, 0.575]
      ], charcoal, 0.012);
      makeSideGraphic(side, [
        [0.425, 0.585], [0.59, 0.545],
        [0.60, 0.56], [0.44, 0.603]
      ], grayLight, 0.014);
    }

    // Rounded wheel-arch flares sit directly outside the existing wheel
    // centers. Their centers are compensated for the shell's inner length scale.
    const arches = makePart(
      shellGeometryGroup,
      "shell-wheel-arch-flares",
      "Short-course wheel-arch flares",
      "Four rounded fender lips follow the tire openings and sit just outside the tread without forming separate oversized rings."
    );
    for (const side of [-1, 1]) {
      for (const centerZ of shellWheelArchCenters) {
        const archPoints = [];
        const accentPoints = [];
        const archSegments = 40;
        for (let i = 0; i <= archSegments; i++) {
          const t = -1 + 2 * i / archSegments;
          const z = centerZ + t * shellWheelArchHalfLength;
          const y = shellLowerEdgeAt(z) + 0.006;
          archPoints.push(new THREE.Vector3(side * 0.379, y, z));
          accentPoints.push(new THREE.Vector3(side * 0.381, y + 0.009, z));
        }
        const archCurve = new THREE.CatmullRomCurve3(archPoints);
        const flare = new THREE.TubeGeometry(archCurve, 80, 0.012, 8, false);
        addMesh(arches, flare, black);

        const accentCurve = new THREE.CatmullRomCurve3(accentPoints);
        const lip = new THREE.TubeGeometry(accentCurve, 80, 0.0045, 7, false);
        addMesh(arches, lip, orangeLight);
      }
    }

    // Front fascia sits at the nose of the continuous body.
    const front = makePart(
      shellGeometryGroup,
      "shell-front-fascia",
      "Front grille, lamps and gray bumper",
      "Low dark grille, compact headlights and a gray front bumper follow the short-course truck nose."
    );
    roundedBox(front, [0.36, 0.048, 0.018], black, [0, 0.223, -0.695], null, 0.008);
    for (let i = 0; i < 5; i++) {
      roundedBox(front, [0.012, 0.032, 0.008], grayLight,
        [-0.13 + i * 0.065, 0.223, -0.707], null, 0.003);
    }
    for (const side of [-1, 1]) {
      roundedBox(front, [0.10, 0.048, 0.018], charcoal,
        [side * 0.245, 0.235, -0.672], null, 0.008);
      roundedBox(front, [0.074, 0.027, 0.009], lamp,
        [side * 0.245, 0.238, -0.685], null, 0.006);
    }
    roundedBox(front, [0.66, 0.075, 0.08], gray,
      [0, 0.135, -0.735], null, 0.022);
    roundedBox(front, [0.54, 0.026, 0.03], black,
      [0, 0.166, -0.765], null, 0.01);
    cylinderBetween(front, [-0.30, 0.18, -0.735], [0.30, 0.18, -0.735], 0.012, grayLight, 12);
    for (const side of [-1, 1]) {
      cylinderBetween(front, [side * 0.29, 0.12, -0.735],
        [side * 0.25, 0.245, -0.68], 0.012, grayLight, 10);
    }

    // Rear tailgate and broad gray rear impact bumper.
    const rear = makePart(
      shellGeometryGroup,
      "shell-rear-tailgate",
      "Rear tailgate, lamps and gray bumper",
      "Graphite rear tailgate with paired red tail lamps and a broad gray rear impact bumper."
    );
    roundedBox(rear, [0.43, 0.062, 0.018], charcoal, [0, 0.225, 0.704], null, 0.01);
    for (const side of [-1, 1]) {
      roundedBox(rear, [0.075, 0.045, 0.022], redLamp,
        [side * 0.25, 0.23, 0.71], null, 0.008);
    }
    roundedBox(rear, [0.63, 0.068, 0.072], gray,
      [0, 0.135, 0.735], null, 0.02);

    // Tailgate inset, small centered model badge and lower reflectors.
    roundedBox(rear, [0.30, 0.008, 0.012], black, [0, 0.267, 0.713], null, 0.004);
    roundedBox(rear, [0.115, 0.012, 0.016], grayLight, [0, 0.27, 0.718], null, 0.004);
    for (const side of [-1, 1]) {
      roundedBox(rear, [0.055, 0.022, 0.012], grayLight,
        [side * 0.19, 0.16, 0.712], null, 0.004);
    }

    // Small mirrors, wipers, molded door handles and bed-rail trim.
    const trim = makePart(
      shellGeometryGroup,
      "shell-exterior-trim",
      "Mirrors, wipers and molded trim",
      "Small black mirrors, close-fitting windshield wipers, door handles and gray rear bed-rail trim."
    );
    for (const side of [-1, 1]) {
      cylinderBetween(trim, [side * 0.285, 0.365, -0.16],
        [side * 0.365, 0.365, -0.20], 0.008, black, 10);
      roundedBox(trim, [0.05, 0.028, 0.045], black,
        [side * 0.37, 0.37, -0.21], [0, 0, side * 0.06], 0.008);
      roundedBox(trim, [0.018, 0.022, 0.060], charcoal,
        [side * 0.375, 0.245, 0.06], null, 0.005);
    }
    cylinderBetween(trim, [-0.14, 0.35, -0.18], [0.14, 0.35, -0.18], 0.0035, grayLight, 8);
    cylinderBetween(trim, [-0.12, 0.35, -0.15], [0.12, 0.35, -0.15], 0.0035, grayLight, 8);
    for (const side of [-1, 1]) {
      roundedBox(trim, [0.018, 0.014, 0.22], grayLight,
        [side * 0.342, 0.285, 0.52], null, 0.004);
    }
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
const localCar = makeCarVisual(0xffa33d);

// Illuminated showroom used by the main menu and garage.
const garageGroup = new THREE.Group();
scene.add(garageGroup);
const showroomFloor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24),
  new THREE.MeshStandardMaterial({ color: 0x202d3a, roughness: 0.72, metalness: 0.18 }));
showroomFloor.rotation.x = -Math.PI / 2;
showroomFloor.position.y = -0.035;
showroomFloor.receiveShadow = true;
garageGroup.add(showroomFloor);
const showroomBackWall = new THREE.Mesh(new THREE.BoxGeometry(24, 8, 0.35),
  new THREE.MeshStandardMaterial({ color: 0x172433, roughness: 0.85 }));
showroomBackWall.position.set(0, 3.9, -5.2);
showroomBackWall.receiveShadow = true;
garageGroup.add(showroomBackWall);
const showroomSideMaterial = new THREE.MeshStandardMaterial({ color: 0x25384b, roughness: 0.82 });
for (const x of [-8.5, 8.5]) {
  const column = new THREE.Mesh(new THREE.BoxGeometry(0.22, 5.8, 0.28), showroomSideMaterial);
  column.position.set(x, 2.85, -2.7);
  garageGroup.add(column);
}
const showroomStripe = new THREE.Mesh(new THREE.BoxGeometry(9, 0.025, 0.045),
  new THREE.MeshBasicMaterial({ color: 0x2798ff }));
showroomStripe.position.set(0, 2.65, -4.98);
garageGroup.add(showroomStripe);
const displayPad = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.9, 0.12, 64),
  new THREE.MeshStandardMaterial({ color: 0x34495d, metalness: 0.42, roughness: 0.42 }));
displayPad.position.set(0, -0.06, 0);
displayPad.receiveShadow = true;
displayPad.castShadow = true;
garageGroup.add(displayPad);
const displayRing = new THREE.Mesh(new THREE.TorusGeometry(1.76, 0.025, 8, 80),
  new THREE.MeshBasicMaterial({ color: 0x3ba9ff }));
displayRing.rotation.x = Math.PI / 2;
displayRing.position.y = 0.01;
garageGroup.add(displayRing);
const showroomLight = new THREE.PointLight(0x7dbfff, 24, 15, 2);
showroomLight.position.set(0, 4.8, 1.5);
garageGroup.add(showroomLight);
garageGroup.visible = true;
for (const item of arenaVisuals) item.visible = false;

let viewMode = "menu";
let garageShellInstalled = true;
let garageShellAnimation = null;
const garageShellDuration = 520;
const garageShellAttachedPosition = new THREE.Vector3(0, 0, 0);
const garageShellRemovedPosition = new THREE.Vector3(0.08, 1.12, -0.16);
const garageShellAttachedRotation = new THREE.Euler(0, 0, 0);
const garageShellRemovedRotation = new THREE.Euler(-0.12, 0, 0.09);
const garageShellAttachedScale = new THREE.Vector3(1, 1, 1);
const garageShellRemovedScale = new THREE.Vector3(1.012, 1.012, 1.012);

function applyGarageShellPose(progress) {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  localCar.shellGroup.position.lerpVectors(garageShellAttachedPosition, garageShellRemovedPosition, t);
  localCar.shellGroup.rotation.set(
    THREE.MathUtils.lerp(garageShellAttachedRotation.x, garageShellRemovedRotation.x, t),
    THREE.MathUtils.lerp(garageShellAttachedRotation.y, garageShellRemovedRotation.y, t),
    THREE.MathUtils.lerp(garageShellAttachedRotation.z, garageShellRemovedRotation.z, t)
  );
  localCar.shellGroup.scale.lerpVectors(garageShellAttachedScale, garageShellRemovedScale, t);
}

function resetGarageShellState(visible = true) {
  garageShellAnimation = null;
  garageShellInstalled = !!visible;
  applyGarageShellPose(0);
  localCar.setShellVisible(garageShellInstalled);
  const button = $("shellToggleButton");
  if (button) button.textContent = garageShellInstalled ? "REMOVE BODY SHELL" : "INSTALL BODY SHELL";
}

function updateGarageShellAnimation(now) {
  if (!garageShellAnimation) return;
  const animation = garageShellAnimation;
  const linear = THREE.MathUtils.clamp((now - animation.startTime) / garageShellDuration, 0, 1);
  const eased = linear * linear * (3 - 2 * linear);
  const progress = THREE.MathUtils.lerp(animation.from, animation.to, eased);
  applyGarageShellPose(progress);

  if (linear >= 1) {
    garageShellAnimation = null;
    applyGarageShellPose(0);
    if (animation.to === 1) localCar.setShellVisible(false);
  }
}

const garageRaycaster = new THREE.Raycaster();
const garagePointer = new THREE.Vector2();
let activeGaragePart = null;
let activeGaragePartObject = null;
const garagePartBounds = new THREE.Box3();
const garagePartOutline = new THREE.Box3Helper(garagePartBounds, 0x62c6ff);
garagePartOutline.visible = false;
scene.add(garagePartOutline);

function clearGaragePartHover() {
  activeGaragePart = null;
  activeGaragePartObject = null;
  garagePartOutline.visible = false;
  const title = $("partHoverTitle");
  const description = $("partHoverDescription");
  if (title) title.textContent = "HOVER OVER A COMPONENT";
  if (description) description.textContent = "Move your pointer over a visible component to identify it.";
}

function updateGaragePartHover(event) {
  if (viewMode !== "garage" || !localCar.root.visible) {
    if (activeGaragePart) clearGaragePartHover();
    return;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  garagePointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  garagePointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  garageRaycaster.setFromCamera(garagePointer, camera);
  // Do not raycast the shell at all when it has been removed.
  const hoverTarget = garageShellInstalled ? localCar.root : localCar.chassisGroup;
  const intersections = garageRaycaster.intersectObject(hoverTarget, true);
  let found = null;
  let foundObject = null;
  for (const hit of intersections) {
    let node = hit.object;
    while (node && node !== localCar.root) {
      if (node.userData && node.userData.partInfo) {
        found = node.userData.partInfo;
        foundObject = node;
        break;
      }
      node = node.parent;
    }
    if (found) break;
  }
  if (!found) {
    if (activeGaragePart) clearGaragePartHover();
    return;
  }
  if (activeGaragePart && activeGaragePart.id === found.id) {
    garagePartBounds.setFromObject(foundObject);
    garagePartOutline.updateMatrixWorld(true);
    return;
  }
  activeGaragePart = found;
  activeGaragePartObject = foundObject;
  garagePartBounds.setFromObject(foundObject);
  garagePartOutline.visible = true;
  garagePartOutline.updateMatrixWorld(true);
  $("partHoverTitle").textContent = found.label;
  $("partHoverDescription").textContent = found.description;
}

renderer.domElement.addEventListener("pointermove", updateGaragePartHover);
renderer.domElement.addEventListener("pointerleave", clearGaragePartHover);
function setArenaVisible(visible) {
  for (const item of arenaVisuals) item.visible = visible;
  garageGroup.visible = !visible;
}
function parkCarForShowroom() {
  chassisBody.position.set(0, 0.24, 0);
  chassisBody.quaternion.set(0, 0, 0, 1);
  chassisBody.velocity.set(0, 0, 0);
  chassisBody.angularVelocity.set(0, 0, 0);
  chassisBody.force.set(0, 0, 0);
  chassisBody.torque.set(0, 0, 0);
  chassisBody.wakeUp();
  for (let i = 0; i < 4; i++) {
    vehicle.wheelInfos[i].engineForce = 0;
    vehicle.wheelInfos[i].rotation = 0;
    vehicle.wheelInfos[i].deltaRotation = 0;
  }
  updateLocalVisual();
}
function showMainMenu() {
  clearGaragePartHover();
  resetGarageShellState(true);
  viewMode = "menu";
  mainMenuPanel.style.display = "block";
  garagePanel.style.display = "none";
  joinPanel.style.display = "none";
  hud.style.display = "none";
  $("topStatus").style.display = "none";
  setArenaVisible(false);
  parkCarForShowroom();
}
function showGarage() {
  clearGaragePartHover();
  resetGarageShellState(true);
  viewMode = "garage";
  mainMenuPanel.style.display = "none";
  garagePanel.style.display = "block";
  joinPanel.style.display = "none";
  hud.style.display = "none";
  $("topStatus").style.display = "none";
  setArenaVisible(false);
  parkCarForShowroom();
}
function setGarageShellVisible(visible) {
  if (garageShellAnimation || visible === garageShellInstalled) return;

  clearGaragePartHover();
  const installing = !!visible;
  const from = installing ? 1 : 0;
  const to = installing ? 0 : 1;

  // Keep the shell visible while it lifts away or settles back onto the chassis.
  localCar.setShellVisible(true);
  applyGarageShellPose(from);
  garageShellInstalled = installing;
  $("shellToggleButton").textContent = installing ? "REMOVE BODY SHELL" : "INSTALL BODY SHELL";
  garageShellAnimation = {
    from,
    to,
    startTime: performance.now()
  };
}
$("shellToggleButton").addEventListener("click", () => {
  setGarageShellVisible(!garageShellInstalled);
});

function showDriveScreen() {
  viewMode = "drive";
  mainMenuPanel.style.display = "none";
  garagePanel.style.display = "none";
  joinPanel.style.display = "block";
  hud.style.display = "none";
  $("topStatus").style.display = "flex";
  setArenaVisible(true);
  cameraOrbitYaw = 0;
  resetCar();
}
const remotePlayers = new Map();
const remotePalette = [0x42c7c2, 0x76a8ff, 0xe879b2, 0xa2d66d, 0xb18aff, 0xff795e];
function colorForPeer(peerId) {
  let hash = 0;
  for (let i = 0; i < peerId.length; i++) hash = (hash * 31 + peerId.charCodeAt(i)) | 0;
  return remotePalette[Math.abs(hash) % remotePalette.length];
}

function updateLocalVisual() {
  localCar.root.position.set(chassisBody.position.x, chassisBody.position.y, chassisBody.position.z);
  localCar.root.quaternion.set(
    chassisBody.quaternion.x,
    chassisBody.quaternion.y,
    chassisBody.quaternion.z,
    chassisBody.quaternion.w
  );

  const inverseRoot = localCar.root.quaternion.clone().invert();
  const localPosition = new THREE.Vector3();
  const worldWheelQuaternion = new THREE.Quaternion();
  for (let i = 0; i < 4; i++) {
    vehicle.updateWheelTransform(i);
    const transform = vehicle.wheelInfos[i].worldTransform;
    localPosition.set(
      transform.position.x - chassisBody.position.x,
      transform.position.y - chassisBody.position.y,
      transform.position.z - chassisBody.position.z
    );
    localPosition.applyQuaternion(inverseRoot);
    localPosition.z *= VISUAL_CHASSIS_LENGTH_SCALE;
    worldWheelQuaternion.set(
      transform.quaternion.x,
      transform.quaternion.y,
      transform.quaternion.z,
      transform.quaternion.w
    );
    localCar.wheelPivots[i].position.copy(localPosition);
    localCar.wheelPivots[i].quaternion.copy(inverseRoot).multiply(worldWheelQuaternion);
  }
}

function makeSnapshot() {
  return {
    name: driverName,
    x: chassisBody.position.x,
    y: chassisBody.position.y,
    z: chassisBody.position.z,
    qx: chassisBody.quaternion.x,
    qy: chassisBody.quaternion.y,
    qz: chassisBody.quaternion.z,
    qw: chassisBody.quaternion.w,
    wheels: vehicle.wheelInfos.map((wheel) => wheel.rotation),
    steer: vehicle.wheelInfos[0].steering,
    mph: chassisBody.velocity.length() * 2.236936
  };
}

function validSnapshot(data) {
  return data && [data.x, data.y, data.z, data.qx, data.qy, data.qz, data.qw]
    .every((value) => Number.isFinite(value));
}

let room = null;
let stateAction = null;
let driverName = "Driver";
let joinedRoomCode = "";
let joined = false;
let peersConnected = false;
let lastToastTimer = 0;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(lastToastTimer);
  lastToastTimer = window.setTimeout(() => toast.classList.remove("show"), 2300);
}

function updatePlayerCount() {
  const count = remotePlayers.size + 1;
  $("playersValue").textContent = count === 1 ? "1 DRIVER" : count + " DRIVERS";
  $("topStatus").textContent = peersConnected ? "MULTIPLAYER CONNECTED" : "WAITING FOR DRIVERS";
  $("statusDot").classList.toggle("live", peersConnected);
}

function addRemotePlayer(peerId, data) {
  let remote = remotePlayers.get(peerId);
  if (!remote) {
    const name = typeof data.name === "string" ? data.name.slice(0, 18) : "Driver";
    const visual = makeCarVisual(colorForPeer(peerId), name);
    remote = {
      visual,
      target: null,
      lastSeen: performance.now(),
      wheelRotations: [0, 0, 0, 0],
      steering: 0,
      name
    };
    remotePlayers.set(peerId, remote);
    updatePlayerCount();
  }
  if (validSnapshot(data)) {
    remote.target = {
      position: new THREE.Vector3(data.x, data.y, data.z),
      quaternion: new THREE.Quaternion(data.qx, data.qy, data.qz, data.qw).normalize()
    };
    remote.wheelRotations = Array.isArray(data.wheels)
      ? data.wheels.slice(0, 4).map((value) => Number.isFinite(value) ? value : 0)
      : remote.wheelRotations;
    remote.steering = Number.isFinite(data.steer) ? data.steer : 0;
    remote.lastSeen = performance.now();
  }
}

function updateRemoteVisuals(delta) {
  const alpha = 1 - Math.exp(-12 * delta);
  for (const [peerId, remote] of remotePlayers) {
    if (performance.now() - remote.lastSeen > 12000) {
      scene.remove(remote.visual.root);
      remotePlayers.delete(peerId);
      peersConnected = remotePlayers.size > 0;
      continue;
    }
    if (!remote.target) continue;
    remote.visual.root.position.lerp(remote.target.position, alpha);
    remote.visual.root.quaternion.slerp(remote.target.quaternion, alpha);
    for (let i = 0; i < 4; i++) {
      const [x, , z] = wheelPositions[i];
      const pivot = remote.visual.wheelPivots[i];
      pivot.position.set(x, -0.095, z * VISUAL_CHASSIS_LENGTH_SCALE);
      const steerQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i < 2 ? remote.steering : 0);
      const spinQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), remote.wheelRotations[i]);
      pivot.quaternion.copy(steerQ).multiply(spinQ);
    }
  }
  updatePlayerCount();
}

// Drag the view around the car. Pointer events support both mouse and touch.
let cameraOrbitYaw = 0;
let cameraDragging = false;
let cameraPointerId = null;
let cameraLastX = 0;
canvas.style.touchAction = "none";
canvas.style.cursor = "grab";

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 && event.pointerType === "mouse") return;
  cameraDragging = true;
  cameraPointerId = event.pointerId;
  cameraLastX = event.clientX;
  canvas.style.cursor = "grabbing";
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!cameraDragging || event.pointerId !== cameraPointerId) return;
  const deltaX = event.clientX - cameraLastX;
  cameraLastX = event.clientX;
  cameraOrbitYaw += deltaX * 0.006;
});

function stopCameraDrag(event) {
  if (!cameraDragging || (event && event.pointerId !== cameraPointerId)) return;
  cameraDragging = false;
  cameraPointerId = null;
  canvas.style.cursor = "grab";
}
canvas.addEventListener("pointerup", stopCameraDrag);
canvas.addEventListener("pointercancel", stopCameraDrag);
canvas.addEventListener("lostpointercapture", stopCameraDrag);

// Keyboard controls
const keys = Object.create(null);
const controlKeys = new Set(["w", "a", "s", "d", " ", "r", "arrowup", "arrowdown", "arrowleft", "arrowright"]);

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (controlKeys.has(key) && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
    event.preventDefault();
    keys[key] = true;
  }
  if (key === "r" && !event.repeat && joined) resetCar();
});

window.addEventListener("keyup", (event) => {
  keys[event.key.toLowerCase()] = false;
});
window.addEventListener("blur", () => {
  for (const key of Object.keys(keys)) keys[key] = false;
});

function resetCar() {
  chassisBody.position.set(spawnX, 0.24, spawnZ);
  chassisBody.quaternion.set(0, 0, 0, 1);
  chassisBody.velocity.set(0, 0, 0);
  chassisBody.angularVelocity.set(0, 0, 0);
  throttleState = 0;
  steerState = 0;
  chassisBody.force.set(0, 0, 0);
  chassisBody.torque.set(0, 0, 0);
  chassisBody.wakeUp();
  for (let i = 0; i < 4; i++) {
    vehicle.wheelInfos[i].rotation = 0;
    vehicle.wheelInfos[i].deltaRotation = 0;
    vehicle.wheelInfos[i].engineForce = 0;
  }
  showToast("Car reset");
}

let steerState = 0;
let throttleState = 0;
const localAirTorque = new CANNON.Vec3();
const worldAirTorque = new CANNON.Vec3();

function updateDrivingControls(delta) {
  if (!joined) {
    for (let i = 0; i < 4; i++) {
      vehicle.applyEngineForce(0, i);
      vehicle.setBrake(0, i);
    }
    return;
  }

  const forward = keys.w || keys.arrowup ? 1 : 0;
  const reverse = keys.s || keys.arrowdown ? -1 : 0;
  const throttle = forward + reverse;
  const steerTarget = (keys.a || keys.arrowleft ? 1 : 0) -
    (keys.d || keys.arrowright ? 1 : 0);

  // Time-based smoothing keeps the handling stable across frame rates.
  const steerResponse = 1 - Math.exp(-11 * delta);
  const throttleResponse = 1 - Math.exp(-6.5 * delta);
  steerState += (steerTarget - steerState) * steerResponse;
  throttleState += (throttle - throttleState) * throttleResponse;

  const speed = chassisBody.velocity.length();
  const speedSteerScale = THREE.MathUtils.clamp(1 - speed / 29, 0.48, 1);
  const steeringAngle = steerState * 0.42 * speedSteerScale;
  vehicle.setSteeringValue(steeringAngle, 0);
  vehicle.setSteeringValue(steeringAngle, 1);

  // Progressive four-wheel drive with a gradual top-speed fade.
  const speedLimitScale = THREE.MathUtils.clamp(1 - speed / 27, 0.24, 1);
  const engineForce = throttleState * 30 * speedLimitScale;
  for (let i = 0; i < 4; i++) {
    vehicle.applyEngineForce(engineForce, i);
    vehicle.setBrake(0, i);
  }

  // Smooth chassis drag braking, retained from the last working build.
  if (keys[" "] && delta > 0) {
    const brakeFactor = Math.exp(-2.7 * delta);
    chassisBody.velocity.x *= brakeFactor;
    chassisBody.velocity.z *= brakeFactor;
  }

  const groundedWheels = vehicle.wheelInfos.reduce(
    (count, wheel) => count + (wheel.isInContact ? 1 : 0),
    0
  );

  // Do not apply flight controls while the truck is merely settling at spawn.
  const airborne = groundedWheels <= 1 && chassisBody.position.y > 0.42;

  if (airborne) {
    // RC-style attitude control while airborne:
    // W raises the nose, S lowers it, A/D yaw the truck, and a small roll
    // component banks it into turns.
    localAirTorque.set(
      throttleState * 1.35,
      steerState * 0.9,
      -steerState * 0.18
    );

    // Cannon-es 0.20 exposes applyTorque() in world space. Convert the
    // locally-authored torque into world space before applying it. Feature
    // detection makes this optional feature fail-safe instead of crashing
    // the animation loop if a physics library changes unexpectedly.
    if (
      typeof chassisBody.vectorToWorldFrame === "function" &&
      typeof chassisBody.applyTorque === "function"
    ) {
      chassisBody.vectorToWorldFrame(localAirTorque, worldAirTorque);
      chassisBody.applyTorque(worldAirTorque);
    }
  } else if (groundedWheels >= 3) {
    // Let tire contact settle small pitch/roll oscillations on the ground.
    chassisBody.angularVelocity.x *= 0.94;
    chassisBody.angularVelocity.z *= 0.94;
  } else {
    chassisBody.angularVelocity.x *= 0.985;
    chassisBody.angularVelocity.z *= 0.985;
  }
}

// Multiplayer is peer-to-peer. Trystero uses public Nostr relays for discovery,
// while the actual car snapshots travel directly between browsers over WebRTC.
async function joinArena() {
  if (joined || room) return;
  const typedName = $("driverName").value.trim().slice(0, 18);
  const typedRoom = $("roomCode").value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24);
  if (!typedRoom) {
    joinError.textContent = "Enter a room code to join.";
    joinError.style.display = "block";
    return;
  }

  driverName = typedName || "Driver";
  joinedRoomCode = typedRoom;
  joinButton.disabled = true;
  joinButton.textContent = "CONNECTING...";
  joinError.style.display = "none";

  try {
    room = joinRoom({ appId: APP_ID }, joinedRoomCode);
    stateAction = room.makeAction("vehicle-state");

    stateAction.onMessage = (data, meta) => {
      const peerId = meta?.peerId;
      if (!peerId || peerId === selfId || !validSnapshot(data)) return;
      addRemotePlayer(peerId, data);
    };

    room.onPeerJoin = (peerId) => {
      peersConnected = true;
      updatePlayerCount();
      if (stateAction) stateAction.send(makeSnapshot());
      showToast("Another driver joined");
    };

    room.onPeerLeave = (peerId) => {
      const remote = remotePlayers.get(peerId);
      if (remote) {
        scene.remove(remote.visual.root);
        remotePlayers.delete(peerId);
      }
      peersConnected = remotePlayers.size > 0;
      updatePlayerCount();
      showToast("A driver left the room");
    };

    joined = true;
    $("roomValue").textContent = joinedRoomCode.toUpperCase();
    joinPanel.style.display = "none";
    hud.style.display = "block";
    viewMode = "drive";
    $("statusDot").classList.remove("live");
    $("topStatus").textContent = "WAITING FOR DRIVERS";
    updatePlayerCount();
    showToast("You're in the arena");
  } catch (error) {
    console.error("Unable to join multiplayer room:", error);
    room = null;
    stateAction = null;
    joinError.textContent = "Couldn't start multiplayer. Check your connection and try again.";
    joinError.style.display = "block";
  } finally {
    joinButton.disabled = false;
    joinButton.textContent = "JOIN THE ARENA";
  }
}

async function leaveArena() {
  if (room) {
    try {
      await room.leave();
    } catch (error) {
      console.warn("Room cleanup failed:", error);
    }
  }
  room = null;
  stateAction = null;
  joined = false;
  peersConnected = false;
  for (const remote of remotePlayers.values()) scene.remove(remote.visual.root);
  remotePlayers.clear();
  for (const key of Object.keys(keys)) keys[key] = false;
  updatePlayerCount();
  hud.style.display = "none";
  joinPanel.style.display = "block";
  viewMode = "drive";
  setArenaVisible(true);
  $("topStatus").style.display = "flex";
  $("topStatus").textContent = "READY TO DRIVE";
  $("statusDot").classList.remove("live");
  resetCar();
}

joinButton.addEventListener("click", joinArena);
$("leaveButton").addEventListener("click", leaveArena);
$("menuDriveButton").addEventListener("click", showDriveScreen);
$("menuGarageButton").addEventListener("click", showGarage);
$("garageBackButton").addEventListener("click", showMainMenu);
$("driveBackButton").addEventListener("click", showMainMenu);
$("roomCode").addEventListener("keydown", (event) => {
  if (event.key === "Enter") joinArena();
});
$("driverName").addEventListener("keydown", (event) => {
  if (event.key === "Enter") $("roomCode").focus();
});

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
}
window.addEventListener("resize", resize);

let lastTime = performance.now();
let networkTimer = 0;
let drivingControlErrorReported = false;
function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  try {
    updateDrivingControls(delta);
  } catch (error) {
    // A control bug must not stop the render loop or turn the track screen
    // into a blank background. Remove drive force and report the error once.
    for (let i = 0; i < 4; i++) {
      vehicle.applyEngineForce(0, i);
      vehicle.setBrake(0, i);
    }
    vehicle.setSteeringValue(0, 0);
    vehicle.setSteeringValue(0, 1);
    if (!drivingControlErrorReported) {
      console.error("Driving controls failed; keeping the game running:", error);
      showToast("Driving input error — please reload the game");
      drivingControlErrorReported = true;
    }
  }
  updateGarageShellAnimation(now);
  world.step(FIXED_STEP, delta, 3);
  updateLocalVisual();
  updateRemoteVisuals(delta);

  const speedMph = chassisBody.velocity.length() * 2.236936;
  $("speedValue").textContent = String(Math.round(speedMph));
  const touching = vehicle.wheelInfos.filter((wheel) => wheel.isInContact).length;
  $("wheelStatus").textContent = touching + " / 4 TIRES IN CONTACT";

  // The showroom camera presents the parked truck in menu and garage views.
  if (viewMode === "menu" || viewMode === "garage") {
    const distance = viewMode === "garage" ? 2.35 : 5.1;
    const height = viewMode === "garage" ? 1.18 : 2.15;
    const orbitDirection = new THREE.Vector3(0, 0, 1)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraOrbitYaw + (viewMode === "menu" ? -0.18 : 0));
    const showroomCamera = localCar.root.position.clone()
      .addScaledVector(orbitDirection, distance)
      .add(new THREE.Vector3(0, height, 0));
    camera.position.lerp(showroomCamera, 1 - Math.exp(-3.2 * delta));
    camera.lookAt(localCar.root.position.clone().add(new THREE.Vector3(0, 0.12, 0)));
    if (activeGaragePartObject) {
      garagePartBounds.setFromObject(activeGaragePartObject);
      garagePartOutline.updateMatrixWorld(true);
    }
  } else {
  // Follow horizontal heading only; ignore chassis pitch and roll.
  const carForward = new THREE.Vector3(0, 0, -1).applyQuaternion(localCar.root.quaternion);
  carForward.y = 0;
  if (carForward.lengthSq() < 0.0001) carForward.set(0, 0, -1);
  carForward.normalize();
  const cameraDirection = carForward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraOrbitYaw);
  const desiredCamera = localCar.root.position.clone()
    .addScaledVector(cameraDirection, -5.8)
    .add(new THREE.Vector3(0, 2.8, 0));
  camera.position.lerp(desiredCamera, 1 - Math.exp(-2.8 * delta));
  const lookTarget = localCar.root.position.clone()
    .add(new THREE.Vector3(0, 0.28, 0))
    .addScaledVector(carForward, 0.85);
  camera.up.set(0, 1, 0);
  camera.lookAt(lookTarget);
  }

  networkTimer += delta;
  if (joined && stateAction && networkTimer >= 1 / 15) {
    stateAction.send(makeSnapshot());
    networkTimer = 0;
  }

  renderer.render(scene, camera);
}
updateLocalVisual();
$("loading").style.display = "none";
showMainMenu();
requestAnimationFrame(animate);

// Generate a local default nickname so each tab is easy to distinguish.
$("driverName").value = "Driver" + String(Math.floor(100 + Math.random() * 900));
