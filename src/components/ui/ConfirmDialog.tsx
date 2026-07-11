'use client'

// ─── ConfirmDialog ────────────────────────────────────────────────────────────
// Styled replacement for window.confirm() on destructive actions, matching the
// black/white design system. Escape/overlay-click cancel; Enter confirms.

import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onConfirm, onCancel }: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    confirmRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-xs bg-[#111111] border border-[#2a2a2a] rounded-2xl shadow-2xl shadow-black/80 p-5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#1a0d0d] border border-[#3a1515] flex items-center justify-center shrink-0">
            <AlertTriangle size={14} className="text-[#ef4444]" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[#f0f0f0] leading-tight">{title}</p>
            <p className="text-[12px] text-[#888] mt-1 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg border border-[#2a2a2a] text-[#888] text-[12px] font-medium hover:text-[#f0f0f0] hover:border-[#444] transition-colors"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg bg-[#ef4444] text-white text-[12px] font-semibold hover:bg-[#dc2626] transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
