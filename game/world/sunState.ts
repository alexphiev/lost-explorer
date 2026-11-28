// Pure day cycle: game hour (0..24) -> sun/moon light, hemisphere, haze. Colours are sRGB 0..1.

export interface SunState {
  /** Direction toward the light (sun by day, blends to moon at night), normalised. */
  dirX: number
  dirY: number
  dirZ: number
  /** True sun direction (may be below the horizon), normalised. */
  sunX: number
  sunY: number
  sunZ: number
  sunR: number
  sunG: number
  sunB: number
  sunIntensity: number
  skyR: number
  skyG: number
  skyB: number
  groundR: number
  groundG: number
  groundB: number
  hemiIntensity: number
  hazeCoolR: number
  hazeCoolG: number
  hazeCoolB: number
  hazeWarmR: number
  hazeWarmG: number
  hazeWarmB: number
  /** 0 = day, 1 = full night. */
  night: number
}

export function createSunState(): SunState {
  return {
    dirX: 0, dirY: 1, dirZ: 0, sunX: 0, sunY: 1, sunZ: 0,
    sunR: 1, sunG: 1, sunB: 1, sunIntensity: 0,
    skyR: 0, skyG: 0, skyB: 0, groundR: 0, groundG: 0, groundB: 0, hemiIntensity: 0,
    hazeCoolR: 0, hazeCoolG: 0, hazeCoolB: 0, hazeWarmR: 0, hazeWarmG: 0, hazeWarmB: 0,
    night: 0,
  }
}

const SOLAR_NOON = 13.25
const HALF_DAY = 6.75 // sunrise 06:30, sunset 20:00
const SIN_MAX = Math.sin((55 * Math.PI) / 180)
const COS_MAX = Math.cos((55 * Math.PI) / 180)
// Moon: fixed, high in the south-west (normalised)
const MOON_LEN = Math.hypot(-0.5, 0.7, 0.5)
const MOON_X = -0.5 / MOON_LEN
const MOON_Y = 0.7 / MOON_LEN
const MOON_Z = 0.5 / MOON_LEN
const MOON_INTENSITY = 0.25

function hex(c: number, i: 0 | 1 | 2) {
  return ((c >> (16 - i * 8)) & 255) / 255
}

// hour, sun colour, sun intensity, hemi sky, hemi ground, hemi intensity, haze cool, haze warm
type Key = [number, number, number, number, number, number, number, number]
const KEYS: Key[] = [
  [0, 0x9bb4ff, 0.25, 0x1c2a4a, 0x10141f, 0.35, 0x070b14, 0x0b0e18],
  [5, 0x9bb4ff, 0.25, 0x1c2a4a, 0x10141f, 0.35, 0x070b14, 0x0b0e18],
  [6, 0xb09ac8, 0.6, 0x4a5a8a, 0x2a2a38, 0.7, 0x1e2440, 0x3a2e44], // pre-dawn blue
  [6.5, 0xff9a6a, 1.4, 0xc9b0c4, 0x6a5555, 1.2, 0xc0a8b8, 0xffb08a], // dawn pink/orange
  [7.5, 0xffd9a0, 2.2, 0xbcd0e6, 0x7a6a50, 1.5, 0xc3d0dc, 0xf6d6a8], // soft gold
  [10, 0xffe6bf, 2.7, 0xb4cbe3, 0x7a6545, 1.7, 0xb7c8d8, 0xf3dcb4],
  [13.25, 0xfff3e0, 3.2, 0xb4cbe3, 0x7a6545, 1.8, 0xb4c8dc, 0xf6e4c4], // midday
  [16.5, 0xffe0b0, 3.0, 0xb4cbe3, 0x7a6545, 1.75, 0xb7c8d8, 0xf3d6a8],
  [17.75, 0xffd29a, 2.8, 0xb4cbe3, 0x7a6545, 1.7, 0xb7c8d8, 0xf3cf9e], // golden (original look)
  [19.3, 0xff8a4a, 1.9, 0xa8a0c0, 0x6a4a45, 1.2, 0x9a98b4, 0xffa070], // sunset
  [20, 0xff6a3a, 1.2, 0x8a82b0, 0x5a4048, 1.0, 0x4a4866, 0x9a5a48],
  [20.7, 0x8a8fd0, 0.5, 0x4a5a8a, 0x2a2a38, 0.7, 0x121a2e, 0x1e1a2c], // blue hour: the far hills go dark with the sky
  [21.7, 0x9bb4ff, 0.25, 0x1c2a4a, 0x10141f, 0.35, 0x070b14, 0x0b0e18],
  [24, 0x9bb4ff, 0.25, 0x1c2a4a, 0x10141f, 0.35, 0x070b14, 0x0b0e18],
]

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function sunState(hour: number, out: SunState): SunState {
  const h = ((hour % 24) + 24) % 24

  // True sun position
  const delta = ((h - SOLAR_NOON + 36) % 24) - 12
  const H = (delta / HALF_DAY) * (Math.PI / 2)
  const cosH = Math.cos(H)
  out.sunX = -Math.sin(H)
  out.sunY = cosH * SIN_MAX
  out.sunZ = cosH * COS_MAX

  // Keyframe segment
  let i = 0
  while (i < KEYS.length - 2 && h >= KEYS[i + 1][0]) i++
  const a = KEYS[i]
  const b = KEYS[i + 1]
  const t = smooth(0, 1, (h - a[0]) / (b[0] - a[0]))
  const L = (x: number, y: number) => x + (y - x) * t
  const C = (k: 1 | 3 | 4 | 6 | 7, c: 0 | 1 | 2) => L(hex(a[k], c), hex(b[k], c))

  // Sun/moon crossfade by sun elevation
  const ws = smooth(-0.02, 0.1, out.sunY)
  const keyI = L(a[2], b[2])
  out.sunIntensity = keyI * ws + MOON_INTENSITY * (1 - ws)
  const moonR = hex(0x9bb4ff, 0)
  const moonG = hex(0x9bb4ff, 1)
  const moonB = hex(0x9bb4ff, 2)
  out.sunR = C(1, 0) * ws + moonR * (1 - ws)
  out.sunG = C(1, 1) * ws + moonG * (1 - ws)
  out.sunB = C(1, 2) * ws + moonB * (1 - ws)

  const dx = out.sunX * ws + MOON_X * (1 - ws)
  const dy = out.sunY * ws + MOON_Y * (1 - ws)
  const dz = out.sunZ * ws + MOON_Z * (1 - ws)
  const len = Math.hypot(dx, dy, dz) || 1
  out.dirX = dx / len
  out.dirY = dy / len
  out.dirZ = dz / len

  out.skyR = C(3, 0)
  out.skyG = C(3, 1)
  out.skyB = C(3, 2)
  out.groundR = L(hex(a[4], 0), hex(b[4], 0))
  out.groundG = L(hex(a[4], 1), hex(b[4], 1))
  out.groundB = L(hex(a[4], 2), hex(b[4], 2))
  out.hemiIntensity = L(a[5], b[5])
  out.hazeCoolR = C(6, 0)
  out.hazeCoolG = C(6, 1)
  out.hazeCoolB = C(6, 2)
  out.hazeWarmR = C(7, 0)
  out.hazeWarmG = C(7, 1)
  out.hazeWarmB = C(7, 2)
  out.night = 1 - smooth(-0.18, 0.02, out.sunY)
  return out
}
