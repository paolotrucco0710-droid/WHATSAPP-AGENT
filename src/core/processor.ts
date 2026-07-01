import type { Db } from "../db/index.js";
import type { MessageSender } from "../messaging/types.js";
import { parseNaturalLanguage } from "../llm/parser.js";
import { findOrCreateBarber } from "../services/barber.js";
import { findClientsByName } from "../services/clients.js";
import {
  getConversationState,
  parsePendingContext,
  parseSelectionContext,
  resetConversationState,
  setConversationState,
} from "../services/conversation.js";
import { executeAction } from "../services/actions.js";
import {
  buildActionSummary,
  buildClientSelectionMessage,
} from "../services/summary.js";
import type { FlexiAction } from "../types/actions.js";
import type {
  ClientSelectionContext,
  PendingConfirmationContext,
} from "../types/actions.js";

function isConfirmation(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(s[iì]|ok|confermo|conferma|vai|yes|certo|esatto)\.?$/i.test(t);
}

function isRejection(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(no|annulla|annullato|nop|nope)\.?$/i.test(t);
}

function parseSelectionNumber(text: string): number | null {
  const match = text.trim().match(/^(\d+)$/);
  if (!match?.[1]) return null;
  return Number(match[1]);
}

function needsClientResolution(action: FlexiAction): boolean {
  return (
    action.type === "create_appointment" ||
    action.type === "reschedule_appointment" ||
    action.type === "cancel_appointment" ||
    action.type === "set_reminder"
  );
}

async function reply(
  sender: MessageSender,
  barberPhone: string,
  text: string,
  waMeLink?: string,
) {
  await sender.send(barberPhone, { text, waMeLink });
}

export async function processMessage(
  db: Db,
  sender: MessageSender,
  barberPhone: string,
  text: string,
): Promise<void> {
  const barber = await findOrCreateBarber(db, barberPhone);
  const state = await getConversationState(db, barber.id);

  if (state?.state === "awaiting_confirmation") {
    await handleConfirmation(db, sender, barber.id, barberPhone, text, state.context);
    return;
  }

  if (state?.state === "awaiting_client_selection") {
    await handleClientSelection(db, sender, barber.id, barberPhone, text, state.context);
    return;
  }

  await handleNewMessage(db, sender, barber.id, barberPhone, text);
}

async function handleConfirmation(
  db: Db,
  sender: MessageSender,
  barberId: number,
  barberPhone: string,
  text: string,
  rawContext: string | null,
) {
  if (isRejection(text)) {
    await resetConversationState(db, barberId);
    await reply(sender, barberPhone, "Ok, annullato.");
    return;
  }

  if (!isConfirmation(text)) {
    await reply(
      sender,
      barberPhone,
      "Rispondi Confermi o No per procedere.",
    );
    return;
  }

  const context = parsePendingContext(rawContext);
  if (!context) {
    await resetConversationState(db, barberId);
    await reply(sender, barberPhone, "Sessione scaduta. Ripeti la richiesta.");
    return;
  }

  const result = await executeAction(
    db,
    barberId,
    context.action,
    context.resolvedClientId,
  );
  await resetConversationState(db, barberId);
  await reply(sender, barberPhone, result.message, result.waMeLink);
}

async function handleClientSelection(
  db: Db,
  sender: MessageSender,
  barberId: number,
  barberPhone: string,
  text: string,
  rawContext: string | null,
) {
  const context = parseSelectionContext(rawContext);
  if (!context) {
    await resetConversationState(db, barberId);
    await reply(sender, barberPhone, "Sessione scaduta. Ripeti la richiesta.");
    return;
  }

  const choice = parseSelectionNumber(text);
  if (!choice || choice < 1 || choice > context.candidates.length) {
    await reply(
      sender,
      barberPhone,
      `Rispondi con un numero da 1 a ${context.candidates.length}.`,
    );
    return;
  }

  const selected = context.candidates[choice - 1]!;
  const summary = buildActionSummary(context.action, selected.displayName);

  const pending: PendingConfirmationContext = {
    action: context.action,
    resolvedClientId: selected.id,
    summary,
  };

  await setConversationState(db, barberId, "awaiting_confirmation", pending);
  await reply(sender, barberPhone, summary);
}

async function handleNewMessage(
  db: Db,
  sender: MessageSender,
  barberId: number,
  barberPhone: string,
  text: string,
) {
  const action = await parseNaturalLanguage(text);

  if (action.type === "unknown") {
    await reply(
      sender,
      barberPhone,
      action.reason ?? "Non ho capito. Puoi ripetere?",
    );
    return;
  }

  if (action.type === "create_client") {
    if (!action.phone) {
      await reply(
        sender,
        barberPhone,
        "Per aggiungere un cliente, condividimi il suo contatto WhatsApp.\n\nIn alternativa scrivi: Nuovo cliente Andrea +393331234567",
      );
      return;
    }
    const summary = buildActionSummary(action);
    const pending: PendingConfirmationContext = { action, summary };
    await setConversationState(db, barberId, "awaiting_confirmation", pending);
    await reply(sender, barberPhone, summary);
    return;
  }

  if (!needsClientResolution(action)) {
    return;
  }

  const candidates = await findClientsByName(db, barberId, action.clientName);

  if (candidates.length === 0) {
    await reply(
      sender,
      barberPhone,
      `Non trovo ${action.clientName} in rubrica.\n\nÈ un cliente nuovo? Condividimi il suo contatto WhatsApp per aggiungerlo.`,
    );
    return;
  }

  if (candidates.length === 1) {
    const client = candidates[0]!;
    const summary = buildActionSummary(action, client.name);
    const pending: PendingConfirmationContext = {
      action,
      resolvedClientId: client.id,
      summary,
    };
    await setConversationState(db, barberId, "awaiting_confirmation", pending);
    await reply(sender, barberPhone, summary);
    return;
  }

  const selection: ClientSelectionContext = {
    action,
    candidates: candidates.map((c) => ({
      id: c.id,
      displayName: c.name,
    })),
  };

  await setConversationState(
    db,
    barberId,
    "awaiting_client_selection",
    selection,
  );
  await reply(sender, barberPhone, buildClientSelectionMessage(selection));
}
