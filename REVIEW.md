# Hodo — Full Project Review (read-only audit)

**Date:** 2026-07-11 · **Scope:** entire repo at `33ea548` · **Method:** full code read, prompt/token measurement, `npm audit`, build inspection, existing Playwright evidence (24 passed / 1 gated on local prod and live). No code was changed; this file is the audit's only write.

---

## Executive summary

Hodo is a genuinely impressive solo-built portfolio app: coherent architecture, a well-designed agent contract with real failure-recovery, an unusually strong E2E testing culture, and a polished, distinctive UI. The engineering narrative (evidence-first debugging, chunked generation, graceful degradation) is its best asset and is real, not marketing.

The three most important issues:
1. **The LLM endpoints are effectively public.** `proxy.ts` deliberately exempts `/api/*` from the password gate and there is **zero rate limiting** — anyone with the URL can burn your Anthropic credits (300s × 24k-token Sonnet calls; `/api/enhance` runs **Opus 4.8**). The README explicitly claims the password prevents exactly this. It does not.
2. **Token waste in the fill loop.** Every fill batch re-sends the whole trip, pretty-printed, weather included — ~10k tokens for a 10-day trip, growing per batch. Compact + trimmed would cut input cost ~40–60% with no behaviour change.
3. **Docs have drifted from the code.** README env table, project structure, milestones, brand name ("Wandr" vs "Hodo"), a dead demo link, a missing LICENSE, and a false security claim — a hiring engineer would notice within five minutes.

Everything else is refinement, not rescue. The core is sound.

---

## Scorecard

| Area | Score | One-line justification |
|---|---|---|
| 1. Architecture & code quality | **7/10** | Clean layering and store discipline; docked for two 600+-line files, duplicated helpers, unused deps. |
| 2. Agent & AI layer | **7/10** | Excellent contract + recovery design; docked for token waste, injection exposure, undocumented Opus usage. |
| 3. Security & robustness | **3/10** | Keys handled correctly, but unauthenticated LLM endpoints with no rate limiting is a hole, not a nitpick. |
| 4. Performance | **6/10** | Fine at current scale; ~400KB static JSON in the client bundle and whole-store subscriptions re-rendering per stream chunk are real observations. |
| 5. UI/UX | **7/10** | Strong, consistent visual identity and thoughtful states; contrast/focus-visible/touch-target gaps and a mobile layout quirk. |
| 6. Feature completeness & coherence | **7/10** | Broad and mostly coherent; one orphaned feature, flights half-wired, several doc/code contradictions. |
| 7. Testing & process | **6/10** | E2E coverage of happy paths *and* failure paths is above-average; no unit layer, no CI, interaction gaps. |
| 8. Portfolio readiness | **6/10** | Compelling story and engineering notes; README inaccuracies and stale links undercut it. |

---

## 1 · Architecture & code quality

**Verdict: solid.** One store, all mutations through actions, no direct localStorage writes outside the persist middleware, a documented `wandr:*` event bus with **zero orphaned listeners/dispatchers** (verified pairing of all 5 events). The provider-wrapper and merge-by-id patterns documented in CLAUDE.md are actually followed in code.

- **[Medium] Two files are doing too much.** `PreferencesPanel.tsx` (668 lines) and `api/chat/route.ts` (589 lines — route handler + ~2.6k-token prompt + parsing + streaming in one file). *Why:* review and testability. *Rec:* extract the system prompt to `src/lib/prompts/` and split the panel into section components.
- **[Medium] Duplicated `editDistance()`** — identical bounded Levenshtein in `src/lib/data/countries.ts:44-60` and `src/lib/data/cities.ts:49-65`. *Rec:* one shared `lib/data/fuzzy.ts`.
- **[Medium] Test-helper duplication** — `grantBypass()`/`loadApp()` copy-pasted into all 8 spec files with small drift between copies (that drift already caused churn when the wizard replaced the hero). *Rec:* move to `tests/helpers/app.ts`.
- **[Low] Unused dependencies:** `date-fns`, `uuid`, `@types/uuid` are imported nowhere (`generateId()` uses `crypto.randomUUID`). Also `@types/leaflet`/`@types/uuid` sit in `dependencies` instead of `devDependencies`. *Rec:* remove/move.
- **[Low] Non-null assertions in drag paths** — `store.ts` `moveActivity` (`.find()!` ×3) and `ItineraryView.tsx:153,160`. Guaranteed by dnd-kit context today, but a corrupted persisted trip would throw. *Rec:* early-return guards.
- **[Low] Stale comment contradicts config:** `api/chat/route.ts:498` says "we run under Vercel Hobby's hard 60s function limit" while line 19 sets `maxDuration = 300` (and line 14 explains why). *Rec:* fix the comment — it misleads the next reader about *why* thinking is disabled.
- **TypeScript rigor is genuinely good:** zero `any`, zero `as unknown as`, zero `@ts-ignore` in `src/`. Rare for a project this size.
- **[Low] Naming drift:** brand is Hodo, but the storage key (`wandr-v1`), auth cookie (`wandr-auth`), event bus (`wandr:*`), JSON marker (`WANDR-JSON`), README title ("Wandr"), and repo name ("Wanderer-AI") all predate the rename. Internal keys are fine to keep (migration cost), but user-visible surfaces (README) should agree.

