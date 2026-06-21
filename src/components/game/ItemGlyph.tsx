"use client";

import { createElement } from "react";
import { Sword, Sparkles, Zap, Heart, Shield, Crosshair, Gem, Coins, GraduationCap, Dices, Users, Package, Hammer, Star, Utensils, type LucideIcon } from "lucide-react";
import { ITEM_EFFECT, EMBLEM_TRAIT, isEmblem } from "@/game/data/items";
import { MEGA_STONE } from "@/game/data/mega";
import { AUGMENT_BY_ID } from "@/game/data/augments";
import { TraitGlyph } from "./TraitGlyph";

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

export function ItemGlyph({ id, size = 16 }: { id: string; size?: number }) {
  // Emblems show the synergy they grant (the trait's own glyph).
  if (isEmblem(id)) return <TraitGlyph traitKey={EMBLEM_TRAIT[id]} size={size} />;
  // createElement (not <Icon/>) so the icon component isn't re-created each render.
  return createElement(itemIcon(id), { size });
}

export function AugmentGlyph({ id, size = 16 }: { id: string; size?: number }) {
  return createElement(augmentIcon(id), { size });
}
