import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { clients, outreachEvents } from "../db/schema.js";
import { formatDateRome, nowInRome } from "../core/dates.js";
import type { BriefingItem } from "../types/briefing.js";

const OUTREACH_WINDOW_DAYS = 14;

function daysAgoIso(days: number): string {
  const date = nowInRome();
  date.setDate(date.getDate() - days);
  return formatDateRome(date);
}

function yesterdayIso(): string {
  return daysAgoIso(1);
}

function nowTimestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export interface OutreachWin {
  id: number;
  clientName: string;
  earnings: number;
}

export async function recordOutreachFromItems(
  db: Db,
  barberId: number,
  items: BriefingItem[],
  averagePrice: number,
): Promise<void> {
  const suggestedAt = nowTimestamp();
  const trackable = items.filter((i) =>
    ["recovery", "slot_fill", "noshow"].includes(i.category),
  );

  for (const item of trackable) {
    await db.insert(outreachEvents).values({
      barberId,
      clientId: item.clientId,
      category: item.category,
      suggestedAt,
      earnings: averagePrice,
    });
  }
}

/** Cliente tornato dopo un suggerimento Flexi (es. segnato come fatto). */
export async function markOutreachWin(
  db: Db,
  barberId: number,
  clientId: number,
): Promise<boolean> {
  const cutoff = daysAgoIso(OUTREACH_WINDOW_DAYS);

  const [pending] = await db
    .select()
    .from(outreachEvents)
    .where(
      and(
        eq(outreachEvents.barberId, barberId),
        eq(outreachEvents.clientId, clientId),
        isNull(outreachEvents.wonAt),
        gte(outreachEvents.suggestedAt, `${cutoff}T00:00:00`),
      ),
    )
    .orderBy(desc(outreachEvents.suggestedAt))
    .limit(1);

  if (!pending) return false;

  await db
    .update(outreachEvents)
    .set({ wonAt: nowTimestamp() })
    .where(eq(outreachEvents.id, pending.id));

  return true;
}

export async function getYesterdayWinsToReport(
  db: Db,
  barberId: number,
): Promise<OutreachWin[]> {
  const yIso = yesterdayIso();

  const rows = await db
    .select({
      id: outreachEvents.id,
      clientName: clients.name,
      earnings: outreachEvents.earnings,
    })
    .from(outreachEvents)
    .innerJoin(clients, eq(outreachEvents.clientId, clients.id))
    .where(
      and(
        eq(outreachEvents.barberId, barberId),
        isNull(outreachEvents.reportedAt),
        sql`date(${outreachEvents.wonAt}) = ${yIso}`,
      ),
    );

  return rows;
}

export async function markWinsReported(
  db: Db,
  winIds: number[],
): Promise<void> {
  if (winIds.length === 0) return;
  const reportedAt = nowTimestamp();
  for (const id of winIds) {
    await db
      .update(outreachEvents)
      .set({ reportedAt })
      .where(eq(outreachEvents.id, id));
  }
}

export interface MonthlyResults {
  monthLabel: string;
  winCount: number;
  totalEarnings: number;
  clients: string[];
}

function currentMonthBounds(): { start: string; end: string; label: string } {
  const now = nowInRome();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = formatDateRome(new Date(y, m, 1));
  const end = formatDateRome(new Date(y, m + 1, 0));
  const label = now.toLocaleDateString("it-IT", {
    month: "long",
    timeZone: "Europe/Rome",
  });
  return { start, end, label };
}

export async function getMonthlyResults(
  db: Db,
  barberId: number,
): Promise<MonthlyResults> {
  const { start, end, label } = currentMonthBounds();

  const rows = await db
    .select({
      clientName: clients.name,
      earnings: outreachEvents.earnings,
    })
    .from(outreachEvents)
    .innerJoin(clients, eq(outreachEvents.clientId, clients.id))
    .where(
      and(
        eq(outreachEvents.barberId, barberId),
        sql`${outreachEvents.wonAt} is not null`,
        sql`date(${outreachEvents.wonAt}) >= ${start}`,
        sql`date(${outreachEvents.wonAt}) <= ${end}`,
      ),
    );

  const totalEarnings = rows.reduce((sum, r) => sum + r.earnings, 0);
  const clientsSeen = new Set<string>();
  const clientNames: string[] = [];
  for (const row of rows) {
    const first = row.clientName.split(/\s+/)[0] ?? row.clientName;
    if (!clientsSeen.has(first)) {
      clientsSeen.add(first);
      clientNames.push(first);
    }
  }

  return {
    monthLabel: label,
    winCount: rows.length,
    totalEarnings,
    clients: clientNames,
  };
}

export function formatMonthlyResults(results: MonthlyResults): string {
  const month = results.monthLabel.charAt(0).toUpperCase() + results.monthLabel.slice(1);

  if (results.winCount === 0) {
    return [
      `📊 ${month} con Flexi`,
      "",
      "Per ora non ho recuperi da mostrare — stiamo iniziando.",
      "",
      "Scrivi cosa faccio oggi e ti aiuto a riempire buchi o richiamare clienti.",
      "Quando un cliente torna, lo vedrai qui.",
    ].join("\n");
  }

  const lines = [
    `📊 ${month} con Flexi`,
    "",
  ];

  if (results.winCount === 1) {
    lines.push("Hai recuperato 1 cliente.");
  } else {
    lines.push(`Hai recuperato ${results.winCount} clienti.`);
  }

  lines.push(`Circa ${results.totalEarnings}€ in più.`);
  lines.push("");

  if (results.clients.length > 0) {
    lines.push("Grazie a:");
    for (const name of results.clients.slice(0, 5)) {
      lines.push(`• ${name}`);
    }
    if (results.clients.length > 5) {
      lines.push(`• ...e altri ${results.clients.length - 5}`);
    }
  }

  lines.push("");
  lines.push("Questo è il valore che Flexi ti porta ogni mese.");

  return lines.join("\n");
}

export function formatYesterdayWins(wins: OutreachWin[]): string {
  if (wins.length === 0) return "";

  const lines: string[] = [];
  for (const win of wins) {
    const first = win.clientName.split(/\s+/)[0] ?? win.clientName;
    lines.push(`✅ ${first} è tornato ieri.`);
    lines.push(`Hai recuperato un cliente: circa ${win.earnings}€.`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
