import { and, eq, like, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { clients } from "../db/schema.js";

function dedupeById<T extends { id: number }>(rows: T[]): T[] {
  const seen = new Set<number>();
  return rows.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

/** Esatto → inizia con → contiene. Meno disambiguazioni inutili. */
export async function findClientsByName(
  db: Db,
  barberId: number,
  name: string,
) {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();

  const exact = await db
    .select()
    .from(clients)
    .where(
      and(
        eq(clients.barberId, barberId),
        sql`lower(${clients.name}) = ${lower}`,
      ),
    );

  if (exact.length > 0) return exact;

  const startsWith = await db
    .select()
    .from(clients)
    .where(
      and(
        eq(clients.barberId, barberId),
        sql`lower(${clients.name}) like ${`${lower}%`}`,
      ),
    );

  if (startsWith.length > 0) return dedupeById(startsWith);

  const contains = await db
    .select()
    .from(clients)
    .where(
      and(eq(clients.barberId, barberId), like(clients.name, `%${trimmed}%`)),
    );

  return dedupeById(contains);
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
  | { ok: true; client: NonNullable<Awaited<ReturnType<typeof findClientById>>> }
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
