import type { Db } from "../db/index.js";
import type { MessageSender } from "../messaging/types.js";
import {
  resetConversationState,
  setConversationState,
} from "../services/conversation.js";
import {
  buildBriefingPlan,
  formatBriefingItemMessage,
  formatMorningReport,
  formatCategoryMenu,
  formatClientMenu,
  getCategoryFromMenuChoice,
  getItemsForCategory,
} from "../services/briefing.js";
import { buildBriefingWaMeLink } from "../messaging/templates.js";
import type { BriefingFlowContext } from "../types/briefing.js";
import { briefingFlowContextSchema } from "../types/briefing.js";
import { barbers } from "../db/schema.js";
import { eq } from "drizzle-orm";

import {
  isConfirmation,
  isModifyRequest,
  isRejection,
} from "../core/confirmations.js";

function parseSelectionNumber(text: string): number | null {
  const match = text.trim().match(/^(\d+)$/);
  if (!match?.[1]) return null;
  return Number(match[1]);
}

async function reply(
  sender: MessageSender,
  barberPhone: string,
  text: string,
  waMeLink?: string,
) {
  await sender.send(barberPhone, { text, waMeLink });
}

export function parseBriefingContext(
  raw: string | null,
): BriefingFlowContext | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const result = briefingFlowContextSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function startDailyBriefing(
  db: Db,
  sender: MessageSender,
  barberId: number,
  barberPhone: string,
  dateInput = "oggi",
) {
  const [barber] = await db
    .select()
    .from(barbers)
    .where(eq(barbers.id, barberId))
    .limit(1);

  if (!barber) return;

  const plan = await buildBriefingPlan(
    db,
    barberId,
    barber.averageTime,
    dateInput,
  );

  if (plan.items.length === 0) {
    await reply(sender, barberPhone, formatMorningReport(plan, barber.name));
    return;
  }

  const context: BriefingFlowContext = {
    plan,
    step: "confirm",
  };

  await setConversationState(db, barberId, "awaiting_briefing", context);
  await reply(sender, barberPhone, formatMorningReport(plan, barber.name));
}

export async function handleBriefingFlow(
  db: Db,
  sender: MessageSender,
  barberId: number,
  barberPhone: string,
  text: string,
  rawContext: string | null,
) {
  const context = parseBriefingContext(rawContext);
  if (!context) {
    await resetConversationState(db, barberId);
    await reply(sender, barberPhone, "Sessione scaduta. Scrivi piano oggi.");
    return;
  }

  if (isRejection(text)) {
    await resetConversationState(db, barberId);
    await reply(sender, barberPhone, "👍 Ok, annullato.");
    return;
  }

  switch (context.step) {
    case "confirm":
      await handleBriefingConfirm(db, sender, barberId, barberPhone, text, context);
      break;
    case "modify_category":
      await handleModifyCategory(db, sender, barberId, barberPhone, text, context);
      break;
    case "modify_client":
      await handleModifyClient(db, sender, barberId, barberPhone, text, context);
      break;
    case "modify_text":
      await handleModifyText(db, sender, barberId, barberPhone, text, context);
      break;
  }
}

async function handleBriefingConfirm(
  db: Db,
  sender: MessageSender,
  barberId: number,
  barberPhone: string,
  text: string,
  context: BriefingFlowContext,
) {
  if (isModifyRequest(text)) {
    context.step = "modify_category";
    await setConversationState(db, barberId, "awaiting_briefing", context);
    await reply(sender, barberPhone, formatCategoryMenu(context.plan));
    return;
  }

  if (!isConfirmation(text)) {
    await reply(
      sender,
      barberPhone,
      "Rispondi OK per i link pronti, MODIFICA per cambiare un messaggio, o No per annullare.",
    );
    return;
  }

  for (const item of context.plan.items) {
    await reply(
      sender,
      barberPhone,
      formatBriefingItemMessage(item),
      item.waMeLink,
    );
  }

  await resetConversationState(db, barberId);
  await reply(
    sender,
    barberPhone,
    "✅ Link pronti. Tocca ogni link per aprire WhatsApp e inviare.\n\nFlexi non invia nulla in automatico.",
  );
}

