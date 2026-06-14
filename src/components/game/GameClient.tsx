"use client";

import { useEffect, useRef, useState } from "react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, useDroppable } from "@dnd-kit/core";
import { useGame } from "@/game/store/gameStore";
import { useCombat } from "@/game/store/combatStore";
import { useLobby } from "@/game/store/lobbyStore";
import { useUi } from "@/game/store/uiStore";
import { useCarousel } from "@/game/store/carouselStore";
import { advanceFlow, resolveCombatFlow, resolveCarouselFlow } from "@/game/store/flow";
import { unitsForGenerations } from "@/game/data/mons";
import { TopBar } from "./TopBar";
import { Board } from "./Board";
import { Bench } from "./Bench";
import { ShopBar } from "./ShopBar";
import { TraitPanel } from "./TraitPanel";
import { UnitDetail } from "./UnitDetail";
import { Scoreboard } from "./Scoreboard";
import { Timeline } from "./Timeline";
import { Carousel } from "./Carousel";
import { ItemTray } from "./ItemTray";
import { CombatStage } from "./CombatStage";
import { TrophyIcon } from "./icons";

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

export function GameClient({ playerCount = 8, startingHp = 100, generations = [1] }: { playerCount?: number; startingHp?: number; generations?: number[] } = {}) {
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
  const carouselActive = useCarousel((s) => s.options !== null);
  const viewId = useUi((s) => s.viewPlayerId);
  const setView = useUi((s) => s.setView);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [secs, setSecs] = useState(PLAN_TIME);
  const deadlineRef = useRef(0);

  const resetGame = () => {
    newGame(startingHp, unitsForGenerations(generations));
    initLobby(Math.max(1, playerCount - 1), startingHp);
    setView(null);
    setSecs(PLAN_TIME);
  };

  useEffect(() => {
    newGame(startingHp, unitsForGenerations(generations));
    initLobby(Math.max(1, playerCount - 1), startingHp);
  // generations is an array — JSON-compare via join to avoid stale closures on array identity
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newGame, initLobby, playerCount, startingHp, generations.join(",")]);

  // One effect owns the planning countdown. It re-arms a fresh deadline whenever
  // the round changes, combat ends, or a carousel opens, and only calls setState
  // from the interval callback (never synchronously in the effect body).
  useEffect(() => {
    if (combatResult || health <= 0) return;
    deadlineRef.current = performance.now() + PLAN_TIME * 1000;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - performance.now()) / 1000));
      setSecs(remaining);
      if (remaining <= 0) {
        const opts = useCarousel.getState().options;
        // Auto-pick a unit (index 1+), not the Mega Stone (index 0).
        if (opts && opts.length) resolveCarouselFlow(opts[1] ?? opts[0]);
        else advanceFlow();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [combatResult, health, stage, round, carouselActive]);

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
  const aliveAi = players.filter((p) => p.alive).length;
  const aliveCount = (health > 0 ? 1 : 0) + aliveAi;
  const gameOver = health <= 0;
  const victory = health > 0 && aliveAi === 0 && players.length > 0;
  const inTopFour = health > 0 && aliveCount > 1 && aliveCount <= 4;

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex flex-col gap-3 max-w-[1440px] mx-auto p-4">
        <Timeline />
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
              <ItemTray />
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

      {/* Top-4 milestone (pops in when you reach the final four) */}
      {inTopFour && (
        <div key="top4" className="celebrate-pop fixed top-3 left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500 text-black text-sm font-extrabold shadow-lg">
          <TrophyIcon size={15} /> Top 4
        </div>
      )}

      {carouselActive && <Carousel />}

      {combatResult && (
        <CombatStage
          result={combatResult}
          opponentName={opponentName}
          onResolve={(won, survivors) => resolveCombatFlow(won, survivors)}
        />
      )}

      {(gameOver || victory) && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm gap-4">
          <div className={`celebrate-pop flex flex-col items-center gap-3 ${victory ? "text-amber-300" : "text-rose-400"}`}>
            {victory && <TrophyIcon size={56} />}
            <div className="text-4xl font-extrabold">{victory ? "Victory Royale" : "You were knocked out"}</div>
          </div>
          <div className="text-slate-300 text-lg">{victory ? "Last trainer standing — you win!" : `You placed #${aliveCount + 1}`}</div>
          <button
            onClick={resetGame}
            className="px-6 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold"
          >
            Play again
          </button>
        </div>
      )}
    </DndContext>
  );
}
