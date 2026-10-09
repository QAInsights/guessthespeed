export type PlayerEmptyState = "joining" | "empty";

export function playerEmptyState(
  roomMode: boolean,
  roomStateReceived: boolean,
): PlayerEmptyState {
  return roomMode && !roomStateReceived ? "joining" : "empty";
}
