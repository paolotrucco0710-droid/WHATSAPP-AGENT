import type { OutboundMessage } from "./types.js";

/** Normalizza un numero per wa.me (solo cifre, prefisso IT senza +) */
export function normalizePhoneForWaMe(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  if (digits.startsWith("0") && digits.length === 10) {
    digits = `39${digits}`;
  }
  return digits;
}

export function buildWaMeLink(phone: string, message: string): string {
  const normalized = normalizePhoneForWaMe(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export interface ReminderPayload {
  clientPhone: string;
  clientName: string;
  appointmentDate: string;
  appointmentTime: string;
}

/**
 * V1: restituisce un link wa.me con messaggio precompilato.
 * V2: potrà inviare via WhatsApp Cloud API senza cambiare il chiamante.
 */
export function sendReminder(payload: ReminderPayload): OutboundMessage {
  const text = `Ciao ${payload.clientName}, ti ricordo l'appuntamento ${payload.appointmentDate} alle ${payload.appointmentTime}. Confermi?`;
  const waMeLink = buildWaMeLink(payload.clientPhone, text);

  return {
    text: `Promemoria pronto per ${payload.clientName}.\n\nTocca per aprire WhatsApp e inviare.`,
    waMeLink,
  };
}
