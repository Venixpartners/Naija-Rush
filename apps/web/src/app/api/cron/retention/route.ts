import { timingSafeEqual } from "node:crypto";
import { HttpError, handle, json } from "@/lib/http";
import { runRetention } from "@/lib/services/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Vercel Cron calls this daily with `Authorization: Bearer $CRON_SECRET`. */
function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 16) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export const GET = handle(async (req: Request) => {
  if (!authorised(req)) throw new HttpError(401, "unauthorised", "Not allowed.");
  return json(await runRetention("cron"));
});
