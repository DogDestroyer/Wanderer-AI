'use client'

import { useEffect } from 'react'
import { useStore } from '@/lib/store'

// Triggers Zustand's manual rehydration from localStorage on first client render.
// Lives in the root layout so it runs exactly once per page load.
export function StoreHydration() {
  useEffect(() => {
    useStore.persist.rehydrate()
  }, [])
  return null
}
