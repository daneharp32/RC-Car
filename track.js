// Procedural closed-course RC dirt track.
import { createJumpProfile } from "./jump-profile.js";
// All scenery is grouped under one object so the garage can hide/show the arena
// without having to track individual decorative meshes.

function makeSeededRandom(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function makeDirtTexture(THREE, base, flecks, seed, repeatX, repeatY) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create the dirt texture canvas.");

  const random = makeSeededRandom(seed);
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 1500; i++) {
    const size = 0.5 + random() * 2.4;
    const alpha = 0.08 + random() * 0.22;
    context.fillStyle = flecks[Math.floor(random() * flecks.length)];
    context.globalAlpha = alpha;
    context.beginPath();
    context.ellipse(
      random() * 256,
      random() * 256,
      size * (0.8 + random()),
      size * (0.35 + random() * 0.8),
      random() * Math.PI,
      0,
      Math.PI * 2
    );
    context.fill();
  }

  // Fine, irregular marks help the dirt read as compacted soil rather than a
  // perfectly flat painted surface.
  for (let i = 0; i < 95; i++) {
    context.globalAlpha = 0.08 + random() * 0.10;
    context.strokeStyle = flecks[Math.floor(random() * flecks.length)];
    context.lineWidth = 0.5 + random() * 1.5;
    context.beginPath();
    const x = random() * 256;
    const y = random() * 256;
    context.moveTo(x, y);
    context.lineTo(x + (random() - 0.5) * 18, y + (random() - 0.5) * 9);
    context.stroke();
  }
  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  return texture;
}

