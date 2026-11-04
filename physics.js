import { selfId } from "https://esm.sh/trystero@0.26.0";

const DEFAULT_COLLISION_GROUP = 1;
const JUMP_COLLISION_GROUP = 2;

// Baseline tire grip is tuned for loose dirt rather than high-grip asphalt.
// The driving controller progressively lowers it further when a tire slides.
export const FRONT_TIRE_BASE_GRIP = 1.05;
export const REAR_TIRE_BASE_GRIP = 0.93;

// Builds the Cannon-es world, terrain colliders, chassis, and four-wheel
// raycast vehicle. The returned objects are shared by the driving systems.
export function createPhysicsSystem({ CANNON, trackLayout, shellFit = false, shellGeometry = null }) {
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

// Cannon heightfields use a local XY grid with height along local Z.
// Rotate that grid upright, then align it to the same track frame as the mesh.
// No side overhang is added: the collision surface ends exactly at the smooth
// zero-height edge of the visible bump, avoiding hidden ledges beside jumps.
const heightfieldTilt = new CANNON.Quaternion();
heightfieldTilt.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);

for (const jump of trackLayout.jumps) {
  const { profile } = jump;
  const rampBody = new CANNON.Body({
    mass: 0,
    material: groundBody.material,
    collisionFilterGroup: JUMP_COLLISION_GROUP,
    collisionFilterMask: -1
  });
  rampBody.addShape(new CANNON.Heightfield(profile.heights, {
    elementSize: profile.elementSize
  }));

  // The heightfield's local X/Y origin is the rear-left corner of the bump.
  // Its local X follows the track normal and local Y follows the driving line.
  rampBody.position.set(
    jump.x - jump.normalX * profile.width / 2 - jump.tangentX * profile.length / 2,
    0.01,
    jump.z - jump.normalZ * profile.width / 2 - jump.tangentZ * profile.length / 2
  );

  const rampYaw = new CANNON.Quaternion();
  rampYaw.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), jump.yaw);
  rampYaw.mult(heightfieldTilt, rampBody.quaternion);
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
  // Avoid overdamping yaw: the tires should be able to rotate the truck
  // into a controllable slide, while tire forces and body-load damping settle it.
  angularDamping: 0.48,
  collisionFilterGroup: DEFAULT_COLLISION_GROUP,
  // Chassis and shell must not snag on jump faces. Wheel rays still query the
  // jump group, so suspension contact can launch the truck naturally.
  collisionFilterMask: ~JUMP_COLLISION_GROUP
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

  // Keep shell collision on its upper side walls. The lower sill remains
  // above the running surface so it does not scrape over raised jump faces.
  const collisionLowerY = Math.max(min.y + shellHeight * 0.52, 0.035);
  const collisionHeight = Math.max(0.025, max.y - collisionLowerY);
  const sideHalfWidth = Math.max(0.02, halfWidth * 0.09);
  const sideHalfHeight = collisionHeight * 0.5;
  const sideCenterY = collisionLowerY + sideHalfHeight;
  const sideHalfLength = halfLength * 0.84;
  for (const side of [-1, 1]) {
    addPanel(
      { x: sideHalfWidth, y: sideHalfHeight, z: sideHalfLength },
      centerX + side * (halfWidth - sideHalfWidth),
      sideCenterY,
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

  // Upper nose and tail sections still collide during a rollover, but the
  // lower edges are lifted clear of the jump surface to prevent drag.
  const endHalfDepth = Math.max(0.025, halfLength * 0.055);
  const endHalfHeight = collisionHeight * 0.5;
  for (const end of [-1, 1]) {
    addPanel(
      {
        x: halfWidth * 0.82,
        y: endHalfHeight,
        z: endHalfDepth
      },
      centerX,
      sideCenterY,
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
    // A touch more compression damping and a calmer rebound make weight
    // transfer visible without letting the truck pogo after a jump landing.
    dampingCompression: 6.1,
    dampingRelaxation: 4.5,
    maxSuspensionTravel: 0.17,
    maxSuspensionForce: 350,
    radius: 0.13,
    // Start with moderate grip. controls.js adjusts this per wheel as slip
    // builds, allowing the rear to rotate instead of snapping all velocity
    // into the direction the front wheels happen to be pointing.
    frictionSlip: i < 2 ? FRONT_TIRE_BASE_GRIP : REAR_TIRE_BASE_GRIP,
    // Let tire forces transfer enough load to the chassis for visible body lean.
    rollInfluence: 0.17,
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
