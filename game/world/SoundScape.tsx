'use client'
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { HeightField, Terrain } from '@/game/core/terrain'
import { heightAt } from '@/game/core/terrain'
import { runStore } from '@/game/state/run'
import { useSettings } from '@/game/state/settings'
import { createSoundEngine, type SoundEngine } from './audio'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * Sounds of the 3D scene: footsteps and strokes follow the player's gait (frame loop), running water, wind and birds
 * follow where they stand (4×/s). Starts on the first key or click (browsers require it), silent while the scene is paused.
 */
export default function SoundScape({ field, tile, active, getHour }: { field: HeightField; tile: Terrain; active: boolean; getHour: () => number }) {
  const engine = useRef<SoundEngine | null>(null)
  const last = useRef({ phase: 0 })
  const muted = useSettings((s) => s.muted)

  // create on the first input
  useEffect(() => {
    const start = () => {
      if (engine.current) return
      engine.current = createSoundEngine(useSettings.getState().muted)
    }
    window.addEventListener('keydown', start)
    window.addEventListener('pointerdown', start)
    return () => {
      window.removeEventListener('keydown', start)
      window.removeEventListener('pointerdown', start)
      engine.current?.close()
      engine.current = null
    }
  }, [])

  useEffect(() => engine.current?.setMuted(muted), [muted])

  // paused behind the map: silence
  useEffect(() => {
    const ctx = engine.current?.ctx
    if (!ctx) return
    if (active) void ctx.resume()
    else void ctx.suspend()
  }, [active])

  // ambience: nearest running water, wind by height, birds by day
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => {
      const e = engine.current
      if (!e) return
      const p = runStore.getState().playerPosition
      const wx = p.x + tile.centerX
      const wz = p.z + tile.centerZ
      let stream = 0
      let river = 0
      for (const r of field.rivers.near(wx, wz, 160)) {
        for (let i = 0; i < r.n; i++) {
          if (!r.wet[i]) continue
          const d = Math.max(0, Math.hypot(r.x[i] - wx, r.z[i] - wz) - r.halfW[i])
          const loud = clamp01(1 - d / (r.river ? 150 : 70)) * (0.4 + 0.6 * clamp01(r.speed[i] / 1.5))
          if (r.river) river = Math.max(river, loud)
          else stream = Math.max(stream, loud)
        }
      }
      const h = heightAt(tile, p.x, p.z)
      const rel = clamp01((h - tile.minHeight) / Math.max(1, tile.maxHeight - tile.minHeight))
      e.setAmbient(Math.max(stream, river * 0.5), river, 0.25 + 0.75 * rel * rel)
      const hour = getHour()
      const day = hour > 6 && hour < 20 ? Math.min(1, (hour - 6) / 1.5, (20 - hour) / 1.5) : 0
      if (day > 0 && Math.random() < 0.07 * day * (1 - river * 0.7)) e.chirp(Math.random() * 1.6 - 0.8, 0.5 + Math.random() * 0.5)
    }, 250)
    return () => window.clearInterval(id)
  }, [active, field, tile, getHour])

  // footsteps / strokes on each half gait cycle (Web Audio nodes are one-shot: a few tiny allocations per step)
  useFrame(() => {
    const e = engine.current
    const a = runStore.getState().audio
    const prev = last.current.phase
    last.current.phase = a.phase
    if (!e) return
    const crossed = (prev < 0.5 && a.phase >= 0.5) || a.phase < prev - 0.3
    if (!crossed) return
    if (a.mode === 0 && a.grounded && a.speed > 0.4) e.step(a.wade > 0.08 ? 'water' : a.rock ? 'rock' : 'grass', clamp01((a.speed - 1) / 4))
    else if (a.mode === 2 && a.speed > 0.1) e.stroke(clamp01(a.speed / 1.5))
    else if (a.mode === 1) e.step('rock', 0)
  })
  return null
}
