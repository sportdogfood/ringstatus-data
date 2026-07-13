const test = require("node:test");
const assert = require("node:assert/strict");

const handle = require("./index");

test("active Step 6 keeps legacy Result tables but limits Task 07 terminal writes", () => {
  const source = require("node:fs").readFileSync(__filename.replace(/index\.test\.js$/, "index.js"), "utf8");
  const start = source.indexOf("async function runWecStep6Results");
  const end = source.indexOf("function toAirtableResultClass", start);
  const active = source.slice(start, end);

  assert.doesNotMatch(active, /airtableUpsert/);
  assert.match(active, /upsertCatalyst/);
  assert.match(active, /target_airtable:\s*\["hs_rider_results"\]/);
  assert.match(active, /resultAvailableTrigger/);
  assert.match(active, /classIsNoLongerLive/);
  assert.match(active, /task07Stability/);

  const handlerStart = source.indexOf('if (action === "wec-step6-results")');
  const handlerEnd = source.indexOf('phase = "read_source_class_oog_staging_active_entries"', handlerStart);
  assert.doesNotMatch(source.slice(handlerStart, handlerEnd), /writeLog/);
});

test("focus pause gate reads Airtable checkbox field and field name", () => {
  assert.equal(handle.__test__.isFocusPaused({ is_pause: true }), true);
  assert.equal(handle.__test__.isFocusPaused({ fldgWn3BIdGzcGow1: true }), true);
  assert.equal(handle.__test__.isFocusPaused({ is_pause: false }), false);
});

test("class result rows are deduplicated by canonical key before writes", () => {
  assert.equal(typeof handle.__test__.uniqueRowsByKey, "function");
  assert.deepEqual(handle.__test__.uniqueRowsByKey([
    { class_result_key: "result-1", place: "1" },
    { class_result_key: "result-1", place: "1" },
    { class_result_key: "result-2", place: "2" }
  ], "class_result_key"), [
    { class_result_key: "result-1", place: "1" },
    { class_result_key: "result-2", place: "2" }
  ]);
});

test("Results failures propagate a scheduler-visible HTTP 500", () => {
  assert.equal(handle.__test__.resultsErrorStatusCode(), 500);
});

test("Results upstream work is bounded below the scheduler window", () => {
  assert.equal(handle.__test__.RESULTS_UPSTREAM_ATTEMPTS, 1);
  assert.ok(handle.__test__.RESULTS_UPSTREAM_TIMEOUT_MS <= 8000);
  assert.ok(handle.__test__.RESULTS_UPSTREAM_TIMEOUT_MS * 2 < 20000);
});

test("the Results function exposes only Step 6 and the separate result-alert action", () => {
  assert.equal(handle.__test__.isAllowedResultsAction("wec-step6-results"), true);
  assert.equal(handle.__test__.isAllowedResultsAction("sync-result-alerts"), true);
  assert.equal(handle.__test__.isAllowedResultsAction("run"), false);
});

test("result alerts read the current hs_class_results table and omit legacy links", () => {
  assert.equal(handle.__test__.RESULT_ALERT_SOURCE_TABLE, "hs_class_results");
  const row = handle.__test__.toResultAlertRow({
    record_id: "recHsResult",
    class_result_key: "result-1",
    show_no: 14910,
    focus_day: "2026-07-10",
    class_no: 31399,
    entry_no: 1028,
    horse: "Forte"
  }, "recTemplate", "2026-07-10T12:00:00.000Z");
  assert.equal(Object.prototype.hasOwnProperty.call(row, "fldfSwZt4oT9hF393"), false);
});

test("Step 6 success details are normalized for append-only workflow audit", () => {
  const detail = handle.__test__.step6LogDetail({
    ok: true,
    show_no: 14910,
    focus_day: "2026-07-10",
    target_classes_total: 20,
    changed_rows: 12,
    probed_classes: 3,
    completed_classes: 2,
    class_results: 8
  }, "wec_step6_results");
  assert.equal(detail.phase, "wec_step6_results");
  assert.equal(detail.source_rows, 20);
});

