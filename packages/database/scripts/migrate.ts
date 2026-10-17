import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, getDb } from "../src/client";
import { seedReferenceData } from "../src/seed-data";

const here = path.dirname(fileURLToPath(import.meta.url));

const db = getDb();
await migrate(db, { migrationsFolder: path.join(here, "..", "migrations") });
await seedReferenceData(db);
await closeDb();
console.log("Migrations applied and reference data seeded.");
