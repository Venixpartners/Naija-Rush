import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

const g = globalThis as unknown as { __venixDb?: { db: Db; sql: postgres.Sql; url: string } };

/**
 * Shared connection. On Vercel use the Supabase transaction pooler URL
 * (port 6543) and keep `prepare: false`, which the pooler requires.
 */
export function getDb(url = process.env.DATABASE_URL): Db {
  if (!url) throw new Error("DATABASE_URL is not set. See ENVIRONMENT.md.");
  if (g.__venixDb && g.__venixDb.url === url) return g.__venixDb.db;
  const sql = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    prepare: false,
    idle_timeout: 20,
    onnotice: () => {},
    ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : "require",
  });
  const db = drizzle(sql, { schema });
  g.__venixDb = { db, sql, url };
  return db;
}

export async function closeDb() {
  if (g.__venixDb) {
    await g.__venixDb.sql.end({ timeout: 5 });
    g.__venixDb = undefined;
  }
}
