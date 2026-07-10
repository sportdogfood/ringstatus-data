"use strict";

const assert = require("node:assert/strict");
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
    creates: [rows[1]]
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
    class_name: "740b) $200 1.00m Amateur Jumper II.1",
    class_start_time: "10:45:00",
    display_time: "10:45 AM",
    entry_count: 0,
    status: "active",
    live_source: "hs_update_schedule.clean_step4_runtime",
    last_synced_at: "2026-07-10 02:00:22",
    iso_date: "2026-07-10",
    ring_visual_key: "14910|20260710|4216|740",
    class_visual_key: "14910|20260710|4216|740|35346"
  });
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
