/**
 * Database adapter (server-build Phase 0).
 *
 * The authoritative match logic in `match.ts` talks to the DB only through this small
 * interface — `get` / `update` / `transaction` over string paths — so the SAME code can
 * run with the Firebase **Web SDK** (the client, today) or **firebase-admin** (a future
 * dedicated server) by swapping the adapter. No behavior change on the client: the Web
 * impl is the default and is a thin, semantics-preserving wrapper over the SDK calls
 * match.ts used directly before.
 */
import { ref, get as fbGet, update as fbUpdate, runTransaction } from "firebase/database";
import { db } from "./firebase";

export interface DbAdapter {
  /** Read a path once. Returns its value, or null if it doesn't exist. */
  get<T = unknown>(path: string): Promise<T | null>;
  /** Multi-path update rooted at `path` (keys may be nested 'a/b' sub-paths). */
  update(path: string, value: Record<string, unknown>): Promise<void>;
  /** Atomic transaction at `path`: `fn` gets the current value and returns the new one
   *  (or undefined to abort). Resolves with the committed flag + final value. */
  transaction<T = unknown>(
    path: string,
    fn: (cur: T | null) => T | null | undefined,
  ): Promise<{ committed: boolean; value: T | null }>;
}

/** Firebase Web-SDK implementation — the client default. */
export const webDbAdapter: DbAdapter = {
  async get(path) {
    const snap = await fbGet(ref(db(), path));
    return snap.exists() ? snap.val() : null;
  },
  async update(path, value) {
    await fbUpdate(ref(db(), path), value);
  },
  async transaction(path, fn) {
    const res = await runTransaction(ref(db(), path), (cur) => fn(cur) as unknown);
    return { committed: res.committed, value: res.snapshot.exists() ? res.snapshot.val() : null };
  },
};

let current: DbAdapter = webDbAdapter;

/** The adapter match.ts uses. Defaults to the Web SDK; the server swaps it at startup. */
export function dbAdapter(): DbAdapter {
  return current;
}

/** Swap the adapter (the dedicated server calls this with a firebase-admin impl). */
export function setDbAdapter(a: DbAdapter): void {
  current = a;
}
