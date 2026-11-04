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
  if (key === "r" && !event.repeat && game.multiplayer?.joined) {
    resetCar();
    game.race?.onCarReset();
  }
});

window.addEventListener("keyup", (event) => {
  keys[event.key.toLowerCase()] = false;
});
window.addEventListener("blur", () => {
  for (const key of Object.keys(keys)) keys[key] = false;
});

function resetCar() {
  chassisBody.position.set(spawnX, 0.24, spawnZ);
  chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), spawnYaw);
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
    vehicle.wheelInfos[i].frictionSlip = i < 2 ? 4.9 : 4.45;
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
const worldLeanTorque = new CANNON.Vec3();
const localAirTorque = new CANNON.Vec3();
const worldAirTorque = new CANNON.Vec3();
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
  const raceAllowsDriving = !game.race || game.race.phase === "racing" || game.race.phase === "free-drive";
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
      vehicle.wheelInfos[i].frictionSlip = i < 2 ? 4.9 : 4.45;
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
  // Reduce steering as speed rises, then ease the steering rack toward the
  // target angle rather than snapping the front wheels to it in one frame.
  const speedSteerScale = THREE.MathUtils.clamp(1 - speed / 24, 0.42, 1);
  const targetSteeringAngle = steerState * 0.34 * speedSteerScale;
  const steeringResponse = 1 - Math.exp(-7.0 * delta);
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
  let forwardSpeed = chassisBody.velocity.dot(worldForwardAxis);
  let lateralSpeed = chassisBody.velocity.dot(worldRightAxis);

  if (keys[" "] && delta > 0) {
    const forwardBrakeFactor = Math.exp(-3.1 * delta);
    const lateralBrakeFactor = Math.exp(-0.42 * delta);
    const forwardChange = (forwardBrakeFactor - 1) * forwardSpeed;
    const lateralChange = (lateralBrakeFactor - 1) * lateralSpeed;
    chassisBody.velocity.x +=
      worldForwardAxis.x * forwardChange + worldRightAxis.x * lateralChange;
    chassisBody.velocity.y +=
      worldForwardAxis.y * forwardChange + worldRightAxis.y * lateralChange;
    chassisBody.velocity.z +=
      worldForwardAxis.z * forwardChange + worldRightAxis.z * lateralChange;
    forwardSpeed = chassisBody.velocity.dot(worldForwardAxis);
    lateralSpeed = chassisBody.velocity.dot(worldRightAxis);
  }

  const groundedWheels = vehicle.wheelInfos.reduce(
    (count, wheel) => count + (wheel.isInContact ? 1 : 0),
    0
  );

  // A progressive friction circle lets the truck retain some lateral speed
  // through a landing and during a drift. Rear grip falls a little more than
  // front grip under high slip, making the slide catchable with counter-steer.
  const horizontalSpeed = Math.hypot(forwardSpeed, lateralSpeed);
  const slipAngle = Math.atan2(
    Math.abs(lateralSpeed),
    Math.abs(forwardSpeed) + 0.65
  );
  const speedGate = THREE.MathUtils.clamp((horizontalSpeed - 1.25) / 4.0, 0, 1);
  const slipLoad = THREE.MathUtils.clamp((slipAngle - 0.10) / 0.72, 0, 1) * speedGate;
  const steeringLoad =
    THREE.MathUtils.clamp(Math.abs(steeringAngleState) / 0.34, 0, 1) *
    speedGate * 0.48;
  const driftLoad = Math.max(slipLoad, steeringLoad);

  for (let i = 0; i < 4; i++) {
    const wheel = vehicle.wheelInfos[i];
    const baseGrip = wheel.isFrontWheel ? 4.9 : 4.45;
    const gripReduction = wheel.isFrontWheel ? 0.78 : 1.12;
    wheel.frictionSlip = baseGrip - driftLoad * gripReduction;
  }

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
  } else if (groundedWheels >= 2) {
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
