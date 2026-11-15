# NASA history ingestion status — 2026-11-15

User authorized NASA-only ingestion into existing Supabase tables. No schema
changes or model training were performed. The existing monthly prediction
workflow has not yet been switched to these observations.

## Persisted and verified

- POWER hourly UTC: 2016-01-01 through 2022-12-31, 245,472 observations
  across T2M, RH2M, PS and WS2M. One native cell intersects BBMP. Pressure
  converted from kPa to Pa. January 2020 pilot is included in that total.
- GPM IMERG V07 Final: 2020-01-01 through 2020-01-06, 3,744 observations.
  Half-hourly rainfall intensity (mm/h), 13 native cell footprints intersecting
  BBMP. These are not 1 km measurements or real-time observations.
- Successful batches preserve raw subset values, source references, checksums,
  quality reports and completion records in Supabase. Local files are caches.
  Source coverage/unit/calendar checks passed; these are not model skill tests.

## Storage pause

Database size measured using pg_database_size: 560,674,483 bytes (~534.7 MiB).
The user reports Free plan or unsure. Actual billing entitlement is not available
from the database connection. Confirm it in the Supabase dashboard before any
resumption. Both ingestion processes are stopped; no observations were deleted.
The unfinished POWER 2023 and IMERG January 7 jobs had no committed version and
were marked cancelled with reason "Paused for database storage capacity review".

POWER 2023–2025 and IMERG January 7 onward remain outstanding. Full 2016–2025
IMERG would contain approximately 2.28 million observations and likely require
several GB in this representation. The January pilot is incomplete.

## Restart requirements

Confirm or increase the database allowance, or agree a smaller/storage-based
representation using Supabase as the authoritative source. No purchase, cleanup
or storage redesign has been performed.

The writer now requires PREDICTION_DB_BUDGET_BYTES to be set explicitly to a
confirmed operational budget below the project's actual allowance. With no
budget it fails closed before downloading. Before each batch write it checks
database size plus a conservative estimate (8 KiB per observation, twice the
raw metadata size) and 64 MiB headroom. A shared transaction advisory lock
serializes these ingestion writers. This estimate is not a hard storage quota;
unrelated writers and physical storage overhead still require monitoring.
Do not set a fictional higher budget to bypass the current capacity blocker.

Resume using the existing CLI only after capacity is resolved. Completed exact
batches are skipped; POWER rejects overlapping ranges. Use disjoint remaining
dates. No historical observations should be deleted to make a rerun fit.

Validation before capacity guard: backend suite 56 passed, 4 skipped,
2 deselected. Additional guard regression covers missing budgets, exceeded
budgets, batch headroom and sufficient capacity.
