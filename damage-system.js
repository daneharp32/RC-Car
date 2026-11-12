// Collect only meaningful chassis impacts. Read the Cannon contact equation
// defensively: some collision events can arrive without complete contact data.
export function createImpactDamageSystem({ chassisBody }) {
  const pending = [];
  let lastImpactAt = -Infinity;

  function readVector(vector) {
    return {
      x: Number.isFinite(vector?.x) ? vector.x : 0,
      y: Number.isFinite(vector?.y) ? vector.y : 0,
      z: Number.isFinite(vector?.z) ? vector.z : 0
    };
  }

  function pointVelocity(body, offset) {
    const linear = readVector(body?.velocity);
    const angular = readVector(body?.angularVelocity);
    return {
      x: linear.x + angular.y * offset.z - angular.z * offset.y,
      y: linear.y + angular.z * offset.x - angular.x * offset.z,
      z: linear.z + angular.x * offset.y - angular.y * offset.x
    };
  }

  function onCollide(event) {
    try {
      const contact = event?.contact;
      if (!contact || (contact.bi !== chassisBody && contact.bj !== chassisBody)) return;

      const chassisIsBodyI = contact.bi === chassisBody;
      const otherBody = event.body && event.body !== chassisBody
        ? event.body
        : (chassisIsBodyI ? contact.bj : contact.bi);
      if (!otherBody || otherBody === chassisBody || otherBody.userData?.rcCarDebris) return;

      const normalSource = contact.ni;
      if (
        !normalSource ||
        !Number.isFinite(normalSource.x) ||
        !Number.isFinite(normalSource.y) ||
        !Number.isFinite(normalSource.z)
      ) return;

      // Contact offsets and body positions are copied to plain numeric values.
      // This avoids depending on mutable Vec3 methods or optional return values.
      const chassisOffset = readVector(chassisIsBodyI ? contact.ri : contact.rj);
      const otherOffset = readVector(chassisIsBodyI ? contact.rj : contact.ri);
      const normalLength = Math.hypot(normalSource.x, normalSource.y, normalSource.z);
      if (!Number.isFinite(normalLength) || normalLength < 1e-6) return;

      const normal = {
        x: normalSource.x / normalLength,
        y: normalSource.y / normalLength,
        z: normalSource.z / normalLength
      };

      const chassisPointVelocity = pointVelocity(chassisBody, chassisOffset);
      const otherPointVelocity = pointVelocity(otherBody, otherOffset);
      const relativeVelocity = {
        x: chassisPointVelocity.x - otherPointVelocity.x,
        y: chassisPointVelocity.y - otherPointVelocity.y,
        z: chassisPointVelocity.z - otherPointVelocity.z
      };

      const impactSpeed = Math.abs(
        relativeVelocity.x * normal.x +
        relativeVelocity.y * normal.y +
        relativeVelocity.z * normal.z
      );
      if (!Number.isFinite(impactSpeed) || impactSpeed < 3.2) return;

      const chassisPosition = readVector(chassisBody.position);
      const chassisContactPoint = {
        x: chassisPosition.x + chassisOffset.x,
        y: chassisPosition.y + chassisOffset.y,
        z: chassisPosition.z + chassisOffset.z
      };
      const chassisVelocity = readVector(chassisBody.velocity);
      const hit = {
        speed: Math.min(impactSpeed, 18),
        point: chassisContactPoint,
        normal,
        velocity: chassisVelocity,
        time: performance.now()
      };

      // Cannon can report several contact equations for one crash. Keep the
      // strongest one in a short window instead of damaging multiple parts
      // repeatedly from the same impact.
      if (hit.time - lastImpactAt < 150) {
        const last = pending[pending.length - 1];
        if (last && hit.speed > last.speed) pending[pending.length - 1] = hit;
        return;
      }

      lastImpactAt = hit.time;
      pending.push(hit);
      if (pending.length > 6) pending.shift();
    } catch (error) {
      // A malformed collision event must never interrupt the render/physics loop.
      console.warn("Ignored an incomplete RC car collision event:", error);
    }
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
