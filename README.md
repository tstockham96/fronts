# FRONTS ⚔️

**Play it: https://tstockham96.github.io/fronts/**

**100 troops. 5 fronts. Everyone who played today is your enemy.**

FRONTS is a 30-second daily strategy game: a daily
[Colonel Blotto](https://en.wikipedia.org/wiki/Blotto_game) battle against the whole crowd.
You split 100 troops across five forts worth ★1–★5. Against any rival, more troops on a fort
takes its stars and more stars wins. Your army fights *every* army submitted today, and your
score is the share of generals you beat. There's no safe army: if everyone stacks ★5, give it up
and take the rest. If everyone plays flat 20s, 21 beats 20. The game is reading the crowd.

It's not a word game and not a grid puzzle. The answer depends on what other people did, so it
can't be spoiled, and the share card shows *how* you did without giving away *what* you played.

```
FRONTS #88 ⚔️ Fog of War
Beat 72% of generals 🔨
★1🟩 ★2🟩 ★3🟥 ★4🟨 ★5🟩
Break my line 👉 https://tstockham96.github.io/fronts/#d=Xb91…
```

## What's in the box

| | |
|---|---|
| **Daily map** | Deterministic seed from the puzzle number. Fort order and names are shuffled daily, and a twist rotates in. Puzzle #N is identical worldwide. It flips at your local midnight, like other dailies. |
| **Twists** (`src/core/twists.ts`, data-driven) | Classic · Fog of War (one fort hidden, worth ★2–★5) · Fortress (ties on ★5 award **nothing**) · Supply Cap (max 40/front) · Twin Peaks (★1,2,3,5,5) · Cascade (+1★ per adjacent pair won) · Reinforcements (30+ troops fight as +5). Every block of 7 days shows each twist once, in a seeded order with no back-to-back repeats. |
| **Simulated crowd** (`src/core/crowd.ts`) | About 2,000 human-like armies per day from the seed: flat 20s, proportional, stack-the-big-ones, abandon-★1, hammers, minimal winning coalitions, concede-★5 flankers, level-2 counters (+1 over the stackers), round-number bias, twist-aware adaptations, and noise. The crowd fills up through the day, so your live rank moves until midnight. |
| **Reveal** | A roughly 3-second front-by-front battle against one random rival (cheapest fort first, ★5 last), then "Beat X% of generals", per-front win rates (🟩 >60%, 🟨 40–60%, 🟥 <40%), the average general, the most common army, the best army in hindsight (candidate search plus hill-climb over the pool), a one-line crowd hint, a player-type badge (🔨 Hammer, 🧱 Wall, 🎲 Gambler, 🐍 Flanker, 🧠 Strategist = top 10%), a countdown and tomorrow's twist. |
| **Friend duels** | The share link *is* a duel link. Your army is packed and XOR-obfuscated into the URL hash (or stored server-side when a backend is configured). Your friend has to commit before seeing it. Then there's an animated battle, a head-to-head breakdown, a "You & Maya: 3–1" record, and **Send it back** for a rematch link. Finished duels can't be re-rolled. |
| **Practice** | Unlimited, unranked runs against yesterday's map and crowd. |
| **Stats** | One ranked play per day per device, plus streak, best streak, average and best percentile, the last 14 battles, badge tallies and rival records (localStorage). |
| **Monetization stubs** | An ad-slot placeholder on the results screen, and a War Room upsell modal ($3.99/mo) behind `features.warRoom`. |
| **Analytics stub** | `track()` in `src/state/analytics.ts` fires `play_started`, `deployed`, `shared`, `duel_created`, `duel_opened`, `duel_completed`, `practice_started`, `warroom_opened` and `warroom_cta`. Events go to `window.__frontsEvents` and `dataLayer`, and are beaconed to the API if one is set. |
| **Feel** | Vintage war-map look: paper and topographic contours, stencil type, ink-stamped VICTORY/DEFEAT, chunky offset-shadow buttons. Hold-to-repeat steppers and draggable tracks, synthesized WebAudio sounds (mute in the header), haptics on Android. |

## Run, test, build

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # vitest: battle rules, twists, scoring, crowd determinism, duel codec, worker API
npm run typecheck
npm run build        # dist/ (static site) + dist-single/fronts.html (one self-contained file)
```

`dist-single/fronts.html` has all JS, CSS and fonts inlined and makes no network requests. Double-click it to play.

End-to-end checks with headless Chrome (playwright-core, uses the system Chrome; set `CHROME_PATH` if needed):

```bash
node scripts/play.mjs              # full ranked play, share text, duel round trip (2 browsers), practice, screenshots -> shots/
node scripts/twists-gallery.mjs    # fakes the clock to screenshot all 7 twists -> shots/extra/twists/
node scripts/local-api.mjs 8787 &  # run the Worker locally with an in-memory D1
node scripts/play-api.mjs          # same flow in backend mode (server-stored duels)
```

## Configuration

Set these at build time with env vars, or at runtime with `window.FRONTS_CONFIG = {...}` placed before the app script:

| Env | Runtime key | Default | |
|---|---|---|---|
| `VITE_PUBLIC_URL` | `publicUrl` | current page URL | Canonical URL used in share and duel links. **Set this in production.** |
| `VITE_API_URL` | `apiUrl` | *(empty = static mode)* | Optional Worker backend. |
| `VITE_FEATURE_WAR_ROOM=0` | `features.warRoom` | on | Hide the War Room upsell. |
| `VITE_FEATURE_ADS=0` | `features.ads` | on | Hide the ad slot. |

## Deploy

**GitHub Pages (this repo):** every push to `main` runs `.github/workflows/pages.yml`, which tests, builds and
deploys `dist/` to https://tstockham96.github.io/fronts/. The production settings live in `.env.production`
(`VITE_BASE=/fronts/`, `VITE_PUBLIC_URL=https://tstockham96.github.io/fronts/`). The single-file build always uses a
relative base and is also published at https://tstockham96.github.io/fronts/fronts.html.

**Other static hosts (no backend):** override the Pages defaults with
`VITE_BASE=/ VITE_PUBLIC_URL=https://your.domain/ npm run build`. Then upload `dist/`
to any static host: Cloudflare Pages, Netlify (drag-and-drop), Vercel, GitHub Pages or S3+CloudFront.
Routing is hash-based (`#d=…`), so no rewrites are needed. You can also just host the single `fronts.html`.

**Optional backend (Cloudflare Worker + D1)** in `worker/`:

```bash
cd worker
npx wrangler d1 create fronts                         # paste the database_id into wrangler.toml
npx wrangler d1 execute fronts --remote --file=schema.sql
npx wrangler deploy                                   # bundles ../src/core so scoring rules are shared
cd .. && VITE_API_URL=https://fronts-api.<you>.workers.dev VITE_BASE=/ VITE_PUBLIC_URL=https://your.domain/ npm run build
```

Endpoints: `POST /api/play` (stores the army and returns real armies plus a server-side score; first submission per
device wins), `GET /api/pool` (only after that device has played, so armies stay hidden until you submit),
`POST /api/duel`, `GET /api/duel/:id` (metadata only), `POST /api/duel/:id/fight` (reveals the challenger's army after you commit),
and `POST /api/event`. When a backend is set, real armies are blended into the pool and the simulated share fades out
(`sims = max(0, 2000 − 2·real)`). Every call has a static fallback.

## Monetization plan

The research is clear that buyers and subscribers pay for **habit and audience**, not code. So the plan is to protect the
daily loop first and monetize around it:

1. **Free daily + one tasteful ad slot** on the reveal screen (placeholder included). Later, a rewarded "re-scout" ad
   could unlock the full crowd histogram. Web ad revenue is small (about €1–2 per 1,000 plays), so this only covers hosting.
2. **War Room, $3.99/mo** (modal stubbed behind a flag): play any past day against that day's crowd ("what would have won
   #40?"), an army lab to test armies against today's pool after you play, heatmaps of where the world stacked, and private
   leagues. This follows the NYT Games / Puzzmo / GeoGuessr archive-and-depth model.
3. **Leagues for teams and communities**: a Slack/Teams bot that posts the office's daily standings. This is B2B-friendly
   ("team building in 30 seconds a day").
4. **Sponsored maps**: an "Election Night" map, a playoff map with team-branded forts, a brand's castles. Native
   sponsorship that doesn't feel like an ad.
5. **Licensing/acquisition**: a daily game with a sticky streak audience is a classic media acquisition target
   (Wordle → NYT, Immaculate Grid → Sports Reference).

Virality levers already built in: a spoiler-free share card whose link *is* a duel, sealed armies, rematch
links, rival records, live rank movement and a tease of tomorrow's twist.

## Project layout

```
src/core/      pure game logic (rng, date, twists, battle, scoring, crowd, insights, badge, share, duel codec)
src/state/     storage (localStorage), analytics stub, optional API client
src/ui/        Preact components (Deploy, Battle, Results, DuelResult, Modals), icons, sound
src/game.ts    glue: live pool, analysis, hindsight caching
tests/         vitest suites
worker/        optional Cloudflare Worker + D1 backend
scripts/       Playwright verification, twist gallery, local API runner
shots/         screenshots from the headless run (390×844)
```

## Known limitations

- Static-mode duel links are obfuscated, not encrypted. A determined player could decode a friend's army from the URL.
  Use the backend for tamper-proof duels and server-side scoring.
- In static mode "everyone who played today" is the simulated crowd, and your own army doesn't join the pool for other players.
- One ranked play per device is enforced by localStorage (or a client-generated device id with the backend), so
  clearing storage allows a replay. Real anti-abuse needs accounts or a signed device token.
