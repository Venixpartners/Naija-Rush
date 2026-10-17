# Decisions

## N1. Naija Rush is a separate product (owner decision, 17 Oct 2026)
Its own repository (Venixpartners/Naija-Rush), website and brand. Data lives in its own `naijarush` schema in the shared Venix Platform Supabase project. Venix Clash shows a featured card that links here. Code that both products need (anti cheat replay, challenges, share sheet, share cards, clips, attribution) was copied from Venix Clash at the split rather than published as shared packages; the two can now evolve independently. If they need to stay in lock step later, the `core`, `sharing` and `analytics` packages can be published privately and consumed by both.

## N2. Database: Venix Platform, schema `naijarush`
Same pattern as every other product there: RLS on every table with no policies, no access for `anon` or `authenticated`, server side access only.

## N3. Next.js 15.5 for the site and API
Server rendered challenge pages give link previews and a working button before JavaScript loads, which matters in WhatsApp and other in app browsers.

## N4. Babylon.js 9 for the 3D game
TypeScript first API and side effect free imports. The engine plus game ships as a ~198 KB (gzip) chunk that downloads only on `/play`, starting while the player reads the intro. Every prop and runner is built from primitives with baked vertex colours: no external models, textures or brand logos to license.

## N5. Fixed 60 Hz simulation, replayed on the server
Inputs are recorded as [tick, action] and replayed against the seed the server issued; that result is the score. Tracks are seeded and proved fair by a test autopilot that survives the full 60 seconds on every sampled seed while reacting with a human like delay. Shuffles use a seeded Fisher Yates, never `sort` with a random comparator, because browsers implement `sort` differently.

## N6. Endless mode is for fun only
Endless runs are verified but never rank and cannot create challenges. Their run tokens live 2 hours instead of 20 minutes.

## N7. Anonymous guests, hashed at rest
Play needs no sign up. Only a SHA256 hash of the session cookie is stored; IP addresses only as salted hashes for rate limiting.

## N8. CSRF check that works in social app webviews
`Sec-Fetch-Site` first, then `Origin`, then `Referer`, and as a last resort a JSON body requirement. Some in app browsers omit `Origin` on same origin requests.

## N9. Clips recorded on the device
A 720x1280 vertical clip of the run is recorded in the browser (MP4/H.264 where supported) with a Naija Rush watermark and score end card. Nothing is uploaded. On by default with a clear toggle; off in data saver mode and for endless runs.

## N10. Identity
Danfo yellow and black stripes and a Lagos sunset palette (indigo to pink to orange), distinct from Venix Clash's rainbow identity.

## N11. Accounts by email link, optional
No passwords to leak or reset. Links are single use, last 20 minutes, are stored only as hashes, and are consumed by a POST from a confirmation page so email scanners that prefetch links cannot burn them. Signing in attaches the current guest's runs and challenges to the account and rotates the session cookie, so an identifier known before sign in is useless after it. Accounts require a 13 plus confirmation; guests can always play. Rankings count one person once across devices.

## N12. Paystack, server verified, exactly once
Transactions are created by the server. Entitlements are granted only after the server verifies the transaction with Paystack's API (callback) or receives a webhook with a valid HMAC SHA512 signature, and only through a guarded state machine (a refunded payment can never return to success). Each webhook is recorded once by a unique key; repeats are acknowledged and ignored. Amount, currency and user are checked against our own record. Purchases need an 18 plus (or parent or guardian) confirmation. Payments run only when the `payments` flag is on and a key is configured. The provider sits behind a small interface so direct carrier billing can be added later, subject to operator and tariff approval; it is not implemented.

## N13. Premium and cosmetics change looks only
Premium outfits (Owambe Ada in gold aso ebi, Neon Tunde) reuse the same body, speed and hitbox as the free runners; only colours change. The rules engine and replay validator never see the outfit. Endless runs still never reach rankings, challenges or campaigns.

## N14. Rewarded ads are server verified and capped
The browser cannot grant a reward. Only a signed server to server callback from the ad network can (HMAC SHA256, timestamp within 10 minutes, nonce used once), once per day, for a 24 hour cosmetic. No ad network is chosen yet; the flag stays off.

## N15. Campaigns show rules before play and never take money
Sponsored and creator events have dates, rules and eligibility shown on their page before the play button, count only verified runs inside the window, and produce a sponsor report of measured numbers. Paid entry and chance based prizes are not supported; any prize needs legal review first.

## N16. Admin roles from the environment
`ADMIN_USERS` lists logins with roles (admin, moderator, finance). Finance pages and actions need finance or admin; moderation needs moderator or admin; campaigns need admin. Every privileged action is written to the audit log with the actor and role.
