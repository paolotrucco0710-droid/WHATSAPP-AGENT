import { and, eq, gte, lt, asc } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { appointments, clients } from "../db/schema.js";
import { formatAgendaDayLabel, getWeekDateRange, resolveDate } from "../core/dates.js";
import { findEmptySlots } from "./briefing.js";
import { getDayStats, type DayStats } from "./day-stats.js";

function nextDayIso(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y!, m! - 1, d);
  date.setDate(date.getDate() + 1);
  const ny = date.getFullYear();
  const nm = String(date.getMonth() + 1).padStart(2, "0");
  const nd = String(date.getDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h! * 60 + m!;
}

export interface AgendaItem {
  time: string;
  clientName: string;
  status: "scheduled" | "completed" | "cancelled";
}

export interface AgendaGap {
  time: string;
}

export type AgendaEntry =
  | ({ type: "appointment" } & AgendaItem)
  | ({ type: "gap" } & AgendaGap);

/** Appuntamenti di un giorno, ordinati per ora. */
export async function getAgendaForDate(
  db: Db,
  barberId: number,
  dateInput: string,
): Promise<AgendaItem[]> {
  const isoDate = resolveDate(dateInput);
  const nextIso = nextDayIso(isoDate);

  const rows = await db
    .select({
      startsAt: appointments.startsAt,
      status: appointments.status,
      clientName: clients.name,
    })
    .from(appointments)
    .innerJoin(clients, eq(appointments.clientId, clients.id))
    .where(
      and(
        eq(appointments.barberId, barberId),
        gte(appointments.startsAt, `${isoDate}T00:00:00`),
        lt(appointments.startsAt, `${nextIso}T00:00:00`),
      ),
    )
    .orderBy(asc(appointments.startsAt));

  return rows.map((r) => ({
    time: r.startsAt.split("T")[1]?.slice(0, 5) ?? "",
    clientName: r.clientName,
    status: r.status as AgendaItem["status"],
  }));
}

export async function getAgendaWithGaps(
  db: Db,
  barberId: number,
  dateInput: string,
  averageTime: number,
): Promise<AgendaEntry[]> {
  const isoDate = resolveDate(dateInput);
  const nextIso = nextDayIso(isoDate);

  const rows = await db
    .select({
      startsAt: appointments.startsAt,
      durationMinutes: appointments.durationMinutes,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.barberId, barberId),
        eq(appointments.status, "scheduled"),
        gte(appointments.startsAt, `${isoDate}T00:00:00`),
        lt(appointments.startsAt, `${nextIso}T00:00:00`),
      ),
    )
    .orderBy(asc(appointments.startsAt));

  const workStart = process.env.BRIEFING_WORK_START ?? "09:00";
  const workEnd = process.env.BRIEFING_WORK_END ?? "19:00";

  const booked = rows.map((r) => {
    const start = timeToMinutes(
      r.startsAt.split("T")[1]?.slice(0, 5) ?? "00:00",
    );
    return { start, end: start + r.durationMinutes };
  });

  const gaps = findEmptySlots(booked, workStart, workEnd, averageTime);
  const allItems = await getAgendaForDate(db, barberId, dateInput);
  const entries: AgendaEntry[] = [];
  const allTimes = [...new Set([...allItems.map((i) => i.time), ...gaps])].sort();

  for (const time of allTimes) {
    if (gaps.includes(time)) {
      entries.push({ type: "gap", time });
    }
    const item = allItems.find((i) => i.time === time);
    if (item) {
      entries.push({ type: "appointment", ...item });
    }
  }

  return entries;
}

