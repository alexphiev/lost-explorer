import { create } from 'zustand'
import { runStore } from './run'
import { climb, explore, newRun, rest, walk, type RunState } from '@/game/core/travel'
import { snapToTileGrid } from '@/game/core/terrain'
import { generateValley, type Point, type Valley } from '@/game/core/valley'

/** 1 real second in the 3D scene = 20 game seconds (3 real minutes ≈ 1 game hour). */
export const SCENE_TIME_SCALE = 20

interface Journey {
  valley: Valley | null
  run: RunState | null
  /** bearing chosen on the map, degrees clockwise from north (null = none yet) */
  bearing: number | null
  layer: 'map' | 'scene'
  /** world position the 3D tile is centred on */
  sceneCenter: Point | null
  start: (seed: string) => void
  setBearing: (b: number) => void
  walk: () => void
  climb: () => void
  rest: () => void
  enterScene: () => void
  /** back to the map from the 3D scene; `local*` = player position in the tile, `seconds` = real time spent */
  leaveScene: (localX: number, localZ: number, seconds: number, climbed: boolean) => void
}

export const useJourney = create<Journey>((set, get) => ({
  valley: null,
  run: null,
  bearing: null,
  layer: 'map',
  sceneCenter: null,
  start: (seed) => {
    const valley = generateValley(seed)
    set({ valley, run: newRun(valley), bearing: null, layer: 'map', sceneCenter: null })
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
    if (climbed && next.status === 'playing') next = climb(valley, next).state
    set({ run: next, layer: 'map', sceneCenter: null })
  },
}))
