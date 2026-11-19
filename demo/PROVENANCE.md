# FutureFlux provenance

Retrieved 2026-11-16. `files.sha256` pins the scene, code and local source extracts.
Local coordinates: origin WGS84 longitude -111.667328704, latitude 33.431791272;
x east, y up, z south, metres. Longitude is scaled by cos(latitude). This local
approximation is for a representative site model, not surveying.

## Current root scene: Encanto and land surface temperature

The root `flux.json` includes the Red Mountain site, an Encanto neighborhood
comparison at its geographic location, and the user's illustrative tree
proposals. The historical voice-demo operations remain separate; their
`heat.show` command does not control these scene layers.

- **Encanto boundary:** [City of Mesa registered neighborhoods and HOAs,
  neighborhood 301](https://services2.arcgis.com/1gVyYKfYgW5Nxb1V/ArcGIS/rest/services/Mesa_Neighborhoods_HOAs/FeatureServer/0).
  The current boundary was retrieved 2026-11-19; it is not asserted to be the
  boundary as it existed on the satellite observation date.
- **Encanto building units:** [City of Mesa CommunityMaps building
  footprints](https://gis.mesaaz.gov/mesaaz/rest/services/OpenData/CommunityMaps/MapServer/6).
  The 247 existing building-unit polygons intersecting the boundary are
  extruded to an **assumed 6 m**; the terrain is illustrative. They are not a
  complete inventory of every building; none of the returned unit centroids
  falls within the selected Encanto heat sample. Credit: **City of Mesa,
  Information Technology Department, Enterprise GIS**. The City terms and
  conditions are described below.
- **Heat source:** USGS/NASA Landsat 9 Collection 2 Level-2 surface temperature,
  [scene LC09_L2SP_037037_20250729_02_T1](https://planetarycomputer.microsoft.com/api/stac/v1/collections/landsat-c2-l2/items/LC09_L2SP_037037_20250729_02_T1),
  acquired 2025-07-29 at 18:03:53 UTC (about 11:04 MST).
  [Dataset DOI](https://doi.org/10.5066/P9OGBGM6);
  [USGS redistribution terms](https://www.usgs.gov/faqs/are-there-any-restrictions-use-or-redistribution-landsat-data).
- **Comparison:** the Red Mountain window `[6541,3000,17,17]` averages
  51.45 °C; the Encanto window `[6475,3007,17,17]` averages 58.47 °C.
  Windows are native 30 m product-grid cells in EPSG:32612; all 289 cell
  centers in the Encanto window fall within the current neighborhood boundary.
  Both windows exclude ST_B10 DN 0 and QA_PIXEL bits 0–5 (fill, dilated
  cloud, cirrus, cloud, cloud shadow and snow); all cells passed. Convert with
  `°C = DN * 0.00341802 + 149 - 273.15`. Native thermal resolution is about
  100 m. The overlaid colors use a fixed 40–60 °C Viridis scale and blend with
  the scene.
- These are equal-sized **samples**, not averages for two whole neighborhoods.
  They represent one observation of **land surface temperature**, not air
  temperature, a temperature forecast, or the effect of proposed trees. The
  displayed tree placements are conceptual, not a mapped tree inventory or
  an assessed planting plan.
- **OpenStreetMap:** © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright),
  [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The separately
  attributed [source extract](data/openstreetmap-context.odbl.json) records
  the source request, way IDs, versions, tags and WGS84 coordinates; keep it
  with redistribution of the OSM-derived context.

## Mesa redistribution permission and conditions

Verified **2026-11-16 (MST)** against the rendered
[City of Mesa Open Data Terms of Use License Agreement](https://data.mesaaz.gov/stories/s/Terms-of-Use-page/2dcd-j2nx/).
This is the permission basis for keeping the extracts in `demo/data/` and
distributing the GIS-derived scene, not merely a link to a reachable endpoint.

- **Section 3(e), Permitted Uses:** the City states that datasets are made
  available to the public on an open-license basis. It defines that basis as:

  > "there are no restrictions on copying, publishing, distributing, modifying or using the data for a commercial or non-commercial use."

- **Section 3(f), Data Credit:** the City must be listed as the source on all
  products using the data or derivative work, including maps, reports, displays
  and applications. Credit must accompany exported footage/stills too, not
  just the source repository. Use **City of Mesa GIS**; for the footprint,
  retain its layer credit: **City of Mesa, Information Technology Department,
  Enterprise GIS**. The tutorial caption/credits and demo panel identify the City.
- **Section 3(b), additional conditions:** terms embedded in the data or stated
  at its source also apply. The service and layer descriptions/copyright fields
  for ParkFinder/19, ParkFinder/16 and CommunityMaps/6 were inspected on the
  verification date. No additional use restriction was stated in those fields;
  the footprint's City department credit is retained below. Empty copyright
  fields are not permission, and do not make the data public domain.
- **Section 4, Warranty and Disclaimers:** the City disclaims warranties,
  including accuracy, currency, completeness and fitness for a particular
  purpose, and supplies data and derivative work as-is, with all faults. The
  user bears responsibility for checking resulting products and assumes risk.
  The agreement also contains liability, indemnity and other conditions;
  this summary does not replace the full agreement.
- **Sections 3(h) and 3(j):** do not claim ownership of the City's data or
  derivative work; the City can modify the licence. The linked page is mutable,
  not an immutable licence snapshot. Recheck the full terms and any source
  conditions before a new acquisition or reuse.

The same permission-evidence rule applies to Mesa and ASU. Mesa has the
identified redistribution clause above; ASU's investigated package does not
yet have verified reuse terms. Fetching at generation time would not itself
remove licence obligations or make redistribution of the derived scene safe.

## Mesa mapped pedestrian paths

- **source:** City of Mesa GIS, Parks/ParkFinder/MapServer/19 (Trails).
  [Service](https://gis.mesaaz.gov/mesaaz/rest/services/Parks/ParkFinder/MapServer/19?f=pjson).
  Query envelope `-111.6692,33.4305,-111.6653,33.433`, input/output SR 4326,
  spatial relationship intersects, fields OBJECTID/FACILITYID/COMNAME/PathSegmentName/Surface.
  [Query](https://gis.mesaaz.gov/mesaaz/rest/services/Parks/ParkFinder/MapServer/19/query?geometry=-111.6692%2C33.4305%2C-111.6653%2C33.433&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=OBJECTID,FACILITYID,COMNAME,PathSegmentName,Surface&outSR=4326&f=geojson).
- **licence:** [City of Mesa Data Terms of Use License Agreement](https://data.mesaaz.gov/stories/s/Terms-of-Use-page/2dcd-j2nx/).
  Redistribution basis: **section 3(e)**, quoted above; City-source credit:
  **section 3(f)**; additional source terms: **section 3(b)**; disclaimers:
  **section 4**. The REST layer's empty copyright field is not the licence.
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
- **attribution:** City of Mesa GIS. Building layer's published credit:
  **City of Mesa, Information Technology Department, Enterprise GIS**.
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
- **cinematic look:** original, deterministic 64x64 RGBA grain textures from
  `surfaces.mjs` (seeds 11, 23, 37, 41, 53 and 67), with procedural paving
  joints. The texture pixels are embedded in scene JSON; no imagery, external
  texture downloads, generated images or facade survey is used. Stucco,
  roofing, foliage and ground finishes are illustrative, not site observations.
  Warm low-angle key, cool sky/edge fill, shadows and ACES exposure 0.95 are
  art direction, not a measured date/time or thermal model. GIS coordinates,
  widths, footprint and height are unchanged.
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
