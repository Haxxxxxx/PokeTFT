"use client";

import { useEffect } from "react";
import { useUi } from "@/game/store/uiStore";
import { getDef, spriteUrl } from "@/game/data/mons";
import { TRAITS_BY_KEY } from "@/game/data/traits";
import { megaFormFor } from "@/game/data/mega";
import { COST_COLOR, TYPE_COLOR } from "@/game/ui";
import type { PokeType } from "@/game/types";
import {
  HeartIcon, SwordIcon, DpsIcon, SpeedIcon, ShieldIcon, MagicIcon,
  TargetIcon, ManaIcon, TierIcon, StarIcon, CoinIcon, CloseIcon, InfoIcon, MegaIcon,
} from "./icons";

const COST_LABEL: Record<number, string> = { 1: "Common", 2: "Uncommon", 3: "Rare", 4: "Epic", 5: "Legendary" };
const SHAPE_DESC: Record<string, string> = {
  single: "Strikes its current target.",
  splash: "Strikes the target and adjacent enemies.",
  line: "Pierces every enemy in a line.",
};

/** Docked detail panel — sits to the right of the board, not a modal. */
export function UnitDetail() {
  const inspect = useUi((s) => s.inspect);
  const clear = useUi((s) => s.clearInspect);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && clear();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clear]);

  return (
    <aside className="w-[300px] shrink-0">
      <div className="sticky top-4">
        {inspect ? <Card key={`${inspect.defId}-${inspect.star}`} /> : <EmptyState />}
      </div>
    </aside>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-900/50 p-6 text-center">
      <div className="flex justify-center text-slate-600 mb-2"><InfoIcon size={22} /></div>
      <p className="text-xs text-slate-500 leading-relaxed">
        Click a mon on the board, bench, or shop to inspect its stats and ability.
      </p>
    </div>
  );
}

function Card() {
  const inspect = useUi((s) => s.inspect)!;
  const clear = useUi((s) => s.clearInspect);
  const def = getDef(inspect.defId);
  const star = inspect.star;
  const i = star - 1;
  const s = def.stats;
  const color = COST_COLOR[def.cost];
  const dps = Math.round(s.ad[i] * s.attackSpeed);
  const rangeLabel = s.range <= 1 ? "Melee" : `${s.range} hexes`;

  return (
    <div
      style={{ borderColor: `${color}aa`, boxShadow: `0 10px 40px -12px ${color}44` }}
      className="rounded-2xl border bg-[#0d1426] text-slate-100 overflow-hidden"
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
            {COST_LABEL[def.cost]}
            <span className="text-slate-600">·</span>
            <span className="inline-flex items-center gap-1 text-amber-300/90"><CoinIcon size={11} />{def.cost}</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {def.types.map((t) => (
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

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-px bg-white/5">
        <StatCell icon={<HeartIcon />} label="Health" value={s.hp[i]} tint="#ff6b6b" />
        <StatCell icon={<SwordIcon />} label="Attack" value={s.ad[i]} tint="#ffb454" />
        <StatCell icon={<DpsIcon />} label="DPS" value={dps} tint="#ff8e8e" />
        <StatCell icon={<SpeedIcon />} label="Atk Spd" value={s.attackSpeed.toFixed(2)} tint="#f5d76e" />
        <StatCell icon={<ShieldIcon />} label="Armor" value={s.armor} tint="#9aa4b2" />
        <StatCell icon={<MagicIcon />} label="Mag Res" value={s.magicResist} tint="#a78bfa" />
        <StatCell icon={<TargetIcon />} label="Range" value={rangeLabel} tint="#5eead4" />
        <StatCell icon={<ManaIcon />} label="Mana" value={`${s.startMana}/${s.maxMana}`} tint="#38bdf8" />
        <StatCell icon={<TierIcon />} label="Tier" value={`${star}/3`} tint="#fbbf24" />
      </div>

      {/* Ability */}
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] uppercase tracking-widest text-slate-500">Ability</span>
          <Badge color={TYPE_COLOR[def.move.type]} text={traitLabel(def.move.type)} solid />
          <span className="ml-auto text-[10px] text-slate-400">Mana {s.maxMana}</span>
        </div>
        <h3 className="font-bold text-sky-300 text-sm">{def.move.name}</h3>
        <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
          Deals <b className="text-amber-300">{def.move.power[i]}</b> {def.move.type} damage.{" "}
          {SHAPE_DESC[def.move.shape]} Type-effectiveness multiplies the damage.
        </p>
        <div className="flex items-center gap-2 mt-2.5 text-[10px]">
          <span className="text-slate-500 uppercase tracking-wide">Per star</span>
          <div className="flex items-center gap-1">
            {def.move.power.map((p, idx) => (
              <span key={idx} className={`px-1.5 py-0.5 rounded ${idx === i ? "bg-sky-500/20 text-sky-200 font-semibold" : "text-slate-500"}`}>
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Mega Evolution callout */}
      {megaFormFor(def.id) && (
        <div className="mx-3 mb-3 p-2.5 rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/10 flex items-center gap-3">
          <div className="rounded-lg bg-black/30 p-1 border border-fuchsia-500/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={spriteUrl(megaFormFor(def.id)!.megaDex)} alt="" width={44} height={44} style={{ imageRendering: "pixelated" }} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-fuchsia-200 text-xs font-bold">
              <MegaIcon size={13} /> {megaFormFor(def.id)!.name}
            </div>
            <p className="text-[10px] text-slate-300 leading-snug mt-0.5">
              Holds a <span className="text-fuchsia-300 font-semibold">Mega Stone</span> → Mega Evolves at combat start
              (+{Math.round((megaFormFor(def.id)!.hpMult - 1) * 100)}% HP, +{Math.round((megaFormFor(def.id)!.adMult - 1) * 100)}% ATK, +{Math.round((megaFormFor(def.id)!.apMult - 1) * 100)}% ability).
            </p>
          </div>
        </div>
      )}
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

function StatCell({ icon, label, value, tint }: { icon: React.ReactNode; label: string; value: string | number; tint: string }) {
  return (
    <div className="bg-[#0d1426] px-2.5 py-2">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide" style={{ color: tint }}>
        <span className="opacity-90">{icon}</span>
        <span className="text-slate-400">{label}</span>
      </div>
      <div className="text-sm font-bold mt-0.5">{value}</div>
    </div>
  );
}
