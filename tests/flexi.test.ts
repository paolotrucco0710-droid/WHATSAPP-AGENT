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
import { resolveDate } from "../src/core/dates.js";
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
      ["riempi", "fill_slot"],
      ["risultati", "view_results"],
      ["cosa faccio oggi", "daily_briefing"],
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
    assert.match(reply, /Buongiorno/i);
    assert.match(reply, /Opportunità|recuperare|circa/i);

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
    assert.match(reply, /Domani/i);
    assert.match(reply, /Marco Rossi/i);
  });

  it("azioni equivale a piano oggi", async () => {
    setupDb();
    await seed();

    const reply = await send("azioni");
    assert.match(reply, /Buongiorno/i);
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

  it("formatMorningReport come nel mockup", async () => {
    const { formatMorningReport } = await import("../src/services/briefing.js");

    const empty = formatMorningReport(
      {
        date: "2026-07-06",
        estimatedEarnings: 0,
        averagePrice: 25,
        items: [],
        recoveryCount: 0,
        noshowCount: 0,
        slotCount: 0,
        appointmentCount: 3,
        gapCount: 1,
        gapTimes: ["09:30"],
        occupationPct: 67,
        expectedRevenue: 75,
        lostRevenue: 25,
        recommendations: [],
        tomorrowAppointments: [],
      },
      "Marco",
    );
    assert.match(empty, /Buongiorno Marco/);
    assert.match(empty, /3 appuntamenti/);
    assert.match(empty, /slot liber|spazio per un cliente/i);
    assert.match(empty, /recuperare circa|circa \+25€/i);
    assert.match(empty, /Agenda al 67%/);
    assert.match(empty, /circa 75€/);

    const full = formatMorningReport(
      {
        date: "2026-07-06",
        estimatedEarnings: 75,
        averagePrice: 25,
        items: [
          {
            id: "recovery-1",
            category: "recovery",
            clientId: 1,
            clientName: "Luca Rossi",
            clientPhone: "+39333",
            messageText: "ciao",
            waMeLink: "https://wa.me/",
            detail: "Luca Rossi — ultima visita 47 giorni fa",
          },
        ],
        recoveryCount: 1,
        noshowCount: 0,
        slotCount: 1,
        appointmentCount: 5,
        gapCount: 1,
        gapTimes: ["14:30"],
        occupationPct: 67,
        expectedRevenue: 125,
        lostRevenue: 25,
        recommendations: [
          { emoji: "📩", text: "scrivere a Luca (manca da 47 giorni)" },
        ],
        tomorrowAppointments: [],
      },
      "Marco Rossi",
    );
    assert.match(full, /non passa da 47 giorni/);
    assert.match(full, /slot liber|spazio per un cliente/i);
    assert.match(full, /potresti recuperare circa 75€/i);
    assert.match(full, /Scrivi OK e ti preparo i messaggi/);

    const fullDay = formatMorningReport(
      {
        date: "2026-07-06",
        estimatedEarnings: 0,
        averagePrice: 25,
        items: [],
        recoveryCount: 0,
        noshowCount: 0,
        slotCount: 0,
        appointmentCount: 12,
        gapCount: 0,
        gapTimes: [],
        occupationPct: 95,
        expectedRevenue: 300,
        lostRevenue: 0,
        recommendations: [],
        tomorrowAppointments: [],
      },
      "Marco",
    );
    assert.match(fullDay, /12 appuntamenti/);
    assert.match(fullDay, /Giornata piena/);
  });

  it("parser capisce riempi, sposta alle 17 e viene venerdì", () => {
    let action = validateAndNormalizeAction(parseWithRules("Riempi"));
    assert.equal(action.type, "fill_slot");

    action = validateAndNormalizeAction(parseWithRules("Sposta Marco alle 17"));
    assert.equal(action.type, "reschedule_appointment");
    if (action.type === "reschedule_appointment") {
      assert.equal(action.clientName, "Marco");
      assert.equal(action.time, "17:00");
      assert.equal(action.date, resolveDate("oggi"));
    }

    action = validateAndNormalizeAction(parseWithRules("Gabri viene venerdì"));
    assert.equal(action.type, "create_appointment");
    if (action.type === "create_appointment") {
      assert.equal(action.clientName, "Gabri");
    }

    action = validateAndNormalizeAction(parseWithRules("Cancella Marco"));
    assert.equal(action.type, "cancel_appointment");
    if (action.type === "cancel_appointment") {
      assert.equal(action.clientName, "Marco");
    }
  });

  it("riempi mostra slot e clienti da recuperare", async () => {
    setupDb();
    await seed();
    const { findOrCreateBarber } = await import("../src/services/barber.js");
    const { createAppointment, completeAppointment } = await import(
      "../src/services/appointments.js"
    );
    const barber = await findOrCreateBarber(db, BARBER);
    const luca = (await findClientsByName(db, barber.id, "Luca Rossi"))[0]!;

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 40);
    const oldIso = oldDate.toISOString().split("T")[0]!;
    const appt = await createAppointment(db, {
      barberId: barber.id,
      clientId: luca.id,
      startsAt: `${oldIso}T10:00:00`,
      durationMinutes: 30,
    });
    await completeAppointment(db, appt.id);

    await send("Marco oggi alle 9");
    await send("confermo");

    const reply = await send("Riempi");
    assert.match(reply, /slot libero/i);
    assert.match(reply, /Clienti più probabili/i);
    assert.match(reply, /1\. Luca/i);
    assert.match(reply, /Vuoi contattarli/i);

    const pick = await sendAll("1");
    const pickText = pick.messages.map((m) => m.text).join("\n");
    assert.match(pickText, /Luca/i);
    assert.ok(pick.messages.some((m) => m.waMeLink?.includes("wa.me")));
  });

  it("mostra ROI quando un cliente suggerito torna", async () => {
    setupDb();
    await seed();
    const { findOrCreateBarber } = await import("../src/services/barber.js");
    const { createAppointment, completeAppointment } = await import(
      "../src/services/appointments.js"
    );
    const { recordOutreachFromItems } = await import("../src/services/outreach.js");
    const { markOutreachWin } = await import("../src/services/outreach.js");
    const { outreachEvents } = await import("../src/db/schema.js");
    const { eq } = await import("drizzle-orm");
    const { formatDateRome, nowInRome } = await import("../src/core/dates.js");

    const barber = await findOrCreateBarber(db, BARBER);
    const marco = (await findClientsByName(db, barber.id, "Marco Rossi"))[0]!;

    await recordOutreachFromItems(
      db,
      barber.id,
      [
        {
          id: "recovery-1",
          category: "recovery",
          clientId: marco.id,
          clientName: marco.name,
          clientPhone: marco.phone,
          messageText: "ciao",
          waMeLink: "https://wa.me/",
        },
      ],
      25,
    );

    await send("Marco oggi alle 10");
    await send("confermo");
    await send("Marco fatto");
    await send("confermo");
    await markOutreachWin(db, barber.id, marco.id);

    const yesterday = nowInRome();
    yesterday.setDate(yesterday.getDate() - 1);
    const yTs = `${formatDateRome(yesterday)} 12:00:00`;
    await db
      .update(outreachEvents)
      .set({ wonAt: yTs })
      .where(eq(outreachEvents.clientId, marco.id));

    const reply = await send("azioni");
    assert.match(reply, /Marco è tornato ieri/i);
    assert.match(reply, /circa 25€/i);
  });

  it("benvenuto spiega il valore senza lista comandi", async () => {
    setupDb();
    await seed();

    const reply = await send("Ciao");
    assert.match(reply, /riempire buchi/i);
    assert.match(reply, /recuperare clienti/i);
    assert.doesNotMatch(reply, /• azioni/i);
  });

  it("risultati mostra ROI mensile", async () => {
    setupDb();
    await seed();
    const { findOrCreateBarber } = await import("../src/services/barber.js");
    const { createAppointment, completeAppointment } = await import(
      "../src/services/appointments.js"
    );
    const { recordOutreachFromItems } = await import("../src/services/outreach.js");
    const { markOutreachWin } = await import("../src/services/outreach.js");
    const { outreachEvents } = await import("../src/db/schema.js");
    const { eq } = await import("drizzle-orm");
    const { formatDateRome, nowInRome } = await import("../src/core/dates.js");

    const barber = await findOrCreateBarber(db, BARBER);
    const marco = (await findClientsByName(db, barber.id, "Marco Rossi"))[0]!;
    const luca = (await findClientsByName(db, barber.id, "Luca Rossi"))[0]!;

    for (const client of [marco, luca]) {
      await recordOutreachFromItems(
        db,
        barber.id,
        [
          {
            id: `recovery-${client.id}`,
            category: "recovery",
            clientId: client.id,
            clientName: client.name,
            clientPhone: client.phone,
            messageText: "ciao",
            waMeLink: "https://wa.me/",
          },
        ],
        25,
      );
      const today = formatDateRome(nowInRome());
      const appt = await createAppointment(db, {
        barberId: barber.id,
        clientId: client.id,
        startsAt: `${today}T10:00:00`,
        durationMinutes: 30,
      });
      await completeAppointment(db, appt.id);
      await markOutreachWin(db, barber.id, client.id);
    }

    const today = formatDateRome(nowInRome());
    await db
      .update(outreachEvents)
      .set({ wonAt: `${today} 12:00:00` })
      .where(eq(outreachEvents.barberId, barber.id));

    const reply = await send("risultati");
    assert.match(reply, /con Flexi/i);
    assert.match(reply, /recuperato 2 clienti/i);
    assert.match(reply, /50€/i);
    assert.match(reply, /Marco/i);
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
