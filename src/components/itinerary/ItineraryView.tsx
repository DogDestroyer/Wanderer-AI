'use client'

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  MeasuringStrategy,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { MapPin, Calendar, Gauge, Star, SlidersHorizontal, AlertTriangle, ChevronDown } from 'lucide-react'
import type { TripPlan, Day, Activity } from '@/lib/types'
import { useStore } from '@/lib/store'
import {
  cn,
  formatDateRange,
  formatNights,
  formatCurrency,
  getPaceLabel,
  getBudgetLabel,
} from '@/lib/utils'
import { calculateTripBudgetConverted } from '@/lib/recalculate'
import { COMMON_CURRENCIES, convertAmount } from '@/lib/currency'
import { useExchangeRates } from '@/hooks/useExchangeRates'
import { useLivePrices } from '@/hooks/useLivePrices'
import { DayCard } from './DayCard'
import { ActivityCard } from './ActivityCard'
import { BuildStatusLine, Typewriter, CountUp } from './BuildStatus'
import type { BuildState } from '@/lib/store'
import { BudgetPanel } from './BudgetPanel'
import { LiveTravelPanel } from './LiveTravelPanel'
import { ChecklistPanel } from './ChecklistPanel'
import { ReservationsPanel } from './ReservationsPanel'
import { ExportMenu } from './ExportMenu'
import { MapPanel } from '@/components/map/MapPanel'
import { PreferenceSliders } from '@/components/preferences/PreferenceSliders'
import { AssumptionChips } from './AssumptionChips'
import { showToast } from '@/components/ui/Toast'

interface ItineraryViewProps {
  trip: TripPlan
  /** Non-null while the trip is being constructed live (see AppShell). */
  building?: BuildState | null
}

// ─── Drag modifier: restrict to vertical axis only ───────────────────────────
const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 })

