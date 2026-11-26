'use client'
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import { Ecctrl, type EcctrlHandle } from 'ecctrl'
import { EcctrlCameraControls, type EcctrlCameraControlsHandle } from 'ecctrl/camera'
import type * as THREE from 'three/webgpu'
import { heightAt, type Terrain } from '@/game/core/terrain'
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
const JACKET = '#b5813a'
const SCARF = '#b3322b'
const PACK = '#6b4f32'
const PANTS = '#5a5f3a'
const BOOT = '#3b2a1c'
const HAT = '#8a6a3c'

// reused every frame (no allocation in the loop)
const input = { forward: false, backward: false, leftward: false, rightward: false, jump: false, run: false }

type G = React.RefObject<THREE.Group | null>

function Part({ pos, color, children, rot }: { pos: [number, number, number]; color: string; children: React.ReactNode; rot?: [number, number, number] }) {
  return (
    <mesh position={pos} rotation={rot} castShadow>
      {children}
      <meshLambertMaterial color={color} flatShading />
    </mesh>
  )
}

function Arm({ x, upper, fore }: { x: number; upper: G; fore: G }) {
  return (
    <group ref={upper} position={[x, 0.5, 0]}>
      <Part pos={[0, -0.16, 0]} color={JACKET}>
        <capsuleGeometry args={[0.05, 0.2, 2, 6]} />
      </Part>
      <group ref={fore} position={[0, -0.32, 0]}>
        <Part pos={[0, -0.14, 0]} color={JACKET}>
          <capsuleGeometry args={[0.045, 0.16, 2, 6]} />
        </Part>
        <Part pos={[0, -0.31, 0]} color={SKIN}>
          <icosahedronGeometry args={[0.05, 0]} />
        </Part>
      </group>
    </group>
  )
}

function Leg({ x, thigh, shin }: { x: number; thigh: G; shin: G }) {
  return (
    <group ref={thigh} position={[x, -0.15, 0]}>
      <Part pos={[0, -0.21, 0]} color={PANTS}>
        <capsuleGeometry args={[0.075, 0.28, 2, 6]} />
      </Part>
      <group ref={shin} position={[0, -0.43, 0]}>
        <Part pos={[0, -0.18, 0]} color={PANTS}>
          <capsuleGeometry args={[0.062, 0.2, 2, 6]} />
        </Part>
        <Part pos={[0, -0.37, 0.04]} color={BOOT}>
          <boxGeometry args={[0.13, 0.1, 0.26]} />
        </Part>
      </group>
    </group>
  )
}

