/** Normalizza un numero in formato internazionale +39... */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("39")) return `+${digits}`;
  if (digits.startsWith("0")) return `+39${digits.slice(1)}`;
  return `+${digits}`;
}

/** Converte +39333... in whatsapp:+39333... per Twilio */
export function toTwilioWhatsAppAddress(phone: string): string {
  const normalized = phone.startsWith("whatsapp:")
    ? phone
    : `whatsapp:${normalizePhone(phone)}`;
  return normalized;
}
