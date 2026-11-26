import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex h-dvh items-center justify-center gap-4">
      <Link href="/play" className="rounded bg-emerald-700 px-6 py-3 text-lg hover:bg-emerald-600">
        Play
      </Link>
      <Link href="/map" className="rounded bg-emerald-700 px-6 py-3 text-lg hover:bg-emerald-600">
        Map
      </Link>
    </main>
  )
}
