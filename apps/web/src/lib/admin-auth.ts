/**
 * Admin identities and roles. Configured in the environment, not the
 * database, so a database compromise cannot mint an admin.
 *
 *   ADMIN_USERS="ada:long-password:admin,tunde:another-password:finance,kemi:third-password:moderator"
 *
 * The legacy ADMIN_USER / ADMIN_PASSWORD pair is treated as role "admin".
 * Passwords shorter than 12 characters are ignored. Runs on both the edge
 * (middleware) and Node, so it uses no Node only APIs.
 */
export type AdminRole = "admin" | "moderator" | "finance";

export interface AdminIdentity {
  user: string;
  role: AdminRole;
}

interface Entry extends AdminIdentity {
  password: string;
}

const ROLES: AdminRole[] = ["admin", "moderator", "finance"];

function entries(): Entry[] {
  const out: Entry[] = [];
  for (const raw of (process.env.ADMIN_USERS ?? "").split(",")) {
    const [user, password, role] = raw.trim().split(":");
    if (user && password && password.length >= 12 && ROLES.includes(role as AdminRole)) out.push({ user, password, role: role as AdminRole });
  }
  const u = process.env.ADMIN_USER;
  const p = process.env.ADMIN_PASSWORD;
  if (u && p && p.length >= 12 && !out.some((e) => e.user === u)) out.push({ user: u, password: p, role: "admin" });
  return out;
}

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Identity from a Basic auth header, or null. Constant time per entry. */
export function adminFromHeader(header: string | null): AdminIdentity | null {
  if (!header?.startsWith("Basic ")) return null;
  let decoded: string;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return null;
  }
  const i = decoded.indexOf(":");
  if (i < 0) return null;
  const user = decoded.slice(0, i);
  const password = decoded.slice(i + 1);
  let match: AdminIdentity | null = null;
  for (const e of entries()) {
    const ok = safeEqual(`${user}:${password}`, `${e.user}:${e.password}`);
    if (ok) match = { user: e.user, role: e.role };
  }
  return match;
}

/** Admin can do everything; others only their own area. */
export function can(identity: AdminIdentity | null, area: "operations" | "moderation" | "finance" | "campaigns"): boolean {
  if (!identity) return false;
  if (identity.role === "admin") return true;
  if (area === "operations") return true; // read only dashboards for every role
  if (area === "moderation") return identity.role === "moderator";
  if (area === "finance") return identity.role === "finance";
  return false;
}
