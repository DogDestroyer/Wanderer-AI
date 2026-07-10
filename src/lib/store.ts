'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { TripPlan, Day, Activity, ChatMessage, AgentSuggestion, WeatherForecast, AgentSettings, TripPreferences, TripLiveData, ChecklistItem, ChecklistSection, Reservation } from './types'
import { convertAmount, FALLBACK_RATES, type RatesMap } from './currency'
import { DEFAULT_AGENT_SETTINGS, DEFAULT_PREFERENCES } from './types'
import { recalculateDay } from './recalculate'
import { EMPTY_WIZARD_DRAFT, WIZARD_TOTAL, type WizardDraft, type WizardStepId } from './wizard'

// ─── New-trip wizard state ────────────────────────────────────────────────────
// The full-screen planning wizard that replaces the old hero entry. `active`
// gates the takeover; `draft` + `step` persist so a refresh resumes in place.
// `returnTripId` remembers which trip to fall back to if the user cancels.
export interface WizardState {
  active: boolean
  step: number            // 1..WIZARD_TOTAL
  draft: WizardDraft
  returnTripId: string | null
}

const INITIAL_WIZARD: WizardState = { active: false, step: 1, draft: EMPTY_WIZARD_DRAFT, returnTripId: null }

// ─── State shape ──────────────────────────────────────────────────────────────

interface AppState {
  // Persistence flag — prevents rendering stale server HTML client-side
  _hasHydrated: boolean
  setHasHydrated: (v: boolean) => void
  // Called once after rehydration — clears any orphaned isStreaming flags from
  // a previous session that ended mid-generation (prevents forever typing indicator)
  cleanupAfterHydration: () => void

  // Exchange rates — transient, not persisted, refreshed every 24 h
  exchangeRates: RatesMap | null
  ratesTimestamp: number | null
  setExchangeRates: (rates: RatesMap, timestamp: number) => void

  // Core data
  trips: Record<string, TripPlan>
  activeTripId: string | null
  chatHistory: Record<string, ChatMessage[]>
  isGenerating: boolean
  sidebarOpen: boolean  // mobile sidebar toggle
  agentSettings: AgentSettings
  draftPreferences: TripPreferences  // pre-trip preference state (hero layout)
  userDefaults?: TripPreferences     // snapshot from last completed trip generation

  // ── New-trip wizard ──
  wizard: WizardState
  startWizard: () => void
  setWizardStep: (step: number) => void
  updateWizardDraft: (patch: Partial<WizardDraft>) => void
  toggleWizardSkip: (step: WizardStepId, skipped: boolean) => void
  cancelWizard: () => void   // back out — restore the previous active trip
  closeWizard: () => void    // finished (a trip now exists) — just dismiss

  // ── Trip CRUD ──
  createTrip: (trip: TripPlan) => void
  updateTrip: (tripId: string, patch: Partial<TripPlan>) => void
  deleteTrip: (tripId: string) => void
  setActiveTrip: (tripId: string | null) => void
  setSidebarOpen: (open: boolean) => void
  updateAgentSettings: (patch: Partial<AgentSettings>) => void
  updateDraftPreferences: (patch: Partial<TripPreferences>) => void
  setUserDefaults: (prefs: TripPreferences) => void
  // Single source of truth for the trip's display currency. Converts the cap and
  // the exact-budget amount so their real value is preserved, and keeps
  // budget.currency and preferences.exactBudget.currency in lockstep.
  setTripDisplayCurrency: (tripId: string, currency: string) => void

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
  // Manual in-place edit: applies the patch, AUTO-LOCKS the card (protects the
  // human edit from the AI), and reflows timings via the same recalc the drag
  // path uses (anchored at the edited card when its start time changed).
  saveActivityEdit: (
    tripId: string,
    dayId: string,
    activityId: string,
    patch: Partial<Activity>
  ) => void
  deleteActivity: (tripId: string, dayId: string, activityId: string) => void
  toggleActivityLock: (tripId: string, dayId: string, activityId: string) => void

  // ── Day titles (cosmetic — no lock, no recalc) ──
  setDayTitle: (tripId: string, dayId: string, title: string) => void

  // ── Checklist ──
  setChecklist: (tripId: string, items: ChecklistItem[]) => void
  addChecklistItem: (tripId: string, text: string, section: ChecklistSection) => void
  toggleChecklistItem: (tripId: string, itemId: string) => void
  deleteChecklistItem: (tripId: string, itemId: string) => void
  reorderChecklist: (tripId: string, items: ChecklistItem[]) => void

