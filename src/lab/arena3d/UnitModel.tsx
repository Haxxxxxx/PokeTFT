"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { getDef } from "@/game/data/mons";
import { MEGA_FORMS } from "@/game/data/mega";
import {
  MODEL_POSES,
  MODEL_POSES_STORAGE_KEY,
  MODEL_POSES_UPDATED_EVENT,
  mergeModelPose,
  parseModelPoseMap,
  type ModelPose,
} from "@/game/data/model-poses";

export type ModelId = number | "fox" | "duck" | "brainstem";

const MODEL_BASE_URL = "https://raw.githubusercontent.com/Pokemon-3D-api/assets/main/models/opt";
const LAB_MODEL_URLS: Record<Exclude<ModelId, number>, string> = {
  fox: "/lab-models/Fox.glb",
  duck: "/lab-models/Duck.glb",
  brainstem: "/lab-models/BrainStem.glb",
};
// The asset folder indexes Megas by their species Dex number, not by the roster line.
const MEGA_MODEL_DEX_OVERRIDES: Record<string, number> = {
  onix: 208,
  scyther: 212,
  bagon: 373,
  beldum: 376,
  gible: 445,
  kyogre: 382,
  groudon: 383,
};
const MEGA_MODEL_DEX = new Map(
  Object.entries(MEGA_FORMS).map(([defId, form]) => [
    form.megaDex,
    MEGA_MODEL_DEX_OVERRIDES[defId] ?? (getDef(defId).dex[2] || getDef(defId).dex[0]),
  ]),
);
// Missing Mega assets use the matching regular model instead of making a 404 request.
const MEGA_MODEL_ASSETS = new Set([
  3, 15, 18, 65, 80, 94, 115, 121, 127, 130, 142, 160, 181, 208, 212, 214, 227,
  229, 248, 254, 257, 260, 282, 302, 303, 306, 308, 310, 319, 323, 334, 354, 359,
  362, 373, 376, 380, 381, 384, 428, 445, 448, 460, 475, 491, 530, 531, 604, 652,
  655, 658, 670, 718, 719, 720, 807,
]);

export const MODEL_TARGET_HEIGHT = 0.78;

function remoteModelUrl(dex: number): string {
  const megaBaseDex = MEGA_MODEL_DEX.get(dex);
  const fileDex = megaBaseDex ?? dex;
  const category = megaBaseDex == null
    ? "regular"
    : fileDex === 382 || fileDex === 383
      ? "primal"
      : MEGA_MODEL_ASSETS.has(fileDex)
        ? "mega"
        : "regular";
  return `${MODEL_BASE_URL}/${category}/${fileDex}.glb`;
}

function pickIdleClip(names: string[], mode: "board" | "combat"): string | undefined {
  const priorities = mode === "combat"
    ? [/battle.?wait/i, /battle.?idle/i, /default.?wait/i, /default.?idle/i, /idle/i, /stand/i, /wait/i, /breath/i]
    : [/default.?wait/i, /default.?idle/i, /idle/i, /stand/i, /wait/i, /breath/i, /battle.?wait/i];
  return names
    .map((name) => ({
      name,
      priority: priorities.findIndex((pattern) => pattern.test(name)),
      loopBonus: /loop/i.test(name) ? -0.25 : 0,
    }))
    .filter((entry) => entry.priority >= 0)
    .sort((a, b) => a.priority + a.loopBonus - (b.priority + b.loopBonus))[0]?.name;
}

function pickAttackClip(names: string[]): string | undefined {
  const candidates = names.filter((name) => /attack|hit|cast|fight|strike/i.test(name));
  return candidates.find((name) => /(^|[^a-z])attack0?1([^0-9]|$)/i.test(name))
    ?? candidates.find((name) => /attack/i.test(name) && !/rangeattack/i.test(name))
    ?? candidates.find((name) => /rangeattack0?1/i.test(name))
    ?? candidates.find((name) => /rangeattack/i.test(name))
    ?? candidates[0];
}

