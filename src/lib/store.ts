'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { TripPlan, Day, Activity, ChatMessage, AgentSuggestion, WeatherForecast, AgentSettings, TripPreferences } from './types'
import { DEFAULT_AGENT_SETTINGS, DEFAULT_PREFERENCES } from './types'
import { recalculateDay } from './recalculate'

// ─── State shape ──────────────────────────────────────────────────────────────

interface AppState {
  // Persistence flag — prevents rendering stale server HTML client-side
  _hasHydrated: boolean
  setHasHydrated: (v: boolean) => void

  // Core data
  trips: Record<string, TripPlan>
  activeTripId: string | null
  chatHistory: Record<string, ChatMessage[]>
  isGenerating: boolean
  sidebarOpen: boolean  // mobile sidebar toggle
  agentSettings: AgentSettings
  draftPreferences: TripPreferences  // pre-trip preference state (hero layout)

  // ── Trip CRUD ──
  createTrip: (trip: TripPlan) => void
  updateTrip: (tripId: string, patch: Partial<TripPlan>) => void
  deleteTrip: (tripId: string) => void
  setActiveTrip: (tripId: string | null) => void
  setSidebarOpen: (open: boolean) => void
  updateAgentSettings: (patch: Partial<AgentSettings>) => void
  updateDraftPreferences: (patch: Partial<TripPreferences>) => void

  // ── Day ──
  updateDay: (tripId: string, dayId: string, patch: Partial<Day>) => void

  // ── Activities ──
  reorderActivities: (tripId: string, dayId: string, activities: Activity[]) => void
  moveActivity: (
    tripId: string,
    fromDayId: string,
    toDayId: string,
    activityId: string,
    toIndex: number
  ) => void
  updateActivity: (
    tripId: string,
    dayId: string,
    activityId: string,
    patch: Partial<Activity>
  ) => void
  deleteActivity: (tripId: string, dayId: string, activityId: string) => void
  toggleActivityLock: (tripId: string, dayId: string, activityId: string) => void

  // ── Chat ──
  addChatMessage: (tripId: string, message: ChatMessage) => void
  updateLastAssistantMessage: (tripId: string, content: string, isStreaming?: boolean) => void
  setIsGenerating: (v: boolean) => void

  // ── Weather ──
  updateTripWeather: (tripId: string, weatherByDayId: Record<string, WeatherForecast>) => void

  // ── Suggestions ──
  dismissSuggestion: (tripId: string, suggestionId: string) => void
  addSuggestion: (tripId: string, suggestion: AgentSuggestion) => void
  clearDismissedSuggestions: (tripId: string) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const now = () => new Date().toISOString()

function patchTrip(
  trips: Record<string, TripPlan>,
  tripId: string,
  fn: (trip: TripPlan) => Partial<TripPlan>
): Record<string, TripPlan> {
  const trip = trips[tripId]
  if (!trip) return trips
  return { ...trips, [tripId]: { ...trip, ...fn(trip), updatedAt: now() } }
}

// SSR-safe localStorage — the function is never called on the server because we
// use skipHydration:true and only call rehydrate() inside a useEffect.
const safeStorage = {
  getItem: (key: string): string | null => {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(key)
  },
  setItem: (key: string, value: string): void => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(key, value)
  },
  removeItem: (key: string): void => {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(key)
  },
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      _hasHydrated: false,
      setHasHydrated: (v) => set({ _hasHydrated: v }),

      trips: {},
      activeTripId: null,
      chatHistory: {},
      isGenerating: false,
      sidebarOpen: false,
      agentSettings: DEFAULT_AGENT_SETTINGS,
      draftPreferences: DEFAULT_PREFERENCES,

      // ── Trip CRUD ──────────────────────────────────────────────────────────

      createTrip: (trip) =>
        set((s) => {
          // Migrate any messages from the pre-trip '__new__' temp key into the real trip key.
          // Merge draftPreferences to ensure all new preference fields are populated.
          const { '__new__': newMsgs, ...restHistory } = s.chatHistory
          const mergedTrip: TripPlan = {
            ...trip,
            preferences: {
              ...s.draftPreferences,          // provides tripStyle, partySize, etc.
              ...trip.preferences,            // AI-generated values override (paceLevel, budgetLevel, interests)
            },
          }
          return {
            trips: { ...s.trips, [trip.id]: mergedTrip },
            activeTripId: trip.id,
            chatHistory: {
              ...restHistory,
              [trip.id]: newMsgs ?? [],
            },
          }
        }),

      updateTrip: (tripId, patch) =>
        set((s) => ({ trips: patchTrip(s.trips, tripId, () => patch) })),

      deleteTrip: (tripId) =>
        set((s) => {
          const { [tripId]: _t, ...trips } = s.trips
          const { [tripId]: _c, ...chatHistory } = s.chatHistory
          const activeTripId =
            s.activeTripId === tripId
              ? (Object.keys(trips)[0] ?? null)
              : s.activeTripId
          return { trips, chatHistory, activeTripId }
        }),

