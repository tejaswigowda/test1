# Fox (fox.json)

`fox.json` is a derivative of the **Fox** model from the Khronos glTF Sample Models archive:
https://github.com/KhronosGroupArchives/glTF-Sample-Models/blob/d7a3cc8e51d7c573771ae77a57f16b0662a905c6/2.0/Fox/glTF-Binary/Fox.glb (retrieved 2026-10-28; sha256 `d97044e701822bac5a62696459b27d7b375aada5de8574ed4362edbba94771f7`, 162,852 bytes).

The file carries two licences:

- The low poly fox model, by PixelMannen (https://opengameart.org/content/fox-and-shiba): **CC0 1.0 Universal** (https://creativecommons.org/publicdomain/zero/1.0/).
- The rigging and animation, by @tomkranis on Sketchfab (https://sketchfab.com/models/371dea88d7e04a76af5763f2a36866bc): **Creative Commons Attribution 4.0 International** (https://creativecommons.org/licenses/by/4.0/). Attribution is required: credit @tomkranis, link the licence, and say what was changed (below).

glTF conversion by @AsoboStudio and @scurest (https://github.com/KhronosGroup/glTF-Sample-Models/pull/150#issuecomment-406300118).

## Modifications

The original single skinned mesh (`fox`: 576 triangles, 24 bones, one material and texture, three animation clips) was cut into nine skinned meshes grouped under one node, `Fox_Parts`,
each with a name and classes (`Fox_Body_And_Head_Left`, `Fox_Body_And_Head_Right`, `Fox_Tail`, `Fox_Front_Leg_Left`, `Fox_Front_Leg_Right`, `Fox_Hind_Leg_Left`, `Fox_Hind_Leg_Right`,
`Fox_Ear_Left`, `Fox_Ear_Right`). Every part is bound to the original skeleton with the original bind matrix, and the bone indices and weights are copied unchanged. The skeleton, the three animation clips
(`Survey`, `Walk`, `Run`), the material and the texture are unchanged. The importer's wrapper node and the skeleton's nodes were given the class `rig`, and two lights were added. Nothing else was changed.
The cut was made with `SEG` (version 1.4.0) in the Strata JS Shell; the exact plan, and the report it was made from, are recorded in the scene (`userData.segmentation` on the `Fox_Parts` node); the steps are in the
tutorial "Cut any textured mesh into named parts".

The model's CC0 dedication carries no conditions; the CC BY 4.0 terms for the rigging and animation apply to this derivative, which is provided as is, with no warranty.
