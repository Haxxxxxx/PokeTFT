"use client";

import { useState } from "react";
import { useAuth } from "@/game/net/authStore";
import { usernameValid } from "@/game/net/users";
import { useT } from "@/lib/i18n";
import { AuthShell } from "./AuthShell";

export function UsernamePrompt() {
  const t = useT();
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
          className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-4 py-3 text-center text-base font-bold tracking-wide text-amber-300 placeholder:text-slate-600 placeholder:font-normal placeholder:tracking-normal focus:outline-none focus:border-amber-500/50 transition-colors"
        />
        <p className="text-[11px] text-slate-500 text-center">{t.a_username_rule}</p>
        <button onClick={() => saveUsername(name)} disabled={!valid || busy}
          className="w-full py-2.5 rounded-lg font-bold text-[13px] bg-amber-500/90 hover:bg-amber-400 text-black disabled:opacity-40 transition-colors">
          {busy ? "…" : t.a_continue}
        </button>
        {error && <p className="text-xs text-rose-400 text-center">{error}</p>}
        <button onClick={signOut} className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors text-center">{t.a_signout}</button>
      </div>
    </AuthShell>
  );
}
