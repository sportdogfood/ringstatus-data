# Catalyst Next Steps

Goal: produce repeatable, table-shaped discovery output for WEC/Horseshowing
without overbuilding or saving unstable data.

## Guardrails

- Use Catalyst SDK/MCP/CLI and live endpoint evidence.
- Do not guess endpoint contracts.
- Do not deploy to Production.
- Do not add Datastore save routes yet.
- Do not replace RingStatus/SGL runner workflows.
- Keep source in an isolated Catalyst/Horseshowing workspace, not `ringstatus`.

## Step 1: Source Workspace

Status: complete for the new clean function.

```text
catalyst-workspaces/horseshowing/functions/horseshowing_discovery
```

The old `horseshowing_proxy` and `horseshowing_proxy_sdk` functions remain
reference/runtime probes. Their source was not pulled because the CLI requires
an interactive selector.

## Step 2: Read-Only Discover Tables

Status: implemented and deployed to Development as:

```text
https://horseshowing-700800454.development.catalystserverless.com/server/horseshowing_discovery/
```

Extend `/discover` so it can return these table outputs:

```text
rings_days
ring_day_schedule
class_counts
current_ring_status
current_orders
class_oog
```

Each response should include:

- inbound params
- upstream URL
- upstream method
- forwarded body
- upstream status
- response type
- raw body preview
- parsed table `{ columns, rows, row_count }`
- parser warnings

## Step 3: Parser Order

Implement parsers in this order:

1. `get_ring_days.php` -> `rings_days`
2. `update_schedule.php` -> `ring_day_schedule`
3. `get_rings.php` -> `current_ring_status`
4. `get_orders.php` -> `current_orders`
5. `counts.php` -> `class_counts`
6. `class_oog.php` -> `class_oog`

Reasoning:

- `rings_days` gives the driver keys.
- `ring_day_schedule` gives usable class/time schedule.
- `get_rings.php` is the live polling source.
- `get_orders.php` is a second current-status source.
- `counts.php` fills class inventory/counts.
- `class_oog.php` fills horse/rider/trainer only when needed.

## Step 4: Reliability Runs

Run each parser against the same show repeatedly:

```text
show_no=14905
```

Track:

- success/failure
- empty response behavior
- session expiry behavior
- row count drift
- parser warning count
- fields missing from expected shape

## Step 5: Storage Decision

Only after parser stability:

- Stratus: raw response archive
- Datastore: normalized snapshots
- JobScheduling: measured polling or periodic snapshots
- Automation Testing: parser regression checks
- Analytics: inspection dashboard

## First Useful Team Output

The first useful WEC view should be:

```text
ring/day schedule + current ring status + class entry counts + optional class OOG
```

Avoid full trip/result workflows until a reliable source is found.
