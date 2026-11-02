import { joinRoom, selfId } from "https://esm.sh/trystero@0.26.0";

// Peer-to-peer room discovery, player snapshots, and remote-car interpolation.
export function createMultiplayerSystem(game) {
  const APP_ID = "io.daneharp32.rcpitlane";
  const { THREE, scene, chassisBody, vehicle, wheelPositions, VISUAL_CHASSIS_LENGTH_SCALE, makeCarVisual } = game;
  const $ = game.$;
  const { joinButton, joinError, joinPanel, hud } = game;
  const showToast = game.showToast;
const remotePlayers = new Map();
const remotePalette = [0x42c7c2, 0x76a8ff, 0xe879b2, 0xa2d66d, 0xb18aff, 0xff795e];
function colorForPeer(peerId) {
  let hash = 0;
  for (let i = 0; i < peerId.length; i++) hash = (hash * 31 + peerId.charCodeAt(i)) | 0;
  return remotePalette[Math.abs(hash) % remotePalette.length];
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
      pivot.position.set(x, -0.095, z * VISUAL_CHASSIS_LENGTH_SCALE);
      const steerQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i < 2 ? remote.steering : 0);
      const spinQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), remote.wheelRotations[i]);
      pivot.quaternion.copy(steerQ).multiply(spinQ);
    }
  }
  updatePlayerCount();
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
    game.garage.viewMode = "drive";
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
  for (const key of Object.keys(game.controls.keys)) game.controls.keys[key] = false;
  updatePlayerCount();
  hud.style.display = "none";
  joinPanel.style.display = "block";
  game.garage.viewMode = "drive";
  game.garage.setArenaVisible(true);
  $("topStatus").style.display = "flex";
  $("topStatus").textContent = "READY TO DRIVE";
  $("statusDot").classList.remove("live");
  game.controls.resetCar();
}

  let networkTimer = 0;
  function sendSnapshotIfReady(delta) {
    networkTimer += delta;
    if (joined && stateAction && networkTimer >= 1 / 15) {
      stateAction.send(makeSnapshot());
      networkTimer = 0;
    }
  }

  joinButton.addEventListener("click", joinArena);
  $("leaveButton").addEventListener("click", leaveArena);
  $("roomCode").addEventListener("keydown", (event) => {
    if (event.key === "Enter") joinArena();
  });
  $("driverName").addEventListener("keydown", (event) => {
    if (event.key === "Enter") $("roomCode").focus();
  });

  return {
    joinArena,
    leaveArena,
    updateRemoteVisuals,
    updatePlayerCount,
    sendSnapshotIfReady,
    get joined() { return joined; },
    get stateAction() { return stateAction; },
    get remotePlayers() { return remotePlayers; },
    get driverName() { return driverName; }
  };
}
