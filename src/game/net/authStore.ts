"use client";

import { create } from "zustand";
import {
  onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signInWithCredential, linkWithPopup, linkWithCredential, EmailAuthProvider,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, deleteUser,
  signOut as fbSignOut, type User, type AuthError,
} from "firebase/auth";
import { ref, remove } from "firebase/database";
import { auth, db } from "./firebase";
import { isNativeShell, openNativeGoogleSignIn } from "./nativeShell";
import {
  ensureProfile, setUsername as setUsernameRT, setPhoto as setPhotoRT, addFriend as addFriendRT,
  removeFriend as removeFriendRT, findUserByUsername, trackPresence, subscribeFriends,
  type UserProfile,
} from "./users";

export type AuthUser = {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  isAnonymous: boolean;
};

type Status = "loading" | "signed-out" | "needs-username" | "ready";

type AuthState = {
  user: AuthUser | null;
  profile: UserProfile | null;
  friends: UserProfile[];
  status: Status;
  error: string | null;
  /** Transient success message (e.g. "reset email sent"). */
  notice: string | null;
  busy: boolean;

  init: () => void;
  signInGoogle: () => Promise<void>;
  signInEmail: (email: string, pw: string) => Promise<void>;
  signUpEmail: (email: string, pw: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  deleteAccount: () => Promise<{ ok: boolean; error?: string }>;
  saveUsername: (name: string) => Promise<boolean>;
  setAvatar: (photoURL: string) => Promise<void>;
  addFriendByName: (name: string) => Promise<{ ok: boolean; error?: string }>;
  unfriend: (uid: string) => Promise<void>;
};

let inited = false;
let friendsUnsub: (() => void) | null = null;
let nativeAuthTimer: ReturnType<typeof setTimeout> | null = null;

function mapUser(u: User): AuthUser {
  return { uid: u.uid, displayName: u.displayName, email: u.email, photoURL: u.photoURL, isAnonymous: u.isAnonymous };
}

function authErr(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  if (code.includes("email-already-in-use")) return "Email already registered — sign in instead.";
  if (code.includes("account-exists-with-different-credential")) return "An account with this email already exists. Try signing in with Google instead.";
  if (code.includes("invalid-credential") || code.includes("wrong-password")) return "Wrong email or password.";
  if (code.includes("weak-password")) return "Password must be at least 6 characters.";
  if (code.includes("invalid-email")) return "Invalid email address.";
  if (code.includes("too-many-requests")) return "Too many attempts — wait a few minutes and try again.";
  if (code.includes("network-request-failed")) return "No internet connection — check your network and try again.";
  if (code.includes("user-disabled")) return "This account has been disabled.";
  if (code.includes("popup-closed")) return "Sign-in cancelled.";
  return (e as Error)?.message ?? "Sign-in failed.";
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  friends: [],
  status: "loading",
  error: null,
  notice: null,
  busy: false,

  init: () => {
    if (inited) return;
    inited = true;
    // If we returned from a redirect sign-in, success flows through onAuthStateChanged;
    // surface only the failure case (e.g. Google rejects an embedded-webview UA) so the
    // user sees why instead of a silent no-op.
    getRedirectResult(auth()).catch((e) => set({ error: authErr(e) }));
    // Native shell bridge: the Rust deep-link handler calls this with the
    // poketft://auth#id_token=...&access_token=... URL after the system-browser
    // Google sign-in. Finish by signing into Firebase with that credential.
    if (typeof window !== "undefined") {
      (window as unknown as { __poketftNativeAuth?: (url: string) => void }).__poketftNativeAuth = async (url: string) => {
        try {
          let idToken: string | null = null;
          let accessToken: string | undefined;
          try {
            const u = new URL(url);
            idToken = u.searchParams.get("id_token");
            accessToken = u.searchParams.get("access_token") ?? undefined;
            if (!idToken && u.hash) {
              const h = new URLSearchParams(u.hash.replace(/^#/, ""));
              idToken = h.get("id_token");
              accessToken = h.get("access_token") ?? undefined;
            }
          } catch { /* not a parseable URL */ }
          if (!idToken) { set({ error: "Sign-in returned no credential." }); return; }
          if (nativeAuthTimer) { clearTimeout(nativeAuthTimer); nativeAuthTimer = null; }
          set({ busy: true, error: null, notice: null });
          const cred = GoogleAuthProvider.credential(idToken, accessToken);
          const cur = auth().currentUser;
          try {
            // Upgrade anonymous session if possible; fall back to a plain sign-in
            // if this Google account already has its own Firebase account.
            if (cur?.isAnonymous) await linkWithCredential(cur, cred);
            else await signInWithCredential(auth(), cred);
          } catch (le) {
            if ((le as AuthError)?.code?.includes("credential-already-in-use"))
              await signInWithCredential(auth(), cred);
            else throw le;
          }
          set({ busy: false });
        } catch (e) { set({ error: authErr(e), busy: false }); }
      };
    }
    onAuthStateChanged(auth(), async (u) => {
      if (friendsUnsub) { friendsUnsub(); friendsUnsub = null; }
      if (!u) {
        set({ user: null, profile: null, friends: [], status: "signed-out" });
        return;
      }
      const user = mapUser(u);
      // Guests get an auto display name; accounts pick a username on first sign-in.
      const seedName = u.isAnonymous ? `Guest-${u.uid.slice(0, 4)}` : (u.displayName?.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 16) ?? "");
      let profile: UserProfile = { uid: u.uid, username: seedName, photoURL: u.photoURL };
      try {
        profile = await ensureProfile(u.uid, { username: u.isAnonymous ? seedName : (seedName || undefined), photoURL: u.photoURL });
        trackPresence(u.uid);
        friendsUnsub = subscribeFriends(u.uid, (friends) => set({ friends }));
      } catch (e) {
        // Profile/friends need the /users rules — if they're not deployed yet, still
        // let the player into the game with a local-only profile.
        console.warn("[auth] profile unavailable:", (e as Error)?.message);
      }
      const needsName = !u.isAnonymous && !profile.username;
      set({ user, profile, status: needsName ? "needs-username" : "ready", error: null });
    });
  },

  signInGoogle: async () => {
    set({ busy: true, error: null, notice: null });
    // App shell: open Google in the user's DEFAULT browser (where they're already
    // signed into Google → one-click account pick), not the session-less webview.
    // Rust intercepts the sentinel, runs the loopback, and signs the app in on return.
    if (isNativeShell()) {
      openNativeGoogleSignIn();
      if (nativeAuthTimer) clearTimeout(nativeAuthTimer);
      nativeAuthTimer = setTimeout(() => {
        nativeAuthTimer = null;
        set({ notice: null, error: "Sign-in timed out. Return to the app, then try again." });
      }, 90_000);
      set({ busy: false, notice: "Continue with Google in your browser — this app will sign in automatically." });
      return;
    }
    const provider = new GoogleAuthProvider();
    const currentUser = auth().currentUser;
    try {
      // Link to the existing anonymous account so the guest's stats carry over.
      // Falls back to a plain sign-in if this Google identity already has its own
      // Firebase account (credential-already-in-use).
      if (currentUser?.isAnonymous) {
        await linkWithPopup(currentUser, provider);
      } else {
        await signInWithPopup(auth(), provider);
      }
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      if (code.includes("credential-already-in-use")) {
        const fallbackCred = GoogleAuthProvider.credentialFromError(e as Error);
        if (fallbackCred) {
          try { await signInWithCredential(auth(), fallbackCred); set({ busy: false }); return; }
          catch (e2) { set({ error: authErr(e2), busy: false }); return; }
        }
        set({ error: "This Google account is already registered. Sign out first, then sign in with Google.", busy: false });
        return;
      }
      // Embedded webviews (the Tauri desktop/mobile shell) and some browsers block
      // popups → auth/popup-blocked. Fall back to a full-page redirect, which needs
      // no popup window. onAuthStateChanged picks up the result when we return.
      if (code.includes("popup-blocked") || code.includes("operation-not-supported") || code.includes("cancelled-popup-request")) {
        try { await signInWithRedirect(auth(), provider); return; }
        catch (e2) { set({ error: authErr(e2), busy: false }); return; }
      }
      set({ error: authErr(e) });
    }
    set({ busy: false });
  },

  signInEmail: async (email, pw) => {
    set({ busy: true, error: null });
    try { await signInWithEmailAndPassword(auth(), email.trim(), pw); }
    catch (e) { set({ error: authErr(e) }); }
    finally { set({ busy: false }); }
  },

  signUpEmail: async (email, pw) => {
    set({ busy: true, error: null });
    try {
      const currentUser = auth().currentUser;
      if (currentUser?.isAnonymous) {
        // Upgrade: link the new email/password identity to the anonymous UID so
        // the guest's stats and history are preserved under the same account.
        const emailCred = EmailAuthProvider.credential(email.trim(), pw);
        try { await linkWithCredential(currentUser, emailCred); }
        catch (le) {
          const lc = (le as { code?: string })?.code ?? "";
          // Email already belongs to an existing account — sign into that account instead.
          if (lc.includes("credential-already-in-use") || lc.includes("email-already-in-use")) {
            await signInWithEmailAndPassword(auth(), email.trim(), pw);
          } else { throw le; }
        }
      } else {
        await createUserWithEmailAndPassword(auth(), email.trim(), pw);
      }
    }
    catch (e) { set({ error: authErr(e) }); }
    finally { set({ busy: false }); }
  },

  signOut: async () => {
    if (friendsUnsub) { friendsUnsub(); friendsUnsub = null; }
    await fbSignOut(auth());
  },

  resetPassword: async (email) => {
    if (!email.trim()) { set({ error: "Enter your email first." }); return; }
    set({ busy: true, error: null, notice: null });
    try {
      await sendPasswordResetEmail(auth(), email.trim());
      set({ notice: "Reset email sent — check your inbox." });
    } catch (e) { set({ error: authErr(e) }); }
    finally { set({ busy: false }); }
  },

  deleteAccount: async () => {
    const u = auth().currentUser;
    if (!u) return { ok: false, error: "Not signed in." };
    set({ busy: true, error: null });
    try {
      // Best-effort cleanup of public records; the account delete is the source of truth.
      const uid = u.uid;
      const lower = get().profile?.usernameLower;
      await Promise.allSettled([
        remove(ref(db(), `users/${uid}`)),
        remove(ref(db(), `leaderboard/${uid}`)),
        ...(lower ? [remove(ref(db(), `usernames/${lower}`))] : []),
      ]);
      await deleteUser(u);
      return { ok: true };
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      const error = code.includes("requires-recent-login")
        ? "Please sign out and back in, then delete again."
        : authErr(e);
      set({ error });
      return { ok: false, error };
    } finally { set({ busy: false }); }
  },

  saveUsername: async (name) => {
    const { user } = get();
    if (!user) return false;
    set({ busy: true, error: null });
    const res = await setUsernameRT(user.uid, name.trim());
    if (!res.ok) { set({ error: res.error ?? "Couldn't set username", busy: false }); return false; }
    set({ profile: { ...(get().profile as UserProfile), username: name.trim(), usernameLower: name.trim().toLowerCase() }, status: "ready", busy: false });
    return true;
  },

  setAvatar: async (photoURL) => {
    const { user, profile } = get();
    if (!user) return;
    try { await setPhotoRT(user.uid, photoURL); set({ profile: { ...(profile as UserProfile), photoURL } }); }
    catch (e) { set({ error: (e as Error)?.message ?? "Couldn't update avatar" }); }
  },

  addFriendByName: async (name) => {
    const { user, profile } = get();
    if (!user) return { ok: false, error: "Sign in first" };
    const target = await findUserByUsername(name.trim());
    if (!target) return { ok: false, error: "No user with that name" };
    if (target.uid === user.uid) return { ok: false, error: "That's you!" };
    if (profile?.friends?.[target.uid]) return { ok: false, error: "Already friends" };
    await addFriendRT(user.uid, target.uid);
    return { ok: true };
  },

  unfriend: async (uid) => {
    const { user } = get();
    if (user) await removeFriendRT(user.uid, uid);
  },
}));
