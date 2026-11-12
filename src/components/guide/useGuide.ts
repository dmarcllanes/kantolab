// Guide mode: a per-browser preference (not app data), so it lives in
// localStorage. Every access is guarded: storage can be blocked or empty.
import { create } from 'zustand'

const KEY = 'kantolab.guide'
const ASKED = 'kantolab.guideAsked'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private mode or blocked storage: the setting just won't persist.
  }
}

interface GuideState {
  on: boolean
  /** The first-visit prompt was answered (either way). */
  asked: boolean
  touring: boolean
  setOn: (on: boolean) => void
  dismissPrompt: () => void
  startTour: () => void
  endTour: () => void
}

export const useGuide = create<GuideState>()((set) => ({
  on: read(KEY) === 'on',
  asked: read(ASKED) === '1',
  touring: false,
  setOn: (on) => {
    write(KEY, on ? 'on' : 'off')
    write(ASKED, '1')
    set({ on, asked: true })
  },
  dismissPrompt: () => {
    write(ASKED, '1')
    set({ asked: true })
  },
  startTour: () => set({ touring: true }),
  endTour: () => set({ touring: false }),
}))
