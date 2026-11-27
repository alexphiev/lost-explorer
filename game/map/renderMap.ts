import { FOG_FAR, FOG_UNSEEN } from '@/game/core/viewshed'
import { isScrub, type Valley } from '@/game/core/valley'

type RGB = [number, number, number]
const hex = (h: number): RGB => [(h >> 16) & 255, (h >> 8) & 255, h & 255]
const WET = hex(0x8fae6a)
const DRY = hex(0xc8b878)
const FOREST = hex(0x6f8f55)
const HIGH = hex(0xb9ad8c)
const PEAK = hex(0xd8d0bc)
const SCRUB = hex(0x556b3a)
const PARCHMENT = hex(0xe9dfc6)
const WATER = hex(0x6d9bb0)
const SHORE = hex(0x8fb7c4)
const WATER_LINE = hex(0x4f7d92)
const STREAM = hex(0x5a8ca6)

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

function baseColor(rel: number, moist: number, scrub: boolean): RGB {
  if (scrub) return SCRUB
  if (rel > 0.85) return PEAK
  if (rel > 0.65) return HIGH
  if (rel > 0.35) return mix(FOREST, HIGH, (rel - 0.35) / 0.3 * 0.4)
  return mix(DRY, WET, clamp01(moist))
}

/** Explorer's sketch map: one pixel per map vertex. */
export function renderMap(valley: Valley, fog: Uint8Array, out: ImageData) {
  const t = valley.map
  const n = t.segments + 1
  const cell = t.size / t.segments
  const h = t.heights
  const data = out.data
  const range = t.maxHeight - t.minHeight || 1
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix
      const p = i * 4
      const f = fog[i]
      if (f === FOG_UNSEEN) {
        // deterministic grain
        const g = (((ix * 73856093) ^ (iz * 19349663)) >>> 0) % 100
        const k = 1 + (g - 50) * 0.0006
        data[p] = PARCHMENT[0] * k
        data[p + 1] = PARCHMENT[1] * k
        data[p + 2] = PARCHMENT[2] * k
        data[p + 3] = 255
        continue
      }
      const hh = h[i]
      const x = -t.size / 2 + ix * cell
      const z = -t.size / 2 + iz * cell
      const isWater = valley.field.water(x, z) > hh
      let c: RGB
      if (isWater) {
        const dry = (ox: number, oz: number) => valley.field.water(x + ox * cell, z + oz * cell) <= h[Math.min(Math.max(iz + oz, 0), n - 1) * n + Math.min(Math.max(ix + ox, 0), n - 1)]
        const shore = dry(1, 0) || dry(-1, 0) || dry(0, 1) || dry(0, -1)
        c = shore ? SHORE : iz % 6 === 0 && (ix + iz * 7) % 11 < 8 ? WATER_LINE : WATER
        if (f === FOG_FAR) {
          const gray = (c[0] + c[1] + c[2]) / 3
          c = mix(mix(c, [gray, gray, gray], 0.3), PARCHMENT, 0.55)
        }
        data[p] = c[0]
        data[p + 1] = c[1]
        data[p + 2] = c[2]
        data[p + 3] = 255
        continue
      }
      c = baseColor((hh - t.minHeight) / range, t.moisture[i], isScrub(valley.field, x, z))
      // hillshade from the north-west
      const hl = h[iz * n + Math.max(ix - 1, 0)]
      const hr = h[iz * n + Math.min(ix + 1, n - 1)]
      const hu = h[Math.max(iz - 1, 0) * n + ix]
      const hd = h[Math.min(iz + 1, n - 1) * n + ix]
      const dx = ((hr - hl) / (2 * cell)) * 2
      const dz = ((hd - hu) / (2 * cell)) * 2
      const len = Math.hypot(dx, dz, 1)
      const dot = (-dx * -0.6 + -dz * -0.6 + 1 * 0.55) / len // light from NW (towards -x,-z)
      let shade = 0.6 + clamp01((dot + 0.2) / 1.3) * 0.55
      // contours
      const band = Math.floor(hh / 25)
      const br = ix + 1 < n ? Math.floor(h[i + 1] / 25) : band
      const bd = iz + 1 < n ? Math.floor(h[i + n] / 25) : band
      if (band !== br || band !== bd) {
        const major = Math.floor(hh / 100) !== Math.floor((ix + 1 < n ? h[i + 1] : hh) / 100) || Math.floor(hh / 100) !== Math.floor((iz + 1 < n ? h[i + n] : hh) / 100)
        shade *= major ? 0.65 : 0.78
      }
      c = [c[0] * shade, c[1] * shade, c[2] * shade]
      if (f === FOG_FAR) {
        const gray = (c[0] + c[1] + c[2]) / 3
        c = mix(mix(c, [gray, gray, gray], 0.3), PARCHMENT, 0.55)
      }
      data[p] = c[0]
      data[p + 1] = c[1]
      data[p + 2] = c[2]
      data[p + 3] = 255
    }
  }

  // streams and rivers: blue ink lines over the revealed land (rivers drawn thicker)
  const ink = (ix: number, iz: number, col: RGB) => {
    if (ix < 0 || iz < 0 || ix >= n || iz >= n) return
    const i = iz * n + ix
    const f = fog[i]
    if (f === FOG_UNSEEN) return
    const c = f === FOG_FAR ? mix(col, PARCHMENT, 0.5) : col
    const p = i * 4
    data[p] = c[0]
    data[p + 1] = c[1]
    data[p + 2] = c[2]
  }
  for (const r of valley.field.rivers.reaches) {
    for (let k = 0; k < r.n - 1; k++) {
      if (!r.wet[k]) continue
      const big = r.halfW[k] >= 8
      const col = big ? WATER : STREAM
      const steps = Math.ceil(Math.hypot(r.x[k + 1] - r.x[k], r.z[k + 1] - r.z[k]) / (cell / 3))
      for (let j = 0; j < steps; j++) {
        const x = r.x[k] + ((r.x[k + 1] - r.x[k]) * j) / steps
        const z = r.z[k] + ((r.z[k + 1] - r.z[k]) * j) / steps
        const ix = Math.round((x + t.size / 2) / cell)
        const iz = Math.round((z + t.size / 2) / cell)
        ink(ix, iz, col)
        if (big) {
          ink(ix + 1, iz, col)
          ink(ix, iz + 1, col)
        }
      }
    }
  }
}
