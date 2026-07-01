import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { getDb } from "./db/index.js";
import { barbers } from "./db/schema.js";

const app = new Hono();

app.get("/health", (c) => {
  return c.json({ status: "ok", service: "flexi" });
});

/** Endpoint temporaneo per verificare che il DB funzioni. */
app.get("/debug/barbers", async (c) => {
  const db = getDb();
  const allBarbers = await db.select().from(barbers);
  return c.json(allBarbers);
});

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, () => {
  console.log(`Flexi running on http://localhost:${port}`);
});
