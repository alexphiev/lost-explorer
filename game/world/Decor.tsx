'use client'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useRapier } from '@react-three/rapier'
import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Decor as DecorData, Instance } from '@/game/core/placement'
import { windMaterial } from '@/game/render/tsl/wind'

function painted(geo: THREE.BufferGeometry, hex: string, y = 0, x = 0, z = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo
  g.translate(x, y, z)
  const c = new THREE.Color(hex)
  const n = g.attributes.position.count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.deleteAttribute('uv')
  return g
}

const LOG_R = 0.3
const LOG_HALF = 2
const STUMP_H = 0.5

/** vertex colour gradient base -> tip along Y (0..h) */
function gradient(g: THREE.BufferGeometry, from: string, to: string, h: number) {
  const a = new THREE.Color(from)
  const b = new THREE.Color(to)
  const c = new THREE.Color()
  const pos = g.attributes.position
  const col = g.attributes.color
  for (let i = 0; i < pos.count; i++) {
    c.copy(a).lerp(b, Math.min(1, Math.max(0, pos.getY(i) / h)))
    col.setXYZ(i, c.r, c.g, c.b)
  }
  return g
}

function makeGeometries() {
  // 8 triangles, squashed per instance
  const pebble = painted(new THREE.OctahedronGeometry(1, 0), '#ffffff')

  const frond = (angle: number, tilt: number, len: number) => {
    const g = painted(new THREE.ConeGeometry(0.09, len, 3), '#ffffff', len / 2)
    g.scale(1, 1, 0.3)
    gradient(g, '#35602a', '#9cc95e', len)
    g.rotateZ(-tilt)
    g.rotateY(angle)
    return g
  }
  const fern = mergeGeometries([
    frond(0, 0.7, 0.6),
    frond(1.05, 0.55, 0.55),
    frond(2.1, 0.75, 0.62),
    frond(3.15, 0.6, 0.5),
    frond(4.2, 0.7, 0.58),
    frond(5.25, 0.45, 0.48),
  ])

  const shrub = mergeGeometries([
    painted(new THREE.IcosahedronGeometry(0.4, 0), '#4a5d2c', 0.3),
    painted(new THREE.IcosahedronGeometry(0.3, 0), '#5a6e33', 0.22, 0.35, 0.1),
    painted(new THREE.OctahedronGeometry(0.05, 0), '#c8362c', 0.66, 0.05, 0.1),
    painted(new THREE.OctahedronGeometry(0.045, 0), '#f4f1e6', 0.46, 0.4, 0.0),
  ])

  const stem = () => painted(new THREE.CylinderGeometry(0.022, 0.03, 0.12, 5), '#e9e1cf', 0.06)
  const spot = (a: number) => painted(new THREE.OctahedronGeometry(0.018, 0), '#fbf8ee', 0.168, Math.cos(a) * 0.04, Math.sin(a) * 0.04)
  const mushRed = mergeGeometries([
    stem(),
    painted(new THREE.ConeGeometry(0.09, 0.07, 6), '#c8362c', 0.155),
    spot(0.4),
    spot(2.5),
    spot(4.5),
  ])
  const mushBrown = mergeGeometries([
    stem(),
    painted(new THREE.SphereGeometry(0.085, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2), '#8a6240', 0.115),
  ])

  const cut = (x: number, rotY: number) => {
    const g = new THREE.CircleGeometry(LOG_R * 0.92, 6)
    g.rotateY(rotY)
    return painted(g, '#cfa972', LOG_R, x)
  }
  const trunk = new THREE.CylinderGeometry(LOG_R, LOG_R, LOG_HALF * 2, 6, 1, true)
  trunk.rotateZ(Math.PI / 2)
  const moss = (x: number, z: number) => {
    const g = new THREE.OctahedronGeometry(0.2, 0)
    g.scale(1.6, 0.4, 1)
    return painted(g, '#5f8a3a', LOG_R * 2 - 0.02, x, z)
  }
  const log = mergeGeometries([
    painted(trunk, '#6b4f3a', LOG_R),
    cut(LOG_HALF + 0.002, Math.PI / 2),
    cut(-LOG_HALF - 0.002, -Math.PI / 2),
    moss(-0.8, 0.02),
    moss(0.9, -0.03),
  ])

  const root = (angle: number) => {
    const g = painted(new THREE.ConeGeometry(0.1, 0.35, 4), '#5a4332', 0.175)
    g.rotateZ(-1.1)
    g.translate(0.32, 0.04, 0)
    g.rotateY(angle)
    return g
  }
  const stump = mergeGeometries([
    painted(new THREE.CylinderGeometry(0.4, 0.45, STUMP_H, 7, 1, true), '#6e5440', STUMP_H / 2),
    painted(new THREE.CircleGeometry(0.4, 7).rotateX(-Math.PI / 2), '#c8a574', STUMP_H + 0.002),
    root(0.5),
    root(2.6),
    root(4.7),
  ])

  const twig = (len: number, rotY: number, y: number, x: number, z: number, hex: string) => {
    const g = new THREE.CylinderGeometry(0.02, 0.025, len, 4)
    g.rotateZ(Math.PI / 2)
    g.rotateY(rotY)
    return painted(g, hex, y, x, z)
  }
  const branch = mergeGeometries([
    twig(1.2, 0, 0.03, 0, 0, '#7a6a5a'),
    twig(0.9, 0.9, 0.06, 0.1, 0.05, '#6f6152'),
    twig(0.7, -0.7, 0.08, -0.1, 0.0, '#82725f'),
  ])

  return { pebble, fern, shrub, mushRed, mushBrown, log, stump, branch }
}

