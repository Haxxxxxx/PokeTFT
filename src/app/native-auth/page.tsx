"use client";

import { useEffect, useState } from "react";
import { GoogleAuthProvider, signInWithRedirect, getRedirectResult } from "firebase/auth";
import { auth } from "@/game/net/firebase";

/**
 * Native sign-in bridge. The desktop/mobile shell opens THIS page in the system
 * browser (Google blocks OAuth inside embedded webviews). Here — a real browser —
 * the normal Google redirect works; we then bounce the credential back into the
 * app via the `poketft://auth#...` deep link, which finishes with
 * signInWithCredential(). See src-tauri/src/lib.rs + game/net/authStore.ts.
 */
export default function NativeAuthBridge() {
  const [status, setStatus] = useState("Connecting to Google…");
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const result = await getRedirectResult(auth());
        if (!result) {
          // First load: kick off the real-browser Google redirect.
          await signInWithRedirect(auth(), new GoogleAuthProvider());
          return;
        }
        const cred = GoogleAuthProvider.credentialFromResult(result);
        if (!cred?.idToken) throw new Error("No Google credential was returned.");
        const params = new URLSearchParams();
        params.set("id_token", cred.idToken);
        if (cred.accessToken) params.set("access_token", cred.accessToken);
        setStatus("Returning to PokéTFT…");
        setDone(true);
        // Hand the credential to the app via the custom scheme.
        window.location.href = `poketft://auth#${params.toString()}`;
      } catch (e) {
        setStatus("Sign-in failed: " + ((e as Error)?.message ?? "unknown error"));
        setDone(true);
      }
    })();
  }, []);

  return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#020617", color: "#e2e8f0", fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center", maxWidth: 360 }}>
        {!done && (
          <div style={{ width: 34, height: 34, borderRadius: "50%", border: "3px solid rgba(251,191,36,0.25)", borderTopColor: "#fbbf24", animation: "spin 0.8s linear infinite" }} />
        )}
        <div style={{ fontSize: 14, color: "#fbbf24", fontWeight: 700 }}>{status}</div>
        {done && (
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            If PokéTFT didn’t reopen automatically, switch back to the app. You can close this tab.
          </div>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </main>
  );
}
