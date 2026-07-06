import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { rmSync, mkdirSync } from "node:fs";
import { createDb } from "../src/db/index.js";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { processInbound } from "../src/core/processor.js";
import { DevMessageCollector } from "../src/messaging/types.js";
import { createClient } from "../src/services/clients.js";
import { findClientsByName } from "../src/services/clients.js";
import { isConversationExpired } from "../src/services/conversation.js";
import { parseWithRules } from "../src/llm/parser.js";
import { validateAndNormalizeAction } from "../src/services/validation.js";
import { extractInboundFromTwilio } from "../src/messaging/twilio-inbound.js";
import { parseVCard } from "../src/messaging/vcard.js";
import { getMessagingProvider } from "../src/messaging/messaging-status.js";

const TEST_DB = "./data/test-flexi.db";
const BARBER = "+393339990000";

let db: ReturnType<typeof createDb>;

function setupDb() {
  rmSync(TEST_DB, { force: true });
  mkdirSync("./data", { recursive: true });
  db = createDb(TEST_DB);
  migrate(db, { migrationsFolder: "./drizzle" });
}

async function sendAll(text: string) {
  const collector = new DevMessageCollector();
  await processInbound(db, collector, { barberPhone: BARBER, text });
  return collector;
}

async function send(text: string) {
  const collector = await sendAll(text);
  return collector.messages.map((m) => m.text).join("\n");
}

async function seed() {
  const { findOrCreateBarber } = await import("../src/services/barber.js");
  const barber = await findOrCreateBarber(db, BARBER);
  await createClient(db, barber.id, "Marco Rossi", "+393331234567");
  await createClient(db, barber.id, "Luca Rossi", "+393331234001");
  await createClient(db, barber.id, "Luca Verdi", "+393331234002");
}