test("result-alert writes are normalized for the Alerts workflow audit", () => {
  const detail = handle.__test__.resultAlertLogDetail({
    showNo: 14910,
    focusDay: "2026-07-10",
    sourceRows: 8,
    resultAlerts: { records_changed: 3, duplicate_alert_keys: 0 },
    phase: "write_result_alerts"
  });
  assert.equal(detail.action, "sync-result-alerts");
  assert.equal(detail.source_rows, 8);
  assert.equal(detail.changed_rows, 3);
  assert.equal(detail.ok, true);
});

test("result-alert batches advance by excluding alerts already written", () => {
  const rows = handle.__test__.pendingResultAlertRows([
    { class_result_key: "result-1" },
    { class_result_key: "result-2" },
    { class_result_key: "result-3" }
  ], [
    { alert_key: "result|result-1" }
  ], 1);
  assert.deepEqual(rows, [{ class_result_key: "result-2" }]);
});

test("Task 07 result block stability requires two identical scheduler observations", () => {
  const parsed = {
    classes: [{ class_no: "31399", class_number: "100", class_name: "Classic", result_entry_count: 1, has_score: true }],
    results: [{ class_no: "31399", place: "1", entry_no: "1028", horse: "Forte", rider: "Rider", score: "88" }]
  };
  const block = handle.__test__.normalizedResultBlockForClass("31399", parsed);
  const sameBlock = handle.__test__.normalizedResultBlockForClass("31399", { ...parsed, results: [...parsed.results] });
  const changedBlock = handle.__test__.normalizedResultBlockForClass("31399", {
    ...parsed,
    results: [{ ...parsed.results[0], score: "89" }]
  });
  const hash = handle.__test__.resultBlockHash(block);
  assert.equal(hash, handle.__test__.resultBlockHash(sameBlock));
  assert.notEqual(hash, handle.__test__.resultBlockHash(changedBlock));
  assert.equal(hash.length, 64);
  assert.deepEqual(handle.__test__.task07Stability(null, hash, true), {
    stable_count: 1,
    previous_hash: "",
    finality_satisfied: false
  });
  const second = handle.__test__.task07Stability({ raw_json: JSON.stringify({ task07: { result_block_hash: hash, stable_count: 1 } }) }, hash, true);
  assert.equal(second.stable_count, 2);
  assert.equal(second.finality_satisfied, true);
  const changed = handle.__test__.task07Stability({ raw_json: JSON.stringify({ task07: { result_block_hash: hash, stable_count: 2 } }) }, handle.__test__.resultBlockHash(changedBlock), true);
  assert.equal(changed.stable_count, 1);
  assert.equal(changed.finality_satisfied, false);
});

test("Task 07 raw_json stays valid and bounded", () => {
  const raw = handle.__test__.safeJson({
    class_no: "31399",
    class_const_key: "14910|20260712|ring|class|31399",
    status: "completed",
    result_rows: 99,
    attempts: 3,
    task07: {
      result_block_hash: "a".repeat(64),
      previous_result_block_hash: "a".repeat(64),
      stable_count: 2,
      finality_satisfied: true,
      observation_status: "second_identical_observation_terminal",
      observed_at: "2026-07-12 20:42:00"
    },
    huge: "x".repeat(20000)
  });
  assert.ok(raw.length <= 9500);
  assert.doesNotThrow(() => JSON.parse(raw));
  const parsed = JSON.parse(raw);
  assert.equal(parsed.task07.result_block_hash, "a".repeat(64));
  assert.equal(parsed.task07.finality_satisfied, true);
});

test("safeJson never returns malformed JSON when an oversized string would cross the boundary", () => {
  const raw = handle.__test__.safeJson({ value: `"${"x".repeat(10000)}` });
  assert.ok(raw.length <= 9500);
  assert.doesNotThrow(() => JSON.parse(raw));
  assert.equal(JSON.parse(raw)._truncated, true);
});

