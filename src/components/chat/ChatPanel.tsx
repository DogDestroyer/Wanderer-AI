'use client'

import { useState, useRef, useEffect, useCallback, FormEvent, KeyboardEvent } from 'react'
import { Send, Sparkles, Loader2, User, Wand2, Settings2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '@/lib/store'
import type { ChatMessage, AgentTripResponse } from '@/lib/types'
import { cn } from '@/lib/utils'
import { AgentSettingsPanel } from './AgentSettingsPanel'
import { showToast } from '@/components/ui/Toast'

// ─── ChatPanel ─────────────────────────────────────────────────────────────────

export function ChatPanel() {
  const [input, setInput] = useState('')
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const activeTripId = useStore((s) => s.activeTripId)
  const trips = useStore((s) => s.trips)
  const chatHistory = useStore((s) => s.chatHistory)
  const isGenerating = useStore((s) => s.isGenerating)
  const addChatMessage = useStore((s) => s.addChatMessage)
  const updateLastAssistantMessage = useStore((s) => s.updateLastAssistantMessage)
  const setIsGenerating = useStore((s) => s.setIsGenerating)
  const createTrip = useStore((s) => s.createTrip)
  const updateTrip = useStore((s) => s.updateTrip)
  const agentSettings = useStore((s) => s.agentSettings)

  const activeTrip = activeTripId ? trips[activeTripId] : null
  const chatKey = activeTripId ?? '__new__'
  const messages: ChatMessage[] = chatHistory[chatKey] ?? []

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus textarea when panel mounts (e.g. opened via Chat button)
  useEffect(() => {
    requestAnimationFrame(() => { textareaRef.current?.focus() })
  }, [])

  // Auto-resize textarea
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  // Focus when WelcomeScreen CTA fires
  useEffect(() => {
    function handler() { textareaRef.current?.focus() }
    document.addEventListener('wandr:focus-chat', handler)
    return () => document.removeEventListener('wandr:focus-chat', handler)
  }, [])

  // Pre-fill textarea from DayCard rain-warning "Get alternatives →"
  useEffect(() => {
    function handler(e: Event) {
      const msg = (e as CustomEvent<{ message: string }>).detail?.message
      if (!msg) return
      setInput(msg)
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`
        el.focus()
      })
    }
    document.addEventListener('wandr:chat-prompt', handler)
    return () => document.removeEventListener('wandr:chat-prompt', handler)
  }, [])

  const handleSendRef = useRef<((e?: FormEvent, override?: string) => Promise<void>) | null>(null)

  const handleSend = useCallback(async (e?: FormEvent, override?: string) => {
    e?.preventDefault()
    const text = (override ?? input).trim()
    if (!text || isGenerating) return

    const chatId = activeTripId ?? '__new__'
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    addChatMessage(chatId, userMessage)
    if (!override) {
      setInput('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    }
    setIsGenerating(true)

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
    }
    addChatMessage(chatId, assistantMessage)

    const historyToSend = [...messages, userMessage].map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyToSend, trip: activeTrip ?? null, agentSettings }),
      })

      if (!res.ok || !res.body) throw new Error(`Server error: ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let streamedText = ''

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = JSON.parse(line.slice(6)) as {
            type: 'delta' | 'done' | 'error'
            text?: string
            response?: AgentTripResponse
            message?: string
          }

          if (payload.type === 'delta' && payload.text) {
            streamedText += payload.text
            updateLastAssistantMessage(chatId, streamedText)
          }

          if (payload.type === 'done' && payload.response) {
            const response = payload.response
            updateLastAssistantMessage(chatId, response.message, false)
            if (response.action === 'create' && response.trip) {
              createTrip(response.trip)
            } else if (response.action === 'patch' && response.patch && activeTripId) {
              const { tripId: _id, dayIds: _dayIds, ...tripFields } = response.patch
              updateTrip(activeTripId, tripFields as Partial<import('@/lib/types').TripPlan>)
            }
          }

          if (payload.type === 'error') {
            updateLastAssistantMessage(chatId, "Sorry, something went wrong — please try again.", false)
          }
        }
      }
    } catch {
      updateLastAssistantMessage(chatId, "Sorry, I couldn't connect to the AI. Please try again.", false)
    } finally {
      setIsGenerating(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, isGenerating, activeTripId, messages])

  useEffect(() => { handleSendRef.current = handleSend }, [handleSend])

  useEffect(() => {
    function handler(e: Event) {
      const msg = (e as CustomEvent<{ message: string }>).detail?.message
      if (msg) handleSendRef.current?.(undefined, msg)
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
        requestAnimationFrame(() => {
          const el = textareaRef.current
          if (!el) return
          el.style.height = 'auto'
          el.style.height = `${Math.min(el.scrollHeight, 120)}px`
          el.focus()
        })
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

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
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
                  onClick={() => { setInput(prompt); textareaRef.current?.focus() }}
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
        <form onSubmit={handleSend} className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={activeTrip ? 'Ask to change something…' : 'Describe your dream trip…'}
            rows={1}
            disabled={isGenerating}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={cn(
              'flex-1 resize-none rounded-xl border border-[#2a2a2a] bg-[#111111] px-3 py-2.5 text-[13px]',
              'text-[#f0f0f0] placeholder:text-[#444] leading-relaxed',
              'focus:outline-none focus:border-[#444]',
              'disabled:opacity-40 transition-all overflow-hidden',
            )}
            style={{ minHeight: '40px', maxHeight: '120px' }}
          />

          {/* Enhance button */}
          <button
            type="button"
            onClick={handleEnhance}
            disabled={!input.trim() || isGenerating || isEnhancing}
            title="Enhance prompt with AI"
            className={cn(
              'flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border transition-colors',
              'border-[#2a2a2a] bg-[#111111] text-[#555]',
              'hover:border-[#444] hover:text-[#f0f0f0]',
              'disabled:opacity-30 disabled:cursor-not-allowed',
            )}
          >
            {isEnhancing ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Wand2 size={13} />
            )}
          </button>

          {/* Send button */}
          <button
            type="submit"
            disabled={!input.trim() || isGenerating}
            className={cn(
              'flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors',
              'bg-white text-black hover:bg-[#e8e8e8] active:bg-[#d0d0d0]',
              'disabled:bg-[#1a1a1a] disabled:text-[#444]',
            )}
          >
            {isGenerating ? (
              <Loader2 size={14} className="animate-spin text-[#555]" />
            ) : (
              <Send size={13} />
            )}
          </button>
        </form>
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
