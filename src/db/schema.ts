import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** Il numero WhatsApp del barbiere identifica l'account. Nessun login. */
export const barbers = sqliteTable("barbers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  phone: text("phone").notNull().unique(),
  name: text("name"),
  /** Durata media appuntamento in minuti (es. 30, 45, 60) */
  averageTime: integer("average_time").notNull().default(30),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const clients = sqliteTable(
  "clients",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    barberId: integer("barber_id")
      .notNull()
      .references(() => barbers.id, { onDelete: "cascade" }),
    /** Nome visibile al barbiere. Possono esistere più clienti con lo stesso nome. */
    name: text("name").notNull(),
    /** Chiave interna. Il barbiere non la vede mai. */
    phone: text("phone").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("clients_barber_phone_idx").on(table.barberId, table.phone),
    index("clients_barber_name_idx").on(table.barberId, table.name),
  ],
);

export const appointmentStatus = [
  "scheduled",
  "cancelled",
  "completed",
] as const;
export type AppointmentStatus = (typeof appointmentStatus)[number];

export const appointments = sqliteTable(
  "appointments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    barberId: integer("barber_id")
      .notNull()
      .references(() => barbers.id, { onDelete: "cascade" }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    startsAt: text("starts_at").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    status: text("status", { enum: appointmentStatus })
      .notNull()
      .default("scheduled"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("appointments_barber_starts_at_idx").on(
      table.barberId,
      table.startsAt,
    ),
    index("appointments_client_idx").on(table.clientId),
  ],
);

/** Stato conversazione per barbiere (una riga per barbiere). */
export const conversationStates = sqliteTable("conversation_states", {
  barberId: integer("barber_id")
    .primaryKey()
    .references(() => barbers.id, { onDelete: "cascade" }),
  state: text("state", {
    enum: [
      "idle",
      "awaiting_confirmation",
      "awaiting_client_selection",
      "awaiting_briefing",
    ],
  })
    .notNull()
    .default("idle"),
  /** Contesto JSON: azione pendente, opzioni disambiguazione, ecc. */
  context: text("context"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const barbersRelations = relations(barbers, ({ many, one }) => ({
  clients: many(clients),
  appointments: many(appointments),
  conversationState: one(conversationStates),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  barber: one(barbers, {
    fields: [clients.barberId],
    references: [barbers.id],
  }),
  appointments: many(appointments),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  barber: one(barbers, {
    fields: [appointments.barberId],
    references: [barbers.id],
  }),
  client: one(clients, {
    fields: [appointments.clientId],
    references: [clients.id],
  }),
}));

export const conversationStatesRelations = relations(
  conversationStates,
  ({ one }) => ({
    barber: one(barbers, {
      fields: [conversationStates.barberId],
      references: [barbers.id],
    }),
  }),
);
