"use client";

import { Component, Suspense, useCallback, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { TransformControls } from "@react-three/drei";
import * as THREE from "three";
import Link from "next/link";
import { MODEL_TARGET_HEIGHT, UnitModel } from "./UnitModel";
import {
  MODEL_POSES,
  MODEL_POSES_STORAGE_KEY,
  MODEL_POSES_UPDATED_EVENT,
  mergeModelPose,
  parseModelPoseMap,
  type ModelPose,
} from "@/game/data/model-poses";
import { spriteUrl } from "@/game/data/mons";
import { hasUsable3DModel, USABLE_3D_MODEL_COUNT } from "@/game/data/model-availability";

const MAX_DEX = 1025;
const AXES = ["X", "Y", "Z"] as const;
const BONE_GROUPS = ["Body", "Head and neck", "Arms", "Legs", "Wings", "Tail", "Other"] as const;
const EMPTY_BONE_DEFAULTS = new Map<THREE.Bone, THREE.Euler>();
type BoneGroup = (typeof BONE_GROUPS)[number];

function boneGroup(name: string): BoneGroup {
  if (/tail/i.test(name)) return "Tail";
  if (/wing|feather/i.test(name)) return "Wings";
  if (/head|neck|jaw|face|eye|ear|horn|feel|antenna/i.test(name)) return "Head and neck";
  if (/arm|hand|shoulder|forearm|finger|claw|pincer/i.test(name)) return "Arms";
  if (/leg|foot|toe|thigh|knee|hip|paw/i.test(name)) return "Legs";
  if (/spine|body|chest|waist|hips|root|origin|torso/i.test(name)) return "Body";
  return "Other";
}

function BoneGizmo({
  bone,
  baseRotation,
  onCommit,
}: {
  bone: THREE.Bone;
  baseRotation?: THREE.Euler;
  onCommit: (name: string, rotation: [number, number, number]) => void;
}) {
  const invalidate = useThree((state) => state.invalidate);

  return (
    <TransformControls
      object={bone}
      mode="rotate"
      space="local"
      size={0.65}
      onChange={() => invalidate()}
      onMouseUp={() => {
        const normalize = (angle: number) => THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
        const base = baseRotation ?? new THREE.Euler();
        onCommit(bone.name, [
          normalize(bone.rotation.x - base.x),
          normalize(bone.rotation.y - base.y),
          normalize(bone.rotation.z - base.z),
        ]);
      }}
    />
  );
}

function loadSavedPoses(): { poses: Record<number, ModelPose>; error: string } {
  if (typeof window === "undefined") return { poses: {}, error: "" };
  try {
    const saved = window.localStorage.getItem(MODEL_POSES_STORAGE_KEY);
    if (!saved) return { poses: {}, error: "" };
    return { poses: parseModelPoseMap(saved), error: "" };
  } catch (cause) {
    return {
      poses: {},
      error: cause instanceof Error ? cause.message : "Could not read saved poses.",
    };
  }
}

function ModelPreview({
  dex,
  selectedBone,
  boneDefaults,
  onBones,
  onBoneCommit,
  poseEditing,
  onLoaded,
  onError,
}: {
  dex: number;
  selectedBone: THREE.Bone | undefined;
  boneDefaults: Map<THREE.Bone, THREE.Euler>;
  onBones: (bones: THREE.Bone[], defaults: Map<THREE.Bone, THREE.Euler>) => void;
  onBoneCommit: (name: string, rotation: [number, number, number]) => void;
  poseEditing: boolean;
  onLoaded: () => void;
  onError: (error: Error) => void;
}) {
  return (
    <ModelErrorBoundary dex={dex} onError={onError}>
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0, 0, 1.7], fov: 34, near: 0.1, far: 20 }}
      >
        <ambientLight intensity={1.6} />
        <directionalLight position={[2, 4, 5]} intensity={2.2} />
        <Suspense fallback={null}>
          <UnitModel
            id={dex}
            position={[0, -MODEL_TARGET_HEIGHT / 2, 0]}
            dragging={false}
            poseEditing={poseEditing}
            onLoaded={onLoaded}
            onBones={onBones}
          />
        </Suspense>
        {poseEditing && selectedBone && (
          <BoneGizmo
            bone={selectedBone}
            baseRotation={boneDefaults.get(selectedBone)}
            onCommit={onBoneCommit}
          />
        )}
      </Canvas>
    </ModelErrorBoundary>
  );
}

class ModelErrorBoundary extends Component<
  { children: ReactNode; dex: number; onError: (error: Error) => void },
  { failed: boolean; dex: number }
