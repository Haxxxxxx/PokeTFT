"use client";

import { PokeballIcon } from "@/components/game/icons";

/** Full-screen branded loader for auth resolution + reconnect + the connect-to-game
 *  handoff, so navigation never flashes a blank or half-rendered screen. Shows an
 *  animated progress bar; pass `progress` (0..1) for a determinate fill (e.g. players
 *  connected) or omit it for an indeterminate sweep. */
export function LoadingScreen({ label = "Loading…", sub, progress }: { label?: string; sub?: string; progress?: number }) {
  const pct = progress != null ? Math.round(Math.max(0, Math.min(1, progress)) * 100) : null;
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5">
      <div className="relative w-16 h-16">
        <span className="absolute inset-0 rounded-full border-2 border-slate-800" />
        <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-amber-400 animate-spin" />
        <span className="absolute inset-0 flex items-center justify-center text-amber-400"><PokeballIcon size={26} /></span>
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <span className="font-extrabold tracking-tight text-lg text-slate-100">Poké<span className="text-amber-400">TFT</span></span>
        <span className="text-xs text-slate-400">{label}</span>
        {sub && <span className="text-[11px] text-slate-500">{sub}</span>}
        {/* Progress bar — determinate fill when `progress` given, else an indeterminate sweep. */}
        <div className="mt-1 w-52 h-1.5 rounded-full bg-slate-800/80 overflow-hidden">
          {pct != null
            ? <div className="h-full rounded-full bg-amber-400 transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
            : <div className="h-full w-1/3 rounded-full bg-amber-400 loading-sweep" />}
        </div>
      </div>
    </div>
  );
}
