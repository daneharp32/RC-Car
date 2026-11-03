import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js";
import * as CANNON from "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js";
import { createPhysicsSystem } from "./physics.js";
import { createCarVisualFactory } from "./car.js";
import { createControlsSystem } from "./controls.js";
import { createMultiplayerSystem } from "./multiplayer.js";
import { createGarageSystem } from "./garage.js";
import { createTrackSystem } from "./track.js";
import rangerShellPart0 from "./ranger-shell-data-00.js";
import rangerShellPart1 from "./ranger-shell-data-01.js";
import rangerShellPart2 from "./ranger-shell-data-02.js";
import rangerShellPart3 from "./ranger-shell-data-03.js";
import rangerShellPart4 from "./ranger-shell-data-04.js";
import rangerShellPart5 from "./ranger-shell-data-05.js";

// Main application entry: renderer, track visuals, shared state, and frame loop.
const $ = (id) => document.getElementById(id);
const canvas = $("gameCanvas");
const joinPanel = $("joinPanel");
const mainMenuPanel = $("mainMenuPanel");
const modeSelectPanel = $("modeSelectPanel");
const garagePanel = $("garagePanel");
const joinButton = $("joinButton");
const joinError = $("joinError");
const hud = $("hud");
const toast = $("toast");
const FIXED_STEP = 1 / 60;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
// Open blue sky with a matching distant haze above the dirt field.
scene.background = new THREE.Color(0x83c5ef);
scene.fog = new THREE.Fog(0x83c5ef, 135, 265);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 180);
camera.position.set(0, 3.1, 5.8);

