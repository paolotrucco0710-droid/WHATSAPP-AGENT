import { Hono } from "hono";
import type { Db } from "../db/index.js";
import { processInbound } from "../core/processor.js";
import { createTwilioSender } from "../messaging/twilio-sender.js";
import {
  emptyTwimlResponse,
  extractInboundFromTwilio,
} from "../messaging/twilio-inbound.js";
import { isTwilioConfigured } from "../messaging/twilio-config.js";

export function createTwilioRoutes(db: Db) {
  const app = new Hono();

  /** Ricevi messaggi WhatsApp da Twilio (POST) */
  app.post("/webhook", async (c) => {
    if (!isTwilioConfigured()) {
      return c.text("Twilio non configurato", 503);
    }

    const sender = createTwilioSender();
    if (!sender) {
      return c.text("Twilio sender non disponibile", 503);
    }

    const body = await c.req.parseBody();
    const formBody = Object.fromEntries(
      Object.entries(body).map(([key, value]) => [
        key,
        typeof value === "string" ? value : "",
      ]),
    );

    const messages = extractInboundFromTwilio(formBody);

    for (const inbound of messages) {
      try {
        await processInbound(db, sender, inbound);
      } catch (err) {
        console.error("[twilio] processInbound error:", err);
        await sender.send(inbound.barberPhone, {
          text: "Qualcosa è andato storto. Riprova tra poco.",
        });
      }
    }

    return emptyTwimlResponse();
  });

  return app;
}
