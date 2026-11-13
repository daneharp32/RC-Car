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
    brass: new THREE.MeshStandardMaterial({ color: 0xb88743, roughness: 0.3, metalness: 0.8 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xb66a3d, roughness: 0.35, metalness: 0.78 }),
    red: new THREE.MeshStandardMaterial({ color: 0xa82730, roughness: 0.42, metalness: 0.4 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xf07827, roughness: 0.4, metalness: 0.42 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x287fb5, roughness: 0.36, metalness: 0.5 }),
    greenBoard: new THREE.MeshStandardMaterial({ color: 0x174d42, roughness: 0.62, metalness: 0.12 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd4aa50, roughness: 0.26, metalness: 0.84 }),
    white: new THREE.MeshStandardMaterial({ color: 0xe2e8eb, roughness: 0.5, metalness: 0.1 }),
    clear: new THREE.MeshPhysicalMaterial({
      color: 0x79b8d1, roughness: 0.18, metalness: 0.08,
      transparent: true, opacity: 0.27, transmission: 0.18,
      thickness: 0.08, depthWrite: false, side: THREE.DoubleSide
    })
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
      ? new RoundedBoxGeometry(size[0], size[1], size[2], 2, Math.min(radius, smallest * 0.44))
      : new THREE.BoxGeometry(size[0], size[1], size[2]);
    const object = new THREE.Mesh(geometry, material);
    object.position.set(position[0], position[1], position[2]);
    object.rotation.set(rotation[0], rotation[1], rotation[2]);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  function addCylinder(parent, radiusTop, radiusBottom, length, material, position, rotation = [0, 0, 0], radialSegments = 24) {
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

  function addTorus(parent, radius, tube, material, position, rotation = [0, 0, 0], tubularSegments = 32) {
    const object = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, tubularSegments), material);
    object.position.set(position[0], position[1], position[2]);
    object.rotation.set(rotation[0], rotation[1], rotation[2]);
    object.castShadow = true;
    parent.add(object);
    return object;
  }

  function addTube(parent, points, radius, material, radialSegments = 8) {
    const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(point[0], point[1], point[2])));
    const object = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, points.length * 6), radius, radialSegments, false), material);
    object.castShadow = true;
    parent.add(object);
    return object;
  }

  function addScrew(parent, position, size = 0.045, material = materials.brightAlloy, axis = "y") {
    const rotation = axis === "z" ? [Math.PI / 2, 0, 0] : [0, 0, 0];
    addCylinder(parent, size, size, 0.025, material, position, rotation, 12);
    const slot = addBox(parent,
      axis === "z" ? [size * 1.15, 0.012, 0.012] : [size * 1.15, 0.012, 0.012],
      [position[0], position[1] + (axis === "y" ? 0.014 : 0), position[2]],
      materials.black, 0.002);
    if (axis === "z") slot.rotation.z = 0;
  }

  function addGear(parent, x, y, z, radius, teeth, material = materials.brass) {
    const gear = new THREE.Group();
    gear.position.set(x, y, z);
    parent.add(gear);
    addCylinder(gear, radius, radius, 0.075, material, [0, 0, 0], [0, 0, 0], Math.max(24, teeth * 2));
    for (let i = 0; i < teeth; i++) {
      const angle = i / teeth * Math.PI * 2;
      const tooth = addBox(gear, [0.055, 0.07, 0.048],
        [Math.cos(angle) * (radius + 0.012), 0, Math.sin(angle) * (radius + 0.012)],
        material, 0.008, [0, -angle, 0]);
    }
    addCylinder(gear, radius * 0.35, radius * 0.35, 0.09, materials.darkAlloy, [0, 0.005, 0], [0, 0, 0], 24);
    addCylinder(gear, 0.035, 0.035, 0.105, materials.brightAlloy, [0, 0.008, 0], [0, 0, 0], 20);
    return gear;
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
  const plinthLower = addCylinder(showcase, 1.22, 1.32, 0.16, materials.black, [0, 0.08, 0], [0, 0, 0], 72);
  const plinthUpper = addCylinder(showcase, 1.2, 1.2, 0.085, materials.shellLight, [0, 0.19, 0], [0, 0, 0], 72);
  addTorus(showcase, 1.205, 0.018, materials.blue, [0, 0.238, 0], [Math.PI / 2, 0, 0], 72);
  const plinthTop = addCylinder(showcase, 1.08, 1.08, 0.035, materials.black, [0, 0.25, 0], [0, 0, 0], 72);
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2;
    addCylinder(showcase, 0.025, 0.025, 0.018, materials.brightAlloy,
      [Math.cos(angle) * 1.12, 0.172, Math.sin(angle) * 1.12], [0, 0, 0], 12);
  }

  const servoModel = new THREE.Group();
  servoModel.name = "Detailed digital steering servo";
  servoModel.position.y = 0.21;
  showcase.add(servoModel);

  function buildServo() {
    const body = new THREE.Group();
    body.name = "Standard-size closed servo case";
    servoModel.add(body);

    // Conventional standard-servo proportions: elongated footprint, narrow
    // width and a much taller closed case with a plain top cover.
    addBox(body, [1.12, 0.50, 0.58], [0, 0.37, 0], materials.shell, 0.075);
    addBox(body, [1.14, 0.035, 0.60], [0, 0.635, 0], materials.black, 0.02);
    addBox(body, [1.10, 0.34, 0.58], [0, 0.82, 0], materials.shell, 0.065);
    addBox(body, [1.035, 0.035, 0.52], [0, 0.99, 0], materials.shellLight, 0.025);

    // Fine case seams; the transmission remains hidden inside the housing.
    for (const z of [-0.296, 0.296]) {
      addBox(body, [0.78, 0.018, 0.012], [0, 0.47, z], materials.darkAlloy, 0.004);
      addBox(body, [0.65, 0.018, 0.012], [0, 0.72, z], materials.shellLight, 0.004);
    }
    for (const x of [-0.49, 0.49]) {
      addScrew(body, [x, 1.012, 0], 0.027, materials.darkAlloy);
    }

    // Opposed mounting ears with reinforced eyelets and recessed fasteners.
    for (const side of [-1, 1]) {
      addBox(body, [0.30, 0.105, 0.66], [side * 0.65, 0.70, 0], materials.shell, 0.035);
      addCylinder(body, 0.079, 0.079, 0.032, materials.black,
        [side * 0.68, 0.762, 0], [0, 0, 0], 28);
      addTorus(body, 0.067, 0.014, materials.brightAlloy,
        [side * 0.68, 0.782, 0], [Math.PI / 2, 0, 0], 28);
      addCylinder(body, 0.041, 0.041, 0.022, materials.darkAlloy,
        [side * 0.68, 0.787, 0], [0, 0, 0], 20);
    }

    // Raised metal output bearing and spline, on top of the closed case.
    const outputX = 0.28;
    const outputZ = 0.015;
    addCylinder(body, 0.145, 0.145, 0.075, materials.darkAlloy,
      [outputX, 1.025, outputZ], [0, 0, 0], 36);
    addTorus(body, 0.124, 0.018, materials.brightAlloy,
      [outputX, 1.069, outputZ], [Math.PI / 2, 0, 0], 32);
    addCylinder(body, 0.061, 0.061, 0.145, materials.brightAlloy,
      [outputX, 1.105, outputZ], [0, 0, 0], 28);
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2;
      addBox(body, [0.012, 0.075, 0.018],
        [outputX + Math.cos(angle) * 0.059, 1.116, outputZ + Math.sin(angle) * 0.059],
        materials.darkAlloy, 0.003, [0, -angle, 0]);
    }

    // Single-arm aluminum steering horn with adjustment holes.
    const hornPivot = new THREE.Group();
    hornPivot.name = "Animated servo output horn";
    hornPivot.position.set(outputX, 1.185, outputZ);
    body.add(hornPivot);
    addBox(hornPivot, [0.79, 0.058, 0.115], [0.30, 0, 0], materials.darkAlloy, 0.035);
    addBox(hornPivot, [0.22, 0.075, 0.19], [0, 0.012, 0], materials.shellLight, 0.035);
    addCylinder(hornPivot, 0.073, 0.073, 0.045, materials.brightAlloy,
      [0, 0.044, 0], [0, 0, 0], 24);
    addCylinder(hornPivot, 0.027, 0.027, 0.055, materials.black,
      [0, 0.079, 0], [0, 0, 0], 18);
    addScrew(hornPivot, [0, 0.112, 0], 0.027, materials.brightAlloy);
    for (const x of [0.19, 0.37, 0.55]) {
      addTorus(hornPivot, 0.032, 0.008, materials.black,
        [x, 0.032, 0], [Math.PI / 2, 0, 0], 16);
      addCylinder(hornPivot, 0.014, 0.014, 0.018, materials.brightAlloy,
        [x, 0.039, 0], [0, 0, 0], 12);
    }

    addTopLabel(body, "DIGITAL SERVO", "STANDARD SIZE / 25T", 0.43, 0.18, [-0.30, 1.012, -0.01]);

    // Three-wire receiver lead exits from the lower rear of the case.
    const wireColors = [materials.black, materials.red, materials.white];
    for (let i = 0; i < 3; i++) {
      const x = -0.035 + (i - 1) * 0.045;
      addTube(body, [
        [x, 0.27, -0.28],
        [x, 0.21, -0.45],
        [x + 0.025, 0.17, -0.62],
        [x + 0.025, 0.17, -0.80]
      ], 0.018, wireColors[i], 7);
    }
    addBox(body, [0.20, 0.14, 0.17], [0.025, 0.17, -0.87], materials.black, 0.02);
    addBox(body, [0.14, 0.035, 0.045], [0.025, 0.245, -0.87], materials.shellLight, 0.008);
    for (let i = 0; i < 3; i++) {
      addCylinder(body, 0.018, 0.018, 0.042, materials.gold,
        [-0.02 + i * 0.045, 0.17, -0.976], [Math.PI / 2, 0, 0], 12);
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
    motorModel.add(body);
    const axisZ = [Math.PI / 2, 0, 0];

    // Motor can, machined end bells, bearing seats, and longitudinal cooling ports.
    addCylinder(body, 0.53, 0.53, 1.18, materials.shellLight, [0, 0.84, 0], axisZ, 56);
    addCylinder(body, 0.535, 0.535, 0.10, materials.darkAlloy, [0, 0.84, 0.60], axisZ, 56);
    addCylinder(body, 0.515, 0.515, 0.10, materials.shell, [0, 0.84, -0.60], axisZ, 56);
    addTorus(body, 0.50, 0.028, materials.brightAlloy, [0, 0.84, 0.54], [0, 0, 0], 56);
    addTorus(body, 0.49, 0.022, materials.black, [0, 0.84, -0.54], [0, 0, 0], 56);
    addCylinder(body, 0.225, 0.225, 0.035, materials.black, [0, 0.84, 0.67], axisZ, 40);
    addCylinder(body, 0.145, 0.145, 0.045, materials.brightAlloy, [0, 0.84, 0.705], axisZ, 40);

    for (let i = 0; i < 14; i++) {
      const angle = i / 14 * Math.PI * 2;
      const x = Math.cos(angle);
      const y = Math.sin(angle);
      addBox(body, [0.052, 0.18, 0.25],
        [x * 0.525, 0.84 + y * 0.525, 0.02],
        materials.black, 0.009, [0, 0, angle]);
      addBox(body, [0.022, 0.12, 0.16],
        [x * 0.537, 0.84 + y * 0.537, 0.02],
        materials.blue, 0.005, [0, 0, angle]);
    }

    // End-bell screw circle and rear ventilation slots.
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * Math.PI * 2;
      const x = Math.cos(angle) * 0.39;
      const y = 0.84 + Math.sin(angle) * 0.39;
      addScrew(body, [x, y, 0.665], 0.033, materials.brightAlloy, "z");
      addBox(body, [0.035, 0.13, 0.02],
        [x * 0.8, 0.84 + (y - 0.84) * 0.8, -0.658],
        materials.black, 0.008, [0, 0, angle]);
    }
    addCylinder(body, 0.14, 0.14, 0.05, materials.darkAlloy, [0, 0.84, -0.67], axisZ, 32);
    addTorus(body, 0.125, 0.02, materials.copper, [0, 0.84, -0.70], [0, 0, 0], 32);

    // Billet motor mount with slotted side rails and fasteners.
    addBox(body, [0.88, 0.12, 0.90], [0, 0.18, -0.02], materials.darkAlloy, 0.045);
    addBox(body, [0.69, 0.10, 0.72], [0, 0.27, -0.02], materials.black, 0.025);
    for (const x of [-0.34, 0.34]) {
      addBox(body, [0.12, 0.22, 0.92], [x, 0.35, -0.02], materials.shellLight, 0.025);
      for (const z of [-0.35, 0.31]) addScrew(body, [x, 0.47, z], 0.03);
    }

    // The shaft and steel pinion are on a separate rotating group.
    const shaftGroup = new THREE.Group();
    shaftGroup.position.set(0, 0.84, 0.68);
    body.add(shaftGroup);
    addCylinder(shaftGroup, 0.055, 0.055, 0.66, materials.brightAlloy, [0, 0, 0.30], axisZ, 24);
    addCylinder(shaftGroup, 0.09, 0.09, 0.17, materials.darkAlloy, [0, 0, 0.53], axisZ, 24);
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2;
      addBox(shaftGroup, [0.025, 0.045, 0.13],
        [Math.cos(angle) * 0.09, Math.sin(angle) * 0.09, 0.53],
        materials.brightAlloy, 0.005, [0, 0, angle]);
    }
    addCylinder(shaftGroup, 0.065, 0.065, 0.05, materials.gold, [0, 0, 0.64], axisZ, 24);

    // Three phase leads, braided sleeves, and bullet connectors at the rear.
    const phaseColors = [materials.orange, materials.red, materials.black];
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.18;
      addTube(body, [
        [x * 0.6, 0.84 + 0.07, -0.65],
        [x, 0.92, -0.88],
        [x * 1.3, 0.80, -1.08],
        [x * 1.25, 0.73, -1.23]
      ], 0.043, phaseColors[i]);
      addCylinder(body, 0.065, 0.065, 0.19, materials.darkAlloy,
        [x * 1.25, 0.73, -1.32], [Math.PI / 2, 0, 0], 20);
      addTorus(body, 0.052, 0.012, materials.brightAlloy,
        [x * 1.25, 0.73, -1.405], [Math.PI / 2, 0, 0], 20);
    }

    addTopLabel(body, "540 BRUSHLESS", "SENSORLESS MOTOR / 4-POLE", 0.74, 0.28, [0, 1.385, -0.05]);
    return { body, shaftGroup };
  }

  const motorParts = buildMotor();
  const motorShaft = motorParts.shaftGroup;
  batchStaticMeshes(motorParts.body, [motorShaft]);
  batchStaticMeshes(motorShaft, [], { castShadow: false, receiveShadow: false });

  const escModel = new THREE.Group();
  escModel.name = "Detailed brushless electronic speed controller";
  escModel.position.y = 0.145;
  escModel.visible = false;
  showcase.add(escModel);

  function buildEsc() {
    const body = new THREE.Group();
    escModel.add(body);

    // Layered sealed controller enclosure with raised top cover and edge rails.
    addBox(body, [1.84, 0.43, 1.38], [0, 0.34, 0], materials.red, 0.11);
    addBox(body, [1.70, 0.16, 1.26], [0, 0.62, 0], materials.shell, 0.075);
    addBox(body, [1.55, 0.045, 1.10], [0, 0.715, 0], materials.black, 0.04);
    for (const x of [-0.79, 0.79]) {
      addBox(body, [0.08, 0.15, 1.15], [x, 0.66, 0], materials.orange, 0.018);
      for (const z of [-0.50, 0.50]) addScrew(body, [x, 0.75, z], 0.035);
    }

    // Large finned aluminum heat sink occupying the rear half of the ESC.
    addBox(body, [1.05, 0.09, 0.52], [0, 0.79, -0.37], materials.darkAlloy, 0.025);
    for (let i = 0; i < 11; i++) {
      const x = -0.47 + i * 0.094;
      addBox(body, [0.045, 0.24, 0.49], [x, 0.945, -0.37], materials.alloy, 0.012);
      addBox(body, [0.014, 0.15, 0.46], [x + 0.024, 0.95, -0.37], materials.darkAlloy, 0.004);
    }
    addBox(body, [1.12, 0.045, 0.07], [0, 1.075, -0.37], materials.brightAlloy, 0.01);

    // Twin low-ESR capacitor cans, vented tops, and retaining straps.
    for (const x of [-0.62, 0.62]) {
      addCylinder(body, 0.135, 0.135, 0.43, materials.alloy, [x, 0.91, -0.45], [0, 0, 0], 32);
      addCylinder(body, 0.12, 0.12, 0.04, materials.black, [x, 1.145, -0.45], [0, 0, 0], 32);
      addTorus(body, 0.095, 0.012, materials.brightAlloy, [x, 1.17, -0.45], [0, 0, 0], 32);
      addBox(body, [0.035, 0.30, 0.08], [x, 0.91, -0.45], materials.darkAlloy, 0.01);
      addBox(body, [0.06, 0.035, 0.33], [x, 0.72, -0.45], materials.black, 0.01);
    }

    // A physically modelled, rotating seven-blade fan below its safety grille.
    const fanFrame = addBox(body, [0.98, 0.095, 0.98], [0, 0.79, 0.31], materials.shellLight, 0.075);
    addBox(body, [0.79, 0.022, 0.79], [0, 0.848, 0.31], materials.black, 0.05);
    const fanRotor = new THREE.Group();
    fanRotor.position.set(0, 0.89, 0.31);
    body.add(fanRotor);

    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0.06, -0.065);
    bladeShape.bezierCurveTo(0.20, -0.15, 0.39, -0.17, 0.47, -0.055);
    bladeShape.bezierCurveTo(0.44, 0.03, 0.30, 0.12, 0.13, 0.105);
    bladeShape.lineTo(0.06, -0.065);
    const bladeGeometry = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.035, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.008, bevelThickness: 0.006 });
    for (let i = 0; i < 7; i++) {
      const blade = new THREE.Mesh(bladeGeometry, i % 2 ? materials.blue : materials.shellLight);
      blade.rotation.x = -Math.PI / 2;
      blade.rotation.z = 0;
      blade.rotation.y = 0;
      blade.position.y = 0;
      blade.rotation.order = "YXZ";
      blade.userData.angle = i / 7 * Math.PI * 2;
      blade.rotation.y = blade.userData.angle;
      blade.castShadow = true;
      fanRotor.add(blade);
    }
    addCylinder(fanRotor, 0.15, 0.17, 0.08, materials.darkAlloy, [0, 0.02, 0], [0, 0, 0], 32);
    addCylinder(fanRotor, 0.095, 0.095, 0.09, materials.brightAlloy, [0, 0.065, 0], [0, 0, 0], 32);
    addCylinder(fanRotor, 0.04, 0.04, 0.10, materials.blue, [0, 0.085, 0], [0, 0, 0], 24);

    // Raised circular fan guard, radial supports, corner screws, and duct lip.
    addTorus(body, 0.48, 0.035, materials.brightAlloy, [0, 0.92, 0.31], [Math.PI / 2, 0, 0], 64);
    addTorus(body, 0.405, 0.012, materials.darkAlloy, [0, 0.925, 0.31], [Math.PI / 2, 0, 0], 64);
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * Math.PI * 2;
      addBox(body, [0.78, 0.018, 0.025], [0, 0.955, 0.31],
        materials.darkAlloy, 0.008, [0, -angle, 0]);
    }
    for (const x of [-0.39, 0.39]) {
      for (const z of [-0.08, 0.70]) {
        addScrew(body, [x, 0.93, z], 0.032);
      }
    }

    // Controller PCB edge ports, switch, status LEDs, and wiring harness.
    addBox(body, [0.68, 0.035, 0.24], [0, 0.75, 0.55], materials.greenBoard, 0.018);
    for (let i = 0; i < 5; i++) {
      addBox(body, [0.07, 0.025, 0.06], [-0.24 + i * 0.12, 0.78, 0.55], materials.gold, 0.008);
    }
    addBox(body, [0.16, 0.09, 0.09], [0.69, 0.72, 0.47], materials.black, 0.02);
    addBox(body, [0.09, 0.035, 0.05], [0.69, 0.79, 0.47], materials.orange, 0.01);
    for (let i = 0; i < 3; i++) {
      addCylinder(body, 0.025, 0.025, 0.022, i === 0 ? materials.greenBoard : materials.blue,
        [-0.43 + i * 0.10, 0.77, 0.56], [0, 0, 0], 16);
    }

    // Heavy battery leads and three motor phase wires with molded plugs.
    const powerColors = [materials.red, materials.black];
    for (let i = 0; i < 2; i++) {
      const x = -0.42 + i * 0.18;
      addTube(body, [
        [x, 0.43, -0.63],
        [x - 0.06, 0.32, -0.86],
        [x - 0.10, 0.38, -1.12],
        [x - 0.10, 0.46, -1.30]
      ], 0.065, powerColors[i], 10);
      addCylinder(body, 0.09, 0.09, 0.24, materials.black,
        [x - 0.10, 0.46, -1.40], [Math.PI / 2, 0, 0], 24);
      addTorus(body, 0.073, 0.014, materials.gold,
        [x - 0.10, 0.46, -1.525], [Math.PI / 2, 0, 0], 24);
    }
    for (let i = 0; i < 3; i++) {
      const x = 0.28 + i * 0.16;
      const color = [materials.orange, materials.yellow || materials.gold, materials.blue][i];
      addTube(body, [
        [x, 0.44, -0.63],
        [x + 0.08, 0.30, -0.82],
        [x + 0.12, 0.36, -1.08]
      ], 0.043, color);
    }

    addTopLabel(body, "BRUSHLESS ESC", "PROGRAMMABLE / 120A CLASS", 0.58, 0.23, [0.51, 0.75, 0.06]);
    return fanRotor;
  }

  const escFan = buildEsc();

  const componentModels = {
    servo: servoModel,
    motor: motorModel,
    esc: escModel
  };

  const partDetails = {
    servo: {
      name: "DIGITAL STEERING SERVO",
      description: "A detailed standard-size steering servo mock-up. The case includes a visible gear train, control board, motor, mounting ears, connector harness, spline and an animated aluminum steering horn.",
      specs: "MOVEMENT  ·  ±35° output-horn sweep\nDRIVE       ·  Multi-stage metal gear train\nCASE        ·  Reinforced composite housing\nCONNECTION  ·  Three-wire receiver lead"
    },
    motor: {
      name: "540 BRUSHLESS MOTOR",
      description: "A 1/10-scale-style brushless motor mock-up with a vented can, machined end bells, bearing seats, cooling details, phase leads, mounting plate and rotating output shaft with pinion.",
      specs: "FORMAT      ·  540-size visual model\nROTOR       ·  Animated output shaft\nCOOLING     ·  Radial ports and vented end bell\nCONNECTION  ·  Three phase wires"
    },
    esc: {
      name: "BRUSHLESS ESC",
      description: "A standalone electronic speed controller mock-up with a finned aluminum heat sink, capacitor bank, controller board, battery leads, motor phase wires and a working seven-blade cooling fan.",
      specs: "ENCLOSURE   ·  Sealed composite case\nCOOLING     ·  Animated seven-blade fan\nTHERMAL     ·  Finned aluminum heat sink\nCONNECTION  ·  Battery and three-phase leads"
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
      servoParts.gearOne.rotation.y = 0;
      servoParts.gearTwo.rotation.y = 0;
      servoParts.outputGear.rotation.y = 0;
      motorShaft.rotation.z = 0;
      escFan.rotation.y = 0;
    }
  }

  function setVisible(nextVisible) {
    const next = !!nextVisible;
    if (visible === next) return;
    visible = next;
    labRoot.visible = visible;
    if (visible) {
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
    const servoAngle = Math.sin(time * 1.75) * 0.62;
    servoParts.hornPivot.rotation.y = servoAngle;
    servoParts.gearOne.rotation.y = time * 0.65;
    servoParts.gearTwo.rotation.y = -time * 0.82;
    servoParts.outputGear.rotation.y = -servoAngle * 0.7;
    motorShaft.rotation.z = time * 22;
    escFan.rotation.y = time * 31;
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