describe("Flexi", () => {
  before(() => {
    setupDb();
  });

  after(() => {
    rmSync(TEST_DB, { force: true });
  });

  it("parser capisce frasi barbiere comuni", () => {
    const cases = [
      ["Marco domani alle 15", "create_appointment"],
      ["agenda oggi", "view_agenda"],
      ["agenda", "view_agenda"],
      ["azioni", "daily_briefing"],
      ["agenda martedì", "view_agenda"],
      ["marco fatto", "complete_appointment"],
      ["gianni ha annullato", "cancel_appointment"],
    ] as const;

    for (const [text, expected] of cases) {
      const action = validateAndNormalizeAction(parseWithRules(text));
      assert.equal(action.type, expected, `parser: ${text}`);
      if (text === "agenda") {
        assert.equal(
          action.type === "view_agenda" ? action.date : "",
          "settimana",
        );
      }
    }
  });

  it("ricerca clienti: esatto prima di parziale", async () => {
    await seed();
    const { findOrCreateBarber } = await import("../src/services/barber.js");
    const barber = await findOrCreateBarber(db, BARBER);

    const marco = await findClientsByName(db, barber.id, "Marco Rossi");
    assert.equal(marco.length, 1);
    assert.equal(marco[0]!.name, "Marco Rossi");

    const luca = await findClientsByName(db, barber.id, "Luca");
    assert.equal(luca.length, 2);
  });

  it("blocca appuntamento duplicato", async () => {
    setupDb();
    await seed();

    let reply = await send("Marco domani alle 11");
    assert.match(reply, /Confermi/);

    reply = await send("confermo");
    assert.match(reply, /salvato/i);

    reply = await send("Marco domani alle 11");
    assert.match(reply, /già un appuntamento/i);
    assert.match(reply, /Non l'ho duplicato/i);
  });

  it("blocca cliente duplicato", async () => {
    setupDb();
    await seed();

    const reply = await send("Nuovo cliente Marco +393331234567");
    assert.match(reply, /già in rubrica/i);
  });

  it("agenda oggi dopo appuntamento", async () => {
    setupDb();
    await seed();

    await send("Marco oggi alle 9");
    await send("confermo");

    const reply = await send("agenda oggi");
    assert.match(reply, /Marco Rossi/i);
  });

  it("contatto condiviso chiede conferma", async () => {
    setupDb();
    await seed();

    const collector = new DevMessageCollector();
    await processInbound(db, collector, {
      barberPhone: BARBER,
      contact: { name: "Andrea Nuovo", phone: "+393337778888" },
    });

    const reply = collector.messages[0]!.text;
    assert.match(reply, /Ho ricevuto il contatto/i);
    assert.match(reply, /Confermi/i);
  });

  it("marco fatto attiva richiamo automatico", async () => {
    setupDb();
    await seed();

    await send("Marco oggi alle 10");
    await send("confermo");

    await send("Marco fatto");
    const reply = await send("confermo");
    assert.match(reply, /segnato come fatto/i);
    assert.match(reply, /Richiamo automatico attivo/i);
    assert.doesNotMatch(reply, /Ricordami/i);
  });

  it("ricordami dopo fatto senza conferma", async () => {
    setupDb();
    await seed();

    await send("Marco oggi alle 10");
    await send("confermo");
    await send("Marco fatto");
    await send("confermo");

    const reply = await send("Ricordami Marco tra 5 settimane");
    assert.match(reply, /Richiamo già attivo/i);
    assert.doesNotMatch(reply, /Confermi/i);
  });

  it("MODIFICA fuori contesto spiega come usarlo", async () => {
    setupDb();
    await seed();

    const reply = await send("MODIFICA");
    assert.match(reply, /solo dopo azioni/i);
  });

  it("accetta yep e yeah come conferma", async () => {
    setupDb();
    await seed();

    await send("Marco domani alle 11");
    const reply = await send("yep");
    assert.match(reply, /salvato/i);
  });

  it("timeout conversazione scaduta", () => {
    const old = new Date(Date.now() - 31 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);
    assert.equal(isConversationExpired(old), true);

    const recent = new Date().toISOString().replace("T", " ").slice(0, 19);
    assert.equal(isConversationExpired(recent), false);
  });

  it("allowlist barbiere blocca numeri non autorizzati", async () => {
    setupDb();
    process.env.BARBER_ALLOWLIST = "+393339990000";

    const collector = new DevMessageCollector();
    await processInbound(db, collector, {
      barberPhone: "+393331111111",
      text: "Ciao",
    });

    assert.match(collector.messages[0]!.text, /non è ancora attivo/i);
    delete process.env.BARBER_ALLOWLIST;
  });

  it("parser webhook Twilio da form-urlencoded", async () => {
    const messages = await extractInboundFromTwilio({
      From: "whatsapp:+393331112233",
      Body: "Marco domani alle 15",
      WaId: "393331112233",
    });

    assert.equal(messages.length, 1);
    assert.equal(messages[0]!.barberPhone, "+393331112233");
    assert.equal(messages[0]!.text, "Marco domani alle 15");
  });

  it("parser vCard da contatto condiviso", () => {
    const vcard = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:Andrea Bianchi",
      "TEL;TYPE=CELL:+393337778888",
      "END:VCARD",
    ].join("\n");

    const contact = parseVCard(vcard);
    assert.ok(contact);
    assert.equal(contact!.name, "Andrea Bianchi");
    assert.equal(contact!.phone, "+393337778888");
  });

  it("provider twilio ha priorità se configurato", () => {
    process.env.MESSAGING_PROVIDER = "twilio";
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";

    assert.equal(getMessagingProvider(), "twilio");

    delete process.env.MESSAGING_PROVIDER;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_WHATSAPP_FROM;
  });

  it("piano oggi prepara briefing e link con OK", async () => {
    setupDb();
    await seed();
    const { findOrCreateBarber } = await import("../src/services/barber.js");
    const { createAppointment } = await import("../src/services/appointments.js");
    const { completeAppointment } = await import("../src/services/appointments.js");
    const barber = await findOrCreateBarber(db, BARBER);
    const marco = (await findClientsByName(db, barber.id, "Marco Rossi"))[0]!;

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 40);
    const oldIso = oldDate.toISOString().split("T")[0]!;
    const appt = await createAppointment(db, {
      barberId: barber.id,
      clientId: marco.id,
      startsAt: `${oldIso}T10:00:00`,
      durationMinutes: 30,
    });
    await completeAppointment(db, appt.id);

    let reply = await send("piano oggi");
    assert.match(reply, /Piano di oggi/i);
    assert.match(reply, /Recuperi clienti/i);

    const collector = await sendAll("OK");
    const texts = collector.messages.map((m) => m.text).join("\n");
    assert.match(texts, /Invia a Marco Rossi/i);
    assert.ok(collector.messages.some((m) => m.waMeLink?.includes("wa.me")));
  });

  it("agenda settimana e giorno per nome", async () => {
    setupDb();
    await seed();

    await send("Marco domani alle 9");
    await send("confermo");

    let reply = await send("agenda");
    assert.match(reply, /Agenda settimana/i);
    assert.match(reply, /Marco Rossi/i);
    assert.doesNotMatch(reply, /\d{1,2}\s+\w+\s+\d{4}/);

    reply = await send("agenda domani");
    assert.match(reply, /Agenda domani/i);
    assert.match(reply, /Marco Rossi/i);
  });

  it("azioni equivale a piano oggi", async () => {
    setupDb();
    await seed();

    const reply = await send("azioni");
    assert.match(reply, /Piano di oggi/i);
  });

  it("parser ignora servizio nel nome appuntamento", () => {
    const action = validateAndNormalizeAction(
      parseWithRules("Marco domani 11:30 taglio"),
    );
    assert.equal(action.type, "create_appointment");
    if (action.type === "create_appointment") {
      assert.equal(action.clientName, "Marco");
    }
  });

  it("parser capisce orario con spazi e sposta senza 'a'", () => {
    let action = validateAndNormalizeAction(
      parseWithRules("Sposta Marco a venerdì alle 15 30"),
    );
    assert.equal(action.type, "reschedule_appointment");
    if (action.type === "reschedule_appointment") {
      assert.equal(action.time, "15:30");
    }

    action = validateAndNormalizeAction(
      parseWithRules("Sposta Marco venerdì 15 15"),
    );
    assert.equal(action.type, "reschedule_appointment");
    if (action.type === "reschedule_appointment") {
      assert.equal(action.clientName, "Marco");
      assert.equal(action.time, "15:15");
    }

    action = validateAndNormalizeAction(
      parseWithRules("Marco venerdì 15 15"),
    );
    assert.equal(action.type, "create_appointment");
    if (action.type === "create_appointment") {
      assert.equal(action.time, "15:15");
    }

    action = validateAndNormalizeAction(parseWithRules("Annulla Marco martedì"));
    assert.equal(action.type, "cancel_appointment");
    if (action.type === "cancel_appointment") {
      assert.equal(action.clientName, "Marco");
    }
  });
});
