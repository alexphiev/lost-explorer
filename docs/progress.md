# Progress — MVP step 1

Branch: `step-1`

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

## Current task
None. Step 1 is done; do not start step 2 without the user.

## Next action
Wait for user feedback on /play (feel, terrain steepness, camera).

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
