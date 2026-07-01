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

export async function createClient(
  db: Db,
  barberId: number,
  name: string,
  phone: string,
) {
  const [created] = await db
    .insert(clients)
    .values({ barberId, name: name.trim(), phone: phone.trim() })
    .returning();
  return created!;
}
