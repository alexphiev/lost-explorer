'use client'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { KeyboardControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { createRenderer } from '@/game/render/renderer'
import { useSettings } from '@/game/state/settings'
import { runStore } from '@/game/state/run'
import { SCENE_TIME_SCALE, useJourney } from '@/game/state/journey'
import { heightAt, sampleTile } from '@/game/core/terrain'
import { placeDecor, placeVegetation, placeVillage } from '@/game/core/placement'
import { DAYS_ALLOWED, formatHour } from '@/game/core/travel'
import type { Point, Valley } from '@/game/core/valley'
import { HAZE_COOL } from '@/game/render/tsl/atmosphere'
import Terrain from './Terrain'
import Vegetation, { rockSquash, ROCK_SINK, TREE_SINK } from './Vegetation'
import Player, { CLIMB_STRIDE, keyboardMap, type PlayerHud } from './Player'
import Water from './Water'
import Daylight, { DaylightFog } from './Daylight'
import PostFX from './PostFX'
import Village from './Village'
import Decor from './Decor'


export default function Scene({ valley, center }: { valley: Valley; center: Point }) {
  const forceWebGL = useSettings((s) => s.forceWebGL)
  const run = useJourney((s) => s.run)
  const leaveScene = useJourney((s) => s.leaveScene)
  const hud = useRef<PlayerHud>({ prompt: null, grip: null, gripBox: null })
  const [enteredAt] = useState(() => performance.now())
  const [elapsed, setElapsed] = useState(0)

  const world = useMemo(() => {
    const terrain = sampleTile(valley.field, center.x, center.z)
    return {
      terrain,
      vegetation: placeVegetation(terrain, valley.field, valley.seed),
      decor: placeDecor(terrain, valley.field, valley.seed),
      houses: placeVillage(terrain, valley.field, valley.seed, valley.village.x, valley.village.z),
      spawn: [0, heightAt(terrain, 0, 0) + 1.5, 0] as [number, number, number],
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
  useEffect(() => {
    const id = setInterval(() => setElapsed((performance.now() - enteredAt) / 1000), 1000)
    return () => clearInterval(id)
  }, [enteredAt])

  // M = back to the map (letter by key, not code, so AZERTY works). E (climb / look around) lives in Player.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'm') return
      const p = runStore.getState().playerPosition
      leaveScene(p.x, p.z, (performance.now() - enteredAt) / 1000, false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enteredAt, leaveScene])

  // looking around from a tree top or a rock = the map's "climb" reveal from this spot
  const onLookAround = useCallback(() => {
    const p = runStore.getState().playerPosition
    leaveScene(p.x, p.z, (performance.now() - enteredAt) / 1000, true)
  }, [enteredAt, leaveScene])

  const waterAt = useCallback(
    (x: number, z: number) => valley.field.water(x + world.terrain.centerX, z + world.terrain.centerZ),
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

  // ?debug=1: expose the tile to scripts (find a tree, a rock, a cliff, a lake)
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debug')) return
    const w = window as unknown as { __bearingWorld?: unknown }
    w.__bearingWorld = { climbables, waterAt, height: (x: number, z: number) => heightAt(world.terrain, x, z), player: runStore.getState().playerPosition }
    return () => {
      delete w.__bearingWorld
    }
  }, [climbables, waterAt, world])


  // continuous game hour for the light (read every frame, no re-render)
  const startHour = run?.hour ?? 12
  const getHour = useCallback(
    () => (startHour + ((performance.now() - enteredAt) / 1000) * SCENE_TIME_SCALE / 3600) % 24,
    [startHour, enteredAt],
  )
  const hour = run ? run.hour + (elapsed * SCENE_TIME_SCALE) / 3600 : 0
  const t = world.terrain

  return (
    <KeyboardControls map={keyboardMap}>
      <Canvas
        key={forceWebGL ? 'webgl' : 'webgpu'}
        gl={createRenderer(forceWebGL)}
        dpr={[1, 1.5]}
        shadows="percentage"
        camera={{ fov: 55, near: 0.1, far: 900 }}
      >
        <color attach="background" args={[HAZE_COOL]} />
        <DaylightFog mistHeight={t.minHeight + (t.maxHeight - t.minHeight) * 0.15} />
        <Daylight getHour={getHour} />
        <Suspense fallback={null}>
          <Physics timeStep={1 / 60}>
            <Terrain terrain={t} />
            <Vegetation data={world.vegetation} />
            <Decor data={world.decor} />
            <Village houses={world.houses} />
            <Water field={valley.field} tile={t} />
            <Player
              spawn={world.spawn}
              terrain={t}
              occluders={occluders}
              climbables={climbables}
              waterAt={waterAt}
              hud={hud}
              onLookAround={onLookAround}
            />
          </Physics>
        </Suspense>
        <PostFX />
      </Canvas>
      <div className="pointer-events-none absolute right-3 top-3 rounded bg-black/50 px-3 py-2 text-right font-mono text-sm text-white">
        {run && (
          <div>
            Day {run.day}/{DAYS_ALLOWED} · {formatHour(hour % 24)} · energy {Math.round(run.energy)}
            {forceWebGL && <span className="ml-2 text-amber-300">(WebGL)</span>}
          </div>
        )}
        <div className="text-xs text-white/70">ZQSD/WASD/arrows · Shift run · Space jump · drag to look</div>
        <div className="text-xs text-white/90">Walk into a steep slope or a rock to climb · E climb a tree · M back to the map</div>
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
      </div>
    </KeyboardControls>
  )
}
