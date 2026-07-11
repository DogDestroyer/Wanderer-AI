'use client'

// ─── BookingPanel ─────────────────────────────────────────────────────────────
// "Book this trip": a checklist auto-derived from trip state — flight legs,
// per-city hotel stays, and reservation-worthy activities — each with its
// affiliate deep link and a "Mark as booked" flow that creates the linked entry
// in the EXISTING Reservations machinery (budget actuals + itinerary badges
// follow for free). Orchestration layer only; booked/skipped are undoable.
// This is the most affiliate-dense surface: disclosure stays visible and
// nothing is ever gated behind booking.

import { useMemo, useState } from 'react'
import { Plane, BedDouble, Ticket, ExternalLink, Check, X } from 'lucide-react'
import type { TripPlan, Reservation, ReservationType } from '@/lib/types'
import { useStore } from '@/lib/store'
import { cn, formatCurrency } from '@/lib/utils'
import { convertCost, type RatesMap } from '@/lib/currency'
import { deriveBookingRows, rowStatus, type BookingRow, type BookingGroup } from '@/lib/booking'
import { showToast } from '@/components/ui/Toast'

const GROUPS: Array<{ id: BookingGroup; label: string; icon: typeof Plane }> = [
  { id: 'flights', label: 'Flights', icon: Plane },
  { id: 'stays', label: 'Stays', icon: BedDouble },
  { id: 'activities', label: 'Activities', icon: Ticket },
]

const groupToType: Record<BookingGroup, ReservationType> = { flights: 'flight', stays: 'hotel', activities: 'activity' }