export function ItineraryView({ trip, building }: ItineraryViewProps) {
  const { name, destination, startDate, endDate, budget, preferences } = trip

  const reorderActivities = useStore((s) => s.reorderActivities)
  const moveActivity = useStore((s) => s.moveActivity)
  const updateTrip = useStore((s) => s.updateTrip)
  const setTripDisplayCurrency = useStore((s) => s.setTripDisplayCurrency)
  const isGenerating = useStore((s) => s.isGenerating)

  // Currency conversion — fetches live rates on mount, falls back to hardcoded table
  const rates = useExchangeRates()

  // Live flight + hotel prices (cached on the trip; refetched only on param change)
  const { loading: liveLoading, refresh: refreshLive } = useLivePrices(trip)

  const [activeTab, setActiveTab] = useState<'itinerary' | 'budget' | 'checklist' | 'reservations' | 'map'>('itinerary')
  const [showSliders, setShowSliders] = useState(false)
  const [localDays, setLocalDays] = useState<Day[]>(trip.days)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  useEffect(() => {
    if (!activeDragId) setLocalDays(trip.days)
  }, [trip.days, activeDragId])

  const findDayId = useCallback(
    (activityId: string): string | undefined =>
      localDays.find((d) => d.activities.some((a) => a.id === activityId))?.id,
    [localDays]
  )

  const findActivity = useCallback(
    (activityId: string): Activity | undefined => {
      for (const day of localDays) {
        const act = day.activities.find((a) => a.id === activityId)
        if (act) return act
      }
      return undefined
    },
    [localDays]
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  function handleDragStart({ active }: DragStartEvent) {
    setActiveDragId(active.id as string)
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return
    const activeId = active.id as string
    const overId = over.id as string
    const activeDayId = findDayId(activeId)
    const overDayId =
      findDayId(overId) ??
      (localDays.find((d) => d.id === overId)?.id)
    if (!activeDayId || !overDayId || activeDayId === overDayId) return

    setLocalDays((prev) => {
      const sourceDay = prev.find((d) => d.id === activeDayId)
      const destDay = prev.find((d) => d.id === overDayId)
      if (!sourceDay || !destDay) return prev
      const activity = sourceDay.activities.find((a) => a.id === activeId)
      if (!activity) return prev
      const overIsActivity = destDay.activities.some((a) => a.id === overId)
      const insertIndex = overIsActivity
        ? destDay.activities.findIndex((a) => a.id === overId)
        : destDay.activities.length
      return prev.map((day) => {
        if (day.id === activeDayId)
          return { ...day, activities: day.activities.filter((a) => a.id !== activeId) }
        if (day.id === overDayId) {
          const updated = [...day.activities]
          updated.splice(insertIndex, 0, activity)
          return { ...day, activities: updated }
        }
        return day
      })
    })
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const activeId = active.id as string
    setActiveDragId(null)
    if (!over) { setLocalDays(trip.days); return }
    const overId = over.id as string
    const originalDayId = trip.days.find((d) =>
      d.activities.some((a) => a.id === activeId)
    )?.id
    const destDayId = findDayId(activeId)
    if (!originalDayId || !destDayId) return

    if (originalDayId === destDayId) {
      const day = localDays.find((d) => d.id === destDayId)!
      const oldIndex = day.activities.findIndex((a) => a.id === activeId)
      const newIndex = day.activities.findIndex((a) => a.id === overId)
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        reorderActivities(trip.id, destDayId, arrayMove(day.activities, oldIndex, newIndex))
      }
    } else {
      const destDay = localDays.find((d) => d.id === destDayId)!
      const toIndex = destDay.activities.findIndex((a) => a.id === activeId)
      moveActivity(trip.id, originalDayId, destDayId, activeId, toIndex >= 0 ? toIndex : destDay.activities.length)
    }
  }

  function handleApplyPreferences(pace: number, budgetLevel: number) {
    updateTrip(trip.id, { preferences: { ...trip.preferences, paceLevel: pace, budgetLevel } })
    const msg =
      `Please re-plan my trip using replace_day_activities with ${getPaceLabel(pace)} pace and ` +
      `${getBudgetLabel(budgetLevel)} budget style. ` +
      `Keep any locked activities exactly as they are and adjust the rest to match the new preferences.`
    // 'quick' tier — a localized preference re-plan (replace_day_activities).
    document.dispatchEvent(new CustomEvent('wandr:send-message', { detail: { message: msg, intent: 'quick' } }))
    showToast({ message: 'Re-planning with new preferences…', type: 'info' })
  }

  const activitiesSpent = calculateTripBudgetConverted(trip.days, budget.currency, rates)
  // Flight (live or estimate) is a transport line item in the budget.
  const flightOffer = trip.liveData?.flight ?? null
  const flightCost = flightOffer ? convertAmount(flightOffer.price, flightOffer.currency, budget.currency, rates) : 0
  const spent = activitiesSpent + flightCost
  const capSet = budget.cap > 0
  const overBudget = capSet && spent > budget.cap
  const spentPct = capSet ? Math.min((spent / budget.cap) * 100, 100) : 0
  const overlayActivity = activeDragId ? findActivity(activeDragId) : null

  // Show original local prices as a muted secondary value on cards (default on).
  const showLocalPrices = preferences?.showLocalPrices !== false

  // Tab badges: checklist progress + active reservation count.
  const checklist = trip.checklist ?? []
  const checklistDone = checklist.filter((i) => i.done).length
  const checklistTotal = checklist.length
  const reservationCount = (trip.reservations ?? []).filter((r) => r.status !== 'cancelled').length

  // Chunked generation: days with no activities yet. While generating they fill
  // in progressively; if generation was interrupted, offer a Resume.
  const emptyDayCount = trip.days.filter((d) => !d.activities || d.activities.length === 0).length
  const showResume = emptyDayCount > 0 && !isGenerating

  // Detect probable currency error: converted total > 5× the stated cap
  const hasCurrencyError = capSet && spent > 5 * budget.cap

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">

      {/* ── Trip header ──────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-[#1f1f1f] px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-[#f0f0f0] leading-tight truncate">{building ? <Typewriter text={name} /> : name}</h1>
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin size={11} className="text-[#555] shrink-0" />
              <span className="text-[12px] text-[#666]">{destination.name}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ExportMenu trip={trip} rates={rates} />
            {preferences && (
              <button
                onClick={() => setShowSliders((v) => !v)}
                title="Adjust pace & budget"
                aria-label="Adjust pace and budget"
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                  showSliders
                    ? 'bg-white text-black'
                    : 'bg-[#1a1a1a] text-[#555] border border-[#2a2a2a] hover:text-[#f0f0f0] hover:border-[#444]'
                )}
              >
                <SlidersHorizontal size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Meta chips */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <MetaChip icon={<Calendar size={10} />} label={formatDateRange(startDate, endDate)} />
          <MetaChip icon={<Calendar size={10} />} label={formatNights(startDate, endDate)} />
          {preferences && (
            <>
              <MetaChip icon={<Gauge size={10} />} label={getPaceLabel(preferences.paceLevel)} />
              <MetaChip icon={<Star size={10} />} label={getBudgetLabel(preferences.budgetLevel)} />
            </>
          )}
        </div>

        {/* Budget bar (with currency selector) */}
        {capSet && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <span className="text-[10px] text-[#444]">Estimated spend</span>
              <div className="flex items-center gap-2">
                <span className={cn('text-[11px] font-semibold tabular-nums', overBudget ? 'text-[#ef4444]' : 'text-[#888]')}>
                  {building ? <CountUp value={spent} format={(n) => formatCurrency(n, budget.currency)} /> : formatCurrency(spent, budget.currency)}
                  <span className="text-[#333] font-normal">
                    {' '}/ {formatCurrency(budget.cap, budget.currency)}
                  </span>
                </span>
                <CurrencySelector value={budget.currency} onChange={(c) => setTripDisplayCurrency(trip.id, c)} />
              </div>
            </div>
            <div className="h-px bg-[#1f1f1f] rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-500', overBudget ? 'bg-[#ef4444]' : 'bg-white')}
                style={{ width: `${spentPct}%` }}
              />
            </div>
            {overBudget && (
              <p className="text-[10px] text-[#ef4444] mt-1">
                {formatCurrency(spent - budget.cap, budget.currency)} over budget
              </p>
            )}
          </div>
        )}

        {/* Spend + currency selector when there is no explicit cap */}
        {!capSet && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[10px] text-[#444]">
              Estimated spend{' '}
              <span className="text-[#888] font-semibold tabular-nums">
                {building ? <CountUp value={spent} format={(n) => formatCurrency(n, budget.currency)} /> : formatCurrency(spent, budget.currency)}
              </span>
            </span>
            <CurrencySelector value={budget.currency} onChange={(c) => setTripDisplayCurrency(trip.id, c)} />
          </div>
        )}

        {/* Currency error warning — shown when converted total is >5× the cap,
            which almost always means the agent mixed up currency codes */}
        {hasCurrencyError && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2 bg-[#1a0e00] border border-[#5a3a00] rounded-lg">
            <AlertTriangle size={13} className="text-[#f59e0b] shrink-0 mt-0.5" />
            <p className="text-[11px] text-[#f59e0b] leading-snug">
              Currency mismatch detected — costs may use wrong currency codes.
              {' '}
              <button
                onClick={() => {
                  document.dispatchEvent(new CustomEvent('wandr:send-message', {
                    detail: {
                      message: `The budget tracker shows ${formatCurrency(spent, budget.currency)} against a ${formatCurrency(budget.cap, budget.currency)} cap, which is more than 5× over — this usually means activity costs have the wrong ISO currency code. Please check every activity's cost.currency field (e.g. use JPY for yen, not USD), then resend the corrected plan.`,
                      intent: 'quick',
                    },
                  }))
                }}
                className="underline hover:text-[#fbbf24] transition-colors"
              >
                Ask agent to fix →
              </button>
            </p>
          </div>
        )}

        {/* Resume banner — a chunked generation was interrupted with empty days */}
        {showResume && (
          <div className="mt-3 flex items-center justify-between gap-2 px-3 py-2 bg-[#0d1320] border border-[#24405f] rounded-lg">
            <p className="text-[11px] text-[#7fb0e0] leading-snug">
              {emptyDayCount} {emptyDayCount === 1 ? 'day still needs' : 'days still need'} activities — generation was interrupted.
            </p>
            <button
              onClick={() => document.dispatchEvent(new CustomEvent('wandr:resume-fill'))}
              className="shrink-0 text-[11px] font-semibold text-black bg-white px-2.5 py-1 rounded-md hover:bg-[#e8e8e8] transition-colors"
            >
              Resume
            </button>
          </div>
        )}

        {/* Interest tags */}
        {preferences?.interests && preferences.interests.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {preferences.interests.map((interest) => (
              <span key={interest} className="text-[10px] px-2 py-0.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#666] rounded-full capitalize">
                {interest}
              </span>
            ))}
          </div>
        )}

        {/* CHANGE 3: Assumption chips — AI's key parameters, inferred ones dotted */}
        {trip.assumptions && trip.assumptions.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[#111111]">
            <AssumptionChips trip={trip} />
          </div>
        )}
      </div>

      {/* ── Preference sliders ─────────────────────────────────────────────── */}
      {preferences && (
        <div
          className={cn(
            'flex-shrink-0 overflow-hidden transition-all duration-300 border-b border-[#1f1f1f]',
            showSliders ? 'max-h-52' : 'max-h-0 border-b-0'
          )}
        >
          <div className="px-6 py-4">
            <PreferenceSliders
              tripId={trip.id}
              onApply={handleApplyPreferences}
            />
          </div>
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-[#1f1f1f] px-6">
        <div className="flex gap-0 overflow-x-auto scrollbar-none">
          <TabButton active={activeTab === 'itinerary'} onClick={() => setActiveTab('itinerary')}>
            Itinerary
          </TabButton>
          <TabButton active={activeTab === 'budget'} onClick={() => setActiveTab('budget')}>
            Budget
          </TabButton>
          <TabButton active={activeTab === 'checklist'} onClick={() => setActiveTab('checklist')}>
            Checklist{checklistTotal > 0 && <span className="ml-1 text-[10px] text-[#555] tabular-nums">{checklistDone}/{checklistTotal}</span>}
          </TabButton>
          <TabButton active={activeTab === 'reservations'} onClick={() => setActiveTab('reservations')}>
            Reservations{reservationCount > 0 && <span className="ml-1 text-[10px] text-[#555] tabular-nums">{reservationCount}</span>}
          </TabButton>
          <TabButton active={activeTab === 'map'} onClick={() => setActiveTab('map')}>
            Map
          </TabButton>
        </div>
      </div>

      {/* ── Budget panel ─────────────────────────────────────────────────────── */}
      {activeTab === 'budget' && <BudgetPanel trip={trip} rates={rates} />}

      {/* ── Checklist / Reservations panels ──────────────────────────────────── */}
      {activeTab === 'checklist' && <ChecklistPanel trip={trip} />}
      {activeTab === 'reservations' && <ReservationsPanel trip={trip} />}

      {/* ── Map panel ────────────────────────────────────────────────────────── */}
      {activeTab === 'map' && (
        <div className="flex-1 min-h-0">
          <MapPanel trip={trip} />
        </div>
      )}

      {/* ── Day list ─────────────────────────────────────────────────────────── */}
      {activeTab === 'itinerary' && (
        <div className="flex-1 overflow-y-auto animate-in">
          {localDays.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-2xl mb-2">✈️</p>
                <p className="text-[#555] text-sm font-medium">No itinerary yet</p>
                <p className="text-[#333] text-xs mt-1">Chat with the AI to start planning.</p>
              </div>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              modifiers={[restrictToVerticalAxis]}
              measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <motion.div
                key={trip.id}
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: 0.06 } } }}
                className="p-4 md:p-6 space-y-3 max-w-2xl mx-auto w-full pb-10"
              >
                {/* Live construction status (real pipeline state) */}
                {building && <div className="mb-1"><BuildStatusLine build={building} /></div>}

                {/* Live flights & hotels (cached on the trip) */}
                <LiveTravelPanel trip={trip} rates={rates} loading={liveLoading} onRefresh={refreshLive} />

                {localDays.map((day, index) => (
                  <motion.div
                    key={day.id}
                    variants={{
                      hidden: { opacity: 0, y: 16 },
                      show: { opacity: 1, y: 0, transition: { duration: 0.36, ease: [0.16, 1, 0.3, 1] } },
                    }}
                  >
                    <DayCard
                      day={day}
                      index={index}
                      tripId={trip.id}
                      tripCurrency={budget.currency}
                      isDraggingAny={activeDragId !== null}
                      rates={rates}
                      showLocalPrices={showLocalPrices}
                      planning={isGenerating && !building}
                      incomplete={showResume}
                      building={!!building}
                      failed={building?.failedDayIds.includes(day.id) ?? false}
                    />
                  </motion.div>
                ))}
              </motion.div>

              {/* Drag overlay — renders the floating card under the cursor.
                  dropAnimation gives a smooth snap-back when dropped. */}
              <DragOverlay
                dropAnimation={{
                  duration: 200,
                  easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
                }}
              >
                {overlayActivity && (
                  <div className="shadow-2xl shadow-black/60 rounded-xl overflow-hidden opacity-95 scale-[1.02] origin-top-left">
                    <ActivityCard
                      activity={overlayActivity}
                      isFirst={false}
                      hasConflict={false}
                      budgetCurrency={budget.currency}
                      rates={rates}
                      showLocalPrices={showLocalPrices}
                    />
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      )}
    </div>
  )
}

