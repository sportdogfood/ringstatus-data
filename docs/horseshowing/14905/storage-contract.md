# WEC 14905 Storage Contract

Use only these terms for this lane:

```text
shows
  show
    days
      day
        rings
          ring
            classes
            class_times
              class
                entry
                  entry_lookup
                    focus
```

## Rule

Manage the entire show schedule.

Add `focus` only when:

```text
entry = entry_lookup
```

Do not remove non-focus schedule data. `focus` is an overlay, not the schedule.
Missing `entry_lookup` must not block schedule ingest. It only blocks creating
`focus` rows.

## Stored Now In Repo

Canonical local/static storage for this show:

```text
C:\Users\gombc\OneDrive - Sport Dog Food\github\repos\ringstatus-data\docs\horseshowing\14905\
```

Current files:

```text
entry_lookup.json
storage-contract.md
```

Next generated files should be:

```text
show.json
days.json
rings.json
class_times.json
classes.json
entries.json
focus.json
```

## Source Payloads

`show`

Source:

```text
https://www.horseshowing.com/show.php?show=14905
```

Actual data observed:

```json
{
  "show_no": "14905",
  "title": "WEC Ocala Summer Opener - June 3 - 7, 2026",
  "last_updated": "2026 Jun 06 12:20pm"
}
```

`day`, `rings`

Source:

```text
https://www.horseshowing.com/get_ring_days.php
```

Actual data observed:

```json
{
  "ring_no": "665",
  "ring_name": "Indoor 4 - Gary",
  "ring_day_no": "3834",
  "date_text": "Saturday, June 6, 2026"
}
```

`class_times`, `class`

Source:

```text
https://www.horseshowing.com/update_schedule.php
body: show_no=14905&ring_day_no=3828
```

Actual data observed:

```json
{
  "show_no": "14905",
  "ring_day_no": "3828",
  "event_id": "55699",
  "class_no": "28587",
  "time_text": "12:15 pm",
  "entry_count": 2,
  "event_name": "782) 1.40m Junior/Amateur Jumper II.2d"
}
```

`entry`

Source:

```text
https://www.horseshowing.com/class_oog.php?class_no=28587
```

Actual data observed:

```json
[
  {
    "class_no": "28587",
    "entry_no": "1856",
    "horse": "Zara Www",
    "rider": "Kate Phillips",
    "trainer": "Manuel G. Torres"
  },
  {
    "class_no": "28587",
    "entry_no": "1939",
    "horse": "Harry D'ete RW",
    "rider": "Amanda Carroll",
    "trainer": "Christoph Schroeder"
  }
]
```

`focus`

Computed only from:

```text
entry_lookup.json
```

Example:

```json
{
  "class_no": "28587",
  "entry_no": "1856",
  "horse": "Zara Www",
  "rider": "Kate Phillips",
  "focus": true,
  "focus_reason": "entry_lookup"
}
```

If no match:

```json
{
  "focus": false
}
```

If entry data is not available:

```json
{
  "focus": "unknown"
}
```

## Catalyst Function

Development function:

```text
https://horseshowing-700800454.development.catalystserverless.com/server/horseshowing_discovery/
```

It currently parses:

```text
show
ring-days
update-schedule
rings
orders
counts
class-oog
```

Do not write these payloads to Datastore until this file contract is accepted.

Sync function:

```text
https://horseshowing-700800454.development.catalystserverless.com/server/horseshowing_sync/
```

Current supported actions:

```text
?action=sync-all&show_no=14905
?action=sync-focus-status&show_no=14905
?action=sync-live&show_no=14905
?action=sync-support&show_no=14905
?action=sync-ring-days&show_no=14905
?action=sync-counts&show_no=14905
?action=sync-orders&show_no=14905
?action=seed-sample
?action=sync-rings&show_no=14905
?action=sync-ring-day&show_no=14905&ring_day_no=3834
?action=set-show-config&show_no=14905&focus_day=2026-06-09
?action=sync-focus-day&show_no=14905
?action=sync-future-days&show_no=14905&days_limit=5
```

Current workflow:

