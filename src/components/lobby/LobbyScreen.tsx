"use client";

import { useEffect } from "react";
import { usePreLobby } from "@/game/store/preLobbyStore";
import { PlayerSlot } from "./PlayerSlot";
import { LobbyCodeBadge } from "./LobbyCodeBadge";
import { GameRulesPanel } from "./GameRulesPanel";

export function LobbyScreen() {
  const slots = usePreLobby((s) => s.slots);
  const rules = usePreLobby((s) => s.rules);
  const setRules = usePreLobby((s) => s.setRules);
  const isHost = usePreLobby((s) => s.isHost);
  const readyToStart = usePreLobby((s) => s.readyToStart);
  const startGame = usePreLobby((s) => s.startGame);
  const phase = usePreLobby((s) => s.phase);
  const generateCode = usePreLobby((s) => s.generateCode);

  // Randomise the lobby code on the client only (avoids an SSR hydration mismatch).
  useEffect(() => {
    if (usePreLobby.getState().lobbyCode === "------") generateCode();
  }, [generateCode]);

  const active = slots.filter((s) => s.type !== "empty");
  const canStart = readyToStart();

  if (phase === "starting") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-10 h-10 rounded-full border-4 border-amber-500 border-t-transparent animate-spin" />
        <p className="text-slate-400 text-sm font-semibold">Démarrage de la partie…</p>
      </div>
    );
  }

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
            <p className="text-xs text-slate-500 mt-0.5">
              {active.length} / {rules.maxPlayers} joueur{active.length > 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <LobbyCodeBadge />
      </div>

      {/* Body */}
      <div className="flex gap-4 items-start">
        {/* Players (left) */}
        <div className="flex-1 flex flex-col gap-4">
          {/* Max player selector */}
          {isHost && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-800 bg-slate-900/40">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest shrink-0">Slots</span>
              <div className="flex gap-1.5 ml-auto">
                {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRules({ maxPlayers: n })}
                    className={`w-7 h-7 rounded-md border text-xs font-bold transition-all ${
                      rules.maxPlayers === n
                        ? "bg-amber-500 border-amber-400 text-black"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Slot grid */}
          <div className="grid grid-cols-2 gap-3">
            {slots.slice(0, rules.maxPlayers).map((slot, i) => (
              <PlayerSlot key={slot.id} slot={slot} index={i} isHost={isHost} />
            ))}
          </div>

          {/* Start button */}
          <div className="flex flex-col items-center gap-2 mt-2">
            <button
              disabled={!canStart}
              onClick={startGame}
              className="w-full max-w-sm py-3 rounded-xl font-extrabold text-sm tracking-wide transition-all
                bg-amber-500 hover:bg-amber-400 text-black
                disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
            >
              ⚔ Lancer la partie
            </button>
            {!canStart && (
              <p className="text-xs text-slate-600">
                {active.length < 2
                  ? "Il faut au moins 2 joueurs."
                  : "Attente que tous les joueurs soient prêts."}
              </p>
            )}
          </div>
        </div>

        {/* Rules panel (right) */}
        <div className="w-72 shrink-0 rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur p-4 overflow-y-auto max-h-[calc(100vh-160px)]">
          <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-4 border-b border-slate-800 pb-2">
            Règles de partie
          </h2>
          <GameRulesPanel isHost={isHost} />
        </div>
      </div>
    </div>
  );
}
