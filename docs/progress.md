# Progress — MVP step 1

Branch: `step-1`

## Definition of done
- [ ] Next.js 16 + React 19.2 + TypeScript + Tailwind, exact versions pinned
- [ ] Structure (§3) limited to: app/play, game/core, game/state, game/render, game/world
- [ ] WebGPU via async `gl` callback, `forceWebGL` fallback via `?webgl=1`
- [ ] 1000×1000 m seeded terrain in game/core (alea + simplex-noise): hills, ridges, valleys; random seed per load, shown top-left, replayable via `?seed=xxx`
- [ ] Vertex colours by altitude/slope (meadow, forest, rock), Lambert, flat shading
- [ ] Rapier heightfield collider (trimesh fallback)
- [ ] ~2000 trees (cone+cylinder) + 500 rocks, instanced, deterministic, not on steep slopes
- [ ] Low-poly primitive humanoid with procedural arm/leg swing
- [ ] ecctrl controls: ZQSD/WASD/arrows, Shift run, Space jump, mouse 3rd-person camera
- [ ] Fog, sky (SkyMesh TSL or bg colour), directional + hemisphere light, one shadow
- [ ] Spawn at centre on the ground, invisible walls at map edges
- [ ] `npm run build` passes

## Current task
Scaffolding Next.js project.

## Next action
Write package.json/config, install, then game/core terrain.

## Blockers
None.

## Decisions (one line each)
- TypeScript pinned to 5.9.3 (TS 7 is the native port; Next 16 tooling targets 5.x).
- `leva` installed only because it is a peer dependency of ecctrl 2.
- No ESLint for now (not in the definition of done).
