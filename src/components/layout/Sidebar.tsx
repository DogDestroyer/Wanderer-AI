'use client'

import { Plus, MapPin, Calendar, Trash2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import { cn, formatDateRange, formatNights } from '@/lib/utils'
import { TripPlan } from '@/lib/types'

function TripCard({ trip, isActive, onSelect, onDelete }: {
  trip: TripPlan
  isActive: boolean
  onSelect: () => void
  onDelete: (e: React.MouseEvent) => void
}) {
  const activeSuggestions = trip.suggestions?.filter((s) => !s.dismissed).length ?? 0

  return (
    // div + role="button" avoids the nested-<button> HTML spec violation
    // (the delete button inside must remain a real <button> for accessibility)
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      className={cn(
        'group w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 cursor-pointer',
        isActive
          ? 'bg-indigo-600 text-white'
          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn('text-sm font-medium truncate', isActive ? 'text-white' : 'text-slate-200')}>
            {trip.name}
          </p>
          <div className={cn('flex items-center gap-1 mt-0.5', isActive ? 'text-indigo-200' : 'text-slate-500')}>
            <MapPin size={11} />
            <span className="text-xs truncate">{trip.destination.name}</span>
          </div>
          <div className={cn('flex items-center gap-1 mt-0.5', isActive ? 'text-indigo-200' : 'text-slate-500')}>
            <Calendar size={11} />
            <span className="text-xs">{formatNights(trip.startDate, trip.endDate)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {activeSuggestions > 0 && (
            <span className={cn(
              'text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center text-[10px]',
              isActive ? 'bg-white text-indigo-600' : 'bg-amber-500 text-white'
            )}>
              {activeSuggestions}
            </span>
          )}
          <button
            onClick={onDelete}
            className={cn(
              'opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded',
              isActive ? 'hover:bg-indigo-500 text-indigo-200' : 'hover:bg-slate-700 text-slate-500'
            )}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}

export function Sidebar() {
  const { trips, activeTripId, sidebarOpen, setActiveTrip, deleteTrip, setSidebarOpen } = useStore()
  const tripList = Object.values(trips).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  function handleDelete(tripId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (confirm('Delete this trip? This cannot be undone.')) {
      deleteTrip(tripId)
    }
  }

  function handleSelect(tripId: string) {
    setActiveTrip(tripId)
    setSidebarOpen(false) // close on mobile after selection
  }

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          'fixed top-14 left-0 z-30 h-[calc(100vh-3.5rem)] w-60 bg-slate-900 flex flex-col',
          'transition-transform duration-200 ease-in-out',
          'md:translate-x-0 md:static md:z-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* New Trip button */}
        <div className="p-3 border-b border-slate-800">
          <button
            onClick={() => {
              setSidebarOpen(false)
              document.dispatchEvent(new CustomEvent('wandr:focus-chat'))
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            <Plus size={15} />
            New Trip
          </button>
        </div>

        {/* Trip list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {tripList.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-slate-500 leading-relaxed">
                No trips yet. Start a conversation to plan your first adventure.
              </p>
            </div>
          ) : (
            tripList.map((trip) => (
              <TripCard
                key={trip.id}
                trip={trip}
                isActive={trip.id === activeTripId}
                onSelect={() => handleSelect(trip.id)}
                onDelete={(e) => handleDelete(trip.id, e)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800">
          <p className="text-[10px] text-slate-600 text-center">
            Trips saved locally · Never lost
          </p>
        </div>
      </aside>
    </>
  )
}
