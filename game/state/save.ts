import type { RunState } from '@/game/core/travel'
import type { Point } from '@/game/core/valley'

/**
 * Local save (browser localStorage, no account): unlocked levels, best times, and the run in progress per valley.
 * localStorage rather than a cookie: the fog of war alone is ~22 KB, cookies cap at 4 KB.
 */
const PROGRESS_KEY = 'bearing:progress:v1'
// v2: the 3 km on-foot world (redesign); v1 runs were on the old 12 km map and are not resumed
const runKey = (seed: string) => `bearing:run:v2:${seed}`

export interface Best {
  /** real play time */
  seconds: number
  /** in-game hours used */
  hours: number
}

export interface Progress {
  /** highest unlocked level id */
  unlocked: number
  best: Record<number, Best>
}

export interface SavedRun {
  level: number | null
  seed: string
  run: RunState
  bearing: number | null
  seconds: number
  layer: 'map' | 'scene'
  sceneCenter: Point | null
  savedAt: number
}

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage full or blocked: the game keeps running unsaved
  }
}

export function loadProgress(): Progress {
  const p = read<Progress>(PROGRESS_KEY)
  return { unlocked: Math.max(1, p?.unlocked ?? 1), best: p?.best ?? {} }
}

/** fog values are 0..2: four cells per byte, base64 */
function packFog(fog: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(fog.length / 4))
  for (let i = 0; i < fog.length; i++) bytes[i >> 2] |= (fog[i] & 3) << ((i & 3) * 2)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 4096) bin += String.fromCharCode(...bytes.subarray(i, i + 4096))
  return btoa(bin)
}

function unpackFog(s: string, length: number): Uint8Array {
  const bin = atob(s)
  const fog = new Uint8Array(length)
  for (let i = 0; i < length; i++) fog[i] = (bin.charCodeAt(i >> 2) >> ((i & 3) * 2)) & 3
  return fog
}

export function saveRun(r: SavedRun) {
  const run = { ...r.run, fog: packFog(r.run.fog), log: r.run.log.slice(-30) }
  write(runKey(r.seed), { ...r, run })
}

export function loadRun(seed: string, fogLength: number): SavedRun | null {
  const r = read<SavedRun & { run: RunState & { fog: string } }>(runKey(seed))
  if (!r || r.run.status !== 'playing') return null
  try {
    return { ...r, run: { ...r.run, marks: r.run.marks ?? [], found: r.run.found ?? [], fog: unpackFog(r.run.fog, fogLength) } }
  } catch {
    return null
  }
}

/** Light check for the menu: is there a run in progress for this valley? */
export function savedRunInfo(seed: string): { day: number; seconds: number } | null {
  const r = read<SavedRun>(runKey(seed))
  return r && r.run.status === 'playing' ? { day: r.run.day, seconds: r.seconds } : null
}

export function clearRun(seed: string) {
  try {
    window.localStorage.removeItem(runKey(seed))
  } catch {}
}

/** A level was won: unlock the next one, keep the best time. Returns the previous best. */
export function recordWin(level: number, result: Best): { previous: Best | null; progress: Progress } {
  const p = loadProgress()
  const previous = p.best[level] ?? null
  if (!previous || result.seconds < previous.seconds) p.best[level] = result
  p.unlocked = Math.max(p.unlocked, level + 1)
  write(PROGRESS_KEY, p)
  return { previous, progress: p }
}

export function formatDuration(seconds: number): string {
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
