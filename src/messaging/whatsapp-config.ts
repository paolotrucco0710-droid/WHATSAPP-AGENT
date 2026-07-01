export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  apiVersion: string;
}

export function getWhatsAppConfig(): WhatsAppConfig | null {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!phoneNumberId || !accessToken || !verifyToken) {
    return null;
  }

  return {
    phoneNumberId,
    accessToken,
    verifyToken,
    apiVersion: process.env.WHATSAPP_API_VERSION ?? "v21.0",
  };
}

export function isWhatsAppConfigured(): boolean {
  return getWhatsAppConfig() !== null;
}

/** Normalizza numero WhatsApp in formato +39... */
export function normalizeWhatsAppPhone(waId: string): string {
  const digits = waId.replace(/\D/g, "");
  if (digits.startsWith("39")) return `+${digits}`;
  if (digits.startsWith("0")) return `+39${digits.slice(1)}`;
  return `+${digits}`;
}
