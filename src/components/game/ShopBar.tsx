"use client";

import { useGame } from "@/game/store/gameStore";
import { useUi } from "@/game/store/uiStore";
import { getDef, spriteUrl } from "@/game/data/mons";
import { computeTraits } from "@/game/engine/synergies";
import { TRAITS_BY_KEY } from "@/game/data/traits";
import { COST_COLOR, TYPE_COLOR } from "@/game/ui";
import { ECONOMY, COPIES_TO_STAR, SHOP_ODDS, type Cost } from "@/game/config";
import { RerollIcon, SnowIcon, CoinIcon, InfoIcon, StarIcon } from "./icons";
import type { UnitInstance, PokeType } from "@/game/types";
import { useT } from "@/lib/i18n";
import { sfx, playCry } from "@/lib/audio";

/** Copies a unit instance is worth toward star-ups (1 / 3 / 9). */
function copiesOf(star: number): number {
  return star === 1 ? 1 : star === 2 ? 3 : 9;
}

type Owned = { copies: number; topStar: number };

function ownedByDef(units: UnitInstance[]): Map<string, Owned> {
  const m = new Map<string, Owned>();
  for (const u of units) {
    const cur = m.get(u.defId) ?? { copies: 0, topStar: 0 };
    cur.copies += copiesOf(u.star);
    cur.topStar = Math.max(cur.topStar, u.star);
    m.set(u.defId, cur);
  }
  return m;
}

