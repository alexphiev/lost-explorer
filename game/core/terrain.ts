import { createNoise2D } from 'simplex-noise'
import { makeRng } from './rng'
import { createRivers, createWaterSample, type RiverNetwork, type WaterSample } from './rivers'

const TERRAIN_SIZE = 1000 // grid reference: 3.9 m cells (256 per km), shared by everything sampled in 3D
const TERRAIN_SEGMENTS = 256
/** The whole level in 3D: one continuous terrain, metres, centred on the start (x, z ∈ [−1500, 1500]). */
export const WORLD_SIZE = 3000
export const WORLD_SEGMENTS = 768 // 3.9 m cells, like the old 1 km tiles

/** Continuous, deterministic world: same seed → same height at any (x, z), in metres. */
export interface HeightField {
  height(x: number, z: number): number
  /** 0..1: dry (golden grass) → wet (moss, dense forest, scrub). */
  moisture(x: number, z: number): number
  /** Thick, impassable scrub: scattered patches (~5% of the land), independent of height. */
  scrub(x: number, z: number): boolean
  /** Bearing (degrees clockwise from north) the whole land slowly drains toward: where people live. */
  exitBearing: number
  /** Water surface height at (x, z) (lake, stream or river), or -Infinity where it is dry. */
  water(x: number, z: number): number
  /** Lake / pond surface only (streams and rivers excluded), or -Infinity. */
  lake(x: number, z: number): number
  /** Stream / river at (x, z)? Fills `out` with level, depth and current (no allocation). */
  stream(x: number, z: number, out: WaterSample): boolean
  rivers: RiverNetwork
  /** Lakes (and ponds) whose disc comes within `radius` of (x, z). */
  lakesNear(x: number, z: number, radius: number): Lake[]
}

/** A flat-surfaced lake: a disc of water at `level`, its bed carved into the land. */
export interface Lake {
  x: number
  z: number
  radius: number
  level: number
}

const LAKE_CHUNK = 1200 // metres; at most one lake per chunk
const SHORE = 80 // metres of shore shaping around a lake

/**
 * A sampled square of the height field. Local coordinates are centred on the origin;
 * world = local + (centerX, centerZ).
 */
export interface Terrain {
  size: number
  centerX: number
  centerZ: number
  segments: number
  /** (segments+1)² heights, row-major: index = iz * (segments+1) + ix. Absolute metres. */
  heights: Float32Array
  /** Same layout as heights. */
  moisture: Float32Array
  minHeight: number
  maxHeight: number
}

