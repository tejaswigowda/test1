# FutureFlux closed operation vocabulary

The host enumerates real tagged path objects intersecting the camera frustum
(excluding hidden ancestors), displays their IDs/landmark aliases, and supplies
that same list as the model's target enum. This is frustum visibility, not an
occlusion/depth-buffer query. The model selects JSON; it never supplies executable
code, vertices, coordinates or an asset URL. The host validates again before mutation.

| Operation | JSON arguments | Bounds / semantics |
|---|---|---|
| `shade.add(path, kind)` | `op:"shade.add", path, kind` | Visible path ID; `canopy`, `sail`, `trees`; default proposal 4 m wide, 3.5 m high |
| `shade.width(m)` | `op:"shade.width", value` | Finite number, 1-12 m; most recently added proposal |
| `shade.height(m)` | `op:"shade.height", value` | Finite number, 2.2-8 m |
| `shade.material(id)` | `op:"shade.material", id` | `canvas-sand`, `canvas-teal`, `timber`; illustrative colour/material, not an engineering specification |
| `shade.remove(id)` | `op:"shade.remove", id` | Exact generated shade ID, e.g. `shade-001` |
| `view.focus(id)` | `op:"view.focus", id` | Look at an existing path/proposal; no geometry change |
| `view.orbit(deg)` | `op:"view.orbit", value` | Finite number, -180 to 180 degrees, around local origin |
| `heat.show(layer)` | `op:"heat.show", layer` | Currently always `no-heat-layer`; no licensed layer installed |
| `heat.hide()` | `op:"heat.hide"` | Idempotent; no heat is installed |

Use `window.flux.execute({...})` in Strata's Shell for direct operations.
`window.flux.shade`, `.view`, and `.heat` also expose the functions above.
Model refusals use `{"op":"refuse","reason":"...","detail":"..."}`.
Additional/missing arguments and unlisted operations are refused.

## Named refusals

- **no-such-path**: path not visible/not present, nonexistent proposal/object, or
  revision without a selected proposal. No fuzzy creation of a new target.
- **ambiguous-path**: more than one visible path and no unique spoken landmark/ID.
  Both are highlighted. A model guess does not override absent grounding.
  With exactly one candidate a deictic reference can resolve.
- **out-of-range**: invalid kind/material, finite bounds violated, unknown
  operation or invalid argument shape.
- **no-heat-layer**: no verified, licensed, pinned published heat layer installed.
- **model-unavailable**, **model-error**, **invalid-proposal**, **busy**:
  named infrastructure/protocol refusals; never a success-shaped fallback.

Ambiguity is a real host constraint, not a timer or a canned transcript response.
The model is called and its raw selection/latency is shown; the host can refuse
even a confident guess or a misclassified request. This is deliberately stricter
than trusting the model. The candidate aliases and prompt are authored. This
demo does not reproduce or claim the paper's 86% evaluation result.

Shade creation/revision/removal in the editor uses Strata's undo commands.
The embedded scene script also runs in Strata's standalone preview, where it
edits the preview scene and does not change the pinned baseline.
