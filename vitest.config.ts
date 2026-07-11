import { defineConfig } from 'vitest/config'
import path from 'path'

// Unit tests for the pure libraries (src/lib/*) — fast, no browser, no server.
// The Playwright suite (tests/*.spec.ts) covers E2E; this covers the functions
// where past bugs actually lived (recalculate, currency, wizard mapping, JSON
// extraction, request parsing). Run with: npm run test:unit
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
