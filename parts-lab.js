import { RoundedBoxGeometry } from "https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/utils/BufferGeometryUtils.js";

// Standalone WIP component display. These models are deliberately not connected
// to the vehicle, its physics body, or either selectable chassis.
export function createPartsLabSystem(game) {
  const { THREE, scene, localCar, renderer } = game;
  const $ = game.$;

  const materials = {
    shell: new THREE.MeshStandardMaterial({ color: 0x17212b, roughness: 0.58, metalness: 0.32 }),
    shellLight: new THREE.MeshStandardMaterial({ color: 0x354451, roughness: 0.48, metalness: 0.38 }),
    black: new THREE.MeshStandardMaterial({ color: 0x080d12, roughness: 0.72, metalness: 0.14 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x11161b, roughness: 0.92, metalness: 0.02 }),
    alloy: new THREE.MeshStandardMaterial({ color: 0xabb8c1, roughness: 0.28, metalness: 0.82 }),
    brightAlloy: new THREE.MeshStandardMaterial({ color: 0xd7e0e6, roughness: 0.22, metalness: 0.88 }),
    darkAlloy: new THREE.MeshStandardMaterial({ color: 0x52616b, roughness: 0.34, metalness: 0.82 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xb66a3d, roughness: 0.35, metalness: 0.78 }),
    red: new THREE.MeshStandardMaterial({ color: 0xa82730, roughness: 0.42, metalness: 0.4 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xf07827, roughness: 0.4, metalness: 0.42 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x287fb5, roughness: 0.36, metalness: 0.5 }),
    greenBoard: new THREE.MeshStandardMaterial({ color: 0x174d42, roughness: 0.62, metalness: 0.12 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd4aa50, roughness: 0.26, metalness: 0.84 }),
    white: new THREE.MeshStandardMaterial({ color: 0xe2e8eb, roughness: 0.5, metalness: 0.1 }),
  };

  const labRoot = new THREE.Group();
  labRoot.name = "WIP Parts Lab - standalone display";
  labRoot.visible = false;
  scene.add(labRoot);

  const showcase = new THREE.Group();
  labRoot.add(showcase);

  function addBox(parent, size, position, material, radius = 0.035, rotation = [0, 0, 0]) {
    const smallest = Math.min(size[0], size[1], size[2]);
    const geometry = radius > 0
      ? new RoundedBoxGeometry(size[0], size[1], size[2], 3, Math.min(radius, smallest * 0.44))
      : new THREE.BoxGeometry(size[0], size[1], size[2]);
    const object = new THREE.Mesh(geometry, material);
    object.position.set(position[0], position[1], position[2]);
    object.rotation.set(rotation[0], rotation[1], rotation[2]);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  function addCylinder(parent, radiusTop, radiusBottom, length, material, position, rotation = [0, 0, 0], radialSegments = 32) {
    const object = new THREE.Mesh(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, length, radialSegments, 1),
      material
    );
    object.position.set(position[0], position[1], position[2]);
    object.rotation.set(rotation[0], rotation[1], rotation[2]);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  function addTorus(parent, radius, tube, material, position, rotation = [0, 0, 0], tubularSegments = 48) {
    const object = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, tubularSegments), material);
    object.position.set(position[0], position[1], position[2]);
    object.rotation.set(rotation[0], rotation[1], rotation[2]);
    object.castShadow = true;
    parent.add(object);
    return object;
  }

  function addTube(parent, points, radius, material, radialSegments = 8) {
    const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(point[0], point[1], point[2])));
    const object = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(16, points.length * 9), radius, radialSegments, false), material);
    object.castShadow = true;
    parent.add(object);
    return object;
  }

  function addScrew(parent, position, size = 0.045, material = materials.brightAlloy, axis = "y") {
    const rotation = axis === "z" ? [Math.PI / 2, 0, 0] : [0, 0, 0];
    addCylinder(parent, size, size, 0.025, material, position, rotation, 16);
    const slot = addBox(parent,
      axis === "z" ? [size * 1.15, 0.012, 0.012] : [size * 1.15, 0.012, 0.012],
      [position[0], position[1] + (axis === "y" ? 0.014 : 0), position[2]],
      materials.black, 0.002);
    if (axis === "z") slot.rotation.z = 0;
  }

  function makeLabelTexture(title, subtitle = "") {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    context.fillStyle = "#111c27";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#6cb8e8";
    context.lineWidth = 8;
    context.strokeRect(9, 9, canvas.width - 18, canvas.height - 18);
    context.fillStyle = "#f3f7fa";
    context.font = "900 48px Arial, sans-serif";
    context.fillText(String(title).toUpperCase(), 28, 111, 570);
    context.fillStyle = "#8bcdf5";
    context.font = "700 25px Arial, sans-serif";
    context.fillText(String(subtitle).toUpperCase(), 30, 169, 570);
    context.fillStyle = "#627789";
    context.font = "600 18px Arial, sans-serif";
    context.fillText("RC COMPONENT DEVELOPMENT", 30, 216, 570);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
    return texture;
  }

  function addTopLabel(parent, title, subtitle, width, height, position) {
    const texture = makeLabelTexture(title, subtitle);
    const object = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.62, metalness: 0.12 })
    );
    object.position.set(position[0], position[1], position[2]);
    object.rotation.x = -Math.PI / 2;
    object.castShadow = false;
    parent.add(object);
    return object;
  }


  // Merge static component details by material so hundreds of tiny separate
  // meshes become a handful of draw calls. Dynamic pivots are passed as
  // exclusions and batch their own contents separately.
  function batchStaticMeshes(root, excludedObjects = [], shadowOptions = {}) {
    const excluded = new Set(excludedObjects);
    const rootInverse = new THREE.Matrix4();
    root.updateMatrixWorld(true);
    rootInverse.copy(root.matrixWorld).invert();
    const buckets = new Map();

    function collect(parent) {
      for (const child of [...parent.children]) {
        if (excluded.has(child)) continue;
        if (child.isMesh && child.geometry && child.material && !Array.isArray(child.material)) {
          child.updateWorldMatrix(true, false);
          const geometry = child.geometry.clone();
          geometry.clearGroups();
          const relative = new THREE.Matrix4().multiplyMatrices(rootInverse, child.matrixWorld);
          geometry.applyMatrix4(relative);
          let bucket = buckets.get(child.material);
          if (!bucket) {
            bucket = { geometries: [], originals: [], castShadow: false, receiveShadow: false };
            buckets.set(child.material, bucket);
          }
          bucket.geometries.push(geometry);
          bucket.originals.push(child);
          bucket.castShadow ||= child.castShadow;
          bucket.receiveShadow ||= child.receiveShadow;
        } else {
          collect(child);
        }
      }
    }
    collect(root);

    let batches = 0;
    for (const [material, bucket] of buckets) {
      const geometry = mergeGeometries(bucket.geometries, false);
      for (const sourceGeometry of bucket.geometries) sourceGeometry.dispose();
      if (!geometry) {
        console.warn("Parts Lab geometry batch was skipped; keeping the original meshes.");
        continue;
      }
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = (root.name || "component") + " static geometry batch";
      mesh.castShadow = shadowOptions.castShadow ?? bucket.castShadow;
      mesh.receiveShadow = shadowOptions.receiveShadow ?? bucket.receiveShadow;
      root.add(mesh);
      for (const original of bucket.originals) {
        original.parent?.remove(original);
        original.geometry.dispose();
      }
      batches++;
    }
    return batches;
  }

  function addSideLabel(parent, title, subtitle, width, height, position) {
    const texture = makeLabelTexture(title, subtitle);
    const object = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.72, metalness: 0.08 })
    );
    object.position.set(position[0], position[1], position[2]);
    object.castShadow = false;
    parent.add(object);
    return object;
  }

  // A low-profile, machined display plinth anchors each isolated component.
  const plinthGroup = new THREE.Group();
  plinthGroup.name = "Shared WIP component display plinth";
  showcase.add(plinthGroup);
  const plinthLower = addCylinder(plinthGroup, 1.22, 1.32, 0.16, materials.black, [0, 0.08, 0], [0, 0, 0], 72);
  const plinthUpper = addCylinder(plinthGroup, 1.2, 1.2, 0.085, materials.shellLight, [0, 0.19, 0], [0, 0, 0], 72);
  addTorus(plinthGroup, 1.205, 0.018, materials.blue, [0, 0.238, 0], [Math.PI / 2, 0, 0], 72);
  const plinthTop = addCylinder(plinthGroup, 1.08, 1.08, 0.035, materials.black, [0, 0.25, 0], [0, 0, 0], 72);
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2;
    addCylinder(plinthGroup, 0.025, 0.025, 0.018, materials.brightAlloy,
      [Math.cos(angle) * 1.12, 0.172, Math.sin(angle) * 1.12], [0, 0, 0], 12);
  }

  batchStaticMeshes(plinthGroup);

  const servoModel = new THREE.Group();
  servoModel.name = "Detailed digital steering servo";
  servoModel.position.y = 0.14;
  servoModel.scale.y = 1.10;
  showcase.add(servoModel);

  function buildServo() {
    const body = new THREE.Group();
    body.name = "One-piece standard servo housing";
    servoModel.add(body);

    // Single molded body with a thin inset lid seam. The old stacked shells
    // created a false gap through the middle of the servo.
    addBox(body, [1.15, 0.74, 0.58], [0, 0.49, 0], materials.shell, 0.075);
    addBox(body, [1.105, 0.035, 0.54], [0, 0.858, 0], materials.shellLight, 0.025);
    addBox(body, [1.12, 0.012, 0.55], [0, 0.835, 0], materials.black, 0.006);

    // Integrated mounting ears; they overlap the housing instead of looking
    // like separate floating plates.
    for (const side of [-1, 1]) {
      addBox(body, [0.34, 0.095, 0.60], [side * 0.64, 0.73, 0], materials.shell, 0.035);
      addCylinder(body, 0.052, 0.052, 0.018, materials.darkAlloy,
        [side * 0.70, 0.785, 0], [0, 0, 0], 20);
    }

    // A clean front identification strip, not a top decal intersecting
    // the output shaft or floating above the rectangular case.
    addBox(body, [0.62, 0.145, 0.012], [-0.18, 0.56, 0.292], materials.black, 0.012);
    addSideLabel(body, "DIGITAL SERVO", "STANDARD / 25T", 0.55, 0.115, [-0.18, 0.56, 0.300]);

    // The output bearing and spline are visibly seated on the upper lid.
    const outputX = 0.25;
    const outputZ = 0.015;
    addCylinder(body, 0.142, 0.142, 0.085, materials.darkAlloy,
      [outputX, 0.885, outputZ], [0, 0, 0], 32);
    addTorus(body, 0.12, 0.016, materials.brightAlloy,
      [outputX, 0.932, outputZ], [0, 0, 0], 32);
    addCylinder(body, 0.055, 0.055, 0.205, materials.brightAlloy,
      [outputX, 1.015, outputZ], [0, 0, 0], 24);
    addTorus(body, 0.055, 0.008, materials.darkAlloy,
      [outputX, 1.095, outputZ], [0, 0, 0], 24);

    // The horn pivot starts directly at the top of the spline. Its hub,
    // single arm and adjustment holes stay above the lid throughout motion.
    const hornPivot = new THREE.Group();
    hornPivot.name = "Animated servo output horn";
    hornPivot.position.set(outputX, 1.125, outputZ);
    body.add(hornPivot);
    addCylinder(hornPivot, 0.078, 0.078, 0.072, materials.darkAlloy,
      [0, 0.025, 0], [0, 0, 0], 24);
    addCylinder(hornPivot, 0.042, 0.042, 0.045, materials.brightAlloy,
      [0, 0.075, 0], [0, 0, 0], 20);
    addCylinder(hornPivot, 0.022, 0.022, 0.03, materials.black,
      [0, 0.11, 0], [0, 0, 0], 16);
    addBox(hornPivot, [0.76, 0.052, 0.105], [0.31, 0.035, 0], materials.darkAlloy, 0.028);
    addBox(hornPivot, [0.17, 0.065, 0.16], [0, 0.035, 0], materials.shellLight, 0.025);
    addScrew(hornPivot, [0, 0.15, 0], 0.023, materials.brightAlloy);
    for (const x of [0.18, 0.36, 0.54]) {
      addTorus(hornPivot, 0.029, 0.007, materials.black,
        [x, 0.065, 0], [0, 0, 0], 16);
      addCylinder(hornPivot, 0.012, 0.012, 0.018, materials.brightAlloy,
        [x, 0.067, 0], [0, 0, 0], 12);
    }

    // Short, neat receiver lead exits one rear corner and terminates in a
    // small three-pin plug; no loose connector blocks beneath the body.
    const wireColors = [materials.black, materials.red, materials.white];
    for (let i = 0; i < 3; i++) {
      const x = 0.015 + (i - 1) * 0.035;
      addTube(body, [
        [x, 0.36, -0.27],
        [x, 0.29, -0.40],
        [x + 0.015, 0.25, -0.54],
        [x + 0.015, 0.25, -0.66]
      ], 0.014, wireColors[i], 6);
    }
    addBox(body, [0.17, 0.105, 0.12], [0.015, 0.25, -0.70], materials.black, 0.018);
    addBox(body, [0.125, 0.025, 0.035], [0.015, 0.31, -0.70], materials.shellLight, 0.006);
    for (let i = 0; i < 3; i++) {
      addCylinder(body, 0.012, 0.012, 0.025, materials.gold,
        [-0.02 + i * 0.035, 0.25, -0.772], [Math.PI / 2, 0, 0], 10);
    }

    return { body, hornPivot };
  }

  const servoParts = buildServo();
  batchStaticMeshes(servoParts.body, [servoParts.hornPivot]);
  batchStaticMeshes(servoParts.hornPivot, [], { castShadow: false, receiveShadow: false });

  const servoParts = buildServo();
  batchStaticMeshes(servoParts.body, [servoParts.hornPivot]);
  batchStaticMeshes(servoParts.hornPivot, [], { castShadow: false, receiveShadow: false });



  const motorModel = new THREE.Group();
  motorModel.name = "Detailed 540 brushless motor";
  motorModel.position.y = 0.15;
  motorModel.visible = false;
  showcase.add(motorModel);

  function buildMotor() {
    const body = new THREE.Group();
    body.name = "Aligned 540 brushless motor";
    motorModel.add(body);
    const axisZ = [Math.PI / 2, 0, 0];

    // Cylindrical can and two end bells share one centreline (the Z axis).
    addCylinder(body, 0.53, 0.53, 1.18, materials.shellLight, [0, 0.84, 0], axisZ, 56);
    addCylinder(body, 0.535, 0.535, 0.10, materials.darkAlloy, [0, 0.84, 0.60], axisZ, 56);
    addCylinder(body, 0.515, 0.515, 0.10, materials.shell, [0, 0.84, -0.60], axisZ, 56);
    // Retaining rims are placed on the actual end-bell faces, not partway
    // along the curved can where they read as detached metal hoops.
    addTorus(body, 0.505, 0.018, materials.brightAlloy, [0, 0.84, 0.652], [0, 0, 0], 56);
    addTorus(body, 0.49, 0.016, materials.black, [0, 0.84, -0.652], [0, 0, 0], 56);
    addCylinder(body, 0.225, 0.225, 0.035, materials.black, [0, 0.84, 0.665], axisZ, 40);
    addCylinder(body, 0.145, 0.145, 0.045, materials.brightAlloy, [0, 0.84, 0.705], axisZ, 40);

    // Shallow cooling slots are embedded tangent to the curved can. Their
    // small radial thickness prevents the old block-like floating appearance.
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2;
      const x = Math.cos(angle);
      const y = Math.sin(angle);
      addBox(body, [0.006, 0.13, 0.16],
        [x * 0.526, 0.84 + y * 0.526, 0.02],
        materials.black, 0.002, [0, 0, angle]);
    }

    // Flush fasteners on the motor end bell.
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * Math.PI * 2;
      const x = Math.cos(angle) * 0.39;
      const y = 0.84 + Math.sin(angle) * 0.39;
      addScrew(body, [x, y, 0.666], 0.028, materials.brightAlloy, "z");
    }

    // The display mount contacts the lower arc of the motor can and sits
    // flat on the pedestal rather than floating under it.
    addBox(body, [0.88, 0.12, 0.90], [0, 0.18, -0.02], materials.darkAlloy, 0.045);
    addBox(body, [0.69, 0.10, 0.72], [0, 0.27, -0.02], materials.black, 0.025);
    for (const x of [-0.34, 0.34]) {
      addBox(body, [0.12, 0.22, 0.92], [x, 0.35, -0.02], materials.shellLight, 0.025);
      for (const z of [-0.35, 0.31]) addScrew(body, [x, 0.47, z], 0.03);
    }

    // Straight motor shaft exits the front end bell. The pinion is fitted
    // close to the bearing face instead of floating at the extreme tip.
    const shaftGroup = new THREE.Group();
    shaftGroup.name = "Aligned rotating motor shaft and pinion";
    shaftGroup.position.set(0, 0.84, 0.65);
    body.add(shaftGroup);
    addCylinder(shaftGroup, 0.052, 0.052, 0.62, materials.brightAlloy,
      [0, 0, 0.31], axisZ, 24);
    addCylinder(shaftGroup, 0.105, 0.105, 0.15, materials.darkAlloy,
      [0, 0, 0.20], axisZ, 28);
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2;
      addBox(shaftGroup, [0.028, 0.045, 0.14],
        [Math.cos(angle) * 0.104, Math.sin(angle) * 0.104, 0.20],
        materials.brightAlloy, 0.004, [0, 0, angle]);
    }
    addCylinder(shaftGroup, 0.018, 0.018, 0.042, materials.black,
      [0.105, 0, 0.20], [0, 0, Math.PI / 2], 12);

    // Three evenly spaced silicone phase leads leave the rear end bell via
    // individual seated grommets, then run together as a tidy parallel bundle.
    const phaseColors = [materials.blue, materials.orange, materials.gold];
    const leadXs = [-0.13, 0, 0.13];
    for (let i = 0; i < leadXs.length; i++) {
      const x = leadXs[i];
      addTorus(body, 0.043, 0.009, materials.black, [x, 0.97, -0.656], [0, 0, 0], 20);
      addTube(body, [
        [x, 0.97, -0.66],
        [x, 0.97, -0.83],
        [x * 1.12, 0.93, -1.05],
        [x * 1.18, 0.91, -1.24]
      ], 0.027, phaseColors[i], 7);
      addCylinder(body, 0.047, 0.047, 0.16, materials.black,
        [x * 1.18, 0.91, -1.30], [Math.PI / 2, 0, 0], 18);
      addCylinder(body, 0.031, 0.031, 0.035, materials.gold,
        [x * 1.18, 0.91, -1.397], [Math.PI / 2, 0, 0], 18);
    }

    return { body, shaftGroup };
  }

  const motorParts = buildMotor();
  const motorShaft = motorParts.shaftGroup;
  batchStaticMeshes(motorParts.body, [motorShaft]);
  batchStaticMeshes(motorShaft, [], { castShadow: false, receiveShadow: false });

  const motorParts = buildMotor();
  const motorShaft = motorParts.shaftGroup;
  batchStaticMeshes(motorParts.body, [motorShaft]);
  batchStaticMeshes(motorShaft, [], { castShadow: false, receiveShadow: false });

  const escModel = new THREE.Group();
  escModel.name = "Detailed brushless electronic speed controller";
  escModel.position.y = 0.19;
  escModel.scale.y = 0.94;
  escModel.visible = false;
  showcase.add(escModel);

  function buildEsc() {
    const body = new THREE.Group();
    body.name = "Tall 1/10 scale brushless ESC";
    escModel.add(body);

    // Typical 1/10 truck ESC proportions: compact square footprint with a
    // substantial case depth and cooling hardware mounted above it.
    for (const x of [-0.55, 0.55]) {
      for (const z of [-0.45, 0.45]) {
        addBox(body, [0.18, 0.15, 0.18], [x, 0.16, z], materials.rubber, 0.04);
      }
    }
    addBox(body, [1.38, 0.075, 1.16], [0, 0.205, 0], materials.black, 0.06);
    addBox(body, [1.32, 0.49, 1.10], [0, 0.48, 0], materials.shell, 0.085);
    addBox(body, [1.29, 0.13, 1.075], [0, 0.785, 0], materials.black, 0.055);
    addBox(body, [1.20, 0.025, 0.99], [0, 0.862, 0], materials.shellLight, 0.022);

    // Raised side rails and horizontal case ribs make the enclosure read as
    // a deeper molded controller body rather than a thin slab.
    for (const z of [-0.555, 0.555]) {
      addBox(body, [1.12, 0.055, 0.035], [0, 0.32, z], materials.darkAlloy, 0.012);
      addBox(body, [1.12, 0.055, 0.035], [0, 0.46, z], materials.shellLight, 0.012);
      addBox(body, [1.12, 0.055, 0.035], [0, 0.60, z], materials.darkAlloy, 0.012);
    }
    for (const x of [-0.59, 0.59]) {
      for (const z of [-0.46, 0.46]) {
        addScrew(body, [x, 0.87, z], 0.03, materials.brightAlloy);
      }
    }

    // Broad aluminum cooling plate and upright fins on the rear half.
    addBox(body, [1.04, 0.075, 0.43], [0, 0.91, -0.325], materials.darkAlloy, 0.025);
    for (let i = 0; i < 9; i++) {
      const x = -0.46 + i * 0.115;
      addBox(body, [0.052, 0.22, 0.40], [x, 1.055, -0.325], materials.alloy, 0.012);
      addBox(body, [0.012, 0.16, 0.37], [x + 0.027, 1.06, -0.325], materials.darkAlloy, 0.004);
    }
    addBox(body, [1.00, 0.035, 0.045], [0, 1.18, -0.325], materials.brightAlloy, 0.008);

    // Two capacitor cans beside the heat-sink bank, with stamped vent tops.
    for (const x of [-0.54, 0.54]) {
      addCylinder(body, 0.105, 0.105, 0.30, materials.alloy, [x, 0.98, -0.43], [0, 0, 0], 28);
      addCylinder(body, 0.097, 0.097, 0.035, materials.black, [x, 1.147, -0.43], [0, 0, 0], 28);
      addTorus(body, 0.078, 0.010, materials.brightAlloy, [x, 1.168, -0.43], [0, 0, 0], 24);
      addBox(body, [0.026, 0.25, 0.07], [x, 0.98, -0.43], materials.darkAlloy, 0.008);
    }

    // Raised square cooling-fan shroud with vertical side walls.
    const fanCenterZ = 0.20;
    addBox(body, [0.90, 0.075, 0.90], [0, 0.925, fanCenterZ], materials.darkAlloy, 0.045);
    for (const x of [-0.43, 0.43]) {
      addBox(body, [0.075, 0.25, 0.92], [x, 1.065, fanCenterZ], materials.shellLight, 0.025);
    }
    for (const zOffset of [-0.43, 0.43]) {
      addBox(body, [0.92, 0.25, 0.075], [0, 1.065, fanCenterZ + zOffset], materials.shellLight, 0.025);
    }

    // Seven swept fan blades are one rotating assembly, not an effect sprite.
    const fanRotor = new THREE.Group();
    fanRotor.name = "Animated seven blade ESC fan";
    fanRotor.position.set(0, 1.02, fanCenterZ);
    body.add(fanRotor);

    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0.055, -0.052);
    bladeShape.bezierCurveTo(0.17, -0.13, 0.32, -0.14, 0.39, -0.045);
    bladeShape.bezierCurveTo(0.36, 0.025, 0.25, 0.095, 0.115, 0.08);
    bladeShape.lineTo(0.055, -0.052);
    const bladeGeometry = new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.032, bevelEnabled: true, bevelSegments: 1, steps: 1,
      bevelSize: 0.006, bevelThickness: 0.005, curveSegments: 5
    });
    for (let i = 0; i < 7; i++) {
      const blade = new THREE.Mesh(bladeGeometry, i % 2 ? materials.blue : materials.black);
      blade.rotation.x = -Math.PI / 2;
      blade.rotation.order = "YXZ";
      blade.rotation.y = i / 7 * Math.PI * 2;
      blade.castShadow = false;
      blade.receiveShadow = false;
      fanRotor.add(blade);
    }
    addCylinder(fanRotor, 0.135, 0.15, 0.07, materials.darkAlloy, [0, 0.018, 0], [0, 0, 0], 28);
    addCylinder(fanRotor, 0.09, 0.09, 0.075, materials.brightAlloy, [0, 0.062, 0], [0, 0, 0], 24);
    addCylinder(fanRotor, 0.035, 0.035, 0.085, materials.blue, [0, 0.078, 0], [0, 0, 0], 20);

    // Raised perimeter guard, cross braces and four mounting bolts.
    addTorus(body, 0.435, 0.026, materials.brightAlloy, [0, 1.17, fanCenterZ], [Math.PI / 2, 0, 0], 48);
    addTorus(body, 0.365, 0.010, materials.darkAlloy, [0, 1.174, fanCenterZ], [Math.PI / 2, 0, 0], 40);
    for (let i = 0; i < 4; i++) {
      const angle = i / 4 * Math.PI * 2;
      addBox(body, [0.72, 0.016, 0.022], [0, 1.185, fanCenterZ],
        materials.darkAlloy, 0.006, [0, -angle, 0]);
    }
    for (const x of [-0.39, 0.39]) {
      for (const z of [fanCenterZ - 0.39, fanCenterZ + 0.39]) {
        addScrew(body, [x, 1.18, z], 0.026, materials.brightAlloy);
      }
    }

    // Top-side control board, status LEDs, set button and connector bank.
    addBox(body, [0.72, 0.025, 0.20], [0, 0.885, 0.50], materials.greenBoard, 0.012);
    for (let i = 0; i < 5; i++) {
      addBox(body, [0.065, 0.022, 0.055], [-0.25 + i * 0.125, 0.91, 0.50], materials.gold, 0.006);
    }
    addBox(body, [0.14, 0.075, 0.09], [0.48, 0.91, 0.49], materials.black, 0.015);
    addBox(body, [0.075, 0.025, 0.05], [0.48, 0.964, 0.49], materials.orange, 0.007);
    for (let i = 0; i < 3; i++) {
      addCylinder(body, 0.018, 0.018, 0.018, i === 0 ? materials.greenBoard : materials.blue,
        [-0.42 + i * 0.095, 0.915, 0.50], [0, 0, 0], 12);
    }

    // Branded plate on the front vertical face.
    addBox(body, [0.88, 0.24, 0.025], [0, 0.47, 0.563], materials.black, 0.025);
    addSideLabel(body, "BRUSHLESS ESC", "1/10 TRUCK CONTROLLER", 0.78, 0.20, [0, 0.47, 0.578]);

    // Battery leads and three motor phase wires leave separate sides of the case.
    const batteryColors = [materials.red, materials.black];
    for (let i = 0; i < 2; i++) {
      const x = -0.34 + i * 0.17;
      addTube(body, [
        [x, 0.36, -0.54],
        [x - 0.03, 0.27, -0.72],
        [x - 0.05, 0.25, -0.92],
        [x - 0.05, 0.30, -1.02]
      ], 0.047, batteryColors[i], 8);
      addCylinder(body, 0.067, 0.067, 0.17, materials.black,
        [x - 0.05, 0.30, -1.10], [Math.PI / 2, 0, 0], 20);
      addTorus(body, 0.052, 0.010, materials.gold,
        [x - 0.05, 0.30, -1.19], [Math.PI / 2, 0, 0], 20);
    }
    const phaseColors = [materials.orange, materials.gold, materials.blue];
    for (let i = 0; i < 3; i++) {
      const z = 0.35 + i * 0.12;
      addTube(body, [
        [0.64, 0.43, z],
        [0.79, 0.34, z + 0.05],
        [0.95, 0.31, z + 0.08],
        [1.08, 0.33, z + 0.08]
      ], 0.034, phaseColors[i], 7);
    }

    return { body, fanRotor };
  }

  const escParts = buildEsc();
  const escFan = escParts.fanRotor;
  batchStaticMeshes(escParts.body, [escFan]);
  batchStaticMeshes(escFan, [], { castShadow: false, receiveShadow: false });




  const batteryModel = new THREE.Group();
  batteryModel.name = "Standalone 2S hardcase LiPo battery";
  batteryModel.position.y = 0.09;
  batteryModel.visible = false;
  showcase.add(batteryModel);

  function buildBattery() {
    const body = new THREE.Group();
    body.name = "Single-piece battery hardcase";
    batteryModel.add(body);

    // One continuous hardcase with a narrow perimeter lid seam. The older
    // nested boxes looked like three separate plates stacked on one another.
    addBox(body, [1.45, 0.50, 0.62], [0, 0.43, 0], materials.black, 0.085);
    addBox(body, [1.405, 0.035, 0.585], [0, 0.687, 0], materials.shell, 0.045);

    // Subtle molded ribs along the short side walls only.
    for (const z of [-0.305, 0.305]) {
      addBox(body, [1.12, 0.025, 0.014], [0, 0.37, z], materials.darkAlloy, 0.004);
    }

    // Small centered identification sticker sits just above the lid surface.
    addTopLabel(body, "2S LIPO", "7.4V HARDCASE", 0.66, 0.19, [0, 0.711, 0]);

    // Main red/black power lead exits one end through a shared strain relief.
    addBox(body, [0.24, 0.12, 0.09], [0.35, 0.39, -0.32], materials.darkAlloy, 0.025);
    addTube(body, [
      [0.28, 0.40, -0.34],
      [0.28, 0.34, -0.47],
      [0.33, 0.31, -0.58]
    ], 0.027, materials.red, 7);
    addTube(body, [
      [0.40, 0.40, -0.34],
      [0.42, 0.34, -0.47],
      [0.45, 0.31, -0.58]
    ], 0.027, materials.black, 7);
    addBox(body, [0.24, 0.13, 0.15], [0.39, 0.31, -0.65], materials.orange, 0.025);
    addBox(body, [0.17, 0.045, 0.08], [0.39, 0.385, -0.65], materials.black, 0.012);

    // A separate fine balance lead and small three-pin plug.
    addTube(body, [
      [-0.40, 0.45, -0.30],
      [-0.47, 0.36, -0.43],
      [-0.50, 0.31, -0.55]
    ], 0.014, materials.white, 6);
    addBox(body, [0.12, 0.085, 0.10], [-0.50, 0.31, -0.60], materials.black, 0.012);
    for (let i = 0; i < 3; i++) {
      addCylinder(body, 0.012, 0.012, 0.025, materials.gold,
        [-0.54 + i * 0.04, 0.31, -0.665], [Math.PI / 2, 0, 0], 10);
    }
    return { body };
  }
  const batteryParts = buildBattery();
  batchStaticMeshes(batteryParts.body);

  const gearboxModel = new THREE.Group();
  gearboxModel.name = "Standalone short-course gearbox";
  gearboxModel.position.y = 0.09;
  gearboxModel.visible = false;
  showcase.add(gearboxModel);

  function buildGearbox() {
    const body = new THREE.Group();
    body.name = "Clean short-course center gearbox housing";
    gearboxModel.add(body);

    // Single assembled transmission case. Its lower edge is set at the stand
    // surface so the gearbox sits on the pedestal instead of hovering.
    addBox(body, [1.14, 0.72, 0.78], [0, 0.54, 0], materials.shell, 0.105);
    addBox(body, [1.09, 0.055, 0.74], [0, 0.895, 0], materials.darkAlloy, 0.035);
    addBox(body, [1.02, 0.022, 0.68], [0, 0.932, 0], materials.shellLight, 0.018);

    // A single centered differential cover mounted directly onto the front
    // face. The old offset gold disc and separate hoop have been removed.
    addBox(body, [1.02, 0.62, 0.045], [0, 0.54, 0.395], materials.black, 0.055);
    addCylinder(body, 0.275, 0.275, 0.075, materials.darkAlloy,
      [0, 0.55, 0.448], [Math.PI / 2, 0, 0], 40);
    addCylinder(body, 0.225, 0.225, 0.035, materials.black,
      [0, 0.55, 0.503], [Math.PI / 2, 0, 0], 36);
    addTorus(body, 0.252, 0.014, materials.brightAlloy,
      [0, 0.55, 0.523], [0, 0, 0], 40);
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * Math.PI * 2;
      addScrew(body, [Math.cos(angle) * 0.245, 0.55 + Math.sin(angle) * 0.245, 0.526],
        0.022, materials.brightAlloy, "z");
    }

    // Opposing output cups share the differential centreline and overlap
    // the gearbox side walls, leaving no floating bearing rings.
    for (const side of [-1, 1]) {
      addCylinder(body, 0.105, 0.105, 0.20, materials.darkAlloy,
        [side * 0.61, 0.54, 0], [0, 0, Math.PI / 2], 28);
      addTorus(body, 0.078, 0.012, materials.brightAlloy,
        [side * 0.70, 0.54, 0], [0, Math.PI / 2, 0], 24);
      addCylinder(body, 0.052, 0.052, 0.17, materials.alloy,
        [side * 0.79, 0.54, 0], [0, 0, Math.PI / 2], 20);
    }

    // Four shallow case fasteners on the top cover.
    for (const x of [-0.43, 0.43]) {
      for (const z of [-0.25, 0.25]) {
        addScrew(body, [x, 0.951, z], 0.024, materials.brightAlloy);
      }
    }
    return { body };
  }
  const gearboxParts = buildGearbox();
  batchStaticMeshes(gearboxParts.body);

  const gearboxParts = buildGearbox();
  batchStaticMeshes(gearboxParts.body);

  const shockModel = new THREE.Group();
  shockModel.name = "Animated oil-filled RC shock absorber";
  shockModel.position.y = 0.14;
  shockModel.visible = false;
  showcase.add(shockModel);

  function buildShock() {
    const body = new THREE.Group();
    shockModel.add(body);
    // Lower threaded damper body, eyelet and lower spring seat.
    addCylinder(body,0.13,0.145,0.64,materials.darkAlloy,[0,0.53,0],[0,0,0],32);
    addCylinder(body,0.115,0.115,0.49,materials.alloy,[0,0.55,0],[0,0,0],32);
    addTorus(body,0.13,0.018,materials.black,[0,0.84,0],[0,0,0],32);
    addCylinder(body,0.18,0.18,0.075,materials.shellLight,[0,0.88,0],[0,0,0],32);
    for(let i=0;i<10;i++){
      const y=0.30+i*0.055;
      addTorus(body,0.137,0.008,materials.black,[0,y,0],[0,0,0],28);
    }
    // Piston rod and upper eyelet move with the compression cycle.
    const moving = new THREE.Group();
    moving.name = "Moving shock piston rod and top eyelet";
    body.add(moving);
    addCylinder(moving,0.038,0.038,0.66,materials.brightAlloy,[0,0.48,0],[0,0,0],20);
    addBox(moving,[0.22,0.11,0.16],[0,0.86,0],materials.shell,0.04);
    addCylinder(moving,0.055,0.055,0.18,materials.black,[0,0.93,0],[0,0,Math.PI/2],20);
    addTorus(moving,0.05,0.012,materials.brightAlloy,[0,1.025,0],[Math.PI/2,0,0],24);
    // Helical coil spring is a separate group so its pitch contracts visibly.
    const springGroup = new THREE.Group();
    springGroup.name = "Compressing coil spring";
    springGroup.position.y = 0.45;
    body.add(springGroup);
    const springPoints=[];
    const turns=7.5, samples=turns*16;
    for(let i=0;i<=samples;i++){
      const t=i/samples;
      const a=t*turns*Math.PI*2;
      springPoints.push([Math.cos(a)*0.17,t*0.88,Math.sin(a)*0.17]);
    }
    addTube(springGroup,springPoints,0.027,materials.orange,8);
    addTorus(body,0.18,0.025,materials.darkAlloy,[0,0.47,0],[0,0,0],32);
    addTorus(moving,0.18,0.025,materials.darkAlloy,[0,1.34,0],[0,0,0],32);
    return {body,moving,springGroup};
  }
  const shockParts = buildShock();
  batchStaticMeshes(shockParts.body,[shockParts.moving,shockParts.springGroup]);
  batchStaticMeshes(shockParts.moving,[],{castShadow:false,receiveShadow:false});
  batchStaticMeshes(shockParts.springGroup,[],{castShadow:false,receiveShadow:false});

  const springModel = new THREE.Group();
  springModel.name = "Standalone suspension coil spring";
  springModel.position.y = 0.14;
  springModel.visible = false;
  showcase.add(springModel);
  function buildStandaloneSpring(){
    const body=new THREE.Group();
    springModel.add(body);
    addTorus(body,0.22,0.035,materials.darkAlloy,[0,0.36,0],[0,0,0],36);
    const springGroup=new THREE.Group();
    springGroup.position.y=0.36;
    body.add(springGroup);
    const points=[],turns=8,samples=turns*18;
    for(let i=0;i<=samples;i++){
      const t=i/samples,a=t*turns*Math.PI*2;
      points.push([Math.cos(a)*0.20,t,Math.sin(a)*0.20]);
    }
    addTube(springGroup,points,0.032,materials.orange,8);
    addTorus(springGroup,0.22,0.035,materials.darkAlloy,[0,1,0],[0,0,0],36);
    return {body,springGroup};
  }
  const standaloneSpring=buildStandaloneSpring();
  batchStaticMeshes(standaloneSpring.body,[standaloneSpring.springGroup]);
  batchStaticMeshes(standaloneSpring.springGroup,[],{castShadow:false,receiveShadow:false});

  const componentModels = {
    servo: servoModel,
    motor: motorModel,
    esc: escModel,
    battery: batteryModel,
    gearbox: gearboxModel,
    shock: shockModel,
    spring: springModel
  };

  const partDetails = {
    servo: {
      name: "DIGITAL STEERING SERVO",
      description: "A standard-size closed-case steering servo with a taller rectangular body, mounting ears, metal output spline, three-wire receiver lead and an animated single-arm aluminum servo horn.",
      specs: "MOVEMENT  ·  ±35° output-horn sweep\nCASE        ·  Standard 40 × 20 × 36 mm class\nOUTPUT      ·  Raised metal spline and horn\nCONNECTION  ·  Three-wire receiver lead"
    },
    motor: {
      name: "540 BRUSHLESS MOTOR",
      description: "A 1/10-scale-style brushless motor mock-up with a vented can, machined end bells, bearing seats, cooling details, phase leads, mounting plate and rotating output shaft with pinion.",
      specs: "FORMAT      ·  540-size visual model\nROTOR       ·  Animated output shaft\nCOOLING     ·  Radial ports and vented end bell\nCONNECTION  ·  Three phase wires"
    },
    esc: {
      name: "BRUSHLESS ESC",
      description: "A taller, compact 1/10 truck ESC mock-up with a deeper enclosure, raised square fan shroud, aluminum heat sink, capacitor cans, controller details and separate battery and motor leads.",
      specs: "REFERENCE   ·  43 × 36.8 × 32.3 mm class\nCOOLING     ·  25 mm framed seven-blade fan\nTHERMAL     ·  Upright aluminum heat-sink fins\nCONNECTION  ·  Battery and three-phase leads"
    },
    battery: {
      name: "2S HARDCASE LIPO BATTERY",
      description: "A simple full-length hardcase pack with molded case seams, cell markings, balance lead, and main power connector.",
      specs: "FORMAT      ·  2S hardcase pack\nVOLTAGE     ·  7.4 V nominal\nCASE        ·  Molded protective shell\nLEADS       ·  Main power and balance"
    },
    gearbox: {
      name: "SHORT-COURSE GEARBOX",
      description: "A compact molded transmission housing with differential cover, bearing bosses, output cups, fasteners, and a restrained gear detail.",
      specs: "TYPE        ·  Enclosed transmission\nDRIVE       ·  Differential output cups\nHOUSING     ·  Two-piece composite case\nDETAIL      ·  Bearing and cover hardware"
    },
    shock: {
      name: "OIL-FILLED SHOCK ABSORBER",
      description: "A standalone coil-over damper with an aluminum body, piston rod, threaded preload area, mounting eyelets, and a spring that compresses and extends.",
      specs: "ACTION      ·  Repeated compression cycle\nDAMPER      ·  Oil-filled style body\nSPRING      ·  Variable coil pitch\nMOUNT       ·  Upper and lower eyelets"
    },
    spring: {
      name: "SUSPENSION COIL SPRING",
      description: "A standalone suspension spring with visible coils and a repeating compression and extension demonstration.",
      specs: "ACTION      ·  Repeated compression cycle\nTYPE        ·  Steel coil-over spring\nSEATS       ·  Upper and lower retainers\nMOTION      ·  Animated pitch change"
    }
  };

  let activePart = "servo";
  let motionEnabled = true;
  let visible = false;
  let previousCarVisibility = true;

  function selectPart(id) {
    if (!componentModels[id]) return;
    activePart = id;
    for (const [key, model] of Object.entries(componentModels)) {
      model.visible = key === id;
    }
    for (const button of document.querySelectorAll("[data-wip-part]")) {
      const active = button.dataset.wipPart === id;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
    const details = partDetails[id];
    const title = $("partsLabPartName");
    const description = $("partsLabPartDescription");
    const specs = $("partsLabPartSpecs");
    if (title) title.textContent = details.name;
    if (description) description.textContent = details.description;
    if (specs) specs.textContent = details.specs;
  }

  function setMotionEnabled(enabled) {
    motionEnabled = !!enabled;
    const button = $("partsLabMotionToggle");
    if (button) {
      button.textContent = motionEnabled ? "PAUSE MOTION" : "RESUME MOTION";
      button.setAttribute("aria-pressed", motionEnabled ? "true" : "false");
    }
    if (!motionEnabled) {
      servoParts.hornPivot.rotation.y = 0;
      motorShaft.rotation.z = 0;
      escFan.rotation.y = 0;
      shockParts.moving.position.y = 0;
      shockParts.springGroup.scale.y = 1;
      standaloneSpring.springGroup.scale.y = 1;
    }
  }

  function setVisible(nextVisible) {
    const next = !!nextVisible;
    if (visible === next) return;
    visible = next;
    labRoot.visible = visible;
    if (visible) {
      renderer.shadowMap.needsUpdate = true;
      previousCarVisibility = localCar.root.visible;
      localCar.root.visible = false;
    } else {
      localCar.root.visible = previousCarVisibility;
    }
  }

  function resetView() {
    if (game.controls) game.controls.cameraOrbitYaw = 0;
  }

  function update(delta, now, isActive) {
    if (!visible || !isActive || !motionEnabled) return;
    const time = now * 0.001;
    if (activePart === "servo") {
      servoParts.hornPivot.rotation.y = Math.sin(time * 1.75) * 0.62;
    } else if (activePart === "motor") {
      motorShaft.rotation.z = time * 22;
    } else if (activePart === "esc") {
      escFan.rotation.y = time * 31;
    } else if (activePart === "shock" || activePart === "spring") {
      const compression = 0.72 + (0.28 * (0.5 + 0.5 * Math.sin(time * 2.6)));
      shockParts.moving.position.y = activePart === "shock" ? -(1 - compression) * 0.82 : 0;
      shockParts.springGroup.scale.y = activePart === "shock" ? compression : 1;
      standaloneSpring.springGroup.scale.y = activePart === "spring" ? compression : 1;
    }
  }

  for (const button of document.querySelectorAll("[data-wip-part]")) {
    button.addEventListener("click", () => selectPart(button.dataset.wipPart));
  }

  $("partsLabMotionToggle")?.addEventListener("click", () => setMotionEnabled(!motionEnabled));
  $("partsLabResetView")?.addEventListener("click", resetView);
  $("partsLabBackButton")?.addEventListener("click", () => game.garage?.showMainMenu());

  selectPart(activePart);
  setMotionEnabled(true);

  return {
    setVisible,
    selectPart,
    update,
    resetView,
    getFocusPosition() {
      return new THREE.Vector3(0, 0.92, 0);
    },
    get activePart() { return activePart; },
    get motionEnabled() { return motionEnabled; },
    get visible() { return visible; }
  };
}
