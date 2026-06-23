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
  return new URLSearchParams(window.location.search).get("cb");
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

  const wrap = { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#020617", color: "#e2e8f0", fontFamily: "system-ui, sans-serif", padding: 24 } as const;
  const btn = { padding: "14px 26px", borderRadius: 12, background: "#fbbf24", color: "#0a0e1a", fontWeight: 800, fontSize: 16, border: "none", cursor: "pointer" } as const;

  return (
    <main style={wrap}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center", maxWidth: 380 }}>
        <div style={{ fontSize: 26 }}>🔴</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fbbf24" }}>Sign in to PokéTFT</div>
        {!needsButton ? (
          <div style={{ width: 30, height: 30, borderRadius: "50%", border: "3px solid rgba(251,191,36,0.25)", borderTopColor: "#fbbf24", animation: "spin 0.8s linear infinite" }} />
        ) : (
          <button style={btn} onClick={goPopup}>Continue with Google</button>
        )}
        {status && <div style={{ fontSize: 13, color: "#94a3b8" }}>{status}</div>}
        {error && <div style={{ fontSize: 13, color: "#fca5a5" }}>{error}</div>}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </main>
  );
}
