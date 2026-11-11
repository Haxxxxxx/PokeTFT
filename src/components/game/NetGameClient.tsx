"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay, PointerSensor, TouchSensor, closestCenter, pointerWithin, MeasuringStrategy, useSensor, useSensors, useDroppable } from "@dnd-kit/core";
import type { CollisionDetection } from "@dnd-kit/core";
import { useGame, resolveBenchSlots, BENCH_SIZE } from "@/game/store/gameStore";
import { useRoom } from "@/game/net/roomStore";
import { startServerTime, serverNow } from "@/game/net/serverTime";
import { resolveRoundStart, endCombat, endCarousel, heartbeat, maybeClaimHost, syncBoard, finishCarouselEarlyIfReady, markCarouselPicked, predictOpponent, PLAN_MS, COMBAT_MS, CAROUSEL_MS } from "@/game/net/match";
import { simulate, type FrameUnit } from "@/game/engine/combat";
import { getDef, hasDef, archetypeOf } from "@/game/data/mons";
import { rosterForRoom, modeStartItems, modeRoundItem, modeLootScale, modeTeamBuff, modeSignatureAugment, getMode, pickMonoType, isDoubleUp, isNuzlocke, isHyperRoll, isLegendaryClash } from "@/game/data/gameModes";
import { streakGold, roundKind, advanceRound, boardSizeForLevel, cumulativeRound } from "@/game/config";
import { serializeBoard, saveGhost, type GhostUnit } from "@/game/net/ghost";
import { interest, sellValue } from "@/game/engine/economy";
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
import { Button } from "@/components/ui/Button";
import { useUi } from "@/game/store/uiStore";
import { makeRng, hashStr } from "@/game/engine/rng";
import { itemsArray, normalizeUnit } from "@/game/net/rtdb-utils";
import { CarouselOverlay, AugmentOverlay, GameOverScreen } from "./GameOverlays";
import type { UnitInstance } from "@/game/types";


// The fixed design canvas (1760x1190, uniformly scaled) that used to live here
// is gone — see src/game/ui/layout.ts. Zones are sized from the live viewport
// and the layout reflows, so there is no canvas constant to keep in sync.

function asUnits(u: unknown): UnitInstance[] {
  if (!u) return [];
  return (Array.isArray(u) ? u : Object.values(u as Record<string, UnitInstance>)).map(normalizeUnit);
}
import { Board } from "./Board";
import { createPortal } from "react-dom";
import { PensionDock } from "./PensionDock";
import { useDraggablePanel } from "./useDraggablePanel";
import { computeTraits } from "@/game/engine/synergies";
import { TYPE_COLOR } from "@/game/ui";
import { TraitGlyph } from "./TraitGlyph";
import { Board3D } from "./Board3D";
import { useGameLayout } from "./LayoutProvider";
import { UnitChip } from "./UnitChip";
import { PokemonModelPreview } from "./PokemonModelPreview";
import { ShopBar } from "./ShopBar";
import { TraitPanel } from "./TraitPanel";
import { UnitDetail } from "./UnitDetail";
import { OptionsMenu } from "./OptionsMenu";
import { MatchChat } from "./MatchChat";
import { subscribeCarouselGrants } from "@/game/net/carousel-grants";
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

/**
 * Dropping a mon onto the shop sells it (id "sell-shop").
 *
 * This replaces a dedicated 92px "drag to sell" slot that sat beside the shop
 * for the whole match. It was a permanent reservation of the widest row on
 * screen for a target you use a few times a round, and it took that width from
 * the cards — the thing you actually read. TFT sells to the shop for exactly
 * this reason, and the drop was already wired here.
 *
 * Losing the slot would lose the only place the game SAYS you can sell by
 * dragging, so the shop announces it instead: while a mon is in hand the
 * overlay appears across the cards with what the sale pays, and it turns solid
 * when you are actually over it. Discoverable at the one moment it matters,
 * and invisible the rest of the time.
 */
