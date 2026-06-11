'use client'

// MapPanel is a 'use client' component so that `ssr: false` in dynamic() is valid.
// Leaflet accesses `window` at import time, so it must never run on the server.

import dynamic from 'next/dynamic'
import type { TripPlan } from '@/lib/types'

// ─── Skeleton shown while Leaflet bundle loads ────────────────────────────────

function MapSkeleton() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-[#0a0a0a]">
      <div className="text-center">
        <div className="w-6 h-6 border border-[#333] border-t-white rounded-full animate-spin mx-auto mb-3" />
        <p className="text-[12px] text-[#444]">Loading map…</p>
      </div>
    </div>
  )
}

// ─── Dynamically-imported map — client only ───────────────────────────────────

const TripMapDynamic = dynamic(
  () => import('./TripMap').then((m) => m.TripMap),
  {
    ssr: false,
    loading: () => <MapSkeleton />,
  }
)

// ─── MapPanel ─────────────────────────────────────────────────────────────────

export function MapPanel({ trip }: { trip: TripPlan }) {
  return (
    <div className="h-full w-full">
      <TripMapDynamic trip={trip} />
    </div>
  )
}
