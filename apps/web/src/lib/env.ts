/**
 * Runtime configuration. Every value has a safe local default so the app runs
 * out of the box; production values come from the environment (see
 * ENVIRONMENT.md and .env.example). Secrets are never hardcoded for prod: the
 * app refuses to start in production with the development fallbacks.
 */
const DEV_SECRET = "dev-only-secret-change-me-dev-only-secret";

function secret(name: string): string {
  const v = process.env[name];
  if (v && v.length >= 32) return v;
  if (process.env.NODE_ENV === "production" && process.env.VENIX_ALLOW_DEV_SECRETS !== "1") {
    throw new Error(`${name} must be set to at least 32 characters in production.`);
  }
  return `${DEV_SECRET}:${name}`;
}

export const env = {
  get siteUrl() {
    return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get runTokenSecret() {
    return secret("RUN_TOKEN_SECRET");
  },
  get ipHashSalt() {
    return secret("IP_HASH_SALT");
  },
  get challengeTtlDays() {
    return Number(process.env.CHALLENGE_TTL_DAYS ?? 14);
  },
  get adminUser() {
    return process.env.ADMIN_USER ?? "";
  },
  get adminPassword() {
    return process.env.ADMIN_PASSWORD ?? "";
  },
  get snapAppId() {
    return process.env.NEXT_PUBLIC_SNAP_APP_ID ?? "";
  },
};
