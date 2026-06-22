"use client";

import { usePreLobby } from "@/game/store/preLobbyStore";
import { MODES, getMode } from "@/game/data/gameModes";
import { useAppStore } from "@/game/store/appStore";
import { Swords, Sparkles, Gem, Users, Palette, Crown, ChevronRight, Check, type LucideIcon } from "lucide-react";

/** Icon + one-line tagline per primary (non-region) mode. The full description lives in the
 *  footer for whichever mode is selected, keeping the cards short. */
const MODE_META: Record<string, { icon: LucideIcon; tag: string; tagFr: string }> = {
  standard:       { icon: Swords,   tag: "8 players · classic",     tagFr: "8 joueurs · classique" },
  monotype:       { icon: Palette,  tag: "One shared type",         tagFr: "Un type partagé" },
  "mega-madness": { icon: Sparkles, tag: "Mega every round",        tagFr: "Méga chaque tour" },
  treasure:       { icon: Gem,      tag: "PvE showers loot",        tagFr: "Le PvE pleut du butin" },
  "double-up":    { icon: Users,    tag: "2v2 · shared HP",         tagFr: "2c2 · PV partagés" },
};

export function ModeSelect({ isHost, onContinue }: { isHost: boolean; onContinue: () => void }) {
  const lang = useAppStore((s) => s.settings.language);
  const rules = usePreLobby((s) => s.rules);
  const setRules = usePreLobby((s) => s.setRules);
  const active = getMode(rules.mode);

  const selectMode = (id: string) => {
    if (!isHost) return;
    const m = getMode(id);
    setRules({ mode: id, ...(m.rulesPatch ?? {}) });
  };

  const primary = MODES.filter((m) => m.group !== "region");
  const regions = MODES.filter((m) => m.group === "region");

  return (
    <div className="h-screen flex flex-col app-bg overflow-hidden">
      <header className="relative z-10 px-5 pt-5 pb-3 text-center shrink-0">
        <p className="text-[10px] uppercase tracking-[0.28em] text-amber-400/70 font-bold">{lang === "fr" ? "Étape 1 / 2" : "Step 1 / 2"}</p>
        <h1 className="text-xl sm:text-2xl font-extrabold gild-text mt-0.5">{lang === "fr" ? "Choisis ton mode" : "Choose your mode"}</h1>
      </header>

      <main className="relative z-10 flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-4">
        <div className="mx-auto w-full max-w-[760px] flex flex-col gap-4">
          {/* Primary modes — compact: icon + name + tagline (description shown in the footer). */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {primary.map((m) => {
              const sel = active.id === m.id;
              const meta = MODE_META[m.id] ?? { icon: Crown, tag: "", tagFr: "" };
              const Icon = meta.icon;
              return (
                <button
                  key={m.id}
                  disabled={!isHost}
                  onClick={() => selectMode(m.id)}
                  className={`group relative flex items-center gap-3 text-left rounded-xl border p-3 transition-all disabled:cursor-not-allowed ${
                    sel ? "bg-white/[0.05]" : "bg-slate-900/40 border-slate-800 hover:border-slate-600"
                  }`}
                  style={sel ? { borderColor: `${m.color}cc`, background: `${m.color}0f` } : undefined}
                >
                  <span className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${m.color}1f`, color: m.color }}><Icon size={20} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-extrabold leading-tight truncate" style={{ color: sel ? m.color : undefined }}>{lang === "fr" ? m.nameFr : m.name}</span>
                    <span className="block text-[10px] font-bold uppercase tracking-wide truncate" style={{ color: `${m.color}bb` }}>{lang === "fr" ? meta.tagFr : meta.tag}</span>
                  </span>
                  {sel && <Check size={15} className="shrink-0" style={{ color: m.color }} />}
                </button>
              );
            })}
          </div>

          {/* Region Clash — compact cards: name, signature type + boss, modifier as a sub-line. */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-cyan-300/80 whitespace-nowrap">{lang === "fr" ? "Duels de région" : "Region Clash"}</h2>
              <span className="h-px flex-1 bg-gradient-to-r from-cyan-500/30 to-transparent" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {regions.map((m) => {
                const sel = active.id === m.id;
                return (
                  <button
                    key={m.id}
                    disabled={!isHost}
                    onClick={() => selectMode(m.id)}
                    title={lang === "fr" ? m.modifierLabelFr : m.modifierLabel}
                    className={`text-left rounded-lg border px-2.5 py-2 transition-all disabled:cursor-not-allowed ${
                      sel ? "bg-cyan-500/10 border-cyan-400/70" : "bg-slate-900/40 border-slate-800 hover:border-cyan-700/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <h3 className={`text-[12px] font-extrabold truncate ${sel ? "text-cyan-200" : "text-slate-200"}`}>{lang === "fr" ? m.nameFr : m.name}</h3>
                      {sel && <Check size={12} className="text-cyan-300 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      {m.signatureType && <span className="text-[8px] font-bold uppercase tracking-wide px-1 py-0.5 rounded bg-cyan-500/15 text-cyan-200/90">{m.signatureType}</span>}
                      {m.bossName && <span className="inline-flex items-center gap-0.5 text-[8px] font-bold px-1 py-0.5 rounded bg-rose-500/15 text-rose-300 truncate"><Crown size={8} /> {m.bossName}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Sticky footer — selected mode + its full description + continue. */}
      <footer className="relative z-20 shrink-0 border-t border-white/[0.06] bg-slate-950/80 backdrop-blur px-4 sm:px-6 py-3">
        <div className="mx-auto w-full max-w-[760px] flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-extrabold truncate" style={{ color: active.color }}>{lang === "fr" ? active.nameFr : active.name}</p>
            <p className="text-[11px] text-slate-500 leading-tight line-clamp-2">{lang === "fr" ? active.descFr : active.desc}</p>
          </div>
          <button
            onClick={onContinue}
            className="btn-primary shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm tracking-wide"
          >
            {isHost ? (lang === "fr" ? "Continuer" : "Continue") : (lang === "fr" ? "Entrer" : "Enter")} <ChevronRight size={17} />
          </button>
        </div>
      </footer>
    </div>
  );
}
