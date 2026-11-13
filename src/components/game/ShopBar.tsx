"use client";

import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useGame } from "@/game/store/gameStore";
import { useUi } from "@/game/store/uiStore";
import { getDef, spriteUrl } from "@/game/data/mons";
import { computeTraits, traitGainsFor } from "@/game/engine/synergies";
import { TRAITS_BY_KEY } from "@/game/data/traits";
import { COST_COLOR, TYPE_COLOR } from "@/game/ui";
import { TraitGlyph } from "./TraitGlyph";
import { ECONOMY, COPIES_TO_STAR, SHOP_ODDS, MAX_LEVEL, XP_TO_REACH, type Cost } from "@/game/config";
import { RerollIcon, CoinIcon, InfoIcon, StarIcon } from "./icons";
import type { UnitInstance, PokeType } from "@/game/types";
import { useT } from "@/lib/i18n";
import { useGameLayout } from "./LayoutProvider";
import { shopControlMetrics } from "@/game/ui/dock-metrics";
import { Lock, LockOpen } from "lucide-react";
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

function ShopBarBase() {
  const shop = useGame((s) => s.shop);
  const gold = useGame((s) => s.gold);
  const level = useGame((s) => s.level);
  const xp = useGame((s) => s.xp);
  const units = useGame((s) => s.units);
  const buyUnit = useGame((s) => s.buyUnit);
  const reroll = useGame((s) => s.reroll);
  const buyXp = useGame((s) => s.buyXp);
  const frozen = useGame((s) => s.frozen);
  const toggleFreeze = useGame((s) => s.toggleFreeze);
  const setInspect = useUi((s) => s.setInspect);

  // Purchase feedback: a short-lived overlay on the slot just bought (buy = green
  // pop, 3-copy combine = gold starburst). Rendered on both the filled AND the
  // now-empty slot branch since buyUnit nulls the slot on the very next render.
  const [popFx, setPopFx] = useState<{ slot: number; kind: "buy" | "combine" } | null>(null);
  // Bumped on every successful reroll so the shop row remounts with a staggered
  // deal-in animation instead of just instantly swapping content.
  const [rerollTick, setRerollTick] = useState(0);
  // Level-up beat: pops the Buy XP button when the level actually increases
  // (mirrors the sfx.levelUp() already fired elsewhere for this change).
  const [levelUpFx, setLevelUpFx] = useState(false);
  const prevLevelRef = useRef(level);
  useEffect(() => {
    if (level > prevLevelRef.current) {
      setLevelUpFx(true);
      const id = setTimeout(() => setLevelUpFx(false), 500);
      prevLevelRef.current = level;
      return () => clearTimeout(id);
    }
    prevLevelRef.current = level;
  }, [level]);

  const t = useT();
  const owned = ownedByDef(units);
  const boardUnits = units.filter((u) => u.pos !== null);
  const activeTraits = new Set(
    computeTraits(boardUnits).filter((t) => t.tier > 0).map((t) => t.key),
  );

  // Which synergies each offered unit would activate or step up. This is the
  // question you're actually asking every reroll, and reading it off a list of
  // trait names means doing the arithmetic by hand each time.
  const gainsByDef = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const defId of shop) {
      if (!defId || m.has(defId)) continue;
      m.set(defId, new Set(traitGainsFor(defId, boardUnits).map((g) => g.key)));
    }
    return m;
    // Board identity changes on every placement; shop changes on every roll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop, units]);

  const odds = SHOP_ODDS[Math.min(Math.max(1, level), 10)];
  // Card art is sized from the shop strip's budgeted height so it fills the
  // card at every density, and overflows the corner slightly so it reads as
  // artwork bleeding off the card rather than a pasted-on icon.
  const layout = useGameLayout();
  const artSize = Math.round(layout.shopH * 1.08);
  const SHOP_M = shopControlMetrics(layout.font);
  // Level recap for the Buy XP control: progress toward the next level + cost.
  const atMax = level >= MAX_LEVEL;
  const xpBase = XP_TO_REACH[level];
  const xpNeed = atMax ? 1 : XP_TO_REACH[level + 1] - xpBase;
  const xpCur = xp - xpBase;
  // What the level actually COSTS from here, in the currency you spend.
  // The button already showed "12/20 XP" and "4 gold" for one purchase, which
  // left the player doing the arithmetic that decides the whole round: is
  // levelling now cheaper than keeping the gold for interest? Rounds up,
  // because you cannot buy a part of a purchase.
  const xpLeft = atMax ? 0 : Math.max(0, xpNeed - xpCur);
  const buysLeft = Math.ceil(xpLeft / ECONOMY.buyXpAmount);
  const goldToLevel = buysLeft * ECONOMY.buyXpCost;

  return (
    <div className="flex h-full min-h-0 min-w-0 items-stretch gap-2">
      {/* Width tracks the density tier. At a flat 150px this column took the
          same space on a phone as on a desktop, squeezing the card strip —
          which is the part that has to stay readable. */}
      <div style={{ width: SHOP_M.w }} className="flex flex-col gap-1.5 justify-center pr-1 shrink-0">
        {/* Buy XP — with the level recap (current level + progress to the next) and
            the cost to level past it, so all the level info lives on the button. */}
        <button
          onClick={buyXp}
          disabled={gold < ECONOMY.buyXpCost || atMax}
          className={`flex flex-col gap-1 px-2.5 py-1.5 rounded-lg bg-sky-800/80 hover:bg-sky-700 disabled:opacity-40 border border-sky-600/40 transition-colors ${levelUpFx ? "celebrate-pop" : ""}`}
        >
          <div className="flex items-center justify-between w-full text-[10px] leading-none">
            <span className="font-extrabold text-slate-100">{t.net_level} {level}</span>
            <span className="text-sky-200 tabular-nums">{atMax ? "MAX" : `${xpCur}/${xpNeed} XP`}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-sky-950/70 overflow-hidden">
            <div className="h-full bg-sky-300 transition-all" style={{ width: atMax ? "100%" : `${(xpCur / xpNeed) * 100}%` }} />
          </div>
          <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-white">
            {t.net_buy_xp}
            <span className="inline-flex items-center gap-0.5 text-gold-200"><CoinIcon size={11} />{ECONOMY.buyXpCost}</span>
            <span className="text-sky-200">+{ECONOMY.buyXpAmount}</span>
          </div>
          {/* The whole level, priced. Highlighted when you can actually afford
              it, because "can I level this round" is the question being asked. */}
          {!atMax && (
            <div className={`flex items-center justify-center gap-1 text-[10px] font-bold leading-none ${gold >= goldToLevel ? "text-gold-200" : "text-slate-400"}`}>
              <span className="uppercase tracking-wide opacity-80">{t.sh_to_level(level + 1)}</span>
              <span className="inline-flex items-center gap-0.5 tabular-nums"><CoinIcon size={10} />{goldToLevel}</span>
            </div>
          )}
        </button>
        {/* Reroll — bigger, with your current gold shown alongside the cost. */}
        <button
          onClick={() => { reroll(); sfx.reroll(); setRerollTick((n) => n + 1); }}
          disabled={gold < ECONOMY.rerollCost}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg bg-slate-700/80 hover:bg-slate-600 disabled:opacity-40 transition-colors"
        >
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-100"><RerollIcon size={16} /> {t.sh_reroll}</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-300">
            <span className="inline-flex items-center gap-0.5"><CoinIcon size={11} />{ECONOMY.rerollCost}</span>
            <span className="text-slate-600">·</span>
            <span className="inline-flex items-center gap-0.5 font-extrabold text-gold-300"><CoinIcon size={12} />{gold}</span>
          </span>
        </button>
      </div>

      {/* Gold — sits between the level/reroll controls and the cards, so the
          number you spend is right next to the things you spend it on and
          aligned with the shop row (TFT puts it in exactly this spot). The
          interest preview rides along, since interest is a function of this
          number and players bank to the next breakpoint. */}
      <div style={{ minWidth: SHOP_M.gold }} className="gilded flex flex-col items-center justify-center gap-0.5 px-3 rounded-lg shrink-0">
        <span className="inline-flex items-center gap-1.5 text-2xl font-extrabold text-gold-300 tabular-nums leading-none drop-shadow">
          <CoinIcon size={20} />
          {gold}
        </span>
        <span className="text-[9px] font-bold uppercase tracking-wide text-gold-200/50 leading-none">
          {t.net_gold_label}
        </span>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
        {/* The odds belong HERE, over the things they are odds ON. They used to
            sit above the Buy XP button, which reads as a property of levelling
            rather than of the shop -- and the one moment you check them is the
            moment you are deciding whether to reroll these five cards.
            The lock rides at the right of the same strip: freeze is a property
            of the shop row, so it lives on the shop row. It was a full labelled
            button in the control column, which gave a toggle you press once a
            round the same weight as reroll, which you press constantly. */}
        <div className="flex items-center gap-2 px-0.5 shrink-0">
          <div className="flex items-center gap-2.5" title={`${t.sh_odds} · Lv ${level}`}>
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 leading-none">{t.sh_odds}</span>
            {odds.map((pct, idx) => {
              const c = COST_COLOR[(idx + 1) as Cost];
              return (
                <span key={idx} className={`flex items-center gap-1 ${pct === 0 ? "opacity-30" : ""}`}>
                  <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: c }} />
                  <span className="text-[10px] font-bold tabular-nums leading-none" style={{ color: pct === 0 ? "#64748b" : c }}>{pct}%</span>
                </span>
              );
            })}
          </div>
          <button
            onClick={() => { toggleFreeze(); if (!frozen) sfx.freeze(); }}
            title={frozen ? t.sh_frozen : t.sh_freeze}
            aria-label={frozen ? t.sh_frozen : t.sh_freeze}
            aria-pressed={frozen}
            className={`ml-auto inline-flex items-center justify-center rounded-md p-1.5 leading-none transition-colors
              ${frozen ? "bg-sky-600 text-white shadow-[0_0_12px_-2px_rgba(56,189,248,0.8)]" : "bg-slate-800/70 hover:bg-slate-700 text-slate-500 hover:text-slate-200"}`}
          >
            {frozen ? <Lock size={13} /> : <LockOpen size={13} />}
          </button>
        </div>
        <div className="flex min-w-0 gap-2 flex-1">
        {shop.map((defId, i) => {
          const key = `${i}-${rerollTick}`;
          const popOverlay = popFx?.slot === i ? (
            <span
              className={`absolute inset-0 pointer-events-none z-30 rounded-lg ${popFx.kind === "combine" ? "shop-combine-burst" : "shop-buy-pop"}`}
            />
          ) : null;
          if (!defId) {
            // Sold/empty slot — same footprint + border treatment as a filled slot
            // so every shop slot stays visually uniform.
            return (
              <div
                key={key}
                className="shop-deal-in relative min-w-0 min-h-0 flex-1 self-stretch rounded-lg border border-slate-700/50 bg-slate-900/30 overflow-hidden"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                {popOverlay}
              </div>
            );
          }
          const def = getDef(defId);
          const color = COST_COLOR[def.cost];
          const affordable = gold >= def.cost;
          const own = owned.get(defId);
          const starIndex = Math.max(0, (own?.topStar ?? 1) - 1);
          const cardTypes = def.typesByStar?.[starIndex] ?? def.types;
          const mainTypeColor = TYPE_COLOR[cardTypes[0]];

          // Star-up progress toward the next tier.
          const copies = own?.copies ?? 0;
          const nextThreshold = copies < COPIES_TO_STAR[2] ? COPIES_TO_STAR[2] : copies < COPIES_TO_STAR[3] ? COPIES_TO_STAR[3] : null;
          const oneFromStar = nextThreshold !== null && nextThreshold - copies === 1;

          return (
            <button
              key={key}
              onClick={() => {
                const starsBefore = units.filter((u) => u.star > 1).map((u) => `${u.defId}-${u.star}`).join();
                buyUnit(i);
                const st = useGame.getState();
                if (st.shop[i] != null) return; // insufficient gold/pool/bench full — buyUnit no-op'd, no fx
                // Detect combine by checking if new 2★/3★ appeared
                const starsAfter = st.units.filter((u) => u.star > 1).map((u) => `${u.defId}-${u.star}`).join();
                const combined = starsAfter !== starsBefore;
                if (combined) sfx.combine();
                else { sfx.buy(); playCry(def.dex[0]); }
                setPopFx({ slot: i, kind: combined ? "combine" : "buy" });
                window.setTimeout(() => setPopFx((cur) => (cur?.slot === i ? null : cur)), 600);
              }}
              disabled={!affordable}
              style={{ borderColor: `${color}aa`, boxShadow: own ? `inset 0 0 0 1.5px ${color}` : undefined, animationDelay: `${i * 40}ms` }}
              className="shop-deal-in shop-card group relative min-w-0 min-h-0 flex-1 self-stretch overflow-hidden rounded-lg border disabled:opacity-50"
            >
              {popOverlay}
              {/* One-from-star: a separate pulsing overlay (not a class on the button
                  itself — it already carries the shop-deal-in `animation`, and a second
                  class setting the same shorthand property would just clobber it). */}
              {oneFromStar && <span className="star-pulse absolute inset-0 pointer-events-none rounded-lg" />}
              {/* Cost-coloured card body (TFT-style): the WHOLE card carries the rarity tint —
                  a vertical wash from the cost colour at the bottom up into the dark top. */}
              <span className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 78% 58%, ${mainTypeColor}55 0%, ${mainTypeColor}20 36%, transparent 72%), linear-gradient(180deg, #0b1020 0%, ${color}1f 60%, ${color}3d 100%)` }} />
              {/* Shop units stay 2D; the main type drives the card's art glow. */}
              {/* Art scales with the shop strip instead of sitting at a fixed
                  140px. The cards got considerably wider when the odds panel
                  was compacted, and a fixed sprite left them looking empty —
                  in the reference the champion art fills its card. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={spriteUrl(def.dex[starIndex])}
                alt=""
                aria-hidden
                draggable={false}
                className="absolute -right-1 -bottom-1 h-auto max-h-full max-w-full object-contain pointer-events-none"
                style={{
                  width: `min(${artSize}px, 100%)`,
                  aspectRatio: "1 / 1",
                  imageRendering: "pixelated",
                  filter: `drop-shadow(0 0 14px ${mainTypeColor}88)`,
                }}
              />
              {/* Left-to-right legibility scrim so the traits/name read over the art. */}
              <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(90deg, rgba(9,13,24,0.92) 30%, rgba(9,13,24,0.45) 60%, rgba(9,13,24,0) 100%)" }} />

              {/* Info button, top-right. */}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setInspect(def.id, own?.topStar === 3 ? 3 : 1); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setInspect(def.id, 1); } }}
                aria-label={t.sh_view_details}
                title={t.sh_view_details}
                className="absolute top-1 right-1 z-20 text-slate-400 hover:text-sky-300 opacity-50 group-hover:opacity-100 transition-opacity cursor-help"
              >
                <InfoIcon size={12} />
              </span>

              {/* Traits with icons, stacked top-left. */}
              <div className="absolute top-2.5 left-2 z-10 flex flex-col items-start gap-1">
                {own && (
                  /* One copy from a star-up is the single most consequential
                     thing a shop card can tell you, and it was whispering it in
                     an 8px chip identical to "2/9". When the next buy completes
                     the tier it now says so outright, in the tier's own colour
                     with the target star — matching the ▲ language the trait
                     chips already use for "this purchase changes something". */
                  <span
                    className={
                      oneFromStar
                        ? "inline-flex items-center gap-0.5 rounded px-1.5 text-[10px] font-extrabold text-black leading-none py-[3px] ring-1 ring-white/80 shop-star-up"
                        : "inline-flex items-center gap-0.5 rounded bg-emerald-500/90 px-1 text-[8px] font-extrabold text-black leading-none py-[2px]"
                    }
                    style={oneFromStar ? { background: nextThreshold === COPIES_TO_STAR[3] ? "#ffc21e" : "#9fb6d4" } : undefined}
                    title={oneFromStar ? t.sh_one_from_star : undefined}
                  >
                    {oneFromStar ? (
                      <>
                        <StarIcon size={9} />
                        {nextThreshold === COPIES_TO_STAR[3] ? 3 : 2}
                        <span aria-hidden>&#9650;</span>
                      </>
                    ) : (
                      <>
                        {own.topStar > 1 && <StarIcon size={7} />}
                        {nextThreshold !== null ? `${copies}/${nextThreshold}` : t.sh_max}
                      </>
                    )}
                  </span>
                )}
                {/* cardTypes (the displayed star's typing) from the model work,
                    with main's trait-gain flag — both sides mattered here. */}
                {cardTypes.map((tt) => (
                  <TraitChip key={tt} traitKey={tt} label={TRAITS_BY_KEY[tt]?.label ?? tt} color={TYPE_COLOR[tt as PokeType]} active={activeTraits.has(tt)} gains={gainsByDef.get(def.id)?.has(tt)} />
                ))}
                {def.roles.map((r) => (
                  <TraitChip key={r} traitKey={r} label={TRAITS_BY_KEY[r]?.label ?? r} color="#94a3b8" active={activeTraits.has(r)} gains={gainsByDef.get(def.id)?.has(r)} />
                ))}
              </div>

              {/* Name bottom-left, cost bottom-right (TFT-style). */}
              <span className="absolute bottom-1.5 left-2 z-10 max-w-[78%] truncate text-[13px] font-extrabold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{def.name}</span>
              <span style={{ color }} className="absolute bottom-1.5 right-2 z-10 inline-flex items-center gap-0.5 text-[11px] font-extrabold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"><CoinIcon size={11} />{def.cost}</span>
            </button>
          );
        })}
        </div>
      </div>
    </div>
  );
}

function TraitChip({
  label, color, active, traitKey, gains,
}: {
  label: string; color: string; active: boolean; traitKey: string;
  /** Buying this unit would activate or step up this synergy. */
  gains?: boolean;
}) {
  return (
    <span
      title={gains ? `${label} — buying this levels it up` : active ? `${label} (active)` : label}
      style={
        gains
          ? ({ background: color, color: "#0b1020", "--trait-glow": color } as CSSProperties)
          : active
            ? { background: `${color}cc`, color: "#0b1020" }
            : { color: "#e2e8f0" }
      }
      className={`inline-flex items-center gap-1 text-[13px] leading-none px-2 py-[3px] rounded font-bold whitespace-nowrap backdrop-blur-sm ${
        gains ? "ring-2 ring-white shop-trait-gain" : active ? "ring-1 ring-white/70" : "bg-slate-950/60"
      }`}
    >
      <TraitGlyph traitKey={traitKey} size={12} />
      {label}
      {/* An explicit arrow, not just a brighter chip: colour alone is the one
          cue a colour-blind player can't use, and this is a decision prompt. */}
      {gains && <span aria-hidden className="text-[11px] leading-none">▲</span>}
    </span>
  );
}

export const ShopBar = memo(ShopBarBase);
