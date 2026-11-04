// Conservative repair pass for the imported SCX30 Ranger shell.
//
// The source STL contains small left/right mismatches and a few redundant or
// degenerate faces. This pass regularizes mirrored points without scaling the
// shell, keeps the original split-edge shading, and never touches vehicle
// physics or suspension attachment data.

export function cleanRangerShellGeometry(THREE, geometry) {
  if (!geometry || typeof geometry.getAttribute !== "function") return geometry;

  const positionAttribute = geometry.getAttribute("position");
  const normalAttribute = geometry.getAttribute("normal");
  const indexAttribute = geometry.getIndex();
  if (!positionAttribute || !normalAttribute || !indexAttribute) return geometry;

  const sourcePositions = positionAttribute.array;
  const sourceNormals = normalAttribute.array;
  const sourceIndices = indexAttribute.array;
  const vertexCount = positionAttribute.count;
  if (!vertexCount || sourceIndices.length < 3) return geometry;

  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) return geometry;

  const width = bounds.max.x - bounds.min.x;
  const height = bounds.max.y - bounds.min.y;
  const length = bounds.max.z - bounds.min.z;
  const diagonal = Math.hypot(width, height, length);
  if (!Number.isFinite(diagonal) || diagonal < 1e-5 || width < 1e-5) return geometry;

  // The imported body is centered around its own X midpoint. Deriving this
  // plane from the mesh avoids shifting the shell if its source origin differs.
  const centerX = (bounds.min.x + bounds.max.x) * 0.5;
  const matchTolerance = Math.max(
    0.006,
    Math.min(width * 0.035, diagonal * 0.012)
  );
  const cellSize = matchTolerance;
  const cellKey = (x, y, z) =>
    Math.floor(x / cellSize) + "," +
    Math.floor(y / cellSize) + "," +
    Math.floor(z / cellSize);

  // Index all vertices spatially so mirrored counterparts can be found in
  // linear time rather than comparing every vertex against every other one.
  const spatialCells = new Map();
  for (let i = 0; i < vertexCount; i++) {
    const offset = i * 3;
    const key = cellKey(
      sourcePositions[offset],
      sourcePositions[offset + 1],
      sourcePositions[offset + 2]
    );
    let bucket = spatialCells.get(key);
    if (!bucket) {
      bucket = [];
      spatialCells.set(key, bucket);
    }
    bucket.push(i);
  }

  const repairedPositions = new Float32Array(sourcePositions);
  const repairedNormals = new Float32Array(sourceNormals);
  const minimumSideOffset = Math.max(diagonal * 0.0005, 0.00025);
  let matchedVertexCount = 0;

  for (let i = 0; i < vertexCount; i++) {
    const offset = i * 3;
    const x = sourcePositions[offset];
    const sideOffset = x - centerX;
    if (Math.abs(sideOffset) <= minimumSideOffset) continue;

    const y = sourcePositions[offset + 1];
    const z = sourcePositions[offset + 2];
    const targetX = centerX - sideOffset;
    const cellX = Math.floor(targetX / cellSize);
    const cellY = Math.floor(y / cellSize);
    const cellZ = Math.floor(z / cellSize);
    let bestIndex = -1;
    let bestDistance = Infinity;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = spatialCells.get(
            (cellX + dx) + "," + (cellY + dy) + "," + (cellZ + dz)
          );
          if (!bucket) continue;

          for (const candidate of bucket) {
            if (candidate === i) continue;
            const otherOffset = candidate * 3;
            const otherX = sourcePositions[otherOffset];
            if ((otherX - centerX) * sideOffset >= 0) continue;

            const nx = (otherX - targetX) / matchTolerance;
            const ny = (sourcePositions[otherOffset + 1] - y) / matchTolerance;
            const nz = (sourcePositions[otherOffset + 2] - z) / matchTolerance;
            const distance = nx * nx + ny * ny + nz * nz;
            if (distance < bestDistance && distance <= 1) {
              bestDistance = distance;
              bestIndex = candidate;
            }
          }
        }
      }
    }

    if (bestIndex < 0) continue;

    const otherOffset = bestIndex * 3;
    const averageHalfWidth = (
      Math.abs(sideOffset) +
      Math.abs(sourcePositions[otherOffset] - centerX)
    ) * 0.5;

    // Use the same midpoint for both halves while preserving the shell's
    // overall width and local contour. No global or axis-specific scaling.
    repairedPositions[offset] =
      centerX + Math.sign(sideOffset) * averageHalfWidth;
    repairedPositions[offset + 1] =
      (y + sourcePositions[otherOffset + 1]) * 0.5;
    repairedPositions[offset + 2] =
      (z + sourcePositions[otherOffset + 2]) * 0.5;

    // Mirror-average the supplied normals instead of recomputing them. The
    // source deliberately splits vertices at sharp panel seams, and retaining
    // those normals avoids washing out hood, cab, and fender edges.
    const nx = (sourceNormals[offset] - sourceNormals[otherOffset]) * 0.5;
    const ny = (sourceNormals[offset + 1] + sourceNormals[otherOffset + 1]) * 0.5;
    const nz = (sourceNormals[offset + 2] + sourceNormals[otherOffset + 2]) * 0.5;
    const normalLength = Math.hypot(nx, ny, nz);
    if (normalLength > 1e-6) {
      repairedNormals[offset] = nx / normalLength;
      repairedNormals[offset + 1] = ny / normalLength;
      repairedNormals[offset + 2] = nz / normalLength;
    }

    matchedVertexCount++;
  }

  positionAttribute.array.set(repairedPositions);
  positionAttribute.needsUpdate = true;
  normalAttribute.array.set(repairedNormals);
  normalAttribute.needsUpdate = true;

  // Remove zero-area and duplicate triangles. The position-based face key also
  // catches duplicated faces whose vertices were split for normal seams.
  const positionKeyPrecision = Math.max(diagonal * 1e-6, 1e-7);
  const vertexKeys = new Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    const offset = i * 3;
    vertexKeys[i] =
      Math.round(repairedPositions[offset] / positionKeyPrecision) + "," +
      Math.round(repairedPositions[offset + 1] / positionKeyPrecision) + "," +
      Math.round(repairedPositions[offset + 2] / positionKeyPrecision);
  }

  const minimumAreaSquared = Math.max(
    Math.pow(diagonal, 4) * 1e-14,
    1e-20
  );
  const keptIndices = [];
  const seenFaces = new Set();
  let removedFaceCount = 0;

  for (let i = 0; i + 2 < sourceIndices.length; i += 3) {
    const a = sourceIndices[i];
    const b = sourceIndices[i + 1];
    const c = sourceIndices[i + 2];
    if (a >= vertexCount || b >= vertexCount || c >= vertexCount ||
        a === b || b === c || c === a) {
      removedFaceCount++;
      continue;
    }

    const ao = a * 3;
    const bo = b * 3;
    const co = c * 3;
    const abx = repairedPositions[bo] - repairedPositions[ao];
    const aby = repairedPositions[bo + 1] - repairedPositions[ao + 1];
    const abz = repairedPositions[bo + 2] - repairedPositions[ao + 2];
    const acx = repairedPositions[co] - repairedPositions[ao];
    const acy = repairedPositions[co + 1] - repairedPositions[ao + 1];
    const acz = repairedPositions[co + 2] - repairedPositions[ao + 2];
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    const areaSquared =
      crossX * crossX + crossY * crossY + crossZ * crossZ;

    if (!Number.isFinite(areaSquared) || areaSquared <= minimumAreaSquared) {
      removedFaceCount++;
      continue;
    }

    const faceKey = [
      vertexKeys[a],
      vertexKeys[b],
      vertexKeys[c]
    ].sort().join("|");

    if (seenFaces.has(faceKey)) {
      removedFaceCount++;
      continue;
    }
    seenFaces.add(faceKey);
    keptIndices.push(a, b, c);
  }

  // Keep the original index width and avoid replacing a valid mesh with an
  // unexpectedly tiny result if a source file contains unusual topology.
  if (keptIndices.length >= 3 &&
      keptIndices.length >= sourceIndices.length * 0.5) {
    const IndexArray = sourceIndices instanceof Uint32Array
      ? Uint32Array
      : Uint16Array;
    geometry.setIndex(
      new THREE.BufferAttribute(new IndexArray(keptIndices), 1)
    );
  } else {
    removedFaceCount = 0;
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = geometry.userData || {};
  geometry.userData.rangerShellCleanup = {
    matchedVertices: matchedVertexCount,
    removedFaces: removedFaceCount,
    remainingFaces: geometry.getIndex().count / 3
  };

  return geometry;
}
