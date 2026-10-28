import type { Language } from "@/types";

const SAMPLE_ITEMS = [
  { title: "Espresso", shortTitle: "Espresso", description: "Rich Italian coffee" },
  { title: "Latte", shortTitle: "Latte", description: "Espresso with steamed milk" },
  { title: "Cappuccino", shortTitle: "Cappuccino", description: "Espresso with milk foam" },
  { title: "Americano", shortTitle: "Americano", description: "Espresso with hot water" },
  { title: "Flat White", shortTitle: "Flat White", description: "Espresso with microfoam" },
  { title: "Macchiato", shortTitle: "Macchiato", description: "Espresso with a dash of milk" },
  { title: "Cortado", shortTitle: "Cortado", description: "Espresso cut with warm milk" },
  { title: "Cold Brew", shortTitle: "Cold Brew", description: "Cold-steeped coffee" },
  { title: "Mocha", shortTitle: "Mocha", description: "Espresso with chocolate" },
  { title: "Ristretto", shortTitle: "Ristretto", description: "Short, concentrated espresso" },
];

// Builds sample variables for show_menu / show_help templates:
// {{0}} = intro, {{i*3+1}} = full title, {{i*3+2}} = short title, {{i*3+3}} = description, {{numOptions*3+1}} = outro
function buildShowMenuSampleVars(numOptions: number): Record<string, string> {
  const vars: Record<string, string> = { "0": "What would you like today?" };
  for (let i = 0; i < numOptions; i++) {
    const item = SAMPLE_ITEMS[i % SAMPLE_ITEMS.length];
    vars[String(i * 3 + 1)] = item.title;
    vars[String(i * 3 + 2)] = item.shortTitle;
    vars[String(i * 3 + 3)] = item.description;
  }
  vars[String(numOptions * 3 + 1)] = "Reply with your choice!";
  return vars;
}

// Builds sample variables for ready_to_order templates:
// {{0}} = max orders, {{1}} = sample order, {{i*3+2}} = full title, {{i*3+3}} = short title, {{i*3+4}} = description
function buildReadyToOrderSampleVars(numOptions: number): Record<string, string> {
  const vars: Record<string, string> = { "0": "2 drinks", "1": "Espresso" };
  for (let i = 0; i < numOptions; i++) {
    const item = SAMPLE_ITEMS[i % SAMPLE_ITEMS.length];
    vars[String(i * 3 + 2)] = item.title;
    vars[String(i * 3 + 3)] = item.shortTitle;
    vars[String(i * 3 + 4)] = item.description;
  }
  return vars;
}

// Builds sample variables for limitless ready_to_order templates (no {{0}} order-limit placeholder):
// {{1}} = sample order, {{i*3+2}} = full title, {{i*3+3}} = short title, {{i*3+4}} = description
function buildReadyToOrderLimitlessSampleVars(numOptions: number): Record<string, string> {
  const vars: Record<string, string> = { "1": "Espresso" };
  for (let i = 0; i < numOptions; i++) {
    const item = SAMPLE_ITEMS[i % SAMPLE_ITEMS.length];
    vars[String(i * 3 + 2)] = item.title;
    vars[String(i * 3 + 3)] = item.shortTitle;
    vars[String(i * 3 + 4)] = item.description;
  }
  return vars;
}

// Builds sample variables for event_registration templates:
// {{i*2}} = event name, {{i*2+1}} = event id
function buildEventRegistrationSampleVars(numOptions: number): Record<string, string> {
  const vars: Record<string, string> = {};
  for (let i = 0; i < numOptions; i++) {
    vars[String(i * 2)] = `Event ${i + 1}`;
    vars[String(i * 2 + 1)] = `event-${i + 1}`;
  }
  return vars;
}

function getAvailableOptions(indiciesOfFullTitles: string[], language: Language) {
  if (language === "pt-BR") {
    return `O que você gostaria? As opções são:\n${indiciesOfFullTitles.join("\n")}`;
  }
  if (language === "fr") {
    return `Que souhaitez-vous\u00A0? Les options sont\u00A0:\n${indiciesOfFullTitles.join("\n")}`;
  }
  return `What would you like? The options are:\n${indiciesOfFullTitles.join("\n")}`;
}

function getConfirmationVerifiedEmail(language: Language) {
  if (language === "pt-BR") return `Obrigado! Seu endereço de e-mail foi verificado.`;
  if (language === "fr") return `Merci\u00A0! Votre adresse e-mail a été vérifiée.`;
  return `Thank you! Your email address has been verified.`;
}

