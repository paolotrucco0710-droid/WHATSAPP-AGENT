import type { Db } from "../db/index.js";
import type { FlexiAction } from "../types/actions.js";
import {
  cancelAppointment,
  completeAppointment,
  createAppointment,
  findAppointmentToComplete,
  findNextScheduledAppointment,
  rescheduleAppointment,
} from "./appointments.js";
import { createClient, findClientById } from "./clients.js";
import { sendReminder } from "../messaging/reminder.js";
import {
  resolveDate,
  resolveTime,
  toStartsAt,
  formatDisplayDate,
} from "../core/dates.js";
import { barbers } from "../db/schema.js";
import { eq } from "drizzle-orm";

export interface ExecuteResult {
  message: string;
  waMeLink?: string;
}

export async function executeAction(
  db: Db,
  barberId: number,
  action: FlexiAction,
  resolvedClientId?: number,
): Promise<ExecuteResult> {
  const [barber] = await db
    .select()
    .from(barbers)
    .where(eq(barbers.id, barberId))
    .limit(1);

  if (!barber) {
    return { message: "Errore interno. Riprova." };
  }

  switch (action.type) {
    case "create_client": {
      if (!action.phone) {
        return {
          message:
            "Per aggiungere un cliente nuovo, condividimi il suo contatto WhatsApp.",
        };
      }
      await createClient(db, barberId, action.clientName, action.phone);
      return { message: `✅ Cliente ${action.clientName} aggiunto.` };
    }

    case "create_appointment": {
      if (!resolvedClientId) {
        return { message: "Cliente non trovato." };
      }
      const date = resolveDate(action.date);
      const time = resolveTime(action.time);
      await createAppointment(db, {
        barberId,
        clientId: resolvedClientId,
        startsAt: toStartsAt(date, time),
        durationMinutes: barber.averageTime,
      });
      const client = await findClientById(db, resolvedClientId);
      return {
        message: `✅ Appuntamento salvato per ${client?.name ?? action.clientName}.`,
      };
    }

    case "reschedule_appointment": {
      if (!resolvedClientId) {
        return { message: "Cliente non trovato." };
      }
      const appointment = await findNextScheduledAppointment(
        db,
        barberId,
        resolvedClientId,
      );
      if (!appointment) {
        return {
          message: `Non trovo un appuntamento attivo per ${action.clientName}.`,
        };
      }
      const date = resolveDate(action.date);
      const time = action.time
        ? resolveTime(action.time)
        : appointment.startsAt.split("T")[1]?.slice(0, 5) ?? "09:00";
      await rescheduleAppointment(
        db,
        appointment.id,
        toStartsAt(date, time),
      );
      const client = await findClientById(db, resolvedClientId);
      return {
        message: `✅ Appuntamento di ${client?.name ?? action.clientName} spostato.`,
      };
    }

    case "cancel_appointment": {
      if (!resolvedClientId) {
        return { message: "Cliente non trovato." };
      }
      const appointment = await findNextScheduledAppointment(
        db,
        barberId,
        resolvedClientId,
      );
      if (!appointment) {
        return {
          message: `Non trovo un appuntamento attivo per ${action.clientName}.`,
        };
      }
      await cancelAppointment(db, appointment.id);
      const client = await findClientById(db, resolvedClientId);
      const time =
        appointment.startsAt.split("T")[1]?.slice(0, 5) ?? "";
      const date = appointment.startsAt.split("T")[0] ?? "";
      return {
        message: `✅ Appuntamento di ${client?.name ?? action.clientName} annullato.${time ? `\n\nHai un buco ${formatDisplayDate(date)} alle ${time}.` : ""}`,
      };
    }

    case "set_reminder": {
      if (!resolvedClientId) {
        return { message: "Cliente non trovato." };
      }
      const client = await findClientById(db, resolvedClientId);
      if (!client) {
        return { message: "Cliente non trovato." };
      }
      const appointment = await findNextScheduledAppointment(
        db,
        barberId,
        resolvedClientId,
      );
      if (!appointment) {
        return {
          message: `Non trovo un appuntamento per ${client.name}. Salva prima l'appuntamento.`,
        };
      }
      const date = appointment.startsAt.split("T")[0] ?? "";
      const time = appointment.startsAt.split("T")[1]?.slice(0, 5) ?? "";
      const reminder = sendReminder({
        clientPhone: client.phone,
        clientName: client.name,
        appointmentDate: formatDisplayDate(date),
        appointmentTime: time,
      });
      return {
        message: reminder.text,
        waMeLink: reminder.waMeLink,
      };
    }

    case "complete_appointment": {
      if (!resolvedClientId) {
        return { message: "Cliente non trovato." };
      }
      const client = await findClientById(db, resolvedClientId);
      if (!client) {
        return { message: "Cliente non trovato." };
      }
      const todayIso = resolveDate("oggi");
      const appointment = await findAppointmentToComplete(
        db,
        barberId,
        resolvedClientId,
        todayIso,
      );
      if (!appointment) {
        return {
          message: `Non trovo un appuntamento attivo per ${client.name}.`,
        };
      }
      await completeAppointment(db, appointment.id);
      const time = appointment.startsAt.split("T")[1]?.slice(0, 5) ?? "";
      const date = appointment.startsAt.split("T")[0] ?? "";
      return {
        message: `✅ ${client.name} segnato come fatto (${formatDisplayDate(date)} alle ${time}).`,
      };
    }

    default:
      return { message: "Non so come gestire questa richiesta." };
  }
}
