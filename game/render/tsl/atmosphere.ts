import type * as THREE from 'three/webgpu'
import {
  cameraPosition,
  color,
  densityFogFactor,
  dot,
  exponentialHeightFogFactor,
  float,
  fog,
  max,
  mix,
  positionWorld,
  uniform,
} from 'three/tsl'

export const HAZE_COOL = '#b7c8d8'
export const HAZE_WARM = '#f3cf9e'

/**
 * Distance haze tinted golden when looking toward the sun, cool blue away from it,
 * plus a soft mist pooled in the valleys below `mistHeight`.
 */
export function atmosphereFog(sunDirection: THREE.Vector3, mistHeight: number) {
  const viewDir = positionWorld.sub(cameraPosition).normalize()
  const toSun = max(dot(viewDir, uniform(sunDirection)), 0).pow(5)
  const haze = mix(color(HAZE_COOL), color(HAZE_WARM), toSun)
  const distance = densityFogFactor(0.0027)
  const mist = (exponentialHeightFogFactor(float(0.0016), float(mistHeight)) as ReturnType<typeof densityFogFactor>).mul(0.45)
  return fog(haze, max(distance, mist))
}
