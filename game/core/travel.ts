import { makeRng } from './rng'
import { heightAt, slopeAt } from './terrain'
import { isScrub, MAX_DOWNHILL, MAX_UPHILL, type Valley } from './valley'
import { createFog, revealAround, revealViewshed } from './viewshed'

export const DAYS_ALLOWED = 3
export const DAY_START = 7 // hour the sun rises
export const NIGHTFALL = 20 // hour walking stops
const CHUNK_HOURS = 2
const STEP = 15 // metres per simulation step
const WALK_SPEED = 2 // km/h off-trail on flat open ground
const VILLAGE_RADIUS = 120

export type StopKind =
  | 'start'
  | 'chunk' // 2 h walked, nothing special
  | 'night'
  | 'exhausted'
  | 'cliff'
  | 'drop'
  | 'scrub'
  | 'lake'
  | 'edge'
  | 'berries'
  | 'smoke'
  | 'village'
  | 'climb'
  | 'explore'
  | 'rest'
  | 'sleep'
  | 'refused'
  | 'lost'

export interface Stop {
  kind: StopKind
  message: string
}

export interface RunState {
  day: number // 1-based
  hour: number // 0..24, fractional
  energy: number // 0..100
  x: number
  z: number
  /** Fog of war, see viewshed.ts. Mutated in place by the actions (the array is shared between states). */
  fog: Uint8Array
  /** Walked path as flat [x0, z0, x1, z1, …] */
  path: number[]
  status: 'playing' | 'won' | 'lost'
  smelledSmoke: boolean
  /** counts random rolls so events stay deterministic for a seed + action sequence */
  rolls: number
  log: Stop[]
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']

/** Bearing in degrees, clockwise from north (north = -z on the map). */
export function bearingTo(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return ((Math.atan2(toX - fromX, -(toZ - fromZ)) * 180) / Math.PI + 360) % 360
}

export function compassName(bearing: number): string {
  return COMPASS[Math.round(bearing / 45) % 8]
}

export function formatHour(hour: number): string {
  const h = Math.floor(hour)
  const m = Math.floor((hour - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const isNight = (hour: number) => hour >= NIGHTFALL || hour < DAY_START

function withStop(s: RunState, stop: Stop): { state: RunState; stop: Stop } {
  return { state: { ...s, log: [...s.log, stop] }, stop }
}

export function newRun(v: Valley): RunState {
  const fog = createFog(v.map)
  // looking around from where you woke up
  revealViewshed(v.map, fog, v.start.x, v.start.z, 4, 1200)
  revealAround(v.map, fog, v.start.x, v.start.z, 120)
  return {
    day: 1,
    hour: 8,
    energy: 100,
    x: v.start.x,
    z: v.start.z,
    fog,
    path: [v.start.x, v.start.z],
    status: 'playing',
    smelledSmoke: false,
    rolls: 0,
    log: [{ kind: 'start', message: `Day 1, 08:00. You wake up lost. Reach the village within ${DAYS_ALLOWED} days.` }],
  }
}

/** Walk along `bearing` for up to 2 hours, until something stops you. */
export function walk(v: Valley, s: RunState, bearing: number): { state: RunState; stop: Stop } {
  if (s.status !== 'playing') return { state: s, stop: { kind: 'refused', message: 'The journey is over.' } }
  if (isNight(s.hour)) return withStop(s, { kind: 'refused', message: 'It is too dark to walk. Rest until morning.' })
  if (s.energy < 5) return withStop(s, { kind: 'refused', message: 'You are too tired to walk. Rest first.' })

  const rad = (bearing * Math.PI) / 180
  const dx = Math.sin(rad)
  const dz = -Math.cos(rad)
  const half = v.map.size / 2
  let { x, z, hour, energy, smelledSmoke, rolls } = s
  const path = [...s.path]
  let elapsed = 0
  let stop: Stop | null = null
  const dir = compassName(bearing)

  for (let i = 0; !stop; i++) {
    const nx = x + dx * STEP
    const nz = z + dz * STEP
    if (Math.abs(nx) > half - STEP || Math.abs(nz) > half - STEP) {
      stop = { kind: 'edge', message: 'You reach the edge of the valley. No way through here.' }
      break
    }
    const h0 = heightAt(v.map, x, z)
    const h1 = heightAt(v.map, nx, nz)
    const grade = (h1 - h0) / STEP
    if (grade > MAX_UPHILL) {
      stop = { kind: 'cliff', message: `A cliff rises to the ${dir}. You can't climb it from here.` }
      break
    }
    if (grade < -MAX_DOWNHILL) {
      stop = { kind: 'drop', message: `The ground drops away sharply to the ${dir}. Too dangerous.` }
      break
    }
    if (h1 < v.field.water(nx, nz) - 0.3) {
      stop = { kind: 'lake', message: `A lake blocks the way ${dir}. Go around, or explore on foot and swim across.` }
      break
    }
    if (isScrub(v.field, nx, nz)) {
      stop = { kind: 'scrub', message: `Thick, thorny scrub blocks the way ${dir}.` }
      break
    }

    // slower uphill, a bit slower steeply downhill, slower on rough slopes
    const slowdown = grade > 0 ? 1 + grade * 6 : 1 + -grade * 1.5
    const rough = 1 + slopeAt(v.map, nx, nz) * 0.8
    const dt = STEP / 1000 / (WALK_SPEED / (slowdown * rough))
    x = nx
    z = nz
    hour += dt
    elapsed += dt
    energy -= dt * (6 + Math.max(0, grade) * 35)
    if (i % 3 === 0) {
      path.push(x, z)
      revealAround(v.map, s.fog, x, z, 120)
    }

    if (Math.hypot(x - v.village.x, z - v.village.z) < VILLAGE_RADIUS) {
      stop = { kind: 'village', message: 'Rooftops, a barking dog, a road. You made it to the village!' }
      break
    }
    if (energy <= 0) {
      energy = 0
      stop = { kind: 'exhausted', message: 'Your legs give way. You need to rest.' }
      break
    }
    if (hour >= NIGHTFALL) {
      stop = { kind: 'night', message: 'The light fades. You stop for the night.' }
      break
    }

    // chance events, one roll per step
    rolls++
    const roll = makeRng(v.seed, `event:${rolls}`)()
    const distVillage = Math.hypot(x - v.village.x, z - v.village.z)
    if (!smelledSmoke && distVillage < 3500 && roll < 0.015) {
      smelledSmoke = true
      const toward = compassName(bearingTo(x, z, v.village.x, v.village.z))
      revealViewshed(v.map, s.fog, v.village.x, v.village.z, 30, 150, 0) // a smudge on the map where the smoke rises
      stop = { kind: 'smoke', message: `A thin column of woodsmoke rises far to the ${toward}.` }
      break
    }
    if (roll > 0.9985 && energy < 85) {
      energy = Math.min(100, energy + 15)
      stop = { kind: 'berries', message: 'You find a bush heavy with berries. +15 energy.' }
      break
    }
    if (elapsed >= CHUNK_HOURS) {
      stop = { kind: 'chunk', message: `Two hours walking ${dir}.` }
      break
    }
  }

  path.push(x, z)
  const status = stop?.kind === 'village' ? 'won' : s.status
  return withStop({ ...s, x, z, hour, energy, path, smelledSmoke, rolls, status }, stop!)
}

/** Time spent exploring on foot in the 3D scene: move to world (x, z). */
export function explore(v: Valley, s: RunState, x: number, z: number, hours: number): RunState {
  if (s.status !== 'playing') return s
  const moved = Math.hypot(x - s.x, z - s.z)
  revealAround(v.map, s.fog, x, z, 120)
  const won = Math.hypot(x - v.village.x, z - v.village.z) < VILLAGE_RADIUS
  const minutes = Math.round(hours * 60)
  const stop: Stop = won
    ? { kind: 'village', message: 'Rooftops, a barking dog, a road. You made it to the village!' }
    : { kind: 'explore', message: `You explore on foot for ${minutes} min (${Math.round(moved)} m from where you stopped).` }
  return {
    ...s,
    x,
    z,
    hour: s.hour + hours,
    energy: Math.max(0, s.energy - hours * 8),
    path: [...s.path, x, z],
    status: won ? 'won' : s.status,
    log: [...s.log, stop],
  }
}

/** Climb a tree or a rock (1 h): the higher the ground, the farther you see. */
export function climb(v: Valley, s: RunState): { state: RunState; stop: Stop } {
  if (s.status !== 'playing') return { state: s, stop: { kind: 'refused', message: 'The journey is over.' } }
  if (isNight(s.hour)) return withStop(s, { kind: 'refused', message: 'Too dark to see anything from up there.' })
  if (s.energy < 10) return withStop(s, { kind: 'refused', message: 'Too tired to climb.' })
  const rel = (heightAt(v.map, s.x, s.z) - v.map.minHeight) / (v.map.maxHeight - v.map.minHeight)
  const radius = 1500 + rel * 3500
  revealViewshed(v.map, s.fog, s.x, s.z, 15, radius)
  const hour = s.hour + 1
  const state = { ...s, hour, energy: s.energy - 10 }
  const view = rel > 0.6 ? 'From this height the land spreads out below you.' : 'Trees and hills block most of the view.'
  // smoke rises high: from a viewpoint you can spot it even when the village itself is hidden
  const dist = Math.hypot(s.x - v.village.x, s.z - v.village.z)
  if (!s.smelledSmoke && dist < radius + 1000) {
    revealViewshed(v.map, s.fog, v.village.x, v.village.z, 30, 150, 0)
    const toward = compassName(bearingTo(s.x, s.z, v.village.x, v.village.z))
    return withStop({ ...state, smelledSmoke: true }, {
      kind: 'smoke',
      message: `You climb and look around. ${view} Far to the ${toward}, a thin column of smoke rises.`,
    })
  }
  return withStop(state, { kind: 'climb', message: `You climb and look around. ${view}` })
}

/** Rest 1 h by day, or sleep until morning at night. Running out of days loses the run. */
export function rest(_v: Valley, s: RunState): { state: RunState; stop: Stop } {
  if (s.status !== 'playing') return { state: s, stop: { kind: 'refused', message: 'The journey is over.' } }
  if (!isNight(s.hour)) {
    const state = { ...s, hour: s.hour + 1, energy: Math.min(100, s.energy + 20) }
    return withStop(state, { kind: 'rest', message: 'You rest for an hour. +20 energy.' })
  }
  const day = s.hour >= NIGHTFALL ? s.day + 1 : s.day
  if (day > DAYS_ALLOWED) {
    return withStop({ ...s, day, hour: DAY_START, status: 'lost' }, {
      kind: 'lost',
      message: `Day ${day} dawns and nobody is looking for you here any more. You did not make it.`,
    })
  }
  const state = { ...s, day, hour: DAY_START, energy: Math.min(100, s.energy + 60) }
  return withStop(state, { kind: 'sleep', message: `You sleep under the stars. Day ${day}, 07:00. +60 energy.` })
}
