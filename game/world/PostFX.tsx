'use client'
import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { float, pass, screenUV, vec3 } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'

/** TSL post-processing: soft bloom, warm grade, vignette. Takes over rendering (priority 1). */
export default function PostFX() {
  const gl = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  const pipeline = useMemo(() => {
    const p = new THREE.RenderPipeline(gl)
    const scenePass = pass(scene, camera)
    const col = scenePass.getTextureNode('output')
    const glow = bloom(col, 0.28, 0.5, 0.9)
    const vignette = float(1).sub(screenUV.sub(0.5).length().mul(1.15).pow(2.5)).clamp(0, 1)
    const grade = vec3(1.03, 1.0, 0.95) // gentle warm grade
    p.outputNode = col.add(glow).mul(vec3(grade)).mul(vignette.mul(0.35).add(0.65))
    return p
  }, [gl, scene, camera])

  useEffect(() => () => pipeline.dispose(), [pipeline])

  useFrame(() => {
    pipeline.render()
  }, 1)

  return null
}
