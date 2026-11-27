'use client'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Vector3 } from 'three/webgpu'
import { KeyboardControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { createRenderer } from '@/game/render/renderer'
import { useSettings } from '@/game/state/settings'
import { runStore } from '@/game/state/run'
import { SCENE_TIME_SCALE, useJourney } from '@/game/state/journey'
import { heightAt, sampleTile } from '@/game/core/terrain'
import { anchorIn, safeSpawn, placeDecor, placeVegetation, placeVillage } from '@/game/core/placement'
import { DAYS_ALLOWED, formatHour, HURT } from '@/game/core/travel'
import type { Point, Valley } from '@/game/core/valley'
import type { WaterSample } from '@/game/core/rivers'
import { HAZE_COOL } from '@/game/render/tsl/atmosphere'
import Terrain from './Terrain'
import Vegetation, { rockSquash, ROCK_SINK, TREE_SINK } from './Vegetation'
import Player, { CLIMB_STRIDE, HAZARD_STRIDE, keyboardMap, type PlayerHud } from './Player'
import Water from './Water'
import SoundScape from './SoundScape'
import Daylight, { DaylightFog, SUN_DIR } from './Daylight'
import PostFX from './PostFX'
import Village from './Village'
import { ClueProp, GoalProp } from './Landmarks'
import Decor, { LOG_HALF, LOG_R } from './Decor'


const PX_PER_DEG = 2.4
const COMPASS_W = 320
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/** Writes the camera heading into the compass strip every frame (no re-render, no allocation). */
function Heading({ target }: { target: React.RefObject<HTMLDivElement | null> }) {
  const fwd = useMemo(() => new Vector3(), [])
  useFrame(({ camera }) => {
    const el = target.current
    if (!el) return
    camera.getWorldDirection(fwd)
    const deg = ((Math.atan2(fwd.x, -fwd.z) * 180) / Math.PI + 360) % 360 // clockwise from north (−z)
    el.style.transform = `translateX(${COMPASS_W / 2 - (deg + 360) * PX_PER_DEG}px)`
  })
  return null
}

/** Heading strip at the top of the screen; the red mark is the bearing chosen on the map. */
function Compass({ strip, bearing }: { strip: React.RefObject<HTMLDivElement | null>; bearing: number | null }) {
  // three turns so the window never runs out while wrapping
  const ticks = useMemo(() => Array.from({ length: 3 * 24 }, (_, i) => i * 15), [])
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
      <div className="relative h-9 overflow-hidden rounded-md border border-white/25 bg-black/45 font-mono text-white shadow" style={{ width: COMPASS_W }}>
        <div ref={strip} className="absolute left-0 top-0 h-full will-change-transform">
          {ticks.map((d) => {
            const a = d % 360
            const label = a % 45 === 0 ? POINTS[a / 45] : null
            return (
              <div key={d} className="absolute top-0 flex h-full flex-col items-center" style={{ left: d * PX_PER_DEG, transform: 'translateX(-50%)' }}>
                <div className={label ? 'h-2 w-px bg-white' : 'h-1.5 w-px bg-white/50'} />
                {label && <span className={`text-xs ${a === 0 ? 'font-bold text-red-400' : ''}`}>{label}</span>}
              </div>
            )
          })}
          {bearing !== null &&
            [0, 1, 2].map((k) => (
              <div key={k} className="absolute bottom-0 h-0 w-0 border-x-[6px] border-b-[8px] border-x-transparent border-b-amber-400" style={{ left: (bearing + k * 360) * PX_PER_DEG - 6 }} title="Your bearing" />
            ))}
        </div>
        <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-amber-300/90" />
      </div>
      {bearing !== null && <div className="mt-0.5 text-center text-[10px] text-white/80 drop-shadow">▲ your bearing {Math.round(bearing)}°</div>}
    </div>
  )
}

/**
 * The 3D stop scene. It stays mounted (paused, hidden) while the player only looks at the map, so the tile, the player and
 * the camera are exactly where they were when they come back; it is rebuilt only after a map walk moves them.
 */
