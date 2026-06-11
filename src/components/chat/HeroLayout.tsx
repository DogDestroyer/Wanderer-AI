'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '@/lib/store'
import { useChatSend } from '@/hooks/useChatSend'
import { PreferencesPanel } from '@/components/preferences/PreferencesPanel'
import { PreferencesPill } from './PreferencesPill'
import { showToast } from '@/components/ui/Toast'
import { cn, getBudgetLabel, getPaceLabel } from '@/lib/utils'
import { ChatInput, type ChatInputHandle } from './ChatInput'

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

const FEATURES = [
  { label: 'AI itineraries',   desc: 'Day-by-day plan from a single prompt.' },
  { label: 'Drag & drop',      desc: 'Reorder activities freely.' },
  { label: 'Live budget',      desc: 'Cost estimates and daily totals.' },
  { label: 'Interactive map',  desc: 'Every stop pinned on a live map.' },
  { label: 'Weather-aware',    desc: 'Real forecasts badge each day.' },
  { label: 'Partial re-plans', desc: 'Change one day, keep locked stops.' },
]

// CHANGE 2: Example prompt chips that fill the input on tap
const EXAMPLE_PROMPTS = [
  'A relaxed week in Bali under $1,500',
  '10 days in Japan, food obsessed',
  'Long weekend in Melbourne with kids',
]

// ─── HeroLayout ───────────────────────────────────────────────────────────────

export function HeroLayout() {
  const [input, setInput]       = useState('')
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [showFullPanel, setShowFullPanel] = useState(false)
  const chatInputRef = useRef<ChatInputHandle>(null)

  // CHANGE 4: Returning user memory
  const userDefaults    = useStore((s) => s.userDefaults)
  const draftPreferences = useStore((s) => s.draftPreferences)

  const { sendMessage, isGenerating } = useChatSend()

  // Focus on mount
  useEffect(() => {
    requestAnimationFrame(() => { chatInputRef.current?.focus() })
  }, [])

  // wandr:focus-chat → focus textarea
  useEffect(() => {
    function handler() { chatInputRef.current?.focus() }
    document.addEventListener('wandr:focus-chat', handler)
    return () => document.removeEventListener('wandr:focus-chat', handler)
  }, [])

  function submit() {
    const text = input.trim()
    if (!text || isGenerating) return
    sendMessage(text)
    setInput('')
  }

  async function handleEnhance() {
    const text = input.trim()
    if (!text || isEnhancing || isGenerating) return
    setIsEnhancing(true)
    try {
      const res = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, trip: null }),
      })
      if (!res.ok) { showToast({ message: 'Could not enhance prompt — try again', type: 'warning' }); return }
      const { enhanced } = await res.json()
      if (enhanced && enhanced !== text) {
        setInput(enhanced)
        requestAnimationFrame(() => { chatInputRef.current?.focus() })
        showToast({ message: 'Prompt enhanced ✦', type: 'success' })
      } else {
        showToast({ message: 'Nothing to improve — looks good!', type: 'info' })
      }
    } catch { showToast({ message: 'Could not reach the server', type: 'warning' }) }
    finally { setIsEnhancing(false) }
  }

  // CHANGE 4: Build a readable summary of remembered defaults
  const defaultsSummary = userDefaults
    ? [
        userDefaults.partyType ?? 'traveller',
        getBudgetLabel(userDefaults.budgetLevel),
        ...(userDefaults.interests?.slice(0, 2) ?? []),
      ].join(' · ')
    : null

  return (
    <div className={cn(
      'flex flex-col items-center w-full h-full overflow-y-auto bg-[#0a0a0a]',
      'px-5 pt-8',
      'md:px-0 md:pt-0 md:justify-center md:pb-[12dvh]',
    )}>

      <motion.div
        className="w-full max-w-[760px] flex flex-col items-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
      >

        {/* ── 680px core: headline · input · hint · pill · chips ─────────────── */}
        <div className="w-full max-w-[680px]">

          {/* Headline */}
          <h1 className="text-center text-[36px] md:text-[56px] font-semibold text-[#f0f0f0] mb-10 tracking-[-0.02em]">
            Where to next?
          </h1>

          {/* ── Input ────────────────────────────────────────────────────────── */}
          <ChatInput
            ref={chatInputRef}
            value={input}
            onChange={setInput}
            onSubmit={submit}
            onEnhance={handleEnhance}
            isGenerating={isGenerating}
            isEnhancing={isEnhancing}
            placeholder="Describe your dream trip…"
            variant="hero"
          />

          {/* ── Hint + pill row ───────────────────────────────────────────────── */}
          <div className="flex items-center justify-between mt-3 gap-3">
            <p className="text-[12px] text-[#333]">
              Enter to send · Shift+Enter for new line · <span className="text-[#3a3a3a]">✦ wand to enhance</span>
            </p>
            {/* CHANGE 1: Preferences pill replaces the 3-slider row */}
            <PreferencesPill />
          </div>

          {/* CHANGE 4: Returning-user memory line */}
          {defaultsSummary && (
            <p className="text-[11px] text-[#333] mt-2 text-center">
              ↩ Remembered from last trip: {defaultsSummary}
              {' · '}
              <button
                onClick={() => setShowFullPanel(true)}
                className="underline hover:text-[#666] transition-colors"
              >
                change
              </button>
            </p>
          )}

          {/* CHANGE 2: Example prompt chips */}
          {!isGenerating && (
            <div className="mt-4 flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => {
                    setInput(prompt)
                    requestAnimationFrame(() => { chatInputRef.current?.focus() })
                  }}
                  className={cn(
                    'flex-shrink-0 px-3 py-1.5 rounded-full border border-[#1f1f1f] bg-transparent',
                    'text-[12px] text-[#444] whitespace-nowrap transition-colors',
                    'hover:border-[#333] hover:text-[#888]',
                  )}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Generating indicator */}
          {isGenerating && (
            <div className="mt-5 flex items-center justify-center gap-2 text-[#555]">
              <div className="flex gap-1">
                <span className="w-1 h-1 bg-[#555] rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1 h-1 bg-[#555] rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1 h-1 bg-[#555] rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
              <span className="text-[12px]">Building your itinerary…</span>
            </div>
          )}
        </div>

        {/* ── Feature pointers ─────────────────────────────────────────────────── */}
        {!isGenerating && (
          <div className="w-full mt-12">
            <div className="h-px bg-[#1a1a1a] mb-8" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-6">
              {FEATURES.map(({ label, desc }) => (
                <div key={label} className="text-left">
                  <p className="text-[14px] font-medium text-[#555] mb-1">{label}</p>
                  <p className="text-[13px] text-[#333] leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* Full preferences panel */}
      <PreferencesPanel open={showFullPanel} onClose={() => setShowFullPanel(false)} />
    </div>
  )
}
