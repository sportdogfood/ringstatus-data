# Horseshowing / WEC Catalyst Discovery Lane

This lane evaluates Horseshowing as a WEC show-data provider using Catalyst and
Zoho products end to end. Use Catalyst SDK/MCP/CLI and live endpoint evidence as
the authority. Do not guess endpoint contracts, params, or payload shapes.

It uses the SGL pipeline as the canonical target shape, but only hydrates what
Horseshowing can provide reliably.

This is not a commercial-grade build track yet. The first priority is to support
the team with the smallest dependable workflow the data allows.

## Current Provider Endpoints

```js
var PATH_TO_ENDPOINT = {
  "/shows-happening": "shows-happening",
  "/orders": "orders",
  "/rings": "rings",
  "/ring-days": "ring-days",
  "/ring-day": "ring-day",
  "/class-oog": "class-oog",
  "/update-schedule": "update-schedule"
};
```

## Canonical Target Model

Use the SGL/RingStatus model as the vocabulary:

- `shows`
- `show_weeks`
- `days`
- `rings`
- `class_times`
- `class_groups`
- `live_groups`
- `classes`
- `entries`
- `go_times`
- `trips`
- `live_trips`
- `riders`
- `results`

Capability statuses:

- `available`: directly present and repeatable
- `partial`: present but incomplete
- `derived`: can be calculated from reliable fields
- `scraped`: only available from HTML or browser-shaped output
- `manual`: needs operator/team input
- `missing`: no reliable source found
- `not_needed`: not required for the chosen service level

## Discovery Rules

- Do not infer methods, params, or field meanings from endpoint names.
- Treat endpoint role labels as hypotheses until verified by live payloads.
- Keep raw upstream responses before normalizing rows.
- Use SDK/MCP schemas before calling Catalyst tools.
- Use `application/x-www-form-urlencoded` only where live tests prove it.
- Do not write to Production.
- Do not add Datastore save paths until discovery parsing is stable.

## Discovery Phases

1. Capture raw responses through Catalyst `/discover` using SDK/MCP/CLI-backed tests.
2. Classify endpoint reliability and required parameters.
3. Map fields into the canonical SGL target model.
4. Decide the minimum useful team workflow.
5. Fill only critical gaps with derived, scraped, or manual data.
6. Promote stable pieces into Datastore, Stratus, JobScheduling, Automation Testing, Analytics, or Flow.

## Service Levels

- `level_1`: show, day, ring, class inspection
- `level_2`: schedule plus order-of-go snapshots
- `level_3`: live-ish class/order tracking
- `level_4`: trip, rider, result workflow if reliable data exists

Do not build beyond the level the data can support.

## Catalyst / Zoho Stack Under Test

- Catalyst Functions: `/discover` proxy/parser
- Catalyst Stratus: raw payload archive
- Catalyst Datastore: normalized snapshots after shape stabilizes
- Catalyst Datastore BulkJobs: larger import/export
- Catalyst JobScheduling: polling after endpoint reliability is proven
- Catalyst Automation Testing: endpoint/parser regression checks
- Zoho Analytics: reporting/inspection dashboards
- Zoho Sheet: manual QA and support edits
- Zoho Flow: later orchestration and notifications

## Branch Status

- `show`: first-pass captured as weak bootstrap shell.
- `schedule`: first-pass captured; continue observing browser refresh for `get_orders.php` and `get_ring_day_oc.php`.
- `counts`: first-pass captured; no additional requests observed.
- `rings` / `ringstatus`: first-pass captured through `rings.php?show=14905` and `get_rings.php`; browser constantly polls `get_rings.php`.
- `class-oog`: first-pass captured through `class_oog.php?class_no=28587`; provides entry, horse, rider, trainer table when available.
- `unresolved`: `shows_happening.php` and `get_have_times.php` may help later but are not mapped yet.
- `results`: pending and not critical.

## Assessment And Next-Step Artifacts

- `14905/storage-contract.md`: locked show -> day -> ring -> class -> entry -> focus storage contract.
- `14905/entry_lookup.json`: canonical lookup file for focus overlay.
- `provider-assessment.md`: current capability assessment and recommended service level.
- `normalized-contract.json`: first parser output contract.
- `catalyst-next-steps.md`: read-only Catalyst implementation sequence.
- `catalyst-inventory.md`: verified Catalyst project, function, table, cron, pipeline, and automation-testing inventory.

## Immediate Test Order

Start with:

1. `rings`
2. `ring-days`
3. `ring-day`
4. `orders`

Then evaluate `class-oog`, `shows-happening`, and `update-schedule`.
