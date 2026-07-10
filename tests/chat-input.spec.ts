import { test, expect, type ConsoleMessage, type Request } from '@playwright/test'
import { driveWizardToBuild, driveWizardConcrete } from './helpers/wizard'

// ─── Chat input reproduction test ─────────────────────────────────────────────
// Reproduces the "pressing Enter reloads the page / clears the chat" bug and
// proves the fix. Parameterised by BASE_URL so it can run against dev, a local
// production build, or the live Vercel deployment.
//
//   BASE_URL=http://localhost:3000           npx playwright test
//   BASE_URL=http://localhost:3100           npx playwright test
//   DEMO_PASSWORD=xxx BASE_URL=https://...    npx playwright test
//
// What it asserts after typing a message and pressing Enter:
//   1. The page did NOT do a full reload/navigation (the core symptom).
//   2. The typed message appears in the chat (it persists, isn't cleared).
//   3. A request to /api/chat actually fired (the send pathway ran).
// It also dumps every console message, page error, and relevant network request
// so failing vs passing environments can be compared side by side.

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? ''
// A REAL trip request (not a trivial "test message"): the production bug only
// manifests on a full itinerary generation, which takes ~45s and is exactly what
// the serverless function timeout was cutting short. A nonsense prompt would get
// a quick chat-only reply that never exercises the failing path. Override with
// CHAT_MESSAGE if needed.
const MESSAGE = process.env.CHAT_MESSAGE ?? '5 days in Tokyo for two — food, temples, mid budget'
const VERCEL_BYPASS = process.env.VERCEL_BYPASS ?? ''

// Plant Vercel's Deployment-Protection bypass COOKIE for the target origin only.
// We use the cookie (not a global request header) so the bypass never leaks onto
// cross-origin calls — e.g. the open-meteo weather API, whose CORS preflight
// rejects unknown headers and would otherwise spam the console with errors.
async function grantBypass(page: import('@playwright/test').Page) {
  if (!VERCEL_BYPASS) return
  const u = new URL(BASE_URL)
  u.searchParams.set('x-vercel-protection-bypass', VERCEL_BYPASS)
  u.searchParams.set('x-vercel-set-bypass-cookie', 'true')
  await page.goto(u.toString(), { waitUntil: 'domcontentloaded' }).catch(() => {})
}

