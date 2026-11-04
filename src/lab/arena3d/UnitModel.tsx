"use client";

/**
 * A board unit rendered from a real glTF model, with its idle animation
 * playing — the thing capsules could not tell us.
 *
 * Models here are SPIKE ASSETS ONLY, from the Khronos glTF-Sample-Assets set:
 *   Fox       — model CC0 (PixelMannen), animations CC-BY 4.0 (@tomkranis)
 *   Duck      — sample asset, no animation
 *   BrainStem — rigged + animated sample asset
 * They exist to judge silhouette, scale, lighting and animation cost. None of
 * them ship: the real roster needs its own art (see PACK-STRATEGY.md).
 *
 * Each model is auto-fitted to the hex, because sample assets arrive at wildly
 * different scales — the Fox is ~100 units tall, the Duck ~2.
 */

import { useEffect, useMemo, useRef } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";

export type ModelId = "fox" | "duck" | "brainstem";

const SRC: Record<ModelId, string> = {
  fox: "/lab-models/Fox.glb",
  duck: "/lab-models/Duck.glb",
  brainstem: "/lab-models/BrainStem.glb",
};

/** Target height in world units — a unit should stand about 1.3 hexes tall. */
const TARGET_H = 0.78;

export function UnitModel({
  id, position, tint, dragging,
}: {
  id: ModelId;
  position: [number, number, number];
  tint?: string;
  dragging: boolean;
}) {
  const { scene, animations } = useGLTF(SRC[id]);
  const group = useRef<THREE.Group>(null);

  // Clone per instance: useGLTF caches one scene graph, so placing the same
  // model on several hexes without cloning would move ONE object around.
  //
  // SkeletonUtils.clone, NOT Object3D.clone — a plain clone copies SkinnedMesh
  // nodes without rebinding them to the cloned skeleton, so rigged models
  // either vanish or freeze in bind pose. That is exactly what happened: three
  // animated foxes rendered as nothing and the robot stood in a T-pose.
  const model = useMemo(() => {
    const c = cloneSkinned(scene);
    const box = new THREE.Box3().setFromObject(c);
    const size = new THREE.Vector3();
    box.getSize(size);
    const s = TARGET_H / Math.max(size.y, 1e-6);
    c.scale.setScalar(s);

    // Re-measure after scaling and sit the model ON the ground rather than
    // through it — sample assets don't share an origin convention.
    const box2 = new THREE.Box3().setFromObject(c);
    c.position.y -= box2.min.y;

    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      if (tint) {
        // Clone the material too, or tinting one unit tints every unit sharing it.
        const base = m.material as THREE.MeshStandardMaterial;
        const mat = base.clone();
        mat.emissive = new THREE.Color(tint);
        mat.emissiveIntensity = dragging ? 0.45 : 0.08;
        m.material = mat;
      }
    });
    return c;
  }, [scene, tint, dragging]);

  const { actions, names } = useAnimations(animations, group);

  useEffect(() => {
    // Play whatever the first clip is — on these assets that's the idle/walk.
    const first = names[0];
    if (!first) return;
    const action = actions[first];
    action?.reset().fadeIn(0.25).play();
    return () => { action?.fadeOut(0.2); };
  }, [actions, names]);

  return (
    <group ref={group} position={position}>
      <primitive object={model} />
    </group>
  );
}

// Warm the cache so the first board paint doesn't pop in model by model.
useGLTF.preload(SRC.fox);
useGLTF.preload(SRC.duck);
useGLTF.preload(SRC.brainstem);
