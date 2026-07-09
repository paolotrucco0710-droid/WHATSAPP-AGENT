import { buildWaMeLink } from "./reminder.js";

export function recoveryMessage(clientName: string, weeksSince: number): string {
  return `Ciao ${clientName}! Sono passate ${weeksSince} settimane dall'ultimo taglio. Ti va di passare questa settimana?`;
}

export function noshowMessage(
  clientName: string,
  appointmentTime: string,
): string {
  return `Ciao ${clientName}, ti aspettavo oggi alle ${appointmentTime}. Tutto ok? Vuoi riprogrammare?`;
}

export function slotFillMessage(clientName: string, slotTime: string): string {
  const first = clientName.split(/\s+/)[0] ?? clientName;
  return `Ciao ${first}! 👋 È passato un po' dall'ultimo taglio. Ho libero oggi alle ${slotTime}, ti va di passare?`;
}

export function appointmentReminderMessage(
  clientName: string,
  appointmentTime: string,
  dayLabel: string,
): string {
  const first = clientName.split(/\s+/)[0] ?? clientName;
  return `Ciao ${first}! 👋 Ti ricordo l'appuntamento ${dayLabel} alle ${appointmentTime}. Ci vediamo!`;
}

export function buildBriefingWaMeLink(
  clientPhone: string,
  messageText: string,
): string {
  return buildWaMeLink(clientPhone, messageText);
}