      setActiveTrip: (tripId) => set({ activeTripId: tripId }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      updateAgentSettings: (patch) =>
        set((s) => ({ agentSettings: { ...s.agentSettings, ...patch } })),
      updateDraftPreferences: (patch) =>
        set((s) => ({ draftPreferences: { ...s.draftPreferences, ...patch } })),

      // ── Day ───────────────────────────────────────────────────────────────

      updateDay: (tripId, dayId, patch) =>
        set((s) => ({
          trips: patchTrip(s.trips, tripId, (trip) => ({
            days: trip.days.map((d) => (d.id === dayId ? { ...d, ...patch } : d)),
          })),
        })),

      // ── Activities ────────────────────────────────────────────────────────

      reorderActivities: (tripId, dayId, activities) => {
        const recalculated = recalculateDay(activities)
        set((s) => ({
          trips: patchTrip(s.trips, tripId, (trip) => ({
            days: trip.days.map((d) =>
              d.id === dayId ? { ...d, activities: recalculated } : d
            ),
          })),
        }))
      },

      moveActivity: (tripId, fromDayId, toDayId, activityId, toIndex) => {
        const { trips } = get()
        const trip = trips[tripId]
        if (!trip) return

        const fromDay = trip.days.find((d) => d.id === fromDayId)!
        const toDay = trip.days.find((d) => d.id === toDayId)!
        const activity = fromDay.activities.find((a) => a.id === activityId)!

        const newFrom = recalculateDay(fromDay.activities.filter((a) => a.id !== activityId))
        const newTo = recalculateDay([
          ...toDay.activities.slice(0, toIndex),
          activity,
          ...toDay.activities.slice(toIndex),
        ])

        set((s) => ({
          trips: patchTrip(s.trips, tripId, (t) => ({
            days: t.days.map((d) => {
              if (d.id === fromDayId) return { ...d, activities: newFrom }
              if (d.id === toDayId) return { ...d, activities: newTo }
              return d
            }),
          })),
        }))
      },

      updateActivity: (tripId, dayId, activityId, patch) =>
        set((s) => ({
          trips: patchTrip(s.trips, tripId, (trip) => ({
            days: trip.days.map((d) => {
              if (d.id !== dayId) return d
              const activities = recalculateDay(
                d.activities.map((a) => (a.id === activityId ? { ...a, ...patch } : a))
              )
              return { ...d, activities }
            }),
          })),
        })),

      deleteActivity: (tripId, dayId, activityId) =>
        set((s) => ({
          trips: patchTrip(s.trips, tripId, (trip) => ({
            days: trip.days.map((d) => {
              if (d.id !== dayId) return d
              return {
                ...d,
                activities: recalculateDay(d.activities.filter((a) => a.id !== activityId)),
              }
            }),
          })),
        })),

      toggleActivityLock: (tripId, dayId, activityId) =>
        set((s) => ({
          trips: patchTrip(s.trips, tripId, (trip) => ({
            days: trip.days.map((d) => {
              if (d.id !== dayId) return d
              return {
                ...d,
                activities: d.activities.map((a) =>
                  a.id === activityId ? { ...a, locked: !a.locked } : a
                ),
              }
            }),
          })),
        })),

      // ── Chat ──────────────────────────────────────────────────────────────

      addChatMessage: (tripId, message) =>
        set((s) => ({
          chatHistory: {
            ...s.chatHistory,
            [tripId]: [...(s.chatHistory[tripId] ?? []), message],
          },
        })),

      updateLastAssistantMessage: (tripId, content, isStreaming) =>
        set((s) => {
          const messages = s.chatHistory[tripId] ?? []
          const last = messages.length - 1
          if (last < 0 || messages[last].role !== 'assistant') return s
          const updated = { ...messages[last], content }
          if (isStreaming !== undefined) updated.isStreaming = isStreaming
          return {
            chatHistory: {
              ...s.chatHistory,
              [tripId]: messages.map((m, i) => (i === last ? updated : m)),
            },
          }
        }),

      setIsGenerating: (v) => set({ isGenerating: v }),

      // ── Weather ───────────────────────────────────────────────────────────
      // Weather is transient data — we update days directly without bumping updatedAt.

      updateTripWeather: (tripId, weatherByDayId) =>
        set((s) => {
          const trip = s.trips[tripId]
          if (!trip) return s
          return {
            trips: {
              ...s.trips,
              [tripId]: {
                ...trip,
                days: trip.days.map((day) =>
                  weatherByDayId[day.id]
                    ? { ...day, weather: weatherByDayId[day.id] }
                    : day
                ),
              },
            },
          }
        }),

      // ── Suggestions ───────────────────────────────────────────────────────

      dismissSuggestion: (tripId, suggestionId) =>
        set((s) => ({
          trips: patchTrip(s.trips, tripId, (trip) => ({
            suggestions: trip.suggestions.map((sg) =>
              sg.id === suggestionId ? { ...sg, dismissed: true } : sg
            ),
          })),
        })),

      addSuggestion: (tripId, suggestion) =>
        set((s) => ({
          trips: patchTrip(s.trips, tripId, (trip) => ({
            suggestions: [...(trip.suggestions ?? []), suggestion],
          })),
        })),

      clearDismissedSuggestions: (tripId) =>
        set((s) => ({
          trips: patchTrip(s.trips, tripId, (trip) => ({
            suggestions: trip.suggestions.filter((sg) => !sg.dismissed),
          })),
        })),
    }),
    {
      name: 'wandr-v1',
      storage: createJSONStorage(() => safeStorage),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
      // Only persist trips, chatHistory, activeTripId, settings — not transient UI state
      partialize: (s) => ({
        trips: s.trips,
        activeTripId: s.activeTripId,
        chatHistory: s.chatHistory,
        agentSettings: s.agentSettings,
        draftPreferences: s.draftPreferences,
      }),
    }
  )
)
