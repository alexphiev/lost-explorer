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

## Rivers and streams
- [x] Main river valley (+ one tributary valley) designed per seed: floor only descends, flows toward the exit, so the village lies by the river ("follow the water downstream")
- [x] Streams everywhere from water routing on a 50 m grid (pits filled up to 40 m, deeper hollows end in ponds): ~250 km of streams, ~35 km of rivers, 3–4 per km² tile
- [x] Each stream carves a bed and a wide gentle V valley; levels never rise downstream; stretches that would float are dry (the water drops into a deeper valley)
- [x] Depth and current by size and slope: most streams wadeable, the biggest ones and all rivers must be swum; currents 0.25–1.5 m/s (streams), 0.5–2.2 m/s (rivers)
- [x] 3D: water ribbons with ripples drifting downstream and white water where fast; ponds as small lakes
- [x] Swimming is carried by the current (stop stroking to drift); wading pushes you downstream the deeper you stand
- [x] Cold water drains energy (Warmth bar while in water; weaker strokes below 20); applied to the run when leaving the scene
- [x] Map: streams and rivers inked in blue; rivers and deep streams stop a walk, shallow ones are waded (+3 min, −1 energy)
- [x] Issue #18: climbing with hands and feet planted on the surface (IK onto holds on slope / cliff / rock / trunk, diagonal pairs reach in turn, hands push on the edge when mantling)

## Falls and health (issue #19)
- [x] Health (0–100) in the run: map bar + 3D HUD; rest +8/h, sleep +30; below 25 you can't run in 3D and walk slower (map ×0.7, 3D ×0.75); at 0 you can't walk on the map until you rest (no death)
- [x] 3D "fallen" mode: control off ~1.5–3 s, trip pose (pitch forward → hands and knees → lie flat → push up) or crumple pose on hard landings, then stand up; message in the prompt with the damage
- [x] Triggers (running only, > 4.3 m/s): into a trunk (bounce back), small rock (0.15–0.7 m) or stump ahead; across a log (40 % per log); downhill steeper than −0.55 for > 0.35 s; wet stones in a stream (0.5/s); landing > 2 m below where the jump/fall started (−5 − 1.5·(d−2)²)

