# Naija Rush launch checklist

Live preview: https://naija-rush.vercel.app (deployed 17 Oct 2026 from `main`; every push to `main` redeploys). Health check: https://naija-rush.vercel.app/api/health

## Done
- [x] Vercel project with root `apps/web`, secrets set, database connected through the Supabase transaction pooler.
- [x] Health check returns `{"ok":true,"db":"up"}` in production.
- [x] GitHub Actions CI on every push: type checks, unit and integration tests, production build, end to end run on a fresh database.
- [x] Daily data retention job scheduled (Vercel Cron, 02:17 UTC).
- [x] Payments, rewarded ads and email sign in switched off until their keys and sign off exist.

## Before telling the public
- [ ] Play a full run on a real affordable Android phone and an iPhone; send a challenge through WhatsApp, Snapchat, Instagram and TikTok and check each preview and link.
- [ ] Custom domain in Vercel, then update `NEXT_PUBLIC_SITE_URL` and redeploy.
- [ ] Legal review of the draft terms, privacy notice and community rules (NDPA 2023, FCCPC, ARCON).
- [ ] Reset the database password once more and update it in both Vercel projects (it passed through setup screens).
- [ ] Admin login works at /admin; store the password in a password manager.

## To switch on later
- [ ] Email sign in: Resend account, verified sender, `MAIL_PROVIDER=resend`, `RESEND_API_KEY`, `MAIL_FROM`.
- [ ] Payments: Paystack account, test key, monthly plan code, webhook URL `https://naija-rush.vercel.app/api/webhooks/paystack`, price sign off, then the `payments` flag (see ENVIRONMENT.md).
- [ ] Rewarded ads: choose a network with child appropriate settings, set `ADS_CALLBACK_SECRET`, then the `rewarded_ads` flag.
- [ ] Optional Snap Kit app ID for Snapchat share metrics.

Sister product: Venix Clash (https://venix-clash.vercel.app).
