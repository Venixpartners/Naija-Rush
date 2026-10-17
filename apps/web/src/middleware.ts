import { NextResponse, type NextRequest } from "next/server";
import { adminFromHeader } from "./lib/admin-auth";

const GUEST_COOKIE = "nr_gid";
const ONE_YEAR = 60 * 60 * 24 * 365;

function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * CSRF check that also works in social app webviews, some of which omit the
 * Origin header on same origin requests. Order of evidence:
 *   1. Sec-Fetch-Site (set by the browser, cannot be forged by page script)
 *   2. Origin
 *   3. Referer
 *   4. No signal at all (old webviews): require a JSON body, which a cross
 *      site HTML form cannot send without a CORS preflight we never approve.
 */
function sameSite(req: NextRequest): boolean {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  const hostOf = (v: string | null) => {
    try {
      return v ? new URL(v).host : null;
    } catch {
      return null;
    }
  };
  const origin = req.headers.get("origin");
  if (origin && origin !== "null") return hostOf(origin) === host;
  const referer = req.headers.get("referer");
  if (referer) return hostOf(referer) === host;
  return (req.headers.get("content-type") ?? "").startsWith("application/json");
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin")) {
    if (!adminFromHeader(req.headers.get("authorization"))) {
      return new NextResponse("Authentication required", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Naija Rush admin", charset="UTF-8"' },
      });
    }
  }

  // CSRF: state changing API calls must come from our own origin. Payment
  // webhooks (Phase 4) are exempt and verified by signature instead.
  if (req.method !== "GET" && req.method !== "HEAD" && pathname.startsWith("/api/") && !pathname.startsWith("/api/webhooks/")) {
    if (!sameSite(req)) return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  }

  // Every visitor gets an anonymous session cookie so they can play
  // immediately. The token is random and carries no personal data.
  const existing = req.cookies.get(GUEST_COOKIE)?.value;
  if (existing) return NextResponse.next();

  const token = newToken();
  const headers = new Headers(req.headers);
  const cookieHeader = headers.get("cookie");
  headers.set("cookie", `${cookieHeader ? `${cookieHeader}; ` : ""}${GUEST_COOKIE}=${token}`);
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set(GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: ONE_YEAR,
  });
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|fonts/).*)"],
};
