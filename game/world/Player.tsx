'use client'
import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import { Ecctrl, type EcctrlHandle } from 'ecctrl'
import { EcctrlCameraControls, type EcctrlCameraControlsHandle } from 'ecctrl/camera'
import * as THREE from 'three/webgpu'
import { heightAt, type Terrain } from '@/game/core/terrain'
import { runStore } from '@/game/state/run'
import { bodyDropFor, footAlongCycle, HIP_Y, solveLeg, strideLength, THIGH, toblerFactor, type FootTarget, type LegAngles } from './gait'
import { climbPose, createPose, mantlePose, scrambleArms, swimPose } from './poses'

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
const CLIMB_MIN_SLOPE = 0.84 // rise/run ahead (~40°) that turns walking into climbing
const CLIMB_EXIT_ANGLE = 0.61 // rad (~35°): ground walkable again
const SWIM_DEPTH = 1.3 // water deeper than this under you → swim
const ROOT_TO_FEET = 1.0
const COLLIDE_ALL = 0xffffffff // Rapier collision groups: (memberships << 16) | filter
const COLLIDE_NONE = 0x00010000

/** Camera occluders: flat [x, z, yBottom, yTop, radius] per tree crown / rock, in tile coordinates. */
export type Occluders = Float32Array
/** Climbables: flat [x, z, yGround, yTop, climbRadius, type] (type 0 = rock, 1 = tree). */
export type Climbables = Float32Array
export const CLIMB_STRIDE = 6

export interface PlayerHud {
  prompt: HTMLDivElement | null
  grip: HTMLDivElement | null
}

type Mode = 'ground' | 'climb' | 'mantle' | 'swim'
type ClimbKind = 'terrain' | 'rock' | 'tree'

// ---- reused every frame (no allocation in the loop) ----
const input = { forward: false, backward: false, leftward: false, rightward: false, jump: false, run: false }
const vec = { x: 0, y: 0, z: 0 }
const rot = { x: 0, y: 0, z: 0, w: 1 }
const P = new THREE.Vector3()
const camDir = new THREE.Vector3()
const foot: FootTarget = { z: 0, lift: 0, stance: true, swing: 0 }
const leg: LegAngles = { thigh: 0, knee: 0, ankle: 0 }
const feetY = [0, 0]
const feetZ = [0, 0]
const feetSwing = [0, 0]
const pose = createPose()

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
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
/** joint easing that never swings the long way round (swim strokes wrap from +π to −π) */
const ease = (current: number, target: number, k: number, dt: number) =>
  Math.abs(target - current) > 3 ? target : damp(current, target, k, dt)

