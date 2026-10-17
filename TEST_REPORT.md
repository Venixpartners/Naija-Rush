# Test report

Run on 17 Oct 2026 (Phase 4 rerun the same day) against local PostgreSQL 16 with the same `naijarush` schema applied to Venix Platform.

| Layer | Command | Result |
| --- | --- | --- |
| Unit: rules engine, track fairness (30 seeds survivable), validation, codes, share links | `pnpm test` | 15 of 15 pass |
| Integration: run, challenge, referral, leaderboard, abuse cases against real Postgres | `pnpm test` | 6 of 6 pass |
| Integration: accounts, privacy export and delete, Paystack checkout, callback, webhooks (signatures, replays, refunds, renewals, cancel), rewarded ads, campaigns, admin roles | `pnpm test` | 16 of 16 pass |
| End to end over HTTP against the production build, two independent clients | `pnpm test:e2e` | 30 of 30 checks pass (adds sign in, link reuse, premium gate, checkout gate, forged webhook, events, export) |
| Headless Chromium with WebGL at 390x844 | scripted | Home, character select, run, crash, server verified result; no console errors |

## Performance note
The game ran at 2 to 14 fps here because this sandbox renders WebGL in software on a shared CPU with no GPU. That says nothing about phones. Real device testing on an affordable Android is the first launch task. Already in place: one draw call per road segment, instanced props, no shadows, capped pixel ratio, automatic resolution drop below 40 fps, and a data and battery saver mode.

## Not yet tested
A real Paystack test transaction (needs your test key), real sign in emails (needs Resend), a real ad network callback, physical devices, iOS Safari, real in app browsers, real link previews from WhatsApp and the other apps, load testing.

Phone sized screenshot of the runner picker confirms the two premium outfits show as locked for guests and link to the premium page.
