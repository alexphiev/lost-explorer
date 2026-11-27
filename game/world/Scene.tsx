'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { KeyboardControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { createRenderer } from '@/game/render/renderer'
import { useSettings } from '@/game/state/settings'
import { runStore } from '@/game/state/run'
import { SCENE_TIME_SCALE, useJourney } from '@/game/state/journey'
import { heightAt, sampleTile } from '@/game/core/terrain'
import { placeVegetation, placeVillage, type Instance, type Vegetation as VegetationData } from '@/game/core/placement'
import { DAYS_ALLOWED, formatHour } from '@/game/core/travel'
import type { Point, Valley } from '@/game/core/valley'
import { atmosphereFog, HAZE_COOL } from '@/game/render/tsl/atmosphere'
import Terrain from './Terrain'
import Vegetation from './Vegetation'
import Player, { keyboardMap } from './Player'
import SunLight, { SUN_DIRECTION } from './SunLight'
import PostFX from './PostFX'
import Sky from './Sky'
import Village from './Village'

function Atmosphere({ mistHeight }: { mistHeight: number }) {
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    scene.fogNode = atmosphereFog(SUN_DIRECTION, mistHeight)
    return () => {
      scene.fogNode = null
    }
  }, [scene, mistHeight])
  return null
}

const CLIMB_REACH = 2.5 // metres from a trunk or rock edge

function nearClimbable(v: VegetationData, x: number, z: number) {
  const near = (list: Instance[], radius: number) =>
    list.some((it) => Math.hypot(it.x - x, it.z - z) < radius * it.scale + CLIMB_REACH)
  return near(v.conifers, 0.7) || near(v.broadleaves, 0.35) || near(v.rocks, 0.8)
}

export default function Scene({ valley, center }: { valley: Valley; center: Point }) {
  const forceWebGL = useSettings((s) => s.forceWebGL)
  const run = useJourney((s) => s.run)
  const leaveScene = useJourney((s) => s.leaveScene)
  const [hint, setHint] = useState<string | null>(null)
  const [enteredAt] = useState(() => performance.now())
  const [elapsed, setElapsed] = useState(0)

  const world = useMemo(() => {
    const terrain = sampleTile(valley.field, center.x, center.z)
    return {
      terrain,
      vegetation: placeVegetation(terrain, valley.field, valley.seed),
      houses: placeVillage(terrain, valley.seed, valley.village.x, valley.village.z),
      spawn: [0, heightAt(terrain, 0, 0) + 1.5, 0] as [number, number, number],
    }
  }, [valley, center])

  // game clock shown in the HUD (not in the frame loop)
  useEffect(() => {
    const id = setInterval(() => setElapsed((performance.now() - enteredAt) / 1000), 1000)
    return () => clearInterval(id)
  }, [enteredAt])

  // E = climb (near a tree or a rock), M = back to the map. Letters by key, not code, so AZERTY works.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (key !== 'e' && key !== 'm') return
      const p = runStore.getState().playerPosition
      const seconds = (performance.now() - enteredAt) / 1000
      if (key === 'm') return leaveScene(p.x, p.z, seconds, false)
      if (nearClimbable(world.vegetation, p.x, p.z)) return leaveScene(p.x, p.z, seconds, true)
      setHint('Nothing to climb here: walk up to a tree or a rock.')
      setTimeout(() => setHint(null), 2500)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [world, enteredAt, leaveScene])

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
        <Atmosphere mistHeight={t.minHeight + (t.maxHeight - t.minHeight) * 0.15} />
        <hemisphereLight args={['#b4cbe3', '#7a6545', 1.7]} />
        <SunLight />
        <Sky />
        <Suspense fallback={null}>
          <Physics timeStep={1 / 60}>
            <Terrain terrain={t} />
            <Vegetation data={world.vegetation} />
            <Village houses={world.houses} />
            <Player spawn={world.spawn} terrain={t} />
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
        <div className="text-xs text-white/90">E climb (next to a tree or rock) · M back to the map</div>
        {hint && <div className="mt-1 text-amber-200">{hint}</div>}
      </div>
    </KeyboardControls>
  )
}
