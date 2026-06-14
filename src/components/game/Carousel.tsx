"use client";

import { useCarousel } from "@/game/store/carouselStore";
import { resolveCarouselFlow } from "@/game/store/flow";
import { getDef, spriteUrl } from "@/game/data/mons";
import { COST_COLOR, TYPE_COLOR } from "@/game/ui";
import { TRAITS_BY_KEY } from "@/game/data/traits";
import { GiftIcon, CoinIcon } from "./icons";
import type { PokeType } from "@/game/types";

export function Carousel() {
  const options = useCarousel((s) => s.options);
  if (!options) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <div className="flex items-center gap-2 mb-1 text-amber-300">
        <GiftIcon size={18} />
        <h2 className="text-lg font-extrabold">Carousel</h2>
      </div>
      <p className="text-xs text-slate-400 mb-5">Pick one free mon for your bench.</p>

      <div className="flex gap-3 flex-wrap justify-center max-w-[760px]">
        {options.map((defId, i) => {
          const def = getDef(defId);
          const color = COST_COLOR[def.cost];
          return (
            <button
              key={`${defId}-${i}`}
              onClick={() => resolveCarouselFlow(defId)}
              style={{ borderColor: color, boxShadow: `0 0 16px -2px ${color}66` }}
              className="w-[130px] rounded-xl border-2 bg-slate-900/80 hover:bg-slate-800 hover:-translate-y-1 transition-all p-3 flex flex-col items-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={spriteUrl(def.dex[0])} alt={def.name} width={56} height={56} style={{ imageRendering: "pixelated" }} draggable={false} />
              <span className="text-sm font-semibold mt-1">{def.name}</span>
              <span style={{ color }} className="inline-flex items-center gap-0.5 text-[11px] font-bold"><CoinIcon size={11} />{def.cost}</span>
              <div className="flex flex-wrap gap-0.5 justify-center mt-1.5">
                {def.types.map((t) => (
                  <span key={t} style={{ background: TYPE_COLOR[t as PokeType] }} className="text-[8px] px-1 rounded text-black/80 font-bold">
                    {TRAITS_BY_KEY[t]?.label ?? t}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
