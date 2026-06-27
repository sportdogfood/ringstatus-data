#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const RUNNER_DIR = __dirname;
const LOG_DIR = path.join(RUNNER_DIR, "logs");
const PROOF_DIR = path.join(RUNNER_DIR, "proofs");
const LOG_PATH = path.join(LOG_DIR, "run_wec_stacked_workflow.log");
const EXCLUDED_PATH = "horseshowing_class_lane_runner?action=sync-class-start-times";
const PROOF_PATH_TYPE = "manual_runner";

const CALLABLES = {
  stage2: path.join(RUNNER_DIR, "sync_focus_update_schedule_to_staging.js"),
  helper: path.join(RUNNER_DIR, "repair_update_schedule_staging_links.js"),
  classOogAndStart: path.join(RUNNER_DIR, "sync_class_oog_and_class_start_times.js"),
  entryGoTimes: path.join(RUNNER_DIR, "sync_entry_go_times_from_class_oog.js")
};

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq === -1) args[arg.slice(2)] = "1";
    else args[arg.slice(2, eq)] = arg.slice(eq + 1);
  }
  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function appendLog(status, payload = {}) {
  ensureDir(LOG_DIR);
  fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${status} ${JSON.stringify(payload)}\n`, "utf8");
}

function makeRunId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  return `wec-manual-proof-${stamp}-${Math.random().toString(16).slice(2, 10)}`;
}

function parseJsonOutput(output, stepName) {
  const raw = text(output);
  if (!raw) throw conflict(stepName, "child runner returned empty stdout");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw conflict(stepName, `child runner returned non-JSON stdout: ${raw.slice(0, 800)}`);
  }
}

function conflict(stepName, message) {
  const error = new Error(message);
  error.status = "CONFLICT";
  error.step = stepName;
  return error;
}

function fail(stepName, message, detail = {}) {
  const error = new Error(message);
  error.status = "FAIL";
  error.step = stepName;
  error.detail = detail;
  return error;
}

function assertField(payload, fieldName, stepName) {
  if (!Object.prototype.hasOwnProperty.call(payload || {}, fieldName)) {
    throw conflict(stepName, `missing expected output field: ${fieldName}`);
  }
}

function numberField(payload, fieldName, stepName) {
  assertField(payload, fieldName, stepName);
  const value = Number(payload[fieldName]);
  if (!Number.isFinite(value)) throw conflict(stepName, `expected numeric output field: ${fieldName}`);
  return value;
}

function objectField(payload, fieldName, stepName) {
  assertField(payload, fieldName, stepName);
  if (!payload[fieldName] || typeof payload[fieldName] !== "object" || Array.isArray(payload[fieldName])) {
    throw conflict(stepName, `expected object output field: ${fieldName}`);
  }
  return payload[fieldName];
}

function compareObjects(left, right) {
  const keys = Array.from(new Set([...Object.keys(left || {}), ...Object.keys(right || {})])).sort();
  return keys.every((key) => Number(left[key] || 0) === Number(right[key] || 0));
}

function runChild(stepName, runnerPath, runMeta = {}, extraArgs = []) {
  if (!fs.existsSync(runnerPath)) throw conflict(stepName, `runner file not found: ${runnerPath}`);
  const command = `${process.execPath} ${JSON.stringify(runnerPath)}`;
  if (command.includes(EXCLUDED_PATH)) {
    throw conflict(stepName, `excluded path would be called: ${EXCLUDED_PATH}`);
  }
  const args = [...extraArgs];
  if (runMeta.run_id) args.push(`--run-id=${runMeta.run_id}`);
  if (runMeta.run_time) args.push(`--run-time=${runMeta.run_time}`);
  appendLog("STEP_RUN", { step: stepName, runner: runnerPath, run_id: runMeta.run_id || null, run_time: runMeta.run_time || null });
  try {
    const output = execFileSync(process.execPath, [runnerPath, ...args], {
      encoding: "utf8",
      timeout: 900000,
      cwd: RUNNER_DIR,
      env: {
        ...process.env,
        WEC_RUN_ID: runMeta.run_id || process.env.WEC_RUN_ID || "",
        WEC_RUN_TIME: runMeta.run_time || process.env.WEC_RUN_TIME || ""
      }
    });
    const payload = parseJsonOutput(output, stepName);
    appendLog("STEP_EXIT", { step: stepName, ok: payload.ok !== false, run_id: runMeta.run_id || null, run_time: runMeta.run_time || null });
    return payload;
  } catch (error) {
    if (error.status === "CONFLICT") throw error;
    const stdout = text(error.stdout || "");
    const stderr = text(error.stderr || "");
    let childPayload = null;
    if (stdout) {
      try {
        childPayload = JSON.parse(stdout);
      } catch {
        childPayload = null;
      }
    }
    appendLog("STEP_FAIL", { step: stepName, message: error.message, run_id: runMeta.run_id || null, run_time: runMeta.run_time || null, stdout: stdout.slice(0, 1000), stderr: stderr.slice(0, 1000) });
    throw fail(stepName, `child runner failed: ${error.message}`, { stdout, stderr, childPayload });
  }
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sumKnown(...values) {
  const known = values.map(nullableNumber).filter((value) => value !== null);
  if (!known.length) return null;
  return known.reduce((sum, value) => sum + value, 0);
}

function laneSummary(lane, status, payload = null, blocker = "") {
  if (!payload) {
    return {
      lane,
      status,
      rows_read: null,
      rows_inserted: null,
      rows_updated: null,
      rows_skipped_unchanged: null,
      rows_deleted: null,
      blocker: blocker || null
    };
  }
  if (lane === "schedule_staging") {
    return {
      lane,
      status,
      rows_read: nullableNumber(payload.payload_row_count),
      rows_inserted: null,
      rows_updated: nullableNumber(payload.update_schedule_staging_upserts ?? payload.stage2c?.update_schedule_staging_upserts),
      rows_skipped_unchanged: null,
      rows_deleted: sumKnown(payload.update_schedule_staging_stale_deleted, payload.confirm_delete_catalyst_rows_deleted),
      blocker: blocker || null
    };
  }
  if (lane === "helper_before" || lane === "helper_after") {
    return {
      lane,
      status,
      rows_read: null,
      rows_inserted: null,
      rows_updated: null,
      rows_skipped_unchanged: null,
      rows_deleted: nullableNumber(payload.records_deleted),
      blocker: blocker || null
    };
  }
  if (lane === "class_oog_class_start_times") {
    return {
      lane,
      status,
      rows_read: sumKnown(payload.source_count, payload.class_start_times_target_classes),
      rows_inserted: nullableNumber(payload.missing_airtable_rows_repaired),
      rows_updated: null,
      rows_skipped_unchanged: null,
      rows_deleted: sumKnown(payload.class_oog_stale_deleted, payload.class_start_times_stale_deleted),
      blocker: blocker || null
    };
  }
  if (lane === "entry_go_times") {
    return {
      lane,
      status,
      rows_read: nullableNumber(payload.source_rows),
      rows_inserted: nullableNumber(payload.entry_go_times_rows_created),
      rows_updated: nullableNumber(payload.entry_go_times_rows_updated),
      rows_skipped_unchanged: null,
      rows_deleted: nullableNumber(payload.records_deleted ?? payload.stale_rows_deleted),
      blocker: blocker || null
    };
  }
  if (lane === "publisher") {
    return {
      lane,
      status,
      rows_read: null,
      rows_inserted: null,
      rows_updated: null,
      rows_skipped_unchanged: null,
      rows_deleted: null,
      blocker: blocker || null
    };
  }
  return {
    lane,
    status,
    rows_read: null,
    rows_inserted: null,
    rows_updated: null,
    rows_skipped_unchanged: null,
    rows_deleted: null,
    blocker: blocker || null
  };
}

function validateStage2(payload) {
  const step = "stage2";
  assertField(payload, "show_no", step);
  assertField(payload, "focus_day", step);
  const rawUpdateScheduleRows = nullableNumber(payload.update_schedule_rows);
  const canonicalSourceRows = nullableNumber(payload.payload_row_count);
  const activeStagingRows = nullableNumber(payload.stage2c?.update_schedule_staging_active_canonical_rows);
  const protectedStaleStagingRows = nullableNumber(payload.stage2c?.update_schedule_staging_protected_stale_rows);
  const totalStagingRows = nullableNumber(payload.update_schedule_staging_rows);
  const hsUpdateScheduleRowsStatus = payload.source === "airtable.update_schedule" && payload.hs_update_schedule_rows === null
    ? "not_applicable"
    : "";
  const counters = {
    raw_update_schedule_rows: rawUpdateScheduleRows,
    canonical_source_rows: canonicalSourceRows,
    active_staging_rows: activeStagingRows,
    protected_stale_staging_rows: protectedStaleStagingRows,
    total_staging_rows: totalStagingRows,
    hs_update_schedule_rows_status: hsUpdateScheduleRowsStatus || null
  };
  if (Object.values(counters).some((value) => value === null)) {
    throw fail(step, "Stage 2 missing non-mirror proof counter", counters);
  }
  const pass = canonicalSourceRows === activeStagingRows
    && totalStagingRows === activeStagingRows + protectedStaleStagingRows
    && rawUpdateScheduleRows >= canonicalSourceRows
    && hsUpdateScheduleRowsStatus === "not_applicable";
  if (!pass) throw fail(step, "Stage 2 non-mirror counts do not match", counters);
  return {
    show_no: text(payload.show_no),
    focus_day: text(payload.focus_day),
    run_id: text(payload.run_id),
    run_time: text(payload.run_time),
    focus_show_record_id: text(payload.focus_show_record_id || payload.source_control_record || payload.stage2c?.focus_show_control?.record_id),
    raw_update_schedule_rows: rawUpdateScheduleRows,
    canonical_source_rows: canonicalSourceRows,
    active_staging_rows: activeStagingRows,
    protected_stale_staging_rows: protectedStaleStagingRows,
    total_staging_rows: totalStagingRows,
    hs_update_schedule_rows_status: hsUpdateScheduleRowsStatus,
    non_mirror_counts_match: true,
    raw: payload
  };
}

function validateHelper(payload, stepName) {
  assertField(payload, "ok", stepName);
  const rowsDeleted = numberField(payload, "rows_deleted", stepName);
  const linksCleared = numberField(payload, "links_cleared", stepName);
  const blockingMisses = Array.isArray(payload.blocking_misses) ? payload.blocking_misses.length : Number(payload.blocking_miss_count || 0);
  if (payload.ok !== true || rowsDeleted !== 0 || linksCleared !== 0 || blockingMisses !== 0) {
    throw fail(stepName, "helper repair pass condition failed", { ok: payload.ok, rowsDeleted, linksCleared, blockingMisses });
  }
  return {
    pass: true,
    records_deleted: rowsDeleted,
    links_cleared: linksCleared,
    raw: payload
  };
}

function validateClassOogAndStart(payload) {
  const step = "class_oog_class_start_times";
  const classOogCount = numberField(payload, "class_oog_count", step);
  const hsClassOogCount = numberField(payload, "hs_class_oog_count", step);
  const classStartCount = numberField(payload, "class_start_times_count", step);
  const hsClassStartCount = numberField(payload, "hs_class_start_times_count", step);
  assertField(payload, "class_oog_counts_match", step);
  assertField(payload, "class_start_times_counts_match", step);
  if (payload.class_oog_counts_match !== true || classOogCount !== hsClassOogCount) {
    throw fail(step, "class_oog counts do not match", { classOogCount, hsClassOogCount });
  }
  if (payload.class_start_times_counts_match !== true || classStartCount !== hsClassStartCount) {
    throw fail(step, "class_start_times counts do not match", { classStartCount, hsClassStartCount });
  }
  return {
    class_oog_count: classOogCount,
    hs_class_oog_count: hsClassOogCount,
    class_oog_counts_match: true,
    class_start_times_count: classStartCount,
    hs_class_start_times_count: hsClassStartCount,
    class_start_times_counts_match: true,
    focus_show_record_id: text(payload.focus_show_record_id || payload.source_control_record),
    class_oog_by_trainer: payload.matched_rows_by_trainer || {},
    raw: payload
  };
}

function validateEntryGoTimes(payload) {
  const step = "entry_go_times";
  const classOogCount = numberField(payload, "class_oog_count_after", step);
  const entryGoCount = numberField(payload, "entry_go_times_count_after", step);
  assertField(payload, "counts_match", step);
  const oogByTrainer = objectField(payload, "matched_rows_by_trainer_class_oog", step);
  const entryByTrainer = objectField(payload, "matched_rows_by_trainer_entry_go_times", step);
  const trainerCountsMatch = compareObjects(oogByTrainer, entryByTrainer);
  if (payload.counts_match !== true || entryGoCount !== classOogCount || !trainerCountsMatch) {
    throw fail(step, "entry_go_times pass condition failed", { classOogCount, entryGoCount, trainerCountsMatch, oogByTrainer, entryByTrainer });
  }
  return {
    class_oog_count_for_entry_comparison: classOogCount,
    entry_go_times_count: entryGoCount,
    entry_go_times_equals_class_oog: true,
    entry_go_times_by_trainer: entryByTrainer,
    trainer_counts_match: true,
    records_deleted: Number(payload.records_deleted || 0),
    links_cleared: Number(payload.links_cleared || 0),
    focus_show_record_id: text(payload.focus_show_record_id || payload.source_control_record),
    raw: payload
  };
}

function writeProof(proof) {
  ensureDir(PROOF_DIR);
  const safeDay = text(proof.active_focus_day || "unknown").replace(/[^0-9A-Za-z_-]+/g, "-");
  const safeShow = text(proof.active_show_no || "unknown").replace(/[^0-9A-Za-z_-]+/g, "-");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const proofPath = path.join(PROOF_DIR, `run_wec_stacked_workflow-${safeShow}-${safeDay}-${stamp}.json`);
  fs.writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  return proofPath;
}

function buildFailureProof(status, error, partial) {
  const lane_status = partial.lane_status || {};
  if (error.step) {
    lane_status[error.step === "stage2" ? "schedule_staging" : error.step] = laneSummary(error.step === "stage2" ? "schedule_staging" : error.step, "FAIL", null, error.message);
  }
  return {
    status,
    final_status: status,
    final_pass: false,
    run_id: partial.run_id || "",
    run_time: partial.run_time || "",
    caller_source: partial.caller_source || "",
    proof_path_type: PROOF_PATH_TYPE,
    active_show_no: partial.stage2?.show_no || "",
    active_focus_day: partial.stage2?.focus_day || "",
    focus_day: partial.stage2?.focus_day || "",
    source_control_record: partial.source_control_record || partial.stage2?.focus_show_record_id || "",
    lanes_run: partial.lanes_run,
    lane_status,
    failed_step: error.step || "",
    conflict_lane: status === "CONFLICT" ? (error.step || "") : "",
    blocker: error.message,
    stage2: partial.stage2 || (error.step === "stage2" ? error.detail : null),
    helper_before: partial.helper_before || null,
    class_oog_class_start_times: partial.class_oog_class_start_times || null,
    entry_go_times: partial.entry_go_times || null,
    helper_after: partial.helper_after || null,
    records_deleted_total: partial.records_deleted_total || 0,
    links_cleared_total: partial.links_cleared_total || 0,
    publisher_included: false,
    publisher_placeholder_reason: "publisher not wired in manual proof path",
    mobile_changed: "no",
    print_changed: "no",
    alerts_changed: "no",
    results_changed: "no",
    rich_api_changed: "no",
    sms_changed: "no"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const runMeta = {
    run_id: args["run-id"] || args.run_id || process.env.WEC_RUN_ID || makeRunId(),
    run_time: args["run-time"] || args.run_time || process.env.WEC_RUN_TIME || new Date().toISOString()
  };
  const partial = {
    run_id: runMeta.run_id,
    run_time: runMeta.run_time,
    caller_source: "manual_runner",
    lanes_run: [],
    lane_status: {},
    records_deleted_total: 0,
    links_cleared_total: 0
  };
  appendLog("RUN", { action: "run_wec_stacked_workflow", run_id: runMeta.run_id, run_time: runMeta.run_time, caller_source: partial.caller_source, proof_path_type: PROOF_PATH_TYPE });
  try {
    const stage2 = validateStage2(runChild("stage2", CALLABLES.stage2, runMeta));
    partial.stage2 = stage2;
    partial.source_control_record = stage2.focus_show_record_id;
    partial.lanes_run.push("stage2");
    partial.lane_status.schedule_staging = laneSummary("schedule_staging", "PASS", stage2.raw);

    const helperBefore = validateHelper(runChild("helper_before", CALLABLES.helper), "helper_before");
    partial.helper_before = helperBefore;
    partial.records_deleted_total += helperBefore.records_deleted;
    partial.links_cleared_total += helperBefore.links_cleared;
    partial.lanes_run.push("helper_before");
    partial.lane_status.helper_before = laneSummary("helper_before", "PASS", helperBefore);

    const classOogStart = validateClassOogAndStart(runChild("class_oog_class_start_times", CALLABLES.classOogAndStart, runMeta));
    partial.class_oog_class_start_times = classOogStart;
    if (!partial.source_control_record && classOogStart.focus_show_record_id) partial.source_control_record = classOogStart.focus_show_record_id;
    partial.lanes_run.push("class_oog_class_start_times");
    partial.lane_status.class_oog_class_start_times = laneSummary("class_oog_class_start_times", "PASS", classOogStart.raw);

    const entryGoTimes = validateEntryGoTimes(runChild("entry_go_times", CALLABLES.entryGoTimes, runMeta));
    partial.entry_go_times = entryGoTimes;
    if (!partial.source_control_record && entryGoTimes.focus_show_record_id) partial.source_control_record = entryGoTimes.focus_show_record_id;
    partial.records_deleted_total += entryGoTimes.records_deleted;
    partial.links_cleared_total += entryGoTimes.links_cleared;
    partial.lanes_run.push("entry_go_times");
    partial.lane_status.entry_go_times = laneSummary("entry_go_times", "PASS", entryGoTimes.raw);

    const helperAfter = validateHelper(runChild("helper_after", CALLABLES.helper), "helper_after");
    partial.helper_after = helperAfter;
    partial.records_deleted_total += helperAfter.records_deleted;
    partial.links_cleared_total += helperAfter.links_cleared;
    partial.lanes_run.push("helper_after");
    partial.lane_status.helper_after = laneSummary("helper_after", "PASS", helperAfter);
    partial.lane_status.publisher = laneSummary("publisher", "SKIPPED", null, "publisher not wired in manual proof path");

    const proof = {
      status: "PASS",
      final_status: "PASS",
      final_pass: true,
      run_id: runMeta.run_id,
      run_time: runMeta.run_time,
      caller_source: partial.caller_source,
      proof_path_type: PROOF_PATH_TYPE,
      active_show_no: stage2.show_no,
      active_focus_day: stage2.focus_day,
      focus_day: stage2.focus_day,
      source_control_record: partial.source_control_record || "",
      lanes_run: partial.lanes_run,
      lane_status: partial.lane_status,
      failed_step: "",
      conflict_lane: "",
      blocker: "",
      stage2: {
        raw_update_schedule_rows: stage2.raw_update_schedule_rows,
        canonical_source_rows: stage2.canonical_source_rows,
        active_staging_rows: stage2.active_staging_rows,
        protected_stale_staging_rows: stage2.protected_stale_staging_rows,
        total_staging_rows: stage2.total_staging_rows,
        hs_update_schedule_rows_status: stage2.hs_update_schedule_rows_status,
        non_mirror_counts_match: stage2.non_mirror_counts_match
      },
      helper_before: { pass: helperBefore.pass, records_deleted: helperBefore.records_deleted, links_cleared: helperBefore.links_cleared },
      class_oog: {
        count: classOogStart.class_oog_count,
        hs_count: classOogStart.hs_class_oog_count,
        counts_match: classOogStart.class_oog_counts_match,
        by_trainer: classOogStart.class_oog_by_trainer
      },
      class_start_times: {
        count: classOogStart.class_start_times_count,
        hs_count: classOogStart.hs_class_start_times_count,
        counts_match: classOogStart.class_start_times_counts_match
      },
      entry_go_times: {
        count: entryGoTimes.entry_go_times_count,
        class_oog_count_for_entry_comparison: entryGoTimes.class_oog_count_for_entry_comparison,
        equals_class_oog: entryGoTimes.entry_go_times_equals_class_oog,
        by_trainer: entryGoTimes.entry_go_times_by_trainer,
        trainer_counts_match: entryGoTimes.trainer_counts_match
      },
      helper_after: { pass: helperAfter.pass, records_deleted: helperAfter.records_deleted, links_cleared: helperAfter.links_cleared },
      records_deleted_total: partial.records_deleted_total,
      links_cleared_total: partial.links_cleared_total,
      publisher_included: false,
      publisher_placeholder_reason: "publisher not wired in manual proof path",
      mobile_changed: "no",
      print_changed: "no",
      alerts_changed: "no",
      results_changed: "no",
      rich_api_changed: "no",
      sms_changed: "no"
    };
    proof.full_proof_json_path = writeProof(proof);
    appendLog("EXIT", { status: "PASS", run_id: runMeta.run_id, run_time: runMeta.run_time, proof: proof.full_proof_json_path });
    process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
  } catch (error) {
    const status = error.status === "CONFLICT" ? "CONFLICT" : "FAIL";
    const proof = buildFailureProof(status, error, partial);
    proof.full_proof_json_path = writeProof(proof);
    appendLog(status, { step: error.step || "", blocker: error.message, run_id: runMeta.run_id, run_time: runMeta.run_time, proof: proof.full_proof_json_path });
    process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
    process.exitCode = status === "CONFLICT" ? 2 : 1;
  }
}

main();
