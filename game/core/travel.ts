import { makeRng } from './rng'
import { createWaterSample } from './rivers'
import { heightAt, slopeAt } from './terrain'
import { isScrub, MAX_DOWNHILL, MAX_UPHILL, type Valley } from './valley'
import { createFog, fogAt, FOG_UNSEEN, revealAround, revealViewshed } from './viewshed'
import { CLUES, GOALS, type ClueKind } from './goals'

export const DAYS_ALLOWED = 3
/** Game seconds per real second while on foot: 1 real minute = 2.4 game hours, 30 real minutes = 3 days. */
export const TIME_SCALE = 144
/** The level is lost this many game hours after it started (day 1, 08:00 → day 4, 08:00). */
export const LIMIT_HOURS = DAYS_ALLOWED * 24
/** Game hours since the level started. */
export const hoursUsed = (s: { day: number; hour: number }) => (s.day - 1) * 24 + s.hour - 8
export const DAY_START = 7 // hour the sun rises
export const NIGHTFALL = 20 // hour walking stops
const CHUNK_HOURS = 2
const STEP = 15 // metres per simulation step
const WALK_SPEED = 2 // km/h off-trail on flat open ground
const CLUE_NEAR = 120 // metres: small clues are found only by passing this close
const GOAL_NEAR = 250 // metres: small goals show on the map once you pass this close
export const HURT = 25 // health below this: slower on the map, no running in 3D
const WADE_DEPTH = 1.2 // deeper streams (and all rivers) have to be swum: on foot, in the 3D scene
const ws = createWaterSample()

export type StopKind =
  | 'start'
  | 'chunk' // 2 h walked, nothing special
  | 'night'
  | 'exhausted'
  | 'cliff'
  | 'drop'
  | 'scrub'
  | 'lake'
  | 'river'
  | 'edge'
  | 'berries'
  | 'smoke'
  | 'village' // the goal of the level, whatever it is
  | 'clue'
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

/** A point of interest the player has discovered, pinned on the map. */
export type MarkKind = 'camp' | 'view' | 'berries' | 'smoke' | 'cliff' | 'scrub' | 'water' | 'village' | 'clue' | 'light'
export interface Mark {
  kind: MarkKind
  x: number
  z: number
  label: string
  day: number
  hour: number
  /** clues: what it is and where it points (degrees from north) */
  clue?: ClueKind
  bearing?: number
}

const MARK_OF: Partial<Record<StopKind, MarkKind>> = { cliff: 'cliff', drop: 'cliff', scrub: 'scrub', lake: 'water', river: 'water', berries: 'berries', village: 'village' }
const MARK_LABEL: Record<MarkKind, string> = {
  camp: 'Night camp',
  view: 'Viewpoint',
  berries: 'Berry bush',
  smoke: 'Woodsmoke',
  cliff: 'Cliff',
  scrub: 'Thorny scrub',
  water: 'Deep water',
  village: 'Village',
  clue: 'Clue',
  light: 'A light in the dark',
}

/** Pin a mark, unless one of the same kind is already close by. */
function addMark(s: RunState, kind: MarkKind, x: number, z: number, label = MARK_LABEL[kind]): Mark[] {
  const marks = s.marks ?? []
  if (marks.some((m) => m.kind === kind && Math.hypot(m.x - x, m.z - z) < 200)) return marks
  return [...marks, { kind, x, z, label, day: s.day, hour: s.hour }]
}

