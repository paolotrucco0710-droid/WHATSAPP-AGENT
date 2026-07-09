import { and, eq, gte, lt } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { appointments } from "../db/schema.js";
import { resolveDate } from "../core/dates.js";
import { findEmptySlots } from "./briefing.js";

function nextDayIso(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y!, m! - 1, d);
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h! * 60 + m!;
}

export interface DayStats {
  isoDate: string;
  appointmentCount: number;
  gapTimes: string[];
  gapCount: number;
  occupationPct: number;
  expectedRevenue: number;
  lostRevenue: number;
}

export function getWorkHours() {
  return {
    workStart: process.env.BRIEFING_WORK_START ?? "09:00",
    workEnd: process.env.BRIEFING_WORK_END ?? "19:00",
  };
}

export function computeOccupationPct(
  bookedMinutes: number,
  workStart: string,
  workEnd: string,
): number {
  const workMinutes =
    timeToMinutes(workEnd) - timeToMinutes(workStart);
  if (workMinutes <= 0) return 0;
  return Math.min(100, Math.round((bookedMinutes / workMinutes) * 100));
}

export async function getDayStats(
  db: Db,
  barberId: number,
  dateInput: string,
  averageTime: number,
  averagePrice: number,
): Promise<DayStats> {
  const isoDate = resolveDate(dateInput);
  const nextIso = nextDayIso(isoDate);
  const { workStart, workEnd } = getWorkHours();

  const rows = await db
    .select({
      startsAt: appointments.startsAt,
      durationMinutes: appointments.durationMinutes,
      status: appointments.status,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.barberId, barberId),
        gte(appointments.startsAt, `${isoDate}T00:00:00`),
        lt(appointments.startsAt, `${nextIso}T00:00:00`),
        eq(appointments.status, "scheduled"),
      ),
    );

  const booked = rows.map((r) => {
    const start = timeToMinutes(
      r.startsAt.split("T")[1]?.slice(0, 5) ?? "00:00",
    );
    return { start, end: start + r.durationMinutes };
  });

  const bookedMinutes = rows.reduce(
    (sum, r) => sum + r.durationMinutes,
    0,
  );
  const gapTimes = findEmptySlots(booked, workStart, workEnd, averageTime);

  return {
    isoDate,
    appointmentCount: rows.length,
    gapTimes,
    gapCount: gapTimes.length,
    occupationPct: computeOccupationPct(
      bookedMinutes,
      workStart,
      workEnd,
    ),
    expectedRevenue: rows.length * averagePrice,
    lostRevenue: gapTimes.length * averagePrice,
  };
}
