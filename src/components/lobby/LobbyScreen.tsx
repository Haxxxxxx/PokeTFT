"use client";

import { useEffect } from "react";
import { useRoom } from "@/game/net/roomStore";
import { usePreLobby } from "@/game/store/preLobbyStore";
import { beginMatch } from "@/game/net/match";
import { LobbyCodeBadge } from "./LobbyCodeBadge";
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

  return (
    <div className="max-w-[1200px] mx-auto p-4 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="text-rose-500 text-xl">⬡</span>
          <div>
            <h1 className="font-extrabold tracking-tight text-slate-100">
              Poké<span className="text-amber-400">TFT</span>
              <span className="text-slate-500 font-normal text-sm ml-2">— Lobby</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">{t.l_net_players(players.length, maxPlayers)}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <LobbyCodeBadge />
          <button onClick={leave} className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-rose-900/60 border border-slate-700 text-xs font-bold text-slate-300">
            {t.l_net_leave}
          </button>
        </div>
      </div>

      <div className="flex gap-4 items-start">
        {/* Players */}
        <div className="flex-1 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            {players.map((p) => (
              <div
                key={p.uid}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                  p.ready ? "border-emerald-700/60 bg-emerald-950/20" : "border-slate-700 bg-slate-900/50"
                }`}
              >
                <div className={`w-9 h-9 rounded-lg border flex items-center justify-center text-sm font-extrabold ${p.isBot ? "bg-violet-950/50 border-violet-700 text-violet-300" : "bg-slate-800 border-slate-700 text-slate-300"}`}>
                  {p.isBot ? "AI" : p.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-100 truncate">{p.name}</span>
                    {p.isHost && <span className="text-[9px] font-bold uppercase bg-amber-500 text-black rounded px-1">{t.l_net_host}</span>}
                    {p.uid === myUid && <span className="text-[9px] font-bold uppercase bg-sky-600 text-white rounded px-1">{t.l_net_you}</span>}
                    {p.isBot && <span className="text-[9px] font-bold uppercase bg-violet-600 text-white rounded px-1">{t.l_net_bot}</span>}
                  </div>
                  <span className={`text-[11px] font-semibold ${p.ready ? "text-emerald-400" : "text-slate-500"}`}>
                    {p.isBot ? p.botDifficulty : p.ready ? t.l_net_ready_up : t.l_net_not_ready}
                  </span>
                </div>
                {isHost && p.isBot && (
                  <button onClick={() => removePlayer(p.uid)} title="Remove" className="text-slate-500 hover:text-rose-400 text-lg leading-none">×</button>
                )}
              </div>
            ))}
            {Array.from({ length: openSlots }).map((_, i) => (
              <div key={`open-${i}`} className="flex items-center gap-2 px-3 py-3 rounded-xl border border-dashed border-slate-800 bg-slate-900/20">
                {isHost && i === 0 ? (
                  <>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500 shrink-0">{t.l_net_add_ai}</span>
                    <div className="flex gap-1 ml-auto">
                      {(["easy", "medium", "hard"] as const).map((d) => (
                        <button
                          key={d}
                          onClick={() => addBot(d)}
                          className="px-2 py-1 rounded-md bg-violet-900/50 hover:bg-violet-800 border border-violet-700 text-[10px] font-bold text-violet-200 capitalize"
                        >
                          {d === "easy" ? t.p_diff_easy : d === "medium" ? t.p_diff_medium : t.p_diff_hard}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <span className="text-xs font-semibold text-slate-600">{t.l_net_open_slot}</span>
                )}
              </div>
            ))}
          </div>

          {/* Controls */}
          <div className="flex flex-col items-center gap-2 mt-2">
            {!isHost && (
              <button
                onClick={() => setReady(!me?.ready)}
                className={`w-full max-w-sm py-3 rounded-xl font-extrabold text-sm transition-all ${
                  me?.ready ? "bg-slate-700 hover:bg-slate-600 text-slate-200" : "bg-emerald-600 hover:bg-emerald-500 text-white"
                }`}
              >
                {me?.ready ? t.l_net_not_ready : t.l_net_ready_up}
              </button>
            )}
            {isHost && (
              <>
                <button
                  disabled={!canStart}
                  onClick={() => { beginMatch(room.code, room).catch((e) => console.error("[beginMatch]", e)); }}
                  className="w-full max-w-sm py-3 rounded-xl font-extrabold text-sm tracking-wide transition-all
                    bg-amber-500 hover:bg-amber-400 text-black
                    disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
                >
                  {t.l_net_start}
                </button>
                {!canStart && <p className="text-xs text-slate-600">{t.l_net_wait_ready}</p>}
              </>
            )}
          </div>
        </div>

        {/* Rules */}
        <div className="w-72 shrink-0 rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur p-4 overflow-y-auto max-h-[calc(100vh-160px)]">
          <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-4 border-b border-slate-800 pb-2">
            {t.l_rules}
          </h2>
          <GameRulesPanel isHost={isHost} />
        </div>
      </div>
    </div>
  );
}
