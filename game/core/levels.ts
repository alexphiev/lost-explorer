/** The campaign: fixed valleys, unlocked one after the other. */
export interface Level {
  id: number
  name: string
  seed: string
  blurb: string
}

export const LEVELS: Level[] = [
  { id: 1, name: 'First Light', seed: 'bearing-01-first-light', blurb: 'You wake in a quiet valley. Find the village.' },
  { id: 2, name: 'Cold Water', seed: 'bearing-02-cold-water', blurb: 'Streams everywhere. Some you wade, some you swim.' },
  { id: 3, name: 'Broken Ridge', seed: 'bearing-03-broken-ridge', blurb: 'Cliffs and scree. Climb high, look far.' },
  { id: 4, name: 'Thornwood', seed: 'bearing-04-thornwood', blurb: 'Scrub closes the easy ways.' },
  { id: 5, name: 'Long Lakes', seed: 'bearing-05-long-lakes', blurb: 'The water decides your path.' },
  { id: 6, name: 'Last Smoke', seed: 'bearing-06-last-smoke', blurb: 'Three days, and no room for mistakes.' },
]

export const levelById = (id: number): Level | undefined => LEVELS.find((l) => l.id === id)
