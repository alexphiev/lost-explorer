'use client'
import { useEffect, useMemo, useRef } from 'react'
import { runStore } from '@/game/state/run'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Instance } from '@/game/core/placement'
import * as THREE from 'three/webgpu'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import type { Anchor } from '@/game/core/placement'
import type { ClueKind, GoalKind } from '@/game/core/goals'

const WOOD = '#6b4a2e'
const DARK_WOOD = '#4a3220'
const STONE = '#8d877c'

function Stones({ ring = false }: { ring?: boolean }) {
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * 0.8, 0.12, Math.sin(a) * 0.8]} castShadow>
            <dodecahedronGeometry args={[0.22, 0]} />
            <meshLambertMaterial color={ring ? '#4a4540' : STONE} flatShading />
          </mesh>
        )
      })}
      {ring && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.6, 10]} />
          <meshLambertMaterial color="#2b2622" />
        </mesh>
      )}
    </>
  )
}

/** Small placeholder props for the clues on the way (cairn, signpost, old fire…). */
export function ClueProp({ kind, at }: { kind: ClueKind; at: Anchor }) {
  // `rotation` is the bearing it points to: local +x turned toward it
  return (
    <group position={[at.x, at.y, at.z]} rotation={[0, at.rotation, 0]}>
      {kind === 'cairn' ? (
        <RigidBody type="fixed" colliders="hull">
          {[0.75, 0.6, 0.45, 0.32].map((r, i) => (
            <mesh key={i} position={[i === 3 ? 0.12 : 0, 0.3 + i * 0.5, 0]} castShadow receiveShadow>
              <dodecahedronGeometry args={[r, 0]} />
              <meshLambertMaterial color={STONE} flatShading />
            </mesh>
          ))}
        </RigidBody>
      ) : kind === 'signpost' ? (
        <>
          <mesh position={[0, 1.1, 0]} castShadow>
            <boxGeometry args={[0.14, 2.2, 0.14]} />
            <meshLambertMaterial color={DARK_WOOD} />
          </mesh>
          <mesh position={[0.55, 1.85, 0]} castShadow>
            <boxGeometry args={[1.1, 0.26, 0.05]} />
            <meshLambertMaterial color={WOOD} />
          </mesh>
          <CylinderCollider args={[1.1, 0.1]} position={[0, 1.1, 0]} />
        </>
      ) : kind === 'firepit' ? (
        <Stones ring />
      ) : kind === 'waymark' ? (
        <Waymark />
      ) : kind === 'embers' ? (
        <>
          <Stones ring />
          <NightGlow position={[0, 0.25, 0]} color="#ff5a1f" size={0.3} light={10} />
        </>
      ) : kind === 'lantern' ? (
        <>
          <mesh position={[0, 1.3, 0]} castShadow>
            <boxGeometry args={[0.12, 2.6, 0.12]} />
            <meshLambertMaterial color={DARK_WOOD} />
          </mesh>
          <mesh position={[0.35, 2.5, 0]}>
            <boxGeometry args={[0.7, 0.08, 0.08]} />
            <meshLambertMaterial color={DARK_WOOD} />
          </mesh>
          <mesh position={[0.62, 2.25, 0]}>
            <boxGeometry args={[0.18, 0.28, 0.18]} />
            <meshLambertMaterial color="#3a3a36" />
          </mesh>
          <NightGlow position={[0.62, 2.22, 0]} color="#ffcf6a" size={0.12} light={8} />
        </>
      ) : kind === 'fireflies' ? (
        <Fireflies at={{ x: 0, y: 0, z: 0, rotation: 0 }} />
      ) : kind === 'blaze' ? (
        <>
          <mesh position={[0, 2, 0]} castShadow>
            <cylinderGeometry args={[0.28, 0.35, 4, 7]} />
            <meshLambertMaterial color="#5a4632" flatShading />
          </mesh>
          <mesh position={[0.3, 1.5, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[0.3, 0.5]} />
            <meshLambertMaterial color="#e8d2a6" />
          </mesh>
          <CylinderCollider args={[2, 0.32]} position={[0, 2, 0]} />
        </>
      ) : (
        // the others are small finds: a stake with a faded red rag marks them
        <>
          <mesh position={[0, 0.6, 0]} rotation={[0, 0, 0.12]} castShadow>
            <cylinderGeometry args={[0.04, 0.05, 1.2, 5]} />
            <meshLambertMaterial color={DARK_WOOD} />
          </mesh>
          <mesh position={[0.15, 1.05, 0]} castShadow>
            <boxGeometry args={[0.3, 0.16, 0.02]} />
            <meshLambertMaterial color="#a03a2a" />
          </mesh>
          <mesh position={[0.4, 0.1, 0.2]} castShadow>
            <boxGeometry args={[0.35, 0.18, 0.22]} />
            <meshLambertMaterial color={kind === 'oar' || kind === 'saw' ? '#7d6a55' : '#6a5038'} />
          </mesh>
        </>
      )}
    </group>
  )
}

/** The place that ends the level, other than the village (houses, see Village.tsx). */
export function GoalProp({ kind, at }: { kind: Exclude<GoalKind, 'village'>; at: Anchor }) {
  return (
    <RigidBody type="fixed" colliders={false} position={[at.x, at.y, at.z]} rotation={[0, at.rotation, 0]}>
      {kind === 'boat' ? (
        // hull along local z, beached on the bank
        <group position={[0, 0.25, 0]} rotation={[0, 0, 0.08]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[1.5, 0.5, 4.2]} />
            <meshLambertMaterial color="#7a4e2a" flatShading />
          </mesh>
          <mesh position={[0, 0.05, 2.4]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <boxGeometry args={[1.05, 0.5, 1.05]} />
            <meshLambertMaterial color="#7a4e2a" flatShading />
          </mesh>
          <mesh position={[0, 0.27, 0]}>
            <boxGeometry args={[1.2, 0.05, 3.8]} />
            <meshLambertMaterial color="#3e2a18" />
          </mesh>
          <mesh position={[0, 0.35, 0.3]}>
            <boxGeometry args={[1.3, 0.08, 0.3]} />
            <meshLambertMaterial color={WOOD} />
          </mesh>
          <mesh position={[0.3, 0.42, 0]} rotation={[0, 0.15, 0]}>
            <boxGeometry args={[0.08, 0.06, 2.6]} />
            <meshLambertMaterial color="#c2a274" />
          </mesh>
          <CuboidCollider args={[0.75, 0.3, 2.3]} />
          {/* a lantern at the bow */}
          <NightGlow position={[0, 0.9, 1.9]} size={0.15} light={8} />
        </group>
      ) : kind === 'cave' ? (
        // rock mass toward the cliff (local −z), the opening and the old camp facing out
        <>
          {[[-4, 2.5, -7, 4], [4, 2.8, -7, 4.2], [0, 5, -8, 4.5], [-6, 1.5, -4, 2.5], [6, 1.6, -4, 2.6]].map(([x, y, z, r], i) => (
            <mesh key={i} position={[x, y, z]} castShadow receiveShadow>
              <dodecahedronGeometry args={[r, 0]} />
              <meshLambertMaterial color={i % 2 ? '#7d776c' : STONE} flatShading />
            </mesh>
          ))}
          <mesh position={[0, 1.6, -4.6]}>
            <sphereGeometry args={[2.2, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshBasicMaterial color="#120d09" />
          </mesh>
          <group position={[0, 0, -1]}>
            <Stones ring />
          </group>
          <mesh position={[1.8, 0.12, -2.4]} rotation={[0, 0.4, 0]} castShadow>
            <boxGeometry args={[0.7, 0.22, 1.9]} />
            <meshLambertMaterial color="#5d6b4a" />
          </mesh>
          <CuboidCollider args={[7, 4, 3]} position={[0, 3, -8.5]} />
          {/* the old fire is lit again: it glows under the cliff at night */}
          <NightGlow position={[0, 0.4, -1]} color="#ff7a2a" size={0.35} light={14} />
        </>
      ) : (
        // cabin (woods) or hut (lake shore, on stilts with a jetty toward local +z)
        <>
          <group position={[0, kind === 'hut' ? 0.8 : 0, 0]}>
            <mesh position={[0, 1.4, 0]} castShadow receiveShadow>
              <boxGeometry args={[4.5, 2.8, 3.6]} />
              <meshLambertMaterial color={kind === 'hut' ? '#7d6a55' : '#6b4a2e'} flatShading />
            </mesh>
            <mesh position={[0, 3.4, 0]} rotation={[0, 0, Math.PI / 4]} castShadow>
              <boxGeometry args={[2.9, 2.9, 3.9]} />
              <meshLambertMaterial color={kind === 'hut' ? '#5b5f55' : '#3e5228'} flatShading />
            </mesh>
            <mesh position={[0, 1, 1.81]}>
              <planeGeometry args={[0.9, 1.9]} />
              <meshLambertMaterial color="#2a1c10" />
            </mesh>
          </group>
          {kind === 'hut' ? (
            <>
              {[[-2, -1.6], [2, -1.6], [-2, 1.6], [2, 1.6]].map(([x, z], i) => (
                <mesh key={i} position={[x, 0.4, z]}>
                  <cylinderGeometry args={[0.12, 0.12, 1.6, 5]} />
                  <meshLambertMaterial color={DARK_WOOD} />
                </mesh>
              ))}
              <mesh position={[0, 0.75, 5.5]} castShadow receiveShadow>
                <boxGeometry args={[1.4, 0.12, 8]} />
                <meshLambertMaterial color={WOOD} />
              </mesh>
            </>
          ) : (
            [0, 1, 2].map((i) => (
              <mesh key={i} position={[2.75, 0.2 + i * 0.35, -0.5]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[0.17, 0.17, 2.4, 6]} />
                <meshLambertMaterial color="#8a6a46" flatShading />
              </mesh>
            ))
          )}
          <CuboidCollider args={[2.25, 2, 1.8]} position={[0, 2, 0]} />
          {/* a lamp in the window at night */}
          <NightGlow position={[1.2, (kind === 'hut' ? 0.8 : 0) + 1.6, 1.85]} size={0.18} light={8} />
        </>
      )}
    </RigidBody>
  )
}

/** Your camp: a small tent and, when there is wood around, a fire whose light flickers. */
export function CampProp({ at, fire }: { at: Anchor; fire: boolean }) {
  const light = useRef<THREE.PointLight>(null)
  const flame = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const f = 0.85 + Math.sin(t * 9) * 0.08 + Math.sin(t * 23) * 0.05
    if (light.current) light.current.intensity = 18 * f
    if (flame.current) flame.current.scale.y = 0.8 + f * 0.4
  })
  return (
    <group position={[at.x, at.y, at.z]} rotation={[0, at.rotation, 0]}>
      <mesh position={[0, 0.75, -1.8]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[1.5, 1.5, 4]} />
        <meshLambertMaterial color="#c9833f" flatShading />
      </mesh>
      {fire && (
        <group position={[0, 0, 0.8]}>
          <Stones ring />
          {[0, 1.2, 2.4].map((a) => (
            <mesh key={a} position={[0, 0.12, 0]} rotation={[0, a, Math.PI / 2.4]}>
              <cylinderGeometry args={[0.06, 0.06, 0.8, 5]} />
              <meshLambertMaterial color="#4a3220" />
            </mesh>
          ))}
          <mesh ref={flame} position={[0, 0.4, 0]}>
            <coneGeometry args={[0.22, 0.6, 6]} />
            <meshBasicMaterial color="#ffb347" />
          </mesh>
          <pointLight ref={light} position={[0, 0.8, 0]} color="#ff9a3c" intensity={18} distance={18} decay={2} />
        </group>
      )}
    </group>
  )
}

/**
 * A light that only shows at night (runStore.night): a small unfogged glowing ball that grows with distance so it
 * stays visible far away, plus a little real light on what is around it.
 */
export function NightGlow({ position, color = '#ffd27a', size = 0.25, light = 6 }: { position: [number, number, number]; color?: string; size?: number; light?: number }) {
  const ball = useRef<THREE.Mesh>(null)
  const lamp = useRef<THREE.PointLight>(null)
  const mat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color })
    m.fog = false
    m.toneMapped = false
    return m
  }, [color])
  useEffect(() => () => mat.dispose(), [mat])
  useFrame(({ camera, clock }) => {
    const b = ball.current
    if (!b) return
    const on = runStore.getState().night > 0
    b.visible = on
    if (lamp.current) lamp.current.visible = on
    if (!on) return
    b.getWorldPosition(tmp)
    const d = tmp.distanceTo(camera.position)
    // ~constant on-screen size beyond 40 m, and a slow flicker
    b.scale.setScalar(Math.max(1, d / 40) * (0.92 + Math.sin(clock.elapsedTime * 7 + position[0]) * 0.08))
  })
  return (
    <group position={position}>
      <mesh ref={ball} material={mat} visible={false}>
        <sphereGeometry args={[size, 8, 6]} />
      </mesh>
      {light > 0 && <pointLight ref={lamp} color={color} intensity={light} distance={14} decay={2} visible={false} />}
    </group>
  )
}
const tmp = new THREE.Vector3()

