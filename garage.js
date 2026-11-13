// Showroom environment, shell animation, and garage component inspection.
export function createGarageSystem(game) {
  const { THREE, scene, localCar, arenaVisuals, renderer, camera, chassisBody, vehicle, updateLocalVisual } = game;
  const $ = game.$;
  const { mainMenuPanel, modeSelectPanel, garagePanel, joinPanel, hud } = game;
// Illuminated showroom used by the main menu and garage.
const garageGroup = new THREE.Group();
scene.add(garageGroup);
const showroomFloor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24),
  new THREE.MeshStandardMaterial({ color: 0x202d3a, roughness: 0.72, metalness: 0.18 }));
showroomFloor.rotation.x = -Math.PI / 2;
showroomFloor.position.y = -0.035;
showroomFloor.receiveShadow = true;
garageGroup.add(showroomFloor);
const showroomBackWall = new THREE.Mesh(new THREE.BoxGeometry(24, 8, 0.35),
  new THREE.MeshStandardMaterial({ color: 0x172433, roughness: 0.85 }));
showroomBackWall.position.set(0, 3.9, -5.2);
showroomBackWall.receiveShadow = true;
garageGroup.add(showroomBackWall);
const showroomSideMaterial = new THREE.MeshStandardMaterial({ color: 0x25384b, roughness: 0.82 });
for (const x of [-8.5, 8.5]) {
  const column = new THREE.Mesh(new THREE.BoxGeometry(0.22, 5.8, 0.28), showroomSideMaterial);
  column.position.set(x, 2.85, -2.7);
  garageGroup.add(column);
}
const showroomStripe = new THREE.Mesh(new THREE.BoxGeometry(9, 0.025, 0.045),
  new THREE.MeshBasicMaterial({ color: 0x2798ff }));
showroomStripe.position.set(0, 2.65, -4.98);
garageGroup.add(showroomStripe);
const displayPad = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.9, 0.12, 64),
  new THREE.MeshStandardMaterial({ color: 0x34495d, metalness: 0.42, roughness: 0.42 }));
displayPad.position.set(0, -0.06, 0);
displayPad.receiveShadow = true;
displayPad.castShadow = true;
garageGroup.add(displayPad);
const displayRing = new THREE.Mesh(new THREE.TorusGeometry(1.76, 0.025, 8, 80),
  new THREE.MeshBasicMaterial({ color: 0x3ba9ff }));
displayRing.rotation.x = Math.PI / 2;
displayRing.position.y = 0.01;
garageGroup.add(displayRing);
const showroomLight = new THREE.PointLight(0x7dbfff, 24, 15, 2);
showroomLight.position.set(0, 4.8, 1.5);
garageGroup.add(showroomLight);
 
