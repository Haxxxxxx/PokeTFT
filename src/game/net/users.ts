/** User profiles + friends over RTDB.
 *  /users/{uid}    = { username, usernameLower, photoURL, createdAt, currentGame }
 *  /users/{uid}/friends/{friendUid} = true   (symmetric)
 *  /usernames/{lower} = uid                   (lookup index, claim-once)
 */
import { ref, get, set, update, remove, onValue, onDisconnect, serverTimestamp, runTransaction, query, orderByChild, limitToLast } from "firebase/database";
import { db } from "./firebase";

export type UserProfile = {
  uid: string;
  username: string;
  usernameLower?: string;
  photoURL?: string | null;
  createdAt?: number | object;
  currentGame?: string | null;
  online?: boolean;
  friends?: Record<string, boolean>;
  /** Ranked rating (Elo-like; starts at START_RATING). */
  rating?: number;
};

/** Everyone starts here; placement nudges it up/down each game. */
export const START_RATING = 1000;

/** Rating → cosmetic tier (name + accent), TFT-ladder flavour. */
export function ratingTier(rating: number): { name: string; color: string } {
  if (rating >= 1600) return { name: "Master", color: "#c084fc" };
  if (rating >= 1400) return { name: "Diamond", color: "#60a5fa" };
  if (rating >= 1200) return { name: "Platinum", color: "#22d3ee" };
  if (rating >= 1000) return { name: "Gold", color: "#fbbf24" };
  if (rating >= 800) return { name: "Silver", color: "#cbd5e1" };
  return { name: "Bronze", color: "#b45309" };
}

/** Rating delta for a finished game: linear by placement around the midpoint, so 1st
 *  gains the most and last loses the most, scaled to the lobby size. */
export function ratingDelta(place: number, players: number): number {
  const mid = (players + 1) / 2;
  return Math.round((mid - place) * 8);
}

export type LeaderEntry = { uid: string; username: string; rating: number; photoURL?: string | null };

/** Apply a finished game's placement to the player's rating (transaction) and mirror it
 *  to the public, queryable leaderboard node. */
export async function applyRankedResult(uid: string, place: number, players: number, username: string, photoURL?: string | null): Promise<void> {
  const delta = ratingDelta(place, players);
  const res = await runTransaction(ref(db(), `users/${uid}/rating`), (cur) => Math.max(0, (cur ?? START_RATING) + delta));
  const rating = (res.snapshot.val() as number) ?? START_RATING;
  await set(ref(db(), `leaderboard/${uid}`), { username, rating, photoURL: photoURL ?? null }).catch(() => {});
}

/** Top-rated players, highest first. */
export async function getLeaderboard(limit = 50): Promise<LeaderEntry[]> {
  const snap = await get(query(ref(db(), "leaderboard"), orderByChild("rating"), limitToLast(limit)));
  if (!snap.exists()) return [];
  const out: LeaderEntry[] = [];
  snap.forEach((c) => { out.push({ uid: c.key!, ...(c.val() as Omit<LeaderEntry, "uid">) }); });
  return out.sort((a, b) => b.rating - a.rating);
}

const usersRef = (uid: string) => ref(db(), `users/${uid}`);
const nameIndexRef = (lower: string) => ref(db(), `usernames/${lower}`);

export async function getProfile(uid: string): Promise<UserProfile | null> {
  const snap = await get(usersRef(uid));
  return snap.exists() ? ({ uid, ...snap.val() } as UserProfile) : null;
}

/** Create the profile if it doesn't exist yet. Returns the (possibly new) profile. */
export async function ensureProfile(uid: string, seed: { username?: string; photoURL?: string | null }): Promise<UserProfile> {
  const existing = await getProfile(uid);
  if (existing) return existing;
  const profile: Partial<UserProfile> = {
    username: seed.username ?? "",
    usernameLower: seed.username ? seed.username.toLowerCase() : "",
    photoURL: seed.photoURL ?? null,
    createdAt: serverTimestamp(),
    currentGame: null,
  };
  await set(usersRef(uid), profile);
  if (seed.username) await set(nameIndexRef(seed.username.toLowerCase()), uid).catch(() => {});
  return { uid, ...profile } as UserProfile;
}

export function usernameValid(name: string): boolean {
  return /^[a-zA-Z0-9_]{3,16}$/.test(name);
}

