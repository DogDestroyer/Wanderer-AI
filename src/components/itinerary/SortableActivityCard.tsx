'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import type { Activity } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { RatesMap } from '@/lib/currency'
import { ActivityCard, TravelConnector } from './ActivityCard'

interface Props {
  activity: Activity
  isFirst: boolean
  hasConflict: boolean
  prevTravelMins: number
  isDraggingAny: boolean
  budgetCurrency?: string
  rates?: RatesMap
}

export function SortableActivityCard({
  activity,
  isFirst,
  hasConflict,
  prevTravelMins,
  isDraggingAny,
  budgetCurrency,
  rates,
}: Props) {
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
          className={cn(
            'absolute left-0 inset-y-0 w-4 z-10',
            'flex items-center justify-center',
            'cursor-grab active:cursor-grabbing touch-none',
            'opacity-0 group-hover/sortable:opacity-100 transition-opacity',
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
        />
      </div>
    </div>
  )
}
