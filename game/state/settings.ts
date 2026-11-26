import { create } from 'zustand'

interface Settings {
  forceWebGL: boolean
}

export const useSettings = create<Settings>(() => ({ forceWebGL: false }))