export function ShopBar() {
  const shop = useGame((s) => s.shop);
  const gold = useGame((s) => s.gold);
  const level = useGame((s) => s.level);
  const units = useGame((s) => s.units);
  const buyUnit = useGame((s) => s.buyUnit);
  const reroll = useGame((s) => s.reroll);
  const frozen = useGame((s) => s.frozen);
  const toggleFreeze = useGame((s) => s.toggleFreeze);
  const setInspect = useUi((s) => s.setInspect);

  const t = useT();
  const owned = ownedByDef(units);
  const activeTraits = new Set(
    computeTraits(units.filter((u) => u.pos !== null)).filter((t) => t.tier > 0).map((t) => t.key),
  );

  const odds = SHOP_ODDS[Math.min(Math.max(1, level), 10)];

  return (
    <div className="flex items-stretch gap-2">
      {/* Rarity drop-rate recap for the current level. */}
      <div className="flex flex-col justify-center rounded-lg bg-slate-900/70 border border-slate-700/50 px-2 py-1.5 w-[118px] shrink-0">
        <div className="text-[8px] uppercase tracking-wider text-slate-500 mb-1 text-center">{t.sh_odds} · Lv {level}</div>
        <div className="flex flex-col gap-[3px]">
          {odds.map((pct, idx) => {
            const c = COST_COLOR[(idx + 1) as Cost];
            return (
              <div key={idx} className={`flex items-center gap-1 ${pct === 0 ? "opacity-35" : ""}`}>
                <span className="text-[9px] font-extrabold w-2 text-center" style={{ color: c }}>{idx + 1}</span>
                <span className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                  <span className="block h-full rounded-full transition-all" style={{ width: `${pct}%`, background: c }} />
                </span>
                <span className="text-[9px] tabular-nums text-slate-400 w-6 text-right">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 justify-center pr-1 w-[110px] shrink-0">
        {/* Reroll — bigger, with your current gold shown alongside the cost. */}
        <button
          onClick={() => { reroll(); sfx.reroll(); }}
          disabled={gold < ECONOMY.rerollCost}
          className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg bg-slate-700/80 hover:bg-slate-600 disabled:opacity-40 transition-colors"
        >
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-100"><RerollIcon size={16} /> {t.sh_reroll}</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-300">
            <span className="inline-flex items-center gap-0.5"><CoinIcon size={11} />{ECONOMY.rerollCost}</span>
            <span className="text-slate-600">·</span>
            <span className="inline-flex items-center gap-0.5 font-extrabold text-amber-300"><CoinIcon size={12} />{gold}</span>
          </span>
        </button>
        <button
          onClick={() => { toggleFreeze(); if (!frozen) sfx.freeze(); }}
          className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors
            ${frozen ? "bg-sky-600 text-white" : "bg-slate-700/80 hover:bg-slate-600 text-slate-200"}`}
        >
          <SnowIcon size={13} /> {frozen ? t.sh_frozen : t.sh_freeze}
        </button>
      </div>

      <div className="flex gap-2 flex-1">
        {shop.map((defId, i) => {
          if (!defId) {
            return <div key={i} className="flex-1 h-[104px] rounded-lg border border-slate-800 bg-slate-900/40" />;
          }
          const def = getDef(defId);
          const color = COST_COLOR[def.cost];
          const affordable = gold >= def.cost;
          const own = owned.get(defId);

          // Star-up progress toward the next tier.
          const copies = own?.copies ?? 0;
          const nextThreshold = copies < COPIES_TO_STAR[2] ? COPIES_TO_STAR[2] : copies < COPIES_TO_STAR[3] ? COPIES_TO_STAR[3] : null;
          const oneFromStar = nextThreshold !== null && nextThreshold - copies === 1;

          return (
            <button
              key={i}
              onClick={() => {
                const starsBefore = units.filter((u) => u.star > 1).map((u) => `${u.defId}-${u.star}`).join();
                buyUnit(i);
                // Detect combine by checking if new 2★/3★ appeared
                const starsAfter = useGame.getState().units.filter((u) => u.star > 1).map((u) => `${u.defId}-${u.star}`).join();
                if (starsAfter !== starsBefore) sfx.combine();
                else { sfx.buy(); playCry(def.dex[0]); }
              }}
              disabled={!affordable}
              style={{
                borderColor: color,
                boxShadow: own ? `0 0 0 1px ${color}, 0 0 14px ${color}66` : undefined,
              }}
              className={`group relative flex-1 h-[104px] rounded-lg border bg-slate-900/80 hover:bg-slate-800 disabled:opacity-50
                flex flex-col items-center pt-5 pb-1.5 px-1 transition-colors ${oneFromStar ? "ring-2 ring-amber-300/80" : ""}`}
            >
              {/* top-left info */}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setInspect(def.id, own?.topStar === 3 ? 3 : 1); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setInspect(def.id, 1); } }}
                aria-label={t.sh_view_details}
                title={t.sh_view_details}
                className="absolute top-1 left-1 text-slate-500 hover:text-sky-300 opacity-60 group-hover:opacity-100 transition-opacity cursor-help"
              >
                <InfoIcon size={13} />
              </span>

              {/* top-right cost */}
              <span style={{ color }} className="absolute top-1 right-1.5 inline-flex items-center gap-0.5 text-[11px] font-bold">
                <CoinIcon size={11} />{def.cost}
              </span>

              {/* owned mark */}
              {own && (
                <span className="absolute top-1 left-1/2 -translate-x-1/2 inline-flex items-center gap-0.5 rounded-full bg-emerald-500/90 px-1.5 text-[9px] font-bold text-black leading-tight">
                  {own.topStar > 1 && <StarIcon size={8} />}
                  {nextThreshold !== null ? `${copies}/${nextThreshold}` : t.sh_max}
                </span>
              )}

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={spriteUrl(def.dex[Math.max(0, (own?.topStar ?? 1) - 1)])} alt={def.name} width={38} height={38} style={{ imageRendering: "pixelated" }} draggable={false} />
              <span className="text-[11px] font-medium truncate w-full text-center leading-tight">{def.name}</span>

              {/* traits — active ones glow */}
              <div className="flex flex-wrap gap-0.5 justify-center mt-1">
                {def.types.map((t) => (
                  <TraitChip key={t} label={TRAITS_BY_KEY[t]?.label ?? t} color={TYPE_COLOR[t as PokeType]} active={activeTraits.has(t)} />
                ))}
                {def.roles.map((r) => (
                  <TraitChip key={r} label={TRAITS_BY_KEY[r]?.label ?? r} color="#64748b" active={activeTraits.has(r)} />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TraitChip({ label, color, active }: { label: string; color: string; active: boolean }) {
  return (
    <span
      title={active ? `${label} (active)` : label}
      style={active ? { background: color, color: "#0b1020" } : { borderColor: `${color}99`, color: "#cbd5e1" }}
      className={`text-[8px] leading-tight px-1 rounded font-bold ${active ? "ring-1 ring-white/70" : "border bg-slate-900/40"}`}
    >
      {label}
    </span>
  );
}