// Build the detailed workshop as an optional, self-contained scene layer.
// If a decoration ever fails to construct, the original showroom still renders.
try {
  const workshopGroup = new THREE.Group();
  workshopGroup.name = "modern-rc-workshop-details";

  const materials = {
    wall: new THREE.MeshStandardMaterial({ color: 0x263646, roughness: 0.86, metalness: 0.12 }),
    wallDark: new THREE.MeshStandardMaterial({ color: 0x101c28, roughness: 0.76, metalness: 0.28 }),
    cabinet: new THREE.MeshStandardMaterial({ color: 0x303b46, roughness: 0.54, metalness: 0.42 }),
    cabinetDark: new THREE.MeshStandardMaterial({ color: 0x18232d, roughness: 0.58, metalness: 0.38 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9aaab6, roughness: 0.34, metalness: 0.82 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x596a78, roughness: 0.42, metalness: 0.76 }),
    worktop: new THREE.MeshStandardMaterial({ color: 0x202b35, roughness: 0.44, metalness: 0.5 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x11171c, roughness: 0.95 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x167dcc, roughness: 0.42, metalness: 0.42 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xf0782f, roughness: 0.48, metalness: 0.18 }),
    battery: new THREE.MeshStandardMaterial({ color: 0x1f384d, roughness: 0.58, metalness: 0.2 }),
    darkGlass: new THREE.MeshStandardMaterial({ color: 0x08131d, roughness: 0.2, metalness: 0.22 }),
    warmGlow: new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
    coolGlow: new THREE.MeshBasicMaterial({ color: 0x69bdff }),
    statusGlow: new THREE.MeshBasicMaterial({ color: 0x45e2a4 })
  };

  function workshopBox(size, position, material, castShadow = false, receiveShadow = false) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    workshopGroup.add(mesh);
    return mesh;
  }

  function workshopCylinder(radiusTop, radiusBottom, height, position, material, rotation = [0, 0, 0], segments = 16) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
      material
    );
    mesh.position.set(position[0], position[1], position[2]);
    mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    workshopGroup.add(mesh);
    return mesh;
  }

  // A darker industrial wall with narrow acoustic/metal ribs.
  for (let x = -9.1; x <= 9.11; x += 1.3) {
    workshopBox([0.045, 5.9, 0.075], [x, 3.0, -4.965], materials.steel);
  }
  workshopBox([18.2, 0.09, 0.14], [0, 4.82, -4.86], materials.blue);
  workshopBox([18.2, 0.055, 0.12], [0, 1.72, -4.86], materials.wallDark);

  // Long workbench, drawer cabinets, and a continuous metal front edge.
  workshopBox([9.5, 0.17, 1.12], [0, 1.04, -4.12], materials.worktop, true, true);
  workshopBox([9.55, 0.055, 0.07], [0, 0.97, -3.55], materials.blue);
  for (const x of [-3.15, 0, 3.15]) {
    workshopBox([2.82, 0.86, 0.92], [x, 0.48, -4.15], materials.cabinet, true, true);
    workshopBox([2.72, 0.075, 0.035], [x, 0.80, -3.675], materials.cabinetDark);
    for (const y of [0.27, 0.49, 0.69]) {
      workshopBox([2.63, 0.17, 0.045], [x, y, -3.655], materials.steel);
      workshopBox([0.48, 0.028, 0.035], [x, y, -3.61], materials.metal);
    }
    workshopBox([0.035, 0.77, 0.035], [x - 1.38, 0.48, -3.63], materials.cabinetDark);
  }

  // Pegboard panel with repeated mounting holes.
  workshopBox([9.7, 1.72, 0.13], [0, 2.77, -4.835], materials.wallDark, false, true);
  workshopBox([9.82, 0.055, 0.16], [0, 3.64, -4.79], materials.blue);
  workshopBox([9.82, 0.045, 0.16], [0, 1.89, -4.79], materials.steel);
  const pegHoleGeometry = new THREE.CylinderGeometry(0.022, 0.022, 0.016, 8);
  const pegHoleMaterial = new THREE.MeshBasicMaterial({ color: 0x070e15 });
  const pegHoles = new THREE.InstancedMesh(pegHoleGeometry, pegHoleMaterial, 168);
  const pegDummy = new THREE.Object3D();
  let pegIndex = 0;
  for (let row = 0; row < 7; row++) {
    for (let column = 0; column < 24; column++) {
      pegDummy.position.set(-4.55 + column * 0.395, 2.16 + row * 0.195, -4.747);
      pegDummy.rotation.set(Math.PI / 2, 0, 0);
      pegDummy.updateMatrix();
      pegHoles.setMatrixAt(pegIndex++, pegDummy.matrix);
    }
  }
  pegHoles.count = pegIndex;
  workshopGroup.add(pegHoles);

  // Hanging hand tools and organized tool rails.
  workshopBox([5.2, 0.045, 0.075], [-1.85, 3.30, -4.69], materials.metal);
  for (let i = 0; i < 9; i++) {
    const x = -4.15 + i * 0.58;
    workshopBox([0.045, 0.48 + (i % 3) * 0.08, 0.045], [x, 2.97, -4.675], i % 3 === 0 ? materials.orange : materials.metal);
    workshopBox([0.16, 0.065, 0.055], [x, 2.72, -4.665], materials.cabinetDark);
  }
  for (let i = 0; i < 5; i++) {
    const x = 1.15 + i * 0.46;
    workshopBox([0.035, 0.72, 0.04], [x, 2.92, -4.665], materials.blue);
    workshopBox([0.13, 0.045, 0.045], [x, 2.58, -4.65], materials.steel);
  }

  // Two wall shelves holding RC parts, tires, boxes, and setup equipment.
  for (const side of [-1, 1]) {
    const shelfX = side * 6.25;
    workshopBox([2.45, 0.12, 0.72], [shelfX, 2.78, -4.43], materials.steel, true);
    workshopBox([2.45, 0.10, 0.72], [shelfX, 3.72, -4.43], materials.steel, true);
    for (const xOffset of [-0.95, 0.95]) {
      workshopBox([0.075, 1.0, 0.1], [shelfX + xOffset, 3.2, -4.75], materials.metal);
    }
    workshopBox([0.68, 0.42, 0.46], [shelfX - 0.62, 3.04, -4.38], materials.battery);
    workshopBox([0.58, 0.34, 0.42], [shelfX + 0.57, 3.91, -4.36], materials.cabinetDark);
    workshopBox([0.22, 0.025, 0.025], [shelfX - 0.62, 3.27, -4.12], materials.statusGlow);
    workshopBox([0.24, 0.025, 0.025], [shelfX + 0.57, 4.10, -4.12], materials.orange);
  }

  // Upright spare short-course tires on a compact rack at the left.
  const spareTire = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.095, 10, 24),
    materials.rubber
  );
  const spareHub = new THREE.Mesh(
    new THREE.TorusGeometry(0.135, 0.026, 8, 20),
    materials.steel
  );
  for (let i = 0; i < 3; i++) {
    const tire = spareTire.clone();
    tire.position.set(-7.35, 1.05 + i * 0.73, -4.27);
    workshopGroup.add(tire);
    const hub = spareHub.clone();
    hub.position.copy(tire.position);
    hub.position.z += 0.012;
    workshopGroup.add(hub);
  }
  workshopBox([0.10, 2.45, 0.10], [-7.35, 1.75, -4.58], materials.metal);

  // Tall parts cabinet on the right, with a glazed door and blue status strip.
  workshopBox([1.42, 3.4, 0.92], [7.42, 1.85, -4.35], materials.cabinet, true, true);
  workshopBox([1.14, 2.82, 0.055], [7.42, 1.92, -3.85], materials.darkGlass);
  workshopBox([0.07, 2.78, 0.065], [6.86, 1.92, -3.80], materials.metal);
  workshopBox([0.07, 2.78, 0.065], [7.98, 1.92, -3.80], materials.metal);
  for (const y of [0.68, 1.36, 2.04, 2.72]) {
    workshopBox([1.05, 0.035, 0.62], [7.42, y, -4.27], materials.steel);
  }
  workshopBox([0.055, 1.15, 0.035], [7.84, 1.9, -3.78], materials.blue);

  // RC work accessories: battery charger, battery packs, motor, and a small monitor.
  workshopBox([0.88, 0.32, 0.62], [3.30, 1.29, -4.06], materials.cabinetDark, true);
  workshopBox([0.72, 0.19, 0.035], [3.30, 1.31, -3.73], materials.darkGlass);
  workshopBox([0.24, 0.055, 0.028], [3.30, 1.32, -3.705], materials.coolGlow);
  for (let i = 0; i < 3; i++) {
    workshopBox([0.42, 0.17, 0.32], [2.35 + i * 0.49, 1.22, -4.05], i === 1 ? materials.orange : materials.battery);
    workshopBox([0.23, 0.025, 0.018], [2.35 + i * 0.49, 1.32, -3.87], materials.statusGlow);
  }
  workshopBox([1.02, 0.70, 0.10], [4.28, 1.72, -4.58], materials.cabinetDark, true);
  workshopBox([0.88, 0.55, 0.035], [4.28, 1.74, -4.515], materials.darkGlass);
  workshopBox([0.72, 0.025, 0.025], [4.28, 1.77, -4.49], materials.coolGlow);
  workshopBox([0.38, 0.07, 0.40], [4.28, 1.30, -4.34], materials.steel);

  // Small desk lamp at the left end of the workbench.
  workshopCylinder(0.21, 0.23, 0.065, [-4.12, 1.18, -4.03], materials.steel);
  workshopCylinder(0.035, 0.035, 0.72, [-4.12, 1.53, -4.03], materials.metal, [0, 0, -0.12]);
  workshopBox([0.43, 0.12, 0.31], [-4.17, 1.88, -4.04], materials.cabinetDark);
  workshopBox([0.34, 0.025, 0.22], [-4.17, 1.81, -3.86], materials.warmGlow);

  // Overhead crossbeams and bright LED panels frame the truck without hiding it.
  workshopBox([18.0, 0.16, 0.20], [0, 5.05, -3.05], materials.wallDark);
  for (const x of [-4.4, 0, 4.4]) {
    workshopBox([2.25, 0.07, 0.72], [x, 4.72, -2.95], materials.cabinetDark);
    workshopBox([2.02, 0.025, 0.53], [x, 4.665, -2.95], materials.warmGlow);
    workshopBox([2.15, 0.035, 0.035], [x, 4.61, -2.95], materials.coolGlow);
  }
  workshopBox([11.8, 0.045, 0.045], [0, 4.35, -4.76], materials.coolGlow);
  workshopBox([11.8, 0.035, 0.035], [0, 4.18, -4.76], materials.warmGlow);

  // Subtle workshop floor markings along the edges of the display pad.
  const floorMark = new THREE.MeshBasicMaterial({ color: 0x32627f });
  for (const x of [-4.75, 4.75]) {
    workshopBox([0.035, 0.008, 5.7], [x, -0.022, 0.75], floorMark);
    workshopBox([1.1, 0.008, 0.035], [x, -0.022, -2.10], floorMark);
  }

  // Soft practical fill from the ceiling and workbench. No added shadow maps.
  const leftWorkshopLight = new THREE.PointLight(0xffd7a6, 8, 10, 2);
  leftWorkshopLight.position.set(-3.8, 4.45, -2.85);
  workshopGroup.add(leftWorkshopLight);
  const rightWorkshopLight = new THREE.PointLight(0x7dbfff, 7, 10, 2);
  rightWorkshopLight.position.set(3.8, 4.25, -3.05);
  workshopGroup.add(rightWorkshopLight);
  const benchWorkshopLight = new THREE.PointLight(0xffbd75, 4, 6, 2);
  benchWorkshopLight.position.set(-3.7, 2.15, -3.35);
  workshopGroup.add(benchWorkshopLight);

  garageGroup.add(workshopGroup);
} catch (error) {
  // Keep the original simple showroom visible if optional workshop details fail.
  console.warn("Optional workshop decorations could not be created; using the basic showroom:", error);
}

