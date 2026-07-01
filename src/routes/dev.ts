import { Hono } from "hono";
import type { Db } from "../db/index.js";
import { processMessage } from "../core/processor.js";
import { DevMessageCollector } from "../messaging/types.js";
import { findClientsByName, createClient } from "../services/clients.js";
import { findOrCreateBarber } from "../services/barber.js";

export function createDevRoutes(db: Db) {
  const app = new Hono();

  /**
   * Simula un messaggio WhatsApp dal barbiere.
   * POST { "barberPhone": "+393331234567", "text": "Luca domani alle 15" }
   */
  app.post("/message", async (c) => {
    const body = await c.req.json<{ barberPhone: string; text: string }>();

    if (!body.barberPhone || !body.text) {
      return c.json({ error: "barberPhone e text sono obbligatori" }, 400);
    }

    const collector = new DevMessageCollector();
    await processMessage(db, collector, body.barberPhone, body.text);

    return c.json({
      replies: collector.messages,
    });
  });

  /** Seed rapido: crea barbiere + clienti di test */
  app.post("/seed", async (c) => {
    const body = await c.req.json<{
      barberPhone: string;
      averageTime?: number;
      clients?: Array<{ name: string; phone: string }>;
    }>();

    if (!body.barberPhone) {
      return c.json({ error: "barberPhone obbligatorio" }, 400);
    }

    const barber = await findOrCreateBarber(db, body.barberPhone);

    if (body.averageTime) {
      const { barbers } = await import("../db/schema.js");
      const { eq } = await import("drizzle-orm");
      await db
        .update(barbers)
        .set({ averageTime: body.averageTime })
        .where(eq(barbers.id, barber.id));
    }

    const createdClients = [];
    for (const client of body.clients ?? []) {
      const existing = await findClientsByName(db, barber.id, client.name);
      if (existing.length === 0) {
        createdClients.push(
          await createClient(db, barber.id, client.name, client.phone),
        );
      }
    }

    return c.json({
      barberId: barber.id,
      clientsCreated: createdClients.length,
    });
  });

  return app;
}
