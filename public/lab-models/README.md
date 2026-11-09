# Lab sample assets

These glTF models exist only to exercise `/lab/arena3d`: to judge silhouette,
scale, lighting, animation and per-model render cost with real rigged geometry
instead of capsules. The live game board uses the matching National Dex models
from the [Pokémon 3D API assets repository](https://github.com/Pokemon-3D-api/assets),
loaded on demand from its `models/opt/regular` directory. Those assets are not
copied into this project.

From the [Khronos glTF-Sample-Assets](https://github.com/KhronosGroup/glTF-Sample-Assets)
collection:

| File | Source | Licence |
|---|---|---|
| `Fox.glb` | PixelMannen (model), [@tomkranis](https://github.com/tomkranis) (rig + animations) | Model **CC0 1.0**; animations **CC-BY 4.0** |
| `Duck.glb` | Sony / Khronos sample | **SCI / public-domain-style sample licence** |
| `BrainStem.glb` | Keith Hunter / Smith Micro Software | Khronos **sample-asset licence** |

They are also deliberately *not* representative of a real roster's budget:
`BrainStem.glb` alone is ~3 MB and the three together push the spike to ~280k
triangles. A purpose-built low-poly creature is typically 1–3k triangles, so
read the spike's triangle count as a worst case, not a target.

The game normalizes remote models to a shared height and centers them on the
cell after updating each cloned skeleton's bounds; this keeps differing source
units and origins from making pieces oversized or off-center. Available native
idle clips are selected separately for board and combat; attack clips play from
combat events. Idle root translation is suppressed to keep animations
grounded. Models without a native idle use restrained, species-phased motion
without vertical bobbing. The upstream regular-model directory currently has 968 numeric GLB assets;
57 National Dex entries have no regular asset, and Ekans (Dex 23) has an
unusable straight mesh, leaving 967 models available for pose review. Many
models have no animation clips, so they cannot provide authentic source
animation. Missing assets and Ekans use 2D fallbacks. Shop
cards use 2D sprites with a background glow
from the Pokémon's primary type; 3D models are reserved for the board, bench
and pension dock. Ekans (Dex 23) currently uses its sprite because the upstream
model is a straight, unanimated mesh that does not render in a usable pose.
Mega and Primal forms use their category assets when available, otherwise the
matching regular model is used. Pokémon model rights and asset credits are
described in the upstream repository's
[README](https://github.com/Pokemon-3D-api/assets#license--credits).

Use `/lab/model-poses` to review any regular National Dex model beside its
sprite, group named rig bones by likely body part, and rotate a selected joint
with the viewport gizmo. Overall orientation and slider controls remain
available. Joint rotations are stored as local offsets over both the model's
rest pose and its current animation, so a reviewed stance remains visible while
idle and combat clips play. The lab tracks which species have been reviewed,
can jump to the next unreviewed model, and applies browser drafts to open game
tabs in that browser. Models with no skeleton can be marked for custom rigging
so they are not confused with completed poses. Export the pose map, then replace the map in
`src/game/data/model-poses.ts` to ship those defaults to everyone. The baked
map currently has one reviewed correction (Scyther); the rest of the roster
still requires visual review. Models without a rig can only be reoriented;
models with a skeleton but no animation clips can still be posed bone by bone.