// Load /app and get past the password gate (if the target is gated).
async function loadApp(page: import('@playwright/test').Page) {
  await grantBypass(page)
  await page.goto(`${BASE_URL}/app`, { waitUntil: 'domcontentloaded' })
  if (page.url().includes('/login')) {
    if (!DEMO_PASSWORD) {
      throw new Error(
        `Target ${BASE_URL} is password-gated (redirected to /login) but no DEMO_PASSWORD env var was provided.`,
      )
    }
    await page.fill('input[type="password"]', DEMO_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/app', { timeout: 15_000 })
  }
  await expect(page.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
}

test('pressing Enter sends the message without reloading the page', async ({ page }) => {
  // ── Collect evidence ────────────────────────────────────────────────────────
  const consoleMessages: string[] = []
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const apiChatRequests: string[] = []
  const navigations: string[] = []

  page.on('console', (msg: ConsoleMessage) => {
    const line = `[${msg.type()}] ${msg.text()}`
    consoleMessages.push(line)
    if (msg.type() === 'error') consoleErrors.push(line)
  })
  page.on('pageerror', (err: Error) => {
    pageErrors.push(err.message)
  })
  page.on('request', (req: Request) => {
    if (req.url().includes('/api/chat')) apiChatRequests.push(`${req.method()} ${req.url()}`)
  })
  // Any full document navigation of the main frame after initial load.
  // We record them and decide below whether one was an unexpected reload.
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url())
  })

  // A page-instance marker that only survives if there is NO full reload.
  // addInitScript runs on every document load, so on a reload it would be reset.
  await page.addInitScript(() => {
    // @ts-expect-error - test-only global
    if (!window.__pageInstanceId) {
      // @ts-expect-error - test-only global
      window.__pageInstanceId = Math.random().toString(36).slice(2) + ':' + performance.timeOrigin
    }
  })

  // ── 1. Load the app ─────────────────────────────────────────────────────────
  await grantBypass(page)
  await page.goto(`${BASE_URL}/app`, { waitUntil: 'domcontentloaded' })

  // ── 2. Handle the password gate if present ──────────────────────────────────
  if (page.url().includes('/login')) {
    if (!DEMO_PASSWORD) {
      throw new Error(
        `Target ${BASE_URL} is password-gated (redirected to /login) but no DEMO_PASSWORD env var was provided.`,
      )
    }
    await page.fill('input[type="password"]', DEMO_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/app', { timeout: 15_000 })
  }

  // ── 3. Wait for the app (new-trip wizard) to be interactive ─────────────────
  await expect(page.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })

  // Capture the instance id AFTER the app is interactive.
  const instanceBefore = await page.evaluate(() => (window as unknown as { __pageInstanceId: string }).__pageInstanceId)
  const navCountBefore = navigations.length

  const tripsBefore = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('wandr-v1')
      return raw ? Object.keys(JSON.parse(raw).state?.trips ?? {}).length : 0
    } catch { return 0 }
  })

  // ── 4. Drive the wizard to generation ───────────────────────────────────────
  // Replaces the old hero textarea: the wizard collects concrete answers
  // (Tokyo, 5 days) plus the note, then fires ONE generation request through the
  // same sendMessage pathway. The note carries MESSAGE so the persistence check
  // still applies.
  await driveWizardConcrete(page, { note: MESSAGE })

  // Brief settle so the app enters the generation view and fires the request.
  await page.waitForTimeout(3_000)

  // ── 5. Wait for the request to RESOLVE, observing PROGRESSIVE streaming ──────
  // This reproduces the production bug. On a deployment where the function times
  // out mid-stream, no trip is ever created and the UI shows the interrupted
  // state — so we poll for the real outcome (a new trip, OR a visible timeout/
  // interrupted error). Along the way we also confirm the agent's reply streams
  // in PROGRESSIVELY (partial assistant text appears before the trip completes),
  // rather than arriving in a single blob at the end.
  // Chunked generation: the skeleton creates the trip fast (empty days), then
  // activities fill in 2–3 day batches. We wait for FULL completion (every day
  // has activities), which is the real "generation done" for the chunked flow.
  const RESOLVE_TIMEOUT = 240_000
  const start = Date.now()
  let tripCreated = false
  let tripFullyBuilt = false
  let dayProgress = '(none)'
  let errorShown = false
  let sawProgressiveText = false
  let maxPartialLen = 0
  while (Date.now() - start < RESOLVE_TIMEOUT) {
    const snap = await page.evaluate((before) => {
      try {
        const state = JSON.parse(localStorage.getItem('wandr-v1') || '{}').state ?? {}
        const created = Object.keys(state.trips ?? {}).length > before
        const activeId = state.activeTripId
        const trip = activeId ? state.trips?.[activeId] : null
        const totalDays = trip?.days?.length ?? 0
        const emptyDays = trip ? trip.days.filter((d: { activities?: unknown[] }) => !d.activities || d.activities.length === 0).length : 0
        const newMsgs = (state.chatHistory ?? {})['__new__'] ?? []
        const tripMsgs = activeId ? (state.chatHistory?.[activeId] ?? []) : []
        const msgs = newMsgs.length ? newMsgs : tripMsgs
        const lastA = [...msgs].reverse().find((m: { role: string }) => m.role === 'assistant')
        return { created, totalDays, emptyDays, partialLen: lastA?.content?.length ?? 0 }
      } catch { return { created: false, totalDays: 0, emptyDays: 0, partialLen: 0 } }
    }, tripsBefore)
    tripCreated = snap.created
    tripFullyBuilt = snap.created && snap.totalDays > 0 && snap.emptyDays === 0
    dayProgress = `${snap.totalDays} days, ${snap.emptyDays} empty`
    if (snap.partialLen > maxPartialLen) maxPartialLen = snap.partialLen
    // Progressive = streamed text appeared before the trip was fully built.
    if (!tripFullyBuilt && snap.partialLen > 0) sawProgressiveText = true
    errorShown = await page.evaluate(() =>
      /took too long|cut off before it finished|generation was interrupted/i.test(document.body.innerText),
    ).catch(() => false)
    if (tripFullyBuilt || errorShown) break
    await page.waitForTimeout(2_000)
  }
  const resolveSeconds = Math.round((Date.now() - start) / 1000)

  // ── 6. Gather results ───────────────────────────────────────────────────────
  const instanceAfter = await page
    .evaluate(() => (window as unknown as { __pageInstanceId?: string }).__pageInstanceId)
    .catch(() => undefined)

  // A reload would either wipe the marker (undefined) or replace it with a new id.
  const reloaded = instanceAfter === undefined || instanceAfter !== instanceBefore
  const extraNavigations = navigations.slice(navCountBefore)

  // Did the message persist (visible on screen or at least retained in the store)?
  const messageVisible = await page.getByText(MESSAGE, { exact: false }).first().isVisible().catch(() => false)
  const messageInStore = await page.evaluate((msg) => {
    try {
      const raw = localStorage.getItem('wandr-v1')
      if (!raw) return false
      const state = JSON.parse(raw).state ?? {}
      const all = Object.values(state.chatHistory ?? {}).flat() as Array<{ content?: string }>
      return all.some((m) => (m.content ?? '').includes(msg))
    } catch {
      return false
    }
  }, MESSAGE)

  // Did we end up stranded back on the EMPTY hero screen with no trip? That was
  // the original silent-fallback symptom ("page reloaded and cleared the chat").
  // Note: an interrupted generation should now show the explicit InterruptedState,
  // NOT the empty hero — so this must be false whether we succeed or fail.
  // Detect the hero by its unique "Where to next?" headline (the chat-panel input
  // shares the hero's placeholder text, so a placeholder check would false-match).
  const strandedOnEmptyHero = await page.evaluate(() => {
    const onHero = Array.from(document.querySelectorAll('h1')).some((h) => /where to next/i.test(h.textContent ?? ''))
    const raw = localStorage.getItem('wandr-v1')
    const tripCount = raw ? Object.keys(JSON.parse(raw).state?.trips ?? {}).length : 0
    return onHero && tripCount === 0
  })

  // ── 7. Report (side-by-side friendly) ───────────────────────────────────────
  console.log('\n──────── CHAT INPUT TEST REPORT ────────')
  console.log('BASE_URL              :', BASE_URL)
  console.log('Reloaded/navigated?   :', reloaded ? 'YES ❌' : 'no ✅')
  console.log('  instance before     :', instanceBefore)
  console.log('  instance after      :', instanceAfter)
  console.log('  extra navigations   :', extraNavigations.length ? extraNavigations : '(none)')
  console.log('/api/chat fired?      :', apiChatRequests.length ? `YES ✅ (${apiChatRequests.length})` : 'NO ❌')
  console.log('Message persisted?    :', messageVisible || messageInStore ? 'YES ✅' : 'NO ❌',
    `(visible=${messageVisible}, store=${messageInStore})`)
  console.log('Streamed progressively?:', sawProgressiveText ? `YES ✅ (max partial ${maxPartialLen} chars)` : 'NO ❌')
  console.log('Trip created (skeleton)?:', tripCreated ? 'YES ✅' : 'NO ❌')
  console.log('Itinerary fully built? :', tripFullyBuilt ? `YES ✅ (after ~${resolveSeconds}s)` : `NO ❌ (${dayProgress})`)
  console.log('Error/interrupt shown?:', errorShown ? `YES ⚠️ (after ~${resolveSeconds}s)` : 'no')
  console.log('Stranded empty hero?  :', strandedOnEmptyHero ? 'YES ❌ (THE PRODUCTION BUG)' : 'no ✅')
  console.log('Console errors        :', consoleErrors.length ? consoleErrors : '(none)')
  console.log('Page errors           :', pageErrors.length ? pageErrors : '(none)')
  console.log('Hydration warnings    :',
    consoleMessages.filter((m) => /hydrat|did not match|mismatch/i.test(m)).length
      ? consoleMessages.filter((m) => /hydrat|did not match|mismatch/i.test(m))
      : '(none)')
  console.log('Total console msgs    :', consoleMessages.length)
  console.log('────────────────────────────────────────\n')

  // ── 8. Assert the bug is gone ───────────────────────────────────────────────
  // Core symptom checks:
  expect(reloaded, 'page must NOT reload/navigate when pressing Enter').toBe(false)
  expect(apiChatRequests.length, 'a request to /api/chat must fire').toBeGreaterThan(0)
  expect(messageVisible || messageInStore, 'the typed message must persist (not be cleared)').toBe(true)
  // Streaming must be progressive — partial text rendered before the trip lands.
  expect(sawProgressiveText, 'agent reply must stream progressively (partial text before completion)').toBe(true)
  // Must never silently fall back to the empty hero screen.
  expect(strandedOnEmptyHero, 'must not fall back to the empty hero screen (the production bug)').toBe(false)
  // The chunked generation must finish: every day filled with activities.
  expect(tripFullyBuilt, `generation must complete with all days filled (got: ${dayProgress})`).toBe(true)
})

