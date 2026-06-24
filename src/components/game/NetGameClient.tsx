"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DndContext, DragEndEvent, PointerSensor, TouchSensor, useSensor, useSensors, useDroppable } from "@dnd-kit/core";
import { useGame, PENSION_COST, PENSION_ROUNDS, resolveBenchSlots } from "@/game/store/gameStore";
import { useRoom } from "@/game/net/roomStore";
import { startServerTime, serverNow } from "@/game/net/serverTime";
import { resolveRoundStart, endCombat, endCarousel, heartbeat, maybeClaimHost, syncBoard, finishCarouselEarlyIfReady, predictOpponent, PLAN_MS, COMBAT_MS, CAROUSEL_MS } from "@/game/net/match";
import { simulate, type FrameUnit } from "@/game/engine/combat";
import { getDef, spriteUrl, hasDef, archetypeOf } from "@/game/data/mons";
import { rosterForRoom, modeStartItems, modeRoundItem, modeLootScale, modeTeamBuff, modeSignatureAugment, getMode, pickMonoType, isDoubleUp, isNuzlocke } from "@/game/data/gameModes";
import { streakGold, roundKind, advanceRound, boardSizeForLevel, cumulativeRound, ECONOMY } from "@/game/config";
import { serializeBoard, saveGhost, type GhostUnit } from "@/game/net/ghost";
import { interest } from "@/game/engine/economy";
import { MEGA_STONE, canMega } from "@/game/data/mega";
import { COMPONENT_IDS } from "@/game/data/itemPool";
import { enemyToField } from "@/game/engine/hex";
import { AugmentsBar } from "./AugmentsBar";
import { CoopPanel } from "./CoopPanel";
import { finishCarouselEarly, callConcede } from "@/game/net/serverGame";
import { subscribeTransfers } from "@/game/net/coop";
import { recordUltimateBotWin, type RankedResult } from "@/game/net/users";
import { ref as dbRef, onValue } from "firebase/database";
import { db } from "@/game/net/firebase";
import { Trash2, Eye, Maximize, Minimize, AlertTriangle, BarChart3 } from "lucide-react";
import { AUGMENTS, augmentSlot, teamBuffForAugments, combineTeamBuffs, AUGMENT_BY_ID, tailoredAugmentPicks } from "@/game/data/augments";
import { useAppStore } from "@/game/store/appStore";
import { useUi } from "@/game/store/uiStore";
import { makeRng, hashStr } from "@/game/engine/rng";
import { itemsArray, normalizeUnit } from "@/game/net/rtdb-utils";
import { CarouselOverlay, AugmentOverlay, GameOverScreen } from "./GameOverlays";
import type { UnitInstance } from "@/game/types";


// Fixed design canvas the game is laid out on; scaled uniformly to fit any
// screen. Planning and combat now share the SAME layout height (the center
// column is a fixed height in both phases — see CENTER_H), so the canvas size is
// constant and nothing jumps between phases.
const DESIGN_W = 1760;
const DESIGN_H = 1190;
// The middle row (field column) is locked to this height in BOTH phases so the
// battlefield stays put and the bench/shop below it never move when the phase
// flips. Sized to hold the 8-row field plus the floating combat chrome.
const CENTER_H = 748;
// Let the canvas scale UP (not just down) so big monitors aren't left with huge
// empty margins — capped so it doesn't become cartoonishly large.
const MAX_SCALE = 1.5;

function asUnits(u: unknown): UnitInstance[] {
  if (!u) return [];
  return (Array.isArray(u) ? u : Object.values(u as Record<string, UnitInstance>)).map(normalizeUnit);
}
import { Board } from "./Board";
import { Bench } from "./Bench";
import { UnitChip } from "./UnitChip";
import { ShopBar } from "./ShopBar";
import { TraitPanel } from "./TraitPanel";
import { UnitDetail } from "./UnitDetail";
import { OptionsMenu } from "./OptionsMenu";
import { QuickChat } from "./QuickChat";
import { ItemsPanel } from "./ItemsPanel";
import { CombatStage } from "./CombatStage";
import { CoinIcon, PawIcon, SwordIcon, GiftIcon } from "./icons";
import { useT } from "@/lib/i18n";
import { sfx } from "@/lib/audio";
import { toggleFullscreen, isFullscreen } from "@/lib/fullscreen";

function asBoard(b: unknown): UnitInstance[] {
  if (!b) return [];
  const arr = Array.isArray(b) ? b : Object.values(b as Record<string, UnitInstance>);
  // Mirror match.ts board(): drop unknown-def units so the client sim matches the host.
  return (arr as UnitInstance[]).filter((u) => u && u.pos && hasDef(u.defId)).map(normalizeUnit);
}

/** Cheap, stable signature of a frozen board for memo deps — changes whenever the
 *  board's units/positions/items change, so a re-frozen board re-runs the replay. */
function boardSig(b: unknown): string {
  return asBoard(b)
    .map((u) => `${u.iid}@${u.pos?.[0]},${u.pos?.[1]}:${u.star}:${(u.items ?? []).join("+")}`)
    .sort()
    .join("|");
}

function SellZone() {
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({ id: "sell" });
  return (
    <div
      ref={setNodeRef}
      className={`w-[150px] shrink-0 flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed transition-all
        ${isOver ? "border-rose-400 bg-rose-500/25 text-rose-100 scale-[1.03] shadow-[0_0_22px_-6px_rgba(244,63,94,0.7)]" : "border-slate-700/70 bg-slate-900/30 text-slate-500 hover:border-rose-700/60 hover:text-rose-300/80"}`}
    >
      <span className={`leading-none transition-transform ${isOver ? "scale-125" : ""}`}><Trash2 size={24} /></span>
      <span className="text-[10px] font-extrabold uppercase tracking-wider text-center leading-tight px-2">{t.sh_drag_sell}</span>
    </div>
  );
}

/** Pokémon Pension (Day Care): drop a ★ mon in to train it into a ★★ over a few
 *  rounds, then collect it. One slot; costs gold; the mon is away while training. */