export default function Scene({ valley, center, active }: { valley: Valley; center: Point; active: boolean }) {
  const forceWebGL = useSettings((s) => s.forceWebGL)
  const muted = useSettings((s) => s.muted)
  const run = useJourney((s) => s.run)
  const leaveScene = useJourney((s) => s.leaveScene)
  const hud = useRef<PlayerHud>({ prompt: null, grip: null, gripBox: null, warmth: null, warmthBox: null })
  // one visit = from entering (or coming back from the map) to leaving. Energy, health and hour when it started:
  // cold water (runStore.coldLoss) and falls (runStore.injury) eat into them, applied when you leave.
  const [visit, setVisit] = useState(() => ({ enteredAt: performance.now(), energy: run?.energy ?? 100, health: run?.health ?? 100, hour: run?.hour ?? 12 }))
  const { enteredAt, energy: startEnergy, health: startHealth } = visit
  const wasActive = useRef(active)
  useEffect(() => {
    if (active && !wasActive.current) {
      const r = useJourney.getState().run
      setVisit({ enteredAt: performance.now(), energy: r?.energy ?? 100, health: r?.health ?? 100, hour: r?.hour ?? 12 })
      setElapsed(0)
    }
    wasActive.current = active
  }, [active])
  useEffect(() => {
    if (!active) return
    runStore.getState().coldLoss = 0
    runStore.getState().injury = 0
    runStore.getState().sceneEnteredAt = enteredAt
    return () => {
      runStore.getState().sceneEnteredAt = 0
    }
  }, [enteredAt, active])
  const [elapsed, setElapsed] = useState(0)
  const compass = useRef<HTMLDivElement>(null)
  const bearing = useJourney((s) => s.bearing)

  const world = useMemo(() => {
    const terrain = sampleTile(valley.field, center.x, center.z)
    const vegetation = placeVegetation(terrain, valley.field, valley.seed)
    // appear where you stood on the map, or the nearest flat, safe ground
    const run = useJourney.getState().run
    const at = safeSpawn(terrain, valley.field, vegetation, (run?.x ?? center.x) - center.x, (run?.z ?? center.z) - center.z)
    return {
      terrain,
      vegetation,
      decor: placeDecor(terrain, valley.field, valley.seed),
      houses: valley.goal.kind === 'village' ? placeVillage(terrain, valley.field, valley.seed, valley.village.x, valley.village.z) : [],
      goal: valley.goal.kind === 'village' ? null : anchorIn(terrain, valley.goal.x, valley.goal.z, valley.goal.rotation),
      clues: valley.clues.flatMap((c) => {
        const at = anchorIn(terrain, c.x, c.z, Math.PI / 2 - (c.bearing * Math.PI) / 180, 5)
        return at ? [{ kind: c.kind, at }] : []
      }),
      spawn: [at.x, heightAt(terrain, at.x, at.z) + 1.2, at.z] as [number, number, number],
    }
  }, [valley, center])

  // camera occluders: tree crowns and rocks as vertical cylinders [x, z, yBottom, yTop, radius]
  const occluders = useMemo(() => {
    const v = world.vegetation
    const out = new Float32Array((v.conifers.length + v.broadleaves.length + v.rocks.length) * 5)
    let o = 0
    const add = (x: number, z: number, y0: number, y1: number, r: number) => {
      out[o++] = x
      out[o++] = z
      out[o++] = y0
      out[o++] = y1
      out[o++] = r
    }
    for (const it of v.conifers) add(it.x, it.z, it.y + 1.3 * it.scale, it.y + 8.2 * it.scale, 1.5 * it.scale)
    for (const it of v.broadleaves) add(it.x, it.z, it.y + 2.2 * it.scale, it.y + 6.3 * it.scale, 2.0 * it.scale)
    for (const it of v.rocks) add(it.x, it.z, it.y - it.scale, it.y + it.scale * 0.6, it.scale * 0.9)
    return out
  }, [world])

  // game clock shown in the HUD (not in the frame loop)
  // walking up to the goal ends the level
  useEffect(() => {
    const gx = valley.village.x - world.terrain.centerX
    const gz = valley.village.z - world.terrain.centerZ
    const reach = valley.goal.kind === 'village' ? 60 : 12
    if (!active) return
    const id = setInterval(() => {
      const secs = (performance.now() - enteredAt) / 1000
      setElapsed(secs)
      const p = runStore.getState().playerPosition
      if (Math.hypot(p.x - gx, p.z - gz) < reach) leaveScene(p.x, p.z, secs, false)
    }, 1000)
    return () => clearInterval(id)
  }, [enteredAt, valley, world, leaveScene, active])

  // M = back to the map (letter by key, not code, so AZERTY works). E (climb / look around) lives in Player.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'n') return useSettings.getState().setMuted(!useSettings.getState().muted)
      if (e.key.toLowerCase() !== 'm') return
      const p = runStore.getState().playerPosition
      leaveScene(p.x, p.z, (performance.now() - enteredAt) / 1000, false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enteredAt, leaveScene, active])

  // looking around from a tree top or a rock = the map's "climb" reveal from this spot
  const onLookAround = useCallback(() => {
    const p = runStore.getState().playerPosition
    leaveScene(p.x, p.z, (performance.now() - enteredAt) / 1000, true)
  }, [enteredAt, leaveScene])

  const waterAt = useCallback(
    (x: number, z: number) => valley.field.water(x + world.terrain.centerX, z + world.terrain.centerZ),
    [valley, world],
  )
  const streamAt = useCallback(
    (x: number, z: number, out: WaterSample) => valley.field.stream(x + world.terrain.centerX, z + world.terrain.centerZ, out),
    [valley, world],
  )

  // climbables: [x, z, yGround, yTop, climbRadius, type] — rocks (top = collider top) and trees (perch height)
  const climbables = useMemo(() => {
    const v = world.vegetation
    const out = new Float32Array((v.rocks.length + v.conifers.length + v.broadleaves.length) * CLIMB_STRIDE)
    let o = 0
    const add = (x: number, z: number, y0: number, y1: number, r: number, type: number) => {
      out[o++] = x
      out[o++] = z
      out[o++] = y0
      out[o++] = y1
      out[o++] = r
      out[o++] = type
    }
    // rocks: climbing radius = collider radius + capsule radius + a little air
    for (const it of v.rocks) add(it.x, it.z, it.y, it.y - ROCK_SINK * it.scale + it.scale * rockSquash(it) * 0.85, it.scale * 0.8 + 0.35, 0)
    // trees: hug the trunk (collisions are off while climbing a tree); perch just under the top so the head pokes out
    for (const it of v.conifers) add(it.x, it.z, it.y, it.y + (7.4 - TREE_SINK) * it.scale - 1.3, it.scale * 0.2 + 0.28, 1)
    for (const it of v.broadleaves) add(it.x, it.z, it.y, it.y + (5.6 - TREE_SINK) * it.scale - 1.4, it.scale * 0.25 + 0.28, 1)
    return out
  }, [world])

  // trip hazards: [x, z, yGround, top, radius, type, axisX, axisZ, halfLength] — type 0 trunk, 1 rock, 2 stump, 3 log
  const hazards = useMemo(() => {
    const v = world.vegetation
    const d = world.decor
    const out = new Float32Array((v.conifers.length + v.broadleaves.length + v.rocks.length + d.stumps.length + d.logs.length) * HAZARD_STRIDE)
    let o = 0
    const add = (x: number, z: number, y0: number, y1: number, r: number, type: number, ax: number, az: number, half: number) => {
      out[o++] = x
      out[o++] = z
      out[o++] = y0
      out[o++] = y1
      out[o++] = r
      out[o++] = type
      out[o++] = ax
      out[o++] = az
      out[o++] = half
    }
    for (const it of v.conifers) add(it.x, it.z, it.y, it.y + 4 * it.scale, 0.7 * it.scale, 0, 0, 0, 0)
    for (const it of v.broadleaves) add(it.x, it.z, it.y, it.y + 3 * it.scale, 0.35 * it.scale, 0, 0, 0, 0)
    for (const it of v.rocks) add(it.x, it.z, it.y, it.y - ROCK_SINK * it.scale + it.scale * rockSquash(it) * 0.85, it.scale * 0.8, 1, 0, 0, 0)
    for (const it of d.stumps) add(it.x, it.z, it.y, it.y + 0.5 * it.scale, 0.42 * it.scale, 2, 0, 0, 0)
    for (const it of d.logs) add(it.x, it.z, it.y, it.y + 2 * LOG_R * it.scale, LOG_R * it.scale, 3, Math.cos(it.rotation), -Math.sin(it.rotation), LOG_HALF * it.scale)
    return out
  }, [world])

  // ?debug=1: expose the tile to scripts (find a tree, a rock, a cliff, a lake)
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debug')) return
    const w = window as unknown as { __bearingWorld?: unknown }
    w.__bearingWorld = { climbables, waterAt, height: (x: number, z: number) => heightAt(world.terrain, x, z), player: runStore.getState().playerPosition, sun: SUN_DIR }
    return () => {
      delete w.__bearingWorld
    }
  }, [climbables, waterAt, world])


  // continuous game hour for the light (read every frame, no re-render)
  const startHour = visit.hour
  const getHour = useCallback(
    () => (startHour + ((performance.now() - enteredAt) / 1000) * SCENE_TIME_SCALE / 3600) % 24,
    [startHour, enteredAt],
  )
  const hour = startHour + (elapsed * SCENE_TIME_SCALE) / 3600
  const t = world.terrain

  return (
    <KeyboardControls map={keyboardMap}>
      <Canvas
        key={forceWebGL ? 'webgl' : 'webgpu'}
        gl={createRenderer(forceWebGL)}
        dpr={[1, 1.5]}
        shadows="percentage"
        camera={{ fov: 55, near: 0.1, far: 900 }}
        frameloop={active ? 'always' : 'never'}
      >
        <Heading target={compass} />
        <color attach="background" args={[HAZE_COOL]} />
        <DaylightFog mistHeight={t.minHeight + (t.maxHeight - t.minHeight) * 0.15} />
        <Daylight getHour={getHour} />
        <Suspense fallback={null}>
          <Physics timeStep={1 / 60} paused={!active}>
            <Terrain terrain={t} />
            <Vegetation data={world.vegetation} />
            <Decor data={world.decor} />
            <Village houses={world.houses} />
            {world.goal && valley.goal.kind !== 'village' && <GoalProp kind={valley.goal.kind} at={world.goal} />}
            {world.clues.map((c, i) => (
              <ClueProp key={i} kind={c.kind} at={c.at} />
            ))}
            <Water field={valley.field} tile={t} />
            <SoundScape field={valley.field} tile={t} active={active} getHour={getHour} />
            <Player
              spawn={world.spawn}
              terrain={t}
              occluders={occluders}
              climbables={climbables}
              waterAt={waterAt}
              streamAt={streamAt}
              energy={startEnergy}
              health={startHealth}
              hazards={hazards}
              hud={hud}
              onLookAround={onLookAround}
            />
          </Physics>
        </Suspense>
        <PostFX />
      </Canvas>
      <Compass strip={compass} bearing={bearing} />
      <div className="pointer-events-none absolute right-3 top-3 rounded bg-black/50 px-3 py-2 text-right font-mono text-sm text-white">
        {run && (
          <div>
            Day {run.day}/{DAYS_ALLOWED} · {formatHour(hour % 24)} · energy {Math.max(0, Math.round(startEnergy - runStore.getState().coldLoss))} ·{' '}
            <span className={startHealth - runStore.getState().injury < HURT ? 'text-red-400' : ''}>health {Math.max(0, Math.round(startHealth - runStore.getState().injury))}</span>
            {forceWebGL && <span className="ml-2 text-amber-300">(WebGL)</span>}
          </div>
        )}
        <div className="text-xs text-white/70">ZQSD/WASD/arrows · Shift run · Space jump · drag to look</div>
        <div className="text-xs text-white/90">Walk into a steep slope or a rock to climb · E climb a tree · M back to the map</div>
        <button
          className="pointer-events-auto mt-1 rounded bg-white/15 px-2 py-0.5 text-xs hover:bg-white/25"
          onClick={() => useSettings.getState().setMuted(!muted)}
          title="N: sound on / off"
        >
          {muted ? '🔇 sound off' : '🔊 sound on'} <span className="text-white/60">(N)</span>
        </button>
      </div>
      {/* contextual prompt + grip (climbing stamina), written directly by Player */}
      <div className="pointer-events-none absolute bottom-10 left-1/2 flex w-72 -translate-x-1/2 flex-col items-center gap-2 font-mono text-sm text-white">
        <div ref={(el) => { hud.current.prompt = el }} className="rounded bg-black/45 px-3 py-1 empty:hidden" />
        {/* grip = climbing stamina: shown only while it drains; empty → you slip */}
        <div ref={(el) => { hud.current.gripBox = el }} className="flex items-center gap-2 opacity-0 transition-opacity">
          <span className="text-xs">Grip</span>
          <div className="h-1.5 w-40 overflow-hidden rounded bg-black/40">
            <div ref={(el) => { hud.current.grip = el }} className="h-full w-full origin-left" />
          </div>
        </div>
        {/* warmth = energy left while cold water drains it: shown only in the water */}
        <div ref={(el) => { hud.current.warmthBox = el }} className="flex items-center gap-2 opacity-0 transition-opacity">
          <span className="text-xs">Warmth</span>
          <div className="h-1.5 w-40 overflow-hidden rounded bg-black/40">
            <div ref={(el) => { hud.current.warmth = el }} className="h-full w-full origin-left" />
          </div>
        </div>
      </div>
    </KeyboardControls>
  )
}
