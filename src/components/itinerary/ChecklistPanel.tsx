'use client'

import { useState } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Trash2, GripVertical, Sparkles } from 'lucide-react'
import type { TripPlan, ChecklistItem, ChecklistSection } from '@/lib/types'
import { CHECKLIST_SECTIONS } from '@/lib/types'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

// Hardcoded starter templates — NOT AI-generated.
const TEMPLATES: { section: ChecklistSection; items: string[] }[] = [
  { section: 'Documents', items: ['Passport valid 6+ months', 'Visa check', 'Travel insurance', 'Copies of key bookings'] },
  { section: 'Before you go', items: ['Notify bank of travel', 'Download offline maps', 'Online check-in', 'Local currency / cash'] },
  { section: 'Packing', items: ['Power adapters', 'Chargers & cables', 'Medications', 'Weather-appropriate clothes'] },
]

export function ChecklistPanel({ trip }: { trip: TripPlan }) {
  const addChecklistItem = useStore((s) => s.addChecklistItem)
  const items = trip.checklist ?? []
  const done = items.filter((i) => i.done).length

  function addTemplate(t: (typeof TEMPLATES)[number]) {
    const existing = new Set(items.map((i) => i.text.toLowerCase()))
    for (const text of t.items) {
      if (!existing.has(text.toLowerCase())) addChecklistItem(trip.id, text, t.section)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 md:p-6 max-w-2xl mx-auto w-full pb-10 space-y-4">

        {/* Progress */}
        <div className="bg-[#111111] rounded-xl border border-[#1f1f1f] p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[13px] font-semibold text-[#f0f0f0]">Trip checklist</p>
            <span className="text-[11px] font-semibold text-[#888] tabular-nums">{done}/{items.length}</span>
          </div>
          <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-white transition-all duration-500"
              style={{ width: items.length ? `${(done / items.length) * 100}%` : '0%' }}
            />
          </div>
        </div>

        {/* Starter templates */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-[#555] flex items-center gap-1 mr-0.5">
            <Sparkles size={11} /> Starters:
          </span>
          {TEMPLATES.map((t) => (
            <button
              key={t.section}
              onClick={() => addTemplate(t)}
              className="px-2.5 py-1 rounded-full border border-[#2a2a2a] text-[11px] text-[#888] hover:border-[#444] hover:text-[#f0f0f0] transition-colors"
            >
              + {t.section}
            </button>
          ))}
        </div>

        {/* Sections */}
        {CHECKLIST_SECTIONS.map((section) => (
          <Section key={section} trip={trip} section={section} items={items.filter((i) => i.section === section).sort((a, b) => a.order - b.order)} />
        ))}

        {items.length === 0 && (
          <p className="text-center text-[12px] text-[#444] py-6">
            No items yet — add one below or tap a starter template above.
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({ trip, section, items }: { trip: TripPlan; section: ChecklistSection; items: ChecklistItem[] }) {
  const addChecklistItem = useStore((s) => s.addChecklistItem)
  const reorderChecklist = useStore((s) => s.reorderChecklist)
  const [draft, setDraft] = useState('')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((i) => i.id === active.id)
    const newIndex = items.findIndex((i) => i.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(items, oldIndex, newIndex).map((it, idx) => ({ ...it, order: idx }))
    // Merge back with the other sections' items (unchanged).
    const others = (trip.checklist ?? []).filter((i) => i.section !== section)
    reorderChecklist(trip.id, [...others, ...reordered])
  }

  function add() {
    const t = draft.trim()
    if (!t) return
    addChecklistItem(trip.id, t, section)
    setDraft('')
  }

  return (
    <div>
      <p className="text-[10px] font-semibold text-[#444] uppercase tracking-widest mb-2">{section}</p>
      <div className="bg-[#111111] rounded-xl border border-[#1f1f1f] divide-y divide-[#161616] overflow-hidden">
        {items.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {items.map((item) => <ChecklistRow key={item.id} tripId={trip.id} item={item} />)}
            </SortableContext>
          </DndContext>
        )}
        {/* Add row */}
        <div className="flex items-center gap-2 px-3 py-2">
          <Plus size={12} className="text-[#444] shrink-0" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            placeholder={`Add to ${section.toLowerCase()}…`}
            className="flex-1 bg-transparent text-[12px] text-[#f0f0f0] placeholder:text-[#333] focus:outline-none"
          />
        </div>
      </div>
    </div>
  )
}

// ─── ChecklistRow ─────────────────────────────────────────────────────────────

function ChecklistRow({ tripId, item }: { tripId: string; item: ChecklistItem }) {
  const toggleChecklistItem = useStore((s) => s.toggleChecklistItem)
  const deleteChecklistItem = useStore((s) => s.deleteChecklistItem)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  return (
    <div ref={setNodeRef} style={style} className="group flex items-center gap-2 px-3 py-2">
      <button {...attributes} {...listeners} aria-label="Drag to reorder" className="cursor-grab active:cursor-grabbing text-[#333] hover:text-[#666] opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity touch-none">
        <GripVertical size={12} />
      </button>
      <button
        onClick={() => toggleChecklistItem(tripId, item.id)}
        aria-label={item.done ? 'Mark incomplete' : 'Mark complete'}
        className={cn(
          'w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors',
          item.done ? 'bg-white border-white' : 'border-[#333] hover:border-[#555]',
        )}
      >
        {item.done && <span className="text-black text-[10px] leading-none">✓</span>}
      </button>
      <span className={cn('flex-1 text-[12px] leading-snug', item.done ? 'text-[#555] line-through' : 'text-[#e0e0e0]')}>
        {item.text}
      </span>
      <button
        onClick={() => deleteChecklistItem(tripId, item.id)}
        aria-label="Delete item"
        className="text-[#444] hover:text-[#ef4444] opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0"
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}
