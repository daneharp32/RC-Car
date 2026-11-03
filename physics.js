import { selfId } from "https://esm.sh/trystero@0.26.0";

// Builds the Cannon-es world, terrain colliders, chassis, and four-wheel
// raycast vehicle. The returned objects are shared by the driving systems.
export function createPhysicsSystem({ CANNON, trackLayout, shellFit = false }) {
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

// Ramp collision extends slightly past the visible edges. This gives tires
// room to overhang the rendered ramp without the chassis catching a hard side.
const RAMP_EDGE_CLEARANCE = 0.6;
for (const jump of trackLayout.jumps) {
  const halfWidth = jump.width / 2 + RAMP_EDGE_CLEARANCE;
  const halfLength = jump.length / 2;
  const height = jump.height;
  const vertices = [
    new CANNON.Vec3(-halfWidth, 0, halfLength),
    new CANNON.Vec3(halfWidth, 0, halfLength),
    new CANNON.Vec3(-halfWidth, 0, -halfLength),
    new CANNON.Vec3(halfWidth, 0, -halfLength),
    new CANNON.Vec3(-halfWidth, height, -halfLength),
    new CANNON.Vec3(halfWidth, height, -halfLength)
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
  // Higher mass and a slightly broader collision tub give the truck a more
  // substantial feel without changing the visual shell or wheelbase.
  mass: 10.5,
  material: chassisMaterial,
  position: new CANNON.Vec3(spawnX, 0.24, spawnZ),
  linearDamping: 0.12,
  angularDamping: 0.90
});
chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), spawnYaw);
chassisBody.addShape(new CANNON.Box(new CANNON.Vec3(0.30, 0.08, shellFit ? 0.53 : 0.43)));

// The shell is a visual mesh, so give it a lightweight compound collision
// profile made from thin panels instead of a costly triangle-by-triangle mesh.
function addBodyShellColliders(body, geometry) {
  const bounds = geometry?.boundingBox;
  const min = bounds
    ? bounds.min
    : { x: -0.37, y: -0.075, z: -0.503 };
  const max = bounds
    ? bounds.max
    : { x: 0.37, y: 0.164, z: 0.503 };

  const centerX = (min.x + max.x) * 0.5;
  const centerY = (min.y + max.y) * 0.5;
  const centerZ = (min.z + max.z) * 0.5;
  const halfWidth = Math.max(0.12, (max.x - min.x) * 0.5);
  const shellHeight = Math.max(0.08, max.y - min.y);
  const halfLength = Math.max(0.25, (max.z - min.z) * 0.5);

  function addPanel(halfExtents, x, y, z) {
    const shape = new CANNON.Box(new CANNON.Vec3(
      halfExtents.x,
      halfExtents.y,
      halfExtents.z
    ));
    body.addShape(shape, new CANNON.Vec3(x, y, z));
  }

  // Long, thin side panels represent the visible shell walls and fenders.
  const sideHalfWidth = Math.max(0.02, halfWidth * 0.09);
  const sideHalfHeight = shellHeight * 0.46;
  const sideHalfLength = halfLength * 0.84;
  for (const side of [-1, 1]) {
    addPanel(
      { x: sideHalfWidth, y: sideHalfHeight, z: sideHalfLength },
      centerX + side * (halfWidth - sideHalfWidth),
      min.y + sideHalfHeight,
      centerZ
    );
  }

  // A thin upper skin lets the roof, hood, and bed contact the ground when
  // the truck rolls over, while keeping the underside open around the tyres.
  const topHalfThickness = Math.max(0.012, shellHeight * 0.055);
  addPanel(
    {
      x: halfWidth * 0.86,
      y: topHalfThickness,
      z: halfLength * 0.91
    },
    centerX,
    max.y - topHalfThickness,
    centerZ
  );

  // Nose and tail panels protect the shell ends during steep landings.
  const endHalfDepth = Math.max(0.025, halfLength * 0.055);
  const endHalfHeight = Math.max(0.025, shellHeight * 0.24);
  for (const end of [-1, 1]) {
    addPanel(
      {
        x: halfWidth * 0.82,
        y: endHalfHeight,
        z: endHalfDepth
      },
      centerX,
      min.y + endHalfHeight,
      centerZ + end * (halfLength - endHalfDepth)
    );
  }

  body.updateMassProperties();
  body.updateBoundingRadius();
}
addBodyShellColliders(chassisBody, shellGeometry);
chassisBody.allowSleep = false;

const vehicle = new CANNON.RaycastVehicle({
  chassisBody,
  indexForwardAxis: 2,
  indexRightAxis: 0,
  indexUpAxis: 1
});

// The Ranger's measured wheel-arch spacing is used only when its mesh loads.
const SHELL_FIT_WHEELBASE = 0.9512820513;
const ACTIVE_WHEELBASE = shellFit ? SHELL_FIT_WHEELBASE : 0.58;
const AXLE_HALF_SPACING = ACTIVE_WHEELBASE / 2;
const wheelPositions = [
  [-0.305, -0.018, -AXLE_HALF_SPACING],
  [ 0.305, -0.018, -AXLE_HALF_SPACING],
  [-0.305, -0.018,  AXLE_HALF_SPACING],
  [ 0.305, -0.018,  AXLE_HALF_SPACING]
];

// The original body keeps its visual-only scale when the Ranger is unavailable.
const VISUAL_CHASSIS_LENGTH_SCALE = shellFit ? 1.0 : 1.26;

for (let i = 0; i < 4; i++) {
  const [x, y, z] = wheelPositions[i];
  vehicle.addWheel({
    chassisConnectionPointLocal: new CANNON.Vec3(x, y, z),
    directionLocal: new CANNON.Vec3(0, -1, 0),
    axleLocal: new CANNON.Vec3(-1, 0, 0),
    suspensionRestLength: 0.12,
    suspensionStiffness: 52,
    dampingCompression: 5.6,
    dampingRelaxation: 4.8,
    maxSuspensionTravel: 0.17,
    maxSuspensionForce: 350,
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
