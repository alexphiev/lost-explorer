'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { runStore } from '@/game/state/run'
import * as THREE from 'three/webgpu'
import { CuboidCollider, HeightfieldCollider, RigidBody } from '@react-three/rapier'
import { worldRel, type Terrain as TerrainData } from '@/game/core/terrain'
import { terrainMaterial } from '@/game/render/tsl/surface'

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

/** The world is drawn in CHUNK_CELLS × CHUNK_CELLS-cell chunks: full detail near the player, coarse (every LOD_STEP-th vertex) far away. */
const CHUNK_CELLS = 128 // 500 m
const LOD_STEP = 4
const DETAIL_RADIUS = 750 // metres from the player to a chunk's centre
const SKIRT = 6 // metres: coarse chunks hang a skirt down their edges, hiding cracks against detailed neighbours

/** Mesh for the cells [ix0, ix0 + count) × [iz0, iz0 + count), one vertex every `step` cells. */
function buildGeometry(t: TerrainData, ix0: number, iz0: number, count: number, step: number) {
  const n = t.segments + 1
  const cell = t.size / t.segments
  const cellsPerSide = count / step
  const tris = cellsPerSide * cellsPerSide * 2 + (step > 1 ? cellsPerSide * 4 * 4 : 0)
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

  const S = step
  for (let iz = iz0; iz < iz0 + count; iz += S) {
    for (let ix = ix0; ix < ix0 + count; ix += S) {
      const moist = t.moisture[iz * n + ix]
      // counter-clockwise seen from above (+y)
      vx(ix, iz, a); vx(ix, iz + S, b); vx(ix + S, iz, c); pushTri(moist)
      vx(ix + S, iz, a); vx(ix, iz + S, b); vx(ix + S, iz + S, c); pushTri(moist)
    }
  }
  if (S > 1) {
    // skirts: both faces of a strip hanging under each edge
    const edge = (x0: number, z0: number, x1: number, z1: number) => {
      const m = t.moisture[z0 * n + x0]
      vx(x0, z0, a); vx(x1, z1, b); vx(x1, z1, c); c.y -= SKIRT; pushTri(m)
      vx(x0, z0, a); vx(x1, z1, c); c.y -= SKIRT; vx(x1, z1, b); pushTri(m)
      vx(x0, z0, a); vx(x1, z1, b); b.y -= SKIRT; vx(x0, z0, c); c.y -= SKIRT; pushTri(m)
      vx(x0, z0, a); vx(x0, z0, b); b.y -= SKIRT; vx(x1, z1, c); c.y -= SKIRT; pushTri(m)
    }
    const e = count
    for (let k = 0; k < e; k += S) {
      edge(ix0 + k, iz0, ix0 + k + S, iz0)
      edge(ix0 + k, iz0 + e, ix0 + k + S, iz0 + e)
      edge(ix0, iz0 + k, ix0, iz0 + k + S)
      edge(ix0 + e, iz0 + k, ix0 + e, iz0 + k + S)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.computeVertexNormals()
  return geo
}

function Chunk({ terrain, cx, cz, detailed, material }: { terrain: TerrainData; cx: number; cz: number; detailed: boolean; material: THREE.Material }) {
  const geometry = useMemo(
    () => buildGeometry(terrain, cx * CHUNK_CELLS, cz * CHUNK_CELLS, CHUNK_CELLS, detailed ? 1 : LOD_STEP),
    [terrain, cx, cz, detailed],
  )
  // the geometry is passed as a prop: R3F won't free it for us
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} material={material} receiveShadow />
}

export default function Terrain({ terrain }: { terrain: TerrainData }) {
  const material = useMemo(terrainMaterial, [])
  useEffect(() => () => material.dispose(), [material])
  const chunks = terrain.segments / CHUNK_CELLS
  const chunkSize = CHUNK_CELLS * (terrain.size / terrain.segments)
  const lodFor = useCallback(() => {
    const p = runStore.getState().playerPosition
    const out: boolean[] = []
    for (let cz = 0; cz < chunks; cz++) {
      for (let cx = 0; cx < chunks; cx++) {
        const mx = -terrain.size / 2 + (cx + 0.5) * chunkSize
        const mz = -terrain.size / 2 + (cz + 0.5) * chunkSize
        out.push(Math.hypot(Math.max(0, Math.abs(p.x - mx) - chunkSize / 2), Math.max(0, Math.abs(p.z - mz) - chunkSize / 2)) < DETAIL_RADIUS - chunkSize / 2)
      }
    }
    return out
  }, [terrain, chunks, chunkSize])
  const [detail, setDetail] = useState(lodFor)
  // which chunks are detailed: checked once a second (not in the frame loop)
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = lodFor()
      setDetail((prev) => (prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next))
    }, 1000)
    return () => window.clearInterval(id)
  }, [lodFor])

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
      {detail.map((d, i) => (
        <Chunk key={i} terrain={terrain} cx={i % chunks} cz={Math.floor(i / chunks)} detailed={d} material={material} />
      ))}
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