garageGroup.visible = true;
for (const item of arenaVisuals) item.visible = false;

let viewMode = "menu";
let garageShellInstalled = true;
let garageShellAnimation = null;
const garageShellDuration = 520;
const garageShellAttachedPosition = new THREE.Vector3(0, 0, 0);
const garageShellRemovedPosition = new THREE.Vector3(0.08, 1.12, -0.16);
const garageShellAttachedRotation = new THREE.Euler(0, 0, 0);
const garageShellRemovedRotation = new THREE.Euler(-0.12, 0, 0.09);
const garageShellAttachedScale = new THREE.Vector3(1, 1, 1);
const garageShellRemovedScale = new THREE.Vector3(1.012, 1.012, 1.012);

function applyGarageShellPose(progress) {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  localCar.shellGroup.position.lerpVectors(garageShellAttachedPosition, garageShellRemovedPosition, t);
  localCar.shellGroup.rotation.set(
    THREE.MathUtils.lerp(garageShellAttachedRotation.x, garageShellRemovedRotation.x, t),
    THREE.MathUtils.lerp(garageShellAttachedRotation.y, garageShellRemovedRotation.y, t),
    THREE.MathUtils.lerp(garageShellAttachedRotation.z, garageShellRemovedRotation.z, t)
  );
  localCar.shellGroup.scale.lerpVectors(garageShellAttachedScale, garageShellRemovedScale, t);
}

