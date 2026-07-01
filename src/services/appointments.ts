import { and, eq, asc } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { appointments } from "../db/schema.js";

export async function findNextScheduledAppointment(
  db: Db,
  barberId: number,
  clientId: number,
) {
  const [appointment] = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.barberId, barberId),
        eq(appointments.clientId, clientId),
        eq(appointments.status, "scheduled"),
      ),
    )
    .orderBy(appointments.startsAt)
    .limit(1);
  return appointment ?? null;
}

export async function createAppointment(
  db: Db,
  params: {
    barberId: number;
    clientId: number;
    startsAt: string;
    durationMinutes: number;
  },
) {
  const [created] = await db
    .insert(appointments)
    .values({
      barberId: params.barberId,
      clientId: params.clientId,
      startsAt: params.startsAt,
      durationMinutes: params.durationMinutes,
      status: "scheduled",
    })
    .returning();
  return created!;
}

export async function rescheduleAppointment(
  db: Db,
  appointmentId: number,
  startsAt: string,
) {
  const [updated] = await db
    .update(appointments)
    .set({ startsAt })
    .where(eq(appointments.id, appointmentId))
    .returning();
  return updated ?? null;
}

export async function cancelAppointment(db: Db, appointmentId: number) {
  const [updated] = await db
    .update(appointments)
    .set({ status: "cancelled" })
    .where(eq(appointments.id, appointmentId))
    .returning();
  return updated ?? null;
}

export async function completeAppointment(db: Db, appointmentId: number) {
  const [updated] = await db
    .update(appointments)
    .set({ status: "completed" })
    .where(eq(appointments.id, appointmentId))
    .returning();
  return updated ?? null;
}

/** Appuntamento programmato di oggi per il cliente, altrimenti il prossimo. */
export async function findAppointmentToComplete(
  db: Db,
  barberId: number,
  clientId: number,
  todayIso: string,
) {
  const scheduled = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.barberId, barberId),
        eq(appointments.clientId, clientId),
        eq(appointments.status, "scheduled"),
      ),
    )
    .orderBy(appointments.startsAt);

  const todayAppt = scheduled.find((a) =>
    a.startsAt.startsWith(todayIso),
  );
  if (todayAppt) return todayAppt;

  return scheduled[0] ?? null;
}
