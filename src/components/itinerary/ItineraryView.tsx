'use client'

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { MapPin, Calendar, DollarSign, Gauge, Star, SlidersHorizontal } from 'lucide-react'
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
import { calculateTripBudget } from '@/lib/recalculate'
import { DayCard } from './DayCard'
import { ActivityCard } from './ActivityCard'
import { BudgetPanel } from './BudgetPanel'
import { MapPanel } from '@/components/map/MapPanel'
import { PreferenceSliders } from '@/components/preferences/PreferenceSliders'
import { showToast } from '@/components/ui/Toast'

interface ItineraryViewProps {
  trip: TripPlan
}

export function ItineraryView({ trip }: ItineraryViewProps) {
  const { name, destination, startDate, endDate, budget, preferences } = trip

  const reorderActivities = useStore((s) => s.reorderActivities)
  const moveActivity = useStore((s) => s.moveActivity)
  const updateTrip = useStore((s) => s.updateTrip)
  const isGenerating = useStore((s) => s.isGenerating)

  const [activeTab, setActiveTab] = useState<'itinerary' | 'budget' | 'map'>('itinerary')
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
    document.dispatchEvent(new CustomEvent('wandr:send-message', { detail: { message: msg } }))
    showToast({ message: 'Re-planning with new preferences…', type: 'info' })
  }

  const spent = calculateTripBudget(trip.days)
  const capSet = budget.cap > 0
  const overBudget = capSet && spent > budget.cap
  const spentPct = capSet ? Math.min((spent / budget.cap) * 100, 100) : 0
  const overlayActivity = activeDragId ? findActivity(activeDragId) : null

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">

      {/* ── Trip header ──────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-[#1f1f1f] px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-[#f0f0f0] leading-tight truncate">{name}</h1>
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin size={11} className="text-[#555] shrink-0" />
              <span className="text-[12px] text-[#666]">{destination.name}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {preferences && (
              <button
                onClick={() => setShowSliders((v) => !v)}
                title="Adjust pace & budget"
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

        {/* Budget bar */}
        {capSet && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-[#444]">Estimated spend</span>
              <span className={cn('text-[11px] font-semibold tabular-nums', overBudget ? 'text-[#ef4444]' : 'text-[#888]')}>
                {formatCurrency(spent, budget.currency)}
                <span className="text-[#333] font-normal">
                  {' '}/ {formatCurrency(budget.cap, budget.currency)}
                </span>
              </span>
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
        <div className="flex gap-0">
          <TabButton active={activeTab === 'itinerary'} onClick={() => setActiveTab('itinerary')}>
            Itinerary
          </TabButton>
          <TabButton active={activeTab === 'budget'} onClick={() => setActiveTab('budget')}>
            Budget
          </TabButton>
          <TabButton active={activeTab === 'map'} onClick={() => setActiveTab('map')}>
            Map
          </TabButton>
        </div>
      </div>

      {/* ── Budget panel ─────────────────────────────────────────────────────── */}
      {activeTab === 'budget' && <BudgetPanel trip={trip} />}

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
                      tripCurrency={budget.currency}
                      isDraggingAny={activeDragId !== null}
                    />
                  </motion.div>
                ))}
              </motion.div>

              {/* Drag overlay ghost */}
              <DragOverlay dropAnimation={null}>
                {overlayActivity && (
                  <div className="shadow-2xl shadow-black/60 rounded-xl bg-[#1a1a1a] border border-[#333] opacity-90 rotate-1 scale-[1.02]">
                    <ActivityCard activity={overlayActivity} isFirst={false} hasConflict={false} />
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

// ─── MetaChip ────────────────────────────────────────────────────────────────

function MetaChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1 px-2 py-1 bg-[#111111] border border-[#1f1f1f] rounded-lg text-[11px] text-[#666] font-medium">
      <span className="text-[#444]">{icon}</span>
      {label}
    </span>
  )
}
