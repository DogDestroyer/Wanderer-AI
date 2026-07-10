import { test, expect, type Page } from '@playwright/test'

// Real end-to-end proof that a long (multi-batch) trip fills ALL its days.
// This is the path the "requested 10, got 3" bug lived on: the skeleton returns
// empty days and the fill loop runs several batches. Slow (real generation).

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? ''
const VERCEL_BYPASS = process.env.VERCEL_BYPASS ?? ''
const REQUESTED_DAYS = Number(process.env.LONGTRIP_DAYS ?? 10)

async function grantBypass(page: Page) {
  if (!VERCEL_BYPASS) return
  const u = new URL(BASE_URL)
  u.searchParams.set('x-vercel-protection-bypass', VERCEL_BYPASS)
  u.searchParams.set('x-vercel-set-bypass-cookie', 'true')
  await page.goto(u.toString(), { waitUntil: 'domcontentloaded' }).catch(() => {})
}
async function loadApp(page: Page) {
  await grantBypass(page)
  await page.goto(`${BASE_URL}/app`, { waitUntil: 'domcontentloaded' })
  if (page.url().includes('/login')) {
    if (!DEMO_PASSWORD) throw new Error(`${BASE_URL} gated but no DEMO_PASSWORD`)
    await page.fill('input[type="password"]', DEMO_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/app', { timeout: 15_000 })
  }
  await expect(page.locator('textarea').first()).toBeVisible({ timeout: 15_000 })
}

// Slow + costs credits (real generation). Opt-in so the default suite stays fast;
// the deterministic chunked.spec.ts mocks cover the same logic on every run.
//   RUN_LONGTRIP=1 [LONGTRIP_DAYS=16] BASE_URL=… npx playwright test longtrip
test.skip(process.env.RUN_LONGTRIP !== '1', 'set RUN_LONGTRIP=1 to run the real long-trip generation')

test(`a ${REQUESTED_DAYS}-day request builds all ${REQUESTED_DAYS} days (none empty)`, async ({ page }) => {
  test.setTimeout(600_000)
  await loadApp(page)
  await page.locator('textarea').first().fill(`${REQUESTED_DAYS} days in Japan: Tokyo, Kyoto, Osaka — food, temples, culture`)
  await page.keyboard.press('Enter')

  // Poll the store until the active trip has the requested days all filled (or timeout).
  const deadline = Date.now() + 560_000
  let snap = { total: 0, empty: 0 }
  while (Date.now() < deadline) {
    snap = await page.evaluate(() => {
      try {
        const s = JSON.parse(localStorage.getItem('wandr-v1') || '{}').state
        const t = s?.activeTripId ? s.trips[s.activeTripId] : null
        if (!t) return { total: 0, empty: 0 }
        return { total: t.days.length, empty: t.days.filter((d: { activities?: unknown[] }) => !d.activities || d.activities.length === 0).length }
      } catch { return { total: 0, empty: 0 } }
    })
    if (snap.total === REQUESTED_DAYS && snap.empty === 0) break
    await page.waitForTimeout(4_000)
  }

  expect(snap.total, 'trip must not collapse to fewer days than requested').toBe(REQUESTED_DAYS)
  expect(snap.empty, 'every day must be filled').toBe(0)
})
