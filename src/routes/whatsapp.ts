import { Hono } from "hono";
import type { Db } from "../db/index.js";
import { processInbound } from "../core/processor.js";
import { getWhatsAppConfig } from "../messaging/whatsapp-config.js";
import { createWhatsAppSender } from "../messaging/whatsapp-sender.js";
import { extractInboundFromWhatsApp } from "../messaging/whatsapp-inbound.js";

export function createWhatsAppRoutes(db: Db) {
  const app = new Hono();

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
    const messages = extractInboundFromWhatsApp(body);

    for (const inbound of messages) {
      try {
        await processInbound(db, sender, inbound);
      } catch (err) {
        console.error("[whatsapp] processInbound error:", err);
        await sender.send(inbound.barberPhone, {
          text: "Qualcosa è andato storto. Riprova tra poco.",
        });
      }
    }

    return c.text("OK", 200);
  });

  return app;
}