function PensionZone() {
  const pension = useGame((s) => s.pension);
  const collect = useGame((s) => s.collectPension);
  const { setNodeRef, isOver } = useDroppable({ id: "pension" });
  const t = useT();
  const ready = !!pension && pension.roundsLeft <= 0;
  if (!pension) {
    return (
      <div
        ref={setNodeRef}
        title={t.net_pension_title(PENSION_COST, PENSION_ROUNDS)}
        className={`w-[120px] shrink-0 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed transition-all
          ${isOver ? "border-emerald-400 bg-emerald-500/25 text-emerald-100 scale-[1.03]" : "border-[var(--panel-edge)] bg-black/25 text-amber-200/55 hover:border-emerald-700/60 hover:text-emerald-300/80"}`}
      >
        <span className={`leading-none ${isOver ? "scale-125" : ""}`}><PawIcon size={22} /></span>
        <span className="text-[9px] font-extrabold uppercase tracking-wider text-center leading-tight px-1">{t.net_pension}</span>
      </div>
    );
  }
  const def = getDef(pension.defId);
  return (
    <div className="gilded w-[120px] shrink-0 flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5">
      <span className="text-[8px] uppercase tracking-wider text-amber-200/55 leading-none">{t.net_pension}</span>
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={spriteUrl(def.dex[0])} alt={def.name} width={44} height={44} style={{ imageRendering: "pixelated" }} className={ready ? "" : "opacity-80"} draggable={false} />
        {!ready && <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-amber-200 drop-shadow">{pension.roundsLeft}</span>}
      </div>
      {ready ? (
        <button onClick={collect} className="px-2 py-0.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-extrabold leading-none">
          {t.net_pension_collect}
        </button>
      ) : (
        <span className="text-[9px] font-bold text-amber-200/70 leading-none">{t.net_pension_rounds(pension.roundsLeft)}</span>
      )}
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

/** Gold cost of an augment reroll after the first (free) one per slot. */
const AUG_REROLL_COST = 2;

export function NetGameClient() {
  const room = useRoom((s) => s.room);
  const myUid = useRoom((s) => s.myUid);
  const mySave = useRoom((s) => s.mySave);
  const leave = useRoom((s) => s.leave);
  // Read-only spectator: we observe a friend's game but must NEVER write to it
  // (no player node, no host loop, no econ). Every write/loop effect below is gated.
  const isSpectator = useRoom((s) => s.spectator);
  const spectateUid = useRoom((s) => s.spectateUid);
  const inspect = useUi((s) => s.inspect);
  const inspectedItem = useUi((s) => s.inspectedItem);

  const newGame = useGame((s) => s.newGame);
  const netRound = useGame((s) => s.netRound);
  const coopReceiveGold = useGame((s) => s.coopReceiveGold);
  const coopReceiveUnit = useGame((s) => s.coopReceiveUnit);
  const importSave = useGame((s) => s.importSave);
  const netCarouselPick = useGame((s) => s.netCarouselPick);
  const pickAugment = useGame((s) => s.pickAugment);
  const augments = useGame((s) => s.augments);
  const lang = useAppStore((s) => s.settings.language);
  const buyXp = useGame((s) => s.buyXp);
  const reroll = useGame((s) => s.reroll);
  const moveToBoard = useGame((s) => s.moveToBoard);
  const moveToBench = useGame((s) => s.moveToBench);
  const reorderBench = useGame((s) => s.reorderBench);
  const sell = useGame((s) => s.sell);
  const depositToPension = useGame((s) => s.depositToPension);
  const equipItem = useGame((s) => s.equipItem);
  const units = useGame((s) => s.units);
  const gold = useGame((s) => s.gold);
  const level = useGame((s) => s.level);
  const fillBoard = useGame((s) => s.fillBoard);
  const spawnDrops = useGame((s) => s.spawnDrops);
  const nuzlockePurge = useGame((s) => s.nuzlockePurge);
  const addRoundStats = useGame((s) => s.addRoundStats);
  const gameTotals = useGame((s) => s.gameTotals);

  // Mouse drags on a 5px move; touch drags on a short press-and-hold so finger
  // scrolling still works on mobile.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 140, tolerance: 8 } }),
  );
  const lastRoundKey = useRef<string | null>(null);
  // "none" until local econ is first hydrated; "fresh" = we fell back to a new game
  // (priv save hadn't arrived yet), "save" = restored from the synced save. Lets a
  // late-arriving save (slow network) heal a premature fresh-start, and gates the
  // save-sync so a not-yet-hydrated client can't overwrite its real priv save.
  const hydrated = useRef<"none" | "fresh" | "save">("none");
  const droppedFor = useRef<string | null>(null); // PvE round key we've already spawned loot for
  const earlyFinishLatch = useRef<string | null>(null); // server-driven carousel early-finish, once per round
  // Synchronous latch so a rapid double-click (or two cards clicked before the
  // re-render hides them) can't claim TWO carousel/augment rewards for one slot —
  // setState is async, so the `picked`/`showAugment` gate alone isn't enough.
  const pickLatch = useRef<string | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Clone-bot ghost: accumulate my board per cumulative round through the game, saved on
  // game-over as users/{uid}/ghost so a future Clone bot can replay my last game.
  const ghostSnaps = useRef<Record<number, GhostUnit[]>>({});
  const actedDeadline = useRef(-1);
  const [roundLog, setRoundLog] = useState<{ stage: number; round: number; won: boolean; pve: boolean; oppUid: string; oppName: string; dmg: number; survivors: number }[]>([]);
  // Past timeline chip the player tapped to see a fight recap (null = closed).
  const [recapKey, setRecapKey] = useState<string | null>(null);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  // The augment slot index we just picked — hides the augment panel immediately on
  // pick (the `<=` count gate alone can leave it open when you're behind a slot).
  const [pickedSlot, setPickedSlot] = useState<number | null>(null);
  const [spectate, setSpectate] = useState<string | null>(null);
  // LP outcome of this ranked game — populated from games/{code}/results/{uid} via server write.
  const [rankResult, setRankResult] = useState<RankedResult | null>(null);
  // Toggle for the "last fight" damage recap, reviewable during planning (both teams).
  const [showRecap, setShowRecap] = useState(false);
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
    const vv = window.visualViewport;
    const fit = () => {
      // Prefer the visual viewport on mobile — it excludes the browser toolbars, so
      // the canvas fills the *actually visible* area instead of leaving a strip
      // hidden behind the URL bar. Falls back to the layout viewport on desktop.
      const w = vv?.width ?? window.innerWidth;
      const h = vv?.height ?? window.innerHeight;
      const s = Math.min(MAX_SCALE, (w - 8) / DESIGN_W, (h - 8) / DESIGN_H);
      setScale(s > 0 ? s : 1);
    };
    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", fit);
    vv?.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("orientationchange", fit);
      vv?.removeEventListener("resize", fit);
    };
  }, []);

  // Boot-veil readiness ref filled in below (after `me` is known).
  const bootReadyRef = useRef(false);
  useEffect(() => {
    // Lift when we're actually READY (room + my player synced) past a short min so
    // sprites get a head start — capped so a slow sync can't hang it. Faster than
    // the old fixed 1.9s on good connections; patient on bad ones.
    const start = performance.now();
    let raf = 0;
    const check = () => {
      const elapsed = performance.now() - start;
      if ((bootReadyRef.current && elapsed > 800) || elapsed > 2400) { setBooting(false); return; }
      raf = requestAnimationFrame(check);
    };
    raf = requestAnimationFrame(check);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Sync the shared clock. The countdowns tick inside their own components
  // (PhaseTimer / Countdown) so the heavy game tree is NOT re-rendered every
  // 250ms — that periodic full re-render was a big source of the stutter.
  useEffect(() => { startServerTime(); }, []);

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
    if (!myUid || isSpectator) return; // spectators never drive or claim the host loop
    const id = setInterval(() => {
      // Async + guarded: a rejected RTDB write (network blip / permission) must
      // not become an unhandled rejection that silently freezes the round loop.
      void (async () => {
        try {
          // Use the always-fresh liveRoom (incl. meta.hostBeat) so host-failover
          // detection still works even though `room` no longer churns on heartbeats.
          const r = useRoom.getState().liveRoom;
          if (!r) return;
          // A dedicated server drives this game (#110 Phase 2) — but if it's >4s late on
          // a deadline (down / erroring / not yet wired), the client takes back over so a
          // server hiccup can never permanently freeze the match.
          if (r.meta?.serverDriven && serverNow() < (r.meta.deadline ?? 0) + 4000) return;
          // Use the claim's authoritative result (not the stale snapshot's hostUid), so
          // a fresh promotion drives this very tick instead of idling one cycle (~700ms),
          // which under a slow link could let a deadline slip after host migration.
          const amHost = await maybeClaimHost(r.code, r, myUid);
          if (!amHost) return;
          await heartbeat(r.code);
          // End the carousel the moment everyone has picked (don't wait the timer).
          if (r.meta.phase === "carousel") await finishCarouselEarlyIfReady(r.code, r);
          if (serverNow() >= r.meta.deadline && actedDeadline.current !== r.meta.deadline) {
            actedDeadline.current = r.meta.deadline;
            if (r.meta.phase === "planning") await resolveRoundStart(r.code, r);
            else if (r.meta.phase === "combat") await endCombat(r.code, r);
            else if (r.meta.phase === "carousel") await endCarousel(r.code, r);
          }
        } catch (err) {
          console.error("[host-loop]", err);
          // A transition threw (withClaimGuard already released the parked lock by
          // resetting the deadline). Clear the idempotency guard so this host
          // re-attempts the round on the next tick instead of staying blocked.
          actedDeadline.current = -1;
        }
      })();
    }, 700);
    return () => clearInterval(id);
  }, [myUid, isSpectator]);

  const meta = room?.meta;
  const players = room?.players ?? {};
  const me = myUid ? players[myUid] : undefined;
  // Keep the boot-veil readiness flag in a ref (read by the veil interval above).
  useEffect(() => { bootReadyRef.current = !!room && (!!me || isSpectator); }, [room, me, isSpectator]);

  // Spectator follow target: always be watching SOMEONE. Default to the friend we
  // opened the spectate on; if they've left the game (their node is gone), fall back
  // to the leader. We don't auto-switch off a player who merely died — you keep
  // watching their final board, same as in-match scouting.
  useEffect(() => {
    if (!isSpectator || !room) return;
    if (spectate && players[spectate]) return; // already following a valid player
    const pick = spectateUid && players[spectateUid]
      ? spectateUid
      : Object.values(players).sort((a, b) => Number(b.alive) - Number(a.alive) || b.hp - a.hp)[0]?.uid;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pick) setSpectate(pick);
  }, [isSpectator, spectateUid, spectate, players, room]);

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
    if (!room || !meta || isSpectator) return; // spectators have no econ to grant
    // Same roster the host uses (selected gens, drawn to the draft size, seeded by
    // the room code) — so the shop pool always respects the lobby's region/draft
    // rules, on a fresh start AND on a reconnect/restore.
    const roster = () => rosterForRoom(room.rules, hashStr(room.code));
    const enabledItems = room.rules?.itemsEnabled;

    // FIRST LOAD — hydrate local econ as soon as the priv snapshot resolves, in ANY
    // phase. Reconnecting/refreshing mid-combat or mid-carousel must show the real
    // gold/level immediately, not the store defaults (gold 4 / Lv 1) until the next
    // planning round.
    if (hydrated.current === "none") {
      if (mySave === undefined) return; // priv still loading; re-runs when it resolves
      const save = mySave ?? me?.save; // private path first, legacy public save as fallback
      // If we fall back to fresh, it's marked "fresh" (not "save") so a late-arriving
      // save can still heal it via the self-heal branch below — a slow priv read can
      // never permanently wipe an in-progress game.
      if (save) { importSave({ ...save, units: asUnits(save.units) }, roster(), enabledItems); hydrated.current = "save"; }
      else { newGame(roster(), enabledItems, modeStartItems(room.rules)); hydrated.current = "fresh"; ghostSnaps.current = {}; }
      // Mark the current planning round consumed so netRound doesn't double-grant it.
      lastRoundKey.current = phase === "planning" ? `${meta.stage}-${meta.round}` : "__hydrated__";
      return;
    }

    // SELF-HEAL — if we fell back to a fresh start (watchdog/slow net) and the real
    // save arrives afterwards, restore it so a slow reconnect isn't permanently wiped.
    if (hydrated.current === "fresh" && mySave) {
      importSave({ ...mySave, units: asUnits(mySave.units) }, roster(), enabledItems);
      hydrated.current = "save";
      return;
    }

    // SUBSEQUENT planning rounds — grant the per-round economy once each.
    if (phase !== "planning") return;
    const key = `${meta.stage}-${meta.round}`;
    if (lastRoundKey.current === key) return;
    lastRoundKey.current = key;
    // A positive streak means the previous combat was a win → pay TFT win-gold (+1).
    // Game-mode round grants (Mega Madness stone, Treasure Hunt loot) ride along too.
    netRound(meta.stage, meta.round, me?.streak ?? 0, (me?.streak ?? 0) > 0,
      { roundItem: modeRoundItem(room.rules), lootScale: modeLootScale(room.rules) });

    // Nuzlocke: permanently remove any unit the host flagged as dead this round.
    // The host writes nuzDead/{uid} in endCombat for every loser's board units; we
    // read it once here and purge — no gold back, they're gone for good.
    if (myUid && isNuzlocke(room.rules)) {
      const deadIids: string[] = room.nuzDead?.[myUid] ?? [];
      if (deadIids.length) nuzlockePurge(deadIids);
    }
  }, [phase, meta?.stage, meta?.round, mySave]); // eslint-disable-line react-hooks/exhaustive-deps

  // Double Up co-op: receive gold/units my partner sends, apply to my own econ, then the
  // mailbox entry is deleted (in coop.ts). Only mounts in a Double Up game.
  useEffect(() => {
    const code = room?.code;
    if (!code || !myUid || isSpectator || !isDoubleUp(room?.rules)) return;
    const unsub = subscribeTransfers(code, myUid, (t) => {
      if (t.kind === "gold") coopReceiveGold(t.gold);
      else if (t.kind === "unit") coopReceiveUnit(t.unit);
    });
    return unsub;
  }, [room?.code, myUid, isSpectator, room?.rules?.mode, coopReceiveGold, coopReceiveUnit]);

  // Push my board + economy snapshot to the room (debounced) — board for combat,
  // save for reconnect.
  useEffect(() => {
    if (!room || !myUid || isSpectator || phase !== "planning") return;
    if (hydrated.current === "none") return; // never push defaults over the real priv save
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      const g = useGame.getState();
      syncBoard(room.code, myUid, g.units, g.exportSave(), g.level, g.augments, g.gold);
      // Snapshot my board for this cumulative round (last edit wins) for the Clone-bot ghost.
      if (meta) ghostSnaps.current[cumulativeRound(meta.stage, meta.round)] = serializeBoard(g.units);
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
    if (!myUid || isSpectator || phase !== "planning") return;
    const id = setInterval(() => {
      const r = useRoom.getState().liveRoom;
      if (!r?.meta || r.meta.phase !== "planning") return;
      if (hydrated.current === "none") return; // not hydrated yet — don't sync defaults
      if (r.meta.deadline - serverNow() <= 2500) {
        // Last-second safety net: if the player left bench units while the board
        // has room, auto-deploy them just before the fight (NOT on every level-up).
        useGame.getState().fillBoard();
        const g = useGame.getState();
        syncBoard(r.code, myUid, g.units, g.exportSave(), g.level, g.augments);
      }
    }, 200);
    return () => clearInterval(id);
  }, [phase, myUid, isSpectator]);

  // Cheap board signatures, memoized so they're not recomputed (asBoard+sort+join)
  // on every render of this hot component — only when the frozen board ref changes.
  const mySelfSig = useMemo(() => boardSig(myCombat?.selfBoard), [myCombat?.selfBoard]);
  const myOppSig = useMemo(() => boardSig(myCombat?.oppBoard), [myCombat?.oppBoard]);

  // Replay from the boards the host FROZE into the combat assignment, so the
  // result shown always matches the host's authoritative outcome.
  const combatResult = useMemo(() => {
    if (phase !== "combat" || !myCombat) return null;
    // Both paired players run the IDENTICAL canonical call simulate(attacker,
    // defender): the flipped (enemy-side) player passes opp,self so the args
    // match the host's a,b. Guarantees the same frames + outcome on every screen.
    const [p1, p2] = myCombat.flip ? [myCombat.oppBoard, myCombat.selfBoard] : [myCombat.selfBoard, myCombat.oppBoard];
    // Combat-augment team buffs, applied to the SAME ally/enemy sides the host used.
    // Owners of p1/p2 follow the flip; PvE creeps (p2 when pve) get no buff.
    const pl = room?.players ?? {};
    const [u1, u2] = myCombat.flip ? [myCombat.oppUid, myUid] : [myUid, myCombat.oppUid];
    // Fold the region modifier into BOTH human sides exactly like the host (teamBuffFor).
    const modBuff = modeTeamBuff(room?.rules);
    const allyBuff = combineTeamBuffs(teamBuffForAugments(pl[u1 ?? ""]?.augments), modBuff);
    const enemyBuff = myCombat.pve ? undefined : combineTeamBuffs(teamBuffForAugments(pl[u2 ?? ""]?.augments), modBuff);
    return simulate(asBoard(p1), asBoard(p2), allyBuff, enemyBuff);
    // Re-run when the frozen boards themselves change (host failover re-freeze or a
    // late buzzer-beater sync for the same stage/round/opp) — not just on round id,
    // else the replay frames can drift from the authoritative win flag.
  }, [phase, meta?.stage, meta?.round, myCombat?.oppUid, myCombat?.flip, mySelfSig, myOppSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Remember my LAST fight's units (with cumulative damage/tank/heal) so the end screen can
  // crown an MVP. My side is "ally" normally, "enemy" when the pairing flipped me.
  const lastFightRef = useRef<FrameUnit[] | null>(null);
  // Both teams' final-frame stats, kept as STATE (read in render for the planning recap, so a
  // ref would be a "ref-during-render" violation) — and it shows the enemy team too, not just yours.
  const [lastFight, setLastFight] = useState<{ mine: FrameUnit[]; theirs: FrameUnit[]; oppName: string } | null>(null);
  useEffect(() => {
    if (!combatResult?.frames?.length || !myCombat) return;
    const myTeam = myCombat.flip ? "enemy" : "ally";
    const last = combatResult.frames[combatResult.frames.length - 1];
    const mine = last.units.filter((u) => u.team === myTeam);
    const theirs = last.units.filter((u) => u.team !== myTeam);
    if (mine.length) {
      lastFightRef.current = mine;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!myCombat.pve) setLastFight({ mine, theirs, oppName: myCombat.oppName ?? t.net_rival });
    }
    if (meta && mine.length) {
      const roundKey = `${meta.stage}-${meta.round}`;
      if (lastRoundKey.current !== roundKey) {
        lastRoundKey.current = roundKey;
        addRoundStats({
          dmgDealt: mine.reduce((s, u) => s + (u.dmgDealt ?? 0), 0),
          dmgTaken: mine.reduce((s, u) => s + (u.dmgTaken ?? 0), 0),
          healed: mine.reduce((s, u) => s + (u.healed ?? 0), 0),
          won: !!myCombat.won,
        });
      }
    }
  }, [combatResult, myCombat?.flip]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live replay of the rival I'm spectating (from the host's frozen boards).
  const spectateCombat = spectate && spectate !== myUid ? room?.combat?.[spectate] : undefined;
  const specSelfSig = useMemo(() => boardSig(spectateCombat?.selfBoard), [spectateCombat?.selfBoard]);
  const specOppSig = useMemo(() => boardSig(spectateCombat?.oppBoard), [spectateCombat?.oppBoard]);
  const spectateCombatResult = useMemo(() => {
    if (phase !== "combat" || !spectateCombat) return null;
    const [p1, p2] = spectateCombat.flip ? [spectateCombat.oppBoard, spectateCombat.selfBoard] : [spectateCombat.selfBoard, spectateCombat.oppBoard];
    const pl = room?.players ?? {};
    const [u1, u2] = spectateCombat.flip ? [spectateCombat.oppUid, spectate] : [spectate, spectateCombat.oppUid];
    const modBuff = modeTeamBuff(room?.rules);
    const allyBuff = combineTeamBuffs(teamBuffForAugments(pl[u1 ?? ""]?.augments), modBuff);
    const enemyBuff = spectateCombat.pve ? undefined : combineTeamBuffs(teamBuffForAugments(pl[u2 ?? ""]?.augments), modBuff);
    return simulate(asBoard(p1), asBoard(p2), allyBuff, enemyBuff);
  }, [phase, meta?.stage, meta?.round, spectate, spectateCombat?.oppUid, spectateCombat?.flip, specSelfSig, specOppSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Augment round? (stage 2/3/4 round 1). Show the pick until this slot is taken.
  const augSlotNow = meta && phase === "planning" && me?.alive && room?.rules?.augmentsEnabled !== false ? augmentSlot(meta.stage, meta.round) : null;
  // Reroll: the first reroll of each slot is free, then AUG_REROLL_COST gold each. The nonce
  // re-rolls the (purely local) offering. Reset whenever a new slot opens.
  const [augReroll, setAugReroll] = useState(0);
  useEffect(() => { setAugReroll(0); }, [augSlotNow]);
  const augOptions = useMemo(() => {
    if (augSlotNow == null) return [];
    const owned = new Set(useGame.getState().augments);
    // Region signature augments (sig-*) are ONLY offered in their own Region Clash mode.
    const sigId = modeSignatureAugment(room?.rules);
    const isSig = (id: string) => id.startsWith("sig-");
    // Tier escalates with the slot (silver at 2-2, gold at 3-2, prismatic at 4-2); fall back
    // to the full pool if a tier runs dry.
    const tier = (["silver", "gold", "prismatic"] as const)[augSlotNow] ?? "gold";
    let pool = AUGMENTS.filter((a) => !owned.has(a.id) && !isSig(a.id) && a.tier === tier);
    if (pool.length < 3) pool = AUGMENTS.filter((a) => !owned.has(a.id) && !isSig(a.id));
    // Board damage lean (physical vs special carries) → tailors which augments are offered.
    const myBoard = useGame.getState().units.filter((u) => u.pos !== null);
    const profile = myBoard.reduce((acc, u) => {
      const arch = archetypeOf(getDef(u.defId));
      if (arch === "physical") acc.ad += 1; else if (arch === "mage") acc.ap += 1;
      return acc;
    }, { ad: 0, ap: 0 });
    // Seed folds the slot, my uid, AND the reroll count so each reroll yields a fresh offer.
    let seed = augSlotNow * 9973 + 7 + augReroll * 131071;
    for (let i = 0; i < (myUid?.length ?? 0); i++) seed = (seed * 31 + myUid!.charCodeAt(i)) >>> 0;
    const picks = tailoredAugmentPicks(pool, profile, 3, makeRng(seed >>> 0));
    // Region Clash: guarantee the region's signature augment as the first option (once,
    // if not already owned), so each region's identity augment is always reachable.
    if (sigId && !owned.has(sigId) && AUGMENT_BY_ID[sigId] && !picks.some((p) => p.id === sigId)) {
      picks[0] = AUGMENT_BY_ID[sigId];
    }
    return picks;
  }, [augSlotNow, myUid, room?.rules?.mode, augReroll]);

  // Reroll the augment offer: first per slot is free, then AUG_REROLL_COST gold (button disabled if broke).
  const augRerollCost = augReroll === 0 ? 0 : AUG_REROLL_COST;
  const rerollAugments = () => {
    if (augRerollCost > 0) {
      const g = useGame.getState().gold;
      if (g < augRerollCost) return;
      useGame.setState({ gold: g - augRerollCost });
    }
    setAugReroll((n) => n + 1);
  };

  // Planning hotkeys: R reroll · L buy XP · S sell the inspected unit. Disabled
  // while spectating a rival — otherwise R/L/S silently mutate YOUR own economy
  // (reroll/buy-xp/sell-last-inspected) while you're looking at someone else's board.
  useEffect(() => {
    // Disabled while spectating a rival (you'd otherwise mutate your OWN econ).
    if (phase !== "planning" || (!!spectate && spectate !== myUid)) return;
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
  }, [phase, spectate, myUid, reroll, buyXp, sell]);

  // When you're eliminated, default to watching the current leader.
  const prevAliveRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (me && !me.alive && prevAliveRef.current === true) sfx.eliminate();
    prevAliveRef.current = me?.alive;
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
        return [...h, { stage: meta.stage, round: meta.round, won: myCombat.won, pve: !!myCombat.pve, oppUid: myCombat.oppUid, oppName: myCombat.oppName, dmg: myCombat.dmg ?? 0, survivors: myCombat.survivors ?? 0 }];
      });
    }
  }, [phase, meta?.stage, meta?.round, myCombat?.oppUid, myCombat?.pve, meta]); // eslint-disable-line react-hooks/exhaustive-deps

  // Server-driven carousel: once every alive human has picked, ask the server to end
  // the round early instead of waiting the timer (host-gated so only one client calls).
  useEffect(() => {
    const r = room;
    if (phase !== "carousel" || !meta || !r?.meta?.serverDriven || r.meta.hostUid !== myUid) return;
    const key = `${meta.stage}-${meta.round}`;
    if (earlyFinishLatch.current === key) return;
    const humans = Object.values(r.players ?? {}).filter((p) => !p.isBot && p.alive);
    if (humans.length > 0 && humans.every((p) => p.carouselPicked === key)) {
      earlyFinishLatch.current = key;
      finishCarouselEarly(r.code);
    }
  }, [phase, meta?.stage, meta?.round, room, myUid]); // eslint-disable-line react-hooks/exhaustive-deps

  // PvE loot: when a wild fight resolves, drop item components AT slain creep
  // positions (the enemy half) so loot lands where the mob fell. GUARANTEED like TFT —
  // every wild round yields components (no feast/famine RNG); bigger encounters drop
  // more. Deterministic per round (a reconnect re-spawns identical drops, deduped).
  useEffect(() => {
    if (phase !== "combat" || !myCombat?.pve || !meta) return;
    const key = `${meta.stage}-${meta.round}`;
    if (droppedFor.current === key) return;
    droppedFor.current = key;
    const creeps = asBoard(myCombat.oppBoard).filter((u) => u.pos);
    if (!creeps.length) return;
    const h = (meta.stage * 131 + meta.round * 17) >>> 0;
    // Guaranteed component count: 1 in the early game, 2 once the Apex/Legendary
    // encounters arrive (stage 4+). Capped by how many creeps actually fell.
    const count = Math.min(creeps.length, meta.stage >= 4 ? 2 : 1);
    const drops = Array.from({ length: count }, (_, i) => {
      const creep = creeps[((h >> 3) + i) % creeps.length];
      const fieldCell = enemyToField(creep.pos![0], creep.pos![1]);
      return { id: `drop-${key}-${i}`, itemId: COMPONENT_IDS[(h + i * 7) % COMPONENT_IDS.length], cell: [fieldCell.c, fieldCell.r] as [number, number] };
    });
    spawnDrops(drops);
  }, [phase, meta?.stage, meta?.round, myCombat?.pve, myOppSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Play victory/defeat sound when the game ends. Computed inline (the `iWon`
  // const is derived after the early-return guard, so it isn't in scope here).
  const prevPhase = useRef<string | null>(null);
  // The game code we've already fired SFX/ghost-save for — exactly once per match.
  // Reset when a fresh match begins.
  const recordedRef = useRef<string | null>(null);
  useEffect(() => {
    // Spectators have no stake in the game — never save a ghost, record history, or apply LP.
    if (isSpectator) { prevPhase.current = phase ?? null; return; }
    const ps = room?.players ?? {};
    const meP = myUid ? ps[myUid] : undefined;
    const code = room?.code;
    // Fresh match (lobby, or a new planning round before I have a placement) → arm recording again.
    if (phase === "lobby" || (phase === "planning" && meP?.place == null && meP?.alive)) recordedRef.current = null;

    // Record the instant MY result is DECIDED — I got a placement (eliminated OR won) or the whole
    // game is over — NOT only at the global "over". Otherwise being knocked out in a solo-vs-bots
    // game and leaving before the bots finish would never log the game or its LP (the bug).
    const meDecided = phase === "over" || meP?.place != null;
    if (myUid && code && meDecided && recordedRef.current !== code) {
      recordedRef.current = code;
      const wonByTeam = meta?.winnerTeam != null && meP?.teamId === meta.winnerTeam;
      const lastOneStanding = meP?.place === 1 || meta?.winnerUid === myUid || wonByTeam;
      if (lastOneStanding) sfx.victory(); else sfx.defeat();
      saveGhost(myUid, ghostSnaps.current, room?.rules?.generations).catch(() => {});
      setRankResult(null); // clear prior game LP; server result arrives via results/{uid} listener
      const place = meP?.place ?? (lastOneStanding ? 1 : Object.values(ps).filter((p) => !p.isBot).length);
      const all = Object.values(ps);
      // Hidden progression: a WIN against a lobby that held an ultimate/nightmare bot.
      const won = place === 1 || meta?.winnerUid === myUid;
      const hadTopBot = all.some((p) => p.isBot && (p.botDifficulty === "ultimate" || p.botDifficulty === "nightmare"));
      if (won && hadTopBot) recordUltimateBotWin(myUid).catch(() => {});
    }
    // Fire round-start SFX when the phase flips to combat.
    if (phase === "combat" && prevPhase.current === "planning") sfx.roundStart();
    prevPhase.current = phase ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, myUid ? room?.players?.[myUid]?.place : null, myUid ? room?.players?.[myUid]?.alive : null]);

  // Subscribe to the server-written LP result. The server writes games/{code}/results/{uid}
  // via applyRatingFor when a player's final place is decided — this listener delivers it to
  // the end screen without the client touching any write path.
  const serverResultCode = room?.code;
  useEffect(() => {
    if (!serverResultCode || !myUid) return;
    const unsub = onValue(dbRef(db(), `games/${serverResultCode}/results/${myUid}`), (snap) => {
      if (!snap.exists()) return;
      const r = snap.val() as { delta: number; rating: number; prevRating: number };
      setRankResult({ delta: r.delta, rating: r.rating, prevRating: r.prevRating });
    });
    return unsub;
  }, [serverResultCode, myUid]);

  const [confirmLeave, setConfirmLeave] = useState(false);
  // Float-up text: "+X gold" or "−X HP" shown briefly near the HUD on econ events.
  const [floatText, setFloatText] = useState<string | null>(null);
  const floatKey = useRef(0);
  // Screen-flash: brief red glow on the board container when taking HP damage.
  const [boardFlash, setBoardFlash] = useState(false);

  // Stage-up announce — flash a "Stage N" banner whenever the stage increments.
  const [stageBanner, setStageBanner] = useState<number | null>(null);
  const prevStage = useRef<number | null>(null);
  useEffect(() => {
    const s = meta?.stage;
    if (s == null) return;
    if (prevStage.current !== null && s > prevStage.current) setStageBanner(s);
    prevStage.current = s;
  }, [meta?.stage]);
  useEffect(() => {
    if (stageBanner == null) return;
    const id = setTimeout(() => setStageBanner(null), 2200);
    return () => clearTimeout(id);
  }, [stageBanner]);

  // Level-up SFX: fire when the local level increases (buyXp or netRound passive XP).
  const prevLevelRef = useRef<number | null>(null);
  useEffect(() => {
    if (isSpectator) return;
    if (prevLevelRef.current !== null && level > prevLevelRef.current) sfx.levelUp();
    prevLevelRef.current = level;
  }, [level, isSpectator]);

  // Gold-gain SFX + float-up text: fire when gold increases (income, interest, augments).
  const prevGoldRef = useRef<number | null>(null);
  useEffect(() => {
    if (isSpectator) return;
    if (prevGoldRef.current !== null && gold > prevGoldRef.current) {
      sfx.goldGain();
      const diff = gold - prevGoldRef.current;
      floatKey.current += 1;
      setFloatText(`+${diff}`);
      const id = setTimeout(() => setFloatText(null), 1200);
      prevGoldRef.current = gold;
      return () => clearTimeout(id);
    }
    prevGoldRef.current = gold;
  }, [gold, isSpectator]); // eslint-disable-line react-hooks/exhaustive-deps

  // HP damage SFX + screen-flash + float-up text: fire when the player's HP decreases.
  const prevHpRef = useRef<number | null>(null);
  useEffect(() => {
    if (isSpectator || !me) return;
    const hp = me.hp ?? 100;
    if (prevHpRef.current !== null && hp < prevHpRef.current) {
      sfx.damage();
      setBoardFlash(true);
      const diff = prevHpRef.current - hp;
      floatKey.current += 1;
      setFloatText(`−${diff} HP`);
      const id = setTimeout(() => { setBoardFlash(false); setFloatText(null); }, 1200);
      prevHpRef.current = hp;
      return () => clearTimeout(id);
    }
    prevHpRef.current = hp;
  }, [me?.hp, isSpectator]); // eslint-disable-line react-hooks/exhaustive-deps

  // A partial/glitched room sync (room present but meta/myUid briefly missing) used to
  // render a bare blank canvas with no way out. Show a reconnecting veil with an escape
  // hatch so a stuck sync never traps the player on a black screen.
  if (!room || !meta || !myUid) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 app-bg text-center px-6">
        <div className="w-8 h-8 rounded-full border-2 border-amber-400/40 border-t-amber-400 animate-spin" />
        <p className="text-sm text-slate-400">{t.net_reconnecting}</p>
        <button onClick={leave} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-300">
          {t.net_back_home}
        </button>
      </div>
    );
  }

  const isHost = meta.hostUid === myUid;
  const ladder = Object.values(players).sort((a, b) => Number(b.alive) - Number(a.alive) || b.hp - a.hp);
  const aliveCount = Object.values(players).filter((p) => p.alive).length;
  // Human trainers connected — drives the boot-veil progress while everyone joins.
  const humanPlayers = Object.values(players).filter((p) => !p.isBot);
  const connectedHumans = humanPlayers.filter((p) => p.connected).length;
  const gameOver = phase === "over";
  // Double Up: my team, my partner, and the shared HP (mirrored onto player.hp by the host).
  const doubleUp = isDoubleUp(room.rules);
  const partner = doubleUp && me?.teamId != null ? Object.values(players).find((p) => p.uid !== myUid && p.teamId === me.teamId) : undefined;
  // Read the AUTHORITATIVE result (place 1 / meta.winnerUid / winning team) rather than
  // deriving it from our own alive view — so every client shows the identical ending.
  const iWon = gameOver && (me?.place === 1 || (!!meta?.winnerUid && meta.winnerUid === myUid) || (meta?.winnerTeam != null && me?.teamId === meta.winnerTeam));

  const inMatch = phase === "planning" || phase === "combat" || phase === "carousel";
  // Forfeit: server picks the worst-alive placement, writes elimination + LP, then we leave.
  const doConcede = async () => {
    if (recordedRef.current === room.code) { leave(); return; }
    recordedRef.current = room.code;
    try {
      await callConcede(room.code);
    } catch { /* best-effort */ }
    leave();
  };
  const onLeaveClick = () => { if (me?.alive && inMatch) setConfirmLeave(true); else leave(); };

  const phaseLabel = phase === "combat" ? t.net_phase_combat
    : phase === "carousel" ? t.net_phase_carousel
    : phase === "over" ? t.net_phase_over
    : t.net_phase_planning;

  function onDragEnd(e: DragEndEvent) {
    // Bench management + selling stay available during combat (no effect on the
    // frozen, already-resolved fight). Board placement is locked while fighting.
    if (phase !== "planning" && phase !== "combat") return;
    // While spectating a rival, drags must not mutate YOUR own board/econ (same
    // class as the disabled R/L/S hotkeys) — your bench is still rendered below.
    if (!!spectate && spectate !== myUid) return;
    const over = e.over?.id;
    if (!over) return;
    const target = String(over);

    // Item drag → equip onto the mon at the drop target (planning only).
    const itemId = e.active.data.current?.itemId as string | undefined;
    if (itemId) {
      if (phase !== "planning") return;
      const g = useGame.getState();
      let unit: UnitInstance | undefined;
      if (target.startsWith("cell-")) {
        const [, c, r] = target.split("-");
        unit = g.units.find((u) => u.pos?.[0] === Number(c) && u.pos?.[1] === Number(r));
      } else if (target.startsWith("bench-")) {
        unit = resolveBenchSlots(g.units)[Number(target.slice("bench-".length))] ?? undefined;
      }
      if (unit && itemId === MEGA_STONE && !canMega(unit.defId)) {
        useUi.getState().pushToast(t.net_no_mega);
      } else if (unit) {
        equipItem(unit.iid, itemId);
        sfx.itemEquip();
      }
      return;
    }

    const iid = String(e.active.id);
    if (target === "sell" || target === "sell-shop") sell(iid);
    else if (target === "pension") { if (phase === "planning") depositToPension(iid); }
    else if (target.startsWith("bench-")) {
      // A specific bench slot: place the mon THERE (gaps allowed). A board unit is
      // benched first, then moved to the exact slot; a bench unit just relocates/swaps.
      const idx = Number(target.slice("bench-".length));
      const u = useGame.getState().units.find((x) => x.iid === iid);
      if (u && u.pos !== null) moveToBench(iid);
      reorderBench(iid, idx);
    }
    else if (target === "bench") moveToBench(iid);
    else if (target.startsWith("cell-")) {
      if (phase !== "planning") return; // can't move onto the board mid-combat
      const [, c, r] = target.split("-");
      moveToBoard(iid, Number(c), Number(r));
    }
  }

  // Push the current economy + board to RTDB immediately (bypassing the debounce).
  // Carousel/augment picks must persist before the round can flip, or they're lost —
  // so this MUST carry level + augments too (a freshly-picked combat augment has to be
  // public before the host resolves the next fight, or it applies the OLD buff set).
  function flushSync() {
    if (!room || !myUid) return;
    const g = useGame.getState();
    syncBoard(room.code, myUid, g.units, g.exportSave(), g.level, g.augments);
  }

  const streak = me?.streak ?? 0;
  // Show the augment pick whenever you still owe one for this slot. Uses `<=` (not
  // `===`): if you ever let an augment timer expire without picking, `===` would
  // leave length permanently out of step and lock you out of EVERY future augment.
  const showAugment = augSlotNow != null && augments.length <= augSlotNow && pickedSlot !== augSlotNow;
  // Spectating a rival from the scoreboard → watch their board, bench and fights
  // (read-only). Works while alive (scouting) and after death (keep watching).
  const spectating = !!spectate && spectate !== myUid && !!players[spectate];
  const spectateP = spectating ? players[spectate!] : undefined;
  const spectateUnits = spectating ? asBoard(spectateP?.board) : null;
  // Bench is now PUBLIC (lobby chose full transparency), so spectating shows the rival's bench.
  // Bench units carry pos === null, so normalise without asBoard's pos filter.
  const spectateBench: UnitInstance[] = (() => {
    if (!spectating) return [];
    const raw = spectateP?.bench;
    const arr = Array.isArray(raw) ? raw : raw ? Object.values(raw) : [];
    return (arr as UnitInstance[])
      .filter((u) => u && hasDef(u.defId))
      .map((u) => ({ ...u, items: itemsArray(u.items) }));
  })();

  // Forward-looking timeline: the current stage + the next two, each round
  // tagged with its kind (PvE / carousel / PvP) and overlaid with past results.
  const resultByKey = new Map(roundLog.map((h) => [`${h.stage}-${h.round}`, h.won]));
  const recapByKey = new Map(roundLog.map((h) => [`${h.stage}-${h.round}`, h]));
  const schedule: { stage: number; round: number; kind: ReturnType<typeof roundKind> }[] = [];
  {
    let s = meta.stage, r = 1; // start at round 1 of the current stage
    for (let i = 0; i < 40; i++) {
      schedule.push({ stage: s, round: r, kind: roundKind(s, r) });
      const nx = advanceRound(s, r);
      if (nx.stage > meta.stage) break; // only the CURRENT stage's rounds
      s = nx.stage; r = nx.round;
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <Toasts />
      {/* Concede / forfeit confirm */}
      {confirmLeave && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setConfirmLeave(false)}>
          <div className="gilded gilded-strong w-full max-w-sm rounded-xl p-5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-extrabold text-rose-300">{t.net_forfeit_title}</h3>
            <p className="text-[12px] text-slate-400">{t.net_forfeit_body}</p>
            <div className="flex gap-2 mt-1">
              <button onClick={() => { setConfirmLeave(false); doConcede(); }} className="flex-1 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold">{t.net_forfeit_confirm}</button>
              <button onClick={() => setConfirmLeave(false)} className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm font-bold">{t.net_forfeit_cancel}</button>
            </div>
          </div>
        </div>
      )}
      {/* Stage-up announce overlay */}
      {stageBanner != null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none">
          <div className="stage-banner text-center">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.4em] text-amber-300/80 mb-1">{t.net_stage_banner}</div>
            <div className="text-6xl font-black gild-text drop-shadow-[0_4px_30px_rgba(212,175,55,0.4)]">{stageBanner}</div>
            <div className="text-xs text-slate-400 mt-2 tracking-wide">
              {stageBanner <= 2 ? t.net_stage_early
                : stageBanner === 3 ? t.net_stage_mid
                : stageBanner === 4 ? t.net_stage_powerspike
                : t.net_stage_endgame}
            </div>
          </div>
        </div>
      )}
      <div className="tft-shell fixed inset-0 flex justify-center items-center overflow-hidden">
      <div
        style={{ width: DESIGN_W, height: DESIGN_H, transform: `scale(${scale})`, transformOrigin: "center" }}
        className="flex flex-col gap-2 px-3 py-2 shrink-0"
      >
        {/* Round tracker (TFT-style): an icon per round — Sword=PvP, Leaf=PvE, Gift=
            carousel — grouped by stage. The current round glows; past PvP rounds
            colour win/loss and stay clickable for a recap. */}
        <div className="gilded relative z-20 flex items-center gap-3 px-3 py-1.5 rounded-lg">
          {/* Current stage/round recap, pinned beside the round tracker. */}
          <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.06]">
            <span className="text-[8px] uppercase tracking-[0.15em] text-slate-400/70 leading-none">{t.net_stage}</span>
            <span className="text-base font-bold tabular-nums gild-text leading-none">{meta.stage}-{meta.round}</span>
          </div>
          <div className="flex-1 flex items-center justify-center gap-1 overflow-x-auto">
            {schedule.map(({ stage, round, kind }) => {
              const key = `${stage}-${round}`;
              const result = resultByKey.get(key);
              const isCurrent = stage === meta.stage && round === meta.round;
              const isPast = result !== undefined;
              const icon = kind === "carousel" ? <GiftIcon size={14} /> : kind === "pve" ? <PawIcon size={14} /> : <SwordIcon size={14} />;
              const recap = recapByKey.get(key);
              const clickable = isPast && !!recap && !recap.pve && recap.oppUid !== myUid && !!players[recap.oppUid];
              const open = recapKey === key;
              // State styling: current glows; past = win/loss tint; future = kind tint.
              const cls = isCurrent
                ? "bg-sky-500/25 ring-2 ring-sky-300 scale-[1.18] shadow-[0_0_14px_-2px_rgba(56,189,248,0.7)] z-10"
                : isPast
                  ? (result ? "bg-emerald-600/25 ring-1 ring-emerald-400/50" : "bg-rose-600/25 ring-1 ring-rose-400/50")
                  : kind === "carousel" ? "bg-fuchsia-900/25 ring-1 ring-fuchsia-500/30"
                  : kind === "pve" ? "bg-amber-900/20 ring-1 ring-amber-600/30"
                  : "bg-slate-800/60 ring-1 ring-slate-600/40";
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!clickable}
                  onClick={() => {
                    if (!clickable || !recap) return;
                    if (open) setRecapKey(null);
                    else { setRecapKey(key); setSpectate(recap.oppUid); }
                  }}
                  title={`${key} · ${kind}${isPast ? (result ? " · Win" : " · Loss") : ""}${clickable ? " · click for recap" : ""}`}
                  className={`relative w-6 h-6 shrink-0 rounded flex items-center justify-center text-[12px] leading-none grayscale-[0.15] transition-all ${cls} ${open ? "ring-2 ring-amber-300" : ""} ${clickable ? "cursor-pointer hover:brightness-125" : "cursor-default"}`}
                >
                  <span className={isPast && !isCurrent ? "opacity-80" : ""}>{icon}</span>
                  {isPast && !isCurrent && (
                    <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-900 ${result ? "bg-emerald-400" : "bg-rose-400"}`} />
                  )}
                </button>
              );
            })}
          </div>
          {recapKey && recapByKey.get(recapKey) && (() => {
            const r = recapByKey.get(recapKey)!;
            const opp = players[r.oppUid];
            return (
              <div className="gilded gilded-strong absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-3 px-3 py-1 rounded-lg shrink-0">
                <span className="text-[10px] font-bold text-slate-400">{recapKey}</span>
                <span className="flex items-center gap-1.5">
                  {opp?.photoURL
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={opp.photoURL} alt="" width={18} height={18} className="rounded" style={{ imageRendering: "pixelated" }} />
                    : null}
                  <span className="text-[11px] font-bold text-slate-200">{r.oppName}</span>
                </span>
                <span className={`text-[11px] font-extrabold ${r.won ? "text-emerald-300" : "text-rose-300"}`}>{r.won ? t.net_round_win : t.net_round_loss}</span>
                {!r.won && r.dmg > 0 && <span className="text-[10px] text-rose-300/80">−{r.dmg} PV</span>}
                <button onClick={() => { setRecapKey(null); setSpectate(null); }} className="text-slate-500 hover:text-slate-200 text-xs leading-none">✕</button>
              </div>
            );
          })()}
        </div>

        {/* Top HUD bar: stat chips, then the phase/timer segment + controls.
            (The stage badge lives next to the timeline above.) */}
        <div className="relative z-30 gilded flex items-center gap-2.5 px-3.5 py-2 rounded-xl">
          {(() => {
            // The HUD economy reflects whoever's board you're looking at: a scouted rival → their
            // now-public econ (lobby chose full transparency); else your own live numbers.
            const tgt = spectating ? spectateP : (isSpectator ? undefined : me);
            if (!tgt) {
              return (
                <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-400/40 text-[11px] font-bold text-amber-300">
                  <Eye size={13} /> {t.net_spectate_badge}
                </span>
              );
            }
            const g = spectating ? (spectateP?.gold ?? 0) : gold;
            const stk = spectating ? (spectateP?.streak ?? 0) : streak;
            return (
              <>
                {spectating && (
                  <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-400/40 text-[11px] font-bold text-amber-300">
                    <Eye size={13} /> {spectateP?.name ?? t.net_rival}
                  </span>
                )}
                {/* Economy cluster — one cohesive segmented gauge for the viewed player. */}
                <div className="flex items-stretch rounded-lg bg-black/30 border border-white/[0.07] overflow-hidden divide-x divide-white/[0.06] shrink-0">
                  <StatCell label={t.net_hp} accent="#ff6b6b" value={Math.max(0, tgt.hp ?? 0)} />
                  <StatCell label={t.net_gold} accent="#fbbf24" icon={<CoinIcon size={12} />} value={g} />
                  <StatCell label={t.net_interest} accent="#fcd34d" value={`+${interest(g)}`} />
                  <StatCell label={t.net_streak} accent={stk >= 0 ? "#34d399" : "#f87171"} value={`${stk >= 0 ? "W" : "L"}${Math.abs(stk)}`} sub={`+${streakGold(stk)}`}
                    title={t.net_streak_title} />
                  <StatCell label={t.net_alive(aliveCount).replace(/[0-9]+\s*/, "")} accent="#cbd5e1" value={aliveCount} />
                </div>
              </>
            );
          })()}
          {phase === "planning" && (() => {
            // Deterministic pairing → show who you're about to fight this round.
            const opp = room && myUid ? predictOpponent(room, myUid) : null;
            if (!opp) return null;
            return <StatChip label={t.net_next_opp} accent="#f0abfc"
              value={<span className="text-sm font-bold">{opp.pve ? t.net_wild : `vs ${opp.name}`}{opp.ghost ? t.net_ghost_suffix : ""}</span>}
              title={opp.ghost ? t.net_ghost_title : undefined} />;
          })()}

          {(() => {
            const gm = getMode(room.rules?.mode);
            if (gm.id === "standard") return null;
            const mono = gm.flags?.monoType ? pickMonoType(room.rules?.generations ?? [1], hashStr(room.code)) : null;
            return (
              <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-bold"
                style={{ borderColor: `${gm.color}55`, color: gm.color, background: `${gm.color}12` }}
                title={lang === "fr" ? gm.descFr : gm.desc}>
                {lang === "fr" ? gm.nameFr : gm.name}{mono ? ` · ${mono}` : ""}
              </span>
            );
          })()}

          {isNuzlocke(room.rules) && (
            <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-red-500/40 text-[11px] font-bold text-red-400 bg-red-500/10"
              title="Nuzlocke: units that die in combat are permanently lost">
              ☠ Permadeath
            </span>
          )}
          {doubleUp && partner && (
            <CoopPanel code={room.code} myUid={myUid} partner={{ uid: partner.uid, name: partner.name, hp: partner.hp, alive: partner.alive }} lang={lang} />
          )}
          <AugmentsBar augments={augments} lang={lang} />

          {/* Phase + timer — isolated so it ticks on its own without re-rendering
              the whole game tree every 250ms (the old global tick caused jank). */}
          <PhaseTimer phase={phase} phaseLabel={phaseLabel} deadline={meta.deadline} totalMs={phase === "combat" ? COMBAT_MS : phase === "carousel" ? CAROUSEL_MS : PLAN_MS} resolvingLabel={t.net_resolving} />

          {isHost && <span className="text-[9px] font-bold uppercase bg-amber-500 text-black rounded px-1 shrink-0">{t.net_host_badge}</span>}
          <div className="flex items-center gap-2 shrink-0">
            {/* Last-fight recap — reviewable while planning (your team + the enemy's). */}
            {phase === "planning" && !isSpectator && lastFight && (
              <button onClick={() => setShowRecap((s) => !s)} title={t.net_recap_title}
                className={`px-2.5 py-1.5 rounded-md border text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${showRecap ? "bg-amber-500/90 text-black border-amber-400" : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300"}`}>
                <BarChart3 size={13} /> {t.net_recap}
              </button>
            )}
            <OptionsMenu />
            <FullscreenButton />
            <button onClick={onLeaveClick} className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-rose-900/60 border border-slate-700 text-xs font-bold text-slate-300">{t.net_leave}</button>
          </div>
        </div>

        {/* Pinned 3-column layout: a fixed-width sidebar, a fixed-width FIELD
            column, and a fixed-width right rail. Because every track is a
            constant width, the battlefield sits in the exact same place in
            planning and combat — it never shifts when the phase flips. */}
        {/* Columns spread to the edges (TFT-style) so wide screens use the side
            space; the centre field column is fixed-width + centred, so it stays
            pinned across phases. */}
        <div className="grid items-stretch gap-4" style={{ gridTemplateColumns: "260px 64px 824px 340px", justifyContent: "space-between", height: CENTER_H }}>
          {/* Left sidebar: scoreboard + synergies, a full-height rail beside the board. */}
          <div className="flex flex-col gap-3 min-h-0">
          <div className="gilded w-full p-2 rounded-xl shrink-0">
            <h2 className="text-[10px] uppercase tracking-wider text-amber-200/55 px-1 mb-1.5">{t.net_trainers(aliveCount)}</h2>
            <div className="flex flex-col gap-1">
              {ladder.map((p, i) => {
                const dex = asBoard(p.board)[0] ? getDef(asBoard(p.board)[0].defId).dex[asBoard(p.board)[0].star - 1] : null;
                const isNm = p.botDifficulty === "nightmare";
                return (
                  <div
                    key={p.uid}
                    onClick={() => setSpectate(isSpectator ? p.uid : (p.uid === myUid ? null : (spectate === p.uid ? null : p.uid)))}
                    title={p.uid === myUid && !isSpectator ? t.net_your_board : t.net_view_board(p.name)}
                    className={`flex items-center gap-2 px-1.5 py-1 rounded-lg cursor-pointer hover:bg-slate-700/50 ${p.uid === myUid ? "bg-slate-700/70 ring-1 ring-sky-500/50" : ""} ${spectate === p.uid ? "ring-1 ring-amber-400/70 bg-amber-500/10" : ""} ${isNm && p.alive ? "ring-1 ring-rose-600/50 bg-rose-950/20" : ""} ${!p.alive ? "opacity-40" : ""}`}
                  >
                    <span className="w-4 text-[10px] text-slate-500 font-bold text-center">{p.place ?? i + 1}</span>
                    <span className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 overflow-hidden ${isNm ? "bg-rose-950/60 border border-rose-600/70 shadow-[0_0_10px_-2px_rgba(225,29,72,0.8)]" : "bg-black/40 border border-slate-700"}`}>
                      {isNm ? <span className="text-[13px] leading-none">💀</span> : p.photoURL ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.photoURL} alt="" width={24} height={24} style={{ imageRendering: "pixelated" }} />
                      ) : dex ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={spriteUrl(dex)} alt="" width={22} height={22} style={{ imageRendering: "pixelated" }} />
                      ) : <span className="text-[9px] text-slate-600">{p.name.slice(0, 1).toUpperCase()}</span>}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className={`block text-[11px] font-semibold truncate ${isNm ? "text-rose-300" : p.uid === myUid ? "text-amber-300" : "text-slate-200"}`}>
                          {p.name}{!p.connected && t.net_offline}
                        </span>
                        {/* Scouting: rivals' levels are public (TFT-style). */}
                        <span className="shrink-0 text-[8px] font-bold px-1 rounded bg-slate-700/80 text-slate-300 leading-tight tabular-nums">{t.net_lv}{p.level ?? 1}</span>
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
            <div className="flex-1 min-h-0 flex flex-col">
              <TraitPanel units={spectateUnits ?? undefined} />
            </div>
          </div>

          {/* Interest "piggy bank" — its own narrow track between the left rail and the
              field, so it sits right against the board (TFT-style). A vertical coin
              column (one slot per 10 gold) that fills bottom-up toward the +5 cap.
              Always reflects YOUR own gold. */}
          <div className="flex flex-col items-center justify-center gap-2 min-h-0">
            {!isSpectator && <>
            <span className="text-base font-extrabold text-amber-300 tabular-nums drop-shadow">+{interest(gold)}</span>
            <div className="flex flex-col-reverse gap-2">
              {Array.from({ length: ECONOMY.interestCap }).map((_, i) => {
                const threshold = (i + 1) * ECONOMY.interestPer;
                const filled = gold >= threshold;
                return (
                  <span
                    key={i}
                    title={`${threshold} ${t.net_gold_label}`}
                    className={`w-11 h-11 rounded-xl border-2 flex items-center justify-center transition-all ${filled ? "bg-amber-400/25 border-amber-400/80 text-amber-300 shadow-[0_0_12px_-2px_rgba(251,191,36,0.75)]" : "bg-slate-800/40 border-slate-700/50 text-slate-700"}`}
                  >
                    <CoinIcon size={24} />
                  </span>
                );
              })}
            </div>
            <span className="text-[8px] font-bold uppercase tracking-wide text-amber-200/45 mt-0.5 text-center leading-tight">{t.net_interest_label}</span>
            </>}
          </div>

          {/* Center: the shared field. Locked to CENTER_H in EVERY phase so the
              battlefield stays in the exact same spot and the bench/shop below it
              never move — only the units on the field and what's interactive
              change. A `board-swap` fade plays when the view changes (phase flip
              or landing on a rival's / your own board). */}
          <div className={`relative min-w-0 rounded-xl${boardFlash ? " screen-flash" : ""}`} style={{ height: CENTER_H }}>
            {/* Float-up text for HP damage or gold gain feedback. */}
            {floatText && (
              <div key={floatKey.current} className={`float-up absolute top-4 left-1/2 -translate-x-1/2 z-30 text-sm font-extrabold drop-shadow pointer-events-none select-none ${floatText.startsWith("−") ? "text-rose-300" : "text-amber-300"}`}>
                {floatText}
              </div>
            )}
            {spectating ? (
              <div key={`spec-${spectate}`} className="board-swap absolute inset-0 flex flex-col gap-2">
                <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 shrink-0">
                  <span className="text-xs font-bold text-amber-300">{t.net_viewing(spectateP?.name ?? "rival")}</span>
                  {isSpectator
                    ? <span className="text-[10px] text-amber-200/60">{t.net_spectate_switch}</span>
                    : <button onClick={() => setSpectate(null)} className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[11px] font-bold text-slate-300">{t.net_back_to_mine}</button>}
                </div>
                <div className="relative flex-1 min-h-0 flex items-center justify-center">
                  {phase === "combat" && spectateCombatResult ? (
                    <CombatStage result={spectateCombatResult} flip={!!spectateCombat?.flip} authWon={spectateCombat?.won} opponentName={spectateCombat?.oppName ?? t.net_rival} autoResolve inline syncStart={meta.deadline - COMBAT_MS} syncWindowMs={COMBAT_MS} onResolve={() => {}} />
                  ) : (
                    <Board units={spectateUnits ?? []} interactive={false} />
                  )}
                </div>
                {/* Rival's bench */}
                <div className="flex gap-1.5 p-2 rounded-xl border border-slate-700/60 bg-slate-900/50 min-h-[64px] flex-wrap justify-center shrink-0">
                  {spectateBench.length === 0
                    ? <span className="text-[11px] text-slate-600 self-center">{t.net_bench_empty}</span>
                    : spectateBench.map((u) => <UnitChip key={u.iid} unit={u} size={52} interactive={false} />)}
                </div>
              </div>
            ) : (
              <div key={`mine-${phase === "combat" ? "fight" : "plan"}`} className="board-swap absolute inset-0 flex items-center justify-center">
                {isSpectator ? (
                  // Spectator with no follow target yet (about to be picked) — never
                  // show our own stale local board; just a brief loading state.
                  <div className="flex items-center gap-3 text-slate-500">
                    <div className="w-5 h-5 rounded-full border-2 border-amber-400/40 border-t-amber-400 animate-spin" />
                    <span className="text-xs">{t.net_spectate_switch}</span>
                  </div>
                ) : phase === "combat" && combatResult && me?.alive ? (
                  <CombatStage
                    result={combatResult}
                    flip={!!myCombat?.flip}
                    authWon={myCombat?.won}
                    hpLost={myCombat?.dmg}
                    suppressRecap={!!(inspect || inspectedItem)}
                    opponentName={myCombat?.oppName ?? t.net_rival}
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
            )}
          </div>

          {/* Right rail: items inventory + details (planning). During combat the
              recap (with tabs) lives inside CombatStage; the 300px track stays
              reserved so the field column doesn't move. */}
          <div className="w-[340px] min-h-0">
            {phase !== "combat" && !spectating && (
              <div className="flex flex-col gap-3 h-full">
                <ItemsPanel />
                <div className="flex-1 min-h-0 flex flex-col">
                  <UnitDetail />
                </div>
              </div>
            )}
            {/* During combat the rail is otherwise free — show the inspected mon's
                stats when one is clicked (e.g. a bench unit), so you can still
                consult details mid-fight. */}
            {phase === "combat" && !spectating && (inspect || inspectedItem) && (
              <div className="flex flex-col h-full min-h-0">
                <UnitDetail />
              </div>
            )}
          </div>
        </div>

        {/* Bottom bar: board controls + bench (centred), then the shop. Hidden for dedicated
            spectators (no econ) AND while scouting a rival (it's all YOUR controls — the centre
            shows the rival's board + bench instead, so your shop/bench would just be noise). */}
        {!isSpectator && !spectating && <div className="flex flex-col items-center gap-2">
          <div className="flex items-stretch gap-2">
            {/* Board capacity (placed / cap) + one-click auto-fill from the bench. */}
            {(() => {
              const boardCount = units.filter((u) => u.pos !== null).length;
              const benchCount = units.length - boardCount;
              const cap = boardSizeForLevel(level);
              const full = boardCount >= cap;
              return (
                <div className="gilded flex flex-col justify-center gap-1 px-2.5 py-1.5 rounded-xl shrink-0">
                  <div className="text-[9px] uppercase tracking-wider text-amber-200/55 text-center leading-none">{t.net_board_label}</div>
                  <div className="text-center text-base font-extrabold tabular-nums leading-none">
                    <span className={full ? "text-emerald-300" : "text-amber-300"}>{boardCount}</span>
                    <span className="text-slate-600">/{cap}</span>
                  </div>
                  <button
                    onClick={fillBoard}
                    disabled={phase !== "planning" || benchCount === 0 || full}
                    title={t.net_board_fill_title}
                    className="px-2 py-1 rounded-md bg-emerald-700/80 hover:bg-emerald-600 disabled:opacity-30 text-[10px] font-bold text-white leading-none"
                  >
                    {t.net_board_fill}
                  </button>
                </div>
              );
            })()}
            <Bench
              interactive={(phase === "planning" || phase === "combat") && (!spectate || spectate === myUid)}
              canDeploy={phase === "planning" && (!spectate || spectate === myUid)}
            />
          </div>
          <div className="flex gap-3 w-full max-w-[1480px]">
            {/* Pension on the far LEFT and Sell on the far RIGHT — separated by the
                whole shop so a drag-to-sell can't accidentally land in the Day Care. */}
            <PensionZone />
            <ShopSellDrop><ShopBar /></ShopSellDrop>
            <SellZone />
          </div>
          {/* Shortcut hints live in-flow (scaled with the canvas) so they never
              float over the shop. */}
          {phase === "planning" && me?.alive && (
            <div className="flex items-center gap-2 opacity-80">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{t.net_keys_label}</span>
              <Kbd k="R" label={t.sh_reroll} />
              <Kbd k="L" label="XP" />
              <Kbd k="S" label={t.net_key_sell} />
            </div>
          )}
        </div>}
      </div>
      </div>

      {phase === "carousel" && me?.alive && (
        <CarouselOverlay
          room={room} me={me} myUid={myUid} meta={meta}
          pickedKey={pickedKey} setPickedKey={setPickedKey}
          revealBoard={revealBoard} setRevealBoard={setRevealBoard}
          units={units} pickLatch={pickLatch}
          netCarouselPick={netCarouselPick} flushSync={flushSync}
        />
      )}

      {/* Augment pick — 3 TFT-style boosts at the start of stages 2/3/4. */}
      {showAugment && (
        <AugmentOverlay
          augSlotNow={augSlotNow!} augOptions={augOptions}
          revealBoard={revealBoard} setRevealBoard={setRevealBoard}
          pickLatch={pickLatch} pickAugment={pickAugment} setPickedSlot={setPickedSlot}
          flushSync={flushSync} augRerollCost={augRerollCost} gold={gold} rerollAugments={rerollAugments}
        />
      )}

      {/* Eliminated but the game isn't over — keep watching. Non-blocking banner;
          the scoreboard stays clickable so you can spectate any survivor. */}
      {!gameOver && me && !me.alive && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2 rounded-full bg-rose-950/80 border border-rose-700/60 backdrop-blur-sm">
          <span className="text-sm font-extrabold text-rose-300">{t.net_eliminated}</span>
          <span className="text-xs text-slate-300">{t.net_placed(me.place ?? aliveCount + 1)} · {t.net_spectating}</span>
        </div>
      )}

      {gameOver && (
        <GameOverScreen
          players={players} myUid={myUid} me={me} meta={meta} iWon={iWon}
          rankResult={rankResult} lastFightRef={lastFightRef} isHost={isHost}
          room={room} leave={leave} doubleUp={doubleUp} gameTotals={gameTotals}
        />
      )}

      {showRecap && phase === "planning" && lastFight && (
        <FightRecap data={lastFight} onClose={() => setShowRecap(false)} />
      )}
      {booting && <BootVeil
        label={t.net_boot_connecting}
        sub={t.net_boot_trainers(connectedHumans, humanPlayers.length)}
        progress={humanPlayers.length ? connectedHumans / humanPlayers.length : 1}
      />}
      {inMatch && !isSpectator && me?.alive && (
        <QuickChat code={room.code} myUid={myUid} myName={me.name} />
      )}
    </DndContext>
  );
}

/** Pokéball boot veil shown briefly at match start while sprites load + the room
 *  syncs, so the first frame everyone sees is fully loaded and in lockstep. */
/** Last-fight damage recap, reviewable during planning. Toggle between YOUR team and the enemy
 *  team, and between damage dealt / tanked / healed — a floating panel over the board. */
const RECAP_METRICS = [
  { key: "dmgDealt", label: "DMG", color: "#fb7185" },
  { key: "dmgTaken", label: "TANK", color: "#38bdf8" },
  { key: "healed", label: "HEAL", color: "#34d399" },
] as const;
function FightRecap({ data, onClose }: { data: { mine: FrameUnit[]; theirs: FrameUnit[]; oppName: string }; onClose: () => void }) {
  const t = useT();
  const [side, setSide] = useState<"mine" | "theirs">("mine");
  const [metric, setMetric] = useState<(typeof RECAP_METRICS)[number]["key"]>("dmgDealt");
  const active = RECAP_METRICS.find((m) => m.key === metric)!;
  const val = (u: FrameUnit) => u[metric] as number;
  const units = (side === "mine" ? data.mine : data.theirs).filter((u) => (u.dmgDealt + u.dmgTaken + u.healed) > 0);
  const max = Math.max(1, ...units.map(val));
  const sorted = [...units].sort((a, b) => val(b) - val(a)).slice(0, 8);
  return (
    <div className="fixed z-40 bottom-24 right-4 w-[260px] gilded rounded-xl p-3 shadow-2xl shadow-black/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wide text-amber-200/60 font-bold">{t.net_fight_last}</span>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-xs leading-none">✕</button>
      </div>
      {/* Team toggle: yours vs the rival you fought. */}
      <div className="flex gap-1 mb-1.5">
        {([["mine", t.net_fight_you], ["theirs", data.oppName]] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setSide(k)}
            className={`flex-1 text-[10px] font-bold py-1 rounded-md border truncate transition-colors ${side === k ? "bg-slate-200 text-slate-900 border-transparent" : "bg-black/30 border-white/[0.06] text-slate-400 hover:text-slate-200"}`}>
            {lbl}
          </button>
        ))}
      </div>
      {/* Metric tabs. */}
      <div className="flex gap-1 mb-2">
        {RECAP_METRICS.map((m) => (
          <button key={m.key} onClick={() => setMetric(m.key)}
            style={metric === m.key ? { background: m.color, color: "#0b1020" } : undefined}
            className={`flex-1 text-[10px] font-extrabold py-1 rounded-md border transition-colors ${metric === m.key ? "border-transparent" : "bg-black/30 border-white/[0.06] text-slate-400 hover:text-slate-200"}`}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {sorted.length === 0 && <div className="text-[10px] text-slate-600 text-center py-2">—</div>}
        {sorted.map((u) => (
          <div key={u.id} className={`flex items-center gap-1.5 ${u.alive ? "" : "opacity-50"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={spriteUrl(u.dex)} alt="" width={20} height={20} style={{ imageRendering: "pixelated" }} />
            <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden min-w-0">
              <div className="h-full rounded-full" style={{ width: `${(val(u) / max) * 100}%`, background: active.color }} />
            </div>
            <span className="w-10 text-right text-[10px] tabular-nums font-semibold text-slate-300">{Math.round(val(u))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BootVeil({ label, sub, progress }: { label: string; sub?: string; progress: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-[#070b16]" style={{ animation: "bootfade 0.4s ease-out 1.5s forwards" }}>
      <div className="relative w-16 h-16 animate-spin" style={{ animationDuration: "1s" }}>
        <div className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(#ef4444 0 calc(50% - 3px), #0f172a calc(50% - 3px) calc(50% + 3px), #f1f5f9 calc(50% + 3px) 100%)", boxShadow: "0 0 0 3px #0f172a, 0 0 22px 3px #ef444455" }} />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 border-[4px] border-slate-900" />
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <div className="text-lg font-extrabold tracking-wide text-slate-100">Poké<span className="text-amber-400">TFT</span></div>
        <div className="text-xs text-slate-400">{label}</div>
        {sub && <div className="text-[11px] font-semibold text-amber-300/80 tabular-nums">{sub}</div>}
        {/* Progress bar — fills as trainers connect, then a sweep while the board syncs. */}
        <div className="mt-1 w-52 h-1.5 rounded-full bg-slate-800/80 overflow-hidden">
          {pct >= 100
            ? <div className="h-full w-1/3 rounded-full bg-amber-400 loading-sweep" />
            : <div className="h-full rounded-full bg-amber-400 transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />}
        </div>
      </div>
      <style>{`@keyframes bootfade { to { opacity: 0; visibility: hidden; } }`}</style>
    </div>
  );
}

/** Top-bar fullscreen toggle. Tracks the current fullscreen state so the icon
 *  reflects whether you're in or out. */
function FullscreenButton() {
  const t = useT();
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
      title={fs ? t.net_exit_fullscreen : t.net_fullscreen}
      aria-label={fs ? t.net_exit_fullscreen : t.net_fullscreen}
      className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-300 leading-none"
    >
      {fs ? <Minimize size={14} /> : <Maximize size={14} />}
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

/** Transient feedback toast for rejected actions — fixed at the bottom-centre,
 *  auto-dismisses, re-triggers on a new `seq` (so repeated messages re-animate). */
function Toasts() {
  const toast = useUi((s) => s.toast);
  const clear = useUi((s) => s.clearToast);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(clear, 2200);
    return () => clearTimeout(id);
  }, [toast, clear]);
  if (!toast) return null;
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-8 z-[140] pointer-events-none">
      <div
        key={toast.seq}
        className="toast-pop px-4 py-2.5 rounded-xl border text-sm font-bold shadow-2xl flex items-center gap-2"
        style={{
          background: "linear-gradient(180deg, rgba(40,13,13,0.96), rgba(20,6,6,0.96))",
          borderColor: "rgba(244,63,94,0.5)",
          color: "#fecdd3",
          boxShadow: "0 18px 50px -20px rgba(0,0,0,0.9), 0 0 24px -10px rgba(244,63,94,0.6)",
        }}
      >
        <span className="text-rose-300 inline-flex items-center"><AlertTriangle size={13} /></span>{toast.text}
      </div>
    </div>
  );
}

/** Self-ticking countdown (seconds remaining to a server-time deadline). Lives in
 *  its own component so updating it doesn't re-render the whole game. */
function useClockTick(active: boolean, ms = 250) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}

function Countdown({ deadline }: { deadline: number }) {
  useClockTick(true);
  return <>{Math.max(0, Math.ceil((deadline - serverNow()) / 1000))}</>;
}

/** A progress bar that DRAINS smoothly via a single CSS transition over the
 *  remaining time, instead of stepping every tick — so it never jumps. Re-renders
 *  only when the deadline changes (new round), the animation is pure CSS. */
function SmoothBar({ deadline, totalMs, combat }: { deadline: number; totalMs: number; combat: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const remaining = Math.max(0, deadline - serverNow());
    const startPct = Math.max(0, Math.min(100, (remaining / totalMs) * 100));
    el.style.transition = "none";
    el.style.width = `${startPct}%`;
    void el.offsetWidth; // force reflow so the next change animates
    el.style.transition = `width ${remaining}ms linear`;
    el.style.width = "0%";
  }, [deadline, totalMs]);
  return (
    <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
      <div ref={ref} className={`h-full ${combat ? "bg-rose-400" : "bg-sky-400"}`} />
    </div>
  );
}

/** Phase label + countdown + smooth progress bar; ticks the seconds text
 *  internally (the bar is CSS-driven) so the heavy game tree isn't re-rendered. */
function PhaseTimer({ phase, phaseLabel, deadline, totalMs, resolvingLabel }: { phase?: string; phaseLabel: string; deadline: number; totalMs: number; resolvingLabel: string }) {
  useClockTick(true); // tick so we notice the deadline passing
  const active = phase === "planning" || phase === "combat" || phase === "carousel";
  // "Resolving" = the timer hit 0 (waiting on host/server), OR the transition lock has
  // parked the deadline far in the future (>40s, since real phases are ≤30s).
  const left = deadline - serverNow();
  const resolving = active && (left <= 0 || left > 40_000);
  return (
    <div className="flex-1 min-w-[220px] flex flex-col gap-1 px-2">
      <div className="flex justify-between items-baseline">
        <span className={`text-xs font-bold uppercase tracking-wide ${resolving ? "text-amber-300 animate-pulse" : phase === "combat" ? "text-rose-300" : "text-sky-300"}`}>{resolving ? resolvingLabel : phaseLabel}</span>
        <span className="text-sm font-bold tabular-nums text-slate-200">
          {resolving
            ? <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-amber-400/25 border-t-amber-400 animate-spin align-middle" />
            : <><Countdown deadline={deadline} />s</>}
        </span>
      </div>
      {resolving
        ? <div className="h-1.5 w-full rounded-full bg-slate-800/80 overflow-hidden"><div className="h-full w-1/3 rounded-full bg-amber-400 loading-sweep" /></div>
        : <SmoothBar deadline={deadline} totalMs={totalMs} combat={phase === "combat"} />}
    </div>
  );
}

/** A cell in the grouped economy strip — label over value, sharing the strip's hairline frame
 *  + dividers so the whole cluster reads as one designed gauge. */
function StatCell({ label, value, accent, sub, icon, title }: { label: string; value: ReactNode; accent?: string; sub?: string; icon?: ReactNode; title?: string }) {
  return (
    <div title={title} className="flex flex-col justify-center px-3 py-1 hover:bg-white/[0.03] transition-colors">
      <span className="text-[8px] uppercase tracking-wide text-slate-500 leading-none">{label}</span>
      <span className="mt-1 text-[15px] font-bold leading-none inline-flex items-center gap-1 tabular-nums" style={{ color: accent }}>
        {icon}{value}{sub && <span className="text-[9px] font-semibold text-slate-400">{sub}</span>}
      </span>
    </div>
  );
}

function StatChip({ label, value, accent, sub, title }: { label: string; value: ReactNode; accent?: string; sub?: string; title?: string }) {
  return (
    <div title={title} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] shrink-0">
      <span className="text-[9px] uppercase tracking-wide text-slate-400/70 leading-none">{label}</span>
      <span className="text-[15px] font-bold leading-none inline-flex items-baseline gap-1" style={{ color: accent }}>
        {value}{sub && <span className="text-[10px] font-semibold text-slate-400">{sub}</span>}
      </span>
    </div>
  );
}