// ─── TabButton ────────────────────────────────────────────────────────────────

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-2.5 text-[12px] font-medium border-b-2 transition-colors',
        active
          ? 'border-white text-[#f0f0f0]'
          : 'border-transparent text-[#555] hover:text-[#888] hover:border-[#333]'
      )}
    >
      {children}
    </button>
  )
}

// ─── CurrencySelector ─────────────────────────────────────────────────────────
// Compact dropdown that sets the trip's display currency (budget.currency).

function CurrencySelector({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const options = [...new Set([value, ...COMMON_CURRENCIES])]
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title="Display currency"
        aria-label="Display currency"
        className="appearance-none bg-[#1a1a1a] border border-[#2a2a2a] text-[#aaa] text-[11px] font-medium rounded-md pl-2 pr-6 py-1 hover:border-[#444] focus:outline-none focus:border-[#555] cursor-pointer transition-colors tabular-nums"
      >
        {options.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <ChevronDown size={11} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[#555]" />
    </div>
  )
}

// ─── MetaChip ────────────────────────────────────────────────────────────────

function MetaChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1 px-2 py-1 bg-[#111111] border border-[#1f1f1f] rounded-lg text-[11px] text-[#666] font-medium">
      <span className="text-[#444]">{icon}</span>
      {label}
    </span>
  )
}
