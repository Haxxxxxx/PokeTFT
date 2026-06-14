"use client";

import { useEffect, useRef, useState } from "react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, useDroppable } from "@dnd-kit/core";
import { useGame } from "@/game/store/gameStore";
import { useCombat } from "@/game/store/combatStore";
import { useLobby } from "@/game/store/lobbyStore";
import { useUi } from "@/game/store/uiStore";
import { startCombatFlow, resolveCombatFlow } from "@/game/store/flow";
import { TopBar } from "./TopBar";
import { Board } from "./Board";
import { Bench } from "./Bench";
import { ShopBar } from "./ShopBar";
import { TraitPanel } from "./TraitPanel";
import { UnitDetail } from "./UnitDetail";
import { Scoreboard } from "./Scoreboard";
import { CombatStage } from "./CombatStage";

const PLAN_TIME = 30;

function SellZone() {
  const { setNodeRef, isOver } = useDroppable({ id: "sell" });
  return (
    <div
      ref={setNodeRef}
      className={`flex items-center justify-center px-5 rounded-xl border-2 border-dashed text-xs font-bold uppercase tracking-wide transition-colors
        ${isOver ? "border-rose-400 bg-rose-500/20 text-rose-200" : "border-slate-700 text-slate-500"}`}
    >
      Drag here to sell
    </div>
  );
}

function RoundTimer({ seconds }: { seconds: number }) {
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, "0");
  const low = seconds <= 5;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-slate-500 uppercase tracking-wide">Planning</span>
      <span className={`font-bold tabular-nums ${low ? "text-rose-400" : "text-slate-200"}`}>{mm}:{ss}</span>
      <div className="w-28 h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full ${low ? "bg-rose-400" : "bg-sky-400"} transition-all`} style={{ width: `${(seconds / PLAN_TIME) * 100}%` }} />
      </div>
    </div>
  );
}

export function GameClient() {
  const newGame = useGame((s) => s.newGame);
  const moveToBoard = useGame((s) => s.moveToBoard);
  const moveToBench = useGame((s) => s.moveToBench);
  const sell = useGame((s) => s.sell);
  const stage = useGame((s) => s.stage);
  const round = useGame((s) => s.round);
  const health = useGame((s) => s.health);
  const initLobby = useLobby((s) => s.init);
  const players = useLobby((s) => s.players);
  const combatResult = useCombat((s) => s.result);
  const opponentName = useCombat((s) => s.opponentName);
  const viewId = useUi((s) => s.viewPlayerId);
  const setView = useUi((s) => s.setView);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [secs, setSecs] = useState(PLAN_TIME);
  const deadlineRef = useRef(0);

  useEffect(() => {
    newGame();
    initLobby();
  }, [newGame, initLobby]);

  // One effect owns the planning countdown. It re-arms a deadline whenever the
  // round changes or combat ends, and only ever calls setState from the interval
  // callback (never synchronously in the effect body).
  useEffect(() => {
    if (combatResult || health <= 0) return;
    deadlineRef.current = performance.now() + PLAN_TIME * 1000;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - performance.now()) / 1000));
      setSecs(remaining);
      if (remaining <= 0) startCombatFlow();
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [combatResult, health, stage, round]);

  function onDragEnd(e: DragEndEvent) {
    const iid = String(e.active.id);
    const over = e.over?.id;
    if (!over) return;
    const target = String(over);
    if (target === "sell") sell(iid);
    else if (target === "bench") moveToBench(iid);
    else if (target.startsWith("cell-")) {
      const [, c, r] = target.split("-");
      moveToBoard(iid, Number(c), Number(r));
    }
  }

  const spectated = viewId ? players.find((p) => p.id === viewId) : null;
  const aliveCount = (health > 0 ? 1 : 0) + players.filter((p) => p.alive).length;
  const gameOver = health <= 0;

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex flex-col gap-3 max-w-[1440px] mx-auto p-4">
        <TopBar timer={<RoundTimer seconds={secs} />} />
        <div className="flex gap-3 items-start">
          <Scoreboard />
          <TraitPanel units={spectated ? spectated.board : undefined} />

          {spectated ? (
            <div className="flex-1 flex flex-col gap-3 items-center">
              <div className="w-full flex items-center justify-between px-1">
                <span className="text-sm font-bold text-slate-200">
                  Spectating <span className="text-rose-300">{spectated.name}</span> · Lv {spectated.level} · {Math.max(0, spectated.health)} HP
                </span>
                <button onClick={() => setView(null)} className="px-3 py-1 rounded-md bg-sky-700 hover:bg-sky-600 text-xs font-semibold">
                  Return to your board
                </button>
              </div>
              <Board units={spectated.board} interactive={false} />
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-3 items-center">
              <Board />
              <Bench />
            </div>
          )}

          <UnitDetail />
        </div>

        {!spectated && (
          <div className="flex gap-3">
            <div className="flex-1">
              <ShopBar />
            </div>
            <SellZone />
          </div>
        )}
      </div>

      {combatResult && (
        <CombatStage
          result={combatResult}
          opponentName={opponentName}
          onResolve={(won, survivors) => resolveCombatFlow(won, survivors)}
        />
      )}

      {gameOver && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm gap-4">
          <div className="text-3xl font-extrabold text-rose-400">You were knocked out</div>
          <div className="text-slate-300">You placed #{aliveCount + 1}</div>
          <button
            onClick={() => { newGame(); initLobby(); setView(null); setSecs(PLAN_TIME); }}
            className="px-6 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold"
          >
            Play again
          </button>
        </div>
      )}
    </DndContext>
  );
}
