# Test report

Run on 17 Oct 2026 against local PostgreSQL 16 with the same `naijarush` schema applied to Venix Platform.

| Layer | Command | Result |
| --- | --- | --- |
| Unit: rules engine, track fairness (30 seeds survivable), validation, codes, share links | `pnpm test` | 15 of 15 pass |
| Integration: run, challenge, referral, leaderboard, abuse cases against real Postgres | `pnpm test` | 6 of 6 pass |
| End to end over HTTP against the production build, two independent clients | `pnpm test:e2e` | 20 of 20 checks pass |
| Headless Chromium with WebGL at 390x844 | scripted | Home, character select, run, crash, server verified result; no console errors |

## Performance note
The game ran at 2 to 14 fps here because this sandbox renders WebGL in software on a shared CPU with no GPU. That says nothing about phones. Real device testing on an affordable Android is the first launch task. Already in place: one draw call per road segment, instanced props, no shadows, capped pixel ratio, automatic resolution drop below 40 fps, and a data and battery saver mode.

## Not yet tested
Physical devices, iOS Safari, real in app browsers, real link previews from WhatsApp and the other apps, load testing.
