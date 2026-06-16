"use client";

import { create } from "zustand";
import {
  ref, set, update, get, onValue, onDisconnect, remove, serverTimestamp, type DatabaseReference,
} from "firebase/database";
import { db, ensureAuth } from "./firebase";
import { setCurrentGame } from "./users";
import { useAuth } from "./authStore";
import type { UnitInstance } from "../types";

export type RoomPhase = "lobby" | "planning" | "combat" | "carousel" | "over";

export type BotDifficulty = "easy" | "medium" | "hard";

export type RoomPlayer = {
  uid: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
  /** Profile avatar (synced from the account so it shows in lobby + scoreboard). */
  photoURL?: string | null;
  /** AI bot players are filled by the host and driven by the match controller. */
  isBot?: boolean;
  botDifficulty?: BotDifficulty;
  /** Live game state (synced during the match). */
  hp: number;
  level: number;
  alive: boolean;
  place: number | null;
  streak: number;
  /** Previous round's opponent uid (for rematch avoidance). */
  lastOpp?: string;
  /** "stage-round" key of the carousel this player already picked from — lets the
   *  host end the carousel early once everyone has chosen. */
  carouselPicked?: string;
  /** The player's current on-board units (synced during planning). */
  board?: UnitInstance[];
  /** Legacy public economy snapshot. Econ now lives in the private priv/{code}/{uid}
   *  node (see roomStore.mySave); kept optional only so reconnect can fall back to
   *  it for sessions that synced before the privacy migration. */
  save?: PlayerSave;
};

export type RoomMeta = {
  hostUid: string;
  phase: RoomPhase;
  stage: number;
  round: number;
  /** Server-time ms at which the current phase ends. */
  deadline: number;
  /** Host liveness heartbeat (server-time ms) — drives migration if it goes stale. */
  hostBeat?: number;
  /** Set when the host INTENTIONALLY quit mid-match (clicked Leave) — distinct from a
   *  disconnect, which only flips connected:false and lets the game migrate. Clients
   *  show "host ended the game" on the over screen. */
  endedByHost?: boolean;
  /** When true, a dedicated server (Cloud Functions + Cloud Tasks, #110 Phase 2) drives
   *  this game's phase transitions; clients stop running their host loop for it. */
  serverDriven?: boolean;
  /** Authoritative winner (place 1) written once when the game ends, so EVERY client
   *  shows the identical result instead of each deriving it from its own alive view. */
  winnerUid?: string;
  updatedAt: number | object;
};

/** Per-player combat assignment + result for the current round (host-written).
 *  Boards are frozen here so every client's replay matches the host's result. */
export type CombatAssign = {
  oppUid: string;
  oppName: string;
  ghost: boolean;
  /** PvE round — fight wild creeps, no HP loss. */
  pve?: boolean;
  /** True for the "enemy"-side player of a PvP pair. Both players replay the SAME
   *  canonical simulate(attacker, defender); the flipped side mirrors the view so
   *  their team still shows at the bottom. Guarantees identical outcomes on every
   *  screen (no per-perspective re-sim divergence). */
  flip?: boolean;
  won: boolean;
  survivors: number;
  dmg: number;
  selfBoard?: UnitInstance[];
  oppBoard?: UnitInstance[];
};

/** Snapshot of a player's local economy — synced so a refresh can rehydrate. */
export type PlayerSave = {
  gold: number;
  xp: number;
  level: number;
  units: UnitInstance[];
  shop: (string | null)[];
  items: string[];
};

export type RoomRules = {
  startingHp: number;
  maxPlayers: number;
  generations?: number[];
  itemsEnabled?: string[];
  /** How many mons are randomly drawn from the eligible pool for this game. */
  draftPoolSize?: number;
  /** Whether augment rounds are offered (default true). */
  augmentsEnabled?: boolean;
  /** Drive phase transitions from the dedicated server (#110) instead of the host
   *  client. Off by default during rollout. */
  serverDriven?: boolean;
  /** Private lobby — kept out of the public game browser (friends can still join). */
  isPrivate?: boolean;
};

export type Room = {
  code: string;
  meta: RoomMeta;
  rules: RoomRules;
  players: Record<string, RoomPlayer>;
  combat?: Record<string, CombatAssign>;
  /** Carousel round: per-player free-pick options (unit ids / mega-stone). */
  carousel?: Record<string, string[]>;
};

