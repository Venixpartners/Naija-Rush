import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Paystack adapter. All calls are server side with the secret key; the key
 * never reaches the browser. Use test keys (sk_test_...) until launch.
 * Reference: https://paystack.com/docs/api
 *
 * The PaymentProvider interface is small on purpose so a telco direct
 * carrier billing provider can be added later without touching billing
 * logic (subject to operator and tariff approval; not implemented).
 */
export interface InitializeInput {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  planCode?: string | null;
  metadata: Record<string, string>;
}

export interface VerifiedTransaction {
  reference: string;
  status: "success" | "failed" | "abandoned" | "pending";
  amountKobo: number;
  currency: string;
  email: string | null;
  metadata: Record<string, string>;
}

export interface PaymentProvider {
  readonly name: string;
  initialize(input: InitializeInput): Promise<{ authorizationUrl: string; reference: string }>;
  verify(reference: string): Promise<VerifiedTransaction>;
  verifySignature(rawBody: string, signature: string | null): boolean;
  disableSubscription(code: string, emailToken: string): Promise<void>;
}

const API = "https://api.paystack.co";

export class PaystackProvider implements PaymentProvider {
  readonly name = "paystack";
  constructor(
    private secretKey: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${API}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${this.secretKey}`, "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    const body = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
    if (!res.ok || body.status === false || body.data === undefined) throw new Error(`Paystack ${path} failed: ${body.message ?? res.status}`);
    return body.data;
  }

  async initialize(input: InitializeInput) {
    const data = await this.call<{ authorization_url: string; reference: string }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        amount: input.amountKobo,
        currency: "NGN",
        reference: input.reference,
        callback_url: input.callbackUrl,
        ...(input.planCode ? { plan: input.planCode } : {}),
        metadata: input.metadata,
      }),
    });
    return { authorizationUrl: data.authorization_url, reference: data.reference };
  }

  async verify(reference: string): Promise<VerifiedTransaction> {
    const d = await this.call<{ reference: string; status: string; amount: number; currency: string; customer?: { email?: string }; metadata?: Record<string, string> | string }>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
    const metadata = typeof d.metadata === "object" && d.metadata ? d.metadata : {};
    return {
      reference: d.reference,
      status: (["success", "failed", "abandoned"].includes(d.status) ? d.status : "pending") as VerifiedTransaction["status"],
      amountKobo: d.amount,
      currency: d.currency,
      email: d.customer?.email ?? null,
      metadata,
    };
  }

  /** Paystack signs the raw body with HMAC SHA512 using the secret key. */
  verifySignature(rawBody: string, signature: string | null): boolean {
    if (!signature || !/^[0-9a-f]{128}$/i.test(signature)) return false;
    const expected = createHmac("sha512", this.secretKey).update(rawBody).digest("hex");
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  }

  async disableSubscription(code: string, emailToken: string) {
    await this.call("/subscription/disable", { method: "POST", body: JSON.stringify({ code, token: emailToken }) });
  }
}

/** The configured provider, or null when payments are not set up. */
export function paymentProvider(): PaymentProvider | null {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key || !/^sk_(test|live)_/.test(key)) return null;
  return new PaystackProvider(key);
}

export const isTestMode = () => (process.env.PAYSTACK_SECRET_KEY ?? "").startsWith("sk_test_");
