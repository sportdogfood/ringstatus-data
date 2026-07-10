# WEC V2 Core Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated, unscheduled Catalyst Core lane that acquires a complete focus-day schedule, performs bounded probe and parse work, materializes ring/class/entry runtime rows, and records tagged append-only changes without touching legacy tables or runners.

**Architecture:** A machine-readable manifest defines the stages and table ownership. Ring discovery and per-ring schedule acquisition are durable Core work. Stage 3A follows the approved local HTML probe contract: the external runner fetches and scans one native class payload, then Catalyst records the result and stores raw HTML only when evidence exists. The handler exposes bounded actions but no scheduler is created until shadow verification passes.

**Tech Stack:** Node.js 20, Catalyst Advanced I/O, `zcatalyst-sdk-node`, native `node:test`, Cheerio, Catalyst Data Store/ZCQL.

## Global Constraints

- Do not modify or invoke legacy Core, Live, Time Engine, Results, Alerts, Publish, or mirror runners.
- Do not add a scheduler during this implementation.
- Prefix every new Catalyst table and key with `wec_v2_`.
- One failed ring or class must not erase or restart completed work.
- Stage 2 cannot pass until every discovered ring has a terminal schedule result.
- Catalyst performs no `class_oog.php` network request. The local probe runner submits a terminal probe result.
- Probe attempts have at most three total scans: one `C3A` plus two `C3A2` retries.
- `C3A2` and `C3B2` do not block initial runtime materialization.
- `wec_v2_change_log` is append-only and tags `ring`, `class`, `entry`, `result`, or `alert` entities.

---

### Task 1: Executable Contract And Pure State Model

**Files:**
- Create: `catalyst-workspaces/horseshowing/functions/wec_v2_core_lane/manifest.json`
- Create: `catalyst-workspaces/horseshowing/functions/wec_v2_core_lane/contract.js`
- Test: `catalyst-workspaces/horseshowing/functions/wec_v2_core_lane/test/contract.test.js`

**Interfaces:**
- Produces: `datasetKey(showNo, focusDay)`, `workKey(datasetKey, stage, entityKey)`, `changeKey(...)`, `transitionWork(item, event)`, and `auditDataset(snapshot)`.

- [ ] Write failing tests proving immutable dataset keys, legal work transitions, retry caps, all-ring Stage 2 completeness, and non-blocking second-pass work.
- [ ] Run `node --test test/contract.test.js` and verify RED because `contract.js` does not exist.
- [ ] Implement the minimal pure contract functions and manifest validation.
- [ ] Run the contract test and verify GREEN.

### Task 2: Source Acquisition And Durable Ring Coverage

**Files:**
- Create: `catalyst-workspaces/horseshowing/functions/wec_v2_core_lane/source.js`
- Create: `catalyst-workspaces/horseshowing/functions/wec_v2_core_lane/pipeline.js`
- Test: `catalyst-workspaces/horseshowing/functions/wec_v2_core_lane/test/source.test.js`
- Test: `catalyst-workspaces/horseshowing/functions/wec_v2_core_lane/test/pipeline.test.js`

**Interfaces:**
- Consumes: ring-day discovery payload and one `C2_SCHEDULE_RING` work item.
- Produces: normalized schedule rows, preflight flags, one terminal ring result, and queued `C3A_PROBE_CLASS` work.

- [ ] Write failing tests where nine discovered rings but only six terminal ring results keep Stage 2 `OPEN` and identify rings `712`, `713`, and `714` as missing.
- [ ] Write failing tests proving Ticketed Schooling preflight rows do not create probe work.
- [ ] Run the source and pipeline tests and verify RED.
- [ ] Implement bounded fetch helpers, ring/schedule parsers, normalization, preflight classification, and per-ring completion accounting.
- [ ] Run tests and verify GREEN.

### Task 3: Fast Local Probe And Catalyst Parse Workers

**Files:**
- Modify: `catalyst-workspaces/horseshowing/functions/wec_v2_core_lane/pipeline.js`
- Create: `catalyst-workspaces/horseshowing/runners/wec_v2_probe_runner.js`
- Test: `catalyst-workspaces/horseshowing/functions/wec_v2_core_lane/test/probe.test.js`
- Test: `catalyst-workspaces/horseshowing/functions/wec_v2_core_lane/test/parse.test.js`

