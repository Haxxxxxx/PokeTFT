"use client";

import { usePreLobby } from "@/game/store/preLobbyStore";
import { MODES, getMode } from "@/game/data/gameModes";
import { ALL_GENS, GEN_LABELS, MAX_REGIONS } from "@/game/data/generations";
import { unitsForGenerations } from "@/game/data/mons";
import { COMPLETED } from "@/game/data/itemPool";
import { ItemGlyph } from "@/components/game/ItemGlyph";
import { ShieldCheck, Check, ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/game/store/appStore";
import { useState, type ReactNode } from "react";

const HP_OPTIONS = [50, 75, 100, 125, 150, 200];

/** Split "Gen I — Kanto" → { roman: "I", region: "Kanto" } so chips can show the region name
 *  prominently with the numeral as a subtle tag (no truncation). */
function splitGen(label: string): { roman: string; region: string } {
  const [a, b] = label.split("—").map((s) => s.trim());
  return b ? { roman: a.replace(/gen/i, "").trim(), region: b } : { roman: "", region: a };
}

/** Each rule group is its own sub-panel with a gold header + optional badge. Drawer-first:
 *  everything stacks in one readable column. */
function SectionCard({ title, badge, action, children }: { title: string; badge?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="gilded rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-gold whitespace-nowrap">{title}</h3>
        <span className="h-px flex-1 bg-gradient-to-r from-[var(--panel-edge)] to-transparent" />
        {action}
        {badge && (
          <span className="shrink-0 text-[10px] font-semibold text-amber-200/80 px-2 py-0.5 rounded-md bg-amber-500/10 border border-[var(--panel-edge)] tabular-nums whitespace-nowrap">
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

// Shared chip styling so every section reads as one cohesive gilded set.
const chipBase = "rounded-lg border text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-40";
const chipActive = "bg-amber-950/40 border-amber-500/70 text-amber-200 shadow-[0_0_16px_-6px_rgba(212,175,55,0.85)]";
const chipIdle = "bg-slate-900/45 border-slate-700/70 text-slate-400 hover:border-amber-700/50 hover:text-slate-200";

export function GameRulesPanel({ isHost, showMode = true }: { isHost: boolean; showMode?: boolean }) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.language);
  const rules = usePreLobby((s) => s.rules);
  const toggleGeneration = usePreLobby((s) => s.toggleGeneration);
  const toggleItem = usePreLobby((s) => s.toggleItem);
  const setRules = usePreLobby((s) => s.setRules);
  const [itemsOpen, setItemsOpen] = useState(false);

  const poolCount = unitsForGenerations(rules.generations).length;
  const genCounts: Record<number, number> = Object.fromEntries(ALL_GENS.map((g) => [g, unitsForGenerations([g]).length]));
  const draftOptions = Array.from(new Set([40, 60, 90, 120, poolCount]))
    .filter((n) => n >= 1 && n <= poolCount)
    .sort((a, b) => a - b);
  const effectiveDraft = Math.min(rules.draftPoolSize, poolCount);
  const activeItems = rules.itemsEnabled.length;

  const activeMode = getMode(rules.mode);
  const regionLocked = activeMode.group === "region";
  const selectMode = (id: string) => {
    const m = getMode(id);
    setRules({ mode: id, ...(m.rulesPatch ?? {}) });
  };
  const standardModes = MODES.filter((m) => m.group !== "region");
  const regionModes = MODES.filter((m) => m.group === "region");

  return (
    <div className="flex flex-col gap-4">
      {/* Game mode — the headline selector. Hidden when the host picks the mode in a prior step. */}
      {showMode && (
      <SectionCard title={lang === "fr" ? "Mode de jeu" : "Game Mode"} badge={lang === "fr" ? activeMode.nameFr : activeMode.name}>
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {standardModes.map((m) => {
            const active = activeMode.id === m.id;
            return (
              <button
                key={m.id}
                disabled={!isHost}
                onClick={() => selectMode(m.id)}
                style={active ? { borderColor: `${m.color}aa`, color: m.color, background: `${m.color}1a` } : undefined}
                title={lang === "fr" ? m.descFr : m.desc}
                className={`px-3 py-2 ${chipBase} ${active ? "shadow-[0_0_16px_-6px] font-extrabold" : chipIdle}`}
              >
                {lang === "fr" ? m.nameFr : m.name}
              </button>
            );
          })}
        </div>
        <div className="text-[10px] uppercase tracking-widest text-cyan-200/50 font-bold mb-1.5">{lang === "fr" ? "Duels de région" : "Region Clash"}</div>
        <div className="flex flex-wrap gap-1.5">
          {regionModes.map((m) => {
            const active = activeMode.id === m.id;
            return (
              <button
                key={m.id}
                disabled={!isHost}
                onClick={() => selectMode(m.id)}
                style={active ? { borderColor: "#22d3ee", color: "#67e8f9", background: "#22d3ee1a" } : undefined}
                title={lang === "fr" ? m.descFr : m.desc}
                className={`px-2.5 py-1.5 ${chipBase} ${active ? "font-extrabold" : chipIdle}`}
              >
                {lang === "fr" ? m.nameFr : m.name}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-500 mt-2.5 leading-relaxed">{lang === "fr" ? activeMode.descFr : activeMode.desc}</p>
      </SectionCard>
      )}

      {/* Generations — full region names, count on the right, never truncated. */}
      <SectionCard
        title={t.r_gens}
        badge={regionLocked ? (lang === "fr" ? "verrouillé" : "locked") : `${rules.generations.length}/${MAX_REGIONS}`}
      >
        <p className="text-[11px] text-slate-500 mb-2.5">{t.r_pool(poolCount)}</p>
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-1.5 ${regionLocked ? "opacity-60" : ""}`}>
          {ALL_GENS.map((gen) => {
            const active = rules.generations.includes(gen);
            const atCap = !active && rules.generations.length >= MAX_REGIONS;
            const empty = genCounts[gen] === 0;
            const { roman, region } = splitGen(GEN_LABELS[gen]);
            return (
              <button
                key={gen}
                disabled={!isHost || empty || atCap || regionLocked}
                onClick={() => toggleGeneration(gen)}
                title={regionLocked ? (lang === "fr" ? "Le mode Région fixe la région" : "Region mode fixes the region") : atCap ? `Up to ${MAX_REGIONS} regions per match` : GEN_LABELS[gen]}
                className={`flex items-center gap-2 px-3 py-2.5 ${chipBase} ${active ? chipActive : chipIdle}`}
              >
                <span className={`text-[9px] font-extrabold tabular-nums w-5 text-center rounded px-0.5 ${active ? "bg-amber-500/25 text-amber-100" : "bg-slate-800 text-slate-500"}`}>{roman}</span>
                <span className="flex-1 text-left font-bold truncate">{region}</span>
                <span className={`text-[10px] tabular-nums ${active ? "text-amber-200/80" : "text-slate-500"}`}>{genCounts[gen]}</span>
                {active && <Check size={13} className="text-amber-300 shrink-0" />}
              </button>
            );
          })}
        </div>
      </SectionCard>

      {/* Compact numeric rules — two per row on wider drawers, stacked on narrow. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SectionCard title={t.r_draft}>
          <div className="flex flex-wrap gap-1.5">
            {draftOptions.map((size) => (
              <button key={size} disabled={!isHost} onClick={() => setRules({ draftPoolSize: size })}
                className={`px-3.5 py-1.5 ${chipBase} ${effectiveDraft === size ? chipActive : chipIdle}`}>
                {size}{size === poolCount ? " ★" : ""}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">{t.r_draft_hint}</p>
        </SectionCard>

        <SectionCard title={t.r_hp}>
          <div className="flex flex-wrap gap-1.5">
            {HP_OPTIONS.map((hp) => (
              <button key={hp} disabled={!isHost} onClick={() => setRules({ startingHp: hp })}
                className={`px-3 py-1.5 ${chipBase} ${rules.startingHp === hp ? chipActive : chipIdle}`}>
                {hp}
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard title={lang === "fr" ? "Joueurs max" : "Max Players"}>
          <div className="flex flex-wrap gap-1.5">
            {[2, 3, 4, 5, 6, 7, 8].map((n) => (
              <button key={n} disabled={!isHost} onClick={() => setRules({ maxPlayers: n })}
                className={`w-9 py-1.5 ${chipBase} ${rules.maxPlayers === n ? chipActive : chipIdle}`}>
                {n}
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Augments">
          <div className="flex gap-1.5">
            {[true, false].map((on) => (
              <button key={String(on)} disabled={!isHost} onClick={() => setRules({ augmentsEnabled: on })}
                className={`flex-1 py-1.5 ${chipBase} ${(rules.augmentsEnabled !== false) === on ? chipActive : chipIdle}`}>
                {on ? (lang === "fr" ? "Activés" : "On") : (lang === "fr" ? "Désactivés" : "Off")}
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard title={lang === "fr" ? "Visibilité" : "Visibility"}>
          <div className="flex gap-1.5">
            {[false, true].map((priv) => (
              <button key={String(priv)} disabled={!isHost} onClick={() => setRules({ isPrivate: priv })}
                className={`flex-1 py-1.5 ${chipBase} ${(rules.isPrivate === true) === priv ? chipActive : chipIdle}`}>
                {priv ? (lang === "fr" ? "Privée" : "Private") : (lang === "fr" ? "Publique" : "Public")}
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard title={lang === "fr" ? "Serveur" : "Server"}>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-950/30 border border-emerald-700/40">
            <ShieldCheck size={15} className="text-emerald-400 shrink-0" />
            <span className="text-[12px] font-bold text-emerald-200">{lang === "fr" ? "Dédié · toujours actif" : "Dedicated · always on"}</span>
          </div>
        </SectionCard>
      </div>

      {/* Items — a collapsible dropdown (collapsed by default so the drawer stays short). */}
      <section className="gilded rounded-xl">
        <button onClick={() => setItemsOpen((o) => !o)} className="w-full flex items-center gap-3 p-4">
          <h3 className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-gold whitespace-nowrap">{t.r_items}</h3>
          <span className="h-px flex-1 bg-gradient-to-r from-[var(--panel-edge)] to-transparent" />
          <span className="shrink-0 text-[10px] font-semibold text-amber-200/80 px-2 py-0.5 rounded-md bg-amber-500/10 border border-[var(--panel-edge)] tabular-nums">{activeItems}/{COMPLETED.length}</span>
          <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${itemsOpen ? "rotate-180" : ""}`} />
        </button>
        {itemsOpen && (
          <div className="px-4 pb-4">
            {isHost && (
              <div className="flex gap-1 mb-2">
                <button onClick={() => setRules({ itemsEnabled: COMPLETED.map((i) => i.id) })} className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-slate-800/70 border border-slate-700/70 text-slate-300 hover:text-amber-200 hover:border-amber-700/50 transition-colors">{lang === "fr" ? "Tout" : "All"}</button>
                <button onClick={() => setRules({ itemsEnabled: [] })} className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-slate-800/70 border border-slate-700/70 text-slate-300 hover:text-rose-300 hover:border-rose-700/50 transition-colors">{lang === "fr" ? "Aucun" : "None"}</button>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {COMPLETED.map((item) => {
                const active = rules.itemsEnabled.includes(item.id);
                return (
                  <button
                    key={item.id}
                    disabled={!isHost}
                    title={lang === "en" ? item.text : item.textFr}
                    onClick={() => toggleItem(item.id)}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-all disabled:cursor-not-allowed ${
                      active
                        ? "bg-amber-950/30 border-amber-600/50 shadow-[0_0_16px_-9px_rgba(212,175,55,0.7)]"
                        : "bg-slate-900/30 border-slate-800 opacity-60 hover:opacity-100 hover:border-slate-700"
                    }`}
                  >
                    <span className={`shrink-0 ${active ? "text-amber-300" : "text-slate-400"}`}><ItemGlyph id={item.id} size={16} /></span>
                    <span className={`flex-1 min-w-0 text-[11px] font-bold truncate ${active ? "text-amber-200" : "text-slate-400"}`}>
                      {lang === "en" ? item.name : item.nameFr}
                    </span>
                    {active && <Check size={13} className="text-amber-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
