"use client";

import { useAppStore } from "@/game/store/appStore";
import type { Language, AnimationSpeed } from "@/game/store/appStore";
import { useT } from "@/lib/i18n";

export function AppSettingsPanel() {
  const t = useT();
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);

  const langOptions: { value: Language; label: string }[] = [
    { value: "fr", label: t.s_lang_fr },
    { value: "en", label: t.s_lang_en },
  ];

  const speedOptions: { value: AnimationSpeed; label: string }[] = [
    { value: "normal", label: t.s_anim_normal },
    { value: "fast", label: t.s_anim_fast },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Language */}
      <div>
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-2">
          {t.s_lang}
        </h3>
        <div className="flex gap-2">
          {langOptions.map((opt) => (
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
          {t.s_sound}
        </h3>
        <button
          onClick={() => setSettings({ soundEnabled: !settings.soundEnabled })}
          className={`w-full py-2 rounded-lg border text-xs font-bold transition-all ${
            settings.soundEnabled
              ? "bg-emerald-950/40 border-emerald-700 text-emerald-300"
              : "bg-slate-800/60 border-slate-700 text-slate-500"
          }`}
        >
          {settings.soundEnabled ? t.s_sound_on : t.s_sound_off}
        </button>
      </div>

      {/* Animation speed */}
      <div>
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-2">
          {t.s_anim}
        </h3>
        <div className="flex gap-2">
          {speedOptions.map((opt) => (
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
