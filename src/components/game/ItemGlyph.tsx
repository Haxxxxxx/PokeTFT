"use client";

import { Sword, Sparkles, Zap, Heart, Shield, Crosshair, Gem, Coins, GraduationCap, Dices, Users, Package, Star, type LucideIcon } from "lucide-react";
import { ITEM_EFFECT } from "@/game/data/items";
import { MEGA_STONE } from "@/game/data/mega";

/** Pick a real (library) icon for an item from WHAT IT DOES — its dominant effect —
 *  so every item shows a meaningful glyph instead of an emoji. */
function itemIcon(id: string): LucideIcon {
  if (id === MEGA_STONE) return Gem;
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
    case "recruiter": case "draft-day": return Users;
    case "treasure": case "component-cache": case "merchant": case "prospector": return Package;
    case "mega-gift": return Gem;
    default: return Star;
  }
}

export function ItemGlyph({ id, size = 16 }: { id: string; size?: number }) {
  const Icon = itemIcon(id);
  return <Icon size={size} />;
}

export function AugmentGlyph({ id, size = 16 }: { id: string; size?: number }) {
  const Icon = augmentIcon(id);
  return <Icon size={size} />;
}
