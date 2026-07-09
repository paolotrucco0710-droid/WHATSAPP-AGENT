import type { Db } from "../db/index.js";
import type { MessageSender } from "../messaging/types.js";
import { parseNaturalLanguage } from "../llm/parser.js";
import { findOrCreateBarber } from "../services/barber.js";
import { isBarberAllowed } from "../services/barber-access.js";
import { findClientsByName, findClientByPhone } from "../services/clients.js";
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
  formatAgendaFromEntries,
  formatWeekAgendaMessage,
  getAgendaWithGaps,
  getAgendaForWeek,
} from "../services/agenda.js";
import { isWeekAgendaDate } from "../core/dates.js";
import { getDayStats } from "../services/day-stats.js";
import { startDailyBriefing, handleBriefingFlow } from "../core/briefing-flow.js";
import { startFillSlot } from "../core/fill-slot-flow.js";
import {
  isAmbiguous,
  isConfirmation,
  isModifyRequest,
  isRejection,
  MODIFY_OUT_OF_CONTEXT_MESSAGE,
} from "../core/confirmations.js";
import { barbers } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { InboundMessage } from "../messaging/inbound.js";
import type { FlexiAction } from "../types/actions.js";
import type {
  ClientSelectionContext,
  PendingConfirmationContext,
} from "../types/actions.js";

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
  if (!isBarberAllowed(inbound.barberPhone)) {
    await reply(
      sender,
      inbound.barberPhone,
      "Flexi non è ancora attivo per questo numero. Contatta chi ti ha dato il contatto.",
    );
    return;
  }

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
  } else if (state?.state === "awaiting_briefing" && inbound.text) {
    await handleBriefingFlow(
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
    "📇 Ho ricevuto il contatto:",
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
    await reply(sender, barberPhone, "👍 Ok, annullato.");
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
  if (isRejection(text)) {
    await resetConversationState(db, barberId);
    await reply(sender, barberPhone, "👍 Ok, annullato.");
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
  if (context.action.type === "set_reminder") {
    await executeClientAction(
      db,
      sender,
      barberId,
      barberPhone,
      context.action,
      selected.id,
    );
    return;
  }
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

function skipsConfirmation(action: FlexiAction): boolean {
  return action.type === "set_reminder";
}

async function executeClientAction(
  db: Db,
  sender: MessageSender,
  barberId: number,
  barberPhone: string,
  action: FlexiAction,
  resolvedClientId: number,
) {
  await resetConversationState(db, barberId);
  const result = await executeAction(db, barberId, action, resolvedClientId);
  await reply(sender, barberPhone, result.message, result.waMeLink);
}

async function handleNewMessage(
  db: Db,
  sender: MessageSender,
  barberId: number,
  barberPhone: string,
  text: string,
) {
  if (isModifyRequest(text)) {
    await reply(sender, barberPhone, MODIFY_OUT_OF_CONTEXT_MESSAGE);
    return;
  }

  const action = await parseNaturalLanguage(text);

  if (action.type === "daily_briefing") {
    await startDailyBriefing(db, sender, barberId, barberPhone, action.date);
    return;
  }

  if (action.type === "fill_slot") {
    await startFillSlot(
      db,
      sender,
      barberId,
      barberPhone,
      action.date,
      action.time,
    );
    return;
  }

  if (action.type === "view_agenda") {
    const [barber] = await db
      .select()
      .from(barbers)
      .where(eq(barbers.id, barberId))
      .limit(1);
    const averageTime = barber?.averageTime ?? 30;
    const averagePrice = barber?.averagePrice ?? 25;

    if (isWeekAgendaDate(action.date)) {
      const week = await getAgendaForWeek(db, barberId, averageTime);
      await reply(sender, barberPhone, formatWeekAgendaMessage(week));
      return;
    }

    const entries = await getAgendaWithGaps(
      db,
      barberId,
      action.date,
      averageTime,
    );
    const stats = await getDayStats(
      db,
      barberId,
      action.date,
      averageTime,
      averagePrice,
    );
    await reply(
      sender,
      barberPhone,
      formatAgendaFromEntries(action.date, entries, stats),
    );
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
    if (skipsConfirmation(action)) {
      await executeClientAction(
        db,
        sender,
        barberId,
        barberPhone,
        action,
        client.id,
      );
    } else {
      await proceedToConfirmation(
        db,
        sender,
        barberId,
        barberPhone,
        action,
        client.id,
        client.name,
      );
    }
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
