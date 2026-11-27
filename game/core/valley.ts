import { createHeightField, heightAt, sampleTerrain, slopeAt, type HeightField, type Terrain } from './terrain'

export const MAP_SIZE = 12000 // metres, centred on the start (origin)
export const MAP_SEGMENTS = 256 // ~47 m per cell

export interface Point {
  x: number
  z: number
}

/** The whole level for the map layer: coarse terrain, start and exit. */
export interface Valley {
  seed: string
  field: HeightField
  map: Terrain
  start: Point
  village: Point
}

export const MAX_UPHILL = 0.85 // rise/run (~40°): steeper = cliff
export const MAX_DOWNHILL = 1.1

/** Thick scrub blocks walking. */
export function isScrub(field: HeightField, x: number, z: number): boolean {
  return field.scrub(x, z)
}

/**
 * Which map vertices can be reached on foot from `start` (8-neighbour flood fill with the walking
 * rules: no cliffs, no drops, no scrub, no lakes; rivers can be swum). Coarser than the walk itself, good enough to validate a level.
 */
function reachable(field: HeightField, map: Terrain, start: Point): Uint8Array {
  const n = map.segments + 1
  const cell = map.size / map.segments
  const seen = new Uint8Array(n * n)
  const queue = new Int32Array(n * n)
  const toX = (ix: number) => ix * cell - map.size / 2
  const sx = Math.round((start.x + map.size / 2) / cell)
  const sz = Math.round((start.z + map.size / 2) / cell)
  let head = 0
  let tail = 0
  queue[tail++] = sz * n + sx
  seen[sz * n + sx] = 1
  while (head < tail) {
    const i = queue[head++]
    const ix = i % n
    const iz = (i - ix) / n
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const jx = ix + dx
        const jz = iz + dz
        if ((!dx && !dz) || jx < 1 || jz < 1 || jx >= n - 1 || jz >= n - 1) continue
        const j = jz * n + jx
        if (seen[j]) continue
        const grade = (map.heights[j] - map.heights[i]) / (cell * Math.hypot(dx, dz))
        if (grade > MAX_UPHILL || grade < -MAX_DOWNHILL || field.scrub(toX(jx), toX(jz)) || field.lake(toX(jx), toX(jz)) > map.heights[j]) continue
        seen[j] = 1
        queue[tail++] = j
      }
    }
  }
  return seen
}

export function generateValley(seed: string): Valley {
  const field = createHeightField(seed)
  const map = sampleTerrain(field, MAP_SIZE, MAP_SEGMENTS)

  // Village: "water flows downhill, towards people" → lowest gentle spot on a ring 4.5–5.5 km away,
  // within 50° of the direction the land drains toward, and reachable on foot from the start.
  const start = { x: 0, z: 0 }
  const ok = reachable(field, map, start)
  const n = map.segments + 1
  const cell = map.size / map.segments
  let best: Point = { x: 0, z: -5000 }
  let bestH = Infinity
  for (let a = field.exitBearing - 50; a <= field.exitBearing + 50; a += 2) {
    for (let r = 4500; r <= 5500; r += 100) {
      const x = Math.sin((a * Math.PI) / 180) * r
      const z = -Math.cos((a * Math.PI) / 180) * r
      if (slopeAt(map, x, z) > 0.25 || isScrub(field, x, z) || field.water(x, z) > -Infinity) continue
      const ix = Math.round((x + map.size / 2) / cell)
      const iz = Math.round((z + map.size / 2) / cell)
      if (!ok[iz * n + ix]) continue
      const h = heightAt(map, x, z)
      if (h < bestH) {
        bestH = h
        best = { x, z }
      }
    }
  }
  return { seed, field, map, start, village: best }
}