export default function Player({ spawn, terrain }: { spawn: [number, number, number]; terrain: Terrain }) {
  const ecctrl = useRef<EcctrlHandle>(null)
  const cam = useRef<EcctrlCameraControlsHandle>(null)
  const body = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const scarfTail = useRef<THREE.Group>(null)
  const leftArm = useRef<THREE.Group>(null)
  const rightArm = useRef<THREE.Group>(null)
  const leftFore = useRef<THREE.Group>(null)
  const rightFore = useRef<THREE.Group>(null)
  const leftLeg = useRef<THREE.Group>(null)
  const rightLeg = useRef<THREE.Group>(null)
  const leftShin = useRef<THREE.Group>(null)
  const rightShin = useRef<THREE.Group>(null)
  const phase = useRef(0)
  const amp = useRef(0)
  const [, getKeys] = useKeyboardControls<Controls>()

  useEffect(() => {
    cam.current?.setLookAt(spawn[0], spawn[1] + 3, spawn[2] - 8, spawn[0], spawn[1], spawn[2], false)
  }, [spawn])

  useFrame((st, dt) => {
    const e = ecctrl.current
    if (!e) return
    const k = getKeys()
    const focused = document.hasFocus() // alt-tab with a key held must not keep the player running
    input.forward = focused && k.forward
    input.backward = focused && k.backward
    input.leftward = focused && k.leftward
    input.rightward = focused && k.rightward
    input.jump = focused && k.jump
    input.run = focused && k.run
    e.setMovement(input)

    const p = e.currPos
    const store = runStore.getState().playerPosition
    store.x = p.x
    store.y = p.y
    store.z = p.z
    cam.current?.moveTo(p.x, p.y + 0.6, p.z, true)
    // keep the camera above the ground (camera-controls updated earlier this frame)
    const c = st.camera
    const camFloor = heightAt(terrain, c.position.x, c.position.z) + 0.8
    if (c.position.y < camFloor) {
      c.position.y = camFloor
      c.lookAt(p.x, p.y + 0.6, p.z)
    }

    // procedural walk cycle
    const speed = e.moveSpeed
    const targetAmp = e.isOnGround ? Math.min(speed / 5, 1) * 0.9 : 0.3
    amp.current += (targetAmp - amp.current) * Math.min(1, dt * 10)
    phase.current += dt * (2 + speed * 1.8)
    const ground = e.isOnGround
    const ph = phase.current
    const a = amp.current
    const swing = Math.sin(ph) * a
    const moving = ground ? Math.min(a / 0.9, 1) : 0
    const t = st.clock.elapsedTime
    if (ground) {
      // thighs and arms counter-swing; knees bend only backwards
      if (leftLeg.current) leftLeg.current.rotation.x = -swing
      if (rightLeg.current) rightLeg.current.rotation.x = swing
      if (leftShin.current) leftShin.current.rotation.x = Math.max(0, -Math.sin(ph + 0.6)) * a * 1.2
      if (rightShin.current) rightShin.current.rotation.x = Math.max(0, Math.sin(ph + 0.6)) * a * 1.2
      if (leftArm.current) { leftArm.current.rotation.x = swing; leftArm.current.rotation.z = 0.05 }
      if (rightArm.current) { rightArm.current.rotation.x = -swing; rightArm.current.rotation.z = -0.05 }
      if (leftFore.current) leftFore.current.rotation.x = -(0.2 + Math.max(0, -swing) * 0.8)
      if (rightFore.current) rightFore.current.rotation.x = -(0.2 + Math.max(0, swing) * 0.8)
    } else {
      if (leftLeg.current) leftLeg.current.rotation.x = -0.4
      if (rightLeg.current) rightLeg.current.rotation.x = 0.2
      if (leftShin.current) leftShin.current.rotation.x = 0.8
      if (rightShin.current) rightShin.current.rotation.x = 0.9
      if (leftArm.current) { leftArm.current.rotation.x = -0.6; leftArm.current.rotation.z = 1.5 }
      if (rightArm.current) { rightArm.current.rotation.x = -0.6; rightArm.current.rotation.z = -1.5 }
      if (leftFore.current) leftFore.current.rotation.x = -0.3
      if (rightFore.current) rightFore.current.rotation.x = -0.3
    }
    if (body.current) body.current.position.y = Math.cos(ph * 2) * 0.02 * a * moving
    if (torso.current) {
      torso.current.rotation.x = Math.min(speed / 7, 1) * 0.15 * moving
      torso.current.scale.y = 1 + Math.sin((t * Math.PI * 2) / 3.5) * 0.01 * (1 - moving)
    }
    if (scarfTail.current) scarfTail.current.rotation.x = Math.min(speed / 7, 1) * 0.9 + Math.sin(t * 6 + ph) * 0.12 * (0.3 + moving)
  })

  return (
    <>
      <Ecctrl ref={ecctrl} position={spawn} enabledRotations={[false, true, false]} capsuleHalfHeight={0.5} capsuleRadius={0.3} maxWalkVel={3} maxRunVel={7}>
        {/* feet at -1.0 (capsule bottom -0.8, float height 0.2) */}
        <group ref={body}>
          <Leg x={0.11} thigh={leftLeg} shin={leftShin} />
          <Leg x={-0.11} thigh={rightLeg} shin={rightShin} />
          <group ref={torso} position={[0, -0.1, 0]}>
            <Part pos={[0, 0.25, 0]} color={JACKET}>
              <capsuleGeometry args={[0.17, 0.35, 2, 7]} />
            </Part>
            <Part pos={[0, 0.5, 0]} color={SKIN}>
              <cylinderGeometry args={[0.06, 0.07, 0.14, 6]} />
            </Part>
            <Part pos={[0, 0.68, 0]} color={SKIN}>
              <icosahedronGeometry args={[0.13, 1]} />
            </Part>
            <Part pos={[0, 0.77, 0]} color={HAT}>
              <cylinderGeometry args={[0.3, 0.3, 0.025, 8]} />
            </Part>
            <Part pos={[0, 0.83, 0]} color={HAT}>
              <cylinderGeometry args={[0.12, 0.15, 0.13, 8]} />
            </Part>
            <Part pos={[0, 0.58, 0]} color={SCARF} rot={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.15, 0.05, 4, 8]} />
            </Part>
            <group ref={scarfTail} position={[0, 0.56, -0.17]}>
              <Part pos={[0, -0.14, 0]} color={SCARF}>
                <boxGeometry args={[0.09, 0.3, 0.03]} />
              </Part>
            </group>
            <Part pos={[0, 0.27, -0.25]} color={PACK}>
              <boxGeometry args={[0.32, 0.38, 0.17]} />
            </Part>
            <Part pos={[0, 0.52, -0.25]} color={HAT} rot={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.065, 0.065, 0.38, 7]} />
            </Part>
            <Arm x={0.25} upper={leftArm} fore={leftFore} />
            <Arm x={-0.25} upper={rightArm} fore={rightFore} />
          </group>
        </group>
      </Ecctrl>
      <EcctrlCameraControls
        ref={cam}
        makeDefault
        smoothTime={0.1}
        minDistance={3}
        maxDistance={20}
        maxPolarAngle={Math.PI * 0.5}
      />
    </>
  )
}
