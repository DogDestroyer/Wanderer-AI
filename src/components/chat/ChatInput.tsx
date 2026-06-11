'use client'

import { useLayoutEffect, useRef, useImperativeHandle, type Ref, type KeyboardEvent } from 'react'
import { Send, Wand2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Public handle (for parent .focus() calls) ────────────────────────────────

export interface ChatInputHandle {
  focus: () => void
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  ref?: Ref<ChatInputHandle>
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onEnhance: () => void
  isGenerating: boolean
  isEnhancing: boolean
  placeholder?: string
  onFocus?: () => void
  onBlur?: () => void
  /** 'hero' = large centred layout  /  'panel' = compact sidebar layout */
  variant?: 'hero' | 'panel'
}

// Once this height is reached, the textarea scrolls instead of growing further.
// Both variants share the same cap — this is the core of the scrolling bug fix.
const MAX_HEIGHT = 200

// ─── ChatInput ────────────────────────────────────────────────────────────────

export function ChatInput({
  ref,
  value,
  onChange,
  onSubmit,
  onEnhance,
  isGenerating,
  isEnhancing,
  placeholder = 'Describe your dream trip…',
  onFocus,
  onBlur,
  variant = 'panel',
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Expose focus() to parent via ref
  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }))

  // Auto-resize synchronously before paint — no flicker.
  // Also handles the reset: when value is cleared the height collapses to minHeight.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [value])

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit()
    }
  }

  const isHero = variant === 'hero'

  return (
    <div className="flex items-end gap-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        disabled={isGenerating}
        onFocus={onFocus}
        onBlur={onBlur}
        className={cn(
          'flex-1 resize-none border border-[#2a2a2a] bg-[#111111]',
          'text-[#f0f0f0] placeholder:text-[#444]',
          'focus:outline-none focus:border-[#444] transition-all',
          'disabled:opacity-40',
          // THE FIX: overflow-y-auto lets text scroll once MAX_HEIGHT is reached
          'overflow-y-auto',
          isHero
            ? 'rounded-2xl px-5 py-[18px] text-[17px] leading-snug'
            : 'rounded-xl px-3 py-2.5 text-[13px] leading-relaxed',
        )}
        style={{
          minHeight: isHero ? '60px' : '40px',
          maxHeight: `${MAX_HEIGHT}px`,
        }}
      />

      {/* Enhance button */}
      <button
        type="button"
        onClick={onEnhance}
        disabled={!value.trim() || isGenerating || isEnhancing}
        title="Enhance prompt"
        className={cn(
          'flex-shrink-0 flex items-center justify-center border transition-colors',
          'bg-[#111111] border-[#2a2a2a] text-[#555]',
          'hover:border-[#444] hover:text-[#f0f0f0]',
          'disabled:opacity-30 disabled:cursor-not-allowed',
          isHero ? 'w-12 h-[60px] rounded-2xl' : 'w-10 h-10 rounded-xl',
        )}
      >
        {isEnhancing
          ? <Loader2 size={isHero ? 14 : 13} className="animate-spin" />
          : <Wand2 size={isHero ? 14 : 13} />
        }
      </button>

      {/* Send button */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={!value.trim() || isGenerating}
        className={cn(
          'flex-shrink-0 flex items-center justify-center transition-colors',
          'bg-white text-black hover:bg-[#e8e8e8] active:bg-[#d0d0d0]',
          'disabled:bg-[#1a1a1a] disabled:text-[#444]',
          isHero ? 'w-12 h-[60px] rounded-2xl' : 'w-10 h-10 rounded-xl',
        )}
      >
        {isGenerating
          ? <Loader2 size={isHero ? 15 : 14} className="animate-spin text-[#555]" />
          : <Send size={isHero ? 14 : 13} />
        }
      </button>
    </div>
  )
}
