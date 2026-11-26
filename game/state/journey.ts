import { create } from 'zustand'
import { climb, newRun, rest, walk, type RunState } from '@/game/core/travel'
import { generateValley, type Valley } from '@/game/core/valley'

interface Journey {
  valley: Valley | null
  run: RunState | null
  /** bearing chosen on the map, degrees clockwise from north (null = none yet) */
  bearing: number | null
  start: (seed: string) => void
  setBearing: (b: number) => void
  walk: () => void
  climb: () => void
  rest: () => void
}

export const useJourney = create<Journey>((set, get) => ({
  valley: null,
  run: null,
  bearing: null,
  start: (seed) => {
    const valley = generateValley(seed)
    set({ valley, run: newRun(valley), bearing: null })
  },
  setBearing: (bearing) => set({ bearing }),
  walk: () => {
    const { valley, run, bearing } = get()
    if (!valley || !run || bearing === null) return
    set({ run: walk(valley, run, bearing).state })
  },
  climb: () => {
    const { valley, run } = get()
    if (valley && run) set({ run: climb(valley, run).state })
  },
  rest: () => {
    const { valley, run } = get()
    if (valley && run) set({ run: rest(valley, run).state })
  },
}))
