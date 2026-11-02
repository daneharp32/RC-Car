import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js";
import { RoundedBoxGeometry } from "https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/geometries/RoundedBoxGeometry.js";
import * as CANNON from "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js";
import { joinRoom, selfId } from "https://esm.sh/trystero@0.26.0";

const $ = (id) => document.getElementById(id);
const canvas = $("gameCanvas");
const inputSurface = $("gameInputSurface");
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
  // Main kicker: much wider and taller, with a steeper takeoff face.
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

for (let i = 0; i < 4; i++) {
  const [x, y, z] = wheelPositions[i];
  vehicle.addWheel({
    chassisConnectionPointLocal: new CANNON.Vec3(x, y, z),
    directionLocal: new CANNON.Vec3(0, -1, 0),
    axleLocal: new CANNON.Vec3(-1, 0, 0),
    suspensionRestLength: 0.12,
    suspensionStiffness: 48,
    dampingCompression: 5.0,
    dampingRelaxation: 4.0,
    maxSuspensionTravel: 0.16,
    maxSuspensionForce: 300,
    radius: 0.13,
    frictionSlip: 5.0,
    rollInfluence: 0.075,
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

  // The visual body is deliberately fuller and longer, while the physics
  // chassis and wheel connection points remain unchanged.
  chassisGroup.scale.set(1.14, 1.13, 1.16);
  shellGroup.scale.set(1.14, 1.13, 1.16);

  const paint = new THREE.MeshStandardMaterial({
    color, roughness: 0.29, metalness: 0.08
  });
  const paintDark = new THREE.MeshStandardMaterial({ color: 0x18232d, roughness: 0.42 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x102b3d, roughness: 0.13, metalness: 0.12,
    clearcoat: 0.75, clearcoatRoughness: 0.12
  });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x11171c, roughness: 0.84 });
  const graphite = new THREE.MeshStandardMaterial({ color: 0x303b43, metalness: 0.56, roughness: 0.38 });
  const alloy = new THREE.MeshStandardMaterial({ color: 0xa8b4ba, metalness: 0.78, roughness: 0.27 });
  const springMetal = new THREE.MeshStandardMaterial({ color: 0xe1e7e9, metalness: 0.72, roughness: 0.24 });
  const red = new THREE.MeshStandardMaterial({ color: 0xd94b37, roughness: 0.38 });
  const amber = new THREE.MeshStandardMaterial({
    color: 0xffe5ad, emissive: 0xffa83d, emissiveIntensity: 0.75
  });
  const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x141719, roughness: 0.98 });
  const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xc0c9cd, metalness: 0.78, roughness: 0.26 });
  const hubMaterial = new THREE.MeshStandardMaterial({ color: 0x313b42, metalness: 0.48, roughness: 0.42 });

  function addMesh(parent, geometry, material, position = [0, 0, 0], rotation = null) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function roundedBox(parent, size, material, position, rotation = null, radius = null) {
    const smallest = Math.min(...size);
    const bevel = radius ?? Math.min(0.035, smallest * 0.22);
    return addMesh(
      parent,
      new RoundedBoxGeometry(size[0], size[1], size[2], 4, bevel),
      material,
      position,
      rotation
    );
  }

  function cylinderBetween(parent, start, end, radius, material, radialSegments = 14, endRadius = radius) {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const direction = b.clone().sub(a);
    const length = direction.length();
    const mesh = addMesh(
      parent,
      new THREE.CylinderGeometry(endRadius, radius, length, radialSegments, 1, false),
      material,
      a.clone().add(b).multiplyScalar(0.5).toArray()
    );
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return mesh;
  }

  function tubeBetween(parent, start, end, radius, material) {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const curve = new THREE.LineCurve3(a, b);
    return addMesh(parent, new THREE.TubeGeometry(curve, 1, radius, 8, false), material);
  }

  function panel(parent, points, material) {
    const geometry = new THREE.BufferGeometry();
    const positions = points.flat();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    return addMesh(parent, geometry, material);
  }

  function makeBodyShell() {
    // A continuous lofted shell replaces the old stack of rectangular body
    // pieces. Superellipse sections give the pickup body rounded shoulders.
    const profiles = [
      [-0.535, 0.245, 0.175],
      [-0.455, 0.315, 0.215],
      [-0.315, 0.337, 0.245],
      [-0.205, 0.323, 0.275],
      [-0.125, 0.286, 0.385],
      [-0.045, 0.278, 0.425],
      [ 0.105, 0.278, 0.435],
      [ 0.185, 0.300, 0.390],
      [ 0.285, 0.332, 0.292],
      [ 0.425, 0.322, 0.258],
      [ 0.525, 0.250, 0.175]
    ];
    const profileCurve = new THREE.CatmullRomCurve3(
      profiles.map(([z, width, top]) => new THREE.Vector3(z, width, top)),
      false,
      "centripetal"
    );
    const sections = profileCurve.getPoints(72);
    const ringSegments = 32;
    const vertices = [];
    const indices = [];
    for (const section of sections) {
      for (let j = 0; j < ringSegments; j++) {
        const angle = (j / ringSegments) * Math.PI * 2;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const superX = Math.sign(c) * Math.pow(Math.abs(c), 0.68);
        const superY = Math.sign(s) * Math.pow(Math.abs(s), 0.68);
        const x = section.y * superX;
        const y = 0.055 + (section.z - 0.055) * (0.5 + 0.5 * superY);
        vertices.push(x, y, section.x);
      }
    }
    for (let i = 0; i < sections.length - 1; i++) {
      for (let j = 0; j < ringSegments; j++) {
        const a = i * ringSegments + j;
        const b = i * ringSegments + (j + 1) % ringSegments;
        const c = (i + 1) * ringSegments + (j + 1) % ringSegments;
        const d = (i + 1) * ringSegments + j;
        indices.push(a, b, d, b, c, d);
      }
    }
    const frontCap = vertices.length / 3;
    vertices.push(0, (0.055 + sections[0].z) * 0.5, sections[0].x);
    const rearCap = vertices.length / 3;
    const lastSection = sections[sections.length - 1];
    vertices.push(0, (0.055 + lastSection.z) * 0.5, lastSection.x);
    for (let j = 0; j < ringSegments; j++) {
      const next = (j + 1) % ringSegments;
      indices.push(frontCap, next, j);
      const last = (sections.length - 1) * ringSegments;
      indices.push(rearCap, last + j, last + next);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const body = addMesh(shellGroup, geometry, paint);
    body.material.side = THREE.DoubleSide;

    // Deep glazing follows the sloped cab instead of looking like flat blocks.
    const glassDark = new THREE.MeshStandardMaterial({
      color: 0x0b1d2a, roughness: 0.19, metalness: 0.16
    });
    panel(shellGroup, [
      [-0.226, 0.278, -0.185], [0.226, 0.278, -0.185],
      [0.232, 0.388, -0.105], [-0.232, 0.388, -0.105]
    ], glass);
    panel(shellGroup, [
      [-0.225, 0.282, 0.221], [0.225, 0.282, 0.221],
      [0.224, 0.382, 0.142], [-0.224, 0.382, 0.142]
    ], glass);

    for (const side of [-1, 1]) {
      const x = side * 0.278;
      panel(shellGroup, [
        [x, 0.286, -0.092], [x, 0.286, 0.015],
        [side * 0.272, 0.385, 0.015], [side * 0.272, 0.389, -0.070]
      ], glassDark);
      panel(shellGroup, [
        [side * 0.278, 0.286, 0.035], [side * 0.292, 0.279, 0.190],
        [side * 0.268, 0.375, 0.132], [side * 0.272, 0.385, 0.035]
      ], glass);
      // Window pillars, door crease and lower side sill.
      cylinderBetween(shellGroup, [side * 0.274, 0.275, -0.105], [side * 0.272, 0.397, -0.072], 0.009, carbon, 8);
      cylinderBetween(shellGroup, [side * 0.274, 0.278, 0.020], [side * 0.270, 0.397, 0.020], 0.009, carbon, 8);
      cylinderBetween(shellGroup, [side * 0.285, 0.278, 0.155], [side * 0.268, 0.385, 0.142], 0.009, carbon, 8);
      roundedBox(shellGroup, [0.025, 0.012, 0.46], carbon, [side * 0.319, 0.080, 0.005], null, 0.005);
      roundedBox(shellGroup, [0.012, 0.018, 0.075], graphite, [side * 0.326, 0.225, 0.055], null, 0.005);
      roundedBox(shellGroup, [0.018, 0.035, 0.055], paintDark, [side * 0.326, 0.205, 0.055], null, 0.006);
    }

    // Raised cab roof, hood crown, rear bed rails and aerodynamic tail wing.
    roundedBox(shellGroup, [0.43, 0.025, 0.225], paint, [0, 0.417, 0.025], null, 0.025);
    roundedBox(shellGroup, [0.54, 0.025, 0.12], paint, [0, 0.247, -0.365], [-0.04, 0, 0], 0.018);
    roundedBox(shellGroup, [0.48, 0.022, 0.025], carbon, [0, 0.283, -0.405], null, 0.008);
    roundedBox(shellGroup, [0.025, 0.012, 0.24], carbon, [-0.115, 0.271, -0.325], null, 0.005);
    roundedBox(shellGroup, [0.025, 0.012, 0.24], carbon, [0.115, 0.271, -0.325], null, 0.005);

    for (const side of [-1, 1]) {
      // Wheel-arch flares: upper semicircles sit just outside the body skin.
      for (const z of [-0.29 / 1.16, 0.29 / 1.16]) {
        const flare = new THREE.Mesh(
          new THREE.TorusGeometry(0.178, 0.021, 9, 40, Math.PI),
          carbon
        );
        flare.rotation.y = Math.PI / 2;
        flare.position.set(side * 0.324, 0.105, z);
        flare.castShadow = true;
        flare.receiveShadow = true;
        shellGroup.add(flare);
      }
      roundedBox(shellGroup, [0.038, 0.035, 0.48], paintDark, [side * 0.322, 0.075, 0.005], null, 0.012);
      roundedBox(shellGroup, [0.024, 0.018, 0.30], paintDark, [side * 0.329, 0.145, 0.015], null, 0.008);
    }

    // Front bumper, grille, lights and rear bumper/tail lamps.
    roundedBox(shellGroup, [0.68, 0.085, 0.105], carbon, [0, 0.075, -0.535], null, 0.025);
    roundedBox(shellGroup, [0.36, 0.066, 0.022], paintDark, [0, 0.157, -0.503], null, 0.012);
    for (let i = 0; i < 5; i++) {
      roundedBox(shellGroup, [0.012, 0.045, 0.008], graphite, [-0.14 + i * 0.07, 0.157, -0.517], null, 0.003);
    }
    for (const side of [-1, 1]) {
      roundedBox(shellGroup, [0.115, 0.042, 0.026], amber, [side * 0.225, 0.182, -0.484], null, 0.009);
      roundedBox(shellGroup, [0.112, 0.038, 0.025], red, [side * 0.225, 0.145, 0.508], null, 0.008);
      roundedBox(shellGroup, [0.045, 0.045, 0.08], carbon, [side * 0.235, 0.335, 0.388], [0.08, 0, side * 0.04], 0.012);
    }
    roundedBox(shellGroup, [0.66, 0.08, 0.10], carbon, [0, 0.075, 0.535], null, 0.022);
    roundedBox(shellGroup, [0.57, 0.028, 0.13], carbon, [0, 0.335, 0.475], [-0.08, 0, 0], 0.012);
    for (const side of [-1, 1]) {
      cylinderBetween(shellGroup, [side * 0.205, 0.18, 0.405], [side * 0.205, 0.325, 0.485], 0.012, graphite, 10);
    }
  }

  function makeShock(top, bottom, accentMaterial) {
    const a = new THREE.Vector3(...top);
    const b = new THREE.Vector3(...bottom);
    const axis = b.clone().sub(a).normalize();
    const mid = a.clone().lerp(b, 0.53);
    const bodyStart = a.clone().lerp(b, 0.24);
    const bodyEnd = a.clone().lerp(b, 0.77);

    cylinderBetween(chassisGroup, bodyStart.toArray(), bodyEnd.toArray(), 0.022, graphite, 14, 0.018);
    cylinderBetween(chassisGroup, mid.clone().lerp(b, 0.18).toArray(), b.toArray(), 0.009, alloy, 10, 0.007);
    cylinderBetween(chassisGroup, a.toArray(), a.clone().add(axis.clone().multiplyScalar(0.035)).toArray(), 0.018, carbon, 12);
    cylinderBetween(chassisGroup, b.clone().add(axis.clone().multiplyScalar(-0.035)).toArray(), b.toArray(), 0.017, red, 12);

    // A true helical spring around the damper body.
    const reference = Math.abs(axis.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    const u = axis.clone().cross(reference).normalize();
    const v = axis.clone().cross(u).normalize();
    const coilStart = a.clone().lerp(b, 0.23);
    const coilEnd = a.clone().lerp(b, 0.76);
    const turns = 6.5;
    const coilPoints = [];
    const steps = 104;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * turns * Math.PI * 2;
      const center = coilStart.clone().lerp(coilEnd, t);
      center.addScaledVector(u, Math.cos(angle) * 0.029);
      center.addScaledVector(v, Math.sin(angle) * 0.029);
      coilPoints.push(center);
    }
    const coilCurve = new THREE.CatmullRomCurve3(coilPoints);
    addMesh(chassisGroup, new THREE.TubeGeometry(coilCurve, 128, 0.0055, 7, false), accentMaterial);

    cylinderBetween(chassisGroup, a.clone().add(axis.clone().multiplyScalar(0.012)).toArray(),
      a.clone().add(axis.clone().multiplyScalar(0.052)).toArray(), 0.027, alloy, 12);
    cylinderBetween(chassisGroup, b.clone().add(axis.clone().multiplyScalar(-0.052)).toArray(),
      b.clone().add(axis.clone().multiplyScalar(-0.012)).toArray(), 0.026, alloy, 12);
  }

  function makeChassisDetails() {
    // Molded chassis tub, side braces, bumpers and front/rear gearboxes.
    roundedBox(chassisGroup, [0.49, 0.075, 0.86], carbon, [0, -0.035, 0], null, 0.035);
    roundedBox(chassisGroup, [0.37, 0.045, 0.55], graphite, [0, 0.012, 0.015], null, 0.018);
    roundedBox(chassisGroup, [0.57, 0.075, 0.105], carbon, [0, -0.002, -0.485], null, 0.022);
    roundedBox(chassisGroup, [0.57, 0.075, 0.105], carbon, [0, -0.002, 0.485], null, 0.022);

    for (const z of [-0.292, 0.292]) {
      const gearbox = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), graphite);
      gearbox.scale.set(0.13, 0.095, 0.105);
      gearbox.position.set(0, 0.03, z);
      gearbox.castShadow = true;
      gearbox.receiveShadow = true;
      chassisGroup.add(gearbox);
      roundedBox(chassisGroup, [0.34, 0.025, 0.075], carbon, [0, -0.012, z], null, 0.01);
      for (const side of [-1, 1]) {
        cylinderBetween(chassisGroup, [side * 0.08, 0.025, z], [side * 0.30, 0.025, z], 0.013, alloy, 10);
      }
    }

    // Center driveshaft and realistic brushless motor can, end cap and fins.
    cylinderBetween(chassisGroup, [0, 0.065, -0.205], [0, 0.065, 0.205], 0.018, alloy, 12);
    const motorCenter = [0.105, 0.145, 0.175];
    cylinderBetween(chassisGroup, [motorCenter[0] - 0.105, motorCenter[1], motorCenter[2]],
      [motorCenter[0] + 0.105, motorCenter[1], motorCenter[2]], 0.055, graphite, 24);
    for (let i = -3; i <= 3; i++) {
      const x = motorCenter[0] + i * 0.024;
      const fin = new THREE.Mesh(new THREE.TorusGeometry(0.051, 0.0045, 6, 24), alloy);
      fin.rotation.y = Math.PI / 2;
      fin.position.set(x, motorCenter[1], motorCenter[2]);
      fin.castShadow = true;
      chassisGroup.add(fin);
    }
    cylinderBetween(chassisGroup, [motorCenter[0] - 0.119, motorCenter[1], motorCenter[2]],
      [motorCenter[0] - 0.108, motorCenter[1], motorCenter[2]], 0.048, carbon, 20);
    cylinderBetween(chassisGroup, [motorCenter[0] + 0.108, motorCenter[1], motorCenter[2]],
      [motorCenter[0] + 0.122, motorCenter[1], motorCenter[2]], 0.043, alloy, 20);
    roundedBox(chassisGroup, [0.018, 0.08, 0.045], red, [motorCenter[0] + 0.124, motorCenter[1], motorCenter[2]], null, 0.006);

    // ESC with cooling ribs, battery pack and retaining straps.
    roundedBox(chassisGroup, [0.145, 0.065, 0.135], carbon, [-0.105, 0.115, 0.17], null, 0.016);
    roundedBox(chassisGroup, [0.12, 0.012, 0.105], graphite, [-0.105, 0.153, 0.17], null, 0.006);
    for (let i = 0; i < 5; i++) {
      roundedBox(chassisGroup, [0.012, 0.012, 0.085], alloy, [-0.145 + i * 0.02, 0.166, 0.17], null, 0.004);
    }
    roundedBox(chassisGroup, [0.15, 0.075, 0.25], paintDark, [-0.125, 0.085, -0.08], null, 0.018);
    for (const z of [-0.16, -0.005]) {
      roundedBox(chassisGroup, [0.165, 0.012, 0.025], red, [-0.125, 0.126, z], null, 0.005);
    }

    // Four independently detailed coil-over shocks and suspension arms.
    for (const z of [-0.292 / 1.16, 0.292 / 1.16]) {
      for (const side of [-1, 1]) {
        const top = [side * 0.195, 0.275, z + (z < 0 ? 0.075 : -0.075)];
        const bottom = [side * 0.275, 0.025, z];
        makeShock(top, bottom, z < 0 ? springMetal : red);
        cylinderBetween(chassisGroup, [side * 0.10, -0.035, z], [side * 0.305, -0.045, z], 0.021, carbon, 10);
        cylinderBetween(chassisGroup, [side * 0.155, -0.012, z], [side * 0.282, 0.015, z], 0.013, alloy, 10);
        cylinderBetween(chassisGroup, [side * 0.18, 0.015, z], [side * 0.285, 0.025, z], 0.011, red, 10);
      }
    }

    // Rear wing hardware, antenna and visible receiver detail.
    for (const side of [-1, 1]) {
      cylinderBetween(chassisGroup, [side * 0.19, 0.12, 0.31], [side * 0.19, 0.28, 0.48], 0.013, graphite, 10);
    }
    roundedBox(chassisGroup, [0.06, 0.025, 0.07], carbon, [0.19, 0.12, 0.04], null, 0.008);
  }

  makeChassisDetails();
  makeBodyShell();

  // Larger, more realistic all-terrain wheels with sidewall rings,
  // deep tread blocks, beadlock rings, rotor faces, spokes and hub nuts.
  const wheelPivots = [];
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(...wheelPositions[i]);
    pivot.scale.setScalar(1.12);
    root.add(pivot);

    const tireRadius = 0.158;
    const tireWidth = 0.132;
    const tire = addMesh(
      pivot,
      new THREE.CylinderGeometry(tireRadius, tireRadius, tireWidth, 40, 1, false),
      tireMaterial
    );
    tire.rotation.z = Math.PI / 2;

    // Alternating center and shoulder lugs are instanced to keep draw calls low.
    const treadInstances = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.041, 0.026, 0.032),
      tireMaterial,
      84
    );
    const treadDummy = new THREE.Object3D();
    let treadIndex = 0;
    for (let n = 0; n < 28; n++) {
      const angle = (n / 28) * Math.PI * 2;
      for (const lane of [-0.041, 0, 0.041]) {
        treadDummy.position.set(
          lane,
          Math.cos(angle) * (tireRadius + 0.006),
          Math.sin(angle) * (tireRadius + 0.006)
        );
        treadDummy.rotation.set(-angle, 0, lane * 2.2);
        treadDummy.updateMatrix();
        treadInstances.setMatrixAt(treadIndex++, treadDummy.matrix);
      }
    }
    treadInstances.instanceMatrix.needsUpdate = true;
    treadInstances.castShadow = true;
    treadInstances.receiveShadow = true;
    pivot.add(treadInstances);

    for (const side of [-1, 1]) {
      const faceX = side * (tireWidth * 0.5 + 0.002);
      const sidewall = new THREE.Mesh(
        new THREE.TorusGeometry(0.126, 0.006, 8, 40),
        carbon
      );
      sidewall.rotation.y = Math.PI / 2;
      sidewall.position.x = faceX;
      sidewall.castShadow = true;
      pivot.add(sidewall);

      const rotor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.103, 0.103, 0.012, 32),
        graphite
      );
      rotor.rotation.z = Math.PI / 2;
      rotor.position.x = side * 0.043;
      rotor.castShadow = true;
      pivot.add(rotor);

      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.096, 0.096, 0.026, 32),
        rimMaterial
      );
      rim.rotation.z = Math.PI / 2;
      rim.position.x = side * 0.059;
      rim.castShadow = true;
      pivot.add(rim);

      const beadlock = new THREE.Mesh(
        new THREE.TorusGeometry(0.102, 0.007, 8, 40),
        hubMaterial
      );
      beadlock.rotation.y = Math.PI / 2;
      beadlock.position.x = side * 0.075;
      beadlock.castShadow = true;
      pivot.add(beadlock);

      if (side === 1) {
        const spokeInstances = new THREE.InstancedMesh(
          new THREE.CylinderGeometry(0.0085, 0.0085, 1, 8),
          hubMaterial,
          16
        );
        const spokeDummy = new THREE.Object3D();
        let spokeIndex = 0;
        for (const faceSide of [-1, 1]) {
          for (let spoke = 0; spoke < 8; spoke++) {
            const angle = (spoke / 8) * Math.PI * 2 + 0.16;
            const start = new THREE.Vector3(faceSide * 0.078, 0, 0);
            const end = new THREE.Vector3(
              faceSide * 0.078,
              Math.cos(angle) * 0.075,
              Math.sin(angle) * 0.075
            );
            const direction = end.clone().sub(start);
            spokeDummy.position.copy(start).add(end).multiplyScalar(0.5);
            spokeDummy.quaternion.setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              direction.clone().normalize()
            );
            spokeDummy.scale.set(1, direction.length(), 1);
            spokeDummy.updateMatrix();
            spokeInstances.setMatrixAt(spokeIndex++, spokeDummy.matrix);
          }
        }
        spokeInstances.instanceMatrix.needsUpdate = true;
        spokeInstances.castShadow = true;
        pivot.add(spokeInstances);
      }

      const centerCap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.03, 24),
        hubMaterial
      );
      centerCap.rotation.z = Math.PI / 2;
      centerCap.position.x = side * 0.085;
      centerCap.castShadow = true;
      pivot.add(centerCap);

      if (side === 1) {
        const nutInstances = new THREE.InstancedMesh(
          new THREE.CylinderGeometry(0.006, 0.006, 0.012, 8),
          alloy,
          12
        );
        const nutDummy = new THREE.Object3D();
        let nutIndex = 0;
        for (const faceSide of [-1, 1]) {
          for (let bolt = 0; bolt < 6; bolt++) {
            const angle = (bolt / 6) * Math.PI * 2;
            nutDummy.position.set(
              faceSide * 0.091,
              Math.cos(angle) * 0.067,
              Math.sin(angle) * 0.067
            );
            nutDummy.quaternion.setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              new THREE.Vector3(faceSide, 0, 0)
            );
            nutDummy.scale.set(1, 1, 1);
            nutDummy.updateMatrix();
            nutInstances.setMatrixAt(nutIndex++, nutDummy.matrix);
          }
        }
        nutInstances.instanceMatrix.needsUpdate = true;
        pivot.add(nutInstances);
      }
    }

    wheelPivots.push(pivot);
  }

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
    tag.position.set(0, 1.02, 0);
    tag.scale.set(1.34, 0.34, 1);
    root.add(tag);
  }

  scene.add(root);
  return {
    root,
    wheelPivots,
    shellGroup,
    chassisGroup,
    setShellVisible(visible) { shellGroup.visible = visible; }
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
  setGarageShellVisible(true);
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
  setGarageShellVisible(true);
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
  $("shellToggleButton").textContent = visible ? "REMOVE BODY SHELL" : "REINSTALL BODY SHELL";
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
      pivot.position.set(x, -0.095, z);
      const steerQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i < 2 ? remote.steering : 0);
      const spinQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), remote.wheelRotations[i]);
      pivot.quaternion.copy(steerQ).multiply(spinQ);
    }
  }
  updatePlayerCount();
}

