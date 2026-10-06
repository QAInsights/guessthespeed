import { parseServerTiming, parseTrace } from "./devdata";

export interface ConnectionInfo {
  colo: string;
  city: string;
  country: string;
  asn: string;
  timezone: string;
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
    colo: "SJC",
    city: "San Jose",
    country: "US",
    asn: "AS13335",
    timezone: "America/Los_Angeles",
    ip: "203.0.113.42",
    ipVersion: "IPv4",
    http: "http/3",
    tls: "TLSv1.3",
    warp: "off",
    edgeRttMs: 15.3,
    minRttMs: 8.1,
  };
}

function headerValue(headers: Headers, name: string): string {
  return headers.get(name)?.trim() || unavailable;
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

  const [trace, edge] = await Promise.all([
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
          headers: response.headers,
          timing: parseServerTiming(
            response.headers.get("server-timing") ?? "",
          ),
        };
      })
      .catch(() => ({
        headers: new Headers(),
        timing: {} as ReturnType<typeof parseServerTiming>,
      })),
  ]);
  const ip = trace.ip || unavailable;
  const colo =
    edge.headers.get("cf-meta-colo")?.trim() || trace.colo || unavailable;
  const country =
    edge.headers.get("cf-meta-country")?.trim() || trace.loc || unavailable;

  return {
    colo,
    city: headerValue(edge.headers, "cf-meta-city"),
    country,
    asn: headerValue(edge.headers, "cf-meta-asn"),
    timezone: headerValue(edge.headers, "cf-meta-timezone"),
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
