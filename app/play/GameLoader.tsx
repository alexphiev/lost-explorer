'use client'
import dynamic from 'next/dynamic'

const Game = dynamic(() => import('@/game/world/Scene'), {
  ssr: false,
  loading: () => <p className="p-4 text-neutral-800">Loading the valley…</p>,
})

export default function GameLoader() {
  return <Game />
}
