import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDb, getDatabasePath } from "./index.js";

const db = createDb();
migrate(db, { migrationsFolder: "./drizzle" });
console.log(`Migrations applied to ${getDatabasePath()}`);
