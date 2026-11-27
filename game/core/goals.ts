/** What ends a level (a sign of civilisation) and the clues that lead to it. */
export type GoalKind = 'village' | 'cabin' | 'boat' | 'cave' | 'hut'

export type ClueKind = 'track' | 'signpost' | 'fence' | 'line' | 'footprints' | 'tin' | 'cairn' | 'piton' | 'blaze' | 'saw' | 'oar' | 'buoy' | 'firepit'

export interface GoalDef {
  name: string
  /** shown in the journal when the level starts: what you are looking for, never where */
  intro: string
  /** journal line when you reach it */
  found: string
  /** seen from afar on the map (a village), or only once you are close (a small cabin) */
  visibleFar: boolean
  /** chimneys: smoke can be spotted from a viewpoint or on the way */
  smoke: boolean
}

export const GOALS: Record<GoalKind, GoalDef> = {
  village: {
    name: 'Village',
    intro: 'Valleys drain toward people. Somewhere downhill there must be a village.',
    found: 'Rooftops, a barking dog, a road. You made it to the village!',
    visibleFar: true,
    smoke: true,
  },
  cabin: {
    name: "Forester's cabin",
    intro: 'Foresters worked these woods once. Their cabin can’t be far, hidden somewhere in the thorns.',
    found: 'A low cabin in a clearing, a woodpile under the eaves, a radio on the table. It still works. You are saved!',
    visibleFar: false,
    smoke: false,
  },
  boat: {
    name: 'Moored boat',
    intro: 'Fishermen come up the big river in summer. Find the river, find a boat.',
    found: 'A rowing boat tied to an alder, oars inside. Downstream, the river leads home. You are saved!',
    visibleFar: false,
    smoke: false,
  },
  cave: {
    name: "Shepherds' cave",
    intro: 'Shepherds used to shelter under these cliffs. Look for the marks they left.',
    found: 'Under the cliff, a hollow with an old fire ring and a bedroll. A map scratched on the rock shows the trail down. You are saved!',
    visibleFar: false,
    smoke: false,
  },
  hut: {
    name: 'Fishing hut',
    intro: 'Somebody fishes these lakes: a hut must stand on one of the shores.',
    found: 'A hut on stilts and a little jetty, nets drying, a boat engine under a tarp. You are saved!',
    visibleFar: false,
    smoke: false,
  },
}

export interface ClueDef {
  name: string
  /** journal line; `{dir}` = compass direction it points to */
  text: string
  /** big enough to spot from a viewpoint (a cairn on a ridge); small clues must be passed close by */
  far: boolean
}

export const CLUES: Record<ClueKind, ClueDef> = {
  track: { name: 'Logging track', text: 'Old ruts in the grass: a logging track, long unused, runs off to the {dir}.', far: false },
  signpost: { name: 'Signpost', text: 'A weathered signpost. Its only arm, half rotten, points {dir}.', far: false },
  fence: { name: 'Broken fence', text: 'A sagging wire fence. Pastures can’t be far, somewhere {dir}.', far: false },
  line: { name: 'Fishing line', text: 'A fishing line snagged on a branch, a float still on it. Someone came this way, heading {dir}.', far: false },
  footprints: { name: 'Boot prints', text: 'Boot prints dried in the mud, walking {dir}.', far: false },
  tin: { name: 'Bait tin', text: 'An empty bait tin, rusted through. A faint path leads {dir}.', far: false },
  cairn: { name: 'Cairn', text: 'A cairn, stones piled with care. Its top stone points {dir}.', far: true },
  piton: { name: 'Rusty piton', text: 'A rusty piton driven into the rock, an old rope frayed to nothing. The ledge continues {dir}.', far: false },
  blaze: { name: 'Blazed tree', text: 'Axe marks on a trunk, grown over but plain: a forester’s blaze, facing {dir}.', far: false },
  saw: { name: 'Rusted saw', text: 'A rusted saw hangs on a stump. A cut through the thorns opens {dir}.', far: false },
  oar: { name: 'Lost oar', text: 'A broken oar washed into the reeds. The shore curves away {dir}.', far: false },
  buoy: { name: 'Net buoy', text: 'A faded net buoy tangled in the grass, carried here from the {dir}.', far: false },
  firepit: { name: 'Old fire', text: 'A ring of blackened stones, ash still dry under a flat rock. Footprints leave {dir}.', far: false },
}
