// Pooled, camera-facing dust plumes. Each puff is a soft elongated quad,
// not a round point sprite; frequent overlapping puffs blend into a continuous
// cloud trailing from the tires while keeping draw calls low.
export function createDustSystem({ THREE, CANNON, scene, chassisBody, vehicle, renderer }) {
  const MAX_PARTICLES = 640;
  const VERTICES_PER_PARTICLE = 4;
  const positions = new Float32Array(MAX_PARTICLES * VERTICES_PER_PARTICLE * 3);
  const sizes = new Float32Array(MAX_PARTICLES * VERTICES_PER_PARTICLE * 2);
  const opacities = new Float32Array(MAX_PARTICLES * VERTICES_PER_PARTICLE);
  const colors = new Float32Array(MAX_PARTICLES * VERTICES_PER_PARTICLE * 3);
  const driftDirections = new Float32Array(MAX_PARTICLES * VERTICES_PER_PARTICLE * 3);
  const corners = new Float32Array([
    -1, -1,
     1, -1,
     1,  1,
    -1,  1
  ]);
  const indices = new Uint16Array(MAX_PARTICLES * 6);

  for (let i = 0; i < MAX_PARTICLES; i++) {
    const vertex = i * VERTICES_PER_PARTICLE;
    const index = i * 6;
    indices[index] = vertex;
    indices[index + 1] = vertex + 1;
    indices[index + 2] = vertex + 2;
    indices[index + 3] = vertex;
    indices[index + 4] = vertex + 2;
    indices[index + 5] = vertex + 3;
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  const sizeAttribute = new THREE.BufferAttribute(sizes, 2);
  const opacityAttribute = new THREE.BufferAttribute(opacities, 1);
  const colorAttribute = new THREE.BufferAttribute(colors, 3);
  const driftAttribute = new THREE.BufferAttribute(driftDirections, 3);
  const cornerAttribute = new THREE.BufferAttribute(corners, 2);
  if (THREE.DynamicDrawUsage !== undefined) {
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    sizeAttribute.setUsage(THREE.DynamicDrawUsage);
    opacityAttribute.setUsage(THREE.DynamicDrawUsage);
    colorAttribute.setUsage(THREE.DynamicDrawUsage);
    driftAttribute.setUsage(THREE.DynamicDrawUsage);
  }
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("aSize", sizeAttribute);
  geometry.setAttribute("aOpacity", opacityAttribute);
  geometry.setAttribute("aTint", colorAttribute);
  geometry.setAttribute("aDrift", driftAttribute);
  geometry.setAttribute("aCorner", cornerAttribute);
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader: [
      "attribute vec2 aSize;",
      "attribute float aOpacity;",
      "attribute vec3 aTint;",
      "attribute vec3 aDrift;",
      "attribute vec2 aCorner;",
      "varying vec2 vUv;",
      "varying float vOpacity;",
      "varying vec3 vTint;",
      "void main() {",
      "  vUv = aCorner;",
      "  vOpacity = aOpacity;",
      "  vTint = aTint;",
      "  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);",
      "  vec3 viewDrift = mat3(viewMatrix) * aDrift;",
      "  vec2 axis = viewDrift.xy;",
      "  float axisLength = length(axis);",
      "  axis = axisLength > 0.001 ? axis / axisLength : vec2(1.0, 0.0);",
      "  vec2 side = vec2(-axis.y, axis.x);",
      "  viewPosition.xy += axis * (aCorner.x * aSize.x * 0.5);",
      "  viewPosition.xy += side * (aCorner.y * aSize.y * 0.5);",
      "  gl_Position = projectionMatrix * viewPosition;",
      "}"
    ].join("\n"),
    fragmentShader: [
      "varying vec2 vUv;",
      "varying float vOpacity;",
      "varying vec3 vTint;",
      "void main() {",
      "  float turbulence = sin(vUv.x * 8.0 + sin(vUv.y * 6.0)) *",
      "    cos(vUv.y * 9.0 - vUv.x * 3.0);",
      "  float radius = length(vec2(vUv.x * 0.82, vUv.y * 1.08));",
      "  float edge = 0.66 + turbulence * 0.055;",
      "  float softCloud = 1.0 - smoothstep(edge, 1.08 + turbulence * 0.055, radius);",
      "  float innerVariation = 0.92 + 0.08 * (1.0 - smoothstep(0.0, 0.95, radius));",
      "  float alpha = min(vOpacity * softCloud * innerVariation, 0.88);",
      "  if (alpha < 0.003) discard;",
      "  gl_FragColor = vec4(vTint, alpha);",
      "}"
    ].join("\n"),
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    toneMapped: false
  });

  const plumes = new THREE.Mesh(geometry, material);
  plumes.frustumCulled = false;
  plumes.renderOrder = 3;
  scene.add(plumes);

  const particles = Array.from({ length: MAX_PARTICLES }, () => ({
    x: 0, y: -1000, z: 0,
    vx: 0, vy: 0, vz: 0,
    age: 0, lifespan: 0,
    startWidth: 0, endWidth: 0,
    startHeight: 0, endHeight: 0,
    baseOpacity: 0,
    tint: 1
  }));
  const emissionRemainders = [0, 0, 0, 0];
  // Smooth the slip signal so emissions remain steady through small frame-to-frame
  // changes in the tire contact calculation instead of flickering on and off.
  const slipMemory = [0, 0, 0, 0];
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
    const particleIndex = nextParticle;
    const particle = particles[particleIndex];
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
    const sideKick = lateralSign * (0.12 + intensity * 0.26);

    particle.x = hit.x + randomRange(-0.07, 0.07);
    particle.y = hit.y + 0.20;
    particle.z = hit.z + randomRange(-0.07, 0.07);
    particle.vx =
      chassisBody.velocity.x * 0.10 +
      behindX * (0.28 + intensity * 0.62) +
      worldRight.x * sideKick +
      randomRange(-0.20, 0.20);
    particle.vz =
      chassisBody.velocity.z * 0.10 +
      behindZ * (0.28 + intensity * 0.62) +
      worldRight.z * sideKick +
      randomRange(-0.20, 0.20);
    particle.vy = randomRange(0.48, 0.78) + intensity * 0.34;

    particle.age = 0;
    particle.lifespan = randomRange(1.35, 1.90);
    particle.startWidth = randomRange(0.58, 0.88);
    particle.endWidth = randomRange(1.75, 2.55);
    particle.startHeight = randomRange(0.36, 0.54);
    particle.endHeight = randomRange(0.98, 1.48);
    // A denser initial cloud makes the tire plume clearly visible, while the
    // existing lifetime curve still softens and fades it away naturally.
    particle.baseOpacity = randomRange(0.52, 0.66) * (0.92 + intensity * 0.18);
    particle.tint = randomRange(0.94, 1.08);

    const firstVertex = particleIndex * VERTICES_PER_PARTICLE;
    for (let vertex = 0; vertex < VERTICES_PER_PARTICLE; vertex++) {
      const v = firstVertex + vertex;
      // Warm, sunlit dirt rather than dark brown smoke.
      colors[v * 3] = 0.70 * particle.tint;
      colors[v * 3 + 1] = 0.61 * particle.tint;
      colors[v * 3 + 2] = 0.47 * particle.tint;
    }
  }

  function update(delta, enabled = true) {
    const step = clamp(delta, 0, 0.05);
    chassisBody.quaternion.vmult(localRight, worldRight);
    chassisBody.quaternion.vmult(localForward, worldForward);

    // Flatten chassis axes to the track plane so body roll does not turn
    // suspension movement into fake lateral tire slip.
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
          slipMemory[i] *= Math.exp(-4.5 * step);
          continue;
        }

        chassisBody.getVelocityAtWorldPoint(
          wheel.raycastResult.hitPointWorld,
          contactVelocity
        );

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
        const speedGate = clamp((contactSpeed - 0.85) / 3.0, 0, 1);
        const measuredSlip = clamp(
          (Math.abs(lateralSpeed) - 0.10) / 0.70,
          0,
          1
        ) * speedGate;
        const skidSeverity = clamp(1 - (wheel.skidInfo ?? 1), 0, 1);
        const flaggedSlip = wheel.sliding ? 0.58 + skidSeverity * 0.42 : 0;
        const rawSlip = Math.max(measuredSlip, flaggedSlip * speedGate);

        // Build the dust signal quickly when a tire starts sliding, then let it
        // fall more slowly when grip returns. This keeps a sustained slide
        // continuously supplied with fresh dust instead of emitting in bursts.
        const targetSlip = clamp((rawSlip - 0.025) / 0.62, 0, 1);
        const slipResponse = targetSlip > slipMemory[i] ? 16 : 3.8;
        slipMemory[i] +=
          (targetSlip - slipMemory[i]) * (1 - Math.exp(-slipResponse * step));

        if (slipMemory[i] < 0.035 || speedGate <= 0) {
          emissionRemainders[i] = Math.max(0, emissionRemainders[i] - step * 3);
          continue;
        }

        const intensity = clamp(
          0.22 + slipMemory[i] * 0.92 + Math.abs(lateralSpeed) * 0.11,
          0.18,
          1
        );
        // Repeated emission continues for every contacting tire that is sliding.
        const particlesPerSecond = 34 + intensity * 56;
        emissionRemainders[i] += step * particlesPerSecond;

        while (emissionRemainders[i] >= 1) {
          emitParticle(wheel, intensity, lateralSpeed);
          emissionRemainders[i] -= 1;
        }
      }
    } else {
      emissionRemainders.fill(0);
      for (let i = 0; i < slipMemory.length; i++) {
        slipMemory[i] *= Math.exp(-4.5 * step);
      }
    }

    const drag = Math.exp(-0.72 * step);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const particle = particles[i];
      if (particle.lifespan <= 0) continue;

      particle.age += step;
      if (particle.age >= particle.lifespan) {
        particle.lifespan = 0;
        continue;
      }

      particle.vx *= drag;
      particle.vz *= drag;
      particle.vy = particle.vy * Math.exp(-0.16 * step) - 0.10 * step;
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;
      particle.z += particle.vz * step;

      const lifeProgress = particle.age / particle.lifespan;
      const expansion = smoothStep(0, 1, lifeProgress);
      const fadeIn = smoothStep(0, 0.10, lifeProgress);
      const fadeOut = Math.pow(1 - lifeProgress, 1.35);
      const width = particle.startWidth +
        (particle.endWidth - particle.startWidth) * expansion;
      const height = particle.startHeight +
        (particle.endHeight - particle.startHeight) * expansion;
      const opacity = particle.baseOpacity * fadeIn * fadeOut;
      const driftX = particle.vx;
      const driftY = particle.vy * 0.18;
      const driftZ = particle.vz;
      const firstVertex = i * VERTICES_PER_PARTICLE;

      for (let vertex = 0; vertex < VERTICES_PER_PARTICLE; vertex++) {
        const v = firstVertex + vertex;
        const p = v * 3;
        const s = v * 2;
        positions[p] = particle.x;
        positions[p + 1] = particle.y;
        positions[p + 2] = particle.z;
        sizes[s] = width;
        sizes[s + 1] = height;
        opacities[v] = opacity;
        driftDirections[p] = driftX;
        driftDirections[p + 1] = driftY;
        driftDirections[p + 2] = driftZ;
      }
    }

    // Hide expired quads below the track and zero their alpha.
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (particles[i].lifespan > 0) continue;
      const firstVertex = i * VERTICES_PER_PARTICLE;
      for (let vertex = 0; vertex < VERTICES_PER_PARTICLE; vertex++) {
        const v = firstVertex + vertex;
        positions[v * 3 + 1] = -1000;
        opacities[v] = 0;
      }
    }

    positionAttribute.needsUpdate = true;
    sizeAttribute.needsUpdate = true;
    opacityAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
    driftAttribute.needsUpdate = true;
  }

  return {
    update,
    dispose() {
      scene.remove(plumes);
      geometry.dispose();
      material.dispose();
    }
  };
}
