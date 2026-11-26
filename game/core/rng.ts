import Alea from 'alea'

export type Rng = () => number

/** One seeded RNG per subsystem: same seed + same name → same sequence. */
export function makeRng(seed: string, subsystem: string): Rng {
  return Alea(`${seed}:${subsystem}`)
}

export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8)
}
