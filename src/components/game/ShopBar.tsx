"use client";

import { useGame } from "@/game/store/gameStore";
import { useUi } from "@/game/store/uiStore";
import { getDef, spriteUrl } from "@/game/data/mons";
import { COST_COLOR, TYPE_COLOR } from "@/game/ui";
import { ECONOMY } from "@/game/config";
import { RerollIcon, SnowIcon, CoinIcon, InfoIcon } from "./icons";

export function ShopBar() {
  const shop = useGame((s) => s.shop);
  const gold = useGame((s) => s.gold);
  const buyUnit = useGame((s) => s.buyUnit);
  const reroll = useGame((s) => s.reroll);
  const frozen = useGame((s) => s.frozen);
  const toggleFreeze = useGame((s) => s.toggleFreeze);
  const setInspect = useUi((s) => s.setInspect);

  return (
    <div className="flex items-stretch gap-2">
      <div className="flex flex-col gap-1.5 justify-center pr-1">
        <button
          onClick={reroll}
          disabled={gold < ECONOMY.rerollCost}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-700/80 hover:bg-slate-600 disabled:opacity-40 text-xs font-semibold"
        >
          <RerollIcon size={13} /> Reroll
          <span className="inline-flex items-center gap-0.5 text-amber-300"><CoinIcon size={11} />{ECONOMY.rerollCost}</span>
        </button>
        <button
          onClick={toggleFreeze}
          className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors
            ${frozen ? "bg-sky-600 text-white" : "bg-slate-700/80 hover:bg-slate-600 text-slate-200"}`}
        >
          <SnowIcon size={13} /> {frozen ? "Frozen" : "Freeze"}
        </button>
      </div>

      <div className="flex gap-2 flex-1">
        {shop.map((defId, i) => {
          if (!defId) {
            return <div key={i} className="flex-1 h-20 rounded-lg border border-slate-800 bg-slate-900/40" />;
          }
          const def = getDef(defId);
          const color = COST_COLOR[def.cost];
          const affordable = gold >= def.cost;
          return (
            <button
              key={i}
              onClick={() => buyUnit(i)}
              disabled={!affordable}
              style={{ borderColor: color }}
              className={`group flex-1 h-20 rounded-lg border bg-slate-900/80 hover:bg-slate-800 disabled:opacity-50
                flex flex-col items-center justify-center relative px-1 transition-colors`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={spriteUrl(def.dex[0])} alt={def.name} width={40} height={40} style={{ imageRendering: "pixelated" }} draggable={false} />
              <span className="text-[11px] font-medium truncate w-full text-center">{def.name}</span>
              <div className="flex gap-0.5 mt-0.5">
                {def.types.map((t) => (
                  <span key={t} style={{ background: TYPE_COLOR[t] }} className="text-[8px] px-1 rounded text-black/80 font-bold uppercase">
                    {t.slice(0, 3)}
                  </span>
                ))}
              </div>
              <span style={{ color }} className="absolute top-1 right-1.5 inline-flex items-center gap-0.5 text-[11px] font-bold">
                <CoinIcon size={11} />{def.cost}
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setInspect(def.id, 1); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setInspect(def.id, 1); } }}
                aria-label="View details"
                title="View details"
                className="absolute top-1 left-1 text-slate-500 hover:text-sky-300 opacity-60 group-hover:opacity-100 transition-opacity cursor-help"
              >
                <InfoIcon size={13} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
