'use client'
import { useMemo } from 'react'
import * as THREE from 'three/webgpu'
import { CuboidCollider, HeightfieldCollider, RigidBody } from '@react-three/rapier'
import { worldRel, type Terrain as TerrainData } from '@/game/core/terrain'

const DRY_GRASS = new THREE.Color('#c2b25f')
const LUSH_GRASS = new THREE.Color('#77a24a')
const MOSS = new THREE.Color('#4f7f3c')
const FOREST_FLOOR = new THREE.Color('#4a6531')
const ALPINE = new THREE.Color('#a7a571')
const ROCK_WARM = new THREE.Color('#8f8273')
const ROCK_COOL = new THREE.Color('#a29d94')
const ROCK_DARK = new THREE.Color('#6b645c')

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

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
  const grass = new THREE.Color()
  const rock = new THREE.Color()
  const color = new THREE.Color()
  let p = 0

  const vx = (ix: number, iz: number, out: THREE.Vector3) =>
    out.set(ix * cell - t.size / 2, t.heights[iz * n + ix], iz * cell - t.size / 2)

  const pushTri = (moist: number) => {
    ab.subVectors(b, a)
    ac.subVectors(c, a)
    const normal = ab.cross(ac).normalize()
    const slope = 1 - Math.abs(normal.y)
    const y = (a.y + b.y + c.y) / 3
    const h = worldRel(y)
    const hash = Math.abs((Math.sin(a.x * 12.9898 + a.z * 78.233) * 43758.5453) % 1)

    // vegetation ground: dry golden → lush by moisture, moss in wet hollows,
    // darker forest floor mid-slope, pale alpine grass up high
    grass.copy(DRY_GRASS).lerp(LUSH_GRASS, smooth(0.25, 0.65, moist))
    grass.lerp(MOSS, smooth(0.7, 0.95, moist) * (1 - smooth(0.2, 0.45, h)))
    grass.lerp(FOREST_FLOOR, smooth(0.3, 0.5, h) * (1 - smooth(0.68, 0.8, h)) * (0.5 + 0.5 * moist))
    grass.lerp(ALPINE, smooth(0.72, 0.88, h))

    // rock: warm/cool strata bands, darker in steep faces
    const band = 0.5 + 0.5 * Math.sin(y * 0.35 + Math.sin(a.x * 0.01) * 2)
    rock.copy(ROCK_WARM).lerp(ROCK_COOL, band * 0.8).lerp(ROCK_DARK, smooth(0.5, 0.8, slope) * 0.6)

    color.copy(grass).lerp(rock, smooth(0.22, 0.38, slope + (hash - 0.5) * 0.06))
    color.offsetHSL((hash - 0.5) * 0.012, 0, (hash - 0.5) * 0.05)

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
      const moist = t.moisture[iz * n + ix]
      // counter-clockwise seen from above (+y)
      vx(ix, iz, a); vx(ix, iz + 1, b); vx(ix + 1, iz, c); pushTri(moist)
      vx(ix + 1, iz, a); vx(ix, iz + 1, b); vx(ix + 1, iz + 1, c); pushTri(moist)
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
