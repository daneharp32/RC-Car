import { FRONT_TIRE_BASE_GRIP, REAR_TIRE_BASE_GRIP } from "./physics.js";

// Camera orbit, keyboard input, vehicle reset, and driving forces.
export function createControlsSystem(game) {
  const { THREE, CANNON, chassisBody, vehicle, spawnX, spawnZ, spawnYaw } = game;
  const canvas = game.canvas;
  const showToast = game.showToast;
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
  if (game.sandbox?.handleKeyDown?.(key, event)) return;
  if (key === "r" && !event.repeat && game.multiplayer?.joined) {
    resetCar();
    game.race?.onCarReset();
  }
});

window.addEventListener("keyup", (event) => {
  keys[event.key.toLowerCase()] = false;
  game.sandbox?.handleKeyUp?.(event.key.toLowerCase(), event);
});
window.addEventListener("blur", () => {
  for (const key of Object.keys(keys)) keys[key] = false;
  game.sandbox?.clearHeldControls?.();
});

function resetCar() {
  const spawn = game.physicsSystem?.getSpawn?.() || {
    x: spawnX, y: 0.24, z: spawnZ, yaw: spawnYaw
  };
  chassisBody.position.set(spawn.x, spawn.y, spawn.z);
  chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), spawn.yaw);
  chassisBody.velocity.set(0, 0, 0);
  chassisBody.angularVelocity.set(0, 0, 0);
  throttleState = 0;
  steerState = 0;
  steeringAngleState = 0;
  previousGroundedForwardSpeed = null;
  smoothedLongitudinalAcceleration = 0;
  chassisBody.force.set(0, 0, 0);
  chassisBody.torque.set(0, 0, 0);
  chassisBody.wakeUp();
  for (let i = 0; i < 4; i++) {
    vehicle.wheelInfos[i].rotation = 0;
    vehicle.wheelInfos[i].deltaRotation = 0;
    vehicle.wheelInfos[i].engineForce = 0;
    vehicle.wheelInfos[i].frictionSlip = i < 2 ? FRONT_TIRE_BASE_GRIP : REAR_TIRE_BASE_GRIP;
  }
  showToast("Car reset");
}

let steerState = 0;
let throttleState = 0;
let steeringAngleState = 0;

// Reusable chassis axes and load-transfer state. All handling calculations are
// performed in the truck's local frame so they remain correct at any heading.
const localRightAxis = new CANNON.Vec3(1, 0, 0);
const localUpAxis = new CANNON.Vec3(0, 1, 0);
const localForwardAxis = new CANNON.Vec3(0, 0, 1);
const worldRightAxis = new CANNON.Vec3();
const worldUpAxis = new CANNON.Vec3();
const worldForwardAxis = new CANNON.Vec3();
const horizontalRightAxis = new CANNON.Vec3();
const horizontalForwardAxis = new CANNON.Vec3();
const worldLeanTorque = new CANNON.Vec3();
const localAirTorque = new CANNON.Vec3();
const worldAirTorque = new CANNON.Vec3();
const wheelContactVelocity = new CANNON.Vec3();
const wheelForwardDirection = new CANNON.Vec3();
const wheelRightDirection = new CANNON.Vec3();
const activeWheelbase = Math.max(
  0.45,
  Math.abs(
    vehicle.wheelInfos[2].chassisConnectionPointLocal.z -
    vehicle.wheelInfos[0].chassisConnectionPointLocal.z
  )
);
let previousGroundedForwardSpeed = null;
let smoothedLongitudinalAcceleration = 0;

