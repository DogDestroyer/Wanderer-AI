'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import type { Activity } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { RatesMap } from '@/lib/currency'
import { useStore } from '@/lib/store'
import { showToast } from '@/components/ui/Toast'
import { reservationFromActivity } from '@/lib/reservations'
import { ActivityCard, TravelConnector } from './ActivityCard'

interface Props {
  activity: Activity
  isFirst: boolean
  hasConflict: boolean
  prevTravelMins: number
  isDraggingAny: boolean
  tripId: string
  dayId: string
  dayDate: string
  budgetCurrency?: string
  rates?: RatesMap
  showLocalPrices?: boolean
}

export function SortableActivityCard({
  activity,
  isFirst,
  hasConflict,
  prevTravelMins,
  isDraggingAny,
  tripId,
  dayId,
  dayDate,
  budgetCurrency,
  rates,
  showLocalPrices,
}: Props) {
  const toggleActivityLock = useStore((s) => s.toggleActivityLock)
  const saveActivityEdit = useStore((s) => s.saveActivityEdit)
  const deleteActivity = useStore((s) => s.deleteActivity)
  const addReservation = useStore((s) => s.addReservation)
  const reservations = useStore((s) => s.trips[tripId]?.reservations) ?? []
  const isReserved = reservations.some((r) => r.activityId === activity.id && r.status !== 'cancelled')

  function handleReserve() {
    addReservation(tripId, reservationFromActivity(activity, dayDate))
    showToast({ message: `“${activity.title}” marked as reserved`, type: 'success' })
  }

  function handleDelete() {
    deleteActivity(tripId, dayId, activity.id)
    // Destructive → the toast IS the undo discovery surface (6s).
    showToast({
      message: `Deleted ${activity.title}`,
      type: 'info',
      action: { label: 'Undo', onClick: () => useStore.getState().undo() },
    })
  }

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: activity.id })

  // When this card is the one being dragged, the DragOverlay handles visual
  // movement — don't apply the transform here or the ghost will jump.
  // For non-dragged sibling cards, keep the transform so they animate into
  // their new positions as the active card moves past them.
  const style = {
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
  }

  function handleSaveEdit(patch: Partial<Activity>) {
    saveActivityEdit(tripId, dayId, activity.id, patch)
    // Manual edits auto-lock the card so the AI never overwrites human changes.
    showToast({ message: 'Card locked to protect your edits', type: 'success' })
  }

  return (
    // Outer wrapper: ONLY the TravelConnector lives here, outside setNodeRef.
    // This matters for DragOverlay alignment: dnd-kit measures the setNodeRef
    // element's bounding rect to position the overlay.  Including the connector
    // in that rect shifts the overlay up by the connector height, causing the
    // card to jump visually on pickup.
    <div>
      {!isFirst && !isDraggingAny && (
        <TravelConnector minutes={prevTravelMins} />
      )}

      {/* setNodeRef is on the card div only — matches the DragOverlay content exactly */}
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          'relative group/sortable',
          isDragging && 'opacity-20',
        )}
      >
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          tabIndex={-1}
          aria-label="Drag to reorder"
          data-coach="drag"
          className={cn(
            'absolute left-0 inset-y-0 w-4 z-10',
            'flex items-center justify-center',
            'cursor-grab active:cursor-grabbing touch-none',
            // Visible on touch devices (no hover); hover-reveal on desktop.
            'opacity-100 md:opacity-0 md:group-hover/sortable:opacity-100 transition-opacity',
            'focus:outline-none',
          )}
        >
          <GripVertical size={11} className="text-[#444]" />
        </button>

        <ActivityCard
          activity={activity}
          isFirst={isFirst}
          hasConflict={hasConflict}
          budgetCurrency={budgetCurrency}
          rates={rates}
          showLocalPrices={showLocalPrices}
          onToggleLock={() => toggleActivityLock(tripId, dayId, activity.id)}
          onSaveEdit={handleSaveEdit}
          onDelete={handleDelete}
          isReserved={isReserved}
          onReserve={handleReserve}
        />
      </div>
    </div>
  )
}