function poseOffsetsFor(
  model: THREE.Object3D,
  offsets: ModelPose["bones"],
): Map<THREE.Bone, [number, number, number]> {
  const result = new Map<THREE.Bone, [number, number, number]>();
  if (!offsets) return result;
  model.traverse((node) => {
    if (!(node instanceof THREE.Bone)) return;
    const offset = offsets[node.name];
    if (offset) result.set(node, offset);
  });
  return result;
}

function removeAppliedPoseOffsets(offsets: Map<THREE.Bone, [number, number, number]>) {
  for (const [bone, [x, y, z]] of offsets) {
    bone.rotation.x -= x;
    bone.rotation.y -= y;
    bone.rotation.z -= z;
  }
  offsets.clear();
}

function applyPoseOffsets(
  offsets: Map<THREE.Bone, [number, number, number]>,
  applied: Map<THREE.Bone, [number, number, number]>,
) {
  for (const [bone, [x, y, z]] of offsets) {
    bone.rotation.x += x;
    bone.rotation.y += y;
    bone.rotation.z += z;
    applied.set(bone, [x, y, z]);
  }
}

function cloneAnimationsForScene(
  animations: THREE.AnimationClip[],
  source: THREE.Object3D,
  clone: THREE.Object3D,
): THREE.AnimationClip[] {
  const sourceNodes: THREE.Object3D[] = [];
  const clonedNodes: THREE.Object3D[] = [];
  source.traverse((node) => sourceNodes.push(node));
  clone.traverse((node) => clonedNodes.push(node));

  if (sourceNodes.length !== clonedNodes.length) {
    throw new Error("Cloned 3D model hierarchy does not match its animation source.");
  }

  const uuidMap = new Map(sourceNodes.map((node, index) => [node.uuid, clonedNodes[index].uuid]));
  const rootBoneIds = new Set<string>();
  clone.traverse((node) => {
    if (!(node instanceof THREE.SkinnedMesh)) return;
    for (const bone of node.skeleton.bones) {
      if (!(bone.parent instanceof THREE.Bone)) {
        rootBoneIds.add(bone.uuid);
        rootBoneIds.add(bone.name);
      }
    }
  });

  return animations.map((animation) => {
    const clonedAnimation = animation.clone();
    clonedAnimation.tracks = clonedAnimation.tracks.map((track) => {
      const clonedTrack = track.clone();
      for (const [sourceUuid, clonedUuid] of uuidMap) {
        clonedTrack.name = clonedTrack.name.replaceAll(sourceUuid, clonedUuid);
      }
      return clonedTrack;
    }).filter((track) => {
      if (!/idle|stand|wait|breath/i.test(animation.name)) return true;
      const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
      return propertyName !== "position" || !rootBoneIds.has(nodeName);
    });
    return clonedAnimation;
  }).filter((animation) => animation.tracks.length > 0);
}

