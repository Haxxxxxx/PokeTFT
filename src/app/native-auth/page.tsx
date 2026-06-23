"use client";

import { useEffect, useState } from "react";
import { GoogleAuthProvider, signInWithRedirect, getRedirectResult } from "firebase/auth";
import { auth } from "@/game/net/firebase";

/**
 * Native sign-in bridge. The desktop/mobile shell opens THIS url in the system
 * browser (Google blocks OAuth inside embedded webviews). It immediately hands
 * off to the real Google sign-in via signInWithRedirect — so the user lands
 * straight on accounts.google.com — then, on return, bounces the credential
 * back into the app via the poketft://auth deep link (finished by
 * signInWithCredential in authStore.init).
 */
function startGoogle() {
  return signInWithRedirect(auth(), new GoogleAuthProvider());
}

export default function NativeAuthBridge() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Are we RETURNING from Google? If so, bounce the credential into the app.
      try {
        const result = await getRedirectResult(auth());
        if (cancelled) return;
        if (result) {
          const cred = GoogleAuthProvider.credentialFromResult(result);
          if (cred?.idToken) {
            const params = new URLSearchParams();
            params.set("id_token", cred.idToken);
            if (cred.accessToken) params.set("access_token", cred.accessToken);
            window.location.href = `poketft://auth#${params.toString()}`;
            return;
          }
        }
      } catch {
        // ignore — fall through and (re)start the Google redirect
      }
      // OUTBOUND: go straight to the Google account chooser.
      try {
        if (!cancelled) await startGoogle();
      } catch (e) {
        if (!cancelled) setError((e as Error)?.message ?? "Couldn't reach Google sign-in.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#020617", color: "#e2e8f0", fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center", maxWidth: 360 }}>
        {!error ? (
          <>
            <div style={{ width: 34, height: 34, borderRadius: "50%", border: "3px solid rgba(251,191,36,0.25)", borderTopColor: "#fbbf24", animation: "spin 0.8s linear infinite" }} />
            <div style={{ fontSize: 14, color: "#fbbf24", fontWeight: 700 }}>Redirecting to Google…</div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: "#fca5a5" }}>{error}</div>
        )}
        {/* Manual fallback in case the auto-redirect is ever blocked. */}
        <button
          onClick={() => startGoogle().catch((e) => setError((e as Error)?.message ?? "Sign-in failed."))}
          style={{ marginTop: 4, padding: "10px 18px", borderRadius: 10, background: "#fbbf24", color: "#0a0e1a", fontWeight: 800, fontSize: 14, border: "none", cursor: "pointer" }}
        >
          Continue with Google
        </button>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </main>
  );
}