## 2 · Agent & AI layer

**Verdict: the contract design is the strongest part; the economics and injection surface are the weakest.**

- **Prompt quality:** the system prompt (~2,643 tokens measured) is well-structured and has accumulated **fewer contradictions than expected** across iterations. The action decision tree, locked-card rules, currency rules, and skeleton/fill mode blocks are mutually consistent. Two genuine drift spots: the "4–5 activities per day" default vs the fill-mode batches (harmless), and the stale 60s comment (above).
- **[High] Token inefficiency in the fill loop** (`api/chat/route.ts:466`): the trip is serialized with `JSON.stringify(trip, null, 2)` — measured **~40.8KB (~10.2k tokens) for a filled 10-day trip vs ~26.9KB compact, ~25.4KB compact without weather**. Worse, each fill batch re-sends the *entire* trip including already-filled days' full activity objects, so input tokens grow quadratically-ish with trip length across the ~N/3 batches. *Rec:* compact stringify, strip `weather` (never needed by the model), and in fill mode send filled days as one-line summaries (id/date/title) — the model only needs full detail for locked activities and the days being filled.
- **[High] Prompt injection is unmitigated.** `mustAvoid` (`route.ts:341`), custom interests, wizard notes, and — most subtly — **activity titles/descriptions fed back via the trip JSON in the system prompt** are all interpolated with no delimiters. Realistic blast radius is limited (no tools, single-user data, output re-validated as JSON), so this is High not Critical — but a pasted "activity" containing instructions can steer every subsequent edit. *Rec:* wrap user-originated strings in explicit delimiters and add one system-prompt line that delimited content is data, never instructions.
- **[Medium] `/api/enhance` breaks the documented model-tiering policy** (`enhance/route.ts:94-96`): hardcoded `claude-opus-4-8` with adaptive thinking — the most expensive call in the app, on a convenience feature, undocumented in CLAUDE.md ("Sonnet 4.6 / Haiku 4.5; thinking disabled") and not env-overridable like the other tiers. *Rec:* Haiku or Sonnet is plenty for prompt rewriting; add an env override and update CLAUDE.md.
- **Validation/retry robustness is genuinely good:** balanced-object JSON extraction, one self-correcting retry with the error fed back, completion contract (days-filled verified, not stream-success), batch resilience, skeleton validation, honest heartbeat liveness. This is the most mature LLM-integration layer I've seen at this project size.
- **[Low] `parseRequestedDays`** treats "N nights" as N days (acknowledged in its comment) — off-by-one against user intent; a 7-night request validates a 7-day skeleton instead of 8.
- **Right-sized model calls:** wizard/day-titles/checklist/export correctly use zero AI; chip edits correctly use the quick tier. No place found where the model is called unnecessarily.

## 3 · Security & robustness

**Verdict: keys are handled well; access control is the hole.** All provider keys are server-side only, never logged, never echoed (verified across routes, providers, scripts). React escaping covers XSS on user fields. Then:

