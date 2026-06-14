"use client";

import { useEffect, useState } from "react";
import { useRoom } from "@/game/net/roomStore";
import { usePreLobby } from "@/game/store/preLobbyStore";
import { beginMatch } from "@/game/net/match";
import { GameRulesPanel } from "./GameRulesPanel";
import { useT } from "@/lib/i18n";

export function LobbyScreen() {
  const t = useT();
  const room = useRoom((s) => s.room);
  const myUid = useRoom((s) => s.myUid);
  const setReady = useRoom((s) => s.setReady);
  const setRules = useRoom((s) => s.setRules);
  const addBot = useRoom((s) => s.addBot);
  const removePlayer = useRoom((s) => s.removePlayer);
  const leave = useRoom((s) => s.leave);
  const preRules = usePreLobby((s) => s.rules);
  const setPreRules = usePreLobby((s) => s.setRules);
  const [copied, setCopied] = useState(false);

  const isHost = room?.meta?.hostUid === myUid;

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

  const copyCode = () => {
    navigator.clipboard?.writeText(room.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "radial-gradient(120% 80% at 50% -10%, #1a2540 0%, #0a1020 60%)" }}>
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 h-16 border-b border-slate-800/80 bg-slate-950/40 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-rose-500 text-2xl">⬡</span>
          <div>
            <h1 className="font-extrabold tracking-tight text-lg text-slate-100">Poké<span className="text-amber-400">TFT</span><span className="text-slate-500 font-normal text-sm ml-2">— {t.l_lobby}</span></h1>
            <p className="text-[11px] text-slate-500 -mt-0.5">{t.l_net_players(players.length, maxPlayers)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={copyCode} className="group flex items-center gap-3 pl-4 pr-3 py-1.5 rounded-xl bg-slate-900/70 border border-slate-700 hover:border-amber-500/60 transition-colors" title={room.code}>
            <span className="flex flex-col items-start leading-none">
              <span className="text-[9px] uppercase tracking-widest text-slate-500">{t.l_code}</span>
              <span className="font-mono font-extrabold text-lg text-amber-400 tracking-[0.25em]">{room.code}</span>
            </span>
            <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-slate-800 text-slate-300 group-hover:bg-amber-500 group-hover:text-black transition-colors">{copied ? "✓" : t.l_copy}</span>
          </button>
          <button onClick={leave} className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-rose-900/60 border border-slate-700 text-xs font-bold text-slate-300">{t.l_net_leave}</button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 w-full max-w-[1320px] mx-auto flex gap-6 p-6 items-start">
        {/* Players + start */}
        <main className="flex-1 flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3">
            {players.map((p) => (
              <div key={p.uid} className={`relative flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all ${p.ready ? "border-emerald-600/50 bg-emerald-950/20 shadow-[0_0_20px_-8px_rgba(16,185,129,0.5)]" : "border-slate-700/70 bg-slate-900/50"}`}>
                <div className={`w-11 h-11 rounded-xl border-2 flex items-center justify-center text-base font-extrabold shrink-0 ${p.isBot ? "bg-violet-950/50 border-violet-600 text-violet-300" : p.ready ? "bg-slate-800 border-emerald-500/60 text-emerald-200" : "bg-slate-800 border-slate-600 text-slate-300"}`}>
                  {p.isBot ? "AI" : p.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-slate-100 truncate">{p.name}</span>
                    {p.isHost && <span className="text-[9px] font-bold uppercase bg-amber-500 text-black rounded px-1 leading-tight">{t.l_net_host}</span>}
                    {p.uid === myUid && <span className="text-[9px] font-bold uppercase bg-sky-600 text-white rounded px-1 leading-tight">{t.l_net_you}</span>}
                    {p.isBot && <span className="text-[9px] font-bold uppercase bg-violet-600 text-white rounded px-1 leading-tight">{t.l_net_bot}</span>}
                  </div>
                  <span className={`text-[11px] font-semibold flex items-center gap-1.5 ${p.ready ? "text-emerald-400" : "text-slate-500"}`}>
                    {!p.isBot && <span className={`w-1.5 h-1.5 rounded-full ${p.ready ? "bg-emerald-400" : "bg-slate-600"}`} />}
                    {p.isBot ? p.botDifficulty : p.ready ? t.l_net_ready_up : t.l_net_not_ready}
                  </span>
                </div>
                {isHost && p.isBot && (
                  <button onClick={() => removePlayer(p.uid)} title="Remove" className="text-slate-500 hover:text-rose-400 text-xl leading-none shrink-0">×</button>
                )}
              </div>
            ))}
            {Array.from({ length: openSlots }).map((_, i) => (
              <div key={`open-${i}`} className="flex items-center gap-2 px-4 py-3.5 rounded-xl border border-dashed border-slate-800 bg-slate-900/20">
                {isHost && i === 0 ? (
                  <>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500 shrink-0">{t.l_net_add_ai}</span>
                    <div className="flex gap-1 ml-auto">
                      {(["easy", "medium", "hard"] as const).map((d) => (
                        <button key={d} onClick={() => addBot(d)}
                          className="px-2.5 py-1.5 rounded-md bg-violet-900/50 hover:bg-violet-700 border border-violet-700 text-[10px] font-bold text-violet-200 capitalize transition-colors">
                          {d === "easy" ? t.p_diff_easy : d === "medium" ? t.p_diff_medium : t.p_diff_hard}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <span className="text-xs font-semibold text-slate-600 flex items-center gap-2"><span className="w-2 h-2 rounded-full border border-slate-700" />{t.l_net_open_slot}</span>
                )}
              </div>
            ))}
          </div>

          {/* Start / ready */}
          <div className="flex flex-col items-center gap-2 mt-1">
            {!isHost && (
              <button onClick={() => setReady(!me?.ready)}
                className={`w-full max-w-md py-4 rounded-2xl font-extrabold text-base tracking-wide transition-all ${me?.ready ? "bg-slate-700 hover:bg-slate-600 text-slate-200" : "bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 text-white shadow-lg shadow-emerald-500/20"}`}>
                {me?.ready ? t.l_net_not_ready : t.l_net_ready_up}
              </button>
            )}
            {isHost && (
              <>
                <button disabled={!canStart} onClick={() => { beginMatch(room.code, room).catch((e) => console.error("[beginMatch]", e)); }}
                  className="w-full max-w-md py-4 rounded-2xl font-extrabold text-base tracking-wide transition-all bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black shadow-lg shadow-amber-500/20 disabled:opacity-30 disabled:shadow-none disabled:bg-slate-700 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500">
                  {t.l_net_start}
                </button>
                {!canStart && <p className="text-xs text-slate-600">{t.l_net_wait_ready}</p>}
              </>
            )}
          </div>
        </main>

        {/* Rules rail */}
        <aside className="w-80 shrink-0 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur p-5 overflow-y-auto max-h-[calc(100vh-130px)]">
          <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-4 border-b border-slate-800 pb-2">{t.l_rules}</h2>
          <GameRulesPanel isHost={isHost} />
        </aside>
      </div>
    </div>
  );
}
