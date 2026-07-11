"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const handler = require("../handler");

test("stage writes update the oldest existing canonical record and create only missing keys", () => {
  const rows = [
    { raw_key: "class-1", probe_status: "checked" },
    { raw_key: "class-2", probe_status: "raw_stored" }
  ];
  const existing = [
    { id: "rec-newer", createdTime: "2026-07-10T02:48:00.000Z", fields: { raw_key: "class-1" } },
    { id: "rec-oldest", createdTime: "2026-07-10T02:19:00.000Z", fields: { raw_key: "class-1" } }
  ];

  const plan = handler.__test.planAirtableRowsByKey(rows, existing, "raw_key");

  assert.deepEqual(plan, {
    updates: [{ id: "rec-oldest", fields: rows[0] }],
    creates: [rows[1]],
    unchanged: 0,
    existing_unique: 1
  });
});

test("stage writes do not rewrite an unchanged canonical record", () => {
  const row = { raw_key: "class-1", probe_status: "checked", matched_count: 0 };
  const plan = handler.__test.planAirtableRowsByKey([
    row
  ], [{
    id: "rec-existing",
    createdTime: "2026-07-10T02:19:00.000Z",
    fields: { ...row, unrelated_formula: "keep" }
  }], "raw_key");

  assert.deepEqual(plan, {
    updates: [],
    creates: [],
    unchanged: 1,
    existing_unique: 1
  });
});

test("class-start logs omit absent live fields and keep review identity", () => {
  const fields = handler.__test.classStartLogFields({
    class_start_key: "14910|20260710|4216|740|35346",
    show_no: "14910",
    focus_day: "2026-07-10",
    ring_day_no: "4216",
    ring_no: "740",
    ring_name: "JUMPER ANNEX - Gary",
    ring_name_normalized: "annex",
    class_no: "35346",
    class_number: "0",
    class_name: "740b) $200 1.00m Amateur Jumper II.1",
    class_start_time: "10:45:00",
    display_time: "10:45 AM",
    entry_count: "0",
    n_gone: null,
    n_to_go: null,
    elapsed_seconds: null,
    status: "active",
    live_source: "hs_update_schedule.clean_step4_runtime",
    last_synced_at: "2026-07-10 02:00:22",
    pace_seconds: null,
    last_live_synced_at: null,
    result_probe_ready_at: null,
    result_probe_reason: null,
    class_status: null,
    iso_date: "2026-07-10",
    ring_visual_key: "14910|20260710|4216|740",
    class_visual_key: "14910|20260710|4216|740|35346"
  });

  assert.deepEqual(fields, {
    class_start_key: "14910|20260710|4216|740|35346",
    show_no: 14910,
    focus_day: "2026-07-10",
    ring_day_no: 4216,
    ring_no: 740,
    ring_name: "JUMPER ANNEX - Gary",
    ring_name_normalized: "annex",
    class_no: 35346,
    class_number: 0,
    class_name: "740b) $200 1.00m Amateur Jumper II.1",
    class_start_time: "10:45:00",
    display_time: "10:45 AM",
    entry_count: 0,
    status: "active",
    live_source: "hs_update_schedule.clean_step4_runtime",
    last_synced_at: "2026-07-10 02:00:22",
    iso_date: "2026-07-10"
  });
});

test("class-start logs include available live and result fields without typed blanks", () => {
  const fields = handler.__test.classStartLogFields({
    class_start_key: "14910|20260710|4057|712|31442",
    show_no: 14910,
    focus_day: "2026-07-10",
    class_no: 31442,
    class_number: 273,
    n_gone: 37,
    n_to_go: 28,
    elapsed_seconds: 302,
    pace_seconds: 75,
    last_live_synced_at: "2026-07-10T19:46:00.000Z",
    result_probe_ready_at: "2026-07-10T20:30:00.000Z",
    result_probe_reason: "class_complete",
    class_status: "running",
    focus_show: ["rec12345678901234"]
  });

  assert.equal(fields.class_start_key, "14910|20260710|4057|712|31442");
  assert.equal(fields.class_number, 273);
  assert.equal(fields.n_gone, 37);
  assert.equal(fields.n_to_go, 28);
  assert.equal(fields.elapsed_seconds, 302);
  assert.equal(fields.pace_seconds, 75);
  assert.equal(fields.last_live_synced_at, "2026-07-10T19:46:00.000Z");
  assert.equal(fields.result_probe_ready_at, "2026-07-10T20:30:00.000Z");
  assert.equal(fields.result_probe_reason, "class_complete");
  assert.equal(fields.class_status, "running");
  assert.deepEqual(fields.focus_show, ["rec12345678901234"]);
  assert.equal("ring_visual_key" in fields, false);
  assert.equal("class_visual_key" in fields, false);
});

test("ring-status logs carry the live fields and omit the deprecated visual key", () => {
  const fields = handler.__test.ringStatusMirrorFields({
    ring_status_key: "14910|20260710|4208|710",
    show_no: 14910,
    focus_day: "2026-07-10",
    ring_day_no: 4208,
    ring_no: 710,
    current_class_no: 31338,
    n_gone: 4,
    n_to_go: 12,
    is_live: false
  });

  assert.equal(fields.ring_status_key, "14910|20260710|4208|710");
  assert.equal(fields.current_class_no, 31338);
  assert.equal(fields.n_gone, 4);
  assert.equal(fields.n_to_go, 12);
  assert.equal(fields.is_live, "false");
  assert.equal("ring_visual_key" in fields, false);
});

