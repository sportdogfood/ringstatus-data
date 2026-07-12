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

test("time-engine trigger planning appends only missing trigger keys", () => {
  const triggers = [
    { trigger_key: "existing", trigger_type: "class_live" },
    { trigger_key: "new", trigger_type: "entry_go_20" },
    { trigger_key: "new", trigger_type: "entry_go_20" }
  ];
  const existing = [{ id: "recExisting", fields: { trigger_key: "existing" } }];

  assert.deepEqual(handler.__test.planAppendOnlyTimeEngineTriggers(triggers, existing), {
    creates: [{ trigger_key: "new", trigger_type: "entry_go_20" }],
    existing: ["existing"]
  });
});

test("Time Engine pushes trigger records to Airtable as the event source", () => {
  const source = require("node:fs").readFileSync(require.resolve("../handler"), "utf8");
  const start = source.indexOf("const triggerInsert = await insertNewTimeEngineTriggers");
  const triggerPush = source.indexOf("await appendAirtableTimeEngineTriggers", start);

  assert.ok(start >= 0);
  assert.ok(triggerPush > start);
});

test("ring alert state detects live, class-change, late, gate, and not-live transitions", () => {
  const first = handler.__test.nextRingAlertState(null, {
    is_live: true,
    current_class_no: 31331
  }, {
    ring_alert_status: "ontime",
    running_late_mins: 0
  }, "2026-07-11T14:00:00.000Z");
  assert.equal(first.ring_live_sequence, 1);
  assert.equal(first.ring_live_active, true);

  const changed = handler.__test.nextRingAlertState({ payload_json: JSON.stringify({ alert_state: first }) }, {
    is_live: true,
    current_class_no: 31332
  }, {
    ring_alert_status: "late",
    running_late_mins: 31
  }, "2026-07-11T14:06:00.000Z");
  assert.equal(changed.ring_class_change_sequence, 1);
  assert.equal(changed.ring_late_15_reached, true);
  assert.equal(changed.ring_late_30_reached, true);

  const stopped = handler.__test.nextRingAlertState({ payload_json: JSON.stringify({ alert_state: changed }) }, {
    is_live: false,
    current_class_no: 31332
  }, {
    ring_alert_status: "check_gate",
    running_late_mins: 0
  }, "2026-07-11T14:12:00.000Z");
  assert.equal(stopped.ring_not_live_sequence, 1);
  assert.equal(stopped.ring_gate_sequence, 1);
});

test("ring alert events use distinct append-only trigger identities", () => {
  const row = {
    show_no: 14910,
    focus_day: "2026-07-11",
    ring_no: 710,
    ring_const_key: "14910|20260711|4209|710",
    ring_name_normalized: "indoor 6"
  };
  const events = handler.__test.buildRingAlertEvents(row, {
    ring_live_sequence: 1,
    ring_live_started_at: "2026-07-11T14:00:00.000Z",
    ring_not_live_sequence: 1,
    ring_not_live_at: "2026-07-11T14:12:00.000Z",
    ring_class_change_sequence: 1,
    ring_class_changed_at: "2026-07-11T14:06:00.000Z",
    previous_class_no: 31331,
    current_class_no: 31332,
    ring_late_15_reached: true,
    ring_late_15_reached_at: "2026-07-11T14:06:00.000Z",
    ring_late_30_reached: true,
    ring_late_30_reached_at: "2026-07-11T14:06:00.000Z",
    ring_gate_sequence: 1,
    ring_gate_started_at: "2026-07-11T14:12:00.000Z"
  }, "2026-07-11T14:12:00.000Z");

  assert.deepEqual(events.map((event) => event.trigger_identity), [
    "ring_live|1",
    "ring_not_live|1",
    "ring_class_change|1",
    "ring_late_15",
    "ring_late_30",
    "ring_gate|1"
  ]);
  assert.ok(events.every((event) => event.level === "ring" && event.ring_no === 710));

  const trigger = handler.__test.buildTimeEngineTrigger({
    show_no: 14910,
    focus_day: "2026-07-11",
    level: "ring",
    source_key: row.ring_const_key,
    ring_const_key: row.ring_const_key,
    ring_no: 710,
    class_no: 0,
    entry_no: 0
  }, events[2].alert_type, "run-1", "2026-07-11 14:12:00", events[2]);
  assert.equal(trigger.ring_no, 710);
  assert.equal(trigger.class_no, 31332);
});

