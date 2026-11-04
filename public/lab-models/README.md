# Spike assets — NOT shipping assets

These glTF models exist only to exercise `/lab/arena3d`: to judge silhouette,
scale, lighting, animation and per-model render cost with real rigged geometry
instead of capsules. **Nothing here is part of the game**, and none of it should
end up in a release build.

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

For actual roster art, see `Project Management/PACK-STRATEGY.md` — the usable
CC0 sources are Quaternius, Kenney and KayKit, and the roster itself needs to
be original (an original flagship roster is what makes 3D models sourceable and
shippable in the first place).
