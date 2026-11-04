import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/loaders/GLTFLoader.js";
import modelMetadata from "./assets/ff-sc-concept4-metadata.js";

// Load the full-detail Onshape shell only when the player selects it in the garage.
// The mesh is intentionally not decimated for this first performance test.
export async function loadConcept4Shell(THREE) {
  const dataModules = await Promise.all([
  import("./assets/ff-sc-concept4-data-00.js"),
  import("./assets/ff-sc-concept4-data-01.js"),
  import("./assets/ff-sc-concept4-data-02.js"),
  import("./assets/ff-sc-concept4-data-03.js"),
  import("./assets/ff-sc-concept4-data-04.js"),
  import("./assets/ff-sc-concept4-data-05.js"),
  import("./assets/ff-sc-concept4-data-06.js"),
  import("./assets/ff-sc-concept4-data-07.js"),
  import("./assets/ff-sc-concept4-data-08.js"),
  import("./assets/ff-sc-concept4-data-09.js"),
  import("./assets/ff-sc-concept4-data-10.js"),
  import("./assets/ff-sc-concept4-data-11.js"),
  import("./assets/ff-sc-concept4-data-12.js"),
  import("./assets/ff-sc-concept4-data-13.js")
  ]);
  const embeddedBuffer = dataModules.map((module) => module.default).join("");
  if (!embeddedBuffer || embeddedBuffer.length < 1000) {
    throw new Error("The Concept4 body data is incomplete.");
  }
  const document = {
    ...modelMetadata,
    buffers: modelMetadata.buffers.map((buffer, index) => index === 0
      ? { ...buffer, uri: "data:application/octet-stream;base64," + embeddedBuffer }
      : buffer)
  };
  const loader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => {
    loader.parse(JSON.stringify(document), "", resolve, reject);
  });
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  if (bounds.isEmpty()) throw new Error("The Concept4 body has no visible geometry.");
  const center = bounds.getCenter(new THREE.Vector3());
  const bottom = bounds.min.y;
  model.position.set(-center.x, -bottom, -center.z);

  // Conversion from CAD units to game units is uniform on all three axes.
  // This keeps the supplied body proportions intact and aligns its wheel arches
  // with the existing 0.951-unit chassis wheelbase as an initial fit.
  const fitGroup = new THREE.Group();
  fitGroup.name = "FF SC Concept4 full-detail shell";
  fitGroup.scale.setScalar(0.309);
  fitGroup.add(model);

  const paintedBody = new THREE.MeshStandardMaterial({
    color: 0xff5b20,
    roughness: 0.6,
    metalness: 0.02,
    side: THREE.DoubleSide
  });
  const oldMaterials = new Set();
  let meshCount = 0;
  model.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) if (material) oldMaterials.add(material);
    object.material = paintedBody;
    object.castShadow = false;
    object.receiveShadow = false;
    meshCount++;
  });
  for (const material of oldMaterials) material.dispose?.();
  if (!meshCount) throw new Error("The Concept4 body contains no renderable meshes.");
  return { group: fitGroup, meshCount, bounds: bounds.getSize(new THREE.Vector3()) };
}
