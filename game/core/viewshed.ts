import { heightAt, type Terrain } from './terrain'

/** Fog of war: one byte per map vertex (same layout as Terrain.heights). */
export const FOG_UNSEEN = 0
export const FOG_FAR = 1
export const FOG_NEAR = 2

export function createFog(t: Terrain): Uint8Array {
  return new Uint8Array((t.segments + 1) ** 2)
}

function mark(t: Terrain, fog: Uint8Array, x: number, z: number, value: number) {
  const n = t.segments + 1
  const cell = t.size / t.segments
  const ix = Math.round((x + t.size / 2) / cell)
  const iz = Math.round((z + t.size / 2) / cell)
  if (ix < 0 || iz < 0 || ix > t.segments || iz > t.segments) return
  const i = iz * n + ix
  if (fog[i] < value) fog[i] = value
}

/**
 * Line-of-sight reveal from an eye `eyeHeight` metres above the ground at (x, z).
 * Cells closer than `nearRatio` × radius become NEAR (sharp), the rest FAR (vague).
 */
export function revealViewshed(t: Terrain, fog: Uint8Array, x: number, z: number, eyeHeight: number, radius: number, nearRatio = 0.35) {
  const cell = t.size / t.segments
  const eye = heightAt(t, x, z) + eyeHeight
  const rays = 720
  for (let r = 0; r < rays; r++) {
    const a = (r / rays) * Math.PI * 2
    const dx = Math.sin(a)
    const dz = -Math.cos(a)
    let maxTan = -Infinity
    for (let d = cell * 0.5; d <= radius; d += cell * 0.5) {
      const px = x + dx * d
      const pz = z + dz * d
      if (Math.abs(px) > t.size / 2 || Math.abs(pz) > t.size / 2) break
      const tan = (heightAt(t, px, pz) - eye) / d
      if (tan >= maxTan) mark(t, fog, px, pz, d < radius * nearRatio ? FOG_NEAR : FOG_FAR)
      // a little tolerance so slopes just behind a crest stay hidden but the crest itself shows
      if (tan > maxTan) maxTan = tan
    }
  }
}

/** Small sharp reveal around the walker (no line of sight). */
export function revealAround(t: Terrain, fog: Uint8Array, x: number, z: number, radius: number) {
  const cell = t.size / t.segments
  for (let oz = -radius; oz <= radius; oz += cell) {
    for (let ox = -radius; ox <= radius; ox += cell) {
      if (ox * ox + oz * oz <= radius * radius) mark(t, fog, x + ox, z + oz, FOG_NEAR)
    }
  }
}

export function fogAt(t: Terrain, fog: Uint8Array, x: number, z: number): number {
  const n = t.segments + 1
  const cell = t.size / t.segments
  const ix = Math.min(Math.max(Math.round((x + t.size / 2) / cell), 0), t.segments)
  const iz = Math.min(Math.max(Math.round((z + t.size / 2) / cell), 0), t.segments)
  return fog[iz * n + ix]
}
