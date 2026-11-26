'use client'
import { Suspense, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { KeyboardControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { createRenderer } from '@/game/render/renderer'
import { useSettings } from '@/game/state/settings'
import { runStore, useRun } from '@/game/state/run'
import { generateTerrain, heightAt } from '@/game/core/terrain'
import { placeRocks, placeTrees } from '@/game/core/placement'
import { randomSeed } from '@/game/core/rng'
import Terrain from './Terrain'
import Vegetation from './Vegetation'
import Player, { keyboardMap } from './Player'
import SunLight from './SunLight'
import Sky from './Sky'

const FOG = '#c8d4dc'

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
      trees: placeTrees(terrain, seed),
      rocks: placeRocks(terrain, seed),
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
        camera={{ fov: 60, near: 0.1, far: 600 }}
      >
        <color attach="background" args={[FOG]} />
        <fog attach="fog" args={[FOG, 40, 320]} />
        <hemisphereLight args={['#dfe8f0', '#5a4a3a', 0.9]} />
        <SunLight />
        <Sky />
        <Suspense fallback={null}>
          <Physics timeStep={1 / 60}>
            <Terrain terrain={world.terrain} />
            <Vegetation trees={world.trees} rocks={world.rocks} />
            <Player spawn={world.spawn} />
          </Physics>
        </Suspense>
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
