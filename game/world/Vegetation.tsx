'use client'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useRapier } from '@react-three/rapier'
import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Instance, Vegetation as VegetationData } from '@/game/core/placement'
import { windMaterial } from '@/game/render/tsl/wind'
import { texturedLambert } from '@/game/render/tsl/surface'

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

function makeGeometries() {
  const conifer = mergeGeometries([
    painted(new THREE.CylinderGeometry(0.16, 0.26, 2.4, 5), '#5e4330', 1.2),
    painted(new THREE.ConeGeometry(2.0, 4.2, 7), '#2f5530', 3.6),
    painted(new THREE.ConeGeometry(1.5, 3.4, 7), '#365f34', 5.6),
    painted(new THREE.ConeGeometry(0.9, 2.2, 6), '#3d6a38', 7.3),
  ])
  const broadleafTrunk = painted(new THREE.CylinderGeometry(0.18, 0.3, 3, 5), '#7a6048', 1.5)
  const broadleaf = mergeGeometries([
    painted(new THREE.IcosahedronGeometry(2.1, 0), '#ffffff', 4.3),
    painted(new THREE.IcosahedronGeometry(1.5, 0), '#f2f2f2', 5.2, 1.0, 0.4),
    painted(new THREE.IcosahedronGeometry(1.3, 0), '#e8e8e8', 4.6, -1.1, -0.3),
  ])
  const blade = (angle: number, tilt: number) => {
    const g = painted(new THREE.ConeGeometry(0.07, 0.6, 3), '#ffffff', 0.3)
    g.rotateZ(tilt)
    g.rotateY(angle)
    // darker at the base
    const pos = g.attributes.position
    const col = g.attributes.color
    for (let i = 0; i < pos.count; i++) {
      const k = 0.55 + 0.45 * Math.min(1, Math.max(0, pos.getY(i) / 0.6))
      col.setXYZ(i, k, k, k)
    }
    return g
  }
  const grass = mergeGeometries([blade(0, 0.15), blade(2.1, 0.25), blade(4.2, 0.2), blade(1, -0.05)])
  const flower = mergeGeometries([
    painted(new THREE.CylinderGeometry(0.015, 0.02, 0.4, 3), '#7c9a4a', 0.2),
    painted(new THREE.IcosahedronGeometry(0.08, 0), '#ffffff', 0.42),
  ])
  const rock = new THREE.DodecahedronGeometry(1, 0)
  // thorny scrub: a tangle of dark blobs, ~2 m tall
  const bush = mergeGeometries([
    painted(new THREE.IcosahedronGeometry(1.1, 0), '#4b5e2e', 0.9),
    painted(new THREE.IcosahedronGeometry(0.9, 0), '#566a33', 1.3, 0.8, 0.3),
    painted(new THREE.IcosahedronGeometry(0.8, 0), '#43552a', 0.8, -0.7, -0.5),
  ])
  return { conifer, broadleafTrunk, broadleaf, grass, flower, rock, bush }
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
    const sy = squash(it)
    tmpS.set(it.scale, it.scale * sy, it.scale)
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

export const rockSquash = (it: Instance) => 0.45 + it.tint * 0.4
export const ROCK_SINK = 0.25
export const TREE_SINK = 0.2

/** Fixed colliders: trunks (conifers a bit wider: low branches) and rocks. Created imperatively (2 500 colliders). */
function VegetationColliders({ data }: { data: VegetationData }) {
  const { world, rapier } = useRapier()
  // Layout effect on purpose: its cleanup runs before <Physics>' passive cleanup frees the world
  // (StrictMode double-mount in dev, and leaving the scene). With useEffect the cleanup reached a
  // freed/recreated world, Rapier panicked, and every later call failed with
  // "recursive use of an object detected which would lead to unsafe aliasing in rust" (issue #6).
  useLayoutEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed())
    const trunk = (it: Instance, radius: number, height: number) => {
      const half = (height * it.scale) / 2
      world.createCollider(
        rapier.ColliderDesc.cylinder(half, radius * it.scale).setTranslation(it.x, it.y - TREE_SINK * it.scale + half, it.z),
        body,
      )
    }
    for (const it of data.conifers) trunk(it, 0.7, 4)
    for (const it of data.broadleaves) trunk(it, 0.35, 3)
    for (const it of data.rocks) {
      const half = it.scale * rockSquash(it) * 0.85
      world.createCollider(
        rapier.ColliderDesc.cylinder(half, it.scale * 0.8).setTranslation(it.x, it.y - ROCK_SINK * it.scale, it.z),
        body,
      )
    }
    // scrub is impassable: overlapping wide cylinders
    for (const it of data.bushes) {
      world.createCollider(rapier.ColliderDesc.cylinder(1.2 * it.scale, 1.5 * it.scale).setTranslation(it.x, it.y + 1.2 * it.scale - 0.3, it.z), body)
    }
    return () => world.removeRigidBody(body)
  }, [world, rapier, data])
  return null
}

