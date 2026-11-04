// Lightweight pooled tire-dust particles. Emission is driven by measured
// sideways velocity at the tire contact patch, with Cannon's skid flag as
// an additional signal for stronger slides.
export function createDustSystem({ THREE, CANNON, scene, chassisBody, vehicle, renderer }) {
  const MAX_PARTICLES = 160;
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const sizes = new Float32Array(MAX_PARTICLES);
  const opacities = new Float32Array(MAX_PARTICLES);
  const colors = new Float32Array(MAX_PARTICLES * 3);

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  const sizeAttribute = new THREE.BufferAttribute(sizes, 1);
  const opacityAttribute = new THREE.BufferAttribute(opacities, 1);
  const colorAttribute = new THREE.BufferAttribute(colors, 3);
  if (THREE.DynamicDrawUsage !== undefined) {
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    sizeAttribute.setUsage(THREE.DynamicDrawUsage);
    opacityAttribute.setUsage(THREE.DynamicDrawUsage);
    colorAttribute.setUsage(THREE.DynamicDrawUsage);
  }
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("aSize", sizeAttribute);
  geometry.setAttribute("aOpacity", opacityAttribute);
  geometry.setAttribute("aTint", colorAttribute);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: renderer.getPixelRatio() }
    },
    vertexShader: `
      attribute float aSize;
      attribute float aOpacity;
      attribute vec3 aTint;
      uniform float uPixelRatio;
      varying float vOpacity;
      varying vec3 vTint;

      void main() {
        vOpacity = aOpacity;
        vTint = aTint;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = aSize * uPixelRatio *
          (170.0 / max(1.0, -viewPosition.z));
      }
    `,
    fragmentShader: `
      varying float vOpacity;
      varying vec3 vTint;

      void main() {
        float radius = length(gl_PointCoord - vec2(0.5));
        float softEdge = 1.0 - smoothstep(0.18, 0.5, radius);
        float softCenter = 1.0 - smoothstep(0.0, 0.34, radius);
        float alpha = vOpacity * softEdge * (0.68 + 0.32 * softCenter);
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(vTint, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: false
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 3;
  scene.add(points);

  const particles = Array.from({ length: MAX_PARTICLES }, () => ({
    x: 0, y: -1000, z: 0,
    vx: 0, vy: 0, vz: 0,
    age: 0, lifespan: 0,
    startSize: 0, endSize: 0,
    baseOpacity: 0
  }));
  const emissionRemainders = [0, 0, 0, 0];
  const localRight = new CANNON.Vec3(1, 0, 0);
  const localForward = new CANNON.Vec3(0, 0, 1);
  const worldRight = new CANNON.Vec3();
  const worldForward = new CANNON.Vec3();
  const contactVelocity = new CANNON.Vec3();
  let nextParticle = 0;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const randomRange = (min, max) => min + Math.random() * (max - min);
  const smoothStep = (edge0, edge1, value) => {
    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  function emitParticle(wheel, intensity, lateralSpeed) {
    const hit = wheel.raycastResult.hitPointWorld;
    const particle = particles[nextParticle];
    nextParticle = (nextParticle + 1) % MAX_PARTICLES;

    const speed = Math.hypot(chassisBody.velocity.x, chassisBody.velocity.z);
    const travelX = speed > 0.35
      ? chassisBody.velocity.x / speed
      : worldForward.x;
    const travelZ = speed > 0.35
      ? chassisBody.velocity.z / speed
      : worldForward.z;
    const behindX = -travelX;
    const behindZ = -travelZ;
    const lateralSign = Math.sign(lateralSpeed);

    particle.x = hit.x + randomRange(-0.035, 0.035);
    particle.y = hit.y + 0.035;
    particle.z = hit.z + randomRange(-0.035, 0.035);

    // The cloud inherits a little vehicle motion, then is thrown backward,
    // outward and upward from the tire contact patch.
    const sideKick = lateralSign * (0.10 + intensity * 0.22);
    particle.vx =
      chassisBody.velocity.x * 0.12 +
      behindX * (0.20 + intensity * 0.48) +
      worldRight.x * sideKick +
      randomRange(-0.28, 0.28);
    particle.vz =
      chassisBody.velocity.z * 0.12 +
      behindZ * (0.20 + intensity * 0.48) +
      worldRight.z * sideKick +
      randomRange(-0.28, 0.28);
    particle.vy = randomRange(0.34, 0.62) + intensity * 0.28;

    particle.age = 0;
    particle.lifespan = randomRange(0.95, 1.45);
    particle.startSize = randomRange(0.22, 0.32);
    particle.endSize = randomRange(0.72, 1.12);
    particle.baseOpacity = randomRange(0.30, 0.42) * (0.82 + intensity * 0.28);

    const tint = randomRange(0.88, 1.12);
    const index = nextParticle === 0 ? MAX_PARTICLES - 1 : nextParticle - 1;
    colors[index * 3] = 0.43 * tint;
    colors[index * 3 + 1] = 0.34 * tint;
    colors[index * 3 + 2] = 0.24 * tint;
  }

  function update(delta, enabled = true) {
    const step = clamp(delta, 0, 0.05);
    chassisBody.quaternion.vmult(localRight, worldRight);
    chassisBody.quaternion.vmult(localForward, worldForward);

    // Flatten the chassis axes onto the track so suspension pitch/roll does
    // not incorrectly count vertical motion as sideways tire slip.
    worldRight.y = 0;
    worldForward.y = 0;
    const rightLength = Math.hypot(worldRight.x, worldRight.z) || 1;
    const forwardLength = Math.hypot(worldForward.x, worldForward.z) || 1;
    worldRight.x /= rightLength;
    worldRight.z /= rightLength;
    worldForward.x /= forwardLength;
    worldForward.z /= forwardLength;

    if (enabled && step > 0) {
      for (let i = 0; i < vehicle.wheelInfos.length; i++) {
        const wheel = vehicle.wheelInfos[i];
        if (!wheel.isInContact || !wheel.raycastResult?.hitPointWorld) {
          emissionRemainders[i] = Math.max(0, emissionRemainders[i] - step * 3);
          continue;
        }

        chassisBody.getVelocityAtWorldPoint(
          wheel.raycastResult.hitPointWorld,
          contactVelocity
        );

        // Compare velocity to the direction each tire is pointing. This is
        // especially important for the steered front wheels: cornering alone
        // should not create dust unless the tread is actually slipping.
        const steering = wheel.isFrontWheel ? wheel.steering || 0 : 0;
        const cosine = Math.cos(steering);
        const sine = Math.sin(steering);
        const tireForwardX = worldForward.x * cosine + worldRight.x * sine;
        const tireForwardZ = worldForward.z * cosine + worldRight.z * sine;
        const tireRightX = worldRight.x * cosine - worldForward.x * sine;
        const tireRightZ = worldRight.z * cosine - worldForward.z * sine;
        const tireForwardSpeed =
          contactVelocity.x * tireForwardX + contactVelocity.z * tireForwardZ;
        const lateralSpeed =
          contactVelocity.x * tireRightX + contactVelocity.z * tireRightZ;
        const contactSpeed = Math.hypot(tireForwardSpeed, lateralSpeed);
        const speedGate = clamp((contactSpeed - 1.35) / 3.8, 0, 1);
        const measuredSlip = clamp(
          (Math.abs(lateralSpeed) - 0.16) / 0.90,
          0,
          1
        ) * speedGate;
        const skidSeverity = clamp(1 - (wheel.skidInfo ?? 1), 0, 1);
        const flaggedSlip = wheel.sliding ? 0.42 + skidSeverity * 0.58 : 0;
        const slipAmount = Math.max(measuredSlip, flaggedSlip * speedGate);

        // Emit at a lower threshold than Cannon's binary sliding flag so a
        // small, visible controlled slide still throws up a light dust trail.
        if (slipAmount < 0.055 || speedGate <= 0) {
          emissionRemainders[i] = Math.max(0, emissionRemainders[i] - step * 3);
          continue;
        }

        const intensity = clamp(
          0.18 + slipAmount * 0.88 + Math.abs(lateralSpeed) * 0.12,
          0.16,
          1
        );
        const particlesPerSecond = 12 + intensity * 28;
        emissionRemainders[i] += step * particlesPerSecond;

        while (emissionRemainders[i] >= 1) {
          emitParticle(wheel, intensity, lateralSpeed);
          emissionRemainders[i] -= 1;
        }
      }
    } else {
      emissionRemainders.fill(0);
    }

    const drag = Math.exp(-0.92 * step);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const particle = particles[i];
      const offset = i * 3;
      if (particle.lifespan <= 0) {
        positions[offset + 1] = -1000;
        opacities[i] = 0;
        continue;
      }

      particle.age += step;
      if (particle.age >= particle.lifespan) {
        particle.lifespan = 0;
        positions[offset + 1] = -1000;
        opacities[i] = 0;
        continue;
      }

      particle.vx *= drag;
      particle.vz *= drag;
      particle.vy = particle.vy * Math.exp(-0.18 * step) - 0.10 * step;
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;
      particle.z += particle.vz * step;

      const lifeProgress = particle.age / particle.lifespan;
      const expansion = smoothStep(0, 1, lifeProgress);
      const fadeIn = smoothStep(0, 0.13, lifeProgress);
      const fadeOut = Math.pow(1 - lifeProgress, 1.65);
      positions[offset] = particle.x;
      positions[offset + 1] = particle.y;
      positions[offset + 2] = particle.z;
      sizes[i] = particle.startSize +
        (particle.endSize - particle.startSize) * expansion;
      opacities[i] = particle.baseOpacity * fadeIn * fadeOut;
    }

    positionAttribute.needsUpdate = true;
    sizeAttribute.needsUpdate = true;
    opacityAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
    material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  }

  return {
    update,
    dispose() {
      scene.remove(points);
      geometry.dispose();
      material.dispose();
    }
  };
}
