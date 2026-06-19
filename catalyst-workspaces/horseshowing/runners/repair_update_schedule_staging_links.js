#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_BASE_ID = "app6XS1RvsPNRT6os";
const LOG_DIR = path.join(__dirname, "logs");
const RUN_LOG_PATH = path.join(LOG_DIR, "repair_update_schedule_staging_links.log");
const LAST_SUCCESS_PATH = path.join(LOG_DIR, "repair_update_schedule_staging_links.last_success.json");
const TARGET_TABLES = [
  "update_schedule_staging",
  "class_oog",
  "class_start_times",
  "entry_go_times",
  "get_rings",
  "get_orders"
];

const REQUIRED_FIELD_CHECKS = {
  class_oog: ["class_order"],
  get_rings: ["n_standings"],
  class_start_times: ["n_gone", "n_to_go", "pace_seconds", "current_entry_no", "current_horse"]
};

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

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function truthy(value) {
  if (value === true || value === 1) return true;
  const clean = text(value).toLowerCase();
  return clean === "1" || clean === "true" || clean === "yes" || clean === "checked";
}

function dateKey(value) {
  const clean = text(value);
  if (!clean) return "";
  const match = clean.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(clean);
  if (Number.isNaN(parsed.getTime())) return clean;
  return parsed.toISOString().slice(0, 10);
}

function yyyymmdd(value) {
  return dateKey(value).replace(/-/g, "");
}

