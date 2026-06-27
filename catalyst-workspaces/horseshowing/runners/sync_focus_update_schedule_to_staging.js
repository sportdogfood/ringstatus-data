#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_BASE_ID = "app6XS1RvsPNRT6os";
const DEFAULT_SYNC_URL = "https://horseshowing-700800454.development.catalystserverless.com/server/horseshowing_sync/";
const FOCUS_SHOW_TABLE = "focus_show";
const LOG_DIR = path.join(__dirname, "logs");
const RUN_LOG_PATH = path.join(LOG_DIR, "sync_focus_update_schedule_to_staging.log");
const LAST_SUCCESS_PATH = path.join(LOG_DIR, "sync_focus_update_schedule_to_staging.last_success.json");
const UPDATE_SCHEDULE_FIELD_MAP = [
  ["show_no", "show_no"],
  ["class_no", "class_no"],
  ["ring_day_no", "ring_day_no"],
  ["ring_no", "ring_no"],
  ["ring_name", "ring_name"],
  ["date_text", "date_text"],
  ["iso_date", "iso_date", "date"],
  ["event_id", "event_id"],
  ["event_name", "event_name"],
  ["class_payout", "class_payout"],
  ["class_name", "class_name"],
  ["time_text", "time_text"],
  ["entry_count", "entry_count"],
  ["event_type", "event_type"],
  ["oc_id", "oc_id"],
  ["live_flag", "live_flag"],
  ["source_endpoint", "source"]
];

function appendRunLog(status, details = {}) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(
    RUN_LOG_PATH,
    `${new Date().toISOString()} ${status} ${JSON.stringify(details)}\n`,
    "utf8"
  );
}

function writeLastSuccess(summary) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(
    LAST_SUCCESS_PATH,
    `${JSON.stringify({
      ...summary,
      success_at: new Date().toISOString()
    }, null, 2)}\n`,
    "utf8"
  );
}

