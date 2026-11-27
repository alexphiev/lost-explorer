import { makeRng } from './rng'
import { heightAt, moistureAt, slopeAt, worldRel, type HeightField, type Terrain } from './terrain'

/** Positions are in the tile's local coordinates (see Terrain). */
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
  /** world-normalised height 0..1 */
  h: number
  slope: number
  moisture: number
}

const CHUNK = 250 // metres: placement is decided per world chunk, so a spot always has the same trees
const SPAWN_CLEAR_RADIUS = 8

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * Rejection sampling per world chunk: `perChunk` candidates, each kept with probability `chance(site)`.
 * Only instances inside the tile are returned, in local coordinates.
 */
function scatter(
  t: Terrain,
  water: (x: number, z: number) => number,
  seed: string,
  name: string,
  perChunk: number,
  chance: (s: Site) => number,
  minScale: number,
  maxScale: number,
  clear = SPAWN_CLEAR_RADIUS,
  maxRadius = Infinity, // only keep instances this close to the tile centre (small decor)
): Instance[] {
  const out: Instance[] = []
  const half = Math.min(t.size / 2 - 5, maxRadius)
  const site: Site = { h: 0, slope: 0, moisture: 0 }
  const c0x = Math.floor((t.centerX - half) / CHUNK)
  const c1x = Math.floor((t.centerX + half) / CHUNK)
  const c0z = Math.floor((t.centerZ - half) / CHUNK)
  const c1z = Math.floor((t.centerZ + half) / CHUNK)
  for (let cz = c0z; cz <= c1z; cz++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      const rng = makeRng(seed, `${name}:${cx}:${cz}`)
      for (let k = 0; k < perChunk; k++) {
        // always draw the same numbers per candidate, kept or not
        const wx = (cx + rng()) * CHUNK
        const wz = (cz + rng()) * CHUNK
        const keep = rng()
        const scale = minScale + rng() * (maxScale - minScale)
        const rotation = rng() * Math.PI * 2
        const tint = rng()
        const x = wx - t.centerX
        const z = wz - t.centerZ
        if (Math.abs(x) > half || Math.abs(z) > half) continue
        if (maxRadius < Infinity && x * x + z * z > maxRadius * maxRadius) continue
        if (x * x + z * z < clear * clear) continue
        const y = heightAt(t, x, z)
        if (water(wx, wz) > y - 0.1) continue // nothing grows under water
        site.h = worldRel(y)
        site.slope = slopeAt(t, x, z)
        site.moisture = moistureAt(t, x, z)
        if (keep > chance(site)) continue
        out.push({ x, y, z, scale, rotation, tint })
      }
    }
  }
  return out
}

/** Dense bushes on a jittered 3.5 m grid wherever the map has impassable scrub. */
function scrubBushes(t: Terrain, field: HeightField, seed: string, max: number): Instance[] {
  const out: Instance[] = []
  const STEP = 3.5
  const half = t.size / 2 - 5
  const g0x = Math.ceil((t.centerX - half) / STEP)
  const g1x = Math.floor((t.centerX + half) / STEP)
  const g0z = Math.ceil((t.centerZ - half) / STEP)
  const g1z = Math.floor((t.centerZ + half) / STEP)
  for (let gz = g0z; gz <= g1z && out.length < max; gz++) {
    for (let gx = g0x; gx <= g1x && out.length < max; gx++) {
      const wx = gx * STEP
      const wz = gz * STEP
      if (!field.scrub(wx, wz)) continue
      const rng = makeRng(seed, `bush:${gx}:${gz}`)
      const x = wx - t.centerX + (rng() - 0.5) * STEP
      const z = wz - t.centerZ + (rng() - 0.5) * STEP
      if (x * x + z * z < 9) continue
      out.push({ x, y: heightAt(t, x, z), z, scale: 0.9 + rng() * 0.8, rotation: rng() * Math.PI * 2, tint: rng() })
    }
  }
  return out
}

export interface Vegetation {
  conifers: Instance[]
  broadleaves: Instance[]
  rocks: Instance[]
  grass: Instance[]
  flowers: Instance[]
  bushes: Instance[]
}

