/**
 * Target poses for the explorer (pure numbers, no allocation). Index 0 = left limb, 1 = right limb.
 * Angles follow three's rotation.x convention on the limb groups: positive swings the limb backward (−z),
 * negative brings it forward/up (an arm at −π points straight up). The body group pitches forward with +bodyPitch.
 */
export interface Pose {
  bodyY: number
  bodyPitch: number
  bodyRoll: number
  bodyYaw: number
  lean: number // torso pitch on top of the body
  torsoYaw: number
  thigh: number[]
  legY: number[] // thigh rotation.y / .z and arm rotation.y: only set by the climbing IK (reset every frame)
  legZ: number[]
  knee: number[]
  ankle: number[]
  armX: number[]
  armY: number[]
  armZ: number[]
  fore: number[]
}

export function createPose(): Pose {
  return {
    bodyY: 0,
    bodyPitch: 0,
    bodyRoll: 0,
    bodyYaw: 0,
    lean: 0,
    torsoYaw: 0,
    thigh: [0, 0],
    legY: [0, 0],
    legZ: [0, 0],
    knee: [0, 0],
    ankle: [0, 0],
    armX: [0, 0],
    armY: [0, 0],
    armZ: [0.06, -0.06],
    fore: [-0.2, -0.2],
  }
}

const TAU = Math.PI * 2

/**
 * Climbing: body only (hands and feet are planted on the surface by IK in Player).
 * `pitch` = forward tilt that keeps the body parallel to the surface (0 on a vertical wall / trunk),
 * `sway` −1..1 = which diagonal pair is reaching (+1 = left hand + right foot), 0 when all four are planted.
 */
export function climbPose(pitch: number, sway: number, out: Pose) {
  out.bodyPitch = pitch
  out.bodyY = 0
  out.bodyRoll = -sway * 0.06 // lean away from the reaching hand onto the supporting one
  out.bodyYaw = 0
  out.lean = 0.05
  out.torsoYaw = sway * 0.1
}

/** Scrambling on a steep walkable slope (25–40°): crouched, hands brushing the slope ahead. */
export function scrambleArms(phase: number, amount: number, out: Pose) {
  const a = phase * TAU
  for (let i = 0; i < 2; i++) {
    const s = Math.sin(a + (1 - i) * Math.PI)
    out.armX[i] = out.armX[i] * (1 - amount) + (-0.9 - 0.35 * s) * amount
    out.fore[i] = out.fore[i] * (1 - amount) + -0.25 * amount
  }
  out.lean += 0.45 * amount
}

/** Pulling up over the top edge: t 0 → 1. */
export function mantlePose(t: number, out: Pose) {
  const push = Math.min(1, t * 1.6)
  for (let i = 0; i < 2; i++) {
    out.armX[i] = -2.4 + 2.5 * push // from overhead to pushing down beside the hips
    out.armZ[i] = (i === 0 ? 1 : -1) * 0.2
    out.fore[i] = -1.1 + 1.0 * push
  }
  out.thigh[0] = -1.4 + 1.2 * t // one knee onto the edge, then stand
  out.knee[0] = 1.8 - 1.6 * t
  out.thigh[1] = 0.3 - 0.3 * t
  out.knee[1] = 0.6 - 0.5 * t
  out.ankle[0] = 0
  out.ankle[1] = 0
  out.bodyPitch = 0.6 * (1 - t)
  out.bodyY = -0.25 * (1 - t)
  out.bodyRoll = 0
  out.bodyYaw = 0
  out.lean = 0.3 * (1 - t)
  out.torsoYaw = 0
}

/**
 * Swimming. `crawl` 0 = treading water (upright, sculling arms, cycling legs), 1 = front crawl
 * (body horizontal, alternating overarm strokes, flutter kick). `phase` advances with distance (or time when still).
 */
export function swimPose(phase: number, crawl: number, time: number, out: Pose) {
  const a = phase * TAU
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1
    // crawl: a full overarm circle (−π overhead → 0 down → +π behind), half a cycle apart
    const stroke = -Math.PI + (((phase + i * 0.5) % 1) * TAU)
    const scull = Math.sin(time * 3 + i * Math.PI)
    out.armX[i] = crawl * stroke + (1 - crawl) * (-0.35 + 0.2 * scull)
    out.armZ[i] = side * (crawl * 0.15 + (1 - crawl) * (0.75 + 0.25 * scull))
    out.fore[i] = -(crawl * 0.35 + (1 - crawl) * 0.6)
    const kick = Math.sin(time * 9 + i * Math.PI)
    const cycle = Math.sin(time * 2.2 + i * Math.PI)
    out.thigh[i] = crawl * (0.25 * kick) + (1 - crawl) * (-0.4 + 0.45 * cycle)
    out.knee[i] = crawl * (0.15 + 0.15 * Math.max(0, kick)) + (1 - crawl) * (0.9 + 0.5 * cycle)
    out.ankle[i] = 0.9 * crawl + 0.3 // toes pointed
  }
  out.bodyPitch = 1.2 * crawl + 0.12 * (1 - crawl) // horizontal when crawling
  out.bodyY = 0
  out.bodyRoll = Math.sin(a) * 0.35 * crawl // body roll with each stroke
  out.bodyYaw = 0
  out.lean = -0.2 * crawl // head up to breathe
  out.torsoYaw = 0
}

