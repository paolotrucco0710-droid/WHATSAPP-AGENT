import type { Db } from "../db/index.js";
import type { MessageSender } from "../messaging/types.js";
import {
  resetConversationState,
  setConversationState,
} from "../services/conversation.js";
import {
  buildFillSlotPlan,
  formatBriefingItemMessage,
  formatFillSlotClientPreview,
  formatFillSlotMessage,
} from "../services/briefing.js";
import { resolveDate } from "../core/dates.js";
import type { BriefingFlowContext } from "../types/briefing.js";
import { barbers } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { isRejection } from "../core/confirmations.js";
import { parseBriefingContext } from "./briefing-flow.js";

async function reply(
  sender: MessageSender,
  barberPhone: string,
  text: string,
  waMeLink?: string,
) {
  await sender.send(barberPhone, { text, waMeLink });
}

function parseSelectionNumber(text: string): number | null {
  const match = text.trim().match(/^(\d+)$/);
  if (!match?.[1]) return null;
  return Number(match[1]);
}

function isSendAllRequest(text: string): boolean {
  return /^(scrivi|manda|invia)\s+a\s+tutti$/i.test(text.trim());
}

function isFillSlotContext(context: BriefingFlowContext): boolean {
  return (
    context.plan.items.length > 0 &&
    context.plan.items.every((i) => i.category === "slot_fill")
  );
}

export async function startFillSlot(
  db: Db,
  sender: MessageSender,
  barberId: number,
  barberPhone: string,
  dateInput = "oggi",
  preferredTime?: string,
) {
  const [barber] = await db
    .select()
    .from(barbers)
    .where(eq(barbers.id, barberId))
    .limit(1);

  if (!barber) return;

  const { slotTime, clients, items } = await buildFillSlotPlan(
    db,
    barberId,
    barber.averageTime,
    barber.averagePrice,
    dateInput,
    preferredTime,
  );

  await reply(
    sender,
    barberPhone,
    formatFillSlotMessage(slotTime, clients, barber.averagePrice),
  );

  if (items.length === 0) return;

  const plan = {
    date: resolveDate(dateInput),
    estimatedEarnings: items.length * barber.averagePrice,
    averagePrice: barber.averagePrice,
    items,
    recoveryCount: 0,
    noshowCount: 0,
    slotCount: slotTime ? 1 : 0,
    appointmentCount: 0,
    gapCount: slotTime ? 1 : 0,
    gapTimes: slotTime ? [slotTime] : [],
    occupationPct: 0,
    expectedRevenue: 0,
    lostRevenue: slotTime ? barber.averagePrice : 0,
    recommendations: [],
    tomorrowAppointments: [],
  };

  const context: BriefingFlowContext = {
    plan,
    step: "pick_client",
  };

  await setConversationState(db, barberId, "awaiting_briefing", context);
}

export async function handleFillSlotInBriefing(
  db: Db,
  sender: MessageSender,
  barberId: number,
  barberPhone: string,
  text: string,
  rawContext: string | null,
): Promise<boolean> {
  const context = parseBriefingContext(rawContext);
  if (!context || !isFillSlotContext(context)) {
    return false;
  }

  if (isRejection(text)) {
    await resetConversationState(db, barberId);
    await reply(sender, barberPhone, "👍 Ok, annullato.");
    return true;
  }

  if (isSendAllRequest(text)) {
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
      "✅ Link pronti per tutti. Tocca ogni link per inviare su WhatsApp.",
    );
    return true;
  }

  const choice = parseSelectionNumber(text);
  if (choice && choice >= 1 && choice <= context.plan.items.length) {
    const item = context.plan.items[choice - 1]!;
    await reply(
      sender,
      barberPhone,
      formatFillSlotClientPreview(item),
      item.waMeLink,
    );
    await resetConversationState(db, barberId);
    await reply(
      sender,
      barberPhone,
      "✅ Tocca il link per aprire WhatsApp e inviare.",
    );
    return true;
  }

  if (context.step === "pick_client") {
    await reply(
      sender,
      barberPhone,
      `Rispondi con un numero da 1 a ${context.plan.items.length}, "scrivi a tutti", o Annulla.`,
    );
    return true;
  }

  return false;
}
