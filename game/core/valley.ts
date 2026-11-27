import { makeRng } from './rng'
import { DEFAULT_SPEC, type LevelSpec } from './levels'
import type { ClueKind, GoalKind } from './goals'
import { createHeightField, heightAt, sampleTerrain, slopeAt, type HeightField, type Terrain } from './terrain'

export const MAP_SIZE = 3000 // metres, centred on the start (origin): the same window as the 3D world
export const MAP_SEGMENTS = 256 // ~11.7 m per cell

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
  /** where the level ends (the goal position) */
  village: Point
  goal: Goal
  clues: Clue[]
  /** named features drawn on the map once seen: summits and lakes */
  landmarks: Landmark[]
}

export interface Goal extends Point {
  kind: GoalKind
  /** radians around Y, for the 3D model (boat along the river, cave facing out of the cliff…) */
  rotation: number
}

export interface Clue extends Point {
  kind: ClueKind
  /** degrees from north: toward the next clue, or the goal for the last one */
  bearing: number
}

export interface Landmark {
  kind: 'peak' | 'lake'
  x: number
  z: number
  label: string
}

/** The highest summits (well apart) and the lakes of the map. */
function findLandmarks(field: HeightField, map: Terrain): Landmark[] {
  const n = map.segments + 1
  const cell = map.size / map.segments
  const h = map.heights
  const W = 10
  const tops: { x: number; z: number; h: number }[] = []
  for (let iz = W; iz < n - W; iz += 2) {
    for (let ix = W; ix < n - W; ix += 2) {
      const c = h[iz * n + ix]
      let top = true
      for (let dz = -W; dz <= W && top; dz += 2) for (let dx = -W; dx <= W; dx += 2) if (h[(iz + dz) * n + ix + dx] > c) { top = false; break }
      if (top) tops.push({ x: -map.size / 2 + ix * cell, z: -map.size / 2 + iz * cell, h: c })
    }
  }
  tops.sort((a, b) => b.h - a.h)
  const out: Landmark[] = []
  for (const t of tops) {
    if (out.length >= 10) break
    if (out.some((o) => Math.hypot(o.x - t.x, o.z - t.z) < 450)) continue
    out.push({ kind: 'peak', x: t.x, z: t.z, label: `Summit, ${Math.round(t.h)} m` })
  }
  const half = map.size / 2
  for (const l of field.lakesNear(0, 0, map.size * 0.72)) {
    if (l.radius < 30 || Math.abs(l.x) > half || Math.abs(l.z) > half) continue
    out.push({ kind: 'lake', x: l.x, z: l.z, label: l.radius > 250 ? 'Lake' : 'Pond' })
  }
  return out
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
function reachable(field: HeightField, map: Terrain, start: Point, parent?: Int32Array): Uint8Array {
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
        if (parent) parent[j] = i
        queue[tail++] = j
      }
    }
  }
  return seen
}

export function generateValley(seed: string, spec: LevelSpec = DEFAULT_SPEC): Valley {
  const field = createHeightField(seed)
  const map = sampleTerrain(field, MAP_SIZE, MAP_SEGMENTS)
  const start = { x: 0, z: 0 }
  const n = map.segments + 1
  const parent = new Int32Array(n * n).fill(-1)
  const ok = reachable(field, map, start, parent)
  const cell = map.size / map.segments
  const index = (x: number, z: number) => Math.round((z + map.size / 2) / cell) * n + Math.round((x + map.size / 2) / cell)
  const site = { field, map, ok, index }
  const goal = placeGoal(site, spec) ?? placeGoal(site, { ...spec, distance: [450, 1300] }) ?? { ...placeGoal(site, { ...DEFAULT_SPEC, distance: [450, 1300] })!, kind: spec.goal }
  const clues = placeClues(site, seed, spec, goal, parent)
  return { seed, field, map, start, village: { x: goal.x, z: goal.z }, goal, clues, landmarks: findLandmarks(field, map) }
}

interface SiteInfo {
  field: HeightField
  map: Terrain
  ok: Uint8Array
  index: (x: number, z: number) => number
}

const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)
const inMap = (x: number, z: number) => Math.abs(x) < MAP_SIZE / 2 - 120 && Math.abs(z) < MAP_SIZE / 2 - 120

/** Firm, dry, walkable ground reachable from the start. */
function standable(s: SiteInfo, x: number, z: number, maxSlope = 0.3): boolean {
  return inMap(x, z) && !!s.ok[s.index(x, z)] && s.field.water(x, z) === -Infinity && !s.field.scrub(x, z) && slopeAt(s.map, x, z) <= maxSlope
}

/** Steepest rise within 40–90 m around a spot (a cliff behind it). */
function wallBehind(f: HeightField, x: number, z: number): { rise: number; bearing: number } {
  const h0 = f.height(x, z)
  let rise = 0
  let bearing = 0
  for (let a = 0; a < 360; a += 30) {
    const r = (a * Math.PI) / 180
    for (const d of [40, 65, 90]) {
      const g = (f.height(x + Math.sin(r) * d, z - Math.cos(r) * d) - h0) / d
      if (g > rise) {
        rise = g
        bearing = a
      }
    }
  }
  return { rise, bearing }
}

