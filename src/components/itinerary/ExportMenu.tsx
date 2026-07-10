'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  useFloating, autoUpdate, offset, flip, shift,
  useClick, useDismiss, useRole, useInteractions, FloatingPortal,
} from '@floating-ui/react'
import { Download, FileText, FileDown, ClipboardCopy } from 'lucide-react'
import type { TripPlan } from '@/lib/types'
import type { RatesMap } from '@/lib/currency'
import { convertAmount, convertCost } from '@/lib/currency'
import { calculateDayBudgetConverted, calculateTripBudgetConverted } from '@/lib/recalculate'
import { deriveDayTitle } from '@/lib/dayTitle'
import { formatCurrency, formatTime, formatDateRange, formatNights, getBudgetLabel, getPaceLabel } from '@/lib/utils'
import { tripToMarkdown, tripToPlainText, downloadTextFile, slugify } from '@/lib/export'
import { showToast } from '@/components/ui/Toast'

export function ExportMenu({ trip, rates }: { trip: TripPlan; rates: RatesMap }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-end',
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })
  const click = useClick(context)
  const dismiss = useDismiss(context)
  const role = useRole(context, { role: 'menu' })
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role])

  function onMarkdown() {
    downloadTextFile(`${slugify(trip.name)}.md`, tripToMarkdown(trip, rates), 'text/markdown')
    setOpen(false)
    showToast({ message: 'Markdown downloaded', type: 'success' })
  }
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(tripToPlainText(trip, rates))
      showToast({ message: 'Itinerary copied to clipboard', type: 'success' })
    } catch {
      showToast({ message: 'Could not copy — try again', type: 'warning' })
    }
    setOpen(false)
  }
  function onPdf() {
    setOpen(false)
    // The print document is already in the DOM (portal); print it. The browser's
    // "Save as PDF" produces a clean black-on-white file from the print stylesheet.
    requestAnimationFrame(() => window.print())
  }

  const item = 'w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[#ccc] hover:bg-[#1a1a1a] hover:text-[#f0f0f0] transition-colors text-left'

  return (
    <>
      <button
        ref={refs.setReference}
        {...getReferenceProps()}
        title="Export trip"
        aria-label="Export trip"
        className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#1a1a1a] text-[#555] border border-[#2a2a2a] hover:text-[#f0f0f0] hover:border-[#444] transition-colors"
      >
        <Download size={14} />
      </button>

      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-[100] w-[190px] rounded-xl border border-[#2a2a2a] bg-[#111111] py-1 shadow-2xl shadow-black/60 overflow-hidden"
          >
            <button className={item} onClick={onPdf}><FileDown size={13} /> PDF (print)</button>
            <button className={item} onClick={onMarkdown}><FileText size={13} /> Markdown (.md)</button>
            <button className={item} onClick={onCopy}><ClipboardCopy size={13} /> Copy as text</button>
          </div>
        </FloatingPortal>
      )}

      {/* Print-only document rendered at the document root (hidden on screen). */}
      {mounted && createPortal(<PrintDoc trip={trip} rates={rates} />, document.body)}
    </>
  )
}

// ─── PrintDoc ─────────────────────────────────────────────────────────────────
// Black-on-white print layout. Hidden on screen via the .trip-print-portal rule
// in globals.css; shown (and everything else hidden) under @media print.

