# Ideas (post-MVP)

One line per idea. Not to be built until the MVP is done.

- Tree/rock colliders (player currently walks through vegetation).
- Camera occlusion: pull the camera in when a ridge hides the player (camera-controls colliderMeshes did not work with EcctrlCameraControls).
- Time of day: animate the sun (golden hour → dusk) and drive sky, fog tint and light colour from it.

## Code review PR #2 — deferred (not needed for the MVP)
Likely bugs / robustness
- Visual terrain triangulation vs Rapier heightfield diagonals may differ slightly (feet float/sink by a few cm on bumps); if it shows, switch to a trimesh collider or align the diagonal.
- No respawn if the player ever falls below the map (e.g. y < -30 → teleport to spawn).
- Shadows of swaying trees/grass don't sway (shadow pass ignores the wind positionNode); only visible up close.
- WebGPU path was never seen (headless is WebGL only): check on a real GPU browser, then Android Chrome and iPhone Safari (step 1 goal in the tech doc).
- If neither WebGPU nor WebGL2 is available the page stays blank: show a short error message.
- `?seed=` is not sanitised or length-limited (harmless now, matters for Daily Wild / leaderboard).
- Terrain uses Math.sin/exp/noise: results may differ by tiny amounts across JS engines; matters only if the server must validate seeds (Daily Wild).
Performance / cost
- Terrain is generated and meshed on the main thread at load (~0.2 s): move to `game/workers/generate.worker.ts` when worlds get bigger or hitches show.
- Terrain mesh is non-indexed (131k tris, 3× the vertices); no LOD or chunking. Fine at 1 km², revisit for larger maps.
- No quality tier / PerformanceMonitor: shadow map 2048, dpr up to 1.5, 20k grass+flower instances, bloom are always on. Add a settings tier and a way to turn off bloom/grass on weak GPUs.
- Geometries and materials created in useMemo are never disposed (only matters when remounting the scene).
Code hygiene
- `scripts/smoke.cjs` relies on the globally installed Playwright (not a dependency); pin it as a devDependency if the script is kept when tests are allowed.
- No ESLint, no tests (by decision for the MVP).
- `readUrlOnce` mutates stores inside a `useState` initialiser: fine now, move to a proper init when the app has a menu / several runs.
- Touch controls and pointer-lock option for the camera.

## Step 2 follow-ups
- Pose while sliding down a too-steep slope looks like a jump (arms out): add a "slide" pose.
- 3D scene doesn't show map scrub patches yet; step 3 should place thick bushes where `field.scrub` is true.
- Map: zoom/pan, hover tooltip (height, "scrub", "cliff"), click-and-hold to preview where a 2 h walk would stop.
- Rivers (traced downhill) as followable guides and obstacles, per the concept.
- Balance: tune walk speed, energy, days after playtests; consider more stop types (old trail, hut, cairn, fog bank).
- Move valley generation (flood fill + sampling, ~60 ms) to the worker when it grows.

## Step 3 follow-ups
- Camera ends up inside tree crowns / behind trunks: pull it in when occluded (raycast against trunks or a simple distance check to nearby instances).
- In 3D, walking out of the 1 km tile hits an invisible wall: could re-centre the tile (generate a new one) when close to the edge.
- 3D time scale (×20) and energy cost of exploring are guesses.
- Climbing in 3D is instant (E): real climbing (grab, pull up) is part of the realism pass.
- Village in 3D has no smoke, people or road yet.

## Realism pass 2 follow-ups
- Sounds: footsteps by ground (grass, rock, water), breathing, wind, birds, water lapping.
- Splashes and ripples when entering water / swimming; wet clothes tint.
- Rivers traced downhill (followable guides + fords), per the concept.
- Ledge hang/shimmy on rock edges, jump-to-grab, climbing down facing out on slabs.
- Climbing a tree inside its crown hides the player: crown transparency near the camera.
- Night: torch/lantern or moonlit navigation; stars.
- Scenario script for climbing/swimming (currently in the scratchpad) could join scripts/ once tests are allowed.

## Sky / decor / surfaces follow-ups
- Quality tier: halve decor counts / radius, cheaper surface noise (1 octave) and no bloom on weak GPUs and phones.
- Optional CC0 model packs (e.g. Kenney Nature Kit, Quaternius) for hero props if the procedural ones feel too simple; keep total download small.
- Decor around the player is fixed at scene entry; re-centre it if the player walks far (>200 m).

## Rivers follow-ups
- Valley generation is ~0.8 s (was 0.12 s), tile ~0.2 s: move generation to a worker or cache the river network if it gets noticeable.
- Bridges / fords / stepping stones near the village; fallen trees across streams.
- Waterfalls where a stream drops into a deeper valley (now the water simply stops there), splash particles, sound of running water.
- Wet clothes: stay cold for a while after leaving the water; a fire to warm up.
- Riverside vegetation (reeds, alders) and pebble beds in shallow streams.

- Levels with their own difficulty (days allowed, village distance, weather) instead of fixed seeds with the same rules.
- Balance the levels with a bot playthrough (follow clues) instead of by hand; clue placement by visibility (put cairns where a viewpoint sees them).
- Sound: real recorded samples (steps, water, birds) instead of synthesis; reverb in valleys; distant thunder with weather.