// ─── Interrupted stream → retry state (NOT silent empty hero) ──────────────────
// Deterministically simulates the production failure: the API stream emits some
// text then drops WITHOUT completing (the serverless-timeout signature). The app
// must show the explicit "Generation was interrupted / Retry" state — never the
// silent fall-back to the empty hero screen that made the original bug so baffling.
test('an interrupted stream shows the retry state, not the empty hero', async ({ page }) => {
  await loadApp(page)

  // Intercept the chat call and return a TRUNCATED SSE stream: one delta, then
  // the connection closes with no 'done'/'error' terminal event.
  await page.route('**/api/chat', async (route) => {
    const body =
      'data: ' + JSON.stringify({ type: 'delta', text: 'Tokyo in June is fantastic — let me map out' }) + '\n\n'
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      body,
    })
  })

  await driveWizardToBuild(page, MESSAGE)

  // A skeleton interruption ends the live build and drops to the explicit
  // interrupted-retry state (never the empty hero / a silent reset).
  await expect(page.getByText(/generation was interrupted/i)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: /retry/i })).toBeVisible()

  // And we must NOT have silently dropped to an empty entry with no trip and no
  // explicit failure. The wizard is still up showing the interrupted state.
  const strandedSilently = await page.evaluate(() => {
    const hasFailureUi = /that didn't finish|was interrupted/i.test(document.body.innerText)
    const raw = localStorage.getItem('wandr-v1')
    const tripCount = raw ? Object.keys(JSON.parse(raw).state?.trips ?? {}).length : 0
    return tripCount === 0 && !hasFailureUi
  })
  expect(strandedSilently, 'interrupted generation must show an explicit failure, not fail silently').toBe(false)

  // The user's message must still be preserved.
  const messagePreserved = await page.evaluate((msg) => {
    const raw = localStorage.getItem('wandr-v1')
    if (!raw) return false
    const all = Object.values(JSON.parse(raw).state?.chatHistory ?? {}).flat() as Array<{ content?: string }>
    return all.some((m) => (m.content ?? '').includes(msg))
  }, MESSAGE)
  expect(messagePreserved, 'the typed message must be preserved after an interruption').toBe(true)

  console.log('\n──────── INTERRUPTED-STREAM TEST ────────')
  console.log('BASE_URL              :', BASE_URL)
  console.log('Interrupted state UI  : shown ✅')
  console.log('Stranded silently?    :', strandedSilently ? 'YES ❌' : 'no ✅')
  console.log('Message preserved?    :', messagePreserved ? 'YES ✅' : 'NO ❌')
  console.log('─────────────────────────────────────────\n')
})