function PrintDoc({ trip, rates }: { trip: TripPlan; rates: RatesMap }) {
  const cur = trip.budget.currency
  const spent = calculateTripBudgetConverted(trip.days, cur, rates)
  const flight = trip.liveData?.flight
  const flightCost = flight ? convertAmount(flight.price, flight.currency, cur, rates) : 0
  const reserved = (trip.reservations ?? [])
    .filter((r) => r.status !== 'cancelled' && r.cost)
    .reduce((s, r) => s + convertCost(r.cost!, cur, rates), 0)
  const checklist = trip.checklist ?? []
  const reservations = trip.reservations ?? []

  return (
    <div className="trip-print-portal">
      <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', color: '#000', background: '#fff', padding: '32px 40px', maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>{trip.name}</h1>
        <p style={{ fontSize: 13, color: '#333', margin: '4px 0 2px' }}>
          {formatDateRange(trip.startDate, trip.endDate)} · {formatNights(trip.startDate, trip.endDate)}
        </p>
        <p style={{ fontSize: 12, color: '#555', margin: '0 0 6px' }}>
          {trip.preferences.partyType ?? 'Traveller'} · {getBudgetLabel(trip.preferences.budgetLevel)} · {getPaceLabel(trip.preferences.paceLevel)} pace
        </p>
        {flight && (
          <p style={{ fontSize: 12, color: '#333', margin: '0 0 4px' }}>
            ✈ {flight.originCode} → {flight.destinationCode}: {formatCurrency(flightCost, cur)}{flight.isIndicative ? ' (indicative)' : ''}
          </p>
        )}
        <hr style={{ border: 'none', borderTop: '1px solid #ccc', margin: '12px 0' }} />

        {trip.days.map((day, i) => {
          const title = deriveDayTitle(day)
          const dayTotal = calculateDayBudgetConverted(day.activities, cur, rates)
          return (
            <div key={day.id} style={{ breakInside: 'avoid', marginBottom: 18 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>
                Day {i + 1}{title ? ` · ${title}` : ''} <span style={{ fontWeight: 400, color: '#666', fontSize: 13 }}>— {day.date}</span>
              </h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <tbody>
                  {day.activities.map((a) => (
                    <tr key={a.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '3px 8px 3px 0', color: '#555', whiteSpace: 'nowrap', verticalAlign: 'top', width: 64 }}>{formatTime(a.startTime)}</td>
                      <td style={{ padding: '3px 0', verticalAlign: 'top' }}>
                        <span style={{ fontWeight: 600 }}>{a.title}</span>
                        {a.location?.name && <span style={{ color: '#777' }}> · {a.location.name}</span>}
                      </td>
                      <td style={{ padding: '3px 0 3px 8px', textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top', color: '#333' }}>
                        {a.cost.amount > 0 ? formatCurrency(convertAmount(a.cost.amount, a.cost.currency, cur, rates), cur) : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {dayTotal > 0 && <p style={{ fontSize: 11, color: '#666', textAlign: 'right', margin: '4px 0 0' }}>Day total: {formatCurrency(dayTotal, cur)}</p>}
            </div>
          )
        })}

        <hr style={{ border: 'none', borderTop: '1px solid #ccc', margin: '12px 0' }} />
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>Budget ({cur})</h2>
        <p style={{ fontSize: 12, margin: '0 0 2px' }}>Estimated: {formatCurrency(spent + flightCost, cur)}{trip.budget.cap > 0 ? ` / cap ${formatCurrency(trip.budget.cap, cur)}` : ''}</p>
        {reserved > 0 && <p style={{ fontSize: 12, margin: 0 }}>Reserved (actual): {formatCurrency(reserved, cur)}</p>}

        {reservations.length > 0 && (
          <div style={{ breakInside: 'avoid', marginTop: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>Reservations</h2>
            {reservations.map((r) => (
              <p key={r.id} style={{ fontSize: 12, margin: '0 0 2px' }}>
                • <strong>{r.name}</strong> ({r.type}){r.date ? ` — ${r.date}${r.time ? ` ${formatTime(r.time)}` : ''}` : ''}
                {r.confirmationNumber ? ` #${r.confirmationNumber}` : ''}{r.cost ? ` (${formatCurrency(convertAmount(r.cost.amount, r.cost.currency, cur, rates), cur)})` : ''} — {r.status}
              </p>
            ))}
          </div>
        )}

        {checklist.length > 0 && (
          <div style={{ breakInside: 'avoid', marginTop: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>Checklist</h2>
            {[...new Set(checklist.map((i) => i.section))].map((section) => (
              <div key={section} style={{ marginBottom: 6 }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#555', margin: '0 0 2px' }}>{section}</p>
                {checklist.filter((i) => i.section === section).map((item) => (
                  <p key={item.id} style={{ fontSize: 12, margin: 0 }}>{item.done ? '☑' : '☐'} {item.text}</p>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
