"use client";

/** Fire and forget intent events. Never blocks the UI, never throws. */
export function sendEvent(name: string, data: { channel?: string; challenge?: string; game?: string } = {}) {
  try {
    void fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, ...data }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* analytics is best effort */
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    el.remove();
    return ok;
  }
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) {
    const err = new Error(data.message ?? data.error ?? `Request failed (${res.status})`) as Error & { code?: string; status?: number };
    err.code = data.error;
    err.status = res.status;
    throw err;
  }
  return data;
}
