export function emptyPlayerMarkup(
  roomMode: boolean,
  roomStateReceived: boolean,
): string {
  return roomMode && !roomStateReceived
    ? '<div class="p-empty"><span>📡</span><p>Joining the room…</p></div>'
    : '<div class="p-empty"><span>🏁</span><p>Add the first player</p></div>';
}