const tmpM = new THREE.Matrix4()
const tmpQ = new THREE.Quaternion()
const tmpS = new THREE.Vector3()
const tmpP = new THREE.Vector3()
const tmpE = new THREE.Euler()
const tmpC = new THREE.Color()

function fill(
  mesh: THREE.InstancedMesh | null,
  items: Instance[],
  colorOf: (it: Instance, out: THREE.Color) => void,
  squash = (_it: Instance) => 1,
  sink = 0,
) {
  if (!mesh) return
  items.forEach((it, i) => {
    tmpE.set(0, it.rotation, 0)
    tmpQ.setFromEuler(tmpE)
    tmpS.set(it.scale, it.scale * squash(it), it.scale)
    tmpP.set(it.x, it.y - sink * it.scale, it.z)
    tmpM.compose(tmpP, tmpQ, tmpS)
    mesh.setMatrixAt(i, tmpM)
    colorOf(it, tmpC)
    mesh.setColorAt(i, tmpC)
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.computeBoundingSphere()
}

const pebbleSquash = (it: Instance) => 0.5 + it.tint * 0.3

/** Fixed colliders for logs and stumps, created imperatively (see VegetationColliders for why useLayoutEffect). */
function DecorColliders({ data }: { data: DecorData }) {
  const { world, rapier } = useRapier()
  useLayoutEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed())
    for (const it of data.logs) {
      tmpE.set(0, it.rotation, 0)
      tmpQ.setFromEuler(tmpE)
      world.createCollider(
        rapier.ColliderDesc.cuboid(LOG_HALF * it.scale, LOG_R * it.scale, LOG_R * it.scale)
          .setTranslation(it.x, it.y + LOG_R * it.scale, it.z)
          .setRotation({ x: tmpQ.x, y: tmpQ.y, z: tmpQ.z, w: tmpQ.w }),
        body,
      )
    }
    for (const it of data.stumps) {
      const half = 0.25 * it.scale
      world.createCollider(rapier.ColliderDesc.cylinder(half, 0.42 * it.scale).setTranslation(it.x, it.y + half, it.z), body)
    }
    return () => world.removeRigidBody(body)
  }, [world, rapier, data])
  return null
}

