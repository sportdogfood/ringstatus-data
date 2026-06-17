# WEC Live Data Paths

Version: 2026-06-14.1

## Source Of Truth

Catalyst is the render source of truth for WEC mobile, print, PDF, core mirror, helper mirror, and alerts.

Airtable remains the operator surface for `focus_show`, `class_hide`, trainer active flags, and helper edits. Airtable changes must sync into Catalyst before render. Airtable mirror tables are not the front-facing render source.

Static JSON is fallback only. Front-facing WEC mobile and print must call Catalyst live endpoints first.

## Mobile

Page: `https://ringstatus.com/wec-mobile`

Embed source: `C:\Users\gombc\OneDrive - Sport Dog Food\github\repos\ringstatus\docs\horseshowing\webflow-drops\wec-mobile-webflow-embed.html`

Primary data endpoint: `horseshowing_sync?action=wec-mobile-live`

Data path:
1. Webflow embed loads.
2. Embed calls Catalyst `wec-mobile-live`.
3. Catalyst resolves `focus_show`.
4. Catalyst applies `class_hide`.
5. Catalyst reconciles current Airtable `entry_go_times` into Catalyst `hs_entry_go_times`.
6. Catalyst reads `hs_class_start_times`, `hs_entry_go_times`, `hs_classes`, `hs_class_times`, and helper metadata.
7. Catalyst returns mobile-shaped rings/classes/rollups.

Static JSON role: fallback only.

## Print

Page: `https://ringstatus.com/wec-print`

Webflow loader source: `C:\Users\gombc\OneDrive - Sport Dog Food\github\repos\ringstatus\docs\horseshowing\webflow-drops\wec-print-webflow-embed.html`

Catalyst embed source: `C:\Users\gombc\OneDrive - Sport Dog Food\github\repos\ringstatus-data\catalyst-workspaces\horseshowing\functions\horseshowing_sync\webflow-embeds\wec-print.html`

Primary data endpoint: `horseshowing_sync?action=wec-print-live`

Data path:
1. Webflow loader fetches Catalyst `wec-print-embed-html`.
2. Print embed calls Catalyst `wec-print-live`.
3. Catalyst follows the same schedule build path as mobile.
4. Print render groups rows by ring.
5. Print column placement is deterministic from rendered ring row counts.

Static JSON role: fallback only.

## PDF

Button path: `/wec-print` PDF button.

PDF worker: `https://ringstatus-pdf.gombcg.workers.dev/`

Data path:
1. User clicks PDF on `/wec-print`.
2. PDF worker opens `/wec-print?pdf=1`.
3. `/wec-print` loads Catalyst `wec-print-embed-html`.
4. Embed calls Catalyst `wec-print-live`.
5. Worker waits for `html[data-rs-pdf-ready="1"]`.
6. Worker returns `application/pdf`.

## Core Mirror

Core endpoints:
- `update_schedule.php`
- `counts.php`
- `class_oog.php`

Catalyst tables:
- `hs_class_start_times`
- `hs_entry_go_times`
- `hs_class_times`
- `hs_classes`
- `hs_entries`
- `hs_ring_days`
- `hs_rings`
- `hs_days`

Rule: core data is mirrored into Catalyst first. Airtable mirrors are for inspection and operator workflow.

## Helpers

Operator source: Airtable.

Catalyst render helpers:
- active trainers
- trainer display labels
- horse barn/display names
- class hide rules
- ring display names
- focus show

Rule: helper changes in Airtable must sync into Catalyst. Render uses Catalyst helper state after sync.

## Alerts

Primary inputs:
- `hs_class_start_times`
- `hs_entries`
- `hs_class_times`
- active trainer state

Alert output:
- `wec_alerts` in Airtable as operational output.
- `wec_logs` for run/audit trace.

Rule: alerts are derived from Catalyst schedule and entry state, then mirrored/logged to Airtable.

## Reconciliation Rule

Current Airtable `entry_go_times` is reconciled into Catalyst `hs_entry_go_times` by `horseshowing_sync?action=reconcile-entry-rollups`.

For matching active-trainer class rows:
- current entry timing/detail rows are upserted into `hs_entry_go_times`;
- `hs_class_start_times` remains the class schedule table;
- mobile and print join `hs_class_start_times` to `hs_entry_go_times` by `show_no`, `focus_day`, and `class_no`;
- `hs_entries` remains helper/detail data and does not own class rollups.

This keeps corrected rollups in Catalyst instead of relying on Airtable-only render overlay.
