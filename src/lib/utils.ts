import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Time formatting ─────────────────────────────────────────────────────────

export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const displayH = h % 12 || 12
  return `${displayH}:${m.toString().padStart(2, '0')} ${period}`
}

export function formatDurationMins(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

// ─── Currency ────────────────────────────────────────────────────────────────

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// ─── Dates ───────────────────────────────────────────────────────────────────

export function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `${startStr} – ${endStr}`
}

export function formatNights(startDate: string, endDate: string): string {
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  const nights = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  return nights === 1 ? '1 night' : `${nights} nights`
}

export function formatDayLabel(dateStr: string, index: number): string {
  const date = new Date(dateStr + 'T00:00:00')
  return `Day ${index + 1} · ${date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })}`
}

// ─── IDs ─────────────────────────────────────────────────────────────────────

export function generateId(): string {
  // Fallback when crypto.randomUUID is unavailable (e.g., non-secure contexts)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2, 11) + Date.now().toString(36)
}

// ─── Weather ─────────────────────────────────────────────────────────────────

export function getWeatherEmoji(condition: string): string {
  const map: Record<string, string> = {
    sunny: '☀️',
    'partly-cloudy': '⛅',
    cloudy: '☁️',
    rainy: '🌧️',
    stormy: '⛈️',
    snowy: '❄️',
    windy: '💨',
  }
  return map[condition] ?? '🌤️'
}

export function isBadWeather(condition: string): boolean {
  return ['rainy', 'stormy', 'snowy'].includes(condition)
}

// ─── Sliders ─────────────────────────────────────────────────────────────────

export function getPaceLabel(value: number): string {
  if (value <= 20) return 'Very Relaxed'
  if (value <= 40) return 'Relaxed'
  if (value <= 60) return 'Balanced'
  if (value <= 80) return 'Active'
  return 'Packed'
}

export function getBudgetLabel(value: number): string {
  if (value <= 20) return 'Shoestring'
  if (value <= 40) return 'Budget'
  if (value <= 60) return 'Mid-range'
  if (value <= 80) return 'Comfortable'
  return 'Luxury'
}

export function getTripStyleLabel(value: number): string {
  if (value <= 20) return 'Pure Nature'
  if (value <= 40) return 'Mostly Nature'
  if (value <= 60) return 'Mixed'
  if (value <= 80) return 'Mostly City'
  return 'Pure City'
}

export function getDiningLabel(value: number): string {
  if (value <= 20) return 'Street Food'
  if (value <= 40) return 'Local Spots'
  if (value <= 60) return 'Mixed'
  if (value <= 80) return 'Restaurants'
  return 'Fine Dining'
}

// ─── Category helpers ────────────────────────────────────────────────────────

export function getCategoryColor(category: string): string {
  const map: Record<string, string> = {
    attraction: 'bg-violet-100 text-violet-700',
    food: 'bg-amber-100 text-amber-700',
    transport: 'bg-sky-100 text-sky-700',
    accommodation: 'bg-emerald-100 text-emerald-700',
    experience: 'bg-rose-100 text-rose-700',
    leisure: 'bg-teal-100 text-teal-700',
  }
  return map[category] ?? 'bg-gray-100 text-gray-700'
}

export function getCategoryEmoji(category: string): string {
  const map: Record<string, string> = {
    attraction: '🏛️',
    food: '🍽️',
    transport: '🚌',
    accommodation: '🏨',
    experience: '🎭',
    leisure: '🌿',
  }
  return map[category] ?? '📍'
}
