'use client'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { SkyMesh } from 'three/addons/objects/SkyMesh.js'
import { dot, mix, vec3 } from 'three/tsl'
import { runStore } from '@/game/state/run'
import { atmosphereFog } from '@/game/render/tsl/atmosphere'
import { createSunState, sunState } from './daylight'

const DISTANCE = 150
const SRGB = THREE.SRGBColorSpace

/** Shared mutable fog inputs, updated every frame by <Daylight>. */
export const SUN_DIR = new THREE.Vector3(0.72, 0.47, -0.55).normalize()
export const HAZE_COOL_COLOR = new THREE.Color('#b7c8d8')
export const HAZE_WARM_COLOR = new THREE.Color('#f3cf9e')

const state = createSunState()

/** Hemisphere light, sun/moon directional light (shadow follows the player), sky and fog colours driven by the game hour. */
export default function Daylight({ getHour }: { getHour: () => number }) {
  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)

  const sky = useMemo(() => {
    const s = new SkyMesh()
    s.scale.setScalar(5000)
    s.frustumCulled = false
    // the sky is drawn at the far plane: keep the haze off it, or it turns uniformly white
    s.material.fog = false
    // clear mountain air: blue sky, visible sun disc, a few clouds
    s.turbidity.value = 2.4
    s.rayleigh.value = 1.1
    s.mieCoefficient.value = 0.004
    s.mieDirectionalG.value = 0.82
    s.cloudCoverage.value = 0.38
    // the scattering model outputs very bright HDR values that AgX tone mapping washes to white:
    // scale the sky down (and a touch of saturation) so the blue survives; more saturation turned the zenith violet
    const raw = s.material.colorNode as unknown as ReturnType<typeof vec3>
    const lum = dot(raw, vec3(0.2126, 0.7152, 0.0722))
    s.material.colorNode = mix(vec3(lum), raw, 1.08).mul(0.5)
    s.cloudDensity.value = 0.35
    s.cloudElevation.value = 0.6
    return s
  }, [])

  useEffect(() => {
    const l = sun.current
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
    const l = sun.current
    const hl = hemi.current
    if (!l || !hl) return
    const s = sunState(getHour(), state)

    const p = runStore.getState().playerPosition
    l.target.position.set(p.x, p.y, p.z)
    l.position.set(p.x + s.dirX * DISTANCE, p.y + s.dirY * DISTANCE, p.z + s.dirZ * DISTANCE)
    l.target.updateMatrixWorld()
    l.color.setRGB(s.sunR, s.sunG, s.sunB, SRGB)
    l.intensity = s.sunIntensity

    hl.color.setRGB(s.skyR, s.skyG, s.skyB, SRGB)
    hl.groundColor.setRGB(s.groundR, s.groundG, s.groundB, SRGB)
    hl.intensity = s.hemiIntensity

    // Sky: true sun, but keep it from sinking deep so the night sky stays a faint dark blue, not black
    sky.sunPosition.value.set(s.sunX, Math.max(s.sunY, -0.2), s.sunZ).normalize()

    SUN_DIR.set(s.dirX, s.dirY, s.dirZ)
    HAZE_COOL_COLOR.setRGB(s.hazeCoolR, s.hazeCoolG, s.hazeCoolB, SRGB)
    HAZE_WARM_COLOR.setRGB(s.hazeWarmR, s.hazeWarmG, s.hazeWarmB, SRGB)
  })

  return (
    <>
      <hemisphereLight ref={hemi} args={['#b4cbe3', '#7a6545', 1.7]} />
      <directionalLight ref={sun} color="#ffd29a" intensity={2.8} castShadow shadow-bias={-0.0004} shadow-normalBias={0.06} />
      <primitive object={sky} />
    </>
  )
}

/** Sets scene.fogNode to the haze driven by Daylight's shared SUN_DIR / haze colours. */
export function DaylightFog({ mistHeight }: { mistHeight: number }) {
  const scene = useThree((st) => st.scene)
  useEffect(() => {
    scene.fogNode = atmosphereFog(SUN_DIR, mistHeight, HAZE_COOL_COLOR, HAZE_WARM_COLOR)
    return () => {
      scene.fogNode = null
    }
  }, [scene, mistHeight])
  return null
}
