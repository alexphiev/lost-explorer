import { create } from 'zustand'

export interface PlayerAudio {
  /** 0 on the ground, 1 climbing, 2 swimming, 3 other (fallen, mantling) */
  mode: number
  speed: number
  /** gait / stroke cycle, 0..1 (one footstep at 0 and one at 0.5) */
  phase: number
  grounded: boolean
  /** 0..1 water around the legs */
  wade: number
  /** standing on rock or scree rather than grass and earth */
  rock: boolean
}

interface Run {
  /** Player position in the 3D tile (local coordinates). Mutated in place every frame (never via setState). */
  playerPosition: { x: number; y: number; z: number }
  /** Energy lost to cold water in the current 3D scene. Mutated in place every frame (never via setState). */
  coldLoss: number
  /** Health lost to falls in the current 3D scene. Mutated in place by the frame loop (never via setState). */
  injury: number
  /** What the sounds need from the player, written by the frame loop (never via setState). */
  audio: PlayerAudio
  /** performance.now() when the current 3D scene started (0 = none) */
  sceneEnteredAt: number
}

export const useRun = create<Run>(() => ({ playerPosition: { x: 0, y: 0, z: 0 }, coldLoss: 0, injury: 0, sceneEnteredAt: 0, audio: { mode: 0, speed: 0, phase: 0, grounded: true, wade: 0, rock: false } }))
export const runStore = useRun