function normalizeKey(value) {
  return text(value)
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeLoose(value) {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, "");
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
    if (!next || next.startsWith("--")) {
      args[key] = "1";
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function airtableUrl(baseId, tableName) {
  return `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
}

async function airtableFetch(baseId, token, tableName, options = {}) {
  const url = new URL(airtableUrl(baseId, tableName));
  if (options.offset) url.searchParams.set("offset", options.offset);
  if (options.pageSize) url.searchParams.set("pageSize", String(options.pageSize));
  if (options.filterByFormula) url.searchParams.set("filterByFormula", options.filterByFormula);
  if (options.maxRecords) url.searchParams.set("maxRecords", String(options.maxRecords));
  const response = await fetch(url.toString(), {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = await response.text();
  if (!response.ok) {
    const error = new Error(`Airtable ${tableName} failed ${response.status}: ${body.slice(0, 1000)}`);
    error.status = response.status;
    throw error;
  }
  return body ? JSON.parse(body) : {};
}

async function airtableList(baseId, token, tableName, options = {}) {
  const rows = [];
  let offset = "";
  do {
    const payload = await airtableFetch(baseId, token, tableName, { ...options, offset, pageSize: options.pageSize || 100 });
    rows.push(...(payload.records || []));
    offset = payload.offset || "";
  } while (offset);
  return rows;
}

async function airtableUpdate(baseId, token, tableName, updates) {
  for (let index = 0; index < updates.length; index += 10) {
    const records = updates.slice(index, index + 10);
    await airtableFetch(baseId, token, tableName, {
      method: "PATCH",
      body: { records, typecast: true }
    });
  }
}

async function airtableMeta(baseId, token) {
  const response = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const byName = new Map();
  for (const table of payload.tables || []) {
    byName.set(table.name, {
      id: table.id,
      fields: new Set((table.fields || []).map((field) => field.name))
    });
  }
  return byName;
}

function getField(row, fieldName) {
  return row?.fields?.[fieldName];
}

function hasField(row, fieldName) {
  return Object.prototype.hasOwnProperty.call(row?.fields || {}, fieldName);
}

function linkedRecordIds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      return item?.id || "";
    })
    .filter(Boolean);
}

function linkedFieldBlank(row, fieldName) {
  const value = getField(row, fieldName);
  if (Array.isArray(value)) return linkedRecordIds(value).length === 0;
  return value === undefined || value === null || text(value) === "";
}

async function getActiveFocusShow(baseId, token, explicitShowNo = "") {
  const focusRows = await airtableList(baseId, token, "focus_show");
  const activeRows = focusRows.filter((row) => truthy(getField(row, "active")));
  const candidates = explicitShowNo
    ? activeRows.filter((row) => text(getField(row, "show_no")) === text(explicitShowNo))
    : activeRows;
  if (candidates.length !== 1) {
    throw new Error(`focus_show active scope must resolve to one record; found ${candidates.length}`);
  }
  const row = candidates[0];
  const showNo = text(getField(row, "show_no"));
  const focusDay = dateKey(getField(row, "focus_day"));
  if (!showNo || !focusDay) {
    throw new Error(`focus_show active record is missing show_no or focus_day: ${row.id}`);
  }
  return { record: row, show_no: showNo, focus_day: focusDay };
}

function rowDate(row) {
  for (const field of ["focus_day", "iso_date", "ISO", "date", "show_day_date", "day_label"]) {
    const value = getField(row, field);
    if (text(value)) return dateKey(value);
  }
  const showDay = text(getField(row, "show_day"));
  if (showDay) {
    const direct = dateKey(showDay);
    if (direct) return direct;
    const compact = showDay.match(/(20\d{6})/);
    if (compact) return `${compact[1].slice(0, 4)}-${compact[1].slice(4, 6)}-${compact[1].slice(6, 8)}`;
  }
  return "";
}

function scopedToFocus(row, focus) {
  const showNo = text(getField(row, "show_no"));
  if (showNo && showNo !== focus.show_no) return false;
  const day = rowDate(row);
  if (day && day !== focus.focus_day) return false;
  return true;
}

function targetRowEligible(tableName, row, focus) {
  if (!scopedToFocus(row, focus)) return false;
  if (tableName === "update_schedule_staging") {
    return ["is_lock", "is_locked", "lock", "confirm_lock"].some((field) => truthy(getField(row, field)));
  }
  return true;
}

function fieldExists(meta, rows, tableName, fieldName) {
  if (!fieldName) return false;
  const tableMeta = meta?.get(tableName);
  if (tableMeta?.fields?.has(fieldName)) return true;
  return rows.some((row) => hasField(row, fieldName));
}

function variantsForValue(value, focus) {
  const values = new Set();
  const raw = text(value);
  if (raw) values.add(raw);
  const day = dateKey(raw);
  if (day) {
    values.add(day);
    values.add(yyyymmdd(day));
    values.add(`${focus.show_no}|${day}`);
    values.add(`${focus.show_no}|${yyyymmdd(day)}`);
  }
  return Array.from(values).filter(Boolean);
}

function targetSourceValues(row, mapping, focus) {
  const sourceField = text(getField(mapping, "source_value_field"));
  if (sourceField === "show_no+focus_day") return [`${focus.show_no}|${focus.focus_day}`, `${focus.show_no}|${yyyymmdd(focus.focus_day)}`];
  if (sourceField === "focus_day") return variantsForValue(focus.focus_day, focus);
  if (sourceField === "show_day") return [`${focus.show_no}|${focus.focus_day}`, `${focus.show_no}|${yyyymmdd(focus.focus_day)}`, focus.focus_day, yyyymmdd(focus.focus_day)];
  const direct = getField(row, sourceField);
  if (text(direct)) return variantsForValue(direct, focus);
  if (["iso_date", "ISO", "date", "day_label"].includes(sourceField)) return variantsForValue(focus.focus_day, focus);
  return [];
}

function helperKeyValues(row, mapping, focus) {
  const helperField = text(getField(mapping, "helper_key_field"));
  if (helperField === "show_no+focus_day") {
    return [`${text(getField(row, "show_no"))}|${rowDate(row)}`];
  }
  if (helperField === "focus_day") return variantsForValue(rowDate(row) || getField(row, helperField), focus);
  if (helperField === "show_day") {
    const value = getField(row, helperField);
    return variantsForValue(value, focus);
  }
  return variantsForValue(getField(row, helperField), focus);
}

function helperRecordId(row, mapping) {
  const recordIdField = text(getField(mapping, "helper_record_id_field")) || "rec_id";
  const value = text(getField(row, recordIdField));
  return value.startsWith("rec") ? value : row.id;
}

function helperScopeMatches(row, focus) {
  if (hasField(row, "show_no") && text(getField(row, "show_no")) && text(getField(row, "show_no")) !== focus.show_no) {
    return false;
  }
  const day = rowDate(row);
  if (day && day !== focus.focus_day) return false;
  return true;
}

function buildHelperIndex(rows, mapping, focus) {
  const index = new Map();
  for (const row of rows) {
    if (!helperScopeMatches(row, focus)) continue;
    for (const value of helperKeyValues(row, mapping, focus)) {
      for (const key of [normalizeKey(value), normalizeLoose(value)]) {
        if (!key) continue;
        if (!index.has(key)) index.set(key, []);
        if (!index.get(key).some((existing) => existing.id === row.id)) index.get(key).push(row);
      }
    }
  }
  return index;
}

function increment(map, key, amount = 1) {
  map[key] = (map[key] || 0) + amount;
}

function compactMiss(miss) {
  return {
    target_table: miss.target_table,
    record_id: miss.record_id,
    target_link_field: miss.target_link_field,
    source_value: miss.source_value,
    helper_table: miss.helper_table,
    helper_key_field: miss.helper_key_field,
    matches: miss.matches,
    reason: miss.reason
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const baseId = args["base-id"] || args.base_id || process.env.WEC_AIRTABLE_BASE_ID || DEFAULT_BASE_ID;
  const token = args["airtable-token"] || args.airtable_token || process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error("AIRTABLE_TOKEN required");

  const focus = await getActiveFocusShow(baseId, token, args["show-no"] || args.show_no || "");
  const meta = await airtableMeta(baseId, token);
  const allowedRows = (await airtableList(baseId, token, "allowed_helpers"))
    .filter((row) => truthy(getField(row, "active")))
    .filter((row) => TARGET_TABLES.includes(text(getField(row, "target_table"))));

  const targetRowsByTable = new Map();
  const helperCache = new Map();
  const updatesByTable = new Map();
  const rowsChecked = Object.fromEntries(TARGET_TABLES.map((table) => [table, 0]));
  const linksPopulatedByTable = Object.fromEntries(TARGET_TABLES.map((table) => [table, 0]));
  const linksPopulatedByHelper = {};
  const silentMisses = [];
  const blockingMisses = [];
  const showDaysMisses = [];
  const ambiguousMatches = [];
  const horseDuplicateAmbiguousGroups = [];
  const mappingsSkipped = [];
  const fieldChecks = {};

  for (const tableName of TARGET_TABLES) {
    let rows;
    try {
      rows = await airtableList(baseId, token, tableName);
    } catch (error) {
      mappingsSkipped.push({ target_table: tableName, reason: error.message });
      rows = [];
    }
    const eligibleRows = rows.filter((row) => targetRowEligible(tableName, row, focus));
    targetRowsByTable.set(tableName, eligibleRows);
    rowsChecked[tableName] = eligibleRows.length;
    for (const field of REQUIRED_FIELD_CHECKS[tableName] || []) {
      fieldChecks[`${tableName}.${field}`] = fieldExists(meta, rows, tableName, field);
    }
  }

  for (const mapping of allowedRows) {
    const targetTable = text(getField(mapping, "target_table"));
    const targetLinkField = text(getField(mapping, "target_link_field"));
    const sourceValueField = text(getField(mapping, "source_value_field"));
    const helperTable = text(getField(mapping, "helper_table"));
    const helperKeyField = text(getField(mapping, "helper_key_field"));
    const allowSilentFail = truthy(getField(mapping, "allow_silent_fail"));
    const targetRows = targetRowsByTable.get(targetTable) || [];

    if (!targetLinkField || !sourceValueField || !helperTable || !helperKeyField) {
      mappingsSkipped.push({ mapping: mapping.id, target_table: targetTable, reason: "missing required mapping field" });
      continue;
    }
    if (!fieldExists(meta, targetRows, targetTable, targetLinkField)) {
      mappingsSkipped.push({ mapping: mapping.id, target_table: targetTable, target_link_field: targetLinkField, reason: "target link field not found" });
      continue;
    }

    let helperRows = helperCache.get(helperTable);
    if (!helperRows) {
      try {
        helperRows = await airtableList(baseId, token, helperTable);
      } catch (error) {
        if (allowSilentFail) {
          mappingsSkipped.push({ target_table: targetTable, target_link_field: targetLinkField, helper_table: helperTable, reason: error.message });
          continue;
        }
        throw error;
      }
      helperCache.set(helperTable, helperRows);
    }

    const helperIndex = buildHelperIndex(helperRows, mapping, focus);
    for (const targetRow of targetRows) {
      if (!linkedFieldBlank(targetRow, targetLinkField)) continue;
      const sourceValues = targetSourceValues(targetRow, mapping, focus);
      const sourceKeys = Array.from(new Set(sourceValues.flatMap((value) => [normalizeKey(value), normalizeLoose(value)]).filter(Boolean)));
      if (!sourceKeys.length) {
        const miss = { target_table: targetTable, record_id: targetRow.id, target_link_field: targetLinkField, source_value: "", helper_table: helperTable, helper_key_field: helperKeyField, matches: 0, reason: "blank source value" };
        if (allowSilentFail) silentMisses.push(miss); else blockingMisses.push(miss);
        if (targetLinkField === "show_days") showDaysMisses.push(miss);
        continue;
      }

      const matches = [];
      for (const key of sourceKeys) {
        for (const row of helperIndex.get(key) || []) {
          if (!matches.some((existing) => existing.id === row.id)) matches.push(row);
        }
      }
      if (matches.length !== 1) {
        const miss = { target_table: targetTable, record_id: targetRow.id, target_link_field: targetLinkField, source_value: sourceValues.join(" | "), helper_table: helperTable, helper_key_field: helperKeyField, matches: matches.length, reason: matches.length ? "ambiguous match" : "no match" };
        if (matches.length > 1) {
          ambiguousMatches.push(miss);
          if (targetLinkField === "horses") horseDuplicateAmbiguousGroups.push(miss);
        }
        if (allowSilentFail) silentMisses.push(miss); else blockingMisses.push(miss);
        if (targetLinkField === "show_days") showDaysMisses.push(miss);
        continue;
      }

      const linkedId = helperRecordId(matches[0], mapping);
      if (!linkedId) {
        const miss = { target_table: targetTable, record_id: targetRow.id, target_link_field: targetLinkField, source_value: sourceValues.join(" | "), helper_table: helperTable, helper_key_field: helperKeyField, matches: 1, reason: "helper record id missing" };
        if (allowSilentFail) silentMisses.push(miss); else blockingMisses.push(miss);
        if (targetLinkField === "show_days") showDaysMisses.push(miss);
        continue;
      }

      if (!updatesByTable.has(targetTable)) updatesByTable.set(targetTable, new Map());
      const tableUpdates = updatesByTable.get(targetTable);
      if (!tableUpdates.has(targetRow.id)) tableUpdates.set(targetRow.id, {});
      tableUpdates.get(targetRow.id)[targetLinkField] = [linkedId];
      increment(linksPopulatedByHelper, targetLinkField);
      linksPopulatedByTable[targetTable] += 1;
    }
  }

  if (blockingMisses.length) {
    const error = new Error("blocking helper-link misses found");
    error.summary = {
      blocking_misses: blockingMisses.slice(0, 50).map(compactMiss),
      blocking_miss_count: blockingMisses.length,
      show_days_misses: showDaysMisses.slice(0, 50).map(compactMiss)
    };
    throw error;
  }

  let recordsUpdated = 0;
  for (const [tableName, updateMap] of updatesByTable.entries()) {
    const updates = Array.from(updateMap.entries()).map(([id, fields]) => ({ id, fields }));
    recordsUpdated += updates.length;
    await airtableUpdate(baseId, token, tableName, updates);
  }

  const summary = {
    ok: true,
    action: "repair-allowed-helpers-links",
    active_show_no: focus.show_no,
    active_focus_day: focus.focus_day,
    allowed_helpers_active_mappings: allowedRows.length,
    target_tables_supported: TARGET_TABLES,
    target_tables_repaired: Array.from(updatesByTable.keys()),
    rows_checked: rowsChecked,
    links_populated_by_table: linksPopulatedByTable,
    links_populated_by_helper: linksPopulatedByHelper,
    field_checks: fieldChecks,
    silent_misses: silentMisses.slice(0, 100).map(compactMiss),
    silent_miss_count: silentMisses.length,
    blocking_misses: [],
    show_days_misses: showDaysMisses.slice(0, 100).map(compactMiss),
    ambiguous_matches: ambiguousMatches.slice(0, 100).map(compactMiss),
    ambiguous_match_count: ambiguousMatches.length,
    horse_duplicate_ambiguous_groups: horseDuplicateAmbiguousGroups.slice(0, 100).map(compactMiss),
    records_updated: recordsUpdated,
    rows_deleted: 0,
    links_cleared: 0,
    duplicate_helper_records_created: 0,
    mappings_skipped: mappingsSkipped
  };
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

appendRunLog("RUN", {
  action: "repair-allowed-helpers-links",
  argv: process.argv.slice(2)
});

main().then((summary) => {
  appendRunLog("EXIT", summary);
  writeLastSuccess(summary);
}).catch((error) => {
  const payload = {
    ok: false,
    error: error.message,
    ...(error.summary || {})
  };
  appendRunLog("FAIL", payload);
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
});

