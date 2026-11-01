import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js";
import * as CANNON from "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js";
import { joinRoom, selfId } from "https://esm.sh/trystero@0.26.0";

const $ = (id) => document.getElementById(id);
const canvas = $("gameCanvas");
const joinPanel = $("joinPanel");
const joinButton = $("joinButton");
const joinError = $("joinError");
const hud = $("hud");
const toast = $("toast");
const FIXED_STEP = 1 / 60;
const APP_ID = "io.daneharp32.rcpitlane";

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
scene.fog = new THREE.Fog(0xb6c8cc, 30, 82);

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

const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x9b8668, roughness: 1 });
const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), groundMaterial);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.position.y = -0.025;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

function addTrackLine(radiusX, radiusZ, color, opacity = 0.8) {
  const points = [];
  for (let i = 0; i <= 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * radiusX, 0.006, Math.sin(a) * radiusZ));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  );
  scene.add(line);
}

addTrackLine(10.5, 14, 0xe0c69d, 0.72);
addTrackLine(8.9, 12.4, 0x76644e, 0.4);

const grid = new THREE.GridHelper(48, 48, 0x786d5d, 0xa99a81);
grid.position.y = 0.002;
grid.material.transparent = true;
grid.material.opacity = 0.13;
scene.add(grid);

function addCone(x, z, color = 0xff8538) {
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.19, 0.48, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.78 })
  );
  cone.position.set(x, 0.24, z);
  cone.castShadow = true;
  cone.receiveShadow = true;
  scene.add(cone);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.23, 0.23, 0.055, 12),
    new THREE.MeshStandardMaterial({ color: 0x282c30, roughness: 1 })
  );
  base.position.set(x, 0.03, z);
  base.castShadow = true;
  scene.add(base);
}

[
  [-5.5, -8], [5.5, -8], [-7.2, -2], [7.2, -2],
  [-7.2, 7], [7.2, 7], [-3.4, 11], [3.4, 11],
  [-10.5, 0], [10.5, 0]
].forEach(([x, z], i) => addCone(x, z, i % 3 === 0 ? 0xffb14d : 0xff8538));

function addBarrier(x, z, length, alongX = true) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(alongX ? length : 0.22, 0.34, alongX ? 0.22 : length),
    new THREE.MeshStandardMaterial({ color: 0x4d5559, roughness: 0.9 })
  );
  mesh.position.set(x, 0.17, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}
addBarrier(0, -17, 34, true);
addBarrier(0, 17, 34, true);
addBarrier(-17, 0, 34, false);
addBarrier(17, 0, 34, false);

// A few visual paddock details give the flat practice area a sense of scale.
for (let i = -2; i <= 2; i++) {
  const post = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 1.05, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x555b5c, roughness: 0.95 })
  );
  post.position.set(i * 4, 0.52, -17.15);
  post.castShadow = true;
  scene.add(post);
}
const sign = new THREE.Mesh(
  new THREE.BoxGeometry(3.8, 0.76, 0.12),
  new THREE.MeshStandardMaterial({ color: 0x25323a, roughness: 0.72 })
);
sign.position.set(0, 1.35, -17.1);
scene.add(sign);

// Physics: Cannon's RaycastVehicle applies suspension and tire impulses only
// when each wheel ray has actually found a surface to touch.
const world = new CANNON.World({
  gravity: new CANNON.Vec3(0, -9.82, 0)
});
world.broadphase = new CANNON.SAPBroadphase(world);
world.solver.iterations = 12;
world.allowSleep = false;
world.defaultContactMaterial.friction = 0.35;
world.defaultContactMaterial.restitution = 0.02;

const groundBody = new CANNON.Body({ mass: 0, material: new CANNON.Material("dirt") });
groundBody.addShape(new CANNON.Plane());
groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
world.addBody(groundBody);

const chassisMaterial = new CANNON.Material("chassis");
world.addContactMaterial(new CANNON.ContactMaterial(chassisMaterial, groundBody.material, {
  friction: 0.25,
  restitution: 0.02,
  contactEquationStiffness: 1e7
}));

