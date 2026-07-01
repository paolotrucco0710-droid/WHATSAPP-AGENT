import type { MessageSender, OutboundMessage } from "./types.js";
import {
  getWhatsAppConfig,
  type WhatsAppConfig,
} from "./whatsapp-config.js";

export class WhatsAppCloudSender implements MessageSender {
  constructor(private readonly config: WhatsAppConfig) {}

  async send(toBarberPhone: string, message: OutboundMessage): Promise<void> {
    const to = toBarberPhone.replace(/\D/g, "");
    const url = `https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`;

    const body: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message.text },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[whatsapp] send failed:", err);
      throw new Error(`WhatsApp send failed: ${response.status}`);
    }

    if (message.waMeLink) {
      await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: `🔗 ${message.waMeLink}` },
        }),
      });
    }
  }
}

export function createWhatsAppSender(): WhatsAppCloudSender | null {
  const config = getWhatsAppConfig();
  if (!config) return null;
  return new WhatsAppCloudSender(config);
}
