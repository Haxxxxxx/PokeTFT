"use client";

import { useAppStore } from "@/game/store/appStore";
import type { Language } from "@/game/store/appStore";
import { useT } from "@/lib/i18n";

export function AppSettingsPanel() {
  const t = useT();
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);

  const langOptions: { value: Language; label: string }[] = [
    { value: "fr", label: t.s_lang_fr },
    { value: "en", label: t.s_lang_en },
  ];

  return (
    <div className="flex flex-col gap-3.5">
      {/* Language */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold text-slate-400">{t.s_lang}</span>
        <div className="flex gap-1 p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
          {langOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSettings({ language: opt.value })}
              style={{ minWidth: 54 }}
              className={`py-1.5 rounded-md text-[11px] font-bold transition-colors ${settings.language === opt.value ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40" : "text-slate-500 hover:text-slate-300"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sound */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold text-slate-400">{t.s_sound}</span>
        <button
          onClick={() => setSettings({ soundEnabled: !settings.soundEnabled })}
          className={`relative w-11 h-6 rounded-full transition-colors ${settings.soundEnabled ? "bg-emerald-500/80" : "bg-slate-700"}`}
          title={settings.soundEnabled ? t.s_sound_on : t.s_sound_off}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${settings.soundEnabled ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>
    </div>
  );
}