function makeTrackStripGeometry(THREE, curve, halfWidth, sampleCount, y, totalLength) {
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= sampleCount; i++) {
    const t = i / sampleCount;
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const normalX = -tangent.z;
    const normalZ = tangent.x;
    const leftX = center.x + normalX * halfWidth;
    const leftZ = center.z + normalZ * halfWidth;
    const rightX = center.x - normalX * halfWidth;
    const rightZ = center.z - normalZ * halfWidth;
    const u = (t * totalLength) / 8;

    positions.push(leftX, y, leftZ, rightX, y, rightZ);
    uvs.push(u, 0, u, 2);

    if (i < sampleCount) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      // Counter-clockwise from above so the visible face points upward.
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeJumpSurfaceGeometry(THREE, profile) {
  const { heights, width, length, elementSize } = profile;
  const widthSegments = heights.length - 1;
  const lengthSegments = heights[0].length - 1;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let xIndex = 0; xIndex <= widthSegments; xIndex++) {
    const x = -width / 2 + xIndex * elementSize;
    for (let lengthIndex = 0; lengthIndex <= lengthSegments; lengthIndex++) {
      // Heightfield rows run from the back of the jump toward the front.
      const z = length / 2 - lengthIndex * elementSize;
      positions.push(x, heights[xIndex][lengthIndex], z);
      // Match the dirt lane's world-scale texture tiling instead of
      // stretching one texture tile across the entire jump.
      uvs.push(
        (xIndex / widthSegments) * 2,
        (lengthIndex / lengthSegments) * (length / 8)
      );

      if (xIndex < widthSegments && lengthIndex < lengthSegments) {
        const a = xIndex * (lengthSegments + 1) + lengthIndex;
        const b = a + lengthSegments + 1;
        const c = a + 1;
        const d = b + 1;
        // Winding faces upward while the local Z axis points along the ramp.
        indices.push(a, b, c, b, d, c);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createTrackSystem({ THREE, scene }) {
  const trackGroup = new THREE.Group();
  trackGroup.name = "closed-dirt-track";
  trackGroup.userData.mapId = "closed-course";
  scene.add(trackGroup);

  const trackHalfWidth = 5.75;
  const trackWidth = trackHalfWidth * 2;
  const centerlinePoints = [
    [-24, -48], [-6, -51], [14, -50], [31, -43], [42, -29],
    [45, -12], [37, 1], [23, 5], [12, 10], [11, 24],
    [20, 34], [35, 39], [42, 52], [35, 65], [18, 69],
    [0, 63], [-13, 52], [-23, 39], [-38, 31], [-53, 20],
    [-56, 4], [-48, -9], [-34, -18], [-26, -29], [-30, -42]
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));

  const centerline = new THREE.CatmullRomCurve3(
    centerlinePoints,
    true,
    "centripetal",
    0.35
  );
  centerline.arcLengthDivisions = 900;
  centerline.updateArcLengths();
  const trackLength = centerline.getLength();
  const arenaVisuals = [trackGroup];

  // Dark, compacted-earth infield and runoff surround the lighter race lane.
  const groundTexture = makeDirtTexture(
    THREE,
    "#38271d",
    ["#583b29", "#241b16", "#765034", "#473126"],
    1831,
    22,
    22
  );
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(190, 190),
    new THREE.MeshStandardMaterial({
      map: groundTexture,
      color: 0xffffff,
      roughness: 1,
      metalness: 0
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.035;
  ground.receiveShadow = true;
  trackGroup.add(ground);

  // Dense natural tree line around the perimeter of the 190 x 190 dirt field.
  // Instancing keeps the forest to a handful of draw calls instead of one per tree.
  const treeRandom = makeSeededRandom(44102);
  const treeSpots = [];
  const treeSpacing = 4.1;
  const edgeRows = [78.0, 84.0, 90.0];
  const halfEdgeSpan = 82.0;
  const treeSafetySamples = centerline.getPoints(160);

  for (let row = 0; row < edgeRows.length; row++) {
    const edge = edgeRows[row];
    const stagger = row * treeSpacing * 0.5;
    for (let sideIndex = 0; sideIndex < 4; sideIndex++) {
      for (let position = -halfEdgeSpan + stagger; position <= halfEdgeSpan; position += treeSpacing) {
        const jitter = (treeRandom() - 0.5) * 1.0;
        const along = position + jitter;
        let x = 0;
        let z = 0;
        if (sideIndex === 0) { x = along; z = -edge + (treeRandom() - 0.5) * 0.7; }
        if (sideIndex === 1) { x = along; z = edge + (treeRandom() - 0.5) * 0.7; }
        if (sideIndex === 2) { x = -edge + (treeRandom() - 0.5) * 0.7; z = along; }
        if (sideIndex === 3) { x = edge + (treeRandom() - 0.5) * 0.7; z = along; }

        let closest = Infinity;
        for (const point of treeSafetySamples) {
          const dx = x - point.x;
          const dz = z - point.z;
          closest = Math.min(closest, dx * dx + dz * dz);
        }
        // Keep a runoff gap between the curbs, roadside props, and tree trunks.
        if (closest < (trackHalfWidth + 8.5) * (trackHalfWidth + 8.5)) continue;

        treeSpots.push({
          x,
          z,
          yaw: treeRandom() * Math.PI * 2,
          scale: 2.6 + treeRandom() * 0.9
        });
      }
    }
  }

  // A few larger corner trees join the four perimeter rows into one continuous
  // natural border around the rectangular field.
  for (const xSide of [-1, 1]) {
    for (const zSide of [-1, 1]) {
      treeSpots.push({
        x: xSide * 89.0 + (treeRandom() - 0.5) * 1.2,
        z: zSide * 89.0 + (treeRandom() - 0.5) * 1.2,
        yaw: treeRandom() * Math.PI * 2,
        scale: 3.2 + treeRandom() * 0.45
      });
    }
  }

  const treeGroup = new THREE.Group();
  treeGroup.name = "perimeter-pine-tree-line";
  const treeCount = treeSpots.length;
  const treeDummy = new THREE.Object3D();

  const trunkGeometry = new THREE.CylinderGeometry(0.11, 0.19, 1, 7, 1);
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x59412d,
    roughness: 1,
    metalness: 0
  });
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, treeCount);

  const lowerCanopyGeometry = new THREE.ConeGeometry(1, 1, 8, 1);
  const middleCanopyGeometry = new THREE.ConeGeometry(1, 1, 8, 1);
  const upperCanopyGeometry = new THREE.ConeGeometry(1, 1, 8, 1);
  const lowerCanopyMaterial = new THREE.MeshStandardMaterial({
    color: 0x244a32,
    roughness: 1,
    metalness: 0
  });
  const middleCanopyMaterial = new THREE.MeshStandardMaterial({
    color: 0x2e5a3b,
    roughness: 1,
    metalness: 0
  });
  const upperCanopyMaterial = new THREE.MeshStandardMaterial({
    color: 0x3b6b46,
    roughness: 1,
    metalness: 0
  });
  const lowerCanopies = new THREE.InstancedMesh(lowerCanopyGeometry, lowerCanopyMaterial, treeCount);
  const middleCanopies = new THREE.InstancedMesh(middleCanopyGeometry, middleCanopyMaterial, treeCount);
  const upperCanopies = new THREE.InstancedMesh(upperCanopyGeometry, upperCanopyMaterial, treeCount);

  for (let i = 0; i < treeCount; i++) {
    const tree = treeSpots[i];
    const s = tree.scale;

    treeDummy.position.set(tree.x, 0.76 * s, tree.z);
    treeDummy.rotation.set(0, tree.yaw, 0);
    treeDummy.scale.set(s, 1.55 * s, s);
    treeDummy.updateMatrix();
    trunks.setMatrixAt(i, treeDummy.matrix);

    treeDummy.position.set(tree.x, 1.95 * s, tree.z);
    treeDummy.rotation.set(0, tree.yaw, 0);
    treeDummy.scale.set(1.42 * s, 3.1 * s, 1.42 * s);
    treeDummy.updateMatrix();
    lowerCanopies.setMatrixAt(i, treeDummy.matrix);

    treeDummy.position.set(tree.x, 3.02 * s, tree.z);
    treeDummy.rotation.set(0, tree.yaw + 0.22, 0);
    treeDummy.scale.set(1.10 * s, 2.75 * s, 1.10 * s);
    treeDummy.updateMatrix();
    middleCanopies.setMatrixAt(i, treeDummy.matrix);

    treeDummy.position.set(tree.x, 4.02 * s, tree.z);
    treeDummy.rotation.set(0, tree.yaw + 0.41, 0);
    treeDummy.scale.set(0.80 * s, 2.25 * s, 0.80 * s);
    treeDummy.updateMatrix();
    upperCanopies.setMatrixAt(i, treeDummy.matrix);
  }

  for (const trees of [trunks, lowerCanopies, middleCanopies, upperCanopies]) {
    trees.castShadow = true;
    trees.receiveShadow = true;
    trees.instanceMatrix.needsUpdate = true;
    trees.computeBoundingSphere();
    treeGroup.add(trees);
  }
  trackGroup.add(treeGroup);

    const laneTexture = makeDirtTexture(
    THREE,
    "#98663f",
    ["#b27d4c", "#794d31", "#d0a06a", "#875633"],
    944,
    1,
    1
  );
  const laneGeometry = makeTrackStripGeometry(
    THREE,
    centerline,
    trackHalfWidth,
    520,
    0.008,
    trackLength
  );
  const lane = new THREE.Mesh(
    laneGeometry,
    new THREE.MeshStandardMaterial({
      map: laneTexture,
      color: 0xffffff,
      roughness: 1,
      metalness: 0
    })
  );
  lane.receiveShadow = true;
  lane.castShadow = false;
  trackGroup.add(lane);

  // Two subtle compacted tire grooves add definition without obstructing the
  // driving surface.
  const rutMaterial = new THREE.MeshStandardMaterial({
    color: 0x70492f,
    roughness: 1,
    metalness: 0
  });
  for (const offset of [-3.45, 3.45]) {
    const rutPoints = [];
    for (let i = 0; i < 300; i++) {
      const t = i / 300;
      const point = centerline.getPointAt(t);
      const tangent = centerline.getTangentAt(t).normalize();
      const normalX = -tangent.z;
      const normalZ = tangent.x;
      rutPoints.push(new THREE.Vector3(
        point.x + normalX * offset,
        0.035,
        point.z + normalZ * offset
      ));
    }
    const rutCurve = new THREE.CatmullRomCurve3(rutPoints, true, "centripetal");
    const rut = new THREE.Mesh(
      new THREE.TubeGeometry(rutCurve, 900, 0.045, 5, true),
      rutMaterial
    );
    rut.receiveShadow = true;
    trackGroup.add(rut);
  }

  // Five transverse ridge jumps. Width spans across the track; length follows
  // the racing line, leaving two smooth approach faces in opposite directions.
  const jumpDefinitions = [
    // Slightly taller peaks give the jumps a clearer takeoff face while the
    // long footprint keeps the approach and landing transitions progressive.
    { t: 0.105, width: 11.4, length: 11.6, height: 0.38, label: "START STRAIGHT KICKER" },
    { t: 0.285, width: 11.4, length: 12.6, height: 0.42, label: "TABLETOP" },
    { t: 0.455, width: 11.2, length: 10.8, height: 0.32, label: "SHORT KICKER" },
    { t: 0.655, width: 11.4, length: 12.2, height: 0.40, label: "BACK SECTION JUMP" },
    { t: 0.855, width: 10.9, length: 10.0, height: 0.22, label: "ROLLER" }
  ];
  const jumps = jumpDefinitions.map((definition) => {
    const point = centerline.getPointAt(definition.t);
    const tangent = centerline.getTangentAt(definition.t).normalize();
    const profile = createJumpProfile(
      definition.width,
      definition.length,
      definition.height
    );
    return {
      ...definition,
      width: profile.width,
      length: profile.length,
      profile,
      x: point.x,
      z: point.z,
      tangentX: tangent.x,
      tangentZ: tangent.z,
      normalX: -tangent.z,
      normalZ: tangent.x,
      yaw: Math.atan2(-tangent.x, -tangent.z)
    };
  });

  const jumpMaterial = new THREE.MeshStandardMaterial({
    // Reuse the racing lane's dirt texture and repeat scale so the jumps
    // blend naturally into the track instead of looking like separate ramps.
    map: laneTexture,
    // A warm brown tint darkens the shared lane dirt without changing
    // its texture detail or repeating scale.
    color: 0xd8c2a8,
    roughness: 1,
    metalness: 0
  });
  for (const jump of jumps) {
    // The shared ridge profile has broad sides and symmetric takeoff faces.
    const ramp = new THREE.Mesh(
      makeJumpSurfaceGeometry(THREE, jump.profile),
      jumpMaterial
    );
    ramp.position.set(jump.x, 0.01, jump.z);
    ramp.rotation.y = jump.yaw;
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    ramp.name = jump.label;
    trackGroup.add(ramp);
  }

  // Alternating red/white safety curbs follow the actual offset edge path.
  // Each block is sized from the distance to its neighbours, with a deliberate
  // gap so the blocks do not clip through one another on tight bends.
  const barrierWidth = 0.52;
  const barrierHeight = 0.25;
  const barrierOffset = trackHalfWidth + barrierWidth * 0.5 + 0.09;
  const barrierSpacingTarget = 2.45;
  const barrierCountPerSide = Math.max(24, Math.ceil(trackLength / barrierSpacingTarget));
  const totalBarrierCount = barrierCountPerSide * 2;
  const barrierGeometry = new THREE.BoxGeometry(barrierWidth, barrierHeight, 1);
  const redBarrierMaterial = new THREE.MeshStandardMaterial({
    color: 0xd83b31, roughness: 0.76, metalness: 0.02
  });
  const whiteBarrierMaterial = new THREE.MeshStandardMaterial({
    color: 0xf0eee6, roughness: 0.76, metalness: 0.02
  });
  const redBarriers = new THREE.InstancedMesh(
    barrierGeometry, redBarrierMaterial, Math.ceil(totalBarrierCount / 2)
  );
  const whiteBarriers = new THREE.InstancedMesh(
    barrierGeometry, whiteBarrierMaterial, Math.floor(totalBarrierCount / 2)
  );
  redBarriers.name = "red-curb-blocks";
  whiteBarriers.name = "white-curb-blocks";
  redBarriers.castShadow = true;
  whiteBarriers.castShadow = true;
  redBarriers.receiveShadow = true;
  whiteBarriers.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const barriers = [];
  let redIndex = 0;
  let whiteIndex = 0;

  function getBarrierEdgePoint(t, side) {
    const wrappedT = ((t % 1) + 1) % 1;
    const point = centerline.getPointAt(wrappedT);
    const tangent = centerline.getTangentAt(wrappedT).normalize();
    const normalX = -tangent.z;
    const normalZ = tangent.x;
    return new THREE.Vector3(
      point.x + normalX * side * barrierOffset, 0,
      point.z + normalZ * side * barrierOffset
    );
  }

  for (const side of [-1, 1]) {
    const edgeCenters = Array.from({ length: barrierCountPerSide }, (_, i) =>
      getBarrierEdgePoint((i + 0.5) / barrierCountPerSide, side)
    );

    for (let i = 0; i < barrierCountPerSide; i++) {
      const previous = edgeCenters[(i - 1 + barrierCountPerSide) % barrierCountPerSide];
      const current = edgeCenters[i];
      const next = edgeCenters[(i + 1) % barrierCountPerSide];
      const previousDistance = current.distanceTo(previous);
      const nextDistance = current.distanceTo(next);
      // A very tight inside bend can make the offset edge fold toward
      // itself. Skip only those tiny pieces instead of stretching them into
      // neighbouring blocks; the matching collision list uses this same gap.
      const segmentLength = Math.min(previousDistance, nextDistance) - 0.22;
      if (segmentLength < 0.08) continue;
      const edgeTangent = next.clone().sub(previous).normalize();
      const yaw = Math.atan2(-edgeTangent.x, -edgeTangent.z);
      const x = current.x;
      const z = current.z;

      dummy.position.set(x, barrierHeight / 2, z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, segmentLength);
      dummy.updateMatrix();
      if ((i + (side > 0 ? 1 : 0)) % 2 === 0) {
        redBarriers.setMatrixAt(redIndex++, dummy.matrix);
      } else {
        whiteBarriers.setMatrixAt(whiteIndex++, dummy.matrix);
      }

      barriers.push({
        x, y: barrierHeight / 2, z, yaw,
        width: barrierWidth, height: barrierHeight, length: segmentLength
      });
    }
  }

  redBarriers.count = redIndex;
  whiteBarriers.count = whiteIndex;
  redBarriers.instanceMatrix.needsUpdate = true;
  whiteBarriers.instanceMatrix.needsUpdate = true;
  redBarriers.computeBoundingSphere();
  whiteBarriers.computeBoundingSphere();
  trackGroup.add(redBarriers, whiteBarriers);

  // Checkered start/finish line.
  const startLineT = 0.032;
  const startPoint = centerline.getPointAt(startLineT);
  const startTangent = centerline.getTangentAt(startLineT).normalize();
  const startNormal = new THREE.Vector3(-startTangent.z, 0, startTangent.x);
  const startYaw = Math.atan2(-startTangent.x, -startTangent.z);
  const startGroup = new THREE.Group();
  startGroup.position.copy(startPoint);
  startGroup.position.y = 0.035;
  startGroup.rotation.y = startYaw;
  const checkWidth = trackWidth / 10;
  const checkMaterials = [
    new THREE.MeshStandardMaterial({ color: 0xf3f0e7, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0x222326, roughness: 0.9 })
  ];
  const checkGeometry = new THREE.BoxGeometry(checkWidth, 0.025, 0.34);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 10; col++) {
      const tile = new THREE.Mesh(checkGeometry, checkMaterials[(row + col) % 2]);
      tile.position.set(
        -trackHalfWidth + checkWidth * (col + 0.5),
        0,
        (row - 0.5) * 0.34
      );
      tile.receiveShadow = true;
      startGroup.add(tile);
    }
  }
  trackGroup.add(startGroup);

  // A simple gantry marks the start/finish straight.
  const gantry = new THREE.Group();
  gantry.position.copy(centerline.getPointAt(0.055));
  gantry.rotation.y = startYaw;
  const gantryMaterial = new THREE.MeshStandardMaterial({
    color: 0x29333b,
    metalness: 0.42,
    roughness: 0.62
  });
  const postGeometry = new THREE.BoxGeometry(0.20, 2.7, 0.22);
  for (const x of [-trackHalfWidth - 1.1, trackHalfWidth + 1.1]) {
    const post = new THREE.Mesh(postGeometry, gantryMaterial);
    post.position.set(x, 1.35, 0);
    post.castShadow = true;
    gantry.add(post);
  }
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(trackWidth + 2.5, 0.24, 0.30),
    gantryMaterial
  );
  beam.position.y = 2.63;
  beam.castShadow = true;
  gantry.add(beam);
  // Keep the start/finish gantry as an unlabelled frame, without signage.
  trackGroup.add(gantry);

  const tireMaterial = new THREE.MeshStandardMaterial({
    color: 0x17191b,
    roughness: 0.98
  });
  const tireGeometry = new THREE.TorusGeometry(0.30, 0.085, 10, 20);
  const tireStackLocations = [
    [0.18, -1], [0.38, 1], [0.57, -1], [0.78, 1], [0.91, -1]
  ];
  for (const [t, side] of tireStackLocations) {
    const point = centerline.getPointAt(t);
    const tangent = centerline.getTangentAt(t).normalize();
    const normalX = -tangent.z;
    const normalZ = tangent.x;
    const stack = new THREE.Group();
    stack.position.set(
      point.x + normalX * side * (trackHalfWidth + 2.4),
      0,
      point.z + normalZ * side * (trackHalfWidth + 2.4)
    );
    stack.rotation.y = Math.atan2(-tangent.x, -tangent.z);
    for (let level = 0; level < 3; level++) {
      const tire = new THREE.Mesh(tireGeometry, tireMaterial);
      tire.rotation.x = Math.PI / 2;
      tire.position.y = 0.13 + level * 0.20;
      tire.castShadow = true;
      stack.add(tire);
    }
    trackGroup.add(stack);
  }

  const coneMaterial = new THREE.MeshStandardMaterial({
    color: 0xf06a26,
    roughness: 0.85
  });
  const coneBaseMaterial = new THREE.MeshStandardMaterial({
    color: 0x27292a,
    roughness: 0.9
  });
  const coneGeometry = new THREE.ConeGeometry(0.14, 0.42, 10);
  const coneBaseGeometry = new THREE.CylinderGeometry(0.19, 0.19, 0.045, 12);
  for (const t of [0.19, 0.205, 0.39, 0.405, 0.60, 0.615, 0.79, 0.805, 0.94]) {
    const point = centerline.getPointAt(t);
    const tangent = centerline.getTangentAt(t).normalize();
    const normalX = -tangent.z;
    const normalZ = tangent.x;
    for (const side of [-1, 1]) {
      const coneGroup = new THREE.Group();
      coneGroup.position.set(
        point.x + normalX * side * 4.78,
        0,
        point.z + normalZ * side * 4.78
      );
      const base = new THREE.Mesh(coneBaseGeometry, coneBaseMaterial);
      base.position.y = 0.025;
      coneGroup.add(base);
      const cone = new THREE.Mesh(coneGeometry, coneMaterial);
      cone.position.y = 0.25;
      cone.castShadow = true;
      coneGroup.add(cone);
      trackGroup.add(coneGroup);
    }
  }

  // Scatter low rocks and dry scrub beyond the curbs, leaving the track and
  // a runoff margin clear. Instancing keeps the prop count inexpensive.
  const random = makeSeededRandom(7219);
  const centerSamples = [];
  for (let i = 0; i < 260; i++) centerSamples.push(centerline.getPointAt(i / 260));
  function clearOfTrack(x, z, margin) {
    let minimum = Infinity;
    for (const point of centerSamples) {
      const dx = x - point.x;
      const dz = z - point.z;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared < minimum) minimum = distanceSquared;
    }
    return minimum > margin * margin;
  }

  // Reserve a clear pit-side patch for the driver's stand and parked RC trucks.
  const pitCenter = new THREE.Vector2(-42, -45.8);
  function clearOfPitArea(x, z, margin = 8.2) {
    return Math.hypot(x - pitCenter.x, z - pitCenter.y) > margin;
  }

  const rockGeometry = new THREE.DodecahedronGeometry(0.46, 0);
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0x514337,
    roughness: 1
  });
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, 110);
  const propDummy = new THREE.Object3D();
  let rockCount = 0;
  let attempts = 0;
  while (rockCount < 110 && attempts < 1800) {
    attempts++;
    const x = (random() - 0.5) * 158;
    const z = (random() - 0.5) * 158;
    if (!clearOfTrack(x, z, trackHalfWidth + 8.5) || !clearOfPitArea(x, z)) continue;
    propDummy.position.set(x, 0.12 + random() * 0.15, z);
    propDummy.rotation.set(random() * 0.45, random() * Math.PI, random() * 0.45);
    const scale = 0.35 + random() * 1.15;
    propDummy.scale.set(scale * (0.8 + random() * 0.6), scale * 0.6, scale * (0.7 + random() * 0.5));
    propDummy.updateMatrix();
    rocks.setMatrixAt(rockCount++, propDummy.matrix);
  }
  rocks.count = rockCount;
  rocks.castShadow = true;
  trackGroup.add(rocks);

  const scrubGeometry = new THREE.ConeGeometry(0.16, 0.68, 5);
  const scrubMaterial = new THREE.MeshStandardMaterial({
    color: 0x887047,
    roughness: 1
  });
  const scrub = new THREE.InstancedMesh(scrubGeometry, scrubMaterial, 95);
  let scrubCount = 0;
  attempts = 0;
  while (scrubCount < 95 && attempts < 1600) {
    attempts++;
    const x = (random() - 0.5) * 158;
    const z = (random() - 0.5) * 158;
    if (!clearOfTrack(x, z, trackHalfWidth + 6.8) || !clearOfPitArea(x, z)) continue;
    propDummy.position.set(x, 0.26, z);
    propDummy.rotation.set(0, random() * Math.PI, (random() - 0.5) * 0.18);
    const scale = 0.45 + random() * 1.1;
    propDummy.scale.set(scale, scale, scale);
    propDummy.updateMatrix();
    scrub.setMatrixAt(scrubCount++, propDummy.matrix);
  }
  scrub.count = scrubCount;
  scrub.castShadow = true;
  trackGroup.add(scrub);

  // A small, weather-beaten wooden driver's stand gives the track a proper
  // club-track viewing point. It sits well outside the racing line.
  const woodCanvas = document.createElement("canvas");
  woodCanvas.width = 256;
  woodCanvas.height = 256;
  const woodContext = woodCanvas.getContext("2d");
  if (!woodContext) throw new Error("Could not create the weathered wood texture.");
  woodContext.fillStyle = "#746754";
  woodContext.fillRect(0, 0, 256, 256);
  const woodRandom = makeSeededRandom(19044);
  const woodGrainColors = ["#403a31", "#51493d", "#97866c", "#b0a087", "#5a5042"];
  for (let i = 0; i < 150; i++) {
    const y = woodRandom() * 256;
    woodContext.globalAlpha = 0.12 + woodRandom() * 0.28;
    woodContext.strokeStyle = woodGrainColors[Math.floor(woodRandom() * woodGrainColors.length)];
    woodContext.lineWidth = 0.5 + woodRandom() * 2.1;
    woodContext.beginPath();
    const x = woodRandom() * 256;
    woodContext.moveTo(x, y);
    woodContext.bezierCurveTo(
      x + 35, y + (woodRandom() - 0.5) * 5,
      x + 95, y + (woodRandom() - 0.5) * 7,
      x + 190, y + (woodRandom() - 0.5) * 5
    );
    woodContext.stroke();
  }
  for (let i = 0; i < 7; i++) {
    const x = 18 + woodRandom() * 220;
    const y = 18 + woodRandom() * 220;
    woodContext.globalAlpha = 0.22;
    woodContext.strokeStyle = "#302a23";
    woodContext.lineWidth = 1.1;
    woodContext.beginPath();
    woodContext.ellipse(x, y, 4 + woodRandom() * 5, 2 + woodRandom() * 3, woodRandom(), 0, Math.PI * 2);
    woodContext.stroke();
  }
  woodContext.globalAlpha = 1;
  const woodTexture = new THREE.CanvasTexture(woodCanvas);
  woodTexture.colorSpace = THREE.SRGBColorSpace;
  woodTexture.wrapS = THREE.RepeatWrapping;
  woodTexture.wrapT = THREE.RepeatWrapping;
  woodTexture.anisotropy = 4;

  const weatheredWood = new THREE.MeshStandardMaterial({
    map: woodTexture, color: 0xc3b49b, roughness: 1, metalness: 0
  });
  const fadedWood = new THREE.MeshStandardMaterial({
    map: woodTexture, color: 0x96866e, roughness: 1, metalness: 0
  });
  const darkWood = new THREE.MeshStandardMaterial({
    color: 0x493e32, roughness: 1, metalness: 0
  });

  const driverStand = new THREE.Group();
  driverStand.name = "old-wooden-rc-drivers-stand";
  driverStand.position.set(pitCenter.x, 0, pitCenter.y);
  driverStand.rotation.y = -1.80;
  trackGroup.add(driverStand);

  // Scale the wooden structure uniformly so it reads as a proper raised
  // driver's platform. Parked RC cars remain children of the outer pit group,
  // keeping their original size.
  const standStructure = new THREE.Group();
  standStructure.name = "enlarged-wooden-platform";
  standStructure.scale.setScalar(1.45);
  driverStand.add(standStructure);

  function addTimber(size, position, rotation = [0, 0, 0], material = weatheredWood) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
    plank.position.set(position[0], position[1], position[2]);
    plank.rotation.set(rotation[0], rotation[1], rotation[2]);
    plank.castShadow = true;
    plank.receiveShadow = true;
    standStructure.add(plank);
    return plank;
  }

  function addTimberBrace(start, end, thickness = 0.12, material = fadedWood) {
    const a = new THREE.Vector3(start[0], start[1], start[2]);
    const b = new THREE.Vector3(end[0], end[1], end[2]);
    const direction = b.clone().sub(a);
    const brace = new THREE.Mesh(
      new THREE.BoxGeometry(thickness, direction.length(), thickness),
      material
    );
    brace.position.copy(a).add(b).multiplyScalar(0.5);
    brace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    brace.castShadow = true;
    brace.receiveShadow = true;
    standStructure.add(brace);
  }

  // Four heavy support posts and diagonal braces.
  for (const x of [-2.05, 2.05]) {
    for (const z of [-0.78, 0.78]) {
      addTimber([0.19, 1.82, 0.19], [x, 0.91, z], [0, 0, (x * z > 0 ? 0.012 : -0.012)], fadedWood);
    }
    addTimberBrace([x, 0.18, -0.70], [x, 1.60, 0.70], 0.13, weatheredWood);
    addTimberBrace([x, 0.18, 0.70], [x, 1.60, -0.70], 0.11, fadedWood);
  }

  // Platform frame and mismatched, separated deck planks.
  addTimber([4.55, 0.17, 0.20], [0, 1.70, -0.78], [0, 0, 0], darkWood);
  addTimber([4.55, 0.17, 0.20], [0, 1.70, 0.78], [0, 0, 0], darkWood);
  addTimber([0.18, 0.17, 1.50], [-2.05, 1.70, 0], [0, 0, 0], darkWood);
  addTimber([0.18, 0.17, 1.50], [2.05, 1.70, 0], [0, 0, 0], darkWood);
  for (let i = 0; i < 9; i++) {
    const z = -0.82 + i * 0.205;
    const tilt = (woodRandom() - 0.5) * 0.012;
    addTimber(
      [4.40, 0.095, 0.185 + woodRandom() * 0.012],
      [(woodRandom() - 0.5) * 0.025, 1.835 + (woodRandom() - 0.5) * 0.012, z],
      [tilt, 0, (woodRandom() - 0.5) * 0.009],
      i % 3 === 0 ? fadedWood : weatheredWood
    );
  }

  // Aged rails around the back and sides, leaving the front open for viewing.
  for (const x of [-2.12, 2.12]) {
    addTimber([0.13, 0.94, 0.13], [x, 2.34, 0.82], [0, 0, 0], fadedWood);
    addTimber([0.13, 0.82, 0.13], [x, 2.28, -0.78], [0, 0, 0], fadedWood);
    addTimber([0.11, 0.10, 1.58], [x, 2.67, 0.02], [0, 0, 0], weatheredWood);
    addTimber([0.10, 0.09, 1.55], [x, 2.22, 0.02], [0, 0, 0], fadedWood);
  }
  addTimber([4.30, 0.11, 0.13], [0, 2.67, 0.82], [0, 0, 0], weatheredWood);
  addTimber([4.22, 0.10, 0.12], [0, 2.22, 0.82], [0, 0, 0], fadedWood);
  addTimber([4.20, 0.07, 0.12], [0, 1.94, 0.82], [0, 0, 0], darkWood);

  // Worn wooden steps at the front-left corner of the platform.
  const stairAngle = -0.68;
  for (const x of [-1.82, -0.66]) {
    addTimber([0.13, 0.17, 2.68], [x, 0.91, -1.90], [stairAngle, 0, 0], darkWood);
  }
  for (let i = 0; i < 7; i++) {
    const z = -2.73 + i * 0.285;
    const y = 0.14 + i * 0.245;
    addTimber(
      [1.22, 0.095, 0.25],
      [-1.24, y, z],
      [(woodRandom() - 0.5) * 0.018, 0, 0],
      i % 2 === 0 ? weatheredWood : fadedWood
    );
  }
  for (const x of [-1.84, -0.64]) {
    addTimberBrace([x, 0.25, -2.55], [x, 1.62, -1.12], 0.08, fadedWood);
  }

  const nailMaterial = new THREE.MeshStandardMaterial({
    color: 0x302d29, roughness: 0.88, metalness: 0.28
  });
  const nailGeometry = new THREE.CylinderGeometry(0.018, 0.018, 0.012, 8);
  for (const x of [-2.05, 2.05]) {
    for (const z of [-0.78, 0.78]) {
      for (const y of [0.30, 1.54, 1.91]) {
        const nail = new THREE.Mesh(nailGeometry, nailMaterial);
        nail.position.set(x + Math.sign(x) * 0.10, y, z);
        nail.rotation.z = Math.PI / 2;
        standStructure.add(nail);
      }
    }
  }

  // Four small parked short-course trucks: two complete shells and two exposed
  // chassis with battery, motor, towers and miniature shocks.
  const pitTireMaterial = new THREE.MeshStandardMaterial({
    color: 0x151719, roughness: 0.99, metalness: 0
  });
  const pitWheelHubMaterial = new THREE.MeshStandardMaterial({
    color: 0x8d9699, roughness: 0.45, metalness: 0.66
  });
  const pitChassisMaterial = new THREE.MeshStandardMaterial({
    color: 0x252b30, roughness: 0.76, metalness: 0.28
  });
  const pitBatteryMaterial = new THREE.MeshStandardMaterial({
    color: 0x183c58, roughness: 0.6, metalness: 0.12
  });
  const pitShockMaterial = new THREE.MeshStandardMaterial({
    color: 0xb6bec0, roughness: 0.38, metalness: 0.72
  });

  function addPitRcCar(position, yaw, bodyColor, shellRemoved, accentColor) {
    const car = new THREE.Group();
    car.position.set(position[0], 0.02, position[1]);
    car.rotation.y = yaw;
    car.scale.setScalar(0.86);
    car.name = shellRemoved ? "parked-rc-truck-shell-removed" : "parked-rc-truck";
    driverStand.add(car);

    function part(geometry, material, pos, rot = [0, 0, 0]) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(pos[0], pos[1], pos[2]);
      mesh.rotation.set(rot[0], rot[1], rot[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      car.add(mesh);
      return mesh;
    }
    function rod(start, end, radius, material) {
      const a = new THREE.Vector3(start[0], start[1], start[2]);
      const b = new THREE.Vector3(end[0], end[1], end[2]);
      const direction = b.clone().sub(a);
      const mesh = part(
        new THREE.CylinderGeometry(radius, radius, direction.length(), 8),
        material,
        a.clone().add(b).multiplyScalar(0.5).toArray()
      );
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      return mesh;
    }

    part(new THREE.BoxGeometry(0.45, 0.065, 0.72), pitChassisMaterial, [0, 0.145, 0]);
    for (const x of [-0.285, 0.285]) {
      for (const z of [-0.255, 0.255]) {
        part(
          new THREE.CylinderGeometry(0.118, 0.118, 0.095, 16),
          pitTireMaterial,
          [x, 0.135, z],
          [0, 0, Math.PI / 2]
        );
        part(
          new THREE.CylinderGeometry(0.063, 0.063, 0.102, 12),
          pitWheelHubMaterial,
          [x + Math.sign(x) * 0.004, 0.135, z],
          [0, 0, Math.PI / 2]
        );
      }
    }

    for (const x of [-0.20, 0.20]) {
      for (const z of [-0.24, 0.24]) {
        rod([x * 0.50, 0.135, z], [x * 1.40, 0.135, z], 0.012, pitChassisMaterial);
        rod([x * 0.78, 0.18, z], [x * 1.18, 0.32, z + (z < 0 ? -0.02 : 0.02)], 0.019, pitShockMaterial);
      }
    }

    if (shellRemoved) {
      for (const z of [-0.29, 0.29]) {
        part(new THREE.BoxGeometry(0.47, 0.24, 0.045), pitChassisMaterial, [0, 0.245, z]);
        for (const x of [-0.14, 0.14]) {
          part(new THREE.CylinderGeometry(0.012, 0.012, 0.035, 7), pitWheelHubMaterial, [x, 0.37, z]);
        }
      }
      part(new THREE.BoxGeometry(0.18, 0.09, 0.32), pitBatteryMaterial, [-0.075, 0.245, 0.015]);
      part(new THREE.BoxGeometry(0.13, 0.075, 0.12), new THREE.MeshStandardMaterial({
        color: accentColor, roughness: 0.34, metalness: 0.48
      }), [0.13, 0.245, 0.12]);
      rod([-0.15, 0.30, -0.10], [0.16, 0.31, -0.23], 0.009, pitShockMaterial);
      rod([-0.15, 0.30, 0.09], [0.16, 0.31, 0.23], 0.009, pitShockMaterial);
      part(new THREE.BoxGeometry(0.035, 0.025, 0.30), pitBatteryMaterial, [0.02, 0.31, 0]);
      for (const x of [-0.21, 0.21]) {
        part(new THREE.BoxGeometry(0.035, 0.035, 0.24), pitWheelHubMaterial, [x, 0.205, 0]);
      }
    } else {
      const shellMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor, roughness: 0.58, metalness: 0.015
      });
      part(new THREE.BoxGeometry(0.53, 0.115, 0.79), shellMaterial, [0, 0.285, 0]);
      part(new THREE.BoxGeometry(0.50, 0.055, 0.26), shellMaterial, [0, 0.345, -0.245]);
      part(new THREE.BoxGeometry(0.45, 0.055, 0.20), shellMaterial, [0, 0.345, 0.285]);
      part(new THREE.BoxGeometry(0.40, 0.145, 0.29), shellMaterial, [0, 0.405, 0.015]);
      const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0x18252c, roughness: 0.36, metalness: 0.12
      });
      part(new THREE.BoxGeometry(0.36, 0.065, 0.018), glassMaterial, [0, 0.435, -0.135], [0.12, 0, 0]);
      part(new THREE.BoxGeometry(0.36, 0.065, 0.018), glassMaterial, [0, 0.435, 0.165], [-0.12, 0, 0]);
      for (const x of [-0.255, 0.255]) {
        part(new THREE.BoxGeometry(0.035, 0.045, 0.54), shellMaterial, [x, 0.30, 0]);
      }
      part(new THREE.BoxGeometry(0.18, 0.035, 0.025), pitWheelHubMaterial, [0, 0.36, -0.39]);
    }
    return car;
  }

  addPitRcCar([-3.45, -2.45], -0.25, 0xe4512c, false, 0xe4512c);
  addPitRcCar([3.45, -2.30], 0.35, 0x2d75c5, false, 0x2d75c5);
  addPitRcCar([-3.35, 2.25], 0.65, 0x2c3439, true, 0x2689b5);
  addPitRcCar([3.35, 2.35], -0.55, 0x2c3439, true, 0xd94e36);

  const spawnT = 0.012;
  const spawnPoint = centerline.getPointAt(spawnT);
  const spawnTangent = centerline.getTangentAt(spawnT).normalize();
  const spawnNormalX = -spawnTangent.z;
  const spawnNormalZ = spawnTangent.x;
  const spawn = {
    x: spawnPoint.x,
    z: spawnPoint.z,
    tangentX: spawnTangent.x,
    tangentZ: spawnTangent.z,
    normalX: spawnNormalX,
    normalZ: spawnNormalZ,
    yaw: Math.atan2(-spawnTangent.x, -spawnTangent.z)
  };

  // Race checkpoints follow the centerline in driving order. A lap is only
  // accepted after gates 0-3 and then the checkered finish gate are crossed.
  const raceGateTs = [0.22, 0.42, 0.62, 0.82, startLineT];
  const raceGates = raceGateTs.map((t, index) => {
    const point = centerline.getPointAt(t);
    const tangent = centerline.getTangentAt(t).normalize();
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
    const point = centerline.getPointAt(t);
    return { t, x: point.x, z: point.z };
  });

  // Fixed camera mount just above the driver's platform railing. This stays
  // at the stand while the Stand POV camera pans and zooms toward the active car.
  const standCameraPosition = driverStand.localToWorld(
    new THREE.Vector3(0, 4.12, -0.38)
  );

  return {
    arenaVisuals,
    trackLayout: {
      trackWidth,
      trackHalfWidth,
      trackLength,
      jumps,
      barriers,
      spawn,
      standCamera: {
        x: standCameraPosition.x,
        y: standCameraPosition.y,
        z: standCameraPosition.z
      },
      raceGates,
      centerlineSamples
    }
  };
}
