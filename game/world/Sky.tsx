'use client'
import { useMemo } from 'react'
import { SkyMesh } from 'three/addons/objects/SkyMesh.js'
import { SUN_DIRECTION } from './SunLight'

export default function Sky() {
  const sky = useMemo(() => {
    const s = new SkyMesh()
    s.scale.setScalar(5000)
    s.frustumCulled = false
    s.turbidity.value = 4
    s.rayleigh.value = 1.5
    s.sunPosition.value.copy(SUN_DIRECTION)
    return s
  }, [])
  return <primitive object={sky} />
}
