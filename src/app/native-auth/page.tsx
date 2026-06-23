"use client";

import { useEffect, useState } from "react";
import { GoogleAuthProvider, signInWithRedirect, getRedirectResult } from "firebase/auth";
import { auth } from "@/game/net/firebase";

/**
 * Native sign-in bridge. The desktop/mobile shell opens this in the SYSTEM
 * browser (Google blocks OAuth in embedded webviews), passing ?cb=<port> for the
 * app's localhost loopback. Outbound: redirect straight to Google. Return: hand
 * the credential to http://localhost:<port> — the app receives it, signs in with
 * signInWithCredential, and brings itself to front. Fully seamless: no buttons,
 * no custom-scheme prompt.
 */
function startGoogle() {
  return signInWithRedirect(auth(), new GoogleAuthProvider());
}

export default function NativeAuthBridge() {
  const [error, setError] = useState<string | null>(null);
  const [returned, setReturned] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cb = new URLSearchParams(window.location.search).get("cb");
      try {
        const result = await getRedirectResult(auth());
        if (cancelled) return;
        if (result) {
          const cred = GoogleAuthProvider.credentialFromResult(result);
          if (cred?.idToken && cb) {
            const p = new URLSearchParams();
            p.set("id_token", cred.idToken);
            if (cred.accessToken) p.set("access_token", cred.accessToken);
            setReturned(true);
            // Hand the credential to the app's loopback → it signs in + focuses.
            window.location.href = `http://localhost:${cb}/?${p.toString()}`;
            return;
          }
        }
      } catch {
        // fall through and (re)start the redirect
      }
      try {
        if (!cancelled) await startGoogle();
      } catch (e) {
        if (!cancelled) setError((e as Error)?.message ?? "Couldn't reach Google sign-in.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const wrap = { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#020617", color: "#e2e8f0", fontFamily: "system-ui, sans-serif", padding: 24 } as const;

  return (
    <main style={wrap}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center", maxWidth: 360 }}>
        {error ? (
          <div style={{ fontSize: 13, color: "#fca5a5" }}>{error}</div>
        ) : (
          <>
            <div style={{ width: 34, height: 34, borderRadius: "50%", border: "3px solid rgba(251,191,36,0.25)", borderTopColor: "#fbbf24", animation: "spin 0.8s linear infinite" }} />
            <div style={{ fontSize: 14, color: "#fbbf24", fontWeight: 700 }}>{returned ? "Returning to PokéTFT…" : "Redirecting to Google…"}</div>
          </>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </main>
  );
}
