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
let steeringAngleState = 0;
const localAirTorque = new CANNON.Vec3();
const worldAirTorque = new CANNON.Vec3();

function updateDrivingControls(delta) {
  const raceAllowsDriving = !game.race || game.race.phase === "racing";
  if (!game.multiplayer?.joined || !raceAllowsDriving) {
    // Cars stay parked in the grid while the host is preparing the race and
    // during the countdown. Inputs are only enabled after the shared GO state.
    for (let i = 0; i < 4; i++) {
      vehicle.applyEngineForce(0, i);
      vehicle.setBrake(game.multiplayer?.joined ? 12 : 0, i);
    }
    throttleState = 0;
    steerState = 0;
    steeringAngleState = 0;
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

  // Smooth chassis drag braking, retained from the last working build.
  if (keys[" "] && delta > 0) {
    const brakeFactor = Math.exp(-2.0 * delta);
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

  return {
    keys,
    resetCar,
    updateDrivingControls,
    get cameraOrbitYaw() { return cameraOrbitYaw; },
    set cameraOrbitYaw(value) { cameraOrbitYaw = Number.isFinite(value) ? value : 0; }
  };
}
