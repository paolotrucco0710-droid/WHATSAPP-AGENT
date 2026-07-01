import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { getDb } from "./db/index.js";
import { createDevRoutes } from "./routes/dev.js";

const app = new Hono();

app.get("/health", (c) => {
  return c.json({ status: "ok", service: "flexi" });
});

if (process.env.NODE_ENV !== "production") {
  const db = getDb();
  app.route("/dev", createDevRoutes(db));
}

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, () => {
  console.log(`Flexi running on http://localhost:${port}`);
  if (process.env.NODE_ENV !== "production") {
    console.log(`Dev simulator: POST http://localhost:${port}/dev/message`);
  }
});