// Dedicated transparent surface handles orbit input above the canvas.
// UI panels remain at higher z-indexes, so their buttons and fields stay usable.
let cameraOrbitYaw = 0;
let cameraOrbitPitch = 0;
let cameraDragging = false;
let cameraPointerId = null;
let cameraLastX = 0;
let cameraLastY = 0;

inputSurface.tabIndex = 0;
inputSurface.style.touchAction = "none";
inputSurface.style.cursor = "grab";

inputSurface.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  cameraDragging = true;
  cameraPointerId = event.pointerId;
  cameraLastX = event.clientX;
  cameraLastY = event.clientY;
  inputSurface.style.cursor = "grabbing";
  if (joined) inputSurface.focus({ preventScroll: true });
  try {
    inputSurface.setPointerCapture(event.pointerId);
  } catch (error) {
    // The surface still receives pointer events while the pointer stays over it.
  }
});

inputSurface.addEventListener("pointermove", (event) => {
  if (!cameraDragging || event.pointerId !== cameraPointerId) return;
  const dx = event.clientX - cameraLastX;
  const dy = event.clientY - cameraLastY;
  cameraLastX = event.clientX;
  cameraLastY = event.clientY;
  cameraOrbitYaw += dx * 0.006;
  cameraOrbitPitch = THREE.MathUtils.clamp(
    cameraOrbitPitch - dy * 0.0045,
    -0.28,
    0.82
  );
});

