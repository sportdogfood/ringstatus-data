# Catalyst Endpoint Test Results

Date: 2026-06-06
Project: `horseshowing`
Project ID: `5614000000393031`
Environment: `Development`

## Session Solution

Horseshowing context-dependent endpoints require a browser-like PHP session.
The working bootstrap is:

```text
GET /show.php?show=14905
collect PHPSESSID and HscomShowNo
reuse both cookies for dependent endpoint calls
```

This is now implemented in:

```text
horseshowing_discovery
horseshowing_sync
```

If `x-hscom-phpsessid` is provided, the functions use it. If not, they
automatically bootstrap from `show.php?show={show_no}`.

## Automation Testing

Catalyst MCP exposes only:

```text
CatalystbyZoho_Execute_Automation_Test
```

Required input:

```text
projectId
automation test suite id
Catalyst-org
Environment
```

No MCP tool is exposed to list, create, or discover Automation Testing suites.
The local Catalyst CLI help also does not expose an automation-test list/create
command. A suite ID from the Catalyst console is required before this MCP can
execute a Catalyst Automation Testing suite.

## Direct Endpoint Tests

### `horseshowing_sync`

Base URL:

```text
https://horseshowing-700800454.development.catalystserverless.com/server/horseshowing_sync/
```

`?action=seed-sample`

```json
{
  "ok": true,
  "action": "seed-sample",
  "counters": {
    "shows": 1,
    "days": 1,
    "rings": 1,
    "classes": 1,
    "class_times": 1,
    "entries": 1,
    "focus": 0
  }
}
```

`?action=sync-ring-day&show_no=14905&ring_day_no=3834&ring_no=665&ring_name=Indoor%204%20-%20Gary&day_label=Saturday%2C%20June%206%2C%202026`

```json
{
  "ok": true,
  "action": "sync-ring-day",
  "upstream_status": 200,
  "parsed_rows": 20,
  "counters": {
    "shows": 1,
    "days": 1,
    "rings": 1,
    "classes": 15,
    "class_times": 15,
    "entries": 0,
    "focus": 0
  }
}
```

`?action=sync-rings&show_no=14905`

```json
{
  "ok": true,
  "action": "sync-rings",
  "upstream_status": 200,
  "parsed_rows": 0
}
```

Interpretation: the current/live ring endpoint is reachable but returned no
rows without active Horseshowing session context.

`?action=sync-ring-days&show_no=14905`

```json
{
  "ok": true,
  "action": "sync-ring-days",
  "upstream_status": 200,
  "parsed_rows": 33,
  "counters": {
    "shows": 1,
    "days": 6,
    "rings": 33
  }
}
```

`?action=sync-orders&show_no=14905`

```json
{
  "ok": true,
  "action": "sync-orders",
  "upstream_status": 200,
  "parsed_rows": 2,
  "counters": {
    "shows": 1,
    "days": 1,
    "rings": 2,
    "classes": 2,
    "class_times": 2,
    "entries": 2,
    "focus": 0
  }
}
```

`?action=sync-all&show_no=14905`

```text
ringDays parsed_rows: 33
rings parsed_rows: 3
orders parsed_rows: 2
```

## Discovery Endpoint Tests

Base URL:

```text
https://horseshowing-700800454.development.catalystserverless.com/server/horseshowing_discovery/
```

`?endpoint=show&show_no=14905`

```text
upstream_status: 200
row_count: 1
show_no: 14905
title: WEC Ocala Summer Opener - June 3 - 7, 2026
last_updated: 2026 Jun 06 6:31pm
```

`?endpoint=update-schedule&show_no=14905&ring_day_no=3834`

```text
upstream_status: 200
row_count: 20
warnings: none
```

`?endpoint=rings&show_no=14905`

```text
upstream_status: 200
row_count: 0
warnings: none
```

`?endpoint=orders&show_no=14905`

```text
upstream_status: 200
row_count: 0
warnings: none
```

`?endpoint=counts&show_no=14905`

```text
upstream_status: 200
row_count: 292
warnings: none
bootstrapped: true
```

Expected payload type: HTML. The function now bootstraps a PHP session and
parses the expected counts table.

`?endpoint=class-oog&class_no=28587`

```text
upstream_status: 200
row_count: 2
warnings: not_posted_order
bootstrapped: true
```

Expected payload type: HTML. The function now bootstraps a PHP session and
parses the expected order table.

Rows parsed:

```text
1856 | Zara Www | Kate Phillips | Manuel G. Torres
1939 | Harry D'ete RW | Amanda Carroll | Christoph Schroeder
```

`?endpoint=ring-days&show_no=14905`

```text
upstream_status: 200
row_count: 33
warnings: none
bootstrapped: true
```

## Datastore Verification

ZCQL verified `15` `hs_class_times` rows for:

```text
show_no = 14905
ring_day_no = 3834
```

Examples:

```text
28633 | 602) .65m Jumper Open IV.1 | 7:30 am
28636 | 605) .65m Jumper Jr/Am Long Creek Farms IV.1 | 7:30 am
28785 | 750) 1.10m Junior/Amateur Jumper II.2d | 2:15 pm
33481 | 537) USHJA 3'3 | 6:30 pm
```

## Current Boundary

Working:

```text
show shell discovery
ring-day schedule discovery
ring-day schedule sync into Datastore
seed sample sync into Datastore
```

Returned no parseable source rows in this run:

```text
current rings
orders
```

Fixed by automatic PHP session bootstrap:

```text
ring-days
counts
class-oog
```

Blocked by missing Catalyst Automation Testing suite ID:

```text
Catalyst Automation Testing execution
```
