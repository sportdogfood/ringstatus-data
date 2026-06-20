#!/usr/bin/env node

const DEFAULT_BASE_ID = "app6XS1RvsPNRT6os";

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

function buildEntryFields({ classOog, classStart, focus, allowedFields }) {
  const fields = {};
  const parts = classOogKeyParts(classOog);
  const ringDayNo = text(getField(classOog, "days") || getField(classOog, "ring_day_no") || parts.ring_day_no);
  const ringNo = text(getField(classOog, "ring_no") || parts.ring_no);
  const classNo = text(getField(classOog, "class_no") || parts.class_no);
  const entryNo = text(getField(classOog, "entry_no") || parts.entry_no);
  const key = canonicalEntryGoKey(classOog, focus);
  includeField(fields, allowedFields, "entry_go_key", key);
  includeField(fields, allowedFields, "entry_go_key_mirror", key);
  includeField(fields, allowedFields, "show_no", Number(focus.show_no));
  includeField(fields, allowedFields, "focus_day", focus.focus_day);
  includeField(fields, allowedFields, "ring_day_no", Number(ringDayNo));
  includeField(fields, allowedFields, "ring_no", Number(ringNo));
  includeField(fields, allowedFields, "class_no", Number(classNo));
  includeField(fields, allowedFields, "entry_no", Number(entryNo));
  includeField(fields, allowedFields, "entry_order", Number(getField(classOog, "entry_order")));
  includeField(fields, allowedFields, "horse", text(getField(classOog, "horse")));
  includeField(fields, allowedFields, "rider", text(getField(classOog, "rider")));
  includeField(fields, allowedFields, "trainer", text(getField(classOog, "trainer")));
  includeField(fields, allowedFields, "class_name", text(getField(classOog, "class_name") || getField(classOog, "class_label")));
  includeField(fields, allowedFields, "class_number", Number(getField(classOog, "class_number")));
  includeField(fields, allowedFields, "class_start_time", text(getField(classStart, "class_start_time")));
  includeField(fields, allowedFields, "display_time", text(getField(classStart, "display_time")));
  includeField(fields, allowedFields, "entry_count", Number(getField(classStart, "entry_count")));
  includeField(fields, allowedFields, "n_gone", Number(getField(classStart, "n_gone")));
  includeField(fields, allowedFields, "elapsed_seconds", Number(getField(classStart, "elapsed_seconds")));
  includeField(fields, allowedFields, "pace_seconds", Number(getField(classStart, "pace_seconds")));
  includeField(fields, allowedFields, "entry_go_time", text(getField(classStart, "display_time") || getField(classStart, "class_start_time")));
  includeField(fields, allowedFields, "source", "class_oog");
  includeField(fields, allowedFields, "status", "active");
  includeField(fields, allowedFields, "last_synced_at", new Date().toISOString());
  includeField(fields, allowedFields, "shows", firstLinked(classOog, "shows") ? [firstLinked(classOog, "shows")] : []);
  includeField(fields, allowedFields, "focus_show", firstLinked(classOog, "focus_show") ? [firstLinked(classOog, "focus_show")] : [focus.record.id]);
  includeField(fields, allowedFields, "ring_days", firstLinked(classOog, "ring_days") ? [firstLinked(classOog, "ring_days")] : []);
  includeField(fields, allowedFields, "rings", firstLinked(classOog, "rings") ? [firstLinked(classOog, "rings")] : []);
  includeField(fields, allowedFields, "classes", firstLinked(classOog, "classes") ? [firstLinked(classOog, "classes")] : []);
  includeField(fields, allowedFields, "entries", firstLinked(classOog, "entries") ? [firstLinked(classOog, "entries")] : []);
  includeField(fields, allowedFields, "horses", firstLinked(classOog, "horses") ? [firstLinked(classOog, "horses")] : []);
  includeField(fields, allowedFields, "riders", firstLinked(classOog, "riders") ? [firstLinked(classOog, "riders")] : []);
  includeField(fields, allowedFields, "trainers", firstLinked(classOog, "trainers") ? [firstLinked(classOog, "trainers")] : []);
  includeField(fields, allowedFields, "class_oog", [classOog.id]);
  if (classStart?.id) includeField(fields, allowedFields, "class_start_times", [classStart.id]);
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

  const focus = await getActiveFocusShow(baseId, token, args["show-no"] || args.show_no || "");
  const meta = await airtableMeta(baseId, token);
  const entryFields = meta.get("entry_go_times");
  if (!entryFields) throw new Error("entry_go_times table not found");

  const trainerRows = await airtableList(baseId, token, "trainers", {
    filterByFormula: "{active}=TRUE()"
  });
  const activeTrainers = trainerRows.map((row) => text(getField(row, "trainer"))).filter(Boolean);
  const activeTrainerSet = new Set(activeTrainers.map(normalizeName));
  const formula = scopedFormula(focus.show_no, focus.focus_day);
  const classOogRowsAll = await airtableList(baseId, token, "class_oog", { filterByFormula: formula });
  const classOogRows = classOogRowsAll.filter((row) => activeTrainerSet.has(normalizeName(getField(row, "trainer"))));
  const classStartRows = await airtableList(baseId, token, "class_start_times", { filterByFormula: formula });
  const entryBeforeRows = await airtableList(baseId, token, "entry_go_times", { filterByFormula: formula });
  const classStartByKey = rowByClassStartKey(classStartRows);
  const currentClassOogKeys = new Set(classOogRows.map((row) => canonicalEntryGoKey(row, focus)).filter(Boolean));
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
  for (const classOog of classOogRows) {
    const canonicalKey = canonicalEntryGoKey(classOog, focus);
    if (!canonicalKey) {
      missingDetail.push({ class_oog_record_id: classOog.id, reason: "missing canonical key fields" });
      continue;
    }
    const ringClassKey = [
      text(getField(classOog, "days") || getField(classOog, "ring_day_no") || classOogKeyParts(classOog).ring_day_no),
      text(getField(classOog, "ring_no") || classOogKeyParts(classOog).ring_no),
      text(getField(classOog, "class_no") || classOogKeyParts(classOog).class_no)
    ].join("|");
    const classStart = classStartByKey.get(ringClassKey);
    const legacyKeys = legacyEntryGoKeys(classOog, focus);
    const existing = existingByKey.get(canonicalKey)
      || legacyKeys.map((key) => existingByKey.get(key)).find(Boolean)
      || existingByLogical.get(canonicalKey);
    const fields = buildEntryFields({ classOog, classStart, focus, allowedFields: entryFields });
    if (!fields.entry_go_key) {
      missingDetail.push({ class_oog_record_id: classOog.id, reason: "entry_go_key could not be built" });
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
    .filter((item) => item.key && !currentClassOogKeys.has(item.key));
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
  const byTrainerOog = trainerCounts(classOogRows);
  const missingAfter = classOogRows
    .map((row) => canonicalEntryGoKey(row, focus))
    .filter((key) => key && !entryAfterRows.some((entry) => text(getField(entry, "entry_go_key")) === key));

  const summary = {
    ok: missingAfter.length === 0 && entryAfterRows.length === classOogRows.length,
    active_show_no: focus.show_no,
    active_focus_day: focus.focus_day,
    active_trainers: activeTrainers,
    class_oog_count_before: classOogRows.length,
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
    class_oog_count_after: classOogRows.length,
    entry_go_times_count_after: entryAfterRows.length,
    counts_match: entryAfterRows.length === classOogRows.length,
    matched_rows_by_trainer_class_oog: byTrainerOog,
    matched_rows_by_trainer_entry_go_times: byTrainerAfter,
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
