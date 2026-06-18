const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildClassStartRows,
  matchGetOrdersToClassStart,
  buildClassAlerts,
  airtableRecordLink,
  airtableRecordLinks,
  logTypeForAction,
  compareKeySets
} = require("./lane_core");

test("buildClassStartRows admits only full_lock staging rows and preserves class identity", () => {
  const rows = buildClassStartRows([
    {
      record_id: "rec_locked_31001",
      staging_key: "14907|4224|665|9001|31001",
      show_no: 14907,
      focus_day: "2026-06-17",
      ring_day_no: 4224,
      ring_no: 665,
      ring_name: "INDOOR 4 - Lucy",
      class_no: 31001,
      event_id: 9001,
      class_number: 267,
      class_name: "USHJA Hunter 2'6",
      time_text: "8:15am",
      entry_count: 12,
      full_lock: true
    },
    {
      staging_key: "14907|4224|665|9002|0",
      show_no: 14907,
      focus_day: "2026-06-17",
      ring_day_no: 4224,
      ring_no: 665,
      class_no: 0,
      time_text: "9:00am",
      full_lock: true
    },
    {
      staging_key: "14907|4225|666|9003|31002",
      show_no: 14907,
      focus_day: "2026-06-17",
      ring_day_no: 4225,
      ring_no: 666,
      class_no: 31002,
      time_text: "10:00am",
      full_lock: false
    }
  ]);

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    record_id: "rec_locked_31001",
    class_start_key: "14907|4224|665|9001|31001",
    show_no: 14907,
    focus_day: "2026-06-17",
    ring_day_no: 4224,
    ring_no: 665,
    ring_name: "INDOOR 4 - Lucy",
    event_id: 9001,
    class_no: 31001,
    class_number: 267,
    class_name: "USHJA Hunter 2'6",
    class_start_time: "08:15:00",
    display_time: "8:15A",
    entry_count: 12,
    source: "update_schedule_staging.full_lock",
    status: "upcoming"
  });
});

test("matchGetOrdersToClassStart enriches class_start_times by class_no or class_number fallback", () => {
  const classStarts = [
    { ROWID: "1", class_start_key: "a", show_no: 14907, focus_day: "2026-06-17", ring_day_no: 4224, ring_no: 665, class_no: 31001, class_number: 267 },
    { ROWID: "2", class_start_key: "b", show_no: 14907, focus_day: "2026-06-17", ring_day_no: 4224, ring_no: 665, class_no: 31002, class_number: 268 }
  ];
  const matches = matchGetOrdersToClassStart([
    { show_no: 14907, focus_day: "2026-06-17", ring_day_no: 4224, ring_no: 665, class_no: 31001, class_number: 267, n_gone: 3, n_to_go: 9, total: 12, elapsed: 600 },
    { show_no: 14907, focus_day: "2026-06-17", ring_day_no: 4224, ring_no: 665, class_number: 268, n_gone: 1, n_to_go: 11, total: 12, elapsed: 180 }
  ], classStarts);

  assert.equal(matches.length, 2);
  assert.equal(matches[0].class_start_key, "a");
  assert.equal(matches[1].class_start_key, "b");
  assert.equal(matches[1].updates.elapsed_seconds, 180);
});

test("buildClassAlerts creates class 60 and 30 minute windows from class_start_times", () => {
  const alerts = buildClassAlerts([
    { class_start_key: "a", show_no: 14907, focus_day: "2026-06-17", class_no: 31001, class_name: "USHJA Hunter", display_time: "10:00A", class_start_time: "10:00:00" },
    { class_start_key: "b", show_no: 14907, focus_day: "2026-06-17", class_no: 31002, class_name: "Low Hunter", display_time: "10:30A", class_start_time: "10:30:00" }
  ], new Date("2026-06-17T09:00:00-04:00"));

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].alert_key, "14907|2026-06-17|31001|class_start_60");
  assert.equal(alerts[0].alert_type, "class_start_60");
  assert.equal(alerts[0].time_till, 60);
});

test("airtableRecordLink returns Airtable linked-record IDs as strings", () => {
  assert.deepEqual(airtableRecordLink("rec123"), ["rec123"]);
  assert.deepEqual(airtableRecordLinks(["rec123", "rec123", "rec456"]), ["rec123", "rec456"]);
  assert.equal(airtableRecordLink(""), undefined);
});

test("logTypeForAction uses approved WEC log_type options", () => {
  assert.equal(logTypeForAction("class_oog_rollups"), "core_class_oog");
  assert.equal(logTypeForAction("get_orders_class_start_enrichment"), "get-orders");
  assert.equal(logTypeForAction("class_alerts"), "class_start_times");
  assert.equal(logTypeForAction("sync-class-start-times"), "class_start_times");
  assert.equal(logTypeForAction("sync-class-oog-rollups"), "core_class_oog");
  assert.equal(logTypeForAction("sync-get-orders"), "get-orders");
  assert.equal(logTypeForAction("sync-class-alerts"), "class_start_times");
});

test("compareKeySets identifies missing and extra keys", () => {
  assert.deepEqual(compareKeySets(["a", "b"], ["b", "c"]), {
    expected_count: 2,
    actual_count: 2,
    missing: ["a"],
    extra: ["c"],
    ok: false
  });
  assert.equal(compareKeySets(["a"], ["a"]).ok, true);
});
