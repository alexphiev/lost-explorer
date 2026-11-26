import { createNoise2D } from 'simplex-noise'
import { makeRng } from './rng'

export const TERRAIN_SIZE = 1000 // 3D scene: metres, centred on the origin: x,z ∈ [-500, 500]
export const TERRAIN_SEGMENTS = 256 // cells per side (~3.9 m)

/** Continuous, deterministic world: same seed → same height at any (x, z), in metres. */
export interface HeightField {
  height(x: number, z: number): number
  /** 0..1: dry (golden grass) → wet (moss, dense forest, scrub). */
  moisture(x: number, z: number): number
  /** Thick, impassable scrub: scattered patches (~5% of the land), independent of height. */
  scrub(x: number, z: number): boolean
  /** Bearing (degrees clockwise from north) the whole land slowly drains toward: where people live. */
  exitBearing: number
}

/** A sampled square of the height field, centred on the origin. */
export interface Terrain {
  size: number
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

  const height = (x: number, z: number) => {
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

  const moisture = (x: number, z: number) => {
    const m = 0.5 + 0.5 * fbm(wet, x / 260 + 40, z / 260 - 17, 3)
    // low ground is wetter
    const low = 1 - clamp01((height(x, z) - 40) / 220)
    return clamp01(m * 0.75 + low * low * 0.35)
  }

  const scrubNoise = createNoise2D(makeRng(seed, 'scrub'))
  // never right where you wake up (origin)
  const scrub = (x: number, z: number) => x * x + z * z > 300 * 300 && fbm(scrubNoise, x / 320, z / 320, 3) > 0.42

  return { height, moisture, scrub, exitBearing }
}

/** Sample `field` over a `size` × `size` square centred on the origin. */
export function sampleTerrain(field: HeightField, size: number, segments: number): Terrain {
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
      const h = field.height(x, z)
      heights[iz * n + ix] = h
      moisture[iz * n + ix] = field.moisture(x, z)
      if (h < min) min = h
      if (h > max) max = h
    }
  }
  return { size, segments, heights, moisture, minHeight: min, maxHeight: max }
}

/** The 1 km 3D scene around the origin. */
export function generateTerrain(seed: string): Terrain {
  return sampleTerrain(createHeightField(seed), TERRAIN_SIZE, TERRAIN_SEGMENTS)
}

/** Height normalised to the sampled square: 0 = lowest, 1 = highest. */
export function relHeight(t: Terrain, y: number): number {
  return (y - t.minHeight) / (t.maxHeight - t.minHeight || 1)
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
