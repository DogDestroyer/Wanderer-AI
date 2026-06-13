'use client'

import { Plane, Hotel, RefreshCw, ExternalLink, Star, Info } from 'lucide-react'
import type { TripPlan } from '@/lib/types'
import { cn, formatCurrency } from '@/lib/utils'
import { convertAmount, type RatesMap } from '@/lib/currency'

// ─── LiveTravelPanel ──────────────────────────────────────────────────────────
// Compact flight card + hotel shortlist with REAL prices (or AI estimates on
// fallback), converted to the trip's display currency. "Check price" deep links
// are the verification step; flights are labelled "indicative".

interface Props {
  trip: TripPlan
  rates: RatesMap
  loading: boolean
  onRefresh: () => void
}

export function LiveTravelPanel({ trip, rates, loading, onRefresh }: Props) {
  const live = trip.liveData
  const display = trip.budget.currency
  const flight = live?.flight ?? null
  const hotels = live?.hotels ?? []

  // Nothing fetched yet and nothing in flight → render only while we have a city.
  if (!live && !loading) return null

  const conv = (amount: number, from: string) =>
    formatCurrency(convertAmount(amount, from, display, rates), display)

  return (
    <div className="bg-[#111111] rounded-xl border border-[#1f1f1f] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-[#f0f0f0]">Flights &amp; stays</p>
        <button
          onClick={onRefresh}
          disabled={loading}
          title="Refresh live prices"
          className="flex items-center gap-1.5 text-[11px] text-[#666] hover:text-[#f0f0f0] transition-colors disabled:opacity-50"
        >
          <RefreshCw size={11} className={cn(loading && 'animate-spin')} />
          {loading ? 'Refreshing…' : 'Refresh prices'}
        </button>
      </div>

      {/* ── Flight ──────────────────────────────────────────────────────────── */}
      {flight ? (
        <a
          href={flight.deepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-2.5 rounded-lg bg-[#0d0d0d] border border-[#1f1f1f] hover:border-[#333] transition-colors group"
        >
          <div className="w-8 h-8 rounded-lg bg-[#16203a] flex items-center justify-center shrink-0">
            <Plane size={14} className="text-[#5a9fd4]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-semibold text-[#f0f0f0]">
                {flight.originCode} → {flight.destinationCode}
              </span>
              {flight.airline && <span className="text-[10px] text-[#555]">{flight.airline}</span>}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Badge kind={flight.isEstimate ? 'estimate' : 'indicative'} />
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[13px] font-bold text-[#f0f0f0] tabular-nums">{conv(flight.price, flight.currency)}</p>
            <span className="text-[10px] text-[#555] flex items-center justify-end gap-0.5 group-hover:text-[#888]">
              Check price <ExternalLink size={9} />
            </span>
          </div>
        </a>
      ) : (
        <p className="text-[11px] text-[#444] px-1">
          {loading ? 'Fetching flight prices…' : 'Add a “flying from” city in preferences for live flight prices.'}
        </p>
      )}

      {/* ── Hotels ──────────────────────────────────────────────────────────── */}
      {hotels.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Hotel size={11} className="text-[#666]" />
            <span className="text-[11px] text-[#666]">Stays in {hotels[0].city}</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {hotels.map((h) => (
              <a
                key={h.hotelId ?? h.name}
                href={h.deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 w-[150px] rounded-lg bg-[#0d0d0d] border border-[#1f1f1f] hover:border-[#333] transition-colors overflow-hidden group"
              >
                {h.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={h.photo} alt="" className="w-full h-16 object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-16 bg-[#161616]" />
                )}
                <div className="p-2">
                  <p className="text-[11px] font-semibold text-[#f0f0f0] leading-tight line-clamp-2 min-h-[28px]">{h.name}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {typeof h.stars === 'number' && (
                      <span className="flex items-center gap-0.5 text-[9px] text-[#d4a017]">
                        <Star size={8} fill="currentColor" /> {h.stars}
                      </span>
                    )}
                    {typeof h.rating === 'number' && <span className="text-[9px] text-[#555]">· {h.rating}</span>}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[12px] font-bold text-[#f0f0f0] tabular-nums">{conv(h.pricePerNight, h.currency)}</span>
                    <span className="text-[9px] text-[#555]">/night</span>
                  </div>
                  <div className="mt-1"><Badge kind={h.isEstimate ? 'estimate' : 'live'} /></div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function Badge({ kind }: { kind: 'live' | 'indicative' | 'estimate' }) {
  if (kind === 'live') {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-medium text-[#3eb87a] bg-[#0d1a14] px-1.5 py-0.5 rounded">
        ● Live price
      </span>
    )
  }
  if (kind === 'indicative') {
    return (
      <span
        title="Indicative price from cached aggregates — tap Check price to verify the live fare."
        className="inline-flex items-center gap-1 text-[9px] font-medium text-[#d4a017] bg-[#1a1608] px-1.5 py-0.5 rounded cursor-help"
      >
        <Info size={9} /> Indicative
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-medium text-[#888] bg-[#1a1a1a] px-1.5 py-0.5 rounded">
      Estimated
    </span>
  )
}
