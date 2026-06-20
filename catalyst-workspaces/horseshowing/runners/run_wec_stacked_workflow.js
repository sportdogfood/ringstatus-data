#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const RUNNER_DIR = __dirname;
const LOG_DIR = path.join(RUNNER_DIR, "logs");
const PROOF_DIR = path.join(RUNNER_DIR, "proofs");
const LOG_PATH = path.join(LOG_DIR, "run_wec_stacked_workflow.log");
const EXCLUDED_PATH = "horseshowing_class_lane_runner?action=sync-class-start-times";

const CALLABLES = {
  stage2: path.join(RUNNER_DIR, "sync_focus_update_schedule_to_staging.js"),
  helper: path.join(RUNNER_DIR, "repair_update_schedule_staging_links.js"),
  classOogAndStart: path.join(RUNNER_DIR, "sync_class_oog_and_class_start_times.js"),
  entryGoTimes: path.join(RUNNER_DIR, "sync_entry_go_times_from_class_oog.js")
};

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function appendLog(status, payload = {}) {
  ensureDir(LOG_DIR);
  fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${status} ${JSON.stringify(payload)}\n`, "utf8");
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

function runChild(stepName, runnerPath) {
  if (!fs.existsSync(runnerPath)) throw conflict(stepName, `runner file not found: ${runnerPath}`);
  const command = `${process.execPath} ${JSON.stringify(runnerPath)}`;
  if (command.includes(EXCLUDED_PATH)) {
    throw conflict(stepName, `excluded path would be called: ${EXCLUDED_PATH}`);
  }
  appendLog("STEP_RUN", { step: stepName, runner: runnerPath });
  try {
    const output = execFileSync(process.execPath, [runnerPath], {
      encoding: "utf8",
      timeout: 900000,
      cwd: RUNNER_DIR,
      env: process.env
    });
    const payload = parseJsonOutput(output, stepName);
    appendLog("STEP_EXIT", { step: stepName, ok: payload.ok !== false });
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
    appendLog("STEP_FAIL", { step: stepName, message: error.message, stdout: stdout.slice(0, 1000), stderr: stderr.slice(0, 1000) });
    throw fail(stepName, `child runner failed: ${error.message}`, { stdout, stderr, childPayload });
  }
}

function validateStage2(payload) {
  const step = "stage2";
  const payloadCount = numberField(payload, "payload_row_count", step);
  const hsCount = numberField(payload, "hs_update_schedule_rows", step);
  const mirrorCount = numberField(payload, "update_schedule_rows", step);
  const stagingCount = numberField(payload, "update_schedule_staging_rows", step);
  assertField(payload, "show_no", step);
  assertField(payload, "focus_day", step);
  const pass = payloadCount === hsCount && hsCount === mirrorCount && mirrorCount === stagingCount;
  if (!pass) throw fail(step, "Stage 2 counts do not match", { payloadCount, hsCount, mirrorCount, stagingCount });
  return {
    show_no: text(payload.show_no),
    focus_day: text(payload.focus_day),
    payload_row_count: payloadCount,
    hs_update_schedule_rows: hsCount,
    update_schedule_rows: mirrorCount,
    update_schedule_staging_rows: stagingCount,
    counts_match: true,
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
  return {
    status,
    active_show_no: partial.stage2?.show_no || "",
    active_focus_day: partial.stage2?.focus_day || "",
    lanes_run: partial.lanes_run,
    failed_step: error.step || "",
    conflict_lane: status === "CONFLICT" ? (error.step || "") : "",
    blocker: error.message,
    stage2: partial.stage2 || null,
    helper_before: partial.helper_before || null,
    class_oog_class_start_times: partial.class_oog_class_start_times || null,
    entry_go_times: partial.entry_go_times || null,
    helper_after: partial.helper_after || null,
    records_deleted_total: partial.records_deleted_total || 0,
    links_cleared_total: partial.links_cleared_total || 0,
    mobile_changed: "no",
    print_changed: "no",
    alerts_changed: "no",
    results_changed: "no",
    rich_api_changed: "no",
    sms_changed: "no"
  };
}

function main() {
  const partial = {
    lanes_run: [],
    records_deleted_total: 0,
    links_cleared_total: 0
  };
  appendLog("RUN", { action: "run_wec_stacked_workflow" });
  try {
    const stage2 = validateStage2(runChild("stage2", CALLABLES.stage2));
    partial.stage2 = stage2;
    partial.lanes_run.push("stage2");

    const helperBefore = validateHelper(runChild("helper_before", CALLABLES.helper), "helper_before");
    partial.helper_before = helperBefore;
    partial.records_deleted_total += helperBefore.records_deleted;
    partial.links_cleared_total += helperBefore.links_cleared;
    partial.lanes_run.push("helper_before");

    const classOogStart = validateClassOogAndStart(runChild("class_oog_class_start_times", CALLABLES.classOogAndStart));
    partial.class_oog_class_start_times = classOogStart;
    partial.lanes_run.push("class_oog_class_start_times");

    const entryGoTimes = validateEntryGoTimes(runChild("entry_go_times", CALLABLES.entryGoTimes));
    partial.entry_go_times = entryGoTimes;
    partial.records_deleted_total += entryGoTimes.records_deleted;
    partial.links_cleared_total += entryGoTimes.links_cleared;
    partial.lanes_run.push("entry_go_times");

    const helperAfter = validateHelper(runChild("helper_after", CALLABLES.helper), "helper_after");
    partial.helper_after = helperAfter;
    partial.records_deleted_total += helperAfter.records_deleted;
    partial.links_cleared_total += helperAfter.links_cleared;
    partial.lanes_run.push("helper_after");

    const proof = {
      status: "PASS",
      active_show_no: stage2.show_no,
      active_focus_day: stage2.focus_day,
      lanes_run: partial.lanes_run,
      failed_step: "",
      conflict_lane: "",
      blocker: "",
      stage2: {
        payload_row_count: stage2.payload_row_count,
        hs_update_schedule_rows: stage2.hs_update_schedule_rows,
        update_schedule_rows: stage2.update_schedule_rows,
        update_schedule_staging_rows: stage2.update_schedule_staging_rows,
        counts_match: stage2.counts_match
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
      mobile_changed: "no",
      print_changed: "no",
      alerts_changed: "no",
      results_changed: "no",
      rich_api_changed: "no",
      sms_changed: "no"
    };
    proof.full_proof_json_path = writeProof(proof);
    appendLog("EXIT", { status: "PASS", proof: proof.full_proof_json_path });
    process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
  } catch (error) {
    const status = error.status === "CONFLICT" ? "CONFLICT" : "FAIL";
    const proof = buildFailureProof(status, error, partial);
    proof.full_proof_json_path = writeProof(proof);
    appendLog(status, { step: error.step || "", blocker: error.message, proof: proof.full_proof_json_path });
    process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
    process.exitCode = status === "CONFLICT" ? 2 : 1;
  }
}

main();
