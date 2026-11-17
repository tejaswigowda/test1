# FutureFlux provenance

Retrieved 2026-11-16. `files.sha256` pins the scene, code and local source extracts.
Local coordinates: origin WGS84 longitude -111.667328704, latitude 33.431791272;
x east, y up, z south, metres. Longitude is scaled by cos(latitude). This local
approximation is for a representative site model, not surveying.

## Mesa mapped pedestrian paths

- **source:** City of Mesa GIS, Parks/ParkFinder/MapServer/19 (Trails).
  [Service](https://gis.mesaaz.gov/mesaaz/rest/services/Parks/ParkFinder/MapServer/19?f=pjson).
  Query envelope `-111.6692,33.4305,-111.6653,33.433`, input/output SR 4326,
  spatial relationship intersects, fields OBJECTID/FACILITYID/COMNAME/PathSegmentName/Surface.
  [Query](https://gis.mesaaz.gov/mesaaz/rest/services/Parks/ParkFinder/MapServer/19/query?geometry=-111.6692%2C33.4305%2C-111.6653%2C33.433&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=OBJECTID,FACILITYID,COMNAME,PathSegmentName,Surface&outSR=4326&f=geojson).
- **licence:** [City of Mesa Data Terms of Use License Agreement](https://data.mesaaz.gov/stories/s/Terms-of-Use-page/2dcd-j2nx/).
  The published terms grant use and permit copying, publication, distribution,
  modification, and commercial/noncommercial use of open datasets, with the
  City's disclaimers. The REST layer itself has an empty copyright field;
  that is not treated as a public-domain declaration.
- **attribution:** City of Mesa GIS, Red Mountain Center and Red Mountain Park.
- **modifications:** GeoJSON extract; projected to local metres; two existing
  LineStrings retained as candidate centerlines, buffered with assumed 3.3 m
  width. OBJECTID **30121 / PKPTH2837** is `center-walk`; OBJECTID **30046 /
  PKPTH2771** is `park-loop`. Landmark aliases are authored demo metadata.
  Other paths in the downloaded envelope are omitted from the staged scene.

## Building and community-center location

- **source:** [OpenData/CommunityMaps/MapServer/6](https://gis.mesaaz.gov/mesaaz/rest/services/OpenData/CommunityMaps/MapServer/6?f=pjson),
  same envelope, OBJECTID **53258**; local `data/mesa-buildings.geojson`.
  [Parks/ParkFinder/MapServer/16](https://gis.mesaaz.gov/mesaaz/rest/services/Parks/ParkFinder/MapServer/16/query?where=geodb_oid%3D1&outFields=*&outSR=4326&f=geojson),
  recreation-center point **geodb_oid 1**, Red Mountain Multigenerational
  Center, 7550 East Adobe; local `data/mesa-center.geojson`.
- **licence:** same City of Mesa Data Terms of Use.
- **attribution:** City of Mesa GIS.
- **modifications:** footprint extruded to **assumed 6 m** height. No surveyed
  heights, facade imagery or real tree inventory is claimed.

## Authored staging and speech

- **source:** procedural geometry in `create-scene.mjs`, operation geometry in
  `ops.mjs`, and authored SRT files in `speech/`.
- **licence:** original demo contributions supplied for this project; third-party
  dependency licences remain with their packages.
- **attribution:** FutureFlux demo / Strata.
- **modifications:** terrain, planting, people, lighting, path widths and proposal
  forms are arranged representative assets. Sun is illustrative, not a dated
  solar study. No shade geometry implies quantified cooling.
- **speech:** user explicitly authorized **Dub-generated synthetic speech** in
  place of the work order's human recordings. On-screen disclosure is permanent.
  Dub currently exposes English voices only; Spanish text through an English
  voice is an experimental test, not a native-speaker demonstration.
- **tools:** [Dub](https://dub.webcli.app/) repository revision
  `f0c8ca28e06cdda3157e9f84c2722710a5f568ba`; Kokoro model
  `onnx-community/Kokoro-82M-v1.0-ONNX`, pinned by Dub at
  `1939ad2a8e416c0acfeecc08a694d14ef25f2231`, q8/wasm, `af_heart`.
  [Whisper](https://whisper.webcli.app/) repository revision
  `2f174f4c21a37653761ddc4cbfcbd71345330ee3`.
  Live sites can change; each take records actual audio hashes/model/browser.
  No personal recordings are included.

## ASU heat source investigated, NOT installed or redistributed

- **source:** [ASU Heat Vulnerability Map and Cooling Solutions](https://globalfutures.asu.edu/sustainable-cities/heat-vulnerability-map-and-cooling-solutions-webtool/).
  Its EDI link points to the **development** portal:
  [edi.1403.3](https://portal-d.edirepository.org/nis/metadataviewer?packageid=edi.1403.3).
  A public TopoJSON is reachable from the ASU webtool. Reachability alone is
  not taken as permission to redistribute it.
- **quantity:** ASU's own methodology says **daytime MODIS/Aqua V061 land surface
  temperature**, compiled for 20 Phoenix heat-warning days in **2021**, then
  regional percentile ranked **0 (coolest) to 1 (hottest)**. It is not Landsat,
  not air temperature, not degrees Celsius, and a rank cannot answer an
  absolute "how many degrees hotter" question.
- **upstream attribution:** Wan, Z., Hook, S., Hulley, G. (2021).
  *MODIS/Aqua Land Surface Temperature/Emissivity Daily L3 Global 1km SIN Grid
  V061*. NASA EOSDIS Land Processes DAAC. ASU reports access 2022-02-03.
  This upstream citation is NOT asserted to be the EDI package's recommended citation.
- **licence:** **unverified**. Public EDI metadata requests on production and
  development API hosts returned authorization-denied responses; neither the
  package's full licence nor its recommended citation could be verified.
- **modifications:** none shipped. **Beat 8 cut**, with `no-heat-layer` enforced.
  To restore it: obtain the package and licence, verify polygon unit and field
  metadata, pin hashes/citation, render actual georeferenced polygon meshes,
  and show date, dimensionless rank units, credit, geographic scale bar and a
  d3-scale-chromatic Viridis/Inferno/Turbo legend. Do not copy ASU's rainbow ramp.
