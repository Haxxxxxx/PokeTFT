"use client";

import type { ReactNode } from "react";
import { PokeballIcon } from "@/components/game/icons";

/** Thin, clean frame for the pre-auth screens. Minimal: a soft dark backdrop and a
 *  narrow hairline panel with the wordmark — no decorative clutter. */
export function AuthShell({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <div className="min-h-screen app-bg flex items-center justify-center p-5">
      <div className="w-full max-w-[348px] panel rounded-2xl px-7 py-8 flex flex-col gap-5">
        <div className="flex flex-col items-center gap-2">
          <span className="text-gold/90"><PokeballIcon size={30} /></span>
          <h1 className="font-bold tracking-tight text-2xl text-slate-100">Poké<span className="gild-text">TFT</span></h1>
          {subtitle && <p className="text-slate-500 text-[12px] text-center leading-relaxed">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
