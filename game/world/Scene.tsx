'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { KeyboardControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { createRenderer } from '@/game/render/renderer'
import { useSettings } from '@/game/state/settings'
import { runStore, useRun } from '@/game/state/run'
import { generateTerrain, heightAt } from '@/game/core/terrain'
import { placeVegetation } from '@/game/core/placement'
import { atmosphereFog, HAZE_COOL } from '@/game/render/tsl/atmosphere'
import { randomSeed } from '@/game/core/rng'
import Terrain from './Terrain'
import Vegetation from './Vegetation'
import Player, { keyboardMap } from './Player'
import SunLight, { SUN_DIRECTION } from './SunLight'
import PostFX from './PostFX'
import Sky from './Sky'

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

function readUrlOnce() {
  const params = new URLSearchParams(window.location.search)
  const seed = params.get('seed') || randomSeed()
  runStore.setState({ seed })
  useSettings.setState({ forceWebGL: params.get('webgl') === '1' })
}

export default function Scene() {
  useState(readUrlOnce) // client-only (ssr: false), runs once before first render
  const seed = useRun((s) => s.seed)
  const forceWebGL = useSettings((s) => s.forceWebGL)

  const world = useMemo(() => {
    const terrain = generateTerrain(seed)
    return {
      terrain,
      vegetation: placeVegetation(terrain, seed),
      spawn: [0, heightAt(terrain, 0, 0) + 1.5, 0] as [number, number, number],
    }
  }, [seed])

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
        <Atmosphere mistHeight={world.terrain.maxHeight * 0.15} />
        <hemisphereLight args={['#b4cbe3', '#7a6545', 1.7]} />
        <SunLight />
        <Sky />
        <Suspense fallback={null}>
          <Physics timeStep={1 / 60}>
            <Terrain terrain={world.terrain} />
            <Vegetation data={world.vegetation} />
            <Player spawn={world.spawn} terrain={world.terrain} />
          </Physics>
        </Suspense>
        <PostFX />
      </Canvas>
      <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/50 px-3 py-2 font-mono text-sm text-white">
        <div>
          seed: <span className="pointer-events-auto select-all">{seed}</span>
          {forceWebGL && <span className="ml-2 text-amber-300">(WebGL)</span>}
        </div>
        <div className="text-xs text-white/70">ZQSD/WASD/arrows · Shift run · Space jump · drag to look</div>
      </div>
    </KeyboardControls>
  )
}
