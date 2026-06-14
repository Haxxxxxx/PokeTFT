/**
 * Firebase client (PokéTFT Arena) — Realtime Database.
 * Config values are public-safe identifiers (not secrets).
 *
 * Identity: we use a persistent client id (localStorage) instead of Firebase
 * Auth for now — anonymous auth needs a one-time console enable. The /games
 * rules are currently open for the testing phase; lock them back to
 * `auth != null` once anonymous sign-in is enabled in the Firebase console.
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getDatabase, type Database } from "firebase/database";

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

function ensureApp(): FirebaseApp {
  if (app) return app;
  app = getApps().length ? getApps()[0] : initializeApp(config);
  return app;
}

export function db(): Database {
  if (!dbInstance) dbInstance = getDatabase(ensureApp());
  return dbInstance;
}

function randomId(): string {
  return "u-" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

/** A stable per-browser client id (persisted in localStorage). */
export function ensureAuth(): Promise<string> {
  if (typeof window === "undefined") return Promise.resolve("srv-" + randomId());
  let id = window.localStorage.getItem("poketft_uid");
  if (!id) {
    id = randomId();
    window.localStorage.setItem("poketft_uid", id);
  }
  return Promise.resolve(id);
}
