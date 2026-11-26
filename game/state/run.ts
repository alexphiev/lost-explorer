import { create } from 'zustand'

interface Run {
  seed: string
  /** Mutated in place every frame by the player (never via setState). */
  playerPosition: { x: number; y: number; z: number }
}

export const useRun = create<Run>(() => ({ seed: '', playerPosition: { x: 0, y: 0, z: 0 } }))
export const runStore = useRun
