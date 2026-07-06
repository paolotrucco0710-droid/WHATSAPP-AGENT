import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { appointments, clients } from "../db/schema.js";
import { resolveDate } from "../core/dates.js";
import {
  buildBriefingWaMeLink,
  noshowMessage,
  recoveryMessage,
  slotFillMessage,
} from "../messaging/templates.js";
import type {
  BriefingCategory,
  BriefingItem,
  BriefingPlan,
} from "../types/briefing.js";

function nextDayIso(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y!, m! - 1, d);
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getConfig() {
  return {
    recoveryWeeks: Number(process.env.BRIEFING_RECOVERY_WEEKS ?? 5),
    averagePrice: Number(process.env.BRIEFING_AVERAGE_PRICE ?? 25),
    workStart: process.env.BRIEFING_WORK_START ?? "09:00",
    workEnd: process.env.BRIEFING_WORK_END ?? "19:00",
    maxRecovery: Number(process.env.BRIEFING_MAX_RECOVERY ?? 3),
    maxNoshow: Number(process.env.BRIEFING_MAX_NOSHOW ?? 3),
    maxSlotClients: Number(process.env.BRIEFING_MAX_SLOT_CLIENTS ?? 2),
  };
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h! * 60 + m!;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function weeksBetween(pastIso: string, todayIso: string): number {
  const past = Date.parse(`${pastIso}T12:00:00`);
  const today = Date.parse(`${todayIso}T12:00:00`);
  return Math.max(1, Math.floor((today - past) / (7 * 24 * 60 * 60 * 1000)));
}

function makeItem(
  category: BriefingCategory,
  client: { id: number; name: string; phone: string },
  messageText: string,
  detail?: string,
  suffix = "",
): BriefingItem {
  return {
    id: `${category}-${client.id}${suffix}`,
    category,
    clientId: client.id,
    clientName: client.name,
    clientPhone: client.phone,
    messageText,
    waMeLink: buildBriefingWaMeLink(client.phone, messageText),
    detail,
  };
}

async function findRecoveryClients(
  db: Db,
  barberId: number,
  todayIso: string,
  limit: number,
) {
  const config = getConfig();
  const cutoff = new Date(`${todayIso}T12:00:00`);
  cutoff.setDate(cutoff.getDate() - config.recoveryWeeks * 7);
  const cutoffIso = cutoff.toISOString().split("T")[0]!;

  const rows = await db
    .select({
      clientId: clients.id,
      clientName: clients.name,
      clientPhone: clients.phone,
      lastCompleted: sql<string>`max(${appointments.startsAt})`.as(
        "last_completed",
      ),
    })
    .from(clients)
    .innerJoin(appointments, eq(appointments.clientId, clients.id))
    .where(
      and(
        eq(clients.barberId, barberId),
        eq(appointments.barberId, barberId),
        eq(appointments.status, "completed"),
      ),
    )
    .groupBy(clients.id, clients.name, clients.phone)
    .having(sql`date(max(${appointments.startsAt})) <= ${cutoffIso}`);

  const scheduledToday = await db
    .select({ clientId: appointments.clientId })
    .from(appointments)
    .where(
      and(
        eq(appointments.barberId, barberId),
        eq(appointments.status, "scheduled"),
        gte(appointments.startsAt, `${todayIso}T00:00:00`),
        lt(appointments.startsAt, `${nextDayIso(todayIso)}T00:00:00`),
      ),
    );

  const busyIds = new Set(scheduledToday.map((r) => r.clientId));

  return rows
    .filter((r) => !busyIds.has(r.clientId))
    .slice(0, limit)
    .map((r) => ({
      id: r.clientId,
      name: r.clientName,
      phone: r.clientPhone,
      weeksSince: weeksBetween(
        r.lastCompleted.split("T")[0] ?? todayIso,
        todayIso,
      ),
    }));
}

async function findNoshowAppointments(
  db: Db,
  barberId: number,
  todayIso: string,
  limit: number,
) {
  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const rows = await db
    .select({
      clientId: clients.id,
      clientName: clients.name,
      clientPhone: clients.phone,
      startsAt: appointments.startsAt,
    })
    .from(appointments)
    .innerJoin(clients, eq(appointments.clientId, clients.id))
    .where(
      and(
        eq(appointments.barberId, barberId),
        eq(appointments.status, "scheduled"),
        gte(appointments.startsAt, `${todayIso}T00:00:00`),
        lt(appointments.startsAt, `${nextDayIso(todayIso)}T00:00:00`),
      ),
    )
    .orderBy(asc(appointments.startsAt));

  return rows
    .filter((r) => {
      const time = r.startsAt.split("T")[1]?.slice(0, 5) ?? "99:99";
      return time < nowTime;
    })
    .slice(0, limit)
    .map((r) => ({
      id: r.clientId,
      name: r.clientName,
      phone: r.clientPhone,
      time: r.startsAt.split("T")[1]?.slice(0, 5) ?? "",
    }));
}

export function findEmptySlots(
  booked: Array<{ start: number; end: number }>,
  workStart: string,
  workEnd: string,
  slotMinutes: number,
): string[] {
  const dayStart = timeToMinutes(workStart);
  const dayEnd = timeToMinutes(workEnd);
  const gaps: string[] = [];

  const sorted = [...booked].sort((a, b) => a.start - b.start);
  let cursor = dayStart;

  for (const block of sorted) {
    if (block.start - cursor >= slotMinutes) {
      gaps.push(minutesToTime(cursor));
    }
    cursor = Math.max(cursor, block.end);
  }

  if (dayEnd - cursor >= slotMinutes) {
    gaps.push(minutesToTime(cursor));
  }

  return gaps;
}

async function findSlotFillItems(
  db: Db,
  barberId: number,
  todayIso: string,
  averageTime: number,
  recoveryPool: Array<{ id: number; name: string; phone: string }>,
  maxClients: number,
): Promise<BriefingItem[]> {
  const config = getConfig();
  const nextIso = nextDayIso(todayIso);

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
        gte(appointments.startsAt, `${todayIso}T00:00:00`),
        lt(appointments.startsAt, `${nextIso}T00:00:00`),
        eq(appointments.status, "scheduled"),
      ),
    )
    .orderBy(asc(appointments.startsAt));

  const booked = rows.map((r) => {
    const start = timeToMinutes(r.startsAt.split("T")[1]?.slice(0, 5) ?? "00:00");
    return { start, end: start + r.durationMinutes };
  });

  const gaps = findEmptySlots(
    booked,
    config.workStart,
    config.workEnd,
    averageTime,
  );

  if (gaps.length === 0 || recoveryPool.length === 0) {
    return [];
  }

  const slotTime = gaps[0]!;
  const items: BriefingItem[] = [];

  for (const client of recoveryPool.slice(0, maxClients)) {
    items.push(
      makeItem(
        "slot_fill",
        client,
        slotFillMessage(client.name, slotTime),
        `Buco libero alle ${slotTime}`,
        `-${slotTime}`,
      ),
    );
  }

  return items;
}

