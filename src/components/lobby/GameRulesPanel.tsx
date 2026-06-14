"use client";

import { usePreLobby } from "@/game/store/preLobbyStore";
import { ALL_GENS, GEN_LABELS, totalPokemonCount } from "@/game/data/generations";
import { ITEM_POOL } from "@/game/data/itemPool";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/game/store/appStore";

const HP_OPTIONS = [50, 75, 100, 125, 150, 200];
const POOL_SIZE_OPTIONS = [60, 90, 120];

export function GameRulesPanel({ isHost }: { isHost: boolean }) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.language);
  const rules = usePreLobby((s) => s.rules);
  const toggleGeneration = usePreLobby((s) => s.toggleGeneration);
  const toggleItem = usePreLobby((s) => s.toggleItem);
  const setRules = usePreLobby((s) => s.setRules);

  const poolCount = totalPokemonCount(rules.generations);

  return (
    <div className="flex flex-col gap-5">
      {/* Generations */}
      <div>
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-3">
          {t.r_gens}
        </h3>
        <div className="flex flex-col gap-1.5">
          {ALL_GENS.map((gen) => {
            const active = rules.generations.includes(gen);
            return (
              <button
                key={gen}
                disabled={!isHost}
                onClick={() => toggleGeneration(gen)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm font-semibold transition-all ${
                  active
                    ? "bg-amber-950/40 border-amber-700 text-amber-300"
                    : "bg-slate-900/40 border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-400"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <span>{GEN_LABELS[gen]}</span>
                {active && <span className="text-amber-500 text-xs">✓</span>}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          {t.r_pool(poolCount)}
        </p>
      </div>

      {/* Draft pool size */}
      <div>
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-3">
          {t.r_draft}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {POOL_SIZE_OPTIONS.map((size) => {
            const capped = Math.min(size, poolCount);
            const active = rules.draftPoolSize === size;
            return (
              <button
                key={size}
                disabled={!isHost || poolCount < size}
                onClick={() => setRules({ draftPoolSize: size })}
                className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                  active
                    ? "bg-rose-950/50 border-rose-600 text-rose-300"
                    : "bg-slate-900/40 border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                } disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                {capped}
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
        <div className="flex flex-col gap-1.5">
          {ITEM_POOL.map((item) => {
            const active = rules.itemsEnabled.includes(item.id);
            return (
              <button
                key={item.id}
                disabled={!isHost}
                onClick={() => toggleItem(item.id)}
                className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border text-left transition-all ${
                  active
                    ? "bg-violet-950/40 border-violet-700"
                    : "bg-slate-900/30 border-slate-800 opacity-50"
                } disabled:cursor-not-allowed`}
              >
                <span className="text-base shrink-0 mt-0.5">{item.icon}</span>
                <div className="flex flex-col min-w-0">
                  <span className={`text-xs font-bold ${active ? "text-violet-300" : "text-slate-500"}`}>
                    {lang === "en" ? item.name : item.nameFr}
                  </span>
                  <span className="text-[10px] text-slate-500 leading-tight mt-0.5">{item.effect}</span>
                </div>
                {active && <span className="text-violet-500 text-xs ml-auto shrink-0 mt-0.5">✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
