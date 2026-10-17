import { handlePaystackWebhook } from "@/lib/services/billing";

export const runtime = "nodejs";

/** Paystack webhook. Exempt from the CSRF check; authenticated by HMAC signature. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 200_000) return new Response("too large", { status: 413 });
  try {
    const { status, result } = await handlePaystackWebhook(raw, req.headers.get("x-paystack-signature"));
    return Response.json({ result }, { status });
  } catch (e) {
    console.error("[payments] webhook failed", e);
    // 500 makes Paystack retry later; processing is idempotent.
    return Response.json({ result: "error" }, { status: 500 });
  }
}
