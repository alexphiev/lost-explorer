'use client'
import dynamic from 'next/dynamic'

const Game = dynamic(() => import('@/game/ui/Game'), {
  ssr: false,
  loading: () => <p className="p-4 font-serif text-amber-100">Unrolling the map…</p>,
})

export default function GameLoader() {
  return <Game />
}
