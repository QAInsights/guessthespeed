export function isAllowedWebSocketOrigin(
  origin: string | null,
  host: string,
): boolean {
  if (origin === null) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function declaredBodyTooLarge(
  contentLength: string | null,
  max: number,
): boolean {
  return contentLength !== null && Number(contentLength) > max;
}
