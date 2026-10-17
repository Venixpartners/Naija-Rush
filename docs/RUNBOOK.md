# Naija Rush runbook

## Site is down or slow
1. Open https://naija-rush.vercel.app/api/health. `"db":"down"` means the database connection failed: check Supabase status, then `DATABASE_URL` in Vercel (password changed? pooler string, port 6543).
2. Vercel dashboard > naija-rush > Logs for runtime errors.
3. A bad release: Vercel > Deployments > pick the last good one > Promote to Production.

## Scores look wrong or someone is cheating
Every run is replayed on the server. Flagged and rejected runs are listed in `naijarush.score_submissions` with a reason. Hide a run or ban a nickname from /admin; every action is written to `naijarush.admin_audit_logs`.

## A player asks for their data or to be deleted
Signed in players can download or delete everything from their account page. For email requests, find the user in `naijarush.users` and use the same functions (`exportData`, `deleteAccount` in `lib/services/accounts.ts`).

## Payment problems (once payments are on)
/admin/payments shows payments, webhook events and mismatches. Paystack is the source of truth: a refund made in Paystack removes the item automatically through the webhook. Never grant items by editing tables by hand without an audit note.

## Retention job
Runs daily at 02:17 UTC. Each run writes a `retention.run` row to `naijarush.admin_audit_logs` with counts. To run it by hand: `curl -H "Authorization: Bearer $CRON_SECRET" https://naija-rush.vercel.app/api/cron/retention`.

## Rotating secrets
- `RUN_TOKEN_SECRET`: rotating ends runs in progress (players just tap play again).
- `IP_HASH_SALT`: rotating resets rate limits only.
- `CRON_SECRET`, `ADMIN_USERS`: safe to rotate any time.
Change in Vercel > Settings > Environment Variables, then redeploy.
