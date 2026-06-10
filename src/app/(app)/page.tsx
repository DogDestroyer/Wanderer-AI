// This file exists only to satisfy the (app) route group's layout requirement.
// Next.js 16 resolves the duplicate "/" route by preferring app/page.tsx.
// This component should never render — app/page.tsx takes precedence.
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function AppGroupIndex() {
  notFound()
}
