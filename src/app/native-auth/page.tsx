"use client";

import { useEffect, useState } from "react";
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, type UserCredential } from "firebase/auth";
import { auth } from "@/game/net/firebase";

/**
 * Native sign-in bridge — opened in the user's DEFAULT browser by the app shell.
 * Auto-fires signInWithRedirect on landing (no button) so the user goes straight
 * to Google. On return, hands the credential to the app via a REAL poketft://
 * deep link (registered with the OS by the desktop/mobile shell) instead of a
 * local loopback server — the OS routes it straight back to the running app, so
 * there's no port/timing race to silently strand the user in this tab.
 * If the redirect-return can't read the result (cross-domain storage), falls back
 * to a one-tap popup so it never dead-ends.
 */
function handoff(result: UserCredential): string | null {
  const cred = GoogleAuthProvider.credentialFromResult(result);
  if (!cred?.idToken) return null;
  const p = new URLSearchParams();
  p.set("id_token", cred.idToken);
  if (cred.accessToken) p.set("access_token", cred.accessToken);
  const deepLink = `poketft://auth-callback?${p.toString()}`;
  window.location.href = deepLink;
  return deepLink;
}

const ATTEMPT_KEY = "poketft_auth_redirected";

export default function NativeAuthBridge() {
  const [needsButton, setNeedsButton] = useState(false);
  const [status, setStatus] = useState("Connecting to Google…");
  const [error, setError] = useState<string | null>(null);
  // Some browsers silently swallow a `location.href` navigation to an unfamiliar
  // custom scheme (no OS prompt, no error) instead of handing off to the app — so
  // once we've attempted the deep link, show an explicit manual fallback rather
  // than leaving the user staring at a tab that looks finished but isn't.
  const [returnLink, setReturnLink] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Returning from Google?
      try {
        const result = await getRedirectResult(auth());
        if (result) {
          sessionStorage.removeItem(ATTEMPT_KEY);
          setStatus("Signing you into PokéTFT…");
          const link = handoff(result);
          if (link) { setReturnLink(link); return; }
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
    setError(null); setStatus("Opening Google…");
    try {
      const result = await signInWithPopup(auth(), new GoogleAuthProvider());
      setStatus("Signing you into PokéTFT…");
      const link = handoff(result);
      if (!link) throw new Error("No Google credential was returned.");
      setReturnLink(link);
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
        <div style={{ position: "relative", width: 56, height: 56, animation: needsButton || returnLink ? "none" : "spin 1s linear infinite" }}>
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
        {status && !needsButton && !returnLink && <div style={{ fontSize: 12.5, color: "#94a3b8" }}>{status}</div>}
        {error && <div style={{ fontSize: 12.5, color: "#fca5a5", lineHeight: 1.5 }}>{error}</div>}
        {/* The poketft:// navigation above should hand off automatically, but some
            browsers silently swallow a redirect to an unfamiliar custom scheme (no
            OS prompt, no error) — so give this a visible, clickable way back
            instead of leaving the user staring at a tab that looks done but isn't. */}
        {returnLink && (
          <>
            <div style={{ fontSize: 12.5, color: "#94a3b8", lineHeight: 1.5 }}>
              Signed in! If PokéTFT didn&apos;t open automatically:
            </div>
            <a href={returnLink} style={{ ...btn, textDecoration: "none", display: "inline-block" }}>Return to PokéTFT</a>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