function stopCameraDrag(event) {
  if (!cameraDragging || (event && event.pointerId !== cameraPointerId)) return;
  cameraDragging = false;
  cameraPointerId = null;
  inputSurface.style.cursor = "grab";
}
inputSurface.addEventListener("pointerup", stopCameraDrag);
inputSurface.addEventListener("pointercancel", stopCameraDrag);
inputSurface.addEventListener("lostpointercapture", stopCameraDrag);
window.addEventListener("blur", () => stopCameraDrag());

// Keyboard controls use physical key codes so WASD and arrows work
// consistently regardless of keyboard layout or page focus.
const keys = Object.create(null);
const codeToControl = {
  KeyW: "w",
  KeyA: "a",
  KeyS: "s",
  KeyD: "d",
  Space: " ",
  KeyR: "r",
  ArrowUp: "arrowup",
  ArrowDown: "arrowdown",
  ArrowLeft: "arrowleft",
  ArrowRight: "arrowright"
};
const controlKeys = new Set(Object.values(codeToControl));

function clearDrivingKeys() {
  for (const key of Object.keys(keys)) keys[key] = false;
}
document.addEventListener("keydown", (event) => {
  const key = codeToControl[event.code] || event.key.toLowerCase();
  const typingInForm = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
  if (!controlKeys.has(key)) return;
  if (!joined && typingInForm) return;

  event.preventDefault();
  keys[key] = true;
  if (key === "r" && !event.repeat && joined) resetCar();
}, true);

