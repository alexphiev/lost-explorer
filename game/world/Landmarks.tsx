'use client'
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
        </>
      )}
    </RigidBody>
  )
}
