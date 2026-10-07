export interface BandwidthSample {
  bytes: number;
  bps: number;
  duration: number;
  ping: number;
  measTime: string;
  serverTime: number;
  transferSize: number;
}

export function parseTrace(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => {
        const separator = line.indexOf("=");
        return separator < 0
          ? null
          : [line.slice(0, separator), line.slice(separator + 1)];
      })
      .filter((entry): entry is [string, string] => entry !== null),
  );
}

export interface CloudflareMeta {
  colo: string;
  city: string;
  country: string;
  asn: string;
  network: string;
}

export function parseMeta(json: unknown): Partial<CloudflareMeta> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const meta = json as Record<string, unknown>;
  const colo =
    meta.colo && typeof meta.colo === "object" && !Array.isArray(meta.colo)
      ? (meta.colo as Record<string, unknown>)
      : {};
  const text = (value: unknown) =>
    typeof value === "string" && value.trim()
      ? value.trim()
      : typeof value === "number" && Number.isFinite(value)
        ? String(value)
        : undefined;
  const iata = text(colo.iata);
  const coloCity = text(colo.city);
  const cityName = text(meta.city);
  const region = text(meta.region);
  const rawAsn = text(meta.asn);
  const asn = rawAsn
    ? /^AS\d+$/i.test(rawAsn)
      ? rawAsn.toUpperCase()
      : /^\d+$/.test(rawAsn)
        ? `AS${rawAsn}`
        : undefined
    : undefined;
  const country = text(meta.country);
  const network = text(meta.asOrganization);
  const parsed: Partial<CloudflareMeta> = {};

  if (iata || coloCity)
    parsed.colo = iata
      ? `${iata}${coloCity ? ` (${coloCity})` : ""}`
      : coloCity;
  if (cityName)
    parsed.city =
      region && region.toLowerCase() !== cityName.toLowerCase()
        ? `${cityName}, ${region}`
        : cityName;
  if (country) parsed.country = country;
  if (asn) parsed.asn = asn;
  if (network) parsed.network = network;

  return parsed;
}

export function maskIp(ip: string): string {
  if (ip.includes(":")) {
    const hextets = ip.split("%", 1)[0].split(":");
    return `${hextets[0] || "0"}:${hextets[1] || "0"}:…`;
  }
  const octets = ip.split(".");
  return octets.length === 4 ? `${octets[0]}.${octets[1]}.x.x` : ip;
}

export function parseServerTiming(header: string): {
  rtt?: number;
  minRtt?: number;
} {
  const cfL4 = header
    .split(",")
    .map((entry) => entry.trim())
    .find((entry) => /^cfL4(?:;|$)/i.test(entry));
  if (!cfL4) return {};

  const description = cfL4.match(/(?:^|;)\s*desc="?([^"]*)"?/i)?.[1];
  if (!description) return {};
  const values = new URLSearchParams(description.replace(/^\?/, ""));
  const parseMicros = (value: string | null) => {
    if (value === null) return undefined;
    const microseconds = Number(value);
    return Number.isFinite(microseconds) ? microseconds / 1000 : undefined;
  };
  const rtt = parseMicros(values.get("rtt"));
  const minRtt = parseMicros(values.get("min_rtt"));
  return {
    ...(rtt === undefined ? {} : { rtt }),
    ...(minRtt === undefined ? {} : { minRtt }),
  };
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sortedValues = values.slice().sort((a, b) => a - b);
  const index = (values.length - 1) * p;
  const remainder = index % 1;
  if (remainder === 0) return sortedValues[Math.round(index)] ?? 0;
  const lower = sortedValues[Math.floor(index)] ?? 0;
  const upper = sortedValues[Math.ceil(index)] ?? lower;
  return lower + (upper - lower) * remainder;
}

export function countedSamples<
  T extends Pick<BandwidthSample, "duration" | "bps">,
>(points: T[], minDuration: number): T[] {
  return points.filter((point) => point.duration >= minDuration && point.bps);
}

function omitIp(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitIp);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      /^(?:client|remote|user)?ip(?:address)?$/i.test(key)
        ? []
        : [[key, omitIp(entry)]],
    ),
  );
}

export function buildExport<T>(run: T): T {
  return omitIp(run) as T;
}
