import type { Db } from "../db/index.js";
import type { MessageSender } from "../messaging/types.js";
import { parseNaturalLanguage } from "../llm/parser.js";
import { findOrCreateBarber } from "../services/barber.js";
import { findClientsByName, findClientByPhone, findClientById } from "../services/clients.js";
import {
  getConversationState,
  isConversationExpired,
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
import { getInstantResponse } from "../services/responses.js";
import { checkDuplicateAppointment } from "../services/validation.js";
import {
  formatAgendaMessage,
  getAgendaForDate,
} from "../services/agenda.js";
import type { InboundMessage } from "../messaging/inbound.js";
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

function isAmbiguous(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(forse|boh|non\s+so|vediamo)\.?$/i.test(t);
}

function parseSelectionNumber(text: string): number | null {
  const match = text.trim().match(/^(\d+)$/);
  if (!match?.[1]) return null;
  return Number(match[1]);
}

function needsClientResolution(
  action: FlexiAction,
): action is FlexiAction & { clientName: string } {
  return (
    action.type === "create_appointment" ||
    action.type === "reschedule_appointment" ||
    action.type === "cancel_appointment" ||
    action.type === "set_reminder" ||
    action.type === "complete_appointment"
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

export async function processInbound(
  db: Db,
  sender: MessageSender,
  inbound: InboundMessage,
): Promise<void> {
  const barber = await findOrCreateBarber(db, inbound.barberPhone);
  let state = await getConversationState(db, barber.id);

  if (
    state &&
    state.state !== "idle" &&
    isConversationExpired(state.updatedAt)
  ) {
    await resetConversationState(db, barber.id);
    state = null;
  } else if (state?.state === "awaiting_confirmation" && inbound.text) {
    await handleConfirmation(
      db,
      sender,
      barber.id,
      inbound.barberPhone,
      inbound.text,
      state.context,
    );
    return;
  } else if (state?.state === "awaiting_client_selection" && inbound.text) {
    await handleClientSelection(
      db,
      sender,
      barber.id,
      inbound.barberPhone,
      inbound.text,
      state.context,
    );
    return;
  }

  if (inbound.contact) {
    await handleSharedContact(
      db,
      sender,
      barber.id,
      inbound.barberPhone,
      inbound.contact,
    );
    return;
  }

  if (inbound.text) {
    await handleNewMessage(
      db,
      sender,
      barber.id,
      inbound.barberPhone,
      inbound.text,
    );
  }
}

export async function processMessage(
  db: Db,
  sender: MessageSender,
  barberPhone: string,
  text: string,
): Promise<void> {
  await processInbound(db, sender, { barberPhone, text });
}

async function handleSharedContact(
  db: Db,
  sender: MessageSender,
  barberId: number,
  barberPhone: string,
  contact: { name: string; phone: string },
) {
  const existing = await findClientByPhone(db, barberId, contact.phone);
  if (existing) {
    await reply(
      sender,
      barberPhone,
      `⚠️ Questo contatto è già in rubrica come ${existing.name}.`,
    );
    return;
  }

  const action = {
    type: "create_client" as const,
    clientName: contact.name,
    phone: contact.phone,
  };
  const summary = [
    "Ho ricevuto il contatto:",
    "",
    `• Nome: ${contact.name}`,
    "",
    "Confermi di aggiungerlo in rubrica?",
  ].join("\n");

  const pending: PendingConfirmationContext = { action, summary };
  await setConversationState(db, barberId, "awaiting_confirmation", pending);
  await reply(sender, barberPhone, summary);
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

  if (isAmbiguous(text) || !isConfirmation(text)) {
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
  let message = result.message;
  if (context.action.type === "complete_appointment" && context.resolvedClientId) {
    const client = await findClientById(db, context.resolvedClientId);
    if (client) {
      message += `\n\nProssimo richiamo indicativo: tra 5 settimane.\nScrivi "Ricordami ${client.name} tra 5 settimane" per un promemoria.`;
    }
  }
  await reply(sender, barberPhone, message, result.waMeLink);
}

async function handleClientSelection(
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
      `Rispondi con un numero da 1 a ${context.candidates.length}, oppure Annulla.`,
    );
    return;
  }

  const selected = context.candidates[choice - 1]!;
  await proceedToConfirmation(
    db,
    sender,
    barberId,
    barberPhone,
    context.action,
    selected.id,
    selected.displayName,
  );
}

async function proceedToConfirmation(
  db: Db,
  sender: MessageSender,
  barberId: number,
  barberPhone: string,
  action: FlexiAction,
  resolvedClientId: number,
  clientDisplayName: string,
) {
  if (action.type === "create_appointment") {
    const duplicateMsg = await checkDuplicateAppointment(
      db,
      barberId,
      resolvedClientId,
      action,
    );
    if (duplicateMsg) {
      await reply(sender, barberPhone, duplicateMsg);
      return;
    }
  }

  const summary = buildActionSummary(action, clientDisplayName);
  const pending: PendingConfirmationContext = {
    action,
    resolvedClientId,
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

  if (action.type === "view_agenda") {
    const items = await getAgendaForDate(db, barberId, action.date);
    await reply(sender, barberPhone, formatAgendaMessage(action.date, items));
    return;
  }

  const instant = getInstantResponse(action);
  if (instant !== null) {
    await reply(sender, barberPhone, instant);
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
    const existing = await findClientByPhone(db, barberId, action.phone);
    if (existing) {
      await reply(
        sender,
        barberPhone,
        `⚠️ Questo numero è già in rubrica come ${existing.name}. Non l'ho duplicato.`,
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

  const clientName = action.clientName;
  const candidates = await findClientsByName(db, barberId, clientName);

  if (candidates.length === 0) {
    await reply(
      sender,
      barberPhone,
      `Non trovo ${clientName} in rubrica.\n\nÈ un cliente nuovo? Condividimi il suo contatto WhatsApp per aggiungerlo.`,
    );
    return;
  }

  if (candidates.length === 1) {
    const client = candidates[0]!;
    await proceedToConfirmation(
      db,
      sender,
      barberId,
      barberPhone,
      action,
      client.id,
      client.name,
    );
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
