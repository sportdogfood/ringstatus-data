#!/usr/bin/env node

const DEFAULT_BASE_ID = "app6XS1RvsPNRT6os";
const FALLBACK_PACE_SECONDS = 180;

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function dateKey(value) {
  const clean = text(value);
  if (!clean) return "";
  const match = clean.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(clean);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function normalizeName(value) {
  return text(value)
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function truthy(value) {
  if (value === true || value === 1) return true;
  const clean = text(value).toLowerCase();
  return clean === "1" || clean === "true" || clean === "yes" || clean === "checked";
}

function formulaValue(value) {
  return `'${String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const eq = item.indexOf("=");
    if (eq !== -1) {
      args[item.slice(2, eq)] = item.slice(eq + 1);
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = "1";
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

async function airtableFetch(baseId, token, tableName, options = {}) {
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}`);
  for (const [key, value] of Object.entries(options.params || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Airtable ${tableName} failed ${response.status}: ${body.slice(0, 1000)}`);
  }
  return body ? JSON.parse(body) : {};
}

async function airtableList(baseId, token, tableName, params = {}) {
  const rows = [];
  let offset = "";
  do {
    const payload = await airtableFetch(baseId, token, tableName, {
      params: { ...params, offset, pageSize: params.pageSize || 100 }
    });
    rows.push(...(payload.records || []));
    offset = payload.offset || "";
  } while (offset);
  return rows;
}

async function airtableMeta(baseId, token) {
  const response = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Airtable meta failed ${response.status}: ${body.slice(0, 1000)}`);
  const payload = JSON.parse(body);
  return new Map((payload.tables || []).map((table) => [
    table.name,
    new Set((table.fields || []).map((field) => field.name))
  ]));
}

async function airtablePatch(baseId, token, tableName, records) {
  let updated = 0;
  for (let index = 0; index < records.length; index += 10) {
    const batch = records.slice(index, index + 10);
    if (!batch.length) continue;
    await airtableFetch(baseId, token, tableName, {
      method: "PATCH",
      body: { records: batch, typecast: true }
    });
    updated += batch.length;
  }
  return updated;
}

async function airtableCreate(baseId, token, tableName, records) {
  let created = 0;
  for (let index = 0; index < records.length; index += 10) {
    const batch = records.slice(index, index + 10);
    if (!batch.length) continue;
    await airtableFetch(baseId, token, tableName, {
      method: "POST",
      body: { records: batch, typecast: true }
    });
    created += batch.length;
  }
  return created;
}

async function airtableDelete(baseId, token, tableName, recordIds) {
  let deleted = 0;
  for (let index = 0; index < recordIds.length; index += 10) {
    const batch = recordIds.slice(index, index + 10);
    if (!batch.length) continue;
    const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}`);
    for (const id of batch) url.searchParams.append("records[]", id);
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`Airtable ${tableName} delete failed ${response.status}: ${body.slice(0, 1000)}`);
    }
    deleted += batch.length;
  }
  return deleted;
}

function getField(record, fieldName) {
  return record?.fields?.[fieldName];
}

function linkedRecordIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item : item?.id)).filter(Boolean);
}

function linked(record, fieldName) {
  return linkedRecordIds(getField(record, fieldName));
}

function firstLinked(record, fieldName) {
  return linked(record, fieldName)[0] || "";
}

function classOogKeyParts(row) {
  const mirrorKey = text(getField(row, "mirror_class_oog_key") || getField(row, "class_oog_key"));
  const parts = mirrorKey.split("|").map(text);
  return {
    show_no: parts.length >= 6 ? parts[0] : "",
    focus_day: parts.length >= 6 ? parts[1] : "",
    ring_day_no: parts.length >= 6 ? parts[2] : "",
    ring_no: parts.length >= 6 ? parts[3] : "",
    class_no: parts.length >= 6 ? parts[4] : "",
    entry_no: parts.length >= 6 ? parts[5] : ""
  };
}

function scopedFormula(showNo, focusDay) {
  return `AND({show_no}=${Number(showNo)},IS_SAME({focus_day},DATETIME_PARSE(${formulaValue(focusDay)}),'day'))`;
}

async function getActiveFocusShow(baseId, token, requestedShowNo = "") {
  const rows = await airtableList(baseId, token, "focus_show");
  const activeRows = rows.filter((row) => truthy(getField(row, "active")));
  const candidates = requestedShowNo
    ? activeRows.filter((row) => text(getField(row, "show_no")) === text(requestedShowNo))
    : activeRows;
  if (candidates.length !== 1) {
    throw new Error(`focus_show active scope must resolve to one record; found ${candidates.length}`);
  }
  const record = candidates[0];
  const showNo = text(getField(record, "show_no"));
  const focusDay = dateKey(getField(record, "focus_day"));
  if (!showNo || !focusDay) throw new Error(`active focus_show missing show_no/focus_day: ${record.id}`);
  return { record, show_no: showNo, focus_day: focusDay };
}

function canonicalEntryGoKey(row, focus) {
  const parts = classOogKeyParts(row);
  const ringDayNo = text(getField(row, "days") || getField(row, "ring_day_no") || parts.ring_day_no);
  const ringNo = text(getField(row, "ring_no") || parts.ring_no);
  const classNo = text(getField(row, "class_no") || parts.class_no);
  const entryNo = text(getField(row, "entry_no") || parts.entry_no);
  if (!focus.show_no || !focus.focus_day || !ringDayNo || !ringNo || !classNo || !entryNo) return "";
  return `${focus.show_no}|${focus.focus_day}|${ringDayNo}|${ringNo}|${classNo}|${entryNo}`;
}

function legacyEntryGoKeys(row, focus) {
  const parts = classOogKeyParts(row);
  const ringDayNo = text(getField(row, "days") || getField(row, "ring_day_no") || parts.ring_day_no);
  const classNo = text(getField(row, "class_no") || parts.class_no);
  const entryNo = text(getField(row, "entry_no") || parts.entry_no);
  const entryOrder = text(getField(row, "entry_order"));
  const horse = text(getField(row, "horse")).toLowerCase();
  return [
    `${focus.show_no}|${focus.focus_day}|${ringDayNo}|${classNo}|${entryNo}`,
    `${focus.show_no}|${focus.focus_day}|${ringDayNo}|${classNo}|${entryOrder}|${horse}`
  ].filter((key) => !key.includes("||") && !key.endsWith("|"));
}

function classEntryLogicalKey(record, focus) {
  return [
    focus.show_no,
    focus.focus_day,
    text(getField(record, "ring_day_no") || getField(record, "days")),
    text(getField(record, "ring_no")),
    text(getField(record, "class_no")),
    text(getField(record, "entry_no"))
  ].join("|");
}

function protectedEntryGoRow(record) {
  const protectedFields = [
    "manual_lock",
    "manual_override",
    "confirm_lock",
    "is_lock",
    "lock",
    "protected",
    "is_protected"
  ];
  return protectedFields.some((field) => truthy(getField(record, field)));
}

function rowByClassStartKey(classStartRows) {
  const byKey = new Map();
  for (const row of classStartRows) {
    const key = [
      text(getField(row, "ring_day_no")),
      text(getField(row, "ring_no")),
      text(getField(row, "class_no"))
    ].join("|");
    if (!byKey.has(key)) byKey.set(key, row);
  }
  return byKey;
}

function includeField(fields, allowedFields, key, value) {
  if (!allowedFields.has(key)) return;
  if (value === undefined || value === null) return;
  if (typeof value === "number" && !Number.isFinite(value)) return;
  if (typeof value === "string" && !value) return;
  if (Array.isArray(value) && !value.length) return;
  fields[key] = value;
}

function buildEntryFields({ sourceRow, focus, allowedFields }) {
  const fields = {};
  const parts = classOogKeyParts(sourceRow);
  const ringDayNo = text(getField(sourceRow, "days") || getField(sourceRow, "ring_day_no") || parts.ring_day_no);
  const ringNo = text(getField(sourceRow, "ring_no") || parts.ring_no);
  const classNo = text(getField(sourceRow, "class_no") || parts.class_no);
  const entryNo = text(getField(sourceRow, "entry_no") || parts.entry_no);
  const key = canonicalEntryGoKey(sourceRow, focus);
  const classStartTime = text(getField(sourceRow, "class_start_time") || getField(sourceRow, "class_start_time (from class_start_times)"));
  const displayTime = text(getField(sourceRow, "display_time") || getField(sourceRow, "display_time (from class_start_times)"));
  const sourcePaceSeconds = Number(getField(sourceRow, "pace_seconds"));
  includeField(fields, allowedFields, "entry_go_key", key);
  includeField(fields, allowedFields, "entry_go_key_mirror", key);
  includeField(fields, allowedFields, "show_no", Number(focus.show_no));
  includeField(fields, allowedFields, "focus_day", focus.focus_day);
  includeField(fields, allowedFields, "ring_day_no", Number(ringDayNo));
  includeField(fields, allowedFields, "ring_no", Number(ringNo));
  includeField(fields, allowedFields, "class_no", Number(classNo));
  includeField(fields, allowedFields, "entry_no", Number(entryNo));
  includeField(fields, allowedFields, "entry_order", Number(getField(sourceRow, "entry_order")));
  includeField(fields, allowedFields, "horse", text(getField(sourceRow, "horse")));
  includeField(fields, allowedFields, "rider", text(getField(sourceRow, "rider")));
  includeField(fields, allowedFields, "trainer", text(getField(sourceRow, "trainer")));
  includeField(fields, allowedFields, "class_name", text(getField(sourceRow, "class_name") || getField(sourceRow, "class_label")));
  includeField(fields, allowedFields, "class_number", Number(getField(sourceRow, "class_number")));
  includeField(fields, allowedFields, "class_start_time", classStartTime);
  includeField(fields, allowedFields, "display_time", displayTime);
  includeField(fields, allowedFields, "entry_count", Number(getField(sourceRow, "entry_count")));
  includeField(fields, allowedFields, "n_gone", Number(getField(sourceRow, "n_gone")));
  includeField(fields, allowedFields, "elapsed_seconds", Number(getField(sourceRow, "elapsed_seconds")));
  includeField(fields, allowedFields, "pace_seconds", sourcePaceSeconds || FALLBACK_PACE_SECONDS);
  includeField(fields, allowedFields, "entry_go_time", text(displayTime || classStartTime));
  includeField(fields, allowedFields, "source", sourcePaceSeconds
    ? "class_oog_staging.entry_go_times.estimate"
    : "class_oog_staging.entry_go_times.estimate_fallback_180");
  includeField(fields, allowedFields, "status", "active");
  includeField(fields, allowedFields, "last_synced_at", new Date().toISOString());
  includeField(fields, allowedFields, "shows", firstLinked(sourceRow, "shows") ? [firstLinked(sourceRow, "shows")] : []);
  includeField(fields, allowedFields, "focus_show", firstLinked(sourceRow, "focus_show") ? [firstLinked(sourceRow, "focus_show")] : [focus.record.id]);
  includeField(fields, allowedFields, "ring_days", firstLinked(sourceRow, "ring_days") ? [firstLinked(sourceRow, "ring_days")] : []);
  includeField(fields, allowedFields, "rings", firstLinked(sourceRow, "rings") ? [firstLinked(sourceRow, "rings")] : []);
  includeField(fields, allowedFields, "classes", firstLinked(sourceRow, "classes") ? [firstLinked(sourceRow, "classes")] : []);
  includeField(fields, allowedFields, "entries", firstLinked(sourceRow, "entries") ? [firstLinked(sourceRow, "entries")] : []);
  includeField(fields, allowedFields, "horses", firstLinked(sourceRow, "horses") ? [firstLinked(sourceRow, "horses")] : []);
  includeField(fields, allowedFields, "riders", firstLinked(sourceRow, "riders") ? [firstLinked(sourceRow, "riders")] : []);
  includeField(fields, allowedFields, "trainers", firstLinked(sourceRow, "trainers") ? [firstLinked(sourceRow, "trainers")] : []);
  if (firstLinked(sourceRow, "class_oog")) includeField(fields, allowedFields, "class_oog", [firstLinked(sourceRow, "class_oog")]);
  if (firstLinked(sourceRow, "class_start_times")) includeField(fields, allowedFields, "class_start_times", [firstLinked(sourceRow, "class_start_times")]);
  return fields;
}

function trainerCounts(rows) {
  const counts = {};
  for (const row of rows) {
    const trainer = text(getField(row, "trainer"));
    if (!trainer) continue;
    counts[trainer] = (counts[trainer] || 0) + 1;
  }
  return counts;
}

async function main() {
  const args = parseArgs(process.argv);
  const baseId = args["base-id"] || args.base_id || process.env.WEC_AIRTABLE_BASE_ID || DEFAULT_BASE_ID;
  const token = args["airtable-token"] || args.airtable_token || process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error("AIRTABLE_TOKEN required");
  const runId = args["run-id"] || args.run_id || process.env.WEC_RUN_ID || "";
  const runTime = args["run-time"] || args.run_time || process.env.WEC_RUN_TIME || "";

  const focus = await getActiveFocusShow(baseId, token, args["show-no"] || args.show_no || "");
  const meta = await airtableMeta(baseId, token);
  const entryFields = meta.get("entry_go_times");
  if (!entryFields) throw new Error("entry_go_times table not found");

  const formula = scopedFormula(focus.show_no, focus.focus_day);
  const sourceRows = await airtableList(baseId, token, "class_oog_staging", {
    view: "entry_go_times",
    filterByFormula: `AND({show_no}=${Number(focus.show_no)},IS_SAME({focus_day},DATETIME_PARSE(${formulaValue(focus.focus_day)}),'day'),NOT({inactive}=1))`
  });
  const entryBeforeRows = await airtableList(baseId, token, "entry_go_times", { filterByFormula: formula });
  const currentSourceKeys = new Set(sourceRows.map((row) => canonicalEntryGoKey(row, focus)).filter(Boolean));
  const existingByKey = new Map();
  const existingByLogical = new Map();
  for (const row of entryBeforeRows) {
    const key = text(getField(row, "entry_go_key"));
    if (key && !existingByKey.has(key)) existingByKey.set(key, row);
    const logical = classEntryLogicalKey(row, focus);
    if (logical && !existingByLogical.has(logical)) existingByLogical.set(logical, row);
  }

  const missingDetail = [];
  const creates = [];
  const updates = [];
  for (const sourceRow of sourceRows) {
    const canonicalKey = canonicalEntryGoKey(sourceRow, focus);
    if (!canonicalKey) {
      missingDetail.push({ class_oog_staging_record_id: sourceRow.id, reason: "missing canonical key fields" });
      continue;
    }
    const legacyKeys = legacyEntryGoKeys(sourceRow, focus);
    const existing = existingByKey.get(canonicalKey)
      || legacyKeys.map((key) => existingByKey.get(key)).find(Boolean)
      || existingByLogical.get(canonicalKey);
    const fields = buildEntryFields({ sourceRow, focus, allowedFields: entryFields });
    if (!fields.entry_go_key) {
      missingDetail.push({ class_oog_staging_record_id: sourceRow.id, reason: "entry_go_key could not be built" });
      continue;
    }
    if (existing) updates.push({ id: existing.id, fields });
    else creates.push({ fields });
  }

  if (missingDetail.length) {
    throw new Error(`entry_go_times blocked: ${JSON.stringify(missingDetail.slice(0, 20))}`);
  }

  const updated = await airtablePatch(baseId, token, "entry_go_times", updates);
  const created = await airtableCreate(baseId, token, "entry_go_times", creates);
  const entryAfterUpsertRows = await airtableList(baseId, token, "entry_go_times", { filterByFormula: formula });
  const staleEntryRows = entryAfterUpsertRows
    .map((row) => ({
      row,
      key: text(getField(row, "entry_go_key")) || classEntryLogicalKey(row, focus),
      trainer: text(getField(row, "trainer")),
      horse: text(getField(row, "horse")),
      class_no: text(getField(row, "class_no")),
      entry_no: text(getField(row, "entry_no"))
    }))
    .filter((item) => item.key && !currentSourceKeys.has(item.key));
  const protectedStaleRows = staleEntryRows.filter((item) => protectedEntryGoRow(item.row));
  if (protectedStaleRows.length) {
    throw new Error(`entry_go_times stale cleanup blocked by protected/manual rows: ${JSON.stringify(protectedStaleRows.slice(0, 20).map((item) => ({
      record_id: item.row.id,
      entry_go_key: item.key,
      trainer: item.trainer,
      horse: item.horse,
      class_no: item.class_no,
      entry_no: item.entry_no
    })))}`);
  }
  const deleted = await airtableDelete(baseId, token, "entry_go_times", staleEntryRows.map((item) => item.row.id));
  const entryAfterRows = await airtableList(baseId, token, "entry_go_times", { filterByFormula: formula });
  const byTrainerAfter = trainerCounts(entryAfterRows);
  const byTrainerSource = trainerCounts(sourceRows);
  const entryAfterKeys = new Set(entryAfterRows.map((entry) => text(getField(entry, "entry_go_key"))).filter(Boolean));
  const missingAfter = sourceRows
    .map((row) => canonicalEntryGoKey(row, focus))
    .filter((key) => key && !entryAfterKeys.has(key));

  const summary = {
    ok: missingAfter.length === 0 && entryAfterRows.length === sourceRows.length && entryAfterRows.length === entryAfterKeys.size,
    source: "class_oog_staging.entry_go_times",
    run_id: runId,
    run_time: runTime,
    active_show_no: focus.show_no,
    active_focus_day: focus.focus_day,
    focus_show_record_id: focus.record.id,
    source_control_record: focus.record.id,
    rows_read: sourceRows.length,
    rows_inserted: created,
    rows_updated: updated,
    rows_skipped_unchanged: null,
    rows_deleted: deleted,
    source_rows: sourceRows.length,
    class_oog_staging_count_before: sourceRows.length,
    class_oog_count_before: sourceRows.length,
    entry_go_times_count_before: entryBeforeRows.length,
    missing_entry_go_times_rows: missingAfter.length,
    missing_detail: missingAfter,
    stale_entry_go_times_rows_found: staleEntryRows.length,
    stale_entry_go_times_detail: staleEntryRows.map((item) => ({
      record_id: item.row.id,
      entry_go_key: item.key,
      trainer: item.trainer,
      horse: item.horse,
      class_no: item.class_no,
      entry_no: item.entry_no
    })),
    stale_rows_marked_inactive: 0,
    stale_rows_deleted: deleted,
    entry_go_times_rows_created: created,
    entry_go_times_rows_updated: updated,
    class_oog_staging_count_after: sourceRows.length,
    class_oog_count_after: sourceRows.length,
    entry_go_times_count_after: entryAfterRows.length,
    counts_match: entryAfterRows.length === sourceRows.length,
    matched_rows_by_trainer_class_oog_staging: byTrainerSource,
    matched_rows_by_trainer_class_oog: byTrainerSource,
    matched_rows_by_trainer_entry_go_times: byTrainerAfter,
    duplicate_entry_go_keys: entryAfterRows.length - entryAfterKeys.size,
    skip_reasons: missingDetail,
    records_deleted: deleted,
    links_cleared: 0
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!summary.ok) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
