export type TagColor = "green" | "blue" | "purple" | "orange" | "gray";

export interface OrderTag {
  text: string;
  color: TagColor;
}

const MODE: Record<string, string> = { pos: "POS", upi: "UPI", cash: "Cash" };
const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * The tag the barista sees on an order: free, paid, free plus paid, a counter
 * sale (with how it was paid), or a hand-made order with no payment.
 */
export function orderTag(data: {
  amountPaise?: number;
  paymentId?: string;
  freeCoffee?: boolean;
  payMode?: string;
  manual?: boolean;
}): OrderTag {
  const paid = Number(data.amountPaise) > 0;
  if (data.payMode && MODE[data.payMode]) {
    return { text: `COUNTER · ${MODE[data.payMode]}${paid ? ` ${inr(Number(data.amountPaise))}` : ""}`, color: "orange" };
  }
  if (data.freeCoffee && paid) return { text: `FREE + PAID ${inr(Number(data.amountPaise))}`, color: "purple" };
  if (data.freeCoffee) return { text: "FREE", color: "green" };
  if (paid && data.paymentId) return { text: `PAID ${inr(Number(data.amountPaise))}`, color: "blue" };
  return { text: "MANUAL", color: "gray" };
}
