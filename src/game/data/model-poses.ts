export type ModelPose = {
  rotation?: [number, number, number];
  bones?: Record<string, [number, number, number]>;
  reviewed?: boolean;
  needsRig?: boolean;
};

export function mergeModelPose(base?: ModelPose, override?: ModelPose): ModelPose {
  if (!base) return override ?? {};
  if (!override) return base;
  const hasBoneOverride = Object.prototype.hasOwnProperty.call(override, "bones");
  const bones = override.bones ? { ...base.bones, ...override.bones } : undefined;
  return {
    ...base,
    ...override,
    bones: hasBoneOverride ? (bones && Object.keys(bones).length ? bones : undefined) : base.bones,
  };
}

export const MODEL_POSES_STORAGE_KEY = "poketft:model-poses:v1";
export const MODEL_POSES_UPDATED_EVENT = "poketft:model-poses-updated";

export function parseModelPoseMap(raw: string): Record<number, ModelPose> {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Saved pose data must be an object keyed by National Dex number.");
  }

  for (const [dex, value] of Object.entries(parsed)) {
    if (!/^\d+$/.test(dex) || Number(dex) < 1 || Number(dex) > 1025) {
      throw new Error(`Saved pose data has an invalid National Dex number: ${dex}.`);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Saved pose for Dex ${dex} must be an object.`);
    }
    const pose = value as ModelPose;
    if (pose.reviewed !== undefined && typeof pose.reviewed !== "boolean") {
      throw new Error(`Reviewed status for Dex ${dex} must be a boolean.`);
    }
    if (pose.needsRig !== undefined && typeof pose.needsRig !== "boolean") {
      throw new Error(`Rig status for Dex ${dex} must be a boolean.`);
    }
    const isRotation = (rotation: unknown) =>
      Array.isArray(rotation) && rotation.length === 3 && rotation.every((part) => typeof part === "number" && Number.isFinite(part));
    if (pose.rotation !== undefined && !isRotation(pose.rotation)) {
      throw new Error(`Saved model rotation for Dex ${dex} must contain three finite numbers.`);
    }
    if (pose.bones !== undefined) {
      if (!pose.bones || typeof pose.bones !== "object" || Array.isArray(pose.bones)) {
        throw new Error(`Saved bone poses for Dex ${dex} must be an object.`);
      }
      for (const [boneName, rotation] of Object.entries(pose.bones)) {
        if (!boneName || !isRotation(rotation)) {
          throw new Error(`Saved pose for bone ${boneName || "(unnamed)"} on Dex ${dex} is invalid.`);
        }
      }
    }
  }
  return parsed as Record<number, ModelPose>;
}

/**
 * Facing applied to every model that has no explicit rotation of its own.
 *
 * Models arrive from the asset pipeline facing straight down the camera axis,
 * which reads as a mugshot rather than a creature standing on a board — the
 * sprites they sit beside are all three-quarter views. Every reviewed entry
 * that set a rotation set exactly this one, so it is a property of the whole
 * asset set, not of any species: making it the default fixes the facing for
 * all 967 models at once instead of asking a human to type the same number
 * nine hundred times.
 *
 * A species that genuinely needs a different angle still overrides it below.
 */
export const DEFAULT_MODEL_ROTATION: [number, number, number] = [0, -(34 * Math.PI) / 180, 0];

export const MODEL_POSES: Record<number, ModelPose> = {
  1: {
    reviewed: true,
    rotation: [0, -(34 * Math.PI) / 180, 0],
  },
  4: {
    reviewed: true,
    rotation: [0, -(34 * Math.PI) / 180, 0],
    bones: {
      LForeArm: [0, 0, -(40 * Math.PI) / 180],
      RForeArm: [0, 0, (40 * Math.PI) / 180],
    },
  },
  123: {
    reviewed: true,
    // Explicitly zero: this stance was reviewed and accepted BEFORE
    // DEFAULT_MODEL_ROTATION existed, so it must keep facing front rather than
    // silently inherit the new default.
    rotation: [0, 0, 0],
    bones: {
      LArm: [0, 0, -(50 * Math.PI) / 180],
      RArm: [0, 0, (50 * Math.PI) / 180],
    },
  },
};
