"use client";

import { useEffect, useState } from "react";
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, type UserCredential } from "firebase/auth";
import { auth } from "@/game/net/firebase";

/**
 * Native sign-in bridge — opened in the user's DEFAULT browser by the app shell.
 * Auto-fires signInWithRedirect on landing (no button) so the user goes straight
 * to Google. On return, hands the credential to the app's loopback (127.0.0.1:cb).
 * If the redirect-return can't read the result (cross-domain storage), falls back
 * to a one-tap popup so it never dead-ends.
 */
function cbPort(): string | null {
  const raw = new URLSearchParams(window.location.search).get("cb");
  if (!raw) return null;
  const port = parseInt(raw, 10);
  if (isNaN(port) || port < 1024 || port > 65535) return null;
  return String(port);
}
function handoff(cb: string, result: UserCredential): boolean {
  const cred = GoogleAuthProvider.credentialFromResult(result);
  if (!cred?.idToken) return false;
  const p = new URLSearchParams();
  p.set("id_token", cred.idToken);
  if (cred.accessToken) p.set("access_token", cred.accessToken);
  window.location.href = `http://127.0.0.1:${cb}/?${p.toString()}`;
  return true;
}

const ATTEMPT_KEY = "poketft_auth_redirected";

export default function NativeAuthBridge() {
  const [needsButton, setNeedsButton] = useState(false);
  const [status, setStatus] = useState("Connecting to Google…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const cb = cbPort();
      if (!cb) { setError("Missing app callback port — reopen sign-in from the app."); setStatus(""); return; }
      // Returning from Google?
      try {
        const result = await getRedirectResult(auth());
        if (result) {
          sessionStorage.removeItem(ATTEMPT_KEY);
          setStatus("Signing you into PokéTFT…");
          if (handoff(cb, result)) return;
        }
      } catch { /* storage blocked — fall through to the popup fallback */ }

      // We've already redirected once and came back with nothing → the redirect
      // return is blocked. Offer the popup (captures the credential in-page).
      if (sessionStorage.getItem(ATTEMPT_KEY)) {
        sessionStorage.removeItem(ATTEMPT_KEY);
        setNeedsButton(true); setStatus("");
        return;
      }
      // First landing → go straight to Google, no button.
      sessionStorage.setItem(ATTEMPT_KEY, "1");
      try {
        await signInWithRedirect(auth(), new GoogleAuthProvider());
      } catch (e) {
        setNeedsButton(true); setStatus("");
        setError((e as Error)?.message ?? null);
      }
    })();
  }, []);

  const goPopup = async () => {
    const cb = cbPort();
    if (!cb) { setError("Missing app callback port."); return; }
    setError(null); setStatus("Opening Google…");
    try {
      const result = await signInWithPopup(auth(), new GoogleAuthProvider());
      setStatus("Signing you into PokéTFT…");
      if (!handoff(cb, result)) throw new Error("No Google credential was returned.");
    } catch (e) {
      setError((e as Error)?.message ?? "Sign-in failed."); setStatus("");
    }
  };

  const wrap = { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0e1a", color: "#e2e8f0", fontFamily: "system-ui, -apple-system, sans-serif", padding: 24 } as const;
  const card = { display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center", maxWidth: 360, width: "100%", padding: "40px 32px", borderRadius: 20, background: "rgba(15,23,42,0.55)", border: "1px solid rgba(251,191,36,0.14)", boxShadow: "0 30px 80px -30px rgba(0,0,0,0.8)" } as const;
  const btn = { padding: "13px 26px", borderRadius: 12, background: "linear-gradient(180deg,#fbbf24,#f59e0b)", color: "#0a0e1a", fontWeight: 800, fontSize: 15, border: "none", cursor: "pointer", boxShadow: "0 8px 24px -8px rgba(251,191,36,0.5)" } as const;

  return (
    <main style={wrap}>
      <div style={card}>
        {/* Spinning Pokéball */}
        <div style={{ position: "relative", width: 56, height: 56, animation: needsButton ? "none" : "spin 1s linear infinite" }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "linear-gradient(#ef4444 0 50%, #f8fafc 50% 100%)", border: "3px solid #0a0e1a", boxShadow: "0 6px 18px -6px rgba(239,68,68,0.6)" }} />
          <div style={{ position: "absolute", top: "calc(50% - 2px)", left: 0, right: 0, height: 4, background: "#0a0e1a" }} />
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 18, height: 18, borderRadius: "50%", background: "#f8fafc", border: "3px solid #0a0e1a" }} />
        </div>

        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em" }}>
            Poké<span style={{ background: "linear-gradient(180deg,#fde68a,#d4af37)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>TFT</span>
          </div>
          <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 4 }}>Signing in with Google</div>
        </div>

        {needsButton && <button style={btn} onClick={goPopup}>Continue with Google</button>}
        {status && !needsButton && <div style={{ fontSize: 12.5, color: "#94a3b8" }}>{status}</div>}
        {error && <div style={{ fontSize: 12.5, color: "#fca5a5", lineHeight: 1.5 }}>{error}</div>}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
