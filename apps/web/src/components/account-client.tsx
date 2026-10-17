"use client";

import { useState } from "react";
import { postJson } from "@/lib/client-events";

export function SignInForm({ available }: { available: boolean }) {
  const [email, setEmail] = useState("");
  const [age, setAge] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const [devLink, setDevLink] = useState<string | null>(null);

  if (!available) {
    return <p className="notice">Accounts are coming soon. Your scores are saved on this device in the meantime.</p>;
  }
  if (state === "sent") {
    return (
      <div className="guide" role="status">
        <h3>Check your email</h3>
        <p className="fineprint">We sent a sign in link to <b>{email}</b>. It works once and expires in 20 minutes.</p>
        {devLink && <a className="btn btn-block" href={devLink}>Open link (local development)</a>}
      </div>
    );
  }
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("sending");
        setError("");
        try {
          const r = await postJson<{ sent: boolean; devLink?: string }>("/api/auth/request", { email, ageConfirmed: age });
          setDevLink(r.devLink ?? null);
          setState("sent");
        } catch (err) {
          setError((err as Error).message);
          setState("error");
        }
      }}
    >
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </div>
      <label className="toggle">
        <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} /> I am 13 or older
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-block btn-lg" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Email me a sign in link"}
      </button>
      <p className="fineprint">No password. Signing in keeps your scores across phones and lets you claim a handle. Your progress on this device comes with you.</p>
    </form>
  );
}

export function ProfileForm({ handle, displayName, isPublic }: { handle: string; displayName: string | null; isPublic: boolean }) {
  const [h, setH] = useState(handle);
  const [d, setD] = useState(displayName ?? "");
  const [pub, setPub] = useState(isPublic);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        try {
          const res = await fetch("/api/account/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle: h, displayName: d, isPublic: pub }) });
          const data = await res.json();
          if (!res.ok) throw new Error(data.message ?? data.error);
          setMsg({ ok: true, text: "Saved" });
        } catch (err) {
          setMsg({ ok: false, text: (err as Error).message });
        }
      }}
    >
      <div className="field">
        <label htmlFor="handle">Handle</label>
        <input id="handle" className="input" value={h} onChange={(e) => setH(e.target.value)} maxLength={20} pattern="[a-zA-Z0-9_]{3,20}" />
      </div>
      <div className="field">
        <label htmlFor="dn">Display name on rankings</label>
        <input id="dn" className="input" value={d} onChange={(e) => setD(e.target.value)} maxLength={20} placeholder="Leave empty to stay anonymous" />
      </div>
      <label className="toggle">
        <input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} /> Public profile and name on rankings
      </label>
      {msg && <p className={msg.ok ? "fineprint" : "error"}>{msg.text}</p>}
      <button className="btn btn-block">Save profile</button>
    </form>
  );
}

export function PrivacyActions({ signedIn }: { signedIn: boolean }) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="stack">
      <a className="btn btn-ghost btn-block" href="/api/account/export">Download my data (JSON)</a>
      {signedIn && (
        <button
          className="btn btn-ghost btn-block"
          onClick={async () => {
            await postJson("/api/auth/signout", {});
            window.location.href = "/account";
          }}
        >
          Sign out
        </button>
      )}
      <details className="guide">
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>{signedIn ? "Delete my account" : "Forget this device"}</summary>
        <p className="fineprint">This permanently removes your runs, challenges and profile{signedIn ? " on every device you signed in on" : ""}. Payment records are kept for accounting but no longer linked to you.</p>
        <div className="field">
          <label htmlFor="del">Type DELETE to confirm</label>
          <input id="del" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <button
          className="btn btn-block"
          style={{ background: "var(--red)", color: "#fff", boxShadow: "none" }}
          disabled={confirm !== "DELETE" || busy}
          onClick={async () => {
            setBusy(true);
            await postJson("/api/account/delete", { confirm });
            window.location.href = "/";
          }}
        >
          Delete permanently
        </button>
      </details>
    </div>
  );
}

export function VerifyButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [error, setError] = useState("");
  return (
    <div className="stack">
      {error && <p className="error">{error}</p>}
      <button
        className="btn btn-block btn-lg"
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          try {
            const r = await postJson<{ isNew: boolean }>("/api/auth/verify", { token });
            window.location.href = r.isNew ? "/account?welcome=1" : "/account";
          } catch (e) {
            setError((e as Error).message);
            setState("error");
          }
        }}
      >
        {state === "busy" ? "Signing in…" : "Sign in to Naija Rush"}
      </button>
    </div>
  );
}

export function ReportButton({ type, code, handle }: { type: "challenge" | "profile"; code?: string; handle?: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return <span className="fineprint">Thanks. A moderator will review it.</span>;
  if (!open) return <button className="icon-btn" style={{ fontSize: "0.8rem" }} onClick={() => setOpen(true)}>Report</button>;
  return (
    <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
      {[
        ["offensive_name", "Offensive name"],
        ["impersonation", "Impersonation"],
        ["cheating", "Cheating"],
      ].map(([r, label]) => (
        <button key={r} className="icon-btn" style={{ fontSize: "0.8rem" }} onClick={async () => { await postJson("/api/reports", { type, code, handle, reason: r }).catch(() => {}); setDone(true); }}>
          {label}
        </button>
      ))}
    </span>
  );
}