/** Fireflies: a few dots drifting low, at night only. */
export function Fireflies({ at }: { at: Anchor }) {
  const group = useRef<THREE.Group>(null)
  const mat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: '#d8ff7a' })
    m.toneMapped = false
    return m
  }, [])
  useEffect(() => () => mat.dispose(), [mat])
  const seeds = useMemo(() => Array.from({ length: 14 }, (_, i) => [Math.sin(i * 12.9) * 6, Math.cos(i * 7.3) * 6, i * 1.7] as const), [])
  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    g.visible = runStore.getState().night > 0
    if (!g.visible) return
    const t = clock.elapsedTime
    g.children.forEach((c, i) => {
      const [x, z, p] = seeds[i]
      c.position.set(x + Math.sin(t * 0.4 + p) * 1.5, 0.6 + Math.sin(t * 0.9 + p) * 0.4, z + Math.cos(t * 0.33 + p) * 1.5)
      c.scale.setScalar(0.5 + 0.5 * Math.max(0, Math.sin(t * 2.5 + p * 3)))
    })
  })
  return (
    <group ref={group} position={[at.x, at.y, at.z]} visible={false}>
      {seeds.map((_, i) => (
        <mesh key={i} material={mat}>
          <sphereGeometry args={[0.06, 5, 4]} />
        </mesh>
      ))}
    </group>
  )
}

