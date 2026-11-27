import * as THREE from 'three/webgpu'
import { attribute, clamp, exp, float, positionLocal, sin, smoothstep, time, uniform, vec2, vec3 } from 'three/tsl'
import { surfaceVariation } from './surface'

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
  mat.colorNode = surfaceVariation(0.8, 1.5) // leaves and grass are never one flat colour
  return mat
}

/** Where the player's body is (tile-local) and how fast they move: bushes bend away from it and shake. */
export const brushPlayer = uniform(new THREE.Vector3(0, -1000, 0))
export const brushSpeed = uniform(0)

/** Scrub bushes: a light sway in the wind, pushed aside and shaken where the player walks through them. */
export function bushMaterial() {
  const mat = windMaterial(0.1, 2)
  const rawY = attribute<'vec3'>('position', 'vec3').y
  const bend = clamp(rawY.div(2), 0, 1)
  const off = vec2(positionLocal.x.sub(brushPlayer.x), positionLocal.z.sub(brushPlayer.z))
  const d = off.length().add(0.01)
  // within ~1.6 m of the body, upper branches lean away (up to ~0.7 m) and quiver while you move
  const near = smoothstep(1.8, 0.2, d).mul(smoothstep(3, 0, positionLocal.y.sub(brushPlayer.y).abs()))
  const lean = near.mul(0.7).mul(bend)
  const shake = sin(time.mul(22).add(positionLocal.x.mul(3)).add(positionLocal.z.mul(2)))
    .mul(near)
    .mul(bend)
    .mul(brushSpeed.mul(0.06))
    .mul(exp(d.mul(-0.6)))
  const away = off.div(d).mul(lean)
  mat.positionNode = (mat.positionNode as typeof positionLocal).add(vec3(away.x.add(shake), lean.mul(-0.35), away.y.add(shake.mul(0.7))))
  return mat
}
