'use client'
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import { Ecctrl, type EcctrlHandle } from 'ecctrl'
import { EcctrlCameraControls, type EcctrlCameraControlsHandle } from 'ecctrl/camera'
import type * as THREE from 'three/webgpu'
import { heightAt, type Terrain } from '@/game/core/terrain'
import { runStore } from '@/game/state/run'
import {
  bodyDropFor,
  footAlongCycle,
  HIP_Y,
  solveLeg,
  strideLength,
  THIGH,
  toblerFactor,
  type FootTarget,
  type LegAngles,
} from './gait'

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

const WALK_VEL = 1.8 // m/s, brisk hiking pace
const RUN_VEL = 4.5 // m/s, jogging with a pack
const HIP_X = 0.11
const BASE_FOV = 55

/** Camera occluders: flat [x, z, yBottom, yTop, radius] per tree crown / rock, in tile coordinates. */
export type Occluders = Float32Array

// ---- reused every frame (no allocation in the loop) ----
const input = { forward: false, backward: false, leftward: false, rightward: false, jump: false, run: false }
const brake = { x: 0, y: 0, z: 0 }
const foot: FootTarget = { z: 0, lift: 0, stance: true, swing: 0 }
const leg: LegAngles = { thigh: 0, knee: 0, ankle: 0 }
const feetY = [0, 0]
const feetZ = [0, 0]
const feetSwing = [0, 0]
const legTargets = [
  { thigh: 0, knee: 0, ankle: 0 },
  { thigh: 0, knee: 0, ankle: 0 },
]

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

/** hip → thigh → knee → shin → ankle → boot; sole 0.42 m below the knee. */
function Leg({ x, thigh, shin, ankle }: { x: number; thigh: G; shin: G; ankle: G }) {
  return (
    <group ref={thigh} position={[x, HIP_Y, 0]}>
      <Part pos={[0, -0.21, 0]} color={PANTS}>
        <capsuleGeometry args={[0.075, 0.28, 2, 6]} />
      </Part>
      <group ref={shin} position={[0, -THIGH, 0]}>
        <Part pos={[0, -0.18, 0]} color={PANTS}>
          <capsuleGeometry args={[0.062, 0.2, 2, 6]} />
        </Part>
        <group ref={ankle} position={[0, -0.36, 0]}>
          <Part pos={[0, -0.01, 0.04]} color={BOOT}>
            <boxGeometry args={[0.13, 0.1, 0.26]} />
          </Part>
        </group>
      </group>
    </group>
  )
}