/** Lightweight discovery entry for the game browser (lobbies/{code}). */
export type LobbySummary = {
  code: string;
  host: string;
  players: number;
  max: number;
  gens: number[];
  createdAt: number;
};

type Status = "idle" | "connecting" | "connected" | "error";

type RoomState = {
  code: string | null;
  myUid: string | null;
  /** Reactive room used for RENDER — updated only when a render-meaningful field
   *  changes (NOT on the 700ms heartbeat), so the game tree doesn't re-render
   *  every heartbeat. */
  room: Room | null;
  /** Always-fresh snapshot (incl. meta.hostBeat) for the host loop / failover.
   *  Read via getState() — nothing subscribes to it for render. */
  liveRoom: Room | null;
  /** My private econ snapshot (priv/{code}/{uid}). undefined while loading. */
  mySave: PlayerSave | null | undefined;
  status: Status;
  error: string | null;
  /** True while reconnect() is re-attaching to a saved room after a refresh. */
  reconnecting: boolean;
  /** Open games available to browse/join (from the lobbies index). */
  lobbies: LobbySummary[];
  /** Subscribe / unsubscribe to the open-games list (game browser). */
  watchLobbies: () => void;
  unwatchLobbies: () => void;
  /** Host: keep the lobbies-index entry fresh (player count) or remove it. */
  publishLobby: (players: number) => void;
  removeLobby: () => void;
  /** Clear my own private econ snapshot — called on entering the lobby so a
   *  "Play again" rematch in the same room can't restore the previous game. */
  clearMySave: () => void;

  host: (name: string, rules?: Partial<RoomRules>) => Promise<string | null>;
  join: (code: string, name: string) => Promise<boolean>;
  setReady: (ready: boolean) => void;
  updateMe: (patch: Partial<RoomPlayer>) => void;
  setMeta: (patch: Partial<RoomMeta>) => void;
  setRules: (patch: Partial<RoomRules>) => void;
  /** Host: add an AI bot to a free slot. */
  addBot: (difficulty: BotDifficulty) => void;
  /** Host: remove a player or bot from the lobby. */
  removePlayer: (uid: string) => void;
  /** Re-attach to the room saved in this tab (after a page refresh). */
  reconnect: () => Promise<void>;
  leave: () => void;
};

let unsub: (() => void) | null = null;
let privUnsub: (() => void) | null = null;
let privWatchdog: ReturnType<typeof setTimeout> | null = null;

let lobbiesUnsub: (() => void) | null = null;

/** Surface (don't swallow) RTDB write rejections — a silent failure during a
 *  game looks like a freeze with no signal. */
const onWriteErr = (e: unknown) => console.error("[rtdb-write]", e);

/** A room read is only usable if it has the core shape. Guards against malformed
 *  or partially-written nodes crashing the client on join/reconnect. */
function isValidRoom(d: unknown): d is Room {
  return !!d && typeof d === "object" && !!(d as Room).meta && typeof (d as Room).meta === "object" && !!(d as Room).players;
}

const ROOM_KEY = "poketft_room";
function rememberRoom(code: string) {
  if (typeof window !== "undefined") window.sessionStorage.setItem(ROOM_KEY, code);
}
function forgetRoom() {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(ROOM_KEY);
}

function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function roomRef(code: string): DatabaseReference {
  return ref(db(), `games/${code}`);
}

function newPlayer(uid: string, name: string, isHost: boolean, startingHp: number): RoomPlayer {
  const photoURL = useAuth.getState().profile?.photoURL ?? null;
  return { uid, name, isHost, connected: true, ready: isHost, photoURL, hp: startingHp, level: 1, alive: true, place: null, streak: 0 };
}

