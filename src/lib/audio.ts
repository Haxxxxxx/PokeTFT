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
    clone.volume = volume;
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
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.start(t0);
  osc.stop(t0 + dur + 0.01);
}

function soundEnabled(): boolean {
  return typeof window !== "undefined" && useAppStore.getState().settings.soundEnabled;
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

// ── Generative ambient background music ──────────────────────────────────────
// A slow, looping chord progression synthesised with Web Audio (no asset files —
// works with the static export). Low in the mix so it sits under the SFX.
let musicGain: GainNode | null = null;
let musicTimer: ReturnType<typeof setInterval> | null = null;
let musicStep = 0;

// Gentle minor-ish progression (Am · F · C · G), each as a 3-note chord (Hz).
const CHORDS = [
  [220.0, 261.63, 329.63],
  [174.61, 220.0, 261.63],
  [261.63, 329.63, 392.0],
  [196.0, 246.94, 293.66],
];

function pad(freq: number, when: number, dur: number, vol: number): void {
  const c = getCtx();
  if (!c || !musicGain) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  osc.connect(g);
  g.connect(musicGain);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(vol, when + 0.9);      // slow swell in
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);   // slow fade out
  osc.start(when);
  osc.stop(when + dur + 0.05);
}

function scheduleChord(): void {
  const c = getCtx();
  if (!c || !soundEnabled()) return;
  const chord = CHORDS[musicStep % CHORDS.length];
  const t = c.currentTime + 0.05;
  chord.forEach((f, i) => pad(f, t, 4.4, 0.05 - i * 0.008));
  pad(chord[0] / 2, t, 4.6, 0.035);                 // soft sub-bass root
  if (musicStep % 2 === 0) pad(chord[2] * 2, t + 2.1, 1.6, 0.022); // occasional sparkle
  musicStep++;
}

export const music = {
  /** Start the loop (idempotent; no-op while sound is off). */
  start(): void {
    if (musicTimer || !soundEnabled()) return;
    const c = getCtx();
    if (!c) return;
    if (!musicGain) { musicGain = c.createGain(); musicGain.gain.value = 0.55; musicGain.connect(c.destination); }
    scheduleChord();
    musicTimer = setInterval(scheduleChord, 4000);
  },
  stop(): void {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  },
  /** Follow the sound setting: play when on, silence when off. */
  sync(): void {
    if (soundEnabled()) this.start();
    else this.stop();
  },
};
