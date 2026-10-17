# Environment and setup

## What you need to provide

| Variable | Where to get it | Required for |
| --- | --- | --- |
| `DATABASE_URL` | Supabase > Venix Platform > Connect > Transaction pooler (port 6543). Needs the database password, which only you have. | Everything |
| `NEXT_PUBLIC_SITE_URL` | Your chosen domain, for example `https://naijarush.venixpartners.com` | Correct links on share cards |
| `RUN_TOKEN_SECRET` | `openssl rand -base64 48` | Run tokens. The app refuses to start in production without it. |
| `IP_HASH_SALT` | `openssl rand -base64 48` | Rate limiting. Same rule. |
| `CRON_SECRET` | `openssl rand -base64 48`. Vercel sends it to the daily retention job automatically | Data retention job |
| `ADMIN_USER`, `ADMIN_PASSWORD` | Choose them. Password at least 12 characters. | `/admin` |
| `ADMIN_USERS` | `name:password:role` entries separated by commas; roles are admin, moderator, finance; passwords at least 12 characters | `/admin` (the older `ADMIN_USER` and `ADMIN_PASSWORD` pair still works as a single admin) |
| `MAIL_PROVIDER`, `RESEND_API_KEY`, `MAIL_FROM` | `resend` plus a Resend API key and a verified sender, for sign in emails. Without them, accounts show "coming soon". | Accounts |
| `PAYSTACK_SECRET_KEY` | Paystack dashboard > Settings > API keys. Start with `sk_test_...` | Premium and outfits (also needs the `payments` flag on) |
| `ADS_CALLBACK_SECRET` | Shared secret from the chosen ad network's server side verification settings | Rewarded ads (also needs the `rewarded_ads` flag on) |

Optional: `CHALLENGE_TTL_DAYS` (default 14), `DATABASE_POOL_MAX` (default 5), `NEXT_PUBLIC_SNAP_APP_ID`, `NEXT_PUBLIC_SNAP_KIT_DISABLED`.

## Database

The `naijarush` schema is applied to the Venix Platform project (migrations `naijarush_init` and `naijarush_hardening`, reference data seeded). For a fresh database:

```bash
DATABASE_URL=... pnpm db:migrate
```

To change the schema: edit `packages/database/src/schema.ts`, run `pnpm --filter @venix/database generate`, review the SQL, apply it.

## Deploying to Vercel

1. Import the GitHub repository. Root directory: `apps/web`. Framework: Next.js. Install command: `pnpm install`.
2. Add the variables above for Production and Preview.
3. Point the domain at Vercel and set `NEXT_PUBLIC_SITE_URL` to match.
4. After the first deploy, open a challenge link in WhatsApp and check the preview.
5. In the Venix Clash project, set `NEXT_PUBLIC_NAIJA_RUSH_URL` to this site so its featured card links here.

## Local development

Any Postgres 15+ works. Create two databases (`naija_rush`, `naija_rush_test`), set `DATABASE_URL` in `apps/web/.env.local`, run `pnpm db:migrate` for each.

## Paystack setup (test mode first)

1. Create a monthly plan in the Paystack dashboard and put its plan code in `naijarush.products.provider_plan_code` for `premium_monthly`.
2. Set the webhook URL to `https://<your domain>/api/webhooks/paystack`.
3. Set `PAYSTACK_SECRET_KEY` (test key), then turn on the `payments` flag and set `active = true` on the products to sell:
   `update naijarush.feature_flags set enabled = true where key = 'payments';`
4. Buy with a Paystack test card, check `/admin/payments`, refund from the Paystack dashboard and confirm access is removed.
5. Only after commercial and legal sign off: switch to the live key.
