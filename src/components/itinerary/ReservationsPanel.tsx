'use client'

import { useState } from 'react'
import { Plane, Hotel, Utensils, Ticket, Bus, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import type { TripPlan, Reservation, ReservationType, ReservationStatus } from '@/lib/types'
import { useStore } from '@/lib/store'
import { useExchangeRates } from '@/hooks/useExchangeRates'
import { convertAmount, COMMON_CURRENCIES } from '@/lib/currency'
import { cn, formatCurrency, formatTime } from '@/lib/utils'
import { generateId } from '@/lib/utils'

const TYPE_ICON: Record<ReservationType, typeof Plane> = {
  flight: Plane, hotel: Hotel, restaurant: Utensils, activity: Ticket, transport: Bus,
}
const TYPES: ReservationType[] = ['flight', 'hotel', 'restaurant', 'activity', 'transport']
const STATUSES: ReservationStatus[] = ['booked', 'pending', 'cancelled']
const STATUS_STYLE: Record<ReservationStatus, string> = {
  booked:    'text-[#3eb87a] bg-[#0d1a14]',
  pending:   'text-[#d4a017] bg-[#1a1608]',
  cancelled: 'text-[#888] bg-[#1a1a1a] line-through',
}

export function ReservationsPanel({ trip }: { trip: TripPlan }) {
  const addReservation = useStore((s) => s.addReservation)
  const rates = useExchangeRates()
  const reservations = trip.reservations ?? []
  const [adding, setAdding] = useState(false)

  const actualTotal = reservations
    .filter((r) => r.status !== 'cancelled' && r.cost)
    .reduce((sum, r) => sum + convertAmount(r.cost!.amount, r.cost!.currency, trip.budget.currency, rates), 0)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 md:p-6 max-w-2xl mx-auto w-full pb-10 space-y-4">

        {/* Header + actual total */}
        <div className="bg-[#111111] rounded-xl border border-[#1f1f1f] p-4 flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-[#f0f0f0]">Reservations</p>
            <p className="text-[11px] text-[#555] mt-0.5">{reservations.length} booking{reservations.length === 1 ? '' : 's'}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-[#555]">Reserved actual</p>
            <p className="text-[14px] font-bold text-[#f0f0f0] tabular-nums">{formatCurrency(actualTotal, trip.budget.currency)}</p>
          </div>
        </div>

        {/* Add */}
        {adding ? (
          <ReservationForm
            trip={trip}
            onSave={(r) => { addReservation(trip.id, r); setAdding(false) }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-[#2a2a2a] text-[12px] text-[#666] hover:border-[#444] hover:text-[#f0f0f0] transition-colors"
          >
            <Plus size={13} /> Add reservation
          </button>
        )}

        {/* List */}
        <div className="space-y-2">
          {reservations.map((r) => (
            <ReservationCard key={r.id} trip={trip} reservation={r} rates={rates} />
          ))}
        </div>

        {reservations.length === 0 && !adding && (
          <p className="text-center text-[12px] text-[#444] py-6">
            No reservations yet. Add one above, or tap “Mark as reserved” on an activity.
          </p>
        )}
      </div>
    </div>
  )
}

// ─── ReservationCard ──────────────────────────────────────────────────────────

function ReservationCard({ trip, reservation: r, rates }: { trip: TripPlan; reservation: Reservation; rates: Record<string, number> }) {
  const updateReservation = useStore((s) => s.updateReservation)
  const deleteReservation = useStore((s) => s.deleteReservation)
  const [editing, setEditing] = useState(false)
  const Icon = TYPE_ICON[r.type]

  if (editing) {
    return (
      <ReservationForm
        trip={trip}
        initial={r}
        onSave={(patch) => { updateReservation(trip.id, r.id, patch); setEditing(false) }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  const costDisplay = r.cost
    ? formatCurrency(convertAmount(r.cost.amount, r.cost.currency, trip.budget.currency, rates), trip.budget.currency)
    : null

  return (
    <div className="group bg-[#111111] rounded-xl border border-[#1f1f1f] p-3 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-[#1a1a1a] flex items-center justify-center shrink-0">
        <Icon size={14} className="text-[#888]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-semibold text-[#f0f0f0]">{r.name}</span>
          <span className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded capitalize', STATUS_STYLE[r.status])}>{r.status}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-0.5 text-[10px] text-[#555]">
          <span className="capitalize">{r.type}</span>
          {r.date && <span>· {r.date}{r.time ? ` ${formatTime(r.time)}` : ''}</span>}
          {r.confirmationNumber && <span>· #{r.confirmationNumber}</span>}
        </div>
        {r.notes && <p className="text-[10px] text-[#666] mt-1 leading-snug">{r.notes}</p>}
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {costDisplay && <span className="text-[12px] font-bold text-[#f0f0f0] tabular-nums">{costDisplay}</span>}
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setEditing(true)} aria-label="Edit reservation" className="text-[#555] hover:text-[#aaa]"><Pencil size={11} /></button>
          <button onClick={() => deleteReservation(trip.id, r.id)} aria-label="Delete reservation" className="text-[#555] hover:text-[#ef4444]"><Trash2 size={11} /></button>
        </div>
      </div>
    </div>
  )
}

// ─── ReservationForm ──────────────────────────────────────────────────────────

function ReservationForm({
  trip, initial, onSave, onCancel,
}: {
  trip: TripPlan
  initial?: Reservation
  onSave: (r: Reservation) => void
  onCancel: () => void
}) {
  const [type, setType] = useState<ReservationType>(initial?.type ?? 'hotel')
  const [name, setName] = useState(initial?.name ?? '')
  const [date, setDate] = useState(initial?.date ?? trip.startDate)
  const [time, setTime] = useState(initial?.time ?? '')
  const [conf, setConf] = useState(initial?.confirmationNumber ?? '')
  const [amount, setAmount] = useState(initial?.cost?.amount ? String(initial.cost.amount) : '')
  const [currency, setCurrency] = useState(initial?.cost?.currency ?? trip.budget.currency)
  const [status, setStatus] = useState<ReservationStatus>(initial?.status ?? 'booked')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  function save() {
    if (!name.trim()) return
    const amt = Number(amount.replace(/[^0-9.]/g, ''))
    onSave({
      id: initial?.id ?? generateId(),
      type, name: name.trim(), date, time: time || undefined,
      confirmationNumber: conf.trim() || undefined,
      cost: amt > 0 ? { amount: amt, currency, isEstimate: false } : undefined,
      status, notes: notes.trim() || undefined,
      activityId: initial?.activityId,
    })
  }

  const input = 'w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-md px-2 py-1.5 text-[12px] text-[#f0f0f0] focus:outline-none focus:border-[#555] placeholder:text-[#444] [color-scheme:dark]'
  const label = 'text-[9px] font-medium uppercase tracking-wide text-[#555] mb-0.5 block'

  return (
    <div className="bg-[#111111] rounded-xl border border-[#2a2a2a] p-3 space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label}>Type</label>
          <select className={input} value={type} onChange={(e) => setType(e.target.value as ReservationType)}>
            {TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Status</label>
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value as ReservationStatus)}>
            {STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={label}>Name</label>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input autoFocus className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Park Hotel Tokyo" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={label}>Date</label><input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label className={label}>Time</label><input type="time" className={input} value={time} onChange={(e) => setTime(e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={label}>Confirmation #</label><input className={input} value={conf} onChange={(e) => setConf(e.target.value)} placeholder="ABC123" /></div>
        <div>
          <label className={label}>Cost</label>
          <div className="flex gap-1.5">
            <input type="number" min={0} className={input} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            <select className={cn(input, 'w-[70px]')} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {[...new Set([currency, ...COMMON_CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div>
        <label className={label}>Notes</label>
        <input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </div>
      <div className="flex items-center justify-end gap-2 pt-0.5">
        <button onClick={onCancel} className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-[#888] hover:text-[#f0f0f0] border border-[#2a2a2a] hover:border-[#444] transition-colors"><X size={11} /> Cancel</button>
        <button onClick={save} className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white text-black hover:bg-[#e8e8e8] transition-colors"><Check size={11} /> Save</button>
      </div>
    </div>
  )
}
