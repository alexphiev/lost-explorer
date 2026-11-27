'use client'

import { useMemo } from 'react'
import { DoubleSide, MeshStandardNodeMaterial } from 'three/webgpu'
import { color, dot, float, mix, normalView, normalize, positionViewDirection, positionWorld, sin, time, vec3 } from 'three/tsl'
import type { HeightField } from '@/game/core/terrain'
import type { Terrain } from '@/game/core/terrain'

export function waterLevelAt(field: HeightField, tile: Terrain, localX: number, localZ: number): number {
  return field.water(localX + tile.centerX, localZ + tile.centerZ)
}

function makeWaterMaterial() {
  const m = new MeshStandardNodeMaterial()
  m.transparent = true
  m.depthWrite = false
  m.side = DoubleSide
  m.roughness = 0.12
  m.metalness = 0

  const p = positionWorld.xz
  const t = time
  // gentle ripples: three crossing sin waves perturb the normal
  const rx = sin(p.x.mul(0.35).add(t.mul(0.8))).mul(0.5).add(sin(p.y.mul(0.9).add(p.x.mul(0.4)).sub(t.mul(1.3))).mul(0.3))
  const rz = sin(p.y.mul(0.4).sub(t.mul(0.7))).mul(0.5).add(sin(p.x.mul(1.1).sub(p.y.mul(0.5)).add(t.mul(1.1))).mul(0.3))
  m.normalNode = normalize(normalView.add(vec3(rx, 0, rz).mul(0.06)))

  const fres = float(1).sub(dot(normalView, positionViewDirection).abs()).clamp(0, 1)
  const base = mix(color(0x1f4f5c), color(0x4f8c88), fres)
  m.colorNode = mix(base, color(0xb9d3dc), fres.pow(3).mul(0.6))
  m.opacityNode = mix(float(0.82), float(0.95), fres)
  return m
}

export default function Water({ field, tile }: { field: HeightField; tile: Terrain }) {
  const material = useMemo(makeWaterMaterial, [])
  const lakes = useMemo(() => field.lakesNear(tile.centerX, tile.centerZ, 800), [field, tile])
  return (
    <>
      {lakes.map((l, i) => (
        <mesh
          key={i}
          material={material}
          position={[l.x - tile.centerX, l.level, l.z - tile.centerZ]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <circleGeometry args={[l.radius + 1.5, 48]} />
        </mesh>
      ))}
    </>
  )
}