/** Free the GPU resources a component created itself (R3F doesn't dispose constructor args or primitives). */
function useDisposeOnUnmount(...groups: Record<string, { dispose(): void }>[]) {
  useEffect(() => () => groups.forEach((g) => Object.values(g).forEach((r) => r.dispose())), groups)
}

export default function Decor({ data }: { data: DecorData }) {
  const geos = useMemo(makeGeometries, [])
  const mats = useMemo(
    () => ({
      fern: windMaterial(0.12, 0.7),
      shrub: windMaterial(0.08, 1),
      solid: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    }),
    [],
  )
  useDisposeOnUnmount(geos, mats)
  const redM = useMemo(() => data.mushrooms.filter((it) => it.tint < 0.5), [data])
  const brownM = useMemo(() => data.mushrooms.filter((it) => it.tint >= 0.5), [data])

  const pebbles = useRef<THREE.InstancedMesh>(null)
  const ferns = useRef<THREE.InstancedMesh>(null)
  const shrubs = useRef<THREE.InstancedMesh>(null)
  const mushRed = useRef<THREE.InstancedMesh>(null)
  const mushBrown = useRef<THREE.InstancedMesh>(null)
  const logs = useRef<THREE.InstancedMesh>(null)
  const stumps = useRef<THREE.InstancedMesh>(null)
  const branches = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    fill(pebbles.current, data.pebbles, (it, c) => c.setHSL(0.08 + it.tint * 0.05, 0.05 + it.tint * 0.1, 0.4 + it.tint * 0.3), pebbleSquash, 0.3)
    fill(ferns.current, data.ferns, (it, c) => c.setRGB(0.8 + 0.2 * it.tint, 1, 0.75 + 0.25 * (1 - it.tint)))
    fill(shrubs.current, data.shrubs, (it, c) => c.setRGB(0.85 + 0.15 * it.tint, 0.95 + 0.05 * it.tint, 0.85), undefined, 0.05)
    fill(mushRed.current, redM, (it, c) => c.setScalar(0.9 + it.tint * 0.2))
    fill(mushBrown.current, brownM, (it, c) => c.setScalar(0.9 + (it.tint - 0.5) * 0.2))
    fill(logs.current, data.logs, (it, c) => c.setScalar(0.85 + it.tint * 0.15))
    fill(stumps.current, data.stumps, (it, c) => c.setScalar(0.85 + it.tint * 0.15))
    fill(branches.current, data.branches, (it, c) => c.setScalar(0.8 + it.tint * 0.2))
  }, [data, redM, brownM])

  return (
    <>
      <DecorColliders data={data} />
      {data.pebbles.length > 0 && <instancedMesh ref={pebbles} args={[geos.pebble, mats.solid, data.pebbles.length]} receiveShadow />}
      {data.ferns.length > 0 && <instancedMesh ref={ferns} args={[geos.fern, mats.fern, data.ferns.length]} receiveShadow />}
      {data.shrubs.length > 0 && <instancedMesh ref={shrubs} args={[geos.shrub, mats.shrub, data.shrubs.length]} castShadow receiveShadow />}
      {redM.length > 0 && <instancedMesh ref={mushRed} args={[geos.mushRed, mats.solid, redM.length]} />}
      {brownM.length > 0 && <instancedMesh ref={mushBrown} args={[geos.mushBrown, mats.solid, brownM.length]} />}
      {data.logs.length > 0 && <instancedMesh ref={logs} args={[geos.log, mats.solid, data.logs.length]} castShadow receiveShadow />}
      {data.stumps.length > 0 && <instancedMesh ref={stumps} args={[geos.stump, mats.solid, data.stumps.length]} castShadow receiveShadow />}
      {data.branches.length > 0 && <instancedMesh ref={branches} args={[geos.branch, mats.solid, data.branches.length]} receiveShadow />}
    </>
  )
}
