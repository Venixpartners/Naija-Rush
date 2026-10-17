# Naija Rush: Survive Lagos

**If you can survive Lagos, you can survive anywhere.** A free 3D runner by Venix Partners Limited, played in the browser with no download. Dodge danfos, keke and food carts, jump potholes and flooded puddles, slide under market canopies, and send your score to friends on WhatsApp, Instagram, TikTok or Snapchat. Whoever opens the link runs the exact same street.

Naija Rush is its own product with its own site and brand. Venix Clash links to it as a featured game.

## Run it locally

```bash
pnpm install
cp .env.example apps/web/.env.local          # then fill in values
pnpm db:migrate                               # creates the naijarush schema and seeds reference data
pnpm dev                                      # http://localhost:3001
```

Tests:

```bash
pnpm test                                     # unit + integration (Postgres at TEST_DATABASE_URL)
pnpm build && pnpm start &                    # then in another shell:
pnpm test:e2e                                 # HTTP end to end challenge loop
```

## Layout

| Path | What lives there |
| --- | --- |
| `apps/web` | Next.js site: home, `/play`, challenge pages `/c/{code}`, `/leaderboards`, API, `/admin` |
| `packages/core` | Seeded RNG, the 60 Hz rules engine, server replay validation, challenge helpers, moderation, test autopilot |
| `packages/game-3d` | Babylon.js renderer, Lagos props and runners built in code, input and camera |
| `packages/database` | Drizzle schema (`naijarush`), SQL migrations, reference seed data |
| `packages/sharing` | Share links, copy, per platform guidance, vertical clip recorder |
| `packages/analytics` | Event vocabulary |
| `scripts` | End to end acceptance test |

Shared engineering (anti cheat, challenges, sharing, clips) started as a copy of the Venix Clash codebase at the split on 17 Oct 2026; see `DECISIONS.md`.