function getSampleOrder(language: Language) {
  if (language === "pt-BR") return `Ou envie uma mensagem com o seu pedido, ex: "{{1}}".`;
  if (language === "fr") return `Ou envoyez un message contenant votre commande, ex\u00A0: "{{1}}".`;
  return `Or send a message containing your order, e.g. "{{1}}".`;
}

function getOrderLimitationNote(language: Language) {
  if (language === "pt-BR") return `\n\nPS: Cada participante pode pedir até {{0}} por dia.`;
  if (language === "fr") return `\n\nPS\u00A0: Chaque participant peut commander jusqu'à {{0}} par jour.`;
  return `\n\nPS: Every attendee can get up to {{0}} per day.`;
}

function getMoreDetailsButton(language: Language) {
  if (language === "pt-BR") return "Mais Detalhes";
  if (language === "fr") return "Plus de détails";
  return "More Details";
}

function getOrderActionLabel(language: Language) {
  if (language === "pt-BR") return "Pedir";
  if (language === "fr") return "Commander";
  return "Order a";
}

function langCode(language: Language) {
  if (language === "pt-BR") return "pt_BR";
  if (language === "fr") return "fr";
  return "en";
}

export function getShowHelpTemplate(
  numOptions: number,
  templateName: string,
  language: Language = "en",
): WhatsAppTemplateConfig {
  // The first variable defines the type of beverage abd then there are always 3 vars (short title, full title, desc) per options  => numOptions * 3

  const variables = buildShowMenuSampleVars(numOptions);

  const indiciesOfFullTitles = [],
    items = [];
  for (let i = 0; i < numOptions; i++) {
    indiciesOfFullTitles.push(`- {{${i * 3 + 1}}}`);
    items.push({
      item: `{{${i * 3 + 2}}}`,
      id: `${getOrderActionLabel(language)} {{${i * 3 + 1}}}`, // should be same as indiciesOfFullTitles because this will be send to the webhook
      description: `{{${i * 3 + 3}}}`,
    });
  }

  const lastIndex = numOptions * 3 + 1;

  const body = `{{0}}\n${indiciesOfFullTitles.join("\n")}\n\n{{${lastIndex}}}`;

  return {
    friendly_name: templateName,
    language: langCode(language),
    variables,
    types: {
      "twilio/list-picker": {
        body,
        items,
        button: getMoreDetailsButton(language),
      },
      "twilio/text": {
        body: body,
      },
    },
  };
}

export function getReadyToOrderTemplate(
  numOptions: number,
  templateName: string,
  language: Language = "en",
): WhatsAppTemplateConfig {
  // The first two variables define the mode and the max num of orders and then 3 additional vars (short title, full title, desc) per options  => numOptions * 3 + 1

  const variables = buildReadyToOrderSampleVars(numOptions);

  const indiciesOfFullTitles = [],
    items = [];
  for (let i = 0; i < numOptions; i++) {
    indiciesOfFullTitles.push(`- {{${i * 3 + 2}}}`);
    items.push({
      item: `{{${i * 3 + 3}}}`,
      id: `${getOrderActionLabel(language)} {{${i * 3 + 2}}}`, // should be same as indiciesOfFullTitles because this will be send to the webhook
      description: `{{${i * 3 + 4}}}`,
    });
  }

  const body = `${getConfirmationVerifiedEmail(language)} ${getAvailableOptions(indiciesOfFullTitles, language)}\n${getSampleOrder(language)}${getOrderLimitationNote(language)}`;

  return {
    friendly_name: templateName,
    language: langCode(language),
    variables,
    types: {
      "twilio/list-picker": {
        body,
        items,
        button: getMoreDetailsButton(language),
      },
      "twilio/text": {
        body: body,
      },
    },
  };
}

export function getReadyToOrderLimitlessTemplate(
  numOptions: number,
  templateName: string,
  language: Language = "en",
): WhatsAppTemplateConfig {
  const variables = buildReadyToOrderLimitlessSampleVars(numOptions);

  const indiciesOfFullTitles = [],
    items = [];
  for (let i = 0; i < numOptions; i++) {
    indiciesOfFullTitles.push(`- {{${i * 3 + 2}}}`);
    items.push({
      item: `{{${i * 3 + 3}}}`,
      id: `${getOrderActionLabel(language)} {{${i * 3 + 2}}}`, // should be same as indiciesOfFullTitles because this will be send to the webhook
      description: `{{${i * 3 + 4}}}`,
    });
  }

  const body = `${getConfirmationVerifiedEmail(language)} ${getAvailableOptions(indiciesOfFullTitles, language)}\n${getSampleOrder(language)}`;

  return {
    friendly_name: templateName,
    language: langCode(language),
    variables,
    types: {
      "twilio/list-picker": {
        body,
        items,
        button: getMoreDetailsButton(language),
      },
      "twilio/text": {
        body: body,
      },
    },
  };
}

