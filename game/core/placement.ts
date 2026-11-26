import { makeRng } from './rng'
import { heightAt, slopeAt, type Terrain } from './terrain'

export interface Instance {
  x: number
  y: number
  z: number
  scale: number
  rotation: number
}

const SPAWN_CLEAR_RADIUS = 8

function scatter(
  t: Terrain,
  seed: string,
  name: string,
  count: number,
  maxSlope: number,
  minScale: number,
  maxScale: number,
): Instance[] {
  const rng = makeRng(seed, name)
  const out: Instance[] = []
  const half = t.size / 2 - 5
  let tries = 0
  while (out.length < count && tries < count * 50) {
    tries++
    const x = (rng() * 2 - 1) * half
    const z = (rng() * 2 - 1) * half
    if (x * x + z * z < SPAWN_CLEAR_RADIUS ** 2) continue
    if (slopeAt(t, x, z) > maxSlope) continue
    out.push({
      x,
      y: heightAt(t, x, z),
      z,
      scale: minScale + rng() * (maxScale - minScale),
      rotation: rng() * Math.PI * 2,
    })
  }
  return out
}

export function placeTrees(t: Terrain, seed: string): Instance[] {
  return scatter(t, seed, 'trees', 2000, 0.6, 0.7, 1.4)
}

export function placeRocks(t: Terrain, seed: string): Instance[] {
  return scatter(t, seed, 'rocks', 500, 0.9, 0.5, 2)
}
