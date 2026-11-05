// Client for the Cloudflare room relay. The relay transports compact game
// snapshots and host controls so players can connect across restrictive NATs.
export function createRoomRelay({
  roomId,
  playerName,
  roomMode,
  onPeerJoin,
  onPeerLeave,
  onSnapshot,
  onControl,
  onSandboxEvent,
  onRoomClosed,
  onDisconnected,
  onError
}) {
  const endpoint = new URL(
    "/api/rooms/" + encodeURIComponent(roomId),
    window.location.href
  );
  endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
  endpoint.searchParams.set("name", String(playerName || "Driver").slice(0, 18));
  endpoint.searchParams.set("mode", String(roomMode || "race"));

  let socket;
  let manuallyClosed = false;
  let readySettled = false;
  let readyTimer = null;
  let localPeerId = "";

  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  function failReady(error) {
    if (readySettled) return;
    readySettled = true;
    window.clearTimeout(readyTimer);
    rejectReady(error);
    onError?.(error);
  }

  function send(payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try {
      socket.send(JSON.stringify(payload));
      return true;
    } catch (error) {
      console.warn("Unable to send multiplayer room message:", error);
      return false;
    }
  }

  try {
    socket = new WebSocket(endpoint);
  } catch (error) {
    failReady(error);
    return {
      ready,
      sendSnapshot: () => false,
      sendControl: () => false,
      sendSandboxEvent: () => false,
      close: () => {},
      get connected() { return false; },
      get peerId() { return localPeerId; }
    };
  }

  readyTimer = window.setTimeout(() => {
    const error = new Error("The multiplayer room relay did not respond. Please try joining again.");
    failReady(error);
    socket.close();
  }, 15000);

  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      console.warn("Ignored an invalid multiplayer room message.");
      return;
    }

    if (!message || typeof message !== "object") return;

    if (message.type === "room-state") {
      if (readySettled || typeof message.peerId !== "string" || !message.peerId ||
          !Array.isArray(message.peers)) return;
      localPeerId = message.peerId;
      const peers = message.peers
        .filter((peer) => peer && typeof peer.peerId === "string")
        .map((peer) => ({
          peerId: peer.peerId,
          name: String(peer.name || "Driver").slice(0, 18),
          isHost: peer.isHost === true
        }));
      readySettled = true;
      window.clearTimeout(readyTimer);
      resolveReady({
        peerId: localPeerId,
        isHost: message.isHost === true,
        peers
      });
      return;
    }

    if (message.type === "peer-join" && message.peer) {
      onPeerJoin?.({
        peerId: message.peer.peerId,
        name: String(message.peer.name || "Driver").slice(0, 18),
        isHost: message.peer.isHost === true
      });
      return;
    }

    if (message.type === "peer-leave" && typeof message.peerId === "string") {
      onPeerLeave?.(message.peerId);
      return;
    }

    if (message.type === "snapshot" && typeof message.peerId === "string" && message.data) {
      onSnapshot?.(message.peerId, message.data);
      return;
    }

    if (message.type === "control" && typeof message.peerId === "string" && message.message) {
      onControl?.(message.peerId, message.message);
      return;
    }

    if (message.type === "sandbox-event" && typeof message.peerId === "string" && message.event) {
      onSandboxEvent?.(message.peerId, message.event);
      return;
    }

    if (message.type === "room-closed") {
      onRoomClosed?.(message.reason || "The host left the room.");
    }
  });

  socket.addEventListener("error", () => {
    const error = new Error("The multiplayer room connection failed. Check the connection and try again.");
    if (!readySettled) failReady(error);
    else onError?.(error);
  });

  socket.addEventListener("close", (event) => {
    window.clearTimeout(readyTimer);
    if (!readySettled) {
      failReady(new Error(
        event.reason || "The multiplayer room closed before the connection was ready."
      ));
      return;
    }
    if (!manuallyClosed) {
      onDisconnected?.({
        code: event.code,
        reason: event.reason || "The room connection was closed."
      });
    }
  });

  return {
    ready,
    sendSnapshot(data) {
      return send({ type: "snapshot", data });
    },
    sendControl(message) {
      return send({ type: "control", message });
    },
    sendSandboxEvent(event) {
      return send({ type: "sandbox-event", event });
    },
    close() {
      manuallyClosed = true;
      window.clearTimeout(readyTimer);
      if (socket && socket.readyState < WebSocket.CLOSING) {
        socket.close(1000, "Player left the room");
      }
    },
    get connected() {
      return !!socket && socket.readyState === WebSocket.OPEN && readySettled;
    },
    get peerId() {
      return localPeerId;
    }
  };
}
