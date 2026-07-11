'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { ChatMessage } from '@/lib/types'
import { useWeather } from '@/hooks/useWeather'
import { ToastContainer } from '@/components/ui/Toast'
import { Header } from './Header'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { useChatSend } from '@/hooks/useChatSend'
import { Wizard } from '@/components/wizard/Wizard'
import { ItineraryView } from '@/components/itinerary/ItineraryView'
import { ConstructionScaffold } from '@/components/itinerary/ConstructionScaffold'

// ─── AppShell ─────────────────────────────────────────────────────────────────
// Controls the app's top-level modes:
//   • Wizard — full-screen new-trip planning wizard (replaces the old hero)
//   • Normal — active trip, itinerary + chat sidebar
//
// A brand-new trip is started through the wizard (auto-opened on a fresh start,
// or via Header "New trip"). Everything below the wizard — itinerary, tabs,
// chat, live data — is unchanged.

export function AppShell() {
  const hasHydrated  = useStore((s) => s._hasHydrated)
  const activeTripId = useStore((s) => s.activeTripId)
  const trips        = useStore((s) => s.trips)
  const isGenerating = useStore((s) => s.isGenerating)
  const chatHistory  = useStore((s) => s.chatHistory)
  const wizardActive = useStore((s) => s.wizard.active)
  const startWizard  = useStore((s) => s.startWizard)
  const build        = useStore((s) => s.build)
  const activeTrip   = activeTripId ? trips[activeTripId] : null
  const buildLocked  = build.active && build.phase !== 'complete'

  // chatOpen: sidebar visibility in normal mode. On phones the sidebar is
  // full-width (it would completely cover the itinerary), so it starts CLOSED
  // below md and open on desktop. Runs only on the client (skipHydration means
  // this component meaningfully renders post-hydration anyway).
  const [chatOpen, setChatOpen] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 768px)').matches,
  )
  // Unread indicator: the agent's summary waits in the chat after a build —
  // the panel never auto-opens; a subtle dot on the Chat button marks it.
  const [chatUnread, setChatUnread] = useState(false)
  const prevBuildActive = useRef(false)
  useEffect(() => {
    if (build.active && !prevBuildActive.current) {
      // A live build starts: the user watches the construction full-width.
      setChatOpen(false)
      setChatUnread(false)
    } else if (!build.active && prevBuildActive.current) {
      // Build finished: chat stays closed; the summary sits unread inside it.
      setChatUnread(true)
    }
    prevBuildActive.current = build.active
  }, [build.active])

  function toggleChat() {
    setChatOpen((v) => {
      if (!v) setChatUnread(false) // opening reads the summary
      return !v
    })
  }

  // A chat-prompt (e.g. the rain banner's "Get alternatives") needs the panel:
  // if it's closed, open it and re-dispatch once so the mounted panel prefills.
  useEffect(() => {
    function onPrompt(e: Event) {
      setChatOpen((open) => {
        if (!open) {
          const detail = (e as CustomEvent).detail
          setTimeout(() => document.dispatchEvent(new CustomEvent('wandr:chat-prompt', { detail })), 180)
          return true
        }
        return open
      })
    }
    document.addEventListener('wandr:chat-prompt', onPrompt)
    return () => document.removeEventListener('wandr:chat-prompt', onPrompt)
  }, [])

  // A pre-trip conversation that exists but never produced a trip (e.g. a dropped
  // stream). We must NOT silently reset — show a clear "interrupted, retry" state.
  const newChatMsgs = chatHistory['__new__'] ?? []
  const hasPendingNewChat = newChatMsgs.length > 0

  // A genuinely fresh start — no trip, nothing generating/building or interrupted.
  // This is where the wizard belongs, so we auto-open it.
  const isFreshStart = hasHydrated && !activeTripId && !isGenerating && !hasPendingNewChat && !build.active

  // Weather hook (no-op when trip is null)
  useWeather(activeTrip)

  // Auto-open the wizard on a fresh start.
  useEffect(() => {
    if (isFreshStart && !wizardActive) startWizard()
  }, [isFreshStart, wizardActive, startWizard])

  // ── Skeleton until localStorage has been read ───────────────────────────────
  if (!hasHydrated) {
    return (
      <div className="flex flex-col h-screen bg-[#0a0a0a]">
        <div className="h-14 border-b border-[#1f1f1f] animate-pulse bg-[#111111]" />
        <div className="flex flex-1 items-center justify-center">
          <div className="w-5 h-5 border border-[#333] border-t-white rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  // ── Wizard takeover ─────────────────────────────────────────────────────────
  if (wizardActive) {
    return (
      <>
        <ToastContainer />
        <Wizard />
      </>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] overflow-hidden">
      <ToastContainer />
      <ChatBridge />
      <Header chatOpen={chatOpen} onToggleChat={toggleChat} chatDisabled={buildLocked} chatUnread={chatUnread} />

      <motion.div
        key="normal"
        className="flex flex-1 overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Main itinerary area */}
        <main className="flex-1 overflow-y-auto min-h-0 min-w-0">
          {activeTrip ? (
            /* Same component throughout the build → completion (DOM parity, no
               swap). `building` drives the construction; null once settled. */
            <ItineraryView trip={activeTrip} building={build.active ? build : null} />
          ) : build.active ? (
            /* Phase 1: instant scaffold from the wizard answers (no trip yet). */
            <ConstructionScaffold build={build} />
          ) : isGenerating ? (
            <GeneratingSkeleton />
          ) : hasPendingNewChat ? (
            /* Generation finished without a trip → interrupted, retry affordance. */
            <InterruptedState messages={newChatMsgs} />
          ) : (
            /* Fresh start: the wizard is opening (effect above). Neutral hold. */
            <div className="flex flex-1 items-center justify-center h-full">
              <div className="w-5 h-5 border border-[#333] border-t-white rounded-full animate-spin" />
            </div>
          )}
        </main>

        {/* Chat sidebar — shown during the build (disabled until complete) and the
            interrupted state (so its retry listener is mounted). */}
        {(activeTrip || hasPendingNewChat || build.active) && chatOpen && (
          <div className="flex-shrink-0 w-full md:w-[380px] border-l border-[#1f1f1f] flex flex-col overflow-hidden">
            <ChatPanel locked={buildLocked} />
          </div>
        )}
      </motion.div>
    </div>
  )
}

// ─── ChatBridge ───────────────────────────────────────────────────────────────
// Headless, ALWAYS-mounted owner of the programmatic chat events. These used to
// live in ChatPanel, which meant "Resume", chip corrections, and re-plan sends
// silently no-oped whenever the chat sidebar was closed (default on phones, and
// always right after a live build). One global listener, no double-handling.

function ChatBridge() {
  const { sendMessage, resumeFill } = useChatSend()
  const activeTripId = useStore((s) => s.activeTripId)

  useEffect(() => {
    function onSend(e: Event) {
      const detail = (e as CustomEvent<{ message: string; intent?: 'full' | 'quick' }>).detail
      // Programmatic sends from chips/day-edits are localized changes → 'quick'.
      if (detail?.message) sendMessage(detail.message, detail.intent ?? 'quick')
    }
    function onResume() {
      if (activeTripId) resumeFill(activeTripId)
    }
    document.addEventListener('wandr:send-message', onSend)
    document.addEventListener('wandr:resume-fill', onResume)
    return () => {
      document.removeEventListener('wandr:send-message', onSend)
      document.removeEventListener('wandr:resume-fill', onResume)
    }
  }, [sendMessage, resumeFill, activeTripId])

  return null
}

// ─── GeneratingSkeleton ───────────────────────────────────────────────────────
// Shown in the main area while generating a new trip (no activeTripId yet).

function GeneratingSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-[#333]">
      <div className="w-5 h-5 border border-[#333] border-t-[#555] rounded-full animate-spin" />
      <p className="text-[12px]">Building your itinerary…</p>
    </div>
  )
}