const hemi = new THREE.HemisphereLight(0xe7f1f4, 0x6b5943, 1.45);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffe2bd, 2.15);
sun.position.set(-8, 15, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -76;
sun.shadow.camera.right = 76;
sun.shadow.camera.top = 76;
sun.shadow.camera.bottom = -76;
sun.shadow.bias = -0.00015;
scene.add(sun);

const fill = new THREE.DirectionalLight(0xb8d8e9, 0.65);
fill.position.set(8, 6, -10);
scene.add(fill);

// The track module owns the complete closed-course scenery and its shared layout.
const trackSystem = createTrackSystem({ THREE, scene });
const { arenaVisuals, trackLayout } = trackSystem;

// Decode the optional Ranger body before creating physics. If the model cannot
// be decoded, the game automatically uses the original procedural truck instead.
async function loadRangerShellGeometry() {
  const encoded = [
    rangerShellPart0, rangerShellPart1, rangerShellPart2,
    rangerShellPart3, rangerShellPart4, rangerShellPart5
  ].join("");
  if (!encoded || encoded.length % 4 !== 0) {
    throw new Error("The Ranger test mesh data is incomplete.");
  }

  const compressed = Uint8Array.from(
    atob(encoded),
    (character) => character.charCodeAt(0)
  );
  if (typeof DecompressionStream !== "function") {
    throw new Error("This browser does not support the Ranger mesh decompressor.");
  }
  const rawStream = new Blob([compressed]).stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const buffer = await new Response(rawStream).arrayBuffer();
  const view = new DataView(buffer);
  const byteLength = buffer.byteLength;

  if (byteLength < 40 ||
      view.getUint32(0, false) !== 0x52435351 ||
      view.getUint32(4, true) !== 1) {
    throw new Error("The Ranger test mesh has an invalid header.");
  }

  const vertexCount = view.getUint32(8, true);
  const faceCount = view.getUint32(12, true);
  if (!vertexCount || !faceCount || vertexCount > 100000 || faceCount > 200000) {
    throw new Error("The Ranger test mesh has invalid dimensions.");
  }

  const minimum = [
    view.getFloat32(16, true),
    view.getFloat32(20, true),
    view.getFloat32(24, true)
  ];
  const maximum = [
    view.getFloat32(28, true),
    view.getFloat32(32, true),
    view.getFloat32(36, true)
  ];
  const positionOffset = 40;
  const normalOffset = positionOffset + vertexCount * 6;
  const indexOffset = normalOffset + vertexCount * 3 +
    ((normalOffset + vertexCount * 3) % 2);
  const indexCount = faceCount * 3;
  if (indexOffset + indexCount * 2 !== byteLength) {
    throw new Error("The Ranger test mesh data length does not match its header.");
  }

  // Positions are compactly quantized to 16 bits per axis.
  const positions = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    for (let axis = 0; axis < 3; axis++) {
      const quantized = view.getUint16(positionOffset + (i * 3 + axis) * 2, true);
      positions[i * 3 + axis] =
        minimum[axis] + (quantized / 65535) * (maximum[axis] - minimum[axis]);
    }
    // Physically seat the body higher by editing the shell's Y vertices.
    positions[i * 3 + 1] += 0.15;
  }

  // Preserve the repaired, split-edge normals rather than averaging across
  // sharp body seams, which was a source of the earlier shading artifacts.
  const normalBytes = new Int8Array(buffer, normalOffset, vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    const nx = normalBytes[i * 3] / 127;
    const ny = normalBytes[i * 3 + 1] / 127;
    const nz = normalBytes[i * 3 + 2] / 127;
    const magnitude = Math.hypot(nx, ny, nz) || 1;
    normals[i * 3] = nx / magnitude;
    normals[i * 3 + 1] = ny / magnitude;
    normals[i * 3 + 2] = nz / magnitude;
  }

  const indices = new Uint16Array(buffer, indexOffset, indexCount);
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] >= vertexCount) {
      throw new Error("The Ranger test mesh contains an invalid triangle index.");
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

let shellGeometry = null;
try {
  shellGeometry = await loadRangerShellGeometry();
  console.info("Ranger test shell loaded:", shellGeometry.getAttribute("position").count, "vertices");
} catch (error) {
  console.warn("Ranger test shell unavailable; using the stable procedural body:", error);
}

// Physics: Cannon's RaycastVehicle applies suspension and tire impulses only
// when each wheel ray has actually found a surface to touch.

const physicsSystem = createPhysicsSystem({ CANNON, trackLayout, shellFit: !!shellGeometry });
const {
  world,
  chassisBody,
  vehicle,
  wheelPositions,
  VISUAL_CHASSIS_LENGTH_SCALE,
  spawnX,
  spawnZ,
  spawnYaw
} = physicsSystem;

const makeCarVisual = createCarVisualFactory({ THREE, scene, VISUAL_CHASSIS_LENGTH_SCALE, vehicle, renderer, shellGeometry });
const localCar = makeCarVisual(0xffa33d);

function updateLocalVisual() {
  localCar.root.position.set(chassisBody.position.x, chassisBody.position.y, chassisBody.position.z);
  localCar.root.quaternion.set(
    chassisBody.quaternion.x,
    chassisBody.quaternion.y,
    chassisBody.quaternion.z,
    chassisBody.quaternion.w
  );

  const inverseRoot = localCar.root.quaternion.clone().invert();
  const localPosition = new THREE.Vector3();
  const worldWheelQuaternion = new THREE.Quaternion();
  for (let i = 0; i < 4; i++) {
    vehicle.updateWheelTransform(i);
    const transform = vehicle.wheelInfos[i].worldTransform;
    localPosition.set(
      transform.position.x - chassisBody.position.x,
      transform.position.y - chassisBody.position.y,
      transform.position.z - chassisBody.position.z
    );
    localPosition.applyQuaternion(inverseRoot);
    localPosition.z *= VISUAL_CHASSIS_LENGTH_SCALE;
    worldWheelQuaternion.set(
      transform.quaternion.x,
      transform.quaternion.y,
      transform.quaternion.z,
      transform.quaternion.w
    );
    localCar.wheelPivots[i].position.copy(localPosition);
    localCar.wheelPivots[i].quaternion.copy(inverseRoot).multiply(worldWheelQuaternion);
  }
}


let lastToastTimer = 0;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(lastToastTimer);
  lastToastTimer = window.setTimeout(() => toast.classList.remove("show"), 2300);
}

const game = {
  THREE,
  CANNON,
  $,
  canvas,
  renderer,
  scene,
  camera,
  mainMenuPanel,
  modeSelectPanel,
  garagePanel,
  joinPanel,
  joinButton,
  joinError,
  hud,
  toast,
  world,
  chassisBody,
  vehicle,
  wheelPositions,
  VISUAL_CHASSIS_LENGTH_SCALE,
  spawnX,
  spawnZ,
  spawnYaw,
  arenaVisuals,
  localCar,
  makeCarVisual,
  updateLocalVisual,
  showToast
};

