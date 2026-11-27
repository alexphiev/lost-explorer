import { createNoise2D } from 'simplex-noise'
import { makeRng } from './rng'

/**
 * Streams and rivers. Water is routed over a coarse grid of the (pre-carving) terrain: pits are filled
 * (priority flood, every map edge is an outlet), each cell drains to its lowest neighbour, and the drained
 * area accumulates downstream. Cells draining enough area become streams, large ones rivers. Each reach is
 * smoothed, meanders a little, and gets a water level that never rises downstream; the height field then
 * carves a bed and banks around it.
 */

const GRID_HALF = 6600 // metres: covers the 12 km map with a margin
const CELL = 50
const N = Math.round((GRID_HALF * 2) / CELL)
const STREAM_ACC = 50 // cells (×2500 m²) drained → a stream (~0.12 km²)
const RIVER_ACC = 700 // → a river (~1.75 km²)
const BUCKET = 120
const FILL_MAX = 40 // metres: hollows shallower than this are spilled across, deeper ones hold a pond
const POND_SHORE = 30
/** metres of valley shaping beyond the water's edge */
const CARVE = 170
/** the drawn water ribbon reaches this far past the channel edge, tucked under the banks */
export const RIBBON_MARGIN = 2.5

export interface Reach {
  n: number
  x: Float32Array
  z: Float32Array
  /** water surface height (never rises downstream) */
  level: Float32Array
  /** half width of the channel, metres */
  halfW: Float32Array
  /** depth at the centre of the channel, metres */
  depth: Float32Array
  /** current, m/s */
  speed: Float32Array
  /** unit flow direction */
  dx: Float32Array
  dz: Float32Array
  /** widest point is a river (not a stream) */
  river: boolean
  /** 0 where the water would stand above the ground (it drops into a deeper valley there): no water drawn */
  wet: Uint8Array
}

/** A small round pond at the bottom of a hollow, where streams end. */
export interface Pond {
  x: number
  z: number
  radius: number
  level: number
}

export interface WaterSample {
  level: number
  /** channel depth at this point (bed below the surface) */
  depth: number
  /** current, m/s, world x/z */
  flowX: number
  flowZ: number
  river: boolean
}

export interface RiverNetwork {
  reaches: Reach[]
  /** lower `h` to the channel bed / banks near a stream */
  carve(x: number, z: number, h: number): number
  /** water at (x, z)? Fills `out` (no allocation). */
  sample(x: number, z: number, out: WaterSample, skipReach?: number): boolean
  /** reaches with a node within `radius` (square) of (x, z) */
  near(x: number, z: number, radius: number): Reach[]
  ponds: Pond[]
  /** pond surface at (x, z), or −Infinity */
  pond(x: number, z: number): number
}

