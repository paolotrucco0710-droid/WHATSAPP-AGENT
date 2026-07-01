import { Hono } from "hono";
import type { Db } from "../db/index.js";
import { processMessage } from "../core/processor.js";
import {
  getWhatsAppConfig,
  normalizeWhatsAppPhone,
} from "../messaging/whatsapp-config.js";
import { createWhatsAppSender } from "../messaging/whatsapp-sender.js";

interface WhatsAppTextMessage {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
}

function extractMessages(body: unknown): WhatsAppTextMessage[] {
  const messages: WhatsAppTextMessage[] = [];
  const payload = body as {
    entry?: Array<{
      changes?: Array<{
        value?: { messages?: WhatsAppTextMessage[] };
      }>;
    }>;
  };

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        if (msg.type === "text" && msg.text?.body) {
          messages.push(msg);
        }
      }
    }
  }
  return messages;
}

export function createWhatsAppRoutes(db: Db) {
  const app = new Hono();

  /** Verifica webhook Meta (GET) */
  app.get("/webhook", (c) => {
    const config = getWhatsAppConfig();
    if (!config) {
      return c.text("WhatsApp non configurato", 503);
    }

    const mode = c.req.query("hub.mode");
    const token = c.req.query("hub.verify_token");
    const challenge = c.req.query("hub.challenge");

    if (mode === "subscribe" && token === config.verifyToken && challenge) {
      return c.text(challenge);
    }
    return c.text("Forbidden", 403);
  });

  /** Ricevi messaggi WhatsApp (POST) */
  app.post("/webhook", async (c) => {
    const config = getWhatsAppConfig();
    if (!config) {
      return c.text("WhatsApp non configurato", 503);
    }

    const sender = createWhatsAppSender();
    if (!sender) {
      return c.text("WhatsApp sender non disponibile", 503);
    }

    const body = await c.req.json();
    const messages = extractMessages(body);

    for (const msg of messages) {
      const barberPhone = normalizeWhatsAppPhone(msg.from);
      const text = msg.text!.body;
      try {
        await processMessage(db, sender, barberPhone, text);
      } catch (err) {
        console.error("[whatsapp] processMessage error:", err);
        await sender.send(
          barberPhone,
          { text: "Qualcosa è andato storto. Riprova tra poco." },
        );
      }
    }

    return c.text("OK", 200);
  });

  return app;
}