function updateDrivingControls(delta) {
  const sandboxAllowsDriving = game.sandbox?.active === true && game.sandbox.inMap === true;
  const raceAllowsDriving = sandboxAllowsDriving || !game.race || game.race.phase === "racing" || game.race.phase === "free-drive";
  if (!game.multiplayer?.joined || !raceAllowsDriving) {
    // Race cars stay parked on the grid until GO. Free Drive has no staging
    // phase, so normal throttle, steering, braking and air control stay active.
    for (let i = 0; i < 4; i++) {
      vehicle.applyEngineForce(0, i);
      vehicle.setBrake(game.multiplayer?.joined ? 12 : 0, i);
    }
    throttleState = 0;
    steerState = 0;
    steeringAngleState = 0;
    previousGroundedForwardSpeed = null;
    smoothedLongitudinalAcceleration = 0;
    for (let i = 0; i < 4; i++) {
      vehicle.wheelInfos[i].frictionSlip = i < 2 ? FRONT_TIRE_BASE_GRIP : REAR_TIRE_BASE_GRIP;
    }
    return;
  }

  const forward = keys.w || keys.arrowup ? 1 : 0;
  const reverse = keys.s || keys.arrowdown ? -1 : 0;
  const throttle = forward + reverse;
  const steerTarget = (keys.a || keys.arrowleft ? 1 : 0) -
    (keys.d || keys.arrowright ? 1 : 0);

  // Time-based smoothing keeps the handling stable across frame rates.
  // Heavier short-course trucks take a moment to settle into direction changes.
  const steerResponse = 1 - Math.exp(-5.8 * delta);
  const throttleResponse = 1 - Math.exp(-5.0 * delta);
  steerState += (steerTarget - steerState) * steerResponse;
  throttleState += (throttle - throttleState) * throttleResponse;

  const speed = chassisBody.velocity.length();
  // Scale steering using forward travel speed, not total velocity. When the
  // truck is sideways, its lateral speed must not remove steering authority;
  // the front tires need to remain responsive for counter-steering.
  chassisBody.quaternion.vmult(localForwardAxis, worldForwardAxis);
  const headingLength = Math.hypot(worldForwardAxis.x, worldForwardAxis.z) || 1;
  const forwardTravelSpeed = Math.abs(
    (chassisBody.velocity.x * worldForwardAxis.x +
      chassisBody.velocity.z * worldForwardAxis.z) / headingLength
  );
  const speedSteerScale = THREE.MathUtils.clamp(1 - forwardTravelSpeed / 26, 0.58, 1);
  const targetSteeringAngle = steerState * 0.34 * speedSteerScale;
  // Respond slightly quicker so counter-steer is available as soon as the
  // driver changes direction during an existing slide.
  const steeringResponse = 1 - Math.exp(-8.5 * delta);
  steeringAngleState += (targetSteeringAngle - steeringAngleState) * steeringResponse;
  vehicle.setSteeringValue(steeringAngleState, 0);
  vehicle.setSteeringValue(steeringAngleState, 1);

  // Progressive four-wheel drive with a gradual top-speed fade.
  const speedLimitScale = THREE.MathUtils.clamp(1 - speed / 27, 0.24, 1);
  const engineForce = throttleState * 30 * speedLimitScale;
  for (let i = 0; i < 4; i++) {
    vehicle.applyEngineForce(engineForce, i);
    vehicle.setBrake(0, i);
  }

  // Resolve the chassis velocity into its own forward and sideways axes.
  // Braking acts mainly along the truck's length, so a sideways landing or
  // developing drift is not erased by a world-X/world-Z velocity multiplier.
  chassisBody.quaternion.vmult(localRightAxis, worldRightAxis);
  chassisBody.quaternion.vmult(localUpAxis, worldUpAxis);
  chassisBody.quaternion.vmult(localForwardAxis, worldForwardAxis);

  // Flatten the heading axes for tire slip and braking so a pitched car never
  // loses vertical jump velocity just because the driver is holding brake.
  const horizontalForwardLength = Math.hypot(worldForwardAxis.x, worldForwardAxis.z);
  if (horizontalForwardLength > 1e-4) {
    horizontalForwardAxis.set(
      worldForwardAxis.x / horizontalForwardLength,
      0,
      worldForwardAxis.z / horizontalForwardLength
    );
  } else {
    horizontalForwardAxis.set(0, 0, 1);
  }
  horizontalRightAxis.set(horizontalForwardAxis.z, 0, -horizontalForwardAxis.x);

  let forwardSpeed = chassisBody.velocity.dot(horizontalForwardAxis);
  let lateralSpeed = chassisBody.velocity.dot(horizontalRightAxis);

  if (keys[" "] && delta > 0) {
    const forwardBrakeFactor = Math.exp(-3.1 * delta);
    const lateralBrakeFactor = Math.exp(-0.42 * delta);
    const forwardChange = (forwardBrakeFactor - 1) * forwardSpeed;
    const lateralChange = (lateralBrakeFactor - 1) * lateralSpeed;
    chassisBody.velocity.x +=
      horizontalForwardAxis.x * forwardChange + horizontalRightAxis.x * lateralChange;
    chassisBody.velocity.z +=
      horizontalForwardAxis.z * forwardChange + horizontalRightAxis.z * lateralChange;
    forwardSpeed = chassisBody.velocity.dot(horizontalForwardAxis);
    lateralSpeed = chassisBody.velocity.dot(horizontalRightAxis);
  }

  const groundedWheels = vehicle.wheelInfos.reduce(
    (count, wheel) => count + (wheel.isInContact ? 1 : 0),
    0
  );

  // Predict lateral load from speed and steering. The threshold is higher
  // than before so ordinary turns retain grip; only harder cornering begins
  // to use up the rear tire traction.
  const expectedLateralAcceleration =
    (forwardSpeed * forwardSpeed * Math.abs(Math.tan(steeringAngleState))) /
    activeWheelbase;
  const corneringLoad = THREE.MathUtils.clamp(
    (expectedLateralAcceleration - 4.9) / 9.5,
    0,
    1
  );

  // Estimate each tire's own slip at its contact patch, including yaw motion.
  // Front tires keep most of their grip so counter-steering can recover the
  // truck; rear grip reduces a little more to allow a progressive rotation.
  for (let i = 0; i < 4; i++) {
    const wheel = vehicle.wheelInfos[i];
    const wheelSteeringAngle = wheel.isFrontWheel ? wheel.steering : 0;
    const steeringCosine = Math.cos(wheelSteeringAngle);
    const steeringSine = Math.sin(wheelSteeringAngle);

    wheelForwardDirection.set(
      horizontalForwardAxis.x * steeringCosine + horizontalRightAxis.x * steeringSine,
      0,
      horizontalForwardAxis.z * steeringCosine + horizontalRightAxis.z * steeringSine
    );
    wheelRightDirection.set(
      horizontalRightAxis.x * steeringCosine - horizontalForwardAxis.x * steeringSine,
      0,
      horizontalRightAxis.z * steeringCosine - horizontalForwardAxis.z * steeringSine
    );

    let tireForwardSpeed = forwardSpeed;
    let tireLateralSpeed = lateralSpeed;
    if (wheel.isInContact && wheel.raycastResult?.body) {
      chassisBody.getVelocityAtWorldPoint(
        wheel.raycastResult.hitPointWorld,
        wheelContactVelocity
      );
      tireForwardSpeed = wheelContactVelocity.dot(wheelForwardDirection);
      tireLateralSpeed = wheelContactVelocity.dot(wheelRightDirection);
    }

    const tireSpeed = Math.hypot(tireForwardSpeed, tireLateralSpeed);
    const tireSlipAngle = Math.atan2(
      Math.abs(tireLateralSpeed),
      Math.abs(tireForwardSpeed) + 1.0
    );
    const tireSlipSpeedGate = THREE.MathUtils.clamp(
      (tireSpeed - 2.0) / 5.0,
      0,
      1
    );
    const tireSlipLoad = THREE.MathUtils.clamp(
      (tireSlipAngle - 0.10) / 0.50,
      0,
      1
    ) * tireSlipSpeedGate;

    const axleCorneringLoad = corneringLoad * (wheel.isFrontWheel ? 0.48 : 0.94);
    const totalGripLoad = Math.max(tireSlipLoad * 0.50, axleCorneringLoad);
    const baseGrip = wheel.isFrontWheel
      ? FRONT_TIRE_BASE_GRIP
      : REAR_TIRE_BASE_GRIP;
    const gripReduction = wheel.isFrontWheel ? 0.12 : 0.32;
    const minimumGrip = wheel.isFrontWheel ? 2.38 : 2.02;
    wheel.frictionSlip = Math.max(
      minimumGrip,
      baseGrip - totalGripLoad * gripReduction
    );
  }

  // Do not apply flight controls while the truck is merely settling at spawn.
  const airborne = groundedWheels <= 1 && chassisBody.position.y > 0.42;
  const thrusterState = game.sandbox?.getThrusterState?.();
  const sandboxThrustersActive = Boolean(thrusterState?.lift || thrusterState?.forward);

  if (airborne && !sandboxThrustersActive) {
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
  } else if (groundedWheels >= 2 && !sandboxThrustersActive) {
    // Measure longitudinal acceleration and turning acceleration in the
    // chassis frame. These values drive a damped roll/pitch response, letting
    // the individual raycast springs compress naturally under load transfer.
    const measuredAcceleration = previousGroundedForwardSpeed === null || delta <= 1e-4
      ? 0
      : (forwardSpeed - previousGroundedForwardSpeed) / delta;
    previousGroundedForwardSpeed = forwardSpeed;
    const safeAcceleration = THREE.MathUtils.clamp(measuredAcceleration, -11, 11);
    smoothedLongitudinalAcceleration +=
      (safeAcceleration - smoothedLongitudinalAcceleration) *
      (1 - Math.exp(-7.0 * delta));

    chassisBody.quaternion.vmult(localRightAxis, worldRightAxis);
    chassisBody.quaternion.vmult(localUpAxis, worldUpAxis);
    chassisBody.quaternion.vmult(localForwardAxis, worldForwardAxis);

    const yawRate = chassisBody.angularVelocity.dot(worldUpAxis);
    const actualLateralAcceleration = forwardSpeed * yawRate;
    const predictedLateralAcceleration =
      (forwardSpeed * forwardSpeed * Math.tan(steeringAngleState)) / activeWheelbase;
    const lateralAcceleration = THREE.MathUtils.clamp(
      actualLateralAcceleration * 0.70 + predictedLateralAcceleration * 0.30,
      -8.5,
      8.5
    );

    // Positive lateral acceleration rolls the body outward. Acceleration
    // lifts the nose; braking pitches it down. Small target angles look like
    // a loaded short-course truck rather than a car with exaggerated body sway.
    const targetRoll = THREE.MathUtils.clamp(lateralAcceleration * 0.012, -0.105, 0.105);
    const targetPitch = THREE.MathUtils.clamp(
      -smoothedLongitudinalAcceleration * 0.0055,
      -0.070,
      0.070
    );
    const rollAngle = Math.atan2(worldRightAxis.y, worldUpAxis.y);
    const pitchAngle = Math.atan2(-worldForwardAxis.y, worldUpAxis.y);
    const rollRate = chassisBody.angularVelocity.dot(worldForwardAxis);
    const pitchRate = chassisBody.angularVelocity.dot(worldRightAxis);
    const contactScale = THREE.MathUtils.clamp(groundedWheels / 4, 0.42, 1);

    const rollTorque = THREE.MathUtils.clamp(
      ((targetRoll - rollAngle) * 46 - rollRate * 8.2) * contactScale,
      -10,
      10
    );
    const pitchTorque = THREE.MathUtils.clamp(
      ((targetPitch - pitchAngle) * 38 - pitchRate * 10.5) * contactScale,
      -9,
      9
    );

    worldLeanTorque.set(
      worldForwardAxis.x * rollTorque + worldRightAxis.x * pitchTorque,
      worldForwardAxis.y * rollTorque + worldRightAxis.y * pitchTorque,
      worldForwardAxis.z * rollTorque + worldRightAxis.z * pitchTorque
    );
    chassisBody.applyTorque(worldLeanTorque);
  } else {
    previousGroundedForwardSpeed = null;
    smoothedLongitudinalAcceleration *= Math.exp(-2.0 * delta);
    // Keep a small amount of angular settling while only one tire is touching.
    chassisBody.angularVelocity.x *= 0.985;
    chassisBody.angularVelocity.z *= 0.985;
  }
}

  return {
    keys,
    resetCar,
    updateDrivingControls,
    get cameraOrbitYaw() { return cameraOrbitYaw; },
    set cameraOrbitYaw(value) { cameraOrbitYaw = Number.isFinite(value) ? value : 0; }
  };
}
