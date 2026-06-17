# Horseshowing Catalyst Model From Airtable Review

This is the working implementation target for Catalyst. Airtable is the modeling/reference surface, not the final structure to copy blindly.

## Keep As Core Payload Tables

| Table | Purpose | Key | Notes |
|---|---|---|---|
| `get_ring_days` | Raw/support payload that defines ring-day scope | `ring_day_no` | Links to `shows`, `ring_days`, `rings`, `ring_names`. |
| `update_schedule` | Focus/future day class schedule by ring-day | `show_no + ring_day_no + class_no` | Main schedule table. `days` in Airtable means `ring_day_no`; Catalyst should name it `ring_day_no`. |
| `counts` | Full-show class count payload | `show_no + class_no` | Useful full-show class support before schedule/status payloads fill. |
| `class_oog` | Entry list per class | `class_no + entry_no` | Main source for entries, horses, riders, trainers. |
| `get_rings` | Same-day status overlay with class_no | `show_no + ring_day_no + class_no` | Live/status only; not the base schedule. |
| `get_orders` | Same-day status overlay without class_no | `show_no + ring_no + ring_day_no + class_number` | Airtable formula uses parsed class number, not raw class text. |

## Keep As Support Tables

| Table | Key | Notes |
|---|---|---|
| `shows` | `show_no` | Stable show identity. Airtable primary is `show_id`; Catalyst should use `show_no`. |
| `focus_show` | `show_no + focus_day` | Manual driver row. This is not the same as `shows`. |
| `ring_days` | `ring_day_no` | Correct name. It was previously called `show_days`; Airtable is now `ring_days`. |
| `rings` | `ring_no` | Numeric ring identity plus current/name history. |
| `dows` | `WED`, `THU`, etc. | Helper only. Do not confuse with `ring_day_no`. |
| `classes` | `class_no` | Class identity; class text fields can come from counts, update schedule, or OOG. |
| `entries` | `entry_no` | Entry identity; enriched by OOG/status. |
| `horses` | `horse` | Taggable. |
| `riders` | `rider` | Taggable. |
| `trainers` | `trainer` | Taggable. |
| `ring_names` | `ring_name` | Helper. |
| `barn_name` | `barn_name` | Team/focus helper, not from Horseshowing payload. |
| `class_names` | `class_name` | Helper, but can be deferred if `classes.class_name` is sufficient. |

## Improve Before Catalyst

1. Rename Airtable-only `days` meaning to `ring_day_no` in Catalyst.
2. Do not create formula columns in Catalyst as stored fields unless needed for querying. Compute keys and parsed fields in code.
3. Store link targets as direct FK-like values in Catalyst:
   - `show_no`
   - `ring_day_no`
   - `ring_no`
   - `class_no`
   - `entry_no`
   - `horse`
   - `rider`
   - `trainer`
4. Keep Airtable formula fields as implementation logic:
   - `class_number`
   - `class_payout`
   - `class_name`
   - `class_start_time`
   - `dow`
   - `iso_date`
5. Keep endpoint rows raw enough to reprocess:
   - `source_endpoint`
   - `source_payload`
   - `source_html`
   - `synced_at`
6. Catalyst should not mirror Airtable reverse-link clutter.
7. `class_start_times` and `entry_go_times` are derived/enrichment tables, not first-pass payload tables.

## Catalyst Table Set

Core:

```text
hs_shows
hs_focus_show
hs_ring_days
hs_rings
hs_classes
hs_entries
hs_horses
hs_riders
hs_trainers
hs_ring_names
hs_dows
hs_barn_names
hs_class_names
```

Payload:

```text
hs_get_ring_days
hs_update_schedule
hs_counts
hs_class_oog
hs_get_rings
hs_get_orders
```

Derived later:

```text
hs_class_start_times
hs_entry_go_times
```
