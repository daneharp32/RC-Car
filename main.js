import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js";
import * as CANNON from "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js";
import { createPhysicsSystem } from "./physics.js";
import { createCarVisualFactory } from "./car.js";
import { createControlsSystem } from "./controls.js";
import { createMultiplayerSystem } from "./multiplayer.js";
import { createGarageSystem } from "./garage.js";

// Main application entry: renderer, track visuals, shared state, and frame loop.
const $ = (id) => document.getElementById(id);
const canvas = $("gameCanvas");
const joinPanel = $("joinPanel");
const mainMenuPanel = $("mainMenuPanel");
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
scene.background = new THREE.Color(0xb6c8cc);
scene.fog = new THREE.Fog(0xb6c8cc, 65, 155);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 180);
camera.position.set(0, 3.1, 5.8);

const hemi = new THREE.HemisphereLight(0xe7f1f4, 0x6b5943, 1.45);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffe2bd, 2.15);
sun.position.set(-8, 15, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
sun.shadow.camera.left = -24;
sun.shadow.camera.right = 24;
sun.shadow.camera.top = 24;
sun.shadow.camera.bottom = -24;
sun.shadow.bias = -0.00015;
scene.add(sun);

const fill = new THREE.DirectionalLight(0xb8d8e9, 0.65);
fill.position.set(8, 6, -10);
scene.add(fill);

// Single large ground surface for the open practice field.
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xa18d70, roughness: 1 });
const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), groundMaterial);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.position.y = -0.025;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

const grid = new THREE.GridHelper(100, 50, 0x786d5d, 0xa99a81);
grid.position.y = 0.002;
grid.material.transparent = true;
grid.material.opacity = 0.09;
scene.add(grid);

const jumpLocations = [
  // Main, taller short-course kicker. The gradual approach keeps it drivable.
  { x: 0, z: -13, yaw: 0, width: 6.8, length: 6.2, height: 2.25 },
  { x: -15, z: 7, yaw: 0, width: 4.8, length: 4.8, height: 0.95 },
  { x: 16, z: 18, yaw: 0, width: 5.0, length: 5.0, height: 1.05 },
  { x: 4, z: 34, yaw: 0, width: 4.6, length: 4.8, height: 0.9 }
];
const jumpMaterial = new THREE.MeshStandardMaterial({ color: 0x806b50, roughness: 0.96 });
const arenaVisuals = [groundMesh, grid];
const rampVisuals = [];

function makeRampGeometry(width, length, height) {
  const w = width / 2;
  const l = length / 2;
  const vertices = [
    [-w, 0, l], [w, 0, l], [-w, 0, -l],
    [w, 0, -l], [-w, height, -l], [w, height, -l]
  ];
  const faces = [
    [0, 2, 3, 1], [0, 1, 5, 4], [0, 4, 2],
    [1, 3, 5], [2, 4, 5, 3]
  ];
  const indices = [];
  for (const face of faces) {
    for (let i = 1; i < face.length - 1; i++) indices.push(face[0], face[i], face[i + 1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices.flat(), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

for (const jump of jumpLocations) {
  const ramp = new THREE.Mesh(
    makeRampGeometry(jump.width, jump.length, jump.height),
    jumpMaterial
  );
  ramp.position.set(jump.x, 0, jump.z);
  ramp.rotation.y = jump.yaw;
  ramp.castShadow = true;
  ramp.receiveShadow = true;
  scene.add(ramp);
  rampVisuals.push(ramp);
}
arenaVisuals.push(...rampVisuals);

// Physics: Cannon's RaycastVehicle applies suspension and tire impulses only
// when each wheel ray has actually found a surface to touch.

const physicsSystem = createPhysicsSystem({ CANNON, jumpLocations });
const {
  world,
  chassisBody,
  vehicle,
  wheelPositions,
  VISUAL_CHASSIS_LENGTH_SCALE,
  spawnX,
  spawnZ
} = physicsSystem;

const makeCarVisual = createCarVisualFactory({ THREE, scene, VISUAL_CHASSIS_LENGTH_SCALE, vehicle });
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

$("menuDriveButton").addEventListener("click", () => garage.showDriveScreen());
$("menuGarageButton").addEventListener("click", () => garage.showGarage());
$("garageBackButton").addEventListener("click", () => garage.showMainMenu());
$("driveBackButton").addEventListener("click", () => garage.showMainMenu());

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
  if (garage.viewMode === "menu" || garage.viewMode === "garage") {
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
