"use client";

import { useState } from "react";
import { postJson } from "@/lib/client-events";

export function BuyButton({ productId, label, disabled }: { productId: string; label: string; disabled?: boolean }) {
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="stack">
      <label className="toggle">
        <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} /> I am 18 or older (or my parent or guardian is paying)
      </label>
      {error && <p className="error">{error}</p>}
      <button
        className="btn btn-block"
        disabled={disabled || busy || !adult}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const r = await postJson<{ authorizationUrl: string }>("/api/checkout", { productId, adultConfirmed: adult });
            window.location.href = r.authorizationUrl;
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy ? "Opening Paystack…" : label}
      </button>
    </div>
  );
}

export function CancelButton() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  return state === "done" ? (
    <p className="fineprint">Renewal cancelled. Premium stays on until the end of the period you paid for.</p>
  ) : (
    <button
      className="btn btn-ghost btn-block"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        try {
          await postJson("/api/account/subscription/cancel", {});
          setState("done");
        } catch {
          setState("error");
        }
      }}
    >
      {state === "error" ? "Could not cancel. Try again" : "Cancel renewal"}
    </button>
  );
}
