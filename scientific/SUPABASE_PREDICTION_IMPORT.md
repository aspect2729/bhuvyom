# Prediction archive import — 2026-11-15

The user authorized adding existing prediction outputs to Supabase after the
observation ingestion storage pause. Imported three existing monthly experiments
atomically into the existing schema; no training, observation downloads, schema
changes, deletion or model promotion occurred.

Verified committed counts:

- 18 experiment-specific model records in `model_registry` (development status).
- 1,416 origin/model/stage groups in `prediction_runs`.
- 13,386 records in `predictions`.
- 13,338 matched actual/error records in `prediction_evaluations`.
- Three NASA POWER archive versions in `dataset_versions`, containing input
  snapshots, source code snapshots, manifests, original reports and checksums.

Predictions comprise 11,772 validation, 1,530 calibration, 24 independent-test,
24 retrospective interval-repair and 36 forecast records. The forecast records
include the older experiment; the latest temperature and precipitation forecasts
each cover December 2026 through November 2027. These are monthly estimates at
one coarse representative cell, not citywide high-resolution forecasts.

Missing actuals are retained as unevaluated metadata, never invented. Archived
independent-test uncertainty bounds are suppressed in the queryable prediction
columns. Original defective intervals and historical reports remain as explicitly
archived provenance; their interval scores must not be presented as valid skill.
Repaired intervals remain labelled retrospective, not a fresh independent test.

Supabase lacks a mm/day unit. Monthly mean precipitation rates were converted to
mm/h (divide by 24) using the existing rainfall-intensity variable and unit.
Evaluation errors were recomputed in stored units; original values, units,
prediction IDs and per-prediction horizons remain in
`prediction_runs.run_parameters.source_records`. Original evaluations are JSON
in `prediction_evaluations.quality_notes`. A run's horizon_seconds is its maximum
target-month-start minus origin-month-start; calendar horizons are preserved in
the source records. Generated timestamps retain original generation times.

Import implementation: `backend/scripts/import_prediction_archive.py`. It
verifies artifact checksums and matched errors, uses deterministic run IDs,
refuses changed archives and skips previously imported archives. Four integrity
tests pass. Live verification found zero mismatched values, zero mismatched
errors, and zero exposed invalid independent-test bounds. A second import
skipped all three experiments and inserted zero rows.

Database grew from 560,674,483 to approximately 581,023,411 bytes (~554.1 MiB),
about 19.4 MiB. This was a bounded archive transfer (32 MiB input cap, 64 MiB
growth rollback threshold), not a confirmed project quota increase. Transaction
rollback does not necessarily reclaim allocated disk. Free-plan capacity remains
unresolved and bulk historical observation ingestion remains paused.

Existing outputs and provenance are now persisted in Supabase. The current
dashboard and training workflow still read local artifacts; this import does not
enable automatic synchronization or switch training to Supabase observations.
Run the importer explicitly for additional archives only after capacity review.
