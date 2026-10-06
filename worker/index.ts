import { generateRoomCode, normalizeRoomCode } from "../src/lib/room";
import type { Env } from "./types";
import { GameRoom } from "./game-room";

export { GameRoom };

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/rooms" && request.method === "POST")
        return createRoom(env);

      const match = url.pathname.match(/^\/api\/rooms\/([^/]+)(\/ws)?$/);
      if (!match || !["GET"].includes(request.method))
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
          return jsonResponse({ error: "WebSocket upgrade required." }, 400);
        const exists = await stub.fetch("https://room.internal/check");
        if (!exists.ok) return jsonResponse({ error: "Room not found." }, 404);
        return stub.fetch(request);
      }

      const response = await stub.fetch("https://room.internal/check");
      if (!response.ok) return jsonResponse({ error: "Room not found." }, 404);
      return jsonResponse({ exists: true });
    }
    return env.ASSETS.fetch(request);
  },
};

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
      return jsonResponse({ error: "Could not create a room." }, 503);
  }
  return jsonResponse({ error: "Could not find an available room code." }, 503);
}
