// Superseded by Daylight.tsx (not used by Scene any more).
'use client'
import { useMemo } from 'react'
import { SkyMesh } from 'three/addons/objects/SkyMesh.js'
import { SUN_DIRECTION } from './SunLight'

export default function Sky() {
  const sky = useMemo(() => {
    const s = new SkyMesh()
    s.scale.setScalar(5000)
    s.frustumCulled = false
    s.turbidity.value = 6
    s.rayleigh.value = 2.2
    s.mieCoefficient.value = 0.006
    s.mieDirectionalG.value = 0.86
    s.cloudCoverage.value = 0.45
    s.cloudDensity.value = 0.35
    s.cloudElevation.value = 0.6
    s.sunPosition.value.copy(SUN_DIRECTION)
    return s
  }, [])
  return <primitive object={sky} />
}
