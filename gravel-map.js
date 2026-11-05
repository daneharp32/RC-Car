// Open, borderless gravel basin with a detailed heightfield, jumps, parked full-size vehicles, and a perimeter tree line.
function makeSeededRandom(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function smoothValueNoise(x, z, seed = 1) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx0 = x - ix;
  const fz0 = z - iz;
  const fade = (v) => v * v * (3 - 2 * v);
  const fx = fade(fx0);
  const fz = fade(fz0);
  const hash = (a, b) => {
    const value = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453;
    return (value - Math.floor(value)) * 2 - 1;
  };
  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return top + (bottom - top) * fz;
}

function makeGravelTexture(THREE) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create the gravel texture canvas.");
  const random = makeSeededRandom(77821);
  context.fillStyle = "#77736a";
  context.fillRect(0, 0, 512, 512);

  const gravelColors = ["#a39d8f", "#5a5954", "#c0b8a8", "#494b49", "#8b877d", "#6c6258", "#d0c7b7"];
  for (let i = 0; i < 13500; i++) {
    const radius = 0.45 + random() * 2.7;
    context.globalAlpha = 0.15 + random() * 0.43;
    context.fillStyle = gravelColors[Math.floor(random() * gravelColors.length)];
    context.beginPath();
    context.ellipse(
      random() * 512,
      random() * 512,
      radius * (0.85 + random() * 1.7),
      radius * (0.45 + random() * 0.9),
      random() * Math.PI,
      0,
      Math.PI * 2
    );
    context.fill();
  }
  context.globalAlpha = 1;

  // Irregular pale stones and fine darker speckling give the surface a loose-gravel read.
  for (let i = 0; i < 420; i++) {
    const x = random() * 512;
    const y = random() * 512;
    const r = 1.2 + random() * 3.6;
    context.globalAlpha = 0.13 + random() * 0.2;
    context.fillStyle = random() > 0.5 ? "#d1c8b8" : "#393b3a";
    context.beginPath();
    context.ellipse(x, y, r * 1.4, r * 0.72, random() * Math.PI, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(34, 34);
  texture.anisotropy = 8;
  return texture;
}

export function createGravelBasinSystem({ THREE, scene }) {
  const mapGroup = new THREE.Group();
  mapGroup.name = "gravel-basin-open-area";
  mapGroup.userData.mapId = "gravel-basin";
  mapGroup.visible = false;
  scene.add(mapGroup);

  const size = 216;
  const half = size / 2;
  const segments = 108;
  const elementSize = size / segments;
  const random = makeSeededRandom(90617);

  // A spread of broad, driveable jump faces. Their footprints are long enough
  // to give the short-course truck a progressive approach and landing.
  const jumpFeatures = [
    { x: -27, z: -24, yaw: -0.38, width: 19, length: 24, height: 1.18, plateau: 0.28 },
    { x: 25, z: -38, yaw: 0.62, width: 17, length: 20, height: 0.92, plateau: 0.20 },
    { x: 40, z: 18, yaw: -0.50, width: 15, length: 18, height: 0.82, plateau: 0.16 },
    { x: -34, z: 48, yaw: 0.32, width: 16, length: 19, height: 0.88, plateau: 0.18 },
    { x: -68, z: -8, yaw: -0.55, width: 22, length: 27, height: 1.25, plateau: 0.24 },
    { x: 3, z: 18, yaw: 0.24, width: 22, length: 27, height: 1.35, plateau: 0.30 },
    { x: 54, z: 49, yaw: -0.58, width: 21, length: 26, height: 1.18, plateau: 0.24 },
    { x: -63, z: 70, yaw: 0.30, width: 20, length: 24, height: 1.08, plateau: 0.20 },
    { x: 7, z: -83, yaw: 0.64, width: 22, length: 27, height: 1.32, plateau: 0.27 },
    { x: -61, z: -68, yaw: -0.22, width: 21, length: 25, height: 1.12, plateau: 0.22 }
  ];

  // Large rolling mounds sit between the shaped jumps so the whole basin
  // feels irregular rather than like a flat field with isolated ramps.
  const broadHills = [
    [-54, -5, 0.52, 16], [54, -17, 0.62, 19], [8, 53, 0.42, 15],
    [-48, 54, 0.48, 18], [43, 57, 0.36, 14], [2, -66, 0.30, 17],
    [-72, 31, 0.92, 14], [4, -2, 1.02, 16], [71, 37, 0.82, 14],
    [-59, 82, 0.90, 14], [24, -72, 0.72, 13], [-9, -53, 0.84, 15],
    [-7, 78, 0.58, 13], [42, -5, 0.64, 12]
  ];

  function terrainHeight(x, z) {
    let height = 0.13;
    height += smoothValueNoise(x / 29, z / 29, 11) * 0.28;
    height += smoothValueNoise(x / 13, z / 13, 29) * 0.18;
    height += smoothValueNoise(x / 5.6, z / 5.6, 47) * 0.075;
    height += smoothValueNoise(x / 2.3, z / 2.3, 71) * 0.025;
    height += Math.sin(x * 0.082 + Math.sin(z * 0.047)) * 0.055;
    height += Math.sin(z * 0.071 - x * 0.039) * 0.045;

    for (const hill of broadHills) {
      const dx = x - hill[0];
      const dz = z - hill[1];
      const distanceSq = dx * dx + dz * dz;
      height += hill[2] * Math.exp(-distanceSq / (2 * hill[3] * hill[3]));
    }

    for (const jump of jumpFeatures) {
      const dx = x - jump.x;
      const dz = z - jump.z;
      const c = Math.cos(jump.yaw);
      const s = Math.sin(jump.yaw);
      const localX = dx * c + dz * s;
      const localZ = -dx * s + dz * c;
      const across = Math.abs(localX) / (jump.width * 0.5);
      const along = (localZ + jump.length * 0.5) / jump.length;
      if (across >= 1 || along <= 0 || along >= 1) continue;

      const edge = Math.pow(Math.max(0, 1 - across * across), 1.25);
      const rampIn = Math.min(1, along / 0.30);
      const rampOut = Math.min(1, (1 - along) / 0.30);
      const smoothIn = rampIn * rampIn * (3 - 2 * rampIn);
      const smoothOut = rampOut * rampOut * (3 - 2 * rampOut);
      const crown = Math.min(smoothIn, smoothOut);
      const crownShape = jump.plateau > 0
        ? Math.min(1, crown * (1 + jump.plateau))
        : crown;
      height += jump.height * edge * crownShape;
    }

    return Math.max(0.015, height);
  }

  const heights = Array.from({ length: segments + 1 }, (_, xIndex) => {
    const x = -half + xIndex * elementSize;
    return Array.from({ length: segments + 1 }, (_, zIndex) => {
      const z = half - zIndex * elementSize;
      return terrainHeight(x, z);
    });
  });

  function sampleHeight(x, z) {
    const gx = THREE.MathUtils.clamp((x + half) / elementSize, 0, segments);
    const gz = THREE.MathUtils.clamp((half - z) / elementSize, 0, segments);
    const x0 = Math.min(segments - 1, Math.floor(gx));
    const z0 = Math.min(segments - 1, Math.floor(gz));
    const tx = gx - x0;
    const tz = gz - z0;
    const a = heights[x0][z0] * (1 - tx) + heights[x0][z0 + 1] * tx;
    const b = heights[x0 + 1][z0] * (1 - tx) + heights[x0 + 1][z0 + 1] * tx;
    return a * (1 - tz) + b * tz;
  }

  const positions = [];
  const uvs = [];
  const indices = [];
  for (let xIndex = 0; xIndex <= segments; xIndex++) {
    const x = -half + xIndex * elementSize;
    for (let zIndex = 0; zIndex <= segments; zIndex++) {
      const z = half - zIndex * elementSize;
      positions.push(x, heights[xIndex][zIndex], z);
      uvs.push(xIndex / segments * 34, zIndex / segments * 34);
      if (xIndex < segments && zIndex < segments) {
        const a = xIndex * (segments + 1) + zIndex;
        const b = a + segments + 1;
        const c = a + 1;
        const d = b + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
  }
  const terrainGeometry = new THREE.BufferGeometry();
  terrainGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  terrainGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  terrainGeometry.setIndex(indices);
  terrainGeometry.computeVertexNormals();

  const gravelTexture = makeGravelTexture(THREE);
  const terrain = new THREE.Mesh(
    terrainGeometry,
    new THREE.MeshStandardMaterial({
      map: gravelTexture,
      color: 0xd2c8b7,
      roughness: 1,
      metalness: 0
    })
  );
  terrain.name = "uneven-gravel-heightfield";
  terrain.receiveShadow = true;
  terrain.castShadow = false;
  mapGroup.add(terrain);

  // Raised concrete overlook, a long driveable descent, and a broad staircase.
  // The terrain remains gravel underneath; separate static collision boxes
  // provide the deck/ramp/stair surfaces without turning the whole map into a track.
  const concreteMaterial = new THREE.MeshStandardMaterial({
    color: 0x92918c, roughness: 0.92, metalness: 0.015
  });
  const concreteEdgeMaterial = new THREE.MeshStandardMaterial({
    color: 0x686b6c, roughness: 0.88, metalness: 0.035
  });
  const concreteMarkMaterial = new THREE.MeshStandardMaterial({
    color: 0x4b5051, roughness: 0.96, metalness: 0
  });
  const staticBoxes = [];
  const concreteFeature = {
    centerX: 66,
    deckY: 4.9,
    deckZ: -80.5,
    deckWidth: 44,
    deckLength: 35,
    rampX: 66,
    rampStartZ: -63,
    rampEndZ: -13,
    rampWidth: 18,
    rampLength: 50,
    stairX: 80.7,
    stairWidth: 6.8,
    stairCount: 20
  };
  const rampDrop = concreteFeature.deckY - 0.25;
  const rampAngle = Math.asin(rampDrop / concreteFeature.rampLength);
  const rampCenterZ = (concreteFeature.rampStartZ + concreteFeature.rampEndZ) * 0.5;
  const rampTopCenterY = (concreteFeature.deckY + 0.25) * 0.5;
  const rampThickness = 0.52;
  const rampCenterY = rampTopCenterY - rampThickness * 0.5 * Math.cos(rampAngle);

  function addConcreteBox(name, width, height, length, x, y, z, material, rotationX = 0, collidable = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.rotation.x = rotationX;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mapGroup.add(mesh);
    if (collidable) {
      staticBoxes.push({
        x, y, z,
        halfWidth: width * 0.5,
        halfHeight: height * 0.5,
        halfLength: length * 0.5,
        rotationX
      });
    }
    return mesh;
  }

  // Large, flat concrete pad with a visible thick edge and six supporting piers.
  addConcreteBox(
    "elevated-concrete-deck",
    concreteFeature.deckWidth, 0.72, concreteFeature.deckLength,
    concreteFeature.centerX, concreteFeature.deckY - 0.36, concreteFeature.deckZ,
    concreteMaterial
  );
  for (const x of [47.5, 84.5]) {
    for (const z of [-94.0, -67.0]) {
      addConcreteBox("concrete-deck-support-pier", 1.15, 4.54, 1.15,
        x, 2.27, z, concreteEdgeMaterial);
    }
  }
  addConcreteBox("deck-back-retaining-edge", 44, 0.42, 0.55,
    concreteFeature.centerX, concreteFeature.deckY + 0.21, -97.7, concreteEdgeMaterial);
  addConcreteBox("deck-west-safety-edge", 0.48, 0.48, 33,
    44.0, concreteFeature.deckY + 0.24, -80.5, concreteEdgeMaterial);

  // Long concrete ramp: its top plane meets the deck exactly and descends
  // smoothly to the gravel at the foot. Low side curbs follow the same slope.
  addConcreteBox(
    "long-concrete-descent-ramp",
    concreteFeature.rampWidth, rampThickness, concreteFeature.rampLength,
    concreteFeature.rampX, rampCenterY, rampCenterZ,
    concreteMaterial, rampAngle
  );
  for (const side of [-1, 1]) {
    addConcreteBox(
      "concrete-ramp-side-curb",
      0.42, 0.68, concreteFeature.rampLength - 0.4,
      concreteFeature.rampX + side * (concreteFeature.rampWidth * 0.5 + 0.28),
      rampTopCenterY + 0.34, rampCenterZ,
      concreteEdgeMaterial, rampAngle
    );
  }

  // Expansion joints on the deck and narrow transverse grip seams on the ramp.
  for (let i = 1; i < 7; i++) {
    const x = 45.5 + i * 6.0;
    addConcreteBox("deck-expansion-joint", 0.035, 0.012, 33,
      x, concreteFeature.deckY + 0.367, concreteFeature.deckZ,
      concreteMarkMaterial, 0, false);
  }
  for (let i = 1; i < 24; i++) {
    const z = concreteFeature.rampStartZ + i * (concreteFeature.rampLength / 24);
    const progress = (z - concreteFeature.rampStartZ) / concreteFeature.rampLength;
    const y = concreteFeature.deckY - rampDrop * progress + 0.015;
    addConcreteBox("concrete-ramp-grip-seam", concreteFeature.rampWidth - 2.0, 0.024, 0.095,
      concreteFeature.rampX, y, z, concreteMarkMaterial, rampAngle, false);
  }

  // Full-width block steps run beside the ramp from deck height down to grade.
  // Each tier has a matching collision box so the staircase is physically solid.
  const stairBaseY = 0.25;
  const stairRise = rampDrop / concreteFeature.stairCount;
  const stairDepth = concreteFeature.rampLength / concreteFeature.stairCount;
  for (let i = 0; i < concreteFeature.stairCount; i++) {
    const topY = concreteFeature.deckY - (i + 1) * stairRise;
    const blockHeight = Math.max(0.06, topY - stairBaseY);
    const z = concreteFeature.rampStartZ + (i + 0.5) * stairDepth;
    addConcreteBox(
      "broad-concrete-stair-step-" + (i + 1),
      concreteFeature.stairWidth, blockHeight, stairDepth - 0.04,
      concreteFeature.stairX, stairBaseY + blockHeight * 0.5, z,
      i % 4 === 0 ? concreteEdgeMaterial : concreteMaterial
    );
    addConcreteBox(
      "stair-tread-nosing-" + (i + 1),
      concreteFeature.stairWidth - 0.12, 0.025, 0.10,
      concreteFeature.stairX, topY + 0.014, z - (stairDepth - 0.04) * 0.5 + 0.10,
      concreteMarkMaterial, 0, false
    );
  }

  // A small concrete apron at the bottom joins the ramp to the surrounding gravel.
  addConcreteBox("ramp-bottom-apron", 20, 0.32, 5.5,
    concreteFeature.rampX, 0.12, concreteFeature.rampEndZ + 2.7,
    concreteMaterial);

  // A darker loose-gravel skirt blends the terrain into the tree line without a wall or curb.
  const outerGround = new THREE.Mesh(
    new THREE.PlaneGeometry(270, 270),
    new THREE.MeshStandardMaterial({ color: 0x4c4943, roughness: 1, metalness: 0 })
  );
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.y = -0.16;
  outerGround.receiveShadow = true;
  mapGroup.add(outerGround);

  // Scattered low rocks sit directly on the sculpted surface as visual gravel detail.
  const rockCount = 720;
  const rockGeometry = new THREE.DodecahedronGeometry(0.15, 0);
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0x8a857b, roughness: 1, metalness: 0
  });
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockCount);
  const rockDummy = new THREE.Object3D();
  let rockIndex = 0;
  while (rockIndex < rockCount) {
    const x = (random() - 0.5) * 192;
    const z = (random() - 0.5) * 192;
    let closeToJump = false;
    for (const jump of jumpFeatures) {
      const dx = x - jump.x;
      const dz = z - jump.z;
      if (dx * dx + dz * dz < 11 * 11) { closeToJump = true; break; }
    }
    if (closeToJump) continue;
    const scale = 0.25 + random() * 1.05;
    rockDummy.position.set(x, sampleHeight(x, z) + scale * 0.04, z);
    rockDummy.rotation.set(random() * 0.25, random() * Math.PI, random() * 0.25);
    rockDummy.scale.set(scale * (0.8 + random() * 0.8), scale * 0.45, scale * (0.7 + random() * 0.8));
    rockDummy.updateMatrix();
    rocks.setMatrixAt(rockIndex++, rockDummy.matrix);
  }
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  rocks.instanceMatrix.needsUpdate = true;
  rocks.computeBoundingSphere();
  mapGroup.add(rocks);

  const carDefinitions = [
    { x: -82, z: -43, yaw: 0.18, type: "suv", color: 0xb7c0c5, accent: 0x252c31 },
    { x: 82, z: 21, yaw: -0.54, type: "pickup", color: 0x315747, accent: 0x202b27 },
    { x: 13, z: 91, yaw: 1.12, type: "wagon", color: 0xc8c3b8, accent: 0x33383b }
  ];

  const parkedCars = [];
  function addParkedFullSizeCar(definition) {
    const car = new THREE.Group();
    car.name = "full-size-parked-" + definition.type;
    car.position.set(definition.x, sampleHeight(definition.x, definition.z) + 0.025, definition.z);
    car.rotation.y = definition.yaw;
    mapGroup.add(car);

    const paint = new THREE.MeshStandardMaterial({
      color: definition.color, roughness: 0.31, metalness: 0.38
    });
    const darkPaint = new THREE.MeshStandardMaterial({
      color: definition.accent, roughness: 0.48, metalness: 0.22
    });
    const glass = new THREE.MeshStandardMaterial({
      color: 0x15252d, roughness: 0.20, metalness: 0.28,
      transparent: true, opacity: 0.88
    });
    const blackPlastic = new THREE.MeshStandardMaterial({
      color: 0x111619, roughness: 0.78, metalness: 0.08
    });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.98 });
    const alloy = new THREE.MeshStandardMaterial({
      color: 0xaeb7bc, roughness: 0.32, metalness: 0.82
    });
    const headlamp = new THREE.MeshStandardMaterial({
      color: 0xf4ead2, emissive: 0xc7d8e8, emissiveIntensity: 0.18,
      roughness: 0.2, metalness: 0.18
    });
    const tailLamp = new THREE.MeshStandardMaterial({
      color: 0x9e251d, emissive: 0x4f0805, emissiveIntensity: 0.18,
      roughness: 0.26
    });

    function box(width, height, depth, x, y, z, material, rotation = [0, 0, 0]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      car.add(mesh);
      return mesh;
    }

    // Lower body, broad hood, tail section, and raised cabin.
    box(5.25, 1.55, 13.75, 0, 1.72, 0, paint);
    box(5.15, 1.12, 3.55, 0, 2.42, -4.86, paint);
    box(5.10, 1.05, 3.05, 0, 2.35, 5.18, paint);
    const cabinLength = definition.type === "wagon" ? 6.6 : (definition.type === "pickup" ? 4.6 : 6.2);
    const cabinZ = definition.type === "pickup" ? -0.45 : 0.72;
    box(4.78, 2.1, cabinLength, 0, 3.27, cabinZ, paint);
    box(4.9, 0.28, cabinLength + 0.25, 0, 4.35, cabinZ, darkPaint);

    // Deep tinted window panels, separated by thick pillars and roof rails.
    box(4.12, 1.45, 0.16, 0, 3.64, -3.0, glass, [-0.34, 0, 0]);
    box(4.08, 1.35, 0.16, 0, 3.62, cabinZ + cabinLength * 0.5 - 0.04, glass, [0.30, 0, 0]);
    for (const side of [-1, 1]) {
      const x = side * 2.405;
      const windowLength = cabinLength - 0.68;
      const segments = definition.type === "pickup" ? [-0.7, 0.78] : [-1.55, 0.0, 1.55];
      for (const offset of segments) {
        box(0.11, 1.25, definition.type === "pickup" ? 1.30 : 1.34,
          x, 3.62, cabinZ + offset, glass, [0, 0, side * -0.035]);
      }
      box(0.16, 1.62, 0.16, x, 3.40, cabinZ - cabinLength * 0.5 + 0.10, darkPaint, [0, 0, 0.12 * side]);
      box(0.16, 1.62, 0.16, x, 3.40, cabinZ + cabinLength * 0.5 - 0.10, darkPaint, [0, 0, -0.12 * side]);
      box(0.18, 0.18, 0.72, side * 2.68, 2.78, -2.55, darkPaint, [0, 0, side * 0.14]);
      box(0.16, 0.11, 0.58, side * 2.75, 2.92, -2.48, paint);
      // Door crease, handle and sill trim.
      for (const doorZ of (definition.type === "pickup" ? [-1.9, 0.5] : [-1.6, 0.7, 2.3])) {
        box(0.055, 0.95, 0.035, side * 2.635, 1.92, doorZ, darkPaint);
        box(0.045, 0.12, 0.36, side * 2.66, 2.47, doorZ + 0.22, alloy);
      }
      box(0.18, 0.36, 8.7, side * 2.56, 1.12, 0.15, blackPlastic);
    }

    // Pickup gets a visibly separate bed with a dark liner and rails.
    if (definition.type === "pickup") {
      box(4.35, 0.18, 4.45, 0, 2.58, 4.55, blackPlastic);
      for (const side of [-1, 1]) {
        box(0.28, 0.62, 4.5, side * 2.36, 2.85, 4.55, paint);
      }
      box(4.55, 0.65, 0.24, 0, 2.85, 6.78, paint);
      for (let i = 0; i < 7; i++) {
        box(0.045, 0.035, 3.9, -1.8 + i * 0.6, 2.69, 4.52, darkPaint);
      }
    }

    // Four full-size all-terrain tyres with alloy rims, hubs, and lug detail.
    const wheelZ = definition.type === "pickup" ? [-4.75, 4.75] : [-4.65, 4.65];
    const wheelGeometry = new THREE.CylinderGeometry(1.12, 1.12, 0.66, 24, 1);
    const rimGeometry = new THREE.CylinderGeometry(0.70, 0.70, 0.69, 20, 1);
    const hubGeometry = new THREE.CylinderGeometry(0.30, 0.30, 0.72, 16, 1);
    for (const x of [-2.63, 2.63]) {
      for (const z of wheelZ) {
        const wheel = new THREE.Mesh(wheelGeometry, rubber);
        wheel.position.set(x, 1.15, z);
        wheel.rotation.z = Math.PI / 2;
        wheel.castShadow = true;
        wheel.receiveShadow = true;
        car.add(wheel);

        const rim = new THREE.Mesh(rimGeometry, alloy);
        rim.position.set(x + Math.sign(x) * 0.035, 1.15, z);
        rim.rotation.z = Math.PI / 2;
        car.add(rim);
        const hub = new THREE.Mesh(hubGeometry, darkPaint);
        hub.position.set(x + Math.sign(x) * 0.06, 1.15, z);
        hub.rotation.z = Math.PI / 2;
        car.add(hub);
        for (let lug = 0; lug < 6; lug++) {
          const angle = lug / 6 * Math.PI * 2;
          const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), blackPlastic);
          bolt.position.set(
            x + Math.sign(x) * 0.43,
            1.15 + Math.sin(angle) * 0.44,
            z + Math.cos(angle) * 0.44
          );
          car.add(bolt);
        }
      }
    }

    // Front fascia, grille, mirrors, bumpers and lamps; front of every vehicle points -Z.
    box(2.15, 0.70, 0.14, 0, 2.05, -6.92, blackPlastic);
    for (let i = 0; i < 9; i++) {
      box(0.045, 0.54, 0.035, -0.95 + i * 0.238, 2.05, -7.02, alloy);
    }
    for (const x of [-1.88, 1.88]) {
      box(0.82, 0.48, 0.16, x, 2.42, -6.95, headlamp);
      box(0.30, 0.17, 0.08, x, 1.94, -6.98, headlamp);
      box(0.58, 0.22, 0.12, x, 2.18, 6.96, tailLamp);
    }
    box(5.36, 0.42, 0.55, 0, 1.30, -7.05, blackPlastic);
    box(5.36, 0.42, 0.55, 0, 1.30, 7.02, blackPlastic);
    box(0.12, 0.08, 0.45, -2.82, 3.04, -2.52, blackPlastic);
    box(0.12, 0.08, 0.45, 2.82, 3.04, -2.52, blackPlastic);

    // Small roof rails and recovery details make the parked vehicles read as full-size trail cars.
    for (const side of [-1, 1]) {
      box(0.12, 0.12, 5.6, side * 2.15, 4.54, cabinZ + 0.1, alloy);
      for (const z of [-1.5, 0.2, 1.9]) {
        box(0.11, 0.16, 0.18, side * 2.15, 4.48, cabinZ + z, darkPaint);
      }
    }

    parkedCars.push({
      x: definition.x,
      z: definition.z,
      yaw: definition.yaw,
      halfWidth: 2.85,
      halfHeight: 2.35,
      halfLength: 7.55,
      centerY: car.position.y + 2.30
    });
  }

  for (const definition of carDefinitions) addParkedFullSizeCar(definition);

  // Three irregular rows of tall pines surround the basin naturally, with gaps around parked cars.
  const treeSpots = [];
  const treeSpacing = 9.0;
  const treeEdges = [91, 97, 103];
  for (let row = 0; row < treeEdges.length; row++) {
    const edge = treeEdges[row];
    const offset = row * 3.0;
    for (const side of [0, 1, 2, 3]) {
      for (let along = -edge + offset; along <= edge; along += treeSpacing) {
        const jitter = (random() - 0.5) * 3.3;
        let x = 0;
        let z = 0;
        if (side === 0) { x = along + jitter; z = -edge + (random() - 0.5) * 2.6; }
        if (side === 1) { x = along + jitter; z = edge + (random() - 0.5) * 2.6; }
        if (side === 2) { x = -edge + (random() - 0.5) * 2.6; z = along + jitter; }
        if (side === 3) { x = edge + (random() - 0.5) * 2.6; z = along + jitter; }

        const nearCar = carDefinitions.some((car) => {
          const dx = x - car.x;
          const dz = z - car.z;
          return dx * dx + dz * dz < 17 * 17;
        });
        const nearConcreteStructure =
          x > 39 && x < 94 && z > -104 && z < -8;
        if (!nearCar && !nearConcreteStructure) {
          treeSpots.push({
            x, z,
            yaw: random() * Math.PI * 2,
            scale: 3.1 + random() * 2.3
          });
        }
      }
    }
  }

  const treeGroup = new THREE.Group();
  treeGroup.name = "gravel-basin-perimeter-trees";
  const treeDummy = new THREE.Object3D();
  const treeCount = treeSpots.length;
  const trunkGeometry = new THREE.CylinderGeometry(0.095, 0.18, 1, 7, 1);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x51402e, roughness: 1 });
  const lowerMaterial = new THREE.MeshStandardMaterial({ color: 0x1d3b2b, roughness: 1 });
  const middleMaterial = new THREE.MeshStandardMaterial({ color: 0x28513a, roughness: 1 });
  const upperMaterial = new THREE.MeshStandardMaterial({ color: 0x376247, roughness: 1 });
  const lowerGeometry = new THREE.ConeGeometry(1, 1, 8, 1);
  const middleGeometry = new THREE.ConeGeometry(1, 1, 8, 1);
  const upperGeometry = new THREE.ConeGeometry(1, 1, 8, 1);
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, treeCount);
  const lower = new THREE.InstancedMesh(lowerGeometry, lowerMaterial, treeCount);
  const middle = new THREE.InstancedMesh(middleGeometry, middleMaterial, treeCount);
  const upper = new THREE.InstancedMesh(upperGeometry, upperMaterial, treeCount);

  for (let i = 0; i < treeCount; i++) {
    const tree = treeSpots[i];
    const ground = sampleHeight(tree.x, tree.z);
    const scale = tree.scale;
    treeDummy.position.set(tree.x, ground + 0.72 * scale, tree.z);
    treeDummy.rotation.set(0, tree.yaw, 0);
    treeDummy.scale.set(0.17 * scale, 1.45 * scale, 0.17 * scale);
    treeDummy.updateMatrix();
    trunks.setMatrixAt(i, treeDummy.matrix);

    treeDummy.position.set(tree.x, ground + 1.75 * scale, tree.z);
    treeDummy.rotation.set(0, tree.yaw, 0);
    treeDummy.scale.set(1.45 * scale, 3.2 * scale, 1.45 * scale);
    treeDummy.updateMatrix();
    lower.setMatrixAt(i, treeDummy.matrix);

    treeDummy.position.set(tree.x, ground + 2.9 * scale, tree.z);
    treeDummy.rotation.set(0, tree.yaw + 0.24, 0);
    treeDummy.scale.set(1.12 * scale, 2.85 * scale, 1.12 * scale);
    treeDummy.updateMatrix();
    middle.setMatrixAt(i, treeDummy.matrix);

    treeDummy.position.set(tree.x, ground + 3.9 * scale, tree.z);
    treeDummy.rotation.set(0, tree.yaw + 0.42, 0);
    treeDummy.scale.set(0.82 * scale, 2.35 * scale, 0.82 * scale);
    treeDummy.updateMatrix();
    upper.setMatrixAt(i, treeDummy.matrix);
  }

  for (const mesh of [trunks, lower, middle, upper]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    treeGroup.add(mesh);
  }
  mapGroup.add(treeGroup);

  // Invisible checkpoint route lets existing race and time-trial modes work
  // without adding physical borders to the open gravel area.
  const routePoints = [
    [-38, -55], [-5, -66], [34, -55], [58, -28], [62, 12],
    [43, 48], [8, 64], [-31, 57], [-59, 27], [-64, -14]
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));
  const route = new THREE.CatmullRomCurve3(routePoints, true, "centripetal", 0.35);
  route.arcLengthDivisions = 650;
  route.updateArcLengths();
  const raceGateTs = [0.20, 0.40, 0.60, 0.80, 0.02];
  const raceGates = raceGateTs.map((t, index) => {
    const point = route.getPointAt(t);
    const tangent = route.getTangentAt(t).normalize();
    return {
      index,
      t,
      x: point.x,
      z: point.z,
      tangentX: tangent.x,
      tangentZ: tangent.z,
      normalX: -tangent.z,
      normalZ: tangent.x,
      finish: index === raceGateTs.length - 1
    };
  });
  const centerlineSamples = Array.from({ length: 256 }, (_, index) => {
    const t = index / 256;
    const point = route.getPointAt(t);
    return { t, x: point.x, z: point.z };
  });

  // A small, unintrusive start marker and checkpoint stakes are visual references only.
  const markerMaterial = new THREE.MeshStandardMaterial({
    color: 0xd77a34, roughness: 0.74, metalness: 0.04
  });
  const markerDark = new THREE.MeshStandardMaterial({
    color: 0x292c2d, roughness: 0.8
  });
  for (let i = 0; i < raceGates.length - 1; i++) {
    const gate = raceGates[i];
    for (const side of [-1, 1]) {
      const marker = new THREE.Mesh(
        new THREE.ConeGeometry(0.26, 0.75, 7),
        markerMaterial
      );
      marker.position.set(
        gate.x + gate.normalX * side * 18,
        sampleHeight(gate.x + gate.normalX * side * 18, gate.z + gate.normalZ * side * 18) + 0.36,
        gate.z + gate.normalZ * side * 18
      );
      marker.castShadow = true;
      mapGroup.add(marker);
    }
  }

  const spawnPoint = route.getPointAt(0.012);
  const spawnTangent = route.getTangentAt(0.012).normalize();
  const spawn = {
    x: spawnPoint.x,
    z: spawnPoint.z,
    y: sampleHeight(spawnPoint.x, spawnPoint.z),
    tangentX: spawnTangent.x,
    tangentZ: spawnTangent.z,
    normalX: -spawnTangent.z,
    normalZ: spawnTangent.x,
    yaw: Math.atan2(-spawnTangent.x, -spawnTangent.z)
  };

  const obstacles = parkedCars.map((car) => ({
    x: car.x,
    z: car.z,
    y: car.centerY,
    yaw: car.yaw,
    halfWidth: car.halfWidth,
    halfHeight: car.halfHeight,
    halfLength: car.halfLength
  }));

  return {
    arenaVisuals: [mapGroup],
    trackLayout: {
      id: "gravel-basin",
      name: "Gravel Basin",
      trackWidth: 42,
      trackHalfWidth: 21,
      trackLength: route.getLength(),
      jumps: [],
      barriers: [],
      heightfield: {
        heights,
        elementSize,
        originX: -half,
        originZ: half
      },
      obstacles,
      staticBoxes,
      spawn,
      standCamera: { x: 0, y: 13.5, z: 20 },
      raceGates,
      centerlineSamples
    }
  };
}
