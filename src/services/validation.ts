import type { FlexiAction } from "../types/actions.js";
import type { Db } from "../db/index.js";
import { resolveDate, resolveTime, toStartsAt, formatDisplayDate } from "../core/dates.js";
import { findScheduledAppointmentAt } from "./appointments.js";
import { findClientById } from "./clients.js";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Valida e normalizza l'output LLM prima dell'uso. */
export function validateAndNormalizeAction(
  action: FlexiAction,
): FlexiAction {
  if (action.type === "create_appointment") {
    const date = resolveDate(action.date);
    const time = resolveTime(action.time);
    if (!DATE_RE.test(date) || !TIME_RE.test(time)) {
      return {
        type: "unknown",
        reason: "Non ho capito data o ora. Puoi ripetere?",
      };
    }
    return { ...action, date, time };
  }

  if (action.type === "reschedule_appointment") {
    const date = resolveDate(action.date);
    if (!DATE_RE.test(date)) {
      return {
        type: "unknown",
        reason: "Non ho capito la data. Puoi ripetere?",
      };
    }
    const time = action.time ? resolveTime(action.time) : undefined;
    if (time && !TIME_RE.test(time)) {
      return {
        type: "unknown",
        reason: "Non ho capito l'ora. Puoi ripetere?",
      };
    }
    return { ...action, date, time };
  }

  return action;
}

export async function checkDuplicateAppointment(
  db: Db,
  barberId: number,
  clientId: number,
  action: Extract<FlexiAction, { type: "create_appointment" }>,
): Promise<string | null> {
  const startsAt = toStartsAt(
    resolveDate(action.date),
    resolveTime(action.time),
  );
  const existing = await findScheduledAppointmentAt(
    db,
    barberId,
    clientId,
    startsAt,
  );
  if (!existing) return null;

  const client = await findClientById(db, clientId);
  const time = startsAt.split("T")[1]?.slice(0, 5) ?? "";
  const date = startsAt.split("T")[0] ?? "";
  return `⚠️ Esiste già un appuntamento per ${client?.name ?? action.clientName} ${formatDisplayDate(date)} alle ${time}.\n\nNon l'ho duplicato.`;
}
