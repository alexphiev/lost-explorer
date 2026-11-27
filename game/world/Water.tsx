'use client'

import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, DoubleSide, MeshStandardNodeMaterial, RingGeometry, Vector2, Vector3 } from 'three/webgpu'
import {
  attribute,
  color,
  cos,
  dot,
  exp,
  float,
  mix,
  mx_noise_float,
  normalView,
  normalize,
  modelWorldMatrix,
  positionGeometry,
  positionLocal,
  positionViewDirection,
  sin,
  smoothstep,
  time,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import type { HeightField } from '@/game/core/terrain'
import type { Terrain } from '@/game/core/terrain'
import { heightAt } from '@/game/core/terrain'
import { RIBBON_MARGIN } from '@/game/core/rivers'
import { runStore } from '@/game/state/run'

export function waterLevelAt(field: HeightField, tile: Terrain, localX: number, localZ: number): number {
  return field.water(localX + tile.centerX, localZ + tile.centerZ)
}

/** Shared by every water surface: where the player is in the water, and how hard they stir it (0..1). */
const wakeAt = uniform(new Vector3(0, -1000, 0))
/** 0..1: the player is in the water */
const wakeStrength = uniform(0)
/** unit direction the player moves in, and 0..1 how fast */
const wakeDir = uniform(new Vector2(0, 1))
const wakeSpeed = uniform(0)

/**
 * Still water (lakes, ponds) or, with `flowing`, streams: deep blue, rolling waves, ripples that drift with the current,
 * foam where it runs fast, and a V-shaped wake behind the player when they wade or swim.
 * `up` = the local axis that points up (lakes are discs lying in their XY plane).
 */
function makeWaterMaterial(flowing: boolean, up: 'y' | 'z') {
  const m = new MeshStandardNodeMaterial()
  m.transparent = true
  m.depthWrite = false
  m.side = DoubleSide
  m.roughness = 0.25
  m.metalness = 0

  const t = time
  const current = flowing ? attribute('flow', 'vec2') : null
  // world position of the undisplaced vertex (positionWorld would loop back through positionNode)
  const world = modelWorldMatrix.mul(vec4(positionGeometry, 1)).xz
  // ripples ride the current
  const p = current ? world.sub(current.mul(t)) : world
  const speed = current ? current.length() : float(0)

  // rolling waves: two crossing swells + noise, choppier on running water
  const swell = sin(p.x.mul(0.22).add(p.y.mul(0.13)).add(t.mul(1.1)))
    .mul(0.5)
    .add(sin(p.y.mul(0.31).sub(p.x.mul(0.07)).sub(t.mul(1.4))).mul(0.35))
    .add(mx_noise_float(vec3(p.x.mul(0.18), p.y.mul(0.18), t.mul(0.35))).mul(0.4))
  const amp = speed.mul(0.05).add(0.06)

  // the player's wake. Moving: a V trailing behind (two arms at ~20°, like any swimmer or boat) with small
  // transverse ripples inside it. Always: a few small ripples and a little foam right around the body.
  const off = world.sub(wakeAt.xz)
  const d = off.length().add(0.001)
  const along = dot(off, wakeDir).negate() // > 0 behind the swimmer
  const across = off.x.mul(wakeDir.y).sub(off.y.mul(wakeDir.x)).abs()
  const trail = smoothstep(0, 0.8, along).mul(exp(along.mul(-0.22))).mul(wakeSpeed).mul(wakeStrength)
  const arm = smoothstep(0.28, 0, across.sub(along.mul(0.36)).abs()).mul(trail)
  const inside = smoothstep(0.2, -0.2, across.sub(along.mul(0.36)))
  const trans = sin(along.mul(3.5).sub(t.mul(6))).mul(inside).mul(trail)
  const ripple = sin(d.mul(5).sub(t.mul(4))).mul(smoothstep(2.5, 0.4, d)).mul(wakeStrength)
  const height = swell.mul(amp).add(arm.mul(0.04)).add(trans.mul(0.025)).add(ripple.mul(0.015))
  m.positionNode = up === 'y' ? positionLocal.add(vec3(0, height, 0)) : positionLocal.add(vec3(0, 0, height))

  // slopes of the waves for lighting
  const gx = cos(p.x.mul(0.22).add(p.y.mul(0.13)).add(t.mul(1.1))).mul(0.11).add(sin(p.y.mul(0.9).add(p.x.mul(0.4)).sub(t.mul(1.3))).mul(0.25))
  const gz = cos(p.y.mul(0.31).sub(p.x.mul(0.07)).sub(t.mul(1.4))).mul(0.11).add(sin(p.x.mul(1.1).sub(p.y.mul(0.5)).add(t.mul(1.1))).mul(0.25))
  const tilt = vec2(gx, gz)
    .mul(speed.mul(0.25).add(0.35))
    .add(off.div(d).mul(cos(d.mul(5).sub(t.mul(4))).mul(smoothstep(2.5, 0.4, d)).mul(wakeStrength).mul(0.25)))
    .add(wakeDir.mul(cos(along.mul(3.5).sub(t.mul(6))).mul(inside).mul(trail).mul(0.35)))
  m.normalNode = normalize(normalView.add(vec3(tilt.x, 0, tilt.y).mul(0.35)))

  // colour by depth: turquoise in the shallows, clear blue deeper; sky-tinted at grazing angles, light crests.
  // Lit partly by itself (emissive): without an environment map a PBR surface goes near black in the shade.
  const depth = attribute('depth', 'float')
  const fres = float(1).sub(dot(normalView, positionViewDirection).abs()).clamp(0, 1)
  const deepness = smoothstep(0.15, 2.5, depth)
  const body = mix(color(0x5cc0cf), color(0x1f6fa8), deepness)
  let col = mix(body, color(0xb4dcf0), fres.pow(2.5).mul(0.6))
  col = mix(col, color(0x8fd0e6), smoothstep(0.5, 1, swell).mul(0.3))
  // the wake: faint white on the V arms, a little foam where the body breaks the surface
  const churn = smoothstep(0.8, 0.3, d).mul(wakeStrength).mul(wakeSpeed.mul(0.6).add(0.4))
  col = mix(col, color(0xeef7fa), arm.mul(0.3).add(churn.mul(0.35)).clamp(0, 1))
  // soft shoreline: fade out where the water gets thin instead of a jagged cut by the terrain
  const shore = smoothstep(0.02, 0.4, depth)
  let alpha = mix(float(0.82), float(0.95), deepness).add(fres.mul(0.05))
  if (current) {
    // white water where the stream runs fast (riffles, rapids)
    const n = mx_noise_float(vec3(p.x.mul(0.45), p.y.mul(0.45), t.mul(0.6)))
    const foam = smoothstep(0.15, 0.55, n).mul(speed.sub(0.55).clamp(0, 1))
    col = mix(col, color(0xeef5f4), foam.mul(0.7))
    alpha = alpha.add(foam.mul(0.1))
  }
  m.colorNode = col
  m.emissiveNode = col.mul(0.35)
  m.opacityNode = alpha.add(arm.mul(0.05)).mul(shore).clamp(0, 1)
  return m
}

/** Water ribbons along the streams and rivers of the tile (local coordinates), cut every few metres so the waves can roll. */
function buildStreams(field: HeightField, tile: Terrain) {
  const half = tile.size / 2
  const pos: number[] = []
  const flow: number[] = []
  const depth: number[] = []
  const idx: number[] = []
  const ACROSS = 6 // vertices across the ribbon − 1
  for (const r of field.rivers.near(tile.centerX, tile.centerZ, half + 50)) {
    let prev = -1 // first vertex index of the previous node's row, −1 at the start of a run
    const inLake = Array.from({ length: r.n }, (_, i) => field.lake(r.x[i], r.z[i]) > -Infinity)
    for (let i = 0; i < r.n; i++) {
      const x = r.x[i] - tile.centerX
      const z = r.z[i] - tile.centerZ
      // inside a lake the ribbon is hidden under its surface: keep the first node in, so the stream reaches the shore
      const drowned = inLake[i] && !(i > 0 && !inLake[i - 1]) && !(i < r.n - 1 && !inLake[i + 1])
      if (!r.wet[i] || drowned || Math.abs(x) > half || Math.abs(z) > half) {
        prev = -1
        continue
      }
      const w = r.halfW[i] + RIBBON_MARGIN
      const px = -r.dz[i] * w
      const pz = r.dx[i] * w
      const v = pos.length / 3
      const y = r.level[i] + 0.03
      const fx = r.dx[i] * r.speed[i]
      const fz = r.dz[i] * r.speed[i]
      for (let k = 0; k <= ACROSS; k++) {
        const s = 1 - (2 * k) / ACROSS
        pos.push(x + px * s, y, z + pz * s)
        flow.push(fx, fz)
        depth.push(r.level[i] - heightAt(tile, x + px * s, z + pz * s))
      }
      if (prev >= 0) for (let k = 0; k < ACROSS; k++) idx.push(prev + k, prev + k + 1, v + k, prev + k + 1, v + k + 1, v + k)
      prev = v
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('flow', new BufferAttribute(new Float32Array(flow), 2))
  g.setAttribute('depth', new BufferAttribute(new Float32Array(depth), 1))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(pos.length).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3))
  g.setIndex(idx)
  return g
}

export default function Water({ field, tile }: { field: HeightField; tile: Terrain }) {
  const still = useMemo(() => makeWaterMaterial(false, 'z'), [])
  const running = useMemo(() => makeWaterMaterial(true, 'y'), [])
  const lakes = useMemo(
    () =>
      field.lakesNear(tile.centerX, tile.centerZ, 800).map((l) => {
        // rings of vertices so the swell can move the surface; depth per vertex for the colour and the soft shore
        const geo = new RingGeometry(0, l.radius + 1.5, 64, Math.max(8, Math.round(l.radius / 4)))
        const pos = geo.getAttribute('position')
        const depth = new Float32Array(pos.count)
        const lx = l.x - tile.centerX
        const lz = l.z - tile.centerZ
        // the disc lies in XY and is turned flat (−90° about X): local y → world −z
        for (let i = 0; i < pos.count; i++) depth[i] = l.level - heightAt(tile, lx + pos.getX(i), lz - pos.getY(i))
        geo.setAttribute('depth', new BufferAttribute(depth, 1))
        return { l, geo }
      }),
    [field, tile],
  )
  useEffect(() => () => lakes.forEach((k) => k.geo.dispose()), [lakes])
  const streams = useMemo(() => buildStreams(field, tile), [field, tile])
  const last = useMemo(() => ({ x: 0, z: 0, stir: 0, speed: 0, dx: 0, dz: 1 }), [])
  useEffect(
    () => () => {
      streams.dispose()
    },
    [streams],
  )
  useEffect(
    () => () => {
      still.dispose()
      running.dispose()
    },
    [still, running],
  )

  // the wake follows the player while they are in the water, stronger the faster they move
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const p = runStore.getState().playerPosition
    const level = field.water(p.x + tile.centerX, p.z + tile.centerZ)
    const ground = heightAt(tile, p.x, p.z)
    const inWater = level > ground + 0.05 && p.y - 1 < level
    const mx = p.x - last.x
    const mz = p.z - last.z
    const moved = dt > 0 ? Math.hypot(mx, mz) / dt : 0
    last.x = p.x
    last.z = p.z
    const k = Math.min(1, dt * 3)
    last.stir += ((inWater ? 1 : 0) - last.stir) * k
    last.speed += ((inWater ? Math.min(1, moved / 1.4) : 0) - last.speed) * k
    if (moved > 0.15) {
      // eased heading, so the V turns smoothly
      const l = Math.hypot(mx, mz)
      last.dx += (mx / l - last.dx) * k
      last.dz += (mz / l - last.dz) * k
      const n = Math.hypot(last.dx, last.dz) || 1
      wakeDir.value.set(last.dx / n, last.dz / n)
    }
    wakeStrength.value = last.stir
    wakeSpeed.value = last.speed
    if (inWater) wakeAt.value.set(p.x, level, p.z)
  })

  return (
    <>
      {lakes.map(({ l, geo }, i) => (
        <mesh
          key={i}
          geometry={geo}
          material={still}
          position={[l.x - tile.centerX, l.level, l.z - tile.centerZ]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        />
      ))}
      <mesh geometry={streams} material={running} receiveShadow />
    </>
  )
}
