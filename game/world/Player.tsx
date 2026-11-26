'use client'
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import { Ecctrl, type EcctrlHandle } from 'ecctrl'
import { EcctrlCameraControls, type EcctrlCameraControlsHandle } from 'ecctrl/camera'
import type * as THREE from 'three/webgpu'
import { runStore } from '@/game/state/run'

export type Controls = 'forward' | 'backward' | 'leftward' | 'rightward' | 'jump' | 'run'

// Physical key codes: KeyW/KeyA = Z/Q on AZERTY, W/A on QWERTY.
export const keyboardMap: { name: Controls; keys: string[] }[] = [
  { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
  { name: 'backward', keys: ['KeyS', 'ArrowDown'] },
  { name: 'leftward', keys: ['KeyA', 'ArrowLeft'] },
  { name: 'rightward', keys: ['KeyD', 'ArrowRight'] },
  { name: 'jump', keys: ['Space'] },
  { name: 'run', keys: ['ShiftLeft', 'ShiftRight'] },
]

const SKIN = '#e0b48c'
const SHIRT = '#c0492f'
const PANTS = '#34495e'

// reused every frame (no allocation in the loop)
const input = { forward: false, backward: false, leftward: false, rightward: false, jump: false, run: false }

function Limb({ limbRef, x, y, length, width, color }: {
  limbRef: React.RefObject<THREE.Group | null>
  x: number
  y: number
  length: number
  width: number
  color: string
}) {
  return (
    <group ref={limbRef} position={[x, y, 0]}>
      <mesh position={[0, -length / 2, 0]} castShadow>
        <boxGeometry args={[width, length, width]} />
        <meshLambertMaterial color={color} flatShading />
      </mesh>
    </group>
  )
}

export default function Player({ spawn }: { spawn: [number, number, number] }) {
  const ecctrl = useRef<EcctrlHandle>(null)
  const cam = useRef<EcctrlCameraControlsHandle>(null)
  const leftArm = useRef<THREE.Group>(null)
  const rightArm = useRef<THREE.Group>(null)
  const leftLeg = useRef<THREE.Group>(null)
  const rightLeg = useRef<THREE.Group>(null)
  const phase = useRef(0)
  const amp = useRef(0)
  const [, getKeys] = useKeyboardControls<Controls>()

  useEffect(() => {
    cam.current?.setLookAt(spawn[0], spawn[1] + 3, spawn[2] - 8, spawn[0], spawn[1], spawn[2], false)
  }, [spawn])

  useFrame((_, dt) => {
    const e = ecctrl.current
    if (!e) return
    const k = getKeys()
    input.forward = k.forward
    input.backward = k.backward
    input.leftward = k.leftward
    input.rightward = k.rightward
    input.jump = k.jump
    input.run = k.run
    e.setMovement(input)

    const p = e.currPos
    const store = runStore.getState().playerPosition
    store.x = p.x
    store.y = p.y
    store.z = p.z
    cam.current?.moveTo(p.x, p.y + 0.6, p.z, true)

    // procedural walk cycle
    const speed = e.moveSpeed
    const targetAmp = e.isOnGround ? Math.min(speed / 5, 1) * 0.9 : 0.3
    amp.current += (targetAmp - amp.current) * Math.min(1, dt * 10)
    phase.current += dt * (2 + speed * 1.8)
    const swing = Math.sin(phase.current) * amp.current
    if (leftArm.current) leftArm.current.rotation.x = e.isOnGround ? swing : -2.4
    if (rightArm.current) rightArm.current.rotation.x = e.isOnGround ? -swing : -2.4
    if (leftLeg.current) leftLeg.current.rotation.x = -swing
    if (rightLeg.current) rightLeg.current.rotation.x = swing
  })

  return (
    <>
      <Ecctrl ref={ecctrl} position={spawn} capsuleHalfHeight={0.5} capsuleRadius={0.3} maxWalkVel={3} maxRunVel={7}>
        {/* feet at -1.0 (capsule bottom -0.8, float height 0.2) */}
        <group>
          <mesh position={[0, 0.15, 0]} castShadow>
            <boxGeometry args={[0.42, 0.6, 0.24]} />
            <meshLambertMaterial color={SHIRT} flatShading />
          </mesh>
          <mesh position={[0, 0.15, -0.18]} castShadow>
            <boxGeometry args={[0.32, 0.4, 0.14]} />
            <meshLambertMaterial color="#6d5a3a" flatShading />
          </mesh>
          <mesh position={[0, 0.65, 0]} castShadow>
            <icosahedronGeometry args={[0.17, 0]} />
            <meshLambertMaterial color={SKIN} flatShading />
          </mesh>
          <Limb limbRef={leftArm} x={0.27} y={0.42} length={0.62} width={0.11} color={SKIN} />
          <Limb limbRef={rightArm} x={-0.27} y={0.42} length={0.62} width={0.11} color={SKIN} />
          <Limb limbRef={leftLeg} x={0.11} y={-0.15} length={0.85} width={0.15} color={PANTS} />
          <Limb limbRef={rightLeg} x={-0.11} y={-0.15} length={0.85} width={0.15} color={PANTS} />
        </group>
      </Ecctrl>
      <EcctrlCameraControls
        ref={cam}
        makeDefault
        smoothTime={0.1}
        minDistance={3}
        maxDistance={20}
        maxPolarAngle={Math.PI * 0.55}
      />
    </>
  )
}
