'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useClock, useJourney } from '@/game/state/journey'
import { DAYS_ALLOWED, HURT, bearingTo, compassName, formatHour } from '@/game/core/travel'
import { levelById, LEVELS } from '@/game/core/levels'
import { MAP_SIZE } from '@/game/core/valley'
import { FOG_UNSEEN, fogAt } from '@/game/core/viewshed'
import { GOALS } from '@/game/core/goals'
import { randomSeed } from '@/game/core/rng'
import { formatDuration } from '@/game/state/save'
import { renderMap } from './renderMap'
import { drawMarker, MARKER_NAME, type MarkerKind } from './markers'

interface Hit {
  x: number
  y: number
  kind: MarkerKind
  label: string
  sub?: string
}

function MarkerIcon({ kind }: { kind: MarkerKind }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = 22 * dpr
    c.height = 22 * dpr
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawMarker(ctx, kind, 11, kind === 'smoke' ? 14 : 11)
  }, [kind])
  return <canvas ref={ref} style={{ width: 22, height: 22 }} />
}

function Clock() {
  const seconds = useClock((c) => c.seconds)
  return <span className="tabular-nums">{formatDuration(seconds)}</span>
}

function Bar({ label, value, color, note }: { label: string; value: number; color: string; note?: string }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-bold">{label}</span>
        <span className="tabular-nums opacity-80">
          {Math.round(v)}
          {note && <span className="ml-1 text-xs italic text-[var(--rust)]">· {note}</span>}
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full border border-[#3b2a1a]/40 bg-[#3b2a1a]/10">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${v}%`, background: color }} />
      </div>
    </div>
  )
}

