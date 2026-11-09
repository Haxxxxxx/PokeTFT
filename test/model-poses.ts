import assert from "node:assert/strict";
import {
  MODEL_POSES,
  mergeModelPose,
  parseModelPoseMap,
  type ModelPose,
} from "../src/game/data/model-poses";
import {
  hasUsable3DModel,
  USABLE_3D_MODEL_COUNT,
} from "../src/game/data/model-availability";

const baked: ModelPose = {
  reviewed: true,
  rotation: [0.1, 0.2, 0.3],
  bones: { Head: [0, 0.1, 0] },
};
const draft = mergeModelPose(baked, {
  reviewed: false,
  needsRig: true,
  bones: { Tail: [0, 0, 0.2] },
});

assert.equal(draft.reviewed, false);
assert.equal(draft.needsRig, true);
assert.deepEqual(draft.rotation, baked.rotation);
assert.deepEqual(draft.bones, {
  Head: [0, 0.1, 0],
  Tail: [0, 0, 0.2],
});
assert.equal(mergeModelPose(baked, { bones: undefined }).bones, undefined);
assert.equal(MODEL_POSES[123].reviewed, true);
assert.equal(hasUsable3DModel(1), true);
assert.equal(hasUsable3DModel(23), false);
assert.equal(hasUsable3DModel(1024), false);
assert.equal(USABLE_3D_MODEL_COUNT, 967);
assert.deepEqual(parseModelPoseMap(JSON.stringify({ 123: draft }))[123], draft);
assert.throws(
  () => parseModelPoseMap(JSON.stringify({ 123: { reviewed: "yes" } })),
  /must be a boolean/,
);
assert.throws(
  () => parseModelPoseMap(JSON.stringify({ 123: { needsRig: "yes" } })),
  /must be a boolean/,
);
assert.throws(
  () => parseModelPoseMap(JSON.stringify({ 123: { bones: { Head: [0, Infinity, 0] } } })),
  /is invalid/,
);

console.log("Model pose merge and validation passed.");
