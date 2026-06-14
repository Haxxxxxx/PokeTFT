"use client";

import { create } from "zustand";
import {
  ref, set, update, get, onValue, onDisconnect, remove, serverTimestamp, type DatabaseReference,
} from "firebase/database";
import { db, ensureAuth } from "./firebase";
import type { UnitInstance } from "../types";

export type RoomPhase = "lobby" | "playing" | "over";

export type RoomPlayer = {
  uid: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
  /** Live game state (synced once the match starts). */
  hp: number;
  level: number;
  alive: boolean;
  place: number | null;
  /** Locked board for the current combat round (Phase C). */
  board?: UnitInstance[];
};

export type RoomMeta = {
  hostUid: string;
  phase: RoomPhase;
  stage: number;
  round: number;
  updatedAt: number | object;
};

export type Room = {
  code: string;
  meta: RoomMeta;
  rules: { startingHp: number; maxPlayers: number };
  players: Record<string, RoomPlayer>;
};

type Status = "idle" | "connecting" | "connected" | "error";

type RoomState = {
  code: string | null;
  myUid: string | null;
  room: Room | null;
  status: Status;
  error: string | null;

  host: (name: string, rules?: { startingHp?: number; maxPlayers?: number }) => Promise<string | null>;
  join: (code: string, name: string) => Promise<boolean>;
  setReady: (ready: boolean) => void;
  updateMe: (patch: Partial<RoomPlayer>) => void;
  setMeta: (patch: Partial<RoomMeta>) => void;
  leave: () => void;
};

let unsub: (() => void) | null = null;

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
  return { uid, name, isHost, connected: true, ready: isHost, hp: startingHp, level: 1, alive: true, place: null };
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
        meta: { hostUid: uid, phase: "lobby", stage: 1, round: 1, updatedAt: serverTimestamp() },
        rules: { startingHp, maxPlayers },
        players: { [uid]: newPlayer(uid, name || "Host", true, startingHp) },
      });
      subscribe(code, uid, setState);
      // Drop our player entry if we disconnect.
      onDisconnect(ref(db(), `games/${code}/players/${uid}/connected`)).set(false);
      setState({ code, myUid: uid, status: "connected" });
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
      const data = snap.val() as Room;
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
      return true;
    } catch (e) {
      setState({ status: "error", error: (e as Error).message });
      return false;
    }
  },

  setReady: (ready) => getState().updateMe({ ready }),

  updateMe: (patch) => {
    const { code, myUid } = getState();
    if (!code || !myUid) return;
    update(ref(db(), `games/${code}/players/${myUid}`), patch);
  },

  setMeta: (patch) => {
    const { code } = getState();
    if (!code) return;
    update(ref(db(), `games/${code}/meta`), { ...patch, updatedAt: serverTimestamp() });
  },

  leave: () => {
    const { code, myUid } = getState();
    if (unsub) { unsub(); unsub = null; }
    if (code && myUid) remove(ref(db(), `games/${code}/players/${myUid}`));
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
    setState({
      room: {
        code,
        meta: val.meta,
        rules: val.rules ?? { startingHp: 100, maxPlayers: 8 },
        players: val.players ?? {},
      },
    });
  });
  // mark ourselves connected (in case of rejoin)
  update(ref(db(), `games/${code}/players/${uid}`), { connected: true });
}
