import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { barbers } from "../db/schema.js";

export async function findBarberByPhone(db: Db, phone: string) {
  const [barber] = await db
    .select()
    .from(barbers)
    .where(eq(barbers.phone, phone))
    .limit(1);
  return barber ?? null;
}

export async function findOrCreateBarber(db: Db, phone: string) {
  const existing = await findBarberByPhone(db, phone);
  if (existing) return existing;

  const [created] = await db
    .insert(barbers)
    .values({ phone })
    .returning();
  return created!;
}
