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
  // A full Sonnet generation takes ~80s; allow generous room (still well under
  // the 300s server cap) plus setup/login overhead.
  timeout: 200_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    headless: true,
    // Surface real navigations as such (no SPA assumptions).
    actionTimeout: 15_000,
  },
})
