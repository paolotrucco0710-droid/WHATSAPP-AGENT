import type { InboundMessage } from "./inbound.js";
import { normalizePhone } from "./phone.js";
import { getTwilioConfig, type TwilioConfig } from "./twilio-config.js";
import { isVCardContentType, parseVCard } from "./vcard.js";

const EMPTY_TWIML =
  '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

export function emptyTwimlResponse(): Response {
  return new Response(EMPTY_TWIML, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

async function downloadTwilioMedia(
  mediaUrl: string,
  config: TwilioConfig,
): Promise<string> {
  const auth = Buffer.from(
    `${config.accountSid}:${config.authToken}`,
  ).toString("base64");

  const response = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!response.ok) {
    throw new Error(`Twilio media download failed: ${response.status}`);
  }

  return response.text();
}

/** Estrae messaggi da webhook Twilio (application/x-www-form-urlencoded). */
export async function extractInboundFromTwilio(
  body: Record<string, string | File>,
): Promise<InboundMessage[]> {
  const rawFrom =
    (typeof body.From === "string" ? body.From : "") ||
    (typeof body.WaId === "string" ? body.WaId : "");

  if (!rawFrom) return [];

  const barberPhone = normalizePhone(rawFrom.replace(/^whatsapp:/i, ""));
  const numMedia = Number(typeof body.NumMedia === "string" ? body.NumMedia : 0);

  if (numMedia > 0 && typeof body.MediaUrl0 === "string") {
    const contentType =
      typeof body.MediaContentType0 === "string" ? body.MediaContentType0 : "";

    if (isVCardContentType(contentType)) {
      const config = getTwilioConfig();
      if (!config) {
        console.error("[twilio] vCard ricevuta ma Twilio non configurato");
        return [];
      }

      try {
        const vcardText = await downloadTwilioMedia(body.MediaUrl0, config);
        const contact = parseVCard(vcardText);
        if (contact) {
          return [{ barberPhone, contact }];
        }
      } catch (err) {
        console.error("[twilio] vCard parse error:", err);
      }
    }
  }

  const text = typeof body.Body === "string" ? body.Body.trim() : "";
  if (!text) return [];

  return [{ barberPhone, text }];
}

export function hasUnhandledTwilioMedia(
  body: Record<string, string | File>,
  messages: InboundMessage[],
): boolean {
  const numMedia = Number(typeof body.NumMedia === "string" ? body.NumMedia : 0);
  return numMedia > 0 && messages.length === 0;
}