function updateGarageChassisChoiceButtons() {
  const style = game.getChassisStyle?.() === "solid-axle" ? "solid-axle" : "standard";
  for (const [buttonId, buttonStyle] of [
    ["chassisChoiceStandard", "standard"],
    ["chassisChoiceSolidAxle", "solid-axle"]
  ]) {
    const button = $(buttonId);
    if (!button) continue;
    const active = style === buttonStyle;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

function chooseGarageChassis(style) {
  clearGaragePartHover();
  const selected = game.setChassisStyle?.(style);
  updateGarageChassisChoiceButtons();
  if (selected) game.showToast?.(
    selected === "solid-axle"
      ? "CHASSIS: COUPLED SOLID REAR AXLE"
      : "CHASSIS: STANDARD INDEPENDENT"
  );
}

$("chassisChoiceStandard").addEventListener("click", () => chooseGarageChassis("standard"));
$("chassisChoiceSolidAxle").addEventListener("click", () => chooseGarageChassis("solid-axle"));

function updateGarageShellChoiceButtons() {
  const currentStyle = game.getShellStyle?.();
  const style = ["ranger", "prerunner", "none"].includes(currentStyle)
    ? currentStyle
    : "prerunner";
  for (const [buttonId, buttonStyle] of [
    ["shellChoiceRanger", "ranger"],
    ["shellChoicePrerunner", "prerunner"],
    ["shellChoiceNone", "none"]
  ]) {
    const button = $(buttonId);
    if (!button) continue;
    const active = style === buttonStyle;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

function chooseGarageShell(style) {
  clearGaragePartHover();
  game.setShellStyle?.(style);
  garageShellAnimation = null;
  applyGarageShellPose(0);
  garageShellInstalled = style !== "none";
  localCar.setShellVisible(garageShellInstalled);
  const toggle = $("shellToggleButton");
  if (toggle) {
    toggle.hidden = style === "none";
    toggle.disabled = style === "none";
    toggle.textContent = style === "none"
      ? "NO BODY SHELL SELECTED"
      : "REMOVE BODY SHELL";
  }
  updateGarageShellChoiceButtons();
}

$("shellChoiceRanger").addEventListener("click", () => chooseGarageShell("ranger"));
$("shellChoicePrerunner").addEventListener("click", () => chooseGarageShell("prerunner"));
$("shellChoiceNone").addEventListener("click", () => chooseGarageShell("none"));

function resetGarageShellState(visible = true) {
  garageShellAnimation = null;
  const hasShell = game.getShellStyle?.() !== "none";
  garageShellInstalled = !!visible && hasShell;
  applyGarageShellPose(0);
  localCar.setShellVisible(garageShellInstalled);
  const button = $("shellToggleButton");
  if (button) {
    button.hidden = !hasShell;
    button.disabled = !hasShell;
    button.textContent = !hasShell
      ? "NO BODY SHELL SELECTED"
      : garageShellInstalled ? "REMOVE BODY SHELL" : "INSTALL BODY SHELL";
  }
  updateGarageShellChoiceButtons();
  updateGarageChassisChoiceButtons();
}

function updateGarageShellAnimation(now) {
  if (!garageShellAnimation) return;
  const animation = garageShellAnimation;
  const linear = THREE.MathUtils.clamp((now - animation.startTime) / garageShellDuration, 0, 1);
  const eased = linear * linear * (3 - 2 * linear);
  const progress = THREE.MathUtils.lerp(animation.from, animation.to, eased);
  applyGarageShellPose(progress);

  if (linear >= 1) {
    garageShellAnimation = null;
    applyGarageShellPose(0);
    if (animation.to === 1) localCar.setShellVisible(false);
  }
}

const garageRaycaster = new THREE.Raycaster();
const garagePointer = new THREE.Vector2();
let activeGaragePart = null;
let activeGaragePartObject = null;
const garagePartBounds = new THREE.Box3();
const garagePartOutline = new THREE.Box3Helper(garagePartBounds, 0x62c6ff);
garagePartOutline.visible = false;
scene.add(garagePartOutline);

function clearGaragePartHover() {
  activeGaragePart = null;
  activeGaragePartObject = null;
  garagePartOutline.visible = false;
  const title = $("partHoverTitle");
  const description = $("partHoverDescription");
  if (title) title.textContent = "HOVER OVER A COMPONENT";
  if (description) description.textContent = "Move your pointer over a visible component to identify it.";
}

function updateGaragePartHover(event) {
  if (viewMode !== "garage" || !localCar.root.visible) {
    if (activeGaragePart) clearGaragePartHover();
    return;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  garagePointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  garagePointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  garageRaycaster.setFromCamera(garagePointer, camera);
  // Do not raycast the shell at all when it has been removed.
  const hoverTarget = garageShellInstalled ? localCar.root : localCar.chassisGroup;
  const intersections = garageRaycaster.intersectObject(hoverTarget, true);
  let found = null;
  let foundObject = null;
  for (const hit of intersections) {
    let node = hit.object;
    while (node && node !== localCar.root) {
      if (node.userData && node.userData.partInfo) {
        found = node.userData.partInfo;
        foundObject = node;
        break;
      }
      node = node.parent;
    }
    if (found) break;
  }
  if (!found) {
    if (activeGaragePart) clearGaragePartHover();
    return;
  }
  if (activeGaragePart && activeGaragePart.id === found.id) {
    garagePartBounds.setFromObject(foundObject);
    garagePartOutline.updateMatrixWorld(true);
    return;
  }
  activeGaragePart = found;
  activeGaragePartObject = foundObject;
  garagePartBounds.setFromObject(foundObject);
  garagePartOutline.visible = true;
  garagePartOutline.updateMatrixWorld(true);
  $("partHoverTitle").textContent = found.label;
  $("partHoverDescription").textContent = found.description;
}

renderer.domElement.addEventListener("pointermove", updateGaragePartHover);
renderer.domElement.addEventListener("pointerleave", clearGaragePartHover);
function setArenaVisible(visible) {
  for (const item of arenaVisuals) {
    const itemMapId = item.userData?.mapId || "closed-course";
    item.visible = !!visible && itemMapId === (game.activeMapId || "closed-course");
  }
  garageGroup.visible = !visible;
}
function parkCarForShowroom() {
  chassisBody.position.set(0, 0.24, 0);
  chassisBody.quaternion.set(0, 0, 0, 1);
  chassisBody.velocity.set(0, 0, 0);
  chassisBody.angularVelocity.set(0, 0, 0);
  chassisBody.force.set(0, 0, 0);
  chassisBody.torque.set(0, 0, 0);
  chassisBody.wakeUp();
  for (let i = 0; i < 4; i++) {
    vehicle.wheelInfos[i].engineForce = 0;
    vehicle.wheelInfos[i].rotation = 0;
    vehicle.wheelInfos[i].deltaRotation = 0;
  }
  updateLocalVisual();
}
function showMainMenu() {
  clearGaragePartHover();
  resetGarageShellState(true);
  viewMode = "menu";
  mainMenuPanel.style.display = "block";
  modeSelectPanel.style.display = "none";
  garagePanel.style.display = "none";
  joinPanel.style.display = "none";
  hud.style.display = "none";
  $("topStatus").style.display = "none";
  setArenaVisible(false);
  parkCarForShowroom();
}
function showModeSelect() {
  clearGaragePartHover();
  resetGarageShellState(true);
  viewMode = "mode-select";
  mainMenuPanel.style.display = "none";
  modeSelectPanel.style.display = "block";
  garagePanel.style.display = "none";
  joinPanel.style.display = "none";
  hud.style.display = "none";
  $("topStatus").style.display = "none";
  setArenaVisible(false);
  parkCarForShowroom();
  game.multiplayer?.openLobbyBrowser?.();
}
function showCreateLobby() {
  clearGaragePartHover();
  resetGarageShellState(true);
  viewMode = "create-lobby";
  mainMenuPanel.style.display = "none";
  modeSelectPanel.style.display = "none";
  garagePanel.style.display = "none";
  joinPanel.style.display = "block";
  hud.style.display = "none";
  $("topStatus").style.display = "none";
  setArenaVisible(false);
  parkCarForShowroom();
  $("joinError").style.display = "none";
  $("lobbyName").focus();
}
function showGarage() {
  clearGaragePartHover();
  resetGarageShellState(true);
  viewMode = "garage";
  mainMenuPanel.style.display = "none";
  modeSelectPanel.style.display = "none";
  garagePanel.style.display = "block";
  joinPanel.style.display = "none";
  hud.style.display = "none";
  $("topStatus").style.display = "none";
  setArenaVisible(false);
  parkCarForShowroom();
  updateGarageShellChoiceButtons();
  updateGarageChassisChoiceButtons();
}
function setGarageShellVisible(visible) {
  if (game.getShellStyle?.() === "none" || garageShellAnimation || visible === garageShellInstalled) return;

  clearGaragePartHover();
  const installing = !!visible;
  const from = installing ? 1 : 0;
  const to = installing ? 0 : 1;

  // Keep the shell visible while it lifts away or settles back onto the chassis.
  localCar.setShellVisible(true);
  applyGarageShellPose(from);
  garageShellInstalled = installing;
  $("shellToggleButton").disabled = false;
  $("shellToggleButton").textContent = installing ? "REMOVE BODY SHELL" : "INSTALL BODY SHELL";
  garageShellAnimation = {
    from,
    to,
    startTime: performance.now()
  };
}
$("shellToggleButton").addEventListener("click", () => {
  setGarageShellVisible(!garageShellInstalled);
});

function showDriveScreen() {
  viewMode = "drive";
  mainMenuPanel.style.display = "none";
  modeSelectPanel.style.display = "none";
  garagePanel.style.display = "none";
  joinPanel.style.display = "none";
  hud.style.display = "block";
  $("topStatus").style.display = "flex";
  setArenaVisible(true);
  game.controls.cameraOrbitYaw = 0;
  game.controls.resetCar();
}
  function updateHoverBounds() {
    if (activeGaragePartObject) {
      garagePartBounds.setFromObject(activeGaragePartObject);
      garagePartOutline.updateMatrixWorld(true);
    }
  }

  return {
    setArenaVisible,
    parkCarForShowroom,
    showMainMenu,
    showModeSelect,
    showCreateLobby,
    showGarage,
    showDriveScreen,
    setGarageShellVisible,
    chooseGarageShell,
    updateGarageShellChoiceButtons,
    chooseGarageChassis,
    updateGarageChassisChoiceButtons,
    updateGarageShellAnimation,
    updateHoverBounds,
    get viewMode() { return viewMode; },
    set viewMode(value) { viewMode = value; }
  };
}
