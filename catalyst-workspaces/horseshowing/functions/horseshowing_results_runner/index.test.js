const test = require("node:test");
const assert = require("node:assert/strict");

const handle = require("./index");

test("active Step 6 writes results only to Catalyst", () => {
  const source = require("node:fs").readFileSync(__filename.replace(/index\.test\.js$/, "index.js"), "utf8");
  const start = source.indexOf("async function runWecStep6Results");
  const end = source.indexOf("function toAirtableResultClass", start);
  const active = source.slice(start, end);

  assert.doesNotMatch(active, /airtableUpsert|toAirtableHsResult/);
  assert.match(active, /upsertCatalyst/);
  assert.match(active, /target_airtable:\s*\[\]/);

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
