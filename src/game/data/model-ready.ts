"use client";

import { useSyncExternalStore } from "react";
import type { ModelId } from "@/lab/arena3d/UnitModel";

/**
 * Which models have successfully loaded at least once this session.
 *
 * WHY THIS IS SHARED AND MODULE-LEVEL
 *
 * Board and CombatStage each kept their own `loadedModels` in component state,
 * keyed by `${unitInstanceId}:${dex}`. Both properties were wrong:
 *
 *   - Component state dies with the mount. Every combat round mounts a fresh
 *     CombatStage, so the set started EMPTY each time and every unit fell back
 *     to its 2D sprite until its model re-signalled ready.
 *   - Keying by unit instance meant the same species on a different unit — and
 *     combat units carry different ids from board units — counted as never
 *     loaded. So nothing learned during planning could ever apply to combat.
 *
 * Together those produced the visible symptom: 3D models on the bench and
 * through the planning phase, then 2D sprites the moment the fight started.
 *
 * Readiness genuinely belongs to the MODEL, not to the unit holding it, and it
 * outlives any one mount — drei's useGLTF already caches the parsed GLB for the
 * page's lifetime, so a model that loaded once is still in memory. This store
 * just stops the UI pretending otherwise.
 */

const ready = new Set<ModelId>();
const failed = new Set<ModelId>();
const listeners = new Set<() => void>();

// useSyncExternalStore compares snapshots by identity, so the snapshot has to
// be a value that changes only when the sets do — not a fresh object each call,
// which would re-render forever.
let version = 0;
function emit() {
  version++;
  for (const l of listeners) l();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}
const getSnapshot = () => version;
// The server has loaded nothing, and must report a stable snapshot.
const getServerSnapshot = () => 0;

export function markModelReady(model: ModelId): void {
  if (ready.has(model)) return;
  ready.add(model);
  failed.delete(model);
  emit();
}

export function markModelFailed(model: ModelId): void {
  if (failed.has(model)) return;
  failed.add(model);
  emit();
}

export function isModelReady(model: ModelId): boolean {
  return ready.has(model);
}

/** Subscribe a component to readiness changes. Returns a stable probe. */
export function useModelReady(): (model: ModelId) => boolean {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return isModelReady;
}

/** Test seam — there is no product path that should forget a loaded model. */
export function __resetModelReadyForTests(): void {
  ready.clear();
  failed.clear();
  emit();
}
