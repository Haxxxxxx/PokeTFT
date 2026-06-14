"use client";

import { useState } from "react";
import { useAuth } from "@/game/net/authStore";
import { usernameValid } from "@/game/net/users";

export function UsernamePrompt() {
  const { saveUsername, signOut, error, busy } = useAuth();
  const [name, setName] = useState("");
  const valid = usernameValid(name.trim());

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-[380px] flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur p-8">
        <h1 className="font-extrabold text-xl text-slate-100">Pick a username</h1>
        <p className="text-xs text-slate-500">This is how friends find and add you. 3–16 letters, numbers or underscore.</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && valid) saveUsername(name); }}
          placeholder="username"
          maxLength={16}
          autoFocus
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-base font-semibold text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
        />
        <button onClick={() => saveUsername(name)} disabled={!valid || busy}
          className="w-full py-3 rounded-xl font-extrabold text-sm bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-40">
          {busy ? "…" : "Continue"}
        </button>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <button onClick={signOut} className="text-[11px] text-slate-500 hover:text-slate-300">Sign out</button>
      </div>
    </div>
  );
}