export default function MapView() {
  const { level, valley, run, bearing, result, start, setBearing, enterScene } = useJourney()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const offRef = useRef<HTMLCanvasElement | null>(null)
  const hits = useRef<Hit[]>([])
  const [hover, setHover] = useState<Hit | null>(null)
  const [size, setSize] = useState(600)

  useEffect(() => {
    const onResize = () => {
      const wide = window.innerWidth >= 1024
      const w = wide ? window.innerWidth - 420 : window.innerWidth - 24
      setSize(Math.max(300, Math.min(860, window.innerHeight - (wide ? 120 : 150), w)))
    }
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
    const found: Hit[] = []
    const pin = (kind: MarkerKind, x: number, z: number, label: string, sub?: string, dir?: number) => {
      drawMarker(ctx, kind, sx(x), sz(z), dir)
      found.push({ x: sx(x), y: sz(z), kind, label, sub })
    }

    // landmarks you have seen
    for (const l of valley.landmarks) if (fogAt(valley.map, run.fog, l.x, l.z) !== FOG_UNSEEN) pin(l.kind, l.x, l.z, l.label)

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

    pin('start', valley.start.x, valley.start.z, MARKER_NAME.start, 'Day 1, 08:00')
    // what you found along the way
    for (const m of run.marks) {
      if (m.kind === 'village') continue
      const when = `Day ${m.day}, ${formatHour(m.hour % 24)}`
      if (m.kind === 'clue' && m.bearing !== undefined) pin('clue', m.x, m.z, m.label, `Points ${compassName(m.bearing)} · ${when}`, m.bearing)
      else pin(m.kind, m.x, m.z, m.label, when)
    }
    // the goal: villages show from afar, small places only once seen up close (or reached)
    const g = valley.goal
    const gf = fogAt(valley.map, run.fog, g.x, g.z)
    if (run.marks.some((m) => m.kind === 'village') || (GOALS[g.kind].visibleFar ? gf !== FOG_UNSEEN : !!run.goalSeen)) {
      pin(g.kind, g.x, g.z, GOALS[g.kind].name, 'Reach it to finish the level')
    }

    const px = sx(run.x)
    const pz = sz(run.z)
    // bearing line
    if (bearing !== null) {
      const r = (bearing * Math.PI) / 180
      const ex = px + Math.sin(r) * 300 * k
      const ez = pz - Math.cos(r) * 300 * k
      ctx.strokeStyle = '#3b2a1a'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(px, pz)
      ctx.lineTo(ex, ez)
      ctx.stroke()
      // arrow head
      ctx.save()
      ctx.translate(ex, ez)
      ctx.rotate(r)
      ctx.beginPath()
      ctx.moveTo(0, -6)
      ctx.lineTo(4, 3)
      ctx.lineTo(-4, 3)
      ctx.closePath()
      ctx.fillStyle = '#3b2a1a'
      ctx.fill()
      ctx.restore()
    }

    // player
    ctx.beginPath()
    ctx.arc(px, pz, 9, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(179, 38, 30, 0.2)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(px, pz, 5, 0, Math.PI * 2)
    ctx.fillStyle = '#b3261e'
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()

    // compass rose
    ctx.save()
    ctx.translate(size - 34, 44)
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    ctx.arc(0, 0, 22, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(244, 236, 216, 0.8)'
    ctx.fill()
    ctx.strokeStyle = '#3b2a1a'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = '#3b2a1a'
    ctx.beginPath()
    ctx.moveTo(0, -18)
    ctx.lineTo(5, 0)
    ctx.lineTo(0, -3)
    ctx.lineTo(-5, 0)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(0, 18)
    ctx.lineTo(5, 0)
    ctx.lineTo(0, 3)
    ctx.lineTo(-5, 0)
    ctx.closePath()
    ctx.stroke()
    ctx.font = 'bold 11px Georgia, serif'
    ctx.textAlign = 'center'
    ctx.fillText('N', 0, -26 + 2)
    ctx.restore()

    // scale bar: 500 m
    ctx.save()
    ctx.translate(14, size - 18)
    ctx.fillStyle = '#3b2a1a'
    ctx.fillRect(0, 0, 500 * k, 3)
    ctx.fillStyle = '#f4ecd8'
    ctx.fillRect(250 * k, 0.5, 250 * k - 0.5, 2)
    ctx.fillStyle = '#3b2a1a'
    ctx.font = '11px Georgia, serif'
    ctx.fillText('500 m', 0, -4)
    ctx.restore()

    hits.current = found
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

  const onMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - r.left
    const my = e.clientY - r.top
    let best: Hit | null = null
    let bd = 12
    for (const h of hits.current) {
      const d = Math.hypot(h.x - mx, h.y - my)
      if (d < bd) {
        bd = d
        best = h
      }
    }
    setHover((prev) => (prev === best ? prev : best))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      // the map is a tool: close it to walk on
      if (k === 'm' || k === 'x' || k === 'escape') enterScene()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enterScene])

  if (!valley || !run) return null
  const lv = level !== null ? levelById(level) : undefined
  const next = lv ? LEVELS.find((l) => l.id === lv.id + 1) : undefined
  const playing = run.status === 'playing'
  const sleeping = run.hour >= 20 || run.hour < 7
  let km = 0
  for (let i = 2; i < run.path.length; i += 2) km += Math.hypot(run.path[i] - run.path[i - 2], run.path[i + 1] - run.path[i - 1])
  km /= 1000
  const hoursUsed = (run.day - 1) * 24 + run.hour - 8
  const recent = run.log.slice(-7).reverse()
  const seenKinds = new Set<MarkerKind>(['start', ...run.marks.map((m) => m.kind)])
  for (const l of valley.landmarks) if (fogAt(valley.map, run.fog, l.x, l.z) !== FOG_UNSEEN) seenKinds.add(l.kind)
  const goal = GOALS[valley.goal.kind]
  const goalSeen = run.marks.some((m) => m.kind === 'village') || (() => {
    const f = fogAt(valley.map, run.fog, valley.goal.x, valley.goal.z)
    return goal.visibleFar ? f !== FOG_UNSEEN : !!run.goalSeen
  })()
  if (goalSeen) seenKinds.add(valley.goal.kind)
  const legend = (Object.keys(MARKER_NAME) as MarkerKind[]).filter((kd) => seenKinds.has(kd) && kd !== 'village')
  if (goalSeen && valley.goal.kind === 'village') legend.push('village')
  const cluesFound = run.found?.length ?? 0
  const record = result && (!result.previous || result.time.seconds < result.previous.seconds)

  return (
    <div className="topo-bg flex min-h-dvh flex-col font-serif text-[var(--ink)]">
      {/* top bar */}
      <header className="flex items-center gap-3 px-4 py-2 text-amber-50">
        <a href="/" className="btn-game ghost !border-amber-100/40 !bg-black/20 !px-3 !py-1 !text-amber-50">
          ← Menu
        </a>
        <div className="min-w-0 flex-1 truncate">
          {lv ? (
            <>
              <span className="text-xs uppercase tracking-[0.2em] text-amber-200/70">Level {lv.id}</span>{' '}
              <span className="text-lg font-bold">{lv.name}</span>
            </>
          ) : (
            <>
              <span className="text-xs uppercase tracking-[0.2em] text-amber-200/70">Free valley</span>{' '}
              <span className="select-all font-mono text-sm">{valley.seed}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-full bg-black/30 px-3 py-1 text-sm">
          <span title="Real time on this level">⏱ <Clock /></span>
        </div>
        <div className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-[var(--ink)]">
          Day {run.day}/{DAYS_ALLOWED} · {formatHour(run.hour % 24)} {sleeping ? '☾' : '☀'}
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center gap-4 px-3 pb-4 lg:flex-row lg:items-start lg:justify-center">
        {/* the map */}
        <div className="paper relative rounded-lg p-3 shadow-[0_12px_40px_rgba(0,0,0,0.5)] ring-1 ring-black/30">
          <div className="relative" style={{ width: size, height: size }}>
            <canvas
              ref={canvasRef}
              onClick={onClick}
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
              style={{ width: size, height: size }}
              className="cursor-crosshair rounded border border-[#3b2a1a]/60"
            />
            {hover && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded border border-[#3b2a1a]/50 bg-[#fbf3df] px-2 py-1 text-xs shadow"
                style={{ left: hover.x, top: hover.y - 12 }}
              >
                <div className="font-bold">{hover.label}</div>
                {hover.sub && <div className="opacity-70">{hover.sub}</div>}
              </div>
            )}
          </div>
          {legend.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ maxWidth: size }}>
              <span className="font-bold uppercase tracking-wider opacity-60">Found</span>
              {legend.map((kd) => (
                <span key={kd} className="flex items-center gap-1">
                  <MarkerIcon kind={kd} />
                  {MARKER_NAME[kd]}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* explorer's journal */}
        <aside className="paper flex w-full max-w-sm flex-col gap-4 rounded-lg p-4 shadow-[0_12px_40px_rgba(0,0,0,0.5)] ring-1 ring-black/30">
          <div className="space-y-3">
            <Bar label="Energy" value={run.energy} color="linear-gradient(90deg,#5f8a43,#8db35a)" note={run.energy < 20 ? 'tired' : undefined} />
            <Bar
              label="Health"
              value={run.health}
              color="linear-gradient(90deg,#9a2a1e,#cf5a3a)"
              note={run.health <= 0 ? 'too hurt to walk' : run.health < HURT ? 'hurt: slower' : undefined}
            />
          </div>

          <div className="flex items-center gap-3 rounded-md border border-[#3b2a1a]/25 bg-[#3b2a1a]/5 p-2">
            <MarkerIcon kind={valley.goal.kind} />
            <div className="flex-1 text-sm">
              <div className="text-xs font-bold uppercase tracking-wider opacity-60">Looking for</div>
              <div className="font-bold">{goalSeen ? goal.name : `${goal.name}?`}</div>
            </div>
            {valley.clues.length > 0 && (
              <div className="text-right text-sm" title="Clues point to the next clue; the last one to the goal">
                <div className="text-xs font-bold uppercase tracking-wider opacity-60">Clues</div>
                <div className="font-bold tabular-nums">
                  {cluesFound} / {valley.clues.length}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-md border border-[#3b2a1a]/25 bg-[#3b2a1a]/5 p-2 text-center text-sm">
            {bearing === null ? (
              <span className="italic opacity-70">Click the map to choose a bearing</span>
            ) : (
              <>
                Heading <b>{compassName(bearing)}</b> · {Math.round(bearing)}°
              </>
            )}
          </div>

          <button className="btn-game green !py-3 text-lg" disabled={!playing} onClick={enterScene}>
            Back on foot <span className="kbd">M</span>
          </button>

          <div>
            <h3 className="mb-1 text-xs font-bold uppercase tracking-[0.2em] opacity-60">Journal</h3>
            <ul className="space-y-1.5 text-sm italic">
              {recent.map((s, i) => (
                <li key={run.log.length - i} className={i === 0 ? 'font-bold not-italic' : 'opacity-60'}>
                  {s.message}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs opacity-60">
            {km.toFixed(1)} km walked · {run.marks.length} places found · clues point to the next clue, the last one to the goal. Click the map to set a bearing: it shows on your compass.
          </p>
        </aside>
      </div>

      {!playing && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/55 p-4">
          <div className="paper w-full max-w-md rounded-xl p-6 text-center shadow-2xl ring-2 ring-[#3b2a1a]/60">
            <div className="mb-1 text-5xl">{run.status === 'won' ? '🏡' : '🌲'}</div>
            <h2 className="mb-1 text-3xl font-bold">{run.status === 'won' ? (lv ? 'Level complete!' : 'You made it!') : 'Lost for good'}</h2>
            <p className="mb-4 italic opacity-80">
              {run.status === 'won' ? goal.found : 'Nobody is looking for you here any more.'}
            </p>
            <div className="mb-4 grid grid-cols-3 gap-2 text-sm">
              <div className="rounded bg-[#3b2a1a]/10 p-2">
                <div className="text-xs uppercase opacity-60">Time</div>
                <div className="text-lg font-bold tabular-nums">{formatDuration(result?.time.seconds ?? useClock.getState().seconds)}</div>
              </div>
              <div className="rounded bg-[#3b2a1a]/10 p-2">
                <div className="text-xs uppercase opacity-60">In game</div>
                <div className="text-lg font-bold">{Math.round(hoursUsed)} h</div>
              </div>
              <div className="rounded bg-[#3b2a1a]/10 p-2">
                <div className="text-xs uppercase opacity-60">Walked</div>
                <div className="text-lg font-bold">{km.toFixed(1)} km</div>
              </div>
            </div>
            {result && lv && (
              <p className="mb-4 text-sm">
                {record ? (
                  <span className="rounded-full bg-[var(--moss)] px-3 py-1 font-bold text-amber-50">★ New best time</span>
                ) : (
                  <>Best: <b>{formatDuration(result.previous!.seconds)}</b></>
                )}
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              {run.status === 'won' && next && (
                <a className="btn-game green" href={`/play?level=${next.id}`}>
                  Next: {next.name} →
                </a>
              )}
              <button className="btn-game" onClick={() => start(valley.seed)}>
                {run.status === 'won' ? 'Replay' : 'Try again'}
              </button>
              {lv ? (
                <a className="btn-game ghost" href="/">
                  Menu
                </a>
              ) : (
                <button className="btn-game ghost" onClick={() => start(randomSeed())}>
                  New valley
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