// Per 250 m chunk (16 chunks per km²): ~1300 conifers, 700 broadleaves, 500 rocks, 14k grass, 4k flowers per km² before rejection.
export function placeVegetation(t: Terrain, field: HeightField, seed: string): Vegetation {
  return {
    // conifers: mid/high slopes, wetter
    conifers: scatter(t, field.water, seed, 'conifers', 160, (s) =>
      s.slope > 0.6 ? 0 : 0.15 + 0.85 * smooth(0.2, 0.45, s.h) * (0.4 + 0.6 * s.moisture) * (1 - smooth(0.85, 0.95, s.h)),
    0.7, 1.5),
    // broadleaves: low valleys and meadow edges
    broadleaves: scatter(t, field.water, seed, 'broadleaves', 90, (s) =>
      s.slope > 0.5 ? 0 : (1 - smooth(0.3, 0.55, s.h)) * (0.3 + 0.7 * s.moisture),
    0.8, 1.4),
    rocks: [
      ...scatter(t, field.water, seed, 'rocks', 60, (s) => (s.slope > 0.9 ? 0 : 0.3 + smooth(0.2, 0.6, s.slope) + smooth(0.6, 0.9, s.h)), 0.4, 2.2),
      // boulders worth climbing (2–4 m), more on slopes and high ground
      ...scatter(t, field.water, seed, 'boulders', 8, (s) => (s.slope > 0.8 ? 0 : 0.25 + 0.5 * smooth(0.15, 0.5, s.slope) + 0.4 * smooth(0.4, 0.8, s.h)), 2.6, 4.6),
    ],
    // grass tufts and flowers: flat-ish meadows
    grass: scatter(t, field.water, seed, 'grass', 1400, (s) => (s.slope > 0.45 ? 0 : 1 - smooth(0.55, 0.8, s.h)), 0.6, 1.4, 1.5),
    flowers: scatter(t, field.water, seed, 'flowers', 500, (s) =>
      s.slope > 0.35 ? 0 : (1 - smooth(0.3, 0.55, s.h)) * (0.3 + 0.7 * (1 - Math.abs(s.moisture - 0.5) * 2)), 0.6, 1.2, 2),
    bushes: scrubBushes(t, field, seed, 9000),
  }
}

/** A few houses around the village if it falls inside the tile (local coordinates); never in a lake. */
export function placeVillage(t: Terrain, field: HeightField, seed: string, villageX: number, villageZ: number): Instance[] {
  const x0 = villageX - t.centerX
  const z0 = villageZ - t.centerZ
  if (Math.abs(x0) > t.size / 2 - 60 || Math.abs(z0) > t.size / 2 - 60) return []
  const rng = makeRng(seed, 'village')
  const houses: Instance[] = []
  for (let i = 0; i < 40 && houses.length < 7; i++) {
    const a = rng() * Math.PI * 2
    const r = 12 + rng() * 45
    const x = x0 + Math.cos(a) * r
    const z = z0 + Math.sin(a) * r
    const scale = 0.85 + rng() * 0.4
    const rotation = rng() * Math.PI
    const tint = rng()
    const y = heightAt(t, x, z)
    // keep the whole footprint (~6 m) on dry ground
    const wet = (dx: number, dz: number) => field.water(x + dx + t.centerX, z + dz + t.centerZ) > -Infinity
    if (wet(0, 0) || wet(4, 0) || wet(-4, 0) || wet(0, 4) || wet(0, -4)) continue
    houses.push({ x, y, z, scale, rotation, tint })
  }
  return houses
}

/** Small ground decor, dense but only within DECOR_RADIUS of the player (fog hides the rest). */
export const DECOR_RADIUS = 220

export interface Decor {
  pebbles: Instance[]
  ferns: Instance[]
  shrubs: Instance[]
  mushrooms: Instance[]
  logs: Instance[]
  stumps: Instance[]
  branches: Instance[]
}

export function placeDecor(t: Terrain, field: HeightField, seed: string): Decor {
  const R = DECOR_RADIUS
  const w = field.water
  return {
    // stones everywhere, more on slopes and high ground
    pebbles: scatter(t, w, seed, 'pebbles', 4000, (s) => 0.25 + 0.5 * smooth(0.15, 0.6, s.slope) + 0.3 * smooth(0.5, 0.9, s.h), 0.08, 0.45, 1, R),
    // ferns in damp, shaded mid ground
    ferns: scatter(t, w, seed, 'ferns', 3500, (s) => (s.slope > 0.6 ? 0 : (0.15 + 0.85 * smooth(0.3, 0.75, s.moisture)) * (1 - smooth(0.7, 0.9, s.h))), 0.5, 1.2, 1.5, R),
    // low bushes at forest edges and in meadows
    shrubs: scatter(t, w, seed, 'shrubs', 900, (s) => (s.slope > 0.55 ? 0 : 0.25 + 0.5 * s.moisture), 0.5, 1.3, 3, R),
    mushrooms: scatter(t, w, seed, 'mushrooms', 700, (s) => (s.slope > 0.4 ? 0 : 0.1 + 0.9 * smooth(0.4, 0.8, s.moisture)), 0.6, 1.4, 1.5, R),
    // fallen trunks and stumps in the forest band
    logs: scatter(t, w, seed, 'logs', 45, (s) => (s.slope > 0.35 ? 0 : 0.3 + 0.7 * smooth(0.2, 0.5, s.h) * s.moisture), 0.7, 1.4, 6, R),
    stumps: scatter(t, w, seed, 'stumps', 60, (s) => (s.slope > 0.45 ? 0 : 0.2 + 0.6 * smooth(0.2, 0.5, s.h)), 0.6, 1.3, 4, R),
    branches: scatter(t, w, seed, 'branches', 700, (s) => (s.slope > 0.5 ? 0 : 0.3 + 0.5 * s.moisture), 0.5, 1.3, 1.5, R),
  }
}
