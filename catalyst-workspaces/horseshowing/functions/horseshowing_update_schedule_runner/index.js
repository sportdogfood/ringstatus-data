const DEFAULT_BASE_ID = "app6XS1RvsPNRT6os";
const DEFAULT_SYNC_URL = "https://horseshowing-700800454.development.catalystserverless.com/server/horseshowing_sync/";
const HORSESHOWING_BASE_URL = "https://www.horseshowing.com";
const UPSTREAM_TIMEOUT_MS = 20000;
const https = require("https");
const TABLE_WEC_LOGS = "tblaA0n7QD7s5lIYm";
const TABLE_UPDATE_SCHEDULE_STAGING = "tblzsoU59zmYxhPah";
const TABLE_UPDATE_SCHEDULE = "tblzPWt9G3VBVqVi6";
const TABLE_CLASS_START_TIMES = "tblgOxoLf6r3xGWxB";
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
  classes: "fld57nJX8y2bOTMcw",
  ring_days: "fldTVsQTkDsDvKyPz",
  rings: "fldz3HXUIVufTOlYm",
  events: "flds4Y7IP8eN7JrP1",
  show_days: "fldiW1dfQrPSFiNvv"
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
  class_name: "fldZztQVbPJA3Gviv",
  time_text: "fldoSFAVNYPiSdE2o",
  entry_count: "fld2m7POOlVQ4xCZf",
  event_type: "fldA9yOctFKtbTVti",
  oc_id: "fldg19d9ACe9bGP08",
  live_flag: "fldyzCrNuYLAFxh3N",
  source: "fldI9ua5MaB0R86NM",
  mirror_update_schedule_key: "fldy6FUgG1MkCL5tf"
};
const CLASS_START_FIELDS = {
  class_start_key: "fldO5aTUlni7JdMIX",
  class_no: "fldKYQonbwrWF5uCw",
  show_no: "fldgDifl9IQuoeYyn",
  focus_day: "fld3QiD3GGyeiiJBE",
  ring_no: "fld2W7zzZA46trKPW",
  ring_day_no: "flde2MALK8ybCvcGs",
  class_number: "fld6N7n5mYGdIqm9f",
  class_name: "fldnWNFxsrFAQh4oB",
  class_start_time: "fldrgRZOX43NJyC41",
  display_time: "fld2gZEInYk2vkRBk",
  entry_count: "fldjFVCkr22lXinWd",
  source: "fldeQ7UHJgPO9P8m4",
  last_synced_at: "fld8eg6NkDv79UkVD",
  class_start_key_mirror: "fldiDX0xpa4dfSaLm",
  status: "fldocBXrphhGAq2TN"
};

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

