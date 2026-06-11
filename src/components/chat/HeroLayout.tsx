'use client'

import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { Send, Wand2, Loader2, SlidersHorizontal } from 'lucide-react'
import { motion } from 'framer-motion'
import { useStore } from '@/lib/store'
import { useChatSend } from '@/hooks/useChatSend'
import { PreferencesPanel } from '@/components/preferences/PreferencesPanel'
import { showToast } from '@/components/ui/Toast'
import { cn, getPaceLabel, getBudgetLabel, getTripStyleLabel } from '@/lib/utils'

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

const FEATURES = [
  { label: 'AI itineraries',   desc: 'Day-by-day plan from a single prompt.' },
  { label: 'Drag & drop',      desc: 'Reorder activities freely.' },
  { label: 'Live budget',      desc: 'Cost estimates and daily totals.' },
  { label: 'Interactive map',  desc: 'Every stop pinned on a live map.' },
  { label: 'Weather-aware',    desc: 'Real forecasts badge each day.' },
  { label: 'Partial re-plans', desc: 'Change one day, keep locked stops.' },
]

// ─── HeroLayout ───────────────────────────────────────────────────────────────

export function HeroLayout() {
  const [input, setInput] = useState('')
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [showPrefsPanel, setShowPrefsPanel] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const prefs          = useStore((s) => s.draftPreferences)
  const updateDraft    = useStore((s) => s.updateDraftPreferences)
  const { sendMessage, isGenerating } = useChatSend()

  // Focus on mount
  useEffect(() => {
    requestAnimationFrame(() => { textareaRef.current?.focus() })
  }, [])

  // wandr:focus-chat → focus textarea
  useEffect(() => {
    function handler() { textareaRef.current?.focus() }
    document.addEventListener('wandr:focus-chat', handler)
    return () => document.removeEventListener('wandr:focus-chat', handler)
  }, [])

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    const text = input.trim()
    if (!text || isGenerating) return
    sendMessage(text)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
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
        requestAnimationFrame(() => {
          const el = textareaRef.current
          if (!el) return
          el.style.height = 'auto'
          el.style.height = `${Math.min(el.scrollHeight, 160)}px`
          el.focus()
        })
        showToast({ message: 'Prompt enhanced ✦', type: 'success' })
      } else {
        showToast({ message: 'Nothing to improve — looks good!', type: 'info' })
      }
    } catch { showToast({ message: 'Could not reach the server', type: 'warning' }) }
    finally { setIsEnhancing(false) }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 bg-[#0a0a0a]">
      <motion.div
        className="w-full max-w-[560px]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
      >

        {/* Headline */}
        <motion.h1
          className="text-center text-[28px] font-bold text-[#f0f0f0] mb-6 tracking-tight"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.05, duration: 0.4 }}
        >
          Where to next?
        </motion.h1>

        {/* ── Compact preferences bar ───────────────────────────────────────── */}
        <motion.div
          className="flex items-start gap-2 mb-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.12, duration: 0.4 }}
        >
          {/* 3 inline sliders */}
          <div className="flex-1 grid grid-cols-3 gap-3">
            <CompactSlider
              label="Budget"
              value={prefs.budgetLevel}
              valueLabel={getBudgetLabel(prefs.budgetLevel)}
              onChange={(v) => updateDraft({ budgetLevel: v })}
            />
            <CompactSlider
              label="Pace"
              value={prefs.paceLevel}
              valueLabel={getPaceLabel(prefs.paceLevel)}
              onChange={(v) => updateDraft({ paceLevel: v })}
            />
            <CompactSlider
              label="Style"
              value={prefs.tripStyle ?? 50}
              valueLabel={getTripStyleLabel(prefs.tripStyle ?? 50)}
              onChange={(v) => updateDraft({ tripStyle: v })}
            />
          </div>

          {/* Expand button */}
          <button
            onClick={() => setShowPrefsPanel(true)}
            title="All preferences"
            className={cn(
              'flex-shrink-0 w-[38px] h-[38px] mt-[14px] rounded-xl flex items-center justify-center border transition-colors',
              'bg-[#111111] border-[#2a2a2a] text-[#555] hover:text-[#f0f0f0] hover:border-[#444]'
            )}
          >
            <SlidersHorizontal size={13} />
          </button>
        </motion.div>

        {/* ── Input area ────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.4, ease: EASE }}
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Describe your dream trip…"
              rows={1}
              disabled={isGenerating}
              className={cn(
                'flex-1 resize-none rounded-2xl border border-[#2a2a2a] bg-[#111111]',
                'px-4 py-3 text-[14px] text-[#f0f0f0] placeholder:text-[#444] leading-relaxed',
                'focus:outline-none focus:border-[#444] transition-all overflow-hidden',
                'disabled:opacity-40'
              )}
              style={{ minHeight: '50px', maxHeight: '160px' }}
            />

            {/* Enhance */}
            <button
              type="button"
              onClick={handleEnhance}
              disabled={!input.trim() || isGenerating || isEnhancing}
              title="Enhance prompt"
              className={cn(
                'flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center border transition-colors',
                'bg-[#111111] border-[#2a2a2a] text-[#555]',
                'hover:border-[#444] hover:text-[#f0f0f0]',
                'disabled:opacity-30 disabled:cursor-not-allowed'
              )}
            >
              {isEnhancing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            </button>

            {/* Send */}
            <button
              type="button"
              onClick={submit}
              disabled={!input.trim() || isGenerating}
              className={cn(
                'flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center transition-colors',
                'bg-white text-black hover:bg-[#e8e8e8] active:bg-[#d0d0d0]',
                'disabled:bg-[#1a1a1a] disabled:text-[#444]'
              )}
            >
              {isGenerating
                ? <Loader2 size={15} className="animate-spin text-[#555]" />
                : <Send size={14} />
              }
            </button>
          </div>

          <p className="text-[10px] text-[#333] mt-1.5 text-center">
            Enter to send · Shift+Enter for new line · <span className="text-[#3a3a3a]">✦ wand to enhance</span>
          </p>
        </motion.div>

        {/* ── Generating indicator ─────────────────────────────────────────── */}
        {isGenerating && (
          <motion.div
            className="mt-5 flex items-center justify-center gap-2 text-[#555]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="flex gap-1">
              <span className="w-1 h-1 bg-[#555] rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1 h-1 bg-[#555] rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1 h-1 bg-[#555] rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
            <span className="text-[12px]">Building your itinerary…</span>
          </motion.div>
        )}

        {/* ── Feature strip ─────────────────────────────────────────────────── */}
        {!isGenerating && (
          <motion.div
            className="mt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <div className="h-px bg-[#1a1a1a] mb-5" />
            <div className="grid grid-cols-3 gap-x-6 gap-y-3">
              {FEATURES.map(({ label, desc }) => (
                <div key={label}>
                  <p className="text-[11px] font-semibold text-[#555] mb-0.5">{label}</p>
                  <p className="text-[10px] text-[#333] leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Full preferences panel modal */}
      <PreferencesPanel open={showPrefsPanel} onClose={() => setShowPrefsPanel(false)} />
    </div>
  )
}

// ─── CompactSlider ────────────────────────────────────────────────────────────

function CompactSlider({
  label, value, valueLabel, onChange,
}: {
  label: string
  value: number
  valueLabel: string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium text-[#444]">{label}</span>
        <span className="text-[10px] font-semibold text-[#666] tabular-nums leading-none">{valueLabel}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer"
        style={{ accentColor: '#ffffff', height: '2px' }}
      />
    </div>
  )
}
