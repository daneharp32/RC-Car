import { selfId } from "https://esm.sh/trystero@0.26.0";

const DEFAULT_COLLISION_GROUP = 1;
const JUMP_COLLISION_GROUP = 2;

// Tire grip tuned for a planted short-course truck on packed dirt.
// A small rear bias allows the back to rotate under hard cornering, but
// substantial grip remains available to recover from a slide.
export const FRONT_TIRE_BASE_GRIP = 2.68;
export const REAR_TIRE_BASE_GRIP = 2.40;

// Builds the Cannon-es world, terrain colliders, chassis, and four-wheel
// raycast vehicle. The returned objects are shared by the driving systems.
export function createPhysicsSystem({ CANNON, trackLayout, additionalLayouts = {}, shellFit = false, shellGeometry = null }) {
const world = new CANNON.World({
  gravity: new CANNON.Vec3(0, -9.82, 0)
});
world.broadphase = new CANNON.SAPBroadphase(world);
world.solver.iterations = 20;
world.allowSleep = false;
world.defaultContactMaterial.friction = 0.35;
world.defaultContactMaterial.restitution = 0.02;

const groundBody = new CANNON.Body({ mass: 0, material: new CANNON.Material("dirt") });
groundBody.addShape(new CANNON.Plane());
groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
world.addBody(groundBody);
const closedCourseBodies = [groundBody];
const alternateMapLayouts = new Map(Object.entries(additionalLayouts || {}));
const alternateMapBodies = new Map();

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
  closedCourseBodies.push(rampBody);
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
function makeSpawnState(layout) {
  const spawn = layout.spawn;
  return {
    x: spawn.x + spawn.normalX * acrossOffset + spawn.tangentX * backOffset,
    y: (Number.isFinite(spawn.y) ? spawn.y : 0) + 0.24,
    z: spawn.z + spawn.normalZ * acrossOffset + spawn.tangentZ * backOffset,
    yaw: spawn.yaw
  };
}
let activeLayout = trackLayout;
let spawnState = makeSpawnState(trackLayout);
function setActiveMap(mapId) {
  const layout = mapId === (trackLayout.id || "closed-course")
    ? trackLayout
    : alternateMapLayouts.get(mapId);
  if (!layout) return false;

  const useClosedCourse = layout === trackLayout;
  for (const body of closedCourseBodies) body.collisionFilterMask = useClosedCourse ? -1 : 0;
  for (const [id, bodies] of alternateMapBodies) {
    const enabled = id === mapId;
    for (const body of bodies) body.collisionFilterMask = enabled ? -1 : 0;
  }

  activeLayout = layout;
  spawnState = makeSpawnState(layout);
  world.broadphase.dirty = true;
  return true;
}
function getSpawn() {
  return { ...spawnState };
}
const spawnX = spawnState.x;
const spawnZ = spawnState.z;
const spawnYaw = spawnState.yaw;

const chassisBody = new CANNON.Body({
  // Higher mass and a slightly broader collision tub give the truck a more
  // substantial feel without changing the visual shell or wheelbase.
  mass: 10.5,
  material: chassisMaterial,
  position: new CANNON.Vec3(spawnState.x, spawnState.y, spawnState.z),
  linearDamping: 0.12,
  // Moderate yaw damping prevents a slide from turning into an uncontrolled spin.
  // Tire contact forces still provide most of the grip and recovery.
  angularDamping: 0.72,
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
// The live-axle sensors must be repositioned before RaycastVehicle casts its
// rays. The physical axle force solver runs immediately after that ray update.
world.addEventListener("preStep", syncRearAxleSensors);
vehicle.addToWorld(world);
world.addEventListener("preStep", solveLiveRearAxle);

// Sandbox-only size tuning. Keep base geometry and wheel data so changes are
// reversible and never accumulate rounding error across slider adjustments.
const baseChassisMass = chassisBody.mass;
const baseChassisAngularDamping = chassisBody.angularDamping;
const baseChassisShapes = chassisBody.shapes.map((shape, index) => ({
  shape,
  halfExtents: shape.halfExtents?.clone?.() || null,
  offset: chassisBody.shapeOffsets[index].clone()
}));
const baseWheelSettings = vehicle.wheelInfos.map((wheel) => ({
  connection: wheel.chassisConnectionPointLocal.clone(),
  radius: wheel.radius,
  suspensionRestLength: wheel.suspensionRestLength,
  maxSuspensionTravel: wheel.maxSuspensionTravel,
  maxSuspensionForce: wheel.maxSuspensionForce,
  suspensionStiffness: wheel.suspensionStiffness,
  dampingCompression: wheel.dampingCompression,
  dampingRelaxation: wheel.dampingRelaxation,
  frictionSlip: wheel.frictionSlip
}));
let vehicleScale = 1;
let chassisStyle = "standard";
let liveAxleActive = false;
let rearAxleBody = null;
let liveAxleLinkBodies = [];
let liveAxleConstraints = [];
let rearDriveRequests = [0, 0];
let rearBrakeRequests = [0, 0];
const rearWheelRotations = [0, 0];
const worldDown = new CANNON.Vec3(0, -1, 0);
const localForward = new CANNON.Vec3(0, 0, -1);
const localLateral = new CANNON.Vec3(1, 0, 0);

function pointToWorld(body, localPoint) {
  return body.pointToWorldFrame(localPoint, new CANNON.Vec3());
}
function pointToLocal(body, worldPoint) {
  return body.pointToLocalFrame(worldPoint, new CANNON.Vec3());
}
function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function difference(a, b) {
  return new CANNON.Vec3(a.x - b.x, a.y - b.y, a.z - b.z);
}
function scaled(vector, amount) {
  return new CANNON.Vec3(vector.x * amount, vector.y * amount, vector.z * amount);
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function removeLiveAxleDynamics() {
  for (const constraint of liveAxleConstraints) world.removeConstraint(constraint);
  liveAxleConstraints = [];
  liveAxleLinkComponents = [];
  for (const body of liveAxleLinkBodies) world.removeBody(body);
  liveAxleLinkBodies = [];
  if (rearAxleBody && world.bodies.includes(rearAxleBody)) world.removeBody(rearAxleBody);
  rearAxleBody = null;
  chassisBody.mass = baseChassisMass * Math.pow(vehicleScale, 3);
  chassisBody.updateMassProperties();
  chassisBody.updateInertiaWorld(true);
  chassisBody.updateBoundingRadius();
  liveAxleActive = false;
  rearDriveRequests = [0, 0];
  rearBrakeRequests = [0, 0];
  world.broadphase.dirty = true;
}

function makeAxleLink(chassisAnchor, axleAnchor, linkWidth, maxForce, side, kind) {
  const chassisWorld = pointToWorld(chassisBody, chassisAnchor);
  const axleWorld = pointToWorld(rearAxleBody, axleAnchor);
  const rawDirection = difference(axleWorld, chassisWorld);
  const length = Math.max(0.05, Math.hypot(rawDirection.x, rawDirection.y, rawDirection.z));
  const direction = scaled(rawDirection, 1 / length);
  const link = new CANNON.Body({
    mass: 0.12 * Math.pow(vehicleScale, 3),
    material: chassisMaterial,
    linearDamping: 0.025,
    angularDamping: 0.08,
    collisionFilterGroup: 0,
    collisionFilterMask: 0,
    allowSleep: false
  });
  link.addShape(new CANNON.Box(new CANNON.Vec3(
    linkWidth,
    length * 0.5,
    linkWidth
  )));
  link.position.set(
    (chassisWorld.x + axleWorld.x) * 0.5,
    (chassisWorld.y + axleWorld.y) * 0.5,
    (chassisWorld.z + axleWorld.z) * 0.5
  );
  link.quaternion.setFromVectors(new CANNON.Vec3(0, 1, 0), direction);
  world.addBody(link);
  const chassisJoint = new CANNON.PointToPointConstraint(
    chassisBody,
    chassisAnchor,
    link,
    new CANNON.Vec3(0, -length * 0.5, 0),
    maxForce
  );
  const axleJoint = new CANNON.PointToPointConstraint(
    link,
    new CANNON.Vec3(0, length * 0.5, 0),
    rearAxleBody,
    axleAnchor,
    maxForce
  );
  world.addConstraint(chassisJoint);
  world.addConstraint(axleJoint);
  liveAxleLinkBodies.push(link);
  liveAxleConstraints.push(chassisJoint, axleJoint);
  return { side, kind, constraints: [chassisJoint, axleJoint], maxForce };
}

let liveAxleSprings = [];
let liveAxleStraps = [];
let liveAxleLinkComponents = [];
let rearAxleCondition = [
  { trailingArm: 1, upperLink: 1, shock: 1, strap: 1 },
  { trailingArm: 1, upperLink: 1, shock: 1, strap: 1 }
];
function createForwardElectronicsMass(scale) {
  const mass = 0.85 * Math.pow(scale, 3);
  const electronicsBody = new CANNON.Body({
    mass,
    material: chassisMaterial,
    linearDamping: 0.03,
    angularDamping: 0.12,
    collisionFilterGroup: 0,
    collisionFilterMask: 0,
    allowSleep: false
  });
  electronicsBody.addShape(new CANNON.Box(new CANNON.Vec3(
    0.135 * scale, 0.040 * scale, 0.18 * scale
  )));
  electronicsBody.addShape(new CANNON.Box(new CANNON.Vec3(
    0.085 * scale, 0.035 * scale, 0.07 * scale
  )), new CANNON.Vec3(0.065 * scale, 0.005 * scale, 0.13 * scale));
  electronicsBody.position.copy(pointToWorld(
    chassisBody,
    new CANNON.Vec3(0, 0.025 * scale, -0.31 * scale)
  ));
  electronicsBody.quaternion.copy(chassisBody.quaternion);
  electronicsBody.updateMassProperties();
  world.addBody(electronicsBody);
  liveAxleLinkBodies.push(electronicsBody);

  // Two longitudinal pivots and one lateral pivot keep this ballast rigidly
  // attached while preserving the chassis-mounted forward mass location.
  const mounts = [
    {
      chassis: new CANNON.Vec3(0, 0.025 * scale, -0.46 * scale),
      electronics: new CANNON.Vec3(0, 0, -0.15 * scale)
    },
    {
      chassis: new CANNON.Vec3(0, 0.025 * scale, -0.16 * scale),
      electronics: new CANNON.Vec3(0, 0, 0.15 * scale)
    },
    {
      chassis: new CANNON.Vec3(0.12 * scale, 0.025 * scale, -0.31 * scale),
      electronics: new CANNON.Vec3(0.12 * scale, 0, 0)
    }
  ];
  for (const mount of mounts) {
    const constraint = new CANNON.PointToPointConstraint(
      chassisBody,
      mount.chassis,
      electronicsBody,
      mount.electronics,
      9000 * Math.pow(scale, 3)
    );
    world.addConstraint(constraint);
    liveAxleConstraints.push(constraint);
  }
}

function createLiveAxleDynamics() {
  const scale = vehicleScale;
  const rearZ = ACTIVE_WHEELBASE * 0.5 * scale;
  const axlePosition = pointToWorld(chassisBody, new CANNON.Vec3(0, -0.085 * scale, rearZ));
  rearAxleBody = new CANNON.Body({
    mass: 2.05 * Math.pow(scale, 3),
    material: chassisMaterial,
    linearDamping: 0.10,
    angularDamping: 0.92,
    collisionFilterGroup: 0,
    collisionFilterMask: 0,
    allowSleep: false
  });
  rearAxleBody.addShape(new CANNON.Box(new CANNON.Vec3(0.405 * scale, 0.043 * scale, 0.046 * scale)));
  rearAxleBody.addShape(new CANNON.Box(new CANNON.Vec3(0.125 * scale, 0.082 * scale, 0.12 * scale)),
    new CANNON.Vec3(0, -0.015 * scale, 0));
  rearAxleBody.position.copy(axlePosition);
  rearAxleBody.quaternion.copy(chassisBody.quaternion);
  rearAxleBody.velocity.copy(chassisBody.velocity);
  rearAxleBody.angularVelocity.copy(chassisBody.angularVelocity);
  rearAxleBody.updateMassProperties();
  world.addBody(rearAxleBody);

  // Two long lower trailing arms and two triangulated upper links locate the
  // axle in pitch, roll, and lateral movement while allowing vertical travel.
  liveAxleLinkComponents = [];
  rearAxleCondition = [
    { trailingArm: 1, upperLink: 1, shock: 1, strap: 1 },
    { trailingArm: 1, upperLink: 1, shock: 1, strap: 1 }
  ];
  for (const side of [-1, 1]) {
    liveAxleLinkComponents.push(makeAxleLink(
      new CANNON.Vec3(side * 0.22 * scale, -0.045 * scale, rearZ - 0.40 * scale),
      new CANNON.Vec3(side * 0.24 * scale, 0, 0),
      0.019 * scale,
      2600 * Math.pow(scale, 3),
      side,
      "trailingArm"
    ));
    liveAxleLinkComponents.push(makeAxleLink(
      new CANNON.Vec3(side * 0.18 * scale, 0.12 * scale, rearZ - 0.24 * scale),
      new CANNON.Vec3(-side * 0.13 * scale, 0.055 * scale, 0),
      0.015 * scale,
      2600 * Math.pow(scale, 3),
      side,
      "upperLink"
    ));
  }

  liveAxleSprings = [];
  liveAxleStraps = [];
  for (const side of [-1, 1]) {
    const chassisAnchor = new CANNON.Vec3(side * 0.205 * scale, 0.16 * scale, rearZ - 0.075 * scale);
    const axleAnchor = new CANNON.Vec3(side * 0.215 * scale, 0.065 * scale, 0);
    const top = pointToWorld(chassisBody, chassisAnchor);
    const bottom = pointToWorld(rearAxleBody, axleAnchor);
    const restLength = Math.hypot(bottom.x - top.x, bottom.y - top.y, bottom.z - top.z);
    liveAxleSprings.push({ chassisAnchor, axleAnchor, restLength });

    const strapChassisAnchor = new CANNON.Vec3(side * 0.235 * scale, 0.205 * scale, rearZ - 0.085 * scale);
    const strapAxleAnchor = new CANNON.Vec3(side * 0.235 * scale, 0.12 * scale, 0);
    const strapTop = pointToWorld(chassisBody, strapChassisAnchor);
    const strapBottom = pointToWorld(rearAxleBody, strapAxleAnchor);
    const strapRest = Math.hypot(
      strapTop.x - strapBottom.x,
      strapTop.y - strapBottom.y,
      strapTop.z - strapBottom.z
    );
    liveAxleStraps.push({
      chassisAnchor: strapChassisAnchor,
      axleAnchor: strapAxleAnchor,
      maxLength: strapRest + 0.13 * scale
    });
  }

  // The rear RaycastVehicle wheels become ground-contact sensors only. They
  // neither spring independently nor apply their own tire friction impulses.
  for (const index of [2, 3]) {
    const wheel = vehicle.wheelInfos[index];
    wheel.radius = 0.158 * scale;
    wheel.suspensionRestLength = 0;
    wheel.suspensionLength = 0;
    wheel.maxSuspensionTravel = 0.28 * scale;
    wheel.suspensionStiffness = 0;
    wheel.maxSuspensionForce = 0;
    wheel.dampingCompression = 0;
    wheel.dampingRelaxation = 0;
    wheel.frictionSlip = 0;
    wheel.engineForce = 0;
    wheel.brake = 0;
  }
  createForwardElectronicsMass(scale);

  // Keep the base vehicle mass near the existing layout: the live axle, four
  // links, and forward electronics are separate physical bodies rather than
  // being counted again inside the main chassis tub.
  const redistributedChassisMass = (
    baseChassisMass - 2.05 - 0.48 - 0.85
  ) * Math.pow(scale, 3);
  chassisBody.mass = Math.max(0.2 * Math.pow(scale, 3), redistributedChassisMass);
  chassisBody.updateMassProperties();
  chassisBody.updateInertiaWorld(true);
  chassisBody.updateBoundingRadius();

  liveAxleActive = true;
  world.broadphase.dirty = true;
}

function rebuildLiveAxleDynamics() {
  if (!chassisStyle || chassisStyle !== "live-axle") return;
  removeLiveAxleDynamics();
  createLiveAxleDynamics();
}

function syncRearAxleSensors() {
  if (!liveAxleActive || !rearAxleBody) return;
  const scale = vehicleScale;
  const downLocal = chassisBody.vectorToLocalFrame(worldDown, new CANNON.Vec3());
  for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
    const side = sideIndex === 0 ? -1 : 1;
    const hubOffset = new CANNON.Vec3(side * 0.305 * scale, -0.005 * scale, 0);
    const hubWorld = pointToWorld(rearAxleBody, hubOffset);
    const wheel = vehicle.wheelInfos[sideIndex + 2];
    wheel.chassisConnectionPointLocal.copy(pointToLocal(chassisBody, hubWorld));
    wheel.directionLocal.copy(downLocal);
  }
}

function solveLiveRearAxle() {
  if (!liveAxleActive || !rearAxleBody) return;
  const scale = vehicleScale;
  const dt = Math.max(1 / 240, world.dt || 1 / 60);

  // A one-piece axle housing should articulate with the suspension, but it
  // must not spin freely when one tire catches a bump. Dampen and bound its
  // angular velocity relative to the chassis while preserving small axle
  // roll and pinion movement.
  const relativeAngularWorld = difference(
    rearAxleBody.angularVelocity,
    chassisBody.angularVelocity
  );
  const relativeAngularLocal = chassisBody.vectorToLocalFrame(
    relativeAngularWorld,
    new CANNON.Vec3()
  );
  relativeAngularLocal.x = clamp(relativeAngularLocal.x, -2.0, 2.0);
  relativeAngularLocal.y = clamp(relativeAngularLocal.y, -2.8, 2.8);
  relativeAngularLocal.z = clamp(relativeAngularLocal.z, -1.7, 1.7);
  const boundedAngularWorld = chassisBody.vectorToWorldFrame(
    relativeAngularLocal,
    new CANNON.Vec3()
  );
  rearAxleBody.angularVelocity.set(
    chassisBody.angularVelocity.x + boundedAngularWorld.x,
    chassisBody.angularVelocity.y + boundedAngularWorld.y,
    chassisBody.angularVelocity.z + boundedAngularWorld.z
  );

  // Coil-over spring/dampers support the sprung mass and resist axle velocity.
  for (let sideIndex = 0; sideIndex < liveAxleSprings.length; sideIndex++) {
    const mount = liveAxleSprings[sideIndex];
    const shockHealth = rearAxleCondition[sideIndex].shock;
    const chassisPoint = pointToWorld(chassisBody, mount.chassisAnchor);
    const axlePoint = pointToWorld(rearAxleBody, mount.axleAnchor);
    const delta = difference(axlePoint, chassisPoint);
    const length = Math.max(1e-4, Math.hypot(delta.x, delta.y, delta.z));
    const axis = scaled(delta, 1 / length);
    const chassisVelocity = chassisBody.getVelocityAtWorldPoint(chassisPoint, new CANNON.Vec3());
    const axleVelocity = rearAxleBody.getVelocityAtWorldPoint(axlePoint, new CANNON.Vec3());
    const relativeSpeed = dot(difference(axleVelocity, chassisVelocity), axis);
    const springRate = 430 * scale * scale * shockHealth;
    const damperRate = 138 * scale * scale * shockHealth;
    const magnitude = clamp(
      (mount.restLength - length) * springRate - relativeSpeed * damperRate,
      -420 * Math.pow(scale, 3),
      420 * Math.pow(scale, 3)
    );
    const force = scaled(axis, magnitude);
    rearAxleBody.applyForce(force, difference(axlePoint, rearAxleBody.position));
    chassisBody.applyForce(scaled(force, -1), difference(chassisPoint, chassisBody.position));
  }

  // Nylon droop straps are one-way tethers: slack is free, but once stretched
  // beyond their set length they pull the axle back toward the chassis.
  for (let sideIndex = 0; sideIndex < liveAxleStraps.length; sideIndex++) {
    const strap = liveAxleStraps[sideIndex];
    const strapHealth = rearAxleCondition[sideIndex].strap;
    if (strapHealth <= 0) continue;
    const chassisPoint = pointToWorld(chassisBody, strap.chassisAnchor);
    const axlePoint = pointToWorld(rearAxleBody, strap.axleAnchor);
    const towardChassis = difference(chassisPoint, axlePoint);
    const length = Math.hypot(towardChassis.x, towardChassis.y, towardChassis.z);
    if (length <= strap.maxLength) continue;
    const axis = scaled(towardChassis, 1 / Math.max(length, 1e-4));
    const chassisVelocity = chassisBody.getVelocityAtWorldPoint(chassisPoint, new CANNON.Vec3());
    const axleVelocity = rearAxleBody.getVelocityAtWorldPoint(axlePoint, new CANNON.Vec3());
    const separationSpeed = dot(difference(chassisVelocity, axleVelocity), axis);
    const tension = Math.min(
      (length - strap.maxLength) * 1150 * scale * scale +
        Math.max(0, separationSpeed) * 42 * scale * scale,
      300 * Math.pow(scale, 3)
    ) * strapHealth;
    const force = scaled(axis, tension);
    rearAxleBody.applyForce(force, difference(axlePoint, rearAxleBody.position));
    chassisBody.applyForce(scaled(force, -1), difference(chassisPoint, chassisBody.position));
  }

  // Each solid-axle tire applies its own contact-patch forces to the axle beam.
  const forward = rearAxleBody.quaternion.vmult(localForward, new CANNON.Vec3());
  const lateral = rearAxleBody.quaternion.vmult(localLateral, new CANNON.Vec3());
  for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
    const wheelIndex = sideIndex + 2;
    const wheel = vehicle.wheelInfos[wheelIndex];
    const result = wheel.raycastResult;
    if (!wheel.isInContact || !result?.hitPointWorld || !result?.hitNormalWorld) {
      wheel.deltaRotation = 0;
      continue;
    }
    const hitPoint = result.hitPointWorld;
    const normal = result.hitNormalWorld;
    const hubOffset = new CANNON.Vec3(
      (sideIndex === 0 ? -1 : 1) * 0.305 * scale,
      -0.005 * scale,
      0
    );
    const hubWorld = pointToWorld(rearAxleBody, hubOffset);
    const distance = Math.hypot(
      hubWorld.x - hitPoint.x,
      hubWorld.y - hitPoint.y,
      hubWorld.z - hitPoint.z
    );
    const tireRadius = 0.158 * scale;
    const penetration = Math.max(0, tireRadius - distance);
    const groundVelocity = result.body?.getVelocityAtWorldPoint
      ? result.body.getVelocityAtWorldPoint(hitPoint, new CANNON.Vec3())
      : new CANNON.Vec3();
    const axleVelocity = rearAxleBody.getVelocityAtWorldPoint(hitPoint, new CANNON.Vec3());
    const relativeVelocity = difference(axleVelocity, groundVelocity);
    const normalSpeed = dot(relativeVelocity, normal);
    // A tire exactly touching the ground has almost no geometric
    // penetration, so penetration-only contact would provide no static load.
    // Carry the axle weight plus a rear share of sprung chassis weight, then
    // add compression and velocity response for bumps and landings.
    const rearContactCount = Math.max(
      1,
      vehicle.wheelInfos.slice(2, 4).filter((rearWheel) => rearWheel.isInContact).length
    );
    const rearStaticLoad = (
      rearAxleBody.mass * 9.82 +
      chassisBody.mass * 9.82 * 0.42
    ) / rearContactCount;
    const normalForce = clamp(
      rearStaticLoad +
        penetration * 2100 * scale * scale -
        normalSpeed * 62 * scale * scale,
      0,
      470 * Math.pow(scale, 3)
    );
    if (normalForce <= 0) {
      wheel.deltaRotation = 0;
      continue;
    }

    const forwardSpeed = dot(relativeVelocity, forward);
    const lateralSpeed = dot(relativeVelocity, lateral);
    const frictionLimit = normalForce * 0.88;
    const brakeForce = rearBrakeRequests[sideIndex] * 48 * Math.pow(scale, 3);
    const requestedLongitudinal = rearDriveRequests[sideIndex] -
      Math.sign(forwardSpeed) * brakeForce;
    const longitudinalForce = clamp(requestedLongitudinal, -frictionLimit, frictionLimit);
    const lateralLimit = Math.sqrt(Math.max(
      0,
      frictionLimit * frictionLimit - longitudinalForce * longitudinalForce
    ));
    const lateralForce = clamp(
      -lateralSpeed * 30 * scale * scale,
      -lateralLimit,
      lateralLimit
    );
    const totalForce = new CANNON.Vec3(
      normal.x * normalForce + forward.x * longitudinalForce + lateral.x * lateralForce,
      normal.y * normalForce + forward.y * longitudinalForce + lateral.y * lateralForce,
      normal.z * normalForce + forward.z * longitudinalForce + lateral.z * lateralForce
    );
    rearAxleBody.applyForce(totalForce, difference(hitPoint, rearAxleBody.position));
    wheel.deltaRotation = forwardSpeed / Math.max(0.001, tireRadius) * dt;
    rearWheelRotations[sideIndex] += wheel.deltaRotation;
    wheel.rotation = rearWheelRotations[sideIndex];
  }
}

function restoreRearWheelSettings() {
  for (const index of [2, 3]) {
    const base = baseWheelSettings[index];
    const wheel = vehicle.wheelInfos[index];
    wheel.chassisConnectionPointLocal.set(
      base.connection.x * vehicleScale,
      base.connection.y * vehicleScale,
      base.connection.z * vehicleScale
    );
    wheel.radius = base.radius * vehicleScale;
    wheel.suspensionRestLength = base.suspensionRestLength * vehicleScale;
    wheel.suspensionLength = base.suspensionRestLength * vehicleScale;
    wheel.maxSuspensionTravel = base.maxSuspensionTravel * vehicleScale;
    wheel.maxSuspensionForce = base.maxSuspensionForce * Math.pow(vehicleScale, 3);
    wheel.suspensionStiffness = base.suspensionStiffness * vehicleScale * vehicleScale;
    wheel.dampingCompression = base.dampingCompression * vehicleScale * vehicleScale;
    wheel.dampingRelaxation = base.dampingRelaxation * vehicleScale * vehicleScale;
    wheel.frictionSlip = base.frictionSlip;
    wheel.engineForce = 0;
    wheel.brake = 0;
  }
}

function setChassisStyle(style) {
  const requested = style === "live-axle" ? "live-axle" : "standard";
  if (requested === chassisStyle) return chassisStyle;
  if (requested === "live-axle") {
    chassisStyle = requested;
    createLiveAxleDynamics();
  } else {
    removeLiveAxleDynamics();
    chassisStyle = requested;
    restoreRearWheelSettings();
  }
  chassisBody.angularDamping = requested === "live-axle"
    ? Math.max(baseChassisAngularDamping, 1.15)
    : baseChassisAngularDamping;
  chassisBody.wakeUp();
  world.broadphase.dirty = true;
  return chassisStyle;
}

function setRearDriveForce(index, force, brake = 0) {
  const wheel = Number(index);
  if (!Number.isInteger(wheel) || wheel < 0 || wheel > 1) return;
  rearDriveRequests[wheel] = Number.isFinite(force) ? force : 0;
  rearBrakeRequests[wheel] = Number.isFinite(brake) ? clamp(brake, 0, 1) : 0;
}

function setRearAxleCondition(index, condition = {}) {
  const sideIndex = Number(index);
  if (!Number.isInteger(sideIndex) || sideIndex < 0 || sideIndex > 1) return;
  const keys = ["trailingArm", "upperLink", "shock", "strap"];
  const state = rearAxleCondition[sideIndex];
  for (const key of keys) {
    const value = condition[key];
    if (Number.isFinite(value)) state[key] = clamp(value, 0, 1);
  }
  for (const component of liveAxleLinkComponents) {
    if (component.side !== (sideIndex === 0 ? -1 : 1)) continue;
    const health = state[component.kind];
    for (const constraint of component.constraints) {
      for (const equation of constraint.equations) {
        equation.maxForce = component.maxForce * health;
        equation.minForce = -component.maxForce * health;
        equation.enabled = health > 0.001;
      }
    }
  }
}

function resetSuspension() {
  rearWheelRotations[0] = 0;
  rearWheelRotations[1] = 0;
  rearDriveRequests = [0, 0];
  rearBrakeRequests = [0, 0];
  if (chassisStyle === "live-axle") rebuildLiveAxleDynamics();
}

function getRearAxlePose() {
  if (!liveAxleActive || !rearAxleBody) return null;
  const position = pointToLocal(chassisBody, rearAxleBody.position);
  const chassisQuaternion = chassisBody.quaternion;
  const inverse = new CANNON.Quaternion(
    -chassisQuaternion.x,
    -chassisQuaternion.y,
    -chassisQuaternion.z,
    chassisQuaternion.w
  );
  const relativeQuaternion = inverse.mult(rearAxleBody.quaternion, new CANNON.Quaternion());
  return {
    position: [position.x, position.y, position.z],
    quaternion: [
      relativeQuaternion.x,
      relativeQuaternion.y,
      relativeQuaternion.z,
      relativeQuaternion.w
    ],
    hubHalfTrack: 0.305 * vehicleScale,
    wheelRotations: rearWheelRotations.slice(),
    limitStrapLengths: liveAxleStraps.map((strap) => strap.maxLength)
  };
}

function getChassisStyle() {
  return chassisStyle;
}

function setVehicleScale(value) {
  const requested = Number(value);
  if (!Number.isFinite(requested)) return vehicleScale;
  const nextScale = Math.max(0.6, Math.min(10, requested));
  if (Math.abs(nextScale - vehicleScale) < 0.0001) return vehicleScale;

  const previousScale = vehicleScale;
  const massScale = nextScale * nextScale * nextScale;
  vehicleScale = nextScale;

  for (let index = 0; index < baseChassisShapes.length; index++) {
    const base = baseChassisShapes[index];
    if (base.halfExtents && base.shape.halfExtents) {
      base.shape.halfExtents.set(
        base.halfExtents.x * nextScale,
        base.halfExtents.y * nextScale,
        base.halfExtents.z * nextScale
      );
      base.shape.updateConvexPolyhedronRepresentation?.();
      base.shape.updateBoundingSphereRadius?.();
    }
    chassisBody.shapeOffsets[index].set(
      base.offset.x * nextScale,
      base.offset.y * nextScale,
      base.offset.z * nextScale
    );
  }

  for (let index = 0; index < baseWheelSettings.length; index++) {
    const base = baseWheelSettings[index];
    const wheel = vehicle.wheelInfos[index];
    wheel.chassisConnectionPointLocal.set(
      base.connection.x * nextScale,
      base.connection.y * nextScale,
      base.connection.z * nextScale
    );
    wheel.radius = base.radius * nextScale;
    wheel.suspensionRestLength = base.suspensionRestLength * nextScale;
    wheel.suspensionLength = base.suspensionRestLength * nextScale;
    wheel.maxSuspensionTravel = base.maxSuspensionTravel * nextScale;
    wheel.maxSuspensionForce = base.maxSuspensionForce * massScale;
    wheel.suspensionStiffness = base.suspensionStiffness * nextScale * nextScale;
    wheel.dampingCompression = base.dampingCompression * nextScale * nextScale;
    wheel.dampingRelaxation = base.dampingRelaxation * nextScale * nextScale;
    vehicle.updateWheelTransform(index);
  }

  chassisBody.mass = baseChassisMass * massScale;
  chassisBody.position.y += 0.24 * (nextScale - previousScale);
  chassisBody.updateMassProperties();
  chassisBody.updateBoundingRadius();
  chassisBody.updateInertiaWorld(true);
  chassisBody.aabbNeedsUpdate = true;
  chassisBody.wakeUp();
  world.broadphase.dirty = true;
  if (chassisStyle === "live-axle") rebuildLiveAxleDynamics();
  return vehicleScale;
}

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
  closedCourseBodies.push(barrierBody);
}

// Build optional map collision bodies once, then switch collision masks when
// the player changes arenas. The gravel map uses one continuous heightfield
// for its bumps and jump faces plus simple boxes for parked full-size cars.
for (const [mapId, layout] of alternateMapLayouts) {
  const bodies = [];
  if (layout.heightfield?.heights?.length) {
    const terrainBody = new CANNON.Body({ mass: 0, material: groundBody.material });
    terrainBody.addShape(new CANNON.Heightfield(layout.heightfield.heights, {
      elementSize: layout.heightfield.elementSize
    }));
    terrainBody.position.set(
      layout.heightfield.originX || 0,
      layout.heightfield.originY || 0,
      layout.heightfield.originZ || 0
    );
    terrainBody.quaternion.copy(heightfieldTilt);
    world.addBody(terrainBody);
    bodies.push(terrainBody);
  }

  for (const obstacle of layout.obstacles || []) {
    const obstacleBody = new CANNON.Body({ mass: 0, material: groundBody.material });
    obstacleBody.addShape(new CANNON.Box(new CANNON.Vec3(
      obstacle.halfWidth,
      obstacle.halfHeight,
      obstacle.halfLength
    )));
    obstacleBody.position.set(obstacle.x, obstacle.y, obstacle.z);
    obstacleBody.quaternion.setFromAxisAngle(
      new CANNON.Vec3(0, 1, 0), obstacle.yaw || 0
    );
    world.addBody(obstacleBody);
    bodies.push(obstacleBody);
  }

  // Static concrete deck, inclined ramp, support piers, curbs, and stair
  // tiers are represented as individual boxes for stable wheel contact.
  for (const box of layout.staticBoxes || []) {
    const boxBody = new CANNON.Body({ mass: 0, material: groundBody.material });
    boxBody.addShape(new CANNON.Box(new CANNON.Vec3(
      box.halfWidth,
      box.halfHeight,
      box.halfLength
    )));
    boxBody.position.set(box.x, box.y, box.z);
    const pitch = new CANNON.Quaternion();
    pitch.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), box.rotationX || 0);
    const yaw = new CANNON.Quaternion();
    yaw.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), box.yaw || 0);
    yaw.mult(pitch, boxBody.quaternion);
    world.addBody(boxBody);
    bodies.push(boxBody);
  }

  for (const body of bodies) body.collisionFilterMask = 0;
  alternateMapBodies.set(mapId, bodies);
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
    spawnYaw,
    getSpawn,
    setActiveMap,
    setVehicleScale,
    getVehicleScale() { return vehicleScale; },
    setChassisStyle,
    getChassisStyle,
    resetSuspension,
    setRearDriveForce,
    setRearAxleCondition,
    getRearAxlePose
  };
}
