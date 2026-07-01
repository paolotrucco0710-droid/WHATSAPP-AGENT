import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { getDb } from "./db/index.js";
import { createAdminRoutes } from "./routes/admin.js";
import { createDevRoutes } from "./routes/dev.js";
import { createWhatsAppRoutes } from "./routes/whatsapp.js";
import { isWhatsAppConfigured } from "./messaging/whatsapp-config.js";

const app = new Hono();

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "flexi",
    whatsapp: isWhatsAppConfigured() ? "configured" : "not_configured",
  });
});

const db = getDb();

if (process.env.ADMIN_SECRET) {
  app.route("/admin", createAdminRoutes(db));
  console.log("Admin API: POST /admin/barber");
}

if (isWhatsAppConfigured()) {
  app.route("/whatsapp", createWhatsAppRoutes(db));
  console.log("WhatsApp webhook: GET/POST /whatsapp/webhook");
} else {
  console.log(
    "WhatsApp non configurato — imposta WHATSAPP_* in .env per attivarlo",
  );
}

if (process.env.NODE_ENV !== "production") {
  app.route("/dev", createDevRoutes(db));
}

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, () => {
  console.log(`Flexi running on http://localhost:${port}`);
  if (process.env.NODE_ENV !== "production") {
    console.log(`Dev simulator: POST http://localhost:${port}/dev/message`);
  }
});
