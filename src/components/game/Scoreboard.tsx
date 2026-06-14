"use client";

import { useGame } from "@/game/store/gameStore";
import { useLobby } from "@/game/store/lobbyStore";
import { useUi } from "@/game/store/uiStore";
import { getDef, spriteUrl } from "@/game/data/mons";
import type { UnitInstance } from "@/game/types";

type Row = {
  id: string;
  name: string;
  health: number;
  level: number;
  board: UnitInstance[];
  isHuman: boolean;
  alive: boolean;
};

/** Pick a representative sprite (the priciest, highest-star mon on the board). */
function avatarDex(board: UnitInstance[]): number | null {
  const placed = board.filter((u) => u.pos !== null);
  const pool = placed.length ? placed : board;
  if (pool.length === 0) return null;
  const best = pool.reduce((a, b) => {
    const av = getDef(a.defId).cost * 10 + a.star;
    const bv = getDef(b.defId).cost * 10 + b.star;
    return bv > av ? b : a;
  });
  return getDef(best.defId).dex[best.star - 1];
}

function hpColor(h: number): string {
  if (h > 50) return "#34d399";
  if (h > 25) return "#fbbf24";
  return "#f87171";
}

export function Scoreboard() {
  const health = useGame((s) => s.health);
  const level = useGame((s) => s.level);
  const units = useGame((s) => s.units);
  const players = useLobby((s) => s.players);
  const viewId = useUi((s) => s.viewPlayerId);
  const setView = useUi((s) => s.setView);

  const rows: Row[] = [
    { id: "human", name: "You", health, level, board: units, isHuman: true, alive: health > 0 },
    ...players.map((p) => ({ id: p.id, name: p.name, health: p.health, level: p.level, board: p.board, isHuman: false, alive: p.alive })),
  ].sort((a, b) => Number(b.alive) - Number(a.alive) || b.health - a.health);

  return (
    <div className="w-[176px] shrink-0 p-2 rounded-xl bg-slate-900/70 border border-slate-700/50">
      <h2 className="text-[10px] uppercase tracking-wider text-slate-500 px-1 mb-1.5">Trainers</h2>
      <div className="flex flex-col gap-1">
        {rows.map((row, i) => {
          const selected = row.isHuman ? viewId === null : viewId === row.id;
          const dex = avatarDex(row.board);
          return (
            <button
              key={row.id}
              onClick={() => setView(row.isHuman ? null : row.id)}
              disabled={!row.alive}
              className={`flex items-center gap-2 px-1.5 py-1 rounded-lg text-left transition-colors
                ${selected ? "bg-slate-700/80 ring-1 ring-sky-500/60" : "hover:bg-slate-800/60"}
                ${!row.alive ? "opacity-40" : ""}`}
            >
              <span className="w-4 text-[10px] text-slate-500 font-bold text-center">{i + 1}</span>
              <span className="relative w-8 h-8 rounded-md bg-black/40 border border-slate-700 flex items-center justify-center shrink-0">
                {dex ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={spriteUrl(dex)} alt="" width={26} height={26} style={{ imageRendering: "pixelated" }} draggable={false} />
                ) : (
                  <span className="text-[9px] text-slate-600">—</span>
                )}
                <span className="absolute -bottom-1 -right-1 text-[8px] font-bold bg-slate-800 border border-slate-600 rounded px-0.5 leading-tight">
                  {row.level}
                </span>
              </span>
              <span className="flex-1 min-w-0">
                <span className={`block text-[11px] font-semibold truncate ${row.isHuman ? "text-amber-300" : "text-slate-200"}`}>
                  {row.name}
                </span>
                <span className="flex items-center gap-1">
                  <span className="flex-1 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                    <span className="block h-full rounded-full" style={{ width: `${Math.max(0, row.health)}%`, background: hpColor(row.health) }} />
                  </span>
                  <span className="text-[10px] tabular-nums text-slate-400 w-6 text-right">{Math.max(0, row.health)}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
