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