function fbm(noise: (x: number, y: number) => number, x: number, z: number, octaves: number) {
  let sum = 0
  let amp = 1
  let freq = 1
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * freq, z * freq)
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export function createHeightField(seed: string): HeightField {
  const rng = makeRng(seed, 'terrain')
  const hills = createNoise2D(rng)
  const valleys = createNoise2D(rng)
  const ridgeNoise = createNoise2D(rng)
  const detail = createNoise2D(rng)
  const wet = createNoise2D(rng)
  const macro = createNoise2D(rng)
  // "Water flows downhill, towards people": a gentle regional tilt toward the exit.
  const exitBearing = rng() * 360
  const ex = Math.sin((exitBearing * Math.PI) / 180)
  const ez = -Math.cos((exitBearing * Math.PI) / 180)
  const TILT = 0.012 // 12 m per km

  // Two or three ridges: long mountain chains crossing the valley, with noisy height along them.
  const ridgeCount = rng() < 0.5 ? 2 : 3
  const ridges = Array.from({ length: ridgeCount }, (_, i) => {
    const angle = rng() * Math.PI
    return {
      nx: -Math.sin(angle),
      nz: Math.cos(angle),
      // the first ridge passes near the start so the 3D scene has relief
      offset: (rng() - 0.5) * (i === 0 ? 600 : 3000),
      height: 55 + rng() * 40,
      width: 100 + rng() * 70,
    }
  })

  const rawHeight = (x: number, z: number) => {
    // Large-scale relief (kilometres) + rolling hills
    let h = 120 + 70 * fbm(macro, x / 1800, z / 1800, 3) + 35 * fbm(hills, x / 350, z / 350, 4)
    h -= TILT * (x * ex + z * ez)

    for (const r of ridges) {
      const d = x * r.nx + z * r.nz - r.offset
      const along = 0.65 + 0.35 * ridgeNoise(x / 220, z / 220)
      const sharp = 1 - Math.min(1, Math.abs(d) / (r.width * 1.8))
      h += r.height * along * (Math.exp(-((d / r.width) ** 2)) * 0.75 + sharp * sharp * 0.25)
    }

    // Valleys: broad U-shaped troughs along the zero-lines of a low-frequency noise
    const vt = Math.min(1, Math.abs(valleys(x / 450, z / 450)) / 0.35)
    h -= 22 * (1 - vt * vt * (3 - 2 * vt))

    // Small bumps
    h += 2.5 * detail(x / 35, z / 35)
    return h
  }

  // ---- river valleys: one long valley drains the land toward the exit (people live downstream),
  // one tributary valley joins it. Their floor only descends, so water always gets out. ----
  const valleysDesign = designValleys(rng, exitBearing, rawHeight)
  const baseHeight = (x: number, z: number) => carveValleys(valleysDesign, x, z, rawHeight(x, z))

  // ---- lakes: one chance per 1.5 km chunk, only on fairly flat ground, level = lowest point of the shore ----
  const lakeCache = new Map<number, Lake | null>()
  const lakeIn = (cx: number, cz: number): Lake | null => {
    const key = (cx + 1000) * 4000 + (cz + 1000)
    if (lakeCache.has(key)) return lakeCache.get(key)!
    const r = makeRng(seed, `lake:${cx}:${cz}`)
    let lake: Lake | null = null
    if (r() < 0.8) {
      const x = (cx + 0.15 + r() * 0.7) * LAKE_CHUNK
      const z = (cz + 0.15 + r() * 0.7) * LAKE_CHUNK
      const radius = 35 + r() * 85
      let lo = Infinity
      let hi = -Infinity
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2
        const h = baseHeight(x + Math.cos(a) * radius, z + Math.sin(a) * radius)
        lo = Math.min(lo, h)
        hi = Math.max(hi, h)
      }
      // not on a hillside, and never where you wake up
      if (hi - lo < 30 && Math.hypot(x, z) > radius + 100) lake = { x, z, radius, level: lo - 0.6 }
    }
    lakeCache.set(key, lake)
    return lake
  }
  const lakeAt = (x: number, z: number): Lake | null => {
    const cx = Math.floor(x / LAKE_CHUNK)
    const cz = Math.floor(z / LAKE_CHUNK)
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const l = lakeIn(cx + dx, cz + dz)
        if (l && (x - l.x) ** 2 + (z - l.z) ** 2 < (l.radius + SHORE) ** 2) return l
      }
    }
    return null
  }
  const bigLake = (x: number, z: number) => {
    const l = lakeAt(x, z)
    return l && (x - l.x) ** 2 + (z - l.z) ** 2 < l.radius * l.radius ? l.level : -Infinity
  }
  const lakeHeight = (x: number, z: number) => {
    const h = baseHeight(x, z)
    const l = lakeAt(x, z)
    if (!l) return h
    // bowl below the water, gentle shore rising out of it
    const dist = Math.hypot(x - l.x, z - l.z)
    const d = dist / l.radius
    const depth = Math.min(8, 2 + l.radius / 25)
    // inside: bowl; outside: shore rising 35 % up to SHORE metres out (enough to meet any terrain, no step)
    const bed = d < 1 ? l.level - depth * (1 - d * d) + 0.3 * d : l.level + (dist - l.radius) * 0.35
    return Math.min(h, bed)
  }
  const rivers = createRivers(seed, lakeHeight, bigLake)
  const lake = (x: number, z: number) => Math.max(bigLake(x, z), rivers.pond(x, z))
  const height = (x: number, z: number) => rivers.carve(x, z, lakeHeight(x, z))
  const ws = createWaterSample()
  const water = (x: number, z: number) => {
    const l = lake(x, z)
    return rivers.sample(x, z, ws) ? Math.max(l, ws.level) : l
  }
  const lakesNear = (x: number, z: number, radius: number) => {
    const out: Lake[] = []
    const span = Math.ceil(radius / LAKE_CHUNK) + 1
    const cx = Math.floor(x / LAKE_CHUNK)
    const cz = Math.floor(z / LAKE_CHUNK)
    for (let dz = -span; dz <= span; dz++) {
      for (let dx = -span; dx <= span; dx++) {
        const l = lakeIn(cx + dx, cz + dz)
        if (l && Math.hypot(l.x - x, l.z - z) < radius + l.radius) out.push(l)
      }
    }
    for (const p of rivers.ponds) if (Math.hypot(p.x - x, p.z - z) < radius + p.radius) out.push(p)
    return out
  }

  const moisture = (x: number, z: number) => {
    const m = 0.5 + 0.5 * fbm(wet, x / 260 + 40, z / 260 - 17, 3)
    // low ground is wetter
    const low = 1 - clamp01((height(x, z) - 40) / 220)
    return clamp01(m * 0.75 + low * low * 0.35)
  }

  const scrubNoise = createNoise2D(makeRng(seed, 'scrub'))
  // never right where you wake up (origin)
  const scrub = (x: number, z: number) => x * x + z * z > 300 * 300 && fbm(scrubNoise, x / 320, z / 320, 3) > 0.42

  return {
    height,
    moisture,
    scrub: (x, z) => scrub(x, z) && water(x, z) === -Infinity,
    exitBearing,
    water,
    lake,
    stream: rivers.sample,
    rivers,
    lakesNear,
  }
}

