'use client'
import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { float, min, pass, screenUV, vec3, vec4 } from 'three/tsl'
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
    // bloom only on what is really bright, and cap that energy: the sun gets a crisp disc and a soft halo
    // instead of a white veil over half the screen (the sky near the sun is extremely bright HDR)
    // small and tight (games keep sun glare subtle): low strength, short radius
    const glow = bloom(min(col, vec4(2, 2, 2, 1)), 0.12, 0.15, 1.2)
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
