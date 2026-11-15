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
    const alongZ = axis === "z";
    const rotation = alongZ ? [Math.PI / 2, 0, 0] : [0, 0, 0];
    addCylinder(parent, size, size, 0.025, material, position, rotation, 16);
    // Put the screwdriver slot on the exposed face of the head, along the
    // plane normal to the screw axis rather than buried in its cylindrical side.
    const slotSize = alongZ
      ? [size * 1.25, size * 0.22, 0.006]
      : [size * 1.25, 0.006, size * 0.22];
    const slotPosition = alongZ
      ? [position[0], position[1], position[2] + 0.014]
      : [position[0], position[1] + 0.014, position[2]];
    addBox(parent, slotSize, slotPosition, materials.black, 0.001);
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
      [outputX, 0.932, outputZ], [Math.PI / 2, 0, 0], 32);
    addCylinder(body, 0.055, 0.055, 0.205, materials.brightAlloy,
      [outputX, 1.015, outputZ], [0, 0, 0], 24);
    addTorus(body, 0.055, 0.008, materials.darkAlloy,
      [outputX, 1.095, outputZ], [Math.PI / 2, 0, 0], 24);

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
    addScrew(hornPivot, [0, 0.13, 0], 0.023, materials.brightAlloy);
    for (const x of [0.18, 0.36, 0.54]) {
      addTorus(hornPivot, 0.029, 0.007, materials.black,
        [x, 0.065, 0], [Math.PI / 2, 0, 0], 16);
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
      addTorus(body, 0.078, 0.010, materials.brightAlloy, [x, 1.168, -0.43], [Math.PI / 2, 0, 0], 24);
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
        [x - 0.05, 0.30, -1.19], [0, 0, 0], 20);
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

  const shockModel = new THREE.Group();
  shockModel.name = "Animated oil-filled RC shock absorber";
  shockModel.position.y = 0.06;
  shockModel.visible = false;
  showcase.add(shockModel);

  function buildShock() {
    const body = new THREE.Group();
    shockModel.add(body);
    // Lower threaded damper body, eyelet and lower spring seat.
    addCylinder(body,0.13,0.145,0.64,materials.darkAlloy,[0,0.53,0],[0,0,0],32);
    addCylinder(body,0.115,0.115,0.49,materials.alloy,[0,0.55,0],[0,0,0],32);
    addTorus(body,0.13,0.018,materials.black,[0,0.84,0],[Math.PI/2,0,0],32);
    addCylinder(body,0.18,0.18,0.075,materials.shellLight,[0,0.88,0],[0,0,0],32);
    for(let i=0;i<10;i++){
      const y=0.30+i*0.055;
      addTorus(body,0.137,0.008,materials.black,[0,y,0],[Math.PI/2,0,0],28);
    }
    // Piston rod and upper eyelet move with the compression cycle.
    const moving = new THREE.Group();
    moving.name = "Moving shock piston rod and top eyelet";
    body.add(moving);
    addCylinder(moving,0.038,0.038,0.66,materials.brightAlloy,[0,0.48,0],[0,0,0],20);
    addBox(moving,[0.22,0.11,0.16],[0,0.86,0],materials.shell,0.04);
    addCylinder(moving,0.055,0.055,0.18,materials.black,[0,0.93,0],[0,0,Math.PI/2],20);
    addTorus(moving,0.05,0.012,materials.brightAlloy,[0,1.025,0],[0,Math.PI/2,0],24);
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
    addTorus(body,0.18,0.025,materials.darkAlloy,[0,0.47,0],[Math.PI/2,0,0],32);
    addTorus(moving,0.18,0.025,materials.darkAlloy,[0,1.34,0],[Math.PI/2,0,0],32);
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
    addTorus(body,0.22,0.035,materials.darkAlloy,[0,0.15,0],[Math.PI/2,0,0],36);
    const springGroup=new THREE.Group();
    springGroup.position.y=0.15;
    body.add(springGroup);
    const points=[],turns=8,samples=turns*18;
    for(let i=0;i<=samples;i++){
      const t=i/samples,a=t*turns*Math.PI*2;
      points.push([Math.cos(a)*0.20,t,Math.sin(a)*0.20]);
    }
    addTube(springGroup,points,0.032,materials.orange,8);
    addTorus(springGroup,0.22,0.035,materials.darkAlloy,[0,0.88,0],[Math.PI/2,0,0],36);
    return {body,springGroup};
  }
  const standaloneSpring=buildStandaloneSpring();
  batchStaticMeshes(standaloneSpring.body,[standaloneSpring.springGroup]);
  batchStaticMeshes(standaloneSpring.springGroup,[],{castShadow:false,receiveShadow:false});


  // MAIN CHASSIS DEVELOPMENT PARTS
  // These prototypes use the user's 425 mm wheelbase reference as a scale anchor.
  // They are independent display pieces and are not installed on either car.
  const skidPlateModel = new THREE.Group();
  skidPlateModel.name = "Formed aluminum chassis side plate";
  skidPlateModel.visible = false;
  showcase.add(skidPlateModel);

  function buildSkidPlate() {
    const body = new THREE.Group();
    body.name = "Profiled chassis side plate with countersunk fasteners";
    skidPlateModel.add(body);

    // The reference is a tall side chassis plate, not a thin horizontal floor:
    // long lower rail, raised centre, tapered front transition and a stepped
    // rear notch. Envelope is approximately 320 x 115 x 5 mm at this scale.
    const profile = new THREE.Shape();
    profile.moveTo(-1.27, 0.30);
    profile.lineTo(1.27, 0.30);
    profile.lineTo(1.27, 0.56);
    profile.lineTo(0.99, 0.58);
    profile.lineTo(1.06, 0.78);
    profile.lineTo(1.15, 1.12);
    profile.lineTo(-0.63, 1.12);
    profile.lineTo(-0.82, 0.98);
    profile.lineTo(-1.04, 0.65);
    profile.lineTo(-1.27, 0.56);
    // Close the polygon explicitly with the supported path line operation.
    profile.lineTo(-1.27, 0.30);

    const plateGeometry = new THREE.ExtrudeGeometry(profile, {
      depth: 0.045, bevelEnabled: true, bevelSegments: 2, steps: 1,
      bevelSize: 0.012, bevelThickness: 0.008, curveSegments: 4
    });
    // The broad face is vertical and faces the +X viewing direction.
    plateGeometry.rotateY(Math.PI / 2);
    const plate = new THREE.Mesh(plateGeometry, materials.alloy);
    plate.position.set(0.33, 0, 0);
    plate.name = "Stepped formed aluminum side chassis plate";
    plate.castShadow = true;
    plate.receiveShadow = true;
    body.add(plate);

    // Countersunk fasteners follow the actual profile on the outward face.
    const holes = [
      [-1.14,0.47],[-0.98,0.67],[-0.80,0.95],[-0.55,1.055],[-0.16,1.055],
      [0.22,1.055],[0.60,1.055],[0.96,0.91],
      [-1.05,0.36],[-0.75,0.42],[-0.40,0.43],[-0.04,0.43],[0.33,0.43],[0.70,0.43],
      [-0.82,0.78],[-0.50,0.72],[-0.15,0.70],[0.22,0.70],[0.60,0.70]
    ];
    for (const [u, y] of holes) {
      const z = -u;
      addCylinder(body, 0.028, 0.028, 0.018, materials.darkAlloy,
        [0.382, y, z], [0, 0, Math.PI / 2], 20);
      addTorus(body, 0.024, 0.0055, materials.black,
        [0.394, y, z], [0, Math.PI / 2, 0], 20);
      addBox(body, [0.004, 0.0045, 0.025],
        [0.399, y, z], materials.brightAlloy, 0.001);
    }

    for (const z of [-0.12, 0.12]) {
      addBox(body, [0.012, 0.055, 0.018], [0.404, 0.39, z], materials.black, 0.006);
    }
    return { body, plate };
  }
  const skidPlateParts = buildSkidPlate();
  batchStaticMeshes(skidPlateParts.body, [skidPlateParts.plate]);

  const frontAArmsModel = new THREE.Group();
  frontAArmsModel.name = "Pair of animated front lower A arms";
  frontAArmsModel.visible = false;
  showcase.add(frontAArmsModel);

  function buildAnimatedFrontArmPair(parent) {
    const frame = new THREE.Group();
    parent.add(frame);
    const pivots = [];

    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.name = side < 0 ? "Animated front A-arm pivot left" : "Animated front A-arm pivot right";
      pivot.position.set(side * 0.36, 0.35, 0);
      frame.add(pivot);
      pivots.push({ side, pivot });

      // Each triangular arm is authored around its inner pivot, so the whole
      // wishbone rotates as one rigid part instead of sliding through space.
      const outline = new THREE.Shape();
      outline.moveTo(0, -0.34);
      outline.lineTo(0, 0.34);
      outline.lineTo(side * 0.74, 0.015);
      outline.lineTo(0, -0.34);
      const geometry = new THREE.ExtrudeGeometry(outline, {
        depth: 0.075, bevelEnabled: true, bevelSegments: 1, steps: 1,
        bevelSize: 0.018, bevelThickness: 0.012, curveSegments: 4
      });
      geometry.rotateX(Math.PI / 2);
      geometry.translate(0, -0.0375, 0);
      const arm = new THREE.Mesh(geometry, materials.darkAlloy);
      arm.name = side < 0 ? "Left lower wishbone" : "Right lower wishbone";
      arm.castShadow = true;
      arm.receiveShadow = true;
      pivot.add(arm);

      // The outer ball joint is part of the arm pivot and moves with it.
      addCylinder(pivot, 0.105, 0.105, 0.11, materials.black,
        [side * 0.72, 0.045, -0.015], [0, 0, 0], 28);
      addCylinder(pivot, 0.072, 0.072, 0.13, materials.brightAlloy,
        [side * 0.72, 0.105, -0.015], [0, 0, 0], 24);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), materials.darkAlloy);
      ball.position.set(side * 0.72, 0.18, -0.015);
      ball.castShadow = true;
      pivot.add(ball);

      // Fixed inner pivot bushings are attached to the chassis-side bracket.
      for (const z of [-0.34, 0.34]) {
        addCylinder(frame, 0.066, 0.066, 0.17, materials.black,
          [side * 0.36, 0.35, z], [0, 0, Math.PI / 2], 24);
        addCylinder(frame, 0.045, 0.045, 0.19, materials.brightAlloy,
          [side * 0.36, 0.35, z], [0, 0, Math.PI / 2], 20);
      }
    }

    // Inner mounting bridge is kept below the wishbones and clear of travel.
    addBox(frame, [0.90, 0.10, 0.16], [0, 0.25, -0.47], materials.shellLight, 0.025);
    batchStaticMeshes(frame, pivots.map(item => item.pivot));
    for (const item of pivots) {
      batchStaticMeshes(item.pivot, [], { castShadow: false, receiveShadow: false });
    }
    return { frame, pivots };
  }

  const frontArmSet = buildAnimatedFrontArmPair(frontAArmsModel);

  const rearAxleModel = new THREE.Group();
  rearAxleModel.name = "Full width solid rear axle assembly";
  rearAxleModel.visible = false;
  showcase.add(rearAxleModel);

  function buildRearAxle() {
    const body = new THREE.Group();
    body.name = "Straight axle tubes and central differential housing";
    rearAxleModel.add(body);

    // Differential pumpkin is deeper than the straight axle tubes.
    addBox(body, [0.56, 0.43, 0.52], [0, 0.50, 0], materials.shell, 0.14);
    addCylinder(body, 0.255, 0.255, 0.075, materials.darkAlloy,
      [0, 0.51, 0.275], [Math.PI / 2, 0, 0], 36);
    addCylinder(body, 0.205, 0.205, 0.035, materials.black,
      [0, 0.51, 0.325], [Math.PI / 2, 0, 0], 32);
    addTorus(body, 0.222, 0.014, materials.brightAlloy,
      [0, 0.51, 0.347], [0, 0, 0], 36);

    // Straight tubes extend symmetrically from the centre differential.
    for (const side of [-1, 1]) {
      addCylinder(body, 0.115, 0.115, 0.88, materials.darkAlloy,
        [side * 0.68, 0.50, 0], [0, 0, Math.PI / 2], 32);
      addCylinder(body, 0.085, 0.085, 0.18, materials.shellLight,
        [side * 1.04, 0.50, 0], [0, 0, Math.PI / 2], 28);

      // Wheel-end backing plate, bearing ring and short hub stub.
      addCylinder(body, 0.205, 0.205, 0.10, materials.black,
        [side * 1.12, 0.50, 0], [0, 0, Math.PI / 2], 32);
      addTorus(body, 0.145, 0.014, materials.brightAlloy,
        [side * 1.16, 0.50, 0], [0, Math.PI / 2, 0], 28);
      addCylinder(body, 0.075, 0.075, 0.16, materials.alloy,
        [side * 1.20, 0.50, 0], [0, 0, Math.PI / 2], 24);
    }

    // Top saddles mark future suspension-link and shock attachment zones.
    for (const x of [-0.46, 0.46]) {
      addBox(body, [0.20, 0.12, 0.27], [x, 0.77, 0], materials.shellLight, 0.035);
      addCylinder(body, 0.052, 0.052, 0.18, materials.darkAlloy,
        [x, 0.85, 0], [0, 0, Math.PI / 2], 20);
    }
    return { body };
  }
  const rearAxleParts = buildRearAxle();
  batchStaticMeshes(rearAxleParts.body);

  const frontSuspensionModel = new THREE.Group();
  frontSuspensionModel.name = "Animated front suspension assembly demonstration";
  frontSuspensionModel.visible = false;
  showcase.add(frontSuspensionModel);

  // A short upper rail and twin shock towers make the suspension endpoints
  // visible without pretending the prototype is already fitted to a chassis.
  addBox(frontSuspensionModel, [1.35, 0.12, 0.48], [0, 1.34, -0.06], materials.shell, 0.055);
  const suspensionArmSet = buildAnimatedFrontArmPair(frontSuspensionModel);
  const suspensionUpperArmSet = buildFrontUpperArms(frontSuspensionModel);
  for (const side of [-1, 1]) {
    addBox(frontSuspensionModel, [0.15, 0.78, 0.18], [side * 0.61, 0.91, 0.04], materials.darkAlloy, 0.03);
    addBox(frontSuspensionModel, [0.27, 0.12, 0.24], [side * 0.61, 1.31, 0.04], materials.shellLight, 0.025);
    addCylinder(frontSuspensionModel, 0.06, 0.06, 0.19, materials.brightAlloy,
      [side * 0.61, 1.36, 0.04], [0, 0, Math.PI / 2], 20);
  }

  function buildAnimatedDemoShock(parent, side) {
    const root = new THREE.Group();
    root.name = side < 0 ? "Left moving front shock" : "Right moving front shock";
    parent.add(root);

    // Local +Y runs from the lower A-arm attachment to the upper tower.
    addCylinder(root, 0.095, 0.112, 0.54, materials.darkAlloy,
      [0, 0.29, 0], [0, 0, 0], 28);
    addCylinder(root, 0.082, 0.082, 0.42, materials.shellLight,
      [0, 0.29, 0], [0, 0, 0], 28);
    addTorus(root, 0.115, 0.016, materials.black,
      [0, 0.56, 0], [Math.PI / 2, 0, 0], 24);

    const springGroup = new THREE.Group();
    springGroup.position.y = 0.25;
    root.add(springGroup);
    const springPoints = [];
    const turns = 6.5, samples = turns * 18;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const angle = t * turns * Math.PI * 2;
      springPoints.push([Math.cos(angle) * 0.135, t * 0.58, Math.sin(angle) * 0.135]);
    }
    addTube(springGroup, springPoints, 0.022, materials.orange, 7);
    addTorus(springGroup, 0.14, 0.018, materials.darkAlloy,
      [0, 0.58, 0], [Math.PI / 2, 0, 0], 24);

    const rodGroup = new THREE.Group();
    rodGroup.position.y = 0.48;
    root.add(rodGroup);
    addCylinder(rodGroup, 0.026, 0.026, 0.55, materials.brightAlloy,
      [0, 0.22, 0], [0, 0, 0], 18);
    addCylinder(rodGroup, 0.078, 0.078, 0.10, materials.darkAlloy,
      [0, 0.50, 0], [0, 0, 0], 24);
    addCylinder(rodGroup, 0.055, 0.055, 0.12, materials.black,
      [0, 0.56, 0], [Math.PI / 2, 0, 0], 20);
    addTorus(rodGroup, 0.055, 0.012, materials.brightAlloy,
      [0, 0.62, 0], [0, Math.PI / 2, 0], 20);

    // Eyelets are aligned across the truck (X axis), at the ends of the
    // shock assembly rather than appearing as loose decorative rings.
    addBox(root, [0.19, 0.10, 0.15], [0, 0.02, 0], materials.shellLight, 0.025);
    addTorus(root, 0.055, 0.015, materials.darkAlloy,
      [0, 0.04, 0], [0, Math.PI / 2, 0], 24);
    addBox(root, [0.19, 0.10, 0.15], [0, 1.02, 0], materials.shellLight, 0.025);
    addTorus(root, 0.055, 0.015, materials.darkAlloy,
      [0, 1.04, 0], [0, Math.PI / 2, 0], 24);

    batchStaticMeshes(root, [springGroup, rodGroup]);
    batchStaticMeshes(springGroup, [], { castShadow: false, receiveShadow: false });
    batchStaticMeshes(rodGroup, [], { castShadow: false, receiveShadow: false });
    return { root, springGroup, rodGroup, side };
  }

  const suspensionShocks = [-1, 1].map(side => buildAnimatedDemoShock(frontSuspensionModel, side));

  // Additional chassis / driveline prototypes, kept independent for review.
  function addPrototypeRod(parent, start, end, radius, material, eyeRadius = radius * 1.45) {
    const a = new THREE.Vector3(start[0], start[1], start[2]);
    const b = new THREE.Vector3(end[0], end[1], end[2]);
    const direction = b.clone().sub(a);
    const length = Math.max(0.02, direction.length());
    const unit = direction.clone().normalize();

    const rod = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 14, 1), material);
    rod.position.copy(a).add(b).multiplyScalar(0.5);
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), unit);
    rod.castShadow = true;
    rod.receiveShadow = true;
    parent.add(rod);

    for (const point of [a, b]) {
      const eye = new THREE.Mesh(
        new THREE.TorusGeometry(eyeRadius, Math.max(0.008, radius * 0.24), 7, 16),
        materials.darkAlloy
      );
      eye.position.copy(point);
      eye.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), unit);
      eye.castShadow = true;
      parent.add(eye);
      const pin = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.9, 12, 8), materials.brightAlloy);
      pin.position.copy(point);
      pin.castShadow = true;
      parent.add(pin);
    }
    return rod;
  }

  const chassisFrameModel = new THREE.Group();
  chassisFrameModel.name = "Three-layer aluminum chassis frame and upper deck";
  chassisFrameModel.visible = false;
  showcase.add(chassisFrameModel);

  function buildChassisFrame() {
    const body = new THREE.Group();
    chassisFrameModel.add(body);

    // Twin longitudinal aluminum rails form the rolling chassis spine.
    for (const x of [-0.52, 0.52]) {
      addBox(body, [0.15, 0.22, 2.58], [x, 0.48, 0], materials.darkAlloy, 0.035);
      addBox(body, [0.095, 0.035, 2.44], [x, 0.61, 0], materials.alloy, 0.012);
    }

    // Upper equipment deck, centre battery tray and the four main crossmembers.
    addBox(body, [0.88, 0.075, 1.72], [0, 0.72, -0.03], materials.alloy, 0.025);
    addBox(body, [0.72, 0.035, 1.25], [0, 0.78, -0.05], materials.black, 0.018);
    addBox(body, [0.64, 0.055, 0.76], [0, 0.83, -0.04], materials.shellLight, 0.02);
    for (const z of [-1.10, -0.52, 0.50, 1.10]) {
      addBox(body, [1.16, 0.13, 0.14], [0, 0.47, z], materials.shellLight, 0.025);
      for (const x of [-0.48, 0.48]) addScrew(body, [x, 0.55, z], 0.025, materials.brightAlloy);
    }

    // Diagonal upper braces support the deck and open body cage.
    for (const side of [-1, 1]) {
      addPrototypeRod(body, [side * 0.52, 0.55, -0.90], [side * 0.38, 0.92, -0.46], 0.035, materials.darkAlloy);
      addPrototypeRod(body, [side * 0.52, 0.55, 0.90], [side * 0.38, 0.92, 0.46], 0.035, materials.darkAlloy);
    }
    batchStaticMeshes(body);
    return body;
  }
  const chassisFrameParts = buildChassisFrame();

  const frontUpperArmsModel = new THREE.Group();
  frontUpperArmsModel.name = "Pair of independent front upper A arms";
  frontUpperArmsModel.visible = false;
  showcase.add(frontUpperArmsModel);

  function buildFrontUpperArms(parent) {
    const frame = new THREE.Group();
    parent.add(frame);
    const pivots = [];

    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.34, 0.88, 0);
      pivot.name = side < 0 ? "Left upper wishbone pivot" : "Right upper wishbone pivot";
      frame.add(pivot);
      pivots.push({ side, pivot });

      const outline = new THREE.Shape();
      outline.moveTo(0, -0.26);
      outline.lineTo(0, 0.26);
      outline.lineTo(side * 0.57, 0.015);
      outline.lineTo(0, -0.26);
      const geometry = new THREE.ExtrudeGeometry(outline, {
        depth: 0.055, bevelEnabled: true, bevelSegments: 1, steps: 1,
        bevelSize: 0.012, bevelThickness: 0.008, curveSegments: 4
      });
      geometry.rotateX(Math.PI / 2);
      geometry.translate(0, -0.0275, 0);
      const arm = new THREE.Mesh(geometry, materials.shellLight);
      arm.name = side < 0 ? "Left front upper A arm" : "Right front upper A arm";
      arm.castShadow = true;
      arm.receiveShadow = true;
      pivot.add(arm);

      addCylinder(pivot, 0.072, 0.072, 0.10, materials.darkAlloy,
        [side * 0.55, 0.045, 0.015], [0, 0, 0], 22);
      addCylinder(pivot, 0.045, 0.045, 0.13, materials.brightAlloy,
        [side * 0.55, 0.09, 0.015], [0, 0, 0], 18);
    }

    for (const side of [-1, 1]) {
      for (const z of [-0.26, 0.26]) {
        addCylinder(frame, 0.055, 0.055, 0.15, materials.black,
          [side * 0.34, 0.88, z], [0, 0, Math.PI / 2], 20);
      }
    }
    batchStaticMeshes(frame, pivots.map(item => item.pivot));
    for (const item of pivots) batchStaticMeshes(item.pivot, [], { castShadow: false, receiveShadow: false });
    return { frame, pivots };
  }

  const upperArmSet = buildFrontUpperArms(frontUpperArmsModel);

  const frontKnucklesModel = new THREE.Group();
  frontKnucklesModel.name = "Front steering knuckles and wheel hub carriers";
  frontKnucklesModel.visible = false;
  showcase.add(frontKnucklesModel);

  function buildFrontKnuckles() {
    const body = new THREE.Group();
    frontKnucklesModel.add(body);
    for (const side of [-1, 1]) {
      const x = side * 1.02;
      addBox(body, [0.17, 0.43, 0.27], [x, 0.57, 0], materials.darkAlloy, 0.045);
      addBox(body, [0.20, 0.13, 0.22], [x, 0.34, 0], materials.shellLight, 0.025);
      addBox(body, [0.20, 0.12, 0.22], [x, 0.80, 0], materials.shellLight, 0.025);

      // Stub axle, bearing seat and 17 mm-style wheel mounting face.
      addCylinder(body, 0.11, 0.11, 0.22, materials.brightAlloy,
        [side * 1.18, 0.57, 0], [0, 0, Math.PI / 2], 28);
      addCylinder(body, 0.18, 0.18, 0.065, materials.darkAlloy,
        [side * 1.31, 0.57, 0], [0, 0, Math.PI / 2], 28);
      addCylinder(body, 0.12, 0.12, 0.075, materials.alloy,
        [side * 1.37, 0.57, 0], [0, 0, Math.PI / 2], 24);

      // Steering arm and vertical hinge pins.
      addPrototypeRod(body, [x, 0.77, 0.07], [side * 0.91, 0.88, 0.38], 0.045, materials.shellLight, 0.06);
      addCylinder(body, 0.04, 0.04, 0.11, materials.black,
        [x, 0.57, -0.13], [0, 0, 0], 18);
    }
    batchStaticMeshes(body);
    return body;
  }
  const frontKnuckleParts = buildFrontKnuckles();

  const steeringLinkageModel = new THREE.Group();
  steeringLinkageModel.name = "Front steering tie rods and servo saver linkage";
  steeringLinkageModel.visible = false;
  showcase.add(steeringLinkageModel);

  function buildSteeringLinkage() {
    const body = new THREE.Group();
    steeringLinkageModel.add(body);
    addBox(body, [0.66, 0.10, 0.15], [0, 0.82, 0.30], materials.darkAlloy, 0.035);
    addCylinder(body, 0.095, 0.095, 0.12, materials.brightAlloy,
      [0, 0.90, 0.30], [0, 0, 0], 24);
    addBox(body, [0.52, 0.055, 0.08], [0, 0.96, 0.30], materials.shellLight, 0.02);

    for (const side of [-1, 1]) {
      addPrototypeRod(body, [side * 0.28, 0.84, 0.30], [side * 0.92, 0.88, 0.38], 0.027, materials.brightAlloy, 0.05);
      addPrototypeRod(body, [side * 0.92, 0.88, 0.38], [side * 0.98, 0.78, 0.09], 0.034, materials.darkAlloy, 0.052);
    }
    addPrototypeRod(body, [0.0, 1.04, 0.24], [0.0, 0.84, 0.30], 0.032, materials.orange, 0.055);
    batchStaticMeshes(body);
    return body;
  }
  const steeringLinkageParts = buildSteeringLinkage();

  const frontDifferentialModel = new THREE.Group();
  frontDifferentialModel.name = "Front differential and independent drive bulkhead";
  frontDifferentialModel.visible = false;
  showcase.add(frontDifferentialModel);

  function buildFrontDifferential() {
    const body = new THREE.Group();
    frontDifferentialModel.add(body);
    addBox(body, [0.64, 0.48, 0.52], [0, 0.52, -0.05], materials.shell, 0.12);
    addCylinder(body, 0.25, 0.25, 0.09, materials.darkAlloy,
      [0, 0.53, 0.23], [Math.PI / 2, 0, 0], 32);
    addCylinder(body, 0.20, 0.20, 0.045, materials.black,
      [0, 0.53, 0.29], [Math.PI / 2, 0, 0], 28);
    addTorus(body, 0.215, 0.012, materials.brightAlloy,
      [0, 0.53, 0.32], [0, 0, 0], 32);
    for (const side of [-1, 1]) {
      addCylinder(body, 0.095, 0.095, 0.20, materials.alloy,
        [side * 0.40, 0.52, -0.02], [0, 0, Math.PI / 2], 24);
      addCylinder(body, 0.065, 0.065, 0.16, materials.darkAlloy,
        [side * 0.53, 0.52, -0.02], [0, 0, Math.PI / 2], 20);
      addTorus(body, 0.067, 0.010, materials.brightAlloy,
        [side * 0.58, 0.52, -0.02], [0, Math.PI / 2, 0], 20);
    }
    for (const x of [-0.40, 0.40]) {
      addBox(body, [0.20, 0.14, 0.18], [x, 0.25, -0.05], materials.darkAlloy, 0.025);
    }
    batchStaticMeshes(body);
    return body;
  }
  const frontDifferentialParts = buildFrontDifferential();

  const centerDifferentialModel = new THREE.Group();
  centerDifferentialModel.name = "Centre differential and transfer output case";
  centerDifferentialModel.visible = false;
  showcase.add(centerDifferentialModel);

  function buildCenterDifferential() {
    const body = new THREE.Group();
    centerDifferentialModel.add(body);
    addBox(body, [0.74, 0.54, 0.64], [0, 0.52, 0], materials.shell, 0.14);
    addBox(body, [0.82, 0.12, 0.72], [0, 0.28, 0], materials.darkAlloy, 0.04);
    addCylinder(body, 0.29, 0.29, 0.09, materials.black,
      [0, 0.53, 0.34], [Math.PI / 2, 0, 0], 36);
    addCylinder(body, 0.23, 0.23, 0.05, materials.alloy,
      [0, 0.53, 0.40], [Math.PI / 2, 0, 0], 32);
    addTorus(body, 0.25, 0.016, materials.brightAlloy,
      [0, 0.53, 0.43], [0, 0, 0], 36);
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * Math.PI * 2;
      addScrew(body, [Math.cos(angle) * 0.22, 0.53 + Math.sin(angle) * 0.22, 0.45], 0.022, materials.brightAlloy, "z");
    }
    for (const side of [-1, 1]) {
      addCylinder(body, 0.075, 0.075, 0.20, materials.darkAlloy,
        [0, 0.52, side * 0.47], [Math.PI / 2, 0, 0], 22);
      addTorus(body, 0.06, 0.012, materials.brightAlloy,
        [0, 0.52, side * 0.56], [0, 0, 0], 20);
    }
    batchStaticMeshes(body);
    return body;
  }
  const centerDifferentialParts = buildCenterDifferential();

  const rearLinksModel = new THREE.Group();
  rearLinksModel.name = "Solid rear axle trailing arms and locating links";
  rearLinksModel.visible = false;
  showcase.add(rearLinksModel);

  function buildRearLinks() {
    const body = new THREE.Group();
    rearLinksModel.add(body);

    // Lower trailing arms run forward from the rear axle line.
    for (const side of [-1, 1]) {
      addPrototypeRod(body, [side * 0.44, 0.40, -0.95], [side * 0.54, 0.45, 0.82], 0.065, materials.darkAlloy, 0.095);
      addPrototypeRod(body, [side * 0.26, 0.73, -0.62], [side * 0.28, 0.72, 0.80], 0.042, materials.shellLight, 0.065);
    }

    // Triangulated upper links resist axle wrap and lateral movement.
    addPrototypeRod(body, [-0.30, 0.78, -0.58], [-0.18, 0.74, 0.78], 0.038, materials.brightAlloy, 0.06);
    addPrototypeRod(body, [0.30, 0.78, -0.58], [0.18, 0.74, 0.78], 0.038, materials.brightAlloy, 0.06);

    // Panhard / track bar locates the axle across the chassis.
    addPrototypeRod(body, [-0.48, 0.66, 0.78], [0.48, 0.83, -0.55], 0.035, materials.orange, 0.058);
    for (const side of [-1, 1]) {
      addBox(body, [0.20, 0.22, 0.20], [side * 0.48, 0.50, 0.78], materials.darkAlloy, 0.035);
      addCylinder(body, 0.055, 0.055, 0.24, materials.brightAlloy,
        [side * 0.48, 0.50, 0.78], [0, 0, Math.PI / 2], 20);
    }
    batchStaticMeshes(body);
    return body;
  }
  const rearLinkParts = buildRearLinks();

  const driveShaftsModel = new THREE.Group();
  driveShaftsModel.name = "Front and rear propeller shaft assemblies";
  driveShaftsModel.visible = false;
  showcase.add(driveShaftsModel);

  function buildDriveShafts() {
    const body = new THREE.Group();
    driveShaftsModel.add(body);
    for (const side of [-1, 1]) {
      const z0 = side < 0 ? -0.38 : 0.38;
      const z1 = side < 0 ? -1.08 : 1.08;
      addPrototypeRod(body, [0, 0.54, z0], [0, 0.54, z1], 0.052, materials.brightAlloy, 0.085);
      const mid = (z0 + z1) * 0.5;
      addCylinder(body, 0.085, 0.085, 0.30, materials.darkAlloy,
        [0, 0.54, mid], [Math.PI / 2, 0, 0], 24);
      for (const z of [z0, z1]) {
        addBox(body, [0.20, 0.16, 0.13], [0, 0.54, z], materials.shellLight, 0.025);
        addCylinder(body, 0.04, 0.04, 0.19, materials.black,
          [0, 0.54, z], [Math.PI / 2, 0, 0], 16);
      }
    }
    batchStaticMeshes(body);
    return body;
  }
  const driveShaftParts = buildDriveShafts();

  const frontCVDShaftsModel = new THREE.Group();
  frontCVDShaftsModel.name = "Independent front CVD half-shafts";
  frontCVDShaftsModel.visible = false;
  showcase.add(frontCVDShaftsModel);

  function buildFrontCVDShafts() {
    const body = new THREE.Group();
    frontCVDShaftsModel.add(body);
    for (const side of [-1, 1]) {
      const inner = new THREE.Vector3(side * 0.46, 0.54, -0.60);
      const outer = new THREE.Vector3(side * 1.18, 0.57, 0.02);
      const direction = outer.clone().sub(inner).normalize();

      // Hardened steel half-shaft with inner and outer universal/CV cups.
      addPrototypeRod(body, inner.toArray(), outer.toArray(), 0.043, materials.brightAlloy, 0.072);
      for (const point of [inner, outer]) {
        const cup = new THREE.Mesh(
          new THREE.CylinderGeometry(0.085, 0.085, 0.16, 22),
          materials.darkAlloy
        );
        cup.position.copy(point);
        cup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        cup.castShadow = true;
        body.add(cup);
      }

      // Short flexible rubber gaiter around the inboard joint.
      const bootCenter = inner.clone().lerp(outer, 0.22);
      const bootQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
      for (let i = 0; i < 4; i++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.069 - i * 0.003, 0.012, 7, 18),
          materials.rubber
        );
        ring.position.copy(bootCenter).addScaledVector(direction, (i - 1.5) * 0.055);
        ring.quaternion.copy(bootQuat);
        ring.castShadow = true;
        body.add(ring);
      }

      // Outer stub and small retaining cap at the hub-carrier end.
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.058, 0.058, 0.12, 20),
        materials.alloy
      );
      cap.position.copy(outer).addScaledVector(direction, 0.105);
      cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      cap.castShadow = true;
      body.add(cap);
    }
    batchStaticMeshes(body);
    return body;
  }
  const frontCVDParts = buildFrontCVDShafts();

  const motorMountModel = new THREE.Group();
  motorMountModel.name = "Adjustable 42 to 50 size motor mount";
  motorMountModel.visible = false;
  showcase.add(motorMountModel);

  function buildMotorMount() {
    const body = new THREE.Group();
    motorMountModel.add(body);
    addBox(body, [0.96, 0.12, 0.92], [0, 0.31, 0], materials.darkAlloy, 0.04);
    addBox(body, [0.70, 0.08, 0.68], [0, 0.41, 0], materials.black, 0.025);
    for (const x of [-0.36, 0.36]) {
      addBox(body, [0.12, 0.42, 0.80], [x, 0.62, 0], materials.alloy, 0.025);
      addBox(body, [0.04, 0.26, 0.36], [x * 1.12, 0.66, 0], materials.darkAlloy, 0.012);
      for (const z of [-0.29, 0.29]) {
        addCylinder(body, 0.032, 0.032, 0.10, materials.brightAlloy,
          [x, 0.67, z], [0, 0, Math.PI / 2], 16);
      }
    }
    for (const x of [-0.26, 0.26]) {
      addBox(body, [0.10, 0.035, 0.68], [x, 0.49, 0], materials.shellLight, 0.012);
      for (const z of [-0.23, 0.23]) addScrew(body, [x, 0.52, z], 0.026, materials.brightAlloy);
    }
    batchStaticMeshes(body);
    return body;
  }
  const motorMountParts = buildMotorMount();

  const wheelTireModel = new THREE.Group();
  wheelTireModel.name = "One scale off-road wheel and tire";
  wheelTireModel.visible = false;
  showcase.add(wheelTireModel);

  function buildWheelTire() {
    const body = new THREE.Group();
    wheelTireModel.add(body);
    addCylinder(body, 0.58, 0.58, 0.42, materials.rubber,
      [0, 0.84, 0], [0, 0, Math.PI / 2], 48);
    for (const x of [-0.205, 0.205]) {
      addTorus(body, 0.52, 0.055, materials.rubber, [x, 0.84, 0], [0, Math.PI / 2, 0], 48);
    }
    addCylinder(body, 0.39, 0.39, 0.36, materials.darkAlloy,
      [0, 0.84, 0], [0, 0, Math.PI / 2], 40);
    addCylinder(body, 0.36, 0.36, 0.025, materials.shellLight,
      [0.195, 0.84, 0], [0, 0, Math.PI / 2], 40);
    addTorus(body, 0.375, 0.020, materials.brightAlloy,
      [0.222, 0.84, 0], [0, Math.PI / 2, 0], 40);

    for (let i = 0; i < 6; i++) {
      const angle = i / 6 * Math.PI * 2;
      addBox(body, [0.035, 0.31, 0.085],
        [0.218, 0.84 + Math.cos(angle) * 0.17, Math.sin(angle) * 0.17],
        materials.alloy, 0.018, [angle, 0, 0]);
    }
    addCylinder(body, 0.105, 0.105, 0.10, materials.black,
      [0.25, 0.84, 0], [0, 0, Math.PI / 2], 28);
    addCylinder(body, 0.065, 0.065, 0.13, materials.brightAlloy,
      [0.31, 0.84, 0], [0, 0, Math.PI / 2], 24);

    for (let i = 0; i < 28; i++) {
      const angle = i / 28 * Math.PI * 2;
      const y = 0.84 + Math.cos(angle) * 0.565;
      const z = Math.sin(angle) * 0.565;
      addBox(body, [0.32, 0.13, 0.075], [0, y, z], materials.rubber, 0.018,
        [angle - Math.PI / 2, 0, 0]);
    }
    for (let i = 0; i < 16; i++) {
      const angle = i / 16 * Math.PI * 2;
      addCylinder(body, 0.018, 0.018, 0.025, materials.brightAlloy,
        [0.248, 0.84 + Math.cos(angle) * 0.345, Math.sin(angle) * 0.345],
        [0, 0, Math.PI / 2], 10);
    }
    batchStaticMeshes(body);
    return body;
  }
  const wheelTireParts = buildWheelTire();

  const bumpersModel = new THREE.Group();
  bumpersModel.name = "Front and rear tubular bumpers";
  bumpersModel.visible = false;
  showcase.add(bumpersModel);

  function buildBumpers() {
    const body = new THREE.Group();
    bumpersModel.add(body);
    for (const z of [-1.22, 1.22]) {
      addBox(body, [1.46, 0.22, 0.18], [0, 0.46, z], materials.darkAlloy, 0.065);
      addBox(body, [0.92, 0.11, 0.22], [0, 0.40, z + (z < 0 ? -0.08 : 0.08)], materials.black, 0.035);
      for (const x of [-0.55, 0.55]) {
        addPrototypeRod(body, [x * 0.70, 0.52, z + (z < 0 ? 0.10 : -0.10)],
          [x, 0.78, z + (z < 0 ? -0.16 : 0.16)], 0.042, materials.shellLight, 0.06);
      }
      for (const x of [-0.48, 0.48]) {
        addCylinder(body, 0.055, 0.055, 0.15, materials.brightAlloy,
          [x, 0.46, z], [0, 0, Math.PI / 2], 18);
      }
    }
    batchStaticMeshes(body);
    return body;
  }
  const bumperParts = buildBumpers();

  const rollCageModel = new THREE.Group();
  rollCageModel.name = "Tubular body safety cage";
  rollCageModel.visible = false;
  showcase.add(rollCageModel);

  function buildRollCage() {
    const body = new THREE.Group();
    rollCageModel.add(body);
    for (const x of [-0.52, 0.52]) {
      addPrototypeRod(body, [x, 0.42, -1.06], [x, 1.34, -0.62], 0.045, materials.darkAlloy);
      addPrototypeRod(body, [x, 1.34, -0.62], [x, 1.34, 0.75], 0.045, materials.darkAlloy);
      addPrototypeRod(body, [x, 1.34, 0.75], [x, 0.42, 1.08], 0.045, materials.darkAlloy);
      addPrototypeRod(body, [x, 0.42, -1.06], [x, 0.42, 1.08], 0.035, materials.shellLight);
    }
    for (const z of [-0.62, 0.0, 0.75]) {
      addPrototypeRod(body, [-0.52, 1.34, z], [0.52, 1.34, z], 0.038, materials.shellLight);
    }
    for (const side of [-1, 1]) {
      addPrototypeRod(body, [side * 0.52, 0.42, -0.95], [side * 0.52, 1.34, 0.74], 0.032, materials.darkAlloy);
      addPrototypeRod(body, [side * 0.52, 1.34, -0.62], [0, 0.42, 0.95], 0.032, materials.shellLight);
    }
    batchStaticMeshes(body);
    return body;
  }
  const rollCageParts = buildRollCage();

  const componentModels = {
    servo: servoModel,
    motor: motorModel,
    esc: escModel,
    battery: batteryModel,
    gearbox: gearboxModel,
    shock: shockModel,
    spring: springModel,
    skidPlate: skidPlateModel,
    frontAArms: frontAArmsModel,
    rearAxle: rearAxleModel,
    frontSuspension: frontSuspensionModel,
    chassisFrame: chassisFrameModel,
    frontUpperArms: frontUpperArmsModel,
    frontKnuckles: frontKnucklesModel,
    steeringLinkage: steeringLinkageModel,
    frontDifferential: frontDifferentialModel,
    frontCVDShafts: frontCVDShaftsModel,
    centerDifferential: centerDifferentialModel,
    rearLinks: rearLinksModel,
    driveShafts: driveShaftsModel,
    motorMount: motorMountModel,
    wheelTire: wheelTireModel,
    bumpers: bumpersModel,
    rollCage: rollCageModel
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
    },
    skidPlate: {
      name: "MAIN METAL SKID PLATE",
      description: "A formed vertical chassis side plate matching the reference profile, with a long lower rail, raised centre section, tapered transition, stepped rear notch and countersunk fastener rows.",
      specs: "REFERENCE   ·  425 mm target wheelbase\nPROFILE     ·  Approx. 320 × 115 × 5 mm\nFEATURES    ·  Raised centre + stepped cutout\nFASTENERS   ·  Countersunk mounting pattern"
    },
    frontAArms: {
      name: "FRONT LOWER A-ARMS",
      description: "A mirrored pair of front lower wishbones on real pivot groups. Both arms sweep through a small suspension travel cycle, with outboard ball-joint carriers moving with each arm.",
      specs: "LAYOUT      ·  Left and right pair\nTYPE        ·  Double-wishbone lower arms\nJOINTS      ·  Two inner pivots per side\nMOTION      ·  Animated vertical travel"
    },
    rearAxle: {
      name: "SOLID REAR AXLE BAR",
      description: "A full-width straight rear axle housing with a central differential pumpkin, axle tubes, wheel-end hubs and simple upper mounting saddles. It is not connected to the chassis or suspension.",
      specs: "LAYOUT      ·  Full-width solid axle\nHOUSING     ·  Central differential + tubes\nENDS        ·  Left and right hub stubs\nSTATUS      ·  Standalone prototype"
    },
    frontSuspension: {
      name: "FRONT SUSPENSION DEMONSTRATOR",
      description: "A standalone pair of front lower A-arms connected visually to two coil-over shocks. The arms pivot up and down while the shock rods and coil springs compress and extend together.",
      specs: "LAYOUT      ·  Mirrored front lower A-arms\nDAMPERS     ·  Twin coil-over shocks\nMOVEMENT    ·  Arm travel + spring compression\nSTATUS      ·  Standalone animated assembly"
    },
    chassisFrame: {
      name: "ALUMINUM CHASSIS FRAME",
      description: "Twin longitudinal frame rails, upper equipment deck, battery tray and crossmembers. It is a separate structural prototype, not an assembled chassis.",
      specs: "LAYOUT      ·  Twin-rail three-layer frame\nDECK        ·  Upper electronics plate\nTRAY        ·  Recessed battery bay\nSTATUS      ·  Standalone structure"
    },
    frontUpperArms: {
      name: "FRONT UPPER A-ARMS",
      description: "A mirrored pair of compact upper wishbones to complement the lower A-arms in the independent front suspension. They move vertically with the standalone suspension travel demonstration.",
      specs: "LAYOUT      ·  Left and right upper arms\nPIVOTS      ·  Twin inner hinge points\nOUTER       ·  Upright ball-joint mount\nMOTION      ·  Matching suspension travel"
    },
    frontKnuckles: {
      name: "FRONT STEERING KNUCKLES",
      description: "Left and right front hub carriers with stub axles, bearing bosses and steering-arm mounts.",
      specs: "LAYOUT      ·  Independent left/right carriers\nHUB         ·  17 mm style wheel mount\nSTEERING    ·  Outboard steering arms\nSTATUS      ·  Standalone pair"
    },
    steeringLinkage: {
      name: "FRONT STEERING LINKAGE",
      description: "A central servo-saver/rack bar with drag link and left/right tie rods that connect the steering system conceptually to both front knuckles.",
      specs: "LAYOUT      ·  Transverse steering rack\nLINKS       ·  Drag link + two tie rods\nJOINTS      ·  Ball-end style pivots\nSTATUS      ·  Standalone assembly"
    },
    frontDifferential: {
      name: "FRONT DIFFERENTIAL",
      description: "A compact front differential case with left and right output cups and a simple mounting bulkhead for the independent front drive.",
      specs: "DRIVE       ·  Front axle differential\nOUTPUTS     ·  Left and right half-shafts\nCASE        ·  Enclosed alloy-style housing\nSTATUS      ·  Standalone prototype"
    },
    frontCVDShafts: {
      name: "FRONT CVD HALF-SHAFTS",
      description: "A mirrored pair of articulated front constant-velocity half-shafts with inner joint cups, rubber gaiters and outer hub-end couplings for the independent front suspension.",
      specs: "DRIVE       ·  Front independent axle shafts\nJOINTS      ·  Inner + outer CV cups\nBOOT        ·  Flexible rubber gaiters\nSTATUS      ·  Standalone pair"
    },
    centerDifferential: {
      name: "CENTRE DIFFERENTIAL",
      description: "A centre differential housing with forward and rearward prop-shaft outputs for the four-wheel-drive layout.",
      specs: "DRIVE       ·  4WD power split\nOUTPUTS     ·  Front and rear shafts\nCASE        ·  Enclosed central housing\nSTATUS      ·  Standalone prototype"
    },
    rearLinks: {
      name: "REAR TRAILING ARMS & LINKS",
      description: "A pair of long lower trailing arms, triangulated upper locating links and a lateral panhard bar. These pieces locate the rear solid axle while allowing suspension travel.",
      specs: "LAYOUT      ·  Solid rear axle location\nLOWER       ·  Twin trailing arms\nUPPER       ·  Triangulated locating links\nLATERAL     ·  Panhard / track bar"
    },
    driveShafts: {
      name: "FRONT & REAR PROPELLER SHAFTS",
      description: "Two telescoping centre drive shafts with universal-joint yokes connecting a centre differential to the front differential and rear axle.",
      specs: "DRIVE       ·  Shaft-driven 4WD\nFRONT       ·  Centre-to-front prop shaft\nREAR        ·  Centre-to-rear prop shaft\nJOINTS      ·  Universal-style couplings"
    },
    motorMount: {
      name: "ADJUSTABLE MOTOR MOUNT",
      description: "An alloy cradle and slotted side plates sized as a visual mount for a large 42–50 size brushless motor.",
      specs: "FORMAT      ·  1/7 desert truck class\nFIT         ·  42–50 size motor envelope\nADJUST      ·  Slotted pinion-mesh rails\nSTATUS      ·  Standalone bracket"
    },
    wheelTire: {
      name: "OFF-ROAD WHEEL & TIRE",
      description: "A single large-scale desert tire with chunky tread blocks, alloy-style six-spoke rim, beadlock ring and 17 mm style hub centre.",
      specs: "REFERENCE   ·  1/7 desert truck class\nTIRE        ·  Approx. 135–146 mm diameter\nRIM         ·  Six-spoke beadlock style\nHUB         ·  17 mm style centre"
    },
    bumpers: {
      name: "FRONT & REAR BUMPERS",
      description: "A pair of simple structural bumper bars with corner braces and mounting points for the front and rear of the rolling chassis.",
      specs: "LAYOUT      ·  Front + rear crossbars\nMOUNT       ·  Braced chassis tabs\nMATERIAL    ·  Alloy and tubular details\nSTATUS      ·  Standalone pair"
    },
    rollCage: {
      name: "TUBULAR BODY / SAFETY CAGE",
      description: "A separate perimeter roll cage with side rails, roof crossbars and diagonal braces inspired by desert short-course chassis structures.",
      specs: "LAYOUT      ·  Open tubular perimeter\nROOF        ·  Three crossbars\nBRACING     ·  Diagonal side supports\nSTATUS      ·  Standalone structure"
    }
  };

  let activePart = "servo";
  let motionEnabled = true;
  let visible = false;
  let previousCarVisibility = true;

  function selectPart(id) {
    if (!componentModels[id]) return;
    activePart = id;
    if (game.controls) game.controls.cameraOrbitYaw = id === "skidPlate" ? Math.PI / 2 : 0;
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

  function updateSuspensionDemo(time, animate) {
    // The inner hinge line runs along Z, so rotating around Z lifts and lowers
    // each outboard arm tip. Opposite signs keep both sides moving vertically.
    const travel = animate ? Math.sin(time * 2.1) * 0.35 : 0;
    const compression = animate
      ? 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(time * 2.1 + 0.30))
      : 1;

    for (const item of suspensionArmSet.pivots) {
      item.pivot.rotation.z = item.side * travel;
    }
    for (const item of suspensionUpperArmSet.pivots) {
      item.pivot.rotation.z = item.side * travel * 0.72;
    }

    frontSuspensionModel.updateMatrixWorld(true);
    const up = new THREE.Vector3(0, 1, 0);
    for (const shock of suspensionShocks) {
      const arm = suspensionArmSet.pivots.find(item => item.side === shock.side);
      if (!arm) continue;
      const lowerWorld = arm.pivot.localToWorld(new THREE.Vector3(shock.side * 0.72, 0.12, -0.015));
      const upperWorld = new THREE.Vector3(shock.side * 0.61, 1.36, 0.04);
      const lower = frontSuspensionModel.worldToLocal(lowerWorld.clone());
      const upper = frontSuspensionModel.worldToLocal(upperWorld);
      const direction = upper.sub(lower);
      const length = Math.max(0.65, direction.length());

      shock.root.position.copy(lower);
      shock.root.quaternion.setFromUnitVectors(up, direction.normalize());
      shock.root.scale.set(1, length, 1);
      shock.springGroup.scale.y = compression;
      shock.rodGroup.position.y = 0.48 - (1 - compression) * 0.30;
    }
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
      for (const item of frontArmSet.pivots) item.pivot.rotation.z = 0;
      for (const item of upperArmSet.pivots) item.pivot.rotation.z = 0;
      for (const item of suspensionArmSet.pivots) item.pivot.rotation.z = 0;
      for (const item of suspensionUpperArmSet.pivots) item.pivot.rotation.z = 0;
      updateSuspensionDemo(0, false);
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
    if (game.controls) game.controls.cameraOrbitYaw = activePart === "skidPlate" ? Math.PI / 2 : 0;
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
    } else if (activePart === "frontAArms") {
      const armTravel = Math.sin(time * 2.1) * 0.35;
      for (const item of frontArmSet.pivots) item.pivot.rotation.z = item.side * armTravel;
      for (const item of upperArmSet.pivots) item.pivot.rotation.z = item.side * armTravel * 0.72;
    } else if (activePart === "frontUpperArms") {
      const upperTravel = Math.sin(time * 2.1) * 0.35;
      for (const item of upperArmSet.pivots) item.pivot.rotation.z = item.side * upperTravel;
    } else if (activePart === "frontSuspension") {
      updateSuspensionDemo(time, true);
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
      if (activePart === "skidPlate") return new THREE.Vector3(0, 0.70, 0);
      if (activePart === "frontAArms" || activePart === "rearAxle" || activePart === "rearLinks") return new THREE.Vector3(0, 0.52, 0);
      if (activePart === "frontSuspension") return new THREE.Vector3(0, 0.85, 0);
      if (activePart === "chassisFrame" || activePart === "rollCage") return new THREE.Vector3(0, 0.88, 0);
      if (activePart === "frontKnuckles" || activePart === "steeringLinkage" || activePart === "frontDifferential") return new THREE.Vector3(0, 0.62, 0);
      if (activePart === "rearLinks" || activePart === "driveShafts" || activePart === "centerDifferential") return new THREE.Vector3(0, 0.58, 0);
      return new THREE.Vector3(0, 0.92, 0);
    },
    get activePart() { return activePart; },
    get motionEnabled() { return motionEnabled; },
    get visible() { return visible; }
  };
}
