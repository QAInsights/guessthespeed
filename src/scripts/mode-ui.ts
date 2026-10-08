export function modeSwitchHidden(input: {
  roomMode: boolean;
  tvMode: boolean;
  tvLayout: boolean;
  devMode: boolean;
}): boolean {
  return input.roomMode || (input.tvMode && input.tvLayout && !input.devMode);
}
