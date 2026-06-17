# Horseshowing / WEC Provider Assessment

This assessment is based only on captured browser evidence in this folder.
Horseshowing is a thin provider compared with SGL. Use the SGL model as the
target vocabulary, but hydrate only the slices proven reliable.

## Recommended Service Level

Start at `level_2_schedule_oog_snapshots`, with a small `level_3_live_status`
slice.

This supports the team with:

- ring/day schedule inspection
- class list with times and entry counts
- current ring status polling
- class entry/order-of-go snapshots when available

Do not attempt full `level_4_trip_rider_result_workflow` yet. Full trips,
live trip history, standings, and results are not proven.

## Proven Useful Sources

| Source | Type | Use |
| --- | --- | --- |
| `show.php?show=14905` | HTML shell | show identity, dates, last updated, PDF fallbacks |
| `get_ring_days.php` | JSON | ring/day calendar and `ring_day_no` list |
| `update_schedule.php` | HTML fragment | class schedule for a selected `ring_day_no` |
| `counts.php` | HTML document | class inventory and entry counts |
| `get_rings.php` | JSON polling | current ring-status rows |
| `get_orders.php` | JSON | current/live-ish status rows from schedule branch |
| `class_oog.php?class_no=...` | HTML | entry, horse, rider, trainer table by class |

## What We Can Hydrate Now

- `shows`: partial from show shell/manual seed
- `days`: available from `get_ring_days.php`
- `rings`: available from `get_ring_days.php`
- `classes`: available from `update_schedule.php` and `counts.php`
- `class_times`: available from `update_schedule.php`
- `entries`: partial from counts and class OOG
- `go_times`: partial from current ring/order status
- `live_trips`: partial current state only
- `horses`: available from class OOG
- `riders`: available from class OOG
- `trainers`: available from class OOG

## What Stays Shelved

- full trip history
- reliable live trip stream
- class groups
- live groups
- complete results
- standings beyond observed `n_standings`
- automatic show discovery from `shows_happening.php`
- time-availability signals from `get_have_times.php`

## Critical Caveats

- HTML parsing is required for schedule detail, counts, and class OOG.
- `class_oog.php` may say `NOT A POSTED ORDER`; preserve that status.
- `get_rings.php` is browser-polled, but the cadence is not measured yet.
- Session/cookie behavior is still a runtime concern.
- Do not copy the full SGL stack intensity into this provider until reliability is proven.

## First Catalyst Target

Build a read-only discovery/parser endpoint that returns table-shaped JSON from
the proven sources without saving to Datastore yet.

Minimum output tables:

- `rings_days`
- `ring_day_schedule`
- `class_counts`
- `current_ring_status`
- `class_oog`

Save raw payloads to Stratus only after the request sequence is stable. Save
normalized rows to Datastore only after parser output is stable across repeated
captures.
