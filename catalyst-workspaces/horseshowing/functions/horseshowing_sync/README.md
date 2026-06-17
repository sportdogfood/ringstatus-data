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
