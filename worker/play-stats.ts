import { DurableObject } from "cloudflare:workers";
import {
  addStatEvent,
  normalizeTotals,
  parseStatEvent,
} from "../src/lib/stats";
import type { Env } from "./types";

const TOTALS_KEY = "totals";

export class PlayStats extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/add" && request.method === "POST") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "invalid_event" }, { status: 400 });
      }
      const event = parseStatEvent(body);
      if (!event)
        return Response.json({ error: "invalid_event" }, { status: 400 });

      const totals = normalizeTotals(
        await this.ctx.storage.get<unknown>(TOTALS_KEY),
      );
      await this.ctx.storage.put(TOTALS_KEY, addStatEvent(totals, event));
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/totals" && request.method === "GET") {
      const stored = await this.ctx.storage.get<unknown>(TOTALS_KEY);
      return Response.json(normalizeTotals(stored));
    }

    return Response.json({ error: "not_found" }, { status: 404 });
  }
}
