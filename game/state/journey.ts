import { create } from 'zustand'
import { runStore } from './run'
import { campRest, checkEnd, climb, explore, makeCamp, newRun, observe, TIME_SCALE, type RunState } from '@/game/core/travel'
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
export const SCENE_TIME_SCALE = TIME_SCALE

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
  climb: () => void
  enterScene: () => void
  /** At the camp, on foot: settle what the scene spent so far, then rest an hour or sleep until dawn. */
  campRest: (localX: number, localZ: number, seconds: number, sleep: boolean) => void
  /** Pitch (spot given) or pack up (null) the camp at tile-local (x, z). */
  setCamp: (spot: { x: number; z: number; quality: number; fire: boolean; verdict: string } | null) => void
  /** On foot: what the player sees from tile-local (x, z) (fog, trail, clues). Returns new journal lines, if any. */
  observe: (localX: number, localZ: number, eye: number, night: boolean, hour: number) => string[]
  /** back to the map from the 3D scene; `local*` = player position in the tile, `seconds` = real time spent */
  leaveScene: (localX: number, localZ: number, seconds: number, climbed: boolean) => void
}

/** The run as it would be on leaving the 3D scene now: position, time spent, cold and falls committed. */
function settleScene(valley: Valley, run: RunState, center: Point, localX: number, localZ: number, seconds: number): RunState {
  let next = explore(valley, run, center.x + localX, center.z + localZ, (seconds * SCENE_TIME_SCALE) / 3600)
  // effort and cold spent energy, falls and the cold of the night hurt (all accumulated by the scene)
  const r = runStore.getState()
  const spent = r.coldLoss + r.fatigue
  if (spent > 0) next = { ...next, energy: Math.max(0, next.energy - spent) }
  if (r.injury > 0) next = { ...next, health: Math.max(0, next.health - r.injury) }
  return checkEnd(next)
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

/** The 3D world is one terrain centred on the start (world origin). */
const WORLD_CENTER: Point = { x: 0, z: 0 }

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
    // the level is played on foot: straight into the 3D valley
    set({ level, valley, run: newRun(valley), bearing: null, layer: 'scene', sceneCenter: WORLD_CENTER, result: null })
  },
  resume: (saved) => {
    const valley = get().valley?.seed === saved.seed ? get().valley! : generateValley(saved.seed, saved.level !== null ? levelById(saved.level)?.spec : undefined)
    useClock.setState({ seconds: saved.seconds })
    set({ level: saved.level, valley, run: saved.run, bearing: saved.bearing, layer: 'scene', sceneCenter: WORLD_CENTER, result: null })
  },
  setBearing: (bearing) => set({ bearing }),
  climb: () => {
    const { valley, run } = get()
    if (valley && run) set({ run: climb(valley, run).state })
  },
  observe: (localX, localZ, eye, night, hour) => {
    const { valley, run, sceneCenter } = get()
    if (!valley || !run || !sceneCenter) return []
    const o = observe(valley, run, sceneCenter.x + localX, sceneCenter.z + localZ, eye, night, hour)
    if (o.state !== run) set({ run: o.state })
    return o.lines
  },
  campRest: (localX, localZ, seconds, sleep) => {
    const { valley, run, sceneCenter } = get()
    if (!valley || !run || !sceneCenter) return
    const settled = settleScene(valley, run, sceneCenter, localX, localZ, seconds)
    runStore.getState().coldLoss = 0
    runStore.getState().injury = 0
    runStore.getState().fatigue = 0
    const next = settled.status === 'playing' ? campRest(settled, sleep) : settled
    set({ run: next, layer: next.status === 'playing' ? 'scene' : 'map' })
  },
  setCamp: (spot) => {
    const { run, sceneCenter } = get()
    if (!run || !sceneCenter) return
    if (!spot) return set({ run: { ...run, camp: null } })
    const camp = { x: sceneCenter.x + spot.x, z: sceneCenter.z + spot.z, quality: spot.quality, fire: spot.fire }
    set({ run: makeCamp(run, camp, spot.verdict) })
  },
  enterScene: () => {
    const { run } = get()
    if (!run || run.status !== 'playing') return
    // back to the scene left behind the map, exactly as it was; else a new one around where you stand
    set({ layer: 'scene', sceneCenter: WORLD_CENTER })
  },
  leaveScene: (localX, localZ, seconds, climbed) => {
    const { valley, run, sceneCenter } = get()
    if (!valley || !run || !sceneCenter) return
    let next = settleScene(valley, run, sceneCenter, localX, localZ, seconds)
    runStore.getState().coldLoss = 0
    runStore.getState().injury = 0
    runStore.getState().fatigue = 0
    if (climbed && next.status === 'playing') next = climb(valley, next).state
    // the scene stays where it is (paused behind the map) until a map walk moves you
    set({ run: next, layer: 'map' })
  },
}))
