"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/game/store/appStore";
import { spriteUrl } from "@/game/data/mons";
import { Coins, Hexagon, Swords, Sparkles, Keyboard, Gamepad2, type LucideIcon } from "lucide-react";

type Slide = { icon: LucideIcon; dex: number; accent: string; title: { en: string; fr: string }; body: { en: string; fr: string } };

const SLIDES: Slide[] = [
  {
    icon: Gamepad2, dex: 25, accent: "#fbbf24",
    title: { en: "Welcome to PokéTFT", fr: "Bienvenue sur PokéTFT" },
    body: {
      en: "Build a team of Pokémon and auto-battle up to 8 trainers. Lose a fight and you lose HP — the last trainer standing wins.",
      fr: "Construis une équipe de Pokémon et affronte jusqu'à 8 dresseurs. Perdre un combat coûte des PV — le dernier debout gagne.",
    },
  },
  { icon: Coins, dex: 6, accent: "#fb923c",
    title: { en: "Shop & economy", fr: "Boutique & économie" },
    body: {
      en: "Buy Pokémon from the shop with gold. Three copies of one Pokémon merge into a stronger ★★ form (its evolution). Earn interest on saved gold and bonus gold on win/loss streaks.",
      fr: "Achète des Pokémon avec de l'or. Trois exemplaires fusionnent en une forme ★★ (l'évolution). Gagne des intérêts sur ton or et des bonus sur les séries.",
    },
  },
  { icon: Hexagon, dex: 94, accent: "#a78bfa",
    title: { en: "Board & links", fr: "Plateau & synergies" },
    body: {
      en: "Drag Pokémon onto the hex board to fight (your board size = your level). Matching types and roles activate Link bonuses — the synergy panel shows your active links and how close you are to the next tier.",
      fr: "Place tes Pokémon sur le plateau hexagonal (taille = ton niveau). Les types et rôles communs activent des synergies — le panneau montre tes liens actifs et les prochains paliers.",
    },
  },
  { icon: Swords, dex: 149, accent: "#f87171",
    title: { en: "Combat & types", fr: "Combat & types" },
    body: {
      en: "Rounds resolve automatically. Pokémon type-effectiveness applies real damage multipliers, and Mega Stones evolve compatible mons at combat start. Watch the live damage/tank/heal recap to see who's carrying.",
      fr: "Les manches se résolvent automatiquement. L'efficacité des types applique de vrais multiplicateurs, et les Méga-Gemmes méga-évoluent au début du combat. Le récap dégâts/tank/soin montre qui porte l'équipe.",
    },
  },
  { icon: Sparkles, dex: 133, accent: "#34d399",
    title: { en: "Carousel, items & augments", fr: "Carrousel, objets & augments" },
    body: {
      en: "Carousel rounds give a free pick. Equip held items onto your mons for buffs. At stages 2, 3 and 4 you pick a powerful Augment that lasts the whole game.",
      fr: "Les carrousels offrent un choix gratuit. Équipe des objets sur tes Pokémon. Aux stages 2, 3 et 4, choisis un Augment puissant pour toute la partie.",
    },
  },
  { icon: Keyboard, dex: 143, accent: "#60a5fa",
    title: { en: "Shortcuts", fr: "Raccourcis" },
    body: {
      en: "During planning: R rerolls the shop, L buys XP, S sells the inspected unit. Double-click a bench unit to deploy it.",
      fr: "En planification : R relance la boutique, L achète de l'XP, S vend l'unité inspectée. Double-clic sur le banc pour déployer.",
    },
  },
];

export function HowToPlay({ onClose }: { onClose: () => void }) {
  const lang = useAppStore((s) => s.settings.language);
  const [i, setI] = useState(0);
  const s = SLIDES[i];
  const last = i === SLIDES.length - 1;

  // Escape closes the modal, matching the rest of the game's overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-[460px] rounded-xl border border-slate-700 bg-slate-900 overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Hero with sprite + accent glow */}
        <div className="relative flex items-center justify-center pt-9 pb-6" style={{ background: `radial-gradient(80% 100% at 50% 0%, ${s.accent}22, transparent 70%)` }}>
          <button onClick={onClose} aria-label={lang === "fr" ? "Fermer" : "Close"} className="absolute top-3 right-4 text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
          <span className="absolute top-3 left-4 text-[10px] uppercase tracking-widest text-slate-500 font-bold">{lang === "fr" ? "Comment jouer" : "How to play"} · {i + 1}/{SLIDES.length}</span>
          <div className="relative">
            <span className="absolute inset-0 rounded-full blur-2xl" style={{ background: `${s.accent}44` }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={spriteUrl(s.dex)} alt="" width={96} height={96} className="relative" style={{ imageRendering: "pixelated" }} />
            <span className="absolute -bottom-1 -right-1 drop-shadow bg-slate-900/80 rounded-full p-1" style={{ color: s.accent }}><s.icon size={20} /></span>
          </div>
        </div>

        <div className="px-7 pb-7 flex flex-col gap-5">
          <div className="flex flex-col items-center text-center gap-2 min-h-[120px] justify-center">
            <h2 className="text-xl font-extrabold text-slate-100">{s.title[lang]}</h2>
            <p className="text-sm text-slate-400 leading-relaxed">{s.body[lang]}</p>
          </div>

          <div className="flex items-center gap-1.5 justify-center">
            {SLIDES.map((_, k) => (
              <button key={k} onClick={() => setI(k)} className="h-1.5 rounded-full transition-all" style={{ width: k === i ? 20 : 6, background: k === i ? s.accent : "#334155" }} />
            ))}
          </div>

        <div className="flex gap-3">
          {i > 0 && (
            <button onClick={() => setI(i - 1)} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700">
              {lang === "fr" ? "Précédent" : "Back"}
            </button>
          )}
          <button onClick={() => (last ? onClose() : setI(i + 1))} className="flex-1 py-2.5 rounded-xl font-extrabold text-sm bg-amber-500 hover:bg-amber-400 text-black">
            {last ? (lang === "fr" ? "C'est parti !" : "Let's play!") : (lang === "fr" ? "Suivant" : "Next")}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
