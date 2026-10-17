import { adsEnabled, grantAdReward } from "@/lib/services/ads";

export const runtime = "nodejs";

/**
 * Server side verification callback from the ad network (GET, as most
 * networks use): ?user_id=&nonce=&ts=&signature=
 * Not reachable from the browser in a useful way: without the shared secret
 * no signature is valid.
 */
export async function GET(req: Request) {
  if (!(await adsEnabled())) return Response.json({ granted: false, reason: "ads_disabled" }, { status: 503 });
  const q = new URL(req.url).searchParams;
  const result = await grantAdReward({ userId: q.get("user_id") ?? "", nonce: q.get("nonce") ?? "", ts: Number(q.get("ts")), signature: q.get("signature") ?? "" });
  return Response.json(result, { status: result.granted || result.reason === "duplicate" || result.reason === "daily_cap" ? 200 : 400 });
}
