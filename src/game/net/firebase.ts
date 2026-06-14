/**
 * Firebase client (PokéTFT Arena) — Realtime Database + Anonymous Auth.
 * Config values are public-safe identifiers (not secrets).
 *
 * Identity: we prefer Firebase Anonymous Auth (server-issued `auth.uid`, which
 * the RTDB rules can bind writes to). If anonymous sign-in isn't enabled yet
 * (one-time Firebase console toggle), we fall back to a per-tab sessionStorage
 * id so the game keeps working — but the locked `auth != null` rules can only
 * be deployed once anonymous auth is live for every client.
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getDatabase, type Database } from "firebase/database";
import { getAuth, signInAnonymously, type Auth } from "firebase/auth";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyCtPKFSNFcu3DGIr3tMgsVMr1Dm0_K7yCA",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "poketft-arena.firebaseapp.com",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ?? "https://poketft-arena-default-rtdb.firebaseio.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "poketft-arena",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "poketft-arena.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "250210808933",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:250210808933:web:1586c9b3494548b27a028c",
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

function randomId(): string {
  return "u-" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

/** Per-tab fallback id (sessionStorage) when Anonymous Auth isn't available. */
function fallbackId(): string {
  if (typeof window === "undefined") return "srv-" + randomId();
  let id = window.sessionStorage.getItem("poketft_uid");
  if (!id) {
    id = randomId();
    window.sessionStorage.setItem("poketft_uid", id);
  }
  return id;
}

/**
 * Resolve this player's identity for room operations. If the user is already
 * signed in (Google / email account, or a prior guest session), use that uid.
 * Otherwise sign in anonymously as a guest. Falls back to a per-tab id only if
 * anonymous auth is unavailable.
 */
export async function ensureAuth(): Promise<string> {
  if (typeof window === "undefined") return "srv-" + randomId();
  const a = auth();
  if (a.currentUser) return a.currentUser.uid;
  try {
    const cred = await signInAnonymously(a);
    return cred.user.uid;
  } catch (e) {
    console.warn("[auth] anonymous sign-in unavailable, using fallback id:", (e as Error)?.message);
    return fallbackId();
  }
}
