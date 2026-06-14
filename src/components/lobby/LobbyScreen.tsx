"use client";

import { useRoom } from "@/game/net/roomStore";
import { LobbyCodeBadge } from "./LobbyCodeBadge";

const HP_OPTIONS = [50, 75, 100, 125, 150, 200];

export function LobbyScreen() {
  const room = useRoom((s) => s.room);
  const myUid = useRoom((s) => s.myUid);
  const setReady = useRoom((s) => s.setReady);
  const setRules = useRoom((s) => s.setRules);
  const setMeta = useRoom((s) => s.setMeta);
  const leave = useRoom((s) => s.leave);

  if (!room) return null;

  const players = Object.values(room.players ?? {})
    .filter((p) => p.connected)
    .sort((a, b) => Number(b.isHost) - Number(a.isHost) || a.name.localeCompare(b.name));
  const me = myUid ? room.players?.[myUid] : undefined;
  const isHost = room.meta?.hostUid === myUid;
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
            <p className="text-xs text-slate-500 mt-0.5">{players.length} / {maxPlayers} joueurs · empty slots fill with AI</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <LobbyCodeBadge />
          <button onClick={leave} className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-rose-900/60 border border-slate-700 text-xs font-bold text-slate-300">
            Leave
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
                <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-extrabold text-slate-300">
                  {p.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-100 truncate">{p.name}</span>
                    {p.isHost && <span className="text-[9px] font-bold uppercase bg-amber-500 text-black rounded px-1">Host</span>}
                    {p.uid === myUid && <span className="text-[9px] font-bold uppercase bg-sky-600 text-white rounded px-1">You</span>}
                  </div>
                  <span className={`text-[11px] font-semibold ${p.ready ? "text-emerald-400" : "text-slate-500"}`}>
                    {p.ready ? "Ready" : "Not ready"}
                  </span>
                </div>
              </div>
            ))}
            {Array.from({ length: openSlots }).map((_, i) => (
              <div key={`open-${i}`} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-slate-800 bg-slate-900/20 text-slate-600">
                <div className="w-9 h-9 rounded-lg border border-dashed border-slate-700" />
                <span className="text-xs font-semibold">Open · AI</span>
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
                {me?.ready ? "Not ready" : "Ready up"}
              </button>
            )}
            {isHost && (
              <>
                <button
                  disabled={!canStart}
                  onClick={() => setMeta({ phase: "playing" })}
                  className="w-full max-w-sm py-3 rounded-xl font-extrabold text-sm tracking-wide transition-all
                    bg-amber-500 hover:bg-amber-400 text-black
                    disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
                >
                  ⚔ Start game
                </button>
                {!canStart && <p className="text-xs text-slate-600">Waiting for everyone to ready up.</p>}
              </>
            )}
          </div>
        </div>

        {/* Host settings */}
        <div className="w-72 shrink-0 rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur p-4 flex flex-col gap-5">
          <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 border-b border-slate-800 pb-2">
            Game settings {!isHost && <span className="text-slate-600">(host only)</span>}
          </h2>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Players</h3>
            <div className="flex flex-wrap gap-1.5">
              {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                <button
                  key={n}
                  disabled={!isHost || n < players.length}
                  onClick={() => setRules({ maxPlayers: n })}
                  className={`w-8 h-8 rounded-md border text-xs font-bold transition-all disabled:opacity-30 ${
                    maxPlayers === n ? "bg-amber-500 border-amber-400 text-black" : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Starting HP</h3>
            <div className="flex flex-wrap gap-1.5">
              {HP_OPTIONS.map((hp) => (
                <button
                  key={hp}
                  disabled={!isHost}
                  onClick={() => setRules({ startingHp: hp })}
                  className={`px-2.5 h-8 rounded-md border text-xs font-bold transition-all disabled:opacity-30 ${
                    (room.rules?.startingHp ?? 100) === hp ? "bg-amber-500 border-amber-400 text-black" : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  {hp}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
