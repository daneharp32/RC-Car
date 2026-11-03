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

function resetGarageShellState(visible = true) {
  garageShellAnimation = null;
  garageShellInstalled = !!visible;
  applyGarageShellPose(0);
  localCar.setShellVisible(garageShellInstalled);
  const button = $("shellToggleButton");
  if (button) button.textContent = garageShellInstalled ? "REMOVE BODY SHELL" : "INSTALL BODY SHELL";
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
  for (const item of arenaVisuals) item.visible = visible;
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
}
function setGarageShellVisible(visible) {
  if (garageShellAnimation || visible === garageShellInstalled) return;

  clearGaragePartHover();
  const installing = !!visible;
  const from = installing ? 1 : 0;
  const to = installing ? 0 : 1;

  // Keep the shell visible while it lifts away or settles back onto the chassis.
  localCar.setShellVisible(true);
  applyGarageShellPose(from);
  garageShellInstalled = installing;
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
    updateGarageShellAnimation,
    updateHoverBounds,
    get viewMode() { return viewMode; },
    set viewMode(value) { viewMode = value; }
  };
}
