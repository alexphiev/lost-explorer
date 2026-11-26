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
