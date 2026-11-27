'use client'
import dynamic from 'next/dynamic'

const Game = dynamic(() => import('@/game/ui/Game'), {
  ssr: false,
  loading: () => <p className="p-4 text-amber-950">Unrolling the map…</p>,
})

export default function GameLoader() {
  return <Game />
}
