"use client";

import { usePreLobby } from "@/game/store/preLobbyStore";
import { ALL_GENS, GEN_LABELS } from "@/game/data/generations";
import { unitsForGenerations, rosterForGenerations } from "@/game/data/mons";
import { COMPLETED } from "@/game/data/itemPool";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/game/store/appStore";
import type { ReactNode } from "react";

const HP_OPTIONS = [50, 75, 100, 125, 150, 200];

/** Each rule group is its own gilded sub-panel with a gold header + badge, so the
 *  sections read as distinct cards laid out across the wide modal. */
function SectionCard({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  return (
    <section className="gilded rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-gold whitespace-nowrap">{title}</h3>
        <span className="h-px flex-1 bg-gradient-to-r from-[var(--panel-edge)] to-transparent" />
        {badge && (
          <span className="text-[10px] font-semibold text-amber-200/80 px-2 py-0.5 rounded-md bg-amber-500/10 border border-[var(--panel-edge)]">
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

// Shared chip styling so every section reads as one cohesive gilded set.
const chipBase = "rounded-lg border text-xs font-bold transition-all disabled:cursor-not-allowed";
const chipActive = "bg-amber-950/40 border-amber-500/70 text-amber-200 shadow-[0_0_16px_-6px_rgba(212,175,55,0.85)]";
const chipIdle = "bg-slate-900/45 border-slate-700/70 text-slate-400 hover:border-amber-700/50 hover:text-slate-200";

export function GameRulesPanel({ isHost }: { isHost: boolean }) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.language);
  const rules = usePreLobby((s) => s.rules);
  const toggleGeneration = usePreLobby((s) => s.toggleGeneration);
  const toggleItem = usePreLobby((s) => s.toggleItem);
  const setRules = usePreLobby((s) => s.setRules);

  // Use the REAL playable roster (capped — see rosterForGenerations) so the count
  // matches what the shop actually draws from, plateauing past ~4 regions.
  const poolCount = rosterForGenerations(rules.generations).length;
  // How many implemented mons each generation contributes (shown per button).
  const genCounts: Record<number, number> = Object.fromEntries(ALL_GENS.map((g) => [g, unitsForGenerations([g]).length]));
  // Draft-size choices scale to the real pool so they're always achievable.
  const draftOptions = Array.from(
    new Set([Math.round(poolCount / 2), Math.round((poolCount * 3) / 4), poolCount]),
  ).filter((n) => n >= 1 && n <= poolCount);
  const effectiveDraft = Math.min(rules.draftPoolSize, poolCount);
  const activeItems = rules.itemsEnabled.length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {/* Left column: generations + the two small numeric rules. */}
      <div className="flex flex-col gap-4">
        <SectionCard title={t.r_gens} badge={t.r_pool(poolCount)}>
          <div className="grid grid-cols-2 gap-1.5">
            {ALL_GENS.map((gen) => {
              const active = rules.generations.includes(gen);
              return (
                <button
                  key={gen}
                  disabled={!isHost || genCounts[gen] === 0}
                  onClick={() => toggleGeneration(gen)}
                  className={`flex items-center justify-between gap-1.5 px-3 py-2.5 ${chipBase} ${active ? chipActive : chipIdle} disabled:opacity-40`}
                >
                  <span className="truncate font-semibold">{GEN_LABELS[gen]}</span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[10px] tabular-nums px-1 rounded ${active ? "bg-amber-500/25 text-amber-100" : "bg-slate-800 text-slate-500"}`}>{genCounts[gen]}</span>
                    {active && <span className="text-amber-300 text-[11px]">✓</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title={t.r_draft}>
          <div className="flex flex-wrap gap-1.5">
            {draftOptions.map((size) => {
              const active = effectiveDraft === size;
              const full = size === poolCount;
              return (
                <button
                  key={size}
                  disabled={!isHost}
                  onClick={() => setRules({ draftPoolSize: size })}
                  className={`px-3.5 py-1.5 ${chipBase} ${active ? chipActive : chipIdle} disabled:opacity-30`}
                >
                  {size}{full ? " ★" : ""}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">{t.r_draft_hint}</p>
        </SectionCard>

        <SectionCard title={t.r_hp}>
          <div className="flex flex-wrap gap-1.5">
            {HP_OPTIONS.map((hp) => {
              const active = rules.startingHp === hp;
              return (
                <button
                  key={hp}
                  disabled={!isHost}
                  onClick={() => setRules({ startingHp: hp })}
                  className={`px-3.5 py-1.5 ${chipBase} ${active ? chipActive : chipIdle} disabled:opacity-50`}
                >
                  {hp} {t.r_hp_unit}
                </button>
              );
            })}
          </div>
        </SectionCard>
      </div>

      {/* Right column: the tall items list, on its own. */}
      <SectionCard title={t.r_items} badge={`${activeItems}/${COMPLETED.length}`}>
        <div className="grid grid-cols-2 gap-1.5">
          {COMPLETED.map((item) => {
            const active = rules.itemsEnabled.includes(item.id);
            return (
              <button
                key={item.id}
                disabled={!isHost}
                title={lang === "en" ? item.text : item.textFr}
                onClick={() => toggleItem(item.id)}
                className={`flex items-start gap-2 px-2.5 py-2 rounded-lg border text-left transition-all disabled:cursor-not-allowed ${
                  active
                    ? "bg-amber-950/30 border-amber-600/50 shadow-[0_0_16px_-8px_rgba(212,175,55,0.7)]"
                    : "bg-slate-900/30 border-slate-800 opacity-55 hover:opacity-90 hover:border-slate-700"
                }`}
              >
                <span className="text-sm shrink-0 mt-0.5">{item.icon}</span>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className={`text-[11px] font-bold truncate ${active ? "text-amber-200" : "text-slate-400"}`}>
                    {lang === "en" ? item.name : item.nameFr}
                  </span>
                  <span className="text-[10px] text-slate-500 leading-tight mt-0.5 line-clamp-2">{lang === "en" ? item.text : item.textFr}</span>
                </div>
                {active && <span className="text-amber-400 text-[10px] shrink-0 mt-0.5">✓</span>}
              </button>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
