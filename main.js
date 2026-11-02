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
    const orange = new THREE.MeshStandardMaterial({ color: 0xff4b0b, roughness: 0.32, metalness: 0.05 });
    const orangeLight = new THREE.MeshStandardMaterial({ color: 0xff6820, roughness: 0.34, metalness: 0.04 });
    const shellBlack = new THREE.MeshStandardMaterial({ color: 0x11161b, roughness: 0.4, metalness: 0.1 });
    const charcoal = new THREE.MeshStandardMaterial({ color: 0x30383e, roughness: 0.48, metalness: 0.18 });
    const gray = new THREE.MeshStandardMaterial({ color: 0x7b858a, roughness: 0.44, metalness: 0.28 });
    const lightGray = new THREE.MeshStandardMaterial({ color: 0xb5bdc0, roughness: 0.3, metalness: 0.74 });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x101c27, roughness: 0.16, metalness: 0.16,
      transparent: true, opacity: 0.96, clearcoat: 0.8, clearcoatRoughness: 0.12,
      side: THREE.DoubleSide
    });
    const headlamp = new THREE.MeshStandardMaterial({
      color: 0xf5e9cf, emissive: 0x8b6231, emissiveIntensity: 0.18, roughness: 0.24
    });
    const tailLamp = new THREE.MeshStandardMaterial({
      color: 0xb92725, emissive: 0x5e0c09, emissiveIntensity: 0.16, roughness: 0.28
    });

    // z is the truck's length axis; negative z is the nose.
    const profiles = [
      [-0.72, 0.25, 0.218, 0.145],
      [-0.64, 0.33, 0.263, 0.148],
      [-0.49, 0.372, 0.292, 0.150],
      [-0.30, 0.365, 0.302, 0.150],
      [-0.18, 0.331, 0.337, 0.155],
      [-0.075, 0.272, 0.475, 0.180],
      [0.205, 0.272, 0.490, 0.180],
      [0.305, 0.315, 0.365, 0.160],
      [0.425, 0.360, 0.305, 0.150],
      [0.605, 0.350, 0.283, 0.145],
      [0.720, 0.285, 0.230, 0.140]
    ];
    const topCurve = new THREE.CatmullRomCurve3(
      profiles.map(([z, width, top]) => new THREE.Vector3(z, width, top)),
      false, "centripetal"
    );
    const edgeCurve = new THREE.CatmullRomCurve3(
      profiles.map(([z, , , edge]) => new THREE.Vector3(z, edge, 0)),
      false, "centripetal"
    );
    const topSamples = topCurve.getPoints(120);
    const edgeSamples = edgeCurve.getPoints(120);
    const rows = topSamples.map((p, i) => ({
      z: p.x, width: p.y, top: p.z, edge: edgeSamples[i].y
    }));

    function atZ(z) {
      if (z <= rows[0].z) return rows[0];
      if (z >= rows[rows.length - 1].z) return rows[rows.length - 1];
      for (let i = 0; i < rows.length - 1; i++) {
        const a = rows[i], b = rows[i + 1];
        if (z >= a.z && z <= b.z) {
          const t = (z - a.z) / Math.max(0.00001, b.z - a.z);
          return {
            z,
            width: THREE.MathUtils.lerp(a.width, b.width, t),
            top: THREE.MathUtils.lerp(a.top, b.top, t),
            edge: THREE.MathUtils.lerp(a.edge, b.edge, t)
          };
        }
      }
      return rows[rows.length - 1];
    }

    function loft(parent, material, z0, z1, widthFactor = 1, lift = 0, rowCount = 80, colCount = 28) {
      const positions = [], indices = [];
      for (let r = 0; r <= rowCount; r++) {
        const z = THREE.MathUtils.lerp(z0, z1, r / rowCount);
        const p = atZ(z);
        for (let c = 0; c <= colCount; c++) {
          const across = ((c / colCount) * 2 - 1) * widthFactor;
          const x = p.width * across;
          const crown = 1 - Math.pow(Math.abs(across), 1.62);
          const y = p.edge + (p.top - p.edge) * crown + lift;
          positions.push(x, y, z);
        }
      }
      for (let r = 0; r < rowCount; r++) {
        for (let c = 0; c < colCount; c++) {
          const a = r * (colCount + 1) + c;
          const b = a + 1;
          const d = (r + 1) * (colCount + 1) + c;
          const e = d + 1;
          indices.push(a, d, b, b, d, e);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      material.side = THREE.DoubleSide;
      return addMesh(parent, geometry, material);
    }

    // A 2D profile in q/y, rotated onto either side of the truck.
    // q = -z means the front of the truck is on the positive side of the shape.
    function sideShape(parent, side, material, draw) {
      const shape = new THREE.Shape();
      draw(shape);
      const mesh = addMesh(parent, new THREE.ShapeGeometry(shape, 32), material);
      mesh.rotation.y = Math.PI / 2;
      mesh.position.x = side * 0.354;
      material.side = THREE.DoubleSide;
      return mesh;
    }

    function quad(parent, points, material) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(points.flat(), 3));
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      geometry.computeVertexNormals();
      material.side = THREE.DoubleSide;
      return addMesh(parent, geometry, material);
    }

    // Main orange one-piece skin with molded short-course wheel openings.
    const skin = makePart(
      shellGroup, "shell-orange-main", "Orange polycarbonate body",
      "The main short-course shell: a long low hood, flared wheel openings, compact cab and short rear bed. It covers the electronics while leaving the four tires exposed."
    );
    loft(skin, orange, -0.72, 0.72, 1, 0, 120, 32);
    for (const side of [-1, 1]) {
      sideShape(skin, side, orange, (shape) => {
        shape.moveTo(-0.72, 0.15);
        shape.lineTo(-0.555, 0.15);
        shape.quadraticCurveTo(-0.365, 0.355, -0.175, 0.15);
        shape.lineTo(0.175, 0.15);
        shape.quadraticCurveTo(0.365, 0.355, 0.555, 0.15);
        shape.lineTo(0.70, 0.165);
        shape.lineTo(0.71, 0.235);
        shape.lineTo(0.60, 0.28);
        shape.lineTo(0.435, 0.30);
        shape.lineTo(0.34, 0.355);
        shape.lineTo(0.275, 0.475);
        shape.lineTo(-0.075, 0.49);
        shape.lineTo(-0.225, 0.34);
        shape.lineTo(-0.575, 0.292);
        shape.lineTo(-0.72, 0.235);
        shape.closePath();
      });
    }

    // Black center hood graphic and two inset vents over the orange hood.
    const hood = makePart(
      shellGroup, "shell-hood-graphics", "Black hood panel and vents",
      "A satin-black hood center sits inside the orange bonnet, with orange pinstripes and two small cooling vents."
    );
    loft(hood, shellBlack, -0.655, -0.205, 0.55, 0.004, 40, 20);
    for (const side of [-1, 1]) {
      roundedBox(hood, [0.088, 0.012, 0.05], shellBlack,
        [side * 0.244, 0.293, -0.455], [0.05, 0, side * 0.08], 0.007);
      roundedBox(hood, [0.048, 0.008, 0.022], lightGray,
        [side * 0.244, 0.301, -0.455], [0.05, 0, side * 0.08], 0.004);
    }
    loft(hood, orangeLight, -0.625, -0.235, 0.585, 0.006, 34, 2);

    // Low black roof and roof intake.
    const roof = makePart(
      shellGroup, "shell-black-roof", "Black cab roof",
      "Low black roof panel with softly rounded shoulders and a small molded roof intake."
    );
    loft(roof, shellBlack, -0.065, 0.235, 0.90, 0.009, 38, 22);
    roundedBox(roof, [0.145, 0.022, 0.092], charcoal,
      [0, 0.495, 0.095], null, 0.018);
    roundedBox(roof, [0.105, 0.009, 0.055], shellBlack,
      [0, 0.510, 0.095], null, 0.012);

    // Front and rear smoked glass.
    const windshield = makePart(
      shellGroup, "shell-windscreen", "Tinted windshield and rear window",
      "Dark smoked polycarbonate glazing follows the steep windshield and rear cab angle. Black borders frame both windows."
    );
    quad(windshield, [
      [-0.238, 0.337, -0.175], [0.238, 0.337, -0.175],
      [0.205, 0.475, -0.065], [-0.205, 0.475, -0.065]
    ], glass);
    quad(windshield, [
      [-0.205, 0.475, 0.218], [0.205, 0.475, 0.218],
      [0.240, 0.355, 0.315], [-0.240, 0.355, 0.315]
    ], glass);
    for (const side of [-1, 1]) {
      cylinderBetween(windshield, [side * 0.238, 0.337, -0.175],
        [side * 0.205, 0.475, -0.065], 0.009, shellBlack, 10);
      cylinderBetween(windshield, [side * 0.205, 0.475, 0.218],
        [side * 0.240, 0.355, 0.315], 0.009, shellBlack, 10);
    }

    const sideWindows = makePart(
      shellGroup, "shell-side-windows", "Tinted side windows and cab pillars",
      "Smoked driver and passenger windows with thick black pillars and a separate quarter-window section."
    );
    for (const side of [-1, 1]) {
      sideShape(sideWindows, side, glass, (shape) => {
        shape.moveTo(-0.205, 0.355);
        shape.lineTo(-0.025, 0.355);
        shape.lineTo(-0.025, 0.455);
        shape.lineTo(-0.095, 0.462);
        shape.closePath();
      });
      sideShape(sideWindows, side, glass, (shape) => {
        shape.moveTo(0.015, 0.355);
        shape.lineTo(0.205, 0.355);
        shape.lineTo(0.170, 0.458);
        shape.lineTo(0.025, 0.458);
        shape.closePath();
      });
      cylinderBetween(sideWindows, [side * 0.344, 0.347, -0.025],
        [side * 0.278, 0.475, -0.065], 0.012, shellBlack, 10);
      cylinderBetween(sideWindows, [side * 0.344, 0.350, 0.205],
        [side * 0.255, 0.475, 0.205], 0.012, shellBlack, 10);
      cylinderBetween(sideWindows, [side * 0.350, 0.350, 0.015],
        [side * 0.350, 0.350, 0.190], 0.008, charcoal, 8);
    }

    // Gray rear bed and quarter panels.
    const rearQuarter = makePart(
      shellGroup, "shell-gray-rear-quarter", "Graphite rear bed and quarter panels",
      "Dark gray rear fender/bed sections contrast with the orange doors and black roof. Raised lips and panel creases give the rear body more depth."
    );
    for (const side of [-1, 1]) {
      sideShape(rearQuarter, side, charcoal, (shape) => {
        shape.moveTo(-0.68, 0.18);
        shape.lineTo(-0.39, 0.18);
        shape.lineTo(-0.355, 0.285);
        shape.lineTo(-0.59, 0.292);
        shape.closePath();
      });
      cylinderBetween(rearQuarter, [side * 0.36, 0.285, 0.39],
        [side * 0.35, 0.30, 0.62], 0.012, lightGray, 10);
      roundedBox(rearQuarter, [0.018, 0.014, 0.25], gray,
        [side * 0.356, 0.285, 0.50], null, 0.005);
    }
    loft(rearQuarter, charcoal, 0.405, 0.675, 0.88, 0.006, 28, 18);

    // Lower black rocker, gray skirt and generic short-course race-number decals.
    const graphics = makePart(
      shellGroup, "shell-door-graphics", "Orange doors and racing graphics",
      "Orange door panels carry angular black/gray racing graphics and a white number. The livery uses no sponsor logos."
    );
    for (const side of [-1, 1]) {
      roundedBox(graphics, [0.018, 0.035, 0.30], shellBlack,
        [side * 0.359, 0.178, 0.015], null, 0.006);
      roundedBox(graphics, [0.012, 0.012, 0.22], orangeLight,
        [side * 0.368, 0.199, 0.015], null, 0.004);

      const decalCanvas = document.createElement("canvas");
      decalCanvas.width = 512;
      decalCanvas.height = 256;
      const ctx = decalCanvas.getContext("2d");
      ctx.clearRect(0, 0, 512, 256);
      ctx.fillStyle = "rgba(12,16,20,.94)";
      ctx.beginPath();
      ctx.moveTo(25, 62);
      ctx.lineTo(480, 34);
      ctx.lineTo(430, 203);
      ctx.lineTo(70, 220);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#8b9499";
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(55, 198);
      ctx.lineTo(440, 58);
      ctx.stroke();
      ctx.fillStyle = "#f5f5f3";
      ctx.strokeStyle = "#11161b";
      ctx.lineWidth = 14;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "italic 900 132px Arial";
      ctx.strokeText("27", 270, 119);
      ctx.fillText("27", 270, 119);
      ctx.font = "900 24px Arial";
      ctx.fillStyle = "#ff6a24";
      ctx.fillText("SHORT COURSE", 255, 205);
      const texture = new THREE.CanvasTexture(decalCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const decalMaterial = new THREE.MeshBasicMaterial({
        map: texture, transparent: true, depthWrite: false,
        side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2
      });
      const decal = addMesh(
        graphics, new THREE.PlaneGeometry(0.235, 0.105), decalMaterial,
        [side * 0.373, 0.255, 0.015], [0, Math.PI / 2, 0]
      );
      decal.castShadow = false;
    }

    // Raised arches sit just outside the tires; inner black liners remain visible.
    const arches = makePart(
      shellGroup, "shell-wheel-arch-flares", "Wheel-arch flares and liners",
      "Rounded short-course fender lips sit outside each tire. Dark inner liners deepen the wheel openings."
    );
    for (const side of [-1, 1]) {
      for (const z of [-0.29, 0.29]) {
        const flare = new THREE.Mesh(
          new THREE.TorusGeometry(0.158, 0.018, 10, 48, Math.PI), shellBlack
        );
        flare.rotation.y = Math.PI / 2;
        flare.position.set(side * 0.372, 0.145, z);
        flare.castShadow = true;
        flare.receiveShadow = true;
        arches.add(flare);
        const lip = new THREE.Mesh(
          new THREE.TorusGeometry(0.145, 0.006, 7, 44, Math.PI), orangeLight
        );
        lip.rotation.y = Math.PI / 2;
        lip.position.set(side * 0.374, 0.145, z);
        arches.add(lip);
      }
      roundedBox(arches, [0.028, 0.045, 0.34], shellBlack,
        [side * 0.36, 0.145, 0], null, 0.012);
    }

    // Front grille, detailed lights and gray tubular impact bumper.
    const front = makePart(
      shellGroup, "shell-front-fascia", "Front grille, headlights and gray bumper",
      "The short-course nose has a dark horizontal grille, paired projector-style headlights, a gray lower valance and tubular front impact bar."
    );
    roundedBox(front, [0.36, 0.067, 0.024], shellBlack, [0, 0.207, -0.704], null, 0.012);
    for (let i = 0; i < 5; i++) {
      roundedBox(front, [0.012, 0.045, 0.009], gray,
        [-0.13 + i * 0.065, 0.207, -0.719], null, 0.003);
    }
    for (const side of [-1, 1]) {
      roundedBox(front, [0.115, 0.057, 0.025], charcoal,
        [side * 0.25, 0.235, -0.684], null, 0.012);
      roundedBox(front, [0.085, 0.037, 0.012], headlamp,
        [side * 0.25, 0.239, -0.701], null, 0.01);
      for (let i = 0; i < 2; i++) {
        const lens = new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 10), lightGray);
        lens.scale.set(1, 0.72, 0.45);
        lens.position.set(side * (0.225 + i * 0.048), 0.239, -0.711);
        front.add(lens);
      }
    }
    roundedBox(front, [0.67, 0.074, 0.082], gray,
      [0, 0.105, -0.723], null, 0.025);
    roundedBox(front, [0.53, 0.027, 0.055], shellBlack,
      [0, 0.135, -0.754], null, 0.012);
    cylinderBetween(front, [-0.31, 0.17, -0.735], [0.31, 0.17, -0.735], 0.014, lightGray, 12);
    for (const side of [-1, 1]) {
      cylinderBetween(front, [side * 0.29, 0.12, -0.735],
        [side * 0.26, 0.235, -0.716], 0.014, lightGray, 10);
      roundedBox(front, [0.018, 0.025, 0.018], headlamp,
        [side * 0.33, 0.215, -0.66], null, 0.004);
    }

    // Rear tailgate and gray impact bumper.
    const rear = makePart(
      shellGroup, "shell-rear-tailgate", "Rear tailgate, lamps and bumper",
      "A dark tailgate panel with red corner lights and a broad gray rear impact bumper completes the short-course body."
    );
    roundedBox(rear, [0.43, 0.075, 0.025], charcoal, [0, 0.212, 0.709], null, 0.012);
    for (const side of [-1, 1]) {
      roundedBox(rear, [0.095, 0.05, 0.027], tailLamp,
        [side * 0.25, 0.23, 0.705], null, 0.01);
    }
    roundedBox(rear, [0.64, 0.07, 0.075], gray,
      [0, 0.105, 0.73], null, 0.02);
    roundedBox(rear, [0.28, 0.024, 0.02], shellBlack,
      [0, 0.13, 0.766], null, 0.006);

    // Mirrors, wipers and molded bed-rail detail.
    const trim = makePart(
      shellGroup, "shell-exterior-trim", "Mirrors, wipers and bed rails",
      "Small black side mirrors, windshield wipers, roof antenna base and raised rear bed rails finish the shell."
    );
    for (const side of [-1, 1]) {
      cylinderBetween(trim, [side * 0.30, 0.33, -0.18],
        [side * 0.365, 0.34, -0.215], 0.009, shellBlack, 10);
      roundedBox(trim, [0.055, 0.035, 0.06], shellBlack,
        [side * 0.375, 0.345, -0.225], [0, 0, side * 0.08], 0.01);
      cylinderBetween(trim, [side * 0.16, 0.344, -0.18],
        [side * 0.06, 0.346, -0.18], 0.004, lightGray, 8);
      cylinderBetween(trim, [side * 0.15, 0.345, -0.155],
        [side * 0.05, 0.347, -0.155], 0.004, lightGray, 8);
      roundedBox(trim, [0.026, 0.012, 0.27], shellBlack,
        [side * 0.345, 0.282, 0.51], null, 0.006);
    }
    roundedBox(trim, [0.07, 0.026, 0.06], shellBlack, [0, 0.30, 0.61], null, 0.009);
    cylinderBetween(trim, [0, 0.30, 0.61], [0, 0.41, 0.63], 0.004, lightGray, 8);

    // Subtle gray lower side panels tie the rear bed into the front bumper.
    const lowerTrim = makePart(
      shellGroup, "shell-gray-lower-accents", "Gray lower side accents",
      "Gray lower trim runs below the orange doors and visually links the graphite rear panels to the front bumper."
    );
    for (const side of [-1, 1]) {
      roundedBox(lowerTrim, [0.018, 0.018, 0.19], gray,
        [side * 0.365, 0.165, -0.17], null, 0.005);
      roundedBox(lowerTrim, [0.014, 0.009, 0.22], orangeLight,
        [side * 0.369, 0.196, -0.14], null, 0.004);
    }
  }

  makeBodyShell();
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
  if (description) description.textContent = "Move your pointer over the exposed chassis to identify each part.";
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
  const intersections = garageRaycaster.intersectObject(localCar.root, true);
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
  localCar.setShellVisible(true);
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
  localCar.setShellVisible(true);
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
  localCar.setShellVisible(visible);
  $("shellToggleButton").textContent = visible ? "REMOVE BODY SHELL" : "INSTALL BODY SHELL";
  clearGaragePartHover();
}
$("shellToggleButton").addEventListener("click", () => {
  setGarageShellVisible(!localCar.shellGroup.visible);
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
