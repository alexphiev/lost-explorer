# Progress — MVP

Branches: `step-1`, `step-1.5` (merged in #2), `step-2` (current)

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
- [ ] core: world-space height function shared by the 6 km map and the 1 km 3D scene
- [ ] core: valley = map grid + start + village (low ground, 2–2.8 km away)
- [ ] core: viewshed (climb reveals, farther = vaguer), fog of war Uint8Array (0 unseen, 1 far, 2 near)
- [ ] core/travel: bearing walk in 2 h chunks; stops: cliff, scrub, map edge, night, exhausted, berries, smoke, village; days/hour/energy; win/lose
- [ ] state: zustand journey store calling core
- [ ] /map: canvas map (hillshade, contours, fog), click to set bearing, Walk / Climb / Rest, HUD (day, hour, energy, log)
- [ ] 3D physics: tree + rock colliders, visual triangles match the Rapier heightfield, max climbable slope, respawn if fallen
- [ ] `npm run build` + Chromium smoke (/play and /map), PR

## Current task
Step 2.

## Next action
Core refactor (terrain height function, valley, viewshed, travel).

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
