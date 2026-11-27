'use client'
import { useEffect, useState } from 'react'
import { LEVELS } from '@/game/core/levels'
import { formatDuration, loadProgress, savedRunInfo, type Progress } from '@/game/state/save'

function Compass() {
  return (
    <svg viewBox="-50 -50 100 100" className="h-24 w-24 drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]" aria-hidden>
      <circle r="46" fill="#efe4c8" stroke="#3b2a1a" strokeWidth="2" />
      <circle r="38" fill="none" stroke="#3b2a1a" strokeWidth="0.8" strokeDasharray="2 3" />
      <g className="origin-center animate-[spin_24s_linear_infinite]">
        <path d="M0-36 L7 0 L0 36 L-7 0Z" fill="#3b2a1a" />
        <path d="M0-36 L7 0 L-7 0Z" fill="#9a3b1e" />
        <path d="M-36 0 L0 5 L36 0 L0 -5Z" fill="#3b2a1a" opacity="0.5" />
      </g>
      <circle r="3" fill="#efe4c8" stroke="#3b2a1a" />
      <text y="-40" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#3b2a1a" dy="3" fontFamily="Georgia">
        N
      </text>
    </svg>
  )
}

/** Title screen: the campaign, one level unlocking the next. */
export default function MainMenu() {
  const [progress, setProgress] = useState<Progress | null>(null)
  const [saves, setSaves] = useState<Record<number, { day: number; seconds: number } | null>>({})

  useEffect(() => {
    setProgress(loadProgress())
    setSaves(Object.fromEntries(LEVELS.map((l) => [l.id, savedRunInfo(l.seed)])))
  }, [])

  const unlocked = progress?.unlocked ?? 1
  const current = LEVELS.find((l) => l.id === Math.min(unlocked, LEVELS.length)) ?? LEVELS[0]
  const currentSave = saves[current.id]

  return (
    <main className="topo-bg min-h-dvh px-4 py-10 font-serif text-amber-50">
      <div className="mx-auto flex max-w-4xl flex-col items-center">
        <Compass />
        <h1 className="mt-4 text-6xl font-bold tracking-[0.15em] drop-shadow-[0_3px_0_rgba(0,0,0,0.5)]">BEARING</h1>
        <p className="mt-2 max-w-md text-center italic text-amber-100/80">
          Lost in the wild with a map that fills in as you climb. Read the clues, pick a bearing, cross rivers and ridges, and find your way back to people before your days run out.
        </p>

        <a href={`/play?level=${current.id}`} className="btn-game green mt-8 !px-10 !py-4 text-2xl">
          {currentSave ? 'Continue' : 'Play'} · Level {current.id}
        </a>
        {currentSave && (
          <p className="mt-2 text-sm text-amber-100/70">
            {current.name}, day {currentSave.day}, {formatDuration(currentSave.seconds)} played
          </p>
        )}

        <h2 className="mt-12 mb-4 text-sm font-bold uppercase tracking-[0.3em] text-amber-200/70">Levels</h2>
        <ul className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LEVELS.map((l) => {
            const open = l.id <= unlocked
            const best = progress?.best[l.id]
            const save = saves[l.id]
            return (
              <li key={l.id}>
                <div
                  className={`paper relative flex h-full flex-col rounded-lg p-4 shadow-[0_8px_24px_rgba(0,0,0,0.45)] ring-1 ring-black/30 transition ${
                    open ? 'hover:-translate-y-0.5' : 'opacity-55 grayscale'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-xs font-bold uppercase tracking-[0.2em] opacity-60">Level {l.id}</span>
                    {!open ? (
                      <span className="text-xl" title="Finish the previous level to unlock">🔒</span>
                    ) : best ? (
                      <span className="rounded-full bg-[var(--moss)] px-2 py-0.5 text-xs font-bold text-amber-50">✓ done</span>
                    ) : null}
                  </div>
                  <h3 className="mt-1 text-2xl font-bold">{l.name}</h3>
                  <p className="mt-1 flex-1 text-sm italic opacity-75">{open ? l.blurb : 'Finish the previous level to unlock.'}</p>
                  <div className="mt-3 text-sm">
                    Best time: <b className="tabular-nums">{best ? formatDuration(best.seconds) : '—'}</b>
                    {best && <span className="opacity-60"> · {Math.round(best.hours)} h in game</span>}
                  </div>
                  {open && (
                    <div className="mt-3 flex gap-2">
                      <a href={`/play?level=${l.id}`} className="btn-game green flex-1">
                        {save ? `Continue (day ${save.day})` : 'Play'}
                      </a>
                      {save && (
                        <a href={`/play?level=${l.id}&new=1`} className="btn-game ghost" title="Start this level over">
                          ↺
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        <p className="mt-10 text-xs text-amber-100/50">Progress is saved in this browser. Accounts and leaderboards are coming.</p>
      </div>
    </main>
  )
}
