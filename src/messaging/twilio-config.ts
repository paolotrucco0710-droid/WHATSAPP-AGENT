export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** Numero Flexi su Twilio, es. whatsapp:+14155238886 */
  whatsappFrom: string;
}

export function getTwilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken || !whatsappFrom) {
    return null;
  }

  const from = whatsappFrom.startsWith("whatsapp:")
    ? whatsappFrom
    : `whatsapp:${whatsappFrom}`;

  return { accountSid, authToken, whatsappFrom: from };
}

export function isTwilioConfigured(): boolean {
  return getTwilioConfig() !== null;
}
