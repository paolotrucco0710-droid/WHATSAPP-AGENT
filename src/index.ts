import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { getDb } from "./db/index.js";
import { createAdminRoutes } from "./routes/admin.js";
import { createDevRoutes } from "./routes/dev.js";
import { createTwilioRoutes } from "./routes/twilio.js";
import { createWhatsAppRoutes } from "./routes/whatsapp.js";
import { createCronRoutes } from "./routes/cron.js";
import { startMorningReportScheduler } from "./core/morning-scheduler.js";
import {
  getMessagingProvider,
} from "./messaging/messaging-status.js";

const app = new Hono();

app.get("/health", (c) => {
  const provider = getMessagingProvider();
  return c.json({
    status: "ok",
    service: "flexi",
    messaging: provider === "none" ? "not_configured" : provider,
    whatsapp: provider === "meta" ? "configured" : "not_configured",
    twilio: provider === "twilio" ? "configured" : "not_configured",
  });
});

const db = getDb();

if (process.env.ADMIN_SECRET) {
  app.route("/admin", createAdminRoutes(db));
  console.log("Admin API: POST /admin/barber");
}

const provider = getMessagingProvider();

if (provider === "twilio") {
  app.route("/twilio", createTwilioRoutes(db));
  console.log("Twilio webhook: POST /twilio/webhook");
} else if (provider === "meta") {
  app.route("/whatsapp", createWhatsAppRoutes(db));
  console.log("WhatsApp webhook: GET/POST /whatsapp/webhook");
} else {
  console.log(
    "Messaggistica non configurata — imposta TWILIO_* o WHATSAPP_* in .env",
  );
}

if (process.env.NODE_ENV !== "production") {
  app.route("/dev", createDevRoutes(db));
}

if (process.env.CRON_SECRET) {
  app.route("/cron", createCronRoutes(db));
  console.log("Cron: POST /cron/morning-report");
}

startMorningReportScheduler(db);

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "0.0.0.0";

console.log(`[flexi] PORT=${process.env.PORT ?? "(default 3000)"} HOST=${hostname}`);
console.log(
  `[flexi] Railway Networking → imposta la porta del dominio pubblico su ${port} (deve coincidere con il log sopra)`,
);

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`Flexi running on http://${hostname}:${info.port}`);
  if (process.env.NODE_ENV !== "production") {
    console.log(`Dev simulator: POST http://localhost:${info.port}/dev/message`);
  }
});