/** The North Star: one bright star always due north, at night (orientation without a compass). */
export function NorthStar() {
  const ball = useRef<THREE.Mesh>(null)
  const mat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: '#f4f6ff' })
    m.fog = false
    m.toneMapped = false
    return m
  }, [])
  useEffect(() => () => mat.dispose(), [mat])
  useFrame(({ camera }) => {
    const b = ball.current
    if (!b) return
    b.visible = runStore.getState().night > 0
    // far away, north (−z), ~40° up, following the camera so it never gets closer
    b.position.set(camera.position.x, camera.position.y + 520, camera.position.z - 620)
  })
  return (
    <mesh ref={ball} material={mat} visible={false} frustumCulled={false}>
      <sphereGeometry args={[3.2, 8, 6]} />
    </mesh>
  )
}

/** Berry bushes: leafy blobs, with red berries until you eat them. */
export function BerryBushes({ bushes, eaten }: { bushes: Instance[]; eaten: number[] }) {
  const leaves = useRef<THREE.InstancedMesh>(null)
  const berries = useRef<THREE.InstancedMesh>(null)
  const full = useMemo(() => bushes.filter((_, i) => !eaten.includes(i)), [bushes, eaten])
  useEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const v = new THREE.Vector3()
    const s = new THREE.Vector3()
    bushes.forEach((b, i) => {
      leaves.current?.setMatrixAt(i, m.compose(v.set(b.x, b.y + 0.45 * b.scale, b.z), q, s.set(1.1 * b.scale, 0.8 * b.scale, 1.1 * b.scale)))
    })
    full.forEach((b, i) => {
      berries.current?.setMatrixAt(i, m.compose(v.set(b.x, b.y + 0.55 * b.scale, b.z), q, s.setScalar(b.scale)))
    })
    if (leaves.current) leaves.current.instanceMatrix.needsUpdate = true
    if (berries.current) berries.current.instanceMatrix.needsUpdate = true
  }, [bushes, full])
  const berryGeo = useMemo(() => {
    // a cluster of red dots on the bush surface
    const parts: THREE.BufferGeometry[] = []
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4
      const y = Math.sin(k * 1.7) * 0.3
      const r = Math.sqrt(1 - y * y) * 1.05
      parts.push(new THREE.SphereGeometry(0.09, 5, 4).translate(Math.cos(a) * r, y, Math.sin(a) * r))
    }
    return mergeGeometries(parts)
  }, [])
  useEffect(() => () => berryGeo.dispose(), [berryGeo])
  if (bushes.length === 0) return null
  return (
    <>
      <instancedMesh ref={leaves} args={[undefined, undefined, bushes.length]} castShadow receiveShadow>
        <icosahedronGeometry args={[1, 0]} />
        <meshLambertMaterial color="#3f6b2e" flatShading />
      </instancedMesh>
      {full.length > 0 && (
        <instancedMesh key={full.length} ref={berries} args={[berryGeo, undefined, full.length]}>
          <meshLambertMaterial color="#c0213a" />
        </instancedMesh>
      )}
    </>
  )
}

