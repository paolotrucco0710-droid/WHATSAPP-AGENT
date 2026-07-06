import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { appointments } from "../db/schema.js";
import { formatDisplayDate } from "../core/dates.js";
import {
  buildBriefingWaMeLink,
  recoveryMessage,
} from "../messaging/templates.js";

export function getRecoveryWeeks(): number {
  return Number(process.env.BRIEFING_RECOVERY_WEEKS ?? 5);
}

export async function findLastCompletedAppointment(
  db: Db,
  barberId: number,
  clientId: number,
) {
  const [appointment] = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.barberId, barberId),
        eq(appointments.clientId, clientId),
        eq(appointments.status, "completed"),
      ),
    )
    .orderBy(desc(appointments.startsAt))
    .limit(1);
  return appointment ?? null;
}

function weeksBetween(pastIso: string, todayIso: string): number {
  const past = Date.parse(`${pastIso}T12:00:00`);
  const today = Date.parse(`${todayIso}T12:00:00`);
  return Math.max(0, Math.floor((today - past) / (7 * 24 * 60 * 60 * 1000)));
}

export function formatAutoRecallMessage(): string {
  const weeks = getRecoveryWeeks();
  return `\n\n📅 Richiamo automatico attivo: tra ~${weeks} settimane lo vedrai in azioni.`;
}

export interface RecallStatusResult {
  message: string;
  waMeLink?: string;
}

export async function handleRecallRequest(
  db: Db,
  barberId: number,
  clientId: number,
  clientName: string,
  clientPhone: string,
): Promise<RecallStatusResult> {
  const last = await findLastCompletedAppointment(db, barberId, clientId);
  if (!last) {
    return {
      message: `Non ho ancora un appuntamento completato per ${clientName}.\n\nSegnalo come fatto dopo il taglio e il richiamo parte da solo.`,
    };
  }

  const lastDate = last.startsAt.split("T")[0]!;
  const todayIso = new Date().toISOString().split("T")[0]!;
  const weeksSince = weeksBetween(lastDate, todayIso);
  const recoveryWeeks = getRecoveryWeeks();

  if (weeksSince >= recoveryWeeks) {
    const msg = recoveryMessage(clientName, weeksSince);
    return {
      message: `📲 Messaggio di richiamo pronto per ${clientName}.\n\nTocca il link per inviare.`,
      waMeLink: buildBriefingWaMeLink(clientPhone, msg),
    };
  }

  const weeksLeft = recoveryWeeks - weeksSince;
  const weekLabel = weeksLeft === 1 ? "settimana" : "settimane";
  return {
    message: `📅 Richiamo già attivo per ${clientName} (ultimo taglio: ${formatDisplayDate(lastDate)}).\n\nTra ~${weeksLeft} ${weekLabel} comparirà in azioni — niente da fare ora.`,
  };
}
