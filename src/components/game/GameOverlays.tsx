"use client";

import { useEffect, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import { getDef, spriteUrl, hasDef } from "@/game/data/mons";
import { serverNow } from "@/game/net/serverTime";
import { markCarouselPicked, returnToLobby } from "@/game/net/match";
import { rankOf, type RankedResult } from "@/game/net/users";
import { MEGA_STONE } from "@/game/data/mega";
import { ITEM_POOL, RARITY_COLOR } from "@/game/data/itemPool";
import { AUGMENT_TIER_COLOR, type Augment } from "@/game/data/augments";
import { BENCH_SIZE } from "@/game/store/gameStore";
import { ItemGlyph, AugmentGlyph } from "./ItemGlyph";
import { MegaIcon, CoinIcon, TrophyIcon } from "./icons";
import { Eye, Sparkles, RefreshCw, Swords } from "lucide-react";
import { normalizeUnit } from "@/game/net/rtdb-utils";
import { COST_COLOR, TYPE_COLOR } from "@/game/ui";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/game/store/appStore";
import type { FrameUnit } from "@/game/engine/combat";
import type { Room, RoomPlayer, RoomMeta } from "@/game/net/roomStore";
import type { UnitInstance, PokeType } from "@/game/types";

const ITEM_DEF_BY_ID = Object.fromEntries(ITEM_POOL.map((i) => [i.id, i]));

/** Mirror match.ts board(): drop unknown-def units so the standings team matches the host. */
function asBoard(b: unknown): UnitInstance[] {
  if (!b) return [];
  const arr = Array.isArray(b) ? b : Object.values(b as Record<string, UnitInstance>);
  return (arr as UnitInstance[]).filter((u) => u && u.pos && hasDef(u.defId)).map(normalizeUnit);
}

/** Self-ticking clock so a countdown updates without re-rendering the whole game. */
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

/** Ornate gold-framed TFT card (used for carousel rewards + augments): a gilded
 *  border with corner brackets, a blue gilded body, and a dark info panel. */
function OrnateFrame({ onClick, frame = "#d4af37", height, children }: { onClick: () => void; frame?: string; height: number; children: ReactNode }) {
  const cornerCls = "absolute w-2.5 h-2.5 pointer-events-none";
  return (
    <button
      onClick={onClick}
      style={{ height, borderColor: `${frame}99`, boxShadow: "0 10px 28px -18px rgba(0,0,0,0.85)" }}
      className="group relative w-[160px] shrink-0 rounded-lg border overflow-hidden hover:-translate-y-1 hover:brightness-110 transition-all"
    >
      <span className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(180deg, #0b1020 0%, ${frame}14 68%, ${frame}30 100%)` }} />
      <div className="relative z-10 w-full h-full flex flex-col">{children}</div>
      <span className={`${cornerCls} top-0 left-0 border-t border-l rounded-tl-lg`} style={{ borderColor: frame }} />
      <span className={`${cornerCls} top-0 right-0 border-t border-r rounded-tr-lg`} style={{ borderColor: frame }} />
      <span className={`${cornerCls} bottom-0 left-0 border-b border-l rounded-bl-lg`} style={{ borderColor: frame }} />
      <span className={`${cornerCls} bottom-0 right-0 border-b border-r rounded-br-lg`} style={{ borderColor: frame }} />
    </button>
  );
}

function CarouselCard({ onClick, color, name, sub, cost, types, art, disabled, note }: { onClick: () => void; color: string; name: string; sub?: string; cost?: number; types?: PokeType[]; art: ReactNode; disabled?: boolean; note?: string }) {
  return (
    <div className={disabled ? "opacity-45 grayscale pointer-events-none relative" : "relative"}>
      <OrnateFrame onClick={disabled ? () => {} : onClick} frame={color} height={200}>
        <div className="flex-1 flex items-center justify-center pt-3 pb-1">{art}</div>
        <div className="px-2 py-2 bg-black/40 border-t border-white/10 flex flex-col items-center gap-1">
          <span className="text-sm font-bold text-slate-100 text-center leading-tight drop-shadow">{name}</span>
          {cost != null && <span style={{ color }} className="inline-flex items-center gap-0.5 text-[11px] font-bold"><CoinIcon size={11} />{cost}</span>}
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
function OrnateAugmentCard({ onClick, icon, name, desc, tier, frame, combat }: { onClick: () => void; icon: ReactNode; name: string; desc: string; tier: string; frame: string; combat?: boolean }) {
  return (
    <OrnateFrame onClick={onClick} frame={frame} height={272}>
      <div className="flex flex-col items-center pt-5 px-3">
        <div className="w-16 h-16 rounded-lg flex items-center justify-center" style={{ background: `${frame}1a`, border: `1px solid ${frame}55`, color: frame }}>{icon}</div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: frame }}>{tier}</span>
          {combat && <span className="inline-flex items-center gap-0.5 text-[8px] font-bold uppercase tracking-wide px-1 rounded bg-rose-500/20 text-rose-300 border border-rose-400/40"><Swords size={8} /> Combat</span>}
        </div>
        <span className="mt-1 text-[15px] font-bold text-slate-100 text-center leading-tight drop-shadow">{name}</span>
      </div>
      <div className="mt-auto bg-black/40 border-t border-white/10 px-3 py-3 text-center">
        <span className="text-[11px] text-slate-300 leading-snug">{desc}</span>
      </div>
    </OrnateFrame>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Overlays extracted from NetGameClient. Each is gated by the caller; they own
// only their own presentation. State + refs stay in NetGameClient and arrive as
// props (identical names) so behaviour is unchanged.
// ─────────────────────────────────────────────────────────────────────────────

type LatchRef = { current: string | null };

export function CarouselOverlay({
  room, me, myUid, meta, pickedKey, revealBoard, setRevealBoard, units, pickLatch,
  netCarouselPick, setPickedKey, flushSync,
}: {
  room: Room;
  me: RoomPlayer | undefined;
  myUid: string;
  meta: RoomMeta;
  pickedKey: string | null;
  revealBoard: boolean;
  setRevealBoard: Dispatch<SetStateAction<boolean>>;
  units: UnitInstance[];
  pickLatch: LatchRef;
  netCarouselPick: (pick: string) => void;
  setPickedKey: Dispatch<SetStateAction<string | null>>;
  flushSync: () => void;
}) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.language);
  const opts = room.carousel?.[myUid];
  const key = `${meta.stage}-${meta.round}`;
  // Also honour the SERVER-backed pick flag (me.carouselPicked) so a reconnect /
  // refresh can't re-show the cards and grant a SECOND free reward — local
  // pickedKey/pickLatch don't survive a remount.
  const picked = pickedKey === key || me?.carouselPicked === key;
  if (!opts) return null;
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={revealBoard
        ? { background: "transparent" }
        : { background: "radial-gradient(58% 58% at 50% 38%, rgba(146,64,14,0.32), rgba(2,6,23,0.93))", backdropFilter: "blur(7px)" }}
    >
      <button
        onClick={() => setRevealBoard((v) => !v)}
        style={{ pointerEvents: "auto" }}
        className="absolute top-4 right-4 z-10 px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-600 text-[11px] font-bold text-slate-200 shadow-lg"
      >
        <Eye size={13} className="inline align-text-bottom mr-1" />{revealBoard ? t.net_show_choices : t.net_hide_view_board}
      </button>
      {!revealBoard && (
      <div className="min-h-full flex flex-col items-center justify-center p-4">
      <div className="celebrate-pop flex flex-col items-center">
        <div className="flex items-center gap-2.5 mb-1">
          <span><Sparkles size={24} /></span>
          <h2 className="text-2xl font-extrabold text-amber-300 tracking-tight">{t.net_carousel_title}</h2>
        </div>
        {(() => {
          // Comeback cue: mirrors the server's below-median-HP reward boost so the
          // player understands why their carousel looks richer when behind.
          const hps = Object.values(room.players ?? {}).filter((p) => !p.isBot && p.alive).map((p) => p.hp).sort((a, b) => a - b);
          const median = hps.length ? hps[Math.floor((hps.length - 1) / 2)] : 100;
          return hps.length > 1 && (me?.hp ?? 100) < median ? (
            <span className="mb-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-[10px] font-bold text-emerald-300">
              <Sparkles size={10} /> {t.net_carousel_comeback}
            </span>
          ) : null;
        })()}
        <p className="text-xs text-slate-300/80">{picked ? (() => {
          const waiting = Object.values(room.players ?? {}).filter((p) => !p.isBot && p.connected && p.alive && p.carouselPicked !== key).length;
          return waiting > 0
            ? t.net_carousel_picked_waiting(waiting)
            : t.net_carousel_picked_round;
        })() : t.net_carousel_pick_free}</p>
        <div className="text-[11px] tabular-nums font-bold text-amber-200/70 mt-0.5 mb-5"><Countdown deadline={meta.deadline} />s</div>
      {!picked && (() => {
        // A unit pick needs a free bench slot; items/Mega go to the inventory.
        const benchFull = units.filter((u) => u.pos === null).length >= BENCH_SIZE;
        const fullNote = t.net_bench_full;
        return (
        <div className="flex gap-3 justify-center items-start">
          {opts.map((pick, i) => {
            const onPick = () => { if (pickLatch.current === `c-${key}`) return; pickLatch.current = `c-${key}`; netCarouselPick(pick); setPickedKey(key); flushSync(); markCarouselPicked(room.code, myUid, key); };
            if (pick === MEGA_STONE) return <CarouselCard key={i} onClick={onPick} color="#f0abfc" name={t.it_mega_stone} sub={t.net_carousel_mega_sub} art={<span className="text-fuchsia-300"><MegaIcon size={56} /></span>} />;
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
      </div>
      )}
    </div>
  );
}

export function AugmentOverlay({
  augSlotNow, augOptions, revealBoard, setRevealBoard, pickLatch, pickAugment,
  setPickedSlot, flushSync, augRerollCost, gold, rerollAugments,
}: {
  augSlotNow: number;
  augOptions: Augment[];
  revealBoard: boolean;
  setRevealBoard: Dispatch<SetStateAction<boolean>>;
  pickLatch: LatchRef;
  pickAugment: (id: string) => void;
  setPickedSlot: Dispatch<SetStateAction<number | null>>;
  flushSync: () => void;
  augRerollCost: number;
  gold: number;
  rerollAugments: () => void;
}) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.language);
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={revealBoard
        ? { background: "transparent" }
        : { background: "radial-gradient(58% 58% at 50% 38%, rgba(76,29,149,0.4), rgba(2,6,23,0.93))", backdropFilter: "blur(7px)" }}
    >
      <button
        onClick={() => setRevealBoard((v) => !v)}
        style={{ pointerEvents: "auto" }}
        className="absolute top-4 right-4 z-10 px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-600 text-[11px] font-bold text-slate-200 shadow-lg"
      >
        <Eye size={13} className="inline align-text-bottom mr-1" />{revealBoard ? t.net_show_choices : t.net_hide_view_board}
      </button>
      {!revealBoard && (
      <div className="min-h-full flex flex-col items-center justify-center p-4">
      <div className="celebrate-pop flex flex-col items-center">
        <div className="flex items-center gap-2.5 mb-1">
          <span><Sparkles size={24} /></span>
          <h2 className="text-2xl font-extrabold text-violet-300 tracking-tight">{t.net_augment_slot(augSlotNow + 1)}</h2>
        </div>
        <p className="text-xs text-slate-300/80 mb-5">{t.net_augment_pick_one}</p>
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
            combat={!!a.combat}
          />
        ))}
        </div>
        <button
          onClick={rerollAugments}
          disabled={augRerollCost > 0 && gold < augRerollCost}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-900/50 hover:bg-violet-700 border border-violet-500/50 text-violet-100 text-[12px] font-bold disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw size={14} />
          {t.net_augment_reroll}
          {augRerollCost === 0
            ? <span className="text-[10px] text-emerald-300 font-extrabold uppercase">{t.net_augment_free}</span>
            : <span className="inline-flex items-center gap-0.5 text-amber-300"><CoinIcon size={11} />{augRerollCost}</span>}
        </button>
      </div>
      </div>
      )}
    </div>
  );
}

export function GameOverScreen({
  players, myUid, me, meta, iWon, rankResult, lastFightRef, isHost, room, leave, doubleUp,
}: {
  players: Record<string, RoomPlayer>;
  myUid: string;
  me: RoomPlayer | undefined;
  meta: RoomMeta;
  iWon: boolean;
  rankResult: RankedResult | null;
  lastFightRef: { current: FrameUnit[] | null };
  isHost: boolean;
  room: Room;
  leave: () => void;
  doubleUp: boolean;
}) {
  const t = useT();
  // Final standings: every player ranked by placement (winner = #1), with their
  // final team. Double Up: keep teammates adjacent by tie-breaking on team.
  const standings = Object.values(players).sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || (a.teamId ?? 0) - (b.teamId ?? 0) || (a.uid < b.uid ? -1 : 1));
  const medal = (place: number) => (place <= 3
    ? <TrophyIcon size={18} style={{ color: place === 1 ? "#fbbf24" : place === 2 ? "#cbd5e1" : "#d97706" }} />
    : `#${place}`);
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm gap-5 p-4">
      <div className={`celebrate-pop flex flex-col items-center gap-2 ${iWon ? "text-amber-300" : "text-slate-200"}`}>
        {iWon && <TrophyIcon size={52} />}
        <div className="text-4xl font-extrabold">{iWon ? t.net_victory : t.net_gameover}</div>
        {meta?.endedByHost
          ? <div className="text-sm font-semibold text-rose-300">{t.net_host_left}</div>
          : <div className="text-sm text-slate-400">{t.net_placed(me?.place ?? 1)}</div>}
      </div>

      {/* MVP of your final fight — top damage dealer, with tank/heal. */}
      {(() => {
        const mine = lastFightRef.current;
        if (!mine || !mine.length) return null;
        const mvp = [...mine].sort((a, b) => b.dmgDealt - a.dmgDealt)[0];
        if (!mvp || mvp.dmgDealt <= 0) return null;
        const topTank = [...mine].sort((a, b) => b.dmgTaken - a.dmgTaken)[0];
        const topHeal = [...mine].sort((a, b) => b.healed - a.healed)[0];
        const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);
        return (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10">
            <div className="rounded-lg bg-black/30 border border-amber-500/40 p-1 shrink-0 relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={spriteUrl(mvp.dex)} alt="" width={44} height={44} style={{ imageRendering: "pixelated" }} />
              <span className="absolute -top-1.5 -left-1.5 text-sm">⭐</span>
            </div>
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-wide text-amber-200/70 font-bold">{t.net_mvp_label}</div>
              <div className="text-sm font-extrabold text-amber-200 truncate">{mvp.name}</div>
              <div className="flex items-center gap-2.5 mt-0.5 text-[10px] font-bold">
                <span className="text-rose-300" title={t.net_mvp_damage}>⚔ {fmt(mvp.dmgDealt)}</span>
                {topTank && topTank.dmgTaken > 0 && <span className="text-sky-300" title={t.net_mvp_tanked}>🛡 {fmt(topTank.dmgTaken)} ({topTank.name.split(" ")[0]})</span>}
                {topHeal && topHeal.healed > 0 && <span className="text-emerald-300" title={t.net_mvp_healed}>✚ {fmt(topHeal.healed)}</span>}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Ranked LP outcome — what this game won/lost on the ladder. */}
      {rankResult && (() => {
        const before = rankOf(rankResult.prevRating);
        const after = rankOf(rankResult.rating);
        const moved = before.label !== after.label;
        const up = rankResult.rating > rankResult.prevRating;
        return (
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08]">
            <span className={`text-lg font-extrabold tabular-nums ${rankResult.delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {rankResult.delta >= 0 ? "+" : ""}{rankResult.delta} LP
            </span>
            <span className="flex items-center gap-1.5 text-xs">
              <span className="font-bold" style={{ color: after.color }}>{after.label}</span>
              <span className="text-slate-500 tabular-nums">{after.apex ? `${after.lp} LP` : `${after.lp}/${after.lpMax}`}</span>
              {moved && (
                <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${up ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>
                  {up ? t.net_rank_promoted : t.net_rank_demoted}
                </span>
              )}
            </span>
          </div>
        );
      })()}

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
                  <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                    <span>{Math.max(0, p.hp)} HP</span>
                    {doubleUp && p.teamId != null && <span className="px-1 rounded bg-emerald-900/50 border border-emerald-600/40 text-emerald-300 font-bold">{t.net_team_label} {p.teamId + 1}</span>}
                  </div>
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
          <span className="px-6 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700 text-slate-400 text-sm font-semibold">{t.net_waiting_host}</span>
        )}
        <button onClick={leave} className="px-6 py-2.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 border border-slate-700 text-slate-200 text-sm font-bold">{t.net_quit}</button>
      </div>
    </div>
  );
}
