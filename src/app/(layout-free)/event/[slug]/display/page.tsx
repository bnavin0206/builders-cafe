import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getEvent } from "@/app/webhooks/mixologist-helper";
import { isBoardKey } from "@/lib/cafe/board-auth";
import { menuForBoard } from "@/lib/cafe/menu-board";
import DisplayClient from "./display-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Menu and orders" };

/** The WhatsApp chat link the QR code opens: the event's WhatsApp number, saying hi. */
function chatLink(senders: string[] | undefined): string | null {
  const wa = (senders ?? []).find((s) => s.startsWith("whatsapp:"));
  const digits = wa?.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}?text=Hi` : null;
}

/**
 * The menu and the order status on one page, for a display. Opened with the
 * same key as the other two boards: /event/<slug>/display?key=...
 */
export default async function DisplayPage(props: {
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
    <DisplayClient
      slug={slug}
      boardKey={candidate!}
      initialMenu={menuForBoard(event.selection?.items ?? [])}
      qrSvg={qrSvg}
    />
  );
}
