"use client";

import type { PlayerSlot as PlayerSlotType, BotDifficulty } from "@/game/store/preLobbyStore";
import { usePreLobby } from "@/game/store/preLobbyStore";
import { useT } from "@/lib/i18n";
import { User, Bot } from "lucide-react";

const DIFFICULTY_COLORS: Record<BotDifficulty, string> = {
  easy: "text-emerald-400 border-emerald-700 bg-emerald-950/40",
  medium: "text-amber-400 border-amber-700 bg-amber-950/40",
  hard: "text-rose-400 border-rose-700 bg-rose-950/40",
};

type Props = {
  slot: PlayerSlotType;
  index: number;
  isHost: boolean;
};

export function PlayerSlot({ slot, index, isHost }: Props) {
  const t = useT();
  const setSlot = usePreLobby((s) => s.setSlot);
  const addBot = usePreLobby((s) => s.addBot);
  const clearSlot = usePreLobby((s) => s.clearSlot);

  const isFirst = index === 0;

  const diffLabels: Record<BotDifficulty, string> = {
    easy: t.p_diff_easy,
    medium: t.p_diff_medium,
    hard: t.p_diff_hard,
  };

  if (slot.type === "empty") {
    return (
      <div className="relative rounded-xl border border-dashed border-slate-700 bg-slate-900/30 p-4 flex flex-col items-center justify-center gap-3 min-h-[110px] transition-colors hover:border-slate-600">
        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">{t.p_slot(index + 1)}</span>
        {isHost && (
          <div className="flex gap-2">
            <button
              onClick={() =>
                setSlot(slot.id, { type: "human", name: `Joueur ${index + 1}`, status: "waiting" })
              }
              className="px-3 py-1.5 rounded-lg bg-sky-800/60 hover:bg-sky-700/80 border border-sky-700 text-sky-300 text-xs font-bold transition-colors"
            >
              {t.p_add_human}
            </button>
            <button
              onClick={() => addBot(slot.id, "medium")}
              className="px-3 py-1.5 rounded-lg bg-violet-900/60 hover:bg-violet-800/80 border border-violet-700 text-violet-300 text-xs font-bold transition-colors"
            >
              {t.p_add_bot}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (slot.type === "human") {
    return (
      <div className="rounded-xl border border-sky-800/60 bg-slate-900/60 p-4 flex flex-col gap-3 min-h-[110px]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">{t.p_slot(index + 1)}</span>
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] uppercase font-bold tracking-wide px-2 py-0.5 rounded-full border ${
                slot.status === "ready"
                  ? "text-emerald-400 border-emerald-700 bg-emerald-950/40"
                  : "text-amber-400 border-amber-700 bg-amber-950/40"
              }`}
            >
              {slot.status === "ready" ? t.p_ready : t.p_waiting}
            </span>
            {isHost && !isFirst && (
              <button
                onClick={() => clearSlot(slot.id)}
                className="text-slate-600 hover:text-rose-400 text-xs transition-colors"
                title={t.p_cancel_btn}
              >
                ✕
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-300"><User size={18} /></span>
          {isFirst ? (
            <input
              value={slot.name}
              onChange={(e) => setSlot(slot.id, { name: e.target.value })}
              placeholder={t.p_username_placeholder}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-600"
            />
          ) : (
            <span className="text-sm font-semibold text-slate-200">{slot.name || `Joueur ${index + 1}`}</span>
          )}
        </div>
        {isFirst && (
          <button
            onClick={() => setSlot(slot.id, { status: slot.status === "ready" ? "waiting" : "ready" })}
            className={`w-full py-1.5 rounded-lg text-xs font-bold border transition-colors ${
              slot.status === "ready"
                ? "bg-slate-800 border-slate-700 text-slate-400 hover:border-rose-700 hover:text-rose-400"
                : "bg-emerald-900/40 border-emerald-700 text-emerald-400 hover:bg-emerald-800/60"
            }`}
          >
            {slot.status === "ready" ? t.p_cancel_btn : t.p_ready_btn}
          </button>
        )}
      </div>
    );
  }

  // Bot slot
  return (
    <div className="rounded-xl border border-violet-800/60 bg-slate-900/60 p-4 flex flex-col gap-3 min-h-[110px]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">{t.p_slot(index + 1)}</span>
        {isHost && (
          <button
            onClick={() => clearSlot(slot.id)}
            className="text-slate-600 hover:text-rose-400 text-xs transition-colors"
            title={t.p_cancel_btn}
          >
            ✕
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-violet-300"><Bot size={18} /></span>
        <span className="text-sm font-semibold text-slate-200">{t.p_bot_name}</span>
        <span className={`text-[10px] uppercase font-bold tracking-wide px-2 py-0.5 rounded-full border ml-auto ${DIFFICULTY_COLORS[slot.botDifficulty]}`}>
          {diffLabels[slot.botDifficulty]}
        </span>
      </div>
      {isHost && (
        <div className="flex gap-1.5">
          {(["easy", "medium", "hard"] as BotDifficulty[]).map((diff) => (
            <button
              key={diff}
              onClick={() => addBot(slot.id, diff)}
              className={`flex-1 py-1 rounded-md text-[10px] font-bold border transition-all ${
                slot.botDifficulty === diff
                  ? DIFFICULTY_COLORS[diff]
                  : "text-slate-600 border-slate-700 bg-slate-800/40 hover:border-slate-600"
              }`}
            >
              {diffLabels[diff]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