```text
sync-focus-status
  cadence: every 1-2 minutes when the team starts the runner
  upstream requests: 3 total
    1 bootstrap: show.php?show=14905
    2 data: get_rings.php, get_orders.php
  writes: hs_shows, hs_days, hs_rings, hs_classes, hs_class_times, hs_entries
  note: sync-live remains only as a backward-compatible alias

set-show-config
  stores manual show controls on hs_shows:
    start_date, end_date, focus_day_date
    focus_status_cadence, focus_day_cadence, future_days_cadence, zoom_cadence

sync-focus-day
  cadence: every 5 minutes or manual after focus_day changes
  source: get_ring_days.php once, then update_schedule.php for focus_day ring_day_no values
  writes: hs_shows, hs_days, hs_rings, hs_classes, hs_class_times

sync-future-days
  cadence: slow/manual fallback refresh
  source: get_ring_days.php once, then paged update_schedule.php for days after focus_day
  paging: days_offset + days_limit

sync-support
  cadence: every 15-30 minutes or on manual refresh
  upstream requests: 3 total
    1 bootstrap: show.php?show=14905
    2 data: get_ring_days.php, counts.php
  writes: hs_shows, hs_days, hs_rings, hs_classes

sync-ring-days
  source: get_ring_days.php
  writes: hs_shows, hs_days, hs_rings

sync-counts
  source: counts.php
  writes: hs_shows, hs_classes

sync-rings
  source: get_rings.php
  writes: hs_shows, hs_days, hs_rings, hs_classes, hs_class_times, hs_entries

sync-orders
  source: get_orders.php
  writes: hs_shows, hs_days, hs_rings, hs_classes, hs_class_times, hs_entries

sync-all
  cadence: manual/full refresh, not every minute
  upstream requests: 5 total
    1 bootstrap: show.php?show=14905
    4 data: get_ring_days.php, counts.php, get_rings.php, get_orders.php
  runs: sync-ring-days, sync-counts, sync-rings, sync-orders
```

`seed-sample` was invoked successfully and wrote through the Catalyst Node SDK.
It returned the linked base path:

```text
show       5614000000394038
day        5614000000401035
ring       5614000000398395
class      5614000000394040
class_time 5614000000400360
entry      5614000000393876
```

`sync-rings&show_no=14905` reached Horseshowing with upstream status `200` but
parsed `0` rows without a fresh browser/PHP session.

## Catalyst Datastore

Catalyst Development Datastore now has the canonical tables for this lane.

```text
Project: horseshowing
Project ID: 5614000000393031
Org: 700800454
Environment: Development
```

The old `hs_orders_snapshot` table remains only as reference. Do not extend it
as the canonical model.

### Tables

```text
hs_shows          5614000000393475
hs_days           5614000000399004
hs_rings          5614000000398004
hs_classes        5614000000395004
hs_class_times    5614000000396008
hs_entries        5614000000400001
hs_entry_lookup   5614000000396367
hs_focus          5614000000397003
```

CSV discovery corrections are included:

```text
hs_shows: location, dates_text, updated_text, n_days, is_canceled, is_sold_out
hs_rings: active_for_team
hs_class_times: count_text, source_html, team_relevant, current_entry_text,
  current_entry_no, current_horse, entries_gone, entries_to_go,
  source_timestamp, elapsed_seconds, last_checked_at
hs_entries: source_html, order_status
```

### Nesting

```text
shows
  hs_shows.ROWID
    days
      hs_days.show_ref -> hs_shows.ROWID
        rings
          hs_rings.day_ref -> hs_days.ROWID
          hs_rings.show_ref -> hs_shows.ROWID
            classes
              hs_classes.ring_ref -> hs_rings.ROWID
            class_times
              hs_class_times.day_ref -> hs_days.ROWID
              hs_class_times.ring_ref -> hs_rings.ROWID
              hs_class_times.class_ref -> hs_classes.ROWID
                class
                  hs_classes.ROWID
                    entry
                      hs_entries.class_ref -> hs_classes.ROWID
                      hs_entries.class_time_ref -> hs_class_times.ROWID
                        entry_lookup
                          hs_entry_lookup.show_ref -> hs_shows.ROWID
                            focus
                              hs_focus.entry_ref -> hs_entries.ROWID
                              hs_focus.entry_lookup_ref -> hs_entry_lookup.ROWID
```

### Seed Path

One seed path was inserted so the Datastore UI shows the intended nesting:

```text
show
  hs_shows ROWID 5614000000394038
  show_no 14905
  show_name WEC Ocala Summer Opener - June 3 - 7, 2026

day
  hs_days ROWID 5614000000401035
  show_ref 5614000000394038
  day_label Saturday, June 6, 2026

ring
  hs_rings ROWID 5614000000398395
  show_ref 5614000000394038
  day_ref 5614000000401035
  ring_no 665
  ring_day_no 3834
  ring_name Indoor 4 - Gary

class
  hs_classes ROWID 5614000000394040
  ring_ref 5614000000398395
  class_no 28785
  class_label 756) $500 1.10m Amateur Jumper II.2d

class_time
  hs_class_times ROWID 5614000000400360
  day_ref 5614000000401035
  ring_ref 5614000000398395
  class_ref 5614000000394040
  class_time_text 2:48pm

entry
  hs_entries ROWID 5614000000393876
  class_ref 5614000000394040
  class_time_ref 5614000000400360
  entry_no 2017
  horse United Del Coco
```

`hs_entry_lookup` is intentionally empty until the team lookup is loaded.
`hs_focus` is intentionally empty because `focus` exists only when
`entry = entry_lookup`.
