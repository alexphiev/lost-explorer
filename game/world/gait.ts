/**
 * Procedural gait maths (no three, no allocation). Character root frame: +z forward, +y up,
 * feet resting at y = -1.0. Leg joint angles follow three's rotation.x convention:
 * a positive angle swings the limb backward (toward -z).
 */

export const THIGH = 0.43 // hip → knee
export const SHIN = 0.42 // knee → sole
export const HIP_Y = -0.15 // hip height in the body group
const REACH = (THIGH + SHIN) * 0.985

/** Walking speed factor from the grade along the walking direction (Tobler's hiking function, 1 on flat ground). */
export function toblerFactor(grade: number): number {
  return Math.exp(-3.5 * Math.abs(grade + 0.05)) / Math.exp(-3.5 * 0.05)
}

/** Stride length (one full cycle, two steps) in metres for a speed in m/s, shorter uphill. */
export function strideLength(speed: number, uphill: number): number {
  return (0.8 + 0.3 * Math.min(speed, 5)) * (1 - 0.45 * Math.min(Math.max(uphill, 0), 1))
}

export interface FootTarget {
  z: number // forward offset from the hip, metres
  lift: number // height above the ground under that point
  stance: boolean
  swing: number // 0..1 progress of the swing (0 during stance)
}

/**
 * Foot position along the cycle. `phase` 0..1, `duty` = fraction of the cycle the foot is on the ground
 * (≈0.6 walking, ≈0.35 running). During stance the foot moves backward exactly as fast as the body moves
 * forward (planted, no sliding); during swing it arcs forward.
 */
export function footAlongCycle(phase: number, duty: number, stride: number, liftHeight: number, out: FootTarget) {
  const span = duty * stride
  if (phase < duty) {
    const s = phase / duty
    out.z = (0.5 - s) * span
    out.lift = 0
    out.stance = true
    out.swing = 0
  } else {
    const s = (phase - duty) / (1 - duty)
    out.z = -span / 2 + span * (1 - Math.cos(Math.PI * s)) * 0.5
    out.lift = liftHeight * Math.sin(Math.PI * s)
    out.stance = false
    out.swing = s
  }
}

/** Highest body offset (≤ 0) that lets a foot at (dy below the hip rest, dz ahead) still be reached. */
export function bodyDropFor(footY: number, footZ: number): number {
  const vertical = Math.sqrt(Math.max(REACH * REACH - footZ * footZ, 0.01))
  // hip.y = HIP_Y + bodyY must satisfy hip.y - footY <= vertical
  return footY + vertical - HIP_Y
}

export interface LegAngles {
  thigh: number
  knee: number
  ankle: number
}

/**
 * Two-bone IK in the leg's sagittal plane. Hip at (hipY, 0), sole target at (footY, footZ).
 * Knee bends forward, shin backward; `groundPitch` = rise/run of the ground under the foot (toe up when > 0).
 */
export function solveLeg(hipY: number, footY: number, footZ: number, groundPitch: number, toeLift: number, out: LegAngles) {
  const dy = footY - hipY
  const dz = footZ
  const d = Math.min(Math.max(Math.hypot(dy, dz), Math.abs(THIGH - SHIN) + 0.01), THIGH + SHIN - 0.001)
  // direction of the hip→foot line: leg pointing down = 0, foot behind (-z) = positive
  const lineAngle = Math.atan2(-dz, -dy)
  const cosHip = (THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d)
  const cosKnee = (THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN)
  const hipOffset = Math.acos(Math.min(Math.max(cosHip, -1), 1))
  const kneeInner = Math.acos(Math.min(Math.max(cosKnee, -1), 1))
  out.thigh = lineAngle - hipOffset
  out.knee = Math.PI - kneeInner
  // keep the sole parallel to the ground (positive rotation tips the toe down)
  out.ankle = -(out.thigh + out.knee) - Math.atan(groundPitch) - toeLift
}
