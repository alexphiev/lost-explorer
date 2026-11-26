# BEARING — Concept Document

*v0.1 · 26 Nov 2026 · working title*

---

## 1. Pitch

**You wake up lost in the wild. You have X days to reach civilization.**
Climb to see the land, choose a bearing, walk, and deal with whatever stops you, until you find your way out. Every level is a new valley with many possible routes. Episodes link up into a light journey: from an abandoned cabin all the way to the first city.

## 2. Design pillars

1. **Navigation is the game.** Reading the terrain, choosing a direction, and living with that choice.
2. **Depth over breadth.** About 5 actions that combine with terrain, weather and time of day. No collection of separate mini-games.
3. **Nature as the teacher.** Real orientation and naturalist knowledge are what you get better at, not stats.
4. **Many routes, few rules.** Systemic interactions reward creative players.
5. **Cheap but atmospheric.** Low-poly, flat colours, fog, light and sound. Graphics serve readability.
6. **Finishable.** Short levels, episodic delivery, strict scope.

## 3. Core loop: two layers

```
 OBSERVE ──► PLAN ──► COMMIT ──► RESOLVE ──┐
 (3D: climb  (map: set   (map: fast-   (3D: get past  │
  a viewpoint) a bearing)  forward in    the obstacle, │
                           2 h chunks)   find the next │
                                         viewpoint)    │
   ▲─────────────────────────────────────────────────┘
```

**Map layer (strategic, fast-forward)**
- A top-down map that starts covered in fog of war. What you have seen from viewpoints is sketched in, and the further away something is, the vaguer it looks.
- The player sets a bearing (a compass direction) and the character walks automatically, in 2-hour chunks.
- Walking stops when: the character can't continue (cliff, river, thick scrub), an event happens, night falls, or energy runs out.

**3D layer (real-time, local)**
- Generated only around where the character stopped, so there's no continuous open world to stream.
- Direct control: climb, swim, cross, explore, find the next viewpoint.
- Short, focused challenges, a few minutes each.

## 4. Mechanics

### Actions (V1 target: 5)
| Action | Use |
|---|---|
| **Climb** | Trees, rocks, peaks: viewpoints that reveal the map |
| **Swim / ford** | Rivers and lakes; risky in flood or cold |
| **Rest** | Recover energy; spends time; shelters change how much it helps |
| **Observe** | Read clues: smoke, sounds, animals, sun and stars |
| **Make fire** | Warmth, signal, night safety; spreads in dry conditions |

### Systemic rules (where the variety comes from)
- **Rain:** rocks become slippery, but streams fill up and you can follow them.
- **Night:** dangerous to move, but village lights become visible from peaks.
- **Fog:** no long views, but it's cool, so you spend less energy.
- **Heat:** fast energy drain; dry vegetation means fire risk.
- **Wind:** carries smoke and sounds, so you can tell which way they come from.
- **Water flows downhill, towards people.** True in every generated world.

### Resources (keep it light)
- **Time:** days, plus daylight hours.
- **Energy:** a single bar. Food is an energy bonus, never a hunger meter.
- No inventory management. Tools are permanent unlocks (see Episodes).

## 5. Stops and encounters

The cheap source of variety, like FTL's nodes. Every fast-forward ends on one of these:

- **Obstacles:** river in flood, cliff, impenetrable scrub, swamp, scree.
- **Opportunities:** berries, natural shelter, old trail, cairn, abandoned hut.
- **Signs of people:** smoke, a dog barking, a church bell, a power line, a jet's contrail, a fence, litter.
- **Dangers:** incoming storm, fog bank, sprained ankle, nightfall, wildfire.
- **Animals as guides:** goats lead to a pass, birds to water, a farm dog to a farm.

## 6. Navigation knowledge

