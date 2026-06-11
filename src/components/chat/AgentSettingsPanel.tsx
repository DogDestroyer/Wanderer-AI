'use client'

import { useStore } from '@/lib/store'
import type { AgentSettings } from '@/lib/types'
import { cn } from '@/lib/utils'

// ─── AgentSettingsPanel ───────────────────────────────────────────────────────
// Collapsible panel in ChatPanel. Lets the user control exactly how the AI
// plans their trip. Every toggle updates agentSettings in the Zustand store,
// which gets sent with every /api/chat request to shape the system prompt.

export function AgentSettingsPanel() {
  const settings = useStore((s) => s.agentSettings)
  const update = useStore((s) => s.updateAgentSettings)

  return (
    <div className="border-b border-[#1f1f1f] bg-[#0d0d0d] px-4 py-3 space-y-4 text-sm">

      {/* ── Planning ─────────────────────────────────────────────────────────── */}
      <section>
        <p className="text-[10px] font-semibold text-[#444] uppercase tracking-widest mb-2.5">
          Planning
        </p>

        {/* Activities per day */}
        <div className="mb-3">
          <p className="text-[11px] font-medium text-[#666] mb-1.5">Activities per day</p>
          <div className="flex gap-1">
            {PACE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => update({ activitiesPerDay: opt.value })}
                className={cn(
                  'flex-1 py-1.5 rounded-lg text-[11px] font-medium border transition-all',
                  settings.activitiesPerDay === opt.value
                    ? 'bg-white text-black border-white'
                    : 'bg-transparent text-[#555] border-[#2a2a2a] hover:border-[#444] hover:text-[#f0f0f0]'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-[#444] mt-1 leading-relaxed">
            {PACE_OPTIONS.find(o => o.value === settings.activitiesPerDay)?.hint}
          </p>
        </div>

        {/* Boolean planning toggles */}
        <div className="space-y-2">
          {PLANNING_TOGGLES.map((t) => (
            <ToggleRow
              key={t.key}
              label={t.label}
              description={t.description}
              enabled={settings[t.key as keyof AgentSettings] as boolean}
              onChange={(v) => update({ [t.key]: v })}
            />
          ))}
        </div>
      </section>

      {/* ── Sources & Style ──────────────────────────────────────────────────── */}
      <section>
        <p className="text-[10px] font-semibold text-[#444] uppercase tracking-widest mb-2.5">
          Sources &amp; Style
        </p>
        <p className="text-[11px] text-[#444] mb-2.5 leading-relaxed">
          Turn on what you want the AI to emphasise. Mix and match freely.
        </p>
        <div className="space-y-2">
          {SOURCE_TOGGLES.map((t) => (
            <ToggleRow
              key={t.key}
              emoji={t.emoji}
              label={t.label}
              description={t.description}
              enabled={settings[t.key as keyof AgentSettings] as boolean}
              onChange={(v) => update({ [t.key]: v })}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

// ─── ToggleRow ────────────────────────────────────────────────────────────────

function ToggleRow({
  emoji, label, description, enabled, onChange,
}: {
  emoji?: string
  label: string
  description: string
  enabled: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 min-w-0">
        {emoji && <span className="text-[13px] shrink-0">{emoji}</span>}
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-[#888] leading-tight">{label}</p>
          <p className="text-[10px] text-[#444] leading-tight truncate">{description}</p>
        </div>
      </div>
      <Toggle enabled={enabled} onChange={onChange} />
    </div>
  )
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      aria-pressed={enabled}
      className={cn(
        'relative flex-shrink-0 w-9 h-5 rounded-full transition-colors duration-200',
        enabled ? 'bg-white' : 'bg-[#2a2a2a]'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 w-4 h-4 rounded-full shadow-sm transition-transform duration-200',
          enabled ? 'bg-black translate-x-4' : 'bg-[#555]'
        )}
      />
    </button>
  )
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const PACE_OPTIONS: { value: AgentSettings['activitiesPerDay']; label: string; hint: string }[] = [
  { value: 'auto',     label: 'Auto',     hint: 'Claude decides based on your trip style' },
  { value: 'light',    label: 'Light',    hint: '2–4 activities — relaxed, unhurried days' },
  { value: 'moderate', label: 'Moderate', hint: '5–7 activities — a good mix of depth and variety' },
  { value: 'packed',   label: 'Packed',   hint: '8–10 activities — squeeze in as much as possible' },
]

const PLANNING_TOGGLES = [
  { key: 'groupByLocation',  label: 'Cluster nearby spots',   description: 'Group activities by neighbourhood to minimise travel' },
  { key: 'includeMeals',     label: 'Include meal stops',     description: 'Explicitly plan breakfast, lunch, and dinner' },
  { key: 'includeTransport', label: 'Include transport steps', description: 'Add transit/walking steps between activities' },
]

const SOURCE_TOGGLES = [
  { key: 'mainstream',    emoji: '🏛️', label: 'Tourist highlights', description: 'Famous landmarks and must-see attractions' },
  { key: 'hiddenGems',    emoji: '💎', label: 'Hidden gems',         description: 'Off-the-beaten-path, local favourites' },
  { key: 'foodScene',     emoji: '🍜', label: 'Food & dining',       description: 'Street food, restaurants, food markets' },
  { key: 'historyCulture',emoji: '📚', label: 'History & culture',   description: 'Museums, heritage sites, local traditions' },
  { key: 'outdoors',      emoji: '🌿', label: 'Nature & outdoors',   description: 'Hiking, parks, beaches, scenic spots' },
  { key: 'nightlife',     emoji: '🎭', label: 'Nightlife',           description: 'Bars, clubs, live music, evening entertainment' },
  { key: 'shopping',      emoji: '🛍️', label: 'Shopping',           description: 'Markets, boutiques, shopping districts' },
]
