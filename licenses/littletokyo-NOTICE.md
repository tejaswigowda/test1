# Littlest Tokyo (littletokyo.json)

`littletokyo.json` is a derivative of **Littlest Tokyo** by **Glen Fox** ([glenatron](https://sketchfab.com/glenatron)), from this file:
https://github.com/mrdoob/three.js/blob/f405199a0ce26134efbf2d654a634efa5655b756/examples/models/gltf/LittlestTokyo.glb (retrieved 2026-11-02; sha256 `8375c2aa6808e28ad1cb9c0d43e1513f57ffd7865244bf66bbbd5bb0e907e06d`, 4,133,072 bytes).

The model is licensed **Creative Commons Attribution 4.0 International** (https://creativecommons.org/licenses/by/4.0/). The file's own metadata says so and names the source page, https://sketchfab.com/models/94b24a60dc1b48248de50bf087c0f042 (`asset.extras`: author `glenatron`, license `CC-BY-4.0`). The three.js example that ships the file credits the same artist ("CC Attribution") and links https://artstation.com/artwork/1AGwX. Attribution is required: credit Glen Fox, link the licence, and say what was changed (below). The artist has not endorsed this derivative.

## Modifications

The original 71 meshes (141,802 triangles, 15 materials, 4 textures, one animation clip) were changed as follows. Nothing else was changed; the textures are not edited, and the triangle count is 141,802 before and after.

- Nine textured meshes (`Object649_normal_0`, `Object649_metalmat_0`, `Object649_Plastic_Soft_0`, `Object649_paintmat_0`, `Object649_Material_5511_0`, `Object649_Material_5512_0`, `Object649_alpha_glass_0`, `Object649_glassmat_0`, `Object705_Material_5516_0`) were each cut into named, classed parts, by the region of the model that holds each component: 124 parts in nine groups (`Surface_Parts`, `Metal_Parts`, `SoftPlastic_Parts`, `Paint_Parts`, `Mat5511_Parts`, `Mat5512_Parts`, `AlphaGlass_Parts`, `Glass_Parts`, `Mat5516_Parts`). The parts share the original materials. The cuts were made with `SEG` (version 1.6.0) in the Strata JS Shell; the exact plan and the report it was made from are recorded in the scene (`userData.segmentation` on each group), pinned to the hash above.
- The 62 meshes that were already one object each were renamed and given classes (for example `Bird_1`, `Tram_Body_Metal`, `Cable_1`); seven names that contained `#` were changed to drop it.
- The importer's wrapper nodes and the skeleton's bones were given the class `rig` (the unnamed ones were also given names, `Rig_Node_1` to `Rig_Node_52`), and the model's root node was given the class `model`.
- When the scene is committed, the editor rounds animation values slightly and deterministically; the geometry is not changed.

The steps are in the tutorial "Name every part of a street-corner diorama" (https://strataeditor.dev/about/tutorials/segment-a-diorama.html).

This derivative is provided under the same licence, CC BY 4.0, as is, with no warranty.
