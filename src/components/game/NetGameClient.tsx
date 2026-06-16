"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DndContext, DragEndEvent, PointerSensor, TouchSensor, useSensor, useSensors, useDroppable } from "@dnd-kit/core";
import { useGame, BENCH_SIZE, PENSION_COST, PENSION_ROUNDS, resolveBenchSlots } from "@/game/store/gameStore";
import { useRoom } from "@/game/net/roomStore";
import { startServerTime, serverNow } from "@/game/net/serverTime";
import { resolveRoundStart, endCombat, endCarousel, heartbeat, maybeClaimHost, syncBoard, returnToLobby, markCarouselPicked, finishCarouselEarlyIfReady, predictOpponent, PLAN_MS, COMBAT_MS } from "@/game/net/match";
import { simulate } from "@/game/engine/combat";
import { getDef, spriteUrl, rosterForGenerations, hasDef } from "@/game/data/mons";
import { streakGold, roundKind, advanceRound, boardSizeForLevel, ECONOMY } from "@/game/config";
import { interest } from "@/game/engine/economy";
import { MEGA_STONE, canMega } from "@/game/data/mega";
import { ITEM_POOL, RARITY_COLOR, COMPONENT_IDS } from "@/game/data/itemPool";
import { enemyToField } from "@/game/engine/hex";
import { ItemGlyph, AugmentGlyph } from "./ItemGlyph";
import { finishCarouselEarly } from "@/game/net/serverGame";
import { recordGameResult, applyRankedResult } from "@/game/net/users";
import { computeTraits } from "@/game/engine/synergies";
import { Trash2, Eye, Sparkles, Maximize, Minimize, AlertTriangle } from "lucide-react";
import { AUGMENTS, augmentSlot, AUGMENT_TIER_COLOR } from "@/game/data/augments";
import { useAppStore } from "@/game/store/appStore";
import { useUi } from "@/game/store/uiStore";
import { makeRng } from "@/game/engine/rng";
import { COST_COLOR, TYPE_COLOR } from "@/game/ui";
import { MegaIcon } from "./icons";
import type { UnitInstance, PokeType } from "@/game/types";

// RTDB drops null values + empty arrays, so a synced unit can come back missing
// `pos` (bench units) or `items`. Restore both invariants at the boundary.
/** RTDB strips empty arrays and turns sparse ones into index-keyed objects, so a
 *  unit's `items` can come back as undefined or {0:"x"}. Coerce to a dense array
 *  (and default pos) — otherwise `for (const id of items)` in the sim throws. */
function itemsArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (v && typeof v === "object") return Object.values(v as Record<string, string>).filter(Boolean);
  return [];
}
function normUnit(u: UnitInstance): UnitInstance {
  return { ...u, pos: u.pos ?? null, items: itemsArray(u.items) };
}

const ITEM_DEF_BY_ID = Object.fromEntries(ITEM_POOL.map((i) => [i.id, i]));

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
import { CoinIcon, TrophyIcon, PawIcon, SwordIcon, GiftIcon } from "./icons";
import { useT } from "@/lib/i18n";
import { sfx } from "@/lib/audio";
import { toggleFullscreen, isFullscreen } from "@/lib/fullscreen";

function asBoard(b: unknown): UnitInstance[] {
  if (!b) return [];
  const arr = Array.isArray(b) ? b : Object.values(b as Record<string, UnitInstance>);
  // Mirror match.ts board(): drop unknown-def units so the client sim matches the host.
  return (arr as UnitInstance[]).filter((u) => u && u.pos && hasDef(u.defId)).map(normUnit);
}

/** FNV-1a hash of the room code → a numeric seed for the per-game roster draw,
 *  matching match.ts's hashStr so the local pool equals the host's. */
