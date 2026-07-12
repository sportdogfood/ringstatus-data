# horseshowing_sync

Writes Horseshowing/WEC base schedule data into Catalyst Datastore.

Supported actions:

```text
GET/POST ?action=sync-all&show_no=14905
GET/POST ?action=sync-live&show_no=14905
GET/POST ?action=sync-support&show_no=14905
GET/POST ?action=sync-ring-days&show_no=14905
GET/POST ?action=sync-counts&show_no=14905&counts_offset=0&counts_limit=100
GET/POST ?action=sync-rings&show_no=14905
GET/POST ?action=sync-orders&show_no=14905
POST     ?action=sync-ring-day&show_no=14905&ring_day_no=3834
POST     ?action=seed-sample
```

Optimized cadence:

```text
sync-live: one bootstrap, get_rings.php, get_orders.php
sync-support: one bootstrap, get_ring_days.php, counts.php
sync-all: one bootstrap, get_ring_days.php, counts.php, get_rings.php, get_orders.php
sync-ring-days: one bootstrap, get_ring_days.php, Catalyst support tables
```

Current WEC cadence entrypoints:

```text
focus_show change:
  Airtable automation: docs/horseshowing/airtable-automations/focus-show-on-change.js
  calls: set-show-config, then sync-ring-days&refresh_existing=1

scheduled cadence:
  PowerShell runner: docs/horseshowing/run-wec-catalyst-workflow.ps1
  cadence source: Airtable cadence rows after active shows/focus_show validation
  focus-day change: runner executes on the next heartbeat because focus_key changes
```

`sync-ring-days` uses Catalyst env auth. Do not pass `airtable_token` in the URL
for normal cadence. Horseshowing upstream requests use the internal HTTPS
transport path so Catalyst does not hang on the public `fetch()` path.

`sync-counts`, `sync-support`, and `sync-all` page counts writes. Defaults:

```text
counts_offset=0
counts_limit=100
```

Use `next_offset` until `has_more=false` for large shows.

`entry_lookup` is not required for base schedule ingest. `focus` is intentionally
not created by this function until lookup records exist.

## WEC schedule UI endpoint

`wec-schedule-ui` is the frontend-owned AG Grid contract. It reads prepared
Catalyst state and does not calculate timing, create triggers, or mutate workflow
tables. Existing `wec-mobile-live` consumers are unchanged.

Base URL:

```text
https://horseshowing-700800454.development.catalystserverless.com/server/horseshowing_sync/
```

### Overview schedule

```text
GET ?action=wec-schedule-ui&view=overview
```

The active Airtable `focus_show` supplies `showNo` and `focusDate`. An optional
`show_no` selects the active focus row for that show.

The response contains a flat chronological `rows[]` class schedule. It is not
wrapped in rings. Ring identity and state are repeated on each class row so AG
Grid can sort all classes by `sortTime` while still rendering ring special rows.

Each class has compact `entryRollups` grouped by trainer. A rolled entry exposes
both its class-specific `entryKey` and show-day `entryDayKey`. Full entry records
are omitted from overview.

Stable identities:

```text
ringKey     = persisted ring_const_key
rowKey      = persisted class_const_key
entryKey    = persisted entry_const_key / entry_go_key / entry_visual_key
entryDayKey = show_no | focus_day_key | entry_no
```

Overview class fields include:

```text
classNumber, className, sourceClassName, time, sortTime, ringKey, ring,
entryCount, entryCountScheduled, nGone, nToGo, isLive, paceSeconds,
status, classStartTime, estimatedEndTime, startsInMins, endsInMins,
followedClass, trackedEntryCount, tags, triggerTypes, entryState
ringStatus, ringLateMins, ringIsLive, entryRollups
```

`classNumber` is text so values such as `812b` are preserved. A class name may
legitimately begin with `$`. `sourceClassName` preserves the complete upstream
label.

Overview also returns resource counts for `class_list`, `entry_list`,
`ring_list`, `results_list`, and `alerts_list`.

### Entity lists

```text
GET ?action=wec-schedule-ui&view=class_list
GET ?action=wec-schedule-ui&view=entry_list
GET ?action=wec-schedule-ui&view=ring_list
GET ?action=wec-schedule-ui&view=results_list
GET ?action=wec-schedule-ui&view=alerts_list
```

`class_list` is the same flat schedule contract as overview. `entry_list` has
one row per `entryDayKey`, aggregated across every class entered that day.
`ring_list` has one current-state row per ring. Results and alerts retain their
persisted result and trigger identities.

### Entity details and drawers

```text
GET ?action=wec-schedule-ui&view=class_detail&rowKey=<class_const_key>
GET ?action=wec-schedule-ui&view=entry_detail&entryDayKey=<show|day|entry_no>
GET ?action=wec-schedule-ui&view=ring_detail&ringKey=<ring_const_key>
GET ?action=wec-schedule-ui&view=result_detail&resultKey=<rider_result_key>
GET ?action=wec-schedule-ui&view=alert_detail&triggerKey=<trigger_key>
```

The class drawer lists every class-specific entry individually. The entry drawer
aggregates every class occurrence for the selected `entryDayKey`, including go
times, current timing, results, and entry timewise events. Ring detail includes
ring status, classes, and ring events. Result and alert detail include their
matched class and entry context when available.

The original `view=dense&rowKey=...` remains as a compatibility alias for the
five-lane class payload:

```text
ringwise
classwise
entrywise
riderwise
timewise
```

Duplicate source objects with the same persisted `entryKey` produce one drawer
entry.

Dense entry fields include:

```text
entryKey, entryNo, name, order, rider, trainer, barnName, status,
entryOrderNow, entriesAhead, entryGoTime, entryGoTimeNow, goInMins,
paceSeconds, tags, triggerTypes, result
```

Rider results include:

```text
ready, status, place, score, finishedTime, source
```

Timewise records include the persisted trigger identity and occurrence data:

```text
triggerKey, triggerType, triggerTime, level, status,
ringKey, rowKey, entryKey, classNo, entryNo
```

Approved trigger vocabulary:

```text
ring_late_15
ring_late_30
class_start_60
class_start_30
class_live
entry_go_40
entry_go_20
entry_class_10_gone
entry_10_away
ring_class_change
result_ready
statewise_snapshot_due
```

The first eight are customer timing events. `ring_class_change`, `result_ready`,
and `statewise_snapshot_due` are internal workflow events. The endpoint reports
existing trigger records; it does not manufacture missing events.

### Source ownership

```text
ringwise  -> hs_ring_status
classwise -> hs_class_start_times
entrywise -> hs_entry_go_times
riderwise -> hs_rider_results
timewise  -> time_engine_triggers
```

Missing prepared values are returned as `null`, not artificial zeroes. `tags`
describe current prepared state. `triggerTypes` and `timewise` contain actual
append-only trigger events.
