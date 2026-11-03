// Procedural closed-course RC dirt track.
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

function makeRampGeometry(THREE, width, length, height) {
  const w = width / 2;
  const l = length / 2;
  const vertices = [
    [-w, 0, l], [w, 0, l], [-w, 0, -l],
    [w, 0, -l], [-w, height, -l], [w, height, -l]
  ];
  const faces = [
    [0, 2, 3, 1], [0, 1, 5, 4], [0, 4, 2],
    [1, 3, 5], [2, 4, 5, 3]
  ];
  const indices = [];
  for (const face of faces) {
    for (let i = 1; i < face.length - 1; i++) {
      indices.push(face[0], face[i], face[i + 1]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices.flat(), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeTrackSignTexture(THREE, heading, subheading) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create the track sign canvas.");

  context.fillStyle = "#202a30";
  context.fillRect(0, 0, 512, 160);
  context.fillStyle = "#df3c31";
  context.fillRect(0, 0, 512, 13);
  context.fillStyle = "#f0eee8";
  context.fillRect(0, 147, 512, 13);
  context.fillStyle = "#f6f1e6";
  context.font = "900 48px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(heading, 256, 66);
  context.fillStyle = "#d2b38c";
  context.font = "700 20px Arial";
  context.fillText(subheading, 256, 113);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function addTrackSign(THREE, parent, position, yaw, heading, subheading) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.rotation.y = yaw;
  const postMaterial = new THREE.MeshStandardMaterial({
    color: 0x353a3d,
    metalness: 0.35,
    roughness: 0.68
  });
  const postGeometry = new THREE.BoxGeometry(0.10, 1.55, 0.12);
  for (const x of [-1.95, 1.95]) {
    const post = new THREE.Mesh(postGeometry, postMaterial);
    post.position.set(x, 0.77, 0);
    post.castShadow = true;
    group.add(post);
  }
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(4.15, 0.84, 0.14),
    new THREE.MeshStandardMaterial({
      map: makeTrackSignTexture(THREE, heading, subheading),
      roughness: 0.76,
      metalness: 0.08
    })
  );
  panel.position.y = 1.34;
  panel.castShadow = true;
  group.add(panel);
  parent.add(group);
}

export function createTrackSystem({ THREE, scene }) {
  const trackGroup = new THREE.Group();
  trackGroup.name = "closed-dirt-track";
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
  const treeSpacing = 6.0;
  const edgeRows = [86.5, 92.0];
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
          scale: 0.82 + treeRandom() * 0.48
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
        scale: 1.0 + treeRandom() * 0.28
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

  // Five jumps at different points around the loop. Their exact positions are
  // shared with physics.js so the visible ramps and collision ramps coincide.
  const jumpDefinitions = [
    { t: 0.105, width: 6.7, length: 7.2, height: 0.72, label: "START STRAIGHT KICKER" },
    { t: 0.285, width: 6.5, length: 6.4, height: 0.88, label: "TABLETOP" },
    { t: 0.455, width: 5.7, length: 5.4, height: 0.56, label: "SHORT KICKER" },
    { t: 0.655, width: 6.4, length: 6.6, height: 0.82, label: "BACK SECTION JUMP" },
    { t: 0.855, width: 5.4, length: 4.4, height: 0.34, label: "ROLLER" }
  ];
  const jumps = jumpDefinitions.map((definition) => {
    const point = centerline.getPointAt(definition.t);
    const tangent = centerline.getTangentAt(definition.t).normalize();
    return {
      ...definition,
      x: point.x,
      z: point.z,
      yaw: Math.atan2(-tangent.x, -tangent.z)
    };
  });

  const jumpMaterial = new THREE.MeshStandardMaterial({
    color: 0x98623c,
    roughness: 1,
    metalness: 0
  });
  for (const jump of jumps) {
    const ramp = new THREE.Mesh(
      makeRampGeometry(THREE, jump.width, jump.length, jump.height),
      jumpMaterial
    );
    ramp.position.set(jump.x, 0.01, jump.z);
    ramp.rotation.y = jump.yaw;
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    ramp.name = jump.label;
    trackGroup.add(ramp);

    // Side markers make the takeoff edges easier to read at speed.
    const markerMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8dfcb,
      roughness: 0.72
    });
    const markerGeometry = new THREE.BoxGeometry(0.14, 0.045, 0.52);
    for (const side of [-1, 1]) {
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.set(side * (jump.width * 0.5 + 0.18), 0.05, 0);
      marker.castShadow = true;
      const markerGroup = new THREE.Group();
      markerGroup.position.set(jump.x, 0, jump.z);
      markerGroup.rotation.y = jump.yaw;
      markerGroup.add(marker);
      trackGroup.add(markerGroup);
    }
  }

  // Alternating red/white safety curbs run around both edges of the entire
  // loop. Instanced meshes keep draw calls low; matching box dimensions are
  // exported for the static collision barriers.
  const barrierWidth = 0.58;
  const barrierHeight = 0.28;
  const barrierSpacingTarget = 2.9;
  const barrierCountPerSide = Math.max(24, Math.ceil(trackLength / barrierSpacingTarget));
  const barrierLength = trackLength / barrierCountPerSide - 0.07;
  const barrierGeometry = new THREE.BoxGeometry(barrierWidth, barrierHeight, 1);
  const redBarrierMaterial = new THREE.MeshStandardMaterial({
    color: 0xd83b31,
    roughness: 0.76,
    metalness: 0.02
  });
  const whiteBarrierMaterial = new THREE.MeshStandardMaterial({
    color: 0xf0eee6,
    roughness: 0.76,
    metalness: 0.02
  });
  const totalBarrierCount = barrierCountPerSide * 2;
  const redBarriers = new THREE.InstancedMesh(
    barrierGeometry,
    redBarrierMaterial,
    Math.ceil(totalBarrierCount / 2)
  );
  const whiteBarriers = new THREE.InstancedMesh(
    barrierGeometry,
    whiteBarrierMaterial,
    Math.floor(totalBarrierCount / 2)
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
  for (const side of [-1, 1]) {
    for (let i = 0; i < barrierCountPerSide; i++) {
      const t = (i + 0.5) / barrierCountPerSide;
      const point = centerline.getPointAt(t);
      const tangent = centerline.getTangentAt(t).normalize();
      const normalX = -tangent.z;
      const normalZ = tangent.x;
      const yaw = Math.atan2(-tangent.x, -tangent.z);
      const x = point.x + normalX * side * (trackHalfWidth + 0.13);
      const z = point.z + normalZ * side * (trackHalfWidth + 0.13);

      dummy.position.set(x, barrierHeight / 2, z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, barrierLength);
      dummy.updateMatrix();
      if ((i + (side > 0 ? 1 : 0)) % 2 === 0) {
        redBarriers.setMatrixAt(redIndex++, dummy.matrix);
      } else {
        whiteBarriers.setMatrixAt(whiteIndex++, dummy.matrix);
      }

      barriers.push({
        x,
        y: barrierHeight / 2,
        z,
        yaw,
        width: barrierWidth,
        height: barrierHeight,
        length: barrierLength
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
  const gantryBoard = new THREE.Mesh(
    new THREE.BoxGeometry(4.8, 0.62, 0.18),
    new THREE.MeshStandardMaterial({
      map: makeTrackSignTexture(THREE, "RC DIRT CUP", "START / FINISH"),
      roughness: 0.7
    })
  );
  gantryBoard.position.set(0, 2.12, 0);
  gantry.add(gantryBoard);
  trackGroup.add(gantry);

  // Trackside signs, marshal markers, tire stacks, and cones provide scale and
  // recognizable RC-racing detail without cluttering the racing line.
  const signLocations = [
    { t: 0.22, side: -1, title: "JUMP ZONE", subtitle: "KEEP IT CLEAN" },
    { t: 0.48, side: 1, title: "TECHNICAL", subtitle: "WATCH THE INSIDE" },
    { t: 0.76, side: -1, title: "BACK SECTION", subtitle: "FULL THROTTLE" }
  ];
  for (const sign of signLocations) {
    const point = centerline.getPointAt(sign.t);
    const tangent = centerline.getTangentAt(sign.t).normalize();
    const normalX = -tangent.z;
    const normalZ = tangent.x;
    const yaw = Math.atan2(-tangent.x, -tangent.z);
    const position = new THREE.Vector3(
      point.x + normalX * sign.side * (trackHalfWidth + 2.3),
      0,
      point.z + normalZ * sign.side * (trackHalfWidth + 2.3)
    );
    addTrackSign(THREE, trackGroup, position, yaw, sign.title, sign.subtitle);
  }

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
    if (!clearOfTrack(x, z, trackHalfWidth + 8.5)) continue;
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
    if (!clearOfTrack(x, z, trackHalfWidth + 6.8)) continue;
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

  return {
    arenaVisuals,
    trackLayout: {
      trackWidth,
      trackHalfWidth,
      trackLength,
      jumps,
      barriers,
      spawn,
      raceGates,
      centerlineSamples
    }
  };
}
