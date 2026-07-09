import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { appointments, clients } from "../db/schema.js";
import { resolveDate } from "../core/dates.js";
import { getDayStats } from "./day-stats.js";
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
  BriefingRecommendation,
} from "../types/briefing.js";

function nextDayIso(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y!, m! - 1, d);
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getConfig(
  averagePrice = Number(process.env.BRIEFING_AVERAGE_PRICE ?? 25),
) {
  return {
    recoveryWeeks: Number(process.env.BRIEFING_RECOVERY_WEEKS ?? 5),
    averagePrice,
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

function daysBetween(pastIso: string, todayIso: string): number {
  const past = Date.parse(`${pastIso}T12:00:00`);
  const today = Date.parse(`${todayIso}T12:00:00`);
  return Math.max(1, Math.floor((today - past) / (24 * 60 * 60 * 1000)));
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
    .map((r) => {
      const lastIso = r.lastCompleted.split("T")[0] ?? todayIso;
      return {
        id: r.clientId,
        name: r.clientName,
        phone: r.clientPhone,
        weeksSince: weeksBetween(lastIso, todayIso),
        daysSince: daysBetween(lastIso, todayIso),
      };
    });
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

async function findTomorrowAppointments(
  db: Db,
  barberId: number,
  todayIso: string,
  limit = 3,
) {
  const tomorrowIso = nextDayIso(todayIso);
  const dayAfter = nextDayIso(tomorrowIso);

  const rows = await db
    .select({
      clientName: clients.name,
      startsAt: appointments.startsAt,
    })
    .from(appointments)
    .innerJoin(clients, eq(appointments.clientId, clients.id))
    .where(
      and(
        eq(appointments.barberId, barberId),
        eq(appointments.status, "scheduled"),
        gte(appointments.startsAt, `${tomorrowIso}T00:00:00`),
        lt(appointments.startsAt, `${dayAfter}T00:00:00`),
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(limit);

  return rows.map((r) => ({
    clientName: r.clientName,
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
  averagePrice = Number(process.env.BRIEFING_AVERAGE_PRICE ?? 25),
): Promise<BriefingPlan> {
  const config = getConfig(averagePrice);
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
        `${client.name} — ultima visita ${client.daysSince} giorni fa`,
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

  const dayStats = await getDayStats(
    db,
    barberId,
    date,
    averageTime,
    config.averagePrice,
  );

  const recoveryCount = items.filter((i) => i.category === "recovery").length;
  const noshowCount = items.filter((i) => i.category === "noshow").length;
  const slotTimes = new Set(
    items
      .filter((i) => i.category === "slot_fill")
      .map((i) => i.detail?.match(/alle (\d{2}:\d{2})/)?.[1] ?? ""),
  );
  slotTimes.delete("");

  const recommendations = buildRecommendations(
    items,
    dayStats,
    config.averagePrice,
  );
  const tomorrowAppointments = await findTomorrowAppointments(
    db,
    barberId,
    date,
  );

  return {
    date,
    estimatedEarnings: items.length * config.averagePrice,
    averagePrice: config.averagePrice,
    items,
    recoveryCount,
    noshowCount,
    slotCount: slotTimes.size,
    appointmentCount: dayStats.appointmentCount,
    gapCount: dayStats.gapCount,
    gapTimes: dayStats.gapTimes,
    occupationPct: dayStats.occupationPct,
    expectedRevenue: dayStats.expectedRevenue,
    lostRevenue: dayStats.lostRevenue,
    recommendations,
    tomorrowAppointments,
  };
}

function buildRecommendations(
  items: BriefingItem[],
  dayStats: Awaited<ReturnType<typeof getDayStats>>,
  averagePrice: number,
): BriefingRecommendation[] {
  const recs: BriefingRecommendation[] = [];
  const max = 4;

  for (const item of items.filter((i) => i.category === "noshow")) {
    if (recs.length >= max) break;
    const time = item.detail?.match(/alle (\d{2}:\d{2})/)?.[1];
    recs.push({
      emoji: "📩",
      text: time
        ? `contattare ${item.clientName} (no-show alle ${time})`
        : `contattare ${item.clientName} (no-show)`,
    });
  }

  for (const item of items.filter((i) => i.category === "recovery")) {
    if (recs.length >= max) break;
    const days = item.detail?.match(/(\d+) giorni/)?.[1];
    recs.push({
      emoji: "📩",
      text: days
        ? `scrivere a ${item.clientName.split(/\s+/)[0]} (non passa da ${days} giorni)`
        : `scrivere a ${item.clientName.split(/\s+/)[0]}`,
    });
  }

  if (dayStats.gapTimes[0] && recs.length < max) {
    const slot = dayStats.gapTimes[0];
    recs.push({
      emoji: "🟢",
      text: `provare a riempire le ${slot} — circa ${averagePrice}€ in più`,
    });
  }

  const scheduledLater = items.filter(
    (i) =>
      i.category === "recovery" ||
      i.category === "noshow" ||
      i.category === "slot_fill",
  );
  if (recs.length < max && scheduledLater.length === 0 && dayStats.appointmentCount > 0) {
    recs.push({
      emoji: "✅",
      text: "controlla l'agenda e conferma gli appuntamenti di oggi",
    });
  }

  return recs.slice(0, 3);
}

export function formatMorningReport(
  plan: BriefingPlan,
  barberFirstName?: string | null,
  yesterdayWins: Array<{ clientName: string; earnings: number }> = [],
  isFirstExperience = false,
): string {
  const name = barberFirstName?.trim().split(/\s+/)[0] || "barbiere";
  const lines: string[] = [`☀️ Buongiorno ${name}!`, ""];

  if (isFirstExperience) {
    lines.push("Sono qui per aiutarti a riempire buchi e recuperare clienti.");
    lines.push("");
  }

  if (yesterdayWins.length > 0) {
    for (const win of yesterdayWins) {
      const first = win.clientName.split(/\s+/)[0] ?? win.clientName;
      lines.push(`✅ ${first} è tornato ieri.`);
      lines.push(`Hai recuperato un cliente: circa ${win.earnings}€.`);
      lines.push("");
    }
  }

  const apptLabel =
    plan.appointmentCount === 1
      ? "1 appuntamento"
      : `${plan.appointmentCount} appuntamenti`;
  lines.push(`🔥 Oggi hai ${apptLabel}.`);
  lines.push(`Oggi in agenda hai circa ${plan.expectedRevenue}€.`);

  const isFullDay =
    plan.occupationPct >= 80 &&
    plan.gapCount === 0 &&
    plan.appointmentCount >= 4;
  const isSparseDay =
    plan.gapCount >= 2 ||
    (plan.gapCount > 0 && plan.appointmentCount <= plan.gapCount);

  const longLapsed = plan.items
    .filter((i) => i.category === "recovery")
    .filter((i) => {
      const days = Number(i.detail?.match(/(\d+) giorni/)?.[1] ?? 0);
      return days >= 42;
    });

  if (plan.gapCount > 0) {
    lines.push("");
    if (plan.gapCount === 1) {
      lines.push(
        `🟢 Ho trovato spazio per un cliente in più oggi: circa +${plan.averagePrice}€.`,
      );
    } else {
      lines.push(`🟢 Hai ${plan.gapCount} slot liberi oggi.`);
      if (plan.lostRevenue > 0) {
        lines.push(
          `💰 Potresti recuperare circa ${plan.lostRevenue}€ riempiendo questi slot.`,
        );
      }
    }
  }

  if (longLapsed.length >= 3) {
    const potential = longLapsed.length * plan.averagePrice;
    lines.push("");
    lines.push(
      `📩 ${longLapsed.length} clienti non passano da un po' — vale la pena scrivergli.`,
    );
    lines.push(`💰 Se ne torna anche solo uno: circa +${potential}€.`);
  } else if (plan.recoveryCount > 0) {
    const recoveryItems = plan.items.filter((i) => i.category === "recovery");
    const top = recoveryItems[0];
    const days = top?.detail?.match(/(\d+) giorni/)?.[1];
    if (top && days) {
      const firstName = top.clientName.split(/\s+/)[0];
      lines.push("");
      lines.push(`📩 ${firstName} non passa da ${days} giorni.`);
      lines.push(`Se torna, sono circa +${plan.averagePrice}€ per te.`);
    }
  }

  if (plan.tomorrowAppointments.length > 0) {
    const first = plan.tomorrowAppointments[0]!;
    const firstName = first.clientName.split(/\s+/)[0];
    lines.push("");
    lines.push(`📅 Domani hai ${firstName} alle ${first.time}.`);
    if (plan.tomorrowAppointments.length === 1) {
      lines.push("Vuoi mandargli un promemoria? Scrivi OK dopo azioni.");
    }
  }

  lines.push("");
  lines.push(`Agenda al ${plan.occupationPct}%.`);

  if (isFullDay && plan.items.length === 0) {
    lines.push("");
    lines.push("Giornata piena — continua così ✅");
    lines.push("");
    lines.push("Scrivi agenda oggi se vuoi il dettaglio.");
    return lines.join("\n");
  }

  if (isSparseDay && plan.items.length === 0) {
    lines.push("");
    lines.push("Vuoi riempirli? Scrivi Riempi.");
    lines.push("");
    lines.push("Scrivi agenda oggi se vuoi il dettaglio.");
    return lines.join("\n");
  }

  if (plan.recommendations.length > 0) {
    lines.push("");
    lines.push("Oggi ti consiglio di:");
    for (const rec of plan.recommendations) {
      lines.push(`${rec.emoji} ${rec.text}`);
    }
  }

  if (plan.items.length === 0) {
    lines.push("");
    if (plan.appointmentCount === 0 && plan.gapCount > 0) {
      lines.push("Giornata libera — scrivi Riempi e ti aiuto a trovare clienti.");
    } else if (plan.appointmentCount === 0) {
      lines.push("Nessun appuntamento oggi — scrivi Riempi.");
    }
    lines.push("");
    lines.push("Scrivi agenda oggi se vuoi il dettaglio.");
    return lines.join("\n");
  }

  lines.push("");
  if (plan.estimatedEarnings > 0) {
    lines.push(
      `💰 Se segui questi consigli potresti recuperare circa ${plan.estimatedEarnings}€.`,
    );
    lines.push("");
  }
  lines.push("Scrivi OK e ti preparo i messaggi 🚀");
  lines.push("Oppure MODIFICA se vuoi cambiare qualcosa.");

  return lines.join("\n");
}

/** @deprecated Usa formatMorningReport — mantenuto per compatibilità interna */
export function formatBriefingSummary(plan: BriefingPlan): string {
  return formatMorningReport(plan);
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

/** Pool clienti da contattare per riempire slot (anche oltre il briefing). */
export async function findClientsForSlotFill(
  db: Db,
  barberId: number,
  dateInput = "oggi",
  limit = 5,
) {
  const date = resolveDate(dateInput);
  return findRecoveryClients(db, barberId, date, limit);
}

export async function buildFillSlotPlan(
  db: Db,
  barberId: number,
  averageTime: number,
  averagePrice: number,
  dateInput = "oggi",
  preferredTime?: string,
): Promise<{
  slotTime: string | null;
  clients: Array<{
    id: number;
    name: string;
    phone: string;
    daysSince: number;
  }>;
  items: BriefingItem[];
}> {
  const config = getConfig(averagePrice);
  const date = resolveDate(dateInput);
  const dayStats = await getDayStats(
    db,
    barberId,
    date,
    averageTime,
    averagePrice,
  );

  const slotTime =
    preferredTime && dayStats.gapTimes.includes(preferredTime)
      ? preferredTime
      : (dayStats.gapTimes[0] ?? null);

  const clients = await findClientsForSlotFill(db, barberId, date, 5);
  const items: BriefingItem[] = [];

  if (slotTime) {
    for (const client of clients) {
      items.push(
        makeItem(
          "slot_fill",
          client,
          slotFillMessage(client.name, slotTime),
          `${client.name} — ultima visita ${client.daysSince} giorni fa`,
          `-${slotTime}`,
        ),
      );
    }
  }

  return { slotTime, clients, items };
}

export function formatFillSlotMessage(
  slotTime: string | null,
  clients: Array<{ name: string; daysSince: number }>,
  averagePrice: number,
): string {
  if (!slotTime) {
    return [
      "Oggi non ho trovato slot liberi nell'agenda.",
      "",
      "Scrivi agenda oggi per vedere la giornata.",
    ].join("\n");
  }

  const lines = [
    `Ho trovato uno slot libero oggi alle ${slotTime}.`,
    "",
    "Clienti più probabili:",
    "",
  ];

  if (clients.length === 0) {
    lines.push("Nessun cliente in lista recupero al momento.");
    lines.push("");
    lines.push(
      "Aggiungi clienti in rubrica e segna i tagli come fatto — Flexi li ricontatterà.",
    );
  } else {
    clients.forEach((c, i) => {
      const first = c.name.split(/\s+/)[0];
      lines.push(`${i + 1}. ${first} — ultimo taglio ${c.daysSince} giorni fa`);
    });
    lines.push("");
    lines.push(`💰 Se torna, sono circa +${averagePrice}€ per te.`);
    lines.push("");
    lines.push("Vuoi contattarli?");
    lines.push("Rispondi con il numero (es. 1).");
    lines.push('Oppure "scrivi a tutti" per tutti i link.');
  }

  return lines.join("\n");
}

export function formatFillSlotClientPreview(item: BriefingItem): string {
  return [
    "",
    `"${item.messageText}"`,
    "",
    `👉 Invia a ${item.clientName}`,
  ].join("\n");
}
