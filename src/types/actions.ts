import { z } from "zod";

/** Azioni che l'LLM può estrarre da un messaggio in linguaggio naturale. */
export const flexiActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_appointment"),
    clientName: z.string().min(1),
    date: z.string().min(1),
    time: z.string().min(1),
  }),
  z.object({
    type: z.literal("reschedule_appointment"),
    clientName: z.string().min(1),
    date: z.string().min(1),
    time: z.string().optional(),
  }),
  z.object({
    type: z.literal("cancel_appointment"),
    clientName: z.string().min(1),
    date: z.string().optional(),
    time: z.string().optional(),
  }),
  z.object({
    type: z.literal("fill_slot"),
    date: z.string().default("oggi"),
    time: z.string().optional(),
  }),
  z.object({
    type: z.literal("create_client"),
    clientName: z.string().min(1),
    phone: z.string().optional(),
  }),
  z.object({
    type: z.literal("set_reminder"),
    clientName: z.string().min(1),
    weeksFromNow: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("view_agenda"),
    date: z.string().default("oggi"),
  }),
  z.object({
    type: z.literal("daily_briefing"),
    date: z.string().default("oggi"),
  }),
  z.object({
    type: z.literal("view_results"),
  }),
  z.object({
    type: z.literal("complete_appointment"),
    clientName: z.string().min(1),
  }),
  z.object({
    type: z.literal("greeting"),
  }),
  z.object({
    type: z.literal("out_of_scope"),
    topic: z.enum(["earnings", "bulk_send"]),
  }),
  z.object({
    type: z.literal("unknown"),
    reason: z.string().optional(),
  }),
]);

export type FlexiAction = z.infer<typeof flexiActionSchema>;

/** Contesto salvato mentre aspettiamo conferma dal barbiere. */
export const pendingConfirmationContextSchema = z.object({
  action: flexiActionSchema,
  resolvedClientId: z.number().int().positive().optional(),
  summary: z.string(),
});

export type PendingConfirmationContext = z.infer<
  typeof pendingConfirmationContextSchema
>;

/** Contesto quando ci sono più clienti con lo stesso nome. */
export const clientSelectionContextSchema = z.object({
  action: flexiActionSchema,
  candidates: z.array(
    z.object({
      id: z.number().int().positive(),
      displayName: z.string(),
    }),
  ),
});

export type ClientSelectionContext = z.infer<
  typeof clientSelectionContextSchema
>;
