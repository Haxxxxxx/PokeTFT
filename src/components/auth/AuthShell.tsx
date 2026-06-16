"use client";

import type { ReactNode } from "react";
import { spriteUrl } from "@/game/data/mons";
import { PokeballIcon } from "@/components/game/icons";

// Ambient showcase mons drifting behind the auth card (brand-consistent with the launcher).
const BG = [
  { dex: 6, x: "7%", y: "13%", size: 150, rot: -10 },
  { dex: 149, x: "77%", y: "9%", size: 132, rot: 11 },
  { dex: 448, x: "3%", y: "62%", size: 138, rot: 8 },
  { dex: 282, x: "81%", y: "58%", size: 126, rot: -8 },
  { dex: 445, x: "45%", y: "80%", size: 112, rot: 0 },
];

/** Shared premium frame for the pre-auth screens (sign-in, username): the hex-grid
 *  shell, drifting mons, a gold ambient glow and a gilded card with the wordmark. */
export function AuthShell({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <div className="min-h-screen tft-shell flex items-center justify-center p-4 relative overflow-hidden">
      {/* Drifting brand mons */}
      <div className="absolute inset-0 pointer-events-none select-none">
        {BG.map((m, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={spriteUrl(m.dex)}
            alt=""
            width={m.size}
            height={m.size}
            className="absolute hero-float"
            style={{ left: m.x, top: m.y, width: m.size, ["--r" as string]: `${m.rot}deg`, imageRendering: "pixelated", opacity: 0.1, filter: "saturate(1.1)", animationDelay: `${i * 0.7}s` }}
          />
        ))}
      </div>
      {/* Gold ambient pool behind the card */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] pointer-events-none rounded-full"
        style={{ background: "radial-gradient(circle, rgba(212,175,55,0.12), transparent 62%)" }} />

      <div className="relative z-10 w-full max-w-[400px] gilded gilded-strong rounded-3xl p-8 flex flex-col gap-5">
        <div className="flex flex-col items-center gap-1.5 pb-4 border-b border-[color:var(--panel-edge)]">
          <span className="text-gold drop-shadow-[0_0_12px_rgba(212,175,55,0.55)]"><PokeballIcon size={40} /></span>
          <h1 className="font-extrabold tracking-tight text-4xl text-slate-100">Poké<span className="gild-text">TFT</span></h1>
          {subtitle && <p className="text-slate-400 text-sm text-center">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