const controls = createControlsSystem(game);
game.controls = controls;
const multiplayer = createMultiplayerSystem(game);
game.multiplayer = multiplayer;
const garage = createGarageSystem(game);
game.garage = garage;

// Drive opens the mode selector. Only Race currently advances to the
// existing multiplayer room screen; Time Trial and Sandbox remain disabled.
$("menuDriveButton").addEventListener("click", () => garage.showModeSelect());
$("modeRaceButton").addEventListener("click", () => garage.showDriveScreen());
$("modeBackButton").addEventListener("click", () => garage.showMainMenu());
$("menuGarageButton").addEventListener("click", () => garage.showGarage());
$("garageBackButton").addEventListener("click", () => garage.showMainMenu());
$("driveBackButton").addEventListener("click", () => garage.showModeSelect());

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
}
window.addEventListener("resize", resize);

let lastTime = performance.now();
let drivingControlErrorReported = false;
function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  try {
    controls.updateDrivingControls(delta);
  } catch (error) {
    // A control bug must not stop the render loop or turn the track screen
    // into a blank background. Remove drive force and report the error once.
    for (let i = 0; i < 4; i++) {
      vehicle.applyEngineForce(0, i);
      vehicle.setBrake(0, i);
    }
    vehicle.setSteeringValue(0, 0);
    vehicle.setSteeringValue(0, 1);
    if (!drivingControlErrorReported) {
      console.error("Driving controls failed; keeping the game running:", error);
      showToast("Driving input error — please reload the game");
      drivingControlErrorReported = true;
    }
  }
  garage.updateGarageShellAnimation(now);
  world.step(FIXED_STEP, delta, 3);
  updateLocalVisual();
  multiplayer.updateRemoteVisuals(delta);

  const speedMph = chassisBody.velocity.length() * 2.236936;
  $("speedValue").textContent = String(Math.round(speedMph));
  const touching = vehicle.wheelInfos.filter((wheel) => wheel.isInContact).length;
  $("wheelStatus").textContent = touching + " / 4 TIRES IN CONTACT";

  // The showroom camera presents the parked truck in menu and garage views.
  if (garage.viewMode === "menu" || garage.viewMode === "mode-select" || garage.viewMode === "garage") {
    const distance = garage.viewMode === "garage" ? 2.35 : 5.1;
    const height = garage.viewMode === "garage" ? 1.18 : 2.15;
    const orbitDirection = new THREE.Vector3(0, 0, 1)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), controls.cameraOrbitYaw + (garage.viewMode === "menu" ? -0.18 : 0));
    const showroomCamera = localCar.root.position.clone()
      .addScaledVector(orbitDirection, distance)
      .add(new THREE.Vector3(0, height, 0));
    camera.position.lerp(showroomCamera, 1 - Math.exp(-3.2 * delta));
    camera.lookAt(localCar.root.position.clone().add(new THREE.Vector3(0, 0.12, 0)));
    garage.updateHoverBounds();
  } else {
  // Follow horizontal heading only; ignore chassis pitch and roll.
  const carForward = new THREE.Vector3(0, 0, -1).applyQuaternion(localCar.root.quaternion);
  carForward.y = 0;
  if (carForward.lengthSq() < 0.0001) carForward.set(0, 0, -1);
  carForward.normalize();
  const cameraDirection = carForward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), controls.cameraOrbitYaw);
  const desiredCamera = localCar.root.position.clone()
    .addScaledVector(cameraDirection, -5.8)
    .add(new THREE.Vector3(0, 2.8, 0));
  camera.position.lerp(desiredCamera, 1 - Math.exp(-2.8 * delta));
  const lookTarget = localCar.root.position.clone()
    .add(new THREE.Vector3(0, 0.28, 0))
    .addScaledVector(carForward, 0.85);
  camera.up.set(0, 1, 0);
  camera.lookAt(lookTarget);
  }

  multiplayer.sendSnapshotIfReady(delta);

  renderer.render(scene, camera);
}
updateLocalVisual();
$("loading").style.display = "none";
garage.showMainMenu();
requestAnimationFrame(animate);

// Generate a local default nickname so each tab is easy to distinguish.
$("driverName").value = "Driver" + String(Math.floor(100 + Math.random() * 900));
