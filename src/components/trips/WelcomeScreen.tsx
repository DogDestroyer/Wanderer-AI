'use client'

import { motion } from 'framer-motion'

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

const FEATURES = [
  { label: 'AI itineraries',   desc: 'Day-by-day plan built from a single conversation.' },
  { label: 'Drag & drop',      desc: 'Reorder activities. Timings reflow instantly.' },
  { label: 'Live budget',      desc: 'Cost estimates, daily totals, and a spending cap.' },
  { label: 'Interactive map',  desc: 'Every stop pinned and connected on a live map.' },
  { label: 'Weather-aware',    desc: 'Real forecasts badge each day and trigger swap ideas.' },
  { label: 'Partial re-plans', desc: 'Change one day without touching locked activities.' },
]

export function WelcomeScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-20 bg-[#0a0a0a]">

      {/* Hero ────────────────────────────────────────────────────────────────── */}
      <motion.div
        className="flex flex-col items-center text-center max-w-lg"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        {/* Wordmark */}
        <motion.p
          className="text-[11px] font-bold tracking-[0.35em] uppercase text-[#444] mb-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          HODO
        </motion.p>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.1] tracking-tight mb-6">
          Plan your next<br />adventure.
        </h1>

        {/* Tagline */}
        <p className="text-[#888] text-lg leading-relaxed max-w-sm mb-10">
          Describe your trip. Get a full itinerary in seconds —
          then edit, drag, and refine until it&apos;s perfect.
        </p>

        {/* CTA */}
        <motion.button
          className="px-8 py-3.5 bg-white text-black text-sm font-semibold rounded-xl hover:bg-[#e8e8e8] active:bg-[#d0d0d0] transition-colors duration-150"
          whileTap={{ scale: 0.98 }}
          onClick={() => document.dispatchEvent(new CustomEvent('wandr:focus-chat'))}
        >
          Start planning →
        </motion.button>

        <p className="text-[11px] text-[#444] mt-3">
          Opens the AI chat · Takes about 30 seconds
        </p>
      </motion.div>

      {/* Feature strip ────────────────────────────────────────────────────────── */}
      <motion.div
        className="mt-20 w-full max-w-2xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.6 }}
      >
        <div className="h-px bg-[#1f1f1f] mb-8" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-5">
          {FEATURES.map(({ label, desc }) => (
            <div key={label}>
              <p className="text-[12px] font-semibold text-[#f0f0f0] mb-0.5">{label}</p>
              <p className="text-[11px] text-[#555] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
