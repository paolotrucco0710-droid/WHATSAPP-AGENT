import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDb, getDatabasePath } from "./index.js";

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);

try {
  const db = createDb();
  migrate(db, { migrationsFolder });
  console.log(`Migrations applied to ${getDatabasePath()}`);
} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
}
