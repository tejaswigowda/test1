# Materials: one per colour, not one per mesh

A scene file shares a material only when two meshes hold the **same object**. The serializer and
`GLTFExporter` both deduplicate by object identity, so `new MeshStandardMaterial(...)` inside a loop,
or `material.clone()` per label, gives every mesh its own entry even when every field is identical.
Geometry was already shared; materials were not.

The rule for scene scripts: make the palette once, hand the same instance to every mesh that uses it.

```js
globalThis.PAL = { aqua: make(0x14e0c8, 0.25), gold: make(0xffb703, 0.5), white: make(0xffffff, 0.7) };
new Mesh(unit, PAL.aqua);   // the same object, every time
```

A shared material belongs to every mesh that holds it, so a fade on one is a fade on all. Whatever
must fade on its own gets its own material; everything else grows, shrinks or cuts instead.

## Retrofit decision (2026-10-26)

| Scene | Materials before | After | Decision |
|---|---|---|---|
| `area-volume.json` | 54 | 10 | Fixed (`d742211`). Cubes, skins and membrane grow instead of fading; gold labels cut instead of cross-fading. |
| `hw.json` | 34 | 9 | Fixed in `dbe91d4`, with the allele-count work. |
| `a+b-cubed.json` | 34 | 34 | Not changed. Reopen only if it is re-rendered for another reason. |
| `pyth.json` | not measured | | Not changed. Count it when it is next opened. |
| Circuit1 | 236 | | Not in this repo. Tracked as gate F0 of its own work order. |

## What the fix did not do

`area-volume.json` stayed at 2.75 MB: the material definitions were 18 KB of it and are now 3 KB.
Most of the file is the baked animation clip, which is stored twice (`scene.animations`, about 1.7 MB,
and the top-level `animations`, about 0.75 MB) and is rebuilt from `scene.userData.timeline` on load.
Size is a separate problem from this one.