export function formatAgendaMessage(
  dateInput: string,
  items: AgendaItem[],
  gaps?: string[],
  stats?: Pick<
    DayStats,
    "occupationPct" | "expectedRevenue" | "lostRevenue"
  >,
): string {
  const isoDate = resolveDate(dateInput);
  const label = formatAgendaDayLabel(dateInput, isoDate);

  if (items.length === 0 && (!gaps || gaps.length === 0)) {
    return `Nessun appuntamento per ${label}.`;
  }

  const gapSet = new Set(gaps ?? []);
  const lines = [`📅 ${label.charAt(0).toUpperCase() + label.slice(1)}`, ""];
  const allTimes = new Set([
    ...items.map((i) => i.time),
    ...(gaps ?? []),
  ]);

  for (const time of [...allTimes].sort()) {
    if (gapSet.has(time)) {
      lines.push(`${time} LIBERO ⚠️`);
      continue;
    }
    const item = items.find((i) => i.time === time);
    if (item) {
      const icon =
        item.status === "completed"
          ? "✅"
          : item.status === "cancelled"
            ? "❌"
            : "";
      const prefix = icon ? `${time} ${item.clientName} ${icon}` : `${time} ${item.clientName}`;
      lines.push(prefix);
    }
  }

  if (stats) {
    lines.push("");
    lines.push(`Occupazione giornata:`);
    lines.push(`${stats.occupationPct}%`);
    lines.push("");
    lines.push(`Incasso previsto:`);
    lines.push(`${stats.expectedRevenue} €`);
    if (stats.lostRevenue > 0) {
      lines.push("");
      lines.push(`Potresti recuperare circa ${stats.lostRevenue}€ riempiendo gli slot liberi.`);
    }
  }

  return lines.join("\n");
}

export interface WeekAgendaDay {
  isoDate: string;
  label: string;
  entries: AgendaEntry[];
}

/** Agenda per i prossimi 7 giorni */
export async function getAgendaForWeek(
  db: Db,
  barberId: number,
  averageTime: number,
): Promise<WeekAgendaDay[]> {
  const weekDates = getWeekDateRange();
  const days: WeekAgendaDay[] = [];

  for (const isoDate of weekDates) {
    const entries = await getAgendaWithGaps(
      db,
      barberId,
      isoDate,
      averageTime,
    );
    days.push({
      isoDate,
      label: formatAgendaDayLabel(isoDate, isoDate),
      entries,
    });
  }

  return days;
}

export function formatWeekAgendaMessage(days: WeekAgendaDay[]): string {
  const lines = ["📅 Agenda settimana:", ""];

  let hasAny = false;
  for (const day of days) {
    const appointments = day.entries.filter((e) => e.type === "appointment");
    const gaps = day.entries.filter((e) => e.type === "gap");

    if (appointments.length === 0 && gaps.length === 0) {
      continue;
    }

    hasAny = true;
    lines.push(day.label.charAt(0).toUpperCase() + day.label.slice(1));

    const allTimes = [
      ...new Set([
        ...appointments.map((e) => e.time),
        ...gaps.map((e) => e.time),
      ]),
    ].sort();

    for (const time of allTimes) {
      const gap = gaps.find((g) => g.time === time);
      if (gap) {
        lines.push(`🟢 ${time} buco libero`);
      }
      const appt = appointments.find((a) => a.time === time);
      if (appt && appt.type === "appointment") {
        const icon =
          appt.status === "completed"
            ? "✅"
            : appt.status === "cancelled"
              ? "❌"
              : "•";
        lines.push(`${icon} ${time} ${appt.clientName}`);
      }
    }
    lines.push("");
  }

  if (!hasAny) {
    return "Nessun appuntamento in questa settimana.";
  }

  return lines.join("\n").trimEnd();
}

export function formatAgendaFromEntries(
  dateInput: string,
  entries: AgendaEntry[],
  stats?: Pick<
    DayStats,
    "occupationPct" | "expectedRevenue" | "lostRevenue"
  >,
): string {
  const items = entries
    .filter((e): e is { type: "appointment" } & AgendaItem => e.type === "appointment");
  const gaps = entries
    .filter((e): e is { type: "gap" } & AgendaGap => e.type === "gap")
    .map((e) => e.time);
  return formatAgendaMessage(dateInput, items, gaps, stats);
}
