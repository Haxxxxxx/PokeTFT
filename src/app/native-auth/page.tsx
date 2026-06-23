"use client";

import { useState } from "react";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "@/game/net/firebase";

/**
 * Native sign-in bridge — opened in the user's DEFAULT browser by the app shell
 * (where they're already signed into Google). Uses signInWithPopup: the popup
 * returns the Google credential directly in this page (via window.opener), with
 * NO cross-domain getRedirectResult/storage — which is what was breaking the
 * redirect flow (web.app vs firebaseapp.com). We then hand the credential to the
 * app's loopback (127.0.0.1:<cb>), which signs the app in and brings it to front.
 */
export default function NativeAuthBridge() {
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const go = async () => {
    setError(null);
    setStatus("Opening Google…");
    try {
      const cb = new URLSearchParams(window.location.search).get("cb");
      if (!cb) throw new Error("Missing app callback port. Reopen sign-in from the app.");
      const result = await signInWithPopup(auth(), new GoogleAuthProvider());
      const cred = GoogleAuthProvider.credentialFromResult(result);
      if (!cred?.idToken) throw new Error("No Google credential was returned.");
      const p = new URLSearchParams();
      p.set("id_token", cred.idToken);
      if (cred.accessToken) p.set("access_token", cred.accessToken);
      setStatus("Signing you into PokéTFT…");
      setDone(true);
      window.location.href = `http://127.0.0.1:${cb}/?${p.toString()}`;
    } catch (e) {
      setError((e as Error)?.message ?? "Sign-in failed.");
      setStatus("");
    }
  };

  const wrap = { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#020617", color: "#e2e8f0", fontFamily: "system-ui, sans-serif", padding: 24 } as const;
  const btn = { padding: "14px 26px", borderRadius: 12, background: "#fbbf24", color: "#0a0e1a", fontWeight: 800, fontSize: 16, border: "none", cursor: "pointer" } as const;

  return (
    <main style={wrap}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center", maxWidth: 380 }}>
        <div style={{ fontSize: 26 }}>🔴</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fbbf24" }}>Sign in to PokéTFT</div>
        {!done && (
          <button style={btn} onClick={go}>Continue with Google</button>
        )}
        {status && <div style={{ fontSize: 13, color: "#94a3b8" }}>{status}</div>}
        {done && <div style={{ fontSize: 12, color: "#94a3b8" }}>Returning to the app… you can close this tab.</div>}
        {error && <div style={{ fontSize: 13, color: "#fca5a5" }}>{error}</div>}
      </div>
    </main>
  );
}
