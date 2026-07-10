"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const handler = require("../handler");

test("class alert state persists the 30-minute threshold and numbers live transitions", () => {
  const first = handler.__test.nextClassAlertState(null, {
    tags: ["starts_in_60", "starts_in_30"],
    class_status: "now",
    starts_in_mins: 9
  }, "2026-07-10T14:36:20.000Z");
  assert.deepEqual(first, {
    class_start_30_reached: true,
    class_start_30_reached_at: "2026-07-10T14:36:20.000Z",
    class_start_30_time_till: 9,
    class_live_active: true,
    class_live_sequence: 1,
    class_live_started_at: "2026-07-10T14:36:20.000Z"
  });

  const unchanged = handler.__test.nextClassAlertState({
    payload_json: JSON.stringify({ alert_state: first })
  }, {
    tags: ["starts_in_60", "starts_in_30"],
    class_status: "now",
    starts_in_mins: 3
  }, "2026-07-10T14:42:20.000Z");
  assert.deepEqual(unchanged, first);

  const leftLive = handler.__test.nextClassAlertState({
    payload_json: JSON.stringify({ alert_state: first })
  }, {
    tags: [],
    class_status: "today"
  }, "2026-07-10T14:48:20.000Z");
  assert.deepEqual(leftLive, {
    class_start_30_reached: true,
    class_start_30_reached_at: "2026-07-10T14:36:20.000Z",
    class_start_30_time_till: 9,
    class_live_active: false,
    class_live_sequence: 1,
    class_live_started_at: "2026-07-10T14:36:20.000Z"
  });

  const reentered = handler.__test.nextClassAlertState({
    payload_json: JSON.stringify({ alert_state: leftLive })
  }, {
    tags: [],
    class_status: "now"
  }, "2026-07-10T15:00:20.000Z");
  assert.deepEqual(reentered, {
    class_start_30_reached: true,
    class_start_30_reached_at: "2026-07-10T14:36:20.000Z",
    class_start_30_time_till: 9,
    class_live_active: true,
    class_live_sequence: 2,
    class_live_started_at: "2026-07-10T15:00:20.000Z"
  });
});

test("entry alert state persists after the 20-minute threshold is reached", () => {
  const first = handler.__test.nextEntryAlertState(null, {
    tags: ["go_in_40", "go_in_20"],
    go_in_mins: 20
  }, "2026-07-10T14:36:20.000Z");
  assert.deepEqual(first, {
    entry_go_20_reached: true,
    entry_go_20_reached_at: "2026-07-10T14:36:20.000Z",
    entry_go_20_time_till: 20
  });

  const afterGoTime = handler.__test.nextEntryAlertState({
    payload_json: JSON.stringify({ alert_state: first })
  }, { tags: [], go_in_mins: -1 }, "2026-07-10T14:58:20.000Z");
  assert.deepEqual(afterGoTime, first);
});

test("class and entry alert events use established keys and distinct live occurrences", () => {
  const classRow = {
    show_no: 14910,
    focus_day: "2026-07-10",
    class_no: 35349,
    class_name: "737b) Junior Jumper",
    class_start_time: "10:45:00",
    display_time: "10:45 AM",
    class_const_key: "14910|20260710|4216|740|35349",
    ring_name_normalized: "jumper annex"
  };
  const vars = { starts_in_mins: 9, tags: ["starts_in_60", "starts_in_30"], class_status: "now" };
  const events = handler.__test.buildClassAlertEvents(classRow, vars, {
    class_start_30_reached: true,
    class_live_active: true,
    class_live_sequence: 2
  }, "2026-07-10T14:36:20.000Z");

  assert.deepEqual(events.map((event) => event.alert_key), [
    "14910|2026-07-10|35349|class_start_30",
    "14910|2026-07-10|35349|class_live|2"
  ]);

  const entryEvents = handler.__test.buildEntryAlertEvents({
    show_no: 14910,
    focus_day: "2026-07-10",
    class_no: 31379,
    entry_no: 3578,
    entry_const_key: "14910|20260710|4213|708|31379|3578",
    horse: "Carapaccio",
    go_time: "10:56:24"
  }, { go_in_mins: 20, tags: ["go_in_40", "go_in_20"] }, {
    entry_go_20_reached: true
  }, "2026-07-10T14:36:20.000Z");

  assert.equal(entryEvents[0].alert_key, "14910|2026-07-10|31379|3578|entry_go_20");
});

test("append-only planning creates missing events and never updates historical records", () => {
  const events = [
    { alert_key: "existing", alert_type: "class_start_30" },
    { alert_key: "new", alert_type: "entry_go_20" },
    { alert_key: "new", alert_type: "entry_go_20" }
  ];
  const existing = [{ id: "recExisting", fields: { alert_key: "existing" } }];

  assert.deepEqual(handler.__test.planAppendOnlyAlertEvents(events, existing), {
    creates: [{ alert_key: "new", alert_type: "entry_go_20" }],
    existing: ["existing"]
  });
});
