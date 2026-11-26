'use client'
import { useMemo } from 'react'
import * as THREE from 'three/webgpu'
import { CuboidCollider, HeightfieldCollider, RigidBody } from '@react-three/rapier'
import type { Terrain as TerrainData } from '@/game/core/terrain'

const MEADOW = new THREE.Color('#86a957')
const FOREST = new THREE.Color('#4e7436')
const ALPINE = new THREE.Color('#9aa36a')
const ROCK = new THREE.Color('#7f776d')
const ROCK_LIGHT = new THREE.Color('#a39d93')

function buildGeometry(t: TerrainData) {
  const n = t.segments + 1
  const cell = t.size / t.segments
  const tris = t.segments * t.segments * 2
  const pos = new Float32Array(tris * 9)
  const col = new Float32Array(tris * 9)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const ab = new THREE.Vector3()
  const ac = new THREE.Vector3()
  const color = new THREE.Color()
  let p = 0

  const vx = (ix: number, iz: number, out: THREE.Vector3) =>
    out.set(ix * cell - t.size / 2, t.heights[iz * n + ix], iz * cell - t.size / 2)

  const pushTri = () => {
    ab.subVectors(b, a)
    ac.subVectors(c, a)
    const normal = ab.cross(ac).normalize()
    const slope = 1 - Math.abs(normal.y)
    const h = (a.y + b.y + c.y) / 3 / t.maxHeight
    if (slope > 0.3) color.copy(h > 0.6 ? ROCK_LIGHT : ROCK)
    else if (h > 0.72) color.copy(slope > 0.15 ? ROCK_LIGHT : ALPINE)
    else if (h > 0.3) color.copy(FOREST)
    else color.copy(MEADOW)
    // deterministic small jitter for the low-poly look
    const j = (Math.sin(a.x * 12.9898 + a.z * 78.233) * 43758.5453) % 1
    color.offsetHSL(0, 0, j * 0.03)
    for (const v of [a, b, c]) {
      pos[p] = v.x
      pos[p + 1] = v.y
      pos[p + 2] = v.z
      col[p] = color.r
      col[p + 1] = color.g
      col[p + 2] = color.b
      p += 3
    }
  }

  for (let iz = 0; iz < t.segments; iz++) {
    for (let ix = 0; ix < t.segments; ix++) {
      // counter-clockwise seen from above (+y)
      vx(ix, iz, a); vx(ix, iz + 1, b); vx(ix + 1, iz, c); pushTri()
      vx(ix + 1, iz, a); vx(ix, iz + 1, b); vx(ix + 1, iz + 1, c); pushTri()
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.computeVertexNormals()
  return geo
}

export default function Terrain({ terrain }: { terrain: TerrainData }) {
  const geometry = useMemo(() => buildGeometry(terrain), [terrain])

  // Rapier heightfields are column-major: index = iz + ix * n
  const heights = useMemo(() => {
    const n = terrain.segments + 1
    const out = new Array<number>(n * n)
    for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) out[iz + ix * n] = terrain.heights[iz * n + ix]
    return out
  }, [terrain])

  const half = terrain.size / 2
  return (
    <>
      <mesh geometry={geometry} receiveShadow>
        <meshLambertMaterial vertexColors flatShading />
      </mesh>
      <RigidBody type="fixed" colliders={false}>
        <HeightfieldCollider
          args={[terrain.segments, terrain.segments, heights, { x: terrain.size, y: 1, z: terrain.size }]}
        />
        {/* invisible walls */}
        <CuboidCollider args={[1, 400, half]} position={[half + 1, 200, 0]} />
        <CuboidCollider args={[1, 400, half]} position={[-half - 1, 200, 0]} />
        <CuboidCollider args={[half, 400, 1]} position={[0, 200, half + 1]} />
        <CuboidCollider args={[half, 400, 1]} position={[0, 200, -half - 1]} />
      </RigidBody>
    </>
  )
}
