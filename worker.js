import { MultiplayerRoom } from "./multiplayer-room.js";
export { MultiplayerRoom };

const MAX_LOBBIES = 100;
const LOBBY_TTL_MS = 45_000;
const MAX_BODY_LENGTH = 4096;
const ID_PATTERN = /^[a-z0-9_-]{5,40}$/i;
const TOKEN_PATTERN = /^[a-f0-9]{32}$/i;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function cleanLobbyName(value) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 28)
    : "";
}

export class LobbyDirectory {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/lobbies") {
      return jsonResponse({ error: "Not found" }, 404);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    if (request.method === "GET") {
      const now = Date.now();
      const stored = await this.state.storage.list({ prefix: "lobby:" });
      const lobbies = [];

      for (const [key, lobby] of stored) {
        if (!lobby || !Number.isFinite(lobby.expiresAt) || lobby.expiresAt <= now) {
          await this.state.storage.delete(key);
          continue;
        }

        // Never expose the host-only removal token in the public directory.
        const { token, expiresAt, ...publicLobby } = lobby;
        lobbies.push(publicLobby);
      }

      lobbies.sort((a, b) => b.playerCount - a.playerCount || a.name.localeCompare(b.name));
      return jsonResponse({ lobbies, serverTime: now });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    let rawBody;
    try {
      rawBody = await request.text();
    } catch {
      return jsonResponse({ error: "Invalid request body" }, 400);
    }
    if (rawBody.length > MAX_BODY_LENGTH) {
      return jsonResponse({ error: "Request is too large" }, 413);
    }

    let message;
    try {
      message = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    const id = message?.id;
    const token = message?.token;
    if (typeof id !== "string" || !ID_PATTERN.test(id) ||
        typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
      return jsonResponse({ error: "Invalid lobby ID or owner token" }, 400);
    }

    const key = "lobby:" + id;
    const now = Date.now();
    let existing = await this.state.storage.get(key);
    if (existing && existing.expiresAt <= now) {
      await this.state.storage.delete(key);
      existing = null;
    }

    if (message.type === "remove") {
      if (!existing) return jsonResponse({ ok: true });
      if (existing.token !== token) {
        return jsonResponse({ error: "Lobby owner token did not match" }, 403);
      }
      await this.state.storage.delete(key);
      return jsonResponse({ ok: true });
    }

    if (message.type !== "upsert") {
      return jsonResponse({ error: "Unknown lobby operation" }, 400);
    }

    if (existing && existing.token !== token) {
      return jsonResponse({ error: "Lobby ID is already owned by another host" }, 409);
    }

    const mode = ["race", "free-drive", "time-trial", "sandbox"].includes(message.mode)
      ? message.mode
      : "race";
    const mapId = message.mapId === "gravel-basin" ? "gravel-basin" : "closed-course";
    if (mapId === "gravel-basin" && !["free-drive", "sandbox"].includes(mode)) {
      return jsonResponse({ error: "Gravel Basin supports Free Drive and Sandbox" }, 400);
    }

    const storedLobbies = await this.state.storage.list({ prefix: "lobby:" });
    let activeCount = 0;
    for (const [storedKey, lobby] of storedLobbies) {
      if (lobby && lobby.expiresAt > now) activeCount++;
      else await this.state.storage.delete(storedKey);
    }
    if (!existing && activeCount >= MAX_LOBBIES) {
      return jsonResponse({ error: "Lobby directory is full; try again shortly" }, 429);
    }

    const playerCount = Number.isFinite(message.playerCount)
      ? Math.max(1, Math.min(8, Math.floor(message.playerCount)))
      : 1;
    const laps = Number.isFinite(message.laps)
      ? Math.max(1, Math.min(20, Math.floor(message.laps)))
      : 3;

    await this.state.storage.put(key, {
      id,
      name: cleanLobbyName(message.name) || "Untitled Lobby",
      mode,
      mapId,
      laps,
      phase: mode === "free-drive" ? "free-drive" : mode === "sandbox" ? "sandbox" : "waiting",
      playerCount,
      maxPlayers: 8,
      token,
      updatedAt: now,
      expiresAt: now + LOBBY_TTL_MS
    });

    return jsonResponse({ ok: true, expiresInMs: LOBBY_TTL_MS });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/lobbies") {
      const id = env.LOBBY_DIRECTORY.idFromName("rc-car-public-lobbies");
      return env.LOBBY_DIRECTORY.get(id).fetch(request);
    }

    const roomPrefix = "/api/rooms/";
    if (url.pathname.startsWith(roomPrefix)) {
      const roomName = url.pathname.slice(roomPrefix.length);
      if (!/^[a-z0-9_-]{5,40}$/i.test(roomName)) {
        return jsonResponse({ error: "Invalid room address" }, 404);
      }
      if (request.method !== "GET" ||
          request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return jsonResponse({ error: "A WebSocket connection is required" }, 426);
      }
      const id = env.ROOM_RELAY.idFromName("rc-car-room:" + roomName);
      return env.ROOM_RELAY.get(id).fetch(request);
    }

    if (url.pathname.startsWith("/api/")) {
      return jsonResponse({ error: "API route not found" }, 404);
    }
    return env.ASSETS.fetch(request);
  }
};
