import type { InboundMessage, SharedContact } from "./inbound.js";
import { normalizeWhatsAppPhone } from "./whatsapp-config.js";

interface WhatsAppContactPayload {
  type: string;
  from: string;
  text?: { body: string };
  contacts?: Array<{
    name?: { formatted_name?: string; first_name?: string };
    phones?: Array<{ phone?: string; wa_id?: string }>;
  }>;
}

export function parseSharedContact(
  contact: NonNullable<WhatsAppContactPayload["contacts"]>[number],
): SharedContact | null {
  const phone =
    contact.phones?.[0]?.phone ?? contact.phones?.[0]?.wa_id ?? null;
  const name =
    contact.name?.formatted_name ??
    contact.name?.first_name ??
    null;

  if (!phone || !name) return null;

  const digits = phone.replace(/\D/g, "");
  const normalizedPhone = phone.startsWith("+")
    ? phone
    : `+${digits}`;
  return { name: name.trim(), phone: normalizedPhone };
}

export function extractInboundFromWhatsApp(body: unknown): InboundMessage[] {
  const result: InboundMessage[] = [];
  const payload = body as {
    entry?: Array<{
      changes?: Array<{ value?: { messages?: WhatsAppContactPayload[] } }>;
    }>;
  };

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        const barberPhone = normalizeWhatsAppPhone(msg.from);

        if (msg.type === "text" && msg.text?.body) {
          result.push({ barberPhone, text: msg.text.body });
        }

        if (msg.type === "contacts" && msg.contacts?.[0]) {
          const contact = parseSharedContact(msg.contacts[0]);
          if (contact) {
            result.push({ barberPhone, contact });
          }
        }
      }
    }
  }

  return result;
}
