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
