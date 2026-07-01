import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { conversationStates } from "../db/schema.js";
import type {
  ClientSelectionContext,
  PendingConfirmationContext,
} from "../types/actions.js";

export type ConversationStateType =
  | "idle"
  | "awaiting_confirmation"
  | "awaiting_client_selection";

const DEFAULT_TIMEOUT_MINUTES = 30;

export function getConversationTimeoutMs(): number {
  const minutes = Number(
    process.env.CONVERSATION_TIMEOUT_MINUTES ?? DEFAULT_TIMEOUT_MINUTES,
  );
  return minutes * 60 * 1000;
}

/** SQLite datetime → timestamp */
function parseSqliteDatetime(value: string): number {
  return Date.parse(value.replace(" ", "T") + "Z");
}

export function isConversationExpired(updatedAt: string): boolean {
  const age = Date.now() - parseSqliteDatetime(updatedAt);
  return age > getConversationTimeoutMs();
}

export async function getConversationState(db: Db, barberId: number) {
  const [state] = await db
    .select()
    .from(conversationStates)
    .where(eq(conversationStates.barberId, barberId))
    .limit(1);
  return state ?? null;
}

export async function setConversationState(
  db: Db,
  barberId: number,
  state: ConversationStateType,
  context?: PendingConfirmationContext | ClientSelectionContext,
) {
  const contextJson = context ? JSON.stringify(context) : null;
  await db
    .insert(conversationStates)
    .values({
      barberId,
      state,
      context: contextJson,
      updatedAt: sql`(datetime('now'))`,
    })
    .onConflictDoUpdate({
      target: conversationStates.barberId,
      set: {
        state,
        context: contextJson,
        updatedAt: sql`(datetime('now'))`,
      },
    });
}

export async function resetConversationState(db: Db, barberId: number) {
  await setConversationState(db, barberId, "idle");
}

export function parsePendingContext(
  raw: string | null,
): PendingConfirmationContext | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingConfirmationContext;
  } catch {
    return null;
  }
}

export function parseSelectionContext(
  raw: string | null,
): ClientSelectionContext | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ClientSelectionContext;
  } catch {
    return null;
  }
}