let spawnHash = 0;
for (let i = 0; i < selfId.length; i++) spawnHash = (spawnHash * 31 + selfId.charCodeAt(i)) | 0;
const spawnAngle = (Math.abs(spawnHash) % 8) * (Math.PI / 4);
const spawnX = Math.cos(spawnAngle) * 3;
const spawnZ = Math.sin(spawnAngle) * 3;

const chassisBody = new CANNON.Body({
  mass: 6.2,
  material: chassisMaterial,
  position: new CANNON.Vec3(spawnX, 0.24, spawnZ),
  linearDamping: 0.10,
  angularDamping: 0.42
});
chassisBody.addShape(new CANNON.Box(new CANNON.Vec3(0.28, 0.075, 0.41)));
chassisBody.allowSleep = false;

const vehicle = new CANNON.RaycastVehicle({
  chassisBody,
  indexForwardAxis: 2,
  indexRightAxis: 0,
  indexUpAxis: 1
});

const wheelPositions = [
  [-0.305, -0.018, -0.29],
  [ 0.305, -0.018, -0.29],
  [-0.305, -0.018,  0.29],
  [ 0.305, -0.018,  0.29]
];

for (let i = 0; i < 4; i++) {
  const [x, y, z] = wheelPositions[i];
  vehicle.addWheel({
    chassisConnectionPointLocal: new CANNON.Vec3(x, y, z),
    directionLocal: new CANNON.Vec3(0, -1, 0),
    axleLocal: new CANNON.Vec3(-1, 0, 0),
    suspensionRestLength: 0.12,
    suspensionStiffness: 55,
    dampingCompression: 4.4,
    dampingRelaxation: 3.6,
    maxSuspensionTravel: 0.14,
    maxSuspensionForce: 260,
    radius: 0.13,
    frictionSlip: 4.4,
    rollInfluence: 0.055,
    isFrontWheel: i < 2,
    useCustomSlidingRotationalSpeed: true,
    customSlidingRotationalSpeed: 18
  });
}
vehicle.addToWorld(world);

const rubberMaterial = new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.96 });
const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xabb5ba, metalness: 0.68, roughness: 0.34 });
const hubMaterial = new THREE.MeshStandardMaterial({ color: 0x333b40, metalness: 0.35, roughness: 0.55 });

function makeCarVisual(color, playerName = "") {
  const root = new THREE.Group();
  const shellMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.52,
    metalness: 0.12
  });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x242a2e, roughness: 0.7 });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x253a46,
    roughness: 0.22,
    metalness: 0.14
  });
  const lightMaterial = new THREE.MeshStandardMaterial({
    color: 0xffe4a4,
    emissive: 0xffb84d,
    emissiveIntensity: 0.7
  });

  function box(size, material, position, parent = root) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  box([0.56, 0.105, 0.77], darkMaterial, [0, -0.015, 0]);
  box([0.57, 0.135, 0.69], shellMaterial, [0, 0.075, 0.015]);
  box([0.54, 0.075, 0.28], shellMaterial, [0, 0.143, -0.235]);
  box([0.405, 0.12, 0.30], glassMaterial, [0, 0.195, 0.015]);
  box([0.43, 0.035, 0.33], shellMaterial, [0, 0.27, 0.015]);
  box([0.63, 0.075, 0.10], darkMaterial, [0, -0.005, -0.435]);
  box([0.63, 0.075, 0.10], darkMaterial, [0, -0.005, 0.435]);
  box([0.48, 0.055, 0.055], shellMaterial, [0, 0.12, 0.39]);
  box([0.51, 0.035, 0.12], darkMaterial, [0, 0.24, 0.43]);
  box([0.07, 0.045, 0.025], lightMaterial, [-0.19, 0.13, -0.382]);
  box([0.07, 0.045, 0.025], lightMaterial, [0.19, 0.13, -0.382]);

  // Simple roll-cage rails make the small truck read clearly from the chase camera.
  const cagePoints = [
    [[-0.22, 0.13, -0.10], [-0.22, 0.31, -0.10]],
    [[ 0.22, 0.13, -0.10], [ 0.22, 0.31, -0.10]],
    [[-0.22, 0.31, -0.10], [-0.22, 0.31, 0.16]],
    [[ 0.22, 0.31, -0.10], [ 0.22, 0.31, 0.16]],
    [[-0.22, 0.31, 0.16], [-0.22, 0.13, 0.16]],
    [[ 0.22, 0.31, 0.16], [ 0.22, 0.13, 0.16]]
  ];
  for (const [a, b] of cagePoints) {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const length = start.distanceTo(end);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, length, 7), darkMaterial);
    rail.position.copy(start).add(end).multiplyScalar(0.5);
    rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
    rail.castShadow = true;
    root.add(rail);
  }

  const wheelPivots = [];
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(...wheelPositions[i]);
    root.add(pivot);

    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 0.105, 20),
      rubberMaterial
    );
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    tire.receiveShadow = true;
    pivot.add(tire);

    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.077, 0.077, 0.109, 16),
      rimMaterial
    );
    rim.rotation.z = Math.PI / 2;
    rim.castShadow = true;
    pivot.add(rim);

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.028, 0.112, 12),
      hubMaterial
    );
    hub.rotation.z = Math.PI / 2;
    pivot.add(hub);
    wheelPivots.push(pivot);
  }

  if (playerName) {
    const tagCanvas = document.createElement("canvas");
    tagCanvas.width = 512;
    tagCanvas.height = 128;
    const ctx = tagCanvas.getContext("2d");
    ctx.fillStyle = "rgba(13,20,29,0.80)";
    ctx.beginPath();
    ctx.roundRect(8, 14, 496, 100, 28);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 46px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(playerName.slice(0, 18), 256, 64);
    const texture = new THREE.CanvasTexture(tagCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false
    }));
    tag.position.set(0, 0.76, 0);
    tag.scale.set(1.2, 0.3, 1);
    root.add(tag);
  }

  scene.add(root);
  return { root, wheelPivots };
}

