@AGENTS.md

# Hodo — project briefing

Hodo is a portfolio-quality AI travel planner (Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Zustand). You describe a trip in plain English and Claude builds a full day-by-day itinerary you can then drag/drop, edit inline, and price. Beyond generation it has: live budget with multi-currency conversion, an interactive Leaflet map, Open-Meteo weather per day, live flight/hotel prices, per-day titles, an export menu (PDF/Markdown/copy), and Checklist + Reservations tabs. The owner is non-technical — write the code, run the commands, explain in plain English, and ask before anything irreversible or money-costing.

## Architecture

- **Data model** (`src/lib/types.ts`): `TripPlan { days[], budget, preferences, assumptions?, liveData?, checklist?, reservations? }`; `Day { dayTitle?, activities[] }`; `Activity { cost, locked, ... }`. State is a Zustand store (`src/lib/store.ts`) with `persist` + `skipHydration` (localStorage key `wandr-v1`). Trip mutations go through store actions; the agent and the UI use the same paths.
- **New-trip entry** (`src/components/wizard/*`, `src/lib/wizard.ts`, `src/lib/data/*`): a full-screen **step-by-step wizard** (Typeform-style, 9 steps) replaces the old chat hero. It collects destination(s)/cities/days/dates/party/budget/interests/notes from **static datasets + local logic (zero AI)**, persists a draft in the store (`wizard` slice, survives refresh), then on completion maps into the EXISTING objects: `wizardToPreferences(draft)` → `draftPreferences`, and `composeWizardMessage(draft)` → **one** `sendMessage` call (step-8 free text is passed to the agent verbatim). Answered fields → chips sourced `message`/`preference` (solid); skipped → `inferred` (dotted). Auto-opens on a fresh start and via Header "New trip"; it sets `activeTripId=null` so generation creates a new trip. Everything below the wizard (itinerary, tabs, chat, live data) is unchanged.
- **Generation** (`src/app/api/chat/route.ts`, `src/hooks/useChatSend.ts`): the agent returns **structured JSON patches** after a `---WANDR-JSON---` marker (`action` + `trip`/`patch`), never prose the client parses. New trips use **chunked skeleton-first generation**: a fast empty-days skeleton renders immediately (shown as filling day-blocks on the wizard's generation step), then activities fill in 3-day batches. **Patches MERGE by day id — never replace the `days` array** (replacing collapses the trip to the batch). Streaming with 10s **heartbeats** + a 30s client watchdog; `maxDuration = 300` (needs Fluid Compute). **Model tiering** by request `intent`: Sonnet 4.6 (`full`) / Haiku 4.5 (`quick` edits); thinking disabled.
- **Provider wrapper** (`src/app/api/live-prices/route.ts`, `src/lib/providers/*`): one provider-agnostic endpoint → liteAPI (hotels) + Travelpayouts/Aviasales (flights, "indicative"). **Graceful degradation**: any failure/missing key returns empty/null → falls back to AI estimates, app never breaks. Cached on `trip.liveData`, refetched only when destination/dates/origin/accommodation change.
- **Currency** (`src/lib/currency.ts`): convert **at the aggregation boundary** using live ECB rates (Frankfurter, 24h cache, hardcoded fallback). `budget.currency` is the single source of truth; original local price shown as a muted secondary.
- **Locked cards**: protected from AI edits by a system-prompt rule **and** a client backstop (`preserveLockedActivities`). Manual inline edits **auto-lock** the card. Locked = protected from AI only; user can still drag/edit.
- **Feature flags / overrides**: `PLANNER_MODEL` / `QUICK_MODEL` env vars override the model tiers.

## Standing rules

1. **Definition of done** — every feature or fix ends with the full Playwright suite (`npx playwright test`) passing: (a) against a **local production build** (`npm run build` + `next start`, `BASE_URL` pointed at it) before "done"; (b) against the **live Vercel deployment** (`VERCEL_BYPASS=<token> BASE_URL=https://<deploy>.vercel.app npx playwright test`) before "shipped". A failing suite means unfinished. Extend the suite for new behaviour. (Real long-trip test is opt-in: `RUN_LONGTRIP=1`.)
2. **Evidence-first debugging** — reproduce with a test (or a probe) and confirm it fails *before* fixing. Reach real production early; let logged evidence, not local intuition, drive the diagnosis. Never guess-and-patch.
3. **Completion contract** — a task isn't "done" until it's actually complete (e.g. days-filled == days-promised). Partial/failed states must be **visibly partial** in the UI (explicit "didn't finish — retry"), never a silent success.

## Environment / providers

Server-side only, in `.env.local` (git-ignored) and Vercel **Settings → Environment Variables** for **Production + Preview + Development** (the recurring gotcha: Preview left unticked → prod key missing):
- `ANTHROPIC_API_KEY` (required — API credits, NOT the Claude subscription), `DEMO_PASSWORD` (optional password gate — covers pages AND `/api/*`, which return 401 JSON without the cookie), `LITEAPI_API_KEY` (hotels), `TRAVELPAYOUTS_TOKEN` + `TRAVELPAYOUTS_MARKER` (flights), optional `PLANNER_MODEL` / `QUICK_MODEL`. All AI/provider routes are per-IP rate-limited (`src/lib/rateLimit.ts`).
- Vercel: **Deployment Protection** is on (preview URLs 401 → tests use a Protection-Bypass token via cookie); **Fluid Compute** must be enabled for the 300s `maxDuration`. Non-AI, no key: Open-Meteo (weather), OpenStreetMap (map), Frankfurter (rates).

## Known patterns

- **Silent failures are the recurring bug species.** The "Enter reloads/clears chat" bug was a missing API key + a silent-gap disconnect; the "requested 10 days, got 3" bug was a patch that silently replaced (not merged) the days array. In both, the UI showed a broken partial state as if complete. Always surface failure/partial state explicitly and make it recoverable (Resume/retry).
- **Agent output is validated with one retry.** JSON parse is tolerant (balanced-object extraction); on a parse/validation/completion failure the request retries once with the error fed back to the model (self-correction) before surfacing an incomplete state.
