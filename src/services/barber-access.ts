import { normalizeWhatsAppPhone } from "../messaging/whatsapp-config.js";

/** Se impostata, solo questi numeri possono usare Flexi (pilot con un barbiere). */
export function getBarberAllowlist(): string[] | null {
  const raw = process.env.BARBER_ALLOWLIST?.trim();
  if (!raw) return null;
  return raw
    .split(",")
    .map((entry) => normalizeWhatsAppPhone(entry.trim()))
    .filter(Boolean);
}

export function isBarberAllowed(phone: string): boolean {
  const allowlist = getBarberAllowlist();
  if (!allowlist) return true;
  return allowlist.includes(normalizeWhatsAppPhone(phone));
}