/** A tall dead tree on a summit: something to aim for from far away. */
export function SummitTree({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <group position={[x, y - 0.5, z]}>
      <mesh position={[0, 7, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.55, 14, 6]} />
        <meshLambertMaterial color="#5b5047" flatShading />
      </mesh>
      {[
        [9, 0.9, 1.1],
        [11, -1.0, 2.3],
        [12.5, 0.7, 4.1],
      ].map(([h, tilt, yaw], i) => (
        <mesh key={i} position={[0, h, 0]} rotation={[0, yaw, tilt]} castShadow>
          <cylinderGeometry args={[0.08, 0.15, 3.2, 4]} />
          <meshLambertMaterial color="#5b5047" />
        </mesh>
      ))}
      <CylinderCollider args={[7, 0.45]} position={[0, 7, 0]} />
    </group>
  )
}

/**
 * A GR trail post (local +x = the way on): a wooden post with the red and white GR mark, an arrow board pointing
 * along the trail, and a few boot prints leaving it in that direction.
 */
function Waymark() {
  return (
    <>
      <mesh position={[0, 0.75, 0]} castShadow>
        <boxGeometry args={[0.14, 1.5, 0.14]} />
        <meshLambertMaterial color="#7a5a3a" />
      </mesh>
      {/* GR mark: white over red, on both faces */}
      <mesh position={[0, 1.3, 0]}>
        <boxGeometry args={[0.15, 0.06, 0.15]} />
        <meshLambertMaterial color="#f2f2ee" />
      </mesh>
      <mesh position={[0, 1.22, 0]}>
        <boxGeometry args={[0.15, 0.06, 0.15]} />
        <meshLambertMaterial color="#c8202a" />
      </mesh>
      {/* arrow board pointing the way on */}
      <group position={[0.28, 1.0, 0]}>
        <mesh>
          <boxGeometry args={[0.42, 0.16, 0.04]} />
          <meshLambertMaterial color="#f2f2ee" />
        </mesh>
        <mesh position={[0.27, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.14, 0.2, 3]} />
          <meshLambertMaterial color="#c8202a" />
        </mesh>
        <mesh position={[0, 0, 0.022]}>
          <boxGeometry args={[0.3, 0.05, 0.005]} />
          <meshLambertMaterial color="#c8202a" />
        </mesh>
        <mesh position={[0, 0, -0.022]}>
          <boxGeometry args={[0.3, 0.05, 0.005]} />
          <meshLambertMaterial color="#c8202a" />
        </mesh>
      </group>
      {/* boot prints leaving the post */}
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <mesh key={k} position={[0.9 + k * 0.62, 0.035, k % 2 ? 0.14 : -0.14]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]}>
          <circleGeometry args={[0.1, 8]} />
          <meshLambertMaterial color="#4a3a28" transparent opacity={0.55} />
        </mesh>
      ))}
      <CylinderCollider args={[0.75, 0.1]} position={[0, 0.75, 0]} />
    </>
  )
}
