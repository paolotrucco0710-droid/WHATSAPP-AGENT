import type { Db } from "../db/index.js";
import { formatDateRome, nowInRome } from "./dates.js";
import { createTwilioSender } from "../messaging/twilio-sender.js";
import { getMessagingProvider } from "../messaging/messaging-status.js";
import { deliverMorningReportsToAll } from "../services/morning-report.js";

let lastRunDateKey: string | null = null;

export function isMorningReportEnabled(): boolean {
  return process.env.MORNING_REPORT_ENABLED !== "false";
}

export function getMorningReportSchedule(): { hour: number; minute: number } {
  return {
    hour: Number(process.env.MORNING_REPORT_HOUR ?? 8),
    minute: Number(process.env.MORNING_REPORT_MINUTE ?? 0),
  };
}

export async function runMorningReports(db: Db): Promise<number> {
  if (!isMorningReportEnabled()) {
    console.log("[morning] Report disabilitato (MORNING_REPORT_ENABLED=false)");
    return 0;
  }

  if (getMessagingProvider() !== "twilio") {
    console.warn("[morning] Twilio non configurato, skip report");
    return 0;
  }

  const sender = createTwilioSender();
  if (!sender) {
    console.warn("[morning] Sender Twilio non disponibile, skip report");
    return 0;
  }

  return deliverMorningReportsToAll(db, sender);
}

export function startMorningReportScheduler(db: Db): void {
  if (!isMorningReportEnabled()) {
    console.log("[morning] Scheduler disattivato");
    return;
  }

  const { hour, minute } = getMorningReportSchedule();
  const timeLabel = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  console.log(
    `[morning] Scheduler attivo — report ogni giorno alle ${timeLabel} (Europe/Rome)`,
  );

  setInterval(() => {
    void (async () => {
      const now = nowInRome();
      const dateKey = formatDateRome(now);
      if (now.getHours() !== hour || now.getMinutes() !== minute) return;
      if (lastRunDateKey === dateKey) return;

      lastRunDateKey = dateKey;
      console.log(`[morning] Avvio report mattutino ${dateKey}`);
      await runMorningReports(db);
    })();
  }, 30_000);
}

/** Per test manuali — resetta il guard giornaliero */
export function resetMorningReportGuard(): void {
  lastRunDateKey = null;
}
