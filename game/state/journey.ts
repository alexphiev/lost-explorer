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
  /** world position the 3D tile is centred on; kept while the scene waits behind the map */
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

/** The run as it would be on leaving the 3D scene now: position, time spent, cold and falls committed. */
function settleScene(valley: Valley, run: RunState, center: Point, localX: number, localZ: number, seconds: number): RunState {
  let next = explore(valley, run, center.x + localX, center.z + localZ, (seconds * SCENE_TIME_SCALE) / 3600)
  // cold water drained energy while exploring
  const cold = runStore.getState().coldLoss
  if (cold > 0) next = { ...next, energy: Math.max(0, next.energy - cold) }
  // falls hurt while exploring
  const injury = runStore.getState().injury
  if (injury > 0) next = { ...next, health: Math.max(0, next.health - injury) }
  return next
}

/** For the save while on foot in 3D: the live scene progress folded into the run (the scene itself keeps going). */
export function sceneSnapshot(): RunState | null {
  const { valley, run, sceneCenter, layer } = useJourney.getState()
  if (!valley || !run || !sceneCenter || layer !== 'scene') return null
  const r = runStore.getState()
  if (!r.sceneEnteredAt) return null
  const next = settleScene(valley, run, sceneCenter, r.playerPosition.x, r.playerPosition.z, (performance.now() - r.sceneEnteredAt) / 1000)
  // still on foot: a win is settled by the scene itself
  return next.status === 'playing' ? next : null
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
    const next = walk(valley, run, bearing).state
    // walking on the map moves you on: the 3D scene waiting behind the map is dropped
    const moved = next.x !== run.x || next.z !== run.z
    set(moved ? { run: next, sceneCenter: null } : { run: next })
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
    if (!run || run.status !== 'playing') return
    // back to the scene left behind the map, exactly as it was; else a new one around where you stand
    set({ layer: 'scene', sceneCenter: get().sceneCenter ?? { x: snapToTileGrid(run.x), z: snapToTileGrid(run.z) } })
  },
  leaveScene: (localX, localZ, seconds, climbed) => {
    const { valley, run, sceneCenter } = get()
    if (!valley || !run || !sceneCenter) return
    let next = settleScene(valley, run, sceneCenter, localX, localZ, seconds)
    runStore.getState().coldLoss = 0
    runStore.getState().injury = 0
    if (climbed && next.status === 'playing') next = climb(valley, next).state
    // the scene stays where it is (paused behind the map) until a map walk moves you
    set({ run: next, layer: 'map' })
  },
}))
