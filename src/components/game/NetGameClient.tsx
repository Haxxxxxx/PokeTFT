"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DndContext, DragEndEvent, PointerSensor, TouchSensor, useSensor, useSensors, useDroppable } from "@dnd-kit/core";
import { useGame } from "@/game/store/gameStore";
import { useRoom } from "@/game/net/roomStore";
import { startServerTime, serverNow } from "@/game/net/serverTime";
import { resolveRoundStart, endCombat, endCarousel, heartbeat, maybeClaimHost, syncBoard, returnToLobby, PLAN_MS, COMBAT_MS } from "@/game/net/match";
import { simulate } from "@/game/engine/combat";
import { getDef, spriteUrl, unitsForGenerations } from "@/game/data/mons";
import { ECONOMY, MAX_LEVEL, XP_TO_REACH, streakGold, roundKind, advanceRound } from "@/game/config";
import { interest } from "@/game/engine/economy";
import { MEGA_STONE } from "@/game/data/mega";
import { ITEM_POOL } from "@/game/data/itemPool";
import { AUGMENTS, augmentSlot } from "@/game/data/augments";
import { useAppStore } from "@/game/store/appStore";
import { useUi } from "@/game/store/uiStore";
import { makeRng } from "@/game/engine/rng";
import { COST_COLOR, TYPE_COLOR } from "@/game/ui";
import { MegaIcon } from "./icons";
import type { UnitInstance, PokeType } from "@/game/types";

// RTDB drops null values + empty arrays, so a synced unit can come back missing
// `pos` (bench units) or `items`. Restore both invariants at the boundary.
function normUnit(u: UnitInstance): UnitInstance {
  return u.items && u.pos !== undefined ? u : { ...u, pos: u.pos ?? null, items: u.items ?? [] };
}

const ITEM_DEF_BY_ID = Object.fromEntries(ITEM_POOL.map((i) => [i.id, i]));

// Fixed design canvas the game is laid out on; scaled uniformly to fit any
// screen. Sized for the TALLEST phase (combat: battlefield + recap + bench/shop)
// so the canvas never changes size between phases — the whole point of the
// constant-scale fit. Both phases share these dimensions; the shorter one just
// leaves unused space at the bottom (invisible), so nothing jumps.
const DESIGN_W = 1500;
const DESIGN_H = 1160;

function asUnits(u: unknown): UnitInstance[] {
  if (!u) return [];
  return (Array.isArray(u) ? u : Object.values(u as Record<string, UnitInstance>)).map(normUnit);
}
import { Board } from "./Board";
import { Bench } from "./Bench";
import { UnitChip } from "./UnitChip";
import { ShopBar } from "./ShopBar";
import { TraitPanel } from "./TraitPanel";
import { UnitDetail } from "./UnitDetail";
import { ItemsPanel } from "./ItemsPanel";
import { CombatStage } from "./CombatStage";
import { CoinIcon, TrophyIcon } from "./icons";
import { useT } from "@/lib/i18n";
import { sfx } from "@/lib/audio";
import { toggleFullscreen, isFullscreen } from "@/lib/fullscreen";

