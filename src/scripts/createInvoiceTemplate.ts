/**
 * Creates the WhatsApp template used to send an invoice to a typed number and
 * asks Meta to approve it (Utility category). Run once:
 *   pnpm exec tsx src/scripts/createInvoiceTemplate.ts
 * It prints the template SID: put it in .env.azure.local as INVOICE_TEMPLATE_SID.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { createWhatsAppTemplate } = await import("../lib/twilio/content-templates");
  const t = await createWhatsAppTemplate({
    friendly_name: "builders_cafe_invoice",
    language: "en",
    variables: { "1": "TEST/MMC/00001", "2": "200.00", "3": "https://builderscafe.makemycampaign.in/invoice/pay_abc.123" },
    types: {
      "twilio/text": {
        body: "Thank you for visiting Builder's Cafe. Your GST invoice {{1}} for ₹{{2}} is ready: {{3}} If you have a question, just reply to this message.",
      },
    },
  } as any);
  console.log("Template SID:", t.sid);
}
main().catch((e) => {
  console.error(e?.response?.data?.message || e.message);
  process.exit(1);
});