export function UnitModel({
  id, position, tint, dragging, fitToWidth, pose: poseOverride, actionKey, animationMode = "board", poseEditing = false, onLoaded, onBones,
}: {
  id: ModelId;
  position: [number, number, number];
  tint?: string;
  dragging: boolean;
  fitToWidth?: number;
  pose?: ModelPose;
  actionKey?: string;
  animationMode?: "board" | "combat";
  poseEditing?: boolean;
  onLoaded?: () => void;
  onBones?: (bones: THREE.Bone[], defaults: Map<THREE.Bone, THREE.Euler>) => void;
}) {
  const src = typeof id === "number" ? remoteModelUrl(id) : LAB_MODEL_URLS[id];
  const [draftPose, setDraftPose] = useState<ModelPose>();
  const pose = poseOverride ?? (
    typeof id === "number" ? mergeModelPose(MODEL_POSES[id], draftPose) : undefined
  );
  const { scene, animations } = useGLTF(src);
  const group = useRef<THREE.Group>(null);
  const motionGroup = useRef<THREE.Group>(null);
  const lastActionKey = useRef<string | undefined>(undefined);
  const attackStartedAt = useRef(Number.NEGATIVE_INFINITY);
  const attackEndsAt = useRef(Number.NEGATIVE_INFINITY);
  const attackTimer = useRef<number | null>(null);
  const appliedPoseOffsets = useRef(new Map<THREE.Bone, [number, number, number]>());
  const poseOffsets = useRef(new Map<THREE.Bone, [number, number, number]>());
  const invalidate = useThree((state) => state.invalidate);

  useEffect(function syncDraftModelPose() {
    if (typeof id !== "number") return;
    const loadDraft = (eventValue?: string | null) => {
      try {
        const raw = eventValue === undefined
          ? window.localStorage.getItem(MODEL_POSES_STORAGE_KEY)
          : eventValue;
        if (!raw) {
          setDraftPose(undefined);
          return;
        }
        setDraftPose(parseModelPoseMap(raw)[id]);
      } catch (error) {
        console.error("Could not read locally saved Pokémon pose corrections.", error);
        setDraftPose(undefined);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === MODEL_POSES_STORAGE_KEY) loadDraft(event.newValue);
    };
    const onLocalUpdate = () => loadDraft();
    loadDraft();
    window.addEventListener("storage", onStorage);
    window.addEventListener(MODEL_POSES_UPDATED_EVENT, onLocalUpdate);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(MODEL_POSES_UPDATED_EVENT, onLocalUpdate);
    };
  }, [id]);

  const { model, modelAnimations, boneDefaults } = useMemo(() => {
    const c = cloneSkinned(scene);
    const boneDefaults = new Map<THREE.Bone, THREE.Euler>();
    c.updateMatrixWorld(true);
    c.traverse((node) => {
      if (node instanceof THREE.Bone) boneDefaults.set(node, node.rotation.clone());
      if (!(node instanceof THREE.SkinnedMesh)) return;
      node.skeleton.update();
      node.computeBoundingBox();
    });
    const box = new THREE.Box3().setFromObject(c);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (!Number.isFinite(size.y) || size.y <= 1e-6) {
      throw new Error(`3D model ${id} has invalid geometry bounds.`);
    }
    const heightScale = MODEL_TARGET_HEIGHT / size.y;
    const widthScale = fitToWidth == null ? 1 : Math.min(1, fitToWidth / (size.x * heightScale));
    c.scale.setScalar(heightScale * widthScale);

    const box2 = new THREE.Box3().setFromObject(c);
    c.position.x -= (box2.min.x + box2.max.x) / 2;
    c.position.y -= box2.min.y;
    c.position.z -= (box2.min.z + box2.max.z) / 2;

    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      if (tint) {
        const base = m.material as THREE.MeshStandardMaterial;
        const mat = base.clone();
        mat.emissive = new THREE.Color(tint);
        mat.emissiveIntensity = dragging ? 0.45 : 0.08;
        m.material = mat;
      }
    });
    return {
      model: c,
      modelAnimations: cloneAnimationsForScene(animations, scene, c),
      boneDefaults,
    };
  }, [animations, id, scene, tint, dragging, fitToWidth]);

  const { actions, names } = useAnimations(modelAnimations, group);
  const idleAnimation = pickIdleClip(names, animationMode);
  const attackAnimation = pickAttackClip(names);

  useEffect(() => {
    if (!actionKey || lastActionKey.current === actionKey) return;
    lastActionKey.current = actionKey;
    attackStartedAt.current = performance.now() / 1000;

    const idleAction = idleAnimation ? actions[idleAnimation] : undefined;
    const attackAction = attackAnimation ? actions[attackAnimation] : undefined;
    idleAction?.fadeOut(0.08);

    if (attackAction) {
      attackAction.reset().setLoop(THREE.LoopOnce, 1);
      attackAction.fadeIn(0.04).play();
      attackEndsAt.current = attackStartedAt.current + attackAction.getClip().duration;
    } else {
      attackEndsAt.current = attackStartedAt.current + 0.34;
    }

    if (attackTimer.current !== null) window.clearTimeout(attackTimer.current);
    attackTimer.current = window.setTimeout(() => {
      attackAction?.fadeOut(0.12);
      idleAction?.reset().fadeIn(0.12).play();
      invalidate();
      attackTimer.current = null;
    }, Math.max(100, (attackEndsAt.current - attackStartedAt.current) * 1000));
    invalidate();
  }, [actionKey, actions, attackAnimation, idleAnimation, invalidate]);

  useEffect(function clearAttackTimerOnUnmount() {
    return function stopAttackTimer() {
      if (attackTimer.current !== null) window.clearTimeout(attackTimer.current);
    };
  }, []);

  useEffect(() => {
    poseOffsets.current = poseOffsetsFor(model, pose?.bones);
  }, [model, pose?.bones]);

  useFrame(() => {
    removeAppliedPoseOffsets(appliedPoseOffsets.current);
  }, -1);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const motion = motionGroup.current;
    if (motion) {
      const phase = (typeof id === "number" ? id : id.length) * 0.37;
      const wallTime = performance.now() / 1000;
      const actionProgress = (wallTime - attackStartedAt.current) / 0.34;
      const attack = actionProgress >= 0 && actionProgress <= 1
        ? Math.sin(Math.PI * actionProgress)
        : 0;
      if (attack > 0) {
        motion.rotation.set(attack * 0.12, 0, 0);
        motion.position.set(0, 0, attack * 0.035);
      } else if (!poseEditing && !idleAnimation) {
        motion.rotation.set(
          Math.sin(time * 0.72 + phase) * 0.009,
          Math.sin(time * 0.52 + phase) * 0.022,
          0,
        );
        motion.position.set(0, 0, 0);
      } else {
        motion.rotation.set(0, 0, 0);
        motion.position.set(0, 0, 0);
      }

      if (!poseEditing && !idleAnimation && modelAnimations.length === 0) {
        model.traverse((node) => {
          if (!(node instanceof THREE.Bone)) return;
          const base = boneDefaults.get(node);
          if (!base) return;
          node.rotation.copy(base);

          if (/head|neck/i.test(node.name)) node.rotation.x += Math.sin(time * 1.05 + phase) * 0.025;
          else if (/tail/i.test(node.name)) node.rotation.z += Math.sin(time * 1.35 + phase) * 0.065;
          else if (/wing/i.test(node.name)) node.rotation.z += Math.sin(time * 2.4 + phase) * 0.035;
          else if (/ear|feeler|antenna/i.test(node.name)) node.rotation.z += Math.sin(time * 1.7 + phase) * 0.025;
        });
      }
      if (!poseEditing) {
        applyPoseOffsets(poseOffsets.current, appliedPoseOffsets.current);
      }
      model.updateMatrixWorld(true);
      model.traverse((node) => {
        if (node instanceof THREE.SkinnedMesh) node.skeleton.update();
      });
    }
    invalidate();
  });

  useEffect(() => {
    onLoaded?.();
  }, [onLoaded]);

  useEffect(() => {
    if (!onBones) return;
    const bones: THREE.Bone[] = [];
    model.traverse((node) => {
      if (node instanceof THREE.Bone) bones.push(node);
    });
    onBones(bones, boneDefaults);
  }, [boneDefaults, model, onBones]);

  useEffect(() => {
    if (!poseEditing) return;
    model.traverse((node) => {
      if (!(node instanceof THREE.Bone)) return;
      const base = boneDefaults.get(node);
      if (base) node.rotation.copy(base);
      const offset = pose?.bones?.[node.name];
      if (offset) {
        node.rotation.x += offset[0];
        node.rotation.y += offset[1];
        node.rotation.z += offset[2];
      }
    });
    appliedPoseOffsets.current.clear();
    model.updateMatrixWorld(true);
    model.traverse((node) => {
      if (node instanceof THREE.SkinnedMesh) node.skeleton.update();
    });
    invalidate();
  }, [boneDefaults, invalidate, model, pose, poseEditing]);

  useEffect(() => {
    if (poseEditing) {
      actions[idleAnimation ?? ""]?.stop();
      return;
    }
    if (!idleAnimation) return;
    const action = actions[idleAnimation];
    action?.reset().fadeIn(0.25).play();
    invalidate();
    return () => { action?.fadeOut(0.2); };
  }, [actions, idleAnimation, invalidate, poseEditing]);

  return (
    <group ref={group} position={position} rotation={pose?.rotation ?? [0, 0, 0]}>
      <group ref={motionGroup}>
        <primitive object={model} />
      </group>
    </group>
  );
}
