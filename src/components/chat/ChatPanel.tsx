'use client'

import { useState, useRef, useEffect } from 'react'
import { Sparkles, Loader2, User, Settings2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '@/lib/store'
import { useChatSend } from '@/hooks/useChatSend'
import type { ChatMessage } from '@/lib/types'
import { cn } from '@/lib/utils'
import { AgentSettingsPanel } from './AgentSettingsPanel'
import { showToast } from '@/components/ui/Toast'
import { ChatInput, type ChatInputHandle } from './ChatInput'

// ─── ChatPanel ─────────────────────────────────────────────────────────────────

export function ChatPanel() {
  const [input, setInput] = useState('')
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef   = useRef<ChatInputHandle>(null)

  const activeTripId = useStore((s) => s.activeTripId)
  const trips        = useStore((s) => s.trips)
  const chatHistory  = useStore((s) => s.chatHistory)
  const activeTrip   = activeTripId ? trips[activeTripId] : null

  const { sendMessage, isGenerating } = useChatSend()

  const chatKey  = activeTripId ?? '__new__'
  const messages: ChatMessage[] = chatHistory[chatKey] ?? []

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus on mount
  useEffect(() => {
    requestAnimationFrame(() => { chatInputRef.current?.focus() })
  }, [])

  // Focus when WelcomeScreen / Hero CTA fires
  useEffect(() => {
    function handler() { chatInputRef.current?.focus() }
    document.addEventListener('wandr:focus-chat', handler)
    return () => document.removeEventListener('wandr:focus-chat', handler)
  }, [])

  // Pre-fill textarea from DayCard rain-warning "Get alternatives →"
  useEffect(() => {
    function handler(e: Event) {
      const msg = (e as CustomEvent<{ message: string }>).detail?.message
      if (!msg) return
      setInput(msg)
      // Height auto-adjusts via useLayoutEffect in ChatInput; just focus
      requestAnimationFrame(() => { chatInputRef.current?.focus() })
    }
    document.addEventListener('wandr:chat-prompt', handler)
    return () => document.removeEventListener('wandr:chat-prompt', handler)
  }, [])

  // wandr:send-message — programmatic send (e.g. from DayCard or ItineraryView)
  const handleSendRef = useRef<((text: string, intent?: 'full' | 'quick') => void) | null>(null)

  async function handleSend(override?: string, intent: 'full' | 'quick' = 'full') {
    const text = (override ?? input).trim()
    if (!text || isGenerating) return
    if (!override) setInput('')
    // Height auto-resets via useLayoutEffect in ChatInput when value becomes ''
    await sendMessage(text, intent)
  }

  useEffect(() => {
    handleSendRef.current = (text: string, intent: 'full' | 'quick' = 'full') => handleSend(text, intent)
  })

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ message: string; intent?: 'full' | 'quick' }>).detail
      const msg = detail?.message
      // Programmatic sends from chips/day-edits are localized changes → 'quick' tier.
      if (msg) handleSendRef.current?.(msg, detail?.intent ?? 'quick')
    }
    document.addEventListener('wandr:send-message', handler)
    return () => document.removeEventListener('wandr:send-message', handler)
  }, [])

  // ── Prompt enhancer ──────────────────────────────────────────────────────────
  async function handleEnhance() {
    const text = input.trim()
    if (!text || isEnhancing || isGenerating) return
    setIsEnhancing(true)
    try {
      const res = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, trip: activeTrip ?? null }),
      })
      if (!res.ok) {
        const err = await res.text().catch(() => `Status ${res.status}`)
        console.error('[enhance] API error:', res.status, err)
        showToast({ message: 'Could not enhance prompt — try again', type: 'warning' })
        return
      }
      const data = await res.json()
      const enhanced: string | undefined = data.enhanced
      if (enhanced && enhanced !== text) {
        setInput(enhanced)
        requestAnimationFrame(() => { chatInputRef.current?.focus() })
        showToast({ message: 'Prompt enhanced ✦', type: 'success' })
      } else {
        showToast({ message: 'Nothing to improve — prompt looks good!', type: 'info' })
      }
    } catch (err) {
      console.error('[enhance] fetch error:', err)
      showToast({ message: 'Could not reach the server — check your connection', type: 'warning' })
    } finally {
      setIsEnhancing(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#1f1f1f] flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center">
          <Sparkles size={13} className="text-[#888]" />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-[#f0f0f0] leading-tight">Hodo AI</p>
          <p className="text-[10px] text-[#444] leading-tight">Travel planning assistant</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isGenerating && (
            <div className="flex items-center gap-1.5 text-[#555]">
              <Loader2 size={11} className="animate-spin" />
              <span className="text-[10px]">Thinking…</span>
            </div>
          )}
          <button
            onClick={() => setShowSettings((v) => !v)}
            title="Agent settings"
            className={cn(
              'w-7 h-7 rounded-lg flex items-center justify-center transition-colors',
              showSettings
                ? 'bg-white text-black'
                : 'text-[#444] hover:text-[#f0f0f0] hover:bg-[#1a1a1a]'
            )}
          >
            <Settings2 size={13} />
          </button>
        </div>
      </div>

      {/* ── Agent settings panel (collapsible) ─────────────────────────────── */}
      <AnimatePresence initial={false}>
        {showSettings && (
          <motion.div
            key="settings"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden flex-shrink-0"
          >
            <AgentSettingsPanel />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Message list ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
            <div className="w-10 h-10 rounded-xl bg-[#111111] border border-[#2a2a2a] flex items-center justify-center mb-3">
              <Sparkles size={18} className="text-[#555]" />
            </div>
            <p className="text-[13px] font-semibold text-[#f0f0f0] mb-1">Plan your trip with AI</p>
            <p className="text-[11px] text-[#444] leading-relaxed max-w-[200px]">
              Tell me where you want to go and I&apos;ll build a full itinerary in seconds.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-1.5 w-full">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => { setInput(prompt); chatInputRef.current?.focus() }}
                  className="text-left text-[11px] text-[#666] bg-[#111111] border border-[#1f1f1f] hover:border-[#333] hover:text-[#f0f0f0] rounded-lg px-3 py-2 transition-all leading-relaxed"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* ── Prompt tips ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isFocused && !isGenerating && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="mx-3 mb-1 rounded-xl border border-[#1f1f1f] bg-[#0d0d0d] px-3 py-2.5"
          >
            <p className="text-[10px] font-semibold text-[#444] uppercase tracking-wide mb-2">
              ✦ For best results, mention…
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {PROMPT_TIPS.map((tip) => (
                <div key={tip.label} className="flex items-start gap-1.5">
                  <span className="text-[12px] leading-none mt-px">{tip.emoji}</span>
                  <div>
                    <span className="text-[11px] font-semibold text-[#888]">{tip.label} </span>
                    <span className="text-[11px] text-[#444]">{tip.example}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Input area ───────────────────────────────────────────────────────── */}
      <div className="px-3 pb-3 pt-2 border-t border-[#1f1f1f] flex-shrink-0">
        <ChatInput
          ref={chatInputRef}
          value={input}
          onChange={setInput}
          onSubmit={handleSend}
          onEnhance={handleEnhance}
          isGenerating={isGenerating}
          isEnhancing={isEnhancing}
          placeholder={activeTrip ? 'Ask to change something…' : 'Describe your dream trip…'}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          variant="panel"
        />
        <p className="text-[10px] text-[#333] mt-1.5 text-center">
          Enter to send · Shift+Enter for new line · <span className="text-[#444]">✦ wand to enhance</span>
        </p>
      </div>
    </div>
  )
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  return (
    <motion.div
      className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles size={9} className="text-[#666]" />
        </div>
      )}

      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
          isUser
            ? 'bg-white text-black rounded-tr-sm'
            : 'bg-[#111111] border border-[#1f1f1f] text-[#e0e0e0] rounded-tl-sm',
        )}
      >
        {message.content ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : message.isStreaming ? (
          <TypingIndicator />
        ) : null}
      </div>

      {isUser && (
        <div className="w-6 h-6 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center shrink-0 mt-0.5">
          <User size={10} className="text-[#555]" />
        </div>
      )}
    </motion.div>
  )
}

// ─── TypingIndicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <span className="flex gap-1 items-center py-0.5">
      <span className="w-1.5 h-1.5 bg-[#444] rounded-full animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 bg-[#444] rounded-full animate-bounce [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 bg-[#444] rounded-full animate-bounce [animation-delay:300ms]" />
    </span>
  )
}

// ─── Prompt tips ─────────────────────────────────────────────────────────────

const PROMPT_TIPS = [
  { emoji: '📍', label: 'Where',     example: '"Tokyo" or "3 cities"' },
  { emoji: '📅', label: 'Duration',  example: '"5 days" or "2 weeks"' },
  { emoji: '🗓️', label: 'Dates',     example: '"March" or "summer 2025"' },
  { emoji: '💰', label: 'Budget',    example: '"budget" / "luxury"' },
  { emoji: '🎯', label: 'Interests', example: '"food, temples, hiking"' },
  { emoji: '👥', label: 'Group',     example: '"solo" / "family of 4"' },
]

// ─── Starter prompts ─────────────────────────────────────────────────────────

const STARTER_PROMPTS = [
  '5 days in Tokyo — art, food, and temples 🇯🇵',
  'Weekend in Paris on a budget 🥐',
  '2 weeks backpacking Southeast Asia 🌴',
]
