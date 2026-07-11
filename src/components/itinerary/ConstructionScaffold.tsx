'use client'

// ─── Phase-1 construction scaffold ────────────────────────────────────────────
// Rendered the instant Build is clicked, BEFORE any AI response, using only the
// wizard answers. Mirrors the trip-view shell so the hand-off to the real
// itinerary (when the skeleton lands) is seamless: header, meta chips, budget
// bar, "Planned for" chips, and one shimmer day-block per planned day.

import { motion } from 'framer-motion'
import { MapPin, Calendar, Gauge, Star } from 'lucide-react'
import type { BuildState } from '@/lib/store'
import { cn, formatCurrency } from '@/lib/utils'
import { addDays } from '@/lib/wizard'
import { BuildStatusLine, DayShimmer } from './BuildStatus'

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]
const chip = { hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } } }

function Chip({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <motion.span variants={chip} className="flex items-center gap-1 px-2 py-1 bg-[#111111] border border-[#1f1f1f] rounded-lg text-[11px] text-[#666] font-medium">
      {icon && <span className="text-[#444]">{icon}</span>}
      {label}
    </motion.span>
  )
}

export function ConstructionScaffold({ build }: { build: BuildState }) {
  const s = build.scaffold
  if (!s) return null

  const dayCount = Math.max(1, s.dayCount)
  const days = Array.from({ length: dayCount }, (_, i) => ({
    index: i,
    date: s.startDate ? addDays(s.startDate, i) : undefined,
  }))
  const dateLabel = s.startDate && s.endDate
    ? `${new Date(s.startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(s.endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : `${dayCount} ${dayCount === 1 ? 'day' : 'days'}`

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-[#1f1f1f] px-6 py-4">
        <div className="min-w-0">
          {/* Title placeholder — the real title types itself in once it arrives */}
          <div className="build-shimmer h-6 rounded-md w-1/2 max-w-[240px]" />
          {s.destinationName && (
            <div className="flex items-center gap-1 mt-1.5">
              <MapPin size={11} className="text-[#555] shrink-0" />
              <span className="text-[12px] text-[#666]">{s.destinationName}</span>
            </div>
          )}
        </div>

        {/* Meta chips (staggered in) */}
        <motion.div className="flex flex-wrap items-center gap-1.5 mt-3" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08 } } }}>
          <Chip icon={<Calendar size={10} />} label={dateLabel} />
          <Chip icon={<Gauge size={10} />} label={s.paceLabel} />
          <Chip icon={<Star size={10} />} label={s.budgetLabel} />
        </motion.div>

        {/* Budget bar (cap known from the wizard) */}
        {s.budgetCap > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-[#444]">Estimated spend</span>
              <span className="text-[11px] font-semibold text-[#888] tabular-nums">
                {formatCurrency(0, s.currency)}<span className="text-[#333] font-normal"> / {formatCurrency(s.budgetCap, s.currency)}</span>
              </span>
            </div>
            <div className="h-px bg-[#1f1f1f] rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: '0%' }} />
            </div>
          </div>
        )}

        {/* "Planned for" chips synthesized from the wizard answers */}
        {s.assumptions.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[#111111]">
            <motion.div className="flex items-center gap-1.5 flex-wrap" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } } }}>
              <span className="text-[10px] text-[#333] font-medium shrink-0 mr-0.5">Planned for:</span>
              {s.assumptions.map((a) => (
                <motion.span key={a.field} variants={chip} className="flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] bg-[#111111] border-[#1f1f1f] text-[#888]">
                  <span className="text-[#444]">{a.label}:</span> {a.value}
                </motion.span>
              ))}
            </motion.div>
          </div>
        )}
      </div>

      {/* Tabs (static during scaffold — become interactive when the trip lands) */}
      <div className="flex-shrink-0 border-b border-[#1f1f1f] px-6">
        <div className="flex gap-0">
          {['Itinerary', 'Budget', 'Checklist', 'Reservations', 'Map'].map((t, i) => (
            <span key={t} className={cn('px-4 py-2.5 text-[12px] font-medium border-b-2', i === 0 ? 'border-white text-[#f0f0f0]' : 'border-transparent text-[#555]')}>
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* One elegant shimmer block — days reveal strictly one at a time once the
          skeleton lands, so we never pre-draw blocks we'd have to swap away. */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-6 space-y-3 max-w-2xl mx-auto w-full pb-10">
          <div className="mb-1"><BuildStatusLine build={build} /></div>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
            <DayShimmer index={0} date={days[0]?.date} />
          </motion.div>
        </div>
      </div>
    </div>
  )
}
