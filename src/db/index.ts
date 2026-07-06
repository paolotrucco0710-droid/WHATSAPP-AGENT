import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema.js";

const defaultPath = "./data/flexi.db";

export function getDatabasePath(): string {
  return process.env.DATABASE_URL ?? defaultPath;
}

export function createDb(databasePath = getDatabasePath()) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof createDb>;

let dbInstance: Db | null = null;

export function getDb(): Db {
  if (!dbInstance) {
    const path = getDatabasePath();
    dbInstance = createDb();
    console.log(`[flexi] Database: ${path}`);
    if (process.env.NODE_ENV === "production" && path === "/app/data/flexi.db") {
      console.warn(
        "[flexi] IMPORTANTE: monta un Volume Railway su /app/data — senza volume i clienti si perdono a ogni redeploy",
      );
    }
  }
  return dbInstance;
}
