import { sql } from "drizzle-orm";
import { db } from "./db";

/**
 * Fixed window limiter backed by Postgres so it works across serverless
 * instances without extra infrastructure. Interface is provider neutral; move
 * to Redis (Upstash) when write volume justifies it.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const rows = await db().execute<{ count: number }>(sql`
    insert into naijarush.rate_limits as rate_limits (key, window_start, count)
    values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSec}) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSec}) then now() else rate_limits.window_start end
    returning count
  `);
  return Number(rows[0]?.count ?? 0) <= limit;
}

export function clientIp(headers: Headers): string | null {
  return headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}