Real knowledge the player learns and uses:
- Follow water downhill.
- Use the sun's position and the Pole Star to hold a bearing.
- Read the wind using smoke and sound.
- Learn which landscape features suggest people: terraces, dry-stone walls, olive groves, paths.
- **Myth traps:** "moss grows on the north side" is unreliable, and the game can teach that.

## 7. Win, lose, endings

- **Win (main):** reach the level's exit (cabin, house, boat, village, city).
- **Win (alternative):** signal for rescue with a fire or mirror on a summit, at the right time and in the right weather. Real advice for lost hikers is often to stay put and signal, so this is a valid creative path.
- **Lose:** days run out, or energy collapses with no shelter. Lose the level, replay it (same seed or a new one).
- **Score:** days and hours used, distance walked, discoveries. Shareable.

## 8. Structure: Episodes plus a Daily Wild mode

Two modes on the same engine:

### Episodes (authored, story-linked, released weekly or fortnightly)
A light story. Each episode is playable on its own, and **each one unlocks one new tool or mechanic** that carries forward, so variety grows over time while each episode stays small.

| # | Goal | New tool or mechanic | Notes |
|---|---|---|---|
| 1 | Reach the abandoned cabin | Basics: climb, observe, bearing | Tutorial valley |
| 2 | Find the house of the hermit | Tools from the cabin: rope (cliffs), knife | Hermit lives off-grid, no phone or radio |
| 3 | Follow the hermit's directions to the old boat | Hand-drawn map from the hermit (partial knowledge) | First "trust a source" level |
| 4 | Go down the river | **New mode:** drifting with the current, rapids, choosing branches | Map layer reused as the river |
| 5 | Meet the shepherds in the high pastures | **Language barrier:** communicate by pointing and drawing on the map | They speak only Occitan/Provençal; they teach weather and terrain lore |
| 6 | Cross the last ridge | Signal fire, night navigation | Hardest valley |
| 7 | Reach the first town and get rescued | Everything | Finale |

**Release cadence:** launch with **3 episodes ready**, then one every 2 weeks. Keep a buffer of 2 finished episodes at all times, so the schedule never pressures you.

### Daily Wild (procedural, endless)
- A new seeded valley every day, the same for everyone.
- Shareable result, Wordle-style: *"Day 3 · 14 h walked · 🏔️🏔️🌊🔥🏘️"*
- Keeps players coming back between episodes, at zero content cost.

## 9. Procedural generation

- **One finite valley per level, generated from a seed.** Not infinite, and not changed on the fly. The same seed always gives the same valley.
- Layers of seeded noise for terrain (`alea` + `simplex-noise`): broad hills, small detail, domain warping so shapes look natural.
- Moisture and temperature noise maps decide biomes: pine forest, garrigue scrub, meadow, wetland, scree.
- **Rivers are traced downhill from springs**, which supports the "follow the water" knowledge.
- **Authored set pieces** (cabin, hut, waterfall, cave, the exit) placed by rules, e.g. "cave on a steep slope near water".
- **Validation:** after generating, a pathfinding check makes sure the exit is reachable within the days allowed. If not, regenerate.
- Episodes use **hand-picked seeds plus authored overrides**. Daily Wild uses pure generation.
- **Coarse heightmap for the map layer; detailed 3D generated only around each stop.** This is the key scope saver.

## 10. Tech

- **Language:** TypeScript.
- **3D:** React Three Fiber (Three.js) + drei, with Rapier for physics (heightfield collider per local scene).
- **Generation:** `alea`, `simplex-noise`, Poisson disc sampling for vegetation, instanced meshes for trees and rocks, Web Worker for generation.
- **Map layer:** 2D canvas, or a flat projection in Three.js.
- **Platform:** desktop browser first; mobile browser second. The map layer suits mobile well; 3D touch controls come later.
- **Hosting:** static site (itch.io + own domain).

## 11. Art direction

