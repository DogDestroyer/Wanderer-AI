'use client'

import { useState, FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lock, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = searchParams.get('from') ?? '/app'

  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        router.replace(from)
      } else {
        setError('Incorrect passcode. Please try again.')
        setPassword('')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-[11px] font-medium text-[#555] mb-1.5">
          Passcode
        </label>
        <div className="relative">
          <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#444]" />
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter passcode"
            autoFocus
            required
            className={cn(
              'w-full bg-[#161616] border border-[#2a2a2a] text-[#f0f0f0]',
              'placeholder:text-[#333] rounded-lg px-3 py-2.5 pl-9 pr-9 text-[13px]',
              'focus:outline-none focus:border-[#444]',
              'transition-colors'
            )}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#444] hover:text-[#888] transition-colors"
          >
            {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-[12px] text-[#ef4444] bg-[#1a0d0d] border border-[#3a1515] px-3 py-2 rounded-lg">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !password}
        className={cn(
          'w-full py-2.5 text-[13px] font-semibold rounded-lg transition-colors',
          'bg-white text-black hover:bg-[#e8e8e8] active:bg-[#d0d0d0]',
          'disabled:bg-[#1a1a1a] disabled:text-[#333] disabled:cursor-not-allowed'
        )}
      >
        {loading ? 'Checking…' : 'Enter Hodo'}
      </button>
    </form>
  )
}