export async function buildBriefingPlan(
  db: Db,
  barberId: number,
  averageTime: number,
  dateInput = "oggi",
): Promise<BriefingPlan> {
  const config = getConfig();
  const date = resolveDate(dateInput);
  const items: BriefingItem[] = [];

  const recoveryClients = await findRecoveryClients(
    db,
    barberId,
    date,
    config.maxRecovery,
  );
  for (const client of recoveryClients) {
    items.push(
      makeItem(
        "recovery",
        client,
        recoveryMessage(client.name, client.weeksSince),
        `Ultimo taglio ${client.weeksSince} settimane fa`,
      ),
    );
  }

  const noshows = await findNoshowAppointments(
    db,
    barberId,
    date,
    config.maxNoshow,
  );
  for (const client of noshows) {
    items.push(
      makeItem(
        "noshow",
        client,
        noshowMessage(client.name, client.time),
        `Appuntamento alle ${client.time}`,
      ),
    );
  }

  const slotItems = await findSlotFillItems(
    db,
    barberId,
    date,
    averageTime,
    recoveryClients.map((c) => ({ id: c.id, name: c.name, phone: c.phone })),
    config.maxSlotClients,
  );
  items.push(...slotItems);

  const recoveryCount = items.filter((i) => i.category === "recovery").length;
  const noshowCount = items.filter((i) => i.category === "noshow").length;
  const slotTimes = new Set(
    items
      .filter((i) => i.category === "slot_fill")
      .map((i) => i.detail ?? ""),
  );

  return {
    date,
    estimatedEarnings: items.length * config.averagePrice,
    averagePrice: config.averagePrice,
    items,
    recoveryCount,
    noshowCount,
    slotCount: slotTimes.size,
  };
}

