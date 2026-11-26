# BEARING — Technical Architecture

*v0.2 · 26 Nov 2026 · companion to `concept.md` · v0.2: switched to the WebGPU renderer*

Goal: **a browser game that runs smoothly (60 fps on desktop, 30–60 fps on mid-range phones), built by one developer, with tools he already knows.**

---

## 1. Key decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Next.js 16 (App Router) + React 19.2 + TypeScript** | Your daily stack. One repo for the landing page, the game, and later the API (Daily Wild seeds, leaderboards, saves). Turbopack is the stable default bundler. |
| D2 | **The game runs only in the browser** (client component + `dynamic(..., { ssr: false })`) | Three.js and WebAssembly physics have no business on the server. |
| D3 | **WebGPU renderer (`three/webgpu`) on stable R3F v9**, plugged in through the Canvas's async `gl` callback. All custom shaders written in **TSL** (Three Shading Language), never raw GLSL. | The modern renderer, compute shaders available for later effects, and shaders written in TypeScript. It doesn't need the alpha R3F v10. Built-in safety net: `forceWebGL: true` runs the same renderer on its WebGL2 backend if a device or library misbehaves. |
| D4 | **Game logic lives in plain TypeScript, separate from rendering** | Testable, deterministic, independent of React re-renders. React components only *display* the state. |
| D5 | **No AI at runtime in V1** | No token costs, no moderation, no latency. |
| D6 | **Desktop first, mobile second** | The map layer suits mobile from day 1; 3D touch controls come after the desktop version is fun. |
| D7 | **Pin exact versions** | Minor framework releases occasionally regress (one hydration regression was reported on a 16.2.x release). Upgrade on purpose, not by accident. |
| D8 | **No GLSL-based libraries** | Anything built on `ShaderMaterial` / `RawShaderMaterial` (several drei helpers, `@react-three/postprocessing`) doesn't run on the WebGPU renderer. Use three's TSL/WebGPU equivalents instead (see §2). |

### WebGPU: what it gives us, what it costs

| | |
|---|---|
| **Gains now** | Modern API, lower CPU overhead per draw call, TSL shaders written in TypeScript (wind sway on vegetation, water, stylised lighting) that also compile for the WebGL2 backend |
| **Gains later** | Compute shaders: GPU grass, particles (rain, embers, wildfire smoke), possibly GPU erosion or viewshed calculation |
| **Costs** | Smaller ecosystem: some drei helpers and the postprocessing library are WebGL-only. R3F's fully integrated WebGPU support (v10) is still in alpha, so we use v9's async `gl` callback instead. |
| **Browser coverage** | Chrome/Edge desktop and Android, Safari 26 (macOS and iOS), Firefox on Windows and Apple Silicon Macs. Firefox on Android, Linux and Intel Macs isn't stable yet; there the renderer falls back to WebGL2 automatically. |

---

## 2. Stack

