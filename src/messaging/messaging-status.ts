import { isTwilioConfigured } from "./twilio-config.js";
import { isWhatsAppConfigured } from "./whatsapp-config.js";

export type MessagingProvider = "twilio" | "meta" | "none";

export function getMessagingProvider(): MessagingProvider {
  const explicit = process.env.MESSAGING_PROVIDER?.toLowerCase();
  if (explicit === "twilio" || explicit === "meta") {
    return explicit;
  }
  if (isTwilioConfigured()) return "twilio";
  if (isWhatsAppConfigured()) return "meta";
  return "none";
}

export function isMessagingConfigured(): boolean {
  return getMessagingProvider() !== "none";
}