/** Claim a username (must be unique). Returns true on success. */
export async function setUsername(uid: string, username: string): Promise<{ ok: boolean; error?: string }> {
  if (!usernameValid(username)) return { ok: false, error: "3–16 letters, numbers or _" };
  const lower = username.toLowerCase();
  const taken = await get(nameIndexRef(lower));
  if (taken.exists() && taken.val() !== uid) return { ok: false, error: "Username taken" };
  // Free the old name if changing.
  const prev = await getProfile(uid);
  if (prev?.usernameLower && prev.usernameLower !== lower) await remove(nameIndexRef(prev.usernameLower)).catch(() => {});
  await update(usersRef(uid), { username, usernameLower: lower });
  await set(nameIndexRef(lower), uid);
  return { ok: true };
}

export async function findUserByUsername(username: string): Promise<UserProfile | null> {
  const snap = await get(nameIndexRef(username.toLowerCase()));
  if (!snap.exists()) return null;
  return getProfile(snap.val() as string);
}

/** Quick-add: symmetric friendship written on both sides. */
export async function addFriend(uid: string, friendUid: string): Promise<void> {
  if (uid === friendUid) return;
  await update(ref(db()), {
    [`users/${uid}/friends/${friendUid}`]: true,
    [`users/${friendUid}/friends/${uid}`]: true,
  });
}

export async function removeFriend(uid: string, friendUid: string): Promise<void> {
  await update(ref(db()), {
    [`users/${uid}/friends/${friendUid}`]: null,
    [`users/${friendUid}/friends/${uid}`]: null,
  });
}

/** Mark presence + current game; clears online on disconnect. */
export function trackPresence(uid: string) {
  const onlineRef = ref(db(), `users/${uid}/online`);
  set(onlineRef, true).catch(() => {});
  onDisconnect(onlineRef).set(false).catch(() => {});
}

export function setCurrentGame(uid: string, code: string | null) {
  return update(usersRef(uid), { currentGame: code }).catch(() => {});
}

export function setPhoto(uid: string, photoURL: string | null) {
  return update(usersRef(uid), { photoURL });
}

/** A finished-game record kept under users/{uid}/history/{code} (keyed by room code,
 *  so re-observing "over" is idempotent — no duplicate rows). */
export type GameResult = {
  code: string;
  place: number;        // final placement (1 = win)
  players: number;      // total players in the match
  regions: number[];    // generations played
  won: boolean;
  ts: number | object;  // serverTimestamp
  /** Final board snapshot — d=defId, s=star (compact to keep the row small). */
  team?: { d: string; s: number }[];
  /** Active traits at the end — k=key, t=tier. */
  traits?: { k: string; t: number }[];
};

/** Record (or idempotently overwrite) a finished game's result for this player. */
export async function recordGameResult(uid: string, code: string, r: Omit<GameResult, "code" | "ts">): Promise<void> {
  await set(ref(db(), `users/${uid}/history/${code}`), { ...r, code, ts: serverTimestamp() }).catch(() => {});
}

/** Read a player's recent finished games, newest first. */
export async function getHistory(uid: string, limit = 50): Promise<GameResult[]> {
  const snap = await get(ref(db(), `users/${uid}/history`));
  if (!snap.exists()) return [];
  return Object.values(snap.val() as Record<string, GameResult>)
    .sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0))
    .slice(0, limit);
}

/** Subscribe to the user's friends and resolve each friend's live profile. */
export function subscribeFriends(uid: string, cb: (friends: UserProfile[]) => void): () => void {
  const friendsRef = ref(db(), `users/${uid}/friends`);
  const profileUnsubs = new Map<string, () => void>();
  const profiles = new Map<string, UserProfile>();
  const emit = () => cb([...profiles.values()].sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username)));

  const top = onValue(friendsRef, (snap) => {
    const ids: string[] = snap.exists() ? Object.keys(snap.val()) : [];
    // Unsub removed friends.
    for (const [id, un] of profileUnsubs) if (!ids.includes(id)) { un(); profileUnsubs.delete(id); profiles.delete(id); }
    // Sub new friends' profiles live.
    for (const id of ids) {
      if (profileUnsubs.has(id)) continue;
      const un = onValue(usersRef(id), (ps) => {
        if (ps.exists()) profiles.set(id, { uid: id, ...ps.val() } as UserProfile);
        else profiles.delete(id);
        emit();
      });
      profileUnsubs.set(id, un);
    }
    emit();
  });

  return () => { top(); for (const un of profileUnsubs.values()) un(); };
}