// ─── InterruptedState ─────────────────────────────────────────────────────────
// Shown when a generation finished WITHOUT producing a trip (e.g. the stream was
// interrupted). Replaces the old silent fall-back to the empty hero screen with
// an explicit "something went wrong — retry" affordance. The conversation itself
// remains visible in the chat sidebar.

function InterruptedState({ messages }: { messages: ChatMessage[] }) {
  const clearChatThread = useStore((s) => s.clearChatThread)
  const startWizard     = useStore((s) => s.startWizard)

  // The user's most recent prompt — what we resend on retry.
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''

  function retry() {
    if (!lastUserMessage) return
    // Clear the interrupted thread, then resend as a fresh full generation.
    clearChatThread('__new__')
    requestAnimationFrame(() => {
      document.dispatchEvent(
        new CustomEvent('wandr:send-message', { detail: { message: lastUserMessage, intent: 'full' } }),
      )
    })
  }

  function startOver() {
    // Drop the interrupted thread and relaunch the new-trip wizard.
    clearChatThread('__new__')
    startWizard()
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
      <div className="w-10 h-10 rounded-xl bg-[#1a0e00] border border-[#5a3a00] flex items-center justify-center">
        <AlertTriangle size={18} className="text-[#f59e0b]" />
      </div>
      <div>
        <p className="text-[13px] font-semibold text-[#f0f0f0]">Generation was interrupted</p>
        <p className="text-[12px] text-[#666] mt-1 max-w-[300px] leading-relaxed">
          The plan didn&apos;t finish building — this usually means the request was cut off. Your message is saved.
        </p>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <button
          onClick={retry}
          disabled={!lastUserMessage}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white text-black text-[12px] font-semibold hover:bg-[#e8e8e8] transition-colors disabled:opacity-40"
        >
          <RotateCw size={12} />
          Retry
        </button>
        <button
          onClick={startOver}
          className="px-3.5 py-2 rounded-lg border border-[#2a2a2a] text-[#888] text-[12px] font-medium hover:text-[#f0f0f0] hover:border-[#444] transition-colors"
        >
          Start over
        </button>
      </div>
    </div>
  )
}
