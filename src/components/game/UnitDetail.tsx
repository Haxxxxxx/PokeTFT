"use client";

import { useEffect } from "react";
import { useUi } from "@/game/store/uiStore";
import { useGame } from "@/game/store/gameStore";
import { useAppStore } from "@/game/store/appStore";
import { getDef, spriteUrl, archetypeOf, castEffectOf, typesForStar, type Archetype, type CastEffect } from "@/game/data/mons";
import { TRAITS_BY_KEY } from "@/game/data/traits";
import { ITEM_POOL, RARITY_COLOR } from "@/game/data/itemPool";
import { ITEM_EFFECT } from "@/game/data/items";
import { ItemGlyph } from "./ItemGlyph";
import { megaFormFor, MEGA_STONE } from "@/game/data/mega";
import { COST_COLOR, TYPE_COLOR } from "@/game/ui";
import type { PokeType } from "@/game/types";
import {
  HeartIcon, SwordIcon, DpsIcon, SpeedIcon, ShieldIcon, MagicIcon,
  TargetIcon, ManaIcon, TierIcon, StarIcon, CoinIcon, CloseIcon, InfoIcon, MegaIcon,
} from "./icons";
import { useT } from "@/lib/i18n";
import { playCry } from "@/lib/audio";

/** Copy + accent for each signature cast flavour, shown on the ability card. */
const CAST_EFFECT_META: Record<Exclude<CastEffect, "nuke">, { color: string; label: { en: string; fr: string }; desc: { en: string; fr: string } }> = {
  guard:   { color: "#fbbf24", label: { en: "Guardian", fr: "Gardien" },   desc: { en: "Heals itself when it casts.", fr: "Se soigne en lançant sa capacité." } },
  heal:    { color: "#34d399", label: { en: "Mender", fr: "Soigneur" },     desc: { en: "Also mends the most-wounded ally.", fr: "Soigne aussi l'allié le plus blessé." } },
  blast:   { color: "#f472b6", label: { en: "Cataclysm", fr: "Cataclysme" },desc: { en: "Hits every enemy at once.", fr: "Frappe tous les ennemis à la fois." } },
  execute: { color: "#fb7185", label: { en: "Executioner", fr: "Bourreau" },desc: { en: "Bonus damage to low-HP targets.", fr: "Dégâts bonus sur cibles affaiblies." } },
};

/** Docked detail panel — sits to the right of the board, not a modal. Shows the
 *  inspected mon OR a held/inventory item's details. */
export function UnitDetail() {
  const inspect = useUi((s) => s.inspect);
  const inspectedItem = useUi((s) => s.inspectedItem);
  const clear = useUi((s) => s.clearInspect);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && clear();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clear]);

  return (
    <div data-inspectable className="w-full h-full min-h-0">
      {inspectedItem ? <ItemCard id={inspectedItem} />
        : inspect ? <Card key={`${inspect.defId}-${inspect.star}`} />
        : <EmptyState />}
    </div>
  );
}

/** Detail card for an inventory item (clicked in the ItemsPanel). */
function ItemCard({ id }: { id: string }) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.language);
  const setInspectedItem = useUi((s) => s.setInspectedItem);
  const isMega = id === MEGA_STONE;
  const def = ITEM_DEF[id];
  const name = isMega ? t.it_mega_stone : (lang === "fr" ? def?.nameFr : def?.name) ?? id;
  const effect = isMega ? t.ud_mega_effect : (lang === "fr" ? def?.textFr : def?.text) ?? "";
  const color = isMega ? "#c084fc" : def ? RARITY_COLOR[def.rarity] : "#a78bfa";
  return (
    <div style={{ borderColor: `${color}aa`, boxShadow: `0 10px 40px -12px ${color}44` }} className="rounded-xl border bg-[#0d1426] text-slate-100 overflow-hidden">
      <div className="flex items-start gap-3 p-3 border-b border-white/5" style={{ background: `linear-gradient(105deg, ${color}1f, transparent 70%)` }}>
        <div style={{ borderColor: `${color}99` }} className="rounded-xl border bg-black/30 w-14 h-14 flex items-center justify-center text-3xl shrink-0">
          {isMega ? <MegaIcon size={34} /> : <ItemGlyph id={id} size={30} />}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold tracking-tight">{name}</h2>
          <span className="text-[10px] uppercase tracking-wide" style={{ color }}>{isMega ? t.it_mega_stone : t.it_held_item}</span>
        </div>
        <button onClick={() => setInspectedItem(null)} aria-label="Close" className="text-slate-500 hover:text-white shrink-0"><CloseIcon size={16} /></button>
      </div>
      <p className="text-[12px] text-slate-300 leading-relaxed p-3">{effect}</p>
      <div className="px-3 pb-3">
        <p className="text-[11px] text-center text-slate-400 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
          {isMega ? t.it_equip_mega : t.it_drag_equip}
        </p>
      </div>
    </div>
  );
}

