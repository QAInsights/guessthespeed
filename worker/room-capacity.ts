export const MAX_ROOM_CONNECTIONS = 24;

export function roomHasCapacity(openSockets: number): boolean {
  return openSockets < MAX_ROOM_CONNECTIONS;
}
