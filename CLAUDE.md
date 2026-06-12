@AGENTS.md

# Definition of done (standing rule)

Every feature or fix ends with the full Playwright suite (`npx playwright test`) passing:

1. **Before reporting a task done** — the suite must pass against a **local production build** (`npm run build` then `next start`, with `BASE_URL` pointed at it).
2. **Before calling a task shipped** — the suite must pass against the **live Vercel deployment** (`VERCEL_BYPASS=<token> BASE_URL=https://<deploy>.vercel.app npx playwright test`).

A failing suite means the task is not finished. Extend the suite to cover new behaviour as part of the same task.
