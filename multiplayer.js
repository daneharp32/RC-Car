import { joinRoom, selfId } from "https://esm.sh/trystero@0.26.0";

// Peer-to-peer lobby directory, player snapshots, and remote-car interpolation.
// Hosts announce active lobbies over a shared directory room.
export function createMultiplayerSystem(game) {
  const APP_ID = "io.daneharp32.rcpitlane";
  const DIRECTORY_ROOM_ID = "rc-car-public-lobby-directory-v1";
  const DIRECTORY_ACTION = "lobby-directory";
  const MAX_PLAYERS = 8;
  // Allow a few missed heartbeat intervals before a listing expires.
  const LOBBY_TTL_MS = 20000;
  const HEARTBEAT_MS = 4000;
  // Use several default Nostr relays rather than relying on one relay endpoint.
  const SIGNALING_REDUNDANCY = 5;
  const signalingConfig = () => ({
    appId: APP_ID,
    relayConfig: { redundancy: SIGNALING_REDUNDANCY }
  });

  const {
    THREE, scene, chassisBody, vehicle, wheelPositions,
    VISUAL_CHASSIS_LENGTH_SCALE, makeCarVisual
  } = game;
  const $ = game.$;
  const { joinButton, joinError, joinPanel, modeSelectPanel, hud } = game;
  const showToast = game.showToast;

  const remotePlayers = new Map();
  const remotePalette = [0x42c7c2, 0x76a8ff, 0xe879b2, 0xa2d66d, 0xb18aff, 0xff795e];
  const roomPeerIds = new Set();
  const pendingRoomPeers = new Set();
  const directoryPeers = new Set();
  const discoveredLobbies = new Map();

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
      mph: chassisBody.velocity.length() * 2.236936,
      race: game.race ? game.race.getNetworkState() : null
    };
  }

  function validSnapshot(data) {
    return data && [data.x, data.y, data.z, data.qx, data.qy, data.qz, data.qw]
      .every((value) => Number.isFinite(value));
  }

  let room = null;
  let stateAction = null;
  let raceControlAction = null;
  let directoryRoom = null;
  let directoryAction = null;
  let directoryTimer = null;
  let driverName = "Driver";
  let currentLobby = null;
  let hostingLobby = false;
  let joined = false;
  let peersConnected = false;
  let networkTimer = 0;
  let selectedLobbyMode = "race";

  function cleanPlayerName(value) {
    return typeof value === "string"
      ? value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 18)
      : "";
  }

  function setDriverName(value) {
    driverName = cleanPlayerName(value) || "Driver";
    const input = $("driverName");
    if (input && input.value !== driverName) input.value = driverName;
    if (joined && game.localCar?.setPlayerName) {
      game.localCar.setPlayerName(driverName, true);
    }
    return driverName;
  }

  function currentPlayerCount() {
    return Math.min(MAX_PLAYERS, 1 + roomPeerIds.size);
  }

  function currentLobbyAcceptsPlayers() {
    if (!hostingLobby || !currentLobby) return false;
    if (currentLobby.mapId === "gravel-basin" && currentLobby.mode !== "free-drive") return false;
    return currentLobby.mode === "free-drive"
      ? game.race?.phase === "free-drive"
      : game.race?.phase === "waiting";
  }

  function lobbyCanBeJoined(lobby) {
    if (!lobby) return false;
    if (lobby.mapId === "gravel-basin" && lobby.mode !== "free-drive") return false;
    return lobby.mode === "free-drive"
      ? lobby.phase === "free-drive"
      : !lobby.phase || lobby.phase === "waiting";
  }

  function createLobbyButtonLabel() {
    const label = selectedLobbyMode === "free-drive"
      ? "FREE DRIVE"
      : selectedLobbyMode === "time-trial"
        ? "TIME TRIAL"
        : "RACE";
    return "CREATE " + label + " LOBBY";
  }

  let lastNonGravelLobbyMode = "race";
  function renderSelectedLobbyMode() {
    const isGravelBasin = game.activeMapId === "gravel-basin";
    const modeButtons = [...document.querySelectorAll(".lobby-mode-choice[data-lobby-mode]")];

    for (const button of modeButtons) {
      const mode = button.dataset.lobbyMode;
      const restricted = isGravelBasin && (mode === "race" || mode === "time-trial");
      button.disabled = restricted || mode === "sandbox";
      button.classList.toggle("unavailable", restricted || mode === "sandbox");
      button.setAttribute("aria-disabled", button.disabled ? "true" : "false");
      const small = button.querySelector("small");
      if (small) {
        if (restricted) small.textContent = "ONLY ON CLUB DIRT CIRCUIT";
        else if (mode === "race") small.textContent = "LAPS & CHECKPOINTS";
        else if (mode === "time-trial") small.textContent = "FASTEST LAP WINS · CHECKPOINTS";
        else if (mode === "free-drive") small.textContent = "OPEN DRIVING SESSION";
        else if (mode === "sandbox") small.textContent = "COMING SOON";
      }
      button.title = restricted ? "Race and Time Trial are only available on Club Dirt Circuit." : "";
    }

    const selectedButton = modeButtons.find((button) =>
      button.dataset.lobbyMode === selectedLobbyMode && !button.disabled
    );
    if (!selectedButton) selectedLobbyMode = isGravelBasin ? "free-drive" : "race";
    for (const button of modeButtons) {
      button.classList.toggle("selected", button.dataset.lobbyMode === selectedLobbyMode);
    }

    const lapField = $("raceLapField");
    if (lapField) lapField.style.display = selectedLobbyMode === "free-drive" ? "none" : "block";
    const lapLabel = lapField?.querySelector("span");
    if (lapLabel) lapLabel.textContent = selectedLobbyMode === "time-trial" ? "Number of timed laps" : "Number of laps";
    joinButton.textContent = createLobbyButtonLabel();
    const hint = $("lobbyModeHint");
    if (hint) hint.style.display = selectedLobbyMode === "time-trial" ? "block" : "none";
    const mapNotice = $("lobbyMapModeNotice");
    if (mapNotice) mapNotice.style.display = isGravelBasin ? "block" : "none";
    const description = joinPanel.querySelector(".menu-description");
    if (description) description.textContent = isGravelBasin
      ? "Gravel Basin is an open practice area. Create a Free Drive session to explore it with other drivers."
      : selectedLobbyMode === "time-trial"
        ? "Complete the selected laps and compete for the fastest valid lap time."
        : selectedLobbyMode === "free-drive"
          ? "Create an open session with no race timer or checkpoints."
          : "Choose a lap count and race through every checkpoint.";
  }

  function updateAvailableModes() {
    const isGravelBasin = game.activeMapId === "gravel-basin";
    if (isGravelBasin) {
      if (selectedLobbyMode !== "free-drive") lastNonGravelLobbyMode = selectedLobbyMode;
      selectedLobbyMode = "free-drive";
    } else if (selectedLobbyMode === "free-drive") {
      selectedLobbyMode = lastNonGravelLobbyMode || "race";
    }
    renderSelectedLobbyMode();
  }

  function updatePlayerCount() {
    const count = currentPlayerCount();
    $("playersValue").textContent = count + " / " + MAX_PLAYERS + " PLAYERS";
    const freeDrive = currentLobby?.mode === "free-drive";
    const timeTrial = currentLobby?.mode === "time-trial";
    $("topStatus").textContent = freeDrive
      ? (peersConnected ? "FREE DRIVE · DRIVERS CONNECTED" : "FREE DRIVE · OPEN SESSION")
      : timeTrial
        ? (peersConnected ? "TIME TRIAL · DRIVERS CONNECTED" : "TIME TRIAL · READY")
        : (peersConnected ? "MULTIPLAYER CONNECTED" : "WAITING FOR DRIVERS");
    $("statusDot").classList.toggle("live", peersConnected);
  }

  function updateDirectoryStatus(message) {
    const status = $("lobbyDirectoryStatus");
    if (!status) return;
    if (message) {
      status.textContent = message;
      return;
    }
    status.textContent = directoryPeers.size
      ? "LOBBY DIRECTORY CONNECTED"
      : "SEARCHING FOR AVAILABLE LOBBIES";
  }

  function addRemotePlayer(peerId, data) {
    let remote = remotePlayers.get(peerId);
    if (!remote) {
      const name = cleanPlayerName(data.name) || "Driver";
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
    const incomingName = cleanPlayerName(data.name) || remote.name || "Driver";
    if (incomingName !== remote.name) {
      remote.name = incomingName;
      remote.visual.setPlayerName?.(incomingName, true);
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

  function renderLobbyList() {
    const list = $("lobbyList");
    if (!list) return;

    const now = Date.now();
    const lobbies = [...discoveredLobbies.values()]
      .filter((lobby) => now - lobby.lastSeen < LOBBY_TTL_MS)
      .sort((a, b) => b.playerCount - a.playerCount || a.name.localeCompare(b.name));

    list.replaceChildren();
    if (!lobbies.length) {
      const empty = document.createElement("div");
      empty.className = "lobby-empty";
      empty.textContent = "No active lobbies found. Create one to get started.";
      list.appendChild(empty);
      return;
    }

    for (const lobby of lobbies) {
      const row = document.createElement("div");
      row.className = "lobby-row";

      const main = document.createElement("div");
      main.className = "lobby-row-main";
      const name = document.createElement("div");
      name.className = "lobby-row-name";
      name.textContent = lobby.name;
      const mode = document.createElement("div");
      mode.className = "lobby-row-mode";
      const mapLabel = lobby.mapId === "gravel-basin" ? "GRAVEL BASIN" : "CLUB DIRT CIRCUIT";
      mode.textContent = (lobby.mode === "free-drive"
        ? "FREE DRIVE · OPEN SESSION"
        : (lobby.mode === "time-trial" ? "TIME TRIAL · " : "RACE · ") +
          lobby.laps + (lobby.laps === 1 ? " LAP" : " LAPS")) + " · " + mapLabel;
      main.append(name, mode);

      const count = document.createElement("div");
      count.className = "lobby-row-count";
      count.textContent = lobby.playerCount + " / " + MAX_PLAYERS + " PLAYERS";

      const join = document.createElement("button");
      join.type = "button";
      join.className = "menu-button lobby-join-button";
      join.dataset.joinLobby = lobby.id;
      const lobbyLocked = !lobbyCanBeJoined(lobby);
      join.textContent = lobby.playerCount >= MAX_PLAYERS
        ? "FULL"
        : lobby.mapId === "gravel-basin" && lobby.mode !== "free-drive"
          ? "MODE UNAVAILABLE"
          : lobbyLocked
            ? (lobby.mode === "free-drive" ? "CLOSED" : "IN SESSION")
            : "JOIN";
      join.disabled = lobby.playerCount >= MAX_PLAYERS || lobbyLocked;

      row.append(main, count, join);
      list.appendChild(row);
    }
  }

  function cleanLobbyName(value) {
    return typeof value === "string"
      ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 28)
      : "";
  }

  function validLobbyId(value) {
    return typeof value === "string" && /^[a-z0-9_-]{5,40}$/i.test(value);
  }

  function publishLobby() {
    // Race and Time Trial rooms leave the browser when their countdown starts.
    // Free Drive rooms stay open and discoverable while the host remains there.
    if (!hostingLobby || !currentLobby || !directoryAction || !currentLobbyAcceptsPlayers()) return;

    const announcement = {
      type: "upsert",
      id: currentLobby.id,
      name: currentLobby.name,
      mode: currentLobby.mode,
      mapId: currentLobby.mapId || "closed-course",
      laps: currentLobby.laps,
      phase: game.race?.phase || "waiting",
      playerCount: currentPlayerCount(),
      maxPlayers: MAX_PLAYERS
    };

    discoveredLobbies.set(currentLobby.id, {
      ...announcement,
      peerId: selfId,
      lastSeen: Date.now()
    });
    directoryAction.send(announcement);
    renderLobbyList();
  }

  function removePublishedLobby() {
    if (!currentLobby) return;
    const id = currentLobby.id;
    const old = discoveredLobbies.get(id);
    if (old && old.peerId === selfId) discoveredLobbies.delete(id);
    if (directoryAction) directoryAction.send({ type: "remove", id });
    renderLobbyList();
  }

  function pruneLobbyListings() {
    const now = Date.now();
    let changed = false;
    for (const [id, lobby] of discoveredLobbies) {
      if (now - lobby.lastSeen > LOBBY_TTL_MS) {
        discoveredLobbies.delete(id);
        changed = true;
      }
    }
    if (changed) renderLobbyList();
  }

  function startDirectory() {
    if (directoryRoom) return;

    try {
      directoryRoom = joinRoom(signalingConfig(), DIRECTORY_ROOM_ID, {
        onJoinError: ({ peerId, error }) => {
          console.warn("Lobby directory peer connection failed:", peerId, error);
          updateDirectoryStatus("DIRECTORY CONNECTION ISSUE — RETRYING");
        }
      });
      directoryAction = directoryRoom.makeAction(DIRECTORY_ACTION);

      directoryAction.onMessage = (message, meta) => {
        const peerId = meta?.peerId;
        if (!peerId || peerId === selfId || !message || typeof message !== "object") return;

        if (message.type === "request") {
          if (hostingLobby) publishLobby();
          return;
        }

        if (message.type === "remove") {
          if (!validLobbyId(message.id)) return;
          const existing = discoveredLobbies.get(message.id);
          if (existing && existing.peerId === peerId) {
            discoveredLobbies.delete(message.id);
            renderLobbyList();
          }
          return;
        }

        if (message.type !== "upsert" || !validLobbyId(message.id)) return;
        const name = cleanLobbyName(message.name);
        const mode = ["race", "free-drive", "time-trial", "sandbox"].includes(message.mode)
          ? message.mode
          : "race";
        const playerCount = Number.isFinite(message.playerCount)
          ? Math.max(1, Math.min(MAX_PLAYERS, Math.floor(message.playerCount)))
          : 1;

        const previous = discoveredLobbies.get(message.id);
        if (previous && previous.peerId !== peerId && Date.now() - previous.lastSeen < LOBBY_TTL_MS) {
          return;
        }

        discoveredLobbies.set(message.id, {
          id: message.id,
          name: name || "Untitled Lobby",
          mode,
          mapId: message.mapId === "gravel-basin" ? "gravel-basin" : "closed-course",
          laps: Number.isFinite(message.laps) ? Math.max(1, Math.min(20, Math.floor(message.laps))) : 3,
          phase: ["waiting", "countdown", "racing", "finished", "free-drive"].includes(message.phase) ? message.phase : "waiting",
          playerCount,
          maxPlayers: MAX_PLAYERS,
          peerId,
          lastSeen: Date.now()
        });
        renderLobbyList();
      };

      directoryRoom.onPeerJoin = (peerId) => {
        directoryPeers.add(peerId);
        updateDirectoryStatus();
        if (hostingLobby) {
          publishLobby();
        } else if (directoryAction) {
          // Ask immediately after the data channel is ready. The first request
          // from the browser may have been sent before this peer connected.
          directoryAction.send({ type: "request", requestedAt: Date.now() });
        }
      };
      directoryRoom.onPeerLeave = (peerId) => {
        directoryPeers.delete(peerId);
        updateDirectoryStatus();
      };

      if (!directoryTimer) {
        directoryTimer = setInterval(() => {
          pruneLobbyListings();

          if (hostingLobby && joined && currentLobbyAcceptsPlayers()) {
            publishLobby();
          }

          // Keep asking while the lobby browser is visible. This recovers if
          // an initial discovery message was sent before a peer connected or
          // a relay briefly dropped a directory message.
          const browsingLobbies = !joined && modeSelectPanel?.style.display !== "none";
          if (browsingLobbies && directoryAction) {
            directoryAction.send({ type: "request", requestedAt: Date.now() });
          }
        }, HEARTBEAT_MS);
      }
      updateDirectoryStatus("CONNECTING TO LOBBY DIRECTORY...");
    } catch (error) {
      console.error("Unable to start lobby directory:", error);
      updateDirectoryStatus("LOBBY DIRECTORY UNAVAILABLE");
    }
  }

  function openLobbyBrowser() {
    startDirectory();
    refreshLobbyList();
  }

  function refreshLobbyList() {
    startDirectory();
    pruneLobbyListings();
    renderLobbyList();
    updateDirectoryStatus("REFRESHING LOBBY LIST...");
    if (directoryAction) {
      directoryAction.send({ type: "request", requestedAt: Date.now() });
    }
  }

  function createRoomId() {
    const bytes = new Uint8Array(8);
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return "race-" + [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  }

  function enterRaceLobby(lobby, isHost) {
    if (joined || room) return;
    startDirectory();

    const selectedMapId = lobby.mapId === "gravel-basin" ? "gravel-basin" : "closed-course";
    if (selectedMapId === "gravel-basin" && lobby.mode !== "free-drive") {
      showToast("Race and Time Trial are only available on Club Dirt Circuit.");
      refreshLobbyList();
      return;
    }
    game.setActiveMap?.(selectedMapId, { silent: true });
    const typedName = $("driverName").value;
    setDriverName(typedName);
    currentLobby = {
      id: lobby.id,
      name: cleanLobbyName(lobby.name) || "Race Lobby",
      mode: lobby.mode === "free-drive"
        ? "free-drive"
        : lobby.mode === "time-trial" ? "time-trial" : "race",
      mapId: selectedMapId,
      laps: Number.isFinite(lobby.laps) ? Math.max(1, Math.min(20, Math.floor(lobby.laps))) : 3,
      hostPeerId: isHost ? selfId : lobby.peerId
    };
    hostingLobby = !!isHost;
    roomPeerIds.clear();
    pendingRoomPeers.clear();

    if (!isHost && Number.isFinite(lobby.playerCount) && lobby.playerCount >= MAX_PLAYERS) {
      showToast("That lobby is full");
      return;
    }

    if (isHost) {
      joinButton.disabled = true;
      joinButton.textContent = "CREATING LOBBY...";
      joinError.style.display = "none";
    }

    try {
      room = joinRoom(signalingConfig(), currentLobby.id, {
        onPeerHandshake: async (peerId) => {
          if (hostingLobby && !currentLobbyAcceptsPlayers()) {
            throw new Error(currentLobby?.mode === "free-drive" ? "FREE_DRIVE_CLOSED" : "RACE_IN_PROGRESS");
          }
          if (roomPeerIds.has(peerId) || pendingRoomPeers.has(peerId)) return;
          if (1 + roomPeerIds.size + pendingRoomPeers.size >= MAX_PLAYERS) {
            throw new Error("LOBBY_FULL");
          }
          pendingRoomPeers.add(peerId);
        },
        onJoinError: ({ peerId, error }) => {
          pendingRoomPeers.delete(peerId);
          const message = String(error?.message || error).toLowerCase();
          if (message.includes("full")) {
            showToast("Lobby is full (8/8 players)");
          } else if (message.includes("race_in_progress")) {
            showToast("That race has already started");
          } else if (message.includes("free_drive_closed")) {
            showToast("That Free Drive session is closed");
          } else {
            console.warn("Lobby peer connection failed:", peerId, error);
          }
        }
      });

      stateAction = room.makeAction("vehicle-state");
      stateAction.onMessage = (data, meta) => {
        const peerId = meta?.peerId;
        if (!peerId || peerId === selfId || !validSnapshot(data)) return;
        addRemotePlayer(peerId, data);
        if (data.race) game.race?.updateRemoteState(peerId, {
          ...data.race,
          name: data.name || data.race.name
        });
      };

      raceControlAction = room.makeAction("race-control");
      raceControlAction.onMessage = (message, meta) => {
        const peerId = meta?.peerId;
        if (hostingLobby || !peerId || !message) return;
        if (currentLobby.hostPeerId && peerId !== currentLobby.hostPeerId) return;

        if (message.type === "start-race") {
          game.race?.beginCountdown({
            laps: message.laps,
            countdownMs: message.countdownMs
          });
          return;
        }

        if (message.type === "race-results") {
          game.race?.enterResults();
          return;
        }

        if (message.type === "restart-race") {
          const laps = Math.max(1, Math.min(20, Math.floor(Number(message.laps) || currentLobby.laps || 3)));
          if (!game.race?.prepareRestart(laps)) return;
          currentLobby.laps = laps;
          game.controls.resetCar();
          game.race.onCarReset();
          game.race.beginCountdown({
            laps,
            countdownMs: message.countdownMs
          });
        }
      };

      room.onPeerJoin = (peerId) => {
        pendingRoomPeers.delete(peerId);
        roomPeerIds.add(peerId);
        if (!hostingLobby && !currentLobby.hostPeerId) currentLobby.hostPeerId = peerId;
        peersConnected = roomPeerIds.size > 0;
        updatePlayerCount();
        if (stateAction) stateAction.send(makeSnapshot());
        if (hostingLobby && currentLobbyAcceptsPlayers()) publishLobby();
        showToast("Another driver joined");
      };

      room.onPeerLeave = (peerId) => {
        pendingRoomPeers.delete(peerId);
        roomPeerIds.delete(peerId);
        const remote = remotePlayers.get(peerId);
        if (remote) {
          scene.remove(remote.visual.root);
          remotePlayers.delete(peerId);
        }
        game.race?.removeRemoteState(peerId);
        peersConnected = roomPeerIds.size > 0;
        updatePlayerCount();
        if (hostingLobby) publishLobby();
        showToast("A driver left the lobby");
      };

      joined = true;
      $("roomValue").textContent = currentLobby.name.toUpperCase();
      joinPanel.style.display = "none";
      modeSelectPanel.style.display = "none";
      hud.style.display = "block";
      $("topStatus").style.display = "flex";
      game.garage.viewMode = "drive";
      game.garage.setArenaVisible(true);
      game.controls.cameraOrbitYaw = 0;
      $("statusDot").classList.remove("live");
      $("topStatus").textContent = "WAITING FOR DRIVERS";
      updatePlayerCount();
      game.controls.resetCar();
      game.localCar.setPlayerName?.(driverName, true);
      game.race?.enterLobby(currentLobby, hostingLobby, driverName);
      if (hostingLobby) publishLobby();
      if (currentLobby.mode === "free-drive") {
        showToast(isHost
          ? "Free Drive lobby created — drive whenever you're ready"
          : "Joined Free Drive: " + currentLobby.name);
      } else {
        showToast(currentLobby.mode === "time-trial"
          ? (isHost ? "Time trial lobby created — start when everyone is ready" : "Joined time trial: " + currentLobby.name)
          : (isHost ? "Race lobby created — start when everyone is ready" : "Joined " + currentLobby.name));
      }
    } catch (error) {
      console.error("Unable to join multiplayer lobby:", error);
      room = null;
      stateAction = null;
      raceControlAction = null;
      joined = false;
      hostingLobby = false;
      currentLobby = null;
      if (isHost) {
        joinError.textContent = "Couldn't create the lobby. Check your connection and try again.";
        joinError.style.display = "block";
      } else {
        game.garage.showModeSelect();
        updateDirectoryStatus("COULDN'T JOIN THAT LOBBY — TRY AGAIN");
        showToast("Couldn't join that lobby");
      }
    } finally {
      joinButton.disabled = false;
      joinButton.textContent = createLobbyButtonLabel();
    }
  }

  function createLobby() {
    updateAvailableModes();
    const selectedButton = document.querySelector(".lobby-mode-choice.selected");
    const mode = selectedButton?.dataset.lobbyMode || selectedLobbyMode;
    if (game.activeMapId === "gravel-basin" && mode !== "free-drive") {
      joinError.textContent = "Race and Time Trial are only available on Club Dirt Circuit. Select Free Drive for Gravel Basin.";
      joinError.style.display = "block";
      return;
    }
    const name = cleanLobbyName($("lobbyName").value) ||
      (mode === "free-drive"
        ? "Free Drive Lobby"
        : mode === "time-trial" ? "Time Trial Lobby" : "Race Lobby");
    const laps = Math.max(1, Math.min(20, Number($("raceLapCount").value) || 3));
    if (!["race", "free-drive", "time-trial"].includes(mode)) {
      joinError.textContent = "That lobby mode isn't available yet.";
      joinError.style.display = "block";
      return;
    }
    selectedLobbyMode = mode;
    enterRaceLobby({
      id: createRoomId(),
      name,
      mode,
      laps,
      phase: "waiting",
      playerCount: 1,
      mapId: game.activeMapId || "closed-course"
    }, true);
  }

  function startRace() {
    if (!hostingLobby || !joined || currentLobby?.mapId === "gravel-basin" ||
        !["race", "time-trial"].includes(currentLobby?.mode) ||
        game.race?.phase !== "waiting" || !raceControlAction) return false;
    const message = {
      type: "start-race",
      laps: currentLobby.laps,
      countdownMs: 6000,
      mode: currentLobby.mode
    };
    if (!game.race.beginCountdown(message)) return false;
    removePublishedLobby();
    raceControlAction.send(message);
    showToast(currentLobby.mode === "time-trial"
      ? "Time trial start announced to all drivers"
      : "Race start announced to all drivers");
    return true;
  }

  function announceRaceResults() {
    if (!hostingLobby || !joined || !raceControlAction || game.race?.phase !== "results") return false;
    raceControlAction.send({ type: "race-results" });
    showToast("All drivers have finished");
    return true;
  }

  function restartRace(laps) {
    if (!hostingLobby || !joined || !currentLobby || !["race", "time-trial"].includes(currentLobby.mode) ||
        !raceControlAction || game.race?.phase !== "results") {
      return false;
    }
    const nextLapCount = Math.max(1, Math.min(20, Math.floor(Number(laps) || currentLobby.laps || 3)));
    const message = {
      type: "restart-race",
      laps: nextLapCount,
      countdownMs: 6000
    };

    currentLobby.laps = nextLapCount;
    if (!game.race.prepareRestart(nextLapCount)) return false;
    game.controls.resetCar();
    game.race.onCarReset();
    if (!game.race.beginCountdown(message)) return false;

    removePublishedLobby();
    raceControlAction.send(message);
    showToast((currentLobby.mode === "time-trial" ? "Next time trial starting with " : "Next race starting with ") +
      nextLapCount + (nextLapCount === 1 ? " lap" : " laps"));
    return true;
  }

  function joinLobby(lobby) {
    if (!lobby || !validLobbyId(lobby.id)) return;
    const latest = discoveredLobbies.get(lobby.id) || lobby;
    if (!lobbyCanBeJoined(latest)) {
      refreshLobbyList();
      showToast(latest.mode === "free-drive"
        ? "That Free Drive session is closed"
        : "That race has already started");
      return;
    }
    if (Date.now() - (latest.lastSeen || 0) > LOBBY_TTL_MS) {
      refreshLobbyList();
      showToast("That lobby is no longer listed");
      return;
    }
    if (latest.playerCount >= MAX_PLAYERS) {
      showToast("That lobby is full");
      return;
    }
    enterRaceLobby(latest, false);
  }

  function updateRemoteVisuals(delta) {
    const alpha = 1 - Math.exp(-12 * delta);
    for (const [peerId, remote] of remotePlayers) {
      if (performance.now() - remote.lastSeen > 12000) {
        scene.remove(remote.visual.root);
        remotePlayers.delete(peerId);
        game.race?.removeRemoteState(peerId);
        continue;
      }
      if (!remote.target) continue;
      remote.visual.root.position.lerp(remote.target.position, alpha);
      remote.visual.root.quaternion.slerp(remote.target.quaternion, alpha);
      for (let i = 0; i < 4; i++) {
        const [x, , z] = wheelPositions[i];
        const pivot = remote.visual.wheelPivots[i];
        pivot.position.set(x, -0.095, z * VISUAL_CHASSIS_LENGTH_SCALE);
        const steerQ = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0), i < 2 ? remote.steering : 0
        );
        const spinQ = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(1, 0, 0), remote.wheelRotations[i]
        );
        pivot.quaternion.copy(steerQ).multiply(spinQ);
      }
    }
    updatePlayerCount();
  }

  async function leaveArena() {
    if (hostingLobby) removePublishedLobby();
    hostingLobby = false;

    if (room) {
      try {
        await room.leave();
      } catch (error) {
        console.warn("Room cleanup failed:", error);
      }
    }
    room = null;
    stateAction = null;
    raceControlAction = null;
    joined = false;
    currentLobby = null;
    roomPeerIds.clear();
    pendingRoomPeers.clear();
    peersConnected = false;

    for (const remote of remotePlayers.values()) scene.remove(remote.visual.root);
    remotePlayers.clear();
    game.localCar.setPlayerName?.("", false);
    game.race?.leaveLobby();
    for (const key of Object.keys(game.controls.keys)) game.controls.keys[key] = false;
    updatePlayerCount();
    hud.style.display = "none";
    game.garage.showModeSelect();
    $("topStatus").style.display = "none";
    $("statusDot").classList.remove("live");
    game.controls.resetCar();
  }

  function sendSnapshotIfReady(delta) {
    networkTimer += delta;
    if (joined && stateAction && networkTimer >= 1 / 15) {
      stateAction.send(makeSnapshot());
      networkTimer = 0;
    }
  }

  joinButton.addEventListener("click", createLobby);
  $("leaveButton").addEventListener("click", leaveArena);

  $("lobbyList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-join-lobby]");
    if (!button || button.disabled) return;
    const lobby = discoveredLobbies.get(button.dataset.joinLobby);
    if (lobby) joinLobby(lobby);
  });

  $("refreshLobbiesButton").addEventListener("click", refreshLobbyList);
  for (const button of document.querySelectorAll(".lobby-mode-choice[data-lobby-mode]")) {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      selectedLobbyMode = button.dataset.lobbyMode || "race";
      if (game.activeMapId !== "gravel-basin") {
        lastNonGravelLobbyMode = selectedLobbyMode;
      }
      renderSelectedLobbyMode();
    });
  }
  updateAvailableModes();

  return {
    createLobby,
    joinLobby,
    openLobbyBrowser,
    updateAvailableModes,
    refreshLobbyList,
    updateRemoteVisuals,
    updatePlayerCount,
    sendSnapshotIfReady,
    startRace,
    announceRaceResults,
    restartRace,
    setDriverName,
    get joined() { return joined; },
    get connectedPeerIds() { return [...roomPeerIds]; },
    get stateAction() { return stateAction; },
    get remotePlayers() { return remotePlayers; },
    get driverName() { return driverName; },
    get currentLobby() { return currentLobby; },
    get discoveredLobbies() { return discoveredLobbies; }
  };
}