export const useRoom = create<RoomState>((setState, getState) => ({
  code: null,
  myUid: null,
  room: null,
  liveRoom: null,
  /** My own private econ snapshot (from priv/{code}/{uid}). `undefined` = still
   *  loading; `null` = loaded but empty (fresh game). Used to rehydrate on
   *  reconnect without exposing my gold/shop to opponents. */
  mySave: undefined,
  status: "idle",
  error: null,
  reconnecting: false,
  lobbies: [],

  watchLobbies: () => {
    if (lobbiesUnsub) return;
    lobbiesUnsub = onValue(ref(db(), "lobbies"), (snap) => {
      const val = (snap.val() ?? {}) as Record<string, LobbySummary>;
      const list = Object.values(val).filter((l) => l && l.code).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      setState({ lobbies: list });
    });
  },
  unwatchLobbies: () => { if (lobbiesUnsub) { lobbiesUnsub(); lobbiesUnsub = null; } setState({ lobbies: [] }); },
  publishLobby: (players) => {
    const { code, room, myUid } = getState();
    if (!code || !room || !myUid || room.meta.hostUid !== myUid) return;
    // Write the COMPLETE summary every time — the browser filters on `code`, so a
    // partial write (host/players only) would make the lobby invisible. createdAt
    // is set once (only if missing) so the browse-order doesn't churn each update.
    const r = room.rules ?? ({} as Room["rules"]);
    const max = Math.max(1, Math.min(8, r.maxPlayers ?? 8)); // keep inside the rules' .validate range
    update(ref(db(), `lobbies/${code}`), {
      code,
      players: Math.max(0, Math.min(8, players)),
      host: (room.players[myUid]?.name ?? "Host").slice(0, 24),
      max,
      gens: r.generations ?? [1],
    }).catch(onWriteErr);
    // Stamp createdAt only if the entry doesn't have one yet (keeps sort stable).
    get(ref(db(), `lobbies/${code}/createdAt`)).then((s) => {
      if (!s.exists()) update(ref(db(), `lobbies/${code}`), { createdAt: serverTimestamp() }).catch(onWriteErr);
    }).catch(() => {});
  },
  removeLobby: () => {
    const { code } = getState();
    if (code) remove(ref(db(), `lobbies/${code}`)).catch(() => {});
  },
  clearMySave: () => {
    const { code, myUid } = getState();
    if (code && myUid) remove(ref(db(), `priv/${code}/${myUid}`)).catch(() => {});
    setState({ mySave: null });
  },

  host: async (name, rules) => {
    setState({ status: "connecting", error: null });
    try {
      const uid = await ensureAuth();
      const startingHp = rules?.startingHp ?? 100;
      const maxPlayers = rules?.maxPlayers ?? 8;
      const code = genCode();
      await set(roomRef(code), {
        meta: { hostUid: uid, phase: "lobby", stage: 1, round: 1, deadline: 0, updatedAt: serverTimestamp() },
        rules: { startingHp, maxPlayers, generations: rules?.generations ?? [1], itemsEnabled: rules?.itemsEnabled ?? [], draftPoolSize: rules?.draftPoolSize ?? 60, augmentsEnabled: rules?.augmentsEnabled !== false, serverDriven: true, isPrivate: rules?.isPrivate === true },
        players: { [uid]: newPlayer(uid, name || "Host", true, startingHp) },
      });
      subscribe(code, uid, setState);
      // Drop our player entry if we disconnect.
      onDisconnect(ref(db(), `games/${code}/players/${uid}/connected`)).set(false);
      // Publish to the game browser so others can find + join without a code.
      const lobbyRef = ref(db(), `lobbies/${code}`);
      const lobbyMax = Math.max(1, Math.min(8, maxPlayers)); // stay inside the .validate range so the write isn't rejected
      await set(lobbyRef, { code, host: (name || "Host").slice(0, 24), players: 1, max: lobbyMax, gens: rules?.generations ?? [1], createdAt: serverTimestamp() }).catch(onWriteErr);
      onDisconnect(lobbyRef).remove();
      setState({ code, myUid: uid, status: "connected" });
      setCurrentGame(uid, code);
      rememberRoom(code);
      return code;
    } catch (e) {
      setState({ status: "error", error: (e as Error).message });
      return null;
    }
  },

  join: async (code, name) => {
    code = code.trim().toUpperCase();
    setState({ status: "connecting", error: null });
    try {
      const uid = await ensureAuth();
      const snap = await get(roomRef(code));
      if (!snap.exists()) {
        setState({ status: "error", error: "Lobby not found" });
        return false;
      }
      const data = snap.val();
      if (!isValidRoom(data)) {
        setState({ status: "error", error: "Lobby not found" });
        return false;
      }
      const count = Object.values(data.players ?? {}).filter((p) => p.connected).length;
      if (count >= (data.rules?.maxPlayers ?? 8)) {
        setState({ status: "error", error: "Lobby is full" });
        return false;
      }
      if (data.meta?.phase !== "lobby") {
        setState({ status: "error", error: "Game already started" });
        return false;
      }
      await update(ref(db(), `games/${code}/players/${uid}`), newPlayer(uid, name || "Player", false, data.rules.startingHp));
      subscribe(code, uid, setState);
      onDisconnect(ref(db(), `games/${code}/players/${uid}/connected`)).set(false);
      setState({ code, myUid: uid, status: "connected" });
      setCurrentGame(uid, code);
      rememberRoom(code);
      return true;
    } catch (e) {
      setState({ status: "error", error: (e as Error).message });
      return false;
    }
  },

  setReady: (ready) => getState().updateMe({ ready }),

  addBot: (difficulty) => {
    const { code, room } = getState();
    if (!code || !room) return;
    const count = Object.values(room.players ?? {}).filter((p) => p.connected).length;
    if (count >= (room.rules?.maxPlayers ?? 8)) return;
    const id = "bot-" + Math.random().toString(36).slice(2, 8);
    update(ref(db(), `games/${code}/players/${id}`), {
      uid: id, name: `AI ${difficulty}`, isHost: false, connected: true, ready: true,
      isBot: true, botDifficulty: difficulty,
      hp: room.rules?.startingHp ?? 100, level: 1, alive: true, place: null, streak: 0,
    }).catch(onWriteErr);
  },

  removePlayer: (uid) => {
    const { code } = getState();
    if (!code) return;
    remove(ref(db(), `games/${code}/players/${uid}`)).catch(onWriteErr);
  },

  updateMe: (patch) => {
    const { code, myUid } = getState();
    if (!code || !myUid) return;
    update(ref(db(), `games/${code}/players/${myUid}`), patch).catch(onWriteErr);
  },

  setMeta: (patch) => {
    const { code } = getState();
    if (!code) return;
    update(ref(db(), `games/${code}/meta`), { ...patch, updatedAt: serverTimestamp() }).catch(onWriteErr);
  },

  setRules: (patch) => {
    const { code } = getState();
    if (!code) return;
    update(ref(db(), `games/${code}/rules`), patch).catch(onWriteErr);
  },

  reconnect: async () => {
    if (typeof window === "undefined") return;
    if (getState().code) return; // already connected
    const code = window.sessionStorage.getItem(ROOM_KEY);
    if (!code) return;
    setState({ reconnecting: true });
    try {
      const uid = await ensureAuth();
      const snap = await get(roomRef(code));
      if (!snap.exists() || !isValidRoom(snap.val())) { forgetRoom(); setState({ reconnecting: false }); return; }
      const data = snap.val() as Room;
      if (!data.players?.[uid]) {
        // We're no longer in this room (removed, or it moved on) — drop it.
        forgetRoom();
        setState({ reconnecting: false });
        return;
      }
      await update(ref(db(), `games/${code}/players/${uid}`), { connected: true });
      subscribe(code, uid, setState);
      onDisconnect(ref(db(), `games/${code}/players/${uid}/connected`)).set(false);
      setState({ code, myUid: uid, status: "connected", reconnecting: false });
      setCurrentGame(uid, code);
    } catch {
      forgetRoom();
      setState({ reconnecting: false });
    }
  },

  leave: () => {
    const { code, myUid, room } = getState();
    if (unsub) { unsub(); unsub = null; }
    if (privUnsub) { privUnsub(); privUnsub = null; }
    if (privWatchdog) { clearTimeout(privWatchdog); privWatchdog = null; }
    if (myUid) setCurrentGame(myUid, null);
    if (code && myUid) {
      const otherHumans = Object.values(room?.players ?? {}).filter((p) => !p.isBot && p.uid !== myUid);
      const phase = room?.meta?.phase;
      const iAmHost = room?.meta?.hostUid === myUid;
      const inMatch = phase === "planning" || phase === "combat" || phase === "carousel";
      if (iAmHost && inMatch) {
        // Host quit mid-match → force-end for EVERYONE. Write an authoritative over
        // state every client observes (endedByHost flags the banner), rather than
        // dropping our node and letting the game limp on under a migrated host.
        update(ref(db(), `games/${code}/meta`), { phase: "over", endedByHost: true, updatedAt: serverTimestamp() }).catch(onWriteErr);
        remove(ref(db(), `lobbies/${code}`)).catch(() => {});
      } else {
        // Only delete the WHOLE room when it's safe: no other human player nodes at
        // all AND we're not mid-match. Otherwise just drop our own node (a backgrounded
        // human shows connected:false — deleting on that would nuke a live game).
        const safeToDelete = otherHumans.length === 0 && (phase === "lobby" || phase === "over" || !phase);
        if (safeToDelete) remove(roomRef(code)).catch(onWriteErr);
        else remove(ref(db(), `games/${code}/players/${myUid}`)).catch(onWriteErr);
        if (iAmHost || otherHumans.length === 0) remove(ref(db(), `lobbies/${code}`)).catch(() => {});
      }
      // Always clear my own private econ node (rules only let me write my own).
      remove(ref(db(), `priv/${code}/${myUid}`)).catch(() => {});
    }
    forgetRoom();
    setState({ code: null, myUid: null, room: null, mySave: undefined, status: "idle", error: null });
  },
}));