**Interfaces:**
- Consumes: one queued class, one locally fetched payload, and allowed trainer/helper evidence.
- Produces: a submitted probe result, optional raw document, parsed class entries, and review state.

- [ ] Write a failing test proving Catalyst receives a payload and performs no HorseShowing request in 3A.
- [ ] Write failing tests for checked-no-match, raw-stored, horse-first parsing, trainer fallback, apostrophes, international characters, numbers, and review-required continuation.
- [ ] Run tests and verify RED.
- [ ] Implement one-class local HTML scanning, Catalyst probe-result ingestion, and parse execution.
- [ ] Run tests and verify GREEN.

### Task 4: Runtime Materialization And Tagged Change Log

**Files:**
- Modify: `catalyst-workspaces/horseshowing/functions/wec_v2_core_lane/pipeline.js`
- Test: `catalyst-workspaces/horseshowing/functions/wec_v2_core_lane/test/runtime.test.js`

**Interfaces:**
- Consumes: complete primary schedule rows and parsed class entries.
- Produces: `wec_v2_ring_status`, `wec_v2_class_start_times`, `wec_v2_entry_go_times`, and append-only change events.

- [ ] Write failing tests for class rows seeded from schedule, ring rows derived from class rows, active-trainer entry rows derived from parsed entries, and no duplicate change event when the state hash is unchanged.
- [ ] Run the runtime tests and verify RED.
- [ ] Implement deterministic runtime builders and tagged change events.
- [ ] Run tests and verify GREEN.

### Task 5: Catalyst Repository And Unscheduled Handler

**Files:**
- Create: `catalyst-workspaces/horseshowing/functions/wec_v2_core_lane/repository.js`
- Create: `catalyst-workspaces/horseshowing/functions/wec_v2_core_lane/handler.js`
- Create: `catalyst-workspaces/horseshowing/functions/wec_v2_core_lane/package.json`
- Create: `catalyst-workspaces/horseshowing/functions/wec_v2_core_lane/catalyst-config.json`
- Test: `catalyst-workspaces/horseshowing/functions/wec_v2_core_lane/test/handler.test.js`
- Modify: `catalyst-workspaces/horseshowing/catalyst.json`

**Interfaces:**
- Actions: `status`, `audit`, `seed-dataset`, and `work-one`.
- Tables: `wec_v2_datasets`, `wec_v2_work_queue`, `wec_v2_change_log`, `wec_v2_update_schedule`, `wec_v2_class_oog_raw`, `wec_v2_class_oog`, `wec_v2_ring_status`, `wec_v2_class_start_times`, `wec_v2_entry_go_times`.

- [ ] Write failing handler tests for read-only status, bounded one-item work, missing-table failure, and no legacy table names in writes.
- [ ] Run handler tests and verify RED.
- [ ] Implement repository pagination, idempotent upsert, append-only change writes, raw Node response handling, and the four actions.
- [ ] Add the unscheduled function target to `catalyst.json`.
- [ ] Run all tests and verify GREEN.

### Task 6: Schema And Deployment Verification

**Files:**
- Create: `catalyst-workspaces/horseshowing/functions/wec_v2_core_lane/schema.json`
- Create: `catalyst-workspaces/horseshowing/functions/wec_v2_core_lane/test/schema.test.js`

**Interfaces:**
- Produces: exact Catalyst table/column manifest and deployment readiness report.

- [ ] Write a failing test that compares `schema.json` with the table names and required fields in `manifest.json`.
- [ ] Run the schema test and verify RED.
- [ ] Add the exact table/column definitions and verify GREEN.
- [ ] Run `node --test test/*.test.js` and `node --check` for each JavaScript file.
- [ ] Create only the prefixed Catalyst Development tables after local verification.
- [ ] Deploy only `wec_v2_core_lane` with no scheduler and do not invoke it.
- [ ] Read back function and scheduler inventory to prove legacy targets are unchanged and no v2 scheduler exists.
