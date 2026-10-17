import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { confirmCallback } from "@/lib/services/billing";

export const runtime = "nodejs";

/**
 * Paystack sends the buyer back here. We verify with Paystack's API before
 * anything is granted; the redirect itself proves nothing.
 */
export async function GET(req: Request) {
  const reference = new URL(req.url).searchParams.get("reference") ?? "";
  let status = "error";
  try {
    status = (await confirmCallback(reference)).status;
  } catch (e) {
    console.error("[payments] callback verify failed", e);
  }
  return NextResponse.redirect(`${env.siteUrl}/premium?status=${encodeURIComponent(status)}`, 303);
}
