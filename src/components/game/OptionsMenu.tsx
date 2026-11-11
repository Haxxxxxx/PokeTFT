"use client";

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/game/store/appStore";
import { music } from "@/lib/audio";
import { useT } from "@/lib/i18n";
import { Settings2, Volume2, VolumeX } from "lucide-react";

/** Compact in-game options popover: volume slider, mute toggle, language. */
export function OptionsMenu() {
  const [open, setOpen] = useState(false);
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const vol = typeof settings.volume === "number" ? settings.volume : 0.7;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={t.o_options}
        aria-label={t.o_options}
        aria-expanded={open}
        className={`flex items-center justify-center w-8 h-8 rounded-md border transition-colors ${open ? "bg-gold-500 text-black border-gold-400" : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300"}`}
      >
        <Settings2 size={15} />
      </button>
      {open && (
        <div className="gilded gilded-strong absolute right-0 top-full mt-2 z-panel w-56 rounded-xl p-3 flex flex-col gap-3">
          {/* Volume */}
          <div>
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 mb-1.5">
              <span className="inline-flex items-center gap-1.5 text-gold-200/80">{settings.soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />} {t.o_volume}</span>
              <span className="text-slate-500 tabular-nums">{settings.soundEnabled ? `${Math.round(vol * 100)}%` : t.o_muted}</span>
            </div>
            <input
              type="range" min={0} max={100} value={Math.round(vol * 100)}
              onChange={(e) => { setSettings({ volume: Number(e.target.value) / 100 }); music.setVolume(); }}
              disabled={!settings.soundEnabled}
              className="w-full accent-gold-500 disabled:opacity-40"
            />
          </div>
          {/* Mute toggle */}
          <button
            onClick={() => { setSettings({ soundEnabled: !settings.soundEnabled }); music.sync(); }}
            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${settings.soundEnabled ? "bg-emerald-950/40 border border-emerald-700/50 text-emerald-300" : "bg-slate-800 border border-slate-700 text-slate-400"}`}
          >
            <span>{t.o_sound}</span>
            <span>{settings.soundEnabled ? t.o_on : t.o_off}</span>
          </button>
          {/* HD-2D board. Opt-in: the CSS board remains the default and the
              fallback while this beds in. */}
          <button
            onClick={() => setSettings({ board3d: !settings.board3d })}
            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${settings.board3d ? "bg-sky-950/40 border border-sky-700/50 text-sky-300" : "bg-slate-800 border border-slate-700 text-slate-400"}`}
          >
            <span>Plateau 3D <span className="opacity-60">(beta)</span></span>
            <span>{settings.board3d ? t.o_on : t.o_off}</span>
          </button>
          {/* Pokémon 3D models. Opt-in while the pose map is reviewed — one
              species of 967 is done, models come from a third-party GitHub repo
              rather than a production CDN, and the model canvas currently
              occludes the combat HP bars. */}
          {/* Language */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-400">{t.o_language}</span>
            <div className="flex gap-1 p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              {(["fr", "en"] as const).map((l) => (
                <button key={l} onClick={() => setSettings({ language: l })} style={{ minWidth: 40 }}
                  className={`py-1 rounded-md text-[11px] font-bold transition-colors ${settings.language === l ? "bg-gold-500/15 text-gold-300 ring-1 ring-gold-500/40" : "text-slate-500 hover:text-slate-300"}`}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        {/* Shortcuts live HERE because they stopped living anywhere.
            The in-game hint strip was removed (it overflowed the shop), which
            left them documented only in the first-run tour — a slide most
            people skip once and never see again. An undiscoverable shortcut is
            the same as a missing one: this was reported as "the keyboard
            shortcuts aren't working" when every one of them did. */}
        <div className="border-t border-white/[0.07] pt-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gold-200/60 mb-1.5">{t.net_keys_label}</div>
          <ul className="flex flex-col gap-1">
            {[
              { keys: ["R", "D"], label: t.net_key_reroll },
              { keys: ["L", "F"], label: t.net_key_xp },
              { keys: ["S"], label: t.net_key_sell },
            ].map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
                <span className="truncate">{row.label}</span>
                <span className="flex gap-1 shrink-0">
                  {row.keys.map((k) => (
                    <kbd key={k} className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-[10px] font-bold text-slate-200 leading-none">{k}</kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
        </div>
      )}
    </div>
  );
}