test("class-oog logs use horse and omit helper-derived horse fields", () => {
  const fields = handler.__test.classOogLogFields({
    class_oog_key: "14909|2026-07-02|3591|642|26854|1042",
    horse: "Example Horse",
    horses: "Linked Horse",
    "follow (from horses)": "yes"
  });

  assert.equal(fields.horse, "Example Horse");
  assert.equal("horses" in fields, false);
  assert.equal("follow (from horses)" in fields, false);
});

test("entry logs omit absent live placeholders and keep approved review fields", () => {
  const fields = handler.__test.entryGoLogFields({
    entry_go_key: "14910|20260710|4051|711|31399|1028",
    show_no: "14910",
    focus_day: "2026-07-10",
    ring_name_normalized: "indoor 3",
    update_schedule_uuid: "14910|20260710|4051|711|31399",
    class_no: "31399",
    entry_no: "1028",
    entry_order: "22",
    horse: "Forte",
    class_start_time: "09:15:00",
    rider: "Carsyn Korotkin",
    trainer: "Alan Korotkin",
    go_time: "10:04:30",
    status: "active",
    last_synced_at: "2026-07-10 02:00:22",
    pace_seconds: null,
    live_source: "hs_class_oog.clean_step4_runtime",
    last_live_synced_at: null,
    focus_day_key: "20260710",
    display_time: "9:15 AM",
    iso_date: "2026-07-10"
  });

  assert.deepEqual(fields, {
    entry_go_key: "14910|20260710|4051|711|31399|1028",
    show_no: 14910,
    focus_day: "2026-07-10",
    ring_name_normalized: "indoor 3",
    class_no: 31399,
    entry_no: 1028,
    entry_order: 22,
    horse: "Forte",
    class_start_time: "09:15:00",
    rider: "Carsyn Korotkin",
    trainer: "Alan Korotkin",
    go_time: "10:04:30",
    status: "active",
    last_synced_at: "2026-07-10 02:00:22",
    live_source: "hs_class_oog.clean_step4_runtime",
    focus_day_key: "20260710",
    display_time: "9:15 AM",
    iso_date: "2026-07-10"
  });
});

test("stage-log deduplication quotes the Airtable focus date", () => {
  assert.equal(
    handler.__test.currentStageAirtableFilter({ show_no: 14910, focus_day: "2026-07-10" }),
    "AND({show_no}=14910,DATETIME_FORMAT({focus_day}, 'YYYY-MM-DD')='2026-07-10')"
  );
});

test("time-engine rows omit blank Catalyst datetime values", () => {
  assert.equal(typeof handler.__test.optionalResultReadyAt, "function");
  assert.deepEqual(handler.__test.optionalResultReadyAt(""), {});
  assert.deepEqual(
    handler.__test.optionalResultReadyAt("2026-07-10 14:30:00"),
    { result_ready_at: "2026-07-10 14:30:00" }
  );
});

test("stored preflight rows do not classify completed Core runtime as drift", () => {
  assert.equal(typeof handler.__test.isUnexpectedActivePreflight, "function");
  assert.equal(handler.__test.isUnexpectedActivePreflight({
    row: { is_preflight: true, status: "" },
    reasons: ["blank_time_text"]
  }), false);
  assert.equal(handler.__test.isUnexpectedActivePreflight({
    row: { is_preflight: "true", status: "" },
    reasons: ["blank_time_text"]
  }), false);
  assert.equal(handler.__test.isUnexpectedActivePreflight({
    row: { is_preflight: 1, status: "" },
    reasons: ["blank_time_text"]
  }), false);
  assert.equal(handler.__test.isUnexpectedActivePreflight({
    row: { is_preflight: false, status: "active" },
    reasons: ["blank_time_text"]
  }), true);
});

test("Stage 2 review mirror uses the duplicate-tolerant keyed writer", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "handler.js"), "utf8");
  assert.match(source, /writeAirtableRowsByKey\(\s*TABLES\.updateSchedule/);
});

test("Core data endpoints expose each active table by its canonical key", () => {
  assert.deepEqual(handler.__test.coreDataEndpointContract(), [
    ["wec-data-hs-update-schedule", "hs_update_schedule", "update_schedule_key"],
    ["wec-data-hs-class-oog-raw", "hs_class_oog_raw", "raw_key"],
    ["wec-data-hs-class-oog", "hs_class_oog", "class_oog_key"],
    ["wec-data-hs-ring-status", "hs_ring_status", "ring_status_key"],
    ["wec-data-hs-class-start-times", "hs_class_start_times", "class_start_key"],
    ["wec-data-hs-entry-go-times", "hs_entry_go_times", "entry_go_key"]
  ]);
});

test("Core data endpoints do not expose the disabled ring-days table", () => {
  const contracts = handler.__test.coreDataEndpointContract();
  assert.equal(contracts.some(([, table]) => table === "hs_get_ring_days"), false);
});

test("Helper endpoints expose horses, trainers, and riders by canonical key", () => {
  assert.deepEqual(handler.__test.helperDataEndpointContract(), [
    ["wec-data-hs-horses", "hs_horses", "horse_key"],
    ["wec-data-hs-trainers", "hs_trainers", "trainer_key"],
    ["wec-data-hs-riders", "hs_riders", "rider_key"]
  ]);
});

test("Helper endpoints use the same complete-list response contract as Core endpoints", () => {
  assert.deepEqual(handler.__test.helperDataEndpointResponseContract(), {
    consumer_pagination: false,
    internal_page_size: 200,
    maximum_rows: 5000
  });
});