const localCar = makeCarVisual(0xffa33d);
const remotePlayers = new Map();
const remotePalette = [0x42c7c2, 0x76a8ff, 0xe879b2, 0xa2d66d, 0xb18aff, 0xff795e];
function colorForPeer(peerId) {
  let hash = 0;
  for (let i = 0; i < peerId.length; i++) hash = (hash * 31 + peerId.charCodeAt(i)) | 0;
  return remotePalette[Math.abs(hash) % remotePalette.length];
}

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

function makeSnapshot() {
  return {
    name: driverName,
    x: chassisBody.position.x,
    y: chassisBody.position.y,
    z: chassisBody.position.z,
    qx: chassisBody.quaternion.x,
    qy: chassisBody.quaternion.y,
    qz: chassisBody.quaternion.z,
    qw: chassisBody.quaternion.w,
    wheels: vehicle.wheelInfos.map((wheel) => wheel.rotation),
    steer: vehicle.wheelInfos[0].steering,
    mph: chassisBody.velocity.length() * 2.236936
  };
}

function validSnapshot(data) {
  return data && [data.x, data.y, data.z, data.qx, data.qy, data.qz, data.qw]
    .every((value) => Number.isFinite(value));
}

let room = null;
let stateAction = null;
let driverName = "Driver";
let joinedRoomCode = "";
let joined = false;
let peersConnected = false;
let lastToastTimer = 0;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(lastToastTimer);
  lastToastTimer = window.setTimeout(() => toast.classList.remove("show"), 2300);
}

function updatePlayerCount() {
  const count = remotePlayers.size + 1;
  $("playersValue").textContent = count === 1 ? "1 DRIVER" : count + " DRIVERS";
  $("topStatus").textContent = peersConnected ? "MULTIPLAYER CONNECTED" : "WAITING FOR DRIVERS";
  $("statusDot").classList.toggle("live", peersConnected);
}

function addRemotePlayer(peerId, data) {
  let remote = remotePlayers.get(peerId);
  if (!remote) {
    const name = typeof data.name === "string" ? data.name.slice(0, 18) : "Driver";
    const visual = makeCarVisual(colorForPeer(peerId), name);
    remote = {
      visual,
      target: null,
      lastSeen: performance.now(),
      wheelRotations: [0, 0, 0, 0],
      steering: 0,
      name
    };
    remotePlayers.set(peerId, remote);
    updatePlayerCount();
  }
  if (validSnapshot(data)) {
    remote.target = {
      position: new THREE.Vector3(data.x, data.y, data.z),
      quaternion: new THREE.Quaternion(data.qx, data.qy, data.qz, data.qw).normalize()
    };
    remote.wheelRotations = Array.isArray(data.wheels)
      ? data.wheels.slice(0, 4).map((value) => Number.isFinite(value) ? value : 0)
      : remote.wheelRotations;
    remote.steering = Number.isFinite(data.steer) ? data.steer : 0;
    remote.lastSeen = performance.now();
  }
}

