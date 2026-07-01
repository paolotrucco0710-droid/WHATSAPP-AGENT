import type { InboundMessage } from "./inbound.js";
import { normalizePhone } from "./phone.js";

const EMPTY_TWIML =
  '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

export function emptyTwimlResponse(): Response {
  return new Response(EMPTY_TWIML, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

/** Estrae messaggi da webhook Twilio (application/x-www-form-urlencoded). */
export function extractInboundFromTwilio(
  body: Record<string, string | File>,
): InboundMessage[] {
  const text = typeof body.Body === "string" ? body.Body.trim() : "";
  if (!text) return [];

  const rawFrom =
    (typeof body.From === "string" ? body.From : "") ||
    (typeof body.WaId === "string" ? body.WaId : "");

  if (!rawFrom) return [];

  const barberPhone = normalizePhone(rawFrom.replace(/^whatsapp:/i, ""));
  return [{ barberPhone, text }];
}