interface ValleyPath {
  x: number[]
  z: number[]
  floor: number[]
  buckets: Map<number, number[]>
}
const V_BUCKET = 250
const V_CORE = 220 // metres from the river line: valley shape
const V_REACH = 520 // natural terrain beyond this
const vkey = (bx: number, bz: number) => (bx + 1000) * 4096 + (bz + 1000)

function makeValleyPath(xs: number[], zs: number[], rawHeight: (x: number, z: number) => number, endFloor = Infinity): ValleyPath {
  const n = xs.length
  // floor: low points of the natural ground (±300 m window) a little under it, never rising downstream
  const g = xs.map((x, i) => rawHeight(x, zs[i]))
  const floor = g.map((_, i) => {
    let m = Infinity
    for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) m = Math.min(m, g[j])
    return m - 6
  })
  for (let i = 1; i < n; i++) floor[i] = Math.min(floor[i], floor[i - 1] - 0.15)
  if (endFloor < floor[n - 1]) {
    // a tributary meets the main floor: ease down to it over the last stretch
    const k = Math.max(1, Math.floor(n * 0.4))
    for (let i = n - k; i < n; i++) floor[i] = Math.min(floor[i], floor[i] + (endFloor - floor[i]) * ((i - (n - k)) / (k - 1 || 1)))
  }
  const buckets = new Map<number, number[]>()
  for (let i = 0; i < n - 1; i++) {
    const bx0 = Math.floor((Math.min(xs[i], xs[i + 1]) - V_REACH) / V_BUCKET)
    const bx1 = Math.floor((Math.max(xs[i], xs[i + 1]) + V_REACH) / V_BUCKET)
    const bz0 = Math.floor((Math.min(zs[i], zs[i + 1]) - V_REACH) / V_BUCKET)
    const bz1 = Math.floor((Math.max(zs[i], zs[i + 1]) + V_REACH) / V_BUCKET)
    for (let bz = bz0; bz <= bz1; bz++) for (let bx = bx0; bx <= bx1; bx++) {
      const k = vkey(bx, bz)
      let l = buckets.get(k)
      if (!l) buckets.set(k, (l = []))
      l.push(i)
    }
  }
  return { x: xs, z: zs, floor, buckets }
}