- **[Critical] `/api/chat`, `/api/enhance`, `/api/live-prices` are unauthenticated even when `DEMO_PASSWORD` is set.** `proxy.ts:20-24` exempts `/api/*` by design (the comment claims "protected server-side by the Anthropic API key", which is not an auth mechanism). Combined with **no rate limiting anywhere**, anyone who discovers the URL can script unlimited Sonnet-300s and Opus calls against your billing. The README's "Sharing the URL" section (`README.md`, sharing/env sections) explicitly promises the password protects "from API credit abuse" — **the code contradicts the docs**. *Rec:* when `DEMO_PASSWORD` is set, return `401 JSON` (not a redirect — that was the original bug) from API routes lacking the cookie; add a simple per-IP limiter (Vercel KV/Upstash, or even an in-memory token bucket per instance as a first cut).
- **[High] No input validation or size limits on `/api/chat`** (`route.ts:437-449`): the body is cast, not validated; a multi-MB `messages`/`trip` payload flows straight into the Anthropic call. `/api/enhance` likewise has no length cap on `text`. *Rec:* zod schema + hard byte caps.
- **[Medium] The auth cookie IS the password** (`api/auth/route.ts:17`): `wandr-auth` stores the plaintext `DEMO_PASSWORD` value; comparison is `!==` (not timing-safe). HttpOnly/secure/sameSite are set correctly. Acceptable for a demo gate, but a stolen cookie = the secret itself. *Rec:* store an HMAC of the password instead; use `crypto.timingSafeEqual`.
- **[Low] Dependency audit:** 2 moderate advisories, both `postcss` via `next` itself (GHSA-qx2v-qp2m-jg93) — upstream, not actionable without a breaking downgrade; fine to document and ignore.
- **[Low] Malformed localStorage:** zustand's persist tolerates unparseable JSON (silent reset), but hand-edited *valid-JSON-wrong-shape* data (e.g. day without `activities`) will throw in components. Edge-case only.
- **What a clumsy user can break:** very little — degradation paths for providers, rates, weather, and generation are all handled. The abuse story, not the misuse story, is the risk.

## 4 · Performance (observations only)

- **[High] ~403KB of static JSON ships in the client bundle:** `generated/cities.json` (378.5KB) + `countries.json` (24.5KB) are statically imported by `src/lib/data/{cities,countries}.ts`, which the wizard imports eagerly. Gzip helps (~100–120KB est.) but it's paid by every visitor before any interaction. *Note for the optimisation pass:* dynamic-import the datasets when the wizard mounts, or precompute a trimmed search index.
- **[Medium] Whole-store subscriptions re-render on every SSE chunk:** `Header.tsx:18` and `Sidebar.tsx:70` use `useStore()` with no selector; `updateLastAssistantMessage` writes the store per streamed delta, so the header/sidebar re-render potentially dozens of times per second during generation. Cheap components today, but it's the app's hottest render path. *Note:* switch to selector-based subscriptions.
- **[Medium] `ItineraryView` recomputes trip-wide aggregations on every render** (`calculateTripBudgetConverted`, `detectTimingConflicts` per DayCard) without memoization — combined with the above, budget math runs per delta during generation.
- **[Low] Pretty-printed prompt JSON also inflates server egress/latency** (same fix as the token finding).
- **[Low] Build-phase animation load is well-managed** — shimmer/pulse are compositor-friendly (transform/opacity), typewriter avoids reflow by rendering the remainder invisibly. A 16-day build renders ~16 infinite CSS animations concurrently; fine on desktop, worth a quick low-end-device check in the optimisation pass.
- Measured route table: all pages static except API routes; no obvious oversized route. Leaflet is dynamically imported (good).

## 5 · UI/UX

**Verdict: cohesive and often delightful; the gaps are accessibility hygiene, touch affordances, and one mobile layout quirk.** (Objective unless marked *taste*.)

- **[High] Contrast failures:** `#444` on `#0a0a0a` ≈ 2.5:1 and `#333` worse, used for *meaningful* text — day dates (`DayCard.tsx:108`), activity meta chips (`ActivityCard.tsx:282-287`), calendar weekday headers (`Calendar.tsx`), login placeholder. WCAG AA wants 4.5:1. *Rec:* reserve `#444` for decoration; lift informational secondary text to ≥`#777`.
- **[High] No `:focus-visible` styles anywhere** (zero matches in the codebase) — keyboard users navigate blind. One global rule fixes it.
- **[Medium] Hover-only affordances are invisible on touch:** day-title pencil (`DayCard.tsx:96` — `md:opacity-0 md:group-hover:opacity-100`), "Mark as reserved", trip-delete in the header dropdown, checklist drag/delete. The Reservations empty state even instructs users to tap a button they can't see. *Rec:* always-visible on `<md`, or an explicit overflow menu.
- **[Medium] Mobile layout: chat covers the itinerary.** The chat panel is `w-full md:w-[380px]` beside a `flex-1` main (`AppShell.tsx`) — at phone width with chat open (the default state) the itinerary is squeezed out entirely; a first-time mobile user lands "in chat" with no itinerary visible until they find Close. *Rec:* overlay/sheet pattern or default-closed below `md`.
- **[Medium] First-run wizard has no visible exit** (`Wizard.tsx` — Close renders only when `returnTripId` exists). Intentional for fresh starts, but users who change their mind have no affordance and Escape isn't wired. *Rec:* always show Close/"Start over".
- **[Medium] Reduced-motion is inconsistent:** all custom CSS animations and Typewriter/CountUp respect it (good), but every framer-motion transition (wizard slides, day-card stagger, toasts, chat bubbles) ignores `useReducedMotion()`.
- **[Low] Native `confirm()` for trip deletion** (`Header.tsx:48`, `Sidebar.tsx`) — jarring against the design system, and the only destructive action without a styled treatment.
- **[Low] Small touch targets:** pencil/lock icons are 20×20px effective.
- **[Low] Copy drift:** Header vs Sidebar empty states use different phrasing for the same state; both still say "start a conversation" although the entry flow is now the wizard.
- **[Low] Scaffold day-count can overpromise:** when the days step is skipped, the Phase-1 scaffold still renders 7 shimmer day blocks (`scaffoldFromDraft` fallback) while the model may legitimately choose a different length; the correction happens on skeleton arrival. Momentary, but visible.
- ***Taste:*** the drifting pills read charming on desktop, busy at small widths; the wizard footer "Continue" on unanswered steps (grey but enabled) blurs Continue-vs-Skip semantics; country flags render as letter codes on Windows (platform limitation, already known).