### Core
| Layer | Library | Notes |
|---|---|---|
| Framework | `next@16`, `react@19.2`, `react-dom@19.2` | App Router, Turbopack, React Compiler |
| 3D engine | `three` (latest r18x), imported from **`three/webgpu`** | `WebGPURenderer`; node materials; TSL from `three/tsl` |
| React bindings | `@react-three/fiber@9` | Stable line for React 19; WebGPU through the async `gl` callback. Move to v10 when it's stable. |
| Helpers | `@react-three/drei@10`, **renderer-agnostic helpers only** | ✅ KeyboardControls, useGLTF, Instances, Detailed, PerformanceMonitor, AdaptiveDpr, Html. ❌ avoid GLSL-based ones (drei `Sky`, reflectors, outline shaders…) |
| Sky / water | three addons in TSL: `SkyMesh`, `WaterMesh` (WebGPU versions) | Replace drei's GLSL `Sky` and the classic `Water` |
| Post-processing | three's own TSL post-processing (if ever needed) | `@react-three/postprocessing` is WebGL-only. None in V1. |
| Physics | `@react-three/rapier@2` | Renderer-agnostic; trimesh or heightfield colliders |
| Character controller | `ecctrl@2` | Physics-based character, camera, input, animation modules. **Verify it works with WebGPU in week 1** (it should: it's physics and camera, not shaders). |
| Game state | `zustand@5` | Vanilla stores (readable outside React, inside `useFrame`) |
| ECS (optional, later) | `koota` (pmndrs) | Only if the number of entities grows (many animals and interactables) |

### Procedural generation
| Need | Library |
|---|---|
| Seeded random numbers | `alea` |
| Noise | `simplex-noise` |
| Worker messaging | `comlink` |
| Natural scattering | Poisson disc sampling (`poisson-disk-sampling` or a small custom implementation) |

### Utilities
| Need | Library |
|---|---|
| Math, smoothing, easing | `maath` (pmndrs) |
| Fast raycasting (picking, line of sight) | `three-mesh-bvh` (geometry-side, renderer-agnostic) |
| Audio | `howler` (ambient sound, effects); drei `PositionalAudio` for 3D sound |
| Local saves | `idb-keyval` (IndexedDB) |
| Debug | `stats-gl` (supports WebGPU) + `leva`; `r3f-perf` may not report correctly under WebGPU |
| Device capability tiers | `detect-gpu` (via drei) + `PerformanceMonitor` |

### Assets pipeline
| Need | Tool |
|---|---|
| Models | Kenney / Quaternius (free CC0 assets), Mixamo animations for the human character |
| Optimisation | `gltfjsx --transform` (uses glTF-Transform: meshopt compression, deduplication, resizing) |
| Textures (if any) | KTX2 / Basis via glTF-Transform. Prefer **vertex colours, no textures** |

### Interface, backend and testing
| Need | Tool |
|---|---|
| Interface overlays | Tailwind + shadcn/ui on top of the canvas |
| Backend (V1.5+) | Next.js route handlers + PostgreSQL + Prisma |
| Unit tests | Vitest (generation determinism, rules) |
| End-to-end smoke tests | Playwright (game loads, canvas renders, no console errors) |

---

## 3. Project structure

```
bearing/
├── app/
│   ├── page.tsx                  # landing page (server component)
│   ├── play/
│   │   ├── page.tsx              # layout + interface shell (server)
│   │   └── GameLoader.tsx        # 'use client' + dynamic({ ssr: false })
│   ├── daily/page.tsx            # Daily Wild entry (V1.5)
│   └── api/                      # leaderboard, saves (V1.5)
├── game/
│   ├── core/                     # PURE TypeScript: no React, no three
│   │   ├── rng.ts                # seeded random number generator
│   │   ├── terrain.ts            # heightmap generation
│   │   ├── biomes.ts             # moisture/temperature → biome
│   │   ├── rivers.ts             # downhill tracing from springs
│   │   ├── placement.ts          # set pieces, vegetation (Poisson)
│   │   ├── validate.ts           # pathfinding: is the exit reachable?
│   │   ├── travel.ts             # fast-forward simulation (map layer)
│   │   ├── rules.ts              # weather, energy, time, stop events
│   │   └── types.ts
│   ├── workers/
│   │   └── generate.worker.ts    # runs core/* off the main thread (comlink)
│   ├── state/
│   │   ├── run.ts                # zustand: current run (day, hour, energy, position, revealed map)
│   │   └── settings.ts           # zustand: quality tier, audio, controls, forceWebGL
│   ├── render/
│   │   ├── renderer.ts           # WebGPURenderer factory (+ forceWebGL switch)
│   │   ├── three-elements.d.ts   # JSX types for three/webgpu
│   │   └── tsl/                  # TSL shader nodes (wind sway, water, terrain colouring)
│   ├── world/                    # R3F views (3D layer)
│   │   ├── Scene.tsx             # Canvas + lights + fog + Physics
│   │   ├── Terrain.tsx
│   │   ├── Vegetation.tsx        # instanced meshes, one batch per area
│   │   ├── Water.tsx             # WaterMesh (TSL)
│   │   ├── Player.tsx            # ecctrl + animated model
│   │   └── Sky.tsx               # SkyMesh (TSL)
│   ├── map/                      # 2D map layer
│   │   ├── MapView.tsx           # canvas 2D (or OffscreenCanvas)
│   │   └── renderMap.ts          # heightmap + fog of war → pixels
│   ├── input/
│   ├── audio/
│   └── ui/                       # HUD, menus (Tailwind/shadcn)
├── public/assets/                # .glb, audio (cached as immutable)
└── tests/
    ├── core/*.test.ts            # Vitest: same seed → same world
    └── e2e/*.spec.ts             # Playwright
```

**Rule:** `game/core` never imports `react`, `three` or anything from the browser. It can run in Node (tests), in a Worker, or on the server (validating a Daily Wild seed or a leaderboard score).

---

## 4. Next.js 16 setup

```bash
npx create-next-app@latest bearing --ts --tailwind --app
cd bearing
npm i three @react-three/fiber @react-three/drei @react-three/rapier ecctrl \
      zustand alea simplex-noise comlink maath three-mesh-bvh howler idb-keyval
npm i -D @types/three stats-gl leva babel-plugin-react-compiler vitest @playwright/test
```

**`next.config.ts`**
```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactCompiler: true,           // stable in Next 16
  transpilePackages: ['three'],  // only needed if a three add-on breaks the build
  async headers() {
    return [
      {
        source: '/assets/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ]
  },
}

export default nextConfig
```

**`app/play/GameLoader.tsx`**
```tsx
'use client'
import dynamic from 'next/dynamic'

const Game = dynamic(() => import('@/game/world/Scene'), {
  ssr: false,
  loading: () => <p className="p-4">Loading the valley…</p>,
})

export default function GameLoader() {
  return <Game />
}
```

**`app/play/page.tsx`**
```tsx
import GameLoader from './GameLoader'

export default function PlayPage() {
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-neutral-300">
      <GameLoader />
      {/* HUD overlays: absolutely positioned shadcn components */}
    </main>
  )
}
```

Because `three/webgpu` is only imported inside the `ssr: false` chunk, it never runs on the server.

### React Compiler and R3F
- The compiler memoises components automatically, which is good for the interface.
- R3F per-frame code mutates refs inside `useFrame`, which is compatible.
- If a hot 3D component behaves oddly, opt it out with the `'use no memo'` directive at the top of the component.

### Next.js 16 notes
- Minimum Node.js version is 20.9.
- `middleware.ts` is now `proxy.ts` (only relevant if you add auth later).
- Cache Components / `'use cache'` only apply to server parts (landing page, leaderboard reads), never to the game.

---

## 5. Rendering setup (WebGPU)

**`game/render/three-elements.d.ts`**: JSX types for the WebGPU build of three
```ts
import type * as THREE from 'three/webgpu'
import type { ThreeToJSXElements } from '@react-three/fiber'

declare module '@react-three/fiber' {
  interface ThreeElements extends ThreeToJSXElements<typeof THREE> {}
}
```

**`game/render/renderer.ts`**
```ts
import * as THREE from 'three/webgpu'
import { extend } from '@react-three/fiber'

extend(THREE as any) // register three/webgpu classes as JSX elements

export function createRenderer(forceWebGL = false) {
  return async (props: any) => {
    const renderer = new THREE.WebGPURenderer({
      ...props,
      antialias: true,
      powerPreference: 'high-performance',
      forceWebGL, // safety net: same renderer, WebGL2 backend
    })
    await renderer.init()
    return renderer
  }
}
```

**`game/world/Scene.tsx`**
```tsx
'use client'
import { Canvas } from '@react-three/fiber'
import { KeyboardControls, PerformanceMonitor } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { useState } from 'react'
import { createRenderer } from '@/game/render/renderer'
import { useSettings } from '@/game/state/settings'

export default function Scene() {
  const [dpr, setDpr] = useState(1.5)
  const forceWebGL = useSettings((s) => s.forceWebGL)

  return (
    <KeyboardControls map={keyboardMap}>
      <Canvas
        key={forceWebGL ? 'webgl' : 'webgpu'} // remount if the backend is switched
        gl={createRenderer(forceWebGL)}
        dpr={dpr}
        shadows
        camera={{ fov: 60, near: 0.1, far: 300 }}
      >
        <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} />
        <color attach="background" args={['#cfd8dc']} />
        <fog attach="fog" args={['#cfd8dc', 30, 160]} />
        <hemisphereLight args={['#dfe8f0', '#5a4a3a', 0.8]} />
        <SunLight /> {/* directional light; shadow camera follows the player */}
        <Sky />      {/* SkyMesh (TSL) */}

        <Physics timeStep={1 / 60}>
          <Terrain />
          <Vegetation />
          <Player />
        </Physics>
      </Canvas>
    </KeyboardControls>
  )
}
```

### Materials under WebGPU
- Built-in materials (`MeshLambertMaterial`, `MeshToonMaterial`, `MeshStandardMaterial`…) work as-is; the renderer converts them to node materials.
- For custom effects, use node materials (`MeshLambertNodeMaterial`…) with TSL nodes, e.g. a `positionNode` for wind sway on vegetation, or a `colorNode` for terrain colouring by height and slope.
- **Never** `ShaderMaterial` / `RawShaderMaterial` (GLSL): they don't run on this renderer.

### Compute shaders (later, not V1)
Candidates once the game is fun: GPU grass around the player, rain and ember particles, wildfire smoke. Keep these behind the quality tier, and give them a fallback (or simply turn them off) when `forceWebGL` is on, since compute isn't available on the WebGL2 backend.

---

## 6. Game state pattern

**Two kinds of state, two places:**

| Kind | Example | Where |
|---|---|---|
| Per-frame, high-frequency | Player position, velocity, camera | Refs, Rapier bodies, Three.js objects. **Never React state.** |
| Game state, low-frequency | Day, hour, energy, revealed map, weather, current layer (map or 3D) | zustand vanilla store |

```ts
// game/state/run.ts
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

type Layer = 'map' | 'world'

type RunState = {
  seed: string
  day: number
  hour: number
  energy: number
  layer: Layer
  setLayer: (l: Layer) => void
  spendTime: (hours: number) => void
}

export const runStore = createStore<RunState>()((set) => ({
  seed: 'valley-001',
  day: 1,
  hour: 7,
  energy: 1,
  layer: 'world',
  setLayer: (layer) => set({ layer }),
  spendTime: (h) =>
    set((s) => {
      const total = s.hour + h
      return { hour: total % 24, day: s.day + Math.floor(total / 24) }
    }),
}))

export const useRun = <T,>(selector: (s: RunState) => T) => useStore(runStore, selector)
```

- In React interface components: `useRun((s) => s.day)`. Each component re-renders only when its slice changes.
- In `useFrame`: `runStore.getState()`. No re-render at all.

---

## 7. Procedural generation pipeline

Runs in a **Web Worker** so the main thread never stutters.

```
seed
 └─► heightmap (layered simplex noise + domain warping)
      └─► moisture/temperature maps → biomes
           └─► rivers (traced downhill from springs, carving the heightmap)
                └─► set pieces placed by rules (cabin, hut, cave, exit)
                     └─► vegetation scattered with Poisson disc sampling, per biome
                          └─► validation (A* pathfinding: exit reachable within the days allowed?)
                               ├─ fail → next seed variant
                               └─ ok → transfer heightmap + placements to the main thread
```

```ts
// game/workers/generate.worker.ts
import { expose } from 'comlink'
import { generateValley } from '../core/terrain'

expose({ generateValley })
```

```ts
// main thread
import { wrap } from 'comlink'

const worker = new Worker(new URL('../workers/generate.worker.ts', import.meta.url), { type: 'module' })
const api = wrap<typeof import('../workers/generate.worker')>(worker)
const valley = await api.generateValley('valley-001')
```

### Data formats
- Heightmap as a `Float32Array` (transferable to the main thread at no cost).
- Two resolutions:
  - **Coarse** (e.g. 256×256 for a 2×2 km valley) for the map layer, travel simulation and validation.
  - **Detailed** local tile (e.g. 128×128 vertices over 200×200 m) generated at each stop for the 3D layer.

### Determinism
- One seeded random generator **per subsystem** (`rng('terrain')`, `rng('rivers')`…), so tuning one system doesn't reshuffle the others.
- Vitest snapshot test: `generateValley('test-seed')` returns the same hash every run.
- Generation stays on the CPU (in the worker), even with WebGPU available. GPU results can differ slightly between devices, which would break "same seed, same valley" and server-side score validation.

---

## 8. The two layers technically

### Map layer (2D)
- A 2D canvas drawn from the coarse heightmap: hillshading + biome colours + rivers, masked by a **fog-of-war buffer** (`Uint8Array`, one value per cell: unseen, seen far, seen near).
- **Viewshed** (what you can see from a viewpoint): computed on the heightmap in the worker by casting rays from the viewpoint. Cheap at 256×256.
- The fast-forward walk is pure `core/travel.ts`. It moves along the bearing, checks slope, water and vegetation each step, and returns a stop event.
- **While the map is open, the 3D canvas stops rendering** (`frameloop="never"`, or unmount it). That saves battery on phones.

### 3D layer (stop scene)
- Detailed tile generated around the stop position from the same seed, so the 3D view matches the map exactly.
- Collider: trimesh for the prototype; switch to a Rapier **heightfield** collider later (cheaper).
- Fog distance about 120–160 m; the tile edge is never visible.
- Back to the map: write the player's new position and spent time to the store, then show the map layer.

---

## 9. Performance budget

| Metric | Desktop target | Mobile target |
|---|---|---|
| Frame time | ≤ 16.6 ms (60 fps) | ≤ 33 ms (30 fps min), aim for 60 |
| Draw calls | < 150 | < 80 |
| Triangles on screen | < 500k | < 250k |
| Pixel ratio | 1.5 max | 1–1.5, adaptive |
| Texture memory | < 100 MB | < 50 MB |
| First load (JS + assets) | < 5 MB | < 5 MB |

### Rules
1. **Instancing for everything repeated** (trees, rocks, bushes). Split instances per area so off-screen batches are skipped: one huge `InstancedMesh` is culled as a single object.
2. **Cheap materials:** Lambert / Toon (or their node-material versions) + vertex colours + flat shading. Avoid Standard (physically based) materials except for the hero character.
3. **One directional light + one hemisphere light.** No point lights. A single shadow map (1024–2048 px) whose camera follows the player.
4. **Fog always**, with the camera's far plane just beyond the fog.
5. **Levels of detail** for trees with drei `<Detailed>`: low-poly far away, billboards for the farthest.
6. **No garbage in the frame loop:** reuse module-level `Vector3` and `Quaternion` objects; never create objects in `useFrame`.
7. **Never call `setState` in `useFrame`.**
8. **Dispose** geometries and materials when a tile unloads.
9. **Quality tiers** (low / medium / high) from `detect-gpu` + `PerformanceMonitor`: shadows off, shorter fog, fewer instances on low.
10. **Post-processing: none in V1.** Colour grading via fog and sky colours is enough.
11. **Lazy-load** the game route, Rapier's WebAssembly and models; `useGLTF.preload` for the character.
12. **Test on real devices every week:** a mid-range Android phone (Chrome), an iPhone (Safari 26), and once with `forceWebGL` on (`next dev --hostname 0.0.0.0` on your local network).
13. **Warm up shaders.** WebGPU compiles pipelines on first use, which can cause a hitch the first time a material appears. Render every material once during the loading screen (`renderer.compileAsync(scene, camera)`).

### Profiling tools
- `stats-gl` (fps, CPU and GPU frame time; WebGPU-aware)
- Chrome DevTools Performance tab + Memory tab
- Chrome's WebGPU debugging tools (`chrome://gpu`; WebGPU DevTools extensions) instead of Spector.js, which is WebGL-only

---

## 10. Input

| Platform | Approach |
|---|---|
| Desktop | drei `KeyboardControls` (WASD / arrows, Shift run, Space jump); mouse for camera |
| Gamepad | Gamepad API (later) |
| Mobile | `ecctrl/input` virtual joystick + buttons (V1.5); the map layer uses taps (set a bearing by dragging) |

---

## 11. Audio

- `howler` for ambient loops (wind, birds, cicadas, water) and effects; cross-fade by biome and weather.
- Start audio only after the first user interaction (browser autoplay rules).
- Compressed formats: `.webm` (Opus) with an `.mp3` fallback.

---

## 12. Persistence and backend (V1.5+)

| Need | V1 | V1.5+ |
|---|---|---|
| Saves | IndexedDB (`idb-keyval`) | Optional cloud saves |
| Daily Wild seed | Derived from the date (`'daily-' + YYYY-MM-DD`), no server | Same |
| Leaderboard | — | Route handler + PostgreSQL + Prisma; **the server re-simulates the run from the seed plus the player's inputs** to validate scores (possible because `core/` is pure TypeScript and runs on the CPU) |
| Episodes | Static JSON in the repo | Same (or a small CMS later) |

---

## 13. Hosting and deploy

- **Main:** Scalingo or Vercel (Next.js server for the API later); assets served with immutable cache headers.
- **HTTPS required.** WebGPU only works in secure contexts (`localhost` is fine for development; use HTTPS when testing on a phone over the network, e.g. `next dev --experimental-https`).
- **itch.io build (optional):** a small Vite wrapper around `game/` with `base: './'`. That's why `game/` must not depend on Next.js.
- No special cross-origin headers needed (Rapier's compatibility build doesn't need `SharedArrayBuffer`).

---

## 14. Testing strategy

| Test | Tool | What |
|---|---|---|
| Determinism | Vitest | Same seed → same heightmap hash, same rivers, same placements |
| Validity | Vitest | 1,000 random seeds → 100% have a reachable exit |
| Rules | Vitest | Energy, time and weather transitions; stop events |
| Smoke | Playwright | `/play` loads, canvas present, no console errors, 10 s of movement without errors, on both the WebGPU and `forceWebGL` backends |
| Performance | Manual, weekly | stats-gl on desktop, Android and iPhone |

---

## 15. Build order (matches the concept doc)

1. **Week 1: WebGPU spike (one or two evenings).** Terrain + ecctrl capsule + fog + one shadow + SkyMesh with `WebGPURenderer`, on desktop Chrome, Android Chrome and iPhone Safari. If ecctrl or anything else blocks, note it, flip `forceWebGL`, and carry on.
2. **Week 1–2: 2D map prototype.** `core/terrain`, `core/travel`, `map/MapView`; seed → map, fog of war, viewpoint reveal, bearing, fast-forward, stops, days counter.
3. **Week 3–4: 3D stop scene.** `world/Terrain`, `world/Player` (capsule, then an animated model), vegetation instances with TSL wind sway, fog and light; switch between the map and 3D layers.
4. **Week 5+: Episode 1 vertical slice.** 5 actions, about 10 stop types, weather, day and night, audio, quality tiers, shader warm-up.
5. **Later:** Daily Wild + leaderboard, mobile touch controls, compute-shader effects (grass, rain, smoke), R3F v10 when stable, episodes 2+.

---

## 16. Open technical questions

- Valley size per level: 2×2 km? (affects coarse heightmap resolution and travel times)
- Heightfield vs trimesh collider: measure on mobile at week 3.
- Map rendering style: hillshading plus a hand-drawn filter, or a stylised contour map? (Could be drawn with TSL in the same renderer, or stay a plain 2D canvas.)
- When to adopt `koota`: only if the number of entities passes about 50 interactive entities.
- ecctrl under WebGPU: confirm in the week-1 spike.
- When R3F v10 goes stable: migrate (mainly imports and types), or stay on v9's async `gl` callback?
