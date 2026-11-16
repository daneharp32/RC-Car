// Dedicated physics vehicle for the WIP 1/7 rolling chassis test drive.
// It is created separately from the production truck so Parts Lab testing
// cannot change the existing garage car, drivetrain tuning, or multiplayer state.

const VISUAL_SCALE = 0.11;
const VISUAL_COM_HEIGHT = 0.075;
// Measured from the assembled wheel geometry: local tire centre Y is
// 0.6228 and the tire cylinder's outer radius is 0.58 before wheel scaling.
const WHEEL_CENTRE_MODEL_Y = 0.6228;
const WHEEL_CENTRE_MODEL_X = 1.35;
const AXLE_HALF_WHEELBASE_MODEL = 1.97;
const WHEEL_RADIUS_MODEL = 0.58 * 1.08;
const WHEEL_RADIUS = WHEEL_RADIUS_MODEL * VISUAL_SCALE;
const SUSPENSION_REST = 0.045;
const MAX_SUSPENSION_TRAVEL = 0.045;
const CHASSIS_MASS = 6.8;
const WIP_COLLISION_GROUP = 4;
const JUMP_COLLISION_GROUP = 2;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createWipTestDriveSystem(game, visualRoot, wheelPivots, onSuspensionUpdate) {
  const {
    CANNON,
    THREE,
    world,
    physicsSystem,
    chassisBody: productionBody,
    vehicle: productionVehicle,
    controls
  } = game;

  if (!CANNON || !THREE || !world || !physicsSystem?.groundBody?.material ||
      !productionVehicle || !visualRoot || !Array.isArray(wheelPivots) || wheelPivots.length !== 4) {
    throw new Error("WIP test drive could not initialize: missing physics or chassis visual references.");
  }

  const chassisMaterial = new CANNON.Material("wip-rolling-chassis");
  const body = new CANNON.Body({
    mass: CHASSIS_MASS,
    material: chassisMaterial,
    linearDamping: 0.075,
    angularDamping: 0.32,
    allowSleep: false,
    collisionFilterGroup: WIP_COLLISION_GROUP,
    // Keep the chassis tub clear of the jump-face collision group. The
    // wheel raycasts still see those surfaces, just like the production truck.
    collisionFilterMask: ~JUMP_COLLISION_GROUP
  });

  // The body origin represents the assembled chassis' visual ground datum.
  // Its mass centre is raised by VISUAL_COM_HEIGHT; the rendered assembly is
  // offset back down by the same amount after each physics step.
  body.addShape(
    new CANNON.Box(new CANNON.Vec3(0.132, 0.020, 0.215)),
    new CANNON.Vec3(0, 0, 0)
  );

  world.addContactMaterial(new CANNON.ContactMaterial(chassisMaterial, physicsSystem.groundBody.material, {
    friction: 0.32,
    restitution: 0.015,
    contactEquationStiffness: 1e7
  }));

  const vehicle = new CANNON.RaycastVehicle({
    chassisBody: body,
    indexForwardAxis: 2,
    indexRightAxis: 0,
    indexUpAxis: 1
  });

  const visualTyreBottomTrim = WHEEL_RADIUS - WHEEL_CENTRE_MODEL_Y * VISUAL_SCALE;
  const connectionY = WHEEL_RADIUS - VISUAL_COM_HEIGHT + SUSPENSION_REST + 0.002;
  const axleHalfTrack = WHEEL_CENTRE_MODEL_X * VISUAL_SCALE;
  const axleHalfWheelbase = AXLE_HALF_WHEELBASE_MODEL * VISUAL_SCALE;

  // The assembled model's nose and the test-drive vehicle both point along -Z.
  // Front wheels stay at negative Z; the engine-force sign and steering sign
  // are inverted below to match RaycastVehicle's local tire-force convention.
  const wheelSpecs = [
    { x: -axleHalfTrack, z: -axleHalfWheelbase, front: true },
    { x: axleHalfTrack, z: -axleHalfWheelbase, front: true },
    { x: -axleHalfTrack, z: axleHalfWheelbase, front: false },
    { x: axleHalfTrack, z: axleHalfWheelbase, front: false }
  ];

  for (const spec of wheelSpecs) {
    vehicle.addWheel({
      chassisConnectionPointLocal: new CANNON.Vec3(spec.x, connectionY, spec.z),
      directionLocal: new CANNON.Vec3(0, -1, 0),
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      suspensionRestLength: SUSPENSION_REST,
      suspensionStiffness: 240,
      dampingCompression: 9.0,
      dampingRelaxation: 6.8,
      maxSuspensionTravel: MAX_SUSPENSION_TRAVEL,
      maxSuspensionForce: 260,
      radius: WHEEL_RADIUS,
      frictionSlip: spec.front ? 3.55 : 3.15,
      rollInfluence: 0.075,
      isFrontWheel: spec.front,
      useCustomSlidingRotationalSpeed: true,
      customSlidingRotationalSpeed: 18
    });
  }

  const visualOriginOffset = new CANNON.Vec3(
    0,
    -VISUAL_COM_HEIGHT + visualTyreBottomTrim,
    0
  );
  const inverseVisualQuaternion = new THREE.Quaternion();
  const bodyQuaternion = new THREE.Quaternion();
  const wheelQuaternion = new THREE.Quaternion();
  const worldWheelPosition = new THREE.Vector3();
  const worldOriginOffset = new CANNON.Vec3();
  const localForward = new CANNON.Vec3(0, 0, -1);
  const worldForward = new CANNON.Vec3();
  const leftForce = new CANNON.Vec3();
  const rightForce = new CANNON.Vec3();
  const leftOffset = new CANNON.Vec3();
  const rightOffset = new CANNON.Vec3();
  const worldUp = new CANNON.Vec3();

  let active = false;
  let steering = 0;
  let throttle = 0;
  let lastResetDown = false;
  let previousOriginalBodyType = productionBody.type;
  let previousOriginalBodyMass = productionBody.mass;
  let previousOriginalCollisionMask = productionBody.collisionFilterMask;
  let productionVehicleRemoved = false;
  let wipVehicleAdded = false;
  let rearCouplingListenerAdded = false;

  function getGroundSpawn() {
    const layout = game.mapLayouts?.[game.activeMapId] || game.trackLayout;
    const spawn = layout?.spawn || {};
    return {
      x: Number.isFinite(spawn.x) ? spawn.x : 0,
      y: Number.isFinite(spawn.y) ? spawn.y : 0,
      z: Number.isFinite(spawn.z) ? spawn.z : 0,
      yaw: Number.isFinite(spawn.yaw) ? spawn.yaw : 0
    };
  }

  function reset() {
    const spawn = getGroundSpawn();
    body.position.set(spawn.x, spawn.y + VISUAL_COM_HEIGHT, spawn.z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), spawn.yaw);
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
    body.force.set(0, 0, 0);
    body.torque.set(0, 0, 0);
    body.wakeUp();

    steering = 0;
    throttle = 0;
    lastResetDown = Boolean(controls?.keys?.r);

    for (let index = 0; index < vehicle.wheelInfos.length; index++) {
      const wheel = vehicle.wheelInfos[index];
      wheel.engineForce = 0;
      wheel.brake = 0;
      wheel.steering = 0;
      wheel.rotation = 0;
      wheel.deltaRotation = 0;
      wheel.suspensionLength = SUSPENSION_REST;
      wheel.suspensionForce = 0;
      wheel.sliding = false;
      vehicle.updateWheelTransform(index);
    }
    world.broadphase.dirty = true;
    updateVisuals();
  }

  function applyRearAxleCoupling() {
    if (!active) return;
    const left = vehicle.wheelInfos[2];
    const right = vehicle.wheelInfos[3];
    if (!left || !right || (!left.isInContact && !right.isInContact)) return;

    const contactScale = left.isInContact && right.isInContact ? 1 : 0.3;
    const leftCompression = left.suspensionRestLength - left.suspensionLength;
    const rightCompression = right.suspensionRestLength - right.suspensionLength;
    const travelDifference = leftCompression - rightCompression;
    if (!Number.isFinite(travelDifference)) return;

    const force = clamp(travelDifference * 220, -24, 24) * contactScale;
    if (Math.abs(force) < 0.01) return;

    body.vectorToWorldFrame(new CANNON.Vec3(0, 1, 0), worldUp);
    const leftWorld = left.chassisConnectionPointWorld;
    const rightWorld = right.chassisConnectionPointWorld;
    leftOffset.set(
      leftWorld.x - body.position.x,
      leftWorld.y - body.position.y,
      leftWorld.z - body.position.z
    );
    rightOffset.set(
      rightWorld.x - body.position.x,
      rightWorld.y - body.position.y,
      rightWorld.z - body.position.z
    );
    // Oppose the compression difference: lift the more-compressed side and
    // push the opposite side down, rather than amplifying chassis roll.
    leftForce.set(worldUp.x * force, worldUp.y * force, worldUp.z * force);
    rightForce.set(-worldUp.x * force, -worldUp.y * force, -worldUp.z * force);
    body.applyForce(leftForce, leftOffset);
    body.applyForce(rightForce, rightOffset);
  }

  function updateControls(delta) {
    if (!active || !Number.isFinite(delta) || delta <= 0) return;
    const keys = controls?.keys || {};
    const resetDown = Boolean(keys.r);
    if (resetDown && !lastResetDown) reset();
    lastResetDown = resetDown;

    const left = Boolean(keys.a || keys.arrowleft);
    const right = Boolean(keys.d || keys.arrowright);
    const targetSteering = (left ? 1 : 0) - (right ? 1 : 0);
    const forward = Boolean(keys.w || keys.arrowup);
    const reverse = Boolean(keys.s || keys.arrowdown);
    const targetThrottle = (forward ? 1 : 0) - (reverse ? 1 : 0);

    steering += (targetSteering - steering) * (1 - Math.exp(-10 * delta));
    throttle += (targetThrottle - throttle) * (1 - Math.exp(-7 * delta));

    body.quaternion.vmult(localForward, worldForward);
    const forwardSpeed = body.velocity.dot(worldForward);
    const absoluteSpeed = body.velocity.length();
    const speedSteeringScale = clamp(1 - Math.abs(forwardSpeed) / 19, 0.58, 1);
    const steeringAngle = steering * 0.43 * speedSteeringScale;

    vehicle.setSteeringValue(steeringAngle, 0);
    vehicle.setSteeringValue(steeringAngle, 1);

    // Four-wheel drive. A gentle speed taper prevents runaway acceleration,
    // while reverse uses a lower force for predictable low-speed manoeuvring.
    const speedLimit = targetThrottle >= 0 ? 15.5 : 6.2;
    const speedScale = clamp(1 - absoluteSpeed / speedLimit, 0.12, 1);
    const driveForce = throttle >= 0
      ? throttle * 25 * speedScale
      : throttle * 17 * speedScale;
    const braking = keys[" "] ? 8.5 : 0;

    for (let index = 0; index < 4; index++) {
      vehicle.applyEngineForce(driveForce, index);
      vehicle.setBrake(braking, index);
    }
  }

  function updateVisuals() {
    if (!active) return;

    bodyQuaternion.set(
      body.quaternion.x,
      body.quaternion.y,
      body.quaternion.z,
      body.quaternion.w
    );
    body.vectorToWorldFrame(visualOriginOffset, worldOriginOffset);
    visualRoot.position.set(
      body.position.x + worldOriginOffset.x,
      body.position.y + worldOriginOffset.y,
      body.position.z + worldOriginOffset.z
    );
    visualRoot.quaternion.copy(bodyQuaternion);
    visualRoot.visible = true;
    visualRoot.updateMatrixWorld(true);
    inverseVisualQuaternion.copy(visualRoot.quaternion).invert();

    for (let index = 0; index < 4; index++) {
      vehicle.updateWheelTransform(index);
      const transform = vehicle.wheelInfos[index].worldTransform;
      worldWheelPosition.set(
        transform.position.x,
        transform.position.y,
        transform.position.z
      );
      wheelPivots[index].position.copy(visualRoot.worldToLocal(worldWheelPosition));
      wheelQuaternion.set(
        transform.quaternion.x,
        transform.quaternion.y,
        transform.quaternion.z,
        transform.quaternion.w
      );
      wheelPivots[index].quaternion.copy(inverseVisualQuaternion).multiply(wheelQuaternion);
    }

    const wheelState = vehicle.wheelInfos.map((wheel) => ({
      restLength: wheel.suspensionRestLength,
      length: wheel.suspensionLength,
      maxTravel: wheel.maxSuspensionTravel,
      inContact: wheel.isInContact
    }));
    onSuspensionUpdate?.({
      wheels: wheelState,
      steering,
      now: performance.now()
    });
  }

  function clearHeldControls() {
    if (!controls?.keys) return;
    for (const key of Object.keys(controls.keys)) controls.keys[key] = false;
  }

  function restoreProductionVehicle() {
    productionBody.type = previousOriginalBodyType;
    productionBody.mass = previousOriginalBodyMass;
    productionBody.collisionFilterMask = previousOriginalCollisionMask;
    productionBody.updateMassProperties?.();

    // Only re-register a vehicle that this system successfully removed. This
    // avoids adding a second set of raycast callbacks if setup failed early.
    if (productionVehicleRemoved) {
      productionVehicle.addToWorld(world);
      productionVehicleRemoved = false;
    }
    world.broadphase.dirty = true;
  }

  function start() {
    if (active) return true;
    // A failed cleanup must never allow a second WIP vehicle to be registered.
    if (productionVehicleRemoved || wipVehicleAdded) return false;

    let listenerAddedThisAttempt = false;
    try {
      const activeMap = game.activeMapId || "closed-course";
      if (physicsSystem?.setActiveMap && !physicsSystem.setActiveMap(activeMap)) {
        throw new Error("The selected driving area could not be enabled for the WIP test.");
      }
      // Use the selected physics map's spawn after its collision geometry is enabled.
      const physicsSpawn = physicsSystem?.getSpawn?.();
      const spawn = physicsSpawn && Number.isFinite(physicsSpawn.x) &&
        Number.isFinite(physicsSpawn.y) && Number.isFinite(physicsSpawn.z)
        ? physicsSpawn
        : getGroundSpawn();

      // Validate the reversible switch before changing either vehicle.
      if (typeof productionVehicle.removeFromWorld !== "function" ||
          typeof productionVehicle.addToWorld !== "function" ||
          typeof vehicle.removeFromWorld !== "function" ||
          typeof vehicle.addToWorld !== "function") {
        throw new Error("The current physics library does not support safe vehicle switching.");
      }

      previousOriginalBodyType = productionBody.type;
      previousOriginalBodyMass = productionBody.mass;
      previousOriginalCollisionMask = productionBody.collisionFilterMask;

      // Remove the normal vehicle and its raycast callbacks for the duration
      // of the prototype drive. The production body is parked and disabled;
      // the dedicated WIP body is the only vehicle receiving drive forces.
      productionVehicle.removeFromWorld(world);
      productionVehicleRemoved = true;
      productionBody.type = CANNON.Body.STATIC;
      productionBody.mass = 0;
      productionBody.collisionFilterMask = 0;
      productionBody.updateMassProperties?.();

      body.position.set(spawn.x, spawn.y + VISUAL_COM_HEIGHT, spawn.z);
      body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), spawn.yaw);
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
      body.force.set(0, 0, 0);
      body.torque.set(0, 0, 0);

      // Mark the attempt before registration so the catch path also tries to
      // undo a partially completed addToWorld call.
      wipVehicleAdded = true;
      vehicle.addToWorld(world);
      world.addEventListener("preStep", applyRearAxleCoupling);
      rearCouplingListenerAdded = true;
      listenerAddedThisAttempt = true;
      active = true;
      clearHeldControls();
      visualRoot.visible = true;
      world.broadphase.dirty = true;
      reset();
      game.showToast?.("WIP CHASSIS TEST DRIVE · W/A/S/D TO DRIVE");
      return true;
    } catch (error) {
      console.error("WIP chassis test drive could not start:", error);
      active = false;
      visualRoot.visible = false;
      if (listenerAddedThisAttempt && rearCouplingListenerAdded) {
        world.removeEventListener("preStep", applyRearAxleCoupling);
        rearCouplingListenerAdded = false;
      }
      let wipVehicleCleanedUp = !wipVehicleAdded;
      if (wipVehicleAdded) {
        try {
          vehicle.removeFromWorld(world);
          wipVehicleAdded = false;
          wipVehicleCleanedUp = true;
        } catch (removeError) {
          // Do not re-enable the production vehicle when the prototype might
          // still be registered in the same world.
          console.error("Could not remove the partially started WIP vehicle:", removeError);
        }
      }
      if (wipVehicleCleanedUp) {
        try {
          restoreProductionVehicle();
        } catch (restoreError) {
          console.error("Could not restore the production vehicle after test-drive setup failed:", restoreError);
        }
      } else {
        console.error("The original truck remains safely disabled because WIP cleanup was incomplete.");
      }
      clearHeldControls();
      world.broadphase.dirty = true;
      return false;
    }
  }

  function stop() {
    if (!active && !productionVehicleRemoved && !wipVehicleAdded) return true;
    active = false;
    if (rearCouplingListenerAdded) {
      world.removeEventListener("preStep", applyRearAxleCoupling);
      rearCouplingListenerAdded = false;
    }

    if (wipVehicleAdded) {
      try {
        vehicle.removeFromWorld(world);
        wipVehicleAdded = false;
      } catch (error) {
        // Do not reactivate the production truck while the WIP vehicle may
        // still be registered; two active vehicles in one spot would be unsafe.
        console.error("Could not cleanly remove the WIP test vehicle:", error);
        visualRoot.visible = true;
        return false;
      }
    }

    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
    body.force.set(0, 0, 0);
    body.torque.set(0, 0, 0);
    visualRoot.visible = false;

    try {
      restoreProductionVehicle();
    } catch (error) {
      console.error("Could not restore the original truck after test drive:", error);
      return false;
    }

    // Do not call controls.resetCar() here: that also repairs the original
    // truck and clears its damage. The garage handles showroom parking when
    // returning to the Parts Lab, so its pre-test condition remains intact.
    clearHeldControls();
    return true;
  }

  function getSpeedMph() {
    return body.velocity.length() * 2.236936;
  }

  function getContactCount() {
    return vehicle.wheelInfos.reduce((count, wheel) => count + (wheel.isInContact ? 1 : 0), 0);
  }

  function getSuspensionState() {
    return vehicle.wheelInfos.map((wheel) => ({
      restLength: wheel.suspensionRestLength,
      length: wheel.suspensionLength,
      maxTravel: wheel.maxSuspensionTravel,
      inContact: wheel.isInContact
    }));
  }

  visualRoot.visible = false;

  return {
    start,
    stop,
    reset,
    updateControls,
    updateVisuals,
    getSpeedMph,
    getContactCount,
    getSuspensionState,
    get active() { return active; },
    get body() { return body; },
    get vehicle() { return vehicle; }
  };
}
