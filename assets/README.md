# Alternate body asset

Place the self-contained Onshape export at `assets/FF_SC_Concept4.gltf`.

The Garage loads this file on demand through Three.js `GLTFLoader`. Keep the exported geometry at its current detail level for the first in-game performance test; the loader applies uniform scaling only and does not simplify or stretch the mesh.
