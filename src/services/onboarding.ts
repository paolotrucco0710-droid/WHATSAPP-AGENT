import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { appointments, clients } from "../db/schema.js";

export async function isNewBarber(db: Db, barberId: number): Promise<boolean> {
  const [clientRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(clients)
    .where(eq(clients.barberId, barberId));

  const [apptRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(appointments)
    .where(eq(appointments.barberId, barberId));

  return (clientRow?.count ?? 0) === 0 && (apptRow?.count ?? 0) === 0;
}

export function formatWelcomeMessage(
  barberFirstName?: string | null,
  isNew = true,
): string {
  const name = barberFirstName?.trim().split(/\s+/)[0];

  if (isNew) {
    const greeting = name ? `👋 Ciao ${name}! Sono Flexi.` : "👋 Ciao! Sono Flexi.";
    return [
      greeting,
      "",
      "Ti aiuto a riempire i buchi in agenda e recuperare clienti che non tornano.",
      "",
      "Per iniziare:",
      "• condividimi un contatto WhatsApp per aggiungere un cliente",
      "• scrivi un appuntamento: Marco domani alle 10",
      "• chiedimi cosa fare oggi — ti dico come guadagnare di più",
      "",
      "Parla come vuoi, senza comandi da imparare.",
    ].join("\n");
  }

  const greeting = name ? `👋 Bentornato ${name}!` : "👋 Bentornato!";
  return [
    greeting,
    "",
    "Sono qui per aiutarti a riempire buchi e recuperare clienti.",
    "",
    "Scrivi cosa vuoi fare oggi — ti dico come guadagnare di più.",
    "Oppure parlami come preferisci: Marco domani alle 15, riempi un buco, ecc.",
  ].join("\n");
}

export function formatFirstReportIntro(): string {
  return [
    "Ogni mattina ti dico come riempire buchi e recuperare clienti.",
    "",
  ].join("\n");
}