function airtableString(value) {
  return text(value).replace(/'/g, "\\'");
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
        [STAGING_FIELDS.source_key]: newKey
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

async function resetFocusUpdateSchedule(baseId, token, showNo, focusDay) {
  const [stagingRows, updateRows] = await Promise.all([
    airtableListStagingFocusRows(baseId, token, showNo, focusDay),
    airtableListUpdateScheduleFocusRows(baseId, token, showNo, focusDay)
  ]);
  const [stagingDeleted, updateDeleted] = await Promise.all([
    airtableDelete(baseId, TABLE_UPDATE_SCHEDULE_STAGING, stagingRows.map((record) => record.record_id), token),
    airtableDelete(baseId, TABLE_UPDATE_SCHEDULE, updateRows.map((record) => record.record_id), token)
  ]);
  return {
    show_no: Number(showNo),
    focus_day: yyyymmddToIso(focusDay),
    update_schedule_seen: updateRows.length,
    update_schedule_deleted: updateDeleted.length,
    update_schedule_staging_seen: stagingRows.length,
    update_schedule_staging_deleted: stagingDeleted.length
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

async function linkLockedStagingRows(baseId, token, showNo, stagingRows) {
  const keys = (stagingRows || []).map((row) => row[STAGING_FIELDS.staging_key]);
  const stagingRecords = await airtableListByKeys(baseId, "update_schedule_staging", "staging_key", keys, token);
  const sourceByKey = stagingRowByKey(stagingRows);
  const sourceRows = stagingRecords.map((record) => sourceByKey.get(text(record.staging_key))).filter(Boolean);
  const helperCreated = await ensureStagingHelpers(baseId, token, sourceRows);
  const [
    showRows,
    classRows,
    ringDayRows,
    ringRows,
    eventRows,
    showDayRows
  ] = await Promise.all([
    airtableList(baseId, "shows", `{show_no}=${Number(showNo)}`, token),
    airtableList(baseId, "classes", "", token),
    airtableList(baseId, "ring_days", "", token),
    airtableList(baseId, "rings", "", token),
    airtableList(baseId, "events", "", token),
    airtableList(baseId, "show_days", "", token)
  ]);
  const helpers = {
    shows: indexBy(showRows, "show_no"),
    classes: indexBy(classRows, "class_no"),
    ring_days: indexBy(ringDayRows, "ring_day_no"),
    rings: indexBy(ringRows, "ring_no"),
    events: indexBy(eventRows, "event_id"),
    show_days: indexBy(showDayRows, "show_day")
  };
  const missing = {
    shows: 0,
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
      source[STAGING_FIELDS.ring_no],
      source[STAGING_FIELDS.event_id],
      source[STAGING_FIELDS.class_no]
    );
    const showId = helpers.shows.get(text(source[STAGING_FIELDS.show_no]));
    const classNo = Number(source[STAGING_FIELDS.class_no]);
    const expectsClass = Number.isFinite(classNo) && classNo > 0;
    const classId = expectsClass ? helpers.classes.get(text(source[STAGING_FIELDS.class_no])) : "";
    const ringDayId = helpers.ring_days.get(text(source[STAGING_FIELDS.ring_day_no]));
    const ringId = helpers.rings.get(text(source[STAGING_FIELDS.ring_no]));
    const eventId = helpers.events.get(text(source[STAGING_FIELDS.event_id]));
    const showDayId = helpers.show_days.get(showDayKey(source[STAGING_FIELDS.iso_date]));
    if (!showId) missing.shows += 1;
    if (expectsClass && !classId) missing.classes += 1;
    if (!ringDayId) missing.ring_days += 1;
    if (!ringId) missing.rings += 1;
    if (!eventId) missing.events += 1;
    if (!showDayId) missing.show_days += 1;
    updates.push({
      id: record.record_id,
      fields: {
        ...(expectedKey && text(record[STAGING_FIELDS.staging_key]) !== expectedKey ? { [STAGING_FIELDS.staging_key]: expectedKey } : {}),
        ...(expectedKey && text(record[STAGING_FIELDS.source_key]) !== expectedKey ? { [STAGING_FIELDS.source_key]: expectedKey } : {}),
        ...(showId ? { [STAGING_FIELDS.shows]: [showId] } : {}),
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
    source[STAGING_FIELDS.ring_no],
    source[STAGING_FIELDS.event_id],
    source[STAGING_FIELDS.class_no]
  )).filter(Boolean));
  return {
    staged_records: stagingRecords.length,
    locked: stagingRecords.filter((record) => truthy(record[STAGING_FIELDS.lock])).length,
    target: lockedSources.length,
    linked: result.length,
    paused: lockedSources.length === 0,
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

async function fetchRaw(syncUrl, showNo, ringDayNo) {
  const probeParts = String(syncUrl || "").split("|");
  const probeMode = probeParts.includes("bootstrap-probe");
  const htmlHeaders = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-encoding": "identity",
    "accept-language": "en-US,en;q=0.9",
    "connection": "close",
    "referer": `${HORSESHOWING_BASE_URL}/showsel.php`,
    "user-agent": "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36",
    "cookie": `HscomShowNo=${showNo}`
  };
  const showResponse = await requestText(`${HORSESHOWING_BASE_URL}/show.php?show=${encodeURIComponent(showNo)}`, {
    method: "GET",
    headers: htmlHeaders
  });
  let cookie = mergeCookies(`HscomShowNo=${showNo}`, setCookieValues(showResponse));
  const scheduleResponse = await requestText(`${HORSESHOWING_BASE_URL}/schedule.php`, {
    method: "GET",
    headers: {
      ...htmlHeaders,
      "referer": `${HORSESHOWING_BASE_URL}/show.php?show=${encodeURIComponent(showNo)}`,
      "cookie": cookie
    }
  });
  cookie = mergeCookies(cookie, setCookieValues(scheduleResponse));
  if (probeMode) {
    return {
      ok: true,
      source: "bootstrap-probe",
      responses: [{
        status: scheduleResponse.status,
        content_type: scheduleResponse.headers.get("content-type"),
        raw: JSON.stringify({
          show_status: showResponse.status,
          schedule_status: scheduleResponse.status,
          show_set_cookie_count: setCookieValues(showResponse).length,
          schedule_set_cookie_count: setCookieValues(scheduleResponse).length,
          cookie_names: cookie.split(";").map((part) => part.trim().split("=")[0]).filter(Boolean)
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch {
    const { signal, ...fallbackOptions } = options;
    return requestTextViaHttps(url, fallbackOptions);
  } finally {
    clearTimeout(timeout);
  }
}

function requestTextViaHttps(url, options) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      protocol: parsed.protocol,
      method: options.method || "GET",
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`,
      family: 4,
      timeout: UPSTREAM_TIMEOUT_MS,
      headers: options.headers || {}
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

function updateScheduleKey(showNo, ringNo, eventId, classNo) {
  const parts = [showNo, ringNo, eventId, classNo].map((value) => text(value));
  if (parts.some((part) => !part)) {
    throw new Error(`Cannot form update_schedule key from show_no|ring_no|event_id|class_no: ${parts.join("|")}`);
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
    const key = updateScheduleKey(context.show_no, context.ring_no, eventId, classNo);
    const row = {
      [STAGING_FIELDS.staging_key]: key,
      [STAGING_FIELDS.show_no]: Number(context.show_no),
      [STAGING_FIELDS.class_no]: Number.isFinite(classNo) ? classNo : null,
      [STAGING_FIELDS.ring_day_no]: Number(context.ring_day_no),
      [STAGING_FIELDS.ring_no]: Number(context.ring_no) || null,
      [STAGING_FIELDS.ring_name]: text(context.ring_name),
      [STAGING_FIELDS.date_text]: text(context.date_text),
      [STAGING_FIELDS.iso_date]: yyyymmddToIso(context.ISO || context.YYYYMMDD) || null,
      [STAGING_FIELDS.event_id]: eventId,
      [STAGING_FIELDS.event_name]: eventName,
      [STAGING_FIELDS.class_name]: compactClassName(eventName),
      [STAGING_FIELDS.time_text]: readAttr(tag, "data-time"),
      [STAGING_FIELDS.entry_count]: Number(readAttr(tag, "data-n_entries")) || 0,
      [STAGING_FIELDS.event_type]: Number(readAttr(tag, "data-re_type")) || null,
      [STAGING_FIELDS.oc_id]: Number(readAttr(tag, "data-oc_id")) || 0,
      [STAGING_FIELDS.live_flag]: Number(readAttr(tag, "data-live")) || 0,
      [STAGING_FIELDS.review_status]: "new",
      [STAGING_FIELDS.source_key]: key,
      [STAGING_FIELDS.source]: "update_schedule.php",
      [STAGING_FIELDS.inactive]: false
    };
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
    [UPDATE_SCHEDULE_FIELDS.class_name]: row[STAGING_FIELDS.class_name],
    [UPDATE_SCHEDULE_FIELDS.time_text]: row[STAGING_FIELDS.time_text],
    [UPDATE_SCHEDULE_FIELDS.entry_count]: row[STAGING_FIELDS.entry_count],
    [UPDATE_SCHEDULE_FIELDS.event_type]: row[STAGING_FIELDS.event_type],
    [UPDATE_SCHEDULE_FIELDS.oc_id]: row[STAGING_FIELDS.oc_id],
    [UPDATE_SCHEDULE_FIELDS.live_flag]: row[STAGING_FIELDS.live_flag],
    [UPDATE_SCHEDULE_FIELDS.source]: "update_schedule.php"
  }));
}

function stagingToClassStartRows(stagingRows, syncedAt) {
  return stagingRows
    .filter((row) => Number(row[STAGING_FIELDS.class_no]) > 0)
    .map((row) => {
      const focusDay = row[STAGING_FIELDS.iso_date];
      const key = updateScheduleKey(
        row[STAGING_FIELDS.show_no],
        row[STAGING_FIELDS.ring_no],
        row[STAGING_FIELDS.event_id],
        row[STAGING_FIELDS.class_no]
      );
      return {
        [CLASS_START_FIELDS.class_start_key]: key,
        [CLASS_START_FIELDS.class_start_key_mirror]: key,
        [CLASS_START_FIELDS.show_no]: row[STAGING_FIELDS.show_no],
        [CLASS_START_FIELDS.focus_day]: focusDay,
        [CLASS_START_FIELDS.ring_no]: row[STAGING_FIELDS.ring_no],
        [CLASS_START_FIELDS.ring_day_no]: String(row[STAGING_FIELDS.ring_day_no]),
        [CLASS_START_FIELDS.class_no]: row[STAGING_FIELDS.class_no],
        [CLASS_START_FIELDS.class_number]: classNumber(row[STAGING_FIELDS.event_name]),
        [CLASS_START_FIELDS.class_name]: row[STAGING_FIELDS.class_name],
        [CLASS_START_FIELDS.class_start_time]: normalizeTime(row[STAGING_FIELDS.time_text]),
        [CLASS_START_FIELDS.display_time]: displayTime(row[STAGING_FIELDS.time_text]),
        [CLASS_START_FIELDS.entry_count]: row[STAGING_FIELDS.entry_count],
        [CLASS_START_FIELDS.source]: "update_schedule.php",
        [CLASS_START_FIELDS.last_synced_at]: syncedAt,
        [CLASS_START_FIELDS.status]: row[STAGING_FIELDS.time_text] ? "upcoming" : "check_time"
      };
    });
}

async function handle(req, res) {
  try {
    setCors(res);
    if ((req.method || "").toUpperCase() === "OPTIONS") return res.end("");
    const query = parseQuery(req);
    const body = await readBody(req);
    const showNo = text(query.get("show_no") || body.show_no || "14906");
    const baseId = text(process.env.WEC_AIRTABLE_BASE_ID || body.base_id || query.get("base_id") || DEFAULT_BASE_ID);
    const token = text(body.airtable_token || query.get("airtable_token") || process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_WEC_TOKEN);
    if (!token) return sendJson(res, 500, { ok: false, error: "missing AIRTABLE_TOKEN fallback" });

    const focusDay = await getFocusDay(baseId, showNo, token, query.get("focus_day") || body.focus_day);
    const action = text(query.get("action") || body.action);
    if (action === "reset-focus-update-schedule") {
      const reset = await resetFocusUpdateSchedule(baseId, token, showNo, focusDay);
      return sendJson(res, 200, { ok: true, action, ...reset });
    }

    const batchSize = Math.max(1, asNumber(query.get("batch_size") || body.batch_size, 1));
    const windowMinutes = Math.max(1, asNumber(query.get("window_minutes") || body.window_minutes, 60));
    const ringDays = await airtableList(baseId, "get_ring_days", `{show_no}=${Number(showNo)}`, token);
    const eligible = ringDays
      .filter((row) => yyyymmddToIso(row.ISO || row.YYYYMMDD) >= focusDay)
      .sort((a, b) =>
        yyyymmddToIso(a.ISO || a.YYYYMMDD).localeCompare(yyyymmddToIso(b.ISO || b.YYYYMMDD)) ||
        Number(a.ring_no || 0) - Number(b.ring_no || 0) ||
        Number(a.ring_day_no || 0) - Number(b.ring_day_no || 0)
      );

    const batch = selectBatch(eligible, new Date(), batchSize, windowMinutes, query.get("slot_index") || body.slot_index);
    if (query.get("probe") === "batch" || body.probe === "batch") {
      return sendJson(res, 200, {
        ok: true,
        probe: "batch",
        show_no: Number(showNo),
        focus_day: focusDay,
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
    const rawProbe = query.get("probe") || body.probe;
    const shouldMarkFocusState = query.get("mark_focus_state") === "1" || body.mark_focus_state === "1";
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
      if (shouldMarkFocusState && focus_state.skipped) {
        focus_state = await markStagingFocusState(baseId, token, showNo, focusDay);
      }
      const reconcileResult = await reconcileBlockRows(baseId, token, showNo, row.ring_day_no, stagingRows);
      const updateScheduleRecords = await airtableUpsert(
        baseId,
        TABLE_UPDATE_SCHEDULE,
        UPDATE_SCHEDULE_FIELDS.mirror_update_schedule_key,
        stagingToUpdateScheduleRows(stagingRows),
        token
      );
      const stagingFocusRows = await airtableListStagingFocusRows(baseId, token, showNo, focusDay);
      const stagingLinkResult = await linkLockedStagingRows(baseId, token, showNo, stagingFocusRows);
      if (query.get("probe") === "update-write" || body.probe === "update-write") {
        log_results.push({
          ring_day_no: row.ring_day_no,
          staging_rows: stagingRows.length,
          rekey: rekeyResult,
          staging_records: stagingRecords.length,
          reconcile: reconcileResult,
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
          update_schedule_records: updateScheduleRecords.length,
          class_start_records: 0,
          paused: "paused_no_locked_staging",
          staging_links: stagingLinkResult
        });
        continue;
      }
      const syncedAt = new Date().toISOString();
      const lockedKeys = new Set(stagingLinkResult.locked_keys || []);
      const classStartRows = stagingToClassStartRows(
        stagingRows.filter((stagingRow) => lockedKeys.has(text(stagingRow[STAGING_FIELDS.staging_key]))),
        syncedAt
      );
      const classStartRecords = await airtableUpsert(
        baseId,
        TABLE_CLASS_START_TIMES,
        CLASS_START_FIELDS.class_start_key,
        classStartRows,
        token
      );
      if (query.get("probe") === "class-start-write" || body.probe === "class-start-write") {
        log_results.push({
          ring_day_no: row.ring_day_no,
          staging_rows: stagingRows.length,
          rekey: rekeyResult,
          staging_records: stagingRecords.length,
          reconcile: reconcileResult,
          update_schedule_records: updateScheduleRecords.length,
          class_start_records: classStartRecords.length,
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
        update_schedule_records: updateScheduleRecords.length,
        class_start_records: classStartRecords.length,
        staging_links: stagingLinkResult
      });
    }

    return sendJson(res, 200, {
      ok: true,
      source: "airtable.get_ring_days",
      target: "horseshowing_sync.fetch-update-schedule-raw",
      show_no: Number(showNo),
      focus_day: focusDay,
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
      log_results,
      raw_results
    });
  } catch (error) {
    return sendJson(res, 200, { ok: false, error: error.message, stack: error.stack });
  }
}

module.exports = handle;
