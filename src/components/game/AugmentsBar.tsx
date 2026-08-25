"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AUGMENT_BY_ID, AUGMENT_TIER_COLOR, teamBuffForAugments } from "@/game/data/augments";
import { AugmentGlyph } from "./ItemGlyph";
import { useAnchoredPopover } from "@/lib/useAnchoredPopover";

/** Summarise the folded team-wide combat buff your augments are applying right now,
 *  as short stat tags — so the player can SEE what their augments are actually doing
 *  in fights, not just a list of names. */
function buffTags(ids: string[], fr: boolean): { label: string; color: string }[] {
  const b = teamBuffForAugments(ids);
  const tags: { label: string; color: string }[] = [];
  const pct = (x: number) => `+${Math.round((x - 1) * 100)}%`;
  if (b.adMult) tags.push({ label: `${pct(b.adMult)} ${fr ? "Att" : "ATK"}`, color: "#fbbf24" });
  if (b.apMult) tags.push({ label: `${pct(b.apMult)} ${fr ? "Spé" : "AP"}`, color: "#c084fc" });
  if (b.asMult) tags.push({ label: `${pct(b.asMult)} ${fr ? "Vit" : "AS"}`, color: "#f5d76e" });
  if (b.hpMult) tags.push({ label: `${pct(b.hpMult)} ${fr ? "PV" : "HP"}`, color: "#ff6b6b" });
  if (b.armorAdd) tags.push({ label: `+${b.armorAdd} ${fr ? "Déf" : "Armor"}`, color: "#9aa4b2" });
  if (b.mrAdd) tags.push({ label: `+${b.mrAdd} ${fr ? "Déf.Spé" : "MR"}`, color: "#a78bfa" });
  if (b.critAdd) tags.push({ label: `+${Math.round(b.critAdd * 100)}% ${fr ? "Crit" : "Crit"}`, color: "#fb7185" });
  if (b.lifeSteal) tags.push({ label: `${Math.round(b.lifeSteal * 100)}% ${fr ? "Vol" : "Lifesteal"}`, color: "#34d399" });
  if (b.manaStart) tags.push({ label: `+${b.manaStart} ${fr ? "Mana" : "Mana"}`, color: "#38bdf8" });
  return tags;
}

/** The owned-augments HUD: compact glyph chips that expand into a detail panel showing
 *  each augment's tier, name, full effect, and the combined team buff currently in play. */
export function AugmentsBar({ augments, lang }: { augments: string[]; lang: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  // Portaled below (see comment there) — this popover needs a viewport-fixed anchor
  // since it can no longer rely on CSS `absolute` positioning off the trigger button.
  const pos = useAnchoredPopover(btnRef, open);
  const fr = lang === "fr";
  if (!augments.length) return null;
  const tags = buffTags(augments, fr);

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        title={fr ? "Augmentations — cliquer pour les détails" : "Augments — click for details"}
        className={`flex items-center gap-1 px-1 py-0.5 rounded-md border transition-colors ${open ? "border-violet-400 bg-violet-900/60" : "border-violet-500/40 bg-violet-900/30 hover:bg-violet-900/50"}`}
      >
        {augments.map((id, i) => {
          const a = AUGMENT_BY_ID[id];
          const color = a ? AUGMENT_TIER_COLOR[a.tier] : "#a78bfa";
          return (
            <span key={i} style={{ color, borderColor: `${color}66` }} className="w-7 h-7 rounded-md bg-black/30 border flex items-center justify-center">
              <AugmentGlyph id={id} size={15} />
            </span>
          );
        })}
      </button>

      {/* Portaled to document.body: this HUD chip lives inside the `tft-shell` game
          canvas, which is scaled via a CSS `transform` — an ancestor `transform` makes
          it the containing block for `position: fixed` descendants, so without the
          portal this popover would be trapped in a local stacking context and could
          render UNDER sibling overlays declared outside the canvas (round banners,
          the augment/carousel picker) no matter its z-index. `useAnchoredPopover`
          supplies the fixed-position coordinates that `absolute right-0` used to. */}
      {open && pos && createPortal(
        <>
          {/* click-away */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div style={{ position: "fixed", top: pos.top, right: pos.right }} className="z-50 w-72 max-w-[80vw] rounded-xl border border-violet-500/40 bg-[#0d1426] shadow-2xl p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-extrabold text-violet-300 uppercase tracking-wide">{fr ? "Augmentations" : "Augments"}</h3>
              <span className="text-[10px] text-slate-500">{augments.length}/3</span>
            </div>

            <div className="flex flex-col gap-1.5">
              {augments.map((id) => {
                const a = AUGMENT_BY_ID[id];
                const color = a ? AUGMENT_TIER_COLOR[a.tier] : "#a78bfa";
                return (
                  <div key={id} style={{ borderColor: `${color}55` }} className="flex items-start gap-2 p-2 rounded-lg border bg-black/20">
                    <span style={{ color, borderColor: `${color}66` }} className="w-7 h-7 shrink-0 rounded-md bg-black/40 border flex items-center justify-center"><AugmentGlyph id={id} size={15} /></span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-bold text-slate-100 truncate">{a ? (fr ? a.nameFr : a.name) : id}</span>
                        {a && <span style={{ color }} className="text-[8px] uppercase font-extrabold tracking-wide">{a.tier}</span>}
                      </div>
                      <p className="text-[10px] text-slate-400 leading-snug">{a ? (fr ? a.descFr : a.desc) : ""}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {tags.length > 0 && (
              <div className="mt-2.5 pt-2.5 border-t border-white/[0.06]">
                <div className="text-[9px] uppercase tracking-wide text-violet-200/60 font-bold mb-1.5">{fr ? "Bonus d'équipe actif" : "Active team buff"}</div>
                <div className="flex flex-wrap gap-1">
                  {tags.map((tag, i) => (
                    <span key={i} style={{ color: tag.color, borderColor: `${tag.color}44` }} className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-black/20">{tag.label}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
