# Duck (duck.json)

`duck.json` is a derivative of the **Duck** model from the Khronos glTF Sample Models archive:
https://github.com/KhronosGroupArchives/glTF-Sample-Models/blob/main/2.0/Duck/glTF-Binary/Duck.glb (retrieved 2026-10-27).

Copyright 2006 Sony Computer Entertainment Inc.

Licensed under the SCEA Shared Source License, Version 1.0 (the "License"); you may not use this file except in compliance with the License.
A copy of the License is in [SCEA-Shared-Source-License-1.0.txt](SCEA-Shared-Source-License-1.0.txt) and at
https://web.archive.org/web/20160320123355/http://research.scea.com/scea_shared_source_license.html

## Modifications

The original single mesh (4,212 triangles, one material and texture) was cut into ten meshes grouped under one node, `Duck`, each with a name and classes
(`Duck_Body_And_Head`, `Duck_Beak`, `Duck_Wing_Left`, `Duck_Wing_Right`, `Duck_Tail_Left`, `Duck_Tail_Right`, `Duck_Eye_Left`, `Duck_Eye_Highlight_Left`,
`Duck_Eye_Right`, `Duck_Eye_Highlight_Right`). The two eyes were subdivided (each triangle into 16) so that the split follows the paint. The original
material and texture are shared by all ten meshes and are unchanged. A light was added. Nothing else was changed. The cut was made with `SEG` (version 1.1.0) in the
Strata JS Shell; the exact plan, and the report it was made from, are recorded in the scene (`userData.segmentation` on the `Duck` node); the steps are in the tutorial "Cut any textured mesh into named parts".

The AS-IS and limitation-of-liability terms of the License apply.
