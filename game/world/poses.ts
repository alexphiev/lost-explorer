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
  legZ: number[] // thigh rotation.z (legs spread sideways; only set by climbing IK)
  knee: number[]
  ankle: number[]
  armX: number[]
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
    legZ: [0, 0],
    knee: [0, 0],
    ankle: [0, 0],
    armX: [0, 0],
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
