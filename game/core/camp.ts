import { heightAt, slopeAt, type HeightField, type Terrain } from './terrain'
import type { Instance } from './placement'

/** Where a camp can go and how good a spot it is (redesign §5). Pure: tile-local coordinates. */
export interface CampSpot {
  ok: boolean
  /** why it can't go here (ok = false) */
  refusal?: string
  /** 0..1: how well you will sleep */
  quality: number
  fire: boolean
  /** what makes it good or bad, for the player */
  notes: string[]
}

export function campSpot(t: Terrain, field: HeightField, trees: Instance[][], rocks: Instance[], x: number, z: number): CampSpot {
  const wx = x + t.centerX
  const wz = z + t.centerZ
  const no = (refusal: string): CampSpot => ({ ok: false, refusal, quality: 0, fire: false, notes: [] })
  if (field.water(wx, wz) > -Infinity) return no('Not in the water.')
  if (field.scrub(wx, wz)) return no('Too many thorns here to pitch anything.')
  const slope = slopeAt(t, x, z)
  if (slope > 0.45) return no('Too steep to camp here.')

  let shelter = 0
  let wood = 0
  for (const set of trees) {
    for (const it of set) {
      const d = Math.hypot(it.x - x, it.z - z)
      if (d < 8) shelter++
      if (d < 25) wood++
    }
  }
  for (const r of rocks) if (r.scale > 1.6 && Math.hypot(r.x - x, r.z - z) < 6 + r.scale) shelter += 2

  // exposure: higher than the land around (a ridge, a summit) = wind all night
  const h = heightAt(t, x, z)
  let around = 0
  for (let a = 0; a < 8; a++) around += heightAt(t, x + Math.cos(a * 0.785) * 60, z + Math.sin(a * 0.785) * 60)
  const exposed = h - around / 8 > 6
  // damp: water close by, or soaked ground
  let damp = field.moisture(wx, wz) > 0.8
  for (let a = 0; a < 8 && !damp; a++) if (field.water(wx + Math.cos(a * 0.785) * 20, wz + Math.sin(a * 0.785) * 20) > -Infinity) damp = true

  const fire = wood >= 2
  const notes: string[] = []
  let q = 0.35
  if (shelter >= 2) {
    q += 0.25
    notes.push('sheltered')
  } else notes.push('in the open')
  if (fire) {
    q += 0.25
    notes.push('a fire')
  } else notes.push('no wood for a fire')
  if (exposed) {
    q -= 0.3
    notes.push('exposed to the wind')
  }
  if (damp) {
    q -= 0.2
    notes.push('damp ground')
  }
  if (slope > 0.25) {
    q -= 0.15
    notes.push('sloping')
  }
  if (h < 15 && damp) notes.push('mist will settle here')
  return { ok: true, quality: Math.min(1, Math.max(0, q)), fire, notes }
}

export function campVerdict(q: number): string {
  return q >= 0.75 ? 'A good spot' : q >= 0.5 ? 'A fair spot' : q >= 0.3 ? 'A poor spot' : 'A bad spot: a cold night ahead'
}