async function handleModifyCategory(
  db: Db,
  sender: MessageSender,
  barberId: number,
  barberPhone: string,
  text: string,
  context: BriefingFlowContext,
) {
  const choice = parseSelectionNumber(text);
  if (!choice) {
    await reply(sender, barberPhone, "Rispondi con il numero della categoria.");
    return;
  }

  const category = getCategoryFromMenuChoice(context.plan, choice);
  if (!category) {
    await reply(sender, barberPhone, "Numero non valido. Riprova.");
    return;
  }

  const items = getItemsForCategory(context.plan, category);
  if (items.length === 0) {
    await reply(sender, barberPhone, "Nessun messaggio in questa categoria.");
    return;
  }

  if (items.length === 1) {
    context.step = "modify_text";
    context.selectedCategory = category;
    context.selectedItemId = items[0]!.id;
    await setConversationState(db, barberId, "awaiting_briefing", context);
    await reply(
      sender,
      barberPhone,
      [
        `Messaggio per ${items[0]!.clientName}:`,
        "",
        `"${items[0]!.messageText}"`,
        "",
        "Scrivi il nuovo testo oppure OK per confermare.",
      ].join("\n"),
    );
    return;
  }

  context.step = "modify_client";
  context.selectedCategory = category;
  await setConversationState(db, barberId, "awaiting_briefing", context);
  await reply(sender, barberPhone, formatClientMenu(items));
}

async function handleModifyClient(
  db: Db,
  sender: MessageSender,
  barberId: number,
  barberPhone: string,
  text: string,
  context: BriefingFlowContext,
) {
  if (!context.selectedCategory) {
    await resetConversationState(db, barberId);
    return;
  }

  const choice = parseSelectionNumber(text);
  if (!choice) {
    await reply(sender, barberPhone, "Rispondi con il numero del cliente.");
    return;
  }

  const items = getItemsForCategory(context.plan, context.selectedCategory);
  const item = items[choice - 1];
  if (!item) {
    await reply(sender, barberPhone, "Numero non valido. Riprova.");
    return;
  }

  context.step = "modify_text";
  context.selectedItemId = item.id;
  await setConversationState(db, barberId, "awaiting_briefing", context);
  await reply(
    sender,
    barberPhone,
    [
      `Messaggio per ${item.clientName}:`,
      "",
      `"${item.messageText}"`,
      "",
      "Scrivi il nuovo testo oppure OK per confermare.",
    ].join("\n"),
  );
}

async function handleModifyText(
  db: Db,
  sender: MessageSender,
  barberId: number,
  barberPhone: string,
  text: string,
  context: BriefingFlowContext,
) {
  const item = context.plan.items.find((i) => i.id === context.selectedItemId);
  if (!item) {
    await resetConversationState(db, barberId);
    await reply(sender, barberPhone, "Sessione scaduta. Scrivi piano oggi.");
    return;
  }

  if (!isConfirmation(text)) {
    item.messageText = text.trim();
    item.waMeLink = buildBriefingWaMeLink(item.clientPhone, item.messageText);
    context.step = "confirm";
    context.selectedCategory = undefined;
    context.selectedItemId = undefined;
    await setConversationState(db, barberId, "awaiting_briefing", context);
    await reply(
      sender,
      barberPhone,
      [
        "✅ Messaggio aggiornato.",
        "",
        `"${item.messageText}"`,
        "",
        "Rispondi OK per i link, o MODIFICA per cambiarne un altro.",
      ].join("\n"),
    );
    return;
  }

  context.step = "confirm";
  context.selectedCategory = undefined;
  context.selectedItemId = undefined;
  await setConversationState(db, barberId, "awaiting_briefing", context);
  await reply(
    sender,
    barberPhone,
    "Messaggio confermato. Rispondi OK per i link o MODIFICA per cambiarne un altro.",
  );
}
