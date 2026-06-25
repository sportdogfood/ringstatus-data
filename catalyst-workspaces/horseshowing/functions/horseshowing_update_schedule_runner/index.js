const catalyst = require("zcatalyst-sdk-node");
const DEFAULT_BASE_ID = "app6XS1RvsPNRT6os";
const DEFAULT_SYNC_URL = "https://horseshowing-700800454.development.catalystserverless.com/server/horseshowing_sync/";
const HORSESHOWING_BASE_URL = "https://www.horseshowing.com";
const UPSTREAM_TIMEOUT_MS = 20000;
const https = require("https");
const TABLE_CATALYST_UPDATE_SCHEDULE = "hs_update_schedule";
const TABLE_WEC_LOGS = "tblaA0n7QD7s5lIYm";
const TABLE_UPDATE_SCHEDULE_STAGING = "tblzsoU59zmYxhPah";
const TABLE_UPDATE_SCHEDULE = "tblzPWt9G3VBVqVi6";
const TABLE_FOCUS_SHOW = "tblQldkP8wwIRxd4z";
const WEC_LOG_FIELDS = {
  log_key_run: "fldlTpAEAqOF7lsFN",
  log_key: "fldtfwD9STjbiqZVL",
  workflow_lanes: "fldcejlTPlfei7Ltt",
  log_type: "fldH0a8UuciyJ68X1",
  check_name: "fldxNUbWvV48y9Yqi",
  show_no: "fldgExOeT4WsVAXgj",
  focus_day: "fldWVjrQmH9X176lR",
  status: "fldlp2fhwJef8iOLE",
  records_seen: "fldYQTOrDmuKShzOh",
  records_changed: "fldHk6LVAh6VxHhGb",
  summary: "fldFQ98C0DqANcDuC",
  payload_json: "fldJoJly55dFuacXz",
  created_at: "fldQDsYQenI0uHARe"
};
const STAGING_FIELDS = {
  staging_key: "fldFBo8SVsESz3Lm9",
  show_no: "fldfMmNiM6yiZbp8O",
  class_no: "flduv43XDZA8Z2rO4",
  ring_day_no: "fldyJ89RRtoic3F8m",
  ring_no: "fldivIFX6Mi3HEFH5",
  ring_name: "fldBlOdFMhDE6pwcs",
  date_text: "fldEmBE6oqw7YVzQt",
  iso_date: "fld6RUZaBhxh0plgf",
  event_id: "fld5prDB3w7mdg3JR",
  event_name: "flde1tofvuV34iKc6",
  class_name: "fldvV3xLV9PduvCrB",
  time_text: "fld2EahZkPs2SSVfN",
  entry_count: "fldsiU6NKYacpz8CT",
  event_type: "fldAlM1wi08VAVK91",
  oc_id: "fld70UVS6eQPjpNoN",
  live_flag: "fldHBFrqtzvBiNTuh",
  review_status: "fldNEtTH1zyeZUGaW",
  review_notes: "fld1srOFl2Tz2NcUE",
  source_key: "fldsBNOFbA5jNVIOD",
  source: "fldhLoErq7yHgQpZJ",
  inactive: "fld78Qo0RgOGbQfzK",
  wec_logs: "fldf2uT0cdmrNBHyH",
  lock: "fldtUb2tiJvBNHdsD",
  is_target: "fldPGbloe6fCajHH4",
  shows: "fldr7WPbgPFfPuctf",
  focus_show: "fldg6ox15s03Sw9xk",
  classes: "fld57nJX8y2bOTMcw",
  ring_days: "fldTVsQTkDsDvKyPz",
  rings: "fldz3HXUIVufTOlYm",
  events: "flds4Y7IP8eN7JrP1",
  show_days: "fldiW1dfQrPSFiNvv",
  full_lock: "fldL8UsgATV34je1y",
  full_lockv2: "fldt5NXBS1P1s5bWf",
  last_run_time: "fld1vf5NxKMesqzUX"
};
const FOCUS_SHOW_FIELDS = {
  full_lock_count: "fldJvufgP7b76xL4x"
};
const UPDATE_SCHEDULE_FIELDS = {
  show_no: "fldmnARVSDUfJirnQ",
  class_no: "fldwcTNbe428USaTR",
  days: "fldb27dnAACVMK5dl",
  ring_day_no: "fldrP0ypNZ35aWoSZ",
  ring_no: "fldW1hAOUHIUfJv0m",
  ring_name: "fldy7IQAUzc25jW2y",
  date_text: "fld0emVF1PzSrLVBq",
  iso_date: "fldmezTiUj6scywI7",
  event_id: "fld0tb7BhGfuhMKFJ",
  event_name: "fld3JpzK6JVXbfMkX",
  class_payout: "fldmjzC1XVF5WRPzD",
  class_name: "fldZztQVbPJA3Gviv",
  time_text: "fldoSFAVNYPiSdE2o",
  entry_count: "fld2m7POOlVQ4xCZf",
  event_type: "fldA9yOctFKtbTVti",
  oc_id: "fldg19d9ACe9bGP08",
  live_flag: "fldyzCrNuYLAFxh3N",
  source: "fldI9ua5MaB0R86NM",
  mirror_update_schedule_key: "fldy6FUgG1MkCL5tf",
  confirm_delete: "fldO7jcDNNO6MBmxc"
};
const CONFIRM_DELETE_TRIGGER_REASONS = new Set(["focus_day_change", "cadence"]);

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body, null, 2));
}

function parseQuery(req) {
  const rawUrl = req.url || req.originalUrl || "";
  const query = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?") + 1) : "";
  return new URLSearchParams(query);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(Object.fromEntries(new URLSearchParams(raw)));
      }
    });
  });
}

function asNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizeTriggerReason(value) {
  const raw = text(value).toLowerCase();
  if (raw === "focus_changed") return "focus_day_change";
  if (raw === "due") return "cadence";
  return raw;
}

function canExecuteConfirmDelete(triggerReason) {
  return CONFIRM_DELETE_TRIGGER_REASONS.has(normalizeTriggerReason(triggerReason));
}

function setCookieValues(response) {
  const value = response?.headers?.get?.("set-cookie");
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function mergeCookies(...cookieInputs) {
  const jar = new Map();
  for (const input of cookieInputs) {
    const parts = Array.isArray(input) ? input : String(input || "").split(/,(?=[^;,]+=)/);
    for (const part of parts) {
      const cookie = String(part || "").split(";")[0].trim();
      const eq = cookie.indexOf("=");
      if (eq > 0) jar.set(cookie.slice(0, eq), cookie.slice(eq + 1));
    }
  }
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

function yyyymmddToIso(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return "";
}

async function airtableList(baseId, tableName, formula, token) {
  const records = [];
  let offset = "";
  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`);
    url.searchParams.set("pageSize", "100");
    if (formula) url.searchParams.set("filterByFormula", formula);
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Airtable ${tableName} HTTP ${response.status}: ${raw.slice(0, 300)}`);
    const json = JSON.parse(raw);
    records.push(...(json.records || []));
    offset = json.offset || "";
  } while (offset);
  return records.map((record) => ({ record_id: record.id, ...record.fields }));
}

async function airtableListFieldIds(baseId, tableName, formula, token) {
  const records = [];
  let offset = "";
  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("returnFieldsByFieldId", "true");
    if (formula) url.searchParams.set("filterByFormula", formula);
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Airtable ${tableName} HTTP ${response.status}: ${raw.slice(0, 300)}`);
    const json = JSON.parse(raw);
    records.push(...(json.records || []));
    offset = json.offset || "";
  } while (offset);
  return records.map((record) => ({ record_id: record.id, ...record.fields }));
}

async function airtableCreate(baseId, tableId, fields, token) {
  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ records: [{ fields }], typecast: true })
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Airtable create ${tableId} HTTP ${response.status}: ${raw.slice(0, 500)}`);
  return JSON.parse(raw);
}

async function airtableUpdate(baseId, tableId, records, token) {
  const results = [];
  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10);
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ records: chunk, typecast: true })
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Airtable update ${tableId} HTTP ${response.status}: ${raw.slice(0, 500)}`);
    results.push(...(JSON.parse(raw).records || []));
  }
  return results;
}

async function airtableDelete(baseId, tableId, recordIds, token) {
  const results = [];
  for (let i = 0; i < recordIds.length; i += 10) {
    const chunk = recordIds.slice(i, i + 10).filter(Boolean);
    if (!chunk.length) continue;
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${tableId}`);
    for (const id of chunk) url.searchParams.append("records[]", id);
    const response = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Airtable delete ${tableId} HTTP ${response.status}: ${raw.slice(0, 500)}`);
    results.push(...(JSON.parse(raw).records || []));
  }
  return results;
}

async function airtableUpsert(baseId, tableId, mergeFieldId, records, token) {
  const results = [];
  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10);
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        records: chunk.map((fields) => ({ fields })),
        performUpsert: { fieldsToMergeOn: [mergeFieldId] },
        typecast: true
      })
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Airtable upsert ${tableId} HTTP ${response.status}: ${raw.slice(0, 500)}`);
    results.push(...(JSON.parse(raw).records || []));
  }
  return results;
}

