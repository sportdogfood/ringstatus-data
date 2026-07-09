# Core 1-4 Next-Day Preflight Contract

Date locked: 2026-07-08

## Purpose

Core 1-4 must proactively test the next focus day before the live date change.

The purpose is not to force one successful run. The purpose is to identify the first real blocker early, classify it, and turn that blocker into a durable Core fix.

## Boundary

This is an outside-lane preflight.

It may:
- read live Horseshowing source endpoints
- read helper tables needed for matching
- run probe and parse logic in memory
- project Step 4 runtime rows in memory
- report exact blockers

It must not:
- write heartbeat rows
- mutate source tables
- mutate runtime tables
- repair production records
- count manual endpoint success as cadence proof
- keep retrying until state changes without classifying the blocker

## Required Test

For the next `focus_day`, the outside lane must run real source acquisition:

1. `get_ring_days.php`
2. `update_schedule.php` for each focus-day ring
3. bounded `class_oog.php` probe according to Core policy
4. raw-doc parse in memory
5. Step 4 runtime projection in memory

The test must use actual next-day source data. Rewriting today’s date keys is only a key-portability test and does not prove next-day readiness.

The preflight may also simulate `3A2`/`3B2` retry-to-cap behavior, but the report must keep that separate from the primary production path. Checked/no-match retry work is second-pass refinement and must not be reported as a blocker to initial runtime unless the approved Core policy changes.

## PASS Criteria

PASS means:
- focus-day ring rows exist
- update schedule rows exist for the focus-day rings
- probe completes within the approved cap
- raw docs that are found are parsed
- no pending parse docs remain
- Step 4 projection has no blocker
- Time Engine seed wake is valid for the projected runtime handoff
- projected runtime row counts are nonzero for:
  - `hs_ring_status`
  - `hs_class_start_times`
  - `hs_entry_go_times`

Second-pass PASS means:
- `3A2` retry candidates are marked and counted separately
- retries stop at the approved cap
- any raw docs discovered by `3A2` are parsed by `3B2`
- second-pass work does not prevent the primary Step 4 projection from being considered production-ready

## FAIL Criteria

FAIL means the first blocker is identified and no production mutation was made.

Examples:
- no ring days for next focus day
- update schedule returns empty for all rings
- one or more ring schedule calls fail
- probe cap reached but required raw docs are missing
- parse leaves pending or failed raw docs
- Step 4 projection has a blocker
- runtime identity/key construction is invalid

## Blocker Handling

Every FAIL must produce:
- stage
- exact blocker
- source counts
- affected ring/class examples
- whether the issue is source availability, Core parsing, matching policy, runtime projection, or schema/identity drift

The next action should be a Core code or policy fix when the blocker is repeatable. Do not patch live records to make a single run pass.

## Current Lab Command

The current outside-lane command shape is:

```powershell
node .\core_1_4_lab.js --dataset-source live --show-no 14910 --source-focus-day YYYY-MM-DD --run-probe true --retry-no-match-to-cap true
```

This command is diagnostic proof only. It is not production cadence proof.

## Operational Meaning

If the preflight passes but production later fails, compare production state against the preflight stages. The mismatch is the blocker:

- source acquisition mismatch
- cadence did not continue through required stages
- mirror/write failure
- schema drift
- focus-day/show switch drift
- downstream lane assumption mismatch

The fix belongs in the lane that owns the failing stage.