// Fall keyframes: [t, bodyY, bodyPitch, bodyRoll, lean, thighL, thighR, kneeL, kneeR, armX, fore]
// (bodyPitch tips the whole body forward around the hips-ish root; limbs are relative to the body)
const TRIP = [
  [0, 0, 0.15, 0, 0.2, -0.6, 0.3, 0.6, 0.5, -0.4, -0.5], // mid-stride
  [0.14, -0.15, 0.75, 0.05, 0.3, -0.9, 0.45, 0.8, 1.0, -1.7, -0.15], // pitching forward, arms out to catch
  [0.3, -0.5, 1.15, 0.08, 0.15, -1.15, -1.0, 1.6, 1.55, -1.25, -0.1], // on hands and knees
  [0.45, -0.82, 1.45, 0.1, 0.05, -0.15, 0.05, 0.35, 0.6, -1.6, -1.1], // lying flat
  [0.62, -0.82, 1.45, 0.06, 0.05, -0.15, 0.05, 0.4, 0.6, -1.6, -1.0], // lying a moment
  [0.8, -0.5, 1.1, 0, 0.1, -1.15, -1.0, 1.6, 1.55, -1.2, -0.1], // pushed back up onto hands and knees
  [0.9, -0.3, 0.45, 0, 0.2, -1.3, 0.1, 1.4, 1.0, -0.4, -0.3], // one foot planted, rising
  [1, 0, 0, 0, 0.05, 0, 0, 0.05, 0.05, 0, -0.2], // standing
]
const CRUMPLE = [
  [0, 0, 0, 0, 0.1, -0.3, -0.3, 0.4, 0.4, -0.5, -0.3], // feet hit the ground
  [0.1, -0.5, 0.35, 0, 0.4, -1.6, -1.5, 2.2, 2.2, -0.9, -0.4], // legs buckle into a deep squat
  [0.28, -0.72, 0.6, 0.38, 0.3, -1.2, -0.6, 2.0, 1.4, -1.0, -0.2], // collapse onto the knees and a hip
  [0.7, -0.72, 0.55, 0.32, 0.25, -1.2, -0.6, 2.0, 1.4, -0.95, -0.25], // stay down, winded
  [0.86, -0.4, 0.3, 0.05, 0.2, -1.4, 0.2, 1.4, 1.6, -0.6, -0.3], // one knee up
  [1, 0, 0, 0, 0.05, 0, 0, 0.05, 0.05, 0, -0.2], // standing
]

const mix = (a: number[], b: number[], w: number, k: number) => a[k] + (b[k] - a[k]) * w

/** A fall: `kind` 0 = trip forward (hands and knees, lie flat, get up), 1 = crumple on a hard landing. t 0 → 1. */
export function fallPose(t: number, kind: number, out: Pose) {
  const keys = kind === 0 ? TRIP : CRUMPLE
  let i = 0
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++
  const a = keys[i]
  const b = keys[i + 1]
  const u = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0] || 1)))
  const w = u * u * (3 - 2 * u)
  out.bodyY = mix(a, b, w, 1)
  out.bodyPitch = mix(a, b, w, 2)
  out.bodyRoll = mix(a, b, w, 3)
  out.bodyYaw = 0
  out.lean = mix(a, b, w, 4)
  out.torsoYaw = 0
  out.thigh[0] = mix(a, b, w, 5)
  out.thigh[1] = mix(a, b, w, 6)
  out.knee[0] = mix(a, b, w, 7)
  out.knee[1] = mix(a, b, w, 8)
  out.ankle[0] = 0.1
  out.ankle[1] = 0.1
  out.armX[0] = mix(a, b, w, 9)
  out.armX[1] = mix(a, b, w, 9) + 0.05
  out.armZ[0] = 0.25
  out.armZ[1] = -0.25
  out.fore[0] = mix(a, b, w, 10)
  out.fore[1] = mix(a, b, w, 10)
}
