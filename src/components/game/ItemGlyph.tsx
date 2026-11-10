"use client";

import { createElement } from "react";
import { Sword, Sparkles, Zap, Heart, Shield, Crosshair, Gem, Coins, GraduationCap, Dices, Users, Package, Hammer, Star, Utensils, type LucideIcon } from "lucide-react";
import { ITEM_EFFECT, EMBLEM_TRAIT, isEmblem } from "@/game/data/items";
import { MEGA_STONE } from "@/game/data/mega";
import { AUGMENT_BY_ID } from "@/game/data/augments";
import { TraitGlyph } from "./TraitGlyph";
import { itemIdentity } from "@/game/data/item-identity";

/** Pick a real (library) icon for an item from WHAT IT DOES — its dominant effect —
 *  so every item shows a meaningful glyph instead of an emoji. */
function itemIcon(id: string): LucideIcon {
  if (id === MEGA_STONE) return Gem;
  if (id === "spatula") return Utensils; // the TFT spatula — forges any Trait Emblem
  const e = ITEM_EFFECT[id];
  if (!e) return Sword;
  if (e.armorAdd || e.mrAdd) return Shield;
  if (e.critAdd && e.critAdd >= 0.3) return Crosshair;
  if (e.hpMult && e.hpMult >= 1.3) return Heart;
  if (e.apMult && (!e.adMult || e.apMult >= e.adMult)) return Sparkles;
  if (e.adMult) return Sword;
  if (e.asMult) return Zap;
  if (e.hpMult) return Heart;
  return Sword;
}

/** Library icon for an augment, by id (its reward category). */
function augmentIcon(id: string): LucideIcon {
  switch (id) {
    case "pumped-up": case "pocket-change": case "windfall": case "jackpot": case "rich": case "compound-interest": return Coins;
    case "training": case "study-hall": case "scholar": case "fast-learner": case "big-brain": case "prodigy": return GraduationCap;
    case "lucky": return Dices;
    case "recruiter": case "draft-day": case "head-start": return Users;
    case "treasure": case "component-cache": case "merchant": case "prospector": return Package;
    case "spatula-set": case "trait-trove": return Sparkles;
    case "artisan": case "blacksmith": return Hammer;
    case "mega-gift": return Gem;
    case "veteran": return Coins;
  }
  // Combat augments: derive the glyph from their dominant team buff (matches items).
  const c = AUGMENT_BY_ID[id]?.combat;
  if (c) {
    if (c.critAdd && c.critAdd >= 0.2) return Crosshair;
    if (c.armorAdd || c.mrAdd) return Shield;
    if (c.apMult && (!c.adMult || c.apMult >= c.adMult)) return Sparkles;
    if (c.adMult) return Sword;
    if (c.asMult) return Zap;
    if (c.hpMult) return Heart;
    if (c.lifeSteal) return Heart;
    if (c.manaStart) return Sparkles;
  }
  return Star;
}

/**
 * An item's glyph: a tile carrying its COMPONENT COLOURS, with the effect icon
 * on top.
 *
 * The icon alone could not do this job. 63 items reduce to about 8
 * effect-derived icons, so roughly eight items shared each one — and item pips
 * on a unit render at ~10px, where a silhouette is unreadable anyway. Colour
 * survives that size; a two-tone tile keyed to the item's two components gives
 * every built item a unique, stable signature and teaches the recipe while it
 * does so. See game/data/item-identity.ts.
 */
export function ItemGlyph({ id, size = 16 }: { id: string; size?: number }) {
  // Emblems show the synergy they grant (the trait's own glyph).
  if (isEmblem(id)) return <TraitGlyph traitKey={EMBLEM_TRAIT[id]} size={size} />;

  const identity = itemIdentity(id);
  // createElement (not <Icon/>) so the icon component isn't re-created each render.
  if (identity.kind === "other") return createElement(itemIcon(id), { size });

  const [a, b] = identity.colors;
  const radius = Math.max(2, Math.round(size * 0.22));
  // The icon sits inside the tile, so it has to leave the colours room to read.
  const inner = Math.round(size * 0.62);
  return (
    <span
      className="relative inline-flex items-center justify-center align-middle shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        // A hard 50/50 split, not a blend: two blended hues make a third colour
        // and the pair stops being readable as a pair.
        background:
          identity.kind === "component"
            ? a
            : `linear-gradient(135deg, ${a} 0 50%, ${b} 50% 100%)`,
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.45)",
      }}
    >
      {/* Dark glyph over saturated colour: a white icon disappears on the
          yellow and gold components. */}
      <span className="relative" style={{ color: "rgba(10,14,26,0.82)", lineHeight: 0 }}>
        {createElement(itemIcon(id), { size: inner, strokeWidth: 2.75 })}
      </span>
    </span>
  );
}

export function AugmentGlyph({ id, size = 16 }: { id: string; size?: number }) {
  return createElement(augmentIcon(id), { size });
}
