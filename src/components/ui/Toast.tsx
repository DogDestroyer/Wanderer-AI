'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Info, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToastPayload {
  message: string
  type?: 'success' | 'info' | 'warning'
  duration?: number
  /** Optional action button (e.g. Undo). Action toasts default to 6s. */
  action?: { label: string; onClick: () => void }
}

interface ToastItem extends ToastPayload {
  id: string
}

// ─── ToastContainer ───────────────────────────────────────────────────────────

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<ToastPayload>).detail
      if (!detail?.message) return
      const id = Math.random().toString(36).slice(2, 9)
      setToasts((prev) => [...prev, { ...detail, id }])
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        detail.duration ?? (detail.action ? 6000 : 3200)
      )
    }
    document.addEventListener('wandr:toast', handler)
    return () => document.removeEventListener('wandr:toast', handler)
  }, [])

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:translate-x-0 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'pointer-events-auto flex items-center gap-2.5 px-4 py-2.5',
              'rounded-xl border shadow-2xl shadow-black/60',
              'text-[13px] font-medium whitespace-nowrap',
              'bg-[#111111] border-[#2a2a2a] text-[#f0f0f0]'
            )}
          >
            {toast.type === 'success' && (
              <CheckCircle size={13} className="text-[#22c55e] shrink-0" />
            )}
            {toast.type === 'warning' && (
              <AlertTriangle size={13} className="text-[#f59e0b] shrink-0" />
            )}
            {(!toast.type || toast.type === 'info') && (
              <Info size={13} className="text-[#888] shrink-0" />
            )}
            {toast.message}
            {toast.action && (
              <button
                onClick={() => {
                  toast.action!.onClick()
                  setToasts((prev) => prev.filter((t) => t.id !== toast.id))
                }}
                className="ml-1 -mr-1 px-2.5 py-1 rounded-lg bg-white text-black text-[12px] font-semibold hover:bg-[#e8e8e8] transition-colors shrink-0"
              >
                {toast.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

// ─── Helper ───────────────────────────────────────────────────────────────────

export function showToast(payload: ToastPayload) {
  document.dispatchEvent(new CustomEvent('wandr:toast', { detail: payload }))
}
