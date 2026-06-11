'use client'

import { Plane, Map, DollarSign, GripVertical, CloudSun, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'

const features = [
  {
    icon: Sparkles,
    title: 'AI-generated itineraries',
    desc: 'Chat naturally — the agent asks questions and builds a full day-by-day plan.',
    color: 'text-violet-500 bg-violet-50',
  },
  {
    icon: GripVertical,
    title: 'Drag & drop editing',
    desc: 'Reorder or move activities between days. Timings reflow instantly.',
    color: 'text-indigo-500 bg-indigo-50',
  },
  {
    icon: DollarSign,
    title: 'Live budget tracker',
    desc: 'Every activity has a cost estimate. See daily totals and your cap in real time.',
    color: 'text-emerald-500 bg-emerald-50',
  },
  {
    icon: Map,
    title: 'Interactive map',
    desc: 'All your stops on a live map with routes drawn between them.',
    color: 'text-sky-500 bg-sky-50',
  },
  {
    icon: CloudSun,
    title: 'Weather-aware planning',
    desc: 'Real forecasts badge each day. Outdoor activities get indoor swap suggestions.',
    color: 'text-amber-500 bg-amber-50',
  },
  {
    icon: Plane,
    title: 'Partial regeneration',
    desc: 'Ask to change just one day. Locked activities are never touched.',
    color: 'text-rose-500 bg-rose-50',
  },
]

// ─── Animation variants ───────────────────────────────────────────────────────

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

const heroVariants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: EASE },
  },
}

const gridVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07, delayChildren: 0.25 },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.38, ease: EASE },
  },
}

// ─── WelcomeScreen ────────────────────────────────────────────────────────────

export function WelcomeScreen() {
  return (
    <div className="flex flex-col items-center justify-start min-h-full px-6 py-16 bg-gradient-to-b from-slate-50 to-white">
      {/* Hero */}
      <motion.div
        className="flex flex-col items-center text-center max-w-xl mb-14"
        initial="hidden"
        animate="show"
        variants={heroVariants}
      >
        <motion.div
          className="mb-6 flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-200"
          initial={{ scale: 0.7, opacity: 0, rotate: -10 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <Plane size={28} className="text-white -rotate-45" />
        </motion.div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 tracking-tight leading-tight mb-4">
          Plan trips that<br />
          <span className="text-indigo-600">adapt to you.</span>
        </h1>
        <p className="text-lg text-gray-500 leading-relaxed max-w-md">
          Chat with an AI travel agent, get a dynamic day-by-day itinerary
          you can drag, drop, and edit in real time — with live weather,
          a budget tracker, and an interactive map.
        </p>
        <button
          className="mt-8 flex items-center gap-2 px-7 py-3.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-200 transition-all duration-150 hover:scale-[1.02]"
          onClick={() => document.dispatchEvent(new CustomEvent('wandr:focus-chat'))}
        >
          <Sparkles size={16} />
          Start planning your first trip
        </button>
        <p className="mt-3 text-xs text-gray-400">
          Takes about 30 seconds to get a full itinerary
        </p>
      </motion.div>

      {/* Feature grid */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-3xl"
        initial="hidden"
        animate="show"
        variants={gridVariants}
      >
        {features.map(({ icon: Icon, title, desc, color }) => (
          <motion.div
            key={title}
            variants={cardVariants}
            className="flex items-start gap-3 p-4 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
              <Icon size={17} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">{title}</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}
