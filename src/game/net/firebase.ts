/**
 * Firebase client (PokéTFT Arena) — Realtime Database + Anonymous Auth.
 *
 * These are Firebase *client* config values — public-safe project identifiers,
 * not API secrets. They are intentionally committed as fallbacks so the build
 * works out of the box without requiring every contributor to configure env vars.
 * Access is enforced by Realtime Database security rules + anonymous auth, not
 * by keeping these values private.
 *
 * For your own fork/deployment, override via NEXT_PUBLIC_FIREBASE_* env vars
 * (see .env.example). For the canonical PokéTFT Arena deploy the fallbacks ARE
 * the correct values.
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getDatabase, type Database } from "firebase/database";
import { getAuth, signInAnonymously, type Auth } from "firebase/auth";

const config = {
  apiKey:             process.env.NEXT_PUBLIC_FIREBASE_API_KEY             ?? "AIzaSyCtPKFSNFcu3DGIr3tMgsVMr1Dm0_K7yCA",
  authDomain:         process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN         ?? "poketft-arena.web.app",
  databaseURL:        process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL        ?? "https://poketft-arena-default-rtdb.firebaseio.com",
  projectId:          process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID          ?? "poketft-arena",
  storageBucket:      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET      ?? "poketft-arena.firebasestorage.app",
  messagingSenderId:  process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "250210808933",
  appId:              process.env.NEXT_PUBLIC_FIREBASE_APP_ID              ?? "1:250210808933:web:1586c9b3494548b27a028c",
};

let app: FirebaseApp | null = null;
let dbInstance: Database | null = null;
let authInstance: Auth | null = null;

function ensureApp(): FirebaseApp {
  if (app) return app;
  app = getApps().length ? getApps()[0] : initializeApp(config);
  return app;
}

export function db(): Database {
  if (!dbInstance) dbInstance = getDatabase(ensureApp());
  return dbInstance;
}

export function auth(): Auth {
  if (!authInstance) authInstance = getAuth(ensureApp());
  return authInstance;
}

/**
 * Resolve this player's identity for room operations. If the user is already
 * signed in (Google / email account, or a prior guest session), use that uid.
 * Otherwise sign in anonymously as a guest.
 *
 * NOTE: there is deliberately NO local "fallback id" anymore. The RTDB rules are
 * auth-locked (`auth != null`), so a synthetic id can't write anything — limping
 * on with one only produced a silently-frozen game (every write rejected). We
 * surface a real error instead; every caller (roomStore) wraps this in try/catch
 * and shows the message.
 */
export async function ensureAuth(): Promise<string> {
  if (typeof window === "undefined") throw new Error("auth unavailable outside the browser");
  const a = auth();
  if (a.currentUser) return a.currentUser.uid;
  try {
    // Cap anonymous sign-in: on a flaky/slow connection it can hang indefinitely,
    // freezing create/join/reconnect. After 8s, reject so the UI can show a retry.
    const cred = await Promise.race([
      signInAnonymously(a),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("auth-timeout")), 8000)),
    ]);
    return cred.user.uid;
  } catch (e) {
    console.error("[auth] sign-in failed:", (e as Error)?.message);
    throw new Error("Couldn't sign in — check your connection and try again.");
  }
}
