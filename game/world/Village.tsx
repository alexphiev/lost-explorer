'use client'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import type { Instance } from '@/game/core/placement'

const WALLS = ['#e8dcc4', '#d9c6a3', '#efe6d2', '#cdb68f']
const ROOFS = ['#9c4a32', '#7d3b2a', '#8a5a3c']

/** Low-poly houses: walls, pyramid roof, a chimney. */
export default function Village({ houses }: { houses: Instance[] }) {
  if (houses.length === 0) return null
  return (
    <RigidBody type="fixed" colliders={false}>
      {houses.map((h, i) => {
        const w = 6 * h.scale
        const d = 5 * h.scale
        const ht = 3.2 * h.scale
        return (
          <group key={i} position={[h.x, h.y - 0.3, h.z]} rotation={[0, h.rotation, 0]}>
            <mesh position={[0, ht / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[w, ht, d]} />
              <meshLambertMaterial color={WALLS[i % WALLS.length]} flatShading />
            </mesh>
            <mesh position={[0, ht + 1.4 * h.scale, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
              <coneGeometry args={[w * 0.78, 2.8 * h.scale, 4]} />
              <meshLambertMaterial color={ROOFS[i % ROOFS.length]} flatShading />
            </mesh>
            <mesh position={[w * 0.25, ht + 2 * h.scale, d * 0.1]} castShadow>
              <boxGeometry args={[0.6, 1.6, 0.6]} />
              <meshLambertMaterial color="#6e6258" flatShading />
            </mesh>
            <CuboidCollider args={[w / 2, ht / 2 + 1, d / 2]} position={[0, ht / 2, 0]} />
          </group>
        )
      })}
    </RigidBody>
  )
}
