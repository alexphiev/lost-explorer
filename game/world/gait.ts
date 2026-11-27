/**
 * Procedural gait maths (no three, no allocation). Character root frame: +z forward, +y up,
 * feet resting at y = -1.0. Leg joint angles follow three's rotation.x convention:
 * a positive angle swings the limb backward (toward -z).
 */

export const THIGH = 0.43 // hip → knee
export const SHIN = 0.42 // knee → sole
export const HIP_Y = -0.15 // hip height in the body group
const REACH = (THIGH + SHIN) * 0.985

/**
 * Speed factor from the grade along the direction of travel (1 on flat ground).
 * Gameplay curve, inspired by Tobler but kinder: uphill slows down to ~55 %, gentle and medium descents are
 * faster (up to +15 % at −25 %), and only very steep descents brake a little (never below 80 %).
 */
export function slopeSpeedFactor(grade: number): number {
  if (grade >= 0) return Math.max(0.55, 1 - 0.9 * grade)
  const down = -grade
  if (down <= 0.25) return 1 + 0.6 * down
  return Math.max(0.8, 1.15 - (down - 0.25) * 0.8)
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

export interface LimbAngles {
  x: number // root joint rotation (three's default Euler order XYZ)
  y: number
  z: number
  bend: number // middle joint (elbow / knee) rotation.x
  // root joint axes in the parent frame (columns of its rotation matrix); the bend turns about X
  xx: number
  xy: number
  xz: number
  yx: number
  yy: number
  yz: number
  zx: number
  zy: number
  zz: number
}

export function createLimbAngles(): LimbAngles {
  return { x: 0, y: 0, z: 0, bend: 0, xx: 1, xy: 0, xz: 0, yx: 0, yy: 1, yz: 0, zx: 0, zy: 0, zz: 1 }
}

/**
 * Two-bone IK in 3D for a limb hanging along −y from its root joint (upper bone `a`, lower bone `b`).
 * (tx, ty, tz) = end target relative to the root joint, in the root group's parent frame. The middle joint
 * (rotation.x only) points toward the pole (px, py, pz). Solves the full root rotation (x, y, z in three's
 * default XYZ order), so any reachable target is reached exactly; out of reach → limb straight at it.
 * `bendSign` −1 = elbow (lower bone folds toward the root's +z), +1 = knee (toward −z).
 */
export function solveLimb(
  tx: number,
  ty: number,
  tz: number,
  a: number,
  b: number,
  bendSign: number,
  px: number,
  py: number,
  pz: number,
  out: LimbAngles,
) {
  const len = Math.hypot(tx, ty, tz) || 1e-6
  const d = Math.min(Math.max(len, Math.abs(a - b) + 0.03), a + b - 0.002)
  const ux = tx / len
  const uy = ty / len
  const uz = tz / len
  // pole direction made perpendicular to the root → target line
  const pd = px * ux + py * uy + pz * uz
  let nx = px - pd * ux
  let ny = py - pd * uy
  let nz = pz - pd * uz
  let nl = Math.hypot(nx, ny, nz)
  if (nl < 1e-4) {
    // pole along the line: use u × ẑ (or u × x̂)
    if (Math.abs(uz) < 0.9) {
      nx = uy
      ny = -ux
      nz = 0
    } else {
      nx = 0
      ny = uz
      nz = -uy
    }
    nl = Math.hypot(nx, ny, nz) || 1
  }
  nx /= nl
  ny /= nl
  nz /= nl
  const cosA = Math.min(Math.max((a * a + d * d - b * b) / (2 * a * d), -1), 1)
  const sinA = Math.sqrt(1 - cosA * cosA)
  // upper bone w leans toward the pole; m ⟂ w in the bend plane, on the pole side
  const ms = bendSign < 0 ? -1 : 1
  const Zx = ms * (nx * cosA - ux * sinA)
  const Zy = ms * (ny * cosA - uy * sinA)
  const Zz = ms * (nz * cosA - uz * sinA)
  const Yx = -(ux * cosA + nx * sinA)
  const Yy = -(uy * cosA + ny * sinA)
  const Yz = -(uz * cosA + nz * sinA)
  const Xx = Yy * Zz - Yz * Zy // X = Y × Z
  const Xy = Yz * Zx - Yx * Zz
  const Xz = Yx * Zy - Yy * Zx
  const cosK = Math.min(Math.max((a * a + b * b - d * d) / (2 * a * b), -1), 1)
  out.bend = bendSign * (Math.PI - Math.acos(cosK))
  // Euler XYZ from the rotation matrix [X Y Z] (as three's Euler.setFromRotationMatrix)
  out.y = Math.asin(Math.min(Math.max(Zx, -1), 1))
  if (Math.abs(Zx) < 0.9999999) {
    out.x = Math.atan2(-Zy, Zz)
    out.z = Math.atan2(-Yx, Xx)
  } else {
    out.x = Math.atan2(Yz, Yy)
    out.z = 0
  }
  out.xx = Xx
  out.xy = Xy
  out.xz = Xz
  out.yx = Yx
  out.yy = Yy
  out.yz = Yz
  out.zx = Zx
  out.zy = Zy
  out.zz = Zz
}