/** The end of the level: best spot of its kind on a ring around the start, toward where the land drains. */
function placeGoal(s: SiteInfo, spec: LevelSpec): Goal | null {
  const { field, map } = s
  const [rMin, rMax] = spec.distance
  const kind = spec.goal
  const towardExit = (x: number, z: number) => angleDiff(bearingOf(x, z), field.exitBearing) <= 75
  let best: Goal | null = null
  let bestScore = -Infinity
  const consider = (x: number, z: number, score: number, rotation = 0) => {
    const d = Math.hypot(x, z)
    if (d < rMin || d > rMax || !towardExit(x, z) || score <= bestScore) return
    bestScore = score
    best = { kind, x, z, rotation }
  }

  if (kind === 'boat') {
    for (const r of field.rivers.reaches) {
      if (!r.river) continue
      for (let i = 0; i < r.n; i += 3) {
        if (!r.wet[i]) continue
        for (const side of [1, -1]) {
          const off = r.halfW[i] + 6
          const x = r.x[i] - r.dz[i] * off * side
          const z = r.z[i] + r.dx[i] * off * side
          if (!standable(s, x, z, 0.35)) continue
          consider(x, z, r.halfW[i] - angleDiff(bearingOf(x, z), field.exitBearing) * 0.05, Math.atan2(r.dx[i], r.dz[i]))
        }
      }
    }
    return best
  }
  if (kind === 'hut') {
    for (const l of field.lakesNear(0, 0, rMax + 300)) {
      if (l.radius < 35) continue
      for (let a = 0; a < 360; a += 15) {
        const r = (a * Math.PI) / 180
        const x = l.x + Math.sin(r) * (l.radius + 10)
        const z = l.z - Math.cos(r) * (l.radius + 10)
        if (!standable(s, x, z, 0.35)) continue
        consider(x, z, l.radius, Math.atan2(l.x - x, l.z - z))
      }
    }
    return best
  }
  for (let a = 0; a < 360; a += 2) {
    for (let d = rMin; d <= rMax; d += 20) {
      const x = Math.sin((a * Math.PI) / 180) * d
      const z = -Math.cos((a * Math.PI) / 180) * d
      if (!standable(s, x, z, kind === 'cave' ? 0.4 : 0.25)) continue
      if (kind === 'village') consider(x, z, -heightAt(map, x, z))
      else if (kind === 'cave') {
        const w = wallBehind(field, x, z)
        if (w.rise > 0.8) consider(x, z, w.rise, (w.bearing * Math.PI) / 180)
      } else {
        // cabin: in the woods, the more thorns around the better hidden
        let thorns = 0
        for (let k = 0; k < 8; k++) if (field.scrub(x + Math.sin(k * 0.785) * 250, z - Math.cos(k * 0.785) * 250)) thorns++
        if (field.moisture(x, z) > 0.45) consider(x, z, thorns + field.moisture(x, z))
      }
    }
  }
  return best
}

function bearingOf(x: number, z: number): number {
  return ((Math.atan2(x, -z) * 180) / Math.PI + 360) % 360
}

/** Clues along a walkable route from the start to the goal, nudged sideways so the route isn't a straight line. */
function placeClues(s: SiteInfo, seed: string, spec: LevelSpec, goal: Goal, parent: Int32Array): Clue[] {
  const c = spec.clues.length
  if (c === 0) return []
  const n = s.map.segments + 1
  const cell = s.map.size / s.map.segments
  const route: Point[] = []
  for (let i = s.index(goal.x, goal.z); i >= 0 && route.length < n * n; i = parent[i]) {
    route.push({ x: (i % n) * cell - s.map.size / 2, z: Math.floor(i / n) * cell - s.map.size / 2 })
  }
  route.reverse() // start → goal
  if (route.length < 4) return []
  const rng = makeRng(seed, 'clues')
  const spots: Point[] = []
  spec.clues.forEach((kind, k) => {
    const f = c === 1 ? 0.6 : 0.2 + (0.78 - 0.2) * (k / (c - 1))
    const p = route[Math.min(route.length - 1, Math.floor(f * route.length))]
    let spot = p
    let bestH = -Infinity
    // cairns on the highest walkable ground nearby, other clues a little off the route
    for (let t = 0; t < 40; t++) {
      const a = rng() * Math.PI * 2
      const r = kind === 'cairn' ? rng() * 250 : 25 + rng() * 75
      const x = p.x + Math.cos(a) * r
      const z = p.z + Math.sin(a) * r
      if (!standable(s, x, z, 0.5)) continue
      // fireflies: by a stream
      const wet = kind === 'fireflies' ? [0, 1, 2, 3, 4, 5].some((a) => s.field.water(x + Math.cos(a) * 15, z + Math.sin(a) * 15) > -Infinity) : false
      const h = kind === 'cairn' ? s.field.height(x, z) : kind === 'fireflies' ? (wet ? 1 : 0) + rng() * 0.5 : rng()
      if (h > bestH) {
        bestH = h
        spot = { x, z }
      }
    }
    spots.push(spot)
  })
  return spots.map((p, k) => {
    const to = k + 1 < spots.length ? spots[k + 1] : goal
    return { kind: spec.clues[k], x: p.x, z: p.z, bearing: ((Math.atan2(to.x - p.x, -(to.z - p.z)) * 180) / Math.PI + 360) % 360 }
  })
}
