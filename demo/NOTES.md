# FutureFlux: what is live, what is staged

## Live

Strata loads the sourced Mesa scene. The host enumerates tagged, non-hidden
paths intersecting the view frustum and displays exactly the list supplied to
the real Strata model. The model selects a JSON operation; a deterministic host
checks the closed vocabulary, bounds and uniquely spoken target. With two paths
and no unique target, it refuses `ambiguous-path`, highlights both and explains
why. This does not depend on a timed cue. A clarification is another real model
request. Shade meshes are then created/revised in Strata; editor changes are undoable.

The runner synthesizes SRT with Dub, feeds that actual WAV to Whisper, waits for
actual inference, and types Whisper's actual output into Strata with 65 ms per
character. It never substitutes the SRT as the transcript. Model errors stop
the take. Real latency remains, even if the beat exceeds fifteen seconds.

## Arranged / not claimed

This is one operator, not multiplayer or XR. We selected two **real GIS path
centerlines** and one **real building footprint**, but omitted other site
paths, assumed widths/building height, and arranged ground, trees, people,
lighting and camera. This is a representative reconstruction at a real Mesa
site, not the City's surveyed digital twin or a community-approved proposal.
Candidate landmark aliases, the prompt and the scene arrangement are authored.
Host grounding is conservative; the paper's 86% benchmark is not remeasured.
The cinematic revision adds seeded, embedded procedural gravel, paving, roof,
stucco and foliage textures, a warm low-angle key, cool sky/edge fill, soft
shadows and ACES exposure 0.95. These are authored finishes and illustrative
lighting, not photographs or a solar study. All GIS geometry stays unchanged.
There are now 32 top-level objects (one additional fill light).
The authoring installer explicitly applies the saved export settings, and the
runner selects the viewport's "as render" mode so its preview uses those same
settings. Loading scene JSON alone does not reliably replace an existing
editor's renderer preferences.

**Speech is synthetic, explicitly authorized by the requester.** The panel
discloses that throughout. Original FX3 (human Spanish speech) is **unmet**.
Dub exposes English voices. Two genuine Spanish attempts (Whisper Tiny and
Small) failed on the clarification, transcribing "centro comunitario" as
"Centro Communitario"; both were refused without adding geometry. No transcript
was corrected or workaround alias added. **Spanish end-to-end remains blocked**
on suitable Spanish speech. The Spanish unit test is not a speech gate pass.

**Beat 8 is cut.** ASU's public source uses 2021 MODIS LST percentile ranks, not
temperature degrees. EDI package licence/citation could not be verified. No
fake heat, live thermal model, cooling estimate or invented temperature is shown.

## Capture and acceptance

`run.mjs --record` requires headed Chromium and OBS at 1920x1080, a working OBS
WebSocket server and a configured capture source. It refuses to interfere with
an existing recording. It captures at real speed, travels between targets, and
holds the real refusal at least 3.5 seconds. Takes are numbered and accompanied
by machine-readable reports. `--rehearse` makes **no footage/capture claim**.
OBS was not installed on the development machine: FX2 and finished footage
remain pending. A configured OBS source still needs a human check that it
captures Chromium and its audio, rather than a different window.

**Scene export correction:** Initial rehearsal evidence below predates a visual
export fix: object matrices were not updated before serialization, and a
procedural building-geometry rotation did not survive reloading. The GIS
metadata was correct, but the visible paths collapsed at the origin and the
building stood vertically. The export now saves object transforms, rotates the
building mesh, and saves Strata's control center. A reload regression test checks
every path segment against its stored GIS coordinates and the building's height.
Earlier speech/operation rehearsals are not evidence of correct scene appearance.

**Verified:** 5 focused operation tests, the scene reload test and the seeded
surface/shadow serialization test pass (7 total). Actual hosted-Strata Snapshot
exports at 1920x1080 with shadows on/off differ visibly: 158,295 pixels have a
summed RGB difference above 20. This is a still-render check, not an OBS take.
A complete unattended **English**
rehearsal passed: Dub -> actual Whisper transcripts -> Qwen2.5-Coder-1.5B ->
real ambiguity refusal -> >=3-second visible hold (about 3.5 s) -> clarified canopy on
`center-walk`. No footage was captured; the full run took about 49 seconds,
not the work order's aspirational fifteen. Model refusal latency was 4.05 s
initially and 1.47 s on a cached repeat; neither was sped up.
Evidence is in `validation.json`. A rerun first clears the isolated profile's
scene; it does not append another copy of the paths.

FX1/FX4/FX5/FX6 are verified for the English rehearsal, not an OBS take.
FX2 (OBS/1920x1080) and FX3 remain unmet; this display is 1512x982 and browser
content was 1512x805. FX7/FX8 are not passed (heat cut). FX9/FX10 are documented.
FX11 passed for English rehearsal only; Spanish/capture are pending. FX12 is
implemented: beat 7 does not depend on heat.

Setup: `cd demo && npm ci && npm test`. Regenerate the scene with `npm run scene`
(asset generation, not a Strata build). With Chrome installed,
`FLUX_BROWSER_CHANNEL=chrome node run.mjs --beat english --rehearse`.
Use `--beat spanish` for the separate ASR/model run. For capture use `--record`
instead and configure `FLUX_OBS_URL` / `FLUX_OBS_PASSWORD` in the environment.
No credentials are saved. Default bundled Chromium can be installed with
`npx playwright install chromium` if Chrome is unavailable. Model downloads
occur on first use and are cached in ignored `demo/.browser/`. Cached Dub audio
is reused only when the SRT and WAV hashes match its report; changed scripts
regenerate the speech rather than replaying a stale utterance.