const damp = (current: number, target: number, k: number, dt: number) => current + (target - current) * (1 - Math.exp(-k * dt))
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export default function Player({ spawn, terrain, occluders }: { spawn: [number, number, number]; terrain: Terrain; occluders: Occluders }) {
  const ecctrl = useRef<EcctrlHandle>(null)
  const cam = useRef<EcctrlCameraControlsHandle>(null)
  const body = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const scarfTail = useRef<THREE.Group>(null)
  const arms = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)]
  const fores = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)]
  const thighs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)]
  const shins = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)]
  const ankles = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)]
  // gait state
  const s = useRef({
    phase: 0,
    amp: 0,
    bodyY: 0,
    landing: 0,
    lastVy: 0,
    airTime: 0,
    exertion: 0,
    breath: 0,
    lean: 0,
    roll: 0,
    camPull: 1,
  })
  const [, getKeys] = useKeyboardControls<Controls>()

  useEffect(() => {
    cam.current?.setLookAt(spawn[0], spawn[1] + 3, spawn[2] - 8, spawn[0], spawn[1], spawn[2], false)
  }, [spawn])

  useFrame((st, rawDt) => {
    const e = ecctrl.current
    if (!e) return
    const dt = Math.min(rawDt, 0.05)
    const g = s.current

    // ---- input ----
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
    // safety net: fell through or out of the world → back to spawn
    if (e.body && p.y < terrain.minHeight - 30 && e.body.translation().y < terrain.minHeight - 30) {
      e.body.setTranslation({ x: spawn[0], y: spawn[1], z: spawn[2] }, true)
      e.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      return
    }
    const store = runStore.getState().playerPosition
    store.x = p.x
    store.y = p.y
    store.z = p.z

    // ---- reading the landscape ----
    const fwd = e.bodyZAxis
    const side = e.bodyXAxis
    const vel = e.currLinVel
    const speed = e.moveSpeed
    const grounded = e.isOnGround
    const hC = heightAt(terrain, p.x, p.z)
    const hv = Math.hypot(vel.x, vel.z)
    // grade along the direction of travel, and pitch of the ground along the body's forward axis
    let grade = 0
    if (hv > 0.15) {
      const ux = vel.x / hv
      const uz = vel.z / hv
      grade = (heightAt(terrain, p.x + ux, p.z + uz) - heightAt(terrain, p.x - ux, p.z - uz)) / 2
    }
    const pitch = (heightAt(terrain, p.x + fwd.x * 0.6, p.z + fwd.z * 0.6) - heightAt(terrain, p.x - fwd.x * 0.6, p.z - fwd.z * 0.6)) / 1.2
    const steepness = clamp((Math.abs(pitch) - 0.35) / 0.35, 0, 1)

    // ---- Tobler: slower uphill and on steep descents (brake against ecctrl's push) ----
    if (grounded && hv > 0.2 && e.body) {
      const f = toblerFactor(grade)
      if (f < 0.98) {
        const b = Math.min(0.2 * (1 / f - 1) * dt * 60, 0.8) * e.body.mass()
        brake.x = -vel.x * b
        brake.y = 0
        brake.z = -vel.z * b
        e.body.applyImpulse(brake, true)
      }
    }

    // ---- air, landing, sliding ----
    const vy = e.verticalSpeed
    const aboveGround = p.y - 1.0 - hC
    if (!grounded) {
      g.airTime += dt
      g.lastVy = Math.min(g.lastVy, vy)
    } else {
      if (g.airTime > 0.15) g.landing = Math.min(0.3, Math.max(0, -g.lastVy - 1.5) * 0.045)
      g.airTime = 0
      g.lastVy = 0
    }
    g.landing *= Math.exp(-dt * 7)
    const sliding = aboveGround < 0.6 && (e.actualSlopeAngle > 0.7 || (!grounded && g.airTime > 0.1 && vy < 0 && vy > -6))
    const airborne = !grounded && !sliding && g.airTime > 0.08

    // ---- gait cycle, driven by the distance actually covered (planted feet, no walking on the spot) ----
    const runBlend = clamp((speed - 2.3) / 1.5, 0, 1)
    const duty = 0.62 - 0.27 * runBlend
    const stride = strideLength(speed, grade)
    if (grounded) g.phase = (g.phase + (speed * dt) / stride) % 1
    g.amp = damp(g.amp, grounded ? clamp(speed / 0.5, 0, 1) : 0, 8, dt)
    const lift = (0.09 + 0.07 * runBlend + 0.04 * Math.max(0, grade)) * g.amp
    const groundY = grounded ? e.standPoint.y : hC

    let bodyTarget = -0.03 // knees never fully locked
    for (let i = 0; i < 2; i++) {
      footAlongCycle((g.phase + i * 0.5) % 1, duty, stride, lift, foot)
      const fz = foot.z * g.amp
      const fx = i === 0 ? HIP_X : -HIP_X
      const wx = p.x + side.x * fx + fwd.x * fz
      const wz = p.z + side.z * fx + fwd.z * fz
      const ground = groundY + heightAt(terrain, wx, wz) - hC - p.y
      feetY[i] = ground + foot.lift
      feetZ[i] = fz
      feetSwing[i] = foot.swing
      bodyTarget = Math.min(bodyTarget, bodyDropFor(ground, fz))
    }
    // natural vertical bob comes from the reach limit; add the landing squash and a crouch when sliding
    bodyTarget = clamp(bodyTarget - g.landing - (sliding ? 0.28 : 0), -0.45, 0)
    g.bodyY = airborne ? damp(g.bodyY, 0, 6, dt) : damp(g.bodyY, bodyTarget, 18, dt)

    for (let i = 0; i < 2; i++) {
      const t = legTargets[i]
      if (airborne) {
        // rising: knees tucked; falling: legs reach for the ground
        const rising = vy > 0.5
        t.thigh = i === 0 ? (rising ? -0.9 : -0.4) : rising ? -0.25 : 0.1
        t.knee = i === 0 ? (rising ? 1.4 : 0.5) : rising ? 0.9 : 0.35
        t.ankle = 0.2
      } else if (sliding) {
        // surfing down the slope: front leg braced, back leg folded
        t.thigh = i === 0 ? -0.75 : 0.25
        t.knee = i === 0 ? 0.55 : 1.3
        t.ankle = -0.3
      } else {
        const toe = feetSwing[i] > 0 ? 0.35 * Math.sin(Math.PI * feetSwing[i]) : 0
        solveLeg(HIP_Y + g.bodyY, feetY[i], feetZ[i], pitch, toe, leg)
        t.thigh = leg.thigh
        t.knee = leg.knee
        t.ankle = leg.ankle
      }
      const kk = airborne || sliding ? 12 : 45
      const th = thighs[i].current
      const sh = shins[i].current
      const an = ankles[i].current
      if (th) th.rotation.x = damp(th.rotation.x, t.thigh, kk, dt)
      if (sh) sh.rotation.x = damp(sh.rotation.x, t.knee, kk, dt)
      if (an) an.rotation.x = damp(an.rotation.x, t.ankle, kk, dt)
    }

    // ---- body: lean into the slope and the speed, roll into turns, hip twist ----
    const time = st.clock.elapsedTime
    const leanTarget = sliding ? -0.25 : airborne ? 0.1 : 0.035 * speed + 0.1 * runBlend + 0.5 * clamp(grade, -0.4, 0.6)
    g.lean = damp(g.lean, leanTarget, 6, dt)
    const yawRate = e.currAngVel.y
    g.roll = damp(g.roll, clamp(-yawRate * speed * 0.05, -0.25, 0.25), 6, dt)
    if (body.current) {
      body.current.position.y = g.bodyY
      body.current.rotation.z = g.roll + (g.amp < 0.2 ? Math.sin(time * 0.8) * 0.015 : 0) // idle weight shift
      body.current.rotation.y = Math.sin(g.phase * Math.PI * 2) * 0.1 * g.amp
    }

    // ---- breathing: faster and deeper after running ----
    g.exertion = clamp(g.exertion + dt * (runBlend > 0.5 ? 0.12 : -0.04), 0, 1)
    g.breath += dt * Math.PI * 2 * (0.28 + 0.6 * g.exertion)
    if (torso.current) {
      torso.current.rotation.x = g.lean
      torso.current.rotation.y = -Math.sin(g.phase * Math.PI * 2) * 0.16 * g.amp // shoulders counter the hips
      const chest = 1 + Math.sin(g.breath) * (0.008 + 0.025 * g.exertion)
      torso.current.scale.set(chest, 1 + (chest - 1) * 0.5, chest)
    }

    // ---- arms: counter-swing the opposite leg, pump when running, out for balance ----
    const balance = Math.max(steepness, sliding ? 1 : 0, airborne ? 0.8 : 0)
    for (let i = 0; i < 2; i++) {
      const a = arms[i].current
      const f = fores[i].current
      const other = thighs[1 - i].current
      const swing = other ? other.rotation.x * (0.75 + 0.3 * runBlend) * g.amp : 0
      const targetX = airborne ? -0.5 : sliding ? 0.5 : swing + 0.05
      const targetZ = (i === 0 ? 1 : -1) * (0.06 + balance * (airborne ? 1.2 : 0.8))
      if (a) {
        a.rotation.x = damp(a.rotation.x, targetX, 14, dt)
        a.rotation.z = damp(a.rotation.z, targetZ, 8, dt)
      }
      if (f) f.rotation.x = damp(f.rotation.x, -(0.2 + 1.1 * runBlend + 0.35 * Math.max(0, -swing)), 14, dt)
    }
    if (scarfTail.current) scarfTail.current.rotation.x = Math.min(hv / 6, 1) * 0.9 + Math.sin(time * 6 + g.phase * 6) * 0.12 * (0.3 + g.amp)

    // ---- camera: follow, wider FOV when running, never inside crowns or rocks or under the ground ----
    cam.current?.moveTo(p.x, p.y + 0.6, p.z, true)
    const c = st.camera as THREE.PerspectiveCamera
    const tx = p.x
    const ty = p.y + 0.6
    const tz = p.z
    const dx = c.position.x - tx
    const dy = c.position.y - ty
    const dz = c.position.z - tz
    const len2 = dx * dx + dz * dz
    let hit = 1
    if (len2 > 0.01) {
      for (let o = 0; o < occluders.length; o += 5) {
        const ox = occluders[o] - tx
        const oz = occluders[o + 1] - tz
        if (Math.abs(ox) > 25 || Math.abs(oz) > 25) continue
        const r = occluders[o + 4]
        const t = clamp((ox * dx + oz * dz) / len2, 0, 1)
        const cx = dx * t - ox
        const cz = dz * t - oz
        const d2 = cx * cx + cz * cz
        if (d2 >= r * r) continue
        const tIn = t - Math.sqrt(r * r - d2) / Math.sqrt(len2)
        if (tIn <= 0.05 || tIn >= hit) continue
        const y = ty + dy * tIn
        if (y > occluders[o + 2] && y < occluders[o + 3]) hit = tIn
      }
    }
    // the terrain itself (ridges, rock walls) between the player and the camera
    for (let i = 1; i <= 8; i++) {
      const t = i / 8
      if (t >= hit) break
      if (ty + dy * t < heightAt(terrain, tx + dx * t, tz + dz * t) + 0.4) {
        hit = Math.max(0.05, t - 0.125)
        break
      }
    }
    // pull in at once, ease back out
    g.camPull = hit < g.camPull ? hit : damp(g.camPull, hit, 2.5, dt)
    if (g.camPull < 0.999) {
      const kPull = Math.max(0.12, g.camPull - 0.04)
      c.position.set(tx + dx * kPull, ty + dy * kPull, tz + dz * kPull)
      c.lookAt(tx, ty, tz)
    }
    const camFloor = heightAt(terrain, c.position.x, c.position.z) + 0.8
    if (c.position.y < camFloor) {
      c.position.y = camFloor
      c.lookAt(tx, ty, tz)
    }
    const fov = BASE_FOV + 7 * runBlend * g.amp
    if (Math.abs(c.fov - fov) > 0.01) {
      c.fov = damp(c.fov, fov, 3, dt)
      c.updateProjectionMatrix()
    }
  })

  return (
    <>
      <Ecctrl
        ref={ecctrl}
        position={spawn}
        enabledRotations={[false, true, false]}
        slopeMaxAngle={0.7}
        capsuleHalfHeight={0.5}
        capsuleRadius={0.3}
        maxWalkVel={WALK_VEL}
        maxRunVel={RUN_VEL}
        jumpVel={4.2}
        accDeltaTime={0.12}
        decDeltaTime={0.15}
      >
        {/* feet at -1.0 (capsule bottom -0.8, float height 0.2) */}
        <group ref={body}>
          <Leg x={HIP_X} thigh={thighs[0]} shin={shins[0]} ankle={ankles[0]} />
          <Leg x={-HIP_X} thigh={thighs[1]} shin={shins[1]} ankle={ankles[1]} />
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
            <Arm x={0.25} upper={arms[0]} fore={fores[0]} />
            <Arm x={-0.25} upper={arms[1]} fore={fores[1]} />
          </group>
        </group>
      </Ecctrl>
      <EcctrlCameraControls ref={cam} makeDefault smoothTime={0.12} minDistance={2.5} maxDistance={20} maxPolarAngle={Math.PI * 0.5} />
    </>
  )
}
