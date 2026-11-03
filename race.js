// Race-session state, checkpoint validation, lap timing, and live standings.
export function createRaceSystem(game) {
  const $ = game.$;
  const showToast = game.showToast;
  const gates = game.trackLayout.raceGates || [];
  const trackHalfWidth = Math.max(1, (game.trackLayout.trackHalfWidth || 5.75) - 0.65);
  const remoteStates = new Map();
  const samples = game.trackLayout.centerlineSamples || [];

  let phase = "idle";
  let lapLimit = 3;
  let isHost = false;
  let driverName = "Driver";
  let countdownEndAt = 0;
  let raceStartAt = 0;
  let lapStartAt = 0;
  let currentLapMs = 0;
  let lastLapMs = 0;
  let bestLapMs = 0;
  let totalElapsedMs = 0;
  let finishTimeMs = 0;
  let completedLaps = 0;
  let nextGateIndex = 0;
  let progress = 0;
  let previousPosition = null;
  let goOverlayUntil = 0;
  let checkpointCount = Math.max(0, gates.length - 1);
  let spectatingPeerId = null;
  let spectatorRenderKey = "";
  let resultsAnnounced = false;

  function clampLapCount(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(1, Math.min(20, Math.floor(number))) : 3;
  }

  function getPosition() {
    return {
      x: game.chassisBody.position.x,
      z: game.chassisBody.position.z
    };
  }

  function formatTime(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) milliseconds = 0;
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    const millis = Math.floor(milliseconds % 1000);
    return String(minutes).padStart(2, "0") + ":" +
      String(seconds).padStart(2, "0") + "." +
      String(millis).padStart(3, "0");
  }

  function ordinal(value) {
    const mod100 = value % 100;
    if (mod100 >= 11 && mod100 <= 13) return value + "TH";
    return value + ({ 1: "ST", 2: "ND", 3: "RD" }[value % 10] || "TH");
  }

  function updateOverlay(text, visible) {
    const overlay = $("raceCountdownOverlay");
    if (!overlay) return;
    overlay.textContent = text;
    overlay.style.display = visible ? "grid" : "none";
  }

  function setStatus(text) {
    const status = $("raceStatus");
    if (status) status.textContent = text;
  }

  function setWaiting(laps, host, name = "Driver") {
    phase = "waiting";
    lapLimit = clampLapCount(laps);
    isHost = !!host;
    driverName = String(name || "Driver").slice(0, 18);
    countdownEndAt = 0;
    raceStartAt = 0;
    lapStartAt = 0;
    currentLapMs = 0;
    lastLapMs = 0;
    bestLapMs = 0;
    totalElapsedMs = 0;
    finishTimeMs = 0;
    completedLaps = 0;
    nextGateIndex = 0;
    progress = 0;
    previousPosition = getPosition();
    goOverlayUntil = 0;
    remoteStates.clear();
    spectatingPeerId = null;
    spectatorRenderKey = "";
    resultsAnnounced = false;

    const spectatorPanel = $("raceSpectatorPanel");
    const resultsPanel = $("racePostRacePanel");
    if (spectatorPanel) spectatorPanel.style.display = "none";
    if (resultsPanel) resultsPanel.style.display = "none";

    const startButton = $("startRaceButton");
    if (startButton) {
      startButton.style.display = isHost ? "inline-flex" : "none";
      startButton.disabled = false;
      startButton.textContent = "START RACE";
    }
    updateOverlay("", false);
    setStatus(isHost ? "READY — START WHEN EVERYONE IS SET" : "WAITING FOR THE HOST");
    updateUI();
  }

  function beginCountdown(options = {}) {
    if (phase !== "waiting") return false;
    lapLimit = clampLapCount(options.laps || lapLimit);
    const duration = Math.max(2500, Math.min(15000, Number(options.countdownMs) || 6000));
    phase = "countdown";
    countdownEndAt = performance.now() + duration;
    completedLaps = 0;
    nextGateIndex = 0;
    currentLapMs = 0;
    lastLapMs = 0;
    bestLapMs = 0;
    totalElapsedMs = 0;
    finishTimeMs = 0;
    previousPosition = getPosition();
    progress = nearestTrackProgress(previousPosition);
    spectatingPeerId = null;
    spectatorRenderKey = "";
    resultsAnnounced = false;
    const spectatorPanel = $("raceSpectatorPanel");
    const resultsPanel = $("racePostRacePanel");
    if (spectatorPanel) spectatorPanel.style.display = "none";
    if (resultsPanel) resultsPanel.style.display = "none";
    const button = $("startRaceButton");
    if (button) {
      button.disabled = true;
      button.textContent = "RACE STARTING...";
    }
    setStatus("GET READY");
    showToast("Race starting soon");
    return true;
  }

  function nearestTrackProgress(position) {
    if (!samples.length || !position) return 0;
    let closestDistance = Infinity;
    let nearestT = 0;
    for (const sample of samples) {
      const dx = position.x - sample.x;
      const dz = position.z - sample.z;
      const distance = dx * dx + dz * dz;
      if (distance < closestDistance) {
        closestDistance = distance;
        nearestT = sample.t;
      }
    }
    return nearestT;
  }

  function crossesGate(from, to, gate) {
    const fromX = from.x - gate.x;
    const fromZ = from.z - gate.z;
    const toX = to.x - gate.x;
    const toZ = to.z - gate.z;
    const before = fromX * gate.tangentX + fromZ * gate.tangentZ;
    const after = toX * gate.tangentX + toZ * gate.tangentZ;

    // Only count a forward crossing of the gate plane.
    if (!(before < 0 && after >= 0)) return false;
    const denominator = before - after;
    if (Math.abs(denominator) < 1e-8) return false;
    const amount = Math.max(0, Math.min(1, before / denominator));
    const crossX = from.x + (to.x - from.x) * amount;
    const crossZ = from.z + (to.z - from.z) * amount;
    const lateral = (crossX - gate.x) * gate.normalX +
      (crossZ - gate.z) * gate.normalZ;
    return Math.abs(lateral) <= trackHalfWidth;
  }

  function getStandings() {
    if (!["racing", "finished", "results"].includes(phase)) return [];
    const localFinished = phase === "finished" || phase === "results";
    const local = {
      id: "local",
      name: driverName,
      completedLaps,
      progress,
      finished: localFinished,
      finishTimeMs,
      elapsedMs: localFinished ? finishTimeMs : totalElapsedMs
    };
    const entrants = [local];
    for (const [peerId, state] of remoteStates) {
      if (state.phase !== "racing" && state.phase !== "finished" && state.phase !== "results") continue;
      entrants.push({ id: peerId, ...state });
    }

    entrants.sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished && b.finished) return a.finishTimeMs - b.finishTimeMs;
      const aScore = a.completedLaps + a.progress;
      const bScore = b.completedLaps + b.progress;
      if (Math.abs(aScore - bScore) > 0.0001) return bScore - aScore;
      return a.elapsedMs - b.elapsedMs;
    });
    return entrants;
  }

  function getSpectatorOptions() {
    const remotePlayers = game.multiplayer?.remotePlayers;
    if (!remotePlayers) return [];
    return [...remoteStates.entries()]
      .filter(([peerId, state]) => state.phase === "racing" && remotePlayers.has(peerId))
      .map(([id, state]) => ({
        id,
        name: state.name || "Driver",
        completedLaps: state.completedLaps,
        progress: state.progress
      }))
      .sort((a, b) => b.completedLaps - a.completedLaps || b.progress - a.progress);
  }

  function updateSpectatorUI() {
    const panel = $("raceSpectatorPanel");
    const list = $("raceSpectatorList");
    const returnButton = $("returnToCarButton");
    const visible = phase === "finished";
    if (panel) panel.style.display = visible ? "block" : "none";
    if (!visible || !list) {
      spectatorRenderKey = "";
      return;
    }

    const options = getSpectatorOptions();
    if (!options.some(option => option.id === spectatingPeerId)) {
      spectatingPeerId = null;
    }
    if (returnButton) returnButton.style.display = spectatingPeerId ? "inline-flex" : "none";

    const renderKey = options.map(option => option.id + ":" + option.name).join("|") +
      "::" + (spectatingPeerId || "");
    if (renderKey === spectatorRenderKey) return;
    spectatorRenderKey = renderKey;
    list.replaceChildren();

    if (!options.length) {
      const empty = document.createElement("div");
      empty.className = "race-spectator-empty";
      empty.textContent = "No other drivers are currently racing.";
      list.appendChild(empty);
      return;
    }

    for (const option of options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "race-spectator-button" +
        (option.id === spectatingPeerId ? " selected" : "");
      button.textContent = "SPECTATE " + option.name;
      button.addEventListener("click", () => {
        spectatingPeerId = option.id;
        spectatorRenderKey = "";
        updateSpectatorUI();
      });
      list.appendChild(button);
    }
  }

  function updatePostRaceUI() {
    const panel = $("racePostRacePanel");
    if (!panel) return;
    const visible = phase === "results";
    panel.style.display = visible ? "block" : "none";
    if (!visible) return;

    const status = $("racePostRaceStatus");
    const settings = $("raceRestartSettings");
    const restartButton = $("restartRaceButton");
    const lapSelect = $("raceRestartLapCount");
    if (status) {
      status.textContent = isHost
        ? "EVERY DRIVER HAS FINISHED. CHOOSE THE NEXT RACE SETTINGS."
        : "EVERY DRIVER HAS FINISHED. WAITING FOR THE HOST TO RESTART.";
    }
    if (settings) settings.style.display = isHost ? "flex" : "none";
    if (restartButton) restartButton.style.display = isHost ? "inline-flex" : "none";
    if (lapSelect && lapSelect.value !== String(lapLimit)) {
      lapSelect.value = String(lapLimit);
    }
  }

  function connectedPlayersHaveFinished() {
    const peerIds = game.multiplayer?.connectedPeerIds || [];
    return peerIds.every(peerId => {
      const state = remoteStates.get(peerId);
      return !!state && (state.phase === "finished" || state.phase === "results");
    });
  }

  function enterResults() {
    if (phase !== "finished" && phase !== "results") return false;
    phase = "results";
    spectatingPeerId = null;
    spectatorRenderKey = "";
    updateOverlay("", false);
    setStatus("ALL DRIVERS FINISHED");
    updateSpectatorUI();
    updatePostRaceUI();
    updateUI();
    return true;
  }

  function prepareRestart(laps) {
    if (phase !== "results") return false;
    setWaiting(laps, isHost, driverName);
    return true;
  }

  function getSpectateTarget() {
    if (phase !== "finished" || !spectatingPeerId) return null;
    const state = remoteStates.get(spectatingPeerId);
    if (!state || state.phase !== "racing") return null;
    return game.multiplayer?.remotePlayers.get(spectatingPeerId) || null;
  }

  function updateUI() {
    const lapValue = $("raceLapValue");
    const timeValue = $("raceTimeValue");
    const bestValue = $("raceBestValue");
    const positionValue = $("racePositionValue");
    const lapCountValue = $("raceCompletedValue");
    if (lapValue) lapValue.textContent = "LAP " + Math.min(completedLaps + 1, lapLimit) + " / " + lapLimit;
    if (lapCountValue) lapCountValue.textContent = completedLaps + " / " + lapLimit;
    if (timeValue) {
      const shown = phase === "finished" || phase === "results" ? lastLapMs : currentLapMs;
      timeValue.textContent = formatTime(shown);
    }
    if (bestValue) bestValue.textContent = bestLapMs > 0 ? "BEST " + formatTime(bestLapMs) : "BEST --:--.---";

    if (positionValue) {
      if (phase === "waiting" || phase === "countdown" || phase === "idle") {
        positionValue.textContent = "--";
      } else {
        const standings = getStandings();
        const index = standings.findIndex(item => item.id === "local");
        positionValue.textContent = index >= 0 ? ordinal(index + 1) : "--";
      }
    }
  }

  function finishRace(now) {
    phase = "finished";
    finishTimeMs = Math.max(0, now - raceStartAt);
    totalElapsedMs = finishTimeMs;
    lastLapMs = currentLapMs;
    setStatus("FINISHED — " + formatTime(finishTimeMs));
    updateOverlay("FINISH!", true);
    goOverlayUntil = now + 1800;
    showToast("Race finished in " + formatTime(finishTimeMs));
  }

  function handleGateCrossing(gateIndex, now) {
    const isFinish = gateIndex === gates.length - 1;
    if (!isFinish) {
      nextGateIndex++;
      showToast("CHECKPOINT " + nextGateIndex + " / " + checkpointCount);
      return;
    }

    completedLaps++;
    lastLapMs = Math.max(0, now - lapStartAt);
    bestLapMs = bestLapMs === 0 ? lastLapMs : Math.min(bestLapMs, lastLapMs);
    showToast("LAP " + completedLaps + " COMPLETE — " + formatTime(lastLapMs));
    nextGateIndex = 0;

    if (completedLaps >= lapLimit) {
      finishRace(now);
      return;
    }
    lapStartAt = now;
    currentLapMs = 0;
  }

  function update(delta, now = performance.now()) {
    if (phase === "countdown") {
      const remaining = countdownEndAt - now;
      if (remaining > 0) {
        const number = Math.max(1, Math.ceil(remaining / 1000));
        updateOverlay(String(number), true);
        setStatus("RACE STARTS IN");
      } else {
        phase = "racing";
        raceStartAt = now;
        lapStartAt = now;
        currentLapMs = 0;
        totalElapsedMs = 0;
        previousPosition = getPosition();
        nextGateIndex = 0;
        progress = nearestTrackProgress(previousPosition);
        updateOverlay("GO!", true);
        goOverlayUntil = now + 900;
        setStatus("RACE IN PROGRESS");
        showToast("GO! GO! GO!");
      }
    } else if (phase === "racing") {
      totalElapsedMs = Math.max(0, now - raceStartAt);
      currentLapMs = Math.max(0, now - lapStartAt);
      const current = getPosition();
      progress = nearestTrackProgress(current);

      if (previousPosition && gates.length) {
        const expectedGate = gates[nextGateIndex];
        if (expectedGate && crossesGate(previousPosition, current, expectedGate)) {
          handleGateCrossing(nextGateIndex, now);
        }
      }
      previousPosition = current;
    }

    if ((phase === "racing" || phase === "finished") && goOverlayUntil && now >= goOverlayUntil) {
      goOverlayUntil = 0;
      updateOverlay("", false);
    }
    pruneRemoteStates();

    // The host advances the room to results only after every connected racer
    // has reported a finish. Clients receive the same transition via race-control.
    if (phase === "finished" && isHost && !resultsAnnounced && connectedPlayersHaveFinished()) {
      resultsAnnounced = true;
      enterResults();
      game.multiplayer?.announceRaceResults?.();
    }

    updateSpectatorUI();
    updatePostRaceUI();
    updateUI();
  }

  function pruneRemoteStates() {
    const now = performance.now();
    for (const [peerId, state] of remoteStates) {
      if (now - state.receivedAt > 12000) remoteStates.delete(peerId);
    }
  }

  function updateRemoteState(peerId, state) {
    if (!peerId || !state || typeof state !== "object") return;
    const validPhases = ["waiting", "countdown", "racing", "finished", "results"];
    if (!validPhases.includes(state.phase)) return;
    const numeric = [
      state.completedLaps, state.progress, state.elapsedMs,
      state.finishTimeMs, state.bestLapMs, state.currentLapMs
    ];
    if (!numeric.every(value => Number.isFinite(value))) return;
    remoteStates.set(peerId, {
      name: typeof state.name === "string" ? state.name.slice(0, 18) : "Driver",
      phase: state.phase,
      completedLaps: Math.max(0, Math.min(lapLimit, Math.floor(state.completedLaps))),
      progress: Math.max(0, Math.min(1, state.progress)),
      elapsedMs: Math.max(0, state.elapsedMs),
      finished: !!state.finished || state.phase === "finished" || state.phase === "results",
      finishTimeMs: Math.max(0, state.finishTimeMs),
      bestLapMs: Math.max(0, state.bestLapMs),
      currentLapMs: Math.max(0, state.currentLapMs),
      receivedAt: performance.now()
    });
  }

  function removeRemoteState(peerId) {
    remoteStates.delete(peerId);
  }

  function getNetworkState() {
    return {
      name: driverName,
      phase,
      completedLaps,
      progress,
      finished: phase === "finished" || phase === "results",
      elapsedMs: totalElapsedMs,
      finishTimeMs,
      bestLapMs,
      currentLapMs
    };
  }

  function onCarReset() {
    previousPosition = getPosition();
    nextGateIndex = 0;
    progress = nearestTrackProgress(previousPosition);
  }

  function leaveLobby() {
    phase = "idle";
    remoteStates.clear();
    updateOverlay("", false);
    spectatingPeerId = null;
    spectatorRenderKey = "";
    const spectatorPanel = $("raceSpectatorPanel");
    const resultsPanel = $("racePostRacePanel");
    if (spectatorPanel) spectatorPanel.style.display = "none";
    if (resultsPanel) resultsPanel.style.display = "none";
    const card = $("raceCard");
    if (card) card.style.display = "none";
  }

  function enterLobby(lobby, host, name) {
    const card = $("raceCard");
    if (card) card.style.display = "block";
    setWaiting(lobby?.laps || 3, host, name);
  }

  function startButtonPressed() {
    if (phase !== "waiting" || !isHost) return false;
    if (game.multiplayer?.startRace) return game.multiplayer.startRace();
    return false;
  }

  $("startRaceButton").addEventListener("click", startButtonPressed);
  $("returnToCarButton").addEventListener("click", () => {
    spectatingPeerId = null;
    spectatorRenderKey = "";
    updateSpectatorUI();
  });
  $("restartRaceButton").addEventListener("click", () => {
    if (!isHost || phase !== "results") return;
    const laps = clampLapCount($("raceRestartLapCount").value);
    game.multiplayer?.restartRace?.(laps);
  });

  return {
    update,
    enterLobby,
    beginCountdown,
    enterResults,
    prepareRestart,
    getSpectateTarget,
    updateRemoteState,
    removeRemoteState,
    getNetworkState,
    onCarReset,
    leaveLobby,
    getStandings,
    get phase() { return phase; },
    get lapLimit() { return lapLimit; },
    get completedLaps() { return completedLaps; },
    get isHost() { return isHost; }
  };
}
