import { NextResponse } from "next/server";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });

export function handle<T extends unknown[]>(fn: (...args: T) => Promise<Response>) {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.code, message: err.message }, err.status);
      console.error("[api] unhandled", err);
      return json({ error: "internal_error" }, 500);
    }
  };
}

export async function readJson(req: Request, maxBytes = 64_000): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "payload_too_large");
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
    return v as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}
