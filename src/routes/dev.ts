import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { processInbound } from "../core/processor.js";
import { DevMessageCollector } from "../messaging/types.js";
import { findClientsByName, createClient } from "../services/clients.js";
import { findOrCreateBarber } from "../services/barber.js";
import { deliverMorningReport } from "../services/morning-report.js";
import { barbers, clients, appointments } from "../db/schema.js";

export function createDevRoutes(db: Db) {
  const app = new Hono();

  /** Visualizza tutto il database (solo dev) */
  app.get("/db", async (c) => {
    const [allBarbers, allClients, allAppointments] = await Promise.all([
      db.select().from(barbers),
      db.select().from(clients),
      db.select().from(appointments),
    ]);
    return c.json({
      barbers: allBarbers,
      clients: allClients,
      appointments: allAppointments,
    });
  });

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
    await processInbound(db, collector, {
      barberPhone: body.barberPhone,
      text: body.text,
    });

    return c.json({ replies: collector.messages });
  });

  /**
   * Simula condivisione contatto WhatsApp.
   * POST { "barberPhone": "+39333...", "name": "Andrea", "phone": "+39333..." }
   */
  app.post("/contact", async (c) => {
    const body = await c.req.json<{
      barberPhone: string;
      name: string;
      phone: string;
    }>();

    if (!body.barberPhone || !body.name || !body.phone) {
      return c.json({ error: "barberPhone, name e phone obbligatori" }, 400);
    }

    const collector = new DevMessageCollector();
    await processInbound(db, collector, {
      barberPhone: body.barberPhone,
      contact: { name: body.name, phone: body.phone },
    });

    return c.json({ replies: collector.messages });
  });

  /** Seed rapido: crea barbiere + clienti di test */
  app.post("/seed", async (c) => {
    const body = await c.req.json<{
      barberPhone: string;
      averageTime?: number;
      averagePrice?: number;
      clients?: Array<{ name: string; phone: string }>;
    }>();

    if (!body.barberPhone) {
      return c.json({ error: "barberPhone obbligatorio" }, 400);
    }

    const barber = await findOrCreateBarber(db, body.barberPhone);

    const barberUpdates: { averageTime?: number; averagePrice?: number } = {};
    if (body.averageTime) {
      barberUpdates.averageTime = body.averageTime;
    }
    if (body.averagePrice) {
      barberUpdates.averagePrice = body.averagePrice;
    }
    if (Object.keys(barberUpdates).length > 0) {
      await db
        .update(barbers)
        .set(barberUpdates)
        .where(eq(barbers.id, barber.id));
    }

    const createdClients = [];
    for (const client of body.clients ?? []) {
      const existing = await findClientsByName(db, barber.id, client.name);
      if (existing.length === 0) {
        const result = await createClient(
          db,
          barber.id,
          client.name,
          client.phone,
        );
        if (result.ok) createdClients.push(result.client);
      }
    }

    return c.json({
      barberId: barber.id,
      clientsCreated: createdClients.length,
    });
  });

  /** Simula report mattutino per un barbiere */
  app.post("/morning-report", async (c) => {
    const body = await c.req.json<{ barberPhone: string }>();
    if (!body.barberPhone) {
      return c.json({ error: "barberPhone obbligatorio" }, 400);
    }

    const barber = await findOrCreateBarber(db, body.barberPhone);
    const collector = new DevMessageCollector();
    const sent = await deliverMorningReport(db, collector, barber);
    return c.json({ sent, replies: collector.messages });
  });

  return app;
}
