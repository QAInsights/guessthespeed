import { generateRoomCode, normalizeRoomCode } from "../src/lib/room";
import { parseStatEvent } from "../src/lib/stats";
import type { Env } from "./types";
import { GameRoom } from "./game-room";
import { PlayStats } from "./play-stats";

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
        return createRoom(env);

      const match = url.pathname.match(/^\/api\/rooms\/([^/]+)(\/ws)?$/);
      if (!match || !["GET"].includes(request.method))
        return jsonResponse({ code: "not_found", error: "Not found." }, 404);

      let inputCode: string;
      try {
        inputCode = decodeURIComponent(match[1]);
      } catch {
        return jsonResponse(
          { code: "invalid_room_code", error: "Invalid room code." },
          400,
        );
      }
      const code = normalizeRoomCode(inputCode);
      if (!code)
        return jsonResponse(
          { code: "invalid_room_code", error: "Invalid room code." },
          400,
        );

      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      if (match[2]) {
        if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
          return jsonResponse(
            {
              code: "websocket_upgrade_required",
              error: "WebSocket upgrade required.",
            },
            400,
          );
        const exists = await stub.fetch("https://room.internal/check");
        if (!exists.ok)
          return jsonResponse(
            { code: "room_not_found", error: "Room not found." },
            404,
          );
        return stub.fetch(request);
      }

      const response = await stub.fetch("https://room.internal/check");
      if (!response.ok)
        return jsonResponse(
          { code: "room_not_found", error: "Room not found." },
          404,
        );
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
        {
          code: "invalid_content_type",
          error: "Content-Type must be application/json.",
        },
        400,
      );

    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 256)
      return jsonResponse(
        { code: "request_body_too_large", error: "Request body is too large." },
        400,
      );

    let input: unknown;
    try {
      input = JSON.parse(body);
    } catch {
      return jsonResponse(
        { code: "invalid_json", error: "Invalid JSON." },
        400,
      );
    }
    const event = parseStatEvent(input);
    if (!event)
      return jsonResponse(
        { code: "invalid_event", error: "Invalid event." },
        400,
      );

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

  return jsonResponse(
    { code: "method_not_allowed", error: "Method not allowed." },
    405,
  );
}

async function createRoom(env: Env): Promise<Response> {
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
      body: JSON.stringify({ code, hostToken, now: Date.now() }),
    });
    if (response.status === 201) return jsonResponse({ code, hostToken }, 201);
    if (response.status !== 409)
      return jsonResponse(
        { code: "could_not_create_room", error: "Could not create a room." },
        503,
      );
  }
  return jsonResponse(
    {
      code: "no_room_code_available",
      error: "Could not find an available room code.",
    },
    503,
  );
}
