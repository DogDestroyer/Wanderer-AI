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
}

interface ToastItem extends ToastPayload {
  id: string
}

// ─── ToastContainer ───────────────────────────────────────────────────────────
// Mount this once in AppShell. Toasts are triggered from anywhere via:
//   document.dispatchEvent(new CustomEvent('wandr:toast', { detail: { message, type } }))

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
        detail.duration ?? 3200
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
              'rounded-xl shadow-lg shadow-black/[0.08] border',
              'text-sm font-medium whitespace-nowrap',
              toast.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : toast.type === 'warning'
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-white text-gray-800 border-gray-100'
            )}
          >
            {toast.type === 'success' && (
              <CheckCircle size={14} className="text-emerald-500 shrink-0" />
            )}
            {toast.type === 'warning' && (
              <AlertTriangle size={14} className="text-amber-500 shrink-0" />
            )}
            {(!toast.type || toast.type === 'info') && (
              <Info size={14} className="text-indigo-500 shrink-0" />
            )}
            {toast.message}
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
