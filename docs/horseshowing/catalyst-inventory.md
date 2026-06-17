# Catalyst Inventory

Verified via Catalyst MCP and local Catalyst CLI.

## Project

- Project name: `horseshowing`
- Project ID: `5614000000393031`
- Org ID: `700800454`
- Environment: `Development`
- Domain: `https://horseshowing-700800454.development.catalystserverless.com`
- Timezone: `America/New_York`
- Project type: `Live`
- Created: `Jun 05, 2026 03:08 PM`

## Functions

### `horseshowing_discovery`

- Function ID: `5614000000399001`
- API name: `horseshowing_discovery`
- Stack: `node24`
- Type: `advancedio`
- Invoke URL: `https://horseshowing-700800454.development.catalystserverless.com/server/horseshowing_discovery/`
- Created from local source:
  `catalyst-workspaces/horseshowing/functions/horseshowing_discovery`
- Deploy target: Development
- Deploy status: successful
- Datastore writes: none

Current role: clean read-only discovery/parser function for verified
Horseshowing/WEC endpoints.

### `horseshowing_sync`

- API name: `horseshowing_sync`
- Stack: `node24`
- Type: `advancedio`
- Invoke URL: `https://horseshowing-700800454.development.catalystserverless.com/server/horseshowing_sync/`
- Created from local source:
  `catalyst-workspaces/horseshowing/functions/horseshowing_sync`
- Deploy target: Development
- Deploy status: successful
- Datastore writes: yes, through `zcatalyst-sdk-node`

Current role: first real base schedule/status sync function. It writes
`show > day > ring > class > class_time > entry` and leaves `focus` at `0`
until `hs_entry_lookup` exists.

Live verification:

- `?action=seed-sample` returned `ok: true` and linked existing seed rows:
  `show=5614000000394038`, `day=5614000000401035`,
  `ring=5614000000398395`, `class=5614000000394040`,
  `class_time=5614000000400360`, `entry=5614000000393876`.
- `?action=sync-rings&show_no=14905` reached Horseshowing with upstream status
  `200`, but parsed `0` rows without a fresh browser/PHP session.

Live verification:

- `endpoint=update-schedule&show_no=14905&ring_day_no=3828` returned `19` parsed rows.
- `endpoint=rings&show_no=14905` returned current ring-status rows.
- `endpoint=orders&show_no=14905` returned current order/status rows.
- `endpoint=show&show_no=14905` returned show shell metadata and PDF links.
- `endpoint=ring-days&show_no=14905` returned `invalid_parameter_returned` without a full browser PHP session, now surfaced as parser warnings.

### `horseshowing_proxy`

- Function ID: `5614000000393054`
- API name: `horseshowing_proxy`
- Stack: `node24`
- Type: `applogic`
- Memory: `256`
- Invoke URL: `https://horseshowing-700800454.development.catalystserverless.com/server/horseshowing_proxy/`
- Created: `Jun 05, 2026 03:10 PM`
- Modified: `Jun 05, 2026 09:37 PM`
- `is_deployed`: `false`
- Environment variables: none listed

Current role: main discovery/proxy function. Existing behavior is useful as
reference, but the current implementation is allowed to be replaced if a cleaner
function is safer.

### `horseshowing_proxy_sdk`

- Function ID: `5614000000393465`
- API name: `horseshowing_proxy_sdk`
- Stack: `node24`
- Type: `applogic`
- Memory: `256`
- Invoke URL: `https://horseshowing-700800454.development.catalystserverless.com/server/horseshowing_proxy_sdk/`
- Created: `Jun 05, 2026 06:42 PM`
- Modified: `Jun 05, 2026 06:42 PM`
- `is_deployed`: `false`
- Environment variables: none listed

Current role: SDK/Data Store experiment. Keep as reference unless storage/save
becomes the task.

## Datastore

Canonical Datastore tables were created in Development on `Jun 06, 2026`.
CSV discovery fields were added after creation so schedule ingest is not blocked
by missing lookup data.

### Canonical Tables

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

The stored relationship is:

```text
hs_shows
  hs_days.show_ref
    hs_rings.day_ref
      hs_classes.ring_ref
      hs_class_times.ring_ref + hs_class_times.class_ref
        hs_entries.class_time_ref + hs_entries.class_ref
          hs_focus.entry_ref when hs_entries matches hs_entry_lookup
```

Seed rows were inserted for show `14905` to make the nesting visible in the
Datastore UI:

