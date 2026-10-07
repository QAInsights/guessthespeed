import { isRecord } from "../src/lib/guards";
import type { RoomKind } from "../src/lib/room";

export function parseRoomKind(body: string): RoomKind {
  if (!body.trim()) return "family";
  try {
    const input: unknown = JSON.parse(body);
    return isRecord(input) && input.kind === "team" ? "team" : "family";
  } catch {
    return "family";
  }
}
