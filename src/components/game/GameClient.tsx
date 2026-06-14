"use client";

import { useEffect } from "react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, useDroppable } from "@dnd-kit/core";
import { useGame } from "@/game/store/gameStore";
import { TopBar } from "./TopBar";
import { Board } from "./Board";
import { Bench } from "./Bench";
import { ShopBar } from "./ShopBar";
import { TraitPanel } from "./TraitPanel";
import { UnitDetail } from "./UnitDetail";

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

export function GameClient() {
  const newGame = useGame((s) => s.newGame);
  const moveToBoard = useGame((s) => s.moveToBoard);
  const moveToBench = useGame((s) => s.moveToBench);
  const sell = useGame((s) => s.sell);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    newGame();
  }, [newGame]);

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

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex flex-col gap-3 max-w-[1280px] mx-auto p-4">
        <TopBar />
        <div className="flex gap-3 items-start">
          <TraitPanel />
          <div className="flex-1 flex flex-col gap-3 items-center">
            <Board />
            <Bench />
          </div>
          <UnitDetail />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <ShopBar />
          </div>
          <SellZone />
        </div>
      </div>
    </DndContext>
  );
}
