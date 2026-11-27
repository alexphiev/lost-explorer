import { makeRng, type Rng } from './rng'
import { heightAt, moistureAt, relHeight, slopeAt, type Terrain } from './terrain'

export interface Instance {
  x: number
  y: number
  z: number
  scale: number
  rotation: number
  /** 0..1, free per-instance variation (colour, shape). */
  tint: number
}

export interface Site {
  /** height normalised 0..1 */
  h: number
  slope: number
  moisture: number
}

const SPAWN_CLEAR_RADIUS = 8

/** Rejection sampling: `chance(site)` is the probability (0..1) of keeping a candidate. */
function scatter(
  t: Terrain,
  rng: Rng,
  count: number,
  chance: (s: Site) => number,
  minScale: number,
  maxScale: number,
  clear = SPAWN_CLEAR_RADIUS,
): Instance[] {
  const out: Instance[] = []
  const half = t.size / 2 - 5
  const site: Site = { h: 0, slope: 0, moisture: 0 }
  let tries = 0
  while (out.length < count && tries < count * 80) {
    tries++
    const x = (rng() * 2 - 1) * half
    const z = (rng() * 2 - 1) * half
    if (x * x + z * z < clear * clear) continue
    const y = heightAt(t, x, z)
    site.h = relHeight(t, y)
    site.slope = slopeAt(t, x, z)
    site.moisture = moistureAt(t, x, z)
    if (rng() > chance(site)) continue
    out.push({
      x,
      y,
      z,
      scale: minScale + rng() * (maxScale - minScale),
      rotation: rng() * Math.PI * 2,
      tint: rng(),
    })
  }
  return out
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export interface Vegetation {
  conifers: Instance[]
  broadleaves: Instance[]
  rocks: Instance[]
  grass: Instance[]
  flowers: Instance[]
}

export function placeVegetation(t: Terrain, seed: string): Vegetation {
  return {
    // conifers: mid/high slopes, wetter
    conifers: scatter(t, makeRng(seed, 'conifers'), 1300, (s) =>
      s.slope > 0.6 ? 0 : 0.15 + 0.85 * smooth(0.25, 0.5, s.h) * (0.4 + 0.6 * s.moisture) * (1 - smooth(0.85, 0.95, s.h)),
    0.7, 1.5),
    // broadleaves: low valleys and meadow edges
    broadleaves: scatter(t, makeRng(seed, 'broadleaves'), 700, (s) =>
      s.slope > 0.5 ? 0 : (1 - smooth(0.35, 0.6, s.h)) * (0.3 + 0.7 * s.moisture),
    0.8, 1.4),
    rocks: scatter(t, makeRng(seed, 'rocks'), 500, (s) => (s.slope > 0.9 ? 0 : 0.3 + smooth(0.2, 0.6, s.slope) + smooth(0.6, 0.9, s.h)), 0.4, 2.2),
    // grass tufts and flowers: flat-ish meadows
    grass: scatter(t, makeRng(seed, 'grass'), 14000, (s) =>
      s.slope > 0.45 ? 0 : (1 - smooth(0.55, 0.8, s.h)), 0.6, 1.4, 1.5),
    flowers: scatter(t, makeRng(seed, 'flowers'), 4000, (s) =>
      s.slope > 0.35 ? 0 : (1 - smooth(0.3, 0.55, s.h)) * (0.3 + 0.7 * (1 - Math.abs(s.moisture - 0.5) * 2)), 0.6, 1.2, 2),
  }
}
