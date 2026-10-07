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

export function utf8LengthExceeds(text: string, max: number): boolean {
  if (text.length > max) return true;
  if (text.length * 3 <= max) return false;
  return new TextEncoder().encode(text).byteLength > max;
}
