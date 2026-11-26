'use client'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { randomSeed } from '@/game/core/rng'
import { useJourney } from '@/game/state/journey'

const MapView = dynamic(() => import('@/game/map/MapView'), {
  ssr: false,
  loading: () => <p className="p-4 text-amber-950">Unrolling the map…</p>,
})

export default function MapLoader() {
  const [seed, setSeed] = useState<string | null>(null)
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('seed') || randomSeed()
    useJourney.getState().start(s)
    setSeed(s)
  }, [])
  if (!seed) return null
  return (
    <>
      <MapView />
      <div className="pointer-events-none absolute left-2 top-2 text-xs text-amber-950/70">
        seed: <span className="pointer-events-auto select-all">{seed}</span>
      </div>
    </>
  )
}
