"use client";

import { useEffect, useState } from "react";
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, type UserCredential } from "firebase/auth";
import { auth } from "@/game/net/firebase";

/**
 * Native sign-in bridge — opened in the user's DEFAULT browser by the app shell.
 * Gets the Google credential (popup, with a redirect fallback), then hands it to
 * the app's loopback at 127.0.0.1:<cb>, which signs the app in. The loopback +
 * app side are verified working; this page just has to reliably reach it WITH a
 * credential.
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
  // Navigation to localhost is proven to reach the app's loopback server.
  window.location.href = `http://127.0.0.1:${cb}/?${p.toString()}`;
  return true;
}

export default function NativeAuthBridge() {
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Catch the case where the popup fell back to a full-page redirect.
  useEffect(() => {
    (async () => {
      try {
        const result = await getRedirectResult(auth());
        const cb = cbPort();
        if (result && cb) {
          setStatus("Signing you into PokéTFT…");
          if (handoff(cb, result)) { setDone(true); return; }
        }
      } catch { /* ignore; user will use the button */ }
    })();
  }, []);

  const go = async () => {
    setError(null);
    const cb = cbPort();
    if (!cb) { setError("Missing app callback port — reopen sign-in from the app."); return; }
    setStatus("Opening Google…");
    try {
      const result = await signInWithPopup(auth(), new GoogleAuthProvider());
      setStatus("Signing you into PokéTFT…");
      if (handoff(cb, result)) { setDone(true); return; }
      throw new Error("No Google credential was returned.");
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      // Popup blocked → full-page redirect; getRedirectResult (above) finishes on return.
      if (code.includes("popup-blocked") || code.includes("operation-not-supported") || code.includes("cancelled-popup-request")) {
        setStatus("Redirecting to Google…");
        try { await signInWithRedirect(auth(), new GoogleAuthProvider()); return; }
        catch (e2) { setError((e2 as Error)?.message ?? "Sign-in failed."); setStatus(""); return; }
      }
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
        {!done && <button style={btn} onClick={go}>Continue with Google</button>}
        {status && <div style={{ fontSize: 13, color: "#94a3b8" }}>{status}</div>}
        {done && <div style={{ fontSize: 12, color: "#94a3b8" }}>Switch back to PokéTFT — you’re signed in. You can close this tab.</div>}
        {error && <div style={{ fontSize: 13, color: "#fca5a5" }}>{error}</div>}
      </div>
    </main>
  );
}
