import { selfId } from "https://esm.sh/trystero@0.26.0";

// Builds the Cannon-es world, terrain colliders, chassis, and four-wheel
// raycast vehicle. The returned objects are shared by the driving systems.
export function createPhysicsSystem({ CANNON, trackLayout }) {
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
for (const jump of trackLayout.jumps) {
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
const spawnSlot = Math.abs(spawnHash) % 8;
const acrossOffset = ((spawnSlot % 4) - 1.5) * 1.15;
const backOffset = -Math.floor(spawnSlot / 4) * 1.8;
const spawn = trackLayout.spawn;
const spawnX = spawn.x + spawn.normalX * acrossOffset + spawn.tangentX * backOffset;
const spawnZ = spawn.z + spawn.normalZ * acrossOffset + spawn.tangentZ * backOffset;
const spawnYaw = spawn.yaw;

const chassisBody = new CANNON.Body({
  mass: 8.0,
  material: chassisMaterial,
  position: new CANNON.Vec3(spawnX, 0.24, spawnZ),
  linearDamping: 0.10,
  angularDamping: 0.72
});
chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), spawnYaw);
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

// Matching static boxes make the alternating red/white perimeter curbs solid.
for (const barrier of trackLayout.barriers) {
  const barrierBody = new CANNON.Body({
    mass: 0,
    material: groundBody.material
  });
  barrierBody.addShape(new CANNON.Box(new CANNON.Vec3(
    barrier.width / 2,
    barrier.height / 2,
    barrier.length / 2
  )));
  barrierBody.position.set(barrier.x, barrier.y, barrier.z);
  barrierBody.quaternion.setFromAxisAngle(
    new CANNON.Vec3(0, 1, 0),
    barrier.yaw
  );
  world.addBody(barrierBody);
}

  return {
    world,
    groundBody,
    chassisMaterial,
    chassisBody,
    vehicle,
    wheelPositions,
    VISUAL_CHASSIS_LENGTH_SCALE,
    spawnX,
    spawnZ,
    spawnYaw
  };
}