/** A meandering line from (ax, az) to (bx, bz), a node every 100 m. */
function meanderLine(rng: () => number, ax: number, az: number, bx: number, bz: number, amp: number) {
  const len = Math.hypot(bx - ax, bz - az)
  const n = Math.max(2, Math.round(len / 100))
  const px = -(bz - az) / len
  const pz = (bx - ax) / len
  const f1 = 0.8 + rng() * 1.2
  const f2 = 2 + rng() * 2
  const o1 = rng() * 6.3
  const o2 = rng() * 6.3
  const xs: number[] = []
  const zs: number[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const taper = Math.sin(Math.PI * t) ** 0.5
    const o = amp * taper * (Math.sin(t * f1 * Math.PI * 2 + o1) * 0.7 + Math.sin(t * f2 * Math.PI * 2 + o2) * 0.3)
    xs.push(ax + (bx - ax) * t + px * o)
    zs.push(az + (bz - az) * t + pz * o)
  }
  return [xs, zs]
}

function designValleys(rng: () => number, exitBearing: number, rawHeight: (x: number, z: number) => number): ValleyPath[] {
  const rad = (exitBearing * Math.PI) / 180
  const ex = Math.sin(rad)
  const ez = -Math.cos(rad)
  // main river: from beyond the far side of the map to beyond the exit side, passing 0.5–1 km beside the start
  const px = -ez
  const pz = ex
  const R = 7000
  let off = 0
  let mx: number[] = []
  let mz: number[] = []
  for (let k = 0; k < 8; k++) {
    off = (rng() < 0.5 ? -1 : 1) * (550 + rng() * 450) // within the 3 km world (redesign §7)
    ;[mx, mz] = meanderLine(rng, -ex * R + px * off * 0.6, -ez * R + pz * off * 0.6, ex * R + px * off, ez * R + pz * off, 700)
    if (Math.min(...mx.map((x, i) => Math.hypot(x, mz[i]))) > V_CORE + 300) break
  }
  const main = makeValleyPath(mx, mz, rawHeight)
  // tributary: from the other side of the start, joining the main river downstream of it (never through the start)
  let tx: number[] = []
  let tz: number[] = []
  let j = 0
  for (let k = 0; k < 8; k++) {
    j = Math.floor(mx.length * (0.55 + rng() * 0.2))
    const sx = -px * off * (2 + rng()) + ex * (rng() - 0.3) * 3000
    const sz = -pz * off * (2 + rng()) + ez * (rng() - 0.3) * 3000
    ;[tx, tz] = meanderLine(rng, sx, sz, mx[j], mz[j], 450)
    if (Math.min(...tx.map((x, i) => Math.hypot(x, tz[i]))) > V_CORE + 300) break
  }
  const trib = makeValleyPath(tx, tz, rawHeight, main.floor[j])
  return [main, trib]
}

function carveValleys(paths: ValleyPath[], x: number, z: number, h: number): number {
  for (const p of paths) {
    const list = p.buckets.get(vkey(Math.floor(x / V_BUCKET), Math.floor(z / V_BUCKET)))
    if (!list) continue
    let best = Infinity
    let fl = 0
    for (const i of list) {
      const ax = p.x[i]
      const az = p.z[i]
      const sx = p.x[i + 1] - ax
      const sz = p.z[i + 1] - az
      const t = clamp01(((x - ax) * sx + (z - az) * sz) / (sx * sx + sz * sz))
      const d = Math.hypot(x - ax - sx * t, z - az - sz * t)
      if (d < best) {
        best = d
        fl = p.floor[i] + (p.floor[i + 1] - p.floor[i]) * t
      }
    }
    if (best >= V_REACH) continue
    // a wide flat floor, then U-shaped sides; blends into the natural land (raises basins, cuts ridges)
    const e = Math.max(0, best - 70)
    const shape = fl + e * 0.08 + e * e * 0.0012
    const w = best < V_CORE ? 0 : ((best - V_CORE) / (V_REACH - V_CORE)) ** 2 * (3 - 2 * ((best - V_CORE) / (V_REACH - V_CORE)))
    h = Math.min(h, shape) * w + shape * (1 - w)
  }
  return h
}

