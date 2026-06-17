# WEC Entry Go Times Workflow

Version: 2026-06-16.1

## Purpose

Create `entry_go_times` from the current locked class schedule and active-trainer order-of-go rows.

This is not a one-off export. The repeatable runner is:

`horseshowing_entry_go_times_runner`

Live function:

`https://horseshowing-700800454.development.catalystserverless.com/server/horseshowing_entry_go_times_runner/`

Required input:

- `show_no`
- `focus_day`
- Airtable token from `WEC_AIRTABLE_TOKEN`, `AIRTABLE_TOKEN`, request body `airtable_token`, query `airtable_token`, or token header.

Verified test input:

- `show_no=14906`
- `focus_day=2026-06-14`

## Source Tables

`update_schedule_staging`

- Only locked rows are used: `{lock}=1`
- Only focus-day rows are used: `iso_date = focus_day`
- Supplies class-level schedule context:
  - `show_no`
  - `focus_day`
  - `ring_no`
  - `ring_day_no`
  - `class_no`
  - `class_name`
  - `time_text`
  - `entry_count`
  - links already present on staging rows

`class_start_times`

- Supplies the prepared class start row for each locked class.
- Match key:
  - `show_no|focus_day|ring_day_no|class_no`
- Supplies:
  - `class_start_time`
  - `display_time`
  - link to `class_start_times`

`class_oog`

- Only focus-day rows are used.
- Only active-trainer rows are used.
- Supplies entry-level order-of-go context:
  - `class_no`
  - `entry_no`
  - `entry_order`
  - `horse`
  - `horse_display (from horses)`
  - `rider`
  - `trainer`
  - `trainer_display (from trainers)`
  - links already present on class_oog rows

## Target Tables

Catalyst:

- `hs_entry_go_times`

Airtable mirror:

- `entry_go_times`

## Key

Primary key:

`show_no|focus_day|class_no|entry_no`

Fallback only when `entry_no` is missing:

`show_no|focus_day|class_no|entry_order|horse`

## Link Requirements

Every active Airtable `entry_go_times` row must link to:

- `shows`
- `focus_show`
- `classes`
- `rings`
- `ring_days`
- `entries`
- `horses`
- `riders`
- `trainers`
- `class_oog`
- `class_start_times`

The runner verifies these links after every run.

Success requires:

- Catalyst missing keys = 0
- Catalyst extra keys = 0
- Airtable missing keys = 0
- Airtable extra active keys = 0
- Airtable missing required links = 0

If any required link is missing, the run is not success.

## Time Logic

Current initial estimate:

- `pace_seconds = 120`
- `entry_go_time = class_start_time + ((entry_order - 1) * pace_seconds)`

This is the prepared estimate lane. Live pace enrichment from `get_orders.php` / `get_rings.php` is not part of this runner yet.

## Logging

Every run writes to `wec-logs`.

Success log:

- `workflow_lanes = Alerts`
- `log_type = entry_go_times`
- `check_name = sync-entry-go-times`
- `status = ok`
- summary includes active row count, source row count, and missing link count

Failure log:

- `workflow_lanes = Alerts`
- `log_type = entry_go_times`
- `check_name = sync-entry-go-times`
- `status = error`
- summary includes failing phase and error

Payloads are sanitized. Airtable tokens are not written to `payload_json`.

## Repeatable Run Contract

Run order:

1. Read `focus_show`.
2. Read locked `update_schedule_staging`.
3. Read active `class_start_times`.
4. Read active-trainer `class_oog`.
5. Build `entry_go_times`.
6. Upsert Catalyst `hs_entry_go_times`.
7. Upsert Airtable `entry_go_times`.
8. Mark stale Airtable rows inactive.
9. Verify Catalyst count/key parity.
10. Verify Airtable count/key/link parity.
11. Write `wec-logs`.

The runner can be repeated for the same `show_no` and `focus_day`.

Repeat behavior:

- Existing matching rows update.
- Missing rows insert.
- Rows no longer present from active `class_oog` become inactive in Airtable.
- Catalyst rows not in the current active set are deleted.
- The verification count must remain stable after a second run.

## Verified Result

Verified on 2026-06-16:

- `show_no = 14906`
- `focus_day = 2026-06-14`
- source rows = 33
- Catalyst `hs_entry_go_times` rows = 33
- Airtable `entry_go_times` active rows = 33
- Airtable missing required links = 0
- `wec-logs` success summary: `entry_go_times active 33; source 33; links missing 0`

## Known Trouble

1. The deployed Catalyst function did not expose `WEC_AIRTABLE_TOKEN` during verification. The runner is repeatable when the caller supplies the Airtable token or when the Catalyst environment variable is configured.

2. `entry_go_time` is still an estimate. It uses fixed `pace_seconds = 120` until live pace data is connected from `get_orders.php` / `get_rings.php`.

3. If `class_oog` has not been refreshed for active trainers, `entry_go_times` will be incomplete because this runner does not ping `class_oog.php`.

4. If upstream helper links are missing on `update_schedule_staging`, `class_start_times`, or `class_oog`, verification will fail with `missing_required_links > 0`.

5. A missing `class_start_times` link is treated as failure. That must be corrected upstream, not hidden here.
