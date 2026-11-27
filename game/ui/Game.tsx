'use client'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { randomSeed } from '@/game/core/rng'
import { useJourney } from '@/game/state/journey'
import { useSettings } from '@/game/state/settings'
import MapView from '@/game/map/MapView'

// three/webgpu only loads when the player first goes on foot
const Scene = dynamic(() => import('@/game/world/Scene'), {
  ssr: false,
  loading: () => <p className="p-4 text-amber-950">Walking into the valley…</p>,
})

/** The whole game: 2D map layer ⇄ 3D stop scene. */
export default function Game() {
  const [seed, setSeed] = useState<string | null>(null)
  const layer = useJourney((s) => s.layer)
  const valley = useJourney((s) => s.valley)
  const center = useJourney((s) => s.sceneCenter)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const s = params.get('seed') || randomSeed()
    useSettings.setState({ forceWebGL: params.get('webgl') === '1' })
    useJourney.getState().start(s)
    setSeed(s)
  }, [])

  if (!seed || !valley) return null
  return (
    <>
      {layer === 'scene' && center ? (
        <div className="absolute inset-0">
          <Scene valley={valley} center={center} />
        </div>
      ) : (
        <MapView />
      )}
      <div className="pointer-events-none absolute left-2 top-2 z-10 text-xs text-amber-950/70 mix-blend-multiply">
        seed: <span className="pointer-events-auto select-all">{valley.seed}</span>
      </div>
    </>
  )
}