- Low-poly with flat colours (Firewatch / A Short Hike), fog for depth and performance, time-of-day colour grading.
- Free CC0 assets (Kenney, Quaternius) as a base; Mixamo animations for the human character.
- **The map is the signature visual:** a hand-sketched look that fills in as you explore.
- Sound: wind, birds, cicadas, water, ideally your own field recordings.

## 12. AI usage

- **V1: no AI at runtime.** No token costs, no moderation, no exploits.
- **At dev time:** coding help, drafting event text and stop descriptions, a test suite of seeds and edge cases.
- **Possible later:** an "AI judge" mapping a player's free-text creative solutions to outcomes you wrote; hermit or shepherd conversations limited to fact sheets you wrote. Principle: *the AI talks, the game decides.*

## 13. Scope

### V1 = Episode 1 plus a Daily Wild prototype
- 1 tutorial valley, 5 actions, about 10 kinds of stop, 3 weather types, day and night.

### Cut from V1 (on the V2+ list)
- Swimming as full 3D gameplay (V1: fording a river is an event with a choice)
- River drifting mode (Episode 4)
- Shepherds and the language barrier (Episode 5)
- Mobile touch controls
- Any runtime AI
- Hunger, thirst, crafting, inventory: **never**

**Rule:** new ideas go on the V2 list, not into the current episode.

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Fast-forward feels passive | Make decisions informed and risky (fog of war, vague distance); make every stop an interesting encounter |
| Procedural valleys feel samey | Authored set pieces, distinct biomes, weather, a strong sense of landmarks |
| Tinkering with the generator forever | 2-weekend time limit on the generator, then freeze it |
| 3D slows everything down | Prototype the map layer in 2D first; 3D only around stops |
| Episodic schedule causes burnout | Launch with 3 episodes and keep a 2-episode buffer |
| Loss of motivation | Something playable within 2 weekends; share progress publicly every week |

## 15. Prototype plan

1. **2D map prototype (1–2 weekends).** Heightmap shown as a map, fog of war, climb a point to reveal the surroundings, set a bearing, fast-forward, stop when blocked, days counter, a village somewhere. **Test:** is choosing where to go fun with flat colours?
2. **3D stop scene (2–3 weekends).** Generate a local 3D scene from the heightmap at a stop point; walk, climb, find a viewpoint, go back to the map.
3. **Episode 1 vertical slice (~2 months of evenings).** Tutorial valley to the cabin, all 5 actions, about 10 stop types, weather, day and night, basic art and sound. Release on itch.io to test whether people like it.

## 16. Open questions

- Who is the character? Backstory kept minimal (hiker, plane crash, amnesia?).
- Setting: a fictional Mediterranean mountain region inspired by the Alps-to-sea landscapes of Provence?
- Length of a level: aiming for 15–30 minutes?
- Fixed number of days per level, or tied to difficulty?
- Daily Wild: launch it alongside Episode 1, or later?

## 17. Concepts explored and parked

- Pokémon-style wildlife **photo capture** with movement modes unlocking habitats (Episodes or Daily Wild could add photography later)
- **Lynx life story** / generational roguelite
- **Eco-detective** with AI NPCs and the AI judge
- **Plague-like** concepts: Walking Forest, Keystone, Nightfall, Mycelium, Invasive
- **Wildfire defence** puzzle: prepare, press play, dispatch firefighters (could return as a wildfire event in Bearing)
- Mountain Post, Seven Days Before the Dam, Beaver, Transhumance, Cartographer (Cartographer is largely absorbed into Bearing's map layer)

## 18. References

- **Two-layer structure:** Mount & Blade, FTL, XCOM
- **Navigation and exploration:** Breath of the Wild (viewpoints, systemic rules), Death Stranding (route planning), A Short Hike (small world that feels big)
- **Knowledge as progression:** Outer Wilds
- **Procedural with authored pieces:** Spelunky, Hades
- **Daily shareable challenge:** Wordle
- **Episodic release:** Telltale games, Hitman (2016)
- **Look:** Firewatch, A Short Hike, Alto's Odyssey
