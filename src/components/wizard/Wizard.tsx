'use client'

import { useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, X } from 'lucide-react'
import { useStore } from '@/lib/store'
import { useChatSend } from '@/hooks/useChatSend'
import { cn } from '@/lib/utils'
import {
  WIZARD_STEPS, WIZARD_TOTAL, composeWizardMessage, wizardToPreferences, isStepAnswered, scaffoldFromDraft,
  type WizardStepId,
} from '@/lib/wizard'
import { StepCountries } from './steps/StepCountries'
import { StepCities } from './steps/StepCities'
import { StepDays } from './steps/StepDays'
import { StepDates } from './steps/StepDates'
import { StepPeople } from './steps/StepPeople'
import { StepBudget } from './steps/StepBudget'
import { StepInterests } from './steps/StepInterests'
import { StepNotes } from './steps/StepNotes'
import type { StepProps } from './stepTypes'

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

const META: Record<WizardStepId, { title: string; subtitle?: string }> = {
  countries: { title: 'Where would you like to go?', subtitle: 'Pick one or more countries — search or tap a favourite.' },
  cities:    { title: 'Which cities?', subtitle: 'Choose the places you want to base yourself.' },
  days:      { title: 'How many days?' },
  dates:     { title: 'When are you travelling?', subtitle: 'Optional — sets weather and live prices.' },
  people:    { title: 'How many people?' },
  budget:    { title: "What's your budget?" },
  interests: { title: 'What are your interests?', subtitle: 'Tap all that apply.' },
  notes:     { title: 'Anything else?' },
  generate:  { title: '' },
}

