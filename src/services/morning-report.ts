import type { Db } from "../db/index.js";
import type { MessageSender } from "../messaging/types.js";
import { barbers } from "../db/schema.js";
import { isBarberAllowed } from "./barber-access.js";
import {
  resetConversationState,
  setConversationState,
} from "./conversation.js";
import { buildBriefingPlan, formatMorningReport } from "./briefing.js";

export function barberFirstName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

export async function deliverMorningReport(
  db: Db,
  sender: MessageSender,
  barber: {
    id: number;
    phone: string;
    name: string | null;
    averageTime: number;
    averagePrice: number;
  },
): Promise<boolean> {
  if (!isBarberAllowed(barber.phone)) return false;

  const plan = await buildBriefingPlan(
    db,
    barber.id,
    barber.averageTime,
    "oggi",
    barber.averagePrice,
  );
  const message = formatMorningReport(plan, barberFirstName(barber.name));

  if (plan.items.length > 0) {
    await setConversationState(db, barber.id, "awaiting_briefing", {
      plan,
      step: "confirm",
    });
  } else {
    await resetConversationState(db, barber.id);
  }

  await sender.send(barber.phone, { text: message });
  return true;
}

export async function deliverMorningReportsToAll(
  db: Db,
  sender: MessageSender,
): Promise<number> {
  const allBarbers = await db.select().from(barbers);
  let sent = 0;

  for (const barber of allBarbers) {
    try {
      if (await deliverMorningReport(db, sender, barber)) {
        sent++;
        console.log(`[morning] Report inviato a ${barber.phone}`);
      }
    } catch (err) {
      console.error(`[morning] Errore per ${barber.phone}:`, err);
    }
  }

  console.log(`[morning] Totale report inviati: ${sent}/${allBarbers.length}`);
  return sent;
}
