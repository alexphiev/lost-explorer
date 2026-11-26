import * as THREE from 'three/webgpu'
import { extend } from '@react-three/fiber'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
extend(THREE as any) // register three/webgpu classes as JSX elements

export function createRenderer(forceWebGL = false) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (props: any) => {
    const renderer = new THREE.WebGPURenderer({
      ...props,
      antialias: true,
      powerPreference: 'high-performance',
      forceWebGL, // safety net: same renderer, WebGL2 backend
    })
    await renderer.init()
    return renderer
  }
}
