import { create } from 'zustand'
import { runStore } from './run'
import { climb, explore, newRun, rest, walk, type RunState } from '@/game/core/travel'
import { snapToTileGrid } from '@/game/core/terrain'
import { generateValley, type Point, type Valley } from '@/game/core/valley'
import type { Best, SavedRun } from './save'
import { levelById } from '@/game/core/levels'

/** Real seconds played in the current run (ticked by the game shell, not by the frame loop). */
export const useClock = create<{ seconds: number }>(() => ({ seconds: 0 }))

/** How a won run compares with the best one, for the victory screen. */
export interface Result {
  time: Best
  previous: Best | null
}

/** 1 real second in the 3D scene = 20 game seconds (3 real minutes ≈ 1 game hour). */
export const SCENE_TIME_SCALE = 20

interface Journey {
  /** campaign level id, null for a free valley (?seed=) */
  level: number | null
  valley: Valley | null
  run: RunState | null
  /** bearing chosen on the map, degrees clockwise from north (null = none yet) */
  bearing: number | null
  layer: 'map' | 'scene'
  /** world position the 3D tile is centred on */
  sceneCenter: Point | null
  result: Result | null
  start: (seed: string, level?: number | null) => void
  resume: (saved: SavedRun) => void
  setBearing: (b: number) => void
  walk: () => void
  climb: () => void
  rest: () => void
  enterScene: () => void
  /** back to the map from the 3D scene; `local*` = player position in the tile, `seconds` = real time spent */
  leaveScene: (localX: number, localZ: number, seconds: number, climbed: boolean) => void
}

export const useJourney = create<Journey>((set, get) => ({
  level: null,
  valley: null,
  run: null,
  bearing: null,
  layer: 'map',
  sceneCenter: null,
  result: null,
  start: (seed, level = get().level) => {
    const valley = get().valley?.seed === seed ? get().valley! : generateValley(seed, level !== null ? levelById(level)?.spec : undefined)
    useClock.setState({ seconds: 0 })
    set({ level, valley, run: newRun(valley), bearing: null, layer: 'map', sceneCenter: null, result: null })
  },
  resume: (saved) => {
    const valley = get().valley?.seed === saved.seed ? get().valley! : generateValley(saved.seed, saved.level !== null ? levelById(saved.level)?.spec : undefined)
    useClock.setState({ seconds: saved.seconds })
    set({ level: saved.level, valley, run: saved.run, bearing: saved.bearing, layer: 'map', sceneCenter: null, result: null })
    if (saved.layer === 'scene') get().enterScene()
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
  enterScene: () => {
    const { run } = get()
    if (run && run.status === 'playing') set({ layer: 'scene', sceneCenter: { x: snapToTileGrid(run.x), z: snapToTileGrid(run.z) } })
  },
  leaveScene: (localX, localZ, seconds, climbed) => {
    const { valley, run, sceneCenter } = get()
    if (!valley || !run || !sceneCenter) return
    let next = explore(valley, run, sceneCenter.x + localX, sceneCenter.z + localZ, (seconds * SCENE_TIME_SCALE) / 3600)
    // cold water drained energy while exploring
    const cold = runStore.getState().coldLoss
    if (cold > 0) next = { ...next, energy: Math.max(0, next.energy - cold) }
    runStore.getState().coldLoss = 0
    // falls hurt while exploring
    const injury = runStore.getState().injury
    if (injury > 0) next = { ...next, health: Math.max(0, next.health - injury) }
    runStore.getState().injury = 0
    if (climbed && next.status === 'playing') next = climb(valley, next).state
    set({ run: next, layer: 'map', sceneCenter: null })
  },
}))
