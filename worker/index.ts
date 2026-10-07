import {
  generateRoomCode,
  normalizeRoomCode,
  type RoomKind,
} from "../src/lib/room";
import { parseStatEvent } from "../src/lib/stats";
import type { Env } from "./types";
import {
  declaredBodyTooLarge,
  isAllowedWebSocketOrigin,
  utf8LengthExceeds,
} from "./http";
import { GameRoom } from "./game-room";
import { PlayStats } from "./play-stats";
import { parseRoomKind } from "./room-kind";

export { GameRoom, PlayStats };

const STATS_CACHE_SECONDS = 60;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/stats") return handleStats(request, env);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/rooms" && request.method === "POST")
        return createRoom(request, env);

      const match = url.pathname.match(/^\/api\/rooms\/([^/]+)(\/ws)?$/);
      if (!match || request.method !== "GET")
        return jsonResponse({ error: "Not found." }, 404);

      let inputCode: string;
      try {
        inputCode = decodeURIComponent(match[1]);
      } catch {
        return jsonResponse({ error: "Invalid room code." }, 400);
      }
      const code = normalizeRoomCode(inputCode);
      if (!code) return jsonResponse({ error: "Invalid room code." }, 400);

      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      if (match[2]) {
        if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
          return jsonResponse({ error: "WebSocket upgrade required." }, 426);
        const origin = request.headers.get("Origin");
        if (!isAllowedWebSocketOrigin(origin, url.host))
          return jsonResponse({ error: "Origin not allowed." }, 403);
        return stub.fetch(request);
      }

      const response = await stub.fetch("https://room.internal/check");
      if (!response.ok) return jsonResponse({ error: "Room not found." }, 404);
      return jsonResponse({ exists: true });
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleStats(request: Request, env: Env): Promise<Response> {
  if (request.method === "POST") {
    const contentType = request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (contentType !== "application/json")
      return jsonResponse(
        { error: "Content-Type must be application/json." },
        400,
      );

    if (declaredBodyTooLarge(request.headers.get("content-length"), 256))
      return jsonResponse({ error: "Request body is too large." }, 413);

    const body = await request.text();
    if (utf8LengthExceeds(body, 256))
      return jsonResponse({ error: "Request body is too large." }, 413);

    let input: unknown;
    try {
      input = JSON.parse(body);
    } catch {
      return jsonResponse({ error: "Invalid JSON." }, 400);
    }
    const event = parseStatEvent(input);
    if (!event) return jsonResponse({ error: "Invalid event." }, 400);

    const stub = env.STATS.get(env.STATS.idFromName("global"));
    try {
      await stub.fetch("https://stats.internal/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      });
    } catch {
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 204 });
  }

  if (request.method === "GET") {
    const cache = (caches as CacheStorage & { default: Cache }).default;
    const cacheKey = new Request(new URL("/api/stats", request.url));
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    let totals: unknown;
    try {
      const stub = env.STATS.get(env.STATS.idFromName("global"));
      const response = await stub.fetch("https://stats.internal/totals");
      if (!response.ok)
        return jsonResponse({ error: "Could not load play totals." }, 503);
      totals = await response.json();
    } catch {
      return jsonResponse({ error: "Could not load play totals." }, 503);
    }

    const response = jsonResponse(totals);
    response.headers.set(
      "cache-control",
      `public, max-age=${STATS_CACHE_SECONDS}`,
    );
    await cache.put(cacheKey, response.clone());
    return response;
  }

  return jsonResponse({ error: "Method not allowed." }, 405);
}

async function createRoom(request: Request, env: Env): Promise<Response> {
  if (declaredBodyTooLarge(request.headers.get("content-length"), 64))
    return jsonResponse({ error: "Request body is too large." }, 413);
  const body = await request.text();
  if (utf8LengthExceeds(body, 64))
    return jsonResponse({ error: "Request body is too large." }, 413);
  const kind: RoomKind = parseRoomKind(body);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const random = new Uint32Array(1);
    const code = generateRoomCode(() => {
      crypto.getRandomValues(random);
      return random[0] / 0x1_0000_0000;
    });
    const hostToken = crypto.randomUUID();
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const response = await stub.fetch("https://room.internal/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, hostToken, now: Date.now(), kind }),
    });
    if (response.status === 201) return jsonResponse({ code, hostToken }, 201);
    if (response.status !== 409)
      return jsonResponse({ error: "Could not create a room." }, 503);
  }
  return jsonResponse({ error: "Could not find an available room code." }, 503);
}
