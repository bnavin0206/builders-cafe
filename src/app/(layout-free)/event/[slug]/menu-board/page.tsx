import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getEvent } from "@/app/webhooks/mixologist-helper";
import { isBoardKey } from "@/lib/cafe/board-auth";
import { menuForBoard } from "@/lib/cafe/menu-board";
import MenuBoardClient from "./menu-board-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Menu board" };

/** The WhatsApp chat link the QR code opens: the event's WhatsApp number, saying hi. */
function chatLink(senders: string[] | undefined): string | null {
  const wa = (senders ?? []).find((s) => s.startsWith("whatsapp:"));
  const digits = wa?.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}?text=Hi` : null;
}

/**
 * The menu board for a display. Opened with the same link key as the order
 * board: /event/<slug>/menu-board?key=... It shows the live menu, so a price
 * change or a switched-off item shows up within seconds.
 */
export default async function MenuBoardPage(props: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ key?: string | string[] }>;
}) {
  const [{ slug }, { key }] = await Promise.all([props.params, props.searchParams]);
  const candidate = Array.isArray(key) ? key[0] : key;
  if (!isBoardKey(candidate)) notFound();

  const event = await getEvent(slug);
  if (!event) notFound();

  const link = chatLink(event.senders);
  const qrSvg = link
    ? await QRCode.toString(link, {
        type: "svg",
        margin: 0,
        errorCorrectionLevel: "M",
        color: { dark: "#2b1810", light: "#0000" },
      })
    : null;

  return (
    <MenuBoardClient
      slug={slug}
      boardKey={candidate!}
      initial={menuForBoard(event.selection?.items ?? [])}
      qrSvg={qrSvg}
    />
  );
}
