import { DurableObject } from "cloudflare:workers";
import {
  addStatEvent,
  EMPTY_TOTALS,
  parseStatEvent,
  type PlayTotals,
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
        return Response.json({ error: "Invalid event." }, { status: 400 });
      }
      const event = parseStatEvent(body);
      if (!event)
        return Response.json({ error: "Invalid event." }, { status: 400 });

      const totals =
        (await this.ctx.storage.get<PlayTotals>(TOTALS_KEY)) ?? EMPTY_TOTALS;
      await this.ctx.storage.put(TOTALS_KEY, addStatEvent(totals, event));
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/totals" && request.method === "GET") {
      const totals =
        (await this.ctx.storage.get<PlayTotals>(TOTALS_KEY)) ?? EMPTY_TOTALS;
      return Response.json(totals);
    }

    return Response.json({ error: "Not found." }, { status: 404 });
  }
}
