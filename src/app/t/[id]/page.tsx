import { cache } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getSnapshot } from '@/lib/shareStore'
import { fetchRates } from '@/lib/currency'
import { SharedTripView } from '@/components/share/SharedTripView'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// /t/{id} — public, read-only rendering of an immutable trip snapshot.
// Server-rendered so links unfurl properly (OG tags below) and load fast.

const loadSnapshot = cache(async (id: string) => getSnapshot(id))

function formatRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  const sStr = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const eStr = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${sStr} – ${eStr}`
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const trip = await loadSnapshot(id)
  if (!trip) return { title: 'Trip not found · Hodo' }
  const description = `${trip.destination.name} · ${formatRange(trip.startDate, trip.endDate)} · ${trip.days.length} days — planned with Hodo`
  return {
    title: `${trip.name} · Hodo`,
    description,
    openGraph: {
      title: trip.name,
      description,
      type: 'article',
      siteName: 'Hodo',
    },
    twitter: { card: 'summary', title: trip.name, description },
  }
}

export default async function SharedTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const trip = await loadSnapshot(id)
  if (!trip) notFound()

  // Live ECB rates for display conversion; hardcoded fallback keeps the page
  // rendering even if the rates API is unreachable.
  const rates = (await fetchRates()) ?? null

  return <SharedTripView trip={trip} liveRates={rates} />
}
