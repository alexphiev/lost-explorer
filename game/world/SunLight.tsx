'use client'
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { runStore } from '@/game/state/run'

export const SUN_DIRECTION = new THREE.Vector3(0.5, 0.8, 0.3).normalize()
const DISTANCE = 120

/** Directional light whose shadow camera follows the player. */
export default function SunLight() {
  const light = useRef<THREE.DirectionalLight>(null)

  useEffect(() => {
    const l = light.current
    if (!l) return
    l.shadow.mapSize.set(2048, 2048)
    const cam = l.shadow.camera
    cam.left = -50
    cam.right = 50
    cam.top = 50
    cam.bottom = -50
    cam.near = 1
    cam.far = 300
    cam.updateProjectionMatrix()
  }, [])

  useFrame(() => {
    const l = light.current
    if (!l) return
    const p = runStore.getState().playerPosition
    l.target.position.set(p.x, p.y, p.z)
    l.position.set(p.x + SUN_DIRECTION.x * DISTANCE, p.y + SUN_DIRECTION.y * DISTANCE, p.z + SUN_DIRECTION.z * DISTANCE)
    l.target.updateMatrixWorld()
  })

  return <directionalLight ref={light} color="#fff4e0" intensity={2.2} castShadow shadow-bias={-0.0005} shadow-normalBias={0.05} />
}
