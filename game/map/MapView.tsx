'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useJourney } from '@/game/state/journey'
import { DAYS_ALLOWED, bearingTo, compassName, formatHour } from '@/game/core/travel'
import { MAP_SIZE } from '@/game/core/valley'
import { FOG_UNSEEN } from '@/game/core/viewshed'
import { randomSeed } from '@/game/core/rng'
import { renderMap } from './renderMap'

const btn = 'rounded bg-amber-900 px-4 py-2 text-amber-50 hover:bg-amber-800 disabled:opacity-40 disabled:hover:bg-amber-900'

export default function MapView() {
  const { valley, run, bearing, start, setBearing, walk, climb, rest } = useJourney()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const offRef = useRef<HTMLCanvasElement | null>(null)
  const [size, setSize] = useState(600)

  useEffect(() => {
    const onResize = () => setSize(Math.max(300, Math.min(800, window.innerHeight - 40, window.innerWidth - 24)))
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // draw map + overlays on every state change
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !valley || !run) return
    const n = valley.map.segments + 1
    if (!offRef.current) {
      offRef.current = document.createElement('canvas')
      offRef.current.width = n
      offRef.current.height = n
    }
    const off = offRef.current
    const octx = off.getContext('2d')!
    const img = octx.createImageData(n, n)
    renderMap(valley, run.fog, img)
    octx.putImageData(img, 0, 0)

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(off, 0, 0, size, size)
    const k = size / MAP_SIZE
    const sx = (x: number) => (x + MAP_SIZE / 2) * k
    const sz = (z: number) => (z + MAP_SIZE / 2) * k

    // walked path
    ctx.strokeStyle = '#7a1f1f'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    for (let i = 0; i < run.path.length; i += 2) {
      if (i === 0) ctx.moveTo(sx(run.path[0]), sz(run.path[1]))
      else ctx.lineTo(sx(run.path[i]), sz(run.path[i + 1]))
    }
    ctx.stroke()
    ctx.setLineDash([])

    // village
    const vi = Math.round((valley.village.z + MAP_SIZE / 2) / (MAP_SIZE / valley.map.segments)) * n + Math.round((valley.village.x + MAP_SIZE / 2) / (MAP_SIZE / valley.map.segments))
    if (run.fog[vi] !== FOG_UNSEEN) {
      const vx = sx(valley.village.x)
      const vz = sz(valley.village.z)
      ctx.fillStyle = '#5a3a1e'
      ctx.fillRect(vx - 6, vz - 2, 12, 8)
      ctx.beginPath()
      ctx.moveTo(vx - 8, vz - 2)
      ctx.lineTo(vx, vz - 10)
      ctx.lineTo(vx + 8, vz - 2)
      ctx.closePath()
      ctx.fill()
    }

    const px = sx(run.x)
    const pz = sz(run.z)
    // bearing line
    if (bearing !== null) {
      const r = (bearing * Math.PI) / 180
      const ex = px + Math.sin(r) * 800 * k
      const ez = pz - Math.cos(r) * 800 * k
      ctx.strokeStyle = '#3b2a1a'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(px, pz)
      ctx.lineTo(ex, ez)
      ctx.stroke()
      ctx.fillStyle = '#3b2a1a'
      ctx.font = '13px serif'
      ctx.fillText(`${compassName(bearing).split('-').map((w) => w[0].toUpperCase()).join('')} ${Math.round(bearing)}°`, ex + 4, ez - 4)
    }

    // player
    ctx.beginPath()
    ctx.arc(px, pz, 5, 0, Math.PI * 2)
    ctx.fillStyle = '#b3261e'
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()

    // compass rose
    ctx.save()
    ctx.translate(size - 28, 36)
    ctx.fillStyle = '#3b2a1a'
    ctx.beginPath()
    ctx.moveTo(0, -20)
    ctx.lineTo(7, 6)
    ctx.lineTo(0, 1)
    ctx.lineTo(-7, 6)
    ctx.closePath()
    ctx.fill()
    ctx.font = 'bold 13px serif'
    ctx.textAlign = 'center'
    ctx.fillText('N', 0, -24)
    ctx.restore()
  }, [valley, run, bearing, size])

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const r = e.currentTarget.getBoundingClientRect()
      const x = ((e.clientX - r.left) / r.width) * MAP_SIZE - MAP_SIZE / 2
      const z = ((e.clientY - r.top) / r.height) * MAP_SIZE - MAP_SIZE / 2
      const run = useJourney.getState().run
      if (run) setBearing(bearingTo(run.x, run.z, x, z))
    },
    [setBearing],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'enter' || k === 'w') walk()
      else if (k === 'c') climb()
      else if (k === 'r') rest()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [walk, climb, rest])

  if (!valley || !run) return null
  const playing = run.status === 'playing'
  const sleeping = run.hour >= 20 || run.hour < 7
  let km = 0
  for (let i = 2; i < run.path.length; i += 2) km += Math.hypot(run.path[i] - run.path[i - 2], run.path[i + 1] - run.path[i - 1])
  km /= 1000
  const hoursUsed = (run.day - 1) * 24 + run.hour - 8
  const recent = run.log.slice(-6).reverse()

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-amber-100 p-3 text-amber-950 lg:flex-row lg:items-start">
      <canvas ref={canvasRef} onClick={onClick} style={{ width: size, height: size }} className="cursor-crosshair rounded border-2 border-amber-900 shadow-lg" />
      <div className="flex w-full max-w-sm flex-col gap-3 font-serif">
        <div className="text-xl font-bold">
          Day {run.day} / {DAYS_ALLOWED} <span className="ml-2 font-normal">{formatHour(run.hour)}</span>
        </div>
        <div>
          <div className="text-sm">Energy {Math.round(run.energy)}</div>
          <div className="h-3 w-full rounded bg-amber-200">
            <div className="h-3 rounded bg-green-700" style={{ width: `${Math.max(0, Math.min(100, run.energy))}%` }} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btn} disabled={!playing || bearing === null} onClick={walk}>Walk 2h</button>
          <button className={btn} disabled={!playing} onClick={climb}>Climb (1 h)</button>
          <button className={btn} disabled={!playing} onClick={rest}>{sleeping ? 'Sleep' : 'Rest'}</button>
        </div>
        <p className="text-xs opacity-70">Click the map to choose a bearing. Enter/W walk, C climb, R rest.</p>
        <ul className="space-y-1 text-sm">
          {recent.map((s, i) => (
            <li key={run.log.length - i} className={i === 0 ? 'font-bold' : 'opacity-70'}>{s.message}</li>
          ))}
        </ul>
      </div>
      {!playing && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40">
          <div className="max-w-sm rounded border-2 border-amber-900 bg-amber-50 p-6 text-center font-serif shadow-xl">
            <h2 className="mb-2 text-2xl font-bold">{run.status === 'won' ? 'You made it to the village' : 'You are lost for good'}</h2>
            <p className="mb-4 text-sm">
              {run.day} day{run.day > 1 ? 's' : ''}, {Math.round(hoursUsed)} h used, {km.toFixed(1)} km walked.
            </p>
            <div className="flex justify-center gap-2">
              <button className={btn} onClick={() => start(valley.seed)}>Same valley</button>
              <button className={btn} onClick={() => start(randomSeed())}>New valley</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
