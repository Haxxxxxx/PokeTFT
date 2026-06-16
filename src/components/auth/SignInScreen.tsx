"use client";

import { useState } from "react";
import { useAuth } from "@/game/net/authStore";
import { AuthShell } from "./AuthShell";

export function SignInScreen() {
  const { signInGoogle, signInEmail, signUpEmail, error, busy } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  const submit = () => {
    if (!email.trim() || pw.length < 6) return;
    if (mode === "signin") signInEmail(email, pw);
    else signUpEmail(email, pw);
  };

  const inputCls = "w-full bg-white/[0.03] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 transition-colors";

  return (
    <AuthShell subtitle="Sign in to play with friends">
      <button
        onClick={signInGoogle}
        disabled={busy}
        className="flex items-center justify-center gap-2.5 w-full py-2.5 rounded-lg font-semibold text-[13px] bg-white/95 text-slate-800 hover:bg-white disabled:opacity-50 transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.7 1.22 9.2 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        Continue with Google
      </button>

      <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-slate-600"><span className="flex-1 h-px bg-slate-800" />or<span className="flex-1 h-px bg-slate-800" /></div>

      <div className="flex flex-col gap-2.5">
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" className={inputCls} />
        <input value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} type="password" placeholder="Password (6+ chars)" className={inputCls} />
        <button onClick={submit} disabled={busy || !email.trim() || pw.length < 6}
          className="w-full py-2.5 rounded-lg font-bold text-[13px] bg-amber-500/90 hover:bg-amber-400 text-black disabled:opacity-40 transition-colors">
          {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
        <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="text-[11px] text-sky-400 hover:text-sky-300 transition-colors">
          {mode === "signin" ? "No account? Create one" : "Already have an account? Sign in"}
        </button>
      </div>

      {error && <p className="text-xs text-rose-400 text-center">{error}</p>}
    </AuthShell>
  );
}
