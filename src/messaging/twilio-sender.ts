import type { MessageSender, OutboundMessage } from "./types.js";
import { toTwilioWhatsAppAddress } from "./phone.js";
import {
  getTwilioConfig,
  type TwilioConfig,
} from "./twilio-config.js";

export class TwilioWhatsAppSender implements MessageSender {
  constructor(private readonly config: TwilioConfig) {}

  async send(toBarberPhone: string, message: OutboundMessage): Promise<void> {
    await this.sendText(toBarberPhone, message.text);

    if (message.waMeLink) {
      await this.sendText(toBarberPhone, `🔗 ${message.waMeLink}`);
    }
  }

  private async sendText(toBarberPhone: string, body: string): Promise<void> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`;
    const auth = Buffer.from(
      `${this.config.accountSid}:${this.config.authToken}`,
    ).toString("base64");

    const params = new URLSearchParams({
      From: this.config.whatsappFrom,
      To: toTwilioWhatsAppAddress(toBarberPhone),
      Body: body,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[twilio] send failed:", err);
      throw new Error(`Twilio send failed: ${response.status}`);
    }
  }
}

export function createTwilioSender(): TwilioWhatsAppSender | null {
  const config = getTwilioConfig();
  if (!config) return null;
  return new TwilioWhatsAppSender(config);
}
