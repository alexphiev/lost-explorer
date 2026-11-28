import type { ClueKind, GoalKind } from './goals'

/** How a valley ends and how the map hints at it. */
export interface LevelSpec {
  goal: GoalKind
  /** metres from the start, as the crow flies */
  distance: [number, number]
  /** clues laid along a walkable route, start → goal; each points to the next one, the last to the goal */
  clues: ClueKind[]
}

/** Free valleys (?seed=): the original rule, a village with smoke and no clues. */
export const DEFAULT_SPEC: LevelSpec = { goal: 'village', distance: [900, 1200], clues: [] }

/** The campaign: fixed valleys, unlocked one after the other. */
export interface Level {
  id: number
  name: string
  seed: string
  blurb: string
  spec: LevelSpec
}

// Difficulty curve: distance grows, clues get fewer and smaller, the goal stops being visible from afar.
export const LEVELS: Level[] = [
  {
    id: 1,
    name: 'First Light',
    seed: 'bearing-01-first-light',
    blurb: 'A quiet valley. Follow the signs of people down to the village.',
    spec: { goal: 'village', distance: [600, 800], clues: ['track', 'signpost', 'fence'] },
  },
  {
    id: 2,
    name: 'Cold Water',
    seed: 'bearing-02-cold-water',
    blurb: 'Streams everywhere. Somewhere on the big river, a fisherman left his boat.',
    spec: { goal: 'boat', distance: [700, 900], clues: ['tin', 'fireflies', 'line'] },
  },
  {
    id: 3,
    name: 'Broken Ridge',
    seed: 'bearing-03-broken-ridge',
    blurb: 'Cliffs and scree. Climb high and look for the shepherds’ cairns.',
    spec: { goal: 'cave', distance: [800, 1000], clues: ['cairn', 'cairn', 'piton'] },
  },
  {
    id: 4,
    name: 'Thornwood',
    seed: 'bearing-04-thornwood',
    blurb: 'Scrub closes the easy ways. Foresters marked their trees.',
    spec: { goal: 'cabin', distance: [850, 1050], clues: ['blaze', 'saw'] },
  },
  {
    id: 5,
    name: 'Long Lakes',
    seed: 'bearing-05-long-lakes',
    blurb: 'The water decides your path. At night, a lantern shows the way to the fisherman.',
    spec: { goal: 'hut', distance: [900, 1150], clues: ['buoy', 'lantern', 'oar'] },
  },
  {
    id: 6,
    name: 'Last Smoke',
    seed: 'bearing-06-last-smoke',
    blurb: 'Far, and almost nothing to go on by day. Watch the dark for a glow.',
    spec: { goal: 'village', distance: [1000, 1250], clues: ['firepit', 'embers'] },
  },
]

export const levelById = (id: number): Level | undefined => LEVELS.find((l) => l.id === id)
