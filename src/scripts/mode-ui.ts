export function modeSwitchHidden(input: {
  roomMode: boolean;
  tvMode: boolean;
  tvLayout: boolean;
  devMode: boolean;
}): boolean {
  return input.roomMode || (input.tvMode && input.tvLayout && !input.devMode);
}

export function urlWithoutDevParam(href: string): string | null {
  const absoluteUrl = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(href);
  const protocolRelativeUrl = href.startsWith("//");
  try {
    const url = new URL(href, "https://guessthespeed.com");
    if (!url.searchParams.has("dev")) return null;
    url.searchParams.delete("dev");
    if (absoluteUrl) return url.toString();
    const suffix = `${url.pathname}${url.search}${url.hash}`;
    return protocolRelativeUrl ? `//${url.host}${suffix}` : suffix;
  } catch {
    return null;
  }
}
