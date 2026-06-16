"use client";

import {
  Circle, Flame, Droplet, Zap, Leaf, Snowflake, Dumbbell, Skull, Mountain, Feather,
  Brain, Bug, Gem, Ghost, Wind, Moon, Cog, Sparkle, Sprout, RefreshCw, Bird, PawPrint,
  Bone, Diamond, Crown, Dna, Sparkles, type LucideIcon,
} from "lucide-react";

/** A real (library) icon for every type + role trait — replaces the old emoji map. */
const TRAIT_LUCIDE: Record<string, LucideIcon> = {
  // types
  normal: Circle, fire: Flame, water: Droplet, electric: Zap, grass: Leaf, ice: Snowflake,
  fighting: Dumbbell, poison: Skull, ground: Mountain, flying: Feather, psychic: Brain, bug: Bug,
  rock: Gem, ghost: Ghost, dragon: Wind, dark: Moon, steel: Cog, fairy: Sparkle,
  // roles
  starter: Sprout, evolver: RefreshCw, swarm: Bird, eeveelution: PawPrint, fossil: Bone,
  "pseudo-legendary": Diamond, legendary: Crown, "kanto-mythic": Dna, mythic: Sparkles,
};

export function TraitGlyph({ traitKey, size = 13 }: { traitKey: string; size?: number }) {
  const Icon = TRAIT_LUCIDE[traitKey] ?? Circle;
  return <Icon size={size} />;
}