function EmptyState() {
  const t = useT();
  return (
    <div className="h-full min-h-[120px] rounded-xl border border-slate-700/50 bg-slate-900/50 p-6 text-center flex flex-col items-center justify-center">
      <div className="flex justify-center text-slate-600 mb-2"><InfoIcon size={22} /></div>
      <p className="text-xs text-slate-500 leading-relaxed">{t.ud_click_hint}</p>
    </div>
  );
}

const ARCH_META: Record<Archetype, { en: string; fr: string; color: string }> = {
  physical: { en: "Physical", fr: "Physique", color: "#fb923c" },
  tank: { en: "Tank", fr: "Tank", color: "#94a3b8" },
  mage: { en: "Mage", fr: "Mage", color: "#c084fc" },
};

function Card() {
  const t = useT();
  const lang = useAppStore((s) => s.settings.language);
  const inspect = useUi((s) => s.inspect)!;
  const clear = useUi((s) => s.clearInspect);
  // The inspected mon's held items (if it's an owned instance) drive the LIVE stats
  // below, so the panel reflects what the mon actually fights with.
  const heldUnit = useGame((st) => (inspect.iid ? st.units.find((u) => u.iid === inspect.iid) : undefined));
  const heldItems = heldUnit?.items ?? [];
  const def = getDef(inspect.defId);
  const arch = ARCH_META[archetypeOf(def)];
  const star = inspect.star;
  const i = star - 1;
  const s = def.stats;
  const color = COST_COLOR[def.cost];

  // Apply held-item modifiers exactly like the combat engine (capped at ×2.6 to
  // match its anti-stacking cap), so the numbers shown == the numbers fought with.
  const CAP = 2.6;
  const m = { adMult: 1, apMult: 1, asMult: 1, hpMult: 1, armorAdd: 0, mrAdd: 0, critAdd: 0 };
  for (const id of heldItems) {
    const e = ITEM_EFFECT[id];
    if (!e) continue;
    m.adMult *= e.adMult ?? 1; m.apMult *= e.apMult ?? 1; m.asMult *= e.asMult ?? 1; m.hpMult *= e.hpMult ?? 1;
    m.armorAdd += e.armorAdd ?? 0; m.mrAdd += e.mrAdd ?? 0; m.critAdd += e.critAdd ?? 0;
  }
  const cap = (x: number) => Math.min(CAP, x);
  const eHp = Math.round(s.hp[i] * cap(m.hpMult));
  const eAd = Math.round(s.ad[i] * cap(m.adMult));
  const eAs = +(s.attackSpeed * cap(m.asMult)).toFixed(2);
  const eArmor = s.armor + m.armorAdd;
  const eMr = s.magicResist + m.mrAdd;
  const eAp = Math.round(def.move.power[i] * cap(m.apMult)); // ability power (magic dmg)
  const dps = Math.round(eAd * eAs);
  const rangeLabel = s.range <= 1 ? t.ud_melee : t.ud_hexes(s.range);
  const costLabel: Record<number, string> = { 1: t.ud_cost_common, 2: t.ud_cost_uncommon, 3: t.ud_cost_rare, 4: t.ud_cost_epic, 5: t.ud_cost_legendary };
  const shapeDesc: Record<string, string> = { single: t.ud_shape_single, splash: t.ud_shape_splash, line: t.ud_shape_line };

  return (
    <div
      style={{ borderColor: `${color}66`, boxShadow: `0 12px 36px -20px rgba(0,0,0,0.85)` }}
      className="rounded-xl border bg-[#0d1426] text-slate-100 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-3 border-b border-white/5" style={{ background: `linear-gradient(105deg, ${color}1f, transparent 70%)` }}>
        <div style={{ borderColor: `${color}99` }} className="rounded-xl border bg-black/30 p-1 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={spriteUrl(def.dex[i])} alt={def.name} width={56} height={56} style={{ imageRendering: "pixelated" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="text-base font-bold tracking-tight truncate">{def.stageNames[i]}</h2>
            <span className="flex items-center gap-px text-amber-300 shrink-0">
              {Array.from({ length: star }).map((_, k) => <StarIcon key={k} size={12} />)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium mt-0.5" style={{ color }}>
            {costLabel[def.cost]}
            <span className="text-slate-600">·</span>
            <span className="inline-flex items-center gap-1 text-amber-300/90"><CoinIcon size={11} />{def.cost}</span>
            <span className="text-slate-600">·</span>
            <span style={{ background: arch.color }} className="text-[9px] px-1.5 py-0.5 rounded font-extrabold text-black/85 uppercase tracking-wide">
              {lang === "fr" ? arch.fr : arch.en}
            </span>
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {typesForStar(def, star).map((t) => (
              <Badge key={t} color={TYPE_COLOR[t as PokeType]} text={traitLabel(t)} solid />
            ))}
            {def.roles.map((r) => (
              <Badge key={r} color="#64748b" text={traitLabel(r)} />
            ))}
          </div>
        </div>
        <button onClick={clear} aria-label="Close" className="text-slate-500 hover:text-white transition-colors shrink-0">
          <CloseIcon size={16} />
        </button>
      </div>

      {/* Stats grid — values reflect held items (buffed stats glow emerald). */}
      <div className="grid grid-cols-3 gap-px bg-white/5">
        <StatCell icon={<HeartIcon />} label={t.ud_stat_health} value={eHp} tint="#ff6b6b" buffed={eHp !== s.hp[i]} />
        <StatCell icon={<SwordIcon />} label={t.ud_stat_attack} value={eAd} tint="#ffb454" buffed={eAd !== s.ad[i]} />
        <StatCell icon={<DpsIcon />} label={t.ud_stat_dps} value={dps} tint="#ff8e8e" buffed={dps !== Math.round(s.ad[i] * s.attackSpeed)} />
        <StatCell icon={<SpeedIcon />} label={t.ud_stat_aspd} value={eAs.toFixed(2)} tint="#f5d76e" buffed={eAs !== s.attackSpeed} />
        <StatCell icon={<MagicIcon />} label={lang === "fr" ? "Magie" : "Magic"} value={eAp} tint="#c084fc" buffed={m.apMult !== 1} />
        <StatCell icon={<ShieldIcon />} label={t.ud_stat_armor} value={eArmor} tint="#9aa4b2" buffed={eArmor !== s.armor} />
        <StatCell icon={<MagicIcon />} label={t.ud_stat_mr} value={eMr} tint="#a78bfa" buffed={eMr !== s.magicResist} />
        <StatCell icon={<TargetIcon />} label={t.ud_stat_range} value={rangeLabel} tint="#5eead4" />
        <StatCell icon={<ManaIcon />} label={t.ud_stat_mana} value={`${s.startMana}/${s.maxMana}`} tint="#38bdf8" />
        <StatCell icon={<TierIcon />} label={t.ud_stat_tier} value={`${star}/3`} tint="#fbbf24" />
      </div>

      {/* Ability */}
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">{t.ud_ability}</span>
          <Badge color={TYPE_COLOR[def.move.type]} text={traitLabel(def.move.type)} solid />
          <span className="ml-auto text-[10px] text-slate-400">{t.ud_mana_label} {s.maxMana}</span>
        </div>
        <h3
          className="font-bold text-sky-300 text-sm cursor-pointer hover:text-sky-200 transition-colors"
          onClick={() => playCry(def.dex[i])}
          title={t.ud_play_cry}
        >
          {def.move.name}
        </h3>
        <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
          {t.ud_deals(def.move.power[i], def.move.type)}{" "}
          {shapeDesc[def.move.shape]} {t.ud_type_eff}
        </p>
        {/* Signature cast flavour (heal / guard / blast / execute) — what makes this
            mon's ability distinct beyond raw typed damage. */}
        {(() => {
          const ce = castEffectOf(def);
          if (ce === "nuke") return null;
          const meta = CAST_EFFECT_META[ce];
          return (
            <p className="mt-1.5 text-[10px] leading-snug" style={{ color: meta.color }}>
              <span className="font-bold">✦ {meta.label[lang === "fr" ? "fr" : "en"]}</span>
              <span className="text-slate-400"> — {meta.desc[lang === "fr" ? "fr" : "en"]}</span>
            </p>
          );
        })()}
        <div className="flex items-center gap-2 mt-2.5 text-[10px]">
          <span className="text-slate-500 uppercase tracking-wide">{t.ud_per_star}</span>
          <div className="flex items-center gap-1">
            {def.move.power.map((p, idx) => (
              <span key={idx} className={`px-1.5 py-0.5 rounded ${idx === i ? "bg-sky-500/20 text-sky-200 font-semibold" : "text-slate-500"}`}>
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Held items — effects + unequip (back to inventory). */}
      <HeldItems iid={inspect.iid} />

      {/* Mega Evolution callout — shows the form's combat identity so the player knows
          what the stone will do (a physical bruiser vs a special wall etc.). */}
      {megaFormFor(def.id) && (() => {
        const mf = megaFormFor(def.id)!;
        const pct = (x: number) => Math.round((x - 1) * 100);
        return (
        <div className="mx-3 mb-3 p-2.5 rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/10 flex items-start gap-3">
          <div className="rounded-lg bg-black/30 p-1 border border-fuchsia-500/40 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={spriteUrl(mf.megaDex)} alt="" width={44} height={44} style={{ imageRendering: "pixelated" }} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-fuchsia-200 text-xs font-bold flex-wrap">
              <MegaIcon size={13} /> {mf.name}
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-fuchsia-500/25 text-fuchsia-100 uppercase tracking-wide font-extrabold">
                {lang === "fr" ? mf.roleLabelFr : mf.roleLabel}
              </span>
              {mf.addType && <Badge color={TYPE_COLOR[mf.addType]} text={`+${traitLabel(mf.addType)}`} solid />}
            </div>
            <p className="text-[10px] text-slate-300 leading-snug mt-1">
              {lang === "fr" ? "Tient une " : "Holds a "}<span className="text-fuchsia-300 font-semibold">Mega Stone</span>
              {lang === "fr" ? " → Méga-Évolue au combat" : " → Mega Evolves at combat start"}.
            </p>
            <div className="flex flex-wrap gap-1 mt-1.5 text-[9px] font-bold">
              <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300">+{pct(mf.hpMult)}% HP</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">+{pct(mf.adMult)}% ATK</span>
              <span className="px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300">+{pct(mf.apMult)}% {lang === "fr" ? "Spé" : "AP"}</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-300">+{mf.armorBonus} {lang === "fr" ? "Déf" : "Armor"}</span>
              <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300">+{mf.mrBonus} {lang === "fr" ? "Déf.Spé" : "MR"}</span>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

const ITEM_DEF = Object.fromEntries(ITEM_POOL.map((i) => [i.id, i]));

/** The inspected unit's held items, with effect text and an unequip button. */
function HeldItems({ iid }: { iid?: string }) {
  const t = useT();
  const unit = useGame((s) => (iid ? s.units.find((u) => u.iid === iid) : undefined));
  const unequipItem = useGame((s) => s.unequipItem);
  const lang = useAppStore((s) => s.settings.language);
  const items = unit?.items ?? [];
  if (!iid || !unit || items.length === 0) return null;
  return (
    <div className="mx-3 mb-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">{t.it_held_items} · {items.length}/3</div>
      <div className="flex flex-col gap-1.5">
        {items.map((id, i) => {
          const isMega = id === MEGA_STONE;
          const def = ITEM_DEF[id];
          return (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-slate-700/60 bg-slate-800/40">
              <span className="text-lg shrink-0">{isMega ? <MegaIcon size={18} /> : <ItemGlyph id={id} size={16} />}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold text-slate-200">{isMega ? t.it_mega_stone : (lang === "fr" ? def?.nameFr : def?.name) ?? id}</div>
                <div className="text-[10px] text-slate-400 leading-snug">{isMega ? t.ud_mega_at_start : (lang === "fr" ? def?.textFr : def?.text) ?? ""}</div>
              </div>
              <button
                onClick={() => unequipItem(unit.iid, id)}
                title="Unequip (back to inventory)"
                className="shrink-0 w-6 h-6 rounded-md bg-slate-900 hover:bg-rose-900/60 border border-slate-600 text-slate-400 hover:text-rose-300 flex items-center justify-center"
              >
                <CloseIcon size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function traitLabel(key: string): string {
  return TRAITS_BY_KEY[key]?.label ?? key;
}

function Badge({ color, text, solid }: { color: string; text: string; solid?: boolean }) {
  return solid ? (
    <span style={{ background: color }} className="text-[10px] px-1.5 py-0.5 rounded font-bold text-black/85">{text}</span>
  ) : (
    <span style={{ borderColor: `${color}88`, color: "#cbd5e1" }} className="text-[10px] px-1.5 py-0.5 rounded border font-semibold">{text}</span>
  );
}

function StatCell({ icon, label, value, tint, buffed }: { icon: React.ReactNode; label: string; value: string | number; tint: string; buffed?: boolean }) {
  return (
    <div className="bg-[#0d1426] px-2.5 py-2">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide" style={{ color: tint }}>
        <span className="opacity-90">{icon}</span>
        <span className="text-slate-400">{label}</span>
      </div>
      <div className={`text-sm font-bold mt-0.5 ${buffed ? "text-emerald-300" : ""}`}>
        {value}{buffed && <span className="ml-1 text-[9px] align-top">▲</span>}
      </div>
    </div>
  );
}
