/**
 * Procedural sounds for the 3D scene (Web Audio, no files): footsteps by ground, splashes and strokes,
 * running water, wind and birds. One engine per scene; everything goes through a master gain (mute).
 */
export type Surface = 'grass' | 'rock' | 'water'

export interface SoundEngine {
  ctx: AudioContext
  step: (surface: Surface, loud: number) => void
  stroke: (loud: number) => void
  /** ambient levels 0..1, eased */
  setAmbient: (water: number, rushing: number, wind: number) => void
  chirp: (pan: number, loud: number) => void
  setMuted: (m: boolean) => void
  close: () => void
}

export function createSoundEngine(muted: boolean): SoundEngine {
  const ctx = new AudioContext()
  const master = ctx.createGain()
  master.gain.value = muted ? 0 : 0.9
  master.connect(ctx.destination)

  // 2 s of white noise, shared by every noisy sound
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

  const loop = (type: BiquadFilterType, freq: number, q: number) => {
    const src = ctx.createBufferSource()
    src.buffer = noise
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.value = 0
    src.connect(f).connect(g).connect(master)
    src.start()
    return { f, g }
  }
  // babbling stream (bright), river rush (low), wind (moving band)
  const babble = loop('bandpass', 1700, 0.6)
  const rush = loop('lowpass', 500, 0.5)
  const wind = loop('bandpass', 380, 0.8)

  const burst = (when: number, dur: number, type: BiquadFilterType, freq: number, q: number, gain: number, pan = 0) => {
    const src = ctx.createBufferSource()
    src.buffer = noise
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, when)
    g.gain.linearRampToValueAtTime(gain, when + Math.min(0.012, dur * 0.2))
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
    const p = ctx.createStereoPanner()
    p.pan.value = pan
    src.connect(f).connect(g).connect(p).connect(master)
    src.start(when, Math.random() * 1.8, dur + 0.05)
  }
  const thump = (when: number, freq: number, gain: number) => {
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(freq, when)
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, when + 0.08)
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, when)
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.1)
    o.connect(g).connect(master)
    o.start(when)
    o.stop(when + 0.12)
  }

  return {
    ctx,
    step(surface, loud) {
      const t = ctx.currentTime
      const v = 0.25 + 0.75 * loud
      const jitter = 0.85 + Math.random() * 0.3
      if (surface === 'water') {
        burst(t, 0.28, 'bandpass', 800 * jitter, 0.7, 0.5 * v)
        burst(t + 0.03, 0.18, 'highpass', 3000, 0.5, 0.12 * v)
      } else if (surface === 'rock') {
        burst(t, 0.07, 'bandpass', 2200 * jitter, 2.5, 0.35 * v)
        thump(t, 110 * jitter, 0.25 * v)
      } else {
        // grass and earth: a soft crunch
        burst(t, 0.13, 'bandpass', 1300 * jitter, 0.9, 0.3 * v)
        burst(t + 0.02, 0.09, 'highpass', 4500, 0.6, 0.06 * v)
        thump(t, 75 * jitter, 0.12 * v)
      }
    },
    stroke(loud) {
      const t = ctx.currentTime
      burst(t, 0.45, 'bandpass', 650 + Math.random() * 300, 0.6, 0.35 + 0.35 * loud, (Math.random() - 0.5) * 0.4)
      burst(t + 0.08, 0.3, 'highpass', 2500, 0.5, 0.08 + 0.1 * loud)
    },
    setAmbient(water, rushing, w) {
      const t = ctx.currentTime
      // kept low: noise beds tire the ear fast (playtest: −75 %)
      babble.g.gain.setTargetAtTime(water * 0.08, t, 0.4)
      rush.g.gain.setTargetAtTime(rushing * 0.12, t, 0.5)
      wind.g.gain.setTargetAtTime(w * 0.055, t, 1.2)
      // gusts: the band wanders
      wind.f.frequency.setTargetAtTime(260 + Math.random() * 380 * (0.4 + w), t, 1.5)
      babble.f.frequency.setTargetAtTime(1500 + Math.random() * 500, t, 0.3)
    },
    chirp(pan, loud) {
      // a little bird: 2–5 quick rising whistles
      const n = 2 + Math.floor(Math.random() * 4)
      const base = 2600 + Math.random() * 1600
      const p = ctx.createStereoPanner()
      p.pan.value = pan
      p.connect(master)
      for (let i = 0; i < n; i++) {
        const t = ctx.currentTime + i * (0.09 + Math.random() * 0.05)
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.setValueAtTime(base, t)
        o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.4), t + 0.06)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(0.06 * loud, t + 0.01)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
        o.connect(g).connect(p)
        o.start(t)
        o.stop(t + 0.08)
      }
    },
    setMuted(m) {
      master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05)
    },
    close() {
      void ctx.close()
    },
  }
}
