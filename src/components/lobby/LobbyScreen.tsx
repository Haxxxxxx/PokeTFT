"use client";

import { useEffect, useState } from "react";
import { useRoom } from "@/game/net/roomStore";
import { usePreLobby } from "@/game/store/preLobbyStore";
import { beginMatch } from "@/game/net/match";
import { enterFullscreen } from "@/lib/fullscreen";
import { GameRulesPanel } from "./GameRulesPanel";
import { rosterForGenerations } from "@/game/data/mons";
import { useT } from "@/lib/i18n";

const GEN_NAMES = ["", "Kanto", "Johto", "Hoenn", "Sinnoh", "Unova", "Kalos", "Alola", "Galar", "Paldea"];

export function LobbyScreen() {
  const t = useT();
  const room = useRoom((s) => s.room);
  const myUid = useRoom((s) => s.myUid);
  const setReady = useRoom((s) => s.setReady);
  const setRules = useRoom((s) => s.setRules);
  const addBot = useRoom((s) => s.addBot);
  const removePlayer = useRoom((s) => s.removePlayer);
  const leave = useRoom((s) => s.leave);
  const publishLobby = useRoom((s) => s.publishLobby);
  const removeLobby = useRoom((s) => s.removeLobby);
  const preRules = usePreLobby((s) => s.rules);
  const setPreRules = usePreLobby((s) => s.setRules);
  const [copied, setCopied] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const isHost = room?.meta?.hostUid === myUid;

  // Host: keep the game-browser listing's player count fresh, and delist when the
  // lobby closes (game starts → unmount, or host leaves).
  const lobbyCount = room ? Object.values(room.players ?? {}).filter((p) => p.connected).length : 0;
  useEffect(() => { if (isHost) publishLobby(lobbyCount); }, [isHost, lobbyCount, publishLobby]);
  useEffect(() => () => { if (isHost) removeLobby(); }, [isHost, removeLobby]);

  useEffect(() => {
    if (!room || !isHost) return;
    setRules({ startingHp: preRules.startingHp, generations: preRules.generations, itemsEnabled: preRules.itemsEnabled });
  }, [isHost, room, setRules, preRules.startingHp, preRules.generations, preRules.itemsEnabled]);

  const roomGenKey = (room?.rules?.generations ?? [1]).join(",");
  const roomItemKey = (room?.rules?.itemsEnabled ?? []).join(",");
  const roomHp = room?.rules?.startingHp;
  useEffect(() => {
    if (!room || isHost) return;
    setPreRules({
      startingHp: room.rules?.startingHp ?? 100,
      generations: room.rules?.generations ?? [1],
      itemsEnabled: room.rules?.itemsEnabled ?? [],
    });
  }, [isHost, room, setPreRules, roomHp, roomGenKey, roomItemKey]);

  if (!room) return null;

  const players = Object.values(room.players ?? {})
    .filter((p) => p.connected)
    .sort((a, b) => Number(b.isHost) - Number(a.isHost) || a.name.localeCompare(b.name));
  const me = myUid ? room.players?.[myUid] : undefined;
  const maxPlayers = room.rules?.maxPlayers ?? 8;
  const openSlots = Math.max(0, maxPlayers - players.length);
  const allReady = players.every((p) => p.ready);
  const canStart = isHost && players.length >= 1 && allReady;

  const gens = room.rules?.generations ?? [1];
  const poolCount = rosterForGenerations(gens).length;
  const items = room.rules?.itemsEnabled ?? [];

  const copyCode = () => navigator.clipboard?.writeText(room.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});

  const Portrait = ({ name, photo, ready, isBot }: { name?: string; photo?: string | null; ready?: boolean; isBot?: boolean }) => (
    <div className={`w-16 h-16 rounded-2xl border-2 flex items-center justify-center text-xl font-extrabold overflow-hidden shrink-0 transition-all ${isBot ? "bg-violet-950/50 border-violet-600 text-violet-300" : ready ? "bg-slate-800 border-emerald-500/70 shadow-[0_0_18px_-4px_rgba(16,185,129,0.7)] text-emerald-200" : "bg-slate-800 border-slate-600 text-slate-300"}`}>
      {isBot ? "AI" : photo
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={photo} alt="" width={56} height={56} style={{ imageRendering: "pixelated" }} />
        : (name || "?").slice(0, 1).toUpperCase()}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "radial-gradient(120% 80% at 50% -10%, #1a2540 0%, #0a1020 60%)" }}>
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 h-16 border-b border-slate-800/80 bg-slate-950/40 backdrop-blur shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-rose-500 text-2xl shrink-0">⬡</span>
          <div className="min-w-0">
            <h1 className="font-extrabold tracking-tight text-base sm:text-lg text-slate-100 truncate">Poké<span className="text-amber-400">TFT</span><span className="text-slate-500 font-normal text-sm ml-2 hidden sm:inline">— {t.l_lobby}</span></h1>
            <p className="text-[11px] text-slate-500 -mt-0.5 truncate">{t.l_net_players(players.length, maxPlayers)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button onClick={copyCode} className="group flex items-center gap-2 sm:gap-3 pl-3 pr-2 sm:pr-3 py-1.5 rounded-xl bg-slate-900/70 border border-slate-700 hover:border-amber-500/60 transition-colors">
            <span className="flex flex-col items-start leading-none">
              <span className="text-[8px] sm:text-[9px] uppercase tracking-widest text-slate-500">{t.l_code}</span>
              <span className="font-mono font-extrabold text-base sm:text-lg text-amber-400 tracking-[0.15em] sm:tracking-[0.25em]">{room.code}</span>
            </span>
            <span className="text-[10px] font-bold px-1.5 sm:px-2 py-1 rounded-md bg-slate-800 text-slate-300 group-hover:bg-amber-500 group-hover:text-black transition-colors">{copied ? "✓" : t.l_copy}</span>
          </button>
          <button onClick={leave} className="px-2.5 sm:px-3 py-2 rounded-lg bg-slate-800 hover:bg-rose-900/60 border border-slate-700 text-xs font-bold text-slate-300">{t.l_net_leave}</button>
        </div>
      </header>

      {/* Party stage */}
      <main className="flex-1 flex flex-col items-center justify-center gap-7 p-4 sm:p-8 overflow-y-auto">
        <div className="w-full max-w-[860px] rounded-3xl border border-slate-800 bg-slate-900/40 backdrop-blur p-5 sm:p-7"
          style={{ background: "radial-gradient(70% 100% at 50% 0%, rgba(251,191,36,0.05), transparent 60%), rgba(15,23,42,0.4)" }}>
          <h2 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-4 text-center">{t.l_net_players(players.length, maxPlayers)}</h2>
          {/* Party portrait row (wraps responsively) */}
          <div className="flex flex-wrap items-start justify-center gap-3 sm:gap-4">
            {players.map((p) => (
              <div key={p.uid} className="relative flex flex-col items-center gap-1.5 w-20">
                {isHost && p.isBot && <button onClick={() => removePlayer(p.uid)} className="absolute -top-1.5 -right-0.5 z-10 w-5 h-5 rounded-full bg-slate-800 border border-slate-600 text-slate-400 hover:text-rose-400 text-xs leading-none">×</button>}
                <Portrait name={p.name} photo={p.photoURL} ready={p.ready} isBot={p.isBot} />
                <span className="text-xs font-bold text-slate-200 truncate max-w-full text-center">{p.name}</span>
                <div className="flex flex-wrap gap-0.5 justify-center">
                  {p.isHost && <span className="text-[8px] font-bold uppercase bg-amber-500 text-black rounded px-1 leading-tight">{t.l_net_host}</span>}
                  {p.uid === myUid && <span className="text-[8px] font-bold uppercase bg-sky-600 text-white rounded px-1 leading-tight">{t.l_net_you}</span>}
                </div>
                <span className={`text-[10px] font-semibold ${p.ready ? "text-emerald-400" : "text-slate-500"}`}>{p.isBot ? p.botDifficulty : p.ready ? t.l_net_ready_up : t.l_net_not_ready}</span>
              </div>
            ))}
            {Array.from({ length: openSlots }).map((_, i) => (
              <div key={`o-${i}`} className="flex flex-col items-center gap-1.5 w-20">
                <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-slate-700/70 flex items-center justify-center text-slate-700 text-2xl">+</div>
                <span className="text-[10px] text-slate-600">{t.l_net_open_slot}</span>
              </div>
            ))}
          </div>

          {/* Host: add AI */}
          {isHost && openSlots > 0 && (
            <div className="flex items-center justify-center gap-2 mt-5 pt-4 border-t border-slate-800">
              <span className="text-[10px] uppercase tracking-wide text-slate-500">{t.l_net_add_ai}</span>
              {(["easy", "medium", "hard"] as const).map((d) => (
                <button key={d} onClick={() => addBot(d)} className="px-3 py-1.5 rounded-md bg-violet-900/50 hover:bg-violet-700 border border-violet-700 text-[11px] font-bold text-violet-200 capitalize transition-colors">
                  {d === "easy" ? t.p_diff_easy : d === "medium" ? t.p_diff_medium : t.p_diff_hard}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Settings summary */}
        <div className="w-full max-w-[860px] flex flex-wrap items-center justify-center gap-2">
          {[
            `${gens.map((g) => GEN_NAMES[g] ?? `Gen ${g}`).join(", ")}`,
            `${poolCount} Pokémon`,
            `${room.rules?.startingHp ?? 100} ${t.net_hp}`,
            `${items.length} ${t.l_items_short}`,
          ].map((chip, i) => (
            <span key={i} className="px-3 py-1.5 rounded-lg bg-slate-900/70 border border-slate-700/60 text-[11px] font-semibold text-slate-300">{chip}</span>
          ))}
          {isHost && (
            <button onClick={() => setShowRules(true)} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[11px] font-bold text-sky-300">⚙ {t.l_rules}</button>
          )}
        </div>

        {/* Start / ready */}
        {!isHost ? (
          <button onClick={() => setReady(!me?.ready)}
            className={`w-full max-w-md py-4 rounded-2xl font-extrabold text-base tracking-wide transition-all ${me?.ready ? "bg-slate-700 hover:bg-slate-600 text-slate-200" : "bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 text-white shadow-lg shadow-emerald-500/20"}`}>
            {me?.ready ? t.l_net_not_ready : t.l_net_ready_up}
          </button>
        ) : (
          <div className="w-full max-w-md flex flex-col items-center gap-2">
            <button disabled={!canStart} onClick={() => { enterFullscreen(); beginMatch(room.code, room).catch((e) => console.error("[beginMatch]", e)); }}
              className="w-full py-4 rounded-2xl font-extrabold text-base tracking-wide transition-all bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black shadow-lg shadow-amber-500/20 disabled:opacity-30 disabled:shadow-none disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500">
              {t.l_net_start}
            </button>
            {!canStart && <p className="text-xs text-slate-600">{t.l_net_wait_ready}</p>}
          </div>
        )}
      </main>

      {/* Rules modal (host) */}
      {showRules && isHost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={() => setShowRules(false)}>
          <div className="gilded gilded-strong w-full max-w-[460px] max-h-[85vh] overflow-y-auto rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--panel-edge)]">
              <h2 className="text-sm font-extrabold uppercase tracking-[0.18em] gild-text">{t.l_rules}</h2>
              <button onClick={() => setShowRules(false)} className="text-slate-500 hover:text-amber-300 text-xl leading-none">×</button>
            </div>
            <GameRulesPanel isHost={isHost} />
          </div>
        </div>
      )}
    </div>
  );
}
