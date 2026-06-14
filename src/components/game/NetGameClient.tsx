"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, useDroppable } from "@dnd-kit/core";
import { useGame } from "@/game/store/gameStore";
import { useRoom } from "@/game/net/roomStore";
import { startServerTime, serverNow } from "@/game/net/serverTime";
import { startCombat, endCombat, heartbeat, maybeClaimHost, syncBoard, PLAN_MS, COMBAT_MS } from "@/game/net/match";
import { simulate } from "@/game/engine/combat";
import { getDef, spriteUrl, unitsForGenerations } from "@/game/data/mons";
import type { UnitInstance } from "@/game/types";

function asUnits(u: unknown): UnitInstance[] {
  if (!u) return [];
  return (Array.isArray(u) ? u : Object.values(u as Record<string, UnitInstance>)) as UnitInstance[];
}
import { Board } from "./Board";
import { Bench } from "./Bench";
import { ShopBar } from "./ShopBar";
import { TraitPanel } from "./TraitPanel";
import { UnitDetail } from "./UnitDetail";
import { ItemTray } from "./ItemTray";
import { CombatStage } from "./CombatStage";
import { CoinIcon, TrophyIcon } from "./icons";
import { useT } from "@/lib/i18n";
import { sfx } from "@/lib/audio";

function asBoard(b: unknown): UnitInstance[] {
  if (!b) return [];
  const arr = Array.isArray(b) ? b : Object.values(b as Record<string, UnitInstance>);
  return (arr as UnitInstance[]).filter((u) => u && u.pos);
}

function SellZone() {
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({ id: "sell" });
  return (
    <div ref={setNodeRef} className={`flex items-center justify-center px-5 rounded-xl border-2 border-dashed text-xs font-bold uppercase tracking-wide transition-colors ${isOver ? "border-rose-400 bg-rose-500/20 text-rose-200" : "border-slate-700 text-slate-500"}`}>
      {t.sh_drag_sell}
    </div>
  );
}