> {
  state = { failed: false, dex: this.props.dex };

  static getDerivedStateFromProps(
    props: { dex: number },
    state: { failed: boolean; dex: number },
  ) {
    return props.dex === state.dex ? null : { failed: false, dex: props.dex };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? (
      <p className="p-4 text-sm text-rose-300">Could not load this model. Check the browser console or try again.</p>
    ) : this.props.children;
  }
}

export function ModelPoseLab() {
  const [dex, setDex] = useState(1);
  const [initial] = useState(loadSavedPoses);
  const [poses, setPoses] = useState(initial.poses);
  const [rigBones, setRigBones] = useState<THREE.Bone[]>([]);
  const [rigBoneDefaults, setRigBoneDefaults] = useState(EMPTY_BONE_DEFAULTS);
  const [rigDex, setRigDex] = useState<number | null>(null);
  const [loadedDex, setLoadedDex] = useState<number | null>(null);
  const [selectedBone, setSelectedBone] = useState("");
  const [poseEditing, setPoseEditing] = useState(false);
  const [error, setError] = useState(initial.error);
  const [notice, setNotice] = useState("");

  const currentPose = mergeModelPose(MODEL_POSES[dex], poses[dex]);
  const currentRig = rigDex === dex ? rigBones : [];
  const currentBoneDefaults = rigDex === dex ? rigBoneDefaults : EMPTY_BONE_DEFAULTS;
  const currentModelLoaded = loadedDex === dex;
  const allPoses = { ...MODEL_POSES };
  for (const [poseDex, pose] of Object.entries(poses)) {
    allPoses[Number(poseDex)] = mergeModelPose(MODEL_POSES[Number(poseDex)], pose);
  }
  const reviewedCount = Object.values(allPoses).filter((pose) => pose.reviewed).length;
  const needsRigCount = Object.values(allPoses).filter((pose) => pose.needsRig).length;
  const boneNames = Array.from(new Set(currentRig.map((bone) => bone.name))).sort();
  const selectedBoneObject = currentRig.find((bone) => bone.name === selectedBone);
  const activeBonePose = currentPose.bones?.[selectedBone] ?? [0, 0, 0];

  const savePoses = useCallback((next: Record<number, ModelPose>) => {
    setPoses(next);
    try {
      window.localStorage.setItem(MODEL_POSES_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(MODEL_POSES_UPDATED_EVENT));
      setError("");
      setNotice("Pose changes saved in this browser.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save poses in this browser.");
    }
  }, []);

  const updatePose = useCallback((update: (pose: ModelPose) => ModelPose) => {
    const nextPose = update(mergeModelPose(MODEL_POSES[dex], poses[dex]));
    const next = { ...poses };
    if (
      !nextPose.rotation &&
      nextPose.reviewed === undefined &&
      !nextPose.needsRig &&
      (!nextPose.bones || Object.keys(nextPose.bones).length === 0)
    ) {
      delete next[dex];
    } else {
      next[dex] = nextPose;
    }
    savePoses(next);
  }, [dex, poses, savePoses]);

  const changeRotation = (axis: number, degrees: number) => {
    updatePose((pose) => {
      const rotation = [...(pose.rotation ?? [0, 0, 0])] as [number, number, number];
      rotation[axis] = (degrees * Math.PI) / 180;
      return { ...pose, rotation };
    });
  };

  const changeBoneRotation = (axis: number, degrees: number) => {
    if (!selectedBone) return;
    setPoseEditing(true);
    updatePose((pose) => {
      const bones = { ...pose.bones };
      const rotation = [...(bones[selectedBone] ?? [0, 0, 0])] as [number, number, number];
      rotation[axis] = (degrees * Math.PI) / 180;
      if (rotation.every((value) => Math.abs(value) < 1e-5)) delete bones[selectedBone];
      else bones[selectedBone] = rotation;
      return { ...pose, bones: Object.keys(bones).length ? bones : undefined };
    });
  };

  const changeBonePose = useCallback((name: string, rotation: [number, number, number]) => {
    updatePose((pose) => {
      const bones = { ...pose.bones };
      if (rotation.every((value) => Math.abs(value) < 1e-5)) delete bones[name];
      else bones[name] = rotation;
      return { ...pose, bones: Object.keys(bones).length ? bones : undefined };
    });
  }, [updatePose]);

  const downloadPoses = () => {
    const payload = JSON.stringify(allPoses, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "pokemon-model-poses.json";
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Pose JSON downloaded. Replace MODEL_POSES in model-poses.ts with this reviewed map to ship the changes.");
  };

  const onBones = useCallback((bones: THREE.Bone[], defaults: Map<THREE.Bone, THREE.Euler>) => {
    setRigBones(bones);
    setRigBoneDefaults(defaults);
    setRigDex(dex);
    const names = Array.from(new Set(bones.map((bone) => bone.name))).sort();
    setSelectedBone((current) => current && names.includes(current)
      ? current
      : names.find((name) => /head|neck|spine|torso|body/i.test(name)) ?? names[0] ?? "");
  }, [dex]);

  const modelError = useCallback((cause: Error) => {
    setError(`Dex ${dex}: ${cause.message}`);
  }, [dex]);

  const modelLoaded = useCallback(() => {
    setLoadedDex(dex);
  }, [dex]);

  const goToNextUnreviewed = () => {
    for (let offset = 1; offset <= MAX_DEX; offset += 1) {
      const candidate = ((dex - 1 + offset) % MAX_DEX) + 1;
      if (
        !hasUsable3DModel(candidate) ||
        allPoses[candidate]?.reviewed ||
        allPoses[candidate]?.needsRig
      ) continue;
      setDex(candidate);
      setSelectedBone("");
      setPoseEditing(false);
      setError("");
      return;
    }
    setNotice("Every usable regular model is marked as reviewed.");
  };

  const rotationControls = [
    { label: "Model", values: currentPose.rotation ?? [0, 0, 0], onChange: changeRotation },
    { label: selectedBone ? `Bone · ${selectedBone}` : "Bone", values: activeBonePose, onChange: changeBoneRotation },
  ];

  return (
    <main className="min-h-screen bg-[#070c17] p-4 text-slate-100 md:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link className="text-sm text-emerald-300 hover:underline" href="/">← Back to game</Link>
            <h1 className="mt-2 text-2xl font-bold">Pokémon pose review</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Pose each model against its sprite, then mark the default reviewed. Joint corrections are layered over idle and combat animation; export the reviewed pose map to ship it to everyone.
            </p>
          </div>
          <button type="button" onClick={downloadPoses} className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950 hover:bg-emerald-400">
            Export {Object.keys(allPoses).length} pose records
          </button>
        </header>

        <section className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3">
          <button type="button" aria-label="Previous Pokémon" onClick={() => { setDex((value) => Math.max(1, value - 1)); setError(""); }} className="rounded bg-slate-800 px-3 py-2">← Previous</button>
          <label className="flex items-center gap-2 text-sm">
            National Dex
            <input
              type="number"
              min={1}
              max={MAX_DEX}
              value={dex}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isInteger(next) && next >= 1 && next <= MAX_DEX) {
                  setDex(next);
                  setError("");
                }
              }}
              className="w-24 rounded border border-slate-600 bg-slate-950 px-2 py-1.5"
            />
            <span className="text-slate-500">/ {MAX_DEX}</span>
          </label>
          <button type="button" aria-label="Next Pokémon" onClick={() => { setDex((value) => Math.min(MAX_DEX, value + 1)); setError(""); }} className="rounded bg-slate-800 px-3 py-2">Next →</button>
          <button type="button" onClick={goToNextUnreviewed} className="rounded bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-600">
            Next unreviewed
          </button>
          <button
            type="button"
            onClick={() => {
              const next = { ...poses };
              delete next[dex];
              savePoses(next);
            }}
            className="ml-auto rounded bg-slate-800 px-3 py-2 text-sm text-slate-300"
          >
            Restore shipped pose
          </button>
        </section>

        <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3">
          <div>
            <h2 className="font-semibold">Default sprite-pose review</h2>
            <p className="text-sm text-slate-400">
              {reviewedCount} / {USABLE_3D_MODEL_COUNT} usable regular models reviewed · {needsRigCount} marked for custom rigging. Verify the whole stance before marking it; joint changes are stored as local offsets so animations keep playing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!currentModelLoaded}
              aria-pressed={currentPose.reviewed === true}
              onClick={() => updatePose((pose) => ({
                ...pose,
                reviewed: !pose.reviewed,
                needsRig: undefined,
              }))}
              className={`rounded px-3 py-2 text-sm font-semibold ${currentPose.reviewed ? "bg-emerald-500 text-slate-950" : "bg-slate-700 text-white hover:bg-slate-600"}`}
            >
              {currentPose.reviewed ? "Reviewed · mark for review" : "Mark sprite pose reviewed"}
            </button>
            {boneNames.length === 0 && (
              <button
                type="button"
                disabled={!currentModelLoaded}
                aria-pressed={currentPose.needsRig === true}
                onClick={() => updatePose((pose) => ({
                  ...pose,
                  needsRig: !pose.needsRig,
                  reviewed: undefined,
                }))}
                className={`rounded px-3 py-2 text-sm font-semibold ${currentPose.needsRig ? "bg-gold-400 text-slate-950" : "bg-slate-700 text-white hover:bg-slate-600"}`}
              >
                {currentPose.needsRig ? "Needs rig · undo" : "Mark as needing custom rig"}
              </button>
            )}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
          <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
              <h2 className="font-semibold">3D model</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">Model height: {MODEL_TARGET_HEIGHT}</span>
                <button
                  type="button"
                  disabled={boneNames.length === 0}
                  aria-pressed={poseEditing}
                  onClick={() => setPoseEditing((editing) => !editing)}
                  className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  {poseEditing ? "Finish posing" : "Edit pose"}
                </button>
              </div>
            </div>
            <div className="relative h-[360px] bg-[radial-gradient(ellipse_at_center,#1e293b,#070c17)]">
              <ModelPreview
                dex={dex}
                selectedBone={selectedBoneObject}
                boneDefaults={currentBoneDefaults}
                onBones={onBones}
                onBoneCommit={changeBonePose}
                poseEditing={poseEditing}
                onLoaded={modelLoaded}
                onError={modelError}
              />
              {poseEditing && selectedBoneObject && (
                <p className="pointer-events-none absolute bottom-3 left-3 rounded bg-slate-950/75 px-2 py-1 text-xs text-emerald-200">
                  Drag a colored rotation ring to pose {selectedBoneObject.name}.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <h2 className="mb-3 font-semibold">Sprite reference</h2>
            <div className="grid min-h-56 place-items-center rounded-lg bg-slate-950">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={spriteUrl(dex)} alt={`National Dex ${dex} sprite reference`} className="h-52 w-52 object-contain [image-rendering:pixelated]" />
            </div>
            <label className="mt-4 block text-sm font-medium">Rig bone</label>
            <select
              value={selectedBone}
              onChange={(event) => {
                setSelectedBone(event.target.value);
                setPoseEditing(true);
              }}
              disabled={boneNames.length === 0}
              className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-2 py-2 text-sm disabled:text-slate-500"
            >
              {boneNames.length === 0
                ? <option value="">No rigged bones</option>
                : BONE_GROUPS.map((group) => {
                    const names = boneNames.filter((name) => boneGroup(name) === group);
                    return names.length > 0 ? (
                      <optgroup key={group} label={group}>
                        {names.map((name) => <option key={name}>{name}</option>)}
                      </optgroup>
                    ) : null;
                  })}
            </select>
            {!currentModelLoaded && !error && <p className="mt-1 text-xs text-slate-400">Loading this model and its rig…</p>}
            {currentModelLoaded && boneNames.length === 0 && <p className="mt-1 text-xs text-gold-300">This asset has no usable skeleton, so it cannot bend at joints. It can only be rotated as a whole; bending it requires a custom rig.</p>}
            {boneNames.length > 0 && <p className="mt-1 text-xs text-slate-500">Bones are grouped by likely body part. Select one, then drag its rotation gizmo on the model.</p>}
          </section>
        </div>

        <section className="mt-4 grid gap-4 rounded-xl border border-slate-700 bg-slate-900 p-4 md:grid-cols-2">
          {rotationControls.map((control) => (
            <fieldset key={control.label} className="min-w-0">
              <legend className="mb-2 font-semibold">{control.label}</legend>
              {AXES.map((axis, index) => {
                const degrees = Math.round((control.values[index] * 180) / Math.PI);
                return (
                  <label key={axis} className="mb-2 grid grid-cols-[2rem_1fr_3rem] items-center gap-2 text-xs text-slate-300">
                    <span>{axis}</span>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      step={1}
                      value={degrees}
                      disabled={control.label.startsWith("Bone") && !selectedBoneObject}
                      onChange={(event) => control.onChange(index, Number(event.target.value))}
                      className="w-full accent-emerald-400"
                    />
                    <span className="text-right tabular-nums">{degrees}°</span>
                  </label>
                );
              })}
            </fieldset>
          ))}
        </section>

        <p aria-live="polite" className={`mt-3 min-h-5 text-sm ${error ? "text-rose-300" : "text-emerald-300"}`}>
          {error || notice}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          This reviewer covers regular National Dex models. Pose edits are species-specific; a sprite cannot reveal a model’s hidden side, and static or unrigged models may need a different source asset rather than bone adjustments.
        </p>
      </div>
    </main>
  );
}
