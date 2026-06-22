"use client";

import { usePreLobby } from "@/game/store/preLobbyStore";
import { MODES, getMode } from "@/game/data/gameModes";
import { useAppStore } from "@/game/store/appStore";
import { Swords, Sparkles, Gem, Users, Palette, Crown, ChevronRight, Check, type LucideIcon } from "lucide-react";

/** Icon + one-line tagline per primary (non-region) mode — the "info around the mode". */
const MODE_META: Record<string, { icon: LucideIcon; tag: string; tagFr: string }> = {
  standard:       { icon: Swords,   tag: "8 players · classic",        tagFr: "8 joueurs · classique" },
  monotype:       { icon: Palette,  tag: "One shared type · chaos",     tagFr: "Un type partagé · chaos" },
  "mega-madness": { icon: Sparkles, tag: "A Mega Stone every round",    tagFr: "Une Méga-Gemme chaque tour" },
  treasure:       { icon: Gem,      tag: "PvE showers loot",            tagFr: "Le PvE pleut du butin" },
  "double-up":    { icon: Users,    tag: "2v2 · shared HP",             tagFr: "2c2 · PV partagés" },
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
    <div className="min-h-screen flex flex-col app-bg">
      {/* Heading */}
      <header className="relative z-10 px-5 sm:px-8 pt-8 pb-4 text-center shrink-0">
        <p className="text-[11px] uppercase tracking-[0.28em] text-amber-400/70 font-bold mb-1">{lang === "fr" ? "Étape 1 / 2" : "Step 1 / 2"}</p>
        <h1 className="text-2xl sm:text-3xl font-extrabold gild-text">{lang === "fr" ? "Choisis ton mode" : "Choose your mode"}</h1>
        <p className="text-[12px] text-slate-500 mt-1.5">{lang === "fr" ? "Chaque mode change les règles, le roster et l'identité de la partie." : "Each mode reshapes the rules, the roster and the feel of the game."}</p>
      </header>

      <main className="relative z-10 flex-1 overflow-y-auto px-4 sm:px-8 pb-28">
        <div className="mx-auto w-full max-w-[920px] flex flex-col gap-6">
          {/* Primary modes — large info cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {primary.map((m) => {
              const sel = active.id === m.id;
              const meta = MODE_META[m.id] ?? { icon: Crown, tag: "", tagFr: "" };
              const Icon = meta.icon;
              return (
                <button
                  key={m.id}
                  disabled={!isHost}
                  onClick={() => selectMode(m.id)}
                  className={`group relative text-left rounded-2xl border p-4 transition-all disabled:cursor-not-allowed ${
                    sel ? "bg-white/[0.05] shadow-[0_0_30px_-10px] -translate-y-0.5" : "bg-slate-900/40 border-slate-800 hover:border-slate-600 hover:-translate-y-0.5"
                  }`}
                  style={sel ? { borderColor: `${m.color}cc`, boxShadow: `0 0 30px -12px ${m.color}` } : undefined}
                >
                  {sel && <span className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: m.color }}><Check size={13} className="text-black" /></span>}
                  <span className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: `${m.color}1f`, color: m.color }}><Icon size={22} /></span>
                  <h3 className="text-base font-extrabold mb-1" style={{ color: sel ? m.color : undefined }}>{lang === "fr" ? m.nameFr : m.name}</h3>
                  {meta.tag && <p className="text-[10px] uppercase tracking-wide font-bold mb-1.5" style={{ color: `${m.color}cc` }}>{lang === "fr" ? meta.tagFr : meta.tag}</p>}
                  <p className="text-[12px] text-slate-400 leading-relaxed">{lang === "fr" ? m.descFr : m.desc}</p>
                </button>
              );
            })}
          </div>

          {/* Region Clash — compact thematic cards */}
          <div>
            <div className="flex items-center gap-3 mb-2.5">
              <h2 className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-cyan-300/80 whitespace-nowrap">{lang === "fr" ? "Duels de région" : "Region Clash"}</h2>
              <span className="h-px flex-1 bg-gradient-to-r from-cyan-500/30 to-transparent" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-2.5">
              {regions.map((m) => {
                const sel = active.id === m.id;
                return (
                  <button
                    key={m.id}
                    disabled={!isHost}
                    onClick={() => selectMode(m.id)}
                    title={lang === "fr" ? m.descFr : m.desc}
                    className={`text-left rounded-xl border p-3 transition-all disabled:cursor-not-allowed ${
                      sel ? "bg-cyan-500/10 border-cyan-400/70 shadow-[0_0_22px_-10px_rgba(34,211,238,0.9)]" : "bg-slate-900/40 border-slate-800 hover:border-cyan-700/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <h3 className={`text-[13px] font-extrabold ${sel ? "text-cyan-200" : "text-slate-200"}`}>{lang === "fr" ? m.nameFr : m.name}</h3>
                      {sel && <Check size={14} className="text-cyan-300 shrink-0" />}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 mb-1.5">
                      {m.signatureType && <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-200/90">{m.signatureType}</span>}
                      {m.bossName && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300"><Crown size={9} /> {m.bossName}</span>}
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">{lang === "fr" ? m.modifierLabelFr : m.modifierLabel}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Sticky footer — selected summary + continue */}
      <footer className="relative z-20 shrink-0 border-t border-white/[0.06] bg-slate-950/70 backdrop-blur px-4 sm:px-8 py-3.5">
        <div className="mx-auto w-full max-w-[920px] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">{lang === "fr" ? "Mode choisi" : "Selected mode"}</p>
            <p className="text-sm font-extrabold truncate" style={{ color: active.color }}>{lang === "fr" ? active.nameFr : active.name}</p>
          </div>
          <button
            onClick={onContinue}
            className="shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-xl font-extrabold text-sm tracking-wide bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black shadow-lg shadow-amber-500/20 transition-all"
          >
            {isHost ? (lang === "fr" ? "Continuer" : "Continue") : (lang === "fr" ? "Entrer" : "Enter")} <ChevronRight size={17} />
          </button>
        </div>
      </footer>
    </div>
  );
}
