import type { SharedContact } from "./inbound.js";
import { normalizePhone } from "./phone.js";

/** Estrae nome e telefono da un file vCard (contatto WhatsApp). */
export function parseVCard(content: string): SharedContact | null {
  const lines = content.replace(/\r\n/g, "\n").split("\n");

  let name: string | null = null;
  let phone: string | null = null;

  for (const line of lines) {
    if (line.startsWith("FN:")) {
      name = line.slice(3).trim();
    }
    if (line.startsWith("N:") && !name) {
      const parts = line.slice(2).split(";");
      const family = parts[0]?.trim() ?? "";
      const given = parts[1]?.trim() ?? "";
      name = [given, family].filter(Boolean).join(" ").trim() || null;
    }
    if (/^TEL/i.test(line)) {
      const tel = line.split(":").slice(1).join(":").trim();
      if (tel) phone = tel;
    }
  }

  if (!phone) return null;

  const digits = phone.replace(/\D/g, "");
  const normalizedPhone = phone.startsWith("+")
    ? phone.replace(/\s/g, "")
    : `+${digits}`;

  return {
    name: (name ?? "Cliente").trim(),
    phone: normalizePhone(normalizedPhone),
  };
}

export function isVCardContentType(contentType: string): boolean {
  const lower = contentType.toLowerCase();
  return lower.includes("vcard") || lower.includes("x-vcard");
}
