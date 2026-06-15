"use client";

import { usePreLobby } from "@/game/store/preLobbyStore";
import { ALL_GENS, GEN_LABELS } from "@/game/data/generations";
import { unitsForGenerations } from "@/game/data/mons";
import { ITEM_POOL } from "@/game/data/itemPool";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/game/store/appStore";

const HP_OPTIONS = [50, 75, 100, 125, 150, 200];

export function GameRulesPanel({ isHost }: { isHost: boolean }) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.language);
  const rules = usePreLobby((s) => s.rules);
  const toggleGeneration = usePreLobby((s) => s.toggleGeneration);
  const toggleItem = usePreLobby((s) => s.toggleItem);
  const setRules = usePreLobby((s) => s.setRules);

  // Use the REAL playable roster (units actually implemented), not the National
  // Dex range — so this matches the "42 Pokémon" chip shown in the lobby.
  const poolCount = unitsForGenerations(rules.generations).length;
  // How many implemented mons each generation contributes (shown per button).
  const genCounts: Record<number, number> = Object.fromEntries(ALL_GENS.map((g) => [g, unitsForGenerations([g]).length]));
  // Draft-size choices scale to the real pool so they're always achievable.
  const draftOptions = Array.from(
    new Set([Math.round(poolCount / 2), Math.round((poolCount * 3) / 4), poolCount]),
  ).filter((n) => n >= 1 && n <= poolCount);
  const effectiveDraft = Math.min(rules.draftPoolSize, poolCount);

  return (
    <div className="flex flex-col gap-5">
      {/* Generations */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
            {t.r_gens}
          </h3>
          <span className="text-[10px] font-semibold text-slate-500 px-2 py-0.5 rounded-md bg-slate-900/60 border border-slate-700/60">
            {t.r_pool(poolCount)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {ALL_GENS.map((gen) => {
            const active = rules.generations.includes(gen);
            return (
              <button
                key={gen}
                disabled={!isHost || genCounts[gen] === 0}
                onClick={() => toggleGeneration(gen)}
                className={`flex items-center justify-between gap-1.5 px-3 py-2.5 rounded-lg border text-xs font-semibold transition-all ${
                  active
                    ? "bg-amber-950/40 border-amber-600 text-amber-300 shadow-[0_0_14px_-6px_rgba(217,119,6,0.8)]"
                    : "bg-slate-900/40 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <span className="truncate">{GEN_LABELS[gen]}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[10px] tabular-nums px-1 rounded ${active ? "bg-amber-500/20 text-amber-200" : "bg-slate-800 text-slate-500"}`}>{genCounts[gen]}</span>
                  {active && <span className="text-amber-400 text-[11px]">✓</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Draft pool size */}
      <div>
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-3">
          {t.r_draft}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {draftOptions.map((size) => {
            const active = effectiveDraft === size;
            const full = size === poolCount;
            return (
              <button
                key={size}
                disabled={!isHost}
                onClick={() => setRules({ draftPoolSize: size })}
                className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                  active
                    ? "bg-rose-950/50 border-rose-600 text-rose-300"
                    : "bg-slate-900/40 border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                } disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                {size}{full ? " ★" : ""}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-500 mt-1">{t.r_draft_hint}</p>
      </div>

      {/* Starting HP */}
      <div>
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-3">
          {t.r_hp}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {HP_OPTIONS.map((hp) => {
            const active = rules.startingHp === hp;
            return (
              <button
                key={hp}
                disabled={!isHost}
                onClick={() => setRules({ startingHp: hp })}
                className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                  active
                    ? "bg-sky-950/50 border-sky-600 text-sky-300"
                    : "bg-slate-900/40 border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {hp} {t.r_hp_unit}
              </button>
            );
          })}
        </div>
      </div>

      {/* Items */}
      <div>
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-3">
          {t.r_items}
        </h3>
        <div className="grid grid-cols-2 gap-1.5">
          {ITEM_POOL.map((item) => {
            const active = rules.itemsEnabled.includes(item.id);
            return (
              <button
                key={item.id}
                disabled={!isHost}
                title={item.effect}
                onClick={() => toggleItem(item.id)}
                className={`flex items-start gap-2 px-2.5 py-2 rounded-lg border text-left transition-all ${
                  active
                    ? "bg-violet-950/40 border-violet-700"
                    : "bg-slate-900/30 border-slate-800 opacity-50"
                } disabled:cursor-not-allowed`}
              >
                <span className="text-sm shrink-0 mt-0.5">{item.icon}</span>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className={`text-[11px] font-bold truncate ${active ? "text-violet-300" : "text-slate-500"}`}>
                    {lang === "en" ? item.name : item.nameFr}
                  </span>
                  <span className="text-[10px] text-slate-500 leading-tight mt-0.5 line-clamp-2">{item.effect}</span>
                </div>
                {active && <span className="text-violet-500 text-[10px] shrink-0 mt-0.5">✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
