import type { APIRoute } from "astro";
import { ogCards, ogSlug } from "../../lib/og-cards";
import { renderOgCard } from "../../lib/og-render";

export function getStaticPaths() {
  return ogCards.map((card) => ({
    params: { slug: ogSlug(card.path) },
    props: { card },
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const png = await renderOgCard(props.card);
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png" },
  });
};