export interface RunState {
  day: number // 1-based
  hour: number // 0..24, fractional
  energy: number // 0..100
  /** 0..100: falls in the 3D scene hurt; below HURT you walk slower, at 0 you must rest before walking */
  health: number
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
  /** discovered points of interest */
  marks: Mark[]
  /** indices of the valley's clues already found */
  found: number[]
  /** passed close to a small goal (cabin, boat…): it shows on the map */
  goalSeen?: boolean
  /** saw the goal's light at night */
  lightSeen?: boolean
  /** the camp you set up (world position), until you pack it up */
  camp?: Camp | null
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

export const isNight = (hour: number) => hour >= NIGHTFALL || hour < DAY_START

export interface Camp {
  x: number
  z: number
  /** 0..1 */
  quality: number
  fire: boolean
}

/** Pitch a camp at world (x, z) and pin it. */
export function makeCamp(s: RunState, camp: Camp, verdict: string): RunState {
  return { ...s, camp, marks: addMark(s, 'camp', camp.x, camp.z, `Camp, day ${s.day}`), log: [...s.log, { kind: 'rest', message: `You make camp. ${verdict}.` }] }
}

/**
 * Rest at the camp: one hour, or sleep until 07:00. Recovery scales with the camp's quality;
 * a bad camp makes a cold night that can hurt.
 */
export function campRest(s: RunState, sleep: boolean): RunState {
  const c = s.camp
  if (!c || s.status !== 'playing') return s
  const hours = sleep ? (s.hour >= DAY_START ? 24 - s.hour + DAY_START : DAY_START - s.hour) : 1
  const k = 0.3 + 0.7 * c.quality
  let energy = Math.min(100, s.energy + (sleep ? 9 : 15) * hours * k)
  let health = Math.min(100, s.health + (sleep ? 4 : 3) * hours * k)
  let message: string
  if (sleep) {
    const cold = Math.max(0, 0.45 - c.quality) * 40 // a freezing, sleepless night on a bad spot
    health = Math.max(0, health - cold)
    energy = Math.max(0, energy - cold * 0.5)
    message = cold > 5 ? 'A freezing night: you barely sleep, and wake up stiff and cold.' : c.quality > 0.7 ? 'You sleep well by the fire and wake up rested.' : 'You sleep, on and off, until dawn.'
  } else message = `You rest for an hour. +${Math.round(15 * k)} energy.`
  let hour = s.hour + hours
  let day = s.day
  while (hour >= 24) {
    hour -= 24
    day++
  }
  return checkEnd({ ...s, hour, day, energy, health, log: [...s.log, { kind: sleep ? 'sleep' : 'rest', message }] })
}

function withStop(s: RunState, stop: Stop): { state: RunState; stop: Stop } {
  return { state: { ...s, log: [...s.log, stop] }, stop }
}

/**
 * What you come across standing at (x, z): small clues within CLUE_NEAR, cairns as soon as they are on the map,
 * and a small goal within GOAL_NEAR. Returns the state with them pinned (unchanged object if nothing new) and the journal lines.
 */
function spotClues(v: Valley, s: RunState, x: number, z: number, hour = s.hour, night = false, eye = 1.7): { state: RunState; lines: string[] } {
  const lines: string[] = []
  let found = s.found ?? []
  let marks = s.marks ?? []
  v.clues.forEach((c, i) => {
    if (found.includes(i)) return
    const def = CLUES[c.kind]
    if (def.night && !night) return // lights only show in the dark
    const d = Math.hypot(c.x - x, c.z - z)
    const close = d < (def.night && !def.far ? 80 : CLUE_NEAR)
    const farSeen = def.far && (def.night ? d < LIGHT_RANGE && inSight(v, x, z, eye, c.x, c.z, 3) : fogAt(v.map, s.fog, c.x, c.z) !== FOG_UNSEEN)
    if (!close && !farSeen) return
    found = [...found, i]
    marks = [...marks, { kind: 'clue', x: c.x, z: c.z, label: def.name, day: s.day, hour, clue: c.kind, bearing: c.bearing }]
    lines.push(def.text.replace('{dir}', compassName(c.bearing)))
  })
  const goalSeen = s.goalSeen || Math.hypot(v.goal.x - x, v.goal.z - z) < GOAL_NEAR
  // the goal is lit at night: seen from far, in line of sight
  let lightSeen = !!s.lightSeen
  if (night && !lightSeen) {
    const d = Math.hypot(v.goal.x - x, v.goal.z - z)
    if (d < GOAL_LIGHT_RANGE && inSight(v, x, z, eye, v.goal.x, v.goal.z, 4)) {
      lightSeen = true
      marks = [...marks, { kind: 'light', x: v.goal.x, z: v.goal.z, label: 'A light in the dark', day: s.day, hour }]
      lines.push(`Far to the ${compassName(bearingTo(x, z, v.goal.x, v.goal.z))}, a light in the dark: ${GOALS[v.goal.kind].light}.`)
    }
  }
  if (!lines.length && goalSeen === !!s.goalSeen) return { state: s, lines }
  return { state: { ...s, found, marks, goalSeen, lightSeen }, lines }
}

const LIGHT_RANGE = 900 // metres: a lantern or embers in the dark
const GOAL_LIGHT_RANGE = 1400 // metres: lit windows, a lamp, a fire

/** Line of sight over the map's terrain from an eye at (ax, az) to a point `bh` metres above the ground at (bx, bz). */
function inSight(v: Valley, ax: number, az: number, eye: number, bx: number, bz: number, bh: number): boolean {
  const a = heightAt(v.map, ax, az) + eye
  const b = heightAt(v.map, bx, bz) + bh
  const d = Math.hypot(bx - ax, bz - az)
  const steps = Math.ceil(d / 15)
  for (let k = 1; k < steps; k++) {
    const t = k / steps
    if (heightAt(v.map, ax + (bx - ax) * t, az + (bz - az) * t) > a + (b - a) * t + 0.5) return false
  }
  return true
}

const goalReach = (v: Valley) => GOALS[v.goal.kind].reach

const goalFound = (v: Valley) => GOALS[v.goal.kind].found

export function newRun(v: Valley): RunState {
  const fog = createFog(v.map)
  // looking around from where you woke up
  revealViewshed(v.map, fog, v.start.x, v.start.z, 4, 450)
  revealAround(v.map, fog, v.start.x, v.start.z, 60)
  return {
    day: 1,
    hour: 8,
    energy: 100,
    health: 100,
    x: v.start.x,
    z: v.start.z,
    fog,
    path: [v.start.x, v.start.z],
    status: 'playing',
    smelledSmoke: false,
    rolls: 0,
    marks: [],
    found: [],
    log: [{ kind: 'start', message: `Day 1, 08:00. You wake up lost. ${GOALS[v.goal.kind].intro} You have ${DAYS_ALLOWED} days.` }],
  }
}

/** Walk along `bearing` for up to 2 hours, until something stops you. */
export function walk(v: Valley, s: RunState, bearing: number): { state: RunState; stop: Stop } {
  if (s.status !== 'playing') return { state: s, stop: { kind: 'refused', message: 'The journey is over.' } }
  if (isNight(s.hour)) return withStop(s, { kind: 'refused', message: 'It is too dark to walk. Rest until morning.' })
  if (s.energy < 5) return withStop(s, { kind: 'refused', message: 'You are too tired to walk. Rest first.' })
  if (s.health <= 0) return withStop(s, { kind: 'refused', message: 'You are too badly hurt to walk. Rest first.' })

  const rad = (bearing * Math.PI) / 180
  const dx = Math.sin(rad)
  const dz = -Math.cos(rad)
  const half = v.map.size / 2
  let { x, z, hour, energy, smelledSmoke, rolls } = s
  let probe = s // clues and goal sightings along the way
  const path = [...s.path]
  let elapsed = 0
  let wading = false
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
    if (h1 < v.field.lake(nx, nz) - 0.3) {
      stop = { kind: 'lake', message: `A lake blocks the way ${dir}. Go around, or explore on foot and swim across.` }
      break
    }
    // streams are narrow: look at three points along the step
    let wet = false
    let deep = false
    let river = false
    for (let k = 1; k <= 3 && !deep; k++) {
      const px = x + dx * STEP * (k / 3)
      const pz = z + dz * STEP * (k / 3)
      if (!v.field.stream(px, pz, ws)) continue
      // the sample reaches past the banks: only actual water counts, as deep as it is right there
      const depth = ws.level - v.field.height(px, pz)
      if (depth <= 0) continue
      wet = true
      deep = depth > WADE_DEPTH
      river = ws.river
    }
    if (deep) {
      stop = river
        ? { kind: 'river', message: `A river cuts across your way ${dir}, wide and cold, its current strong. Follow the bank, or explore on foot and swim across.` }
        : { kind: 'river', message: `A deep stream cuts across your way ${dir}. Too deep to wade: explore on foot and swim across, or follow it.` }
      break
    }
    if (wet && !wading) {
      // wading across a shallow stream: a few wet, cold minutes
      hour += 0.05
      elapsed += 0.05
      energy -= 1
    }
    wading = wet
    if (isScrub(v.field, nx, nz)) {
      stop = { kind: 'scrub', message: `Thick, thorny scrub blocks the way ${dir}. Go around, or explore on foot and push through it slowly.` }
      break
    }

    // slower uphill, a bit slower steeply downhill, slower on rough slopes
    const slowdown = grade > 0 ? 1 + grade * 6 : 1 + -grade * 1.5
    const rough = 1 + slopeAt(v.map, nx, nz) * 0.8
    const dt = STEP / 1000 / ((WALK_SPEED * (s.health < HURT ? 0.7 : 1)) / (slowdown * rough))
    x = nx
    z = nz
    hour += dt
    elapsed += dt
    energy -= dt * (6 + Math.max(0, grade) * 35)
    if (i % 3 === 0) {
      path.push(x, z)
      revealAround(v.map, s.fog, x, z, 120)
      const spotted = spotClues(v, probe, x, z, hour)
      probe = spotted.state
      if (spotted.lines.length) {
        stop = { kind: 'clue', message: spotted.lines.join(' ') }
        break
      }
    }

    if (Math.hypot(x - v.village.x, z - v.village.z) < goalReach(v)) {
      stop = { kind: 'village', message: goalFound(v) }
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
    if (GOALS[v.goal.kind].smoke && !smelledSmoke && distVillage < 3500 && roll < 0.015) {
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
  let next: RunState = { ...s, x, z, hour, energy, path, smelledSmoke, rolls, status, found: probe.found, marks: probe.marks, goalSeen: probe.goalSeen }
  const mk = MARK_OF[stop!.kind]
  if (mk === 'village') next = { ...next, marks: addMark(next, 'village', v.village.x, v.village.z) }
  else if (mk) {
    // obstacles are pinned a little ahead, where they block the way
    const r = (bearing * Math.PI) / 180
    const ahead = mk === 'berries' ? 0 : 40
    next = { ...next, marks: addMark(next, mk, x + Math.sin(r) * ahead, z - Math.cos(r) * ahead) }
  }
  if (stop!.kind === 'smoke') next = { ...next, marks: addMark(next, 'smoke', v.village.x, v.village.z) }
  return withStop(next, stop!)
}

/** Time spent exploring on foot in the 3D scene: move to world (x, z). */
export function explore(v: Valley, s: RunState, x: number, z: number, hours: number, canWin = true): RunState {
  if (s.status !== 'playing') return s
  const moved = Math.hypot(x - s.x, z - s.z)
  revealAround(v.map, s.fog, x, z, 60)
  const won = canWin && Math.hypot(x - v.village.x, z - v.village.z) < goalReach(v)
  const spotted = spotClues(v, s, x, z)
  s = spotted.state
  const stop: Stop = won
    ? { kind: 'village', message: goalFound(v) }
    : { kind: spotted.lines.length ? 'clue' : 'explore', message: `${Math.round(moved)} m on foot.${spotted.lines.length ? ' ' + spotted.lines.join(' ') : ''}` }
  // the clock runs on (energy is spent in the scene: effort, cold, see Scene/Player)
  let hour = s.hour + hours
  let day = s.day
  while (hour >= 24) {
    hour -= 24
    day++
  }
  return {
    ...s,
    x,
    z,
    day,
    hour,
    path: [...s.path, x, z],
    status: won ? 'won' : s.status,
    marks: won ? addMark(s, 'village', v.village.x, v.village.z) : s.marks,
    log: [...s.log, stop],
  }
}

/** Climb a tree or a rock (1 h): the higher the ground, the farther you see. */
export function climb(v: Valley, s: RunState): { state: RunState; stop: Stop } {
  if (s.status !== 'playing') return { state: s, stop: { kind: 'refused', message: 'The journey is over.' } }
  if (isNight(s.hour)) return withStop(s, { kind: 'refused', message: 'Too dark to see anything from up there.' })
  if (s.energy < 10) return withStop(s, { kind: 'refused', message: 'Too tired to climb.' })
  const rel = (heightAt(v.map, s.x, s.z) - v.map.minHeight) / (v.map.maxHeight - v.map.minHeight)
  const radius = 500 + rel * 1000
  revealViewshed(v.map, s.fog, s.x, s.z, 15, radius)
  const spotted = spotClues(v, s, s.x, s.z)
  s = spotted.state
  const clueText = spotted.lines.length ? ` ${spotted.lines.join(' ')}` : ''
  const hour = s.hour + 1
  const state = { ...s, hour, energy: s.energy - 10, marks: addMark(s, 'view', s.x, s.z, `Viewpoint (${Math.round(heightAt(v.map, s.x, s.z))} m)`) }
  const view = rel > 0.6 ? 'From this height the land spreads out below you.' : 'Trees and hills block most of the view.'
  // smoke rises high: from a viewpoint you can spot it even when the village itself is hidden
  const dist = Math.hypot(s.x - v.village.x, s.z - v.village.z)
  if (GOALS[v.goal.kind].smoke && !s.smelledSmoke && dist < radius + 1000) {
    revealViewshed(v.map, s.fog, v.village.x, v.village.z, 30, 150, 0)
    const toward = compassName(bearingTo(s.x, s.z, v.village.x, v.village.z))
    return withStop({ ...state, smelledSmoke: true, marks: addMark(state, 'smoke', v.village.x, v.village.z) }, {
      kind: 'smoke',
      message: `You climb and look around. ${view} Far to the ${toward}, a thin column of smoke rises.${clueText}`,
    })
  }
  return withStop(state, { kind: spotted.lines.length ? 'clue' : 'climb', message: `You climb and look around. ${view}${clueText}` })
}

/** Rest 1 h by day, or sleep until morning at night. Running out of days loses the run. */
export function rest(_v: Valley, s: RunState): { state: RunState; stop: Stop } {
  if (s.status !== 'playing') return { state: s, stop: { kind: 'refused', message: 'The journey is over.' } }
  if (!isNight(s.hour)) {
    const state = { ...s, hour: s.hour + 1, energy: Math.min(100, s.energy + 20), health: Math.min(100, s.health + 8) }
    return withStop(state, { kind: 'rest', message: `You rest for an hour. +20 energy${s.health < 100 ? ', +8 health' : ''}.` })
  }
  const day = s.hour >= NIGHTFALL ? s.day + 1 : s.day
  if (day > DAYS_ALLOWED) {
    return withStop({ ...s, day, hour: DAY_START, status: 'lost' }, {
      kind: 'lost',
      message: `Day ${day} dawns and nobody is looking for you here any more. You did not make it.`,
    })
  }
  const state = { ...s, day, hour: DAY_START, marks: addMark(s, 'camp', s.x, s.z, `Night camp, day ${s.day}`), energy: Math.min(100, s.energy + 60), health: Math.min(100, s.health + 30) }
  return withStop(state, { kind: 'sleep', message: `You sleep under the stars. Day ${day}, 07:00. +60 energy${s.health < 100 ? ', +30 health' : ''}.` })
}

/** Out of time (72 h) or out of health: the level is lost. */
export function checkEnd(s: RunState): RunState {
  if (s.status !== 'playing') return s
  if (s.health <= 0) {
    return { ...s, health: 0, status: 'lost', log: [...s.log, { kind: 'lost', message: 'Exhausted, frozen and hurt, you collapse. Nobody finds you in time.' }] }
  }
  if (hoursUsed(s) >= LIMIT_HOURS) {
    return { ...s, status: 'lost', log: [...s.log, { kind: 'lost', message: `Day ${DAYS_ALLOWED + 1} dawns and nobody is looking for you here any more. You did not make it.` }] }
  }
  return s
}

/**
 * What you see standing at world (x, z), eye `eye` metres above the ground: clears the fog in place (line of sight,
 * farther when higher up, short at night), draws the trail, and finds clues. Returns the new state only if
 * clues were found (fog and trail are mutated in place), with the journal lines.
 */
export function observe(v: Valley, s: RunState, x: number, z: number, eye: number, night: boolean, hour: number): { state: RunState; lines: string[] } {
  if (s.status !== 'playing') return { state: s, lines: [] }
  const rel = (heightAt(v.map, x, z) - v.map.minHeight) / Math.max(1, v.map.maxHeight - v.map.minHeight)
  const radius = night ? 150 : 400 + rel * 300 + Math.min(300, eye * 15)
  revealViewshed(v.map, s.fog, x, z, eye, radius, night ? 0.6 : 0.45)
  revealAround(v.map, s.fog, x, z, 40)
  // the trail on the map: a point every ~20 m
  const n = s.path.length
  if (n < 2 || Math.hypot(x - s.path[n - 2], z - s.path[n - 1]) > 20) s.path.push(x, z)
  const spotted = spotClues(v, s, x, z, hour, night, eye)
  if (!spotted.lines.length) return { state: spotted.state === s ? s : spotted.state, lines: [] }
  const stop: Stop = { kind: 'clue', message: spotted.lines.join(' ') }
  return { state: { ...spotted.state, log: [...spotted.state.log, stop] }, lines: spotted.lines }
}
