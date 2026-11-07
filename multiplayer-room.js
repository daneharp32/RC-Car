const MAX_PLAYERS = 8;
const MAX_MESSAGE_BYTES = 24_576;
const CONTROL_TYPES = new Set(["start-race", "race-results", "restart-race"]);

function cleanPlayerName(value) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 18)
    : "Driver";
}

function roomError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function readPeer(webSocket) {
  try {
    return webSocket.deserializeAttachment();
  } catch {
    return null;
  }
}

function isOpen(webSocket) {
  return webSocket.readyState === 1;
}

export class MultiplayerRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (!/^\/api\/rooms\/[a-z0-9_-]{5,40}$/i.test(url.pathname)) {
      return roomError("Invalid room address", 404);
    }
    if (request.method !== "GET" ||
        request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return roomError("A WebSocket connection is required", 426);
    }

    const existingSockets = this.state.getWebSockets().filter(isOpen);
    if (existingSockets.length >= MAX_PLAYERS) {
      return roomError("This room is full", 409);
    }

    const existingPeers = existingSockets
      .map(readPeer)
      .filter((peer) => peer && typeof peer.peerId === "string");
    const requestedMode = url.searchParams.get("mode");
    const mode = ["race", "free-drive", "time-trial", "sandbox"].includes(requestedMode)
      ? requestedMode
      : "race";
    if (existingPeers.some((peer) => peer.mode && peer.mode !== mode)) {
      return roomError("This room belongs to a different game mode", 409);
    }
    const peerId = crypto.randomUUID();
    const name = cleanPlayerName(url.searchParams.get("name"));
    const isHost = existingPeers.length === 0;

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.state.acceptWebSocket(server);
    server.serializeAttachment({
      peerId,
      name,
      mode,
      isHost,
      joinedAt: Date.now()
    });

    // Send the joining player a complete initial roster so it can recover
    // even if it connected after the first peer-join notification.
    server.send(JSON.stringify({
      type: "room-state",
      peerId,
      isHost,
      peers: existingPeers.map((peer) => ({
        peerId: peer.peerId,
        name: peer.name,
        isHost: peer.isHost === true
      }))
    }));

    this.broadcast({
      type: "peer-join",
      peer: { peerId, name, isHost }
    }, server);

    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(message, excludedSocket = null) {
    const encoded = JSON.stringify(message);
    for (const webSocket of this.state.getWebSockets()) {
      if (webSocket === excludedSocket || !isOpen(webSocket)) continue;
      try {
        webSocket.send(encoded);
      } catch (error) {
        console.warn("Room relay could not deliver a message:", error);
      }
    }
  }

  webSocketMessage(webSocket, rawMessage) {
    const peer = readPeer(webSocket);
    if (!peer || typeof peer.peerId !== "string") return;

    const rawText = typeof rawMessage === "string"
      ? rawMessage
      : new TextDecoder().decode(rawMessage);
    if (rawText.length > MAX_MESSAGE_BYTES) return;

    let message;
    try {
      message = JSON.parse(rawText);
    } catch {
      return;
    }
    if (!message || typeof message !== "object") return;

    if (message.type === "snapshot") {
      const data = message.data;
      if (!data || ![
        data.x, data.y, data.z, data.qx, data.qy, data.qz, data.qw
      ].every(Number.isFinite)) return;

      this.broadcast({
        type: "snapshot",
        peerId: peer.peerId,
        data
      }, webSocket);
      return;
    }

    if (message.type === "control") {
      if (!peer.isHost || !message.message ||
          !CONTROL_TYPES.has(message.message.type)) return;
      this.broadcast({
        type: "control",
        peerId: peer.peerId,
        message: message.message
      }, webSocket);
      return;
    }

    if (message.type === "sandbox-event") {
      const event = message.event;
      if (peer.mode !== "sandbox" || !event ||
          typeof event.id !== "string" || event.id.length > 80 ||
          ![event.x, event.y, event.z].every(Number.isFinite) ||
          [event.x, event.y, event.z].some((value) => Math.abs(value) > 300)) return;

      let safeEvent;
      if (event.type === "impulse-beacon") {
        if (!Number.isFinite(event.yaw) || Math.abs(event.yaw) > Math.PI * 4) return;
        safeEvent = {
          id: event.id, type: event.type,
          x: event.x, y: event.y, z: event.z, yaw: event.yaw
        };
      } else if (event.type === "gravity-orb") {
        if (![event.vx, event.vy, event.vz, event.charge, event.launchedAt].every(Number.isFinite) ||
            [event.vx, event.vy, event.vz].some((value) => Math.abs(value) > 80) ||
            event.charge < 0 || event.charge > 1 ||
            Math.abs(event.launchedAt - Date.now()) > 120_000) return;
        safeEvent = {
          id: event.id, type: event.type,
          x: event.x, y: event.y, z: event.z,
          vx: event.vx, vy: event.vy, vz: event.vz,
          charge: event.charge, launchedAt: event.launchedAt
        };
      } else {
        return;
      }

      this.broadcast({
        type: "sandbox-event",
        peerId: peer.peerId,
        event: safeEvent
      }, webSocket);
      return;
    }
  }

  webSocketClose(webSocket, code, reason) {
    this.handleDisconnect(webSocket, code, reason);
  }

  webSocketError(webSocket) {
    this.handleDisconnect(webSocket, 1011, "Connection error");
  }

  handleDisconnect(webSocket, code, reason) {
    const peer = readPeer(webSocket);
    if (!peer || typeof peer.peerId !== "string") return;

    if (peer.isHost) {
      // A room cannot continue its host-controlled race without the host.
      this.broadcast({
        type: "room-closed",
        reason: "The host left the room."
      }, webSocket);
      for (const otherSocket of this.state.getWebSockets()) {
        if (otherSocket === webSocket || !isOpen(otherSocket)) continue;
        try {
          otherSocket.close(4001, "Host left the room");
        } catch {
          // The browser may already have closed the connection.
        }
      }
      return;
    }

    this.broadcast({
      type: "peer-leave",
      peerId: peer.peerId,
      code,
      reason: String(reason || "").slice(0, 120)
    }, webSocket);
  }
}