export function getReadyToOrderWithoutEmailValidationTemplate(
  numOptions: number,
  templateName: string,
  language: Language = "en",
): WhatsAppTemplateConfig {
  // The first two variables define the mode and the max num of orders and then 3 additional vars (short title, full title, desc) per options  => numOptions * 3 + 1

  const variables = buildReadyToOrderSampleVars(numOptions);

  const indiciesOfFullTitles = [],
    items = [];
  for (let i = 0; i < numOptions; i++) {
    indiciesOfFullTitles.push(`- {{${i * 3 + 2}}}`);
    items.push({
      item: `{{${i * 3 + 3}}}`,
      id: `${getOrderActionLabel(language)} {{${i * 3 + 2}}}`, // should be same as indiciesOfFullTitles because this will be send to the webhook
      description: `{{${i * 3 + 4}}}`,
    });
  }

  const body = `${getAvailableOptions(indiciesOfFullTitles, language)}\n${getSampleOrder(language)}${getOrderLimitationNote(language)}`;
  return {
    friendly_name: templateName,
    language: langCode(language),
    variables,
    types: {
      "twilio/list-picker": {
        body,
        items,
        button: getMoreDetailsButton(language),
      },
      "twilio/text": {
        body: body,
      },
    },
  };
}

export function getReadyToOrderLimitlessWithoutEmailValidationTemplate(
  numOptions: number,
  templateName: string,
  language: Language = "en",
): WhatsAppTemplateConfig {
  const variables = buildReadyToOrderLimitlessSampleVars(numOptions);

  const indiciesOfFullTitles = [],
    items = [];
  for (let i = 0; i < numOptions; i++) {
    indiciesOfFullTitles.push(`- {{${i * 3 + 2}}}`);
    items.push({
      item: `{{${i * 3 + 3}}}`,
      id: `${getOrderActionLabel(language)} {{${i * 3 + 2}}}`, // should be same as indiciesOfFullTitles because this will be send to the webhook
      description: `{{${i * 3 + 4}}}`,
    });
  }

  const body = `${getAvailableOptions(indiciesOfFullTitles, language)}\n${getSampleOrder(language)}`;

  return {
    friendly_name: templateName,
    language: langCode(language),
    variables,
    types: {
      "twilio/list-picker": {
        body,
        items,
        button: getMoreDetailsButton(language),
      },
      "twilio/text": {
        body: body,
      },
    },
  };
}

export function getEventRegistrationTemplate(
  numOptions: number,
  templateName: string,
  language: Language = "en",
): WhatsAppTemplateConfig {
  const variables = buildEventRegistrationSampleVars(numOptions);

  const indiciesOfFullTitles = [],
    actions = [];
  for (let i = 0; i < numOptions; i++) {
    indiciesOfFullTitles.push(`- {{${i * 2}}}`);
    actions.push({
      title: `{{${i * 2}}}`,
      id: `{{${i * 2 + 1}}}`,
    });
  }

  const body = language === "pt-BR"
    ? `Em qual evento você está? Por favor, responda com o nome do seu evento abaixo. ${getAvailableOptions(indiciesOfFullTitles, language)}`
    : language === "fr"
      ? `À quel événement êtes-vous actuellement\u00A0? Veuillez répondre avec le nom de votre événement ci-dessous. ${getAvailableOptions(indiciesOfFullTitles, language)}`
      : `Which event are you currently at? Please reply with the name of your event below. ${getAvailableOptions(indiciesOfFullTitles, language)}`;

  return {
    friendly_name: templateName,
    language: langCode(language),
    variables,
    types: {
      "twilio/quick-reply": {
        body,
        actions,
      },
      "twilio/text": {
        body: body,
      },
    },
  };
}

export function getOrderCancelledTemplate(
  templateName: string,
  language: Language = "en",
): WhatsAppTemplateConfig {
  const body = language === "pt-BR"
    ? "Seu pedido de {{0}} (*#{{1}}*) foi cancelado. Por favor, fale com nossa equipe se achar que algo está errado."
    : language === "fr"
      ? "Votre commande de {{0}} (*#{{1}}*) a été annulée. Veuillez vérifier auprès de notre équipe si vous pensez qu'il y a une erreur."
      : "Your {{0}} order (*#{{1}}*) has been cancelled. Please check with our staff if you think something is wrong.";

  return {
    friendly_name: templateName,
    language: langCode(language),
    variables: {
      "0": "order item",
      "1": "order number",
    },
    types: {
      "twilio/text": {
        body,
      },
    },
  };
}

