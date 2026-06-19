#!/usr/bin/env node

const DEFAULT_BASE_ID = "app6XS1RvsPNRT6os";

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

function normalizeKey(value) {
  return text(value)
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .toLowerCase();
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
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

async function airtableList(baseId, token, tableName) {
  const rows = [];
  let offset = "";
  do {
    const payload = await airtableFetch(baseId, token, tableName, { offset, pageSize: 100 });
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

function scopedToFocus(row, focus) {
  const showNo = text(getField(row, "show_no"));
  const rowDay = dateKey(getField(row, "iso_date") || getField(row, "focus_day") || getField(row, "ISO"));
  return showNo === focus.show_no && rowDay === focus.focus_day;
}

function isEligibleStagingRow(row) {
  return ["is_lock", "is_locked", "lock", "confirm_lock"].some((field) => truthy(getField(row, field)));
}

function targetSourceValue(row, mapping, focus) {
  const sourceField = text(getField(mapping, "source_value_field"));
  if (sourceField === "show_no+focus_day") return `${focus.show_no}|${focus.focus_day}`;
  if (sourceField === "focus_day") return focus.focus_day;
  return getField(row, sourceField);
}

function helperKeyValue(row, mapping, focus) {
  const helperField = text(getField(mapping, "helper_key_field"));
  if (helperField === "show_no+focus_day") {
    return `${text(getField(row, "show_no"))}|${dateKey(getField(row, "focus_day") || getField(row, "iso_date") || getField(row, "ISO"))}`;
  }
  if (helperField === "focus_day") return dateKey(getField(row, helperField));
  return getField(row, helperField);
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
  for (const field of ["focus_day", "iso_date", "ISO"]) {
    if (hasField(row, field) && text(getField(row, field))) {
      return dateKey(getField(row, field)) === focus.focus_day;
    }
  }
  return true;
}

function buildHelperIndex(rows, mapping, focus) {
  const index = new Map();
  for (const row of rows) {
    if (!helperScopeMatches(row, focus)) continue;
    const key = normalizeKey(helperKeyValue(row, mapping, focus));
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
  }
  return index;
}

function increment(map, key, amount = 1) {
  map[key] = (map[key] || 0) + amount;
}

async function main() {
  const args = parseArgs(process.argv);
  const baseId = args["base-id"] || args.base_id || process.env.WEC_AIRTABLE_BASE_ID || DEFAULT_BASE_ID;
  const token = args["airtable-token"] || args.airtable_token || process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error("AIRTABLE_TOKEN required");

  const focus = await getActiveFocusShow(baseId, token, args["show-no"] || args.show_no || "");
  const allowedRows = (await airtableList(baseId, token, "allowed_helpers"))
    .filter((row) => truthy(getField(row, "active")))
    .filter((row) => text(getField(row, "target_table")) === "update_schedule_staging");

  const stagingRows = (await airtableList(baseId, token, "update_schedule_staging"))
    .filter((row) => scopedToFocus(row, focus))
    .filter(isEligibleStagingRow);

  const helperCache = new Map();
  const updatesByRecord = new Map();
  const linksPopulated = {};
  const silentMisses = {};
  const blockingMisses = [];
  const mappingsSkipped = [];
  let horseLinksAttempted = 0;
  let horseLinksPopulated = 0;
  let horseSilentMisses = 0;

  for (const mapping of allowedRows) {
    const targetLinkField = text(getField(mapping, "target_link_field"));
    const helperTable = text(getField(mapping, "helper_table"));
    const allowSilentFail = truthy(getField(mapping, "allow_silent_fail"));
    if (!targetLinkField || !helperTable) {
      mappingsSkipped.push({ mapping: mapping.id, reason: "missing target_link_field or helper_table" });
      continue;
    }

    let helperRows = helperCache.get(helperTable);
    if (!helperRows) {
      try {
        helperRows = await airtableList(baseId, token, helperTable);
      } catch (error) {
        if (allowSilentFail) {
          mappingsSkipped.push({ target_link_field: targetLinkField, helper_table: helperTable, reason: error.message });
          continue;
        }
        throw error;
      }
      helperCache.set(helperTable, helperRows);
    }

    const helperIndex = buildHelperIndex(helperRows, mapping, focus);
    for (const targetRow of stagingRows) {
      if (linkedRecordIds(getField(targetRow, targetLinkField)).length) continue;
      const sourceValue = targetSourceValue(targetRow, mapping, focus);
      const sourceKey = normalizeKey(sourceValue);
      if (targetLinkField === "horses") horseLinksAttempted += 1;
      if (!sourceKey) {
        if (allowSilentFail) {
          increment(silentMisses, targetLinkField);
          if (targetLinkField === "horses") horseSilentMisses += 1;
          continue;
        }
        blockingMisses.push({ record_id: targetRow.id, field: targetLinkField, reason: "blank source value" });
        continue;
      }

      const matches = helperIndex.get(sourceKey) || [];
      if (matches.length !== 1) {
        const miss = {
          record_id: targetRow.id,
          field: targetLinkField,
          source_value: text(sourceValue),
          matches: matches.length
        };
        if (allowSilentFail) {
          increment(silentMisses, targetLinkField);
          if (targetLinkField === "horses") horseSilentMisses += 1;
        } else {
          blockingMisses.push(miss);
        }
        continue;
      }

      const linkedId = helperRecordId(matches[0], mapping);
      if (!linkedId) {
        if (allowSilentFail) {
          increment(silentMisses, targetLinkField);
          if (targetLinkField === "horses") horseSilentMisses += 1;
        } else {
          blockingMisses.push({ record_id: targetRow.id, field: targetLinkField, reason: "helper record id missing" });
        }
        continue;
      }

      if (!updatesByRecord.has(targetRow.id)) updatesByRecord.set(targetRow.id, {});
      updatesByRecord.get(targetRow.id)[targetLinkField] = [linkedId];
      increment(linksPopulated, targetLinkField);
      if (targetLinkField === "horses") horseLinksPopulated += 1;
    }
  }

  if (blockingMisses.length) {
    const error = new Error("blocking helper-link misses found");
    error.summary = { blocking_misses: blockingMisses.slice(0, 50), blocking_miss_count: blockingMisses.length };
    throw error;
  }

  const updates = Array.from(updatesByRecord.entries()).map(([id, fields]) => ({ id, fields }));
  await airtableUpdate(baseId, token, "update_schedule_staging", updates);

  const summary = {
    ok: true,
    action: "repair-update-schedule-staging-links",
    active_show_no: focus.show_no,
    active_focus_day: focus.focus_day,
    eligible_staging_rows: stagingRows.length,
    helper_mappings_loaded: allowedRows.length,
    helper_mappings_skipped: mappingsSkipped,
    links_populated_by_helper: linksPopulated,
    silent_misses: silentMisses,
    blocking_misses: [],
    horse_links_attempted: horseLinksAttempted,
    horse_links_populated: horseLinksPopulated,
    horse_silent_misses: horseSilentMisses,
    records_updated: updates.length,
    rows_deleted: 0,
    links_cleared: 0
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  const payload = {
    ok: false,
    error: error.message,
    ...(error.summary || {})
  };
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
});
