import { create } from 'zustand'

interface Run {
  /** Player position in the 3D tile (local coordinates). Mutated in place every frame (never via setState). */
  playerPosition: { x: number; y: number; z: number }
  /** Energy lost to cold water in the current 3D scene. Mutated in place every frame (never via setState). */
  coldLoss: number
}

export const useRun = create<Run>(() => ({ playerPosition: { x: 0, y: 0, z: 0 }, coldLoss: 0 }))
export const runStore = useRun
