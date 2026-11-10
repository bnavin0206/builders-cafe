import { getEvent } from "@/app/webhooks/mixologist-helper";
import { isBoardKey } from "@/lib/cafe/board-auth";
import { menuForBoard } from "@/lib/cafe/menu-board";

/**
 * Read-only feed for the menu board on the display: the items on today's menu
 * with their prices, never anything about customers. It uses the same key as
 * the order board, so the display link works without a login.
 */
export async function GET(
  request: Request,
  props: { params: Promise<{ slug: string }> },
) {
  const [{ slug }, key] = await Promise.all([
    props.params,
    Promise.resolve(new URL(request.url).searchParams.get("key")),
  ]);
  if (!isBoardKey(key) || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const event = await getEvent(slug);
    if (!event) return new Response("Not found", { status: 404 });
    return Response.json(
      { items: menuForBoard(event.selection?.items ?? []) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("Menu board feed failed", e);
    return new Response("Unavailable", { status: 503 });
  }
}