export default function Player({
  spawn,
  terrain,
  occluders,
  climbables,
  waterAt,
  hud,
  onLookAround,
}: {
  spawn: [number, number, number]
  terrain: Terrain
  occluders: Occluders
  climbables: Climbables
  /** water surface height at local (x, z), −Infinity if dry */
  waterAt: (x: number, z: number) => number
  hud: React.RefObject<PlayerHud>
  onLookAround: () => void
}) {
  const ecctrl = useRef<EcctrlHandle>(null)
  const cam = useRef<EcctrlCameraControlsHandle>(null)
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const scarfTail = useRef<THREE.Group>(null)
  const arms = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)]
  const fores = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)]
  const thighs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)]
  const shins = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)]
  const ankles = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)]
  // ecctrl drives walking; climbing / mantling / swimming drive the body directly (toggled on mode changes only)
  const [ecctrlOn, setEcctrlOn] = useState(true)
  const s = useRef({
    mode: 'ground' as Mode,
    climb: 'terrain' as ClimbKind,
    target: -1, // climbable index
    angle: 0, // around a rock/trunk
    climbY: 0,
    yaw: 0,
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
    grip: 1,
    mantleT: 0,
    mantleFromX: 0,
    mantleFromY: 0,
    mantleFromZ: 0,
    mantleToX: 0,
    mantleToY: 0,
    mantleToZ: 0,
    swimVx: 0,
    swimVz: 0,
    ePressed: false,
    forceGround: false,
    jumpHeld: false,
    prompt: '',
    gripShown: -1,
  })
  const [, getKeys] = useKeyboardControls<Controls>()
  const [debugLog] = useState(() => new URLSearchParams(window.location.search).has('debug'))

  useEffect(() => {
    cam.current?.setLookAt(spawn[0], spawn[1] + 3, spawn[2] - 8, spawn[0], spawn[1], spawn[2], false)
  }, [spawn])

  // ?debug=1: let scripts teleport the player (smoke checks of climbing / swimming)
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debug')) return
    const w = window as unknown as { __bearingTeleport?: (x: number, z: number, yaw: number) => void }
    w.__bearingTeleport = (x, z, yaw) => {
      const rb = ecctrl.current?.body
      if (!rb) return
      s.current.forceGround = true
      rb.setTranslation({ x, y: heightAt(terrain, x, z) + 1.3, z }, true)
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
      rb.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true)
      const y = heightAt(terrain, x, z) + 1.3
      cam.current?.setLookAt(x - Math.sin(yaw) * 6, y + 2.5, z - Math.cos(yaw) * 6, x, y, z, false)
    }
    return () => {
      delete w.__bearingTeleport
    }
  }, [terrain])

  // E = climb a tree / look around (letter by key so AZERTY works)
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key.toLowerCase() === 'e') s.current.ePressed = true
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useFrame((st, rawDt) => {
    const e = ecctrl.current
    const rb = e?.body
    if (!e || !rb || !root.current) return
    const dt = Math.min(rawDt, 0.05)
    const g = s.current
    const time = st.clock.elapsedTime

    // ---- input ----
    const k = getKeys()
    const focused = document.hasFocus() // alt-tab with a key held must not keep the player running
    input.forward = focused && k.forward
    input.backward = focused && k.backward
    input.leftward = focused && k.leftward
    input.rightward = focused && k.rightward
    input.jump = focused && k.jump
    input.run = focused && k.run
    const jumpPressed = input.jump && !g.jumpHeld
    g.jumpHeld = input.jump
    const ePressed = g.ePressed
    g.ePressed = false
    const upDown = (input.forward ? 1 : 0) - (input.backward ? 1 : 0)
    const leftRight = (input.leftward ? 1 : 0) - (input.rightward ? 1 : 0)
    const anyMove = upDown !== 0 || leftRight !== 0
    if (g.mode === 'ground') e.setMovement(input)

    root.current.getWorldPosition(P)
    const hC = heightAt(terrain, P.x, P.z)
    const water = waterAt(P.x, P.z)
    const feet = P.y - ROOT_TO_FEET
    let prompt = ''
    if (g.forceGround) {
      g.forceGround = false
      toGround()
    }
    // safety net: fell through or out of the world → back to spawn
    if (P.y < terrain.minHeight - 30) {
      toGround()
      rb.setTranslation({ x: spawn[0], y: spawn[1], z: spawn[2] }, true)
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
      return
    }
    const store = runStore.getState().playerPosition
    store.x = P.x
    store.y = P.y
    store.z = P.z

    // position-following gain: never overshoot, even when a slow frame runs several physics steps
    const gain = Math.min(10, 0.8 / Math.max(rawDt, 1e-3))
    const follow = (err: number, k = 1) => clamp(err * gain * k, -6, 6)
    function setBody(vx: number, vy: number, vz: number, yaw: number) {
      if (rb!.gravityScale() !== 0) rb!.setGravityScale(0, true) // ecctrl may have set it on its last frame
      vec.x = clamp(vx, -6, 6)
      vec.y = clamp(vy, -6, 6)
      vec.z = clamp(vz, -6, 6)
      rb!.setLinvel(vec, true)
      rot.y = Math.sin(yaw / 2)
      rot.w = Math.cos(yaw / 2)
      rb!.setRotation(rot, true)
      vec.x = 0
      vec.y = 0
      vec.z = 0
      rb!.setAngvel(vec, true)
    }
    function toCustom(mode: Mode) {
      if (debugLog) console.info(`[mode] ${g.mode} → ${mode} P.y ${P.y.toFixed(2)} ground ${hC.toFixed(2)} water ${water.toFixed(2)}`)
      if (g.mode === 'ground') {
        const f = e!.bodyZAxis
        g.yaw = Math.atan2(f.x, f.z)
        setEcctrlOn(false)
        rb!.setGravityScale(0, true)
      }
      g.mode = mode
      g.phase = 0
    }
    function toGround() {
      if (g.mode === 'ground') return
      e!.collider?.setCollisionGroups(COLLIDE_ALL)
      if (debugLog) console.info(`[mode] ${g.mode} → ground (grip ${g.grip.toFixed(2)}) P.y ${P.y.toFixed(2)} ground ${hC.toFixed(2)} water ${water.toFixed(2)} climbY ${g.climbY.toFixed(2)} upDown ${upDown}`)
      g.mode = 'ground'
      rb!.setGravityScale(1, true)
      setEcctrlOn(true)
    }
    function climbableAt(i: number) {
      const o = i * CLIMB_STRIDE
      return { x: climbables[o], z: climbables[o + 1], ground: climbables[o + 2], top: climbables[o + 3], r: climbables[o + 4], tree: climbables[o + 5] === 1 }
    }
    /** nearest climbable of a type within `reach` of the climbing radius, optionally in front of the player */
    function nearest(type: number, reach: number, fx: number, fz: number, needFront: boolean) {
      let best = -1
      let bestD = Infinity
      for (let o = 0, i = 0; o < climbables.length; o += CLIMB_STRIDE, i++) {
        if (climbables[o + 5] !== type) continue
        const dx = climbables[o] - P.x
        const dz = climbables[o + 1] - P.z
        if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue
        const d = Math.hypot(dx, dz)
        if (d > climbables[o + 4] + reach || d >= bestD) continue
        if (needFront && (dx * fx + dz * fz) / (d || 1) < 0.55) continue
        best = i
        bestD = d
      }
      return best
    }

    // ================= modes =================
    let climbSteep = 0
    let moving = 0
    if (g.mode === 'ground') {
      const fwd = e.bodyZAxis
      const grounded = e.isOnGround
      const sliding0 = e.actualSlopeAngle > 0.7
      // → swim
      if (water - hC > SWIM_DEPTH && feet < water - 1.0) {
        toCustom('swim')
        g.swimVx = e.currLinVel.x * 0.5
        g.swimVz = e.currLinVel.z * 0.5
      } else if (anyMove && input.forward && (grounded || sliding0 || feet - hC < 0.5)) {
        // → climb a rock in front of you
        const rock = nearest(0, 0.3, fwd.x, fwd.z, true)
        if (rock >= 0 && climbableAt(rock).top > feet + 0.7) {
          const c = climbableAt(rock)
          toCustom('climb')
          g.climb = 'rock'
          g.target = rock
          g.angle = Math.atan2(P.z - c.z, P.x - c.x)
          g.climbY = P.y
        } else {
          // → climb a slope steeper than ~40° ahead
          const ahead = (heightAt(terrain, P.x + fwd.x * 0.7, P.z + fwd.z * 0.7) - hC) / 0.7
          if (ahead > CLIMB_MIN_SLOPE) {
            toCustom('climb')
            g.climb = 'terrain'
          }
        }
      }
      if (g.mode === 'ground') {
        // E: climb a tree, or look around from the top of a rock
        const tree = nearest(1, 1.0, 0, 0, false)
        const onRock = grounded && e.standPoint.y > hC + 0.7
        if (onRock) prompt = 'E  look around from here'
        else if (tree >= 0) prompt = 'E  climb the tree'
        if (ePressed) {
          if (onRock) onLookAround()
          else if (tree >= 0) {
            const c = climbableAt(tree)
            toCustom('climb')
            g.climb = 'tree'
            g.target = tree
            e.collider?.setCollisionGroups(COLLIDE_NONE) // through the branches (keeps its mass, unlike a sensor)
            g.angle = Math.atan2(P.z - c.z, P.x - c.x)
            g.climbY = P.y
          }
        }
      }
    }

    if (g.mode === 'climb') {
      const speedMul = input.run ? 1.5 : 1
      if (g.climb === 'terrain') {
        // slope frame from the terrain gradient
        const gx = (heightAt(terrain, P.x + 0.6, P.z) - heightAt(terrain, P.x - 0.6, P.z)) / 1.2
        const gz = (heightAt(terrain, P.x, P.z + 0.6) - heightAt(terrain, P.x, P.z - 0.6)) / 1.2
        const gl = Math.hypot(gx, gz) || 1e-3
        const theta = Math.atan(gl)
        const ux = gx / gl
        const uz = gz / gl
        climbSteep = clamp((theta - 0.7) / 0.43, 0, 1) // 40° → 0, 65° → 1
        const speed = (0.8 - 0.4 * climbSteep) * speedMul
        // up the slope along the surface, sideways along the contour (left = up × facing)
        const cosT = Math.cos(theta)
        const sinT = Math.sin(theta)
        let vx = (ux * cosT * upDown + uz * leftRight) * speed
        let vz = (uz * cosT * upDown - ux * leftRight) * speed
        let vy = sinT * upDown * speed
        // stay against the wall: spring toward a standing-height offset, press lightly into the slope
        vy += follow(hC + ROOT_TO_FEET + 0.25 * (1 / cosT - 1) - P.y, 0.4)
        vx += ux * 0.3
        vz += uz * 0.3
        moving = anyMove ? 1 : 0
        g.phase += (Math.hypot(vx, vy, vz) * dt * moving) / 0.9
        g.yaw = damp(g.yaw, g.yaw + wrapAngle(Math.atan2(ux, uz) - g.yaw), 8, dt)
        setBody(vx, vy, vz, g.yaw)
        g.grip -= dt * (0.04 + 0.08 * climbSteep) * (input.run ? 1.6 : 1) * (anyMove ? 1 : 0.6)
        prompt = 'Space  let go'
        if (theta < CLIMB_EXIT_ANGLE) {
          if (upDown > 0) {
            // over the top: pull up onto the flatter ground ahead
            startMantle(P.x + ux * 0.8, P.z + uz * 0.8, heightAt(terrain, P.x + ux * 0.8, P.z + uz * 0.8) + ROOT_TO_FEET)
          } else toGround()
        }
      } else {
        // around and up a rock or a trunk
        const c = climbableAt(g.target)
        climbSteep = 1
        const speed = (c.tree ? 0.7 : 0.5) * speedMul
        g.angle += (leftRight * speed * dt) / c.r
        g.climbY += upDown * speed * dt
        const feetNow = g.climbY - ROOT_TO_FEET
        if (c.tree && feetNow > c.top) g.climbY = c.top + ROOT_TO_FEET
        const tx = c.x + Math.cos(g.angle) * c.r
        const tz = c.z + Math.sin(g.angle) * c.r
        moving = anyMove ? 1 : 0
        g.phase += (speed * dt * moving) / 0.7
        g.yaw = damp(g.yaw, g.yaw + wrapAngle(Math.atan2(c.x - P.x, c.z - P.z) - g.yaw), 10, dt)
        setBody(follow(tx - P.x), follow(g.climbY - P.y), follow(tz - P.z), g.yaw)
        g.grip -= dt * 0.05 * (input.run ? 1.6 : 1) * (anyMove ? 1 : 0.6)
        if (c.tree && feetNow >= c.top - 0.05) {
          prompt = 'E  look around   ·   S  climb down'
          if (ePressed) onLookAround()
        } else prompt = 'Space  let go'
        if (!c.tree && feetNow >= c.top - 0.25 && upDown > 0) {
          // onto the top of the rock
          const inward = Math.min(c.r * 0.5, 0.6)
          startMantle(c.x + Math.cos(g.angle) * inward, c.z + Math.sin(g.angle) * inward, c.top + ROOT_TO_FEET + 0.05)
        } else if (feetNow <= c.ground + 0.05 && upDown < 0) toGround()
      }
      if (g.mode === 'climb' && (jumpPressed || g.grip <= 0)) {
        // push away from the wall (a jump) or slip when the grip is gone
        const away = g.grip <= 0 ? 0.8 : 2.5
        const fx = Math.sin(g.yaw)
        const fz = Math.cos(g.yaw)
        toGround()
        vec.x = -fx * away
        vec.y = g.grip <= 0 ? -0.5 : 3
        vec.z = -fz * away
        rb.setLinvel(vec, true)
      }
    }

    function startMantle(x: number, z: number, y: number) {
      if (debugLog) console.info(`[mode] ${g.mode} → mantle`)
      g.mode = 'mantle'
      g.mantleT = 0
      g.mantleFromX = P.x
      g.mantleFromY = P.y
      g.mantleFromZ = P.z
      g.mantleToX = x
      g.mantleToY = y
      g.mantleToZ = z
    }

    if (g.mode === 'mantle') {
      g.mantleT = Math.min(1, g.mantleT + dt / 0.75)
      const t = g.mantleT
      // up first, then forward over the edge
      const up = Math.min(1, t * 1.7)
      const fwdT = clamp((t - 0.35) / 0.65, 0, 1)
      const tx = g.mantleFromX + (g.mantleToX - g.mantleFromX) * fwdT
      const ty = g.mantleFromY + (g.mantleToY + 0.15 - g.mantleFromY) * up
      const tz = g.mantleFromZ + (g.mantleToZ - g.mantleFromZ) * fwdT
      setBody(follow(tx - P.x), follow(ty - P.y), follow(tz - P.z), g.yaw)
      if (t >= 1) toGround()
    }

    let crawl = 0
    if (g.mode === 'swim' && !(water - hC > SWIM_DEPTH - 0.2)) {
      // wade out where it gets shallow (or the lake ends: water = −Infinity) before any swim target is computed
      toGround()
    } else if (g.mode === 'swim') {
      // camera-relative strokes
      st.camera.getWorldDirection(camDir)
      const cl = Math.hypot(camDir.x, camDir.z) || 1
      const cx = camDir.x / cl
      const cz = camDir.z / cl
      // right = forward × up = (−cz, 0, cx)
      const ix = cx * upDown + cz * leftRight
      const iz = cz * upDown - cx * leftRight
      const il = Math.hypot(ix, iz)
      const swimSpeed = input.run ? 1.7 : 1.1
      const tvx = il > 0 ? (ix / il) * swimSpeed : 0
      const tvz = il > 0 ? (iz / il) * swimSpeed : 0
      g.swimVx = damp(g.swimVx, tvx, 1.8, dt) // water: slow to start, glides to a stop
      g.swimVz = damp(g.swimVz, tvz, 1.8, dt)
      const sp = Math.hypot(g.swimVx, g.swimVz)
      crawl = clamp(sp / 0.7, 0, 1)
      const targetY = water - 0.15 * crawl - 0.75 * (1 - crawl)
      const vy = clamp(follow(targetY - P.y, 0.3), -3, 2) + Math.sin(time * 2) * 0.05
      if (sp > 0.1) g.yaw = damp(g.yaw, g.yaw + wrapAngle(Math.atan2(g.swimVx, g.swimVz) - g.yaw), 4, dt)
      setBody(g.swimVx, vy, g.swimVz, g.yaw)
      g.phase += sp > 0.1 ? (sp * dt) / 1.8 : dt * 0.4
      g.grip = Math.min(1, g.grip + dt * 0.1)
    }

    // ================= poses =================
    let kJoints = 45
    const runBlend0 = g.mode === 'ground' ? clamp((e.moveSpeed - 2.3) / 1.5, 0, 1) : 0
    if (g.mode === 'ground') {
      groundGait()
    } else if (g.mode === 'climb') {
      climbPose(g.phase, climbSteep, moving, pose)
      g.bodyY = damp(g.bodyY, pose.bodyY, 10, dt)
      kJoints = 14
    } else if (g.mode === 'mantle') {
      mantlePose(g.mantleT, pose)
      g.bodyY = damp(g.bodyY, pose.bodyY, 14, dt)
      kJoints = 16
    } else {
      swimPose(g.phase, crawl, time, pose)
      g.bodyY = damp(g.bodyY, 0, 6, dt)
      kJoints = 10
    }

    function groundGait() {
      const fwd = e!.bodyZAxis
      const side = e!.bodyXAxis
      const vel = e!.currLinVel
      const speed = e!.moveSpeed
      const grounded = e!.isOnGround
      const hv = Math.hypot(vel.x, vel.z)
      let grade = 0
      if (hv > 0.15) {
        const ux = vel.x / hv
        const uz = vel.z / hv
        grade = (heightAt(terrain, P.x + ux, P.z + uz) - heightAt(terrain, P.x - ux, P.z - uz)) / 2
      }
      const pitch = (heightAt(terrain, P.x + fwd.x * 0.6, P.z + fwd.z * 0.6) - heightAt(terrain, P.x - fwd.x * 0.6, P.z - fwd.z * 0.6)) / 1.2
      const steepness = clamp((Math.abs(pitch) - 0.35) / 0.35, 0, 1)
      // wading: water between the feet and the chest
      const wade = water > -Infinity ? clamp((water - feet) / 1.2, 0, 1) : 0

      // Tobler (slope) × water drag: brake against ecctrl's push
      if (grounded && hv > 0.2) {
        const f = toblerFactor(grade) * (1 - 0.55 * wade)
        if (f < 0.98) {
          const b = Math.min(0.2 * (1 / f - 1) * dt * 60, 0.8) * rb!.mass()
          vec.x = -vel.x * b
          vec.y = 0
          vec.z = -vel.z * b
          rb!.applyImpulse(vec, true)
        }
      }

      // air, landing, sliding
      const vy = e!.verticalSpeed
      const aboveGround = P.y - ROOT_TO_FEET - hC
      if (!grounded) {
        g.airTime += dt
        g.lastVy = Math.min(g.lastVy, vy)
      } else {
        if (g.airTime > 0.15) g.landing = Math.min(0.3, Math.max(0, -g.lastVy - 1.5) * 0.045)
        g.airTime = 0
        g.lastVy = 0
      }
      g.landing *= Math.exp(-dt * 7)
      const sliding = aboveGround < 0.6 && (e!.actualSlopeAngle > 0.7 || (!grounded && g.airTime > 0.1 && vy < 0 && vy > -6))
      const airborne = !grounded && !sliding && g.airTime > 0.08

      // gait driven by the distance covered
      const runBlend = clamp((speed - 2.3) / 1.5, 0, 1)
      const duty = 0.62 - 0.27 * runBlend
      const stride = strideLength(speed, grade) * (1 - 0.3 * wade)
      if (grounded) g.phase = (g.phase + (speed * dt) / stride) % 1
      g.amp = damp(g.amp, grounded ? clamp(speed / 0.5, 0, 1) : 0, 8, dt)
      const lift = (0.09 + 0.07 * runBlend + 0.04 * Math.max(0, grade) + 0.25 * wade) * g.amp
      const groundY = grounded ? e!.standPoint.y : hC

      let bodyTarget = -0.03 - 0.12 * steepness // knees never locked, lower on steep ground
      for (let i = 0; i < 2; i++) {
        footAlongCycle((g.phase + i * 0.5) % 1, duty, stride, lift, foot)
        const fz = foot.z * g.amp
        const fx = i === 0 ? HIP_X : -HIP_X
        const wx = P.x + side.x * fx + fwd.x * fz
        const wz = P.z + side.z * fx + fwd.z * fz
        const ground = groundY + heightAt(terrain, wx, wz) - hC - P.y
        feetY[i] = ground + foot.lift
        feetZ[i] = fz
        feetSwing[i] = foot.swing
        bodyTarget = Math.min(bodyTarget, bodyDropFor(ground, fz))
      }
      bodyTarget = clamp(bodyTarget - g.landing - (sliding ? 0.28 : 0), -0.45, 0)
      g.bodyY = airborne ? damp(g.bodyY, 0, 6, dt) : damp(g.bodyY, bodyTarget, 18, dt)

      for (let i = 0; i < 2; i++) {
        if (airborne) {
          const rising = vy > 0.5
          pose.thigh[i] = i === 0 ? (rising ? -0.9 : -0.4) : rising ? -0.25 : 0.1
          pose.knee[i] = i === 0 ? (rising ? 1.4 : 0.5) : rising ? 0.9 : 0.35
          pose.ankle[i] = 0.2
        } else if (sliding) {
          pose.thigh[i] = i === 0 ? -0.75 : 0.25
          pose.knee[i] = i === 0 ? 0.55 : 1.3
          pose.ankle[i] = -0.3
        } else {
          const toe = feetSwing[i] > 0 ? 0.35 * Math.sin(Math.PI * feetSwing[i]) : 0
          solveLeg(HIP_Y + g.bodyY, feetY[i], feetZ[i], pitch, toe, leg)
          pose.thigh[i] = leg.thigh
          pose.knee[i] = leg.knee
          pose.ankle[i] = leg.ankle
        }
      }
      kJoints = airborne || sliding ? 12 : 45

      // arms: counter-swing, pump when running, out for balance (steep ground, air, deep water)
      const balance = Math.max(steepness * 0.6, sliding ? 1 : 0, airborne ? 0.8 : 0, wade * 0.7)
      for (let i = 0; i < 2; i++) {
        const other = thighs[1 - i].current
        const swing = other ? other.rotation.x * (0.75 + 0.3 * runBlend) * g.amp : 0
        pose.armX[i] = airborne ? -0.5 : sliding ? 0.5 : swing + 0.05
        pose.armZ[i] = (i === 0 ? 1 : -1) * (0.06 + balance * (airborne ? 1.2 : 0.8))
        pose.fore[i] = -(0.2 + 1.1 * runBlend + 0.35 * Math.max(0, -swing))
      }

      // body: lean into speed and slope, roll into turns, hip twist; scramble with hands on steep slopes
      pose.lean = sliding ? -0.25 : airborne ? 0.1 : 0.035 * speed + 0.1 * runBlend + 0.5 * clamp(grade, -0.4, 0.6)
      if (!airborne && !sliding) scrambleArms(g.phase, clamp((pitch - 0.45) / 0.35, 0, 1), pose)
      g.roll = damp(g.roll, clamp(-e!.currAngVel.y * speed * 0.05, -0.25, 0.25), 6, dt)
      pose.bodyRoll = g.roll + (g.amp < 0.2 ? Math.sin(time * 0.8) * 0.015 : 0)
      pose.bodyYaw = Math.sin(g.phase * Math.PI * 2) * 0.1 * g.amp
      pose.bodyPitch = 0
      pose.torsoYaw = -Math.sin(g.phase * Math.PI * 2) * 0.16 * g.amp
      pose.bodyY = g.bodyY
      g.grip = Math.min(1, g.grip + dt * 0.3)
    }

    // ================= apply the pose =================
    for (let i = 0; i < 2; i++) {
      const th = thighs[i].current
      const sh = shins[i].current
      const an = ankles[i].current
      const a = arms[i].current
      const f = fores[i].current
      if (th) th.rotation.x = ease(th.rotation.x, pose.thigh[i], kJoints, dt)
      if (sh) sh.rotation.x = ease(sh.rotation.x, pose.knee[i], kJoints, dt)
      if (an) an.rotation.x = ease(an.rotation.x, pose.ankle[i], kJoints, dt)
      if (a) {
        a.rotation.x = ease(a.rotation.x, pose.armX[i], g.mode === 'ground' ? 14 : kJoints, dt)
        a.rotation.z = ease(a.rotation.z, pose.armZ[i], 8, dt)
      }
      if (f) f.rotation.x = ease(f.rotation.x, pose.fore[i], 14, dt)
    }
    g.lean = damp(g.lean, pose.lean, 6, dt)
    // breathing: faster and deeper after running, climbing or swimming
    const effort = g.mode === 'ground' ? (runBlend0 > 0.5 ? 0.12 : -0.04) : g.mode === 'swim' ? 0.05 : 0.07
    g.exertion = clamp(g.exertion + dt * effort, 0, 1)
    g.breath += dt * Math.PI * 2 * (0.28 + 0.6 * g.exertion)
    if (body.current) {
      body.current.position.y = g.bodyY
      body.current.rotation.x = damp(body.current.rotation.x, pose.bodyPitch, 6, dt)
      body.current.rotation.z = damp(body.current.rotation.z, pose.bodyRoll, 8, dt)
      body.current.rotation.y = damp(body.current.rotation.y, pose.bodyYaw, 8, dt)
    }
    if (torso.current) {
      torso.current.rotation.x = g.lean
      torso.current.rotation.y = damp(torso.current.rotation.y, pose.torsoYaw, 8, dt)
      const chest = 1 + Math.sin(g.breath) * (0.008 + 0.025 * g.exertion)
      torso.current.scale.set(chest, 1 + (chest - 1) * 0.5, chest)
    }
    if (scarfTail.current) scarfTail.current.rotation.x = clamp(g.amp, 0, 1) * 0.7 + Math.sin(time * 6 + g.phase * 6) * 0.12 * (0.3 + g.amp)

    // ================= HUD (direct DOM, only when it changes) =================
    const h = hud.current
    if (debugLog) prompt = `[${g.mode}${g.mode === 'climb' ? ':' + g.climb : ''}] ${prompt}`
    if (h?.prompt && prompt !== g.prompt) {
      h.prompt.textContent = prompt
      g.prompt = prompt
    }
    const gripShown = g.mode === 'climb' || g.grip < 0.99 ? Math.round(g.grip * 50) / 50 : -1
    if (h?.grip && gripShown !== g.gripShown) {
      h.grip.style.opacity = gripShown < 0 ? '0' : '1'
      h.grip.style.transform = `scaleX(${Math.max(0, gripShown)})`
      h.grip.style.background = g.grip < 0.25 ? '#e05a3a' : '#e8d9a0'
      g.gripShown = gripShown
    }

    // ================= camera =================
    cam.current?.moveTo(P.x, P.y + 0.6, P.z, true)
    const c = st.camera as THREE.PerspectiveCamera
    const tx = P.x
    const ty = P.y + 0.6
    const tz = P.z
    const dx = c.position.x - tx
    const dy = c.position.y - ty
    const dz = c.position.z - tz
    const len2 = dx * dx + dz * dz
    let hit = 1
    const climbingTree = g.mode === 'climb' && g.climb === 'tree'
    const treeX = climbingTree ? climbables[g.target * CLIMB_STRIDE] : 0
    const treeZ = climbingTree ? climbables[g.target * CLIMB_STRIDE + 1] : 0
    if (len2 > 0.01) {
      for (let o = 0; o < occluders.length; o += 5) {
        const ox = occluders[o] - tx
        const oz = occluders[o + 1] - tz
        if (Math.abs(ox) > 25 || Math.abs(oz) > 25) continue
        if (climbingTree && Math.abs(occluders[o] - treeX) < 0.05 && Math.abs(occluders[o + 1] - treeZ) < 0.05) continue
        const r = occluders[o + 4]
        const t = clamp((ox * dx + oz * dz) / len2, 0, 1)
        const qx = dx * t - ox
        const qz = dz * t - oz
        const d2 = qx * qx + qz * qz
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
    g.camPull = hit < g.camPull ? hit : damp(g.camPull, hit, 2.5, dt)
    if (g.camPull < 0.999) {
      const kPull = Math.max(0.12, g.camPull - 0.04)
      c.position.set(tx + dx * kPull, ty + dy * kPull, tz + dz * kPull)
      c.lookAt(tx, ty, tz)
    }
    // above the ground, and above the water surface
    const camFloor = Math.max(heightAt(terrain, c.position.x, c.position.z) + 0.8, waterAt(c.position.x, c.position.z) + 0.35)
    if (c.position.y < camFloor) {
      c.position.y = camFloor
      c.lookAt(tx, ty, tz)
    }
    const fov = BASE_FOV + 7 * runBlend0 * g.amp
    if (Math.abs(c.fov - fov) > 0.01) {
      c.fov = damp(c.fov, fov, 3, dt)
      c.updateProjectionMatrix()
    }
  })

  return (
    <>
      <Ecctrl
        ref={ecctrl}
        enable={ecctrlOn}
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
        <group ref={root}>
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
        </group>
      </Ecctrl>
      <EcctrlCameraControls ref={cam} makeDefault smoothTime={0.12} minDistance={2.5} maxDistance={20} maxPolarAngle={Math.PI * 0.5} />
    </>
  )
}
