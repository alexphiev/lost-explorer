'use client'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three/webgpu'
import { heightAt, type Terrain } from '@/game/core/terrain'
import type { Point } from '@/game/core/valley'

const WIDTH = 1.4 // metres of trodden earth

/** The hiking trail: a strip of worn earth following the ground (world points → tile-local). */
export default function Trail({ points, terrain }: { points: Point[]; terrain: Terrain }) {
  const geometry = useMemo(() => {
    const pos: number[] = []
    const idx: number[] = []
    const ACROSS = 3
    for (let i = 0; i < points.length; i++) {
      const a = points[Math.max(0, i - 1)]
      const b = points[Math.min(points.length - 1, i + 1)]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const l = Math.hypot(dx, dz) || 1
      const px = (-dz / l) * (WIDTH / 2)
      const pz = (dx / l) * (WIDTH / 2)
      const x = points[i].x - terrain.centerX
      const z = points[i].z - terrain.centerZ
      for (let k = 0; k <= ACROSS; k++) {
        const s = 1 - (2 * k) / ACROSS
        const vx = x + px * s
        const vz = z + pz * s
        pos.push(vx, heightAt(terrain, vx, vz) + 0.06, vz)
      }
      if (i > 0) {
        const r0 = (i - 1) * (ACROSS + 1)
        const r1 = i * (ACROSS + 1)
        for (let k = 0; k < ACROSS; k++) idx.push(r0 + k, r1 + k, r0 + k + 1, r0 + k + 1, r1 + k, r1 + k + 1)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }, [points, terrain])
  const material = useMemo(() => {
    const m = new THREE.MeshLambertMaterial({ color: '#8f7a5a', side: THREE.DoubleSide })
    m.polygonOffset = true
    m.polygonOffsetFactor = -2
    m.polygonOffsetUnits = -2
    return m
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  return <mesh geometry={geometry} material={material} receiveShadow />
}

/** Tile-local test: is (x, z) within `r` metres of the trail? (coarse 10 m grid of the trail points) */
export function trailNear(points: Point[] | undefined, terrain: Terrain, r: number): (x: number, z: number) => boolean {
  if (!points?.length) return () => false
  const G = 10
  const cells = new Map<number, Point[]>()
  const key = (gx: number, gz: number) => gx * 100003 + gz
  for (const p of points) {
    const lx = p.x - terrain.centerX
    const lz = p.z - terrain.centerZ
    const k = key(Math.floor(lx / G), Math.floor(lz / G))
    const list = cells.get(k)
    if (list) list.push({ x: lx, z: lz })
    else cells.set(k, [{ x: lx, z: lz }])
  }
  return (x, z) => {
    const gx = Math.floor(x / G)
    const gz = Math.floor(z / G)
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = cells.get(key(gx + dx, gz + dz))
        if (list) for (const p of list) if ((p.x - x) ** 2 + (p.z - z) ** 2 < r * r) return true
      }
    }
    return false
  }
}
