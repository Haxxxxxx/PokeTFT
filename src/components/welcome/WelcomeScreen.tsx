"use client";

import { useState } from "react";
import { usePreLobby } from "@/game/store/preLobbyStore";
import { AppSettingsPanel } from "./AppSettingsPanel";

type Mode = "idle" | "create" | "join";

export function WelcomeScreen() {
  const enterLobby = usePreLobby((s) => s.enterLobby);
  const [username, setUsername] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState(false);

  const trimmed = username.trim();
  const canProceed = trimmed.length > 0;

  function handleCreate() {
    if (!canProceed) return;
    enterLobby(trimmed, true);
  }

  function handleJoin() {
    if (!canProceed || joinCode.trim().length < 6) {
      setJoinError(true);
      return;
    }
    setJoinError(false);
    enterLobby(trimmed, false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-[900px] flex gap-6 items-start">
        {/* Main card */}
        <div className="flex-1 flex flex-col gap-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur p-8">
          {/* Title */}
          <div className="flex flex-col items-center gap-1 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-rose-500 text-3xl">⬡</span>
            </div>
            <h1 className="font-extrabold tracking-tight text-3xl text-slate-100">
              Poké<span className="text-amber-400">TFT</span>
            </h1>
            <p className="text-slate-500 text-sm">Teamfight Tactics — édition Pokémon</p>
          </div>

          {/* Username */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
              Ton pseudo
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && mode === "idle") setMode("create"); }}
              placeholder="Choisis un pseudo…"
              maxLength={24}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-base font-semibold text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          {/* Mode buttons */}
          {mode === "idle" && (
            <div className="flex gap-3">
              <button
                onClick={() => setMode("create")}
                disabled={!canProceed}
                className="flex-1 py-3 rounded-xl font-extrabold text-sm border transition-all
                  bg-amber-500 hover:bg-amber-400 text-black border-amber-400
                  disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500 disabled:border-slate-700"
              >
                ⚔ Créer une partie
              </button>
              <button
                onClick={() => setMode("join")}
                disabled={!canProceed}
                className="flex-1 py-3 rounded-xl font-extrabold text-sm border transition-all
                  bg-sky-900/60 hover:bg-sky-800/80 text-sky-300 border-sky-700
                  disabled:opacity-30 disabled:cursor-not-allowed"
              >
                🔗 Rejoindre
              </button>
            </div>
          )}

          {mode === "create" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-slate-400">
                Tu seras l&apos;hôte de la partie. Les autres joueurs pourront rejoindre avec le code du lobby.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleCreate}
                  className="flex-1 py-3 rounded-xl font-extrabold text-sm bg-amber-500 hover:bg-amber-400 text-black border border-amber-400 transition-all"
                >
                  ⚔ Créer
                </button>
                <button
                  onClick={() => setMode("idle")}
                  className="px-4 py-3 rounded-xl font-bold text-sm bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition-all"
                >
                  Retour
                </button>
              </div>
            </div>
          )}

          {mode === "join" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
                  Code du lobby
                </label>
                <input
                  value={joinCode}
                  onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
                  placeholder="Ex: AB3X7K"
                  maxLength={6}
                  className={`w-full bg-slate-800 border rounded-xl px-4 py-3 text-base font-mono font-bold text-amber-400 tracking-widest placeholder:text-slate-600 focus:outline-none transition-colors ${
                    joinError ? "border-rose-600" : "border-slate-700 focus:border-sky-500"
                  }`}
                />
                {joinError && (
                  <p className="text-xs text-rose-400">Code invalide — 6 caractères requis.</p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleJoin}
                  disabled={!canProceed}
                  className="flex-1 py-3 rounded-xl font-extrabold text-sm bg-sky-600 hover:bg-sky-500 text-white border border-sky-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  🔗 Rejoindre
                </button>
                <button
                  onClick={() => { setMode("idle"); setJoinCode(""); setJoinError(false); }}
                  className="px-4 py-3 rounded-xl font-bold text-sm bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition-all"
                >
                  Retour
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Settings card */}
        <div className="w-64 shrink-0 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur p-6">
          <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-4 border-b border-slate-800 pb-2">
            Paramètres généraux
          </h2>
          <AppSettingsPanel />
        </div>
      </div>
    </div>
  );
}
