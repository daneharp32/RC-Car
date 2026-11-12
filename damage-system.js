// Collect only meaningful chassis impacts. The hit point is retained so the
// visual damage system can choose the component nearest the actual contact.
export function createImpactDamageSystem({ CANNON, chassisBody }) {
  const pending = [];
  let lastImpactAt = -Infinity;

  function pointVelocity(body, offset) {
    const angular = body.angularVelocity.cross(offset, new CANNON.Vec3());
    return body.velocity.vadd(angular);
  }

  function onCollide(event) {
    const contact = event.contact;
    if (!contact || !contact.ni) return;

    const otherBody = event.body ||
      (contact.bi === chassisBody ? contact.bj : contact.bi);
    if (!otherBody || otherBody.userData?.rcCarDebris) return;

    const chassisIsBodyI = contact.bi === chassisBody;
    const chassisOffset = (chassisIsBodyI ? contact.ri : contact.rj)?.clone?.()
      || new CANNON.Vec3();
    const otherOffset = (chassisIsBodyI ? contact.rj : contact.ri)?.clone?.()
      || new CANNON.Vec3();

    const chassisPointVelocity = pointVelocity(chassisBody, chassisOffset);
    const otherPointVelocity = pointVelocity(otherBody, otherOffset);
    const relativeVelocity = chassisPointVelocity.vsub(otherPointVelocity);
    const normal = contact.ni.clone();
    const normalLength = normal.length();
    if (normalLength < 1e-6) return;
    normal.scale(1 / normalLength, normal);

    const impactSpeed = Math.abs(relativeVelocity.dot(normal));
    if (!Number.isFinite(impactSpeed) || impactSpeed < 3.2) return;

    const now = performance.now();
    const chassisContactPoint = chassisBody.position.vadd(
      chassisOffset,
      new CANNON.Vec3()
    );
    const hit = {
      speed: Math.min(impactSpeed, 18),
      point: { x: chassisContactPoint.x, y: chassisContactPoint.y, z: chassisContactPoint.z },
      normal: { x: normal.x, y: normal.y, z: normal.z },
      velocity: {
        x: chassisBody.velocity.x,
        y: chassisBody.velocity.y,
        z: chassisBody.velocity.z
      },
      time: now
    };

    // Cannon can report several contact equations for one crash. Keep the
    // strongest one in a short window instead of damaging multiple parts
    // repeatedly from the same impact.
    if (now - lastImpactAt < 150) {
      const last = pending[pending.length - 1];
      if (last && hit.speed > last.speed) pending[pending.length - 1] = hit;
      return;
    }

    lastImpactAt = now;
    pending.push(hit);
    if (pending.length > 6) pending.shift();
  }

  chassisBody.addEventListener("collide", onCollide);

  return {
    drain() {
      return pending.splice(0, pending.length);
    },
    clear() {
      pending.length = 0;
    }
  };
}