const BROADLEAF = ['#6f9a3e', '#7fa646', '#5d8a3a', '#8aa84a', '#c9a23a', '#b8642f']
const FLOWERS = ['#f4f1e6', '#f1d65a', '#a98fd6', '#d9473a', '#f3b6c8']
const DRY = new THREE.Color('#d8c477')
const LUSH = new THREE.Color('#9cc46a')

export default function Vegetation({ data }: { data: VegetationData }) {
  const geos = useMemo(makeGeometries, [])
  const mats = useMemo(
    () => ({
      conifer: windMaterial(0.35, 8),
      broadleafTrunk: windMaterial(0.45, 6),
      broadleaf: windMaterial(0.45, 6),
      grass: windMaterial(0.18, 0.6),
      flower: windMaterial(0.12, 0.45),
      rock: texturedLambert(1.8, 2), // grainy stone
      bush: windMaterial(0.1, 2),
    }),
    [],
  )
  const conifers = useRef<THREE.InstancedMesh>(null)
  const broadleafTrunks = useRef<THREE.InstancedMesh>(null)
  const broadleaves = useRef<THREE.InstancedMesh>(null)
  const grass = useRef<THREE.InstancedMesh>(null)
  const flowers = useRef<THREE.InstancedMesh>(null)
  const rocks = useRef<THREE.InstancedMesh>(null)
  const bushes = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    fill(conifers.current, data.conifers, (it, c) => c.setHSL(0.08 + it.tint * 0.12, 0.25, 0.85 + it.tint * 0.25), undefined, TREE_SINK)
    fill(broadleafTrunks.current, data.broadleaves, (_it, c) => c.set('#ffffff'), undefined, TREE_SINK)
    fill(broadleaves.current, data.broadleaves, (it, c) => {
      c.set(BROADLEAF[Math.floor(it.tint * BROADLEAF.length)])
    }, undefined, TREE_SINK)
    fill(grass.current, data.grass, (it, c) => c.copy(DRY).lerp(LUSH, it.tint))
    fill(flowers.current, data.flowers, (it, c) => c.set(FLOWERS[Math.floor(it.tint * FLOWERS.length)]))
    fill(rocks.current, data.rocks, (it, c) => c.setHSL(0.08 + it.tint * 0.05, 0.08, 0.45 + it.tint * 0.15), rockSquash, ROCK_SINK)
    fill(bushes.current, data.bushes, (it, c) => c.setHSL(0.18 + it.tint * 0.06, 0.2, 0.8 + it.tint * 0.3), undefined, 0.15)
  }, [data])

  return (
    <>
      <VegetationColliders data={data} />
      <instancedMesh ref={conifers} args={[geos.conifer, mats.conifer, data.conifers.length]} castShadow receiveShadow />
      <instancedMesh ref={broadleafTrunks} args={[geos.broadleafTrunk, mats.broadleafTrunk, data.broadleaves.length]} castShadow receiveShadow />
      <instancedMesh ref={broadleaves} args={[geos.broadleaf, mats.broadleaf, data.broadleaves.length]} castShadow receiveShadow />
      <instancedMesh ref={grass} args={[geos.grass, mats.grass, data.grass.length]} receiveShadow />
      <instancedMesh ref={flowers} args={[geos.flower, mats.flower, data.flowers.length]} />
      <instancedMesh ref={rocks} args={[geos.rock, mats.rock, data.rocks.length]} castShadow receiveShadow />
      {data.bushes.length > 0 && (
        <instancedMesh ref={bushes} args={[geos.bush, mats.bush, data.bushes.length]} castShadow receiveShadow />
      )}
    </>
  )
}
