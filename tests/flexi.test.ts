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

const TEST_DB = "./data/test-flexi.db";
const BARBER = "+393339990000";

let db: ReturnType<typeof createDb>;

function setupDb() {
  rmSync(TEST_DB, { force: true });
  mkdirSync("./data", { recursive: true });
  db = createDb(TEST_DB);
  migrate(db, { migrationsFolder: "./drizzle" });
}

async function send(text: string) {
  const collector = new DevMessageCollector();
  await processInbound(db, collector, { barberPhone: BARBER, text });
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
      ["marco fatto", "complete_appointment"],
      ["gianni ha annullato", "cancel_appointment"],
    ] as const;

    for (const [text, expected] of cases) {
      const action = validateAndNormalizeAction(parseWithRules(text));
      assert.equal(action.type, expected, `parser: ${text}`);
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

  it("marco fatto suggerisce richiamo", async () => {
    setupDb();
    await seed();

    await send("Marco oggi alle 10");
    await send("confermo");

    await send("Marco fatto");
    const reply = await send("confermo");
    assert.match(reply, /segnato come fatto/i);
    assert.match(reply, /5 settimane/i);
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
});