  // ── Reservations ──
  addReservation: (tripId: string, reservation: Reservation) => void
  updateReservation: (tripId: string, reservationId: string, patch: Partial<Reservation>) => void
  deleteReservation: (tripId: string, reservationId: string) => void

  // ── Chat ──
  addChatMessage: (tripId: string, message: ChatMessage) => void
  updateLastAssistantMessage: (tripId: string, content: string, isStreaming?: boolean) => void
  clearChatThread: (key: string) => void
  setIsGenerating: (v: boolean) => void

  // ── Live prices (flights + hotels) ──
  setTripLiveData: (tripId: string, liveData: TripLiveData) => void

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

      cleanupAfterHydration: () =>
        set((s) => {
          // Fix any assistant messages left with isStreaming:true (generation was
          // interrupted by a reload before the stream completed). Without this they
          // show a forever typing indicator after the page loads.
          const chatHistory: Record<string, ChatMessage[]> = {}
          for (const [key, msgs] of Object.entries(s.chatHistory)) {
            chatHistory[key] = msgs.map((msg) =>
              msg.isStreaming
                ? {
                    ...msg,
                    isStreaming: false,
                    content: msg.content || '_(Generation was interrupted — please resend your message.)_',
                  }
                : msg
            )
          }
          return { chatHistory, _hasHydrated: true }
        }),

      exchangeRates: null,
      ratesTimestamp: null,
      setExchangeRates: (rates, timestamp) => set({ exchangeRates: rates, ratesTimestamp: timestamp }),

      trips: {},
      activeTripId: null,
      chatHistory: {},
      isGenerating: false,
      sidebarOpen: false,
      agentSettings: DEFAULT_AGENT_SETTINGS,
      draftPreferences: DEFAULT_PREFERENCES,
      userDefaults: undefined,

      // ── New-trip wizard ──────────────────────────────────────────────────────

      wizard: INITIAL_WIZARD,

      startWizard: () =>
        set((s) => ({
          // Deactivate any current trip so generation creates a NEW one (not an
          // edit). Remember it so Cancel can restore the previous view.
          activeTripId: null,
          wizard: { active: true, step: 1, draft: { ...EMPTY_WIZARD_DRAFT }, returnTripId: s.activeTripId },
        })),

      setWizardStep: (step) =>
        set((s) => ({ wizard: { ...s.wizard, step: Math.max(1, Math.min(WIZARD_TOTAL, step)) } })),

      updateWizardDraft: (patch) =>
        set((s) => ({ wizard: { ...s.wizard, draft: { ...s.wizard.draft, ...patch } } })),

      toggleWizardSkip: (step, skipped) =>
        set((s) => {
          const cur = s.wizard.draft.skipped.filter((x) => x !== step)
          return { wizard: { ...s.wizard, draft: { ...s.wizard.draft, skipped: skipped ? [...cur, step] : cur } } }
        }),

      cancelWizard: () =>
        set((s) => ({
          activeTripId: s.wizard.returnTripId,
          wizard: { ...INITIAL_WIZARD },
        })),

      closeWizard: () => set(() => ({ wizard: { ...INITIAL_WIZARD } })),

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
      setUserDefaults: (prefs) => set({ userDefaults: prefs }),

      setTripDisplayCurrency: (tripId, currency) =>
        set((s) => {
          const trip = s.trips[tripId]
          if (!trip) return s
          const from = trip.budget.currency
          if (!currency || currency === from) return s
          const rates = s.exchangeRates ?? FALLBACK_RATES
          const newCap = trip.budget.cap > 0
            ? Math.round(convertAmount(trip.budget.cap, from, currency, rates))
            : trip.budget.cap
          const prefs = trip.preferences
          const newPrefs: TripPreferences = prefs.exactBudget
            ? {
                ...prefs,
                exactBudget: {
                  ...prefs.exactBudget,
                  amount: Math.round(convertAmount(prefs.exactBudget.amount, prefs.exactBudget.currency, currency, rates)),
                  currency,
                },
              }
            : prefs
          return {
            trips: {
              ...s.trips,
              [tripId]: {
                ...trip,
                budget: { ...trip.budget, cap: newCap, currency },
                preferences: newPrefs,
                updatedAt: now(),
              },
            },
          }
        }),

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

