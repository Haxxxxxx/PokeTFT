"use client";

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/game/store/appStore";
import { music } from "@/lib/audio";
import { Settings2, Volume2, VolumeX } from "lucide-react";

/** Compact in-game options popover: volume slider, mute toggle, language. */
export function OptionsMenu() {
  const [open, setOpen] = useState(false);
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const vol = typeof settings.volume === "number" ? settings.volume : 0.7;
  const fr = settings.language === "fr";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={fr ? "Options" : "Options"}
        aria-label="Options"
        aria-expanded={open}
        className={`flex items-center justify-center w-8 h-8 rounded-md border transition-colors ${open ? "bg-amber-500 text-black border-amber-400" : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300"}`}
      >
        <Settings2 size={15} />
      </button>
      {open && (
        <div className="gilded gilded-strong absolute right-0 top-full mt-2 z-[70] w-56 rounded-xl p-3 flex flex-col gap-3">
          {/* Volume */}
          <div>
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 mb-1.5">
              <span className="inline-flex items-center gap-1.5 text-amber-200/80">{settings.soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />} {fr ? "Volume" : "Volume"}</span>
              <span className="text-slate-500 tabular-nums">{settings.soundEnabled ? `${Math.round(vol * 100)}%` : (fr ? "Muet" : "Muted")}</span>
            </div>
            <input
              type="range" min={0} max={100} value={Math.round(vol * 100)}
              onChange={(e) => { setSettings({ volume: Number(e.target.value) / 100 }); music.setVolume(); }}
              disabled={!settings.soundEnabled}
              className="w-full accent-amber-500 disabled:opacity-40"
            />
          </div>
          {/* Mute toggle */}
          <button
            onClick={() => { setSettings({ soundEnabled: !settings.soundEnabled }); music.sync(); }}
            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${settings.soundEnabled ? "bg-emerald-950/40 border border-emerald-700/50 text-emerald-300" : "bg-slate-800 border border-slate-700 text-slate-400"}`}
          >
            <span>{fr ? "Son" : "Sound"}</span>
            <span>{settings.soundEnabled ? (fr ? "Activé" : "On") : (fr ? "Coupé" : "Off")}</span>
          </button>
          {/* Language */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-400">{fr ? "Langue" : "Language"}</span>
            <div className="flex gap-1 p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              {(["fr", "en"] as const).map((l) => (
                <button key={l} onClick={() => setSettings({ language: l })} style={{ minWidth: 40 }}
                  className={`py-1 rounded-md text-[11px] font-bold transition-colors ${settings.language === l ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40" : "text-slate-500 hover:text-slate-300"}`}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