async function airtableUpsertByName(baseId, tableName, mergeFieldName, records, token) {
  const results = [];
  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10);
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        records: chunk.map((fields) => ({ fields })),
        performUpsert: { fieldsToMergeOn: [mergeFieldName] },
        typecast: true
      })
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Airtable upsert ${tableName} HTTP ${response.status}: ${raw.slice(0, 500)}`);
    results.push(...(JSON.parse(raw).records || []));
  }
  return results;
}

async function markStagingFocusState(baseId, token, showNo, focusDay) {
  const records = await airtableList(baseId, "update_schedule_staging", `{show_no}=${Number(showNo)}`, token);
  const updates = records.map((record) => ({
    id: record.record_id,
    fields: {
      [STAGING_FIELDS.inactive]: yyyymmddToIso(record.iso_date) !== focusDay
    }
  }));
  if (!updates.length) return { scanned: 0, updated: 0, active: 0, inactive: 0 };
  const result = await airtableUpdate(baseId, TABLE_UPDATE_SCHEDULE_STAGING, updates, token);
  return {
    scanned: records.length,
    updated: result.length,
    active: updates.filter((row) => row.fields[STAGING_FIELDS.inactive] === false).length,
    inactive: updates.filter((row) => row.fields[STAGING_FIELDS.inactive] === true).length
  };
}

function truthy(value) {
  if (value === true) return true;
  const raw = text(value).toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

function emptyLink(value) {
  return !Array.isArray(value) || value.length === 0;
}

function stagingLinkMisses(row) {
  const classNo = Number(row[STAGING_FIELDS.class_no]);
  const expectsClass = Number.isFinite(classNo) && classNo > 0;
  return {
    shows: emptyLink(row[STAGING_FIELDS.shows]),
    focus_show: emptyLink(row[STAGING_FIELDS.focus_show]),
    classes: expectsClass && emptyLink(row[STAGING_FIELDS.classes]),
    ring_days: emptyLink(row[STAGING_FIELDS.ring_days]),
    rings: emptyLink(row[STAGING_FIELDS.rings]),
    events: emptyLink(row[STAGING_FIELDS.events]),
    show_days: emptyLink(row[STAGING_FIELDS.show_days])
  };
}

function summarizeStagingLinkMisses(rows) {
  const missing = { shows: 0, focus_show: 0, classes: 0, ring_days: 0, rings: 0, events: 0, show_days: 0 };
  let rowsWithAnyMiss = 0;
  for (const row of rows || []) {
    const rowMissing = stagingLinkMisses(row);
    if (Object.values(rowMissing).some(Boolean)) rowsWithAnyMiss += 1;
    for (const [key, value] of Object.entries(rowMissing)) {
      if (value) missing[key] += 1;
    }
  }
  return { rows_with_any_link_miss: rowsWithAnyMiss, missing };
}

function summarizeFullLock(rows) {
  const fullLockCount = (rows || []).filter((row) => truthy(row[STAGING_FIELDS.full_lock])).length;
  return {
    rows: (rows || []).length,
    full_lock_count: fullLockCount,
    pause_downstream: fullLockCount === 0
  };
}

async function writeFocusShowFullLockCount(baseId, token, focusShowRows, fullLockCount) {
  const focusShowId = focusShowRows?.[0]?.record_id || "";
  if (!focusShowId) return { updated: 0, focus_show_record_id: "" };
  const result = await airtableUpdate(baseId, TABLE_FOCUS_SHOW, [{
    id: focusShowId,
    fields: { [FOCUS_SHOW_FIELDS.full_lock_count]: fullLockCount }
  }], token);
  return { updated: result.length, focus_show_record_id: focusShowId };
}

async function stampStagingLastRun(baseId, token, rows, runTime) {
  const updates = (rows || [])
    .filter((row) => row.record_id)
    .map((row) => ({
      id: row.record_id,
      fields: { [STAGING_FIELDS.last_run_time]: runTime }
    }));
  if (!updates.length) return 0;
  const result = await airtableUpdate(baseId, TABLE_UPDATE_SCHEDULE_STAGING, updates, token);
  return result.length;
}

function airtableString(value) {
  return text(value).replace(/'/g, "\\'");
}

function airtableConfirmDeleteFormula(showNo, focusDay = "", ringDayNo = "") {
  const clauses = ["{confirm_delete}=1"];
  if (text(showNo)) clauses.push(`{show_no}=${Number(showNo)}`);
  const isoFocusDay = yyyymmddToIso(focusDay);
  if (isoFocusDay) clauses.push(`IS_SAME({iso_date},'${airtableString(isoFocusDay)}','day')`);
  if (text(ringDayNo)) clauses.push(`{ring_day_no}=${Number(ringDayNo)}`);
  return `AND(${clauses.join(",")})`;
}

function zcqlValue(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function cleanRow(row) {
  const clean = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined && value !== null && value !== "") clean[key] = value;
  }
  return clean;
}

function rowChanged(existing, row) {
  return Object.entries(row).some(([key, value]) => text(existing[key]) !== text(value));
}

async function airtableListByKeys(baseId, tableName, keyField, keys, token) {
  const uniqueKeys = [...new Set((keys || []).map(text).filter(Boolean))];
  const records = [];
  for (let i = 0; i < uniqueKeys.length; i += 40) {
    const chunk = uniqueKeys.slice(i, i + 40);
    const formula = chunk.length === 1
      ? `{${keyField}}='${airtableString(chunk[0])}'`
      : `OR(${chunk.map((key) => `{${keyField}}='${airtableString(key)}'`).join(",")})`;
    records.push(...await airtableList(baseId, tableName, formula, token));
  }
  return records;
}

function indexBy(rows, keyField) {
  const map = new Map();
  for (const row of rows || []) {
    const key = text(row[keyField]);
    if (key) map.set(key, row.record_id);
  }
  return map;
}

function showDayKey(value) {
  return yyyymmddToIso(value).replace(/-/g, "");
}

function stagingRowByKey(stagingRows) {
  const map = new Map();
  for (const row of stagingRows || []) {
    map.set(text(row[STAGING_FIELDS.staging_key]), row);
  }
  return map;
}

function stagingSourceIdentity(row) {
  return [
    row[STAGING_FIELDS.show_no],
    row[STAGING_FIELDS.ring_day_no],
    row[STAGING_FIELDS.event_id]
  ].map((value) => text(value)).join("|");
}

function hasValidStagingClassNo(row) {
  const value = Number(row?.[STAGING_FIELDS.class_no]);
  return Number.isFinite(value) && value > 0;
}

async function rekeyExistingStagingRows(baseId, token, showNo, ringDayNo, stagingRows) {
  const existing = await airtableListStagingBlockRows(baseId, token, showNo, ringDayNo);
  const currentByKey = new Map(existing.map((record) => [text(record[STAGING_FIELDS.staging_key]), record]));
  const currentBySource = new Map(existing.map((record) => [stagingSourceIdentity(record), record]));
  const updates = [];
  for (const row of stagingRows || []) {
    const newKey = text(row[STAGING_FIELDS.staging_key]);
    const sourceKey = stagingSourceIdentity(row);
    if (!newKey || currentByKey.has(newKey)) continue;
    const oldRecord = currentBySource.get(sourceKey);
    if (!oldRecord?.record_id) continue;
    updates.push({
      id: oldRecord.record_id,
      fields: {
        [STAGING_FIELDS.staging_key]: newKey,
        ...(hasValidStagingClassNo(row) ? { [STAGING_FIELDS.source_key]: newKey } : {})
      }
    });
  }
  if (!updates.length) return { scanned: existing.length, rekeyed: 0 };
  const result = await airtableUpdate(baseId, TABLE_UPDATE_SCHEDULE_STAGING, updates, token);
  return { scanned: existing.length, rekeyed: result.length };
}

async function airtableListStagingBlockRows(baseId, token, showNo, ringDayNo) {
  return airtableListFieldIds(
    baseId,
    "update_schedule_staging",
    `AND({show_no}=${Number(showNo)},{ring_day_no}=${Number(ringDayNo)})`,
    token
  );
}

async function airtableListUpdateScheduleBlockRows(baseId, token, showNo, ringDayNo) {
  return airtableListFieldIds(
    baseId,
    "update_schedule",
    `AND({show_no}=${Number(showNo)},{ring_day_no}=${Number(ringDayNo)})`,
    token
  );
}

async function airtableListConfirmedDeleteRows(baseId, token, showNo, focusDay, ringDayNo) {
  return airtableListFieldIds(
    baseId,
    "update_schedule",
    airtableConfirmDeleteFormula(showNo, focusDay, ringDayNo),
    token
  );
}

async function airtableListStagingFocusRows(baseId, token, showNo, focusDay) {
  return airtableListFieldIds(
    baseId,
    "update_schedule_staging",
    `AND({show_no}=${Number(showNo)},IS_SAME({iso_date},'${yyyymmddToIso(focusDay)}','day'))`,
    token
  );
}

async function airtableListUpdateScheduleFocusRows(baseId, token, showNo, focusDay) {
  return airtableListFieldIds(
    baseId,
    "update_schedule",
    `AND({show_no}=${Number(showNo)},IS_SAME({iso_date},'${yyyymmddToIso(focusDay)}','day'))`,
    token
  );
}

async function airtableListAllUpdateScheduleRows(baseId, token, showNo = "", focusDay = "") {
  const clauses = [];
  if (text(showNo)) clauses.push(`{show_no}=${Number(showNo)}`);
  const isoFocusDay = yyyymmddToIso(focusDay);
  if (isoFocusDay) clauses.push(`IS_SAME({iso_date},'${airtableString(isoFocusDay)}','day')`);
  const formula = clauses.length ? `AND(${clauses.join(",")})` : "";
  return airtableListFieldIds(baseId, "update_schedule", formula, token);
}

async function airtableListFocusShowRows(baseId, token, showNo, focusDay) {
  return airtableListFieldIds(
    baseId,
    "focus_show",
    `AND({show_no}=${Number(showNo)},IS_SAME({focus_day},DATETIME_PARSE('${airtableString(focusDay)}'),'day'))`,
    token
  );
}

async function resetFocusUpdateSchedule(baseId, token, showNo, focusDay) {
  const [stagingRows, updateRows] = await Promise.all([
    airtableListStagingFocusRows(baseId, token, showNo, focusDay),
    airtableListUpdateScheduleFocusRows(baseId, token, showNo, focusDay)
  ]);
  const updateDeleted = await airtableDelete(baseId, TABLE_UPDATE_SCHEDULE, updateRows.map((record) => record.record_id), token);
  return {
    show_no: Number(showNo),
    focus_day: yyyymmddToIso(focusDay),
    update_schedule_seen: updateRows.length,
    update_schedule_deleted: updateDeleted.length,
    update_schedule_staging_seen: stagingRows.length,
    update_schedule_staging_deleted: 0,
    update_schedule_staging_preserved: stagingRows.length
  };
}

async function ensureStagingHelpers(baseId, token, stagingRows) {
  const classRows = [];
  const eventRows = [];
  const ringRows = [];
  const ringDayRows = [];
  const showDayRows = [];
  const seen = {
    classes: new Set(),
    events: new Set(),
    rings: new Set(),
    ringDays: new Set(),
    showDays: new Set()
  };
  for (const row of stagingRows || []) {
    const classNo = Number(row[STAGING_FIELDS.class_no]);
    if (Number.isFinite(classNo) && classNo > 0 && !seen.classes.has(classNo)) {
      seen.classes.add(classNo);
      classRows.push({
        class_no: classNo,
        class_number: classNumber(row[STAGING_FIELDS.event_name]),
        class_name: row[STAGING_FIELDS.class_name],
        class_label: row[STAGING_FIELDS.event_name],
        source: "update_schedule.php"
      });
    }
    const eventId = Number(row[STAGING_FIELDS.event_id]);
    if (Number.isFinite(eventId) && eventId > 0 && !seen.events.has(eventId)) {
      seen.events.add(eventId);
      eventRows.push({ event_id: eventId });
    }
    const ringNo = Number(row[STAGING_FIELDS.ring_no]);
    if (Number.isFinite(ringNo) && ringNo > 0 && !seen.rings.has(ringNo)) {
      seen.rings.add(ringNo);
      ringRows.push({ ring_no: ringNo, ring_name: row[STAGING_FIELDS.ring_name] });
    }
    const ringDayNo = Number(row[STAGING_FIELDS.ring_day_no]);
    if (Number.isFinite(ringDayNo) && ringDayNo > 0 && !seen.ringDays.has(ringDayNo)) {
      seen.ringDays.add(ringDayNo);
      ringDayRows.push({ ring_day_no: ringDayNo });
    }
    const dayKey = showDayKey(row[STAGING_FIELDS.iso_date]);
    if (dayKey && !seen.showDays.has(dayKey)) {
      seen.showDays.add(dayKey);
      showDayRows.push({ show_day: dayKey });
    }
  }
  await Promise.all([
    classRows.length ? airtableUpsertByName(baseId, "classes", "class_no", classRows, token) : Promise.resolve([]),
    eventRows.length ? airtableUpsertByName(baseId, "events", "event_id", eventRows, token) : Promise.resolve([]),
    ringRows.length ? airtableUpsertByName(baseId, "rings", "ring_no", ringRows, token) : Promise.resolve([]),
    ringDayRows.length ? airtableUpsertByName(baseId, "ring_days", "ring_day_no", ringDayRows, token) : Promise.resolve([]),
    showDayRows.length ? airtableUpsertByName(baseId, "show_days", "show_day", showDayRows, token) : Promise.resolve([])
  ]);
  return {
    classes: classRows.length,
    events: eventRows.length,
    rings: ringRows.length,
    ring_days: ringDayRows.length,
    show_days: showDayRows.length
  };
}

async function linkLockedStagingRows(baseId, token, showNo, focusDay, stagingRows) {
  const keys = (stagingRows || []).map((row) => row[STAGING_FIELDS.staging_key]);
  const stagingRecords = await airtableListByKeys(baseId, "update_schedule_staging", "staging_key", keys, token);
  const sourceByKey = stagingRowByKey(stagingRows);
  const sourceRows = stagingRecords.map((record) => sourceByKey.get(text(record.staging_key))).filter(Boolean);
  const helperCreated = await ensureStagingHelpers(baseId, token, sourceRows);
  const [
    showRows,
    focusShowRows,
    classRows,
    ringDayRows,
    ringRows,
    eventRows,
    showDayRows
  ] = await Promise.all([
    airtableList(baseId, "shows", `{show_no}=${Number(showNo)}`, token),
    airtableListFocusShowRows(baseId, token, showNo, focusDay),
    airtableList(baseId, "classes", "", token),
    airtableList(baseId, "ring_days", "", token),
    airtableList(baseId, "rings", "", token),
    airtableList(baseId, "events", "", token),
    airtableList(baseId, "show_days", "", token)
  ]);
  const helpers = {
    shows: indexBy(showRows, "show_no"),
    focus_show: focusShowRows?.[0]?.record_id || "",
    classes: indexBy(classRows, "class_no"),
    ring_days: indexBy(ringDayRows, "ring_day_no"),
    rings: indexBy(ringRows, "ring_no"),
    events: indexBy(eventRows, "event_id"),
    show_days: indexBy(showDayRows, "show_day")
  };
  const missing = {
    shows: 0,
    focus_show: 0,
    classes: 0,
    ring_days: 0,
    rings: 0,
    events: 0,
    show_days: 0
  };
  const updates = [];
  for (const record of stagingRecords) {
    const source = sourceByKey.get(text(record.staging_key));
    if (!source) continue;
    const expectedKey = updateScheduleKey(
      source[STAGING_FIELDS.show_no],
      source[STAGING_FIELDS.iso_date],
      source[STAGING_FIELDS.ring_day_no],
      source[STAGING_FIELDS.ring_no],
      source[STAGING_FIELDS.class_no]
    );
    const showId = helpers.shows.get(text(source[STAGING_FIELDS.show_no]));
    const focusShowId = helpers.focus_show;
    const classNo = Number(source[STAGING_FIELDS.class_no]);
    const expectsClass = Number.isFinite(classNo) && classNo > 0;
    const classId = expectsClass ? helpers.classes.get(text(source[STAGING_FIELDS.class_no])) : "";
    const ringDayId = helpers.ring_days.get(text(source[STAGING_FIELDS.ring_day_no]));
    const ringId = helpers.rings.get(text(source[STAGING_FIELDS.ring_no]));
    const eventId = helpers.events.get(text(source[STAGING_FIELDS.event_id]));
    const showDayId = helpers.show_days.get(showDayKey(source[STAGING_FIELDS.iso_date]));
    if (!showId) missing.shows += 1;
    if (!focusShowId) missing.focus_show += 1;
    if (expectsClass && !classId) missing.classes += 1;
    if (!ringDayId) missing.ring_days += 1;
    if (!ringId) missing.rings += 1;
    if (!eventId) missing.events += 1;
    if (!showDayId) missing.show_days += 1;
    updates.push({
      id: record.record_id,
      fields: {
        ...(expectedKey && text(record[STAGING_FIELDS.staging_key]) !== expectedKey ? { [STAGING_FIELDS.staging_key]: expectedKey } : {}),
        ...(expectsClass && expectedKey && text(record[STAGING_FIELDS.source_key]) !== expectedKey ? { [STAGING_FIELDS.source_key]: expectedKey } : {}),
        ...(showId ? { [STAGING_FIELDS.shows]: [showId] } : {}),
        ...(focusShowId ? { [STAGING_FIELDS.focus_show]: [focusShowId] } : {}),
        ...(classId ? { [STAGING_FIELDS.classes]: [classId] } : {}),
        ...(ringDayId ? { [STAGING_FIELDS.ring_days]: [ringDayId] } : {}),
        ...(ringId ? { [STAGING_FIELDS.rings]: [ringId] } : {}),
        ...(eventId ? { [STAGING_FIELDS.events]: [eventId] } : {}),
        ...(showDayId ? { [STAGING_FIELDS.show_days]: [showDayId] } : {})
      }
    });
  }
  const result = await airtableUpdate(baseId, TABLE_UPDATE_SCHEDULE_STAGING, updates.filter((row) => Object.keys(row.fields).length), token);
  const lockedSources = stagingRecords
    .filter((record) => truthy(record[STAGING_FIELDS.lock]) && !truthy(record[STAGING_FIELDS.inactive]))
    .map((record) => sourceByKey.get(text(record.staging_key)))
    .filter(Boolean);
  const lockedKeySet = new Set(lockedSources.map((source) => updateScheduleKey(
    source[STAGING_FIELDS.show_no],
    source[STAGING_FIELDS.iso_date],
    source[STAGING_FIELDS.ring_day_no],
    source[STAGING_FIELDS.ring_no],
    source[STAGING_FIELDS.class_no]
  )).filter(Boolean));
  const fullLock = summarizeFullLock(stagingRecords);
  return {
    staged_records: stagingRecords.length,
    locked: stagingRecords.filter((record) => truthy(record[STAGING_FIELDS.lock])).length,
    target: lockedSources.length,
    linked: result.length,
    full_lock_count: fullLock.full_lock_count,
    pause_downstream: fullLock.pause_downstream,
    paused: fullLock.pause_downstream,
    missing,
    helper_created: helperCreated,
    locked_keys: [...lockedKeySet]
  };
}

async function reconcileBlockRows(baseId, token, showNo, ringDayNo, stagingRows) {
  const currentKeys = new Set((stagingRows || []).map((row) => text(row[STAGING_FIELDS.staging_key])).filter(Boolean));
  const [existingStagingRows, existingUpdateScheduleRows] = await Promise.all([
    airtableListStagingBlockRows(baseId, token, showNo, ringDayNo),
    airtableListUpdateScheduleBlockRows(baseId, token, showNo, ringDayNo)
  ]);

  const staleStagingRows = existingStagingRows.filter((record) => !currentKeys.has(text(record[STAGING_FIELDS.staging_key])));
  const staleStagingUpdates = staleStagingRows
    .filter((record) => !truthy(record[STAGING_FIELDS.inactive]))
    .map((record) => ({
      id: record.record_id,
      fields: { [STAGING_FIELDS.inactive]: true }
    }));
  const staleStagingResult = staleStagingUpdates.length
    ? await airtableUpdate(baseId, TABLE_UPDATE_SCHEDULE_STAGING, staleStagingUpdates, token)
    : [];

  const staleUpdateScheduleRows = existingUpdateScheduleRows.filter((record) => !currentKeys.has(text(record[UPDATE_SCHEDULE_FIELDS.mirror_update_schedule_key])));
  const staleUpdateScheduleResult = staleUpdateScheduleRows.length
    ? await airtableDelete(baseId, TABLE_UPDATE_SCHEDULE, staleUpdateScheduleRows.map((record) => record.record_id), token)
    : [];

  return {
    current_source_rows: currentKeys.size,
    existing_staging_rows: existingStagingRows.length,
    stale_staging_rows: staleStagingRows.length,
    stale_staging_inactivated: staleStagingResult.length,
    existing_update_schedule_rows: existingUpdateScheduleRows.length,
    stale_update_schedule_rows: staleUpdateScheduleRows.length,
    stale_update_schedule_deleted: staleUpdateScheduleResult.length
  };
}

function updateScheduleRecordMirrorKey(record) {
  return text(record?.[UPDATE_SCHEDULE_FIELDS.mirror_update_schedule_key] || record?.mirror_update_schedule_key || record?.update_schedule_key);
}

async function deleteUpdateScheduleRowsNotInKeys(baseId, token, showNo, ringDayNo, activeKeys) {
  const existingRows = await airtableListUpdateScheduleBlockRows(baseId, token, showNo, ringDayNo);
  const staleRows = existingRows.filter((record) => !activeKeys.has(updateScheduleRecordMirrorKey(record)));
  const result = staleRows.length
    ? await airtableDelete(baseId, TABLE_UPDATE_SCHEDULE, staleRows.map((record) => record.record_id), token)
    : [];
  return {
    existing_update_schedule_rows: existingRows.length,
    stale_update_schedule_rows: staleRows.length,
    stale_update_schedule_deleted: result.length
  };
}

async function deleteUpdateScheduleFocusRowsNotInKeys(baseId, token, showNo, focusDay, activeKeys) {
  const existingRows = await airtableListAllUpdateScheduleRows(baseId, token, showNo, focusDay);
  const staleRows = existingRows.filter((record) => !activeKeys.has(updateScheduleRecordMirrorKey(record)));
  const result = staleRows.length
    ? await airtableDelete(baseId, TABLE_UPDATE_SCHEDULE, staleRows.map((record) => record.record_id), token)
    : [];
  return {
    existing_update_schedule_rows: existingRows.length,
    stale_update_schedule_rows: staleRows.length,
    stale_update_schedule_deleted: result.length
  };
}

async function applyConfirmDeleteForBlock(app, baseId, token, showNo, focusDay, ringDayNo, triggerReason) {
  const confirmedRows = await airtableListConfirmedDeleteRows(baseId, token, showNo, focusDay, ringDayNo);
  const confirmedKeys = [...new Set(confirmedRows.map(updateScheduleRecordMirrorKey).filter(Boolean))];
  const missingKeyRows = confirmedRows
    .filter((record) => !updateScheduleRecordMirrorKey(record))
    .map((record) => record.record_id);
  if (!confirmedRows.length) {
    return {
      trigger_reason: normalizeTriggerReason(triggerReason),
      confirmed_delete_rows: 0,
      confirmed_delete_keys: [],
      missing_confirm_delete_keys: [],
      catalyst_rows_deleted: 0,
      pending_approval: false,
      executed: false
    };
  }
  if (missingKeyRows.length) {
    throw new Error(`confirm_delete blocked: update_schedule rows missing mirror key ${missingKeyRows.slice(0, 5).join(",")}`);
  }
  if (!canExecuteConfirmDelete(triggerReason)) {
    return {
      trigger_reason: normalizeTriggerReason(triggerReason),
      confirmed_delete_rows: confirmedRows.length,
      confirmed_delete_keys: confirmedKeys,
      missing_confirm_delete_keys: [],
      catalyst_rows_deleted: 0,
      pending_approval: true,
      executed: false
    };
  }

  const confirmedKeySet = new Set(confirmedKeys);
  let catalystRows;
  if (text(ringDayNo)) {
    catalystRows = await getCatalystUpdateScheduleRows(app, showNo, ringDayNo);
  } else if (text(showNo) || text(focusDay)) {
    catalystRows = await getCatalystUpdateScheduleFocusRows(app, showNo, focusDay);
  } else {
    catalystRows = await getCatalystUpdateScheduleAllRows(app);
  }
  const catalystRowIds = catalystRows
    .filter((row) => confirmedKeySet.has(text(row.update_schedule_key)))
    .map((row) => text(row.ROWID))
    .filter(Boolean);
  const table = app.datastore().table(TABLE_CATALYST_UPDATE_SCHEDULE);
  let deleted = 0;
  for (let i = 0; i < catalystRowIds.length; i += 100) {
    const batch = catalystRowIds.slice(i, i + 100);
    if (batch.length) {
      await table.deleteRows(batch);
      deleted += batch.length;
    }
  }
  return {
    trigger_reason: normalizeTriggerReason(triggerReason),
    confirmed_delete_rows: confirmedRows.length,
    confirmed_delete_keys: confirmedKeys,
    missing_confirm_delete_keys: [],
    catalyst_rows_deleted: deleted,
    deleted_catalyst_row_ids: catalystRowIds,
    pending_approval: false,
    executed: true
  };
}

async function syncUpdateScheduleMirrorFromCatalyst(app, baseId, token, showNo, focusDay, triggerReason) {
  const normalizedTrigger = normalizeTriggerReason(triggerReason);
  if (!canExecuteConfirmDelete(normalizedTrigger)) {
    throw new Error(`sync-update-schedule-mirror requires trigger_reason focus_day_change or cadence; received ${normalizedTrigger || "blank"}`);
  }
  const confirmDelete = await applyConfirmDeleteForBlock(app, baseId, token, "", "", "", normalizedTrigger);
  let catalystRows = await getCatalystUpdateScheduleAllRows(app);
  const confirmedDeleteKeys = new Set((confirmDelete.confirmed_delete_keys || []).map(text).filter(Boolean));
  catalystRows = catalystRows.filter((row) => !confirmedDeleteKeys.has(text(row.update_schedule_key)));
  const activeKeys = new Set(catalystRows.map((row) => text(row.update_schedule_key)).filter(Boolean));
  const updateScheduleRecords = catalystRows.length
    ? await airtableUpsert(
        baseId,
        TABLE_UPDATE_SCHEDULE,
        UPDATE_SCHEDULE_FIELDS.mirror_update_schedule_key,
        catalystRows.map(catalystUpdateScheduleToAirtableFields),
        token
      )
    : [];
  const stale = await deleteUpdateScheduleFocusRowsNotInKeys(baseId, token, "", "", activeKeys);
  const finalCatalystRows = await getCatalystUpdateScheduleAllRows(app);
  const finalAirtableRows = await airtableListAllUpdateScheduleRows(baseId, token, "", "");
  const finalConfirmDeleteRows = await airtableListConfirmedDeleteRows(baseId, token, "", "", "");
  const parity = updateScheduleMirrorParity(finalCatalystRows, finalAirtableRows);
  return {
    ok: parity.ok && finalConfirmDeleteRows.length === 0,
    action: "sync-update-schedule-mirror",
    source: TABLE_CATALYST_UPDATE_SCHEDULE,
    target: "update_schedule",
    show_no: Number(showNo),
    focus_day: yyyymmddToIso(focusDay),
    mirror_scope: "full-table",
    trigger_reason: normalizedTrigger,
    confirm_delete: confirmDelete,
    update_schedule_upserts: updateScheduleRecords.length,
    stale_update_schedule_rows: stale.stale_update_schedule_rows,
    stale_update_schedule_deleted: stale.stale_update_schedule_deleted,
    catalyst_count: parity.catalyst_count,
    airtable_count: parity.airtable_count,
    confirm_delete_rows_after: finalConfirmDeleteRows.length,
    mirror_parity: parity,
    update_schedule_staging_touched: false,
    downstream_run: false
  };
}

async function getFocusDay(baseId, showNo, token, explicitFocusDay) {
  const direct = yyyymmddToIso(explicitFocusDay);
  if (direct) return direct;
  const shows = await airtableList(baseId, "shows", `{show_no}=${Number(showNo)}`, token);
  const focusDay = yyyymmddToIso(shows[0]?.focus_day);
  if (!focusDay) throw new Error(`No focus_day found in Airtable shows for show_no=${showNo}`);
  return focusDay;
}

function selectBatch(rows, now, batchSize, windowMinutes, slotIndexInput) {
  const totalSlots = Math.max(1, Math.ceil(rows.length / batchSize));
  const slotMinutes = Math.max(1, Math.floor(windowMinutes / totalSlots));
  const autoSlot = Math.min(totalSlots - 1, Math.floor(now.getUTCMinutes() / slotMinutes));
  const slotIndex = Math.max(0, Math.min(totalSlots - 1, asNumber(slotIndexInput, autoSlot)));
  const offset = slotIndex * batchSize;
  return {
    total_slots: totalSlots,
    slot_minutes: slotMinutes,
    slot_index: slotIndex,
    offset,
    selected: rows.slice(offset, offset + batchSize)
  };
}

function requestedRingDayNos(query, body) {
  const raw = text(query.get("ring_day_no") || body.ring_day_no || query.get("ring_day_nos") || body.ring_day_nos);
  if (!raw) return new Set();
  return new Set(raw.split(",").map((value) => Number(text(value))).filter((value) => Number.isFinite(value) && value > 0));
}

async function fetchRaw(syncUrl, showNo, ringDayNo) {
  const probeParts = String(syncUrl || "").split("|");
  const probeMode = probeParts.includes("bootstrap-probe");
  const cookie = `HscomShowNo=${showNo}`;
  if (probeMode) {
    return {
      ok: true,
      source: "bootstrap-probe",
      responses: [{
        status: 200,
        content_type: "application/json",
        raw: JSON.stringify({
          bootstrap_skipped: true,
          reason: "update_schedule.php accepts direct POST with HscomShowNo cookie",
          cookie_names: ["HscomShowNo"]
        })
      }]
    };
  }
  const headers = {
    "accept": "application/json, text/javascript, */*; q=0.01",
    "accept-encoding": "identity",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    "connection": "close",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "origin": HORSESHOWING_BASE_URL,
    "referer": `${HORSESHOWING_BASE_URL}/schedule.php`,
    "sec-ch-ua": "\"Microsoft Edge\";v=\"149\", \"Chromium\";v=\"149\", \"Not)A;Brand\";v=\"24\"",
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": "\"Android\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36",
    "x-requested-with": "XMLHttpRequest",
    "cookie": cookie || `HscomShowNo=${showNo}`
  };
  const body = new URLSearchParams({ show_no: showNo, ring_day_no: ringDayNo }).toString();
  const response = await requestText(`${HORSESHOWING_BASE_URL}/update_schedule.php`, {
    method: "POST",
    headers,
    body
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`update_schedule.php HTTP ${response.status}: ${raw.slice(0, 300)}`);
  if (!raw) throw new Error(`update_schedule.php returned empty raw ring_day_no=${ringDayNo}`);
  return {
    ok: true,
    source: "update_schedule.php",
    responses: [{
      status: response.status,
      content_type: response.headers.get("content-type"),
      raw
    }]
  };
}

async function requestText(url, options = {}) {
  return requestTextViaHttps(url, options);
}

function requestTextViaHttps(url, options) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers["content-length"] && !headers["Content-Length"]) {
      headers["content-length"] = Buffer.byteLength(String(options.body));
    }
    const req = https.request({
      protocol: parsed.protocol,
      method: options.method || "GET",
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`,
      family: 4,
      timeout: UPSTREAM_TIMEOUT_MS,
      headers
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => resolve({
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        headers: { get: (name) => res.headers[String(name).toLowerCase()] || null },
        text: async () => raw
      }));
    });
    req.on("timeout", () => req.destroy(new Error(`https timeout ${options.method || "GET"} ${parsed.pathname}`)));
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function writeRunLog(baseId, token, detail) {
  const now = new Date().toISOString();
  const logKey = [
    "fetch-update-schedule-raw",
    detail.show_no,
    detail.focus_day,
    `slot-${detail.slot_index}`,
    `ring-day-${detail.ring_day_no}`
  ].join("|");
  const payload = {
    show_no: Number(detail.show_no),
    focus_day: detail.focus_day,
    slot_index: detail.slot_index,
    total_slots: detail.total_slots,
    selected_count: detail.selected_count,
    ring_day_no: detail.ring_day_no,
    ring_no: detail.ring_no,
    ring_name: detail.ring_name,
    ISO: detail.ISO,
    raw_length: detail.raw_length,
    ok: detail.ok,
    error: detail.error || null
  };
  return airtableCreate(baseId, TABLE_WEC_LOGS, {
    [WEC_LOG_FIELDS.log_key_run]: `${logKey}|${now}`,
    [WEC_LOG_FIELDS.log_key]: logKey,
    [WEC_LOG_FIELDS.workflow_lanes]: "Core",
    [WEC_LOG_FIELDS.log_type]: "core_update_schedule",
    [WEC_LOG_FIELDS.check_name]: "fetch-update-schedule-raw",
    [WEC_LOG_FIELDS.show_no]: Number(detail.show_no),
    [WEC_LOG_FIELDS.focus_day]: detail.focus_day,
    [WEC_LOG_FIELDS.status]: detail.ok ? "ok" : "error",
    [WEC_LOG_FIELDS.records_seen]: detail.raw_length ? 1 : 0,
    [WEC_LOG_FIELDS.records_changed]: detail.raw_length || 0,
    [WEC_LOG_FIELDS.summary]: detail.ok
      ? `ring_day_no ${detail.ring_day_no} raw_length ${detail.raw_length}`
      : `ring_day_no ${detail.ring_day_no} failed: ${detail.error}`,
    [WEC_LOG_FIELDS.payload_json]: JSON.stringify(payload, null, 2),
    [WEC_LOG_FIELDS.created_at]: now
  }, token);
}

