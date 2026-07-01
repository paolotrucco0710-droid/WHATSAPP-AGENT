import { and, eq, like } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { clients } from "../db/schema.js";

export async function findClientsByName(
  db: Db,
  barberId: number,
  name: string,
) {
  const trimmed = name.trim();
  return db
    .select()
    .from(clients)
    .where(
      and(
        eq(clients.barberId, barberId),
        like(clients.name, `%${trimmed}%`),
      ),
    );
}

export async function findClientById(db: Db, clientId: number) {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  return client ?? null;
}

export async function findClientByPhone(
  db: Db,
  barberId: number,
  phone: string,
) {
  const normalized = phone.trim();
  const [client] = await db
    .select()
    .from(clients)
    .where(
      and(eq(clients.barberId, barberId), eq(clients.phone, normalized)),
    )
    .limit(1);
  return client ?? null;
}

export type CreateClientResult =
  | { ok: true; client: Awaited<ReturnType<typeof findClientById>> & object }
  | { ok: false; reason: "duplicate_phone"; existingName: string };

export async function createClient(
  db: Db,
  barberId: number,
  name: string,
  phone: string,
): Promise<CreateClientResult> {
  const trimmedPhone = phone.trim();
  const existing = await findClientByPhone(db, barberId, trimmedPhone);
  if (existing) {
    return { ok: false, reason: "duplicate_phone", existingName: existing.name };
  }

  const [created] = await db
    .insert(clients)
    .values({ barberId, name: name.trim(), phone: trimmedPhone })
    .returning();
  return { ok: true, client: created! };
}