function updateRemoteVisuals(delta) {
  const alpha = 1 - Math.exp(-12 * delta);
  for (const [peerId, remote] of remotePlayers) {
    if (performance.now() - remote.lastSeen > 12000) {
      scene.remove(remote.visual.root);
      remotePlayers.delete(peerId);
      peersConnected = remotePlayers.size > 0;
      continue;
    }
    if (!remote.target) continue;
    remote.visual.root.position.lerp(remote.target.position, alpha);
    remote.visual.root.quaternion.slerp(remote.target.quaternion, alpha);
    for (let i = 0; i < 4; i++) {
      const [x, , z] = wheelPositions[i];
      const pivot = remote.visual.wheelPivots[i];
      pivot.position.set(x, -0.095, z);
      const steerQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i < 2 ? remote.steering : 0);
      const spinQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), remote.wheelRotations[i]);
      pivot.quaternion.copy(steerQ).multiply(spinQ);
    }
  }
  updatePlayerCount();
}

// Keyboard controls
const keys = Object.create(null);
const controlKeys = new Set(["w", "a", "s", "d", " ", "r", "arrowup", "arrowdown", "arrowleft", "arrowright"]);

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (controlKeys.has(key) && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
    event.preventDefault();
    keys[key] = true;
  }
  if (key === "r" && !event.repeat && joined) resetCar();
});

window.addEventListener("keyup", (event) => {
  keys[event.key.toLowerCase()] = false;
});
window.addEventListener("blur", () => {
  for (const key of Object.keys(keys)) keys[key] = false;
});

function resetCar() {
  chassisBody.position.set(spawnX, 0.24, spawnZ);
  chassisBody.quaternion.set(0, 0, 0, 1);
  chassisBody.velocity.set(0, 0, 0);
  chassisBody.angularVelocity.set(0, 0, 0);
  chassisBody.force.set(0, 0, 0);
  chassisBody.torque.set(0, 0, 0);
  chassisBody.wakeUp();
  for (let i = 0; i < 4; i++) {
    vehicle.wheelInfos[i].rotation = 0;
    vehicle.wheelInfos[i].deltaRotation = 0;
    vehicle.wheelInfos[i].engineForce = 0;
  }
  showToast("Car reset");
}

let steerState = 0;
function updateDrivingControls() {
  if (!joined) {
    for (let i = 0; i < 4; i++) {
      vehicle.applyEngineForce(0, i);
      vehicle.setBrake(5, i);
    }
    return;
  }

  const forward = keys.w || keys.arrowup ? 1 : 0;
  const reverse = keys.s || keys.arrowdown ? -1 : 0;
  const throttle = forward + reverse;
  const steerTarget = (keys.a || keys.arrowleft ? 1 : 0) - (keys.d || keys.arrowright ? 1 : 0);
  steerState += (steerTarget - steerState) * 0.22;

  const speed = chassisBody.velocity.length();
  const speedSteerScale = THREE.MathUtils.clamp(1 - speed / 26, 0.48, 1);
  const steeringAngle = steerState * 0.49 * speedSteerScale;

  vehicle.setSteeringValue(steeringAngle, 0);
  vehicle.setSteeringValue(steeringAngle, 1);
  const engineForce = -throttle * 72;
  const brakeForce = keys[" "] ? 19 : 0;
  for (let i = 0; i < 4; i++) {
    vehicle.applyEngineForce(engineForce, i);
    vehicle.setBrake(brakeForce, i);
  }
}

