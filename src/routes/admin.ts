import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { barbers } from "../db/schema.js";
import { findOrCreateBarber } from "../services/barber.js";

export function createAdminRoutes(db: Db) {
  const app = new Hono();
  const secret = process.env.ADMIN_SECRET;

  if (!secret) {
    return app;
  }

  app.use("*", async (c, next) => {
    if (c.req.header("x-admin-secret") !== secret) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  });

  /**
   * Pre-configura un barbiere prima del primo messaggio (utile in produzione).
   * POST { "phone": "+39333...", "averageTime": 45, "name": "Mario" }
   */
  app.post("/barber", async (c) => {
    const body = await c.req.json<{
      phone: string;
      averageTime?: number;
      name?: string;
    }>();

    if (!body.phone) {
      return c.json({ error: "phone obbligatorio" }, 400);
    }

    const barber = await findOrCreateBarber(db, body.phone);
    const updates: { averageTime?: number; name?: string } = {};

    if (body.averageTime !== undefined) {
      updates.averageTime = body.averageTime;
    }
    if (body.name !== undefined) {
      updates.name = body.name;
    }

    if (Object.keys(updates).length > 0) {
      await db.update(barbers).set(updates).where(eq(barbers.id, barber.id));
    }

    const [updated] = await db
      .select()
      .from(barbers)
      .where(eq(barbers.id, barber.id))
      .limit(1);

    return c.json({ barber: updated });
  });

  return app;
}
