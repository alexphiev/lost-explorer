'use client'

import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry, DoubleSide, MeshStandardNodeMaterial } from 'three/webgpu'
import { attribute, color, dot, float, mix, mx_noise_float, normalView, normalize, positionViewDirection, positionWorld, sin, smoothstep, time, vec3 } from 'three/tsl'
import type { HeightField } from '@/game/core/terrain'
import type { Terrain } from '@/game/core/terrain'
import { RIBBON_MARGIN } from '@/game/core/rivers'

export function waterLevelAt(field: HeightField, tile: Terrain, localX: number, localZ: number): number {
  return field.water(localX + tile.centerX, localZ + tile.centerZ)
}

/** Still water (lakes, ponds) or, with `flowing`, streams: ripples drift with the per-vertex current, foam where it runs fast. */
function makeWaterMaterial(flowing: boolean) {
  const m = new MeshStandardNodeMaterial()
  m.transparent = true
  m.depthWrite = false
  m.side = DoubleSide
  m.roughness = 0.12
  m.metalness = 0

  const t = time
  const current = flowing ? attribute('flow', 'vec2') : null
  // ripples ride the current
  const p = current ? positionWorld.xz.sub(current.mul(t)) : positionWorld.xz
  const speed = current ? current.length() : float(0)
  const rx = sin(p.x.mul(0.35).add(t.mul(0.8))).mul(0.5).add(sin(p.y.mul(0.9).add(p.x.mul(0.4)).sub(t.mul(1.3))).mul(0.3))
  const rz = sin(p.y.mul(0.4).sub(t.mul(0.7))).mul(0.5).add(sin(p.x.mul(1.1).sub(p.y.mul(0.5)).add(t.mul(1.1))).mul(0.3))
  // running water is choppier
  m.normalNode = normalize(normalView.add(vec3(rx, 0, rz).mul(speed.mul(0.12).add(0.06))))

  const fres = float(1).sub(dot(normalView, positionViewDirection).abs()).clamp(0, 1)
  const base = mix(color(0x1f4f5c), color(0x4f8c88), fres)
  let col = mix(base, color(0xb9d3dc), fres.pow(3).mul(0.6))
  if (current) {
    // white water where the stream runs fast (riffles, rapids)
    const n = mx_noise_float(vec3(p.x.mul(0.45), p.y.mul(0.45), t.mul(0.6)))
    const foam = smoothstep(0.15, 0.55, n).mul(speed.sub(0.55).clamp(0, 1))
    col = mix(col, color(0xe8f0ee), foam.mul(0.65))
    m.opacityNode = mix(float(0.72), float(0.92), fres).add(foam.mul(0.2)).clamp(0, 1)
  } else {
    m.opacityNode = mix(float(0.82), float(0.95), fres)
  }
  m.colorNode = col
  return m
}

/** Water ribbons along the streams and rivers of the tile (local coordinates). */
function buildStreams(field: HeightField, tile: Terrain) {
  const half = tile.size / 2
  const pos: number[] = []
  const flow: number[] = []
  const idx: number[] = []
  for (const r of field.rivers.near(tile.centerX, tile.centerZ, half + 50)) {
    let prev = -1 // vertex index of the previous node's left edge, −1 at the start of a run
    const inLake = Array.from({ length: r.n }, (_, i) => field.lake(r.x[i], r.z[i]) > -Infinity)
    for (let i = 0; i < r.n; i++) {
      const x = r.x[i] - tile.centerX
      const z = r.z[i] - tile.centerZ
      // inside a lake the ribbon is hidden under its surface: keep the first node in, so the stream reaches the shore
      const drowned = inLake[i] && !(i > 0 && !inLake[i - 1]) && !(i < r.n - 1 && !inLake[i + 1])
      if (!r.wet[i] || drowned || Math.abs(x) > half || Math.abs(z) > half) {
        prev = -1
        continue
      }
      const w = r.halfW[i] + RIBBON_MARGIN
      const px = -r.dz[i] * w
      const pz = r.dx[i] * w
      const v = pos.length / 3
      const y = r.level[i] + 0.03
      pos.push(x + px, y, z + pz, x - px, y, z - pz)
      const fx = r.dx[i] * r.speed[i]
      const fz = r.dz[i] * r.speed[i]
      flow.push(fx, fz, fx, fz)
      if (prev >= 0) idx.push(prev, prev + 1, v, prev + 1, v + 1, v)
      prev = v
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('flow', new BufferAttribute(new Float32Array(flow), 2))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(pos.length).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3))
  g.setIndex(idx)
  return g
}

export default function Water({ field, tile }: { field: HeightField; tile: Terrain }) {
  const still = useMemo(() => makeWaterMaterial(false), [])
  const running = useMemo(() => makeWaterMaterial(true), [])
  const lakes = useMemo(() => field.lakesNear(tile.centerX, tile.centerZ, 800), [field, tile])
  const streams = useMemo(() => buildStreams(field, tile), [field, tile])
  useEffect(
    () => () => {
      streams.dispose()
    },
    [streams],
  )
  useEffect(
    () => () => {
      still.dispose()
      running.dispose()
    },
    [still, running],
  )
  return (
    <>
      {lakes.map((l, i) => (
        <mesh
          key={i}
          material={still}
          position={[l.x - tile.centerX, l.level, l.z - tile.centerZ]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <circleGeometry args={[l.radius + 1.5, 48]} />
        </mesh>
      ))}
      <mesh geometry={streams} material={running} receiveShadow />
    </>
  )
}