export function formatBriefingSummary(plan: BriefingPlan): string {
  const lines = [
    "💰 Piano di oggi",
    "",
    `Potresti recuperare fino a €${plan.estimatedEarnings} oggi.`,
    "",
    "Ecco cosa posso preparare:",
    "",
  ];

  if (plan.recoveryCount > 0) {
    lines.push(`1. Recuperi clienti — ${plan.recoveryCount} da richiamare`);
  }
  if (plan.noshowCount > 0) {
    lines.push(`2. Promemoria no-show — ${plan.noshowCount} da contattare`);
  }
  if (plan.slotCount > 0) {
    lines.push(`3. Slot vuoto — ${plan.slotCount} buco da riempire`);
  }

  if (plan.items.length === 0) {
    return [
      "💰 Piano di oggi",
      "",
      "Nessuna azione urgente al momento.",
      "",
      "Scrivi agenda oggi per vedere la giornata.",
    ].join("\n");
  }

  lines.push(
    "",
    "Rispondi OK e preparo i link WhatsApp pronti da inviare.",
    "Scrivi MODIFICA per cambiare un messaggio prima di inviare.",
  );

  return lines.join("\n");
}

const CATEGORY_LABELS: Record<BriefingCategory, string> = {
  recovery: "Recupero cliente",
  noshow: "No-show",
  slot_fill: "Riempi buco",
};

export function formatBriefingItemMessage(item: BriefingItem): string {
  return [
    CATEGORY_LABELS[item.category],
    "",
    `"${item.messageText}"`,
    "",
    `👉 Invia a ${item.clientName}`,
  ].join("\n");
}

export function formatCategoryMenu(plan: BriefingPlan): string {
  const lines = ["Cosa vuoi modificare?", ""];
  if (plan.recoveryCount > 0) lines.push("1. Recuperi clienti");
  if (plan.noshowCount > 0) lines.push("2. Promemoria no-show");
  if (plan.slotCount > 0) lines.push("3. Slot vuoto");
  lines.push("", "Rispondi con il numero.");
  return lines.join("\n");
}

export function getCategoryFromMenuChoice(
  plan: BriefingPlan,
  choice: number,
): BriefingCategory | null {
  const options: BriefingCategory[] = [];
  if (plan.recoveryCount > 0) options.push("recovery");
  if (plan.noshowCount > 0) options.push("noshow");
  if (plan.slotCount > 0) options.push("slot_fill");
  return options[choice - 1] ?? null;
}

export function getItemsForCategory(
  plan: BriefingPlan,
  category: BriefingCategory,
): BriefingItem[] {
  return plan.items.filter((i) => i.category === category);
}

export function formatClientMenu(items: BriefingItem[]): string {
  const lines = ["Quale messaggio vuoi modificare?", ""];
  items.forEach((item, i) => {
    lines.push(`${i + 1}. ${item.clientName}`);
  });
  lines.push("", "Rispondi con il numero.");
  return lines.join("\n");
}
