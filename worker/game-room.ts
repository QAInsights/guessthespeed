import { DurableObject } from "cloudflare:workers";
import {
  applyAction,
  canRunTest,
  createRoom,
  parseTransferHostAction,
  ROOM_TTL_MS,
  transferHost,
  viewFor,
  type Room,
} from "../src/lib/room";
import { isRecord } from "../src/lib/guards";
import { roundStatEvent, type StatEvent } from "../src/lib/stats";
import { alarmToSchedule } from "./alarm";
import { utf8LengthExceeds } from "./http";
import { roomHasCapacity } from "./room-capacity";
import type { Env } from "./types";

interface SocketAttachment {
  clientId: string;
  isHost: boolean;
}

interface RateLimit {
  windowStartedAt: number;
  count: number;
}

const ROOM_KEY = "room";
const MAX_MESSAGE_BYTES = 2 * 1024;
const MAX_MESSAGES_PER_SECOND = 20;
const MAX_PROGRESS_PER_SECOND = 10;
const CLIENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class GameRoom extends DurableObject<Env> {
  private readonly rateLimits = new WeakMap<WebSocket, RateLimit>();
  private progressWindowStartedAt = 0;
  private progressCount = 0;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/init" && request.method === "POST")
      return this.initialize(request);
    if (url.pathname === "/check" && request.method === "GET")
      return (await this.loadRoom())
        ? Response.json({ exists: true })
        : Response.json({ exists: false }, { status: 404 });
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket")
      return this.connectWebSocket();
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  async webSocketMessage(
    socket: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    if (
      typeof message === "string"
        ? utf8LengthExceeds(message, MAX_MESSAGE_BYTES)
        : message.byteLength > MAX_MESSAGE_BYTES
    ) {
      socket.close(1009, "Message too large");
      return;
    }
    if (!this.allowMessage(socket)) {
      sendError(socket, "Too many messages. Please slow down.");
      socket.close(1008, "Rate limit exceeded");
      return;
    }
    if (typeof message !== "string") {
      sendError(socket, "Text messages are required.");
      socket.close(1003, "Text messages are required");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      sendError(socket, "Invalid JSON message.");
      return;
    }
    if (!isRecord(parsed) || typeof parsed.type !== "string") {
      sendError(socket, "Invalid message.");
      return;
    }

    const attachment = getAttachment(socket);
    if (!attachment) {
      await this.handleHello(socket, parsed);
      return;
    }
    if (parsed.type === "hello") {
      sendError(socket, "This connection is already identified.");
      return;
    }
    if (parsed.type === "progress") {
      await this.relayProgress(socket, attachment, parsed);
      return;
    }

    const room = await this.loadRoom();
    if (!room) {
      sendError(socket, "This room has ended.");
      socket.close(1000, "Room ended");
      return;
    }
    if (parsed.type === "transferHost") {
      const action = parseTransferHostAction(parsed);
      if (!action) {
        sendError(socket, "Invalid action.");
        this.sendState(socket, room, attachment);
        return;
      }
      const targetPlayer = room.game.players.find(
        (player) => player.id === action.id,
      );
      const targetOnline =
        targetPlayer !== undefined &&
        this.ctx
          .getWebSockets()
          .some(
            (target) => getAttachment(target)?.clientId === targetPlayer.owner,
          );
      const hostToken = crypto.randomUUID();
      const result = transferHost(room, {
        isHost: attachment.isHost,
        clientId: attachment.clientId,
        playerId: action.id,
        targetOnline,
        newHostToken: hostToken,
        now: Date.now(),
      });
      if (!result.ok) {
        sendError(socket, result.error);
        this.sendState(socket, room, attachment);
        return;
      }
      await this.ctx.storage.put(ROOM_KEY, result.room);
      const next = alarmToSchedule(
        await this.ctx.storage.getAlarm(),
        result.room.updatedAt + ROOM_TTL_MS,
      );
      if (next !== null) await this.ctx.storage.setAlarm(next);
      const hostMessage = JSON.stringify({ type: "host", hostToken });
      for (const target of this.ctx.getWebSockets()) {
        const targetAttachment = getAttachment(target);
        if (!targetAttachment) continue;
        const isHost = targetAttachment.clientId === result.newHostClientId;
        try {
          target.serializeAttachment({
            ...targetAttachment,
            isHost,
          });
          if (isHost) target.send(hostMessage);
        } catch {
          continue;
        }
      }
      this.broadcastState(result.room);
      return;
    }
    const previousPhase = room.game.phase;
    const lockedGuesses = room.game.players.filter(
      (player) => player.locked,
    ).length;
    const result = applyAction(
      room,
      attachment.clientId,
      attachment.isHost,
      parsed,
      Date.now(),
    );
    if ("error" in result) {
      sendError(socket, result.error);
      this.sendState(socket, room, attachment);
      return;
    }
    await this.ctx.storage.put(ROOM_KEY, result.room);
    const next = alarmToSchedule(
      await this.ctx.storage.getAlarm(),
      result.room.updatedAt + ROOM_TTL_MS,
    );
    if (next !== null) await this.ctx.storage.setAlarm(next);
    this.broadcastState(result.room);
    if (
      parsed.type === "result" &&
      previousPhase === "testing" &&
      result.room.game.phase === "results"
    ) {
      const lastRound = result.room.game.history.at(-1);
      if (lastRound)
        this.recordStat(
          roundStatEvent(
            lastRound.scores,
            lastRound.actual,
            "room",
            lockedGuesses,
          ),
        );
    } else if (
      parsed.type === "next" &&
      result.room.game.phase === "champion"
    ) {
      this.recordStat({ kind: "game" });
    }
  }

  webSocketClose(socket: WebSocket): void {
    this.rateLimits.delete(socket);
  }

  webSocketError(socket: WebSocket): void {
    this.rateLimits.delete(socket);
  }

  private recordStat(event: StatEvent): void {
    try {
      const request = this.env.STATS.get(
        this.env.STATS.idFromName("global"),
      ).fetch("https://stats.internal/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      });
      this.ctx.waitUntil(request.then(() => undefined).catch(() => {}));
    } catch {
      return;
    }
  }

  async alarm(): Promise<void> {
    const room = await this.loadRoom();
    if (room && Date.now() < room.updatedAt + ROOM_TTL_MS) {
      await this.ctx.storage.setAlarm(room.updatedAt + ROOM_TTL_MS);
      return;
    }
    await this.ctx.storage.deleteAll();
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.close(1000, "Room ended");
      } catch {
        continue;
      }
    }
  }

  private async initialize(request: Request): Promise<Response> {
    if (await this.loadRoom())
      return Response.json(
        { error: "Room code already exists." },
        { status: 409 },
      );
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return Response.json(
        { error: "Invalid initialization." },
        { status: 400 },
      );
    }
    if (
      !isRecord(input) ||
      typeof input.code !== "string" ||
      typeof input.hostToken !== "string" ||
      typeof input.now !== "number" ||
      !Number.isFinite(input.now)
    )
      return Response.json(
        { error: "Invalid initialization." },
        { status: 400 },
      );
    let room: Room;
    try {
      room = createRoom(input.code, input.hostToken, input.now);
    } catch {
      return Response.json({ error: "Invalid room code." }, { status: 400 });
    }
    await this.ctx.storage.put(ROOM_KEY, room);
    const next = alarmToSchedule(
      await this.ctx.storage.getAlarm(),
      room.updatedAt + ROOM_TTL_MS,
    );
    if (next !== null) await this.ctx.storage.setAlarm(next);
    return Response.json({ exists: true }, { status: 201 });
  }

  private async connectWebSocket(): Promise<Response> {
    if (!(await this.loadRoom()))
      return Response.json({ error: "Room not found." }, { status: 404 });
    if (!roomHasCapacity(this.ctx.getWebSockets().length))
      return Response.json({ error: "This room is full." }, { status: 503 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server, ["room"]);
    this.rateLimits.set(server, {
      windowStartedAt: Date.now(),
      count: 0,
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleHello(
    socket: WebSocket,
    message: Record<string, unknown>,
  ): Promise<void> {
    if (
      message.type !== "hello" ||
      typeof message.clientId !== "string" ||
      message.clientId.length > 64 ||
      !CLIENT_ID_PATTERN.test(message.clientId)
    ) {
      sendError(socket, "A valid hello message is required first.");
      socket.close(1008, "Invalid hello");
      return;
    }
    const room = await this.loadRoom();
    if (!room) {
      sendError(socket, "This room has ended.");
      socket.close(1000, "Room ended");
      return;
    }
    const attachment: SocketAttachment = {
      clientId: message.clientId,
      isHost:
        typeof message.hostToken === "string" &&
        message.hostToken === room.hostToken,
    };
    socket.serializeAttachment(attachment);
    this.sendState(socket, room, attachment);
  }

  private async relayProgress(
    sender: WebSocket,
    attachment: SocketAttachment,
    message: Record<string, unknown>,
  ): Promise<void> {
    const room = await this.loadRoom();
    if (!room) {
      sendError(sender, "This room has ended.");
      return;
    }
    if (room.game.phase !== "testing") return;
    if (!canRunTest(room, attachment.clientId, attachment.isHost)) {
      sendError(sender, "Only the assigned tester can share test progress.");
      return;
    }
    const now = Date.now();
    if (now - this.progressWindowStartedAt >= 1000) {
      this.progressWindowStartedAt = now;
      this.progressCount = 0;
    }
    this.progressCount += 1;
    if (this.progressCount > MAX_PROGRESS_PER_SECOND) return;
    if (!["ping", "down", "up"].includes(String(message.phase))) return;

    const progress: Record<string, string | number> = {
      type: "progress",
      phase: String(message.phase),
    };
    for (const key of ["mbps", "pingMs", "step", "steps", "bytes"]) {
      const value = message[key];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0)
        progress[key] = value;
    }
    const serialized = JSON.stringify(progress);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === sender || !getAttachment(socket)) continue;
      try {
        socket.send(serialized);
      } catch {
        continue;
      }
    }
  }

  private broadcastState(room: Room): void {
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = getAttachment(socket);
      if (attachment) this.sendState(socket, room, attachment);
    }
  }

  private sendState(
    socket: WebSocket,
    room: Room,
    attachment: SocketAttachment,
  ): void {
    try {
      socket.send(
        JSON.stringify({
          type: "state",
          view: viewFor(room, attachment.clientId, attachment.isHost),
        }),
      );
    } catch {
      return;
    }
  }

  private async loadRoom(): Promise<Room | undefined> {
    return this.ctx.storage.get<Room>(ROOM_KEY);
  }

  private allowMessage(socket: WebSocket): boolean {
    const now = Date.now();
    let limit = this.rateLimits.get(socket);
    if (!limit) {
      limit = { windowStartedAt: now, count: 0 };
      this.rateLimits.set(socket, limit);
    }
    if (now - limit.windowStartedAt >= 1000) {
      limit.windowStartedAt = now;
      limit.count = 0;
    }
    limit.count += 1;
    return limit.count <= MAX_MESSAGES_PER_SECOND;
  }
}

function getAttachment(socket: WebSocket): SocketAttachment | null {
  const attachment = socket.deserializeAttachment() as unknown;
  return isRecord(attachment) &&
    typeof attachment.clientId === "string" &&
    typeof attachment.isHost === "boolean"
    ? { clientId: attachment.clientId, isHost: attachment.isHost }
    : null;
}

function sendError(socket: WebSocket, message: string): void {
  try {
    socket.send(JSON.stringify({ type: "error", message }));
  } catch {
    return;
  }
}