/** Signature of the RENDER-meaningful room fields — everything EXCEPT the
 *  high-churn `meta.hostBeat` / `meta.updatedAt`, which only the host loop cares
 *  about. When two snapshots share this signature, the only change was a
 *  heartbeat, so we must NOT bump the reactive `room` (that would re-render the
 *  whole game tree ~every 700ms). */
function roomSig(room: Room): string {
  const m = room.meta as Record<string, unknown>;
  const meta = { ...m, hostBeat: 0, updatedAt: 0 };
  return JSON.stringify({ meta, players: room.players, combat: room.combat, carousel: room.carousel, rules: room.rules });
}
let lastSig: string | null = null;

function subscribe(code: string, uid: string, setState: (p: Partial<RoomState>) => void) {
  if (unsub) unsub();
  if (privUnsub) privUnsub();
  lastSig = null;
  // Listen to my OWN private econ snapshot (priv/{code}/{uid}) — readable only by
  // me — so a refresh can rehydrate gold/shop/items without ever exposing them to
  // opponents. undefined → null/value once it loads (gates reconnect fresh-start).
  if (privWatchdog) clearTimeout(privWatchdog);
  setState({ mySave: undefined });
  privUnsub = onValue(ref(db(), `priv/${code}/${uid}`), (snap) => {
    setState({ mySave: (snap.val()?.save ?? null) as PlayerSave | null });
  }, () => setState({ mySave: null }));
  // Watchdog: onValue's error callback only fires on permission-denied, NOT on a
  // network stall — so a stalled priv read would leave mySave `undefined` forever,
  // gating first-planning and never running newGame (shop falls back to all-547,
  // no economy). If neither callback resolved within 6s, treat it as empty (fresh).
  // Gated on `code` so a stale watchdog from a previous room can't clobber a new
  // game's in-flight restore (the timer is also cleared on re-subscribe + leave).
  // 15s (not 6s): on a genuinely fresh game the priv path doesn't exist so onValue
  // fires `null` almost instantly — this watchdog only matters for a real network
  // stall. Firing it too early on a slow reconnect would declare "no save" while the
  // real save is still in flight, fresh-starting an in-progress game. The client's
  // self-heal re-imports a late save, but a longer fuse avoids the churn entirely.
  privWatchdog = setTimeout(() => {
    const s = useRoom.getState();
    if (s.code === code && s.mySave === undefined) setState({ mySave: null });
  }, 15000);
  const r = roomRef(code);
  unsub = onValue(r, (snap) => {
    if (!snap.exists()) {
      lastSig = null;
      setState({ room: null, liveRoom: null });
      return;
    }
    const val = snap.val();
    if (!val || typeof val !== "object" || !val.meta) return; // ignore malformed snapshots
    const next: Room = {
      code,
      meta: val.meta,
      rules: val.rules ?? { startingHp: 100, maxPlayers: 8 },
      players: val.players ?? {},
      combat: val.combat ?? {},
      carousel: val.carousel ?? {},
    };
    const sig = roomSig(next);
    if (sig !== lastSig) {
      // A render-meaningful change: update both the reactive room and the live one.
      lastSig = sig;
      setState({ room: next, liveRoom: next });
    } else {
      // Heartbeat-only churn: keep the host loop's snapshot fresh, but DON'T
      // re-render `room` subscribers.
      setState({ liveRoom: next });
    }
  });
  // mark ourselves connected (in case of rejoin) — swallow transient
  // permission/offline rejections so they don't surface as unhandled rejections.
  update(ref(db(), `games/${code}/players/${uid}`), { connected: true }).catch(onWriteErr);
}
