'use client'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { randomSeed } from '@/game/core/rng'
import { levelById } from '@/game/core/levels'
import { MAP_SEGMENTS } from '@/game/core/valley'
import { sceneSnapshot, useClock, useJourney } from '@/game/state/journey'
import { clearRun, loadProgress, loadRun, recordWin, saveRun } from '@/game/state/save'
import { useSettings } from '@/game/state/settings'
import MapView from '@/game/map/MapView'

// three/webgpu only loads when the player first goes on foot
const Scene = dynamic(() => import('@/game/world/Scene'), {
  ssr: false,
  loading: () => <p className="p-4 text-amber-950">Walking into the valley…</p>,
})

const FOG_LENGTH = (MAP_SEGMENTS + 1) * (MAP_SEGMENTS + 1)

function persist() {
  const { level, valley, run: live, bearing, layer, sceneCenter } = useJourney.getState()
  if (!valley || !live || live.status !== 'playing') return
  // on foot in 3D the run only settles when you leave: save the live position, time, cold and falls
  const run = layer === 'scene' ? (sceneSnapshot() ?? live) : live
  saveRun({ level, seed: valley.seed, run, bearing, seconds: useClock.getState().seconds, layer, sceneCenter, savedAt: Date.now() })
}

/** The whole game: 2D map layer ⇄ 3D stop scene, with the local save and the run clock. */
export default function Game() {
  const [ready, setReady] = useState(false)
  const layer = useJourney((s) => s.layer)
  const valley = useJourney((s) => s.valley)
  const center = useJourney((s) => s.sceneCenter)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    useSettings.setState({ forceWebGL: params.get('webgl') === '1' })
    const level = levelById(Number(params.get('level')))
    if (level && level.id > loadProgress().unlocked) {
      window.location.replace('/')
      return
    }
    const seed = level?.seed ?? (params.get('seed') || randomSeed())
    const saved = params.get('new') === '1' ? null : loadRun(seed, FOG_LENGTH)
    if (saved) useJourney.getState().resume({ ...saved, level: level?.id ?? null })
    else useJourney.getState().start(seed, level?.id ?? null)
    setReady(true)
  }, [])

  // save on every move; settle the run when it ends
  useEffect(() => {
    if (!ready) return
    return useJourney.subscribe((s, prev) => {
      if (s.run === prev.run && s.bearing === prev.bearing && s.layer === prev.layer) return
      const run = s.run
      if (!run || !s.valley) return
      if (run.status === 'playing') return persist()
      if (prev.run?.status !== 'playing') return
      clearRun(s.valley.seed)
      if (run.status === 'won') {
        const time = { seconds: useClock.getState().seconds, hours: (run.day - 1) * 24 + run.hour - 8 }
        const previous = s.level !== null ? recordWin(s.level, time).previous : null
        useJourney.setState({ result: { time, previous } })
      }
    })
  }, [ready])

  // run clock: real seconds while the tab is visible and the run is on
  useEffect(() => {
    if (!ready) return
    let ticks = 0
    const id = window.setInterval(() => {
      if (document.hidden || useJourney.getState().run?.status !== 'playing') return
      useClock.setState((c) => ({ seconds: c.seconds + 1 }))
      if (++ticks % 5 === 0) persist()
    }, 1000)
    const onHide = () => persist()
    const onVisibility = () => {
      if (document.hidden) persist()
    }
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [ready])

  if (!ready || !valley) return null
  return layer === 'scene' && center ? (
    <div className="absolute inset-0">
      <Scene valley={valley} center={center} />
    </div>
  ) : (
    <MapView />
  )
}