export function BookingPanel({ trip, rates }: { trip: TripPlan; rates: RatesMap }) {
  const markBooked = useStore((s) => s.markBooked)
  const setBookingRowStatus = useStore((s) => s.setBookingRowStatus)
  const undo = useStore((s) => s.undo)
  const [formKey, setFormKey] = useState<string | null>(null)

  const rows = useMemo(() => deriveBookingRows(trip), [trip])
  const statuses = rows.map((r) => rowStatus(trip, r))
  const resolved = statuses.filter(Boolean).length
  const booked = statuses.filter((s) => s === 'booked').length
  const allDone = rows.length > 0 && resolved === rows.length
  const cur = trip.budget.currency

  function handleBook(row: BookingRow, actual: { amount: number | null; confirmation: string; name: string }) {
    const reservation: Reservation = {
      id: `res_${Math.random().toString(36).slice(2, 10)}`,
      type: groupToType[row.group],
      name: actual.name || row.title,
      date: row.checkIn ?? undefined,
      confirmationNumber: actual.confirmation || undefined,
      cost: actual.amount && actual.amount > 0 ? { amount: actual.amount, currency: cur, isEstimate: false } : undefined,
      status: 'booked',
      activityId: row.activityId,
    }
    markBooked(trip.id, row.key, row.title, reservation)
    setFormKey(null)
    showToast({ message: `Booked ${row.title}`, type: 'success', action: { label: 'Undo', onClick: () => undo() } })
  }

  function handleSkip(row: BookingRow) {
    setBookingRowStatus(trip.id, row.key, 'skipped', row.title)
    showToast({ message: `Skipped ${row.title}`, type: 'info', action: { label: 'Undo', onClick: () => undo() } })
  }

  return (
    <div className="flex-1 overflow-y-auto animate-in">
      <div className="p-4 md:p-6 max-w-2xl mx-auto w-full pb-12 space-y-5">

        {/* Progress header */}
        <div className="flex items-center justify-between" data-testid="booking-progress">
          <div>
            <h2 className="text-[15px] font-bold text-[#f0f0f0]">Book this trip</h2>
            <p className="text-[12px] text-[#777] mt-0.5">
              {allDone
                ? 'Everything handled — enjoy the trip ✓'
                : `${resolved} of ${rows.length} booked or skipped`}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {rows.map((r, i) => (
              <span
                key={r.key}
                className={cn('w-2 h-2 rounded-full',
                  statuses[i] === 'booked' ? 'bg-[#3eb87a]' : statuses[i] === 'skipped' ? 'bg-[#444]' : 'bg-[#1f1f1f] border border-[#333]')}
                title={`${r.title}: ${statuses[i] ?? 'not booked'}`}
              />
            ))}
          </div>
        </div>

        {GROUPS.map(({ id, label, icon: Icon }) => {
          const groupRows = rows.filter((r) => r.group === id)
          if (groupRows.length === 0) return null
          return (
            <div key={id}>
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#555] mb-2">
                <Icon size={11} /> {label}
              </p>
              <div className="space-y-2">
                {groupRows.map((row) => {
                  const status = rowStatus(trip, row)
                  const est = row.estCost ? convertCost(row.estCost, cur, rates) : null
                  return (
                    <div key={row.key} data-testid="booking-row" data-row-key={row.key} data-status={status ?? 'none'}
                      className={cn('rounded-xl border bg-[#111111] p-3.5 transition-colors',
                        status === 'booked' ? 'border-[#1f4030]' : 'border-[#1f1f1f]')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={cn('text-[13px] font-semibold leading-tight', status === 'skipped' ? 'text-[#555] line-through' : 'text-[#f0f0f0]')}>
                            {row.title}
                          </p>
                          <p className="text-[11px] text-[#777] mt-0.5">
                            {row.dates}
                            {est !== null && (
                              <span className="text-[#999] font-medium"> · ~{formatCurrency(est, cur)}</span>
                            )}
                            {row.indicative && est !== null && (
                              <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded bg-[#1a1a1a] text-[#666]" title="Indicative price — verify via the booking link">indicative</span>
                            )}
                          </p>
                        </div>
                        {/* Status pill */}
                        <span className={cn('shrink-0 text-[10px] font-medium px-2 py-1 rounded-full',
                          status === 'booked' ? 'bg-[#0d1a12] text-[#3eb87a]'
                          : status === 'skipped' ? 'bg-[#1a1a1a] text-[#555]'
                          : 'bg-[#1a1a1a] text-[#888]')}
                        >
                          {status === 'booked' ? 'Booked' : status === 'skipped' ? 'Skipped' : 'Not booked'}
                        </span>
                      </div>

                      {/* Actions */}
                      {!status && (
                        <div className="flex items-center gap-2 mt-3">
                          {row.link && (
                            <a
                              href={row.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              data-testid="booking-link"
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-black text-[11px] font-semibold hover:bg-[#e8e8e8] transition-colors"
                            >
                              {row.linkLabel} <ExternalLink size={10} />
                            </a>
                          )}
                          <button
                            onClick={() => setFormKey(formKey === row.key ? null : row.key)}
                            className="px-3 py-1.5 rounded-lg border border-[#2a2a2a] text-[#888] text-[11px] font-medium hover:text-[#f0f0f0] hover:border-[#444] transition-colors"
                          >
                            Mark as booked
                          </button>
                          <button
                            onClick={() => handleSkip(row)}
                            className="px-2 py-1.5 text-[11px] text-[#555] hover:text-[#888] transition-colors"
                          >
                            Skip
                          </button>
                        </div>
                      )}

                      {/* Inline "Mark as booked" form */}
                      {formKey === row.key && !status && (
                        <BookedForm row={row} currency={cur} defaultEst={est} onSave={(v) => handleBook(row, v)} onCancel={() => setFormKey(null)} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Affiliate disclosure — this is the densest affiliate surface */}
        <p className="text-[10px] text-[#555] leading-relaxed pt-2 border-t border-[#1f1f1f]">
          Prices are estimates or cached indications — always verify on the booking site.
          Some links may earn Hodo a commission at no extra cost to you. Nothing in this
          plan requires booking through these links.
        </p>
      </div>
    </div>
  )
}

// ─── BookedForm ───────────────────────────────────────────────────────────────

function BookedForm({ row, currency, defaultEst, onSave, onCancel }: {
  row: BookingRow
  currency: string
  defaultEst: number | null
  onSave: (v: { amount: number | null; confirmation: string; name: string }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(row.title)
  const [amount, setAmount] = useState(defaultEst !== null ? String(Math.round(defaultEst)) : '')
  const [confirmation, setConfirmation] = useState('')

  const inputCls = 'w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-md px-2 py-1.5 text-[12px] text-[#f0f0f0] focus:outline-none focus:border-[#555] placeholder:text-[#444]'

  return (
    <div className="mt-3 pt-3 border-t border-[#1f1f1f] grid grid-cols-2 gap-2" data-testid="booked-form">
      <div className="col-span-2">
        <label className="text-[9px] font-medium uppercase tracking-wide text-[#555] mb-0.5 block">Name</label>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="text-[9px] font-medium uppercase tracking-wide text-[#555] mb-0.5 block">Actual price ({currency})</label>
        <input className={inputCls} inputMode="numeric" placeholder="e.g. 420" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
      </div>
      <div>
        <label className="text-[9px] font-medium uppercase tracking-wide text-[#555] mb-0.5 block">Confirmation #</label>
        <input className={inputCls} placeholder="e.g. ABC123" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
      </div>
      <div className="col-span-2 flex items-center justify-end gap-2 mt-1">
        <button onClick={onCancel} className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-[#888] border border-[#2a2a2a] hover:text-[#f0f0f0] hover:border-[#444] transition-colors">
          <X size={11} /> Cancel
        </button>
        <button
          onClick={() => onSave({ amount: amount ? Number(amount) : null, confirmation: confirmation.trim(), name: name.trim() })}
          data-testid="booked-save"
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white text-black hover:bg-[#e8e8e8] transition-colors"
        >
          <Check size={11} /> Save booking
        </button>
      </div>
    </div>
  )
}
