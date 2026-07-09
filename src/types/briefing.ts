import { z } from "zod";

export const briefingCategorySchema = z.enum([
  "recovery",
  "noshow",
  "slot_fill",
]);

export type BriefingCategory = z.infer<typeof briefingCategorySchema>;

export const briefingItemSchema = z.object({
  id: z.string(),
  category: briefingCategorySchema,
  clientId: z.number().int().positive(),
  clientName: z.string(),
  clientPhone: z.string(),
  messageText: z.string(),
  waMeLink: z.string(),
  detail: z.string().optional(),
});

export type BriefingItem = z.infer<typeof briefingItemSchema>;

export const briefingRecommendationSchema = z.object({
  emoji: z.string(),
  text: z.string(),
});

export type BriefingRecommendation = z.infer<
  typeof briefingRecommendationSchema
>;

export const briefingPlanSchema = z.object({
  date: z.string(),
  estimatedEarnings: z.number().int().nonnegative(),
  averagePrice: z.number().int().positive(),
  items: z.array(briefingItemSchema),
  recoveryCount: z.number().int().nonnegative(),
  noshowCount: z.number().int().nonnegative(),
  slotCount: z.number().int().nonnegative(),
  appointmentCount: z.number().int().nonnegative(),
  gapCount: z.number().int().nonnegative(),
  gapTimes: z.array(z.string()),
  occupationPct: z.number().int().min(0).max(100),
  expectedRevenue: z.number().int().nonnegative(),
  lostRevenue: z.number().int().nonnegative(),
  recommendations: z.array(briefingRecommendationSchema),
  tomorrowAppointments: z
    .array(
      z.object({
        clientName: z.string(),
        time: z.string(),
      }),
    )
    .default([]),
});

export type BriefingPlan = z.infer<typeof briefingPlanSchema>;

export const briefingFlowContextSchema = z.object({
  plan: briefingPlanSchema,
  step: z.enum([
    "confirm",
    "pick_client",
    "modify_category",
    "modify_client",
    "modify_text",
  ]),
  selectedCategory: briefingCategorySchema.optional(),
  selectedItemId: z.string().optional(),
});

export type BriefingFlowContext = z.infer<typeof briefingFlowContextSchema>;
