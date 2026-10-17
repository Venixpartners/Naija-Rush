import type { Metadata } from "next";
import { VerifyButton } from "@/components/account-client";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <section className="section">
      <div className="wrap" style={{ maxWidth: 480 }}>
        <div className="panel">
          <h2>Almost there</h2>
          {token ? (
            <>
              <p>Tap the button to finish signing in on this device.</p>
              <VerifyButton token={token} />
            </>
          ) : (
            <p className="error">This link is incomplete. Request a new one from your account page.</p>
          )}
        </div>
      </div>
    </section>
  );
}
