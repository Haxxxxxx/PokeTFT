"use client";

import { useState } from "react";
import { GoogleAuthProvider, signInWithPopup, type UserCredential } from "firebase/auth";
import { auth } from "@/game/net/firebase";

/**
 * Native sign-in bridge — opened in the user's DEFAULT browser by the app shell.
 *
 * Deliberately click-driven at every step, never automatic — two real-world failure
 * modes forced this:
 *
 * 1. `signInWithRedirect` + `getRedirectResult` round-trips through Firebase's
 *    authDomain and depends on browser storage surviving that hop. In practice this
 *    was flaky (Brave/Safari/strict cookie settings): sometimes `getRedirectResult`
 *    silently returned nothing on return, forcing a second sign-in attempt. A popup
 *    fired directly from a click has no such round trip — it gets the credential in
 *    one shot, reliably.
 * 2. Browsers only honor a `location.href = "poketft://…"` (or an `<a>` click fired
 *    programmatically) navigation to an unfamiliar custom scheme when it's tied to a
 *    FRESH, direct user gesture — one that happened inside an `await`/promise chain
 *    (e.g. right after `getRedirectResult` resolves) can fall outside that window and
 *    gets silently dropped: no dialog, no error, the browser just doesn't hand off.
 *    A real `<a href="poketft://…">` the user clicks themselves is a fresh gesture
 *    every time, which is the only way this reliably launches the app.
 */
function handoff(result: UserCredential): string | null {
  const cred = GoogleAuthProvider.credentialFromResult(result);
  if (!cred?.idToken) return null;
  const p = new URLSearchParams();
  p.set("id_token", cred.idToken);
  if (cred.accessToken) p.set("access_token", cred.accessToken);
  return `poketft://auth-callback?${p.toString()}`;
}

export default function NativeAuthBridge() {
  const [returnLink, setReturnLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goSignIn = async () => {
    setError(null); setBusy(true);
    try {
      const result = await signInWithPopup(auth(), new GoogleAuthProvider());
      const link = handoff(result);
      if (!link) throw new Error("No Google credential was returned.");
      setReturnLink(link);
    } catch (e) {
      setError((e as Error)?.message ?? "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const wrap = { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0e1a", color: "#e2e8f0", fontFamily: "system-ui, -apple-system, sans-serif", padding: 24 } as const;
  const card = { display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center", maxWidth: 360, width: "100%", padding: "40px 32px", borderRadius: 20, background: "rgba(15,23,42,0.55)", border: "1px solid rgba(251,191,36,0.14)", boxShadow: "0 30px 80px -30px rgba(0,0,0,0.8)" } as const;
  const btn = { padding: "13px 26px", borderRadius: 12, background: "linear-gradient(180deg,#fbbf24,#f59e0b)", color: "#0a0e1a", fontWeight: 800, fontSize: 15, border: "none", cursor: "pointer", boxShadow: "0 8px 24px -8px rgba(251,191,36,0.5)", textDecoration: "none", display: "inline-block" } as const;

  return (
    <main style={wrap}>
      <div style={card}>
        {/* Pokéball */}
        <div style={{ position: "relative", width: 56, height: 56 }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "linear-gradient(#ef4444 0 50%, #f8fafc 50% 100%)", border: "3px solid #0a0e1a", boxShadow: "0 6px 18px -6px rgba(239,68,68,0.6)" }} />
          <div style={{ position: "absolute", top: "calc(50% - 2px)", left: 0, right: 0, height: 4, background: "#0a0e1a" }} />
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 18, height: 18, borderRadius: "50%", background: "#f8fafc", border: "3px solid #0a0e1a" }} />
        </div>

        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em" }}>
            Poké<span style={{ background: "linear-gradient(180deg,#fde68a,#d4af37)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>TFT</span>
          </div>
          <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 4 }}>
            {returnLink ? "Signed in — one more click" : "Sign in to link this to the app"}
          </div>
        </div>

        {!returnLink && (
          <button style={{ ...btn, opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }} onClick={goSignIn} disabled={busy}>
            {busy ? "Opening Google…" : "Continue with Google"}
          </button>
        )}

        {returnLink && (
          <>
            <div style={{ fontSize: 12.5, color: "#94a3b8", lineHeight: 1.5 }}>
              Tap below to jump back into PokéTFT — your browser won&apos;t hand off
              automatically, this click is what does it.
            </div>
            {/* A real, user-clicked <a href> — NOT a script-triggered navigation — is
                what reliably gets browsers to honor the poketft:// scheme handoff. */}
            <a href={returnLink} style={btn}>Open PokéTFT</a>
          </>
        )}

        {error && <div style={{ fontSize: 12.5, color: "#fca5a5", lineHeight: 1.5 }}>{error}</div>}
      </div>
    </main>
  );
}