/** Sample `field` over a `size` × `size` square centred on world (centerX, centerZ). */
export function sampleTerrain(field: HeightField, size: number, segments: number, centerX = 0, centerZ = 0): Terrain {
  const n = segments + 1
  const cell = size / segments
  const heights = new Float32Array(n * n)
  const moisture = new Float32Array(n * n)
  let min = Infinity
  let max = -Infinity
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const x = ix * cell - size / 2
      const z = iz * cell - size / 2
      const h = field.height(x + centerX, z + centerZ)
      heights[iz * n + ix] = h
      moisture[iz * n + ix] = field.moisture(x + centerX, z + centerZ)
      if (h < min) min = h
      if (h > max) max = h
    }
  }
  return { size, centerX, centerZ, segments, heights, moisture, minHeight: min, maxHeight: max }
}

/**
 * Snap a world position to the 3D tile vertex grid, so overlapping tiles share the same vertices
 * (same heights, same slopes → same trees at the same spot).
 */
export function snapToTileGrid(v: number): number {
  const cell = TERRAIN_SIZE / TERRAIN_SEGMENTS
  return Math.round(v / cell) * cell
}

/** The whole level's 3D terrain (centred on the start, which is the world origin). */
export function sampleWorld(field: HeightField): Terrain {
  return sampleTerrain(field, WORLD_SIZE, WORLD_SEGMENTS, 0, 0)
}

/** Typical world height range (all seeds): used so the same spot looks the same in every tile. */
const WORLD_LOW = 30
const WORLD_HIGH = 290

/** Height normalised to the world: 0 = valley floors, 1 = highest peaks. */
export function worldRel(y: number): number {
  return clamp01((y - WORLD_LOW) / (WORLD_HIGH - WORLD_LOW))
}

/**
 * Height at world (x, z), interpolated on the same triangles as the mesh and the
 * Rapier heightfield: each cell is split along the (ix+1, iz)–(ix, iz+1) diagonal
 * (verified with a Rapier ray cast).
 */
export function heightAt(t: Terrain, x: number, z: number): number {
  const n = t.segments + 1
  const cell = t.size / t.segments
  const fx = Math.min(Math.max((x + t.size / 2) / cell, 0), t.segments - 1e-6)
  const fz = Math.min(Math.max((z + t.size / 2) / cell, 0), t.segments - 1e-6)
  const ix = Math.floor(fx)
  const iz = Math.floor(fz)
  const tx = fx - ix
  const tz = fz - iz
  const h00 = t.heights[iz * n + ix]
  const h10 = t.heights[iz * n + ix + 1]
  const h01 = t.heights[(iz + 1) * n + ix]
  const h11 = t.heights[(iz + 1) * n + ix + 1]
  return tx + tz <= 1
    ? h00 + (h10 - h00) * tx + (h01 - h00) * tz
    : h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz)
}

/** Nearest-vertex moisture at world (x, z). */
export function moistureAt(t: Terrain, x: number, z: number): number {
  const n = t.segments + 1
  const cell = t.size / t.segments
  const ix = Math.min(Math.max(Math.round((x + t.size / 2) / cell), 0), t.segments)
  const iz = Math.min(Math.max(Math.round((z + t.size / 2) / cell), 0), t.segments)
  return t.moisture[iz * n + ix]
}

/** Slope at world (x, z) as rise/run (0 = flat, 1 = 45°). */
export function slopeAt(t: Terrain, x: number, z: number): number {
  const e = t.size / t.segments
  const dx = (heightAt(t, x + e, z) - heightAt(t, x - e, z)) / (2 * e)
  const dz = (heightAt(t, x, z + e) - heightAt(t, x, z - e)) / (2 * e)
  return Math.sqrt(dx * dx + dz * dz)
}
