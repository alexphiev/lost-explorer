'use client'
import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three/webgpu'
import type { Instance } from '@/game/core/placement'

function fill(mesh: THREE.InstancedMesh | null, items: Instance[], yOffset: number, squash = 1) {
  if (!mesh) return
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const p = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  items.forEach((it, i) => {
    q.setFromAxisAngle(up, it.rotation)
    s.set(it.scale, it.scale * squash, it.scale)
    p.set(it.x, it.y + yOffset * it.scale * squash, it.z)
    m.compose(p, q, s)
    mesh.setMatrixAt(i, m)
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
}

export default function Vegetation({ trees, rocks }: { trees: Instance[]; rocks: Instance[] }) {
  const trunks = useRef<THREE.InstancedMesh>(null)
  const crowns = useRef<THREE.InstancedMesh>(null)
  const stones = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    fill(trunks.current, trees, 1)
    fill(crowns.current, trees, 4.5)
    fill(stones.current, rocks, 0.2, 0.6)
  }, [trees, rocks])

  return (
    <>
      <instancedMesh ref={trunks} args={[undefined, undefined, trees.length]} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.3, 2, 6]} />
        <meshLambertMaterial color="#6b4a2f" flatShading />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, trees.length]} castShadow receiveShadow>
        <coneGeometry args={[1.8, 6, 7]} />
        <meshLambertMaterial color="#2f5a2a" flatShading />
      </instancedMesh>
      <instancedMesh ref={stones} args={[undefined, undefined, rocks.length]} castShadow receiveShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshLambertMaterial color="#8a847b" flatShading />
      </instancedMesh>
    </>
  )
}
