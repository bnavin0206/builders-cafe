import { getSyncService } from "@/lib/twilio";
import { buildBoard } from "@/lib/cafe/board";
import { isBoardKey } from "@/lib/cafe/board-auth";

/**
 * Read-only feed for the TV order board: the order numbers, the items and the
 * status of recent orders, never names, phones or payment details. It needs the
 * board key, so the TV link works without a login and nobody else can read it.
 */
export async function GET(
  request: Request,
  props: { params: Promise<{ slug: string }> },
) {
  const [{ slug }, key] = await Promise.all([
    props.params,
    Promise.resolve(new URL(request.url).searchParams.get("key")),
  ]);
  // The same answer for a wrong key, no key and a switched-off board.
  if (!isBoardKey(key) || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const service = await getSyncService();
    const items = await service
      .syncLists()(slug)
      .syncListItems.list({ limit: 100, order: "desc" });
    const board = buildBoard(
      items.map((i) => ({ index: i.index, data: i.data, dateUpdated: i.dateUpdated })),
    );
    return Response.json(board, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    if (e?.status === 404) return new Response("Not found", { status: 404 });
    console.error("Order board feed failed", e);
    return new Response("Unavailable", { status: 503 });
  }
}