function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq === -1) {
      args[arg.slice(2)] = "1";
    } else {
      args[arg.slice(2, eq)] = arg.slice(eq + 1);
    }
  }
  return args;
}

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function dateKey(value) {
  const raw = text(value);
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`;
}

function formulaValue(value) {
  return JSON.stringify(text(value));
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeout_ms || 60000));
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const raw = await response.text();
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error(`non-JSON response ${response.status}: ${raw.slice(0, 500)}`);
    }
    if (!response.ok || payload.ok === false) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 800)}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function airtableListAll(baseId, tableName, token, params = {}) {
  const rows = [];
  let offset = "";
  do {
    const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
    }
    if (offset) url.searchParams.set("offset", offset);
    const payload = await fetchJson(url.toString(), {
      headers: { authorization: `Bearer ${token}` },
      timeout_ms: 60000
    });
    rows.push(...(payload.records || []));
    offset = payload.offset || "";
  } while (offset);
  return rows;
}

async function getActiveFocusShow(baseId, token, requestedShowNo = "") {
  const formula = requestedShowNo
    ? `AND({active}=1,{show_no}=${Number(requestedShowNo)})`
    : "{active}=1";
  const rows = await airtableListAll(baseId, FOCUS_SHOW_TABLE, token, {
    maxRecords: "10",
    filterByFormula: formula
  });
  const record = rows[0];
  if (!record) throw new Error("active focus_show not found");
  const fields = record.fields || {};
  const showNo = text(fields.show_no);
  const focusDay = dateKey(fields.focus_day);
  if (!showNo || !focusDay) throw new Error("active focus_show missing show_no or focus_day");
  return {
    record_id: record.id,
    show_no: showNo,
    focus_day: focusDay
  };
}

async function getStageOneRingRows(syncUrl, showNo, focusDay) {
  const rows = [];
  for (let offset = 0; ; offset += 200) {
    const url = new URL(syncUrl);
    url.searchParams.set("action", "export-mirror-table");
    url.searchParams.set("show_no", showNo);
    url.searchParams.set("table", "rings");
    url.searchParams.set("limit", "200");
    url.searchParams.set("offset", String(offset));
    const payload = await fetchJson(url.toString(), { timeout_ms: 60000 });
    const page = payload.data || [];
    rows.push(...page);
    if (!payload.has_more || page.length < 200) break;
  }
  return rows
    .filter((row) => text(row.show_no) === showNo && text(row.ring_day_no) && dateKey(row.day_label) === focusDay)
    .sort((a, b) => `${a.ring_no}|${a.ring_day_no}`.localeCompare(`${b.ring_no}|${b.ring_day_no}`));
}

async function exportMirrorTable(syncUrl, showNo, tableName) {
  const rows = [];
  for (let offset = 0; ; offset += 200) {
    const url = new URL(syncUrl);
    url.searchParams.set("action", "export-mirror-table");
    url.searchParams.set("show_no", showNo);
    url.searchParams.set("table", tableName);
    url.searchParams.set("limit", "200");
    url.searchParams.set("offset", String(offset));
    const payload = await fetchJson(url.toString(), { timeout_ms: 60000 });
    const page = payload.data || [];
    rows.push(...page);
    if (!payload.has_more || page.length < 200) break;
  }
  return rows;
}

async function getCatalystUpdateScheduleRows(syncUrl, showNo, focusDay) {
  const rows = await exportMirrorTable(syncUrl, showNo, "update_schedule");
  return rows.filter((row) => text(row.show_no) === showNo && dateKey(row.focus_day || row.iso_date) === focusDay);
}

async function getAirtableUpdateScheduleRows(baseId, token, showNo, focusDay) {
  const showValue = Number.isFinite(Number(showNo)) ? Number(showNo) : formulaValue(showNo);
  return airtableListAll(baseId, "update_schedule", token, {
    filterByFormula: `AND({show_no}=${showValue},IS_SAME({iso_date},DATETIME_PARSE(${formulaValue(focusDay)}),'day'))`
  });
}

function keyReport(keys) {
  const counts = new Map();
  for (const key of keys.map(text).filter(Boolean)) {
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return {
    unique_count: counts.size,
    duplicates: Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([key, count]) => ({ key, count }))
  };
}

function normalizeMirrorValue(value, kind = "") {
  if (kind === "date") return dateKey(value);
  return text(value);
}

function catalystUpdateScheduleComparable(row) {
  const normalized = {};
  for (const [catalystField, airtableField, kind] of UPDATE_SCHEDULE_FIELD_MAP) {
    normalized[airtableField] = normalizeMirrorValue(row[catalystField], kind);
  }
  return normalized;
}

function airtableUpdateScheduleComparable(record) {
  const fields = record.fields || {};
  const normalized = {};
  for (const [, airtableField, kind] of UPDATE_SCHEDULE_FIELD_MAP) {
    normalized[airtableField] = normalizeMirrorValue(fields[airtableField], kind);
  }
  return normalized;
}

function updateScheduleFieldMismatches(catalystRows, airtableRows) {
  const airtableByKey = new Map();
  for (const record of airtableRows) {
    const fields = record.fields || {};
    const key = text(fields.mirror_update_schedule_key || fields.update_schedule_key);
    if (key && !airtableByKey.has(key)) airtableByKey.set(key, record);
  }
  const mismatches = [];
  for (const row of catalystRows) {
    const key = text(row.update_schedule_key);
    if (!key || !airtableByKey.has(key)) continue;
    const catalystComparable = catalystUpdateScheduleComparable(row);
    const airtableComparable = airtableUpdateScheduleComparable(airtableByKey.get(key));
    const changed = Object.keys(catalystComparable)
      .filter((field) => catalystComparable[field] !== airtableComparable[field]);
    if (changed.length) {
      mismatches.push({
        key,
        fields: changed,
        catalyst: Object.fromEntries(changed.map((field) => [field, catalystComparable[field]])),
        airtable: Object.fromEntries(changed.map((field) => [field, airtableComparable[field]]))
      });
    }
  }
  return mismatches;
}

function buildUpdateScheduleMirrorProof(catalystRows, airtableRows) {
  const catalystKeys = catalystRows.map((row) => row.update_schedule_key);
  const airtableKeys = airtableRows.map((record) => {
    const fields = record.fields || {};
    return fields.mirror_update_schedule_key || fields.update_schedule_key;
  });
  const catalystReport = keyReport(catalystKeys);
  const airtableReport = keyReport(airtableKeys);
  const catalystSet = new Set(catalystKeys.map(text).filter(Boolean));
  const airtableSet = new Set(airtableKeys.map(text).filter(Boolean));
  const missingInAirtable = Array.from(catalystSet).filter((key) => !airtableSet.has(key)).sort();
  const extraInAirtable = Array.from(airtableSet).filter((key) => !catalystSet.has(key)).sort();
  const mappedFieldMismatches = updateScheduleFieldMismatches(catalystRows, airtableRows);
  return {
    hs_update_schedule_rows: catalystRows.length,
    update_schedule_rows: airtableRows.length,
    counts_match: catalystRows.length === airtableRows.length,
    hs_update_schedule_unique_keys: catalystReport.unique_count,
    update_schedule_unique_keys: airtableReport.unique_count,
    keys_match: missingInAirtable.length === 0 && extraInAirtable.length === 0,
    missing_in_update_schedule: missingInAirtable,
    extra_in_update_schedule: extraInAirtable,
    mapped_field_mismatches: mappedFieldMismatches,
    duplicate_hs_update_schedule_keys: catalystReport.duplicates,
    duplicate_update_schedule_keys: airtableReport.duplicates
  };
}

function runStage2A({ runnerPath, syncUrl, showNo, focusDay, row }) {
  const output = execFileSync(process.execPath, [
    runnerPath,
    `--show-no=${showNo}`,
    `--focus-day=${focusDay}`,
    `--ring-day-no=${row.ring_day_no}`,
    `--ring-no=${row.ring_no || ""}`,
    `--ring-name=${row.ring_name || ""}`,
    `--day-label=${row.day_label || focusDay}`,
    `--sync-url=${syncUrl}`
  ], { encoding: "utf8", timeout: 120000 });
  const payload = JSON.parse(output);
  if (!payload.ok || !payload.raw_rec_id) {
    throw new Error(`Stage 2A failed for ring_day_no=${row.ring_day_no}: ${output.slice(0, 800)}`);
  }
  return payload;
}

async function runStage2B(syncUrl, showNo, rawRecId, { executeConfirmDelete = false } = {}) {
  const url = new URL(syncUrl);
  url.searchParams.set("action", "parse-update-schedule-raw-chunk");
  url.searchParams.set("show_no", showNo);
  url.searchParams.set("raw_rec_id", rawRecId);
  if (executeConfirmDelete) url.searchParams.set("execute_confirm_delete", "1");
  return fetchJson(url.toString(), { timeout_ms: 120000 });
}

async function runStage2C(syncUrl, showNo, focusDay) {
  const url = new URL(syncUrl);
  url.searchParams.set("action", "sync-update-schedule-staging-from-mirror");
  url.searchParams.set("show_no", showNo);
  url.searchParams.set("focus_day", focusDay);
  return fetchJson(url.toString(), { timeout_ms: 120000 });
}

async function main() {
  const args = parseArgs(process.argv);
  const mirrorOnly = args["mirror-only"] === "1" || args.mirror_only === "1";
  const baseId = args["base-id"] || args.base_id || process.env.WEC_AIRTABLE_BASE_ID || DEFAULT_BASE_ID;
  const token = args["airtable-token"] || args.airtable_token || process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error("AIRTABLE_TOKEN required");
  const syncUrl = args["sync-url"] || args.sync_url || DEFAULT_SYNC_URL;
  const runnerPath = args["stage2a-runner"] || path.join(__dirname, "fetch_update_schedule_raw.js");
  const runId = args["run-id"] || args.run_id || process.env.WEC_RUN_ID || "";
  const runTime = args["run-time"] || args.run_time || process.env.WEC_RUN_TIME || "";
  const executeConfirmDelete = args["execute-confirm-delete"] === "1"
    || args.execute_confirm_delete === "1"
    || process.env.WEC_EXECUTE_CONFIRM_DELETE === "1";
  const focus = await getActiveFocusShow(baseId, token, args["show-no"] || args.show_no || "");
  const ringRows = await getStageOneRingRows(syncUrl, focus.show_no, focus.focus_day);
  if (!ringRows.length) {
    throw new Error(`no Stage 1 hs_rings rows for show_no=${focus.show_no} focus_day=${focus.focus_day}`);
  }
  if (mirrorOnly) {
    const catalystRows = await getCatalystUpdateScheduleRows(syncUrl, focus.show_no, focus.focus_day);
    const airtableRows = await getAirtableUpdateScheduleRows(baseId, token, focus.show_no, focus.focus_day);
    const mirror = buildUpdateScheduleMirrorProof(catalystRows, airtableRows);
    const summary = {
      ok: mirror.counts_match
        && mirror.keys_match
        && mirror.mapped_field_mismatches.length === 0
        && mirror.duplicate_hs_update_schedule_keys.length === 0
        && mirror.duplicate_update_schedule_keys.length === 0,
      action: "sync-focus-update-schedule-mirror-only",
      run_id: runId,
      run_time: runTime,
      focus_show_record_id: focus.record_id,
      source_control_record: focus.record_id,
      cadence_owned: true,
      stopped_at: "update_schedule",
      update_schedule_staging_touched: false,
      show_no: focus.show_no,
      focus_day: focus.focus_day,
      rows_read: airtableRows.length,
      rows_inserted: null,
      rows_updated: null,
      rows_skipped_unchanged: null,
      rows_deleted: 0,
      get_ring_days_count: ringRows.length,
      ring_day_no_count: ringRows.length,
      raw_rows_stored: 0,
      parse_runs_completed: 0,
      payload_row_count: airtableRows.length,
      hs_update_schedule_stale_deleted: 0,
      update_schedule_stale_deleted: 0,
      confirm_delete_rows: 0,
      confirm_delete_catalyst_rows_deleted: 0,
      records_deleted_from_update_schedule: 0,
      parse_wec_log_rec_ids: [],
      ring_day_nos: ringRows.map((row) => text(row.ring_day_no)).filter(Boolean),
      ...mirror
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (!summary.ok) {
      throw new Error("update_schedule mirror mismatch");
    }
    return summary;
  }
  const staged = await runStage2C(syncUrl, focus.show_no, focus.focus_day);
  const summary = {
    ok: true,
    action: "sync-focus-update-schedule-to-staging",
    source: "airtable.update_schedule",
    run_id: runId,
    run_time: runTime,
    focus_show_record_id: focus.record_id,
    source_control_record: focus.record_id,
    show_no: focus.show_no,
    focus_day: focus.focus_day,
    rows_read: Number(staged.payload_rows || 0),
    rows_inserted: null,
    rows_updated: Number(staged.update_schedule_staging_upserts || 0),
    rows_skipped_unchanged: null,
    rows_deleted: Number(staged.update_schedule_staging_stale_deleted || 0),
    ring_day_no_count: ringRows.length,
    raw_rows_stored: 0,
    parse_runs_completed: 0,
    hs_update_schedule_rows: null,
    update_schedule_rows: Number(staged.update_schedule_rows || 0),
    update_schedule_staging_rows: Number(staged.update_schedule_staging_rows || 0),
    payload_row_count: Number(staged.payload_rows || 0),
    hs_update_schedule_stale_deleted: 0,
    update_schedule_stale_deleted: 0,
    confirm_delete_rows: 0,
    confirm_delete_catalyst_rows_deleted: 0,
    update_schedule_staging_stale_deleted: Number(staged.update_schedule_staging_stale_deleted || 0),
    update_schedule_staging_source_link_rows: Number(staged.update_schedule_staging_source_link_rows || 0),
    update_schedule_staging_source_link_missing: Number(staged.update_schedule_staging_source_link_missing || 0),
    update_schedule_staging_out_of_focus_marked_inactive: Number(staged.update_schedule_staging_out_of_focus_marked_inactive || 0),
    parse_wec_log_rec_ids: [],
    ring_day_nos: ringRows.map((row) => text(row.ring_day_no)).filter(Boolean),
    stage2c: staged
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

const startupArgs = parseArgs(process.argv);
const startupAction = startupArgs["mirror-only"] === "1" || startupArgs.mirror_only === "1"
  ? "sync-focus-update-schedule-mirror-only"
  : "sync-focus-update-schedule-to-staging";

appendRunLog("RUN", {
  action: startupAction,
  argv: process.argv.slice(2)
});

main().then((summary) => {
  appendRunLog("EXIT", summary);
  writeLastSuccess(summary);
}).catch((error) => {
  appendRunLog("FAIL", {
    action: startupAction,
    message: error.message
  });
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