function asBoard(b: unknown): UnitInstance[] {
  if (!b) return [];
  const arr = Array.isArray(b) ? b : Object.values(b as Record<string, UnitInstance>);
  return (arr as UnitInstance[]).filter((u) => u && u.pos).map(normUnit);
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

/** Dropping a bench unit onto the shop sells it (id "sell-shop"). */
function ShopSellDrop({ children }: { children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "sell-shop" });
  return (
    <div ref={setNodeRef} className={`flex-1 rounded-xl transition-shadow ${isOver ? "ring-2 ring-rose-400/80 ring-inset" : ""}`}>
      {children}
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
  const netCarouselPick = useGame((s) => s.netCarouselPick);
  const pickAugment = useGame((s) => s.pickAugment);
  const augments = useGame((s) => s.augments);
  const lang = useAppStore((s) => s.settings.language);
  const buyXp = useGame((s) => s.buyXp);
  const reroll = useGame((s) => s.reroll);
  const moveToBoard = useGame((s) => s.moveToBoard);
  const moveToBench = useGame((s) => s.moveToBench);
  const sell = useGame((s) => s.sell);
  const units = useGame((s) => s.units);
  const gold = useGame((s) => s.gold);
  const level = useGame((s) => s.level);
  const xp = useGame((s) => s.xp);

  // Mouse drags on a 5px move; touch drags on a short press-and-hold so finger
  // scrolling still works on mobile.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 140, tolerance: 8 } }),
  );
  const [, setTick] = useState(0);
  const roomRef = useRef(room);
  useEffect(() => { roomRef.current = room; }, [room]);
  const lastRoundKey = useRef<string | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actedDeadline = useRef(-1);
  const [roundLog, setRoundLog] = useState<{ stage: number; round: number; won: boolean; pve: boolean }[]>([]);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [spectate, setSpectate] = useState<string | null>(null);
  // Carousel/augment: hide the choice cards (revealing the live board behind the
  // overlay) and toggle them back. Resets whenever a new pick screen opens.
  const [revealBoard, setRevealBoard] = useState(false);
  // Brief boot veil at match start: gives every client a moment to load sprites
  // and sync the room before the board appears, so nobody sees a half-loaded /
  // out-of-sync first frame.
  const [booting, setBooting] = useState(true);

  // Scale-to-fit the fixed design canvas onto any screen. The canvas is a
  // CONSTANT size (DESIGN_W × DESIGN_H, sized for the tallest phase), so the
  // scale only ever changes on a window resize — NEVER when planning flips to
  // combat. Both phases live on the same-sized canvas, so the board no longer
  // resizes or jumps between phases (the old measured-height refit did).
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => {
      const s = Math.min(1, (window.innerWidth - 8) / DESIGN_W, (window.innerHeight - 8) / DESIGN_H);
      setScale(s > 0 ? s : 1);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // Lift the boot veil after a short beat (sprites + room sync settle).
  useEffect(() => {
    const id = setTimeout(() => setBooting(false), 1900);
    return () => clearTimeout(id);
  }, []);

  // server time + a 250ms repaint so the shared timer counts down smoothly
  useEffect(() => {
    startServerTime();
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, []);

  // Click anywhere that isn't a mon / item / the detail panel closes the details.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest("[data-inspectable]")) return;
      const ui = useUi.getState();
      if (ui.inspect || ui.inspectedItem) ui.clearInspect();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Host loop: claim the host if it stalls; heartbeat; and advance the phase
  // exactly once per deadline (idempotent — guards against the 700ms loop
  // double-firing before the async write propagates).
  useEffect(() => {
    if (!myUid) return;
    const id = setInterval(() => {
      // Async + guarded: a rejected RTDB write (network blip / permission) must
      // not become an unhandled rejection that silently freezes the round loop.
      void (async () => {
        try {
          const r = roomRef.current;
          if (!r) return;
          await maybeClaimHost(r.code, r, myUid);
          if (r.meta?.hostUid !== myUid) return;
          await heartbeat(r.code);
          if (serverNow() >= r.meta.deadline && actedDeadline.current !== r.meta.deadline) {
            actedDeadline.current = r.meta.deadline;
            if (r.meta.phase === "planning") await resolveRoundStart(r.code, r);
            else if (r.meta.phase === "combat") await endCombat(r.code, r);
            else if (r.meta.phase === "carousel") await endCarousel(r.code, r);
          }
        } catch (err) {
          console.error("[host-loop]", err);
        }
      })();
    }, 700);
    return () => clearInterval(id);
  }, [myUid]);

  const meta = room?.meta;
  const players = room?.players ?? {};
  const me = myUid ? players[myUid] : undefined;
  const phase = meta?.phase;
  const myCombat = myUid ? room?.combat?.[myUid] : undefined;

  // A fresh carousel/augment screen always opens showing its choices.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRevealBoard(false);
  }, [phase]);

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
    }, 250);
    return () => { if (syncTimer.current) clearTimeout(syncTimer.current); };
  }, [units, gold, phase, myUid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Buzzer-beater guard: the host freezes each board for combat the instant the
  // planning deadline passes. A debounced sync can be dropped if you place a unit
  // in the last moment, freezing a STALE board — so the fight wouldn't match the
  // cards you placed. In the final stretch of planning we push the live board
  // every 200ms (and right up to the freeze), guaranteeing the host sees your
  // actual final board. (The sim itself is already deterministic; this just keeps
  // the FROZEN input honest.)
  useEffect(() => {
    if (!myUid || phase !== "planning") return;
    const id = setInterval(() => {
      const r = roomRef.current;
      if (!r?.meta || r.meta.phase !== "planning") return;
      if (r.meta.deadline - serverNow() <= 2500) {
        const g = useGame.getState();
        syncBoard(r.code, myUid, g.units, g.exportSave());
      }
    }, 200);
    return () => clearInterval(id);
  }, [phase, myUid]);

  // Replay from the boards the host FROZE into the combat assignment, so the
  // result shown always matches the host's authoritative outcome.
  const combatResult = useMemo(() => {
    if (phase !== "combat" || !myCombat) return null;
    // Both paired players run the IDENTICAL canonical call simulate(attacker,
    // defender): the flipped (enemy-side) player passes opp,self so the args
    // match the host's a,b. Guarantees the same frames + outcome on every screen.
    const [p1, p2] = myCombat.flip ? [myCombat.oppBoard, myCombat.selfBoard] : [myCombat.selfBoard, myCombat.oppBoard];
    return simulate(asBoard(p1), asBoard(p2));
  }, [phase, meta?.stage, meta?.round, myCombat?.oppUid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live replay of the rival I'm spectating (from the host's frozen boards).
  const spectateCombat = spectate && spectate !== myUid ? room?.combat?.[spectate] : undefined;
  const spectateCombatResult = useMemo(() => {
    if (phase !== "combat" || !spectateCombat) return null;
    const [p1, p2] = spectateCombat.flip ? [spectateCombat.oppBoard, spectateCombat.selfBoard] : [spectateCombat.selfBoard, spectateCombat.oppBoard];
    return simulate(asBoard(p1), asBoard(p2));
  }, [phase, meta?.stage, meta?.round, spectate, spectateCombat?.oppUid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Augment round? (stage 2/3/4 round 1). Show the pick until this slot is taken.
  const augSlotNow = meta && phase === "planning" && me?.alive ? augmentSlot(meta.stage, meta.round) : null;
  const augOptions = useMemo(() => {
    if (augSlotNow == null) return [];
    const owned = new Set(useGame.getState().augments);
    const pool = AUGMENTS.filter((a) => !owned.has(a.id));
    let seed = augSlotNow * 9973 + 7;
    for (let i = 0; i < (myUid?.length ?? 0); i++) seed = (seed * 31 + myUid!.charCodeAt(i)) >>> 0;
    const r = makeRng(seed >>> 0);
    const a = [...pool];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, 3);
  }, [augSlotNow, myUid]);

  // Planning hotkeys: R reroll · L buy XP · S sell the inspected unit.
  useEffect(() => {
    if (phase !== "planning") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "r") { e.preventDefault(); reroll(); }
      else if (k === "l") { e.preventDefault(); buyXp(); }
      else if (k === "s") {
        const iid = useUi.getState().inspect?.iid;
        if (iid) { e.preventDefault(); sell(iid); useUi.getState().clearInspect(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, reroll, buyXp, sell]);

  // When you're eliminated, default to watching the current leader.
  useEffect(() => {
    if (me && !me.alive && !spectate) {
      const leader = Object.values(players).filter((p) => p.alive && p.uid !== myUid).sort((a, b) => b.hp - a.hp)[0];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (leader) setSpectate(leader.uid);
    }
  }, [me?.alive, spectate]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = useT();

  // Record every combat round into the timeline (one entry per round, dedup by key).
  // PvE rounds count too (win/loss vs wild Pokémon) so feedback starts at 1-1.
  useEffect(() => {
    if (phase === "combat" && myCombat && meta) {
      const key = `${meta.stage}-${meta.round}`;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRoundLog((h) => {
        const last = h[h.length - 1];
        if (last && `${last.stage}-${last.round}` === key) return h;
        return [...h, { stage: meta.stage, round: meta.round, won: myCombat.won, pve: !!myCombat.pve }];
      });
    }
  }, [phase, meta?.stage, meta?.round, myCombat?.oppUid, myCombat?.pve, meta]); // eslint-disable-line react-hooks/exhaustive-deps

  // Play victory/defeat sound when the game ends. Computed inline (the `iWon`
  // const is derived after the early-return guard, so it isn't in scope here).
  const prevPhase = useRef<string | null>(null);
  useEffect(() => {
    if (phase === "over" && prevPhase.current !== "over") {
      const ps = room?.players ?? {};
      const lastOneStanding = !!(myUid && ps[myUid]?.alive) && Object.values(ps).filter((p) => p.alive).length === 1;
      if (lastOneStanding) sfx.victory(); else sfx.defeat();
    }
    prevPhase.current = phase ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (!room || !meta || !myUid) return null;

  const secondsLeft = Math.max(0, Math.ceil((meta.deadline - serverNow()) / 1000));
  const atMax = level >= MAX_LEVEL;
  const xpBase = XP_TO_REACH[level];
  const xpNeed = atMax ? 1 : XP_TO_REACH[level + 1] - xpBase;
  const xpCur = xp - xpBase;
  const totalMs = phase === "combat" ? COMBAT_MS : PLAN_MS;
  const pct = Math.max(0, Math.min(100, ((meta.deadline - serverNow()) / totalMs) * 100));
  const isHost = meta.hostUid === myUid;
  const ladder = Object.values(players).sort((a, b) => Number(b.alive) - Number(a.alive) || b.hp - a.hp);
  const aliveCount = Object.values(players).filter((p) => p.alive).length;
  const gameOver = phase === "over";
  const iWon = gameOver && me?.alive && aliveCount === 1;

  const phaseLabel = phase === "combat" ? t.net_phase_combat
    : phase === "carousel" ? t.net_phase_carousel
    : phase === "over" ? t.net_phase_over
    : t.net_phase_planning;

  function onDragEnd(e: DragEndEvent) {
    // Bench management + selling stay available during combat (no effect on the
    // frozen, already-resolved fight). Board placement is locked while fighting.
    if (phase !== "planning" && phase !== "combat") return;
    const iid = String(e.active.id);
    const over = e.over?.id;
    if (!over) return;
    const target = String(over);
    if (target === "sell" || target === "sell-shop") sell(iid);
    else if (target === "bench") moveToBench(iid);
    else if (target.startsWith("cell-")) {
      if (phase !== "planning") return; // can't move onto the board mid-combat
      const [, c, r] = target.split("-");
      moveToBoard(iid, Number(c), Number(r));
    }
  }

  // Push the current economy + board to RTDB immediately (bypassing the debounce).
  // Carousel/augment picks must persist before the round can flip, or they're lost.
  function flushSync() {
    if (!room || !myUid) return;
    const g = useGame.getState();
    syncBoard(room.code, myUid, g.units, g.exportSave());
  }

  const streak = me?.streak ?? 0;
  // Show the augment pick this slot until the player has taken it.
  const showAugment = augSlotNow != null && augments.length === augSlotNow;
  // Spectating a rival from the scoreboard → watch their board, bench and fights
  // (read-only). Works while alive (scouting) and after death (keep watching).
  const spectating = !!spectate && spectate !== myUid && !!players[spectate];
  const spectateP = spectating ? players[spectate!] : undefined;
  const spectateUnits = spectating ? asBoard(spectateP?.board) : null;
  // Their full roster (incl. bench) rides along in the synced economy save.
  const spectateBench = spectating ? asUnits(spectateP?.save?.units).filter((u) => u.pos === null) : [];

  // Forward-looking timeline: the current stage + the next two, each round
  // tagged with its kind (PvE / carousel / PvP) and overlaid with past results.
  const resultByKey = new Map(roundLog.map((h) => [`${h.stage}-${h.round}`, h.won]));
  const schedule: { stage: number; round: number; kind: ReturnType<typeof roundKind> }[] = [];
  {
    let s = meta.stage, r = 1; // start at round 1 of the current stage
    for (let i = 0; i < 40; i++) {
      schedule.push({ stage: s, round: r, kind: roundKind(s, r) });
      const nx = advanceRound(s, r);
      if (nx.stage > meta.stage + 2) break;
      s = nx.stage; r = nx.round;
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="fixed inset-0 flex justify-center items-center overflow-hidden">
      <div
        style={{ width: DESIGN_W, height: DESIGN_H, transform: `scale(${scale})`, transformOrigin: "center" }}
        className="flex flex-col gap-3 p-3 shrink-0"
      >
        {/* Round timeline: current stage + the next two, tagged by kind, with
            past results colored win/loss and the current round highlighted. */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-slate-700/40 overflow-x-auto">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 shrink-0">Timeline</span>
          <div className="flex items-center gap-1">
            {schedule.map(({ stage, round, kind }) => {
              const key = `${stage}-${round}`;
              const result = resultByKey.get(key);
              const isCurrent = stage === meta.stage && round === meta.round;
              const isPast = result !== undefined;
              // Color: past → win/loss; else by kind.
              const bg = isPast
                ? (result ? "bg-emerald-500/90 text-black" : "bg-rose-500/90 text-black")
                : kind === "carousel" ? "bg-fuchsia-600/40 text-fuchsia-100"
                : kind === "pve" ? "bg-amber-600/30 text-amber-100"
                : "bg-slate-700/60 text-slate-300";
              const label = kind === "carousel" ? "◆" : `${stage}-${round}`;
              return (
                <span
                  key={key}
                  title={`${key} · ${kind}${isPast ? (result ? " · Win" : " · Loss") : ""}`}
                  className={`relative w-7 h-6 shrink-0 rounded-md flex items-center justify-center text-[8px] font-bold ${bg} ${isCurrent ? "ring-2 ring-sky-400 scale-110" : ""} ${round === 1 ? "ml-1.5" : ""}`}
                >
                  {label}
                </span>
              );
            })}
          </div>
        </div>

        {/* Top bar */}
        <div className="flex items-center gap-5 flex-wrap p-3 rounded-xl bg-slate-900/70 border border-slate-700/50">
          <Stat label={t.net_stage} value={`${meta.stage}-${meta.round}`} />
          <Stat label={t.net_hp} value={`${Math.max(0, me?.hp ?? 0)}`} accent="#ff6b6b" />
          <Stat label={t.net_gold} accent="#fbbf24" value={<span className="inline-flex items-center gap-1"><CoinIcon size={13} />{gold}</span>} />
          <Stat label={t.net_interest} value={`+${interest(gold)}`} />
          <Stat label={t.net_streak} value={`${streak >= 0 ? "W" : "L"}${Math.abs(streak)} (+${streakGold(streak)})`} />
          <Stat label={t.net_alive(aliveCount)} value="" />

          {/* Level + XP + Buy XP */}
          <div className="flex flex-col gap-1 min-w-[150px]">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span className="font-semibold text-slate-200">{t.net_level} {level}</span>
              <span>{atMax ? "MAX" : `${xpCur}/${xpNeed} XP`}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
              <div className="h-full bg-sky-400 transition-all" style={{ width: atMax ? "100%" : `${(xpCur / xpNeed) * 100}%` }} />
            </div>
            <button
              onClick={buyXp}
              disabled={phase !== "planning" || gold < ECONOMY.buyXpCost || atMax}
              className="inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded-md bg-sky-700/90 hover:bg-sky-600 disabled:opacity-40 text-[11px] font-semibold"
            >
              {t.net_buy_xp} <span className="inline-flex items-center gap-0.5 text-amber-200"><CoinIcon size={11} />{ECONOMY.buyXpCost}</span> <span className="text-sky-200">+{ECONOMY.buyXpAmount}</span>
            </button>
          </div>
          <div className="flex flex-col gap-1 min-w-[200px]">
            <div className="flex justify-between text-[11px]">
              <span className={`font-bold uppercase ${phase === "combat" ? "text-rose-300" : "text-sky-300"}`}>{phaseLabel}</span>
              <span className="tabular-nums text-slate-300">{secondsLeft}s</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div className={`h-full transition-all ${phase === "combat" ? "bg-rose-400" : "bg-sky-400"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
          {augments.length > 0 && (
            <div className="flex items-center gap-1" title="Augments">
              {augments.map((id, i) => {
                const a = AUGMENTS.find((x) => x.id === id);
                return <span key={i} className="w-7 h-7 rounded-md bg-violet-900/40 border border-violet-500/50 flex items-center justify-center text-sm" title={a ? (lang === "fr" ? `${a.nameFr} — ${a.descFr}` : `${a.name} — ${a.desc}`) : id}>{a?.icon ?? "◆"}</span>;
              })}
            </div>
          )}
          {isHost && <span className="text-[9px] font-bold uppercase bg-amber-500 text-black rounded px-1">{t.net_host_badge}</span>}
          <div className="ml-auto flex items-center gap-2">
            <FullscreenButton />
            <button onClick={leave} className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-rose-900/60 border border-slate-700 text-xs font-bold text-slate-300">{t.net_leave}</button>
          </div>
        </div>

        {/* Pinned 3-column layout: a fixed-width sidebar, a fixed-width FIELD
            column, and a fixed-width right rail. Because every track is a
            constant width, the battlefield sits in the exact same place in
            planning and combat — it never shifts when the phase flips. */}
        <div className="grid items-start gap-3" style={{ gridTemplateColumns: "220px 748px 300px", justifyContent: "center" }}>
          {/* Left sidebar: scoreboard + synergies */}
          <div className="flex flex-col gap-3">
          <div className="w-full p-2 rounded-xl bg-slate-900/70 border border-slate-700/50">
            <h2 className="text-[10px] uppercase tracking-wider text-slate-500 px-1 mb-1.5">{t.net_trainers(aliveCount)}</h2>
            <div className="flex flex-col gap-1">
              {ladder.map((p, i) => {
                const dex = asBoard(p.board)[0] ? getDef(asBoard(p.board)[0].defId).dex[asBoard(p.board)[0].star - 1] : null;
                return (
                  <div
                    key={p.uid}
                    onClick={() => setSpectate(p.uid === myUid ? null : (spectate === p.uid ? null : p.uid))}
                    title={p.uid === myUid ? "Your board" : `View ${p.name}'s board`}
                    className={`flex items-center gap-2 px-1.5 py-1 rounded-lg cursor-pointer hover:bg-slate-700/50 ${p.uid === myUid ? "bg-slate-700/70 ring-1 ring-sky-500/50" : ""} ${spectate === p.uid ? "ring-1 ring-amber-400/70 bg-amber-500/10" : ""} ${!p.alive ? "opacity-40" : ""}`}
                  >
                    <span className="w-4 text-[10px] text-slate-500 font-bold text-center">{p.place ?? i + 1}</span>
                    <span className="w-7 h-7 rounded-md bg-black/40 border border-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
                      {p.photoURL ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.photoURL} alt="" width={24} height={24} style={{ imageRendering: "pixelated" }} />
                      ) : dex ? (
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
            <TraitPanel units={spectateUnits ?? undefined} />
          </div>

          {/* Center: the shared field — identical pixels every phase */}
          <div className="flex flex-col gap-3 items-center min-w-0">
            {/* Spectating a rival overrides the view: their live fight during
                combat, else their board + bench (read-only). Otherwise my own
                combat replay during combat, else my board. */}
            {spectating ? (
              <div className="w-full flex flex-col gap-2">
                <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <span className="text-xs font-bold text-amber-300">{t.net_viewing(spectateP?.name ?? "rival")}</span>
                  <button onClick={() => setSpectate(null)} className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[11px] font-bold text-slate-300">{t.net_back_to_mine}</button>
                </div>
                {phase === "combat" && spectateCombatResult ? (
                  <CombatStage result={spectateCombatResult} flip={!!spectateCombat?.flip} opponentName={spectateCombat?.oppName ?? "Rival"} autoResolve inline syncStart={meta.deadline - COMBAT_MS} syncWindowMs={COMBAT_MS} onResolve={() => {}} />
                ) : (
                  <Board units={spectateUnits ?? []} interactive={false} />
                )}
                {/* Rival's bench */}
                <div className="flex gap-1.5 p-2 rounded-xl border border-slate-700/60 bg-slate-900/50 min-h-[64px] flex-wrap justify-center">
                  {spectateBench.length === 0
                    ? <span className="text-[11px] text-slate-600 self-center">Empty bench</span>
                    : spectateBench.map((u) => <UnitChip key={u.iid} unit={u} size={52} interactive={false} />)}
                </div>
              </div>
            ) : phase === "combat" && combatResult && me?.alive ? (
              <CombatStage
                result={combatResult}
                flip={!!myCombat?.flip}
                opponentName={myCombat?.oppName ?? "Rival"}
                pve={!!myCombat?.pve}
                autoResolve
                inline
                syncStart={meta.deadline - COMBAT_MS}
                syncWindowMs={COMBAT_MS}
                onResolve={() => {}}
              />
            ) : (
              <Board />
            )}
          </div>

          {/* Right rail: items inventory + details (planning). During combat the
              recap (with tabs) lives inside CombatStage; the 300px track stays
              reserved so the field column doesn't move. */}
          <div className="w-[300px]">
            {phase !== "combat" && !spectating && (
              <div className="flex flex-col gap-3">
                <ItemsPanel />
                <UnitDetail />
              </div>
            )}
          </div>
        </div>

        {/* Bottom bar: bench + shop, pinned to the bottom of the screen. */}
        <div className="flex flex-col items-center gap-2">
          <Bench />
          <div className="flex gap-3 w-full max-w-[1180px]">
            <ShopSellDrop><ShopBar /></ShopSellDrop>
            <SellZone />
          </div>
        </div>
      </div>
      </div>

      {phase === "carousel" && me?.alive && (() => {
        const opts = room.carousel?.[myUid];
        const key = `${meta.stage}-${meta.round}`;
        const picked = pickedKey === key;
        if (!opts) return null;
        return (
          <div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4"
            style={revealBoard
              // Transparent but still CAPTURING clicks — you can see your board
              // through the veil but can't edit it (picks aren't placement turns).
              ? { background: "transparent" }
              : { background: "radial-gradient(58% 58% at 50% 38%, rgba(146,64,14,0.32), rgba(2,6,23,0.93))", backdropFilter: "blur(7px)" }}
          >
            {/* Always-clickable toggle: hide the choices to peek at your live
                board/bench/shop underneath, then bring the choices back. */}
            <button
              onClick={() => setRevealBoard((v) => !v)}
              style={{ pointerEvents: "auto" }}
              className="absolute top-4 right-4 px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-600 text-[11px] font-bold text-slate-200 shadow-lg"
            >
              👁 {revealBoard ? (lang === "fr" ? "Afficher les choix" : "Show choices") : (lang === "fr" ? "Voir mon plateau" : "Hide & view board")}
            </button>
            {!revealBoard && (
            <div className="celebrate-pop flex flex-col items-center">
              <div className="flex items-center gap-2.5 mb-1">
                <span className="text-2xl">🎡</span>
                <h2 className="text-2xl font-extrabold text-amber-300 tracking-tight">{lang === "fr" ? "Carrousel" : "Carousel"}</h2>
              </div>
              <p className="text-xs text-slate-300/80">{picked ? (lang === "fr" ? "Choisi — en attente du tour…" : "Picked — waiting for the round…") : (lang === "fr" ? "Choisis une récompense gratuite." : "Pick one free reward.")}</p>
              <div className="text-[11px] tabular-nums font-bold text-amber-200/70 mt-0.5 mb-5">{secondsLeft}s</div>
            {!picked && (
              <div className="flex gap-3 flex-wrap justify-center max-w-[760px]">
                {opts.map((pick, i) => pick === MEGA_STONE ? (
                  <button key={i} onClick={() => { netCarouselPick(pick); setPickedKey(key); flushSync(); }} style={{ borderColor: "#f0abfc", boxShadow: "0 0 18px -2px #f0abfc88" }} className="w-[130px] rounded-xl border-2 bg-gradient-to-b from-fuchsia-900/40 to-slate-900/80 hover:-translate-y-1 transition-all p-3 flex flex-col items-center justify-center">
                    <span className="text-fuchsia-300"><MegaIcon size={48} /></span>
                    <span className="text-sm font-semibold mt-1 text-fuchsia-200">Mega Stone</span>
                  </button>
                ) : ITEM_DEF_BY_ID[pick] ? (
                  <button key={i} onClick={() => { netCarouselPick(pick); setPickedKey(key); flushSync(); }} style={{ borderColor: "#fbbf24", boxShadow: "0 0 16px -2px #fbbf2466" }} className="w-[130px] rounded-xl border-2 bg-gradient-to-b from-amber-900/30 to-slate-900/80 hover:-translate-y-1 transition-all p-3 flex flex-col items-center justify-center text-center">
                    <span className="text-3xl">{ITEM_DEF_BY_ID[pick].icon}</span>
                    <span className="text-sm font-semibold mt-1 text-amber-200">{ITEM_DEF_BY_ID[pick].name}</span>
                    <span className="text-[9px] text-slate-400 leading-tight mt-1">{ITEM_DEF_BY_ID[pick].effect}</span>
                  </button>
                ) : (() => {
                  const def = getDef(pick);
                  const color = COST_COLOR[def.cost];
                  return (
                    <button key={i} onClick={() => { netCarouselPick(pick); setPickedKey(key); flushSync(); }} style={{ borderColor: color, boxShadow: `0 0 16px -2px ${color}66` }} className="w-[130px] rounded-xl border-2 bg-slate-900/80 hover:bg-slate-800 hover:-translate-y-1 transition-all p-3 flex flex-col items-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={spriteUrl(def.dex[0])} alt={def.name} width={56} height={56} style={{ imageRendering: "pixelated" }} draggable={false} />
                      <span className="text-sm font-semibold mt-1">{def.name}</span>
                      <span style={{ color }} className="inline-flex items-center gap-0.5 text-[11px] font-bold"><CoinIcon size={11} />{def.cost}</span>
                      <div className="flex flex-wrap gap-0.5 justify-center mt-1.5">
                        {def.types.map((ty) => <span key={ty} style={{ background: TYPE_COLOR[ty as PokeType] }} className="text-[8px] px-1 rounded text-black/80 font-bold uppercase">{ty.slice(0, 3)}</span>)}
                      </div>
                    </button>
                  );
                })())}
              </div>
            )}
            </div>
            )}
          </div>
        );
      })()}

      {/* Augment pick — 3 TFT-style boosts at the start of stages 2/3/4. */}
      {showAugment && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4"
          style={revealBoard
            // Transparent but still capturing clicks — view-only board peek.
            ? { background: "transparent" }
            : { background: "radial-gradient(58% 58% at 50% 38%, rgba(76,29,149,0.4), rgba(2,6,23,0.93))", backdropFilter: "blur(7px)" }}
        >
          <button
            onClick={() => setRevealBoard((v) => !v)}
            style={{ pointerEvents: "auto" }}
            className="absolute top-4 right-4 px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-600 text-[11px] font-bold text-slate-200 shadow-lg"
          >
            👁 {revealBoard ? (lang === "fr" ? "Afficher les choix" : "Show choices") : (lang === "fr" ? "Voir mon plateau" : "Hide & view board")}
          </button>
          {!revealBoard && (
          <div className="celebrate-pop flex flex-col items-center">
            <div className="flex items-center gap-2.5 mb-1">
              <span className="text-2xl">✨</span>
              <h2 className="text-2xl font-extrabold text-violet-300 tracking-tight">Augment {augSlotNow! + 1}/3</h2>
            </div>
            <p className="text-xs text-slate-300/80 mb-5">{lang === "fr" ? "Choisis un bonus permanent." : "Pick one permanent boost."}</p>
            <div className="flex gap-3 flex-wrap justify-center max-w-[640px]">
            {augOptions.map((a) => (
              <button
                key={a.id}
                onClick={() => { pickAugment(a.id); flushSync(); }}
                style={{ borderColor: "#a78bfa", boxShadow: "0 0 18px -3px #a78bfa88" }}
                className="w-[180px] rounded-xl border-2 bg-gradient-to-b from-violet-900/40 to-slate-900/80 hover:-translate-y-1 transition-all p-4 flex flex-col items-center text-center gap-1"
              >
                <span className="text-3xl">{a.icon}</span>
                <span className="text-sm font-bold text-violet-200">{lang === "fr" ? a.nameFr : a.name}</span>
                <span className="text-[11px] text-slate-300 leading-snug">{lang === "fr" ? a.descFr : a.desc}</span>
              </button>
            ))}
            </div>
          </div>
          )}
        </div>
      )}

      {/* Shortcut hints (planning only). */}
      {phase === "planning" && me?.alive && (
        <div className="fixed bottom-2 left-2 z-30 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/85 border border-slate-700/60 backdrop-blur-sm">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mr-0.5">{lang === "fr" ? "Raccourcis" : "Keys"}</span>
          <Kbd k="R" label={lang === "fr" ? "Reroll" : "Reroll"} />
          <Kbd k="L" label="XP" />
          <Kbd k="S" label={lang === "fr" ? "Vendre" : "Sell"} />
        </div>
      )}

      {/* Eliminated but the game isn't over — keep watching. Non-blocking banner;
          the scoreboard stays clickable so you can spectate any survivor. */}
      {!gameOver && me && !me.alive && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2 rounded-full bg-rose-950/80 border border-rose-700/60 backdrop-blur-sm">
          <span className="text-sm font-extrabold text-rose-300">{t.net_eliminated}</span>
          <span className="text-xs text-slate-300">{t.net_placed(me.place ?? aliveCount + 1)} · {t.net_spectating}</span>
        </div>
      )}

      {gameOver && (() => {
        // Final standings: every player ranked by placement (winner = #1), with
        // their final team so you can see how everyone finished before a rematch.
        const standings = Object.values(players).sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
        const medal = (place: number) => (place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : `#${place}`);
        return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm gap-5 p-4">
          <div className={`celebrate-pop flex flex-col items-center gap-2 ${iWon ? "text-amber-300" : "text-slate-200"}`}>
            {iWon && <TrophyIcon size={52} />}
            <div className="text-4xl font-extrabold">{iWon ? t.net_victory : t.net_gameover}</div>
            <div className="text-sm text-slate-400">{t.net_placed(me?.place ?? 1)}</div>
          </div>

          <div className="w-full max-w-[560px] flex flex-col gap-2">
            <h3 className="text-[11px] uppercase tracking-[0.2em] text-slate-500 text-center mb-1">{t.net_final_standings}</h3>
            <div className="flex flex-col gap-1.5 max-h-[52vh] overflow-y-auto pr-1">
              {standings.map((p) => {
                const team = asBoard(p.board);
                const isMe = p.uid === myUid;
                const first = p.place === 1;
                return (
                  <div
                    key={p.uid}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${first ? "bg-amber-500/10 border-amber-500/50" : "bg-slate-900/70 border-slate-700/50"} ${isMe ? "ring-1 ring-sky-500/60" : ""}`}
                  >
                    <span className="w-8 text-center text-lg font-extrabold tabular-nums shrink-0">{medal(p.place ?? 99)}</span>
                    <span className="w-9 h-9 rounded-md bg-black/40 border border-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
                      {p.photoURL
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={p.photoURL} alt="" width={32} height={32} style={{ imageRendering: "pixelated" }} />
                        : <span className="text-xs text-slate-500">{p.name.slice(0, 1).toUpperCase()}</span>}
                    </span>
                    <div className="w-[120px] shrink-0 min-w-0">
                      <div className={`text-sm font-bold truncate ${first ? "text-amber-300" : isMe ? "text-sky-300" : "text-slate-200"}`}>{p.name}</div>
                      <div className="text-[10px] text-slate-500">{Math.max(0, p.hp)} HP</div>
                    </div>
                    <div className="flex-1 flex flex-wrap gap-0.5 justify-end items-center">
                      {team.length === 0
                        ? <span className="text-[10px] text-slate-600">{t.net_empty_board}</span>
                        : team.slice(0, 10).map((u) => {
                            const def = getDef(u.defId);
                            return (
                              <span key={u.iid} title={`${def.name} ★${u.star}`} className="relative w-7 h-7 rounded bg-black/40 border border-slate-700/70 flex items-center justify-center shrink-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={spriteUrl(def.dex[u.star - 1])} alt="" width={24} height={24} style={{ imageRendering: "pixelated" }} draggable={false} />
                                {u.star > 1 && <span className="absolute -top-1 -right-1 text-[7px] font-extrabold text-amber-300 bg-slate-900/90 rounded px-0.5 leading-tight">{u.star}★</span>}
                              </span>
                            );
                          })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => returnToLobby(room.code, room)} className="px-6 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold shadow-lg">{t.net_play_again}</button>
            <button onClick={leave} className="px-6 py-2.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 border border-slate-700 text-slate-200 text-sm font-bold">{t.net_quit}</button>
          </div>
        </div>
        );
      })()}

      {booting && <BootVeil label={lang === "fr" ? "Synchronisation avec les dresseurs…" : "Syncing with trainers…"} />}
    </DndContext>
  );
}

/** Pokéball boot veil shown briefly at match start while sprites load + the room
 *  syncs, so the first frame everyone sees is fully loaded and in lockstep. */
function BootVeil({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-[#070b16]" style={{ animation: "bootfade 0.4s ease-out 1.5s forwards" }}>
      <div className="relative w-16 h-16 animate-spin" style={{ animationDuration: "1s" }}>
        <div className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(#ef4444 0 calc(50% - 3px), #0f172a calc(50% - 3px) calc(50% + 3px), #f1f5f9 calc(50% + 3px) 100%)", boxShadow: "0 0 0 3px #0f172a, 0 0 22px 3px #ef444455" }} />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 border-[4px] border-slate-900" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <div className="text-lg font-extrabold tracking-wide text-slate-100">Poké<span className="text-amber-400">TFT</span></div>
        <div className="text-xs text-slate-400">{label}</div>
      </div>
      <style>{`@keyframes bootfade { to { opacity: 0; visibility: hidden; } }`}</style>
    </div>
  );
}

/** Top-bar fullscreen toggle. Tracks the current fullscreen state so the icon
 *  reflects whether you're in or out. */
function FullscreenButton() {
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const on = () => setFs(isFullscreen());
    on();
    document.addEventListener("fullscreenchange", on);
    document.addEventListener("webkitfullscreenchange", on);
    return () => {
      document.removeEventListener("fullscreenchange", on);
      document.removeEventListener("webkitfullscreenchange", on);
    };
  }, []);
  return (
    <button
      onClick={() => toggleFullscreen()}
      title={fs ? "Exit fullscreen" : "Fullscreen"}
      className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-300 leading-none"
    >
      {fs ? "⤢" : "⛶"}
    </button>
  );
}

function Kbd({ k, label }: { k: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-[10px] font-bold text-slate-200 leading-none">{k}</kbd>
      <span className="text-[10px] text-slate-400">{label}</span>
    </span>
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
