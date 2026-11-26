import { createNoise2D } from 'simplex-noise'
import { makeRng } from './rng'

export const TERRAIN_SIZE = 1000 // metres, centred on the origin: x,z ∈ [-500, 500]
export const TERRAIN_SEGMENTS = 256 // cells per side (~3.9 m)

export interface Terrain {
  size: number
  segments: number
  /** (segments+1)² heights, row-major: index = iz * (segments+1) + ix */
  heights: Float32Array
  /** Same layout as heights, 0..1: dry (golden grass) → wet (moss, dense forest). */
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

export function generateTerrain(seed: string): Terrain {
  const rng = makeRng(seed, 'terrain')
  const hills = createNoise2D(rng)
  const valleys = createNoise2D(rng)
  const ridgeNoise = createNoise2D(rng)
  const detail = createNoise2D(rng)
  const wet = createNoise2D(rng)

  // One or two ridges: lines crossing the map, with noisy height along them.
  const ridgeCount = rng() < 0.5 ? 1 : 2
  const ridges = Array.from({ length: ridgeCount }, () => {
    const angle = rng() * Math.PI
    return {
      nx: -Math.sin(angle),
      nz: Math.cos(angle),
      offset: (rng() - 0.5) * 600,
      height: 55 + rng() * 40,
      width: 100 + rng() * 70,
    }
  })

  const n = TERRAIN_SEGMENTS + 1
  const cell = TERRAIN_SIZE / TERRAIN_SEGMENTS
  const heights = new Float32Array(n * n)
  const moisture = new Float32Array(n * n)
  let min = Infinity
  let max = -Infinity

  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const x = ix * cell - TERRAIN_SIZE / 2
      const z = iz * cell - TERRAIN_SIZE / 2

      // Rolling hills
      let h = 35 * fbm(hills, x / 350, z / 350, 4)

      // Ridges
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

      heights[iz * n + ix] = h
      moisture[iz * n + ix] = 0.5 + 0.5 * fbm(wet, x / 260 + 40, z / 260 - 17, 3)
      if (h < min) min = h
      if (h > max) max = h
    }
  }

  for (let i = 0; i < heights.length; i++) {
    heights[i] -= min
    // valleys are wetter
    const low = 1 - heights[i] / (max - min)
    moisture[i] = Math.min(1, Math.max(0, moisture[i] * 0.75 + low * low * 0.35))
  }
  return { size: TERRAIN_SIZE, segments: TERRAIN_SEGMENTS, heights, moisture, minHeight: 0, maxHeight: max - min }
}

/** Bilinear height at world (x, z). */
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
  return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz
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
