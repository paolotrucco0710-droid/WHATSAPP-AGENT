import { Hono } from "hono";
import type { Db } from "../db/index.js";
import {
  resetMorningReportGuard,
  runMorningReports,
} from "../core/morning-scheduler.js";

export function createCronRoutes(db: Db) {
  const app = new Hono();
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return app;
  }

  /** Trigger manuale report mattutino (es. cron esterno o test) */
  app.post("/morning-report", async (c) => {
    if (c.req.header("x-cron-secret") !== secret) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    resetMorningReportGuard();
    const sent = await runMorningReports(db);
    return c.json({ ok: true, sent });
  });

  return app;
}
