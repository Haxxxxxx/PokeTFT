import { ref, update } from "firebase/database";
import { db } from "./firebase";
import { serverNow } from "./serverTime";
import { simulate } from "../engine/combat";
import { makeRng } from "../engine/rng";
import { advanceRound, stageBaseDamage } from "../config";
import type { UnitInstance } from "../types";
import type { Room, RoomPlayer, CombatAssign } from "./roomStore";

export const PLAN_MS = 30_000;
export const COMBAT_MS = 16_000;

type Updates = Record<string, unknown>;

function gamePath(code: string) {
  return ref(db(), `games/${code}`);
}

/** Deterministic shuffle (so all clients could reproduce a pairing if needed). */
function shuffled<T>(arr: T[], seed: number): T[] {
  const rng = makeRng(seed >>> 0);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function board(p: RoomPlayer | undefined): UnitInstance[] {
  return (p?.board ?? []).filter((u) => u && u.pos);
}

/** Host: start the match — reset every connected player and open round 1 planning. */
export async function beginMatch(code: string, room: Room): Promise<void> {
  const hp = room.rules?.startingHp ?? 100;
  const u: Updates = {
    "meta/phase": "planning",
    "meta/stage": 1,
    "meta/round": 1,
    "meta/deadline": serverNow() + PLAN_MS,
    combat: null,
  };
  for (const p of Object.values(room.players ?? {})) {
    if (!p.connected) continue;
    u[`players/${p.uid}/hp`] = hp;
    u[`players/${p.uid}/level`] = 1;
    u[`players/${p.uid}/alive`] = true;
    u[`players/${p.uid}/place`] = null;
    u[`players/${p.uid}/streak`] = 0;
    u[`players/${p.uid}/board`] = null;
  }
  await update(gamePath(code), u);
}

/** Client: push my current on-board units so the host can resolve combat. */
export async function syncBoard(code: string, uid: string, units: UnitInstance[]): Promise<void> {
  const onBoard = units.filter((un) => un.pos !== null);
  await update(ref(db(), `games/${code}/players/${uid}`), { board: onBoard });
}

/** Host: drive phase transitions when the shared deadline passes. */
export async function hostTick(code: string, room: Room): Promise<void> {
  const now = serverNow();
  const phase = room.meta?.phase;
  if (phase === "planning" && now >= room.meta.deadline) await startCombat(code, room);
  else if (phase === "combat" && now >= room.meta.deadline) await endCombat(code, room);
}

function assign(combat: Record<string, CombatAssign>, room: Room, aUid: string, bUid: string, stage: number, ghost: boolean) {
  const r = simulate(board(room.players[aUid]), board(room.players[bUid]));
  const aWon = r.winner === "ally";
  const bWon = r.winner === "enemy";
  combat[aUid] = {
    oppUid: bUid,
    oppName: (room.players[bUid]?.name ?? "Rival") + (ghost ? " (ghost)" : ""),
    ghost,
    won: aWon,
    survivors: aWon ? 0 : r.survivors,
    dmg: aWon ? 0 : stageBaseDamage(stage) + r.survivors,
  };
  if (!ghost) {
    combat[bUid] = {
      oppUid: aUid,
      oppName: room.players[aUid]?.name ?? "Rival",
      ghost: false,
      won: bWon,
      survivors: bWon ? 0 : r.survivors,
      dmg: bWon ? 0 : stageBaseDamage(stage) + r.survivors,
    };
  }
}

async function startCombat(code: string, room: Room): Promise<void> {
  const alive = Object.values(room.players ?? {}).filter((p) => p.connected && p.alive);
  const stage = room.meta.stage;
  const order = shuffled(alive.map((p) => p.uid).sort(), stage * 131 + room.meta.round);
  const combat: Record<string, CombatAssign> = {};

  for (let i = 0; i < order.length; i += 2) {
    const a = order[i];
    if (i + 1 < order.length) {
      assign(combat, room, a, order[i + 1], stage, false);
    } else if (order.length > 1) {
      assign(combat, room, a, order[i - 1], stage, true); // odd one out fights a ghost
    } else {
      combat[a] = { oppUid: a, oppName: "—", ghost: true, won: true, survivors: 0, dmg: 0 }; // solo: free round
    }
  }

  const u: Updates = { "meta/phase": "combat", "meta/deadline": serverNow() + COMBAT_MS, "meta/updatedAt": serverNow() };
  for (const uid of Object.keys(combat)) u[`combat/${uid}`] = combat[uid];
  await update(gamePath(code), u);
}

async function endCombat(code: string, room: Room): Promise<void> {
  const combat = room.combat ?? {};
  const u: Updates = {};
  const aliveUids = Object.values(room.players ?? {}).filter((p) => p.connected && p.alive).map((p) => p.uid);
  const hpAfter: Record<string, number> = {};

  for (const uid of aliveUids) {
    const p = room.players[uid];
    const c = combat[uid];
    const dmg = c?.dmg ?? 0;
    const hp = Math.max(0, p.hp - dmg);
    hpAfter[uid] = hp;
    u[`players/${uid}/hp`] = hp;
    if (c) {
      const s = p.streak ?? 0;
      u[`players/${uid}/streak`] = c.won ? (s >= 0 ? s + 1 : 1) : (s <= 0 ? s - 1 : -1);
    }
  }

  const surviving = aliveUids.filter((uid) => hpAfter[uid] > 0);
  const dead = aliveUids.filter((uid) => hpAfter[uid] <= 0);
  for (const uid of dead) {
    u[`players/${uid}/alive`] = false;
    u[`players/${uid}/place`] = surviving.length + 1;
  }

  if (surviving.length <= 1) {
    if (surviving.length === 1) u[`players/${surviving[0]}/place`] = 1;
    u["meta/phase"] = "over";
  } else {
    const next = advanceRound(room.meta.stage, room.meta.round);
    u["meta/phase"] = "planning";
    u["meta/stage"] = next.stage;
    u["meta/round"] = next.round;
    u["meta/deadline"] = serverNow() + PLAN_MS;
    u["combat"] = null;
  }
  u["meta/updatedAt"] = serverNow();
  await update(gamePath(code), u);
}

/** If the host has dropped, the lowest-uid connected player claims the host role. */
export async function maybeClaimHost(code: string, room: Room, myUid: string): Promise<void> {
  const host = room.players?.[room.meta?.hostUid];
  if (host?.connected) return;
  const connected = Object.values(room.players ?? {}).filter((p) => p.connected).map((p) => p.uid).sort();
  if (connected[0] === myUid) {
    await update(ref(db(), `games/${code}/meta`), { hostUid: myUid });
  }
}
