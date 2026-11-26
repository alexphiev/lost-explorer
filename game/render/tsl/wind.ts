import * as THREE from 'three/webgpu'
import { attribute, clamp, float, positionLocal, sin, time, vec3 } from 'three/tsl'

/**
 * Lambert material whose vertices sway in the wind.
 * `height`: geometry height at which sway reaches full `strength` (metres).
 * The base (y ≤ 0 in the raw geometry) stays still. Phase follows world position
 * (instancing is applied before positionNode), so gusts travel across the forest.
 */
export function windMaterial(strength: number, height: number) {
  const mat = new THREE.MeshLambertNodeMaterial({ vertexColors: true, flatShading: true })
  const rawY = attribute<'vec3'>('position', 'vec3').y
  const bend = clamp(rawY.div(height), 0, 1).pow(2)
  const x = positionLocal.x
  const z = positionLocal.z
  const gust = sin(time.mul(1.1).add(x.mul(0.035)).add(z.mul(0.02)))
    .mul(0.65)
    .add(sin(time.mul(2.7).add(x.mul(0.13)).add(z.mul(0.09))).mul(0.25))
    .add(0.25)
  const offset = gust.mul(bend).mul(float(strength))
  mat.positionNode = positionLocal.add(vec3(offset, 0, offset.mul(0.45)))
  return mat
}