export function NetGameClient() {
  const room = useRoom((s) => s.room);
  const myUid = useRoom((s) => s.myUid);
  const leave = useRoom((s) => s.leave);

  const newGame = useGame((s) => s.newGame);
  const netRound = useGame((s) => s.netRound);
  const importSave = useGame((s) => s.importSave);
  const moveToBoard = useGame((s) => s.moveToBoard);
  const moveToBench = useGame((s) => s.moveToBench);
  const sell = useGame((s) => s.sell);
  const units = useGame((s) => s.units);
  const gold = useGame((s) => s.gold);
  const level = useGame((s) => s.level);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [, setTick] = useState(0);
  const roomRef = useRef(room);
  useEffect(() => { roomRef.current = room; }, [room]);
  const lastRoundKey = useRef<string | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actedDeadline = useRef(-1);

  // server time + a 250ms repaint so the shared timer counts down smoothly
  useEffect(() => {
    startServerTime();
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, []);

  // Host loop: claim the host if it stalls; heartbeat; and advance the phase
  // exactly once per deadline (idempotent — guards against the 700ms loop
  // double-firing before the async write propagates).
  useEffect(() => {
    if (!myUid) return;
    const id = setInterval(() => {
      const r = roomRef.current;
      if (!r) return;
      maybeClaimHost(r.code, r, myUid);
      if (r.meta?.hostUid !== myUid) return;
      heartbeat(r.code);
      if (serverNow() >= r.meta.deadline && actedDeadline.current !== r.meta.deadline) {
        actedDeadline.current = r.meta.deadline;
        if (r.meta.phase === "planning") startCombat(r.code, r);
        else if (r.meta.phase === "combat") endCombat(r.code, r);
      }
    }, 700);
    return () => clearInterval(id);
  }, [myUid]);

  const meta = room?.meta;
  const players = room?.players ?? {};
  const me = myUid ? players[myUid] : undefined;
  const phase = meta?.phase;
  const myCombat = myUid ? room?.combat?.[myUid] : undefined;

  // Each new planning round: grant economy. On the FIRST planning we see, either
  // restore a synced save (reconnect) or start fresh — never wipe an in-progress
  // game by re-running newGame.
  useEffect(() => {
    if (!room || phase !== "planning" || !meta) return;
    const key = `${meta.stage}-${meta.round}`;
    if (lastRoundKey.current === key) return;
    const first = lastRoundKey.current === null;
    lastRoundKey.current = key;
    if (first) {
      const save = me?.save;
      if (save) importSave({ ...save, units: asUnits(save.units) });
      else newGame(room.rules?.startingHp ?? 100, unitsForGenerations(room.rules?.generations ?? [1]));
    } else {
      netRound(meta.stage, meta.round, me?.streak ?? 0);
    }
  }, [phase, meta?.stage, meta?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  // Push my board + economy snapshot to the room (debounced) — board for combat,
  // save for reconnect.
  useEffect(() => {
    if (!room || !myUid || phase !== "planning") return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      const g = useGame.getState();
      syncBoard(room.code, myUid, g.units, g.exportSave());
    }, 400);
    return () => { if (syncTimer.current) clearTimeout(syncTimer.current); };
  }, [units, gold, phase, myUid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Replay from the boards the host FROZE into the combat assignment, so the
  // result shown always matches the host's authoritative outcome.
  const combatResult = useMemo(() => {
    if (phase !== "combat" || !myCombat) return null;
    return simulate(asBoard(myCombat.selfBoard), asBoard(myCombat.oppBoard));
  }, [phase, meta?.stage, meta?.round, myCombat?.oppUid]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = useT();

  // Play victory/defeat sound when the game ends
  const prevPhase = useRef<string | null>(null);
  useEffect(() => {
    if (phase === "over" && prevPhase.current !== "over") {
      if (iWon) sfx.victory(); else sfx.defeat();
    }
    prevPhase.current = phase ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (!room || !meta || !myUid) return null;

  const secondsLeft = Math.max(0, Math.ceil((meta.deadline - serverNow()) / 1000));
  const totalMs = phase === "combat" ? COMBAT_MS : PLAN_MS;
  const pct = Math.max(0, Math.min(100, ((meta.deadline - serverNow()) / totalMs) * 100));
  const isHost = meta.hostUid === myUid;
  const ladder = Object.values(players).sort((a, b) => Number(b.alive) - Number(a.alive) || b.hp - a.hp);
  const aliveCount = Object.values(players).filter((p) => p.alive).length;
  const gameOver = phase === "over";
  const iWon = gameOver && me?.alive && aliveCount === 1;

  const phaseLabel = phase === "combat" ? t.net_phase_combat
    : phase === "over" ? t.net_phase_over
    : t.net_phase_planning;

  function onDragEnd(e: DragEndEvent) {
    if (phase !== "planning") return;
    const iid = String(e.active.id);
    const over = e.over?.id;
    if (!over) return;
    const target = String(over);
    if (target === "sell") sell(iid);
    else if (target === "bench") moveToBench(iid);
    else if (target.startsWith("cell-")) { const [, c, r] = target.split("-"); moveToBoard(iid, Number(c), Number(r)); }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex flex-col gap-3 max-w-[1440px] mx-auto p-4">
        {/* Top bar */}
        <div className="flex items-center gap-5 flex-wrap p-3 rounded-xl bg-slate-900/70 border border-slate-700/50">
          <Stat label={t.net_stage} value={`${meta.stage}-${meta.round}`} />
          <Stat label={t.net_hp} value={`${Math.max(0, me?.hp ?? 0)}`} accent="#ff6b6b" />
          <Stat label={t.net_gold} accent="#fbbf24" value={<span className="inline-flex items-center gap-1"><CoinIcon size={13} />{gold}</span>} />
          <Stat label={t.net_level} value={`${level}`} />
          <Stat label={t.net_alive(aliveCount)} value="" />
          <div className="flex flex-col gap-1 min-w-[200px]">
            <div className="flex justify-between text-[11px]">
              <span className={`font-bold uppercase ${phase === "combat" ? "text-rose-300" : "text-sky-300"}`}>{phaseLabel}</span>
              <span className="tabular-nums text-slate-300">{secondsLeft}s</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div className={`h-full transition-all ${phase === "combat" ? "bg-rose-400" : "bg-sky-400"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
          {isHost && <span className="text-[9px] font-bold uppercase bg-amber-500 text-black rounded px-1">{t.net_host_badge}</span>}
          <button onClick={leave} className="ml-auto px-3 py-1.5 rounded-md bg-slate-800 hover:bg-rose-900/60 border border-slate-700 text-xs font-bold text-slate-300">{t.net_leave}</button>
        </div>

        <div className="flex gap-3 items-start">
          {/* Scoreboard */}
          <div className="w-[190px] shrink-0 p-2 rounded-xl bg-slate-900/70 border border-slate-700/50">
            <h2 className="text-[10px] uppercase tracking-wider text-slate-500 px-1 mb-1.5">{t.net_trainers(aliveCount)}</h2>
            <div className="flex flex-col gap-1">
              {ladder.map((p, i) => {
                const dex = asBoard(p.board)[0] ? getDef(asBoard(p.board)[0].defId).dex[asBoard(p.board)[0].star - 1] : null;
                return (
                  <div key={p.uid} className={`flex items-center gap-2 px-1.5 py-1 rounded-lg ${p.uid === myUid ? "bg-slate-700/70 ring-1 ring-sky-500/50" : ""} ${!p.alive ? "opacity-40" : ""}`}>
                    <span className="w-4 text-[10px] text-slate-500 font-bold text-center">{p.place ?? i + 1}</span>
                    <span className="w-7 h-7 rounded-md bg-black/40 border border-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
                      {dex ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={spriteUrl(dex)} alt="" width={22} height={22} style={{ imageRendering: "pixelated" }} />
                      ) : <span className="text-[9px] text-slate-600">{p.name.slice(0, 1).toUpperCase()}</span>}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[11px] font-semibold truncate ${p.uid === myUid ? "text-amber-300" : "text-slate-200"}`}>
                        {p.name}{!p.connected && t.net_offline}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="flex-1 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                          <span className="block h-full rounded-full" style={{ width: `${Math.max(0, p.hp)}%`, background: p.hp > 50 ? "#34d399" : p.hp > 25 ? "#fbbf24" : "#f87171" }} />
                        </span>
                        <span className="text-[10px] tabular-nums text-slate-400 w-6 text-right">{Math.max(0, p.hp)}</span>
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <TraitPanel />
          <div className="flex-1 flex flex-col gap-3 items-center">
            <Board />
            <Bench />
            <ItemTray />
          </div>
          <UnitDetail />
        </div>

        <div className="flex gap-3">
          <div className="flex-1"><ShopBar /></div>
          <SellZone />
        </div>
      </div>

      {combatResult && me?.alive && (
        <CombatStage result={combatResult} opponentName={myCombat?.oppName ?? "Rival"} autoResolve onResolve={() => {}} />
      )}

      {!gameOver && me && !me.alive && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm gap-3">
          <div className="text-3xl font-extrabold text-rose-400">{t.net_eliminated}</div>
          <div className="text-slate-300">{t.net_placed(me.place ?? aliveCount + 1)} · {t.net_spectating}</div>
        </div>
      )}

      {gameOver && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm gap-4">
          <div className={`celebrate-pop flex flex-col items-center gap-3 ${iWon ? "text-amber-300" : "text-slate-200"}`}>
            {iWon && <TrophyIcon size={56} />}
            <div className="text-4xl font-extrabold">{iWon ? t.net_victory : t.net_gameover}</div>
          </div>
          <div className="text-slate-300">{t.net_placed(me?.place ?? 1)}</div>
          <button onClick={leave} className="px-6 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold">{t.net_back_menu}</button>
        </div>
      )}
    </DndContext>
  );
}

function Stat({ label, value, accent }: { label: string; value: ReactNode; accent?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className="text-sm font-bold" style={{ color: accent }}>{value}</span>
    </div>
  );
}
