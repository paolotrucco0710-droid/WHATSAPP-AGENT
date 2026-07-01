import type { FlexiAction } from "../types/actions.js";
import {
  formatDisplayDate,
  formatDisplayDateTime,
  resolveDate,
  resolveTime,
} from "../core/dates.js";
import type { ClientSelectionContext } from "../types/actions.js";

export function buildActionSummary(
  action: FlexiAction,
  clientDisplayName?: string,
): string {
  if (action.type === "unknown") {
    return action.reason ?? "Non ho capito. Puoi ripetere?";
  }

  const name = clientDisplayName ?? action.clientName;

  switch (action.type) {
    case "create_appointment": {
      const date = resolveDate(action.date);
      const time = resolveTime(action.time);
      return [
        "Ho capito questo:",
        "",
        `• Cliente: ${name}`,
        `• Data: ${formatDisplayDate(date)}`,
        `• Ora: ${time}`,
        "",
        "Confermi?",
      ].join("\n");
    }
    case "reschedule_appointment": {
      const date = resolveDate(action.date);
      const lines = [
        "Ho capito questo:",
        "",
        `• Cliente: ${name}`,
        `• Nuova data: ${formatDisplayDate(date)}`,
      ];
      if (action.time) {
        lines.push(`• Nuova ora: ${resolveTime(action.time)}`);
      }
      lines.push("", "Confermi?");
      return lines.join("\n");
    }
    case "cancel_appointment":
      return [
        "Ho capito questo:",
        "",
        `• Annullare l'appuntamento di ${name}`,
        "",
        "Confermi?",
      ].join("\n");
    case "create_client":
      return [
        "Ho capito questo:",
        "",
        `• Nuovo cliente: ${action.clientName}`,
        "",
        "Confermi?",
      ].join("\n");
    case "set_reminder":
      return [
        "Ho capito questo:",
        "",
        `• Cliente: ${name}`,
        `• Promemoria tra ${action.weeksFromNow} settimane`,
        "",
        "Confermi?",
      ].join("\n");
    default:
      return "Non ho capito. Puoi ripetere?";
  }
}

export function buildClientSelectionMessage(
  context: ClientSelectionContext,
): string {
  const lines = ["Ho trovato più clienti:", ""];
  context.candidates.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.displayName}`);
  });
  lines.push("", "Rispondi con il numero.");
  return lines.join("\n");
}

export function buildSuccessMessage(
  action: FlexiAction,
  clientDisplayName?: string,
  extra?: { startsAt?: string; waMeLink?: string },
): string {
  if (action.type === "unknown") {
    return "Non ho capito.";
  }

  const name = clientDisplayName ?? action.clientName;

  switch (action.type) {
    case "create_appointment":
      return `✅ Appuntamento salvato per ${name}.`;
    case "reschedule_appointment":
      return `✅ Appuntamento di ${name} spostato.`;
    case "cancel_appointment":
      return `✅ Appuntamento di ${name} annullato.`;
    case "create_client":
      return `✅ Cliente ${action.clientName} aggiunto.`;
    case "set_reminder":
      if (extra?.waMeLink) {
        return `✅ Promemoria pronto per ${name}.\n\nTocca il link per aprire WhatsApp.`;
      }
      return `✅ Promemoria impostato per ${name} tra ${action.weeksFromNow} settimane.`;
    default:
      return "Fatto.";
  }
}

export function formatAppointmentForReminder(
  isoDate: string,
  time: string,
): { date: string; time: string } {
  return {
    date: formatDisplayDate(isoDate),
    time,
  };
}

export { formatDisplayDateTime };
