'use client'

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react'
import { Send, Sparkles, Loader2, User } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { ChatMessage, AgentTripResponse } from '@/lib/types'
import { cn } from '@/lib/utils'

// ─── ChatPanel ─────────────────────────────────────────────────────────────────
// Persistent chat interface. When no trip exists, messages are stored under the
// temporary '__new__' key. On trip creation the store automatically migrates them.

export function ChatPanel() {
  const [input, setInput] = useState('')
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

  // Active trip object (null when no trip yet)
  const activeTrip = activeTripId ? trips[activeTripId] : null

  // Chat messages for the current context (__new__ = before any trip exists)
  const chatKey = activeTripId ?? '__new__'
  const messages: ChatMessage[] = chatHistory[chatKey] ?? []

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  // Focus the textarea when the WelcomeScreen "Start planning" button is clicked
  useEffect(() => {
    function handler() {
      textareaRef.current?.focus()
    }
    document.addEventListener('wandr:focus-chat', handler)
    return () => document.removeEventListener('wandr:focus-chat', handler)
  }, [])

  // Pre-fill the textarea from DayCard rain-warning "Get alternatives →" button
  useEffect(() => {
    function handler(e: Event) {
      const msg = (e as CustomEvent<{ message: string }>).detail?.message
      if (!msg) return
      setInput(msg)
      // Resize the textarea to fit the pre-filled text on the next frame
      // (after React renders the new `input` value into the DOM)
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

  async function handleSend(e?: FormEvent) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || isGenerating) return

    // The chat key is captured NOW — it may be '__new__' or a real trip ID.
    // After createTrip() the store migrates '__new__' → real ID automatically.
    const chatId = activeTripId ?? '__new__'

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }

    addChatMessage(chatId, userMessage)
    setInput('')
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    setIsGenerating(true)

    // Placeholder assistant message — updated as stream arrives
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
    }
    addChatMessage(chatId, assistantMessage)

    // Build the message history to send (all previous + the new user message)
    const historyToSend = [...messages, userMessage].map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyToSend,
          trip: activeTrip ?? null,
        }),
      })

      if (!res.ok || !res.body) {
        throw new Error(`Server error: ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let streamedText = '' // local accumulator — avoids stale-closure reads

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
            // Finalize the streamed message and clear the isStreaming flag
            updateLastAssistantMessage(chatId, response.message, false)

            // Apply trip changes
            if (response.action === 'create' && response.trip) {
              // createTrip migrates chatHistory['__new__'] → chatHistory[trip.id]
              createTrip(response.trip)
            } else if (response.action === 'patch' && response.patch && activeTripId) {
              // Strip AgentTripPatch-only fields (tripId, dayIds) before passing to updateTrip
              const { tripId: _id, dayIds: _dayIds, ...tripFields } = response.patch
              updateTrip(activeTripId, tripFields as Partial<import('@/lib/types').TripPlan>)
            }
          }

          if (payload.type === 'error') {
            updateLastAssistantMessage(
              chatId,
              "Sorry, something went wrong — please try again.",
              false
            )
          }
        }
      }
    } catch {
      updateLastAssistantMessage(
        chatId,
        "Sorry, I couldn't connect to the AI. Please try again.",
        false
      )
    } finally {
      setIsGenerating(false)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm shadow-indigo-200">
          <Sparkles size={13} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 leading-tight">Wandr AI</p>
          <p className="text-[11px] text-gray-400 leading-tight">Travel planning assistant</p>
        </div>
        {isGenerating && (
          <div className="ml-auto flex items-center gap-1.5 text-indigo-500">
            <Loader2 size={12} className="animate-spin" />
            <span className="text-[11px]">Thinking…</span>
          </div>
        )}
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 flex items-center justify-center mb-3">
              <Sparkles size={20} className="text-indigo-500" />
            </div>
            <p className="text-sm font-semibold text-gray-700 mb-1">Plan your trip with AI</p>
            <p className="text-xs text-gray-400 leading-relaxed max-w-[200px]">
              Tell me where you want to go and I&apos;ll build a full itinerary in seconds.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-2 w-full">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => {
                    setInput(prompt)
                    textareaRef.current?.focus()
                  }}
                  className="text-left text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg px-3 py-2 transition-colors leading-relaxed"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-gray-100 flex-shrink-0">
        <form onSubmit={handleSend} className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={activeTrip ? 'Ask to change something…' : 'Describe your dream trip…'}
            rows={1}
            disabled={isGenerating}
            className={cn(
              'flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm',
              'text-gray-800 placeholder:text-gray-400 leading-relaxed',
              'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
              'disabled:opacity-50 transition-all overflow-hidden',
            )}
            style={{ minHeight: '40px', maxHeight: '120px' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isGenerating}
            className={cn(
              'flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center',
              'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700',
              'disabled:bg-gray-100 disabled:text-gray-300',
              'text-white transition-colors',
            )}
          >
            {isGenerating ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
          </button>
        </form>
        <p className="text-[10px] text-gray-400 mt-1.5 text-center">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}

// ─── MessageBubble ─────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles size={10} className="text-white" />
        </div>
      )}

      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-indigo-600 text-white rounded-tr-sm'
            : 'bg-gray-100 text-gray-800 rounded-tl-sm',
        )}
      >
        {message.content ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : message.isStreaming ? (
          <TypingIndicator />
        ) : null}
      </div>

      {isUser && (
        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
          <User size={11} className="text-gray-500" />
        </div>
      )}
    </div>
  )
}

// ─── TypingIndicator ───────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <span className="flex gap-1 items-center py-0.5">
      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
    </span>
  )
}

// ─── Starter prompts ───────────────────────────────────────────────────────────

const STARTER_PROMPTS = [
  '5 days in Tokyo — art, food, and temples 🇯🇵',
  'Weekend in Paris on a budget 🥐',
  '2 weeks backpacking Southeast Asia 🌴',
]