test("trigger creation uses null for absent identities and carries entry people", () => {
  const ringTrigger = handler.__test.buildTimeEngineTrigger({
    show_no: 14910,
    focus_day: "2026-07-11",
    level: "ring",
    source_key: "14910|20260711|4209|710",
    ring_const_key: "14910|20260711|4209|710"
  }, "ring_gate", "run-1", "2026-07-11 14:12:00", { ring_no: 710 });
  assert.equal(ringTrigger.ring_no, 710);
  assert.equal(ringTrigger.class_no, null);
  assert.equal(ringTrigger.entry_no, null);

  const entryTrigger = handler.__test.buildTimeEngineTrigger({
    show_no: 14910,
    focus_day: "2026-07-11",
    level: "entry",
    source_key: "entry-key",
    ring_no: 708,
    class_no: 31380,
    entry_no: 2667,
    horse: "Example Horse",
    rider: "Example Rider",
    trainer: "Example Trainer"
  }, "entry_go_20", "run-1", "2026-07-11 14:12:00");
  assert.equal(entryTrigger.horse, "Example Horse");
  assert.equal(entryTrigger.rider, "Example Rider");
  assert.equal(entryTrigger.trainer, "Example Trainer");
});

test("trigger endpoint requires show and date and supports optional lane filters", () => {
  assert.throws(() => handler.__test.normalizeTimeEngineTriggerEndpointFilters({ focus_day: "2026-07-11" }), /show_no_required/);
  assert.throws(() => handler.__test.normalizeTimeEngineTriggerEndpointFilters({ show_no: 14910 }), /focus_day_or_focus_day_key_required/);
  assert.deepEqual(handler.__test.normalizeTimeEngineTriggerEndpointFilters({
    show_no: "14910",
    focus_day_key: "20260711",
    level: "entry",
    trigger_type: "entry_go_20",
    class_no: "31380",
    entry_no: "2667",
    ring_no: "708"
  }), {
    show_no: 14910,
    focus_day: "2026-07-11",
    focus_day_key: "20260711",
    level: "entry",
    trigger_type: "entry_go_20",
    class_no: 31380,
    entry_no: 2667,
    ring_no: 708
  });
});

test("statewise now endpoint requires show and date and accepts a device time anchor", () => {
  const now = new Date("2026-07-11T15:00:00Z");
  assert.throws(() => handler.__test.normalizeStatewiseNowEndpointFilters({ focus_day: "2026-07-11" }, now), /show_no_required/);
  assert.throws(() => handler.__test.normalizeStatewiseNowEndpointFilters({ show_no: 14910 }, now), /focus_day_or_focus_day_key_required/);
  assert.deepEqual(handler.__test.normalizeStatewiseNowEndpointFilters({
    show_no: "14910",
    focus_day: "2026-07-11",
    ring_no: "708",
    state: "nextup",
    class_no: "31380",
    entry_no: "2667",
    as_of_time: "2026-07-11T11:30:00-04:00"
  }, now), {
    show_no: 14910,
    focus_day: "2026-07-11",
    focus_day_key: "20260711",
    ring_no: 708,
    state: "nextup",
    class_no: 31380,
    entry_no: 2667,
    as_of_time: "2026-07-11T15:30:00.000Z",
    as_of_time_source: "device"
  });
  assert.equal(handler.__test.normalizeStatewiseNowEndpointFilters({
    show_no: 14910,
    focus_day_key: "20260711",
    as_of_time: "true"
  }, now).as_of_time_source, "server");
});

test("statewise now endpoint returns three snapshot times before and after the nearest snapshot", () => {
  const rows = Array.from({ length: 9 }, (_, index) => ({
    statewise_now_key: `key-${index}`,
    show_no: 14910,
    focus_day: "2026-07-11",
    ring_no: 708,
    state: index % 2 ? "nextup" : "now",
    sort_order: index % 2 ? 2 : 1,
    as_of_time: `2026-07-11 15:${String(index).padStart(2, "0")}:00`
  }));
  const window = handler.__test.sliceStatewiseNowSnapshots(rows, "2026-07-11T15:04:20Z");
  assert.equal(window.anchor_snapshot_time, "2026-07-11 15:04:00");
  assert.deepEqual(window.snapshot_times, [
    "2026-07-11 15:01:00",
    "2026-07-11 15:02:00",
    "2026-07-11 15:03:00",
    "2026-07-11 15:04:00",
    "2026-07-11 15:05:00",
    "2026-07-11 15:06:00",
    "2026-07-11 15:07:00"
  ]);
  assert.equal(window.rows.length, 7);
});

test("wec-alerts is no longer written by the Time Engine execution", () => {
  const source = require("node:fs").readFileSync(require.resolve("../handler"), "utf8");
  const start = source.indexOf("async function runTimeEngineOnly");
  const end = source.indexOf("function scheduleRowForProof", start);
  const block = source.slice(start, end);
  assert.doesNotMatch(block, /appendAirtableAlertEvents/);
});