export function Wizard() {
  const step        = useStore((s) => s.wizard.step)
  const draft       = useStore((s) => s.wizard.draft)
  const returnTripId = useStore((s) => s.wizard.returnTripId)
  const setWizardStep    = useStore((s) => s.setWizardStep)
  const updateWizardDraft = useStore((s) => s.updateWizardDraft)
  const toggleWizardSkip  = useStore((s) => s.toggleWizardSkip)
  const cancelWizard      = useStore((s) => s.cancelWizard)
  const closeWizard       = useStore((s) => s.closeWizard)
  const setActiveTrip     = useStore((s) => s.setActiveTrip)
  const clearChatThread   = useStore((s) => s.clearChatThread)
  const startBuild        = useStore((s) => s.startBuild)
  const updateDraftPreferences = useStore((s) => s.updateDraftPreferences)
  const { sendMessage } = useChatSend()

  const stepId = WIZARD_STEPS[step - 1]
  const answered = isStepAnswered(stepId, draft)
  const isGenerateStep = stepId === 'generate'
  const isNotesStep = stepId === 'notes'
  const hideFooter = isGenerateStep || isNotesStep

  // ── Kick off generation (once, from the notes step) ─────────────────────────
  // Starts a LIVE BUILD: hands off directly into the trip view, which constructs
  // itself from the scaffold + real pipeline events (no separate loading screen).
  const beginGeneration = useCallback(() => {
    const draft = useStore.getState().wizard.draft
    updateDraftPreferences(wizardToPreferences(draft))
    // Guarantee a NEW trip (not an edit) and a clean pre-trip chat thread.
    setActiveTrip(null)
    clearChatThread('__new__')
    const message = composeWizardMessage(draft)
    startBuild(scaffoldFromDraft(draft)) // instant scaffold before any AI
    closeWizard()                        // leave the wizard → trip view takes over
    void sendMessage(message)
  }, [updateDraftPreferences, setActiveTrip, clearChatThread, startBuild, closeWizard, sendMessage])

  // ── Navigation ──────────────────────────────────────────────────────────────
  const advance = useCallback(() => {
    if (isGenerateStep) return
    if (stepId === 'notes') { beginGeneration(); return }
    setWizardStep(step + 1)
  }, [isGenerateStep, stepId, step, setWizardStep, beginGeneration])

  const back = useCallback(() => {
    if (step > 1 && !isGenerateStep) setWizardStep(step - 1)
  }, [step, isGenerateStep, setWizardStep])

  const skip = useCallback(() => {
    toggleWizardSkip(stepId, true)
    advance()
  }, [stepId, toggleWizardSkip, advance])

  // ── Keyboard: Enter advances, arrows/Backspace navigate (not while typing) ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable
      if (isGenerateStep) return
      if (e.key === 'Enter' && !typing && !isNotesStep) { e.preventDefault(); advance() }
      else if ((e.key === 'ArrowRight') && !typing) { e.preventDefault(); advance() }
      else if ((e.key === 'ArrowLeft' || e.key === 'Backspace') && !typing) { e.preventDefault(); back() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [advance, back, isGenerateStep, isNotesStep])

  const stepProps: StepProps = { draft, update: updateWizardDraft, advance }

  const content = (() => {
    switch (stepId) {
      case 'countries': return <StepCountries {...stepProps} />
      case 'cities':    return <StepCities {...stepProps} />
      case 'days':      return <StepDays {...stepProps} />
      case 'dates':     return <StepDates {...stepProps} />
      case 'people':    return <StepPeople {...stepProps} />
      case 'budget':    return <StepBudget {...stepProps} />
      case 'interests': return <StepInterests {...stepProps} />
      case 'notes':     return <StepNotes {...stepProps} />
      case 'generate':  return null // never rendered — Build hands off to the live trip view
    }
  })()

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0a]" data-testid="wizard">
      {/* ── Progress bar ─────────────────────────────────────────────────────── */}
      <div className="h-1 w-full bg-[#141414] shrink-0">
        <motion.div
          className="h-full bg-white"
          initial={false}
          animate={{ width: `${(step / WIZARD_TOTAL) * 100}%` }}
          transition={{ duration: 0.4, ease: EASE }}
        />
      </div>

      {/* ── Top chrome ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 h-14 shrink-0">
        {step > 1 && !isGenerateStep ? (
          <button onClick={back} aria-label="Back" className="flex items-center justify-center w-9 h-9 rounded-full text-[#888] hover:text-white hover:bg-[#1a1a1a] transition-colors">
            <ArrowLeft size={18} />
          </button>
        ) : <div className="w-9" />}

        <span className="text-[11px] font-medium tracking-widest text-[#444] uppercase tabular-nums" data-testid="wizard-progress">
          {isGenerateStep ? 'Building' : `Step ${step} of ${WIZARD_TOTAL}`}
        </span>

        {returnTripId && !isGenerateStep ? (
          <button onClick={cancelWizard} aria-label="Close" className="flex items-center justify-center w-9 h-9 rounded-full text-[#888] hover:text-white hover:bg-[#1a1a1a] transition-colors">
            <X size={18} />
          </button>
        ) : <div className="w-9" />}
      </div>

      {/* ── Step body (horizontal slide) ─────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={stepId}
            className="h-full overflow-y-auto flex flex-col items-center justify-center px-5 py-6"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.28, ease: EASE }}
          >
            <div className="w-full max-w-2xl mx-auto flex flex-col items-center">
              {META[stepId].title && (
                <div className="text-center mb-8">
                  <h1 className="text-[26px] sm:text-[34px] font-semibold text-white tracking-tight leading-tight">
                    {META[stepId].title}
                  </h1>
                  {META[stepId].subtitle && (
                    <p className="text-[14px] text-[#666] mt-2.5 max-w-md mx-auto">{META[stepId].subtitle}</p>
                  )}
                </div>
              )}
              <div className="w-full">{content}</div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Footer (Continue / Skip) ─────────────────────────────────────────── */}
      {!hideFooter && (
        <div className="shrink-0 px-5 pb-7 pt-3 flex flex-col items-center gap-3">
          <button
            onClick={advance}
            className={cn(
              'flex items-center justify-center gap-2 w-full max-w-xs px-6 py-3.5 rounded-2xl text-[15px] font-semibold transition-colors',
              answered ? 'bg-white text-black hover:bg-[#e8e8e8]' : 'bg-[#1a1a1a] text-[#888] hover:bg-[#222] hover:text-[#ccc]',
            )}
          >
            Continue
          </button>
          <button onClick={skip} className="text-[12px] text-[#555] hover:text-[#999] transition-colors">
            Skip this step
          </button>
        </div>
      )}
    </div>
  )
}