## Levels, local save, map and menu rework
- [x] Campaign: 6 fixed valleys (`game/core/levels.ts`), level 1 unlocked, winning a level unlocks the next; `/play?level=N` (`&new=1` restarts), `?seed=` still works as a free valley
- [x] Real play time per level (ticks while the tab is visible), best time + in-game hours kept per level
- [x] Local save in localStorage (`game/state/save.ts`): unlocked levels, best times, run in progress per valley (fog packed 2 bits/cell), saved on every action, every 5 s and on page hide; reopening resumes on the map (or back in the 3D scene at the same tile)
- [x] Map: discovered points of interest (camps, viewpoints, berries, smoke, cliffs, scrub, deep water, village) + seen summits and lakes, hand-drawn symbols, hover tooltips, legend, scale bar; parchment/journal layout with game buttons and key hints; end screen with time, best time, next level
- [x] Main menu: title, Play/Continue, level cards (locked/done/best time/continue/restart)
- [x] Each level ends at a sign of civilisation (`game/core/goals.ts`): village, forester's cabin (in the woods, among thorns), boat (on a river bank), shepherds' cave (at a cliff foot), fishing hut (lake shore). Placed on a 3–6 km ring within 75° of where the land drains, reachable on foot; villages show from afar and smoke, the others only once seen up close
- [x] Clues (`LevelSpec.clues`): laid along a walkable route start → goal (20–78 % of the way, nudged off it), each points to the next, the last to the goal. Found when seen up close (cairns: seen at all, from a viewpoint): the walk stops, journal line with the direction, pinned on the map with an arrow. 3D props (cairn, signpost, blazed tree, fire ring, marked finds) and goal props; walking up to the goal in 3D ends the level
- [x] Level design: 1 village 3.5–4.3 km, 3 clues · 2 boat 3.8–4.8 km, 3 · 3 cave 4–5 km, 2 cairns + piton · 4 cabin 4.3–5.3 km, 2 · 5 hut 4.3–5.7 km, 2 · 6 village 5.2–6 km, 1
- [x] Review fixes: small goals finish within 30 m (villages 120 m), small clues/goals found only by passing close (not from a viewpoint's sharp fog), saves while in 3D fold in the live position/time/cold/falls, save on tab hide
- [x] 3D spawn always on the nearest flat, dry, clear ground to the map position (`safeSpawn`, ≤ 350 m away), and no fall damage during the first 4 s
- [x] Map ⇄ 3D without losing anything: the scene stays mounted, paused (`frameloop="never"`, physics paused) and hidden behind the map; coming back resumes the same tile, decor, player position and camera. Only a map walk that moves you drops it (rest / climb on the map keep it); energy, health and hour re-sync on each visit
- [x] 3D compass: heading strip at the top (camera yaw, updated in the frame loop without re-render), amber mark = bearing chosen on the map
- [ ] Accounts + database (#29), per-level leaderboard (#30)

## Water look + sounds (issue #32)
- [x] Water: deeper blue, less transparent (0.9–0.98), rolling swell moving the surface (lakes as subdivided rings, stream ribbons 5 vertices across), crests, foam on fast water; rings and churned water spreading from the player while wading/swimming (shared `wakeAt`/`wakeStrength` uniforms)
- [x] Sounds (Web Audio, synthesised, `game/world/audio.ts` + `SoundScape.tsx`): footsteps on each half gait cycle by ground (grass, rock/scree, water) and pace, swim strokes, climbing knocks; stream babble / river rush by distance and current; wind by height with gusts; birds by day. Starts on first input, suspended behind the map, mute button / N (kept in localStorage)

## Playtest 3 fixes
- [x] Ambient noise beds (stream, river, wind) −75 %; birds and steps unchanged
- [x] Thorny scrub passable in 3D: no colliders, walking speed ×0.4 inside it (prompt), bushes lean away from the body and quiver with the pace (`bushMaterial`, player uniforms); on the map the 2 h walk still stops at scrub (explore on foot to push through)
- [x] 3D spawn never inside or right next to scrub
- [x] Water, take 2: partly self-lit (emissive 0.45: without an env map the PBR surface went near black), colour by per-vertex depth (turquoise shallows → clear blue), soft shoreline (alpha fades where the water thins instead of the terrain's jagged cut), stream ribbons 7 vertices across; wake rings now white-crested, wider and stronger, churned water around the body
- [x] Wake, take 3: no more big concentric rings. Moving: a V trailing behind along the swim direction (arms at ~20°, faint white) with small transverse ripples inside; always: small ripples and a little foam right at the body. Swim stroke sound: falling low-pass slosh + bubbly blips (no hiss); water steps the same way
- [x] Water sound another −55 % (babble 0.035, rush 0.05); footsteps −65 %, swim strokes −50 %

## Current task
None. Playtest 3 fixes done.

## Next action
User playtest of the menu, map markers and resume. Then #29/#30 when a database is wanted.

## Blockers
None.

## Decisions (one line each)
- Local save in localStorage, not a cookie: the fog of war alone is ~22 KB (cookies cap at 4 KB) and nothing needs to reach a server yet.
- Footstep sounds create a few one-shot Web Audio nodes per step from the frame loop: Web Audio nodes can't be reused; it is a handful per second, not per frame.
- The 3D scene is kept alive behind the map rather than rebuilt: exact position, decor and camera, at the cost of keeping its GPU resources while on the map.
- Level links are plain `<a>` (full reload): the game store and the WebGPU scene start clean for each level.
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
- Movement feel (playtest feedback): walk 2.4 m/s, run 6.2 m/s, Shift is hold-to-run (ecctrl's default `enableToggleRun` made it a toggle, so "running did nothing"). Slope factor is a gameplay curve (`slopeSpeedFactor`): uphill down to 55 %, descents up to +15 %, very steep descents ≥ 80 % (Tobler made descents as slow as climbs). The slope impulse is calibrated on ecctrl's real per-frame gain `accDeltaTime × slideFriction` (the old brake assumed `accDeltaTime` alone and was twice too strong).
- Climbing: no more drift into the slope (the player climbed by itself); grip only drains on walls (>~55°), refills while resting on slabs; the grip widget is hidden unless draining and labelled "Grip"; prompt says "Climbing · Space jump off". Auto-climb needs >42° over the next 1.5 m (was 40° over 0.7 m: bumps triggered it).
- Headless Chromium runs at ~3 fps: ecctrl and our impulses act once per frame while Rapier runs many steps, so absolute speeds measured there are meaningless; compare ratios only, and judge feel in a real browser.
- Sky: the SkyMesh is drawn at the far plane, so `scene.fogNode` turned it uniformly white; its material now has `fog = false`. Its HDR output was also washed out by AgX: the sky colour node is scaled ×0.42 and saturated ×1.35 in TSL. Clearer air (turbidity 2.4, rayleigh 1.4).
- Surfaces: `game/render/tsl/surface.ts` adds a procedural GPU "texture" (3 scales of `mx_noise_float` on world position, multiplied with vertex/instance colours): terrain (+ rock strata on steep faces, grass speckles), rocks, and every wind-swayed plant. No image textures.
- Small decor (`placeDecor`, `Decor.tsx`): pebbles, ferns, shrubs with berries, mushrooms, fallen logs and stumps (with colliders), dead branches — ~10k instances, only within 220 m of the player (fog hides the rest), per-world-chunk deterministic.
- Sky follow-up (playtest screenshots): saturation ×1.35 turned the zenith violet → now ×1.08 and scale ×0.5, rayleigh 1.1. Looking at the sun gave a white veil over half the screen (bloom fed by huge HDR sky values) → bloom input capped at 3, threshold 1.1, strength 0.22, radius 0.3: disc + soft halo. Camera may tilt slightly above the horizon (maxPolarAngle 0.62π) to look at the sky.
- Rivers: a designed main valley + tributary give a drained backbone; the noise terrain alone is ~1/3 closed hollows (up to 70 m deep), so pure flow routing gave gorges everywhere.
- Stream valleys are wide V's (bank 0.25 + 0.1·e + 0.0016·e² m within 170 m); upstream of a segment its carve uses the water level alongside upstream, so steep stretches don't undercut themselves.
- Streams are 6–9 m wide: narrower ones fall between the 3.9 m vertices of the 3D mesh and show as dashes.
- Cold water: −0.22 energy/s swimming (+0.12 in strong current), −0.04·wade/s wading; stored in runStore.coldLoss (frame loop), applied in leaveScene.
- Run form (#23): arms blend from the walk swing to a shoulder-driven run swing (upper arm −0.45…+0.85 rad, more back than forward, elbow ~80–92°, slight inward rotation) instead of a fixed 1.3 rad elbow bend that put the hands up in a boxer guard; run lean capped at ~8° (was ~18°), heel kick + knee drive in the swing phase, 3.5 cm mid-stance compression.
- Climbing limbs: world-fixed holds per hand/foot, projected onto the surface (terrain via `heightAt` along the slope normal, rocks/trunks as cylinders); a diagonal pair reaches when a hold is > 0.3 m from its ideal spot, lands 0.15 m ahead; or when a supporting limb passes 90 % of its reach; 3D two-bone IK `solveLimb` (gait.ts) solves the full XYZ root rotation with a pole (elbows out, knees forward), legs to the ankle pivot (0.36 m) with the boot contact offset; body pushed to 0.4 m off the surface and pitched parallel to it.
- Falls: trip hazards are a compact Float32Array (trunks, rocks, stumps, logs) tested by proximity in the frame loop, not contact events; damage is per-scene runStore.injury applied in leaveScene (same pattern as coldLoss). Random rolls use Math.random (gameplay, not generation).
- Sun glare (issue #25): Mie lobe tighter (g 0.93, coef 0.0025), sky brightness near the sun compressed and warmed, bloom 0.12 / radius 0.15 on input capped at 2.
- Run arms (playtest 2): full fore-aft pump, tanh of the thigh split (−0.6 → +1.1 rad), no upper-arm twist (it crossed the forearms in front). Climbing: holds 0.45 / lead 0.25, swing 0.38 s, climb ~25 % faster; head tips back 0.35–0.6 rad to look up.
