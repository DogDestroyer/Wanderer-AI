'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

// ─── LandingPage ──────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white text-[#0a0a0a] font-sans antialiased">

      {/* ── Nav ────────────────────────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-8 py-7 max-w-5xl mx-auto">
        <span className="text-[11px] font-bold tracking-[0.3em] uppercase select-none">
          HODO
        </span>
        <Link
          href="/app"
          className="text-[13px] text-[#999] hover:text-[#0a0a0a] transition-colors duration-150"
        >
          Open app →
        </Link>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="flex flex-col items-center text-center px-6 pt-20 pb-28 sm:pt-28 sm:pb-36">
        <motion.div
          className="flex flex-col items-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: EASE }}
        >
          <h1 className="text-[56px] sm:text-[76px] lg:text-[96px] font-bold tracking-[-0.04em] leading-[0.93] mb-7 max-w-3xl">
            Plan your<br />next trip.
          </h1>

          <p className="text-[17px] sm:text-[18px] text-[#888] max-w-xs sm:max-w-sm mx-auto leading-relaxed mb-10">
            Describe where you want to go.<br />
            Get a full itinerary in seconds.
          </p>

          <Link
            href="/app"
            className="group inline-flex items-center gap-2 bg-[#0a0a0a] text-white text-[14px] font-semibold px-7 py-3.5 rounded-xl transition-all duration-150 hover:bg-[#1a1a1a] hover:scale-[1.02] active:scale-[0.99]"
          >
            Plan a trip
            <span className="transition-transform duration-150 group-hover:translate-x-0.5">→</span>
          </Link>

          <p className="text-[12px] text-[#ccc] mt-4 tracking-wide">
            Takes about 30 seconds
          </p>
        </motion.div>
      </section>

      {/* ── Product mockup ─────────────────────────────────────────────────── */}
      <section className="px-6 pb-36">
        <motion.div
          className="max-w-md mx-auto"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.18, ease: EASE }}
        >
          <ProductMockup />

          <p className="text-center text-[13px] text-[#bbb] mt-6 tracking-wide">
            A complete itinerary, built in one conversation.
          </p>
        </motion.div>
      </section>

    </main>
  )
}

// ─── ProductMockup ────────────────────────────────────────────────────────────
// A code-rendered preview of the app's itinerary view — no images needed.

function ProductMockup() {
  return (
    <div className="rounded-2xl overflow-hidden bg-[#0a0a0a] shadow-[0_32px_80px_-12px_rgba(0,0,0,0.18)] ring-1 ring-black/5">

      {/* Fake app chrome */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f1f1f]">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-white">HODO</span>
          <div className="w-px h-3.5 bg-[#2a2a2a]" />
          <span className="text-[12px] text-[#555]">Tokyo, 5 days</span>
        </div>
        <div className="px-3 py-1 rounded-lg border border-[#2a2a2a] text-[11px] text-[#555]">
          Chat
        </div>
      </div>

      {/* Day card */}
      <div className="p-4">
        <div className="bg-[#111111] rounded-xl border border-[#1f1f1f] overflow-hidden">

          {/* Day header */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#1f1f1f]">
            <div className="w-6 h-6 bg-[#1f1f1f] rounded-lg flex items-center justify-center">
              <span className="text-[10px] font-bold text-[#666]">1</span>
            </div>
            <span className="text-[12px] font-semibold text-[#f0f0f0]">Day 1 · Mon, Jun 16</span>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-sm">⛅</span>
              <span className="text-[11px] text-[#777]">24°</span>
            </div>
          </div>

          {/* Activities */}
          <div className="divide-y divide-[#161616]">
            {SAMPLE_ACTIVITIES.map((activity) => (
              <div key={activity.title} className="flex items-start gap-3 px-4 py-3">
                <span className="text-[10px] text-[#444] w-10 shrink-0 pt-0.5 tabular-nums font-medium">
                  {activity.time}
                </span>
                <div className="w-4 h-4 rounded-full border-2 border-[#2a2a2a] flex items-center justify-center text-[8px] shrink-0 mt-px bg-[#111111]">
                  {activity.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-[#f0f0f0] truncate">
                    {activity.title}
                  </p>
                  <p className="text-[10px] text-[#555] truncate mt-0.5">
                    {activity.desc}
                  </p>
                </div>
                <span className="text-[11px] text-[#444] shrink-0 tabular-nums ml-2">
                  {activity.cost}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const SAMPLE_ACTIVITIES = [
  {
    time:  '9:00',
    emoji: '🏛️',
    title: 'Senso-ji Temple',
    desc:  'Ancient Buddhist temple in Asakusa',
    cost:  'Free',
  },
  {
    time:  '11:30',
    emoji: '🍜',
    title: 'Tsukiji Outer Market',
    desc:  'Fresh sushi and morning street food',
    cost:  '$18',
  },
  {
    time:  '14:00',
    emoji: '🎭',
    title: 'teamLab Planets',
    desc:  'Immersive digital art installation',
    cost:  '$28',
  },
  {
    time:  '19:00',
    emoji: '🌿',
    title: 'Shinjuku Gyoen Garden',
    desc:  'Peaceful evening stroll at golden hour',
    cost:  '$3',
  },
]
