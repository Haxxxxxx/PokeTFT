"use client";

import { useState } from "react";
import { usePreLobby } from "@/game/store/preLobbyStore";

export function LobbyCodeBadge() {
  const code = usePreLobby((s) => s.lobbyCode);
  const generateCode = usePreLobby((s) => s.generateCode);
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Code Lobby</span>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-2xl font-extrabold tracking-[0.25em] text-amber-400 select-all">
            {code}
          </span>
          <button
            onClick={copy}
            title="Copier le code"
            className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-300 transition-colors"
          >
            {copied ? "✓ Copié" : "Copier"}
          </button>
          <button
            onClick={generateCode}
            title="Nouveau code"
            className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-400 transition-colors"
          >
            ↺
          </button>
        </div>
      </div>
    </div>
  );
}