export function createWaterSample(): WaterSample {
  return { level: -Infinity, depth: 0, flowX: 0, flowZ: 0, river: false }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Tiny binary min-heap of grid cells keyed by height. */
function makeHeap(cap: number) {
  const key = new Float64Array(cap)
  const val = new Int32Array(cap)
  let size = 0
  return {
    get size() {
      return size
    },
    push(k: number, v: number) {
      let i = size++
      while (i > 0) {
        const p = (i - 1) >> 1
        if (key[p] <= k) break
        key[i] = key[p]
        val[i] = val[p]
        i = p
      }
      key[i] = k
      val[i] = v
    },
    pop(): number {
      const top = val[0]
      const k = key[--size]
      const v = val[size]
      let i = 0
      for (;;) {
        let c = 2 * i + 1
        if (c >= size) break
        if (c + 1 < size && key[c + 1] < key[c]) c++
        if (key[c] >= k) break
        key[i] = key[c]
        val[i] = val[c]
        i = c
      }
      key[i] = k
      val[i] = v
      return top
    },
  }
}

/** Chaikin corner cutting, ends kept. */
function chaikin(x: number[], z: number[], a: number[]) {
  const ox = [x[0]]
  const oz = [z[0]]
  const oa = [a[0]]
  for (let i = 0; i < x.length - 1; i++) {
    for (const t of [0.25, 0.75]) {
      ox.push(x[i] + (x[i + 1] - x[i]) * t)
      oz.push(z[i] + (z[i + 1] - z[i]) * t)
      oa.push(a[i] + (a[i + 1] - a[i]) * t)
    }
  }
  ox.push(x[x.length - 1])
  oz.push(z[z.length - 1])
  oa.push(a[a.length - 1])
  return [ox, oz, oa]
}

/**
 * @param base terrain height before any water carving
 * @param lakeLevel lake surface at (x, z), −Infinity outside lakes: streams pass through lakes at their level
 */
export function createRivers(seed: string, base: (x: number, z: number) => number, lakeLevel: (x: number, z: number) => number): RiverNetwork {
  const M = N * N
  const cx = (i: number) => -GRID_HALF + (i + 0.5) * CELL
  const hgt = new Float32Array(M)
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) hgt[iz * N + ix] = base(cx(ix), cx(iz))

  // ---- priority flood: how deep each pit is (every map edge is an outlet) ----
  const filled = new Float32Array(M)
  const done = new Uint8Array(M)
  const heap = makeHeap(M)
  for (let i = 0; i < N; i++) {
    for (const c of [i, (N - 1) * N + i, i * N, i * N + N - 1]) {
      if (done[c]) continue
      done[c] = 1
      filled[c] = hgt[c]
      heap.push(hgt[c], c)
    }
  }
  while (heap.size) {
    const c = heap.pop()
    const ix = c % N
    const iz = (c - ix) / N
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const jx = ix + dx
        const jz = iz + dz
        if ((!dx && !dz) || jx < 0 || jz < 0 || jx >= N || jz >= N) continue
        const j = jz * N + jx
        if (done[j]) continue
        done[j] = 1
        filled[j] = Math.max(hgt[j], filled[c] + 1e-3)
        heap.push(filled[j], j)
      }
    }
  }
  // Routing surface: shallow pits are filled (water spills across them), deep ones stay: their streams end
  // in a pond at the bottom. Each cell drains to its lowest neighbour on that surface.
  const S = new Float32Array(M)
  for (let c = 0; c < M; c++) S[c] = filled[c] - hgt[c] <= FILL_MAX ? filled[c] : hgt[c]
  const recv = new Int32Array(M).fill(-1)
  for (let iz = 1; iz < N - 1; iz++) {
    for (let ix = 1; ix < N - 1; ix++) {
      const c = iz * N + ix
      let lo = S[c]
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const j = c + dz * N + dx
          if (S[j] < lo) {
            lo = S[j]
            recv[c] = j
          }
        }
      }
    }
  }
  // drained area (in cells), upstream (high) first
  const order = Int32Array.from({ length: M }, (_, i) => i).sort((a, b) => S[b] - S[a])
  const acc = new Float32Array(M).fill(1)
  for (let k = 0; k < M; k++) {
    const c = order[k]
    if (recv[c] >= 0) acc[recv[c]] += acc[c]
  }

  // ---- ponds where streams end in a hollow ----
  const ponds: Pond[] = []
  for (let iz = 1; iz < N - 1; iz++) {
    for (let ix = 1; ix < N - 1; ix++) {
      const c = iz * N + ix
      if (recv[c] >= 0 || acc[c] < STREAM_ACC) continue
      const x = cx(ix)
      const z = cx(iz)
      const radius = Math.min(45, 10 + 4 * Math.sqrt(acc[c] / STREAM_ACC))
      if (Math.hypot(x, z) < radius + 150 || lakeLevel(x, z) > -Infinity) continue
      if (ponds.some((p) => Math.hypot(p.x - x, p.z - z) < p.radius + radius + 20)) continue
      // level under the whole rim, so the water never stands above the ground at its edge
      let level = hgt[c] + 1.2
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2
        level = Math.min(level, base(x + Math.cos(a) * radius, z + Math.sin(a) * radius))
      }
      ponds.push({ x, z, radius, level: level - 0.3 })
    }
  }
  const pondBuckets = new Map<number, Pond[]>()
  const pkey = (x: number, z: number) => (Math.floor(x / 200) + 2000) * 4096 + (Math.floor(z / 200) + 2000)
  for (const p of ponds) {
    const pad = p.radius + POND_SHORE
    for (let bz = Math.floor((p.z - pad) / 200); bz <= Math.floor((p.z + pad) / 200); bz++) {
      for (let bx = Math.floor((p.x - pad) / 200); bx <= Math.floor((p.x + pad) / 200); bx++) {
        const k = (bx + 2000) * 4096 + (bz + 2000)
        let l = pondBuckets.get(k)
        if (!l) pondBuckets.set(k, (l = []))
        l.push(p)
      }
    }
  }
  const pondShape = (x: number, z: number, h: number) => {
    const list = pondBuckets.get(pkey(x, z))
    if (!list) return h
    for (const p of list) {
      const dist = Math.hypot(x - p.x, z - p.z)
      if (dist > p.radius + POND_SHORE) continue
      const d = dist / p.radius
      const depth = Math.min(4, 1.2 + p.radius / 15)
      h = Math.min(h, d < 1 ? p.level - depth * (1 - d * d) + 0.3 * d : p.level + (dist - p.radius) * 0.35)
    }
    return h
  }
  const pond = (x: number, z: number) => {
    const list = pondBuckets.get(pkey(x, z))
    if (list) for (const p of list) if ((x - p.x) ** 2 + (z - p.z) ** 2 < p.radius * p.radius) return p.level
    return -Infinity
  }

  // ---- trace reaches: from each source down to the outlet or to a reach already traced ----
  const isCh = (c: number) => acc[c] >= STREAM_ACC
  const donors = new Uint8Array(M)
  for (let c = 0; c < M; c++) if (isCh(c) && recv[c] >= 0) donors[recv[c]]++
  const sources: number[] = []
  for (let c = 0; c < M; c++) if (isCh(c) && donors[c] === 0) sources.push(c)
  sources.sort((a, b) => hgt[b] - hgt[a]) // high sources first: long main stems
  const reachOf = new Int32Array(M).fill(-1)
  const noise = createNoise2D(makeRng(seed, 'rivers'))
  const reaches: Reach[] = []

  // ---- spatial hash: every segment in each bucket it can carve ----
  const buckets = new Map<number, number[]>()
  const bkey = (bx: number, bz: number) => (bx + 2000) * 4096 + (bz + 2000)
  // per segment: its reach, node, and the box it can carve (cheap rejection)
  const segR: number[] = []
  const segI: number[] = []
  const box0x: number[] = []
  const box1x: number[] = []
  const box0z: number[] = []
  const box1z: number[] = []
  const index = (ri: number) => {
    const r = reaches[ri]
    for (let i = 0; i < r.n - 1; i++) {
      const pad = Math.max(r.halfW[i], r.halfW[i + 1]) + CARVE
      const gid = segR.length
      segR.push(ri)
      segI.push(i)
      box0x.push(Math.min(r.x[i], r.x[i + 1]) - pad)
      box1x.push(Math.max(r.x[i], r.x[i + 1]) + pad)
      box0z.push(Math.min(r.z[i], r.z[i + 1]) - pad)
      box1z.push(Math.max(r.z[i], r.z[i + 1]) + pad)
      const bx0 = Math.floor(box0x[gid] / BUCKET)
      const bx1 = Math.floor(box1x[gid] / BUCKET)
      const bz0 = Math.floor(box0z[gid] / BUCKET)
      const bz1 = Math.floor(box1z[gid] / BUCKET)
      for (let bz = bz0; bz <= bz1; bz++) {
        for (let bx = bx0; bx <= bx1; bx++) {
          const k = bkey(bx, bz)
          let list = buckets.get(k)
          if (!list) buckets.set(k, (list = []))
          list.push(gid)
        }
      }
    }
  }

  // nearest-segment scratch (no allocation per query)
  let qT = 0
  let qU = 0 // unclamped
  let qD = 0
  const seg = (r: Reach, i: number, x: number, z: number) => {
    const ax = r.x[i]
    const az = r.z[i]
    const sx = r.x[i + 1] - ax
    const sz = r.z[i + 1] - az
    qU = ((x - ax) * sx + (z - az) * sz) / (sx * sx + sz * sz || 1)
    qT = clamp01(qU)
    qD = Math.hypot(x - ax - sx * qT, z - az - sz * qT)
  }

  const carve = (x: number, z: number, h0: number, skip = -1) => {
    const h = pondShape(x, z, h0)
    const list = buckets.get(bkey(Math.floor(x / BUCKET), Math.floor(z / BUCKET)))
    if (!list) return h
    let out = h
    for (let k = 0; k < list.length; k++) {
      const gid = list[k]
      if (x < box0x[gid] || x > box1x[gid] || z < box0z[gid] || z > box1z[gid]) continue
      const ri = segR[gid]
      if (ri === skip) continue
      const r = reaches[ri]
      const i = segI[gid]
      seg(r, i, x, z)
      const hw = r.halfW[i] + (r.halfW[i + 1] - r.halfW[i]) * qT
      const e = qD - hw
      if (e > CARVE) continue
      // upstream of the segment the water would be higher: extend its slope there, so the valley of a
      // steep stretch never undercuts the water just above it
      let lv: number
      if (qU >= 0) lv = r.level[i] + (r.level[i + 1] - r.level[i]) * qT
      else {
        // alongside the water further upstream (nodes are ~evenly spaced): take its level there
        const ku = i + qU
        if (ku <= 0) lv = r.level[0] + (r.level[0] - r.level[1]) * -ku
        else {
          const k0 = Math.floor(ku)
          lv = r.level[k0] + (r.level[k0 + 1] - r.level[k0]) * (ku - k0)
        }
      }
      let p: number
      if (e < 0) {
        const dep = r.depth[i] + (r.depth[i + 1] - r.depth[i]) * qT
        const u = qD / hw
        p = lv - dep * (1 - u * u)
      } else {
        // a low bank, then the wide V of the stream's own little valley (where it cut through a rise)
        p = lv + Math.min(e, 3) * 0.25 + e * 0.1 + e * e * 0.0016
      }
      if (p < out) out = p
    }
    return out
  }

  // ground as carved by every other reach (a neighbour's valley may have cut below this one)
  const groundAt = (x: number, z: number, self: number) => {
    const l = Math.max(lakeLevel(x, z), pond(x, z))
    const h = carve(x, z, base(x, z), self)
    return l > -Infinity ? Math.min(h, l) : h
  }
  const joins: { into: number; seg: number; t: number }[] = []
  const lengths: Float32Array[] = []
  // water level: below the ground at the centre and at both ribbon edges (side slopes), never rising downstream
  const setLevels = (ri: number) => {
    const r = reaches[ri]
    for (let i = 0; i < r.n; i++) {
      const w = r.halfW[i] + RIBBON_MARGIN
      const x = r.x[i]
      const z = r.z[i]
      const gnd = Math.min(groundAt(x, z, ri), groundAt(x - r.dz[i] * w, z + r.dx[i] * w, ri), groundAt(x + r.dz[i] * w, z - r.dx[i] * w, ri))
      const lv = gnd - (r.halfW[i] >= 8 ? 0.9 : 0.35)
      r.level[i] = i === 0 ? lv : Math.min(r.level[i - 1], lv)
    }
    const j = joins[ri]
    if (j.into >= 0) {
      const q = reaches[j.into]
      const jl = q.level[j.seg] + (q.level[j.seg + 1] - q.level[j.seg]) * j.t
      if (jl < r.level[r.n - 1]) r.level[r.n - 1] = jl
    }
  }

  for (const src of sources) {
    const cells: number[] = []
    let c = src
    let into = -1 // reach this one flows into
    for (;;) {
      cells.push(c)
      reachOf[c] = reaches.length
      const next = recv[c]
      if (next < 0) break
      if (reachOf[next] >= 0) {
        into = reachOf[next]
        cells.push(next)
        break
      }
      c = next
    }
    if (cells.length < 4) {
      // a few metres of trickle: not worth a reach (give its cells back)
      for (let k = 0; k < cells.length - (into >= 0 ? 1 : 0); k++) reachOf[cells[k]] = -1
      continue
    }
    let px = cells.map((k) => cx(k % N))
    let pz = cells.map((k) => cx(Math.floor(k / N)))
    let pa = cells.map((k) => acc[k])
    ;[px, pz, pa] = chaikin(px, pz, pa)
    ;[px, pz, pa] = chaikin(px, pz, pa)
    const n = px.length

    // meanders: a gentle sideways wander, none at the ends
    const len = new Float32Array(n)
    for (let i = 1; i < n; i++) len[i] = len[i - 1] + Math.hypot(px[i] - px[i - 1], pz[i] - pz[i - 1])
    const total = len[n - 1]
    const mx = px.slice()
    const mz = pz.slice()
    const id = reaches.length * 7.31
    for (let i = 1; i < n - 1; i++) {
      const tx = px[i + 1] - px[i - 1]
      const tz = pz[i + 1] - pz[i - 1]
      const tl = Math.hypot(tx, tz) || 1
      const amp = pa[i] >= RIVER_ACC ? 16 : 7
      const taper = Math.min(1, len[i] / 60, (total - len[i]) / 60)
      const o = amp * taper * noise(len[i] / 160, id)
      mx[i] = px[i] - (tz / tl) * o
      mz[i] = pz[i] + (tx / tl) * o
    }

    // join the receiving reach exactly (it has been smoothed since)
    const join = { into, seg: 0, t: 0 }
    if (into >= 0) {
      const r = reaches[into]
      const x = mx[n - 1]
      const z = mz[n - 1]
      let best = Infinity
      for (let i = 0; i < r.n - 1; i++) {
        const sx = r.x[i + 1] - r.x[i]
        const sz = r.z[i + 1] - r.z[i]
        const t = clamp01(((x - r.x[i]) * sx + (z - r.z[i]) * sz) / (sx * sx + sz * sz || 1))
        const qx = r.x[i] + sx * t
        const qz = r.z[i] + sz * t
        const d = (x - qx) ** 2 + (z - qz) ** 2
        if (d < best) {
          best = d
          mx[n - 1] = qx
          mz[n - 1] = qz
          join.seg = i
          join.t = t
        }
      }
    }

    const reach: Reach = {
      n,
      x: Float32Array.from(mx),
      z: Float32Array.from(mz),
      level: new Float32Array(n),
      halfW: new Float32Array(n),
      depth: new Float32Array(n),
      speed: new Float32Array(n),
      dx: new Float32Array(n),
      dz: new Float32Array(n),
      river: false,
      wet: new Uint8Array(n).fill(1),
    }
    for (let i = 0; i < n; i++) {
      const a = pa[i]
      const big = a >= RIVER_ACC
      const f = clamp01((a - STREAM_ACC) / (RIVER_ACC - STREAM_ACC))
      const g = clamp01(Math.log(a / RIVER_ACC) / Math.log(12))
      // streams 6–9 m wide (the 3D mesh is 3.9 m: narrower would show as dashes), rivers 16–40 m
      reach.halfW[i] = big ? 8 + 12 * g : 3 + 1.5 * f
      // most streams can be waded, the biggest ones must be swum; rivers always
      reach.depth[i] = big ? 1.9 + 1.3 * g : 0.3 + 1.4 * f ** 1.5
      if (big) reach.river = true
      const i0 = Math.max(0, i - 1)
      const i1 = Math.min(n - 1, i + 1)
      const tx = reach.x[i1] - reach.x[i0]
      const tz = reach.z[i1] - reach.z[i0]
      const tl = Math.hypot(tx, tz) || 1
      reach.dx[i] = tx / tl
      reach.dz[i] = tz / tl
    }
    joins.push(join)
    lengths.push(len)
    reaches.push(reach)
    setLevels(reaches.length - 1)
    index(reaches.length - 1)
  }
  // relax: every reach again, now that all the valleys around it are known (levels only go down)
  for (let pass = 0; pass < 1; pass++) for (let ri = 0; ri < reaches.length; ri++) setLevels(ri)

  // current: from the drop of the water surface, smoothed along the reach
  reaches.forEach((reach, ri) => {
    const n = reach.n
    const len = lengths[ri]
    const raw = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 2)
      const i1 = Math.min(n - 1, i + 2)
      const run = Math.max(1, len[i1] - len[i0])
      const slope = (reach.level[i0] - reach.level[i1]) / run
      raw[i] = reach.halfW[i] >= 8 ? Math.min(2.2, 0.5 + slope * 30) : Math.min(1.5, 0.25 + slope * 12)
    }
    for (let i = 0; i < n; i++) {
      let s = 0
      let k = 0
      for (let j = Math.max(0, i - 4); j <= Math.min(n - 1, i + 4); j++, k++) s += raw[j]
      reach.speed[i] = s / k
    }
  })

  const sample = (x: number, z: number, out: WaterSample, skip = -1) => {
    const list = buckets.get(bkey(Math.floor(x / BUCKET), Math.floor(z / BUCKET)))
    if (!list) return false
    let best = Infinity
    for (let k = 0; k < list.length; k++) {
      const gid = list[k]
      if (x < box0x[gid] || x > box1x[gid] || z < box0z[gid] || z > box1z[gid]) continue
      const ri = segR[gid]
      const r = reaches[ri]
      const i = segI[gid]
      if (ri === skip || !r.wet[i] || !r.wet[i + 1]) continue
      seg(r, i, x, z)
      const hw = r.halfW[i] + (r.halfW[i + 1] - r.halfW[i]) * qT
      if (qD > hw + RIBBON_MARGIN || qD - hw >= best) continue
      best = qD - hw
      const t = qT
      out.level = r.level[i] + (r.level[i + 1] - r.level[i]) * t
      out.depth = r.depth[i] + (r.depth[i + 1] - r.depth[i]) * t
      const sp = r.speed[i] + (r.speed[i + 1] - r.speed[i]) * t
      // slower near the banks
      const edge = clamp01(1 - (qD / hw) ** 2) * 0.7 + 0.3
      out.flowX = r.dx[i] * sp * edge
      out.flowZ = r.dz[i] * sp * edge
      out.river = hw >= 8
    }
    return best < Infinity
  }

  // ---- where another valley cut below a stream, its water would float: dry there ----
  const other = createWaterSample()
  const dry: number[] = []
  reaches.forEach((r, ri) => {
    for (let i = 0; i < r.n; i++) {
      const w = r.halfW[i] + RIBBON_MARGIN
      const lv = r.level[i]
      for (const [ox, oz, tol] of [[0, 0, r.depth[i] + 0.4], [-r.dz[i] * w, r.dx[i] * w, 0.25], [r.dz[i] * w, -r.dx[i] * w, 0.25]]) {
        const x = r.x[i] + ox
        const z = r.z[i] + oz
        if (carve(x, z, base(x, z)) >= lv - tol || Math.max(lakeLevel(x, z), pond(x, z)) > lv - 0.5) continue
        if (sample(x, z, other, ri) && other.level >= lv - 0.6) continue
        dry.push(ri * 65536 + i)
        break
      }
    }
  })
  for (const code of dry) reaches[Math.floor(code / 65536)].wet[code % 65536] = 0

  const near = (x: number, z: number, radius: number) =>
    reaches.filter((r) => {
      for (let i = 0; i < r.n; i++) if (Math.abs(r.x[i] - x) < radius && Math.abs(r.z[i] - z) < radius) return true
      return false
    })

  return { reaches, carve, sample, near, ponds, pond }
}
