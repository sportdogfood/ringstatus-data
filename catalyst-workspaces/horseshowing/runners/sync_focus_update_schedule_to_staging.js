#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const path = require("node:path");

const DEFAULT_BASE_ID = "app6XS1RvsPNRT6os";
const DEFAULT_SYNC_URL = "https://horseshowing-700800454.development.catalystserverless.com/server/horseshowing_sync/";
const FOCUS_SHOW_TABLE = "focus_show";

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

async function runStage2B(syncUrl, showNo, rawRecId) {
  const url = new URL(syncUrl);
  url.searchParams.set("action", "parse-update-schedule-raw-chunk");
  url.searchParams.set("show_no", showNo);
  url.searchParams.set("raw_rec_id", rawRecId);
  return fetchJson(url.toString(), { timeout_ms: 120000 });
}

async function main() {
  const args = parseArgs(process.argv);
  const baseId = args["base-id"] || args.base_id || process.env.WEC_AIRTABLE_BASE_ID || DEFAULT_BASE_ID;
  const token = args["airtable-token"] || args.airtable_token || process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_WEC_TOKEN;
  if (!token) throw new Error("AIRTABLE_TOKEN or AIRTABLE_WEC_TOKEN required");
  const syncUrl = args["sync-url"] || args.sync_url || DEFAULT_SYNC_URL;
  const runnerPath = args["stage2a-runner"] || path.join(__dirname, "fetch_update_schedule_raw.js");
  const focus = await getActiveFocusShow(baseId, token, args["show-no"] || args.show_no || "");
  const ringRows = await getStageOneRingRows(syncUrl, focus.show_no, focus.focus_day);
  if (!ringRows.length) {
    throw new Error(`no Stage 1 hs_rings rows for show_no=${focus.show_no} focus_day=${focus.focus_day}`);
  }
  const results = [];
  for (const row of ringRows) {
    const stored = runStage2A({
      runnerPath,
      syncUrl,
      showNo: focus.show_no,
      focusDay: focus.focus_day,
      row
    });
    const parsed = await runStage2B(syncUrl, focus.show_no, stored.raw_rec_id);
    results.push({
      ring_day_no: text(row.ring_day_no),
      raw_rec_id: stored.raw_rec_id,
      parse_wec_log_rec_id: parsed.parse_wec_log_rec_id,
      hs_update_schedule_rows: Number(parsed.hs_update_schedule_rows || 0),
      update_schedule_rows: Number(parsed.update_schedule_rows || 0),
      update_schedule_staging_rows: Number(parsed.update_schedule_staging_rows || 0)
    });
  }
  const summary = {
    ok: true,
    action: "sync-focus-update-schedule-to-staging",
    show_no: focus.show_no,
    focus_day: focus.focus_day,
    ring_day_no_count: ringRows.length,
    raw_rows_stored: results.length,
    parse_runs_completed: results.length,
    hs_update_schedule_rows: results.reduce((sum, row) => sum + row.hs_update_schedule_rows, 0),
    update_schedule_rows: results.reduce((sum, row) => sum + row.update_schedule_rows, 0),
    update_schedule_staging_rows: results.reduce((sum, row) => sum + row.update_schedule_staging_rows, 0),
    parse_wec_log_rec_ids: results.map((row) => row.parse_wec_log_rec_id).filter(Boolean),
    ring_day_nos: results.map((row) => row.ring_day_no)
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