      saveActivityEdit: (tripId, dayId, activityId, patch) =>
        set((s) => ({
          trips: patchTrip(s.trips, tripId, (trip) => ({
            days: trip.days.map((d) => {
              if (d.id !== dayId) return d
              const idx = d.activities.findIndex((a) => a.id === activityId)
              // If the start time was edited, anchor the reflow at THIS card so
              // the new time sticks and only downstream timings shift. Otherwise
              // anchor at the day start (index 0) as drag/duration changes do.
              const anchor = patch.startTime !== undefined && idx > 0 ? idx : 0
              const merged = d.activities.map((a) =>
                a.id === activityId ? { ...a, ...patch, locked: true } : a
              )
              return { ...d, activities: recalculateDay(merged, anchor) }
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

      clearChatThread: (key) =>
        set((s) => {
          const { [key]: _removed, ...rest } = s.chatHistory
          return { chatHistory: rest }
        }),

      setIsGenerating: (v) => set({ isGenerating: v }),

      // ── Live prices ─────────────────────────────────────────────────────────
      // Cached flight + hotel data. Persisted (survives refresh) but not a user
      // edit, so we don't bump updatedAt.

      setTripLiveData: (tripId, liveData) =>
        set((s) => {
          const trip = s.trips[tripId]
          if (!trip) return s
          return { trips: { ...s.trips, [tripId]: { ...trip, liveData } } }
        }),

      // ── Day titles (cosmetic — no lock, no recalc) ──────────────────────────

      setDayTitle: (tripId, dayId, title) =>
        set((s) => ({
          trips: patchTrip(s.trips, tripId, (trip) => ({
            days: trip.days.map((d) => (d.id === dayId ? { ...d, dayTitle: title } : d)),
          })),
        })),

      // ── Checklist ───────────────────────────────────────────────────────────

      setChecklist: (tripId, items) =>
        set((s) => ({ trips: patchTrip(s.trips, tripId, () => ({ checklist: items })) })),

      addChecklistItem: (tripId, text, section) =>
        set((s) => ({
          trips: patchTrip(s.trips, tripId, (trip) => {
            const list = trip.checklist ?? []
            const order = list.filter((i) => i.section === section).length
            const item: ChecklistItem = { id: now() + Math.random().toString(36).slice(2, 6), text, done: false, section, order }
            return { checklist: [...list, item] }
          }),
        })),

      toggleChecklistItem: (tripId, itemId) =>
        set((s) => ({
          trips: patchTrip(s.trips, tripId, (trip) => ({
            checklist: (trip.checklist ?? []).map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)),
          })),
        })),

      deleteChecklistItem: (tripId, itemId) =>
        set((s) => ({
          trips: patchTrip(s.trips, tripId, (trip) => ({
            checklist: (trip.checklist ?? []).filter((i) => i.id !== itemId),
          })),
        })),

      reorderChecklist: (tripId, items) =>
        set((s) => ({ trips: patchTrip(s.trips, tripId, () => ({ checklist: items })) })),

      // ── Reservations ────────────────────────────────────────────────────────

      addReservation: (tripId, reservation) =>
        set((s) => ({
          trips: patchTrip(s.trips, tripId, (trip) => ({
            reservations: [...(trip.reservations ?? []), reservation],
          })),
        })),

      updateReservation: (tripId, reservationId, patch) =>
        set((s) => ({
          trips: patchTrip(s.trips, tripId, (trip) => ({
            reservations: (trip.reservations ?? []).map((r) => (r.id === reservationId ? { ...r, ...patch } : r)),
          })),
        })),

      deleteReservation: (tripId, reservationId) =>
        set((s) => ({
          trips: patchTrip(s.trips, tripId, (trip) => ({
            reservations: (trip.reservations ?? []).filter((r) => r.id !== reservationId),
          })),
        })),

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
        // cleanupAfterHydration sets _hasHydrated:true AND repairs orphaned streaming messages
        state?.cleanupAfterHydration()
      },
      // Only persist trips, chatHistory, activeTripId, settings — not transient UI state
      partialize: (s) => ({
        trips: s.trips,
        activeTripId: s.activeTripId,
        chatHistory: s.chatHistory,
        agentSettings: s.agentSettings,
        draftPreferences: s.draftPreferences,
        userDefaults: s.userDefaults,
        wizard: s.wizard,   // persist so a refresh mid-wizard resumes at the same step
      }),
    }
  )
)
