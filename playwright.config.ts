import { defineConfig } from '@playwright/test'

// We point the test at different environments via BASE_URL, so there is no
// single global baseURL and no managed webServer here — servers are started
// separately (dev / local prod / live Vercel) and the URL is passed in.
//
//   BASE_URL=http://localhost:3000  npx playwright test   # dev
//   BASE_URL=http://localhost:3100  npx playwright test   # local prod build
//   BASE_URL=https://<your>.vercel.app  npx playwright test   # live
//
// If the target is password-gated (DEMO_PASSWORD set on the server), pass the
// same passcode so the test can get through the login gate:
//   DEMO_PASSWORD=... BASE_URL=https://... npx playwright test
export default defineConfig({
  testDir: './tests',
  // tests/unit/** are vitest unit tests (npm run test:unit), not Playwright's.
  testIgnore: 'unit/**',
  // Chunked generation (skeleton + sequential fill batches) for a multi-day trip
  // can take a few minutes end-to-end; allow generous room plus setup/login.
  timeout: 300_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    headless: true,
    // Surface real navigations as such (no SPA assumptions).
    actionTimeout: 15_000,
    // NOTE: Vercel Deployment Protection bypass is handled per-test via a cookie
    // (see grantBypass() in the spec), NOT a global header — a global header
    // would leak onto cross-origin calls (e.g. the open-meteo weather API) and
    // trip their CORS preflight, producing misleading console errors.
  },
})
