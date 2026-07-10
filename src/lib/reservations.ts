import type { Activity, Reservation, ReservationType, ActivityCategory } from './types'
import { generateId } from './utils'

const TYPE_FOR_CATEGORY: Record<ActivityCategory, ReservationType> = {
  accommodation: 'hotel',
  food:          'restaurant',
  transport:     'transport',
  attraction:    'activity',
  experience:    'activity',
  leisure:       'activity',
}

/** Build a reservation pre-filled from an itinerary activity ("Mark as reserved"). */
export function reservationFromActivity(activity: Activity, dayDate: string): Reservation {
  return {
    id: generateId(),
    type: TYPE_FOR_CATEGORY[activity.category] ?? 'activity',
    name: activity.title,
    date: dayDate,
    time: activity.startTime,
    // Reserved = actual spend, so the estimate flag is cleared.
    cost: activity.cost.amount > 0 ? { ...activity.cost, isEstimate: false } : undefined,
    status: 'booked',
    activityId: activity.id,
  }
}