function codeSeed(code: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < code.length; i++) { h ^= code.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
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
  const lang = useAppStore((s) => s.settings.language);
  const pension = useGame((s) => s.pension);
  const collect = useGame((s) => s.collectPension);
  const { setNodeRef, isOver } = useDroppable({ id: "pension" });
  const ready = !!pension && pension.roundsLeft <= 0;
  const title = lang === "fr" ? "Pension" : "Day Care";
  if (!pension) {
    return (
      <div
        ref={setNodeRef}
        title={lang === "fr" ? `Glissez un ★ pour élever une copie (${PENSION_COST} or, ${PENSION_ROUNDS} tours)` : `Drag a ★ mon to breed a copy of it (${PENSION_COST} gold, ${PENSION_ROUNDS} rounds)`}
        className={`w-[120px] shrink-0 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed transition-all
          ${isOver ? "border-emerald-400 bg-emerald-500/25 text-emerald-100 scale-[1.03]" : "border-[var(--panel-edge)] bg-black/25 text-amber-200/55 hover:border-emerald-700/60 hover:text-emerald-300/80"}`}
      >
        <span className={`leading-none ${isOver ? "scale-125" : ""}`}><PawIcon size={22} /></span>
        <span className="text-[9px] font-extrabold uppercase tracking-wider text-center leading-tight px-1">{title}</span>
      </div>
    );
  }
  const def = getDef(pension.defId);
  return (
    <div className="gilded w-[120px] shrink-0 flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5">
      <span className="text-[8px] uppercase tracking-wider text-amber-200/55 leading-none">{title}</span>
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={spriteUrl(def.dex[0])} alt={def.name} width={44} height={44} style={{ imageRendering: "pixelated" }} className={ready ? "" : "opacity-80"} draggable={false} />
        {!ready && <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-amber-200 drop-shadow">{pension.roundsLeft}</span>}
      </div>
      {ready ? (
        <button onClick={collect} className="px-2 py-0.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-extrabold leading-none">
          {lang === "fr" ? "Récupérer +1" : "Collect +1"}
        </button>
      ) : (
        <span className="text-[9px] font-bold text-amber-200/70 leading-none">{lang === "fr" ? `${pension.roundsLeft} tour${pension.roundsLeft > 1 ? "s" : ""}` : `${pension.roundsLeft} round${pension.roundsLeft > 1 ? "s" : ""}`}</span>
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

export function NetGameClient() {
  const room = useRoom((s) => s.room);
  const myUid = useRoom((s) => s.myUid);
  const mySave = useRoom((s) => s.mySave);
  const leave = useRoom((s) => s.leave);
  const inspect = useUi((s) => s.inspect);
  const inspectedItem = useUi((s) => s.inspectedItem);

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
  const reorderBench = useGame((s) => s.reorderBench);
  const sell = useGame((s) => s.sell);
  const depositToPension = useGame((s) => s.depositToPension);
  const equipItem = useGame((s) => s.equipItem);
  const units = useGame((s) => s.units);
  const gold = useGame((s) => s.gold);
  const level = useGame((s) => s.level);
  const fillBoard = useGame((s) => s.fillBoard);
  const spawnDrops = useGame((s) => s.spawnDrops);

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
  const actedDeadline = useRef(-1);
  const [roundLog, setRoundLog] = useState<{ stage: number; round: number; won: boolean; pve: boolean; oppUid: string; oppName: string; dmg: number; survivors: number }[]>([]);
  // Past timeline chip the player tapped to see a fight recap (null = closed).
  const [recapKey, setRecapKey] = useState<string | null>(null);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  // The augment slot index we just picked — hides the augment panel immediately on
  // pick (the `<=` count gate alone can leave it open when you're behind a slot).
  const [pickedSlot, setPickedSlot] = useState<number | null>(null);
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
      const s = Math.min(MAX_SCALE, (window.innerWidth - 8) / DESIGN_W, (window.innerHeight - 8) / DESIGN_H);
      setScale(s > 0 ? s : 1);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
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
    if (!myUid) return;
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
          await maybeClaimHost(r.code, r, myUid);
          if (r.meta?.hostUid !== myUid) return;
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
  }, [myUid]);

  const meta = room?.meta;
  const players = room?.players ?? {};
  const me = myUid ? players[myUid] : undefined;
  // Keep the boot-veil readiness flag in a ref (read by the veil interval above).
  useEffect(() => { bootReadyRef.current = !!room && !!me; }, [room, me]);
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
    if (!room || !meta) return;
    // Same roster the host uses (selected gens, drawn to the draft size, seeded by
    // the room code) — so the shop pool always respects the lobby's region/draft
    // rules, on a fresh start AND on a reconnect/restore.
    const roster = () => rosterForGenerations(room.rules?.generations ?? [1], room.rules?.draftPoolSize, codeSeed(room.code));
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
      else { newGame(roster(), enabledItems); hydrated.current = "fresh"; }
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
    netRound(meta.stage, meta.round, me?.streak ?? 0);
  }, [phase, meta?.stage, meta?.round, mySave]); // eslint-disable-line react-hooks/exhaustive-deps

  // Push my board + economy snapshot to the room (debounced) — board for combat,
  // save for reconnect.
  useEffect(() => {
    if (!room || !myUid || phase !== "planning") return;
    if (hydrated.current === "none") return; // never push defaults over the real priv save
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
      const r = useRoom.getState().liveRoom;
      if (!r?.meta || r.meta.phase !== "planning") return;
      if (hydrated.current === "none") return; // not hydrated yet — don't sync defaults
      if (r.meta.deadline - serverNow() <= 2500) {
        // Last-second safety net: if the player left bench units while the board
        // has room, auto-deploy them just before the fight (NOT on every level-up).
        useGame.getState().fillBoard();
        const g = useGame.getState();
        syncBoard(r.code, myUid, g.units, g.exportSave());
      }
    }, 200);
    return () => clearInterval(id);
  }, [phase, myUid]);

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
    return simulate(asBoard(p1), asBoard(p2));
    // Re-run when the frozen boards themselves change (host failover re-freeze or a
    // late buzzer-beater sync for the same stage/round/opp) — not just on round id,
    // else the replay frames can drift from the authoritative win flag.
  }, [phase, meta?.stage, meta?.round, myCombat?.oppUid, myCombat?.flip, mySelfSig, myOppSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live replay of the rival I'm spectating (from the host's frozen boards).
  const spectateCombat = spectate && spectate !== myUid ? room?.combat?.[spectate] : undefined;
  const specSelfSig = useMemo(() => boardSig(spectateCombat?.selfBoard), [spectateCombat?.selfBoard]);
  const specOppSig = useMemo(() => boardSig(spectateCombat?.oppBoard), [spectateCombat?.oppBoard]);
  const spectateCombatResult = useMemo(() => {
    if (phase !== "combat" || !spectateCombat) return null;
    const [p1, p2] = spectateCombat.flip ? [spectateCombat.oppBoard, spectateCombat.selfBoard] : [spectateCombat.selfBoard, spectateCombat.oppBoard];
    return simulate(asBoard(p1), asBoard(p2));
  }, [phase, meta?.stage, meta?.round, spectate, spectateCombat?.oppUid, spectateCombat?.flip, specSelfSig, specOppSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Augment round? (stage 2/3/4 round 1). Show the pick until this slot is taken.
  const augSlotNow = meta && phase === "planning" && me?.alive && room?.rules?.augmentsEnabled !== false ? augmentSlot(meta.stage, meta.round) : null;
  const augOptions = useMemo(() => {
    if (augSlotNow == null) return [];
    const owned = new Set(useGame.getState().augments);
    // Tier escalates with the slot (TFT-style): silver at 2-2, gold at 3-2,
    // prismatic at 4-2. Fall back to the full pool if a tier runs dry.
    const tier = (["silver", "gold", "prismatic"] as const)[augSlotNow] ?? "gold";
    let pool = AUGMENTS.filter((a) => !owned.has(a.id) && a.tier === tier);
    if (pool.length < 3) pool = AUGMENTS.filter((a) => !owned.has(a.id));
    let seed = augSlotNow * 9973 + 7;
    for (let i = 0; i < (myUid?.length ?? 0); i++) seed = (seed * 31 + myUid!.charCodeAt(i)) >>> 0;
    const r = makeRng(seed >>> 0);
    const a = [...pool];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, 3);
  }, [augSlotNow, myUid]);

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

  // PvE loot: when a wild fight resolves, drop an item component AT a slain creep's
  // position (the enemy half) so loot lands where the mob fell, not bunched together.
  // Deterministic per round (so a reconnect re-spawns the identical drop, deduped).
  useEffect(() => {
    if (phase !== "combat" || !myCombat?.pve || !meta) return;
    const key = `${meta.stage}-${meta.round}`;
    if (droppedFor.current === key) return;
    droppedFor.current = key;
    const h = (meta.stage * 131 + meta.round * 17) >>> 0;
    // Opening (stage-1) creeps always drop; later wild rounds ~45%.
    if (meta.stage !== 1 && h % 100 >= 45) return;
    const creeps = asBoard(myCombat.oppBoard).filter((u) => u.pos);
    if (!creeps.length) return;
    const creep = creeps[(h >> 3) % creeps.length];
    const fieldCell = enemyToField(creep.pos![0], creep.pos![1]);
    const itemId = COMPONENT_IDS[h % COMPONENT_IDS.length];
    spawnDrops([{ id: `drop-${key}`, itemId, cell: [fieldCell.c, fieldCell.r] }]);
  }, [phase, meta?.stage, meta?.round, myCombat?.pve, myOppSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Play victory/defeat sound when the game ends. Computed inline (the `iWon`
  // const is derived after the early-return guard, so it isn't in scope here).
  const prevPhase = useRef<string | null>(null);
  useEffect(() => {
    if (phase === "over" && prevPhase.current !== "over") {
      const ps = room?.players ?? {};
      const lastOneStanding = !!(myUid && ps[myUid]?.alive) && Object.values(ps).filter((p) => p.alive).length === 1;
      if (lastOneStanding) sfx.victory(); else sfx.defeat();
      // Record this finished game in the player's history (idempotent by room code).
      if (myUid && room?.code) {
        const meP = ps[myUid];
        const place = meP?.place ?? (lastOneStanding ? 1 : Object.values(ps).filter((p) => !p.isBot).length);
        const total = Object.values(ps).length;
        // Snapshot the final board + active traits for the history recap.
        const finalBoard = useGame.getState().units.filter((u) => u.pos !== null);
        const team = finalBoard.map((u) => ({ d: u.defId, s: u.star }));
        const traits = computeTraits(finalBoard).filter((tr) => tr.tier > 0).map((tr) => ({ k: tr.key, t: tr.tier }));
        recordGameResult(myUid, room.code, {
          place,
          players: total,
          regions: room.rules?.generations ?? [1],
          won: place === 1 || meta?.winnerUid === myUid,
          team,
          traits,
        }).catch(() => {});
        // Ranked: nudge the player's rating by placement + mirror to the leaderboard.
        applyRankedResult(myUid, place, total, meP?.name ?? "Player", meP?.photoURL).catch(() => {});
      }
    }
    prevPhase.current = phase ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

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

  if (!room || !meta || !myUid) return null;

  const isHost = meta.hostUid === myUid;
  const ladder = Object.values(players).sort((a, b) => Number(b.alive) - Number(a.alive) || b.hp - a.hp);
  const aliveCount = Object.values(players).filter((p) => p.alive).length;
  // Human trainers connected — drives the boot-veil progress while everyone joins.
  const humanPlayers = Object.values(players).filter((p) => !p.isBot);
  const connectedHumans = humanPlayers.filter((p) => p.connected).length;
  const gameOver = phase === "over";
  // Read the AUTHORITATIVE result (place 1 / meta.winnerUid) rather than deriving it
  // from our own alive view — so every client shows the identical ending.
  const iWon = gameOver && (me?.place === 1 || (!!meta?.winnerUid && meta.winnerUid === myUid));

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
        useUi.getState().pushToast(lang === "fr" ? "Ce Pokémon ne peut pas Méga-Évoluer" : "This Pokémon can't Mega Evolve");
      } else if (unit) {
        equipItem(unit.iid, itemId);
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
  // Carousel/augment picks must persist before the round can flip, or they're lost.
  function flushSync() {
    if (!room || !myUid) return;
    const g = useGame.getState();
    syncBoard(room.code, myUid, g.units, g.exportSave());
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
  // Only the on-board units are public — a rival's BENCH is hidden information
  // (it lives in their private econ snapshot now), so spectating never reveals it.
  const spectateBench: UnitInstance[] = [];

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
      {/* Stage-up announce overlay */}
      {stageBanner != null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none">
          <div className="stage-banner text-center">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.4em] text-amber-300/80 mb-1">{lang === "fr" ? "Manche" : "Stage"}</div>
            <div className="text-6xl font-black gild-text drop-shadow-[0_4px_30px_rgba(212,175,55,0.4)]">{stageBanner}</div>
            <div className="text-xs text-slate-400 mt-2 tracking-wide">
              {stageBanner <= 2 ? (lang === "fr" ? "Le début de partie" : "The early game")
                : stageBanner === 3 ? (lang === "fr" ? "Le milieu de partie commence" : "The midgame begins")
                : stageBanner === 4 ? (lang === "fr" ? "Pic de puissance" : "Powerspike")
                : (lang === "fr" ? "Fin de partie" : "Endgame")}
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
        <div className="gilded relative flex items-center gap-3 px-3 py-1.5 rounded-lg">
          {/* Current stage/round recap, pinned beside the round tracker. */}
          <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/30 border border-[var(--panel-edge)]">
            <span className="text-[8px] uppercase tracking-[0.15em] text-amber-300/70 leading-none">{t.net_stage}</span>
            <span className="text-base font-extrabold tabular-nums gild-text leading-none">{meta.stage}-{meta.round}</span>
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
                <span className={`text-[11px] font-extrabold ${r.won ? "text-emerald-300" : "text-rose-300"}`}>{r.won ? (lang === "fr" ? "Victoire" : "Win") : (lang === "fr" ? "Défaite" : "Loss")}</span>
                {!r.won && r.dmg > 0 && <span className="text-[10px] text-rose-300/80">−{r.dmg} PV</span>}
                <button onClick={() => { setRecapKey(null); setSpectate(null); }} className="text-slate-500 hover:text-slate-200 text-xs leading-none">✕</button>
              </div>
            );
          })()}
        </div>

        {/* Top HUD bar: stat chips, then the phase/timer segment + controls.
            (The stage badge lives next to the timeline above.) */}
        <div className="gilded flex items-center gap-2.5 flex-wrap px-3.5 py-2.5 rounded-xl">
          <StatChip label={t.net_hp} accent="#ff6b6b" value={Math.max(0, me?.hp ?? 0)} />
          <StatChip label={t.net_gold} accent="#fbbf24" value={<span className="inline-flex items-center gap-1"><CoinIcon size={13} />{gold}</span>} />
          <StatChip label={t.net_interest} accent="#fcd34d" value={`+${interest(gold)}`} />
          <StatChip label={t.net_streak} accent={streak >= 0 ? "#34d399" : "#f87171"} value={`${streak >= 0 ? "W" : "L"}${Math.abs(streak)}`} sub={`+${streakGold(streak)}`}
            title={lang === "fr"
              ? "Or de série (victoires OU défaites d'affilée) : 2–3 → +1, 4 → +2, 5+ → +3 or par tour."
              : "Streak gold (a run of wins OR losses): 2–3 → +1, 4 → +2, 5+ → +3 gold per round."} />
          <StatChip label={t.net_alive(aliveCount).replace(/[0-9]+\s*/, "")} accent="#cbd5e1" value={aliveCount} />
          {phase === "planning" && (() => {
            // Deterministic pairing → show who you're about to fight this round.
            const opp = room && myUid ? predictOpponent(room, myUid) : null;
            if (!opp) return null;
            return <StatChip label={lang === "fr" ? "Prochain" : "Next"} accent="#f0abfc"
              value={<span className="text-sm font-bold">{opp.pve ? (lang === "fr" ? "Sauvages" : "Wild") : `vs ${opp.name}`}{opp.ghost ? (lang === "fr" ? " (clone)" : " (copy)") : ""}</span>}
              title={opp.ghost ? (lang === "fr" ? "Combat fantôme (copie d'un adversaire)" : "Ghost fight (a copy of a rival)") : undefined} />;
          })()}

          {augments.length > 0 && (
            <div className="flex items-center gap-1 shrink-0" title="Augments">
              {augments.map((id, i) => {
                const a = AUGMENTS.find((x) => x.id === id);
                return <span key={i} className="w-7 h-7 rounded-md bg-violet-900/40 border border-violet-500/50 flex items-center justify-center text-violet-200" title={a ? (lang === "fr" ? `${a.nameFr} — ${a.descFr}` : `${a.name} — ${a.desc}`) : id}><AugmentGlyph id={id} size={15} /></span>;
              })}
            </div>
          )}

          {/* Phase + timer — isolated so it ticks on its own without re-rendering
              the whole game tree every 250ms (the old global tick caused jank). */}
          <PhaseTimer phase={phase} phaseLabel={phaseLabel} deadline={meta.deadline} totalMs={phase === "combat" ? COMBAT_MS : PLAN_MS} resolvingLabel={lang === "fr" ? "Résolution…" : "Resolving…"} />

          {isHost && <span className="text-[9px] font-bold uppercase bg-amber-500 text-black rounded px-1 shrink-0">{t.net_host_badge}</span>}
          <div className="flex items-center gap-2 shrink-0">
            <FullscreenButton />
            <button onClick={leave} className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-rose-900/60 border border-slate-700 text-xs font-bold text-slate-300">{t.net_leave}</button>
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
            <div className="flex-1 min-h-0 flex flex-col">
              <TraitPanel units={spectateUnits ?? undefined} />
            </div>
          </div>

          {/* Interest "piggy bank" — its own narrow track between the left rail and the
              field, so it sits right against the board (TFT-style). A vertical coin
              column (one slot per 10 gold) that fills bottom-up toward the +5 cap.
              Always reflects YOUR own gold. */}
          <div className="flex flex-col items-center justify-center gap-2 min-h-0">
            <span className="text-base font-extrabold text-amber-300 tabular-nums drop-shadow">+{interest(gold)}</span>
            <div className="flex flex-col-reverse gap-2">
              {Array.from({ length: ECONOMY.interestCap }).map((_, i) => {
                const threshold = (i + 1) * ECONOMY.interestPer;
                const filled = gold >= threshold;
                return (
                  <span
                    key={i}
                    title={`${threshold} ${lang === "fr" ? "or" : "gold"}`}
                    className={`w-11 h-11 rounded-xl border-2 flex items-center justify-center transition-all ${filled ? "bg-amber-400/25 border-amber-400/80 text-amber-300 shadow-[0_0_12px_-2px_rgba(251,191,36,0.75)]" : "bg-slate-800/40 border-slate-700/50 text-slate-700"}`}
                  >
                    <CoinIcon size={24} />
                  </span>
                );
              })}
            </div>
            <span className="text-[8px] font-bold uppercase tracking-wide text-amber-200/45 mt-0.5 text-center leading-tight">{lang === "fr" ? "Intérêt" : "Interest"}</span>
          </div>

          {/* Center: the shared field. Locked to CENTER_H in EVERY phase so the
              battlefield stays in the exact same spot and the bench/shop below it
              never move — only the units on the field and what's interactive
              change. A `board-swap` fade plays when the view changes (phase flip
              or landing on a rival's / your own board). */}
          <div className="relative min-w-0" style={{ height: CENTER_H }}>
            {spectating ? (
              <div key={`spec-${spectate}`} className="board-swap absolute inset-0 flex flex-col gap-2">
                <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 shrink-0">
                  <span className="text-xs font-bold text-amber-300">{t.net_viewing(spectateP?.name ?? "rival")}</span>
                  <button onClick={() => setSpectate(null)} className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[11px] font-bold text-slate-300">{t.net_back_to_mine}</button>
                </div>
                <div className="relative flex-1 min-h-0 flex items-center justify-center">
                  {phase === "combat" && spectateCombatResult ? (
                    <CombatStage result={spectateCombatResult} flip={!!spectateCombat?.flip} authWon={spectateCombat?.won} opponentName={spectateCombat?.oppName ?? "Rival"} autoResolve inline syncStart={meta.deadline - COMBAT_MS} syncWindowMs={COMBAT_MS} onResolve={() => {}} />
                  ) : (
                    <Board units={spectateUnits ?? []} interactive={false} />
                  )}
                </div>
                {/* Rival's bench */}
                <div className="flex gap-1.5 p-2 rounded-xl border border-slate-700/60 bg-slate-900/50 min-h-[64px] flex-wrap justify-center shrink-0">
                  {spectateBench.length === 0
                    ? <span className="text-[11px] text-slate-600 self-center">Empty bench</span>
                    : spectateBench.map((u) => <UnitChip key={u.iid} unit={u} size={52} interactive={false} />)}
                </div>
              </div>
            ) : (
              <div key={`mine-${phase === "combat" ? "fight" : "plan"}`} className="board-swap absolute inset-0 flex items-center justify-center">
                {phase === "combat" && combatResult && me?.alive ? (
                  <CombatStage
                    result={combatResult}
                    flip={!!myCombat?.flip}
                    authWon={myCombat?.won}
                    hpLost={myCombat?.dmg}
                    suppressRecap={!!(inspect || inspectedItem)}
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

        {/* Bottom bar: board controls + bench (centred), then the shop. */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-stretch gap-2">
            {/* Board capacity (placed / cap) + one-click auto-fill from the bench. */}
            {(() => {
              const boardCount = units.filter((u) => u.pos !== null).length;
              const benchCount = units.length - boardCount;
              const cap = boardSizeForLevel(level);
              const full = boardCount >= cap;
              return (
                <div className="gilded flex flex-col justify-center gap-1 px-2.5 py-1.5 rounded-xl shrink-0">
                  <div className="text-[9px] uppercase tracking-wider text-amber-200/55 text-center leading-none">{lang === "fr" ? "Plateau" : "Board"}</div>
                  <div className="text-center text-base font-extrabold tabular-nums leading-none">
                    <span className={full ? "text-emerald-300" : "text-amber-300"}>{boardCount}</span>
                    <span className="text-slate-600">/{cap}</span>
                  </div>
                  <button
                    onClick={fillBoard}
                    disabled={phase !== "planning" || benchCount === 0 || full}
                    title={lang === "fr" ? "Remplir le plateau depuis le banc" : "Fill the board from the bench"}
                    className="px-2 py-1 rounded-md bg-emerald-700/80 hover:bg-emerald-600 disabled:opacity-30 text-[10px] font-bold text-white leading-none"
                  >
                    {lang === "fr" ? "Remplir" : "Fill"}
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
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{lang === "fr" ? "Raccourcis" : "Keys"}</span>
              <Kbd k="R" label={lang === "fr" ? "Reroll" : "Reroll"} />
              <Kbd k="L" label="XP" />
              <Kbd k="S" label={lang === "fr" ? "Vendre" : "Sell"} />
            </div>
          )}
        </div>
      </div>
      </div>

      {phase === "carousel" && me?.alive && (() => {
        const opts = room.carousel?.[myUid];
        const key = `${meta.stage}-${meta.round}`;
        // Also honour the SERVER-backed pick flag (me.carouselPicked) so a reconnect /
        // refresh can't re-show the cards and grant a SECOND free reward — local
        // pickedKey/pickLatch don't survive a remount.
        const picked = pickedKey === key || me?.carouselPicked === key;
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
              <Eye size={13} className="inline align-text-bottom mr-1" />{revealBoard ? (lang === "fr" ? "Afficher les choix" : "Show choices") : (lang === "fr" ? "Voir mon plateau" : "Hide & view board")}
            </button>
            {!revealBoard && (
            <div className="celebrate-pop flex flex-col items-center">
              <div className="flex items-center gap-2.5 mb-1">
                <span><Sparkles size={24} /></span>
                <h2 className="text-2xl font-extrabold text-amber-300 tracking-tight">{lang === "fr" ? "Carrousel" : "Carousel"}</h2>
              </div>
              <p className="text-xs text-slate-300/80">{picked ? (() => {
                // How many connected trainers still owe a pick (the round ends as
                // soon as everyone has chosen).
                const waiting = Object.values(room.players ?? {}).filter((p) => !p.isBot && p.connected && p.alive && p.carouselPicked !== key).length;
                return waiting > 0
                  ? (lang === "fr" ? `Choisi — en attente de ${waiting} dresseur${waiting > 1 ? "s" : ""}…` : `Picked — waiting for ${waiting} trainer${waiting > 1 ? "s" : ""}…`)
                  : (lang === "fr" ? "Choisi — en attente du tour…" : "Picked — waiting for the round…");
              })() : (lang === "fr" ? "Choisis une récompense gratuite." : "Pick one free reward.")}</p>
              <div className="text-[11px] tabular-nums font-bold text-amber-200/70 mt-0.5 mb-5"><Countdown deadline={meta.deadline} />s</div>
            {!picked && (() => {
              // A unit pick needs a free bench slot; items/Mega go to the inventory.
              // Block (don't silently swallow) unit picks when the bench is full so
              // the player knows to sell a unit first instead of losing the reward.
              const benchFull = units.filter((u) => u.pos === null).length >= BENCH_SIZE;
              const fullNote = lang === "fr" ? "Banc plein" : "Bench full";
              return (
              <div className="flex gap-3 justify-center items-start">
                {opts.map((pick, i) => {
                  const onPick = () => { if (pickLatch.current === `c-${key}`) return; pickLatch.current = `c-${key}`; netCarouselPick(pick); setPickedKey(key); flushSync(); markCarouselPicked(room.code, myUid, key); };
                  if (pick === MEGA_STONE) return <CarouselCard key={i} onClick={onPick} color="#f0abfc" name="Mega Stone" sub={lang === "fr" ? "Méga-Évolution" : "Mega Evolve"} art={<span className="text-fuchsia-300"><MegaIcon size={56} /></span>} />;
                  const item = ITEM_DEF_BY_ID[pick];
                  if (item) return <CarouselCard key={i} onClick={onPick} color={RARITY_COLOR[item.rarity] ?? "#fbbf24"} name={lang === "fr" ? item.nameFr : item.name} sub={lang === "fr" ? item.textFr : item.text} art={<span style={{ color: RARITY_COLOR[item.rarity] ?? "#fbbf24" }}><ItemGlyph id={item.id} size={46} /></span>} />;
                  const def = getDef(pick);
                  return (
                    <CarouselCard
                      key={i}
                      onClick={onPick}
                      disabled={benchFull}
                      note={fullNote}
                      color={COST_COLOR[def.cost]}
                      name={def.name}
                      cost={def.cost}
                      types={def.types as PokeType[]}
                      // eslint-disable-next-line @next/next/no-img-element
                      art={<img src={spriteUrl(def.dex[0])} alt={def.name} width={88} height={88} style={{ imageRendering: "pixelated" }} draggable={false} />}
                    />
                  );
                })}
              </div>
              );
            })()}
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
            <Eye size={13} className="inline align-text-bottom mr-1" />{revealBoard ? (lang === "fr" ? "Afficher les choix" : "Show choices") : (lang === "fr" ? "Voir mon plateau" : "Hide & view board")}
          </button>
          {!revealBoard && (
          <div className="celebrate-pop flex flex-col items-center">
            <div className="flex items-center gap-2.5 mb-1">
              <span><Sparkles size={24} /></span>
              <h2 className="text-2xl font-extrabold text-violet-300 tracking-tight">Augment {augSlotNow! + 1}/3</h2>
            </div>
            <p className="text-xs text-slate-300/80 mb-5">{lang === "fr" ? "Choisis un bonus permanent." : "Pick one permanent boost."}</p>
            <div className="flex gap-3 flex-wrap justify-center max-w-[640px]">
            {augOptions.map((a) => (
              <OrnateAugmentCard
                key={a.id}
                onClick={() => { const lk = `a-${augSlotNow}`; if (pickLatch.current === lk) return; pickLatch.current = lk; pickAugment(a.id); setPickedSlot(augSlotNow); flushSync(); }}
                icon={<AugmentGlyph id={a.id} size={34} />}
                name={lang === "fr" ? a.nameFr : a.name}
                desc={lang === "fr" ? a.descFr : a.desc}
                tier={a.tier}
                frame={AUGMENT_TIER_COLOR[a.tier]}
              />
            ))}
            </div>
          </div>
          )}
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
        const medal = (place: number) => (place <= 3
          ? <TrophyIcon size={18} style={{ color: place === 1 ? "#fbbf24" : place === 2 ? "#cbd5e1" : "#d97706" }} />
          : `#${place}`);
        return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm gap-5 p-4">
          <div className={`celebrate-pop flex flex-col items-center gap-2 ${iWon ? "text-amber-300" : "text-slate-200"}`}>
            {iWon && <TrophyIcon size={52} />}
            <div className="text-4xl font-extrabold">{iWon ? t.net_victory : t.net_gameover}</div>
            {meta?.endedByHost
              ? <div className="text-sm font-semibold text-rose-300">{lang === "fr" ? "L'hôte a quitté — partie terminée." : "The host left — game ended."}</div>
              : <div className="text-sm text-slate-400">{t.net_placed(me?.place ?? 1)}</div>}
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
            {isHost ? (
              <button onClick={() => returnToLobby(room.code, room)} className="px-6 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold shadow-lg">{t.net_play_again}</button>
            ) : (
              <span className="px-6 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700 text-slate-400 text-sm font-semibold">{lang === "fr" ? "En attente de l'hôte…" : "Waiting for host…"}</span>
            )}
            <button onClick={leave} className="px-6 py-2.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 border border-slate-700 text-slate-200 text-sm font-bold">{t.net_quit}</button>
          </div>
        </div>
        );
      })()}

      {booting && <BootVeil
        label={lang === "fr" ? "Connexion au serveur…" : "Connecting to the arena…"}
        sub={`${connectedHumans}/${humanPlayers.length} ${lang === "fr" ? "dresseurs prêts" : "trainers ready"}`}
        progress={humanPlayers.length ? connectedHumans / humanPlayers.length : 1}
      />}
    </DndContext>
  );
}

/** Pokéball boot veil shown briefly at match start while sprites load + the room
 *  syncs, so the first frame everyone sees is fully loaded and in lockstep. */
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

/** Ornate gold-framed TFT card (used for carousel rewards + augments): a gilded
 *  border with corner brackets, a blue gilded body, and a dark info panel. */
function OrnateFrame({ onClick, frame = "#d4af37", height, children }: { onClick: () => void; frame?: string; height: number; children: ReactNode }) {
  // The gilded border, corner brackets and glow are tinted to `frame` so the card
  // reads its rarity (cost colour for units, amber for items, violet for augments).
  const cornerCls = "absolute w-3.5 h-3.5 pointer-events-none";
  return (
    <button onClick={onClick} style={{ height, boxShadow: `0 0 30px -10px ${frame}` }} className="group relative w-[160px] shrink-0 rounded-md hover:-translate-y-1.5 transition-all">
      <div className="absolute inset-0 rounded-md p-[2px]" style={{ background: `linear-gradient(155deg, ${frame}, ${frame} 42%, rgba(2,6,23,0.6))` }}>
        <div className="w-full h-full rounded-[4px] overflow-hidden flex flex-col bg-gradient-to-b from-sky-700/55 via-sky-950/90 to-slate-950 group-hover:from-sky-600/70 transition-colors">
          {children}
        </div>
      </div>
      <span className={`${cornerCls} top-0 left-0 border-t-2 border-l-2 rounded-tl-md`} style={{ borderColor: frame }} />
      <span className={`${cornerCls} top-0 right-0 border-t-2 border-r-2 rounded-tr-md`} style={{ borderColor: frame }} />
      <span className={`${cornerCls} bottom-0 left-0 border-b-2 border-l-2 rounded-bl-md`} style={{ borderColor: frame }} />
      <span className={`${cornerCls} bottom-0 right-0 border-b-2 border-r-2 rounded-br-md`} style={{ borderColor: frame }} />
    </button>
  );
}

/** Carousel reward card in the ornate frame: big art on top, then name +
 *  cost/traits (units) or effect (items) on the dark panel. */
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

function CarouselCard({ onClick, color, name, sub, cost, types, art, disabled, note }: { onClick: () => void; color: string; name: string; sub?: string; cost?: number; types?: PokeType[]; art: ReactNode; disabled?: boolean; note?: string }) {
  return (
    <div className={disabled ? "opacity-45 grayscale pointer-events-none relative" : "relative"}>
      <OrnateFrame onClick={disabled ? () => {} : onClick} frame={color} height={200}>
        <div className="flex-1 flex items-center justify-center pt-3 pb-1">{art}</div>
        <div className="px-2 py-2 bg-slate-950/80 border-t border-amber-600/40 flex flex-col items-center gap-1">
          <span className="text-sm font-extrabold text-amber-50 text-center leading-tight drop-shadow">{name}</span>
          {cost != null && <span style={{ color }} className="inline-flex items-center gap-0.5 text-[11px] font-extrabold"><CoinIcon size={11} />{cost}</span>}
          {types && (
            <div className="flex flex-wrap gap-0.5 justify-center">
              {types.map((ty) => <span key={ty} style={{ background: TYPE_COLOR[ty] }} className="text-[8px] px-1 rounded text-black/80 font-bold uppercase">{ty.slice(0, 3)}</span>)}
            </div>
          )}
          {sub && <span className="text-[9px] text-slate-300/85 text-center leading-tight">{sub}</span>}
        </div>
      </OrnateFrame>
      {disabled && note && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center px-2">
          <span className="text-[10px] font-extrabold text-rose-200 bg-rose-950/80 border border-rose-700/60 rounded px-2 py-1 inline-block">{note}</span>
        </div>
      )}
    </div>
  );
}

/** Augment choice in the ornate frame: icon in a gilded tile, name, then the
 *  effect on the dark panel — matching the TFT "Select an Augment" look. */
function OrnateAugmentCard({ onClick, icon, name, desc, tier, frame }: { onClick: () => void; icon: ReactNode; name: string; desc: string; tier: string; frame: string }) {
  return (
    <OrnateFrame onClick={onClick} frame={frame} height={272}>
      <div className="flex flex-col items-center pt-5 px-3">
        <div className="w-16 h-16 rounded-lg flex items-center justify-center" style={{ background: `${frame}1f`, border: `1px solid ${frame}66`, boxShadow: `inset 0 0 14px ${frame}40`, color: frame }}>{icon}</div>
        <span className="mt-1.5 text-[9px] font-extrabold uppercase tracking-[0.18em]" style={{ color: frame }}>{tier}</span>
        <span className="mt-1 text-[15px] font-extrabold text-amber-50 text-center leading-tight drop-shadow">{name}</span>
      </div>
      <div className="mt-auto bg-slate-950/80 border-t border-amber-600/30 px-3 py-3 text-center">
        <span className="text-[11px] text-slate-300 leading-snug">{desc}</span>
      </div>
    </OrnateFrame>
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
        <span className={`text-xs font-extrabold uppercase tracking-wide ${resolving ? "text-amber-300 animate-pulse" : phase === "combat" ? "text-rose-300" : "text-sky-300"}`}>{resolving ? resolvingLabel : phaseLabel}</span>
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

function StatChip({ label, value, accent, sub, title }: { label: string; value: ReactNode; accent?: string; sub?: string; title?: string }) {
  return (
    <div title={title} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/25 border border-[var(--panel-edge)] shadow-[inset_0_1px_0_rgba(231,198,107,0.06)] shrink-0">
      <span className="text-[9px] uppercase tracking-wider text-amber-200/55 leading-none">{label}</span>
      <span className="text-base font-extrabold leading-none inline-flex items-baseline gap-1" style={{ color: accent }}>
        {value}{sub && <span className="text-[10px] font-bold text-slate-400">{sub}</span>}
      </span>
    </div>
  );
}
