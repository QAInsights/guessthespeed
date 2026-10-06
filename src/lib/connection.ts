import { parseMeta, parseServerTiming, parseTrace } from "./devdata";

export interface ConnectionInfo {
  colo: string;
  city: string;
  country: string;
  asn: string;
  network: string;
  ip: string;
  ipVersion: string;
  http: string;
  tls: string;
  warp: string;
  edgeRttMs: number | null;
  minRttMs: number | null;
}

const unavailable = "unavailable";

function mockConnectionInfo(): ConnectionInfo {
  return {
    colo: "SJC (San Jose)",
    city: "San Jose, California",
    country: "US",
    asn: "AS13335",
    network: "Cloudflare, Inc.",
    ip: "203.0.113.42",
    ipVersion: "IPv4",
    http: "http/3",
    tls: "TLSv1.3",
    warp: "off",
    edgeRttMs: 15.3,
    minRttMs: 8.1,
  };
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchConnectionInfo(): Promise<ConnectionInfo> {
  if (
    typeof window !== "undefined" &&
    ["1", "slow", "stall"].includes(
      new URLSearchParams(window.location.search).get("mock") ?? "",
    )
  ) {
    return mockConnectionInfo();
  }

  const [meta, trace, edge] = await Promise.all([
    fetchWithTimeout("https://speed.cloudflare.com/meta")
      .then(async (response) => {
        if (!response.ok) throw new Error("Metadata request failed");
        return parseMeta(await response.json());
      })
      .catch(() => parseMeta({})),
    fetchWithTimeout("https://speed.cloudflare.com/cdn-cgi/trace")
      .then(async (response) => {
        if (!response.ok) throw new Error("Trace request failed");
        return parseTrace(await response.text());
      })
      .catch(() => ({}) as Record<string, string>),
    fetchWithTimeout("https://speed.cloudflare.com/__down?bytes=0")
      .then((response) => {
        if (!response.ok) throw new Error("Edge request failed");
        return {
          timing: parseServerTiming(
            response.headers.get("server-timing") ?? "",
          ),
        };
      })
      .catch(() => ({
        timing: {} as ReturnType<typeof parseServerTiming>,
      })),
  ]);
  const ip = trace.ip || unavailable;
  const colo = meta.colo || trace.colo || unavailable;
  const country = meta.country || trace.loc || unavailable;

  return {
    colo,
    city: meta.city || unavailable,
    country,
    asn: meta.asn || unavailable,
    network: meta.network || unavailable,
    ip,
    ipVersion:
      ip === unavailable ? unavailable : ip.includes(":") ? "IPv6" : "IPv4",
    http: trace.http || unavailable,
    tls: trace.tls || unavailable,
    warp: trace.warp || unavailable,
    edgeRttMs: edge.timing.rtt ?? null,
    minRttMs: edge.timing.minRtt ?? null,
  };
}
