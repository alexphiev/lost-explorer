# Progress — MVP

Branches: `step-1`, `step-1.5` (#2), `step-2` (#3) merged; `step-3` (#4) merged; `realism-1` (#5) merged; `realism-2` (current). `realism-movement` is obsolete (pre-squash base), can be deleted

## Definition of done
- [x] Next.js 16 + React 19.2 + TypeScript + Tailwind, exact versions pinned
- [x] Structure (§3) limited to: app/play, game/core, game/state, game/render, game/world
- [x] WebGPU via async `gl` callback, `forceWebGL` fallback via `?webgl=1`
- [x] 1000×1000 m seeded terrain in game/core (alea + simplex-noise): hills, ridges, valleys; random seed per load, shown top-left, replayable via `?seed=xxx`
- [x] Vertex colours by altitude/slope (meadow, forest, rock), Lambert, flat shading
- [x] Rapier heightfield collider (trimesh fallback)
- [x] ~2000 trees (cone+cylinder) + 500 rocks, instanced, deterministic, not on steep slopes
- [x] Low-poly primitive humanoid with procedural arm/leg swing
- [x] ecctrl controls: ZQSD/WASD/arrows, Shift run, Space jump, mouse 3rd-person camera
- [x] Fog, sky (SkyMesh TSL or bg colour), directional + hemisphere light, one shadow
- [x] Spawn at centre on the ground, invisible walls at map edges
- [x] `npm run build` passes

## Step 1.5 — visual pass (realistic but poetic)
- [x] Terrain colours: moisture/variety field, richer palette (meadow, golden grass, moss, forest floor, rock strata)
- [x] Vegetation: conifers + deciduous, per-instance colours, TSL wind sway, grass tufts + flowers in meadows, varied rocks
- [x] Player: nicer explorer model (hat, scarf, backpack), two-segment limbs, bob/lean/breathing
- [x] Sky + light: low golden sun, clouds, warm sun / cool sky hemisphere, AgX tone mapping
- [x] Atmosphere: TSL fog tinted by sun direction + valley mist (height fog)
- [x] Post: TSL RenderPipeline with soft bloom + vignette
- [x] Chromium smoke screenshots (WebGL fallback, several seeds) — script, not a test suite
- [x] `npm run build` passes, PR opened (step-1.5 → master, includes step 1)

## Step 2 — 2D map prototype (+ 3D physics fixes)
- [x] core: world-space height function shared by the 6 km map and the 1 km 3D scene
- [x] core: valley = map grid + start + village (low ground, 2–2.8 km away)
- [x] core: viewshed (climb reveals, farther = vaguer), fog of war Uint8Array (0 unseen, 1 far, 2 near)
- [x] core/travel: bearing walk in 2 h chunks; stops: cliff, scrub, map edge, night, exhausted, berries, smoke, village; days/hour/energy; win/lose
- [x] state: zustand journey store calling core
- [x] /map: canvas map (hillshade, contours, fog), click to set bearing, Walk / Climb / Rest, HUD (day, hour, energy, log)
- [x] 3D physics: tree + rock colliders, visual triangles match the Rapier heightfield, max climbable slope, respawn if fallen
- [x] `npm run build` + Chromium smoke (/play and /map), PR opened

## Step 3 — 3D stop scene + layer switch
- [x] core: sample a 1 km 3D tile around any world position (same height field as the map)
- [x] core: vegetation placed per 250 m world chunk (same place → same trees), scrub bushes where the map has scrub, village houses
- [x] core/travel: `explore` (3D moves + time spent written back to the run)
- [x] state: layer 'map' | 'scene', enterScene / leaveScene
- [x] /play = map + 3D: "Explore on foot" from the map; in 3D, E = climb (near a tree/rock), M = back to map; 1 real s = 20 game s
- [x] 3D: bushes + houses with colliders; HUD (day, time, energy, hints)
- [x] /map route folded into /play; smoke script updated; build; PR

## Realism pass 1 — character movement and reactions to the landscape
- [x] Gait driven by distance covered (planted feet, no foot sliding, no walking on the spot against an obstacle)
- [x] Two-bone leg IK on the real ground (terrain slope, rocks via ecctrl standPoint), pelvis drop, ankles follow the slope
- [x] Tobler's hiking function: slower uphill / on steep descents (brake impulse against ecctrl), shorter strides uphill
- [x] Torso leans with speed and slope (forward uphill, back downhill), roll into turns, hip/shoulder counter-twist
- [x] Air poses (rising tuck / falling reach), landing squash scaled by impact speed, slide pose on too-steep ground
- [x] Arms counter-swing, pump when running, go out for balance on steep ground / in the air
- [x] Breathing deepens and speeds up after running (exertion)
- [x] Camera: no longer inside tree crowns, rocks or ridges; FOV widens when running
- [x] Walk 1.8 m/s, run 4.5 m/s (were 3 / 7), softer acceleration
- [x] Fixed: the left leg was rendered twice

## Realism pass 2 — climbing, swimming, water, daylight
- [x] Climbing terrain by steepness: walk into a >40° slope → climb; slab (40–65°, leaning on the slope, all fours) → wall (>65°, upright, arms overhead); mantle over the top; Space lets go
- [x] Climbing boulders (new 2.6–4.6 m boulders) around their sides and mantling onto the top
- [x] Climbing trees (E): hug the trunk through the branches (collisions off while climbing), perch with the head out of the crown; E there = look around (map reveal)
- [x] Grip stamina (bar under the prompt): drains with steepness and Shift, slip when empty, refills on the ground
- [x] Lakes in the world (core): 9–19 per valley, flat water, carved beds, shores; they stop map walks; no trees/scrub/village in water
- [x] Swimming: tread water when still, front crawl when moving (camera-relative), wade with high knees and drag in shallow water
- [x] Water rendering (TSL fresnel + ripples) and lakes on the map (builder)
- [x] Light follows the game hour: sun/moon path, colours, sky, fog tint, night (builder)

## Current task
None. Realism pass 2 done, PR open.

## Next action
User feel-test (climb a cliff, a boulder, a tree; swim; night). Then: sounds (steps by ground, water, wind, birds), splash/ripple effects, rivers.

## Blockers
None.

## Decisions (one line each)
- TypeScript pinned to 5.9.3 (TS 7 is the native port; Next 16 tooling targets 5.x).
- `leva` installed only because it is a peer dependency of ecctrl 2.
- No ESLint for now (not in the definition of done).
- Rapier heightfield is column-major (index = iz + ix*(n)); verified with a ray-cast script. Core stores row-major and transposes.
- ecctrl 2 has no built-in keyboard: drei KeyboardControls + setMovement each frame. Physical key codes (KeyW…) cover AZERTY ZQSD and QWERTY WASD.
- Camera: EcctrlCameraControls (camera-controls): drag to orbit, wheel to zoom, follows the player via moveTo.
- Trees and rocks have no colliders (the player walks through them); kept simple for step 1.
- Fog 40–320 m, camera far 600 m; SkyMesh scaled 5000, drawn at the far plane.
- shadows="percentage" (WebGPU dropped PCFSoftShadowMap).
- Smoke-checked once in headless Chromium with ?webgl=1: renders, the player stands on the ground and walks.
- Step 1.5: terrain gets a moisture field (core); valleys are now U-shaped and ridges wider (V-gorges made every spawn a cliff).
- Vegetation: conifers + broadleaves (some autumn gold/rust) as merged vertex-coloured geometries, instance tints, TSL wind sway (positionNode, phase from world position).
- Atmosphere: scene.fogNode = sun-tinted haze (warm toward the sun, cool away) + exponential height mist in valleys.
- Post: TSL RenderPipeline (bloom 0.28 + warm grade + vignette), AgX tone mapping; PostFX renders at useFrame priority 1.
- Player body locks X/Z rotation (enabledRotations) — it used to tip over on slopes.
- Camera: camera-controls colliderMeshes had no effect; replaced by a per-frame clamp above heightAt() + lookAt; maxPolarAngle 0.5π.
- Chromium checks: `scripts/smoke.cjs` (preinstalled Playwright, not a dependency or test suite) — 3 seeds, fails on page errors, saves screenshots. Only the WebGL fallback is checked headless.
- PR review fixes: broadleaf trunks no longer tinted by leaf colour (separate trunk mesh), keyboard input ignored when the window loses focus, duplicate tone-mapping setup removed. Everything else deferred in docs/ideas.md.
- Step 2: one world-space height function (`createHeightField`) feeds both the 12 km map (256², ~47 m cells) and the 1 km 3D scene, so step 3 can cut a 3D tile anywhere on the map.
- Heights are absolute now (no per-tile normalisation); colours/placement use `relHeight`.
- Rapier heightfield splits cells along the (ix+1,iz)–(ix,iz+1) diagonal (ray-cast check); `heightAt` follows the same triangles as the mesh and the collider.
- "Water flows downhill towards people": a 1.2 % regional tilt toward a seeded exit bearing; the village is the lowest gentle spot 4.5–5.5 km away in that direction, and must be reachable (flood fill with the walking rules).
- Scrub = independent noise patches (~7 %), never within 300 m of the start (height-based scrub walled off the lowlands).
- Balance (Node sims, 10 seeds): best route ≈ 3.3–4.1 h of walking; a blind "climb + go downhill" bot wins ~50 % in 3 days. Tune after playtests.
- Climbing a viewpoint can spot the village's smoke column even without line of sight (distance < view radius + 1 km).
- 3D physics: 2 500 fixed cylinder colliders (trunks, rocks) created imperatively via useRapier; ecctrl slopeMaxAngle 0.7 rad (was 72°: you could walk up cliffs); respawn if the body ends 30 m under the lowest ground.
- Map UI (/map) built by the builder agent: renderMap.ts (hillshade, contours, fog), MapView.tsx (click = bearing, Walk/Climb/Rest, HUD, end panel, Enter/C/R keys).
- Step 3: `sampleTile(field, x, z)` cuts a 1 km 3D tile anywhere; tile centres snap to the 3.9 m vertex grid so overlapping tiles share vertices (verified: 70/70 identical trees in an overlap).
- Placement is per 250 m world chunk with its own RNG (`name:cx:cz`), every candidate draws the same numbers whether kept or not; site height uses `worldRel` (fixed 30–290 m range) instead of per-tile normalisation.
- Scrub bushes: jittered 3.5 m world grid where `field.scrub`, wide cylinder colliders (impassable), up to 9 000 per tile (~4–5k typical).
- /map folded into /play (`game/ui/Game.tsx` switches layers; three/webgpu is only loaded when entering 3D). Map: X / "Explore on foot". 3D: E climb (≤2.5 m from a trunk or rock), M back; position and time (×20) written back via `explore()`.
- Rapier world may already be freed when the scene unmounts: collider cleanup is wrapped in try/catch (was a wasm "unreachable").
- Realism 1: gait maths in `game/world/gait.ts` (pure, no allocation): stride = (0.8 + 0.3 v)·(1 − 0.45·uphill), duty 0.62 walk → 0.35 run, foot planted during stance, cosine swing arc; IK thigh 0.43 / shin 0.42 m; pelvis drops when a foot can't be reached, which gives the natural walking bob.
- Uphill slowdown without setState: an impulse −v·m·0.2(1/f − 1) balances ecctrl's push at f × max speed (f = Tobler factor).
- Camera occluders = crowns/rocks as vertical cylinders in a Float32Array, segment test each frame (only those within 25 m), plus 8 terrain samples along the line of sight; pull in immediately, ease back out.
- Realism 2: Player is a mode machine (ground / climb / mantle / swim). In non-ground modes ecctrl is disabled (React state toggled on mode changes only) and the body is driven by velocity toward a target with gain min(10, 0.8/dt): a plain ×10 gain diverged when a slow frame ran several physics steps.
- Climbing trees turns the player collider's collision groups off (0x00010000), not a sensor: a sensor-only body loses its mass in Rapier.
- Terrain climb starts when walking into ground rising > 0.84 (40°) within 0.7 m, even if ecctrl says "not grounded" (it does not count slopes above slopeMaxAngle as ground).
- Lakes: one chance per 1.2 km chunk, level = lowest rim point − 0.6 m, accepted when rim height spread < 30 m; shore rises 35 % over 80 m so it always meets the terrain.
- `?debug=1` exposes `window.__bearingTeleport(x, z, yaw)` and `window.__bearingWorld` (climbables, water, height) and shows the mode in the prompt; used by scenario scripts.
- Issue #6 (crash "recursive use of an object… unsafe aliasing in rust" under `next dev`): React StrictMode double-mount. `<Physics>` frees its world in a passive effect cleanup that ran before VegetationColliders' cleanup; removing the body then hit a freed/recreated world, Rapier panicked, the panic was swallowed by a try/catch and left the new world borrowed. Fix: imperative colliders live in `useLayoutEffect` (cleanup runs before passive cleanups), no try/catch. Rule: any imperative Rapier work goes in layout effects, and smoke-check under `next dev` too (StrictMode only exists there).