export function getOrderReadyTemplate(
  templateName: string,
  language: Language = "en",
): WhatsAppTemplateConfig {
  const textBody = language === "pt-BR"
    ? "Seu {{1}} está pronto ☕\n\nApresente o número do pedido *{{2}}* ou seu nome no {{3}}. Aproveite sua bebida!"
    : language === "fr"
      ? "Votre {{1}} est prêt ☕\n\nPrésentez le numéro de commande *{{2}}* ou votre nom au {{3}}. Profitez de votre boisson\u00A0!"
      : "Your {{1}} is ready ☕\n\nPlease show order number *{{2}}* or your name at the {{3}}. Enjoy your drink!";

  // Plain text only. Twilio rejects every send of a card template that has no
  // buttons ("Content Variables parameter is invalid", error 21656), with
  // any values, while text templates are accepted.
  return {
    friendly_name: templateName,
    language: langCode(language),
    // Numbered from 1, as Twilio's content docs describe.
    variables: {
      "1": "order item",
      "2": "order number",
      "3": "order pickup location",
    },
    types: {
      "twilio/text": {
        body: textBody,
      },
    },
  };
}

/**
 * A WhatsApp list picker with `numOptions` rows, used by the cafe flow for the
 * coffee, add-on and extra menus. Variables: {{1}} is the message above the
 * list; row i uses {{3i+1}} title, {{3i+2}} id (sent back to us) and {{3i+3}}
 * description. WhatsApp allows 1 to 10 rows. Only works inside the 24-hour
 * session, which is where the flow runs; there is no approval step.
 */
export function getCafeListTemplate(
  numOptions: number,
  templateName: string,
): WhatsAppTemplateConfig {
  const variables: Record<string, string> = { "1": "Choose from the list" };
  const items = [];
  for (let i = 0; i < numOptions; i++) {
    variables[String(i * 3 + 2)] = `Item ${i + 1}`;
    variables[String(i * 3 + 3)] = String(i + 1);
    variables[String(i * 3 + 4)] = "Description";
    items.push({
      item: `{{${i * 3 + 2}}}`,
      id: `{{${i * 3 + 3}}}`,
      description: `{{${i * 3 + 4}}}`,
    });
  }
  return {
    friendly_name: templateName,
    language: "en",
    variables,
    types: {
      "twilio/list-picker": {
        body: "{{1}}",
        items,
        button: "Choose",
      },
      "twilio/text": {
        body: "{{1}}",
      },
    },
  };
}

export function getOrderReminderTemplate(
  templateName: string,
  language: Language = "en",
): WhatsAppTemplateConfig {
  const body = language === "pt-BR"
    ? "Ei! Não esqueça seu {{1}}. Você pode pular a fila e retirá-lo em {{3}}. \n\nPeça pelo número do pedido #{{2}} ao retirar."
    : language === "fr"
      ? "Coucou\u00A0! N'oubliez pas votre {{1}}. Vous pouvez éviter la file d'attente et le récupérer au {{3}}. \n\nDemandez le numéro de commande #{{2}} lors du retrait."
      : "Heya! Don't forget your {{1}}. You can skip the queue and collect it at {{3}}. \n\nAsk for order number #{{2}} when you pick it up.";

  return {
    friendly_name: templateName,
    language: langCode(language),
    variables: {
      "1": "order item",
      "2": "order number",
      "3": "order pickup location",
    },
    types: {
      "twilio/text": {
        body,
      },
    },
  };
}

export interface WhatsAppTemplateConfig {
  friendly_name: string;
  language: string;
  variables: Record<string, string>;
  types: {
    "whatsapp/card"?: {
      body: string;
      footer?: string;
      header_text?: string;
      media?: string[];
      actions?: Array<{
        type: "url" | "postback";
        text: string;
        url?: string;
        postback_data?: string;
      }>;
    };
    "twilio/list-picker"?: {
      body: string;
      items: Array<{
        item: string;
        id: string;
        description: string;
      }>;
      button: string;
    };
    "twilio/text": {
      body: string;
    };
    "twilio/quick-reply"?: {
      body: string;
      actions: Array<{
        title: string;
        id: string;
      }>;
    };
    "twilio/card"?: {
      title?: string;
      media?: string[];
      body: string;
      orientation?: "HORIZONTAL" | "VERTICAL";
    };
  };
  links?: {
    approval_fetch: string;
    approval_create: string;
  };
}

export interface WhatsAppTemplate extends WhatsAppTemplateConfig {
  date_updated: string;
  account_sid: string;
  url: string;
  sid: string;
  date_created: string;
  links: {
    approval_fetch: string;
    approval_create: string;
  };
}
