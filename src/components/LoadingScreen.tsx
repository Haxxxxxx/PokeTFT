"use client";

/** Full-screen branded loader for auth resolution + reconnect, so navigation
 *  never flashes a blank or half-rendered screen. */
export function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5">
      <div className="relative w-16 h-16">
        <span className="absolute inset-0 rounded-full border-2 border-slate-800" />
        <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-amber-400 animate-spin" />
        <span className="absolute inset-0 flex items-center justify-center text-rose-500 text-2xl">⬡</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="font-extrabold tracking-tight text-lg text-slate-100">Poké<span className="text-amber-400">TFT</span></span>
        <span className="text-xs text-slate-500">{label}</span>
      </div>
    </div>
  );
}
