'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import type { Activity } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ActivityCard, TravelConnector } from './ActivityCard'

interface Props {
  activity: Activity
  isFirst: boolean
  hasConflict: boolean
  prevTravelMins: number
  isDraggingAny: boolean
}

export function SortableActivityCard({
  activity,
  isFirst,
  hasConflict,
  prevTravelMins,
  isDraggingAny,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: activity.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style}>
      {!isFirst && !isDraggingAny && (
        <TravelConnector minutes={prevTravelMins} />
      )}

      <div
        className={cn(
          'relative group/sortable transition-transform duration-150',
          isDragging ? 'opacity-20' : 'hover:-translate-y-px'
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
        />
      </div>
    </div>
  )
}
