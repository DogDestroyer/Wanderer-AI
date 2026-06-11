'use client'

import { useState, useEffect, useCallback, type ReactNode } from 'react'
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
import { MapPin, Calendar, DollarSign, Gauge, Star, Plane, Map } from 'lucide-react'
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

interface ItineraryViewProps {
  trip: TripPlan
}

export function ItineraryView({ trip }: ItineraryViewProps) {
  const { name, destination, startDate, endDate, budget, preferences } = trip

  const reorderActivities = useStore((s) => s.reorderActivities)
  const moveActivity = useStore((s) => s.moveActivity)

  // ── Tab state ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'itinerary' | 'budget' | 'map'>('itinerary')

  // ── Local day state for live drag preview ────────────────────────────────────
  // We maintain a copy of days so cross-day moves preview before committing.
  const [localDays, setLocalDays] = useState<Day[]>(trip.days)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  // Keep local days in sync with the store whenever we're NOT dragging
  useEffect(() => {
    if (!activeDragId) setLocalDays(trip.days)
  }, [trip.days, activeDragId])

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /** Find which day (in local state) contains the given activity ID. */
  const findDayId = useCallback(
    (activityId: string): string | undefined =>
      localDays.find((d) => d.activities.some((a) => a.id === activityId))?.id,
    [localDays]
  )

  /** Find the dragged activity object from local state. */
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

  // ── Sensors ──────────────────────────────────────────────────────────────────
  // Require 8px movement before drag starts — prevents accidental drags on click.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  // ── Drag handlers ─────────────────────────────────────────────────────────────

  function handleDragStart({ active }: DragStartEvent) {
    setActiveDragId(active.id as string)
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const activeDayId = findDayId(activeId)

    // `over` might be an activity ID or a day ID (droppable day zone)
    const overDayId =
      findDayId(overId) ??
      (localDays.find((d) => d.id === overId)?.id)

    if (!activeDayId || !overDayId || activeDayId === overDayId) return

    // ── Cross-day move ─────────────────────────────────────────────────────────
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
        if (day.id === activeDayId) {
          return { ...day, activities: day.activities.filter((a) => a.id !== activeId) }
        }
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

    if (!over) {
      // Drag cancelled — restore store state
      setLocalDays(trip.days)
      return
    }

    const overId = over.id as string

    // Where the item started (original store data)
    const originalDayId = trip.days.find((d) =>
      d.activities.some((a) => a.id === activeId)
    )?.id

    // Where it ended up (local state after drag-over)
    const destDayId = findDayId(activeId)

    if (!originalDayId || !destDayId) return

    if (originalDayId === destDayId) {
      // ── Within-day reorder ───────────────────────────────────────────────────
      const day = localDays.find((d) => d.id === destDayId)!
      const oldIndex = day.activities.findIndex((a) => a.id === activeId)
      const newIndex = day.activities.findIndex((a) => a.id === overId)

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reordered = arrayMove(day.activities, oldIndex, newIndex)
        reorderActivities(trip.id, destDayId, reordered)
      }
    } else {
      // ── Cross-day move ───────────────────────────────────────────────────────
      const destDay = localDays.find((d) => d.id === destDayId)!
      const toIndex = destDay.activities.findIndex((a) => a.id === activeId)
      moveActivity(
        trip.id,
        originalDayId,
        destDayId,
        activeId,
        toIndex >= 0 ? toIndex : destDay.activities.length
      )
    }
  }

  // ── Budget ───────────────────────────────────────────────────────────────────
  const spent = calculateTripBudget(trip.days)
  const capSet = budget.cap > 0
  const overBudget = capSet && spent > budget.cap
  const spentPct = capSet ? Math.min((spent / budget.cap) * 100, 100) : 0

  // Active drag overlay activity
  const overlayActivity = activeDragId ? findActivity(activeDragId) : null

  return (
    <div className="flex flex-col h-full">
      {/* ── Trip header ──────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 leading-tight truncate">{name}</h1>
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin size={12} className="text-indigo-500 shrink-0" />
              <span className="text-sm text-gray-500">{destination.name}</span>
            </div>
          </div>
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm shadow-indigo-200">
            <Plane size={18} className="text-white -rotate-45" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <MetaChip icon={<Calendar size={11} />} label={formatDateRange(startDate, endDate)} />
          <MetaChip icon={<Calendar size={11} />} label={formatNights(startDate, endDate)} />
          {preferences && (
            <>
              <MetaChip icon={<Gauge size={11} />} label={getPaceLabel(preferences.paceLevel)} />
              <MetaChip icon={<Star size={11} />} label={getBudgetLabel(preferences.budgetLevel)} />
            </>
          )}
        </div>

        {capSet && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-gray-500">Estimated spend</span>
              <span className={cn('text-[11px] font-semibold', overBudget ? 'text-red-600' : 'text-gray-700')}>
                {formatCurrency(spent, budget.currency)}
                <span className="text-gray-400 font-normal">
                  {' '}/ {formatCurrency(budget.cap, budget.currency)}
                </span>
              </span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-500', overBudget ? 'bg-red-500' : 'bg-indigo-500')}
                style={{ width: `${spentPct}%` }}
              />
            </div>
            {overBudget && (
              <p className="text-[11px] text-red-500 mt-1">
                {formatCurrency(spent - budget.cap, budget.currency)} over budget
              </p>
            )}
          </div>
        )}

        {preferences?.interests && preferences.interests.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {preferences.interests.map((interest) => (
              <span
                key={interest}
                className="text-[11px] px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full font-medium capitalize"
              >
                {interest}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-gray-100 bg-white px-6">
        <div className="flex gap-1">
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

      {/* ── Day list ──────────────────────────────────────────────────────────── */}
      {activeTab === 'itinerary' && (
      <div className="flex-1 overflow-y-auto">
        {localDays.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-gray-400 text-sm">No days planned yet.</p>
              <p className="text-gray-300 text-xs mt-1">Chat with the AI to add your itinerary.</p>
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
            <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto w-full pb-8">
              {localDays.map((day, index) => (
                <DayCard
                  key={day.id}
                  day={day}
                  index={index}
                  tripCurrency={budget.currency}
                  isDraggingAny={activeDragId !== null}
                />
              ))}
            </div>

            {/* Ghost card that follows the cursor while dragging */}
            <DragOverlay dropAnimation={null}>
              {overlayActivity && (
                <div className="shadow-2xl shadow-indigo-200/50 rounded-xl bg-white border border-indigo-200 opacity-95 rotate-1 scale-[1.02]">
                  <ActivityCard
                    activity={overlayActivity}
                    isFirst={false}
                    hasConflict={false}
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

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
        active
          ? 'border-indigo-600 text-indigo-600'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      )}
    >
      {children}
    </button>
  )
}

// ─── MetaChip ──────────────────────────────────────────────────────────────────

function MetaChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-lg text-[11px] text-gray-600 font-medium">
      <span className="text-gray-400">{icon}</span>
      {label}
    </span>
  )
}