## 6 · Feature completeness & coherence

- **[Medium] Orphaned feature: `suggestions`.** `AgentSuggestion` types, three store actions (`dismissSuggestion`/`addSuggestion`/`clearDismissedSuggestions`), and a Sidebar badge count exist — but **no component ever creates or renders suggestions** (verified: zero usages of the actions). Dead surface area misleading to readers. *Rec:* delete it or build the panel.
- **[Medium] Flights are half-live.** The Travelpayouts adapter is complete and graceful, but `TRAVELPAYOUTS_TOKEN` was never provisioned, so the "indicative flight prices" feature has never run against real data; the UI permanently shows the "add a flying-from city" hint on trips that have one but no token. *Rec:* provision the token or mark the feature experimental in README.
- **[Medium] README/code contradictions:** env-var table lists only 2 of 6 variables (missing `LITEAPI_API_KEY`, `TRAVELPAYOUTS_*`, `PLANNER_MODEL`/`QUICK_MODEL` — CLAUDE.md documents them; README doesn't); "Sharing the URL" security claim is false (see §3); project-structure tree misplaces `proxy.ts` under `app/` and omits recent modules; the milestones table ends at "Deploy to Vercel" — roughly ten shipped features ago.
- **[Low] Discoverability gaps:** agent settings (gear in chat header), per-card lock, "Mark as reserved", and the checklist templates are all invisible until stumbled upon. A short "tips" surface or first-trip tour would pay off. (Feature exists / undiscoverable — not missing.)
- **[Low] `WIZARD_STEPS` still contains `'generate'`** and the progress bar counts "of 9" though step 9 can never render (`Wizard.tsx` returns null for it) — a remnant of the replaced loading screen. Harmless, mildly confusing to both users ("Step 8 of 9" then done) and readers.
- **Coherence positives worth stating:** currency handling is genuinely one-source-of-truth end-to-end; locked-card semantics are enforced in three consistent layers; the wizard→chips→preferences→prompt pipeline is a single coherent data flow with no duplicated state.

## 7 · Testing & process

**Honest coverage assessment.** 9 spec files, ~1,473 test LOC vs ~10,796 src LOC.

- **Well covered (E2E):** entry flow + wizard (7 tests incl. fuzzy search, country-filter, computed dates), chunked-generation resilience *including deliberate mid-generation failure and resume* (rare and valuable), the live construction experience incl. DOM-parity and reduced-motion, popover positioning incl. mobile width, export/tabs/reservations with a zero-AI-calls guard, live prices incl. degradation, interrupted streams, one real-API full generation. Failure paths are tested, not just happy paths — above industry norm for a portfolio project.
- **Untested:** drag-and-drop (both intra- and cross-day), manual inline edit + auto-lock, lock survival through a real agent edit (`preserveLockedActivities` has no direct test), timing-conflict detection, checklist reorder, BudgetPanel math, map pins, weather badges, currency-switch conversion correctness, **all pure functions** (`recalculateDay`, `convertAmount`, `composeWizardMessage`, `parseRequestedDays`, `extractJsonObject` — the highest-value/lowest-cost tests absent for want of a unit runner), and all API-route logic in isolation.
- **[High] No CI.** No `.github/`; the excellent standing rule ("full suite local + live before done/shipped") is enforced only by discipline. One workflow running build + the mocked spec subset on push would institutionalize it.
- **[Medium] Flakiness patterns:** `{ force: true }` clicks bypass actionability on animated pills (masks real overlap bugs); scattered `waitForTimeout`s; `fullyParallel: false` hides cross-test state assumptions; live-prices spec depends on external services' availability.
- **Process observation:** the recurring bug species documented in CLAUDE.md (silent partial states) was ultimately caught only when a *mocked client-path* test replaced Node-side replications — the lesson is codified, which is to the project's credit. The absent unit layer is the remaining process gap: several shipped bugs (timezone off-by-one in `addDays`, days-array replacement) lived in pure functions a unit test would have caught in seconds.

## 8 · Portfolio readiness

**What a hiring engineer would praise:** the Engineering Notes section (README:111-117) — a real production-debugging war story with measurements; commit messages that read like changelogs; the graceful-degradation discipline; structured-patch agent contract; failure-path E2E tests; zero-`any` TypeScript; CLAUDE.md as a genuinely accurate briefing (it is — verified against code, with the one exception noted in §2).

**What they would flag:**
- **[High] README title says "Wandr", app says "Hodo"**, and the **live-demo link points to a stale hash deployment** (`wanderer-oklcy299w-...`, password-gated/superseded) instead of `wanderer-ai.vercel.app`. First-impression killers, 5-minute fixes.
- **[Medium] "MIT" license claimed, no LICENSE file exists.**
- **[Medium] The false security claim** (§3) — worse than no claim in a review context.
- **[Low] No screenshots/GIF** of the app's strongest visual moments (wizard, live construction) in the README; the features table undersells what the generation experience actually looks like.
- **[Low] Stale structure/milestones sections** (§6).

---

## Top 10 recommendations (value ÷ effort, highest first)

| # | Recommendation | Effort | Payoff |
|---|---|---|---|
| 1 | **Gate `/api/*` behind the auth cookie (401 JSON) + minimal per-IP rate limit** | ~half a day | Closes the only Critical; makes the README claim true; caps worst-case spend |
| 2 | **README truth pass:** title→Hodo, fix demo link, full env table, LICENSE file, correct security wording | ~1 hour | Removes every first-impression flag for reviewers |
| 3 | **Compact + trim the prompt trip JSON; summarize already-filled days in fill mode** | ~half a day | 40–60% input-token cut on every generation; faster fills |
| 4 | **Delimit user text in prompts** (mustAvoid, notes, interests; one guardrail line for trip JSON) | ~2 hours | Kills the practical injection paths cheaply |
| 5 | **Add a unit runner (vitest) + tests for the pure libs** (recalculate, currency, wizard, extractJsonObject, parseRequestedDays) | ~1 day | Catches the exact bug class that has recurred; near-zero flake |
| 6 | **GitHub Actions CI:** build + mocked Playwright subset on push | ~2 hours | Institutionalizes the standing rule; adds a green badge |
| 7 | **Accessibility quick wins:** global `:focus-visible`, lift `#444`→`#777` for informational text, aria-labels on icon buttons | ~half a day | WCAG AA basics; visible care in review |
| 8 | **Dynamic-import the wizard datasets** (or server-side search endpoint) | ~2 hours | ~400KB off the initial bundle for every visitor |
| 9 | **Touch/mobile pass:** always-visible card actions on small screens, chat as overlay/default-closed on phones, styled delete confirm | ~1 day | Fixes the worst first-time mobile experience |
| 10 | **Hygiene sweep:** remove `suggestions` surface or implement it, drop unused deps, dedupe `editDistance` + test helpers, fix the stale 60s comment, drop the phantom 9th wizard step | ~half a day | Less misleading code for every future reader (human or AI) |

---

## What is genuinely good

- **The failure-handling philosophy is real and consistent.** Completion contract, batch resilience, self-correcting retry, honest heartbeat "still working…" states, per-day retry cards, interrupted-state preservation — most production apps don't handle LLM failure this thoroughly, let alone portfolio apps.
- **The agent contract** (typed actions, marker-separated JSON, balanced-object extraction, merge-by-id patches, three-layer locked-card protection) is a textbook-quality pattern for LLM-driven state mutation.
- **Graceful degradation everywhere:** every external dependency (hotels, flights, rates, weather, even the AI itself) has a designed fallback; the app has no hard external dependency except the Anthropic key.
- **E2E tests that assert failure behaviour** (simulated mid-generation batch failure → other days continue → resume completes) — this is the strongest part of the test suite and rarer than it should be.
- **The documentation culture:** CLAUDE.md is an accurate, current briefing; commit messages explain *why*; the README's engineering notes narrate a real diagnosis with numbers. The docs drift found in this review is mostly in the *older* sections — the habit is good, the backfill lagged.
- **Zero-`any` TypeScript across ~10.8k lines**, disciplined state management, and a visual identity applied so consistently that the wizard, construction experience, and trip view read as one product.

*End of review.*
