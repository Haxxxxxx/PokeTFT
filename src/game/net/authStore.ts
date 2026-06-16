"use client";

import { create } from "zustand";
import {
  onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, deleteUser,
  signOut as fbSignOut, type User,
} from "firebase/auth";
import { ref, remove } from "firebase/database";
import { auth, db } from "./firebase";
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

function mapUser(u: User): AuthUser {
  return { uid: u.uid, displayName: u.displayName, email: u.email, photoURL: u.photoURL, isAnonymous: u.isAnonymous };
}

function authErr(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  if (code.includes("email-already-in-use")) return "Email already registered — sign in instead.";
  if (code.includes("invalid-credential") || code.includes("wrong-password")) return "Wrong email or password.";
  if (code.includes("weak-password")) return "Password must be at least 6 characters.";
  if (code.includes("invalid-email")) return "Invalid email address.";
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
    set({ busy: true, error: null });
    try { await signInWithPopup(auth(), new GoogleAuthProvider()); }
    catch (e) { set({ error: authErr(e) }); }
    finally { set({ busy: false }); }
  },

  signInEmail: async (email, pw) => {
    set({ busy: true, error: null });
    try { await signInWithEmailAndPassword(auth(), email.trim(), pw); }
    catch (e) { set({ error: authErr(e) }); }
    finally { set({ busy: false }); }
  },

  signUpEmail: async (email, pw) => {
    set({ busy: true, error: null });
    try { await createUserWithEmailAndPassword(auth(), email.trim(), pw); }
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
