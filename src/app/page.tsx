import { AppShell } from '@/components/layout/AppShell'

// Auth protection is handled by src/proxy.ts (Next.js 16 proxy convention).
// If DEMO_PASSWORD is set, unauthenticated visitors are redirected to /login
// before this page ever renders.
export default function Home() {
  return <AppShell />
}
