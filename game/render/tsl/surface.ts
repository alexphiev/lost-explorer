import * as THREE from 'three/webgpu'
import { float, mx_noise_float, normalWorld, positionWorld, sin, smoothstep, vec3 } from 'three/tsl'

/**
 * Procedural "texture" for flat-shaded low-poly surfaces: a brightness/hue variation computed on the GPU
 * from the world position (no image textures, nothing to download). Node materials multiply `colorNode`
 * with the vertex colours and instance colours, so this is a factor around 1.
 */
export function surfaceVariation(amount = 1, scale = 1) {
  const p = positionWorld.xz.mul(scale)
  const patches = mx_noise_float(p.mul(0.07)) // ~15 m: lighter / darker patches
  const clumps = mx_noise_float(p.mul(0.55)) // ~2 m: clumps
  const grain = mx_noise_float(positionWorld.mul(3.2 * scale)) // ~30 cm: grain, also on vertical faces
  const v = patches.mul(0.09).add(clumps.mul(0.06)).add(grain.mul(0.05)).mul(amount)
  // a touch of warm/cool shift with the large patches so it doesn't read as plain grey noise
  return vec3(v.add(1).add(patches.mul(0.02 * amount)), v.add(1), v.add(1).sub(patches.mul(0.03 * amount)))
}

/** Terrain: variation + horizontal rock strata on steep faces + grass speckles on flat ground. */
export function terrainMaterial() {
  const mat = new THREE.MeshLambertNodeMaterial({ vertexColors: true, flatShading: true })
  const steep = smoothstep(0.25, 0.5, float(1).sub(normalWorld.y))
  const strata = sin(positionWorld.y.mul(2.2).add(mx_noise_float(positionWorld.xz.mul(0.3)).mul(2.5))).mul(0.07).mul(steep)
  const speck = smoothstep(0.55, 0.8, mx_noise_float(positionWorld.xz.mul(4.0))).mul(0.08).mul(float(1).sub(steep))
  mat.colorNode = surfaceVariation(1.2).add(strata).sub(speck)
  return mat
}

/** Lambert with the procedural variation (rocks, wood). */
export function texturedLambert(amount = 1, scale = 1, vertexColors = false) {
  const mat = new THREE.MeshLambertNodeMaterial({ vertexColors, flatShading: true })
  mat.colorNode = surfaceVariation(amount, scale)
  return mat
}
