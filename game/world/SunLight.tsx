'use client'
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { runStore } from '@/game/state/run'

// Late-afternoon golden sun (~26° above the horizon)
export const SUN_DIRECTION = new THREE.Vector3(0.72, 0.47, -0.55).normalize()
const DISTANCE = 150

/** Directional light whose shadow camera follows the player. */
export default function SunLight() {
  const light = useRef<THREE.DirectionalLight>(null)

  useEffect(() => {
    const l = light.current
    if (!l) return
    l.shadow.mapSize.set(2048, 2048)
    const cam = l.shadow.camera
    cam.left = -45
    cam.right = 45
    cam.top = 45
    cam.bottom = -45
    cam.near = 1
    cam.far = 400
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

  return (
    <directionalLight
      ref={light}
      color="#ffd29a"
      intensity={2.8}
      castShadow
      shadow-bias={-0.0004}
      shadow-normalBias={0.06}
    />
  )
}
