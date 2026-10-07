import { describe, expect, it } from "vitest";
import {
  buildExport,
  countedSamples,
  maskIp,
  parseMeta,
  parseServerTiming,
  parseTrace,
  percentile,
} from "./devdata";

describe("parseTrace", () => {
  it("parses Cloudflare trace fields", () => {
    expect(
      parseTrace(
        "fl=123f\nh=speed.cloudflare.com\nip=140.232.1.2\nts=1700000000.1\nvisit_scheme=https\nhttp=http/3\ntls=TLSv1.3\nloc=US\nwarp=off\ncolo=SJC\n",
      ),
    ).toMatchObject({
      fl: "123f",
      h: "speed.cloudflare.com",
      ip: "140.232.1.2",
      http: "http/3",
      tls: "TLSv1.3",
      loc: "US",
      warp: "off",
      colo: "SJC",
    });
  });
});

describe("parseMeta", () => {
  it("keeps the connection fields and formats Cloudflare metadata", () => {
    expect(
      parseMeta({
        hostname: "speed.cloudflare.com",
        clientIp: "203.0.113.42",
        httpProtocol: "HTTP/1.1",
        asn: 22348,
        asOrganization: "Cognition AI, Inc.",
        country: "US",
        city: "Portland",
        region: "Oregon",
        postalCode: "97204",
        latitude: "45.52345",
        longitude: "-122.67621",
        colo: { iata: "PDX", city: "Portland" },
      }),
    ).toEqual({
      colo: "PDX (Portland)",
      city: "Portland, Oregon",
      country: "US",
      asn: "AS22348",
      network: "Cognition AI, Inc.",
    });
  });

  it("omits unavailable and non-connection metadata", () => {
    expect(
      parseMeta({
        asn: "AS22348",
        city: "Portland",
        region: "Portland",
        colo: { iata: "PDX" },
        postalCode: "97204",
        latitude: "45.52345",
        longitude: "-122.67621",
      }),
    ).toEqual({
      colo: "PDX",
      city: "Portland",
      asn: "AS22348",
    });
    expect(parseMeta(null)).toEqual({});
    expect(parseMeta({ asn: "unknown" })).toEqual({});
  });
});

describe("maskIp", () => {
  it("masks IPv4 addresses to the first two octets", () => {
    expect(maskIp("140.232.10.42")).toBe("140.232.x.x");
  });

  it("masks IPv6 addresses to the first two hextets", () => {
    expect(maskIp("2606:4700:4700::1111")).toBe("2606:4700:…");
    expect(maskIp("::ffff:192.0.2.1")).toBe("0:0:…");
  });
});

describe("parseServerTiming", () => {
  it("converts cfL4 RTT microseconds to milliseconds", () => {
    expect(
      parseServerTiming('cfL4;desc="?proto=TCP&rtt=6066&min_rtt=5872";dur=0'),
    ).toEqual({ rtt: 6.066, minRtt: 5.872 });
  });

  it("returns only available timing fields", () => {
    expect(parseServerTiming('cfL4;desc="?proto=TCP&rtt=6000"')).toEqual({
      rtt: 6,
    });
    expect(parseServerTiming("")).toEqual({});
    expect(parseServerTiming("other;dur=1")).toEqual({});
  });
});

describe("percentile", () => {
  it("uses the median for odd and even sample counts", () => {
    expect(percentile([7, 1, 4], 0.5)).toBe(4);
    expect(percentile([4, 1, 3, 2], 0.5)).toBe(2.5);
  });

  it("linearly interpolates at the 90th percentile", () => {
    expect(percentile([1, 2, 3, 4, 5], 0.9)).toBeCloseTo(4.6);
  });

  it("returns a single sample unchanged", () => {
    expect(percentile([17], 0.9)).toBe(17);
  });
});

describe("countedSamples", () => {
  it("keeps nonzero samples at or above the duration threshold", () => {
    const points = [
      { duration: 9.99, bps: 2 },
      { duration: 10, bps: 3 },
      { duration: 20, bps: 0 },
    ];
    expect(countedSamples(points, 10)).toEqual([points[1]]);
  });
});

describe("buildExport", () => {
  it("removes IP keys at every depth", () => {
    const exported = buildExport({
      connection: {
        ip: "203.0.113.42",
        clientIp: "203.0.113.42",
        remoteIp: "203.0.113.43",
        userIp: "203.0.113.44",
        ipAddress: "203.0.113.45",
        IP: "203.0.113.46",
        nested: [
          {
            clientIp: "203.0.113.47",
            user: { remoteIp: "203.0.113.48", IP: "2001:db8::1" },
            value: "kept",
          },
        ],
      },
      browser: { language: "en-US", ipv6: "2001:db8::1" },
      summary: { download: 100 },
      postal: { zip: "97204" },
      tip: "preserved",
    });
    const assertNoIpKey = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(assertNoIpKey);
      } else if (value && typeof value === "object") {
        for (const key of Object.keys(value))
          expect(key).not.toMatch(/^(?:client|remote|user)?ip(?:address)?$/i);
        Object.values(value).forEach(assertNoIpKey);
      }
    };

    expect(exported).toEqual({
      connection: { nested: [{ user: {}, value: "kept" }] },
      browser: { language: "en-US", ipv6: "2001:db8::1" },
      summary: { download: 100 },
      postal: { zip: "97204" },
      tip: "preserved",
    });
    assertNoIpKey(exported);
  });
});
