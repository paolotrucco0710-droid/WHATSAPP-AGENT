import { and, eq, gte, lt, asc } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { appointments, clients } from "../db/schema.js";
import { resolveDate, formatDisplayDate } from "../core/dates.js";

function nextDayIso(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y!, m! - 1, d);
  date.setDate(date.getDate() + 1);
  const ny = date.getFullYear();
  const nm = String(date.getMonth() + 1).padStart(2, "0");
  const nd = String(date.getDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

export interface AgendaItem {
  time: string;
  clientName: string;
  status: "scheduled" | "completed" | "cancelled";
}

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

export function formatAgendaMessage(
  dateInput: string,
  items: AgendaItem[],
): string {
  const isoDate = resolveDate(dateInput);
  const label =
    dateInput.toLowerCase() === "oggi"
      ? "oggi"
      : dateInput.toLowerCase() === "domani"
        ? "domani"
        : formatDisplayDate(isoDate);

  if (items.length === 0) {
    return `Nessun appuntamento per ${label}.`;
  }

  const lines = [`Agenda ${label}:`, ""];
  for (const item of items) {
    const icon =
      item.status === "completed"
        ? "✅"
        : item.status === "cancelled"
          ? "❌"
          : "•";
    lines.push(`${icon} ${item.time} ${item.clientName}`);
  }
  return lines.join("\n");
}
