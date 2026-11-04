// Conservative topology-only cleanup for the imported SCX30 Ranger shell.
//
// IMPORTANT: This routine never changes vertex positions or normals. It only
// removes triangles that are mathematically degenerate or exact duplicate
// surfaces, which can otherwise cause dark patches and z-fighting.

export function cleanRangerShellGeometry(THREE, geometry) {
  if (!geometry || typeof geometry.getAttribute !== "function") return geometry;

  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  if (!position || !index || !index.array || index.count < 3) return geometry;

  const positions = position.array;
  const indices = index.array;
  const vertexCount = position.count;
  if (!vertexCount || positions.length < vertexCount * 3) return geometry;

  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) return geometry;

  const width = bounds.max.x - bounds.min.x;
  const height = bounds.max.y - bounds.min.y;
  const length = bounds.max.z - bounds.min.z;
  const diagonal = Math.hypot(width, height, length);
  if (!Number.isFinite(diagonal) || diagonal < 1e-6) return geometry;

  const coordinatePrecision = Math.max(diagonal * 1e-7, 1e-8);
  const vertexKeys = new Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    const offset = i * 3;
    const x = positions[offset];
    const y = positions[offset + 1];
    const z = positions[offset + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return geometry;
    }
    vertexKeys[i] =
      Math.round(x / coordinatePrecision) + "," +
      Math.round(y / coordinatePrecision) + "," +
      Math.round(z / coordinatePrecision);
  }

  const minimumAreaSquared = Math.max(
    Math.pow(diagonal, 4) * 1e-14,
    1e-20
  );
  const keptIndices = [];
  const seenFaces = new Set();
  let removedDegenerate = 0;
  let removedDuplicate = 0;

  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = indices[i];
    const b = indices[i + 1];
    const c = indices[i + 2];

    if (a >= vertexCount || b >= vertexCount || c >= vertexCount ||
        a === b || b === c || c === a) {
      removedDegenerate++;
      continue;
    }

    const ao = a * 3;
    const bo = b * 3;
    const co = c * 3;
    const abx = positions[bo] - positions[ao];
    const aby = positions[bo + 1] - positions[ao + 1];
    const abz = positions[bo + 2] - positions[ao + 2];
    const acx = positions[co] - positions[ao];
    const acy = positions[co + 1] - positions[ao + 1];
    const acz = positions[co + 2] - positions[ao + 2];
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    const areaSquared =
      crossX * crossX + crossY * crossY + crossZ * crossZ;

    if (!Number.isFinite(areaSquared) || areaSquared <= minimumAreaSquared) {
      removedDegenerate++;
      continue;
    }

    // Canonical position key catches exact duplicate triangles even when
    // source normals caused their vertices to be stored as separate records.
    const faceKey = [
      vertexKeys[a],
      vertexKeys[b],
      vertexKeys[c]
    ].sort().join("|");

    if (seenFaces.has(faceKey)) {
      removedDuplicate++;
      continue;
    }

    seenFaces.add(faceKey);
    keptIndices.push(a, b, c);
  }

  const removedFaces = removedDegenerate + removedDuplicate;
  const minimumKeptRatio = 0.90;
  if (keptIndices.length < 3 ||
      keptIndices.length < indices.length * minimumKeptRatio) {
    // Treat an unexpectedly high removal count as a topology warning. Keep
    // the original mesh intact rather than risk deleting real body panels.
    geometry.userData = geometry.userData || {};
    geometry.userData.rangerShellCleanup = {
      applied: false,
      reason: "Removal threshold exceeded; original faces preserved",
      removedFaces: 0,
      vertexPositionsChanged: false
    };
    return geometry;
  }

  if (removedFaces > 0) {
    const IndexArray = indices instanceof Uint32Array
      ? Uint32Array
      : Uint16Array;
    geometry.setIndex(new THREE.BufferAttribute(new IndexArray(keptIndices), 1));
  }

  geometry.userData = geometry.userData || {};
  geometry.userData.rangerShellCleanup = {
    applied: removedFaces > 0,
    removedDegenerate,
    removedDuplicate,
    remainingFaces: keptIndices.length / 3,
    vertexPositionsChanged: false,
    vertexNormalsChanged: false
  };

  return geometry;
}
