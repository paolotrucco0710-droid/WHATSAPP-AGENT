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
  return `Ciao ${clientName}! Ho un buco libero oggi alle ${slotTime}. Ti va?`;
}

export function buildBriefingWaMeLink(
  clientPhone: string,
  messageText: string,
): string {
  return buildWaMeLink(clientPhone, messageText);
}
