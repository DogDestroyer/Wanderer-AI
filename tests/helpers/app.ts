import { expect, type Page } from '@playwright/test'

// ─── Shared spec setup (was copy-pasted into every spec file) ─────────────────
//
// BASE_URL points the suite at dev / local prod / live Vercel.
// DEMO_PASSWORD gets past the app's own login gate when the target sets one.
// VERCEL_BYPASS plants Vercel's Deployment-Protection bypass COOKIE for the
// target origin only — a cookie (not a global header) so the bypass never leaks
// onto cross-origin calls (e.g. open-meteo), whose CORS preflight would reject
// unknown headers and spam the console with misleading errors.

export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? ''
export const VERCEL_BYPASS = process.env.VERCEL_BYPASS ?? ''

export async function grantBypass(page: Page) {
  if (!VERCEL_BYPASS) return
  const u = new URL(BASE_URL)
  u.searchParams.set('x-vercel-protection-bypass', VERCEL_BYPASS)
  u.searchParams.set('x-vercel-set-bypass-cookie', 'true')
  await page.goto(u.toString(), { waitUntil: 'domcontentloaded' }).catch(() => {})
}

/** Load /app, get past the password gate, wait for the new-trip wizard. */
export async function loadApp(page: Page) {
  await grantBypass(page)
  await page.goto(`${BASE_URL}/app`, { waitUntil: 'domcontentloaded' })
  if (page.url().includes('/login')) {
    if (!DEMO_PASSWORD) throw new Error(`${BASE_URL} is password-gated but no DEMO_PASSWORD env var was provided`)
    await page.fill('input[type="password"]', DEMO_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/app', { timeout: 15_000 })
  }
  // Fresh start opens the new-trip wizard; seed-based tests reload right after.
  await expect(page.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
}
