# Large-model joining design

## Purpose

Extend Plans to Print's existing STL split workflow so an oversized model becomes
printable, numbered sections that can be accurately and safely assembled after
printing. This work remains exclusively on `plans-to-print-rebuild` and its draft
PR; production is not changed.

## User outcome

After selecting an Ender 3, Ender 3 V2, Ender 3 Pro, or future custom printer,
the user can split a model, select a joining method, inspect the assembled result,
save the project, and download each printable part plus clear assembly information.

## Joining modes

### Default: keyed dovetail tabs with round alignment pins

Each split boundary has a keyed dovetail tab on one part, a matching socket on its
neighbour, and round alignment pins/sockets to prevent sideways misalignment. The
dovetail bears normal assembly load; pins locate the parts during glue-up.

### Alternatives

- **Pins only:** round locating pins and sockets for simple glue-fit joins.
- **Removable clip-fit:** a printable clip bridging a prepared joint where a
  removable assembly is needed.

The app exposes only modes that it can generate and validate.

## Geometry and tolerance rules

- All geometry uses model-space millimetres.
- The selected printer profile supplies the default clearance; the user may adjust
  it within a safe, bounded range.
- Joints are generated after the existing split planner produces sections, then
  applied symmetrically to both adjacent sections.
- A join is rejected when it exceeds a section's printable bounds, intersects an
  unsupported/thin region, cannot maintain the required wall margin, or produces
  invalid mesh output.
- A failed join leaves the existing split unchanged and reports the reason.

## Data model and persistence

Persist a `joiningPlan` with the split project/model state. It records the selected
mode, clearance, generated joint descriptors, neighbouring part IDs, and the model
revision used to create it. Transient preview meshes are regenerated rather than
persisted. Changing the model or split invalidates the joining plan and requires
regeneration; autosave, explicit save, and recovery retain valid join settings.

## User interface

The split workflow adds a compact **Joining** panel after a successful split:

1. Choose Default dovetail + pins, Pins only, or Removable clips.
2. Review printer-derived clearance and optionally adjust it.
3. Generate and validate joins.
4. Inspect per-part labels and an assembled preview.
5. Export individual STLs or the assembly ZIP.

The preview distinguishes tabs, sockets, and external clips without suggesting
that decorative helpers will export as model geometry.

## Export

Export uses the existing individual STL and ZIP paths. Part filenames include their
assembly sequence. The ZIP adds an assembly manifest with part order, orientation,
joint type and locations, selected printer profile, and clearance. It never claims
the export succeeded if a join or STL validation fails.

## Error handling

- Unsupported source geometry: explain that the split can exist but a join could
  not be safely placed.
- Invalid clearance: restore the printer default and display the accepted range.
- Stale joining plan: mark it stale after model/split edits and block export until
  regenerated.
- Storage errors: preserve the last known valid saved project and use existing
  guarded persistence/recovery behaviour.

## Test strategy

Add deterministic geometry tests for two- and three-plus-part splits, complementary
tab/socket and pin/socket geometry, printer clearance bounds, invalid thin-wall and
out-of-bounds placement, stale-plan handling, save/reopen recovery, STL validity,
and assembly ZIP contents. Run the existing production build and split/ZIP tests.

## Out of scope

This increment does not claim general-purpose mesh sculpting, arbitrary boolean
repair, or physical printer calibration. Manual printed fit checks on the user's
printers remain a release validation activity.
