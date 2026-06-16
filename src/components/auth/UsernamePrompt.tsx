"use client";

import { useState } from "react";
import { useAuth } from "@/game/net/authStore";
import { usernameValid } from "@/game/net/users";
import { AuthShell } from "./AuthShell";

export function UsernamePrompt() {
  const { saveUsername, signOut, error, busy } = useAuth();
  const [name, setName] = useState("");
  const valid = usernameValid(name.trim());

  return (
    <AuthShell subtitle="Pick a username — this is how friends find and add you.">
      <div className="flex flex-col gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && valid) saveUsername(name); }}
          placeholder="username"
          maxLength={16}
          autoFocus
          className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-3.5 text-center text-lg font-bold tracking-wide text-amber-300 placeholder:text-slate-600 placeholder:font-normal placeholder:tracking-normal focus:outline-none focus:border-amber-500/80 focus:ring-2 focus:ring-amber-500/20 transition-all"
        />
        <p className="text-[11px] text-slate-500 text-center">3–16 letters, numbers or underscore.</p>
        <button onClick={() => saveUsername(name)} disabled={!valid || busy}
          className="w-full py-3 rounded-xl font-extrabold text-sm bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black shadow-lg shadow-amber-500/20 disabled:opacity-40 disabled:shadow-none transition-all">
          {busy ? "…" : "Continue"}
        </button>
        {error && <p className="text-xs text-rose-400 text-center">{error}</p>}
        <button onClick={signOut} className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors text-center">Sign out</button>
      </div>
    </AuthShell>
  );
}
