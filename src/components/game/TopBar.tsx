"use client";

import { useGame } from "@/game/store/gameStore";
import { ECONOMY, MAX_LEVEL, XP_TO_REACH, boardSizeForLevel, streakGold } from "@/game/config";
import { interest } from "@/game/engine/economy";
import { CoinIcon } from "./icons";

export function TopBar() {
  const gold = useGame((s) => s.gold);
  const level = useGame((s) => s.level);
  const xp = useGame((s) => s.xp);
  const health = useGame((s) => s.health);
  const stage = useGame((s) => s.stage);
  const round = useGame((s) => s.round);
  const streak = useGame((s) => s.streak);
  const buyXp = useGame((s) => s.buyXp);
  const endRound = useGame((s) => s.endRound);
  const boardCount = useGame((s) => s.units.filter((u) => u.pos !== null).length);

  const atMax = level >= MAX_LEVEL;
  const base = XP_TO_REACH[level];
  const needed = atMax ? null : XP_TO_REACH[level + 1] - base;
  const current = xp - base;

  return (
    <div className="flex items-center gap-5 flex-wrap p-3 rounded-xl bg-slate-900/70 border border-slate-700/50">
      <Stat label="Stage" value={`${stage}-${round}`} />
      <Stat label="Health" value={`${health}`} accent="#ff6b6b" />
      <Stat label="Gold" accent="#fbbf24" value={<span className="inline-flex items-center gap-1"><CoinIcon size={13} />{gold}</span>} />
      <Stat label="Interest" value={`+${interest(gold)}`} />
      <Stat label="Streak" value={`${streak >= 0 ? "Win" : "Loss"} ${Math.abs(streak)} (+${streakGold(streak)})`} />
      <Stat label="Board" value={`${boardCount} / ${boardSizeForLevel(level)}`} />

      <div className="flex flex-col gap-1 min-w-[170px]">
        <div className="flex justify-between text-[11px] text-slate-400">
          <span className="font-semibold text-slate-200">Level {level}</span>
          <span>{needed === null ? "MAX" : `${current} / ${needed} XP`}</span>
        </div>
        <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
          <div className="h-full bg-sky-400 transition-all" style={{ width: needed === null ? "100%" : `${(current / needed) * 100}%` }} />
        </div>
        <button
          onClick={buyXp}
          disabled={gold < ECONOMY.buyXpCost || atMax}
          className="inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded-md bg-sky-700/90 hover:bg-sky-600 disabled:opacity-40 text-[11px] font-semibold"
        >
          Buy XP
          <span className="inline-flex items-center gap-0.5 text-amber-200"><CoinIcon size={11} />{ECONOMY.buyXpCost}</span>
          <span className="text-sky-200">+{ECONOMY.buyXpAmount}</span>
        </button>
      </div>

      <div className="ml-auto flex gap-2">
        <button onClick={() => endRound(true)} className="px-3 py-2 rounded-md bg-emerald-700 hover:bg-emerald-600 text-xs font-bold">
          Win round
        </button>
        <button onClick={() => endRound(false)} className="px-3 py-2 rounded-md bg-rose-800 hover:bg-rose-700 text-xs font-bold">
          Lose round
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className="text-sm font-bold" style={{ color: accent }}>{value}</span>
    </div>
  );
}
