# Sample models (original, unmodified)

The three Khronos glTF Sample Models that the SEG tutorial ("Cut any textured mesh into named parts") segments. These are the **original files, byte for byte**, taken from
https://github.com/KhronosGroupArchives/glTF-Sample-Models at commit `d7a3cc8e51d7c573771ae77a57f16b0662a905c6` (retrieved 2026-10-27 and 2026-10-28). The `sha256` and size are
what `source` in [`avocado.json`](../avocado.json), [`duck.json`](../duck.json) and [`fox.json`](../fox.json) records, so a record can be checked against these files.

| File | sha256 | Bytes | Author | Licence |
|---|---|---|---|---|
| `Avocado.glb` | `85ae91e60ed519f53a7e2096508837fedd446dcc450f8e05678b7a204679bd12` | 8,328,156 | Microsoft | CC0 1.0 Universal |
| `Duck.glb` | `65bf938f54d6073e619e76e007820bbf980cdc3dc0daec0d94830ffc4ae54ab5` | 120,484 | Copyright 2006 Sony Computer Entertainment Inc. | SCEA Shared Source License 1.0: [licence text](../licenses/SCEA-Shared-Source-License-1.0.txt). Redistributed here unmodified, with the licence; as is, no warranty |
| `Fox.glb` | `d97044e701822bac5a62696459b27d7b375aada5de8574ed4362edbba94771f7` | 162,852 | Low poly fox by PixelMannen; rigging and animation by @tomkranis; glTF conversion by @AsoboStudio and @scurest | Model CC0 1.0; rigging and animation **CC BY 4.0** (attribution required: credit @tomkranis, link https://creativecommons.org/licenses/by/4.0/). See [`../licenses/fox-NOTICE.md`](../licenses/fox-NOTICE.md) |

The segmented scenes are derivatives and carry their own notices: [`../licenses/duck-NOTICE.md`](../licenses/duck-NOTICE.md), [`../licenses/fox-NOTICE.md`](../licenses/fox-NOTICE.md).
