import type { MarkKind } from '@/game/core/travel'
import type { GoalKind } from '@/game/core/goals'

export type MarkerKind = MarkKind | GoalKind | 'peak' | 'lake' | 'start'

export const MARKER_NAME: Record<MarkerKind, string> = {
  start: 'Where you woke up',
  peak: 'Summit',
  lake: 'Lake',
  camp: 'Camp',
  view: 'Viewpoint',
  berries: 'Berries',
  smoke: 'Woodsmoke',
  cliff: 'Cliff',
  scrub: 'Scrub',
  water: 'Deep water',
  village: 'Village',
  clue: 'Clue',
  light: 'A light at night',
  cabin: 'Cabin',
  boat: 'Boat',
  cave: 'Cave',
  hut: 'Fishing hut',
}

const INK = '#3b2a1a'

/** Hand-drawn map symbols, centred on (x, y). */
export function drawMarker(ctx: CanvasRenderingContext2D, kind: MarkerKind, x: number, y: number, bearing?: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = INK
  ctx.fillStyle = INK
  ctx.lineWidth = 1.5
  switch (kind) {
    case 'peak':
      ctx.beginPath()
      ctx.moveTo(-6, 4)
      ctx.lineTo(0, -6)
      ctx.lineTo(6, 4)
      ctx.closePath()
      ctx.fillStyle = '#f4ecd8'
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-2.5, -2)
      ctx.lineTo(0, -6)
      ctx.lineTo(2.5, -2)
      ctx.fillStyle = INK
      ctx.fill()
      break
    case 'lake':
      ctx.strokeStyle = '#2f5d73'
      for (const dy of [-2, 2]) {
        ctx.beginPath()
        ctx.moveTo(-6, dy)
        ctx.quadraticCurveTo(-3, dy - 3, 0, dy)
        ctx.quadraticCurveTo(3, dy + 3, 6, dy)
        ctx.stroke()
      }
      break
    case 'camp':
      ctx.beginPath()
      ctx.moveTo(-7, 5)
      ctx.lineTo(0, -6)
      ctx.lineTo(7, 5)
      ctx.closePath()
      ctx.fillStyle = '#c9833f'
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, -1)
      ctx.lineTo(-2, 5)
      ctx.lineTo(2, 5)
      ctx.fillStyle = INK
      ctx.fill()
      break
    case 'view':
      ctx.beginPath()
      ctx.moveTo(-7, 0)
      ctx.quadraticCurveTo(0, -7, 7, 0)
      ctx.quadraticCurveTo(0, 7, -7, 0)
      ctx.fillStyle = '#f4ecd8'
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, 0, 2.3, 0, Math.PI * 2)
      ctx.fillStyle = INK
      ctx.fill()
      break
    case 'berries':
      ctx.fillStyle = '#a0233a'
      for (const [bx, by] of [[-2.5, 1.5], [2.5, 1.5], [0, -2.5]]) {
        ctx.beginPath()
        ctx.arc(bx, by, 2.6, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
      break
    case 'smoke':
      ctx.strokeStyle = '#6b6159'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, 8)
      ctx.bezierCurveTo(-5, 3, 5, -1, 0, -5)
      ctx.bezierCurveTo(-3, -8, 2, -11, 1, -14)
      ctx.stroke()
      break
    case 'cliff':
      ctx.strokeStyle = '#7a1f1f'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(-7, 2)
      for (let i = -5; i <= 7; i += 2) ctx.lineTo(i, i % 4 === 1 ? -4 : 2)
      ctx.stroke()
      break
    case 'scrub':
      ctx.strokeStyle = '#3e5228'
      ctx.lineWidth = 1.8
      for (const sx of [-4, 0, 4]) {
        ctx.beginPath()
        ctx.moveTo(sx, 5)
        ctx.lineTo(sx, -3)
        ctx.moveTo(sx - 2.5, -1)
        ctx.lineTo(sx, 1)
        ctx.lineTo(sx + 2.5, -1)
        ctx.stroke()
      }
      break
    case 'water':
      ctx.beginPath()
      ctx.arc(0, 0, 6, 0, Math.PI * 2)
      ctx.fillStyle = '#d7e6ea'
      ctx.fill()
      ctx.strokeStyle = '#2f5d73'
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-3.5, 0)
      ctx.quadraticCurveTo(-1.7, -2.5, 0, 0)
      ctx.quadraticCurveTo(1.7, 2.5, 3.5, 0)
      ctx.stroke()
      break
    case 'village':
      ctx.fillStyle = '#5a3a1e'
      ctx.fillRect(-7, -2, 14, 9)
      ctx.beginPath()
      ctx.moveTo(-9, -2)
      ctx.lineTo(0, -11)
      ctx.lineTo(9, -2)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#f2d27a'
      ctx.fillRect(-2, 1, 4, 6)
      break
    case 'clue': {
      // a red-ink circled clue, with an arrow where it points
      if (bearing !== undefined) {
        ctx.save()
        ctx.rotate((bearing * Math.PI) / 180)
        ctx.strokeStyle = '#9a3b1e'
        ctx.fillStyle = '#9a3b1e'
        ctx.lineWidth = 2
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        ctx.moveTo(0, -8)
        ctx.lineTo(0, -26)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.moveTo(0, -32)
        ctx.lineTo(4.5, -24)
        ctx.lineTo(-4.5, -24)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
      ctx.beginPath()
      ctx.arc(0, 0, 7, 0, Math.PI * 2)
      ctx.fillStyle = '#f6d9a8'
      ctx.fill()
      ctx.strokeStyle = '#9a3b1e'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = '#9a3b1e'
      ctx.font = 'bold 10px Georgia, serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('?', 0, 0.5)
      break
    }
    case 'light': {
      // a glowing point with rays
      ctx.fillStyle = 'rgba(255, 200, 80, 0.35)'
      ctx.beginPath()
      ctx.arc(0, 0, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffcf4a'
      ctx.beginPath()
      ctx.arc(0, 0, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#b07a12'
      ctx.lineWidth = 1.2
      ctx.stroke()
      break
    }
    case 'cabin':
      ctx.fillStyle = '#6b4220'
      ctx.fillRect(-6, -1, 12, 7)
      ctx.beginPath()
      ctx.moveTo(-8, -1)
      ctx.lineTo(0, -8)
      ctx.lineTo(8, -1)
      ctx.closePath()
      ctx.fillStyle = '#3e5228'
      ctx.fill()
      ctx.stroke()
      break
    case 'boat':
      ctx.beginPath()
      ctx.moveTo(-9, -1)
      ctx.lineTo(9, -1)
      ctx.lineTo(5, 5)
      ctx.lineTo(-5, 5)
      ctx.closePath()
      ctx.fillStyle = '#8a5a2b'
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-3, -1)
      ctx.lineTo(4, -8)
      ctx.stroke()
      break
    case 'cave':
      ctx.beginPath()
      ctx.moveTo(-9, 6)
      ctx.lineTo(-6, -4)
      ctx.lineTo(0, -8)
      ctx.lineTo(6, -4)
      ctx.lineTo(9, 6)
      ctx.closePath()
      ctx.fillStyle = '#8d877c'
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-4, 6)
      ctx.quadraticCurveTo(0, -6, 4, 6)
      ctx.closePath()
      ctx.fillStyle = '#1c140d'
      ctx.fill()
      break
    case 'hut':
      ctx.fillStyle = '#6b4220'
      ctx.fillRect(-6, -3, 9, 6)
      ctx.beginPath()
      ctx.moveTo(-7.5, -3)
      ctx.lineTo(-1.5, -9)
      ctx.lineTo(4.5, -3)
      ctx.closePath()
      ctx.fill()
      ctx.fillRect(-6, 3, 1.5, 4)
      ctx.fillRect(1.5, 3, 1.5, 4)
      ctx.fillRect(3, 1, 7, 1.8)
      break
    case 'start':
      ctx.strokeStyle = '#7a1f1f'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(-5, -5)
      ctx.lineTo(5, 5)
      ctx.moveTo(5, -5)
      ctx.lineTo(-5, 5)
      ctx.stroke()
      break
  }
  ctx.restore()
}