function ShopSellDrop({ dragValue, children }: { dragValue: number | null; children: ReactNode }) {
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({ id: "sell-shop" });
  const dragging = dragValue !== null;
  return (
    <div
      ref={setNodeRef}
      className={`relative flex-1 min-w-0 rounded-xl transition-shadow ${isOver ? "ring-2 ring-rose-400/80 ring-inset" : ""}`}
    >
      {children}
      {dragging && (
        <div
          className={`absolute inset-0 z-panel pointer-events-none rounded-xl border-2 border-dashed flex items-center justify-center gap-2 transition-all
            ${isOver
              ? "border-rose-400 bg-rose-950/80 text-rose-100 shadow-[0_0_22px_-6px_rgba(244,63,94,0.7)]"
              : "border-rose-700/50 bg-slate-950/55 text-rose-200/70"}`}
        >
          <span className={`leading-none transition-transform ${isOver ? "scale-125" : ""}`}><Trash2 size={22} /></span>
          <span className="text-[12px] font-extrabold uppercase tracking-wider">{t.sh_drag_sell}</span>
          <span className="inline-flex items-center gap-1 text-[13px] font-extrabold tabular-nums text-gold-300">
            +{dragValue}<CoinIcon size={13} />
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Your bench, kept on screen while combat resolves.
 *
 * TFT lets you shop and sell during a fight, and this codebase already agreed:
 * onDragEnd explicitly permits selling in combat ("no effect on the frozen,
 * already-resolved fight") and Board is passed benchInteractive for combat too.
 * None of it could fire, because the bench lives ON the planning platform and
 * combat replaces that platform with the CombatStage — so there was nothing to
 * drag, and a unit bought mid-fight vanished into a bench you could not see.
 *
 * Hex chips, matching the planning bench and the drag ghost, so a mon keeps one
 * silhouette wherever it is.
 */
/** One bench slot during a fight. Shares the `bench-N` drop ids the planning
 *  bench uses, so onDragEnd's existing reorder path works unchanged. */
function CombatBenchSlot({
  index, size, unit,
}: {
  index: number; size: number; unit: UnitInstance | undefined;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `bench-${index}` });
  return (
    <div
      ref={setNodeRef}
      className={`relative shrink-0 flex items-end justify-center bench-slab${isOver ? " is-over" : ""}`}
      style={{ width: size, height: size }}
    >
      {/* canDeploy=false: the board is locked mid-fight, so a double-click must
          not look like it placed something. Dragging still works — between
          slots to reorder, or onto the sell zone. */}
      {unit && <UnitChip unit={unit} size={size} shape="hex" canDeploy={false} dragHitArea />}
    </div>
  );
}

/**
 * Your bench, kept live while combat resolves.
 *
 * TFT lets you shop, sell AND rearrange your bench during a fight, and this
 * codebase already half-agreed: onDragEnd explicitly permits it in combat ("no
 * effect on the frozen, already-resolved fight") and Board is passed
 * benchInteractive for combat too. None of it could fire, because the bench
 * lives ON the planning platform and combat replaces that platform with the
 * CombatStage — so there was nothing to drag, nowhere to drop, and a unit
 * bought mid-fight vanished into a bench you could not see.
 *
 * Rendered as real slots rather than a loose row: the slots ARE the drop
 * targets, and reusing the `bench-N` ids means reordering needed no new
 * handling. Only the BOARD stays locked.
 */
function CombatBench() {
  const units = useGame((s) => s.units);
  const L = useGameLayout();
  const slots = resolveBenchSlots(units);
  const size = L.benchSlot - 8;
  return (
    <div className="shrink-0 flex items-end justify-center gap-1 px-2 pt-6 pb-1">
      {Array.from({ length: BENCH_SIZE }, (_, i) => (
        <CombatBenchSlot key={i} index={i} size={size} unit={slots[i] ?? undefined} />
      ))}
    </div>
  );
}

/**
 * Board hexes are ranked by centre distance; everything else must contain the
 * pointer.
 *
 * closestCenter alone is right for the ARENA and wrong for the UI. The arena is
 * a perspective-tilted plane, so getBoundingClientRect() returns projected
 * boxes that overlap and mis-rank — their centres stay correctly ordered, which
 * is why the hexes use centre distance.
 *
 * The bench strip, the shop and the sell zone are flat, stacked panels, and
 * centre distance on those is actively dangerous: the sell zone sits directly
 * below the bench, so aiming at a bench slot could put the dragged mon's centre
 * nearer to SELL than to the slot — and selling is destructive and silent. You
 * reach for a slot and the mon is gone.
 *
 * So: if the pointer is genuinely inside one or more non-hex droppables, those
 * win. Otherwise fall back to centre distance, which keeps the board behaving
 * exactly as before.
 */
const boardAwareCollision: CollisionDetection = (args) => {
  const within = pointerWithin(args).filter((c) => !String(c.id).startsWith("cell-"));
  return within.length ? within : closestCenter(args);
};

/**
 * The recap for one past round: who you fought, whether you won, what it cost.
 *
 * A component rather than an inline branch because it owns drag state, and a
 * hook cannot live inside a conditional render. Its position is remembered
 * between openings — you open a recap to compare it against something, and
 * having to re-park it every round is the reason you stop opening it.
 */
function RoundRecapPanel({
  roundKey, won, oppName, oppPhoto, dmg, defaultStyle, onClose,
}: {
  roundKey: string;
  won: boolean;
  oppName: string;
  oppPhoto?: string | null;
  dmg: number;
  /** Where it opens before the player moves it. Fixed coordinates, because it
   *  renders in a portal — see below. */
  defaultStyle: CSSProperties;
  onClose: () => void;
}) {
  const t = useT();
  const { nodeRef, style, onPointerDown, dragging, moved, reset } = useDraggablePanel(
    "poketft.recapPanel",
    defaultStyle,
  );
  // Portalled to the body. It used to render inside the round tracker, which
  // carries z-20 -- and a z-index only ranks an element against its siblings
  // INSIDE the nearest stacking context. So a panel the player had dragged
  // over the HUD bar (z-30) disappeared under it no matter what z-index it
  // asked for. "Anywhere" has to mean anywhere.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={nodeRef}
      style={style}
      onPointerDown={onPointerDown}
      className={`gilded gilded-strong z-panel flex items-center gap-3 px-3 py-1 rounded-lg shrink-0 select-none ${
        dragging ? "cursor-grabbing shadow-[0_8px_30px_rgba(0,0,0,0.6)]" : "cursor-grab"
      }`}
    >
      {/* The grip is the affordance. Without it a draggable panel is only
          discoverable by accident, which is the same as not being draggable. */}
      <span aria-hidden className="text-slate-600 leading-none tracking-[-0.15em] text-[11px]">⋮⋮</span>
      <span className="text-[10px] font-bold text-slate-400">{roundKey}</span>
      <span className="flex items-center gap-1.5">
        {oppPhoto
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={oppPhoto} alt="" width={18} height={18} className="rounded" style={{ imageRendering: "pixelated" }} draggable={false} />
          : null}
        <span className="text-[11px] font-bold text-slate-200">{oppName}</span>
      </span>
      <span className={`text-[11px] font-extrabold ${won ? "text-emerald-300" : "text-rose-300"}`}>{won ? t.net_round_win : t.net_round_loss}</span>
      {!won && dmg > 0 && <span className="text-[10px] text-rose-300/80">−{dmg} PV</span>}
      {moved && (
        <button
          onClick={reset}
          title={t.net_panel_reset}
          className="text-slate-500 hover:text-slate-200 text-xs leading-none"
        >
          ↺
        </button>
      )}
      <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-xs leading-none">✕</button>
    </div>,
    document.body,
  );
}

/** Gold cost of an augment reroll after the first (free) one per slot. */
const AUG_REROLL_COST = 2;

export function NetGameClient() {
  // Declared first: effects far above the old declaration site read `t` (e.g. the
  // last-fight recorder), which put it in the temporal dead zone at module-eval order.
  // Safe at runtime (effects run after the body) but a real TDZ hazard on refactor.
  const t = useT();
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
  const board3d = useAppStore((s) => s.settings.board3d);
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
  const [draggedUnit, setDraggedUnit] = useState<UnitInstance | null>(null);
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
  // The hovered round cube, with the screen rect it occupies. The rect is kept
  // here rather than rendering the card inside the cube because the strip is a
  // scroller, and a scroller clips (see the note on it below): a card parented
  // to a cube would be cut off at the strip's edge. Holding the position lets
  // the card render fixed, outside everything that clips.
  const [hoverRound, setHoverRound] = useState<{ key: string; x: number; y: number } | null>(null);
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
  // The screen used to be one fixed 1760x1190 canvas scaled uniformly to fit,
  // which shrank hex tokens and label text together until neither worked on a
  // phone. Now every zone is sized from the live viewport by the layout engine
  // (src/game/ui/layout.ts) and the arrangement reflows instead of scaling.
  const L = useGameLayout();

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
  // Memoized: the `?? {}` fallback minted a NEW empty object on every render, so every
  // effect listing `players` (e.g. the spectator follow-target below) re-ran each render
  // while the room had no players node yet.
  const players = useMemo(() => room?.players ?? {}, [room?.players]);
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
      else { newGame(roster(), enabledItems, modeStartItems(room.rules), room.rules); hydrated.current = "fresh"; ghostSnaps.current = {}; }
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
    // Depends on rules.MODE, not the whole `rules` object: every RTDB snapshot hands us a
    // fresh object identity, so listing `room.rules` would tear down and re-subscribe the
    // partner mailbox on every room write. Only the mode can change what this does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.code, myUid, isSpectator, room?.rules?.mode, coopReceiveGold, coopReceiveUnit]);

  // Drain carousel rewards the host left for me.
  //
  // A carousel pick is applied in the PICKER's own client, so being
  // disconnected when the timer expires means applying nothing — and the node
  // is wiped on the way to planning. The host now parks the reward; this takes
  // it. See carousel-grants.ts.
  useEffect(() => {
    if (!room?.code || !myUid || isSpectator) return;
    const code = room.code;
    const stop = subscribeCarouselGrants(code, myUid, (g) => {
      // Not until our own save is loaded: applying an item on top of default
      // state would be overwritten by the hydrate that follows, which is the
      // same silent loss this fix exists to close. Returning false leaves the
      // grant in the box for the next subscribe.
      if (hydrated.current === "none") return false;
      const live = useRoom.getState().liveRoom;
      const mine = live?.players?.[myUid];
      // Idempotence against a redelivery: the authoritative flag says whether
      // this round's reward has already been taken. If it has, the grant is
      // stale — clear it without granting a second copy.
      if (mine?.carouselPicked === g.key) return true;
      useGame.getState().netCarouselPick(g.pick);
      // Claim the round, so a repeat delivery (or a second tab) cannot take it
      // again, and push the save immediately rather than waiting for the
      // debounced sync — `items` is not in that effect's dependency list.
      markCarouselPicked(code, myUid, g.key).catch(() => {});
      const gs = useGame.getState();
      syncBoard(code, myUid, gs.units, gs.exportSave(), gs.level, gs.augments, gs.gold);
      useUi.getState().pushToast(t.net_carousel_granted);
      return true;
    });
    return stop;
  }, [room?.code, myUid, isSpectator, t]);

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
  // STATE, not a ref: the game-over overlay reads this during render to crown an MVP.
  // As a ref that read was a ref-during-render violation — the overlay could paint a
  // stale (or missing) MVP card because mutating a ref schedules no re-render.
  const [lastFightUnits, setLastFightUnits] = useState<FrameUnit[] | null>(null);
  // Both teams' final-frame stats, kept as STATE (read in render for the planning recap, so a
  // ref would be a "ref-during-render" violation) — and it shows the enemy team too, not just yours.
  const [lastFight, setLastFight] = useState<{ mine: FrameUnit[]; theirs: FrameUnit[]; oppName: string } | null>(null);
  // Separate from lastRoundKey (which gates planning econ grants): addRoundStats uses
  // the same stage-round key as the preceding planning phase, so sharing one ref causes
  // the stat recording to always be skipped (planning always fires first and marks it seen).
  const statsRoundKey = useRef<string | null>(null);
  useEffect(() => {
    if (!combatResult?.frames?.length || !myCombat) return;
    const myTeam = myCombat.flip ? "enemy" : "ally";
    const last = combatResult.frames[combatResult.frames.length - 1];
    const mine = last.units.filter((u) => u.team === myTeam);
    const theirs = last.units.filter((u) => u.team !== myTeam);
    if (mine.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLastFightUnits(mine);
      if (!myCombat.pve) setLastFight({ mine, theirs, oppName: myCombat.oppName ?? t.net_rival });
    }
    if (meta && mine.length) {
      const roundKey = `${meta.stage}-${meta.round}`;
      if (statsRoundKey.current !== roundKey) {
        statsRoundKey.current = roundKey;
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
  // Reset the reroll counter when a NEW augment slot opens, using React's
  // "adjust state during render" pattern rather than an effect — an effect here
  // rendered the stale offering for one frame and triggered a cascading render.
  const [augRerollSlot, setAugRerollSlot] = useState(augSlotNow);
  if (augRerollSlot !== augSlotNow) {
    setAugRerollSlot(augSlotNow);
    setAugReroll(0);
  }
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
    // Same reason as the co-op subscription above: keyed on rules.MODE only. Depending on
    // the whole `rules` object would re-roll the player's augment offer mid-pick every time
    // any unrelated room field was written.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Shop hotkeys: R reroll · L buy XP · S sell the inspected unit.
  //
  // Live during COMBAT as well as planning, to match the rest of the shop:
  // buying, rerolling and selling all touch only your economy and your bench,
  // never the frozen fight. Leaving the keys planning-only meant the mouse
  // could do something the keyboard refused to.
  //
  // Disabled while spectating a rival — otherwise R/L/S silently mutate YOUR
  // own economy while you are looking at someone else's board.
  useEffect(() => {
    if ((phase !== "planning" && phase !== "combat") || (!!spectate && spectate !== myUid)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      // D and F are aliases for R and L. Every autobattler player arrives with
      // D-to-reroll and F-for-XP already in their hands, and the first thing a
      // shortcut that does nothing teaches you is that shortcuts do not work
      // here. Both sets are live; neither is "the" binding.
      if (k === "r" || k === "d") { e.preventDefault(); reroll(); }
      else if (k === "l" || k === "f") { e.preventDefault(); buyXp(); }
      else if (k === "s") {
        e.preventDefault();
        const iid = useUi.getState().inspect?.iid;
        if (iid) { sell(iid); useUi.getState().clearInspect(); }
        // Previously a silent no-op. Sell needs a selected mon, and pressing a
        // key that does nothing and says nothing is indistinguishable from a
        // broken shortcut -- which is exactly how it was reported.
        else useUi.getState().pushToast(t.net_key_sell_hint);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, spectate, myUid, reroll, buyXp, sell, t]);

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
      // Display only. The rating and leaderboard rows are written server-side by
      // applyRatingFor() with admin rights; the client used to mirror them here,
      // which both duplicated the authoritative write and could clobber a newer
      // rating with a stale snapshot.
      setRankResult({ delta: r.delta, rating: r.rating, prevRating: r.prevRating });
    });
    return unsub;
  }, [serverResultCode, myUid]);

  // Auto-concede ONLY when the page is really going away.
  //
  // This previously also forfeited on `visibilitychange: hidden` after a 20s
  // grace. Live telemetry of a real match showed exactly what that costs: the
  // player was eliminated 6s into stage 1-1 with `hp 100 → 0` — and again
  // during a PLANNING phase, where no damage can be dealt at all — because
  // they had alt-tabbed more than 20 seconds earlier. Tabbing away to look
  // something up ended the match.
  //
  // The only thing that path bought was recording LP sooner than pruneStale's
  // sweep would. Forfeiting a live game to speed up a bookkeeping write is a
  // bad trade, so backgrounding no longer concedes at all: `connected` already
  // goes false via onDisconnect while the player is away, and pruneStale is
  // the guaranteed fallback for a genuinely abandoned game.
  //
  // `pagehide` with persisted === false means the page is actually being
  // unloaded (tab closed, navigated away) — that IS abandonment, and still
  // forfeits immediately. persisted === true is a bfcache freeze: the page can
  // come back, so it is left alone.
  useEffect(() => {
    const code = room?.code;
    if (!code || !myUid) return;
    const tryAutoForfeit = () => {
      const r = useRoom.getState().room;
      const phase = r?.meta?.phase;
      const alive = r?.players?.[myUid]?.alive;
      if (!alive || (phase !== "planning" && phase !== "combat" && phase !== "carousel")) return;
      if (recordedRef.current === code) return;
      recordedRef.current = code;
      callConcede(code).catch(() => {});
    };
    const onHide = (e: PageTransitionEvent) => {
      // A frozen/bfcached page is coming back; only a real unload is abandonment.
      if (e.persisted) return;
      tryAutoForfeit();
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
    };
  }, [room?.code, myUid]);  

  const [confirmLeave, setConfirmLeave] = useState(false);
  // Float-up text: "+X gold" or "−X HP" shown briefly near the HUD on econ events.
  const [floatText, setFloatText] = useState<string | null>(null);
  // STATE, not a ref: this is the React `key` that restarts the float-up animation.
  // Read during render, so a ref both violated purity and could reuse a stale key —
  // making two consecutive gold/HP ticks fail to replay the animation.
  const [floatKey, setFloatKey] = useState(0);
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
      setFloatKey((k) => k + 1);
      setFloatText(`+${diff}`);
      const id = setTimeout(() => setFloatText(null), 1200);
      prevGoldRef.current = gold;
      return () => clearTimeout(id);
    }
    prevGoldRef.current = gold;
  }, [gold, isSpectator]);  

  // HP damage SFX + screen-flash + float-up text: fire when the player's HP decreases.
  const prevHpRef = useRef<number | null>(null);
  useEffect(() => {
    if (isSpectator || !me) return;
    const hp = me.hp ?? 100;
    if (prevHpRef.current !== null && hp < prevHpRef.current) {
      sfx.damage();
      setBoardFlash(true);
      const diff = prevHpRef.current - hp;
      setFloatKey((k) => k + 1);
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
        <div className="w-8 h-8 rounded-full border-2 border-gold-400/40 border-t-amber-400 animate-spin" />
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

  // What the mon in hand would pay if dropped on the shop. null when nothing
  // sellable is being dragged -- an ITEM drag finds no unit, so the sell
  // overlay stays away while you are equipping.
  const dragSellValue = draggedUnit ? sellValue(draggedUnit.defId, draggedUnit.star) : null;

  function onDragStart(e: DragStartEvent) {
    const iid = String(e.active.id);
    setDraggedUnit(useGame.getState().units.find((unit) => unit.iid === iid) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setDraggedUnit(null);
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
      // During a fight, items may only go onto the BENCH. The board is frozen
      // mid-playback, so equipping a unit that is currently fighting would
      // change a combat whose result is already decided — the item would
      // appear to do nothing, or worse, look like it did. A benched mon is not
      // in the fight, so there is nothing to corrupt.
      // Back into the inventory = cancel. Explicit, so it can never fall
      // through to "equip the nearest mon".
      if (target === "items") return;
      const benchOnly = phase === "combat";
      if (phase !== "planning" && !benchOnly) return;
      if (benchOnly && !target.startsWith("bench-")) return;
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
    // "sell" was the dedicated slot's id; that slot is gone and the shop is
    // the only sell target now.
    if (target === "sell-shop") sell(iid);
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
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDraggedUnit(null)}
      // closestCenter, not the default rectIntersection: the arena is a
      // 3D-tilted plane, and getBoundingClientRect() on a transformed element
      // returns the PROJECTED axis-aligned box. Those projected boxes overlap
      // and mis-rank under perspective, but their centers stay correctly
      // ordered — so center distance is the collision test that survives tilt.
      collisionDetection={boardAwareCollision}
      // Re-measure droppables on every drag: the board resizes with the
      // viewport now, so cached rects from a previous size would be stale.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
    >
      {/* Keep the moving unit in viewport coordinates. Translating a draggable
          inside the perspective-transformed arena skews its motion with the floor. */}
      <DragOverlay
        style={{ pointerEvents: "none" }}
        dropAnimation={null}
      >
        {draggedUnit && (
          // The ghost must be the SAME thing you lifted. It used to switch to
          // shape="square" for bench units, but the bench moved onto the
          // platform and renders hex — and the two shapes size their art
          // differently (hex draws the mon at ~1.85x the cell and overflows it,
          // square draws it at size-6 and clips to the box). So grabbing a
          // bench mon shrank it by nearly half on pickup and snapped it back on
          // drop, which is what made the motion feel broken.
          //
          // Same shape, same size, same art scale: the mon now just lifts.
          <div className="drag-ghost">
            <UnitChip
              unit={draggedUnit}
              size={draggedUnit.pos === null ? L.benchSlot - 8 : L.tile.w - 6}
              interactive={false}
              shape="hex"
            />
          </div>
        )}
      </DragOverlay>
      <Toasts />
      {/* Concede / forfeit confirm */}
      {confirmLeave && (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setConfirmLeave(false)}>
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
        <div className="fixed inset-0 z-panel flex items-center justify-center pointer-events-none">
          <div className="stage-banner text-center">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.4em] text-gold-300/80 mb-1">{t.net_stage_banner}</div>
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
      <div className="tft-shell fixed inset-0 overflow-hidden">
      <div
        style={{ padding: L.pad, gap: L.gap }}
        className="w-full h-full flex flex-col"
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
          {/* py-2 is load-bearing. This scrolls horizontally, and CSS gives you
              no way to scroll one axis while leaving the other visible: the
              moment overflow-x is `auto`, overflow-y computes to `auto` too and
              the box clips vertically. The current round is scaled to 1.18 and
              every played round carries a result dot hung at -top-0.5, so both
              were sliced off by a scroll container nobody thought was clipping.
              The padding gives them room inside it; overflow-y-hidden just says
              out loud that the vertical axis was never meant to scroll. */}
          <div
            className="flex-1 flex items-center justify-center gap-1 overflow-x-auto overflow-y-hidden py-2"
            onScroll={() => setHoverRound(null)}
          >
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
                  : kind === "pve" ? "bg-gold-900/20 ring-1 ring-gold-600/30"
                  : "bg-slate-800/60 ring-1 ring-slate-600/40";
              return (
                <button
                  key={key}
                  type="button"
                  // aria-disabled, NOT disabled. A browser does not dispatch
                  // mouse events to a disabled form control, and most rounds
                  // are unclickable (every PvE round, every future round) --
                  // so `disabled` meant the hover card worked on precisely the
                  // rounds that least needed explaining and on nothing else.
                  // The click is guarded below instead. tabIndex keeps the
                  // unclickable ones out of the tab order, which is what
                  // `disabled` was buying us.
                  aria-disabled={!clickable}
                  tabIndex={clickable ? 0 : -1}
                  onClick={() => {
                    if (!clickable || !recap) return;
                    if (open) setRecapKey(null);
                    else { setRecapKey(key); setSpectate(recap.oppUid); }
                  }}
                  onMouseEnter={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    // The card is centred on the cube, so a cube near either
                    // edge would push half of it off screen — and the rounds
                    // at the ends of the strip are exactly the ones you scroll
                    // to. Clamped to half the card's own widest sensible size.
                    const half = 130;
                    const centre = r.left + r.width / 2;
                    setHoverRound({
                      key,
                      x: Math.min(Math.max(centre, half), window.innerWidth - half),
                      y: r.bottom,
                    });
                  }}
                  onMouseLeave={() => setHoverRound((h) => (h?.key === key ? null : h))}
                  className={`relative w-6 h-6 shrink-0 rounded flex items-center justify-center text-[12px] leading-none grayscale-[0.15] transition-all ${cls} ${open ? "ring-2 ring-gold-300" : ""} ${clickable ? "cursor-pointer hover:brightness-125" : "cursor-default"}`}
                >
                  <span className={isPast && !isCurrent ? "opacity-80" : ""}>{icon}</span>
                  {isPast && !isCurrent && (
                    <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-900 ${result ? "bg-emerald-400" : "bg-rose-400"}`} />
                  )}
                </button>
              );
            })}
          </div>
          {/* Replaces a `title` attribute, which waited a second, rendered in
              the OS style, and could not say who you fought or what it cost --
              so the round strip read as a row of unlabelled icons you had to
              already understand. Fixed to the hovered cube's own rect, so the
              scroller above cannot clip it. */}
          {hoverRound && (() => {
            const item = schedule.find((sc) => `${sc.stage}-${sc.round}` === hoverRound.key);
            if (!item) return null;
            const r = recapByKey.get(hoverRound.key);
            const res = resultByKey.get(hoverRound.key);
            const canOpen = !!r && !r.pve && r.oppUid !== myUid && !!players[r.oppUid];
            if (typeof document === "undefined") return null;
            // Portalled for the same reason as the recap panel: the strip sits
            // in a z-20 context, so a card asking for z-tooltip still painted
            // under the HUD bar immediately below it -- which is exactly where
            // a card hanging off the round strip lands.
            return createPortal(
              <div
                role="tooltip"
                style={{ left: hoverRound.x, top: hoverRound.y + 6 }}
                className="fixed z-tooltip -translate-x-1/2 pointer-events-none whitespace-nowrap rounded-md border border-white/10 bg-[#0a0e1a]/95 px-2.5 py-1.5 shadow-lg"
              >
                <div className="text-[11px] font-bold text-slate-100">
                  {t.net_stage} {hoverRound.key} · {item.kind === "carousel" ? t.net_round_carousel : item.kind === "pve" ? t.net_round_pve : t.net_round_pvp}
                </div>
                {res !== undefined && (
                  <div className={`text-[11px] font-semibold ${res ? "text-emerald-300" : "text-rose-300"}`}>
                    {res ? t.net_round_win : t.net_round_loss}
                    {r && !r.pve && r.oppName ? ` · ${r.oppName}` : ""}
                    {r && !r.won && r.dmg > 0 ? ` · −${r.dmg} PV` : ""}
                  </div>
                )}
                {canOpen && <div className="text-[9px] text-slate-400">{t.net_round_click_recap}</div>}
              </div>,
              document.body,
            );
          })()}
          {recapKey && recapByKey.get(recapKey) && (() => {
            const r = recapByKey.get(recapKey)!;
            const opp = players[r.oppUid];
            return (
              <RoundRecapPanel
                roundKey={recapKey}
                won={r.won}
                oppName={r.oppName}
                oppPhoto={opp?.photoURL}
                dmg={r.dmg}
                // Where it used to sit: the right end of the round tracker.
                // Expressed in fixed coordinates now that it is portalled.
                defaultStyle={{ position: "fixed", top: L.pad + 6, right: L.pad + 10 }}
                onClose={() => { setRecapKey(null); setSpectate(null); }}
              />
            );
          })()}
        </div>

        {/* Top HUD bar: stat chips, then the phase/timer segment + controls.
            (The stage badge lives next to the timeline above.) */}
        <div className="relative z-30 gilded flex items-center gap-2.5 px-3.5 py-2 rounded-xl min-w-0 max-w-full">
          {(() => {
            // The HUD economy reflects whoever's board you're looking at: a scouted rival → their
            // now-public econ (lobby chose full transparency); else your own live numbers.
            const tgt = spectating ? spectateP : (isSpectator ? undefined : me);
            if (!tgt) {
              return (
                <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gold-500/15 border border-gold-400/40 text-[11px] font-bold text-gold-300">
                  <Eye size={13} /> {t.net_spectate_badge}
                </span>
              );
            }
            const g = spectating ? (spectateP?.gold ?? 0) : gold;
            const stk = spectating ? (spectateP?.streak ?? 0) : streak;
            return (
              <>
                {spectating && (
                  <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gold-500/15 border border-gold-400/40 text-[11px] font-bold text-gold-300">
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
          {isHyperRoll(room.rules) && (
            <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gold-500/40 text-[11px] font-bold text-gold-300 bg-gold-500/10"
              title="Hyper Roll: shop only offers cost 1–3 units; 50 starting HP">
              ⚡ Hyper Roll
            </span>
          )}
          {isLegendaryClash(room.rules) && (
            <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-purple-500/40 text-[11px] font-bold text-purple-300 bg-purple-500/10"
              title="Legendary Clash: shop only offers cost 3–5 units; 150 starting HP">
              ★ Legendary
            </span>
          )}
          {doubleUp && partner && (
            <CoopPanel code={room.code} myUid={myUid} partner={{ uid: partner.uid, name: partner.name, hp: partner.hp, alive: partner.alive }} lang={lang} />
          )}

          {/* Phase + timer — isolated so it ticks on its own without re-rendering
              the whole game tree every 250ms (the old global tick caused jank). */}
          <PhaseTimer phase={phase} phaseLabel={phaseLabel} deadline={meta.deadline} totalMs={phase === "combat" ? COMBAT_MS : phase === "carousel" ? CAROUSEL_MS : PLAN_MS} resolvingLabel={t.net_resolving} />

          {isHost && <span className="text-[9px] font-bold uppercase bg-gold-500 text-black rounded px-1 shrink-0">{t.net_host_badge}</span>}
          <div className="flex items-center gap-2 shrink-0">
            {/* Last-fight recap — reviewable while planning (your team + the enemy's). */}
            {phase === "planning" && !isSpectator && lastFight && (
              <button onClick={() => setShowRecap((s) => !s)} title={t.net_recap_title}
                className={`px-2.5 py-1.5 rounded-md border text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${showRecap ? "bg-gold-500/90 text-black border-gold-400" : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300"}`}>
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
        {/* Three fluid tracks: traits rail · BOARD · players rail. The board takes
            every pixel the chrome doesn't, so it grows with the window instead of
            being scaled. Rail widths come from the layout engine's density tier. */}
        <div
          className="flex-1 min-h-0 grid items-stretch"
          style={{
            gridTemplateColumns: L.railsAsDrawers
              ? `1fr ${L.rightRail}px`
              : `${L.leftRail}px 1fr ${L.rightRail}px`,
            gap: L.gap,
          }}
        >
          {/* Left rail: synergies + item stash (hidden on compact — reachable from
              the drawer button in the top strip). */}
          {!L.railsAsDrawers && (
          <div className="flex flex-col gap-3 min-h-0">
            {/* Synergies sit at the TOP of the rail at their natural height;
                the item stash is pushed to the bottom (mt-auto), matching TFT's
                component stash in the lower-left. The gap between them is empty
                space on purpose rather than a stretched, half-empty panel. */}
            {/* flex-1, so the synergies get what is left rather than only
                what the stash below chose to leave them. TraitPanel is
                max-h-full and scrolls internally, so a long synergy list is
                reachable instead of being pushed off the rail. */}
            <div data-panel="traits" className="flex-1 min-h-0 flex flex-col">
              <TraitPanel units={spectateUnits ?? undefined} />
            </div>
            {/* Bottom of the rail, TFT's corner: the item stash, then the
                augment recap under it. Both are things you re-read constantly
                while building, so they get a standing home rather than a HUD
                chip you have to click. */}
            {/* Capped at 45% of the rail. The stash had no height limit at all:
                every distinct item added a row to a 2-column grid, and the
                block is pinned to the bottom, so a full inventory grew upwards
                and took the synergies' space -- the panel you read constantly
                while building was squeezed out by the one you glance at. The
                augment recap underneath did the same. Now the stash scrolls
                inside its own share and the synergies always keep theirs. */}
            <div data-panel="stash" className="shrink-0 mt-auto flex flex-col gap-2 min-h-0 max-h-[45%] overflow-y-auto">
              {/* Visible during COMBAT too. Your items are information — what
                  you are holding and what it builds into is most of what you
                  think about while a fight plays back, and hiding the panel
                  meant the one moment you have to plan is the one moment you
                  cannot see your components. Equipping is still restricted
                  below; this is about being able to LOOK. */}
              {!isSpectator && !spectating && <ItemsPanel />}
              {!isSpectator && <AugmentsBar augments={augments} lang={lang} variant="panel" />}
            </div>
          </div>
          )}

          {/* Right rail: the trainers ladder, with the pension docked beneath it.
              Both answer the same question — what is coming for me in a few
              rounds — which is why they belong in one column. The pension used
              to float over the arena at top-[18%], competing with the hexes for
              space and kept near-transparent so it would not cover the fight;
              the panel that is a timer was the one you could not read. */}
          {/* self-start on the COLUMN, not on the panel: it means "as tall as
              its contents" here, so a 2-player lobby doesn't draw a full-height
              empty box. On the panel itself it would now mean as WIDE as its
              contents -- self-start aligns on the cross axis, and this column's
              cross axis is horizontal where the grid track's was vertical. */}
          <div className="order-last self-start flex flex-col min-h-0 max-h-full" style={{ gap: L.gap }}>
          <div className="gilded w-full p-2 rounded-xl min-h-0 overflow-y-auto">
            <h2 className="text-[10px] uppercase tracking-wider text-gold-200/55 px-1 mb-1.5">{t.net_trainers(aliveCount)}</h2>
            <div className="flex flex-col gap-1">
              {ladder.map((p, i) => {
                const pBoard = asBoard(p.board);
                const dex = pBoard[0] ? getDef(pBoard[0].defId).dex[pBoard[0].star - 1] : null;
                const isNm = p.botDifficulty === "nightmare";
                // Their strongest live synergies. Boards are public in this
                // lobby (the rules chose full transparency), and TFT puts the
                // same cue here — it turns the rail from a list of names into
                // actual scouting you can act on without opening each board.
                const topTraits = computeTraits(pBoard)
                  .filter((tr) => tr.tier > 0)
                  .slice(0, 3);
                return (
                  <div
                    key={p.uid}
                    onClick={() => setSpectate(isSpectator ? p.uid : (p.uid === myUid ? null : (spectate === p.uid ? null : p.uid)))}
                    title={p.uid === myUid && !isSpectator ? t.net_your_board : t.net_view_board(p.name)}
                    className={`flex items-center gap-2 px-1.5 py-1 rounded-lg cursor-pointer hover:bg-slate-700/50 ${p.uid === myUid ? "bg-slate-700/70 ring-1 ring-sky-500/50" : ""} ${spectate === p.uid ? "ring-1 ring-gold-400/70 bg-gold-500/10" : ""} ${isNm && p.alive ? "ring-1 ring-rose-600/50 bg-rose-950/20" : ""} ${!p.alive ? "opacity-40" : ""}`}
                  >
                    <span className="w-4 text-[10px] text-slate-500 font-bold text-center">{p.place ?? i + 1}</span>
                    {/* Circular portrait with a ranked ring — TFT's trainer rail.
                        The ring colour carries standing (gold at the top, rose
                        for a nightmare bot) so the rail is scannable without
                        reading any numbers. */}
                    <span
                      className={`relative w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden player-orb ${isNm ? "is-nightmare" : (p.place ?? i + 1) === 1 ? "is-lead" : ""}`}
                    >
                      {isNm ? <span className="text-[13px] leading-none">💀</span> : p.photoURL ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.photoURL} alt="" width={32} height={32} className="w-full h-full object-cover" style={{ imageRendering: "pixelated" }} />
                      ) : dex ? (
                        <PokemonModelPreview dex={dex} alt={p.name} width={26} height={26} />
                      ) : <span className="text-[10px] font-bold text-slate-500">{p.name.slice(0, 1).toUpperCase()}</span>}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className={`block text-[11px] font-semibold truncate ${isNm ? "text-rose-300" : p.uid === myUid ? "text-gold-300" : "text-slate-200"}`}>
                          {p.name}{!p.connected && t.net_offline}
                        </span>
                        {/* Scouting: rivals' levels are public (TFT-style). */}
                        <span className="shrink-0 text-[8px] font-bold px-1 rounded bg-slate-700/80 text-slate-300 leading-tight tabular-nums">{t.net_lv}{p.level ?? 1}</span>
                        {topTraits.length > 0 && (
                          <span className="shrink-0 flex items-center gap-[2px]">
                            {topTraits.map((tr) => (
                              <span
                                key={tr.key}
                                title={`${tr.label} ${tr.count}`}
                                className="trait-hex trait-hex-xs"
                                style={{ ["--trait" as string]: (TYPE_COLOR as Record<string, string>)[tr.key] ?? "#64748b" }}
                              >
                                <span className="trait-hex-fill">
                                  <TraitGlyph traitKey={tr.key} size={8} />
                                </span>
                              </span>
                            ))}
                          </span>
                        )}
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
          {/* Your own pension, in every phase. It is never a spectator's — the
              store holds OUR pension, and a spectator has no board of their own
              to have put a mon in one. Dropping is planning-only, on our own
              board, which is the same gate the bench uses. */}
          {!isSpectator && (
            <PensionDock
              interactive={phase === "planning" && (!spectate || spectate === myUid)}
              railW={L.rightRail}
              font={L.font}
            />
          )}
          </div>

          {/* Center: the shared field. Fills the track the rails leave behind, so
              it grows with the window rather than being scaled. The board itself
              keeps ONE tile size across phases (the layout engine solves planning
              and combat together), so the arena never jumps when the phase flips.
              A `board-swap` fade plays when the view changes. */}
          <div className={`order-2 relative min-w-0 min-h-0 flex items-center justify-center rounded-xl${boardFlash ? " screen-flash" : ""}`}>
            {/* Float-up text for HP damage or gold gain feedback. */}
            {floatText && (
              <div key={floatKey} className={`float-up absolute top-4 left-1/2 -translate-x-1/2 z-30 text-sm font-extrabold drop-shadow pointer-events-none select-none ${floatText.startsWith("−") ? "text-rose-300" : "text-gold-300"}`}>
                {floatText}
              </div>
            )}
            {spectating ? (
              <div key={`spec-${spectate}`} className="board-swap absolute inset-0 flex flex-col gap-2">
                <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-gold-500/10 border border-gold-500/30 shrink-0">
                  <span className="text-xs font-bold text-gold-300">{t.net_viewing(spectateP?.name ?? "rival")}</span>
                  {isSpectator
                    ? <span className="text-[10px] text-gold-200/60">{t.net_spectate_switch}</span>
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
                    <div className="w-5 h-5 rounded-full border-2 border-gold-400/40 border-t-amber-400 animate-spin" />
                    <span className="text-xs">{t.net_spectate_switch}</span>
                  </div>
                ) : phase === "combat" && combatResult && me?.alive ? (
                  <div className="absolute inset-0 flex flex-col">
                    <div className="relative flex-1 min-h-0 flex items-center justify-center">
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
                    </div>
                    <CombatBench />
                  </div>
                ) : board3d ? (
                  // HD-2D board (opt-in). Drag is handled natively inside the
                  // canvas and committed through the same store actions, so the
                  // two boards are interchangeable from the game's point of view.
                  <Board3D interactive={phase === "planning" && (!spectate || spectate === myUid)} />
                ) : (
                  <Board
                    withBench
                    rows={L.planningRows}
                    // TFT lets you shop and sell during a fight; only the board
                    // is locked, so the bench stays live in both phases.
                    benchInteractive={(phase === "planning" || phase === "combat") && (!spectate || spectate === myUid)}
                    benchCanDeploy={phase === "planning" && (!spectate || spectate === myUid)}
                  />
                )}
              </div>
            )}
          </div>

        </div>

        {/* Unit / item detail. The right track now belongs to the trainers list,
            so details float over the board on demand instead of permanently
            reserving a 340px column — which is also what frees that width for
            the board on smaller screens. Available in every phase. */}
        {!spectating && (inspect || inspectedItem) && (
          <div
            className="fixed z-40 flex flex-col detail-pop"
            style={{
              right: L.rightRail + L.gap + L.pad,
              top: L.pad + L.topH + L.gap,
              width: Math.min(340, Math.max(240, L.viewport.w * 0.26)),
              maxHeight: `calc(100vh - ${L.pad * 2 + L.topH + L.gap * 2}px)`,
            }}
          >
            <UnitDetail />
          </div>
        )}

        {/* Bottom bar: board controls + bench (centred), then the shop. Hidden for dedicated
            spectators (no econ) AND while scouting a rival (it's all YOUR controls — the centre
            shows the rival's board + bench instead, so your shop/bench would just be noise). */}
        {/* Pinned to the height the layout engine budgeted. Left to grow with its
            content, this strip stole space the arena had already been sized
            against — which is what slid the bench slabs under the shop cards. */}
        {!isSpectator && !spectating && <div className="relative shrink-0 min-h-0 flex flex-col items-center" style={{ height: L.shopH }}>
          {/* The bench now lives ON the platform (see Board's `withBench`), and the
              board count is ghosted across the arena floor, so only the auto-fill
              action still needs a home down here.

              It FLOATS above the strip rather than sitting in flow. This block is
              pinned to the height the layout engine budgeted, so an in-flow button
              took its space out of the shop underneath: the moment the board grew
              a slot and you had an unplaced mon, the button appeared and the whole
              shop dropped to make room, then jumped back when you placed one. A
              transient hint must not resize the thing you are aiming at. */}
          {(() => {
            const boardCount = units.filter((u) => u.pos !== null).length;
            const benchCount = units.length - boardCount;
            const full = boardCount >= boardSizeForLevel(level);
            if (phase !== "planning" || benchCount === 0 || full) return null;
            return (
              <Button
                variant="primary"
                size="sm"
                onClick={fillBoard}
                title={t.net_board_fill_title}
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-panel whitespace-nowrap shadow-lg shadow-black/40"
              >
                {t.net_board_fill}
              </Button>
            );
          })()}
          <div className="flex-1 min-h-0 flex w-full max-w-[1480px]">
            {/* Full width. Selling is the shop itself now — see ShopSellDrop. */}
            <ShopSellDrop dragValue={dragSellValue}><ShopBar /></ShopSellDrop>
          </div>
          {/* The keyboard-hint strip used to sit in flow here, on the assumption
              that the bottom block could grow to fit it. It can't any more — the
              block is pinned to the height the layout engine budgeted, so the
              strip overflowed and rendered ON TOP of the shop cards. It's also
              not something TFT shows. The shortcuts still work; their discovery
              belongs in How-to-play, not in a bar competing with the shop. */}
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
          rankResult={rankResult} lastFightUnits={lastFightUnits} isHost={isHost}
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
      {/* No longer gated on me.alive. Being knocked out does not end your
          interest in the lobby -- you watch the rest of it play out, and the
          old gate cut you out of the conversation at exactly the moment you
          had nothing to do but talk. Spectators get the panel read-only; the
          rules have no player node to authorise their writes. */}
      {inMatch && (
        <MatchChat
          code={room.code}
          myUid={myUid}
          myName={me?.name ?? ""}
          canSend={!isSpectator && !!me}
        />
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
        <span className="text-[10px] uppercase tracking-wide text-gold-200/60 font-bold">{t.net_fight_last}</span>
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
            <PokemonModelPreview dex={u.dex} alt="" width={20} height={20} />
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
    <div className="fixed inset-0 z-overlay flex flex-col items-center justify-center gap-5 bg-[#070b16]" style={{ animation: "bootfade 0.4s ease-out 1.5s forwards" }}>
      <div className="relative w-16 h-16 animate-spin" style={{ animationDuration: "1s" }}>
        <div className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(#ef4444 0 calc(50% - 3px), #0f172a calc(50% - 3px) calc(50% + 3px), #f1f5f9 calc(50% + 3px) 100%)", boxShadow: "0 0 0 3px #0f172a, 0 0 22px 3px #ef444455" }} />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 border-[4px] border-slate-900" />
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <div className="text-lg font-extrabold tracking-wide text-slate-100">Poké<span className="text-gold-400">TFT</span></div>
        <div className="text-xs text-slate-400">{label}</div>
        {sub && <div className="text-[11px] font-semibold text-gold-300/80 tabular-nums">{sub}</div>}
        {/* Progress bar — fills as trainers connect, then a sweep while the board syncs. */}
        <div className="mt-1 w-52 h-1.5 rounded-full bg-slate-800/80 overflow-hidden">
          {pct >= 100
            ? <div className="h-full w-1/3 rounded-full bg-gold-400 loading-sweep" />
            : <div className="h-full rounded-full bg-gold-400 transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />}
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
    <div className="fixed left-1/2 -translate-x-1/2 bottom-8 z-toast pointer-events-none">
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

/** Last 5 seconds of a phase — used to pulse the timer so players glance up
 *  before it auto-advances, instead of just trusting the smooth bar. */
const URGENT_MS = 5000;
function useTimerUrgent(deadline: number) {
  useClockTick(true, 100);
  const left = deadline - serverNow();
  return left > 0 && left <= URGENT_MS;
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
  // Combat's countdown is already rose/red throughout — the urgency pulse is only
  // useful on planning/carousel, where the calm sky-blue otherwise never changes.
  // (Hook called unconditionally per the Rules of Hooks; gated below instead.)
  const isUrgentWindow = useTimerUrgent(deadline);
  const urgent = !resolving && phase !== "combat" && isUrgentWindow;
  return (
    // min-w was a hard 220px, which in a non-wrapping flex row pushed the host
    // badge and the options/fullscreen/quit controls past the right edge below
    // ~1024px wide. An ancestor clips, so that content was not merely off-screen
    // but UNREACHABLE — you could not scroll to it. It now compresses on small
    // viewports and only claims 220px once there is room for it.
    <div className="flex-1 min-w-0 lg:min-w-[220px] flex flex-col gap-1 px-2">
      <div className="flex justify-between items-baseline">
        <span className={`text-xs font-bold uppercase tracking-wide ${resolving ? "text-gold-300 animate-pulse" : urgent ? "text-rose-300 timer-urgent" : phase === "combat" ? "text-rose-300" : "text-sky-300"}`}>{resolving ? resolvingLabel : phaseLabel}</span>
        <span className={`text-sm font-bold tabular-nums ${urgent ? "text-rose-300 timer-urgent" : "text-slate-200"}`}>
          {resolving
            ? <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-gold-400/25 border-t-amber-400 animate-spin align-middle" />
            : <><Countdown deadline={deadline} />s</>}
        </span>
      </div>
      {resolving
        ? <div className="h-1.5 w-full rounded-full bg-slate-800/80 overflow-hidden"><div className="h-full w-1/3 rounded-full bg-gold-400 loading-sweep" /></div>
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