function htmlDecode(value) {
  return text(value)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function readAttr(tag, name) {
  const match = tag.match(new RegExp(`${name}="([\\s\\S]*?)"`, "i"));
  return match ? htmlDecode(match[1]) : "";
}

function compactClassName(label) {
  const raw = htmlDecode(label);
  const close = raw.indexOf(")");
  return close >= 0 ? raw.slice(close + 1).trim() : raw.trim();
}

function classNumber(label) {
  const match = htmlDecode(label).match(/^\s*(\d+)\)/);
  return match ? Number(match[1]) : null;
}

function normalizeTime(value) {
  const raw = text(value).toLowerCase();
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])m?$/);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = match[2] || "00";
  const meridiem = match[3];
  if (meridiem === "p" && hour !== 12) hour += 12;
  if (meridiem === "a" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}:00`;
}

function displayTime(value) {
  const raw = text(value).toLowerCase();
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])m?$/);
  if (!match) return raw ? raw : "check time";
  const hour = Number(match[1]);
  const minute = match[2] || "00";
  return `${hour}:${minute}${match[3].toUpperCase()}`;
}

function classPayout(label) {
  const match = htmlDecode(label).match(/\$[\d,]+/);
  return match ? match[0] : "";
}

function updateScheduleKey(showNo, focusDay, ringDayNo, ringNo, classNo) {
  const parts = [showNo, yyyymmddToIso(focusDay), ringDayNo, ringNo, classNo].map((value) => text(value));
  if (parts.some((part) => !part)) {
    throw new Error(`Cannot form update_schedule key from show_no|focus_day|ring_day_no|ring_no|class_no: ${parts.join("|")}`);
  }
  return parts.join("|");
}

function parseUpdateScheduleRaw(raw, context) {
  const rows = [];
  const pattern = /<h3\b[\s\S]*?\bring_evt\b[\s\S]*?>/gi;
  let match;
  while ((match = pattern.exec(raw || ""))) {
    const tag = match[0];
    const eventId = Number(readAttr(tag, "id")) || null;
    const classNoRaw = readAttr(tag, "data-class");
    const classNo = classNoRaw === "" ? null : Number(classNoRaw);
    const eventName = readAttr(tag, "data-name");
    const focusDay = yyyymmddToIso(context.ISO || context.YYYYMMDD) || null;
    const key = updateScheduleKey(context.show_no, focusDay, context.ring_day_no, context.ring_no, classNo);
    const row = {
      [STAGING_FIELDS.staging_key]: key,
      [STAGING_FIELDS.show_no]: Number(context.show_no),
      [STAGING_FIELDS.class_no]: Number.isFinite(classNo) ? classNo : null,
      [STAGING_FIELDS.ring_day_no]: Number(context.ring_day_no),
      [STAGING_FIELDS.ring_no]: Number(context.ring_no) || null,
      [STAGING_FIELDS.ring_name]: text(context.ring_name),
      [STAGING_FIELDS.date_text]: text(context.date_text),
      [STAGING_FIELDS.iso_date]: focusDay,
      [STAGING_FIELDS.event_id]: eventId,
      [STAGING_FIELDS.event_name]: eventName,
      [STAGING_FIELDS.class_name]: compactClassName(eventName),
      [STAGING_FIELDS.time_text]: readAttr(tag, "data-time"),
      [STAGING_FIELDS.entry_count]: Number(readAttr(tag, "data-n_entries")) || 0,
      [STAGING_FIELDS.event_type]: Number(readAttr(tag, "data-re_type")) || null,
      [STAGING_FIELDS.oc_id]: Number(readAttr(tag, "data-oc_id")) || 0,
      [STAGING_FIELDS.live_flag]: Number(readAttr(tag, "data-live")) || 0,
      [STAGING_FIELDS.review_status]: "new",
      [STAGING_FIELDS.source]: "update_schedule.php",
      [STAGING_FIELDS.inactive]: false,
      [STAGING_FIELDS.last_run_time]: new Date().toISOString()
    };
    if (Number.isFinite(classNo) && classNo > 0) {
      row[STAGING_FIELDS.source_key] = key;
    }
    rows.push(row);
  }
  return rows;
}

function stagingToUpdateScheduleRows(stagingRows) {
  return stagingRows.map((row) => ({
    [UPDATE_SCHEDULE_FIELDS.mirror_update_schedule_key]: row[STAGING_FIELDS.staging_key],
    [UPDATE_SCHEDULE_FIELDS.show_no]: row[STAGING_FIELDS.show_no],
    [UPDATE_SCHEDULE_FIELDS.class_no]: row[STAGING_FIELDS.class_no],
    [UPDATE_SCHEDULE_FIELDS.ring_day_no]: row[STAGING_FIELDS.ring_day_no],
    [UPDATE_SCHEDULE_FIELDS.ring_no]: row[STAGING_FIELDS.ring_no],
    [UPDATE_SCHEDULE_FIELDS.ring_name]: row[STAGING_FIELDS.ring_name],
    [UPDATE_SCHEDULE_FIELDS.date_text]: row[STAGING_FIELDS.date_text],
    [UPDATE_SCHEDULE_FIELDS.iso_date]: row[STAGING_FIELDS.iso_date],
    [UPDATE_SCHEDULE_FIELDS.event_id]: row[STAGING_FIELDS.event_id],
    [UPDATE_SCHEDULE_FIELDS.event_name]: row[STAGING_FIELDS.event_name],
    [UPDATE_SCHEDULE_FIELDS.class_payout]: classPayout(row[STAGING_FIELDS.event_name]),
    [UPDATE_SCHEDULE_FIELDS.class_name]: row[STAGING_FIELDS.class_name],
    [UPDATE_SCHEDULE_FIELDS.time_text]: row[STAGING_FIELDS.time_text],
    [UPDATE_SCHEDULE_FIELDS.entry_count]: row[STAGING_FIELDS.entry_count],
    [UPDATE_SCHEDULE_FIELDS.event_type]: row[STAGING_FIELDS.event_type],
    [UPDATE_SCHEDULE_FIELDS.oc_id]: row[STAGING_FIELDS.oc_id],
    [UPDATE_SCHEDULE_FIELDS.live_flag]: row[STAGING_FIELDS.live_flag],
    [UPDATE_SCHEDULE_FIELDS.source]: "update_schedule.php"
  }));
}

function stagingToCatalystUpdateScheduleRows(stagingRows) {
  return stagingRows.map((row) => {
    const timeText = row[STAGING_FIELDS.time_text];
    const eventName = row[STAGING_FIELDS.event_name];
    return cleanRow({
      update_schedule_key: row[STAGING_FIELDS.staging_key],
      show_no: row[STAGING_FIELDS.show_no],
      ring_day_no: row[STAGING_FIELDS.ring_day_no],
      ring_no: row[STAGING_FIELDS.ring_no],
      ring_name: row[STAGING_FIELDS.ring_name],
      date_text: row[STAGING_FIELDS.date_text],
      class_no: row[STAGING_FIELDS.class_no],
      event_id: row[STAGING_FIELDS.event_id],
      event_name: eventName,
      class_number: classNumber(eventName),
      class_payout: classPayout(eventName),
      class_name: row[STAGING_FIELDS.class_name],
      time_text: timeText,
      class_start_time: normalizeTime(timeText),
      focus_day: row[STAGING_FIELDS.iso_date],
      iso_date: row[STAGING_FIELDS.iso_date],
      entry_count: row[STAGING_FIELDS.entry_count],
      event_type: row[STAGING_FIELDS.event_type],
      oc_id: row[STAGING_FIELDS.oc_id],
      live_flag: row[STAGING_FIELDS.live_flag],
      source_endpoint: "update_schedule.php",
      source_payload: JSON.stringify({
        update_schedule_key: row[STAGING_FIELDS.staging_key],
        show_no: row[STAGING_FIELDS.show_no],
        ring_day_no: row[STAGING_FIELDS.ring_day_no],
        ring_no: row[STAGING_FIELDS.ring_no],
        class_no: row[STAGING_FIELDS.class_no],
        event_id: row[STAGING_FIELDS.event_id],
        event_name: eventName,
        time_text: timeText
      })
    });
  });
}

async function getCatalystUpdateScheduleRows(app, showNo, ringDayNo) {
  const rows = [];
  for (let offset = 0; ; offset += 200) {
    const query = [
      "SELECT ROWID, update_schedule_key, show_no, ring_day_no, ring_no, ring_name, date_text, class_no, event_id, event_name, class_number, class_payout, class_name, time_text, class_start_time, focus_day, iso_date, entry_count, event_type, oc_id, live_flag, source_endpoint, source_payload",
      `FROM ${TABLE_CATALYST_UPDATE_SCHEDULE}`,
      `WHERE show_no = ${zcqlValue(Number(showNo))} AND ring_day_no = ${zcqlValue(Number(ringDayNo))}`,
      `LIMIT 200 OFFSET ${offset}`
    ].join(" ");
    const page = (await app.zcql().executeZCQLQuery(query) || [])
      .map((item) => item?.[TABLE_CATALYST_UPDATE_SCHEDULE])
      .filter(Boolean);
    rows.push(...page);
    if (page.length < 200) break;
  }
  return rows;
}

async function getCatalystUpdateScheduleFocusRows(app, showNo, focusDay) {
  const rows = [];
  const isoFocusDay = yyyymmddToIso(focusDay);
  for (let offset = 0; ; offset += 200) {
    const query = [
      "SELECT ROWID, update_schedule_key, show_no, ring_day_no, ring_no, ring_name, date_text, class_no, event_id, event_name, class_number, class_payout, class_name, time_text, class_start_time, focus_day, iso_date, entry_count, event_type, oc_id, live_flag, source_endpoint, source_payload",
      `FROM ${TABLE_CATALYST_UPDATE_SCHEDULE}`,
      `WHERE show_no = ${zcqlValue(Number(showNo))} AND focus_day = ${zcqlValue(isoFocusDay)}`,
      `LIMIT 200 OFFSET ${offset}`
    ].join(" ");
    const page = (await app.zcql().executeZCQLQuery(query) || [])
      .map((item) => item?.[TABLE_CATALYST_UPDATE_SCHEDULE])
      .filter(Boolean);
    rows.push(...page);
    if (page.length < 200) break;
  }
  return rows;
}

async function getCatalystUpdateScheduleAllRows(app) {
  const rows = [];
  for (let offset = 0; ; offset += 200) {
    const query = [
      "SELECT ROWID, update_schedule_key, show_no, ring_day_no, ring_no, ring_name, date_text, class_no, event_id, event_name, class_number, class_payout, class_name, time_text, class_start_time, focus_day, iso_date, entry_count, event_type, oc_id, live_flag, source_endpoint, source_payload",
      `FROM ${TABLE_CATALYST_UPDATE_SCHEDULE}`,
      `LIMIT 200 OFFSET ${offset}`
    ].join(" ");
    const page = (await app.zcql().executeZCQLQuery(query) || [])
      .map((item) => item?.[TABLE_CATALYST_UPDATE_SCHEDULE])
      .filter(Boolean);
    rows.push(...page);
    if (page.length < 200) break;
  }
  return rows;
}

function catalystUpdateScheduleToAirtableFields(row) {
  return {
    [UPDATE_SCHEDULE_FIELDS.mirror_update_schedule_key]: row.update_schedule_key,
    [UPDATE_SCHEDULE_FIELDS.show_no]: Number(row.show_no),
    [UPDATE_SCHEDULE_FIELDS.class_no]: Number(row.class_no),
    [UPDATE_SCHEDULE_FIELDS.ring_day_no]: Number(row.ring_day_no),
    [UPDATE_SCHEDULE_FIELDS.ring_no]: Number(row.ring_no),
    [UPDATE_SCHEDULE_FIELDS.ring_name]: text(row.ring_name),
    [UPDATE_SCHEDULE_FIELDS.date_text]: text(row.date_text),
    [UPDATE_SCHEDULE_FIELDS.iso_date]: yyyymmddToIso(row.iso_date || row.focus_day),
    [UPDATE_SCHEDULE_FIELDS.event_id]: Number(row.event_id),
    [UPDATE_SCHEDULE_FIELDS.event_name]: text(row.event_name),
    [UPDATE_SCHEDULE_FIELDS.class_payout]: text(row.class_payout),
    [UPDATE_SCHEDULE_FIELDS.class_name]: text(row.class_name),
    [UPDATE_SCHEDULE_FIELDS.time_text]: text(row.time_text),
    [UPDATE_SCHEDULE_FIELDS.entry_count]: Number(row.entry_count),
    [UPDATE_SCHEDULE_FIELDS.event_type]: Number(row.event_type),
    [UPDATE_SCHEDULE_FIELDS.oc_id]: Number(row.oc_id),
    [UPDATE_SCHEDULE_FIELDS.live_flag]: Number(row.live_flag),
    [UPDATE_SCHEDULE_FIELDS.source]: text(row.source_endpoint)
  };
}

function normalizeMirrorValue(value, kind = "") {
  if (kind === "date") return yyyymmddToIso(value);
  return text(value);
}

const UPDATE_SCHEDULE_MIRROR_FIELD_MAP = [
  ["show_no", UPDATE_SCHEDULE_FIELDS.show_no],
  ["class_no", UPDATE_SCHEDULE_FIELDS.class_no],
  ["ring_day_no", UPDATE_SCHEDULE_FIELDS.ring_day_no],
  ["ring_no", UPDATE_SCHEDULE_FIELDS.ring_no],
  ["ring_name", UPDATE_SCHEDULE_FIELDS.ring_name],
  ["date_text", UPDATE_SCHEDULE_FIELDS.date_text],
  ["iso_date", UPDATE_SCHEDULE_FIELDS.iso_date, "date"],
  ["event_id", UPDATE_SCHEDULE_FIELDS.event_id],
  ["event_name", UPDATE_SCHEDULE_FIELDS.event_name],
  ["class_payout", UPDATE_SCHEDULE_FIELDS.class_payout],
  ["class_name", UPDATE_SCHEDULE_FIELDS.class_name],
  ["time_text", UPDATE_SCHEDULE_FIELDS.time_text],
  ["entry_count", UPDATE_SCHEDULE_FIELDS.entry_count],
  ["event_type", UPDATE_SCHEDULE_FIELDS.event_type],
  ["oc_id", UPDATE_SCHEDULE_FIELDS.oc_id],
  ["live_flag", UPDATE_SCHEDULE_FIELDS.live_flag],
  ["source_endpoint", UPDATE_SCHEDULE_FIELDS.source]
];

function catalystMirrorComparable(row) {
  const comparable = {};
  for (const [catalystField, airtableFieldId, kind] of UPDATE_SCHEDULE_MIRROR_FIELD_MAP) {
    comparable[airtableFieldId] = normalizeMirrorValue(row[catalystField], kind);
  }
  return comparable;
}

function airtableMirrorComparable(record) {
  const comparable = {};
  for (const [, airtableFieldId, kind] of UPDATE_SCHEDULE_MIRROR_FIELD_MAP) {
    comparable[airtableFieldId] = normalizeMirrorValue(record[airtableFieldId], kind);
  }
  return comparable;
}

function duplicateKeyReport(rows, keyFn) {
  const counts = new Map();
  for (const row of rows || []) {
    const key = text(keyFn(row));
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));
}

function updateScheduleMirrorParity(catalystRows, airtableRows) {
  const catalystByKey = new Map();
  for (const row of catalystRows || []) {
    const key = text(row.update_schedule_key);
    if (key && !catalystByKey.has(key)) catalystByKey.set(key, row);
  }
  const airtableByKey = new Map();
  for (const record of airtableRows || []) {
    const key = updateScheduleRecordMirrorKey(record);
    if (key && !airtableByKey.has(key)) airtableByKey.set(key, record);
  }
  const catalystKeys = new Set(catalystByKey.keys());
  const airtableKeys = new Set(airtableByKey.keys());
  const missingInAirtable = [...catalystKeys].filter((key) => !airtableKeys.has(key)).sort();
  const extraInAirtable = [...airtableKeys].filter((key) => !catalystKeys.has(key)).sort();
  const mappedFieldMismatches = [];
  for (const key of catalystKeys) {
    if (!airtableByKey.has(key)) continue;
    const catalystComparable = catalystMirrorComparable(catalystByKey.get(key));
    const airtableComparable = airtableMirrorComparable(airtableByKey.get(key));
    const fields = Object.keys(catalystComparable)
      .filter((field) => catalystComparable[field] !== airtableComparable[field]);
    if (fields.length) {
      mappedFieldMismatches.push({
        key,
        fields,
        catalyst: Object.fromEntries(fields.map((field) => [field, catalystComparable[field]])),
        airtable: Object.fromEntries(fields.map((field) => [field, airtableComparable[field]]))
      });
    }
  }
  const catalystDuplicates = duplicateKeyReport(catalystRows, (row) => row.update_schedule_key);
  const airtableDuplicates = duplicateKeyReport(airtableRows, updateScheduleRecordMirrorKey);
  return {
    catalyst_count: (catalystRows || []).length,
    airtable_count: (airtableRows || []).length,
    missing_in_airtable: missingInAirtable,
    extra_in_airtable: extraInAirtable,
    mapped_field_mismatches: mappedFieldMismatches,
    catalyst_duplicate_keys: catalystDuplicates,
    airtable_duplicate_keys: airtableDuplicates,
    ok: missingInAirtable.length === 0
      && extraInAirtable.length === 0
      && mappedFieldMismatches.length === 0
      && catalystDuplicates.length === 0
      && airtableDuplicates.length === 0
      && (catalystRows || []).length === (airtableRows || []).length
  };
}

async function syncCatalystUpdateSchedule(app, showNo, ringDayNo, stagingRows) {
  const existing = new Map((await getCatalystUpdateScheduleRows(app, showNo, ringDayNo))
    .map((row) => [text(row.update_schedule_key), row]));
  const incoming = stagingToCatalystUpdateScheduleRows(stagingRows);
  const activeKeys = new Set(incoming.map((row) => text(row.update_schedule_key)));
  const inserts = [];
  const updates = [];
  const deletes = [];

  for (const row of incoming) {
    const current = existing.get(text(row.update_schedule_key));
    if (!current?.ROWID) {
      inserts.push(row);
      continue;
    }
    const { update_schedule_key, show_no, ring_day_no, ...mutable } = row;
    if (rowChanged(current, mutable)) updates.push({ ...mutable, ROWID: current.ROWID });
  }
  for (const [key, current] of existing.entries()) {
    if (!activeKeys.has(key) && current.ROWID) deletes.push(current.ROWID);
  }

  const table = app.datastore().table(TABLE_CATALYST_UPDATE_SCHEDULE);
  let inserted = 0;
  let updated = 0;
  let deleted = 0;
  for (let i = 0; i < inserts.length; i += 100) {
    const batch = inserts.slice(i, i + 100);
    if (batch.length) {
      await table.insertRows(batch);
      inserted += batch.length;
    }
  }
  for (let i = 0; i < updates.length; i += 100) {
    const batch = updates.slice(i, i + 100);
    if (batch.length) {
      await table.updateRows(batch);
      updated += batch.length;
    }
  }
  for (let i = 0; i < deletes.length; i += 100) {
    const batch = deletes.slice(i, i + 100);
    if (batch.length) {
      await table.deleteRows(batch);
      deleted += batch.length;
    }
  }
  return { existing: existing.size, incoming: incoming.length, inserted, updated, deleted };
}

async function handle(req, res) {
  try {
    setCors(res);
    if ((req.method || "").toUpperCase() === "OPTIONS") return res.end("");
    const query = parseQuery(req);
    const body = await readBody(req);
    const showNo = text(query.get("show_no") || body.show_no);
    if (!showNo) return sendJson(res, 400, { ok: false, error: "show_no required" });
    const baseId = text(process.env.WEC_AIRTABLE_BASE_ID || body.base_id || query.get("base_id") || DEFAULT_BASE_ID);
    const token = text(body.airtable_token || query.get("airtable_token") || process.env.AIRTABLE_TOKEN);
    if (!token) return sendJson(res, 500, { ok: false, error: "missing AIRTABLE_TOKEN fallback" });
    const app = catalyst.initialize(req);

    const focusDay = await getFocusDay(baseId, showNo, token, query.get("focus_day") || body.focus_day);
    const action = text(query.get("action") || body.action);
    const triggerReason = normalizeTriggerReason(query.get("trigger_reason") || body.trigger_reason);
    if (action === "sync-update-schedule-mirror") {
      const result = await syncUpdateScheduleMirrorFromCatalyst(app, baseId, token, showNo, focusDay, triggerReason);
      return sendJson(res, result.ok ? 200 : 409, result);
    }
    if (action === "reset-focus-update-schedule") {
      return sendJson(res, 409, {
        ok: false,
        action,
        error: "legacy reset-focus-update-schedule is disabled; update_schedule_staging must be refreshed from Airtable update_schedule via horseshowing_sync?action=sync-update-schedule-staging-from-mirror",
        update_schedule_staging_touched: false
      });
    }
    if (action === "link-update-schedule-staging-misses") {
      const runTime = new Date().toISOString();
      const stagingFocusRows = await airtableListStagingFocusRows(baseId, token, showNo, focusDay);
      const before = summarizeStagingLinkMisses(stagingFocusRows);
      const beforeFullLock = summarizeFullLock(stagingFocusRows);
      const missRows = stagingFocusRows.filter((row) => Object.values(stagingLinkMisses(row)).some(Boolean));
      const linkResult = missRows.length
        ? await linkLockedStagingRows(baseId, token, showNo, focusDay, missRows)
        : {
          staged_records: stagingFocusRows.length,
          locked: stagingFocusRows.filter((row) => truthy(row[STAGING_FIELDS.lock])).length,
          target: beforeFullLock.full_lock_count,
          linked: 0,
          full_lock_count: beforeFullLock.full_lock_count,
          pause_downstream: beforeFullLock.pause_downstream,
          paused: beforeFullLock.pause_downstream,
          missing: before.missing,
          helper_created: {},
          locked_keys: []
        };
      const lastRunUpdated = await stampStagingLastRun(baseId, token, stagingFocusRows, runTime);
      const afterRows = await airtableListStagingFocusRows(baseId, token, showNo, focusDay);
      const after = summarizeStagingLinkMisses(afterRows);
      const fullLock = summarizeFullLock(afterRows);
      const focusShowRows = await airtableListFocusShowRows(baseId, token, showNo, focusDay);
      const focusShowFullLockCount = await writeFocusShowFullLockCount(baseId, token, focusShowRows, fullLock.full_lock_count);
      return sendJson(res, 200, {
        ok: true,
        action,
        show_no: Number(showNo),
        focus_day: focusDay,
        last_run_time: runTime,
        scanned: stagingFocusRows.length,
        misses_seen: before.rows_with_any_link_miss,
        last_run_time_updated: lastRunUpdated,
        link_result: linkResult,
        before_full_lock: beforeFullLock,
        full_lock: fullLock,
        focus_show_full_lock_count: focusShowFullLockCount,
        after
      });
    }

    const rawProbe = text(query.get("probe") || body.probe);
    const readOnlyRawProbes = new Set(["batch", "raw", "parse"]);
    if (!readOnlyRawProbes.has(rawProbe)) {
      return sendJson(res, 409, {
        ok: false,
        action,
        error: "legacy raw update_schedule_staging writer is disabled; use horseshowing_sync?action=sync-update-schedule-staging-from-mirror",
        update_schedule_staging_touched: false,
        allowed_probes: [...readOnlyRawProbes]
      });
    }
    const requestedBatchSize = Math.max(1, asNumber(query.get("batch_size") || body.batch_size, 1));
    const batchSize = rawProbe === "batch" ? requestedBatchSize : 1;
    const windowMinutes = Math.max(1, asNumber(query.get("window_minutes") || body.window_minutes, 60));
    const ringDays = await airtableList(baseId, "get_ring_days", `{show_no}=${Number(showNo)}`, token);
    const requestedRingDays = requestedRingDayNos(query, body);
    const eligible = ringDays
      .filter((row) => requestedRingDays.size
        ? requestedRingDays.has(Number(row.ring_day_no))
        : yyyymmddToIso(row.ISO || row.YYYYMMDD) === focusDay)
      .sort((a, b) =>
        yyyymmddToIso(a.ISO || a.YYYYMMDD).localeCompare(yyyymmddToIso(b.ISO || b.YYYYMMDD)) ||
        Number(a.ring_no || 0) - Number(b.ring_no || 0) ||
        Number(a.ring_day_no || 0) - Number(b.ring_day_no || 0)
      );
    if (requestedRingDays.size && eligible.length !== requestedRingDays.size) {
      const found = new Set(eligible.map((row) => Number(row.ring_day_no)));
      const missing = [...requestedRingDays].filter((ringDayNo) => !found.has(ringDayNo));
      throw new Error(`Requested ring_day_no not found in get_ring_days for show_no=${showNo}: ${missing.join(",")}`);
    }

    const batch = selectBatch(eligible, new Date(), batchSize, windowMinutes, query.get("slot_index") || body.slot_index);
    if (rawProbe === "batch") {
      return sendJson(res, 200, {
        ok: true,
        probe: "batch",
        show_no: Number(showNo),
        focus_day: focusDay,
        selection_source: requestedRingDays.size ? "request.ring_day_no" : "focus_day",
        total_get_ring_days: ringDays.length,
        eligible_not_past_focus_day: eligible.length,
        selected_count: batch.selected.length,
        selected: batch.selected.map((row) => ({
          ring_day_no: row.ring_day_no,
          ring_no: row.ring_no,
          ring_name: row.ring_name,
          ISO: row.ISO,
          YYYYMMDD: row.YYYYMMDD
        }))
      });
    }
    const syncUrl = text(process.env.HORSESHOWING_SYNC_URL || body.sync_url || query.get("sync_url") || DEFAULT_SYNC_URL);
    let focus_state = { skipped: true };
    const raw_results = [];
    const log_results = [];
    for (const row of batch.selected) {
      const rawPayload = text(body.raw_payload || query.get("raw_payload"));
      const result = rawPayload
        ? {
            ok: true,
            source: "update_schedule.php",
            responses: [{
              status: asNumber(body.raw_status || query.get("raw_status"), 200),
              content_type: text(body.raw_content_type || query.get("raw_content_type") || "text/html; charset=utf-8"),
              raw: rawPayload
            }]
          }
        : await fetchRaw(rawProbe === "bootstrap" ? `${syncUrl}|bootstrap-probe` : syncUrl, showNo, String(row.ring_day_no));
      const rawResult = {
        get_ring_days_record_id: row.record_id,
        ring_day_no: row.ring_day_no,
        ring_no: row.ring_no,
        ring_name: row.ring_name,
        ISO: row.ISO,
        YYYYMMDD: row.YYYYMMDD,
        status: result.responses?.[0]?.status,
        raw_length: text(result.responses?.[0]?.raw).length,
        raw: result.responses?.[0]?.raw || ""
      };
      raw_results.push(rawResult);
      if (query.get("probe") === "raw" || body.probe === "raw") {
        log_results.push({
          ring_day_no: row.ring_day_no,
          raw_length: rawResult.raw_length,
          raw_preview: rawResult.raw.slice(0, 120)
        });
        continue;
      }
      const stagingRows = parseUpdateScheduleRaw(rawResult.raw, {
        show_no: showNo,
        ring_day_no: row.ring_day_no,
        ring_no: row.ring_no,
        ring_name: row.ring_name,
        date_text: row.date_text,
        ISO: row.ISO,
        YYYYMMDD: row.YYYYMMDD
      });
      if (query.get("probe") === "parse" || body.probe === "parse") {
        log_results.push({
          ring_day_no: row.ring_day_no,
          staging_rows: stagingRows.length,
          first_key: stagingRows[0]?.[STAGING_FIELDS.staging_key] || ""
        });
        continue;
      }
      const confirmDelete = await applyConfirmDeleteForBlock(app, baseId, token, showNo, focusDay, row.ring_day_no, triggerReason);
      if (confirmDelete.pending_approval) {
        throw new Error(`confirm_delete rows require allowed trigger_reason focus_day_change or cadence; received ${triggerReason || "blank"}`);
      }
      const confirmedDeleteKeys = new Set((confirmDelete.confirmed_delete_keys || []).map(text).filter(Boolean));
      const mirrorRows = stagingRows.filter((stagingRow) => !confirmedDeleteKeys.has(text(stagingRow[STAGING_FIELDS.staging_key])));
      const rekeyResult = await rekeyExistingStagingRows(baseId, token, showNo, row.ring_day_no, stagingRows);
      const stagingRecords = await airtableUpsert(
        baseId,
        TABLE_UPDATE_SCHEDULE_STAGING,
        STAGING_FIELDS.staging_key,
        stagingRows,
        token
      );
      if (query.get("probe") === "staging-write" || body.probe === "staging-write") {
        log_results.push({
          ring_day_no: row.ring_day_no,
          staging_rows: stagingRows.length,
          rekey: rekeyResult,
          staging_records: stagingRecords.length
        });
        continue;
      }
      if (focus_state.skipped) {
        focus_state = await markStagingFocusState(baseId, token, showNo, focusDay);
      }
      const reconcileResult = await reconcileBlockRows(baseId, token, showNo, row.ring_day_no, stagingRows);
      const catalystResult = await syncCatalystUpdateSchedule(app, showNo, row.ring_day_no, mirrorRows);
      const updateScheduleRecords = await airtableUpsert(
        baseId,
        TABLE_UPDATE_SCHEDULE,
        UPDATE_SCHEDULE_FIELDS.mirror_update_schedule_key,
        stagingToUpdateScheduleRows(mirrorRows),
        token
      );
      const activeMirrorKeys = new Set(mirrorRows.map((stagingRow) => text(stagingRow[STAGING_FIELDS.staging_key])).filter(Boolean));
      const mirrorStaleResult = await deleteUpdateScheduleRowsNotInKeys(baseId, token, showNo, row.ring_day_no, activeMirrorKeys);
      const stagingFocusRows = await airtableListStagingFocusRows(baseId, token, showNo, focusDay);
      const stagingLinkResult = await linkLockedStagingRows(baseId, token, showNo, focusDay, stagingFocusRows);
      if (query.get("probe") === "update-write" || body.probe === "update-write") {
        log_results.push({
          ring_day_no: row.ring_day_no,
          staging_rows: stagingRows.length,
          rekey: rekeyResult,
          staging_records: stagingRecords.length,
          reconcile: reconcileResult,
          mirror_stale: mirrorStaleResult,
          confirm_delete: confirmDelete,
          catalyst: catalystResult,
          update_schedule_records: updateScheduleRecords.length,
          staging_links: stagingLinkResult
        });
        continue;
      }
      if (stagingLinkResult.paused) {
        log_results.push({
          ring_day_no: row.ring_day_no,
          record_id: "",
          staging_rows: stagingRows.length,
          rekey: rekeyResult,
          staging_records: stagingRecords.length,
          reconcile: reconcileResult,
          mirror_stale: mirrorStaleResult,
          confirm_delete: confirmDelete,
          catalyst: catalystResult,
          update_schedule_records: updateScheduleRecords.length,
          paused: "paused_no_locked_staging",
          staging_links: stagingLinkResult
        });
        continue;
      }
      log_results.push({
        ring_day_no: row.ring_day_no,
        record_id: "",
        staging_rows: stagingRows.length,
        rekey: rekeyResult,
        staging_records: stagingRecords.length,
        reconcile: reconcileResult,
        mirror_stale: mirrorStaleResult,
        confirm_delete: confirmDelete,
        catalyst: catalystResult,
        update_schedule_records: updateScheduleRecords.length,
        staging_links: stagingLinkResult
      });
    }

    const finalStagingFocusRows = await airtableListStagingFocusRows(baseId, token, showNo, focusDay);
    const fullLock = summarizeFullLock(finalStagingFocusRows);
    const focusShowRows = await airtableListFocusShowRows(baseId, token, showNo, focusDay);
    const focusShowFullLockCount = await writeFocusShowFullLockCount(baseId, token, focusShowRows, fullLock.full_lock_count);

    return sendJson(res, 200, {
      ok: true,
      source: "airtable.get_ring_days",
      target: "horseshowing_sync.fetch-update-schedule-raw",
      show_no: Number(showNo),
      focus_day: focusDay,
      selection_source: requestedRingDays.size ? "request.ring_day_no" : "focus_day",
      total_get_ring_days: ringDays.length,
      eligible_not_past_focus_day: eligible.length,
      batch_size: batchSize,
      window_minutes: windowMinutes,
      total_slots: batch.total_slots,
      slot_minutes: batch.slot_minutes,
      slot_index: batch.slot_index,
      selected_count: batch.selected.length,
      selected_ring_day_no: batch.selected.map((row) => row.ring_day_no),
      focus_state,
      full_lock: fullLock,
      focus_show_full_lock_count: focusShowFullLockCount,
      log_results,
      raw_results
    });
  } catch (error) {
    return sendJson(res, 200, { ok: false, error: error.message, stack: error.stack });
  }
}

module.exports = handle;