// Multiplayer is peer-to-peer. Trystero uses public Nostr relays for discovery,
// while the actual car snapshots travel directly between browsers over WebRTC.
async function joinArena() {
  if (joined || room) return;
  const typedName = $("driverName").value.trim().slice(0, 18);
  const typedRoom = $("roomCode").value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24);
  if (!typedRoom) {
    joinError.textContent = "Enter a room code to join.";
    joinError.style.display = "block";
    return;
  }

  driverName = typedName || "Driver";
  joinedRoomCode = typedRoom;
  joinButton.disabled = true;
  joinButton.textContent = "CONNECTING...";
  joinError.style.display = "none";

  try {
    room = joinRoom({ appId: APP_ID }, joinedRoomCode);
    stateAction = room.makeAction("vehicle-state");

    stateAction.onMessage = (data, meta) => {
      const peerId = meta?.peerId;
      if (!peerId || peerId === selfId || !validSnapshot(data)) return;
      addRemotePlayer(peerId, data);
    };

    room.onPeerJoin = (peerId) => {
      peersConnected = true;
      updatePlayerCount();
      if (stateAction) stateAction.send(makeSnapshot());
      showToast("Another driver joined");
    };

    room.onPeerLeave = (peerId) => {
      const remote = remotePlayers.get(peerId);
      if (remote) {
        scene.remove(remote.visual.root);
        remotePlayers.delete(peerId);
      }
      peersConnected = remotePlayers.size > 0;
      updatePlayerCount();
      showToast("A driver left the room");
    };

    joined = true;
    $("roomValue").textContent = joinedRoomCode.toUpperCase();
    joinPanel.style.display = "none";
    hud.style.display = "block";
    $("statusDot").classList.remove("live");
    $("topStatus").textContent = "WAITING FOR DRIVERS";
    updatePlayerCount();
    showToast("You're in the arena");
  } catch (error) {
    console.error("Unable to join multiplayer room:", error);
    room = null;
    stateAction = null;
    joinError.textContent = "Couldn't start multiplayer. Check your connection and try again.";
    joinError.style.display = "block";
  } finally {
    joinButton.disabled = false;
    joinButton.textContent = "JOIN THE ARENA";
  }
}

async function leaveArena() {
  if (room) {
    try {
      await room.leave();
    } catch (error) {
      console.warn("Room cleanup failed:", error);
    }
  }
  room = null;
  stateAction = null;
  joined = false;
  peersConnected = false;
  for (const remote of remotePlayers.values()) scene.remove(remote.visual.root);
  remotePlayers.clear();
  for (const key of Object.keys(keys)) keys[key] = false;
  updatePlayerCount();
  hud.style.display = "none";
  joinPanel.style.display = "block";
  $("topStatus").textContent = "READY TO DRIVE";
  $("statusDot").classList.remove("live");
  resetCar();
}

joinButton.addEventListener("click", joinArena);
$("leaveButton").addEventListener("click", leaveArena);
$("roomCode").addEventListener("keydown", (event) => {
  if (event.key === "Enter") joinArena();
});
$("driverName").addEventListener("keydown", (event) => {
  if (event.key === "Enter") $("roomCode").focus();
});

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
let networkTimer = 0;
function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  updateDrivingControls();
  world.step(FIXED_STEP, delta, 3);
  updateLocalVisual();
  updateRemoteVisuals(delta);

  const speedMph = chassisBody.velocity.length() * 2.236936;
  $("speedValue").textContent = String(Math.round(speedMph));
  const touching = vehicle.wheelInfos.filter((wheel) => wheel.isInContact).length;
  $("wheelStatus").textContent = touching + " / 4 TIRES IN CONTACT";

  const cameraOffset = new THREE.Vector3(0, 2.45, 5.3).applyQuaternion(localCar.root.quaternion);
  const desiredCamera = localCar.root.position.clone().add(cameraOffset);
  camera.position.lerp(desiredCamera, 1 - Math.exp(-4.5 * delta));
  const lookTarget = localCar.root.position.clone().add(new THREE.Vector3(0, 0.36, -0.7).applyQuaternion(localCar.root.quaternion));
  camera.lookAt(lookTarget);

  networkTimer += delta;
  if (joined && stateAction && networkTimer >= 1 / 15) {
    stateAction.send(makeSnapshot());
    networkTimer = 0;
  }

  renderer.render(scene, camera);
}
updateLocalVisual();
$("loading").style.display = "none";
requestAnimationFrame(animate);

// Generate a local default nickname so each tab is easy to distinguish.
$("driverName").value = "Driver" + String(Math.floor(100 + Math.random() * 900));