document.addEventListener("keyup", (event) => {
  const key = codeToControl[event.code] || event.key.toLowerCase();
  if (controlKeys.has(key)) keys[key] = false;
}, true);

window.addEventListener("blur", clearDrivingKeys);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearDrivingKeys();
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
  const steerTarget =
    (keys.a || keys.arrowleft ? 1 : 0) -
    (keys.d || keys.arrowright ? 1 : 0);

  // Use time-based input smoothing so handling stays consistent at different
  // frame rates and direction changes do not snap the truck.
  const steerResponse = 1 - Math.exp(-11 * delta);
  const throttleResponse = 1 - Math.exp(-6.5 * delta);
  steerState += (steerTarget - steerState) * steerResponse;
  throttleState += (throttle - throttleState) * throttleResponse;

  const speed = chassisBody.velocity.length();
  const speedSteerScale = THREE.MathUtils.clamp(1 - speed / 29, 0.48, 1);
  const steeringAngle = steerState * 0.43 * speedSteerScale;

  vehicle.setSteeringValue(steeringAngle, 0);
  vehicle.setSteeringValue(steeringAngle, 1);

  // Progressive 4WD power with a smoother top-speed fade.
  const speedLimitScale = THREE.MathUtils.clamp(1 - speed / 29, 0.22, 1);
  const engineForce = throttleState * 34 * speedLimitScale;
  for (let i = 0; i < 4; i++) {
    vehicle.applyEngineForce(engineForce, i);
    vehicle.setBrake(0, i);
  }

  // Space acts like a controlled drag brake rather than abruptly locking the
  // wheels, which helps avoid pitching the truck over its front bumper.
  if (keys[" "] && delta > 0) {
    const brakeFactor = Math.exp(-3.1 * delta);
    chassisBody.velocity.x *= brakeFactor;
    chassisBody.velocity.z *= brakeFactor;
  }

  const groundedWheels = vehicle.wheelInfos.filter((wheel) => wheel.isInContact).length;
  const airborne = groundedWheels <= 1;

  if (airborne) {
    // Mid-air RC control:
    // W / Up raises the nose, S / Down lowers it, and A / D rotate the truck
    // around its vertical axis. A small coupled roll makes steering feel less
    // like an arcade spin while still letting players correct a jump.
    const pitchInput = throttleState;
    const yawInput = steerState;
    const airTorque = new CANNON.Vec3(
      pitchInput * 1.45,
      yawInput * 0.95,
      yawInput * 0.22
    );
    chassisBody.applyLocalTorque(airTorque);
  } else if (groundedWheels >= 3) {
    // Tire contact and suspension settle small chassis oscillations on the
    // ground without suppressing airborne rotation.
    chassisBody.angularVelocity.x *= 0.94;
    chassisBody.angularVelocity.z *= 0.94;
  } else {
    // One- and two-wheel landings keep a little freedom for suspension roll.
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
    // The room form is hidden below; move focus to the game canvas so
    // keyboard driving works immediately without an extra click.
    if (document.activeElement && typeof document.activeElement.blur === "function") {
      document.activeElement.blur();
    }
    inputSurface.focus({ preventScroll: true });
    clearDrivingKeys();
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
  clearDrivingKeys();
  stopCameraDrag();
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
function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  updateDrivingControls(delta);
  world.step(FIXED_STEP, delta, 3);
  updateLocalVisual();
  updateRemoteVisuals(delta);

  const speedMph = chassisBody.velocity.length() * 2.236936;
  $("speedValue").textContent = String(Math.round(speedMph));
  const touching = vehicle.wheelInfos.filter((wheel) => wheel.isInContact).length;
  $("wheelStatus").textContent = touching + " / 4 TIRES IN CONTACT";

  // The showroom camera presents the parked truck in menu and garage views.
  if (viewMode === "menu" || viewMode === "garage") {
    const distance = viewMode === "garage" ? 4.4 : 5.1;
    const height = viewMode === "garage" ? 1.75 : 2.15;
    const orbitDirection = new THREE.Vector3(0, 0, 1)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraOrbitYaw + (viewMode === "menu" ? -0.18 : 0));
    const showroomHorizontalDistance = distance * Math.cos(cameraOrbitPitch);
    const showroomCameraHeight = height + distance * Math.sin(cameraOrbitPitch);
    const showroomCamera = localCar.root.position.clone()
      .addScaledVector(orbitDirection, showroomHorizontalDistance)
      .add(new THREE.Vector3(0, showroomCameraHeight, 0));
    camera.position.lerp(showroomCamera, 1 - Math.exp(-2.4 * delta));
    camera.lookAt(localCar.root.position.clone().add(new THREE.Vector3(0, 0.12, 0)));
  } else {
  // Follow horizontal heading only; ignore chassis pitch and roll.
  const carForward = new THREE.Vector3(0, 0, -1).applyQuaternion(localCar.root.quaternion);
  carForward.y = 0;
  if (carForward.lengthSq() < 0.0001) carForward.set(0, 0, -1);
  carForward.normalize();
  const cameraDirection = carForward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraOrbitYaw);
  const cameraHorizontalDistance = 5.8 * Math.cos(cameraOrbitPitch);
  const cameraHeight = 2.8 + 5.8 * Math.sin(cameraOrbitPitch);
  const desiredCamera = localCar.root.position.clone()
    .addScaledVector(cameraDirection, -cameraHorizontalDistance)
    .add(new THREE.Vector3(0, cameraHeight, 0));
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
