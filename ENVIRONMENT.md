# Environment and setup

## What you need to provide

| Variable | Where to get it | Required for |
| --- | --- | --- |
| `DATABASE_URL` | Supabase > Venix Platform > Connect > Transaction pooler (port 6543). Needs the database password, which only you have. | Everything |
| `NEXT_PUBLIC_SITE_URL` | Your chosen domain, for example `https://naijarush.venixpartners.com` | Correct links on share cards |
| `RUN_TOKEN_SECRET` | `openssl rand -base64 48` | Run tokens. The app refuses to start in production without it. |
| `IP_HASH_SALT` | `openssl rand -base64 48` | Rate limiting. Same rule. |
| `ADMIN_USER`, `ADMIN_PASSWORD` | Choose them. Password at least 12 characters. | `/admin` |

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
