"use server";

import type { modes, Event, Language, ListRow } from "@/types";
import { getSampleOrder } from "@/lib/stringTemplates";

const axios = require("axios");

// Templates are created by createTwilioRes under CONTENT_PREFIX (from
// next.config.ts), so they must be looked up under the same name. This used to
// use SERVICE_INSTANCE_PREFIX, which only matched when the two were equal.
const contentPrefix = process.env.CONTENT_PREFIX || "mixologist_";

const LANG_SUFFIX: Record<Language, string> = { "en": "", "pt-BR": "_ptbr", "fr": "_fr" };

function modeToBeverage(mode: modes, language: Language, plural: boolean = false) {
  if (language === "pt-BR") {
    return mode === "smoothie"
      ? plural ? "smoothies" : "smoothie"
      : mode === "cocktail"
        ? plural ? "bebidas" : "bebida"
        : mode === "tea"
          ? plural ? "chás" : "chá"
          : mode === "waffles"
            ? plural ? "waffles" : "waffle"
          : plural ? "cafés" : "café";
  }
  if (language === "fr") {
    return mode === "smoothie"
      ? plural ? "smoothies" : "smoothie"
      : mode === "cocktail"
        ? plural ? "boissons" : "boisson"
        : mode === "tea"
          ? plural ? "thés" : "thé"
          : mode === "waffles"
            ? plural ? "gaufres" : "gaufre"
          : plural ? "cafés" : "café";
  }
  return mode === "smoothie"
    ? plural ? "smoothies" : "smoothie"
    : mode === "cocktail"
      ? plural ? "drinks" : "drink"
      : mode === "tea"
        ? plural ? "teas" : "tea"
        : mode === "waffles"
          ? plural ? "waffles" : "waffle"
        : "coffee";
}

function buildContentVariables(variables: any[], startIndex = 0) {
  const contentVariables: any = {};
  variables.forEach((value, i) => {
    contentVariables[String(i + startIndex)] = String(value ?? "");
  });
  return JSON.stringify(contentVariables);
}

async function getTemplate(templateName: string) {
  let match, nextPageUrl;
  try {
    do {
      const { data }: { data: any } = await axios.get(
        nextPageUrl || "https://content.twilio.com/v1/Content?PageSize=50",
        {
          headers: {
            "Content-Type": "application/json",
          },
          auth: {
            username: process.env.TWILIO_API_KEY,
            password: process.env.TWILIO_API_SECRET,
          },
        },
      );
      match = data.contents.find((t: any) => t.friendly_name === templateName);
      nextPageUrl = data.meta.next_page_url;
    } while (!match && nextPageUrl);
  } catch (err) {
    console.error(err);
    throw new Error("Failed to fetch Templates");
  }
  if (!match) {
    throw new Error(`Template ${templateName} not found`);
  }
  return match;
}

export async function getOrderReadyMessage(
  product: string,
  orderNumber: string,
  orderPickupLocation: string,
  language: Language = "en",
) {
  const suffix = LANG_SUFFIX[language];
  const template = await getTemplate(`${contentPrefix}order_ready${suffix}`);

  return {
    contentSid: template.sid,
    // The templates number their variables from 1.
    contentVariables: buildContentVariables(
      [product, orderNumber, orderPickupLocation],
      1,
    ),
  };
}

export async function getOrderReadyReminderMessage(
  product: string,
  orderNumber: string,
  orderPickupLocation: string,
  language: Language = "en",
) {
  const suffix = LANG_SUFFIX[language];
  const template = await getTemplate(
    `${contentPrefix}order_reminder${suffix}`,
  );

  return {
    contentSid: template.sid,
    // The templates number their variables from 1.
    contentVariables: buildContentVariables(
      [product, orderNumber, orderPickupLocation],
      1,
    ),
  };
}

export async function getShowMenuMessage(
  intro: string,
  availableOptions: any[],
  outro: string,
  language: Language = "en",
) {
  const suffix = LANG_SUFFIX[language];
  const template = await getTemplate(
    `${contentPrefix}show_menu_${availableOptions.length}${suffix}`,
  );
  return {
    contentSid: template.sid,
    contentVariables: buildContentVariables([
      intro,
      ...availableOptions
        .map((o) => [o.title, o.shortTitle, o.description])
        .flat(),
      outro,
    ]),
  };
}

export async function getShowModifiersMessage(
  intro: string,
  availableModifiers: string[],
  outro: string,
  language: Language = "en",
) {
  const suffix = LANG_SUFFIX[language];
  const template = await getTemplate(
    `${contentPrefix}show_menu_${availableModifiers.length}${suffix}`,
  );
  return {
    contentSid: template.sid,
    contentVariables: buildContentVariables([
      intro,
      ...availableModifiers.map((o) => [o, o, o]).flat(),
      outro,
    ]),
  };
}

export async function getReadyToOrderMessage(
  event: Event,
  availableOptions: any[],
  maxNumberOrders: number,
  emailValidationSuffix: boolean,
  language: Language = "en",
) {
  const { mode } = event.selection;
  const maxOrders = `${maxNumberOrders} ${modeToBeverage(mode, language, maxNumberOrders !== 1)}`;
  const sampleOrder = getSampleOrder(event.selection, language);

  const limitess = maxNumberOrders >= 50 ? "_limitless" : "";
  const emailSuffix = emailValidationSuffix ? "_without_email" : "";
  const langSuffix = LANG_SUFFIX[language];

  const template = await getTemplate(
    `${contentPrefix}ready_to_order${limitess}${emailSuffix}_${availableOptions.length}${langSuffix}`,
  );

  const isLimitless = maxNumberOrders >= 50;

  if (isLimitless) {
    return {
      contentSid: template.sid,
      contentVariables: buildContentVariables(
        [
          sampleOrder,
          ...availableOptions
            .map((o) => [o.title, o.shortTitle, o.description])
            .flat(),
        ],
        1,
      ),
    };
  }

  return {
    contentSid: template.sid,
    contentVariables: buildContentVariables([
      maxOrders,
      sampleOrder,
      ...availableOptions
        .map((o) => [o.title, o.shortTitle, o.description])
        .flat(),
    ]),
  };
}

export async function getEventRegistrationMessage(eventOptions: any[], language: Language = "en") {
  const suffix = LANG_SUFFIX[language];
  const template = await getTemplate(
    `${contentPrefix}event_registration_${eventOptions.length}${suffix}`,
  );

  return {
    contentSid: template.sid,
    contentVariables: buildContentVariables([
      ...eventOptions.map((o) => [o.data.name, o.data.name]).flat(),
    ]),
  };
}

const listTemplateSids = new Map<string, string>();

/**
 * The cafe flow's list picker (see getCafeListTemplate): `prompt` above the
 * list and one row per entry, 1 to 10 rows. Throws when the template does not
 * exist yet, so the caller can fall back to a text menu.
 */
export async function getCafeListMessage(prompt: string, rows: ListRow[]) {
  const name = `${contentPrefix}cafe_list_${rows.length}`;
  let sid = listTemplateSids.get(name);
  if (!sid) {
    sid = (await getTemplate(name)).sid as string;
    listTemplateSids.set(name, sid);
  }
  // {{1}} is the prompt; each row adds title, id and description.
  const values: string[] = [prompt];
  for (const row of rows) values.push(row.title, row.id, row.description);
  return {
    contentSid: sid,
    contentVariables: buildContentVariables(values, 1),
  };
}
