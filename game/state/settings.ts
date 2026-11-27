import { create } from 'zustand'

interface Settings {
  forceWebGL: boolean
  /** sounds off (kept in this browser) */
  muted: boolean
  setMuted: (m: boolean) => void
}

const MUTE_KEY = 'bearing:muted'
const readMuted = () => {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export const useSettings = create<Settings>((set) => ({
  forceWebGL: false,
  muted: readMuted(),
  setMuted: (muted) => {
    try {
      window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {}
    set({ muted })
  },
}))
