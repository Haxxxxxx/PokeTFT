"use client";

import { useAppStore } from "@/game/store/appStore";

// ── Pokémon cry (PokeAPI CDN) ────────────────────────────────────────────────

/** Returns the cry URL for a national dex number. */
function cryUrl(dexId: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${dexId}.ogg`;
}

const cryCache = new Map<number, HTMLAudioElement>();

export function playCry(dexId: number, volume = 0.35): void {
  if (!soundEnabled()) return;
  try {
    let el = cryCache.get(dexId);
    if (!el) {
      el = new Audio(cryUrl(dexId));
      el.preload = "none";
      cryCache.set(dexId, el);
    }
    const clone = el.cloneNode() as HTMLAudioElement;
    clone.volume = Math.max(0, Math.min(1, volume * masterVol()));
    clone.play().catch(() => {});
  } catch {}
}

// ── Web Audio UI sounds ───────────────────────────────────────────────────────

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) ctx = new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  // Resume suspended context (browser autoplay policy)
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.12, delay = 0): void {
  if (!soundEnabled()) return;
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = c.currentTime + delay;
  gain.gain.setValueAtTime(Math.max(0.0001, vol * masterVol()), t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.start(t0);
  osc.stop(t0 + dur + 0.01);
}

function soundEnabled(): boolean {
  return typeof window !== "undefined" && useAppStore.getState().settings.soundEnabled;
}

/** Master volume 0..1 (0 when muted) — scales every sound. */
function masterVol(): number {
  if (!soundEnabled()) return 0;
  const v = useAppStore.getState().settings.volume;
  return typeof v === "number" ? Math.max(0, Math.min(1, v)) : 0.7;
}

/** UI sound effects. */
export const sfx = {
  /** Played when a unit is purchased. */
  buy(): void {
    tone(660, 0.08, "sine", 0.10);
    tone(880, 0.10, "sine", 0.08, 0.07);
  },

  /** Played on reroll. */
  reroll(): void {
    tone(440, 0.06, "triangle", 0.10);
    tone(520, 0.06, "triangle", 0.09, 0.06);
    tone(620, 0.10, "triangle", 0.08, 0.12);
  },

  /** Played when a unit star-ups (2★ or 3★). */
  combine(): void {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, "sine", 0.13, i * 0.07));
  },

  /** Played when the shop is frozen. */
  freeze(): void {
    tone(300, 0.22, "sine", 0.10);
    tone(220, 0.18, "sine", 0.07, 0.12);
  },

  /** Played on victory screen. */
  victory(): void {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, "sine", 0.14, i * 0.10));
  },

  /** Played on defeat screen. */
  defeat(): void {
    [392, 349, 294, 220].forEach((f, i) => tone(f, 0.30, "sawtooth", 0.08, i * 0.13));
  },

  /** Played when a unit is sold. */
  sell(): void {
    tone(330, 0.14, "sine", 0.09);
  },
};

// ── Generative background music ──────────────────────────────────────────────
// A small composed loop — sustained pads, a walking bass, a melody motif and a soft
// kick — synthesised via Web Audio (no asset files; static-export friendly). Sits low
// under the SFX. A 4-bar Am · F · C · G progression at ~80 BPM.
let musicGain: GainNode | null = null;
let musicTimer: ReturnType<typeof setInterval> | null = null;
let bar = 0;

const BPM = 80;
const BEAT = 60 / BPM;     // 0.75s
const BAR = BEAT * 4;      // 3.0s, 4/4

const PROG = [
  { root: 110.0, pad: [220.0, 261.63, 329.63], mel: [440.0, 523.25, 659.25, 783.99] },   // Am
  { root: 87.31, pad: [174.61, 220.0, 261.63], mel: [349.23, 440.0, 523.25, 698.46] },    // F
  { root: 130.81, pad: [261.63, 329.63, 392.0], mel: [523.25, 659.25, 783.99, 1046.5] },   // C
  { root: 98.0, pad: [196.0, 246.94, 293.66], mel: [392.0, 493.88, 587.33, 783.99] },      // G
];
// Melody pattern per eighth-note (index into the bar's `mel`, -1 = rest).
const MEL = [
  [0, -1, 2, -1, 1, -1, 3, 2],
  [0, -1, 1, -1, 2, -1, 1, 0],
  [2, -1, 1, -1, 3, -1, 2, 1],
  [1, -1, 2, 3, -1, 2, 1, -1],
];

function tonePart(type: OscillatorType, freq: number, when: number, dur: number, vol: number, atk = 0.02): void {
  const c = getCtx();
  if (!c || !musicGain) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(g);
  g.connect(musicGain);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(vol, when + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.start(when);
  osc.stop(when + dur + 0.03);
}

function kick(when: number, vol: number): void {
  const c = getCtx();
  if (!c || !musicGain) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, when);
  osc.frequency.exponentialRampToValueAtTime(45, when + 0.12);
  osc.connect(g);
  g.connect(musicGain);
  g.gain.setValueAtTime(vol, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
  osc.start(when);
  osc.stop(when + 0.18);
}

function scheduleBar(): void {
  const c = getCtx();
  if (!c || !soundEnabled()) return;
  const p = PROG[bar % PROG.length];
  const pat = MEL[bar % MEL.length];
  const t = c.currentTime + 0.06;
  const eighth = BEAT / 2;
  // Pads — sustain the chord across the bar.
  p.pad.forEach((f, i) => tonePart("sine", f, t, BAR * 1.04, 0.04 - i * 0.006, 0.5));
  // Bass — root on the beat, octave-up on off-beats (a gentle walk).
  for (let b = 0; b < 4; b++) tonePart("triangle", b % 2 === 0 ? p.root : p.root * 2, t + b * BEAT, BEAT * 0.9, 0.055, 0.01);
  // Soft kick on 1 and 3.
  kick(t, 0.085);
  kick(t + 2 * BEAT, 0.075);
  // Melody motif.
  pat.forEach((idx, s) => { if (idx >= 0) tonePart("triangle", p.mel[idx], t + s * eighth, eighth * 1.4, 0.028, 0.008); });
  bar++;
}

export const music = {
  /** Start the loop (idempotent; no-op while sound is off). */
  start(): void {
    if (musicTimer || !soundEnabled()) return;
    const c = getCtx();
    if (!c) return;
    if (!musicGain) { musicGain = c.createGain(); musicGain.connect(c.destination); }
    musicGain.gain.value = 0.42 * masterVol();
    scheduleBar();
    musicTimer = setInterval(scheduleBar, BAR * 1000);
  },
  stop(): void {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  },
  /** Live master-volume update for the music bed (slider drag). */
  setVolume(): void {
    if (musicGain) musicGain.gain.value = 0.42 * masterVol();
  },
  /** Follow the sound setting: play when on, silence when off. */
  sync(): void {
    if (soundEnabled()) this.start();
    else this.stop();
  },
};
