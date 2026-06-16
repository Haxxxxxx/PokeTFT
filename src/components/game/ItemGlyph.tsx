"use client";

import type * as React from "react";
import { ITEM_EFFECT } from "@/game/data/items";
import { MEGA_STONE } from "@/game/data/mega";
import {
  SwordIcon, MagicIcon, SpeedIcon, HeartIcon, ShieldIcon, TargetIcon, MegaIcon,
  CoinIcon, TierIcon, RerollIcon, PokeballIcon, GiftIcon, StarIcon,
} from "./icons";

type IconC = React.FC<{ size?: number }>;

/** Pick a real icon for an item from WHAT IT DOES (its dominant effect), so every
 *  item shows a meaningful glyph instead of an emoji. */
function itemIcon(id: string): IconC {
  if (id === MEGA_STONE) return MegaIcon;
  const e = ITEM_EFFECT[id];
  if (!e) return SwordIcon;
  if (e.armorAdd || e.mrAdd) return ShieldIcon;
  if (e.critAdd && e.critAdd >= 0.3) return TargetIcon;
  if (e.hpMult && e.hpMult >= 1.3) return HeartIcon;
  if (e.apMult && (!e.adMult || e.apMult >= e.adMult)) return MagicIcon;
  if (e.adMult) return SwordIcon;
  if (e.asMult) return SpeedIcon;
  if (e.hpMult) return HeartIcon;
  return SwordIcon;
}

/** Real icon for an augment, by id (its reward category). */
function augmentIcon(id: string): IconC {
  switch (id) {
    case "pumped-up": case "windfall": case "rich": case "compound-interest": return CoinIcon;
    case "training": case "scholar": case "fast-learner": case "big-brain": return TierIcon;
    case "lucky": return RerollIcon;
    case "recruiter": case "draft-day": return PokeballIcon;
    case "treasure": case "component-cache": return GiftIcon;
    case "mega-gift": return MegaIcon;
    default: return StarIcon;
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
