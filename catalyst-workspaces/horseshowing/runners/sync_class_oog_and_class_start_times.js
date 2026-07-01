#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const path = require("node:path");

const DEFAULT_BASE_ID = "app6XS1RvsPNRT6os";
const DEFAULT_SYNC_URL = "https://horseshowing-700800454.development.catalystserverless.com/server/horseshowing_sync/";
const FOCUS_SHOW_TABLE = "focus_show";
const TRAINERS_TABLE = "trainers";
const STAGING_TABLE = "update_schedule_staging";

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

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeHelperKey(value) {
  return text(value)
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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
  return `'${String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function truthy(value) {
  return value === true || value === 1 || String(value ?? "").trim().toLowerCase() === "true";
}

function canonicalClassKey(row) {
  const showNo = text(row.show_no);
  const focusDay = dateKey(row.focus_day || row.iso_date);
  const ringDayNo = text(row.ring_day_no);
  const ringNo = text(row.ring_no);
  const classNo = text(row.class_no);
  if (!showNo || !focusDay || !ringDayNo || !ringNo || !classNo) return "";
  return `${showNo}|${focusDay}|${ringDayNo}|${ringNo}|${classNo}`;
}

function classOogRawKey(row) {
  return canonicalClassKey(row);
}

function rawRowParsed(row) {
  return text(row?.parse_status).toLowerCase() === "parsed";
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

async function airtableCreateRecords(baseId, tableName, token, records) {
  const created = [];
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    if (!batch.length) continue;
    const payload = await fetchJson(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ records: batch.map((fields) => ({ fields })) }),
      timeout_ms: 60000
    });
    created.push(...(payload.records || []));
  }
  return created;
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
  if (!truthy(fields.is_lock)) throw new Error(`focus_day.is_lock is not true for show_no=${showNo} focus_day=${focusDay}`);
  if (truthy(fields.is_pause)) throw new Error(`focus_show.is_pause is true for show_no=${showNo} focus_day=${focusDay}`);
  return {
    record_id: record.id,
    show_no: showNo,
    focus_day: focusDay,
    is_lock: true,
    is_pause: false
  };
}

async function getActiveTrainers(baseId, token) {
  const rows = await airtableListAll(baseId, TRAINERS_TABLE, token, {
    filterByFormula: "{active}=TRUE()"
  });
  const trainers = rows
    .map((record) => ({ id: record.id, name: text(record.fields?.trainer) }))
    .filter((row) => row.name);
  if (!trainers.length) throw new Error("no active trainers found");
  const trainerRecordIds = {};
  for (const row of trainers) {
    trainerRecordIds[row.name] = row.id;
    const key = normalizeHelperKey(row.name);
    if (key) trainerRecordIds[key] = row.id;
  }
  return {
    active_trainers: trainers.map((row) => row.name),
    trainer_record_ids: trainerRecordIds
  };
}

async function getLockedStagingRows(baseId, token, showNo, focusDay, sourceView = "class_oog") {
  const filterByFormula = [
    "AND(",
    `{show_no}=${Number(showNo)},`,
    `IS_SAME({iso_date},DATETIME_PARSE(${formulaValue(focusDay)}),'day'),`,
    "NOT({inactive}),",
    "OR({confirm_lock}=1,{is_lock}=1,{lock}=1),",
    "LEN({ring_day_no}&'')>0,",
    "LEN({ring_no}&'')>0,",
    "{class_no}>0",
    ")"
  ].join("");
  const records = await airtableListAll(baseId, STAGING_TABLE, token, { view: sourceView, filterByFormula });
  const rows = records
    .map((record) => {
      const fields = record.fields || {};
      return {
        staging_record_id: record.id,
        show_no: text(fields.show_no),
        focus_day: focusDay,
        ring_day_no: text(fields.ring_day_no),
        ring_no: text(fields.ring_no),
        ring_name: text(fields.ring_name),
        class_no: text(fields.class_no),
        class_label: text(fields.class_label),
        class_name: text(fields.class_name),
        time_text: text(fields.time_text),
        class_time_text: text(fields.time_text),
        entry_count: fields.entry_count,
        inactive: truthy(fields.inactive),
        confirm_lock: truthy(fields.confirm_lock),
        is_lock: truthy(fields.is_lock),
        lock: truthy(fields.lock)
      };
    })
    .filter((row) => row.show_no === showNo && row.ring_day_no && row.ring_no && row.class_no && !row.inactive && (row.confirm_lock || row.is_lock || row.lock));
  if (!rows.length) throw new Error(`no active locked update_schedule_staging rows in view ${sourceView} for show_no=${showNo} focus_day=${focusDay}`);
  return rows.sort((a, b) => `${a.ring_day_no}|${a.ring_no}|${a.class_no}`.localeCompare(`${b.ring_day_no}|${b.ring_no}|${b.class_no}`));
}

async function getStagingSourceStats(baseId, token, showNo, focusDay) {
  const showValue = Number.isFinite(Number(showNo)) ? String(Number(showNo)) : formulaValue(showNo);
  const filterByFormula = `AND({show_no}=${showValue},IS_SAME({iso_date},DATETIME_PARSE(${formulaValue(focusDay)}),'day'))`;
  const records = await airtableListAll(baseId, STAGING_TABLE, token, { filterByFormula });
  const activeGroups = new Map();
  let activeCanonicalRows = 0;
  let protectedStaleRows = 0;
  let protectedStaleInactive = 0;
  for (const record of records) {
    const fields = record.fields || {};
    const row = {
      show_no: text(fields.show_no),
      focus_day: dateKey(fields.focus_day || fields.iso_date) || focusDay,
      ring_day_no: text(fields.ring_day_no),
      ring_no: text(fields.ring_no),
      class_no: text(fields.class_no),
      inactive: truthy(fields.inactive),
      confirm_lock: truthy(fields.confirm_lock),
      is_lock: truthy(fields.is_lock),
      lock: truthy(fields.lock)
    };
    if (row.inactive) {
      protectedStaleRows += 1;
      protectedStaleInactive += 1;
      continue;
    }
    if (!(row.confirm_lock || row.is_lock || row.lock)) continue;
    const key = canonicalClassKey(row);
    if (!key) continue;
    activeCanonicalRows += 1;
    if (!activeGroups.has(key)) activeGroups.set(key, 0);
    activeGroups.set(key, activeGroups.get(key) + 1);
  }
  return {
    total_staging_rows: records.length,
    active_canonical_rows: activeCanonicalRows,
    unique_canonical_keys: activeGroups.size,
    active_duplicate_groups: [...activeGroups.values()].filter((count) => count > 1).length,
    protected_stale_rows: protectedStaleRows,
    protected_stale_rows_inactive: protectedStaleInactive
  };
}

function runClassOogRawFetch({ runnerPath, syncUrl, showNo, focusDay, row }) {
  const output = execFileSync(process.execPath, [
    runnerPath,
    `--show-no=${showNo}`,
    `--focus-day=${focusDay}`,
    `--ring-day-no=${row.ring_day_no}`,
    `--ring-no=${row.ring_no}`,
    `--ring-name=${row.ring_name || ""}`,
    `--class-no=${row.class_no}`,
    `--class-label=${row.class_label || ""}`,
    `--staging-record-id=${row.staging_record_id || ""}`,
    `--sync-url=${syncUrl}`
  ], { encoding: "utf8", timeout: 120000 });
  const payload = JSON.parse(output);
  if (!payload.ok || !payload.raw_rec_id) {
    throw new Error(`class_oog raw fetch/store failed for class_no=${row.class_no}: ${output.slice(0, 800)}`);
  }
  return payload;
}

async function parseClassOogRaw(syncUrl, showNo, rawRecId, activeTrainerData) {
  const url = new URL(syncUrl);
  url.searchParams.set("action", "parse-class-oog-raw-chunk");
  url.searchParams.set("show_no", showNo);
  url.searchParams.set("raw_rec_id", rawRecId);
  return fetchJson(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      raw_rec_id: rawRecId,
      active_trainers: activeTrainerData.active_trainers,
      trainer_record_ids: activeTrainerData.trainer_record_ids
    }),
    timeout_ms: 120000
  });
}

async function syncClassStartTimes(syncUrl, showNo, focusDay, lockedRows) {
  const url = new URL(syncUrl);
  url.searchParams.set("action", "sync-class-start-times-from-locked-staging");
  url.searchParams.set("show_no", showNo);
  return fetchJson(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      show_no: showNo,
      focus_day: focusDay,
      rows: lockedRows
    }),
    timeout_ms: 120000
  });
}

async function syncClassOogStaging(syncUrl, showNo, focusDay) {
  const url = new URL(syncUrl);
  url.searchParams.set("action", "sync-class-oog-staging-from-class-oog");
  url.searchParams.set("show_no", showNo);
  return fetchJson(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      show_no: showNo,
      focus_day: focusDay
    }),
    timeout_ms: 120000
  });
}

async function exportCatalystRows(syncUrl, showNo, table) {
  const rows = [];
  for (let offset = 0; ; offset += 200) {
    const url = new URL(syncUrl);
    url.searchParams.set("action", "export-mirror-table");
    url.searchParams.set("show_no", showNo);
    url.searchParams.set("table", table);
    url.searchParams.set("limit", "200");
    url.searchParams.set("offset", String(offset));
    const payload = await fetchJson(url.toString(), { timeout_ms: 60000 });
    const page = payload.data || [];
    rows.push(...page);
    if (!payload.has_more || page.length < 200) break;
  }
  return rows;
}

async function getClassOogRawRows(syncUrl, showNo, focusDay) {
  return (await exportCatalystRows(syncUrl, showNo, "class_oog_raw"))
    .filter((row) => dateKey(row.focus_day) === focusDay);
}

function classKeyFromClassOogRow(row) {
  const fields = row.fields || row;
  return canonicalClassKey({
    show_no: fields.show_no,
    focus_day: fields.focus_day,
    ring_day_no: fields.ring_day_no,
    ring_no: fields.ring_no,
    class_no: fields.class_no
  });
}

function classStartRequiredFieldsPopulated(row) {
  const fields = row.fields || row;
  return Boolean(
    text(fields.class_start_key)
    && text(fields.show_no)
    && dateKey(fields.focus_day)
    && text(fields.ring_day_no)
    && text(fields.ring_no)
    && text(fields.class_no)
    && (text(fields.class_start_time) || text(fields.display_time))
  );
}

function optionalNumber(value) {
  const raw = text(value);
  if (!raw) return undefined;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : raw;
}

function mapCatalystClassOogToAirtableFields(row, trainerRecordIds = {}) {
  const fields = {
    mirror_class_oog_key: text(row.class_oog_key),
    show_no: optionalNumber(row.show_no),
    focus_day: dateKey(row.focus_day),
    days: optionalNumber(row.ring_day_no),
    ring_day_no: optionalNumber(row.ring_day_no),
    ring_no: optionalNumber(row.ring_no),
    ring: text(row.ring),
    class_no: optionalNumber(row.class_no),
    class_label: text(row.class_label),
    class_order: optionalNumber(row.class_order),
    entry_order: optionalNumber(row.entry_order),
    entry_no: optionalNumber(row.current_entry_no || row.entry_no),
    horse: text(row.horse),
    rider: text(row.rider),
    trainer: text(row.trainer),
    source: "catalyst.hs_class_oog"
  };
  const trainerId = trainerRecordIds[text(row.trainer)] || trainerRecordIds[normalizeHelperKey(row.trainer)];
  if (trainerId) fields.trainers = [trainerId];
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => {
    if (value === undefined || value === null) return false;
    if (Array.isArray(value)) return value.length > 0;
    return text(value) !== "";
  }));
}

async function reconcileClassOogMirrorFromCatalyst(baseId, token, catalystRows, airtableRows, trainerRecordIds) {
  const airtableKeys = new Set(airtableRows.map((record) => text(record.fields?.mirror_class_oog_key)).filter(Boolean));
  const missingRows = catalystRows.filter((row) => text(row.class_oog_key) && !airtableKeys.has(text(row.class_oog_key)));
  const created = await airtableCreateRecords(
    baseId,
    "class_oog",
    token,
    missingRows.map((row) => mapCatalystClassOogToAirtableFields(row, trainerRecordIds))
  );
  return { missing_rows: missingRows, created };
}

async function main() {
  const args = parseArgs(process.argv);
  const baseId = args["base-id"] || args.base_id || process.env.WEC_AIRTABLE_BASE_ID || DEFAULT_BASE_ID;
  const token = args["airtable-token"] || args.airtable_token || process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error("AIRTABLE_TOKEN required");
  const runId = args["run-id"] || args.run_id || process.env.WEC_RUN_ID || "";
  const runTime = args["run-time"] || args.run_time || process.env.WEC_RUN_TIME || "";
  const syncUrl = args["sync-url"] || args.sync_url || DEFAULT_SYNC_URL;
  const rawRunnerPath = args["class-oog-raw-runner"] || path.join(__dirname, "fetch_class_oog_raw.js");
  const forceRawRefetch = args["force-raw-refetch"] === "1"
    || args.force_raw_refetch === "1"
    || process.env.WEC_FORCE_CLASS_OOG_RAW_REFETCH === "1";
  const focus = await getActiveFocusShow(baseId, token, args["show-no"] || args.show_no || "");
  const activeTrainerData = await getActiveTrainers(baseId, token);
  const stagingSourceView = (args["class-start-times-only"] || args.class_start_times_only) ? "class_start_times" : "class_oog";
  const lockedRows = await getLockedStagingRows(baseId, token, focus.show_no, focus.focus_day, stagingSourceView);
  const sourceStats = await getStagingSourceStats(baseId, token, focus.show_no, focus.focus_day);
  if (args["verify-source-filter-only"] || args.verify_source_filter_only) {
    process.stdout.write(`${JSON.stringify({
      ok: sourceStats.active_canonical_rows === sourceStats.unique_canonical_keys && sourceStats.active_duplicate_groups === 0,
      action: "verify-class-source-filter",
      run_id: runId,
      run_time: runTime,
      show_no: focus.show_no,
      focus_day: focus.focus_day,
      focus_show_record_id: focus.record_id,
      source_control_record: focus.record_id,
      field_based_filter: "show_no + iso_date + inactive!=true + (confirm_lock OR is_lock OR lock) + ring_day_no + ring_no + class_no",
      total_staging_rows: sourceStats.total_staging_rows,
      active_canonical_rows: sourceStats.active_canonical_rows,
      unique_canonical_keys: sourceStats.unique_canonical_keys,
      active_duplicate_groups: sourceStats.active_duplicate_groups,
      protected_stale_rows: sourceStats.protected_stale_rows,
      protected_stale_rows_inactive: sourceStats.protected_stale_rows_inactive,
      class_oog_source_rows: lockedRows.length,
      class_start_times_source_rows: lockedRows.length
    }, null, 2)}\n`);
    return;
  }
  const seenClasses = new Set();
  const targetRows = lockedRows.filter((row) => {
    const key = `${row.show_no}|${row.focus_day}|${row.ring_day_no}|${row.ring_no}|${row.class_no}`;
    if (seenClasses.has(key)) return false;
    seenClasses.add(key);
    return true;
  });
  const classOogRuns = [];
  if (args["class-start-times-only"] || args.class_start_times_only) {
    const classStart = await syncClassStartTimes(syncUrl, focus.show_no, focus.focus_day, lockedRows);
    const catalystClassStartRows = (await exportCatalystRows(syncUrl, focus.show_no, "class_start_times"))
      .filter((row) => dateKey(row.focus_day) === focus.focus_day);
    const classStartAirtableRows = await airtableListAll(baseId, "class_start_times", token, {
      filterByFormula: `AND({show_no}=${Number(focus.show_no)},IS_SAME({focus_day},DATETIME_PARSE(${formulaValue(focus.focus_day)}),'day'))`
    });
    const requiredFieldsPopulated = classStartAirtableRows.every(classStartRequiredFieldsPopulated);
    const summary = {
      ok: catalystClassStartRows.length === classStartAirtableRows.length && requiredFieldsPopulated,
      action: "sync-class-start-times-only",
      run_id: runId,
      run_time: runTime,
      source_view: "update_schedule_staging.class_start_times",
      target_table: "class_start_times",
      show_no: focus.show_no,
      focus_day: focus.focus_day,
      focus_show_record_id: focus.record_id,
      source_control_record: focus.record_id,
      rows_read: lockedRows.length,
      rows_inserted: null,
      rows_updated: null,
      rows_skipped_unchanged: null,
      rows_deleted: Number(classStart.hs_class_start_times_stale_deleted || 0) + Number(classStart.class_start_times_stale_deleted || 0),
      source_count: lockedRows.length,
      target_active_count: classStartAirtableRows.length,
      required_fields_populated: requiredFieldsPopulated,
      hs_class_start_times_count: catalystClassStartRows.length,
      class_start_times_count: classStartAirtableRows.length,
      class_start_times_counts_match: catalystClassStartRows.length === classStartAirtableRows.length,
      class_start_times_stale_deleted: Number(classStart.hs_class_start_times_stale_deleted || 0) + Number(classStart.class_start_times_stale_deleted || 0),
      class_start_times_wec_log_rec_id: classStart.class_start_times_wec_log_rec_id || null,
      class_oog_run: false,
      entry_go_times_run: false,
      mobile_run: false,
      print_run: false,
      alerts_run: false,
      results_run: false,
      focus_day_is_pause_changed: false
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (!summary.ok) throw new Error("class_start_times-only sync did not reconcile source and target");
    return;
  }
  if (args["class-oog-only"] || args.class_oog_only) {
    const rawRows = await getClassOogRawRows(syncUrl, focus.show_no, focus.focus_day);
    const rawByKey = new Map(rawRows.map((row) => [text(row.raw_key), row]).filter(([key]) => key));
    const parsedRawKeys = new Set(targetRows
      .map((row) => rawByKey.get(classOogRawKey(row)))
      .filter(rawRowParsed)
      .map((row) => text(row.raw_key))
      .filter(Boolean));
    const nextFetchRow = targetRows.find((row) => forceRawRefetch || !rawByKey.has(classOogRawKey(row)));
    if (nextFetchRow) {
      const stored = runClassOogRawFetch({
        runnerPath: rawRunnerPath,
        syncUrl,
        showNo: focus.show_no,
        focusDay: focus.focus_day,
        row: nextFetchRow
      });
      const summary = {
        ok: true,
        action: "sync-class-oog-only",
        run_id: runId,
        run_time: runTime,
        bounded_unit: "fetch",
        resumable: true,
        source_view: "update_schedule_staging.class_oog",
        target_table: "class_oog",
        show_no: focus.show_no,
        focus_day: focus.focus_day,
        focus_show_record_id: focus.record_id,
        source_control_record: focus.record_id,
        rows_read: targetRows.length,
        rows_inserted: null,
        rows_updated: null,
        rows_skipped_unchanged: null,
        rows_deleted: null,
        source_count: targetRows.length,
        raw_rows_before: rawRows.length,
        skipped_existing_raw: forceRawRefetch ? 0 : parsedRawKeys.size,
        raw_fetches_attempted: 1,
        raw_parse_runs_attempted: 0,
        raw_rec_id: stored.raw_rec_id,
        raw_key: stored.raw_key,
        ring_day_no: nextFetchRow.ring_day_no,
        ring_no: nextFetchRow.ring_no,
        class_no: nextFetchRow.class_no,
        class_start_times_run: false,
        entry_go_times_run: false,
        mobile_run: false,
        print_run: false,
        focus_day_is_pause_changed: false
      };
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      return;
    }
    const sourceKeys = new Set(targetRows.map(classOogRawKey).filter(Boolean));
    const nextRawRow = rawRows
      .filter((row) => sourceKeys.has(text(row.raw_key)))
      .find((row) => !rawRowParsed(row));
    if (nextRawRow) {
      const parsed = await parseClassOogRaw(syncUrl, focus.show_no, nextRawRow.ROWID, activeTrainerData);
      const summary = {
        ok: true,
        action: "sync-class-oog-only",
        run_id: runId,
        run_time: runTime,
        bounded_unit: "parse",
        resumable: true,
        source_view: "update_schedule_staging.class_oog",
        target_table: "class_oog",
        show_no: focus.show_no,
        focus_day: focus.focus_day,
        focus_show_record_id: focus.record_id,
        source_control_record: focus.record_id,
        rows_read: targetRows.length,
        rows_inserted: null,
        rows_updated: null,
        rows_skipped_unchanged: null,
        rows_deleted: Number(parsed.hs_class_oog_stale_deleted || 0) + Number(parsed.class_oog_stale_deleted || 0),
        source_count: targetRows.length,
        skipped_existing_raw: forceRawRefetch ? 0 : parsedRawKeys.size,
        raw_fetches_attempted: 0,
        raw_parse_runs_attempted: 1,
        raw_rec_id: nextRawRow.ROWID,
        raw_key: nextRawRow.raw_key,
        ring_day_no: nextRawRow.ring_day_no,
        ring_no: nextRawRow.ring_no,
        class_no: nextRawRow.class_no,
        parse_wec_log_rec_id: parsed.parse_wec_log_rec_id,
        total_parsed_rows: Number(parsed.total_parsed_rows || parsed.parsed_rows || 0),
        parsed_rows: Number(parsed.parsed_rows || 0),
        matched_rows_by_trainer: parsed.matched_rows_by_trainer || {},
        hs_class_oog_stale_deleted: Number(parsed.hs_class_oog_stale_deleted || 0),
        class_oog_stale_deleted: Number(parsed.class_oog_stale_deleted || 0),
        class_start_times_run: false,
        entry_go_times_run: false,
        mobile_run: false,
        print_run: false,
        focus_day_is_pause_changed: false
      };
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      return;
    }
    const catalystClassOogRows = (await exportCatalystRows(syncUrl, focus.show_no, "class_oog"))
      .filter((row) => dateKey(row.focus_day) === focus.focus_day);
    const classOogAirtableRows = await airtableListAll(baseId, "class_oog", token, {
      filterByFormula: `AND({show_no}=${Number(focus.show_no)},IS_SAME({focus_day},DATETIME_PARSE(${formulaValue(focus.focus_day)}),'day'))`
    });
    const staging = await syncClassOogStaging(syncUrl, focus.show_no, focus.focus_day);
    const stagingOk = staging.status === "PASS";
    const summary = {
      ok: stagingOk,
      action: "sync-class-oog-only",
      run_id: runId,
      run_time: runTime,
      bounded_unit: "complete",
      resumable: true,
      source_view: "update_schedule_staging.class_oog",
      mirror_table: "class_oog",
      target_table: "class_oog_staging",
      show_no: focus.show_no,
      focus_day: focus.focus_day,
      focus_show_record_id: focus.record_id,
      source_control_record: focus.record_id,
      rows_read: targetRows.length,
      rows_inserted: staging.records_created,
      rows_updated: staging.records_updated,
      rows_skipped_unchanged: null,
      rows_deleted: null,
      source_count: targetRows.length,
      raw_rows: rawRows.length,
      skipped_existing_raw: forceRawRefetch ? 0 : parsedRawKeys.size,
      raw_fetches_attempted: 0,
      raw_parse_runs_attempted: 0,
      target_active_count: staging.target_active_rows,
      keys_match: staging.status === "PASS",
      extra_active_target_rows: staging.entrywise_grain_evidence?.extra_target_rows || [],
      required_fields_populated: staging.status === "PASS",
      hs_class_oog_count: catalystClassOogRows.length,
      class_oog_count: classOogAirtableRows.length,
      class_oog_counts_match: null,
      class_oog_staging_status: staging.status,
      class_oog_staging_blocker: staging.blocker || "",
      class_oog_staging_source_rows: staging.source_rows,
      class_oog_staging_source_candidates: staging.source_candidates,
      class_oog_staging_duplicate_source_rows_ignored: staging.duplicate_source_rows_ignored,
      class_oog_staging_count: staging.target_active_rows,
      class_oog_staging_records_created: staging.records_created,
      class_oog_staging_records_updated: staging.records_updated,
      class_oog_staging_records_unchanged: staging.records_unchanged,
      class_oog_staging_class_oog_link_evidence: staging.class_oog_link_evidence,
      class_oog_staging_update_schedule_staging_link_evidence: staging.update_schedule_staging_link_evidence,
      mirror_count_warning: catalystClassOogRows.length === classOogAirtableRows.length ? "" : `mirror count mismatch ignored for downstream proof: Catalyst=${catalystClassOogRows.length} Airtable=${classOogAirtableRows.length}`,
      missing_airtable_rows_repaired: 0,
      missing_airtable_rows: [],
      class_start_times_run: false,
      entry_go_times_run: false,
      mobile_run: false,
      print_run: false,
      focus_day_is_pause_changed: false
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (!summary.ok) throw new Error(`class_oog_staging handoff failed: ${staging.blocker || "unknown"}`);
    return;
  }
  const rawRows = await getClassOogRawRows(syncUrl, focus.show_no, focus.focus_day);
  const rawByKey = new Map(rawRows.map((row) => [text(row.raw_key), row]).filter(([key]) => key));
  let skippedExistingRaw = 0;
  let rawFetchesAttempted = 0;
  let rawParseRunsAttempted = 0;
  for (const row of targetRows) {
    const rawKey = classOogRawKey(row);
    const existingRaw = rawByKey.get(rawKey);
    if (existingRaw && rawRowParsed(existingRaw) && !forceRawRefetch) {
      skippedExistingRaw += 1;
      classOogRuns.push({
        ring_day_no: row.ring_day_no,
        ring_no: row.ring_no,
        class_no: row.class_no,
        raw_rec_id: existingRaw.ROWID,
        raw_key: existingRaw.raw_key,
        parse_wec_log_rec_id: null,
        total_parsed_rows: 0,
        parsed_rows: 0,
        matched_rows_by_trainer: {},
        hs_class_oog_stale_deleted: 0,
        class_oog_stale_deleted: 0,
        skipped_existing_raw: true
      });
      continue;
    }
    let rawRecId = existingRaw?.ROWID;
    let rawKeyForRun = existingRaw?.raw_key || rawKey;
    if (!existingRaw || forceRawRefetch) {
      rawFetchesAttempted += 1;
      const stored = runClassOogRawFetch({
        runnerPath: rawRunnerPath,
        syncUrl,
        showNo: focus.show_no,
        focusDay: focus.focus_day,
        row
      });
      rawRecId = stored.raw_rec_id;
      rawKeyForRun = stored.raw_key;
    }
    rawParseRunsAttempted += 1;
    const parsed = await parseClassOogRaw(syncUrl, focus.show_no, rawRecId, activeTrainerData);
    classOogRuns.push({
      ring_day_no: row.ring_day_no,
      ring_no: row.ring_no,
      class_no: row.class_no,
      raw_rec_id: rawRecId,
      raw_key: rawKeyForRun,
      parse_wec_log_rec_id: parsed.parse_wec_log_rec_id,
      total_parsed_rows: Number(parsed.total_parsed_rows || parsed.parsed_rows || 0),
      parsed_rows: Number(parsed.parsed_rows || 0),
      matched_rows_by_trainer: parsed.matched_rows_by_trainer || {},
      hs_class_oog_stale_deleted: Number(parsed.hs_class_oog_stale_deleted || 0),
      class_oog_stale_deleted: Number(parsed.class_oog_stale_deleted || 0)
    });
  }
  const matchedRowsByTrainer = Object.fromEntries(activeTrainerData.active_trainers.map((trainer) => [trainer, 0]));
  for (const run of classOogRuns) {
    for (const [trainer, count] of Object.entries(run.matched_rows_by_trainer || {})) {
      matchedRowsByTrainer[trainer] = (matchedRowsByTrainer[trainer] || 0) + Number(count || 0);
    }
  }
  const zeroMatchTrainers = activeTrainerData.active_trainers.filter((trainer) => !Number(matchedRowsByTrainer[trainer] || 0));
  const zeroMatchExplanation = Object.fromEntries(zeroMatchTrainers.map((trainer) => [trainer, "no matching trainer rows were present in the fetched class_oog pages"]));
  const catalystClassOogRows = (await exportCatalystRows(syncUrl, focus.show_no, "class_oog"))
    .filter((row) => dateKey(row.focus_day) === focus.focus_day);
  const classOogAirtableRows = await airtableListAll(baseId, "class_oog", token, {
    filterByFormula: `AND({show_no}=${Number(focus.show_no)},IS_SAME({focus_day},DATETIME_PARSE(${formulaValue(focus.focus_day)}),'day'))`
  });
  const classOogStaging = await syncClassOogStaging(syncUrl, focus.show_no, focus.focus_day);
  const classStart = await syncClassStartTimes(syncUrl, focus.show_no, focus.focus_day, lockedRows);
  const catalystClassStartRows = (await exportCatalystRows(syncUrl, focus.show_no, "class_start_times"))
    .filter((row) => dateKey(row.focus_day) === focus.focus_day);
  const classStartAirtableRows = await airtableListAll(baseId, "class_start_times", token, {
    filterByFormula: `AND({show_no}=${Number(focus.show_no)},IS_SAME({focus_day},DATETIME_PARSE(${formulaValue(focus.focus_day)}),'day'))`
  });
  const summary = {
    ok: true,
    action: "sync-class-oog-and-class-start-times",
    run_id: runId,
    run_time: runTime,
    show_no: focus.show_no,
    focus_day: focus.focus_day,
    focus_show_record_id: focus.record_id,
    source_control_record: focus.record_id,
    focus_day_is_lock_checked: true,
    focus_show_is_pause_checked: true,
    update_schedule_staging_is_lock_checked: true,
    active_trainers: activeTrainerData.active_trainers.length,
    active_trainer_names: activeTrainerData.active_trainers,
    trainer_normalization: "trim|lowercase|collapse_spaces|smart_apostrophe_normalized",
    class_oog_target_classes: targetRows.length,
    rows_read: targetRows.length,
    rows_inserted: null,
    rows_updated: null,
    rows_skipped_unchanged: null,
    rows_deleted: classOogRuns.reduce((sum, row) => sum + row.hs_class_oog_stale_deleted + row.class_oog_stale_deleted, 0)
      + Number(classStart.hs_class_start_times_stale_deleted || 0)
      + Number(classStart.class_start_times_stale_deleted || 0),
    skipped_existing_raw: skippedExistingRaw,
    raw_fetches_attempted: rawFetchesAttempted,
    raw_parse_runs_attempted: rawParseRunsAttempted,
    class_oog_raw_pages_stored: rawFetchesAttempted,
    class_oog_parser_used: "parseClassOogRows",
    total_parsed_oog_rows: classOogRuns.reduce((sum, row) => sum + Number(row.total_parsed_rows || 0), 0),
    matched_oog_rows: classOogRuns.reduce((sum, row) => sum + Number(row.parsed_rows || 0), 0),
    matched_rows_by_trainer: matchedRowsByTrainer,
    zero_match_trainers: zeroMatchTrainers,
    zero_match_trainers_explained: zeroMatchExplanation,
    class_oog_canonical_key: "show_no|focus_day|ring_day_no|ring_no|class_no|entry_no",
    hs_class_oog_count: catalystClassOogRows.length,
    class_oog_count: classOogAirtableRows.length,
    class_oog_counts_match: null,
    class_oog_mirror_count_warning: catalystClassOogRows.length === classOogAirtableRows.length ? "" : `mirror count mismatch ignored for downstream proof: Catalyst=${catalystClassOogRows.length} Airtable=${classOogAirtableRows.length}`,
    class_oog_staging_status: classOogStaging.status,
    class_oog_staging_blocker: classOogStaging.blocker || "",
    class_oog_staging_source_rows: classOogStaging.source_rows,
    class_oog_staging_source_candidates: classOogStaging.source_candidates,
    class_oog_staging_duplicate_source_rows_ignored: classOogStaging.duplicate_source_rows_ignored,
    class_oog_staging_count: classOogStaging.target_active_rows,
    class_oog_stale_deleted: classOogRuns.reduce((sum, row) => sum + row.hs_class_oog_stale_deleted + row.class_oog_stale_deleted, 0),
    class_start_times_source: "locked update_schedule_staging",
    class_start_times_target_classes: lockedRows.length,
    hs_class_start_times_count: catalystClassStartRows.length,
    class_start_times_count: classStartAirtableRows.length,
    class_start_times_counts_match: catalystClassStartRows.length === classStartAirtableRows.length,
    class_start_times_stale_deleted: Number(classStart.hs_class_start_times_stale_deleted || 0) + Number(classStart.class_start_times_stale_deleted || 0),
    class_oog_parse_wec_log_rec_ids: classOogRuns.map((row) => row.parse_wec_log_rec_id).filter(Boolean),
    class_start_times_wec_log_rec_id: classStart.class_start_times_wec_log_rec_id || null,
    target_class_keys: targetRows.map((row) => `${row.ring_day_no}|${row.ring_no}|${row.class_no}`)
  };
  if (classOogStaging.status !== "PASS") throw new Error(`class_oog_staging handoff failed: ${classOogStaging.blocker || "unknown"}`);
  if (!summary.class_start_times_counts_match) throw new Error(`class_start_times counts mismatch Catalyst=${summary.hs_class_start_times_count} Airtable=${summary.class_start_times_count}`);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

