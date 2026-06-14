"use client";

import { useAppStore } from "@/game/store/appStore";
import type { Language, AnimationSpeed } from "@/game/store/appStore";

const LANG_OPTIONS: { value: Language; label: string }[] = [
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
];

const SPEED_OPTIONS: { value: AnimationSpeed; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "fast", label: "Rapide" },
];

export function AppSettingsPanel() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);

  return (
    <div className="flex flex-col gap-5">
      {/* Language */}
      <div>
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-2">
          Langue
        </h3>
        <div className="flex gap-2">
          {LANG_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSettings({ language: opt.value })}
              className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-all ${
                settings.language === opt.value
                  ? "bg-amber-950/50 border-amber-600 text-amber-300"
                  : "bg-slate-800/60 border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sound */}
      <div>
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-2">
          Son
        </h3>
        <button
          onClick={() => setSettings({ soundEnabled: !settings.soundEnabled })}
          className={`w-full py-2 rounded-lg border text-xs font-bold transition-all ${
            settings.soundEnabled
              ? "bg-emerald-950/40 border-emerald-700 text-emerald-300"
              : "bg-slate-800/60 border-slate-700 text-slate-500"
          }`}
        >
          {settings.soundEnabled ? "🔊 Activé" : "🔇 Désactivé"}
        </button>
      </div>

      {/* Animation speed */}
      <div>
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-2">
          Animations
        </h3>
        <div className="flex gap-2">
          {SPEED_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSettings({ animationSpeed: opt.value })}
              className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-all ${
                settings.animationSpeed === opt.value
                  ? "bg-sky-950/50 border-sky-600 text-sky-300"
                  : "bg-slate-800/60 border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
