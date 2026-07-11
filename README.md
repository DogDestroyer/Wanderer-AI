# Hodo — AI Travel Planner

> A portfolio-quality AI travel planning app. Answer a few questions in a step-by-step wizard (or just describe your trip) and watch a full day-by-day itinerary build itself live — then drag, drop, and edit it in real time.

**[→ Live demo](https://wanderer-ai.vercel.app/)**

[![CI](https://github.com/DogDestroyer/Wanderer-AI/actions/workflows/ci.yml/badge.svg)](https://github.com/DogDestroyer/Wanderer-AI/actions/workflows/ci.yml)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Claude](https://img.shields.io/badge/Powered%20by-Claude%20AI-orange)](https://anthropic.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)

---

## Features

| Feature | Details |
|---|---|
| 🧭 **Step-by-step planning wizard** | A full-screen, one-question-per-screen wizard (Typeform-style) is the new-trip entry: pick countries/cities, days, dates, party, budget, and interests from curated static data (zero AI), then Hodo builds the plan. Skipped steps become AI-inferred assumptions you can correct later. |
| 🤖 **AI itinerary generation** | The wizard's answers become a single request to Claude, which builds a full day-by-day plan — every activity structured with times, costs, and travel estimates. In-trip, keep chatting to refine it. |
| ✏️ **Drag & drop editing** | Reorder activities within a day or move them between days. Timing conflicts surface automatically. |
| 💰 **Live budget tracker** | Every activity carries a cost estimate. Daily totals and a trip cap update in real time as you edit. |
| 🗺️ **Interactive map** | All activities plotted on an OpenStreetMap tile layer with numbered markers, color-coded day routes, and animated polylines. |
| 🌤️ **Live weather forecasts** | Open-Meteo fetches a 16-day forecast for the trip's location. Each day card shows high/low temps + precipitation. Outdoor activities on rainy days trigger an inline swap suggestion. |
| 🎚️ **Pace & budget sliders** | Adjust trip pace (relaxed → packed) and budget style (shoestring → luxury) — the AI re-plans the entire trip around your preferences. |
| 🔒 **Activity locking** | Lock any activity before asking the AI to regenerate. Locked items are never removed or moved. |
| ⋯ **Day quick actions** | One tap per day: regenerate, make it cheaper, make it more relaxed, or ask for one extra suggestion — routed through the same AI pipeline (and undoable). |
| 🔗 **Read-only share links** | Share an immutable snapshot of any trip at `/t/{id}` — clean public page with itinerary, budget, map, booking links and OG previews. No login needed to view. |
| 🍞 **Toast notifications** | Framer Motion–animated toasts confirm actions (re-plan triggered, trip saved, etc.). |

---

## Tech Stack

### Frontend
- **[Next.js 16](https://nextjs.org/)** — App Router, React Server Components, Turbopack
- **[React 19](https://react.dev/)** — Concurrent features, `useCallback`, `useRef`
- **[TypeScript 5](https://www.typescriptlang.org/)** — Strict mode throughout
- **[Tailwind CSS v4](https://tailwindcss.com/)** — `@import "tailwindcss"`, no config file
- **[Framer Motion 12](https://www.framer-motion.com/)** — Page transitions, stagger animations, toast system
- **[Zustand 5](https://zustand-demo.pmnd.rs/)** — Global state with `persist` + `skipHydration`
- **[@dnd-kit](https://dndkit.com/)** — Drag & drop with `SortableContext`, cross-container moves
- **[React Leaflet 5](https://react-leaflet.js.org/)** — SSR-disabled map via `next/dynamic`
- **[Lucide React](https://lucide.dev/)** — Icon system

### Backend / APIs
- **[Anthropic Claude API](https://docs.anthropic.com/)** — `claude-opus-4-8`, streaming responses, structured JSON output
- **[Open-Meteo](https://open-meteo.com/)** — Free weather API, no key required, CORS-enabled
- **[OpenStreetMap](https://www.openstreetmap.org/) + [OpenTopoMap](https://opentopomap.org/)** — Free map tiles, no key required

### Infrastructure
- **[Vercel](https://vercel.com/)** — Zero-config deployment, Edge Middleware for auth
- **`HttpOnly` cookie auth** — Optional demo password gate, 30-day session

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (CSR)                           │
│                                                                 │
│  AppShell                                                       │
│  ├── Header          (trip title, tabs: Itinerary / Map)        │
│  ├── Sidebar         (trip list, new trip, delete)              │
│  ├── ItineraryView   (day cards, DnD context, sliders)          │
│  │   └── DayCard[]   (weather chip, activity list, rain banner) │
│  │       └── SortableActivityCard → ActivityCard                │
│  ├── MapPanel        (dynamic import, ssr: false)               │
│  │   └── TripMap     (Leaflet markers, polylines, popups)       │
│  └── ChatPanel       (streaming messages, wandr:* events)       │
│                                                                 │
│  Zustand store  ←──────── localStorage (persist)               │
│  ├── trips{}          TripPlan (days[], activities[], weather)  │
│  ├── chatHistory{}    ChatMessage[] keyed by tripId             │
│  └── activeTripId                                               │
└──────────────────────────────┬──────────────────────────────────┘
                               │  fetch /api/chat  (SSE stream)
┌──────────────────────────────▼──────────────────────────────────┐
│                      Next.js API Route                          │
│                      src/app/api/chat/route.ts                  │
│                                                                 │
│  1. Receive messages[] + trip context                           │
│  2. Call Anthropic SDK  (claude-opus-4-8, streaming)            │
│  3. Stream delta chunks → client as SSE  data: {type,text}      │
│  4. On stream end: parse ---WANDR-JSON--- marker                │
│  5. Emit  data: {type:"done", response: AgentTripResponse}      │
│                                                                 │
│  AgentTripResponse:                                             │
│  { action: "create"|"patch"|"none", trip?, patch?, message }   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                      Anthropic Claude API                       │
│  Model: claude-opus-4-8   Streaming: true                       │
│  System prompt instructs JSON schema compliance + field rules   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**Streaming with structured output** — The API route streams Claude's text to the chat bubble in real time, then parses a `---WANDR-JSON---` marker at the end of the stream to extract the structured trip data. This gives instant visual feedback while still delivering reliable machine-readable output.

**Custom DOM events as a decoupled event bus** — Components that need to communicate across the tree (e.g., a rain banner in a day card triggering a pre-filled chat message) use `document.dispatchEvent` / `document.addEventListener` with namespaced `wandr:*` events. No prop drilling, no context coupling.

**`handleSendRef` pattern for stale closures** — `ChatPanel`'s `handleSend` function is wrapped in `useCallback` and also stored in a `useRef`. Event listeners for `wandr:send-message` always call `handleSendRef.current` so they access the latest closure without needing to be re-registered.

**Weather fetched once per trip+date key** — `useWeather` keeps a `Set<string>` keyed on `tripId::startDate::endDate` inside a `useRef` so it never fires more than once per unique trip window, surviving re-renders and React Strict Mode double-invocations.

**Zustand `skipHydration`** — The store uses `skipHydration: true` so Next.js SSR renders a loading skeleton instead of stale localStorage data, then hydrates on the client without a flash of wrong state.

---

## Engineering notes

A production-only bug made pressing Enter look like the page reloaded and wiped the chat — but only on Vercel, never locally. Rather than guess, we built a parameterised Playwright reproduction and ran it against dev, a local production build, and the live deployment, cross-checked with Vercel function logs and direct stream probes. The evidence surfaced two distinct causes in sequence: first the serverless function was being killed by its duration limit mid-generation; then, after raising `maxDuration` to 300s, a subtler one appeared — the itinerary JSON streams *after* the chat preamble with no bytes on the wire, so the connection sat silent for ~267s on a 16-day trip and intermediaries dropped it even though the function kept running. Two fixes closed it: a 10-second keepalive heartbeat cut the worst on-wire silence from ~267s to 10.3s, and skeleton-first chunked generation (a fast empty-days structure, then activities filled in 3-day batches) brought the slowest single request from 269s down to 82.3s against the 300s ceiling. A full 16-day trip now completes with 105 activities and zero interruptions. The lesson held throughout: reach real production early and let logged evidence, not local intuition, drive the diagnosis.

Live travel pricing is sourced behind a single provider-agnostic wrapper so the UI, agent contract, caching, and currency conversion never change when the source does — when Amadeus Self-Service was sunset and closed registration, swapping to liteAPI for hotels and Travelpayouts (Aviasales) for flights touched only the source adapters.

A few architecture decisions underpin the app. The agent returns **structured JSON patches** (typed `action` + `trip`/`patch`), not prose the client has to parse, so edits apply deterministically. **Locked cards** are protected from AI changes by both a system-prompt rule and a client-side backstop, and any manual edit **auto-locks** the card so the model never overwrites a human change. All money is converted to the trip's display currency **at the aggregation boundary** via live ECB rates, so mixed-currency days total correctly and the original local price stays visible. And the agent runs on **model tiering** — Sonnet 4.6 for full trip generation, Haiku 4.5 for small partial edits — chosen per request by an `intent` flag.

---

## Project Structure

```
src/
├── proxy.ts                    # Middleware — login redirect for pages, 401 for API routes
├── app/
│   ├── api/
│   │   ├── auth/route.ts       # POST /api/auth — validates DEMO_PASSWORD, sets cookie
│   │   ├── chat/route.ts       # POST /api/chat — Anthropic streaming proxy (rate-limited)
│   │   ├── enhance/route.ts    # POST /api/enhance — prompt enhancer
│   │   └── live-prices/route.ts# POST /api/live-prices — liteAPI hotels + Travelpayouts flights
│   ├── login/page.tsx          # Password gate (only shown when DEMO_PASSWORD is set)
│   ├── globals.css             # Tailwind v4 import + design tokens + utility classes
│   ├── layout.tsx              # Root layout (Geist font, metadata)
│   └── page.tsx                # Renders <AppShell />
│
├── components/
│   ├── chat/
│   │   └── ChatPanel.tsx       # Streaming chat UI, wandr:* event bus integration
│   ├── itinerary/
│   │   ├── ActivityCard.tsx    # Single activity display + TravelConnector
│   │   ├── DayCard.tsx         # Day header, weather chip, rain banner, activity list
│   │   ├── ItineraryView.tsx   # Tab shell, DnD context, stagger animations
│   │   └── SortableActivityCard.tsx  # dnd-kit sortable wrapper
│   ├── layout/
│   │   ├── AppShell.tsx        # Root layout shell, useWeather hook
│   │   ├── Header.tsx          # Trip title + tab switcher
│   │   └── Sidebar.tsx         # Trip list with create/delete
│   ├── map/
│   │   ├── MapPanel.tsx        # SSR-safe dynamic wrapper
│   │   └── TripMap.tsx         # Leaflet map, markers, polylines, FitBounds
│   ├── preferences/
│   │   └── PreferenceSliders.tsx  # Pace + budget sliders, Apply button
│   ├── wizard/                 # Full-screen new-trip wizard (replaces the hero)
│   │   ├── Wizard.tsx          # Shell: progress, back/skip, slide transitions, keyboard
│   │   ├── WizardKit.tsx       # NumberStepper, PillButton, TokenSearch, SelectableCard
│   │   ├── FloatingPills.tsx   # Drifting selectable pills (steps 1 & 7)
│   │   └── steps/              # Step1–9 (countries…notes, generation)
│   └── ui/
│       └── Toast.tsx           # ToastContainer + showToast helper
│
├── hooks/
│   └── useWeather.ts           # Fetch + cache weather for active trip
│
└── lib/
    ├── store.ts                # Zustand store — trips, chat, preferences, wizard draft
    ├── wizard.ts               # Wizard draft model, composeWizardMessage(), wizardToPreferences()
    ├── data/                   # Static countries + cities datasets (no API/AI)
    ├── types.ts                # TripPlan, Activity, ChatMessage, WeatherForecast, …
    └── utils.ts                # cn(), formatTime(), getPaceLabel(), getBudgetLabel(), …
```

---

## Local Development

### Prerequisites
- Node.js 20+
- An [Anthropic API key](https://console.anthropic.com)

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/DogDestroyer/Wanderer-AI.git
cd Wanderer-AI

# 2. Install dependencies
npm install

# 3. Create your local env file
cp .env.local.example .env.local
# Open .env.local and paste your Anthropic API key

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No password is required locally — the demo gate only activates when `DEMO_PASSWORD` is set in your Vercel environment variables.

---

## Deploying to Vercel

### 1. Push to GitHub

```bash
# Create a new repo on github.com, then:
git remote add origin https://github.com/DogDestroyer/Wanderer-AI.git
git push -u origin master
```

### 2. Import to Vercel

1. Go to [vercel.com/new](https://vercel.com/new) → **Import Git Repository**
2. Select your `Wanderer-AI` repo — Vercel auto-detects Next.js, no settings to change
3. Expand **Environment Variables** and add:

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-...` (your real key) |
| `DEMO_PASSWORD` | Any passcode you want (e.g. `hodo2026`) |

4. Click **Deploy**

Vercel runs `npm run build` (which includes the prebuild script) and deploys automatically. Every `git push` to `master` triggers a new deployment.

### 3. Sharing the URL

Anyone who visits your Vercel URL sees a password prompt. They enter the `DEMO_PASSWORD` you set and the full app unlocks for 30 days via an `HttpOnly` cookie. The gate covers both the pages **and** the API routes (`/api/*` return `401` without the cookie), and every AI/provider endpoint is additionally rate-limited per IP — so a leaked URL can't silently burn your Anthropic credits.

---

## Environment Variables

Set these in `.env.local` (local dev) and in Vercel → Settings → Environment Variables for **Production + Preview + Development**:

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ Yes | Your Anthropic API key — [console.anthropic.com](https://console.anthropic.com) (API credits, separate from a Claude subscription) |
| `DEMO_PASSWORD` | ⬜ Optional | Password gate for the public deployment (pages **and** API routes). Leave unset in local dev. |
| `LITEAPI_API_KEY` | ⬜ Optional | Live hotel nightly rates via [liteAPI](https://liteapi.travel). Unset → hotels fall back to AI estimates. |
| `TRAVELPAYOUTS_TOKEN` | ⬜ Optional | Indicative flight prices via [Travelpayouts](https://travelpayouts.com) (Aviasales data). Unset → flights fall back to AI estimates. |
| `TRAVELPAYOUTS_MARKER` | ⬜ Optional | Travelpayouts affiliate id, used in booking deep links. |
| `PLANNER_MODEL` / `QUICK_MODEL` | ⬜ Optional | Override the model tiers (defaults: Sonnet 4.6 for full generation, Haiku 4.5 for quick edits). |
| `BLOB_READ_WRITE_TOKEN` | ⬜ Optional | Powers read-only share links (`/t/{id}`). Auto-provisioned when you enable **Blob** on the Vercel project (Storage → Create → Blob). Unset → sharing is disabled gracefully (local dev uses an in-memory store). |

---

## Milestones

Built milestone-by-milestone with [Claude Code](https://claude.ai/code):

| # | Milestone | Commit |
|---|---|---|
| 1–2 | Project scaffold, data model, app shell | `9d66b20` |
| 3–6 | AI chat, itinerary view, drag & drop, budget tracker | `3c5df0c` |
| 7 | Interactive map (Leaflet + OpenStreetMap) | `cb4fabd` |
| 8 | Live weather forecasts (Open-Meteo) | `45f66ca` |
| 9 | Pace & budget sliders with AI re-planning | `19db79c` |
| 10 | Polish — animations, toasts, micro-interactions | `123f3c4` |
| 11 | Deploy to Vercel + README | `ac8c77c` |
| 12 | Chunked skeleton-first generation + heartbeats (prod timeout fix) | `61c6a54` |
| 13 | Live hotel/flight prices behind a provider-agnostic wrapper | `0ae3f7c` |
| 14 | Export, day titles, Checklist & Reservations tabs | `b6f18b9` |
| 15 | Step-by-step planning wizard replaces the chat hero | `c5598ba` |
| 16 | Live generation experience — the trip view constructs itself | `33ea548` |
| 17 | Security & quality pass from a full project audit (`REVIEW.md`) | *(current)* |

---

## License

MIT — free to use, fork, and learn from.
