# WEC Live get_rings / get_orders Workflow

Version: 2026-06-16.1

## Purpose

`get_rings.php` and `get_orders.php` are live Horseshowing endpoints. They are not prep-time schedule builders.

They should run only inside the manually managed live window on Airtable `focus_show`:

- `show_start_time`
- `show_end_time`

The live window is evaluated in Florida time: `America/New_York`.

## Actions Covered

The shared live gate applies to every code path that calls `fetchAndSyncCurrent`:

- `sync-rings`
- `sync-orders`
- `sync-focus-status`
- `sync-live`
- `heartbeat`
- `sync-all`

Manual payload import actions are not gated because they do not ping Horseshowing:

- `sync-rings-payload`
- `sync-orders-payload`

## Source of Manual Control

Airtable table:

- `focus_show`

Required fields:

- `show_no`
- `focus_day`
- `show_start_time`
- `show_end_time`

The user owns these values manually.

## Gate Logic

Before pinging either live endpoint:

1. Resolve `focus_day`.
2. Read Airtable `focus_show` for `show_no + focus_day`.
3. Parse `show_start_time`.
4. Parse `show_end_time`.
5. Read current Florida date/time.
6. Allow live ping only when:
   - current Florida date equals `focus_day`
   - current Florida time is between `show_start_time` and `show_end_time`

If the window crosses midnight, the gate allows times after start or before end.

If focus_show or either time is missing, the gate fails closed and does not ping.

## Endpoint Purpose

### get_rings.php

Endpoint:

`POST https://www.horseshowing.com/get_rings.php`

Body:

`show_no={show_no}`

Purpose:

- Current ring status.
- Current class by ring.
- Includes `class_no`.
- Best live source for ring/class status.
- Useful for current ring pace and class status.

Important payload fields:

- `show_no`
- `ring_no`
- `ring_day_no`
- `ring`
- `day`
- `class_no`
- `class`
- `entry`
- `total`
- `n_to_go`
- `n_gone`
- `time`
- `timestamp`
- `elapsed`
- `type`

Writes:

- Catalyst `hs_get_rings`
- Source mirror only; does not create schedule structure directly.

### get_orders.php

Endpoint:

`POST https://www.horseshowing.com/get_orders.php`

Body:

`show_no={show_no}`

Purpose:

- Current order/class state by ring.
- Current entry status.
- Useful for `total`, `n_to_go`, `n_gone`, `timestamp`, and `elapsed`.
- Class number may need resolution because the payload does not reliably provide `class_no`.

Important payload fields:

- `show_no`
- `ring_no`
- `ring_day_no`
- `ring`
- `day`
- `class`
- `entry`
- `total`
- `n_to_go`
- `n_gone`
- `time`
- `timestamp`
- `elapsed`

Writes:

- Catalyst `hs_get_orders`
- Source mirror only; does not create schedule structure directly.

## Logging

Every live attempt writes to Airtable `wec-logs`.

For `get_rings.php`:

- `workflow_lanes = Live`
- `log_type = get-rings`
- `check_name = sync-rings`

For `get_orders.php`:

- `workflow_lanes = Live`
- `log_type = get-orders`
- `check_name = sync-orders`

Possible status values:

- `ok`
- `skipped`
- `error`

Skipped rows are expected outside the live window.

Skipped summary examples:

- `get_rings skipped: outside_live_window`
- `get_orders skipped: missing_live_window`

Success summary example:

- `get_rings ok: raw 1; parsed 1; mirrors 1`

Failure summary example:

- `get_orders failed: upstream /get_orders.php HTTP 500`

Payloads include the evaluated live window and are sanitized.

## Repeatable Run Contract

When inside the live window:

1. Read Airtable `focus_show`.
2. Confirm live window.
3. Ping `get_rings.php` and/or `get_orders.php`.
4. Parse payload.
5. Scope to focus-day classes where possible.
6. Upsert source mirror rows.
7. Write `wec-logs`.

When outside the live window:

1. Read Airtable `focus_show`.
2. Confirm current time is outside the window.
3. Do not ping Horseshowing.
4. Write `wec-logs` skipped row.

## Known Trouble

1. `get_orders.php` does not reliably include `class_no`. Any use of get_orders for class-level enrichment must resolve class identity from existing focus-day class data.

2. `get_rings.php` is stronger for class identity because it includes `class_no`, but it is ring-status oriented rather than entry-list oriented.

3. Missing `show_start_time` or `show_end_time` means no live pings. This is intentional.

4. If the show day changes and `focus_show` is not updated, live pings will skip because current Florida date must equal `focus_day`.

5. Live data can update class status, `n_gone`, `n_to_go`, elapsed time, and current entry. It should not replace the locked prep schedule source.

6. `sync-rings-payload` and `sync-orders-payload` bypass the live window because they process supplied payloads and do not ping Horseshowing.