```text
hs_shows ROWID        5614000000394038
hs_days ROWID         5614000000401035
hs_rings ROWID        5614000000398395
hs_classes ROWID      5614000000394040
hs_class_times ROWID  5614000000400360
hs_entries ROWID      5614000000393876
```

`hs_entry_lookup` and `hs_focus` are empty by design until the team lookup is
loaded.

Lookup status:

```text
Base schedule ingest: does not require hs_entry_lookup
Focus creation: requires hs_entry_lookup
```

Manual show controls live on `hs_shows`:

```text
start_date
end_date
focus_day_date
focus_status_cadence
focus_day_cadence
future_days_cadence
zoom_cadence
```

Canonical focus actions on `horseshowing_sync`:

```text
set-show-config
sync-focus-status
sync-focus-day
sync-future-days
```

`sync-live` is retained as a backward-compatible alias for
`sync-focus-status`; it is not the canonical workflow name.

Show `14906` verification on Jun 09, 2026:

```text
set-show-config
  stored: start_date 2026-06-09, end_date 2026-06-14, focus_day_date 2026-06-09
  cadences: focus_status 1m, focus_day 5m, future_days 30m, zoom 2m

sync-focus-status
  upstream_requests: 3
  get_rings parsed_rows: 4
  get_orders parsed_rows: 3

sync-focus-day
  focus_day_source: hs_shows.focus_day_date
  total_ring_days: 45
  selected_ring_days_total: 7
  selected_ring_days: 7
  schedule_rows: 10

sync-future-days&days_limit=5
  focus_day_source: hs_shows.focus_day_date
  total_ring_days: 45
  selected_ring_days_total: 38
  selected_ring_days: 5
  schedule_rows: 57
  has_more: true
  next_offset: 5
```

### `hs_orders_snapshot`

- Table ID: `5614000000393065`
- Modified: `Jun 05, 2026 05:47 PM`

Columns:

- `show_no`
- `ring_no`
- `ring_day_no`
- `ring`
- `day`
- `class_name`
- `entry`
- `total`
- `n_to_go`
- `n_gone`
- `time_text`
- `hs_timestamp`
- `elapsed`
- `orders_json`
- `gone_json`
- `captured_at`

Rows observed: `1`

Observed row:

- `ROWID`: `5614000000393468`
- `show_no`: `14905`
- `ring_no`: `665`
- `ring_day_no`: `3833`
- `ring`: `Indoor 4 - Gary`
- `day`: `Friday, June 5, 2026`
- `class_name`: `757) 1.15m Junior/Amateur Jumper II.1`
- `entry`: `#1956, Zafer<br>In ring at 5:18pm`
- `total`: `13`
- `n_to_go`: `10`
- `n_gone`: `3`
- `time_text`: `5:18pm`
- `hs_timestamp`: `1780694307`
- `elapsed`: `272`
- `orders_json`: `[]`
- `gone_json`: `[]`
- `captured_at`: `2026-06-05 18:45:00`

Assessment: current table is an early hardcoded `orders` snapshot table. Do not
extend it as the canonical schema. Use it as reference only.

## Crons / Job Scheduling

- `List_All_Crons` returned no configured cron jobs.

Assessment: no Catalyst JobScheduling lane exists yet.

## Pipelines

- `List_All_Pipelines` returned no configured pipelines.

Assessment: no Catalyst CI/CD pipeline exists yet.

## Logs

Application logs for both functions over the last 7 days returned no rows via
MCP using resource IDs:

- `5614000000393054`
- `5614000000393465`

## Automation Testing

The Catalyst MCP exposes `Execute_Automation_Test`, but not a list/discover tool
for available automation test suites. A suite ID is required to execute tests.

Assessment: Automation Testing may exist in the Catalyst console, but it is not
discoverable through the current MCP surface without a test suite ID.

## Source Pull Status

Local Catalyst CLI is authenticated and can see project `horseshowing`, but
`catalyst pull functions` opens an interactive raw function selector. It showed
both functions:

- `horseshowing_proxy_sdk (node24)`
- `horseshowing_proxy (node24)`

Normal stdin piping did not select functions. Source was not pulled in this run.

## Decision

Because existing functions are hardcoded/poorly written and not required, the
clean path is:

1. Treat both existing functions as reference/runtime probes.
2. Build a new clean read-only discovery/parser function or replace
   `horseshowing_proxy` only after confirming the chosen deployment path.
3. Keep Datastore writes disabled until parser contracts stabilize.
4. Use a new normalized schema instead of extending `hs_orders_snapshot`.