test("malformed old queue metadata does not re-poll a class with terminal rider results", () => {
  const classKey = "14910|20260712|4047|709|31326";
  const tracked = handle.__test__.trackedEntriesByClassConstKey([
    { show_no: 14910, focus_day: "2026-07-12", class_const_key: classKey, class_no: "31326", entry_no: "1038" }
  ]);
  const completed = handle.__test__.completedTask07ClassConstKeys([
    { result_queue_key: classKey, status: "completed", raw_json: "{\"task07\":" }
  ], [
    { rider_result_key: "14910|20260712|31326|1038" }
  ], tracked);
  assert.equal(completed.has(classKey), true);
});

test("Task 07 terminal rider results include placed and no_place entries", () => {
  const rows = handle.__test__.buildTerminalRiderResults(
    14910,
    "2026-07-12",
    { class_no: "31399", class_const_key: "14910|20260712|class|31399" },
    [
      { show_no: 14910, focus_day: "2026-07-12", class_no: "31399", entry_no: "1028", horse: "Forte", rider: "Placed Rider" },
      { show_no: 14910, focus_day: "2026-07-12", class_no: "31399", entry_no: "2048", horse: "Absent", rider: "Absent Rider" }
    ],
    [{ class_no: "31399", entry_no: "1028", horse: "Forte", rider: "Placed Rider", place: "1", score: "88" }],
    "2026-07-12 20:42:00",
    "run-1"
  );
  assert.equal(rows[0].result_status, "placed");
  assert.equal(rows[0].place, "1");
  assert.equal(rows[1].result_status, "no_place");
  assert.equal(rows[1].place, "");
});

test("Task 07 result_available is rider-facing and Airtable writes only rider result fields", () => {
  const riderResult = {
    rider_result_key: "result-key",
    run_id: "run-1",
    show_no: 14910,
    focus_day: "2026-07-12",
    class_no: 31399,
    entry_no: 1028,
    horse: "Forte",
    rider: "Rider",
    place: "1",
    score: "88",
    result_time: "71.2",
    result_status: "placed",
    result_source: "horseshowing.show_results4.operational_finality",
    observed_at: "2026-07-12 20:42:00"
  };
  const trigger = handle.__test__.resultAvailableTrigger(
    riderResult,
    { ring_const_key: "ring-1", class_const_key: "class-31399" },
    { entry_const_key: "entry-1028", trainer: "Trainer" },
    "2026-07-12 20:42:00"
  );
  assert.equal(trigger.level, "rider");
  assert.equal(trigger.trigger_type, "result_available");
  assert.equal(trigger.status, "pending");

  const airtable = handle.__test__.toAirtableHsRiderResult(riderResult);
  assert.deepEqual(Object.keys(airtable).sort(), [
    "class_no",
    "entry_no",
    "focus_day",
    "horse",
    "observed_at",
    "place",
    "rider",
    "rider_result_key",
    "result_status",
    "score",
    "show_no",
    "source",
    "time"
  ].sort());
  assert.equal(airtable.Created, undefined);
});

test("Task 07 terminal rider and result_available keys are deterministic for duplicate suppression", () => {
  const classRow = { class_no: "31399", class_const_key: "class-31399", ring_const_key: "ring-1" };
  const entryRow = { show_no: 14910, focus_day: "2026-07-12", class_no: "31399", entry_no: "1028", horse: "Forte", rider: "Rider", entry_const_key: "entry-1028" };
  const terminalA = handle.__test__.buildTerminalRiderResults(14910, "2026-07-12", classRow, [entryRow], [], "2026-07-12 20:42:00", "run-1")[0];
  const terminalB = handle.__test__.buildTerminalRiderResults(14910, "2026-07-12", classRow, [entryRow], [], "2026-07-12 20:42:00", "run-2")[0];
  assert.equal(terminalA.rider_result_key, terminalB.rider_result_key);
  assert.equal(handle.__test__.uniqueRowsByKey([terminalA, terminalB], "rider_result_key").length, 1);

  const triggerA = handle.__test__.resultAvailableTrigger(terminalA, classRow, entryRow, "2026-07-12 20:42:00");
  const triggerB = handle.__test__.resultAvailableTrigger(terminalB, classRow, entryRow, "2026-07-12 20:43:00");
  assert.equal(triggerA.trigger_key, triggerB.trigger_key);
  assert.equal(handle.__test__.uniqueRowsByKey([triggerA, triggerB], "trigger_key").length, 1);
});
