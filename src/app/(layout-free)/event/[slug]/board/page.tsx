import { notFound } from "next/navigation";
import { isBoardKey } from "@/lib/cafe/board-auth";
import BoardClient from "./board-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order board" };

/**
 * The order board for a TV. Opened with a link that carries the board key:
 * /event/<slug>/board?key=... With no key, or the wrong one, there is no page.
 */
export default async function BoardPage(props: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ key?: string | string[] }>;
}) {
  const [{ slug }, { key }] = await Promise.all([props.params, props.searchParams]);
  const candidate = Array.isArray(key) ? key[0] : key;
  if (!isBoardKey(candidate)) notFound();
  return <BoardClient slug={slug} boardKey={candidate!} />;
}
