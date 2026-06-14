"use client";

import { create } from "zustand";
import {
  ref, set, update, get, onValue, onDisconnect, remove, serverTimestamp, type DatabaseReference,
} from "firebase/database";
import { db, ensureAuth } from "./firebase";
import type { UnitInstance } from "../types";

export type RoomPhase = "lobby" | "planning" | "combat" | "carousel" | "over";

export type BotDifficulty = "easy" | "medium" | "hard";

export type RoomPlayer = {
  uid: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
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
  /** The player's current on-board units (synced during planning). */
  board?: UnitInstance[];
  /** Full economy snapshot for reconnect (synced during planning). */
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

type Status = "idle" | "connecting" | "connected" | "error";

type RoomState = {
  code: string | null;
  myUid: string | null;
  room: Room | null;
  status: Status;
  error: string | null;

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
  return { uid, name, isHost, connected: true, ready: isHost, hp: startingHp, level: 1, alive: true, place: null, streak: 0 };
}

export const useRoom = create<RoomState>((setState, getState) => ({
  code: null,
  myUid: null,
  room: null,
  status: "idle",
  error: null,

  host: async (name, rules) => {
    setState({ status: "connecting", error: null });
    try {
      const uid = await ensureAuth();
      const startingHp = rules?.startingHp ?? 100;
      const maxPlayers = rules?.maxPlayers ?? 8;
      const code = genCode();
      await set(roomRef(code), {
        meta: { hostUid: uid, phase: "lobby", stage: 1, round: 1, deadline: 0, updatedAt: serverTimestamp() },
        rules: { startingHp, maxPlayers, generations: rules?.generations ?? [1], itemsEnabled: rules?.itemsEnabled ?? [] },
        players: { [uid]: newPlayer(uid, name || "Host", true, startingHp) },
      });
      subscribe(code, uid, setState);
      // Drop our player entry if we disconnect.
      onDisconnect(ref(db(), `games/${code}/players/${uid}/connected`)).set(false);
      setState({ code, myUid: uid, status: "connected" });
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
    try {
      const uid = await ensureAuth();
      const snap = await get(roomRef(code));
      if (!snap.exists() || !isValidRoom(snap.val())) { forgetRoom(); return; }
      const data = snap.val() as Room;
      if (!data.players?.[uid]) {
        // We're no longer in this room (removed, or it moved on) — drop it.
        forgetRoom();
        return;
      }
      await update(ref(db(), `games/${code}/players/${uid}`), { connected: true });
      subscribe(code, uid, setState);
      onDisconnect(ref(db(), `games/${code}/players/${uid}/connected`)).set(false);
      setState({ code, myUid: uid, status: "connected" });
    } catch {
      forgetRoom();
    }
  },

  leave: () => {
    const { code, myUid, room } = getState();
    if (unsub) { unsub(); unsub = null; }
    if (code && myUid) {
      // If I'm the last connected human, delete the whole room so abandoned games
      // don't accumulate in RTDB. Otherwise just drop my player node.
      const otherHumans = Object.values(room?.players ?? {}).filter((p) => p.connected && !p.isBot && p.uid !== myUid);
      if (otherHumans.length === 0) remove(roomRef(code)).catch(onWriteErr);
      else remove(ref(db(), `games/${code}/players/${myUid}`)).catch(onWriteErr);
    }
    forgetRoom();
    setState({ code: null, myUid: null, room: null, status: "idle", error: null });
  },
}));

function subscribe(code: string, uid: string, setState: (p: Partial<RoomState>) => void) {
  if (unsub) unsub();
  const r = roomRef(code);
  unsub = onValue(r, (snap) => {
    if (!snap.exists()) {
      setState({ room: null });
      return;
    }
    const val = snap.val();
    if (!val || typeof val !== "object" || !val.meta) return; // ignore malformed snapshots
    setState({
      room: {
        code,
        meta: val.meta,
        rules: val.rules ?? { startingHp: 100, maxPlayers: 8 },
        players: val.players ?? {},
        combat: val.combat ?? {},
        carousel: val.carousel ?? {},
      },
    });
  });
  // mark ourselves connected (in case of rejoin)
  update(ref(db(), `games/${code}/players/${uid}`), { connected: true });
}
