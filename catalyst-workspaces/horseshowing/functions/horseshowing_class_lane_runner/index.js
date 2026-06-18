const catalyst = require("zcatalyst-sdk-node");
const {
  buildClassStartRows,
  matchGetOrdersToClassStart,
  buildClassAlerts,
  buildEntryAlerts,
  truthy,
  airtableRecordLink,
  airtableRecordLinks,
  logTypeForAction,
  compareKeySets
} = require("./lane_core");

const DEFAULT_BASE_ID = "app6XS1RvsPNRT6os";
const TABLES = {
  catalystClassStartTimes: "hs_class_start_times",
  catalystClassOog: "hs_class_oog",
  airtableFocusShow: "tblQldkP8wwIRxd4z",
  airtableStaging: "tblzsoU59zmYxhPah",
  airtableClassStartTimes: "tblgOxoLf6r3xGWxB",
  airtableClassOog: "tblgUbX5n8GIuiqUI",
  airtableGetOrders: "tblxaVS0dtetxjiGZ",
  airtableEntryGoTimes: "tblj1qWXAUS79jijF",
  airtableAlertTemplates: "tblcHUmGzoWFOTvx2",
  airtableAlerts: "tblqkxLPy9zZ2FI6z",
  airtableLogs: "tblaA0n7QD7s5lIYm"
};

const FOCUS_SHOW_FIELDS = {
  show_no: "fldZ1Ym2XNz9IYbBo",
  focus_day: "fldW9urR1cuWf1K96",
  active: "fldHqX6c9tVwc4WgH",
  is_pause: "fldgWn3BIdGzcGow1"
};

const STAGING_FIELDS = {
  staging_key: "fldFBo8SVsESz3Lm9",
  show_no: "fldfMmNiM6yiZbp8O",
  class_no: "flduv43XDZA8Z2rO4",
  ring_day_no: "fldyJ89RRtoic3F8m",
  ring_no: "fldivIFX6Mi3HEFH5",
  ring_name: "fldBlOdFMhDE6pwcs",
  iso_date: "fld6RUZaBhxh0plgf",
  event_id: "fld5prDB3w7mdg3JR",
  event_name: "flde1tofvuV34iKc6",
  class_name: "fldvV3xLV9PduvCrB",
  time_text: "fld2EahZkPs2SSVfN",
  entry_count: "fldsiU6NKYacpz8CT",
  full_lock: "fldL8UsgATV34je1y"
};

const CLASS_START_FIELDS = {
  class_start_key: "fldO5aTUlni7JdMIX",
  update_schedule_staging: "fldSRIxFxLt8Tm7vp",
  shows: "fldw723bXNUSCqRgl",
  show_no: "fldgDifl9IQuoeYyn",
  ring_no: "fld2W7zzZA46trKPW",
  rings: "fldIylu3s86XMkyVF",
  event_id: "fldiS6GqGV9SM0lyt",
  class_no: "fldKYQonbwrWF5uCw",
  classes: "fldl8fAPABhnzoHhn",
  focus_day: "fld3QiD3GGyeiiJBE",
  ring_day_no: "flde2MALK8ybCvcGs",
  ring_days: "fld8dzETvNnQUf2Mv",
  class_number: "fld6N7n5mYGdIqm9f",
  class_name: "fldnWNFxsrFAQh4oB",
  class_start_time: "fldrgRZOX43NJyC41",
  display_time: "fld2gZEInYk2vkRBk",
  entry_count: "fldjFVCkr22lXinWd",
  n_gone: "fldg8iT6uzTgpvtfV",
  n_to_go: "fldkcq0SOeLqyefZp",
  elapsed_seconds: "fldCYl4xgMaN8zxO4",
  source: "fldeQ7UHJgPO9P8m4",
  last_synced_at: "fld8eg6NkDv79UkVD",
  current_entry_no: "flddAePIJBIJdejM2",
  current_horse: "fldPSn9H8UTk6apuR",
  live_source: "fld2qnjoEpj0YNNbr",
  status: "fldocBXrphhGAq2TN",
  class_oog: "fldeOgjlzJtR5f0VO",
  focus_show: "fldJe99IYjIqfrrTG"
};

const CLASS_OOG_FIELDS = {
  show_no: "fldDXivEZ0eidEJ6b",
  focus_day: "fldC7MKhrW9PlglBq",
  ring_no: "fldVBfv4sel04F9JL",
  ring_day_no: "fldZLVLCshk9S3R7q",
  class_no: "fld6gnl7rJ0z8SWX6",
  active_from_trainers: "fldfTmimL22O7Le1t"
};

const GET_ORDERS_FIELDS = {
  focus_day: "fldUqGKwsCMT7Mife",
  show_no: "fldNrmCIspFnaMrSu",
  ring_no: "fldodPLuth9pAYgRE",
  ring_day_no: "fldFCnmRdMtA7kCH6",
  class_no: "flddnzH6IUlY1rbtf",
  class_text: "fldMFQJ9dMqKp4WMG",
  entry_text: "fldO5cnADy7JGghrh",
  total: "fldnJ01pecAwkDHTl",
  n_to_go: "fld1mJWzJQuq1abUP",
  n_gone: "fldwwdq5bvOdYxAcM",
  timestamp: "fld84wGQJZNAsT9b4",
  elapsed: "fldl1WytMPEENPhmj"
};

const ENTRY_GO_FIELDS = {
  entry_go_key: "fldRBul0TP6zQFzSX",
  show_no: "fldYbrC3XUrWEB1nk",
  focus_day: "fldV5YK4Skso0U25t",
  ring_no: "fldp7C0JtYiT9TKsf",
  ring_day_no: "fldLvJcrh5ufukbdQ",
  class_no: "fldRtenp2KT6kxSwD",
  class_number: "fldxwAR9fZEgKxAf5",
  class_name: "fldzmdZLw25EGxfAa",
  entry_no: "flda59MfCPviuf9CZ",
  entry_order: "fldgEZbFPXdqzKGFS",
  horse: "fldspWOxM6Vebcvl3",
  horse_display: "fldXFYR9onEqDdC9t",
  rider: "fldlIG9u6L9LItRVt",
  trainer: "fldzvFMZSXLfsTDVv",
  trainer_display: "fldt4NI8BmQxMTB7v",
  class_start_time: "fld6KoEdi0T1pAxr7",
  display_time: "fldHFFpNHVuxmTZ3D",
  entry_go_time: "fldYQNMmMTFvVgoE6",
  pace_seconds: "fldz7VgAf84pmiEHH",
  n_gone: "fldUysZivDW5BIu51",
  elapsed_seconds: "fld4alneTNoBZp092",
  status: "fldd2hqbkYPzCaPxh"
};

const ALERT_FIELDS = {
  alert_key_run: "fldqmUWNw44ESEC72",
  alert_key: "fldVpNdCVtZBaMDFU",
  severity: "fldKvdb52FCg2VRcJ",
  alert_type: "fldvnYBU0FmHYnxOl",
  alert_type_select: "fldALRVxVfL12QFNF",
  message: "fldSPL7ywbch1kplg",
  created_at: "fldqusD5FeihMgXhg",
  status: "fldc5JuLx6UgvzDD0",
  show_no: "fldZfl5FCkyAHmXYu",
  focus_day: "fldmsq7bV1rEFHRJi",
  payload_json: "fld7e5ZLz0TlLQ4Ru",
  alert_templates: "fldfJBdTTdFZnKYFp",
  alert_lane: "fldyIMoAtIIXSsNMs",
  trigger_minutes: "fldmZj1QILG9elQNw",
  time_till: "fldUDFWSeugaQOoFF",
  target_time: "fldBZHfGEl4yipKQ7",
  alert_subject: "fldBUx8SiI1xyOudr",
  source_table: "fldn7yxOdsIB476Ou"
};

const ALERT_TEMPLATE_FIELDS = {
  alerts: "fldIcmIlN17V6INLu"
};

const LOG_FIELDS = {
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

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function isFocusPaused(row) {
  return truthy(row?.is_pause) || truthy(row?.[FOCUS_SHOW_FIELDS.is_pause]);
}

function shouldPauseAction(action, focus) {
  return action !== "audit" && isFocusPaused(focus);
}

function pausedLogDetail(action, focus) {
  return {
    action,
    showNo: focus.show_no,
    focusDay: focus.focus_day,
    status: "skipped",
    recordsSeen: 0,
    recordsChanged: 0,
    summary: `${action} paused by focus_show.is_pause`,
    payload: { paused: true, reason: "focus_show.is_pause", focus_show_record_id: focus.record_id }
  };
}

function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function isoDate(value) {
  const raw = text(value);
  if (!raw) return "";
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : raw;
}

function ymd(value) {
  return isoDate(value).replace(/-/g, "");
}

function classNumberFromLabel(label) {
  const match = text(label).match(/^(\d+)\)/);
  return match ? Number(match[1]) : null;
}

function currentStamp() {
  const date = new Date();
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,x-airtable-token");
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

function getHeader(req, name) {
  const headers = req.headers || {};
  return headers[name.toLowerCase()] || headers[name] || "";
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        if (text(getHeader(req, "content-type")).includes("application/json")) {
          return resolve(JSON.parse(raw));
        }
        return resolve(Object.fromEntries(new URLSearchParams(raw)));
      } catch {
        return resolve({});
      }
    });
  });
}

function airtableQuote(value) {
  return text(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function cleanFields(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

async function airtableList(baseId, table, token, { formula = "", fields = [], returnFieldIds = true } = {}) {
  const records = [];
  let offset = "";
  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    if (formula) url.searchParams.set("filterByFormula", formula);
    if (returnFieldIds) url.searchParams.set("returnFieldsByFieldId", "true");
    for (const field of fields) url.searchParams.append("fields[]", field);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Airtable list ${table} HTTP ${response.status}: ${raw.slice(0, 500)}`);
    const json = JSON.parse(raw);
    records.push(...(json.records || []));
    offset = json.offset || "";
  } while (offset);
  return records;
}

async function airtableUpsert(baseId, tableId, mergeFieldId, records, token) {
  const results = [];
  for (let index = 0; index < records.length; index += 10) {
    const chunk = records.slice(index, index + 10);
    if (!chunk.length) continue;
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        performUpsert: { fieldsToMergeOn: [mergeFieldId] },
        records: chunk.map((fields) => ({ fields: cleanFields(fields) }))
      })
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Airtable upsert ${tableId} HTTP ${response.status}: ${raw.slice(0, 500)}`);
    results.push(...(JSON.parse(raw).records || []));
  }
  return results;
}

async function airtableUpdate(baseId, tableId, records, token) {
  const results = [];
  for (let index = 0; index < records.length; index += 10) {
    const chunk = records.slice(index, index + 10);
    if (!chunk.length) continue;
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ records: chunk })
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Airtable update ${tableId} HTTP ${response.status}: ${raw.slice(0, 500)}`);
    results.push(...(JSON.parse(raw).records || []));
  }
  return results;
}

async function airtableCreate(baseId, tableId, fields, token) {
  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields: cleanFields(fields) })
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Airtable create ${tableId} HTTP ${response.status}: ${raw.slice(0, 500)}`);
  return JSON.parse(raw);
}

async function airtableDelete(baseId, tableId, recordIds, token) {
  const results = [];
  for (let index = 0; index < recordIds.length; index += 10) {
    const chunk = recordIds.slice(index, index + 10);
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

function zcqlValue(value) {
  if (value === null || value === undefined || value === "") return "null";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function zcqlRows(app, tableName, where, { limit = 200, maxRows = 1000 } = {}) {
  const rows = [];
  const pageLimit = Math.max(1, Math.min(Number(limit) || 200, 200));
  for (let offset = 0; offset < maxRows; offset += pageLimit) {
    const query = [
      `SELECT * FROM ${tableName}`,
      where ? `WHERE ${where}` : "",
      `LIMIT ${pageLimit} OFFSET ${offset}`
    ].filter(Boolean).join(" ");
    const page = (await app.zcql().executeZCQLQuery(query) || [])
      .map((item) => item?.[tableName])
      .filter(Boolean);
    rows.push(...page);
    if (page.length < pageLimit) break;
  }
  return rows;
}

async function syncCatalystByKey(app, tableName, keyField, rows, existingRows, { deleteStale = false } = {}) {
  const table = app.datastore().table(tableName);
  const existingByKey = new Map(existingRows.map((row) => [text(row[keyField]), row]));
  const activeKeys = new Set(rows.map((row) => text(row[keyField])).filter(Boolean));
  const inserts = [];
  const updates = [];

  for (const row of rows) {
    const key = text(row[keyField]);
    if (!key) continue;
    const existing = existingByKey.get(key);
    if (existing?.ROWID) updates.push({ ...cleanCatalystRow(row), ROWID: existing.ROWID });
    else inserts.push(cleanCatalystRow(row));
  }

  for (let index = 0; index < inserts.length; index += 100) {
    const chunk = inserts.slice(index, index + 100);
    if (chunk.length) await table.insertRows(chunk);
  }
  for (let index = 0; index < updates.length; index += 100) {
    const chunk = updates.slice(index, index + 100);
    if (chunk.length) await table.updateRows(chunk);
  }

  let deleted = 0;
  if (deleteStale) {
    const staleIds = existingRows
      .filter((row) => !activeKeys.has(text(row[keyField])))
      .map((row) => row.ROWID)
      .filter(Boolean);
    for (const id of staleIds) {
      await table.deleteRow(id);
      deleted += 1;
    }
  }

  return { inserted: inserts.length, updated: updates.length, deleted };
}

function cleanCatalystRow(row) {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

async function resolveFocus(baseId, token, query, body) {
  const requestedShowNo = text(query.get("show_no") || body.show_no);
  const requestedFocusDay = isoDate(query.get("focus_day") || body.focus_day);

  const formula = requestedShowNo
    ? `AND({show_no}=${Number(requestedShowNo)},{active}=1)`
    : "{active}=1";
  const rows = await airtableList(baseId, "focus_show", token, { formula });
  const row = requestedFocusDay
    ? rows.find((record) => isoDate((record.fields || {})[FOCUS_SHOW_FIELDS.focus_day]) === requestedFocusDay)
    : rows[0];
  if (!row || (!requestedFocusDay && rows.length !== 1)) {
    throw new Error(`focus_show active rows must equal 1; found ${rows.length}`);
  }
  const fields = row.fields || {};
  return {
    show_no: requestedShowNo || text(fields[FOCUS_SHOW_FIELDS.show_no]),
    focus_day: requestedFocusDay || isoDate(fields[FOCUS_SHOW_FIELDS.focus_day]),
    record_id: row.id,
    is_pause: isFocusPaused(fields)
  };
}

async function logRun(baseId, token, { action, showNo, focusDay, status, recordsSeen, recordsChanged, summary, payload }) {
  const now = new Date().toISOString();
  const logKey = `${showNo}|${focusDay}|${action}`;
  return airtableCreate(baseId, TABLES.airtableLogs, {
    [LOG_FIELDS.log_key_run]: `${logKey}|${now}`,
    [LOG_FIELDS.log_key]: logKey,
    [LOG_FIELDS.workflow_lanes]: "Alerts",
    [LOG_FIELDS.log_type]: logTypeForAction(action),
    [LOG_FIELDS.check_name]: "horseshowing_class_lane_runner",
    [LOG_FIELDS.show_no]: Number(showNo),
    [LOG_FIELDS.focus_day]: focusDay,
    [LOG_FIELDS.status]: status,
    [LOG_FIELDS.records_seen]: recordsSeen,
    [LOG_FIELDS.records_changed]: recordsChanged,
    [LOG_FIELDS.summary]: summary,
    [LOG_FIELDS.payload_json]: JSON.stringify(payload || {}),
    [LOG_FIELDS.created_at]: now
  }, token);
}

async function linkMap(baseId, token, tableName, keyName, keys) {
  const values = [...new Set((keys || []).map(text).filter(Boolean))];
  const map = new Map();
  for (let index = 0; index < values.length; index += 25) {
    const chunk = values.slice(index, index + 25);
    if (!chunk.length) continue;
    const formula = chunk.length === 1
      ? `{${keyName}}='${airtableQuote(chunk[0])}'`
      : `OR(${chunk.map((key) => `{${keyName}}='${airtableQuote(key)}'`).join(",")})`;
    const rows = await airtableList(baseId, tableName, token, { formula, returnFieldIds: false });
    for (const row of rows) {
      const key = text(row.fields?.[keyName]);
      if (key) map.set(key, row.id);
    }
  }
  return map;
}

async function readLockedStaging(baseId, token, showNo, focusDay) {
  const formula = `AND({show_no}=${Number(showNo)},IS_SAME({iso_date},DATETIME_PARSE('${airtableQuote(focusDay)}'),'day'),{full_lock}=1)`;
  const rows = await airtableList(baseId, TABLES.airtableStaging, token, { formula });
  return rows.map((record) => {
    const f = record.fields || {};
    return {
      record_id: record.id,
      staging_key: text(f[STAGING_FIELDS.staging_key]),
      show_no: asNumber(f[STAGING_FIELDS.show_no]),
      focus_day: isoDate(f[STAGING_FIELDS.iso_date]),
      ring_day_no: asNumber(f[STAGING_FIELDS.ring_day_no]),
      ring_no: asNumber(f[STAGING_FIELDS.ring_no]),
      ring_name: text(f[STAGING_FIELDS.ring_name]),
      class_no: asNumber(f[STAGING_FIELDS.class_no]),
      event_id: asNumber(f[STAGING_FIELDS.event_id]),
      class_number: classNumberFromLabel(f[STAGING_FIELDS.event_name]) || null,
      class_name: text(f[STAGING_FIELDS.class_name] || f[STAGING_FIELDS.event_name]),
      time_text: text(f[STAGING_FIELDS.time_text]),
      entry_count: asNumber(f[STAGING_FIELDS.entry_count]),
      full_lock: truthy(f[STAGING_FIELDS.full_lock])
    };
  });
}

async function readFocusClassStarts(baseId, token, showNo, focusDay) {
  const formula = `AND({show_no}=${Number(showNo)},IS_SAME({focus_day},DATETIME_PARSE('${airtableQuote(focusDay)}'),'day'))`;
  const rows = await airtableList(baseId, TABLES.airtableClassStartTimes, token, { formula });
  return rows.map((record) => {
    const f = record.fields || {};
    return {
      record_id: record.id,
      class_start_key: text(f[CLASS_START_FIELDS.class_start_key]),
      show_no: asNumber(f[CLASS_START_FIELDS.show_no]),
      focus_day: isoDate(f[CLASS_START_FIELDS.focus_day]),
      ring_day_no: asNumber(f[CLASS_START_FIELDS.ring_day_no]),
      ring_no: asNumber(f[CLASS_START_FIELDS.ring_no]),
      class_no: asNumber(f[CLASS_START_FIELDS.class_no]),
      class_number: asNumber(f[CLASS_START_FIELDS.class_number]),
      class_name: text(f[CLASS_START_FIELDS.class_name]),
      class_start_time: text(f[CLASS_START_FIELDS.class_start_time]),
      display_time: text(f[CLASS_START_FIELDS.display_time])
    };
  });
}

async function readActiveEntryGoTimes(baseId, token, showNo, focusDay) {
  const formula = `AND({show_no}=${Number(showNo)},IS_SAME({focus_day},DATETIME_PARSE('${airtableQuote(focusDay)}'),'day'),{status}='active')`;
  const rows = await airtableList(baseId, TABLES.airtableEntryGoTimes, token, { formula });
  return rows.map((record) => {
    const f = record.fields || {};
    return {
      record_id: record.id,
      entry_go_key: text(f[ENTRY_GO_FIELDS.entry_go_key]),
      show_no: asNumber(f[ENTRY_GO_FIELDS.show_no]),
      focus_day: isoDate(f[ENTRY_GO_FIELDS.focus_day]),
      ring_day_no: asNumber(f[ENTRY_GO_FIELDS.ring_day_no]),
      ring_no: asNumber(f[ENTRY_GO_FIELDS.ring_no]),
      class_no: asNumber(f[ENTRY_GO_FIELDS.class_no]),
      class_number: asNumber(f[ENTRY_GO_FIELDS.class_number]),
      class_name: text(f[ENTRY_GO_FIELDS.class_name]),
      entry_no: asNumber(f[ENTRY_GO_FIELDS.entry_no]),
      entry_order: asNumber(f[ENTRY_GO_FIELDS.entry_order]),
      horse: text(f[ENTRY_GO_FIELDS.horse]),
      horse_display: text(f[ENTRY_GO_FIELDS.horse_display]),
      rider: text(f[ENTRY_GO_FIELDS.rider]),
      trainer: text(f[ENTRY_GO_FIELDS.trainer]),
      trainer_display: text(f[ENTRY_GO_FIELDS.trainer_display]),
      class_start_time: text(f[ENTRY_GO_FIELDS.class_start_time]),
      display_time: text(f[ENTRY_GO_FIELDS.display_time]),
      entry_go_time: text(f[ENTRY_GO_FIELDS.entry_go_time]),
      pace_seconds: asNumber(f[ENTRY_GO_FIELDS.pace_seconds]),
      n_gone: asNumber(f[ENTRY_GO_FIELDS.n_gone]),
      elapsed_seconds: asNumber(f[ENTRY_GO_FIELDS.elapsed_seconds]),
      status: text(f[ENTRY_GO_FIELDS.status])
    };
  });
}

async function readAlertTemplateMap(baseId, token) {
  const rows = await airtableList(baseId, TABLES.airtableAlertTemplates, token);
  const byAlertType = new Map();
  for (const record of rows) {
    const alertType = text((record.fields || {})[ALERT_TEMPLATE_FIELDS.alerts]);
    if (alertType) byAlertType.set(alertType, record.id);
  }
  return byAlertType;
}

async function readClassOogGroups(baseId, token, showNo, focusDay) {
  const formula = `AND({show_no}=${Number(showNo)},IS_SAME({focus_day},DATETIME_PARSE('${airtableQuote(focusDay)}'),'day'))`;
  const rows = await airtableList(baseId, TABLES.airtableClassOog, token, { formula });
  const groups = new Map();
  for (const record of rows) {
    const f = record.fields || {};
    const key = `${asNumber(f[CLASS_OOG_FIELDS.show_no])}|${asNumber(f[CLASS_OOG_FIELDS.ring_day_no])}|${asNumber(f[CLASS_OOG_FIELDS.class_no])}`;
    if (!groups.has(key)) groups.set(key, { ids: [], active: 0, total: 0 });
    const group = groups.get(key);
    group.ids.push(record.id);
    group.total += 1;
    if (truthy(Array.isArray(f[CLASS_OOG_FIELDS.active_from_trainers]) ? f[CLASS_OOG_FIELDS.active_from_trainers][0] : f[CLASS_OOG_FIELDS.active_from_trainers])) {
      group.active += 1;
    }
  }
  return groups;
}

async function resolveStaleTimeAlerts(baseId, token, focus, activeAlertKeys) {
  const formula = `AND({show_no}=${Number(focus.show_no)},IS_SAME({focus_day},DATETIME_PARSE('${airtableQuote(focus.focus_day)}'),'day'),{status}='open',OR({alert_lane}='class_start_times',{alert_lane}='entry_go_times'))`;
  const rows = await airtableList(baseId, TABLES.airtableAlerts, token, { formula });
  const updates = rows
    .filter((record) => !activeAlertKeys.has(text((record.fields || {})[ALERT_FIELDS.alert_key])))
    .map((record) => ({
      id: record.id,
      fields: cleanFields({
        [ALERT_FIELDS.status]: "resolved",
        [ALERT_FIELDS.message]: "Resolved: alert window is no longer active.",
        [ALERT_FIELDS.payload_json]: JSON.stringify({
          show_no: Number(focus.show_no),
          focus_day: focus.focus_day,
          resolved_reason: "alert_window_inactive",
          resolved_at: new Date().toISOString()
        })
      })
    }));
  return updates.length ? airtableUpdate(baseId, TABLES.airtableAlerts, updates, token) : [];
}

async function buildClassStartAirtableRows(baseId, token, sourceRows, focusRecordId) {
  const showNos = sourceRows.map((row) => row.show_no);
  const ringNos = sourceRows.map((row) => row.ring_no);
  const ringDayNos = sourceRows.map((row) => row.ring_day_no);
  const classNos = sourceRows.map((row) => row.class_no);
  const [shows, rings, ringDays, classes, classOogGroups] = await Promise.all([
    linkMap(baseId, token, "shows", "show_no", showNos),
    linkMap(baseId, token, "rings", "ring_no", ringNos),
    linkMap(baseId, token, "ring_days", "ring_day_no", ringDayNos),
    linkMap(baseId, token, "classes", "class_no", classNos),
    readClassOogGroups(baseId, token, sourceRows[0]?.show_no, sourceRows[0]?.focus_day)
  ]);

  return sourceRows.map((row) => {
    const oogGroup = classOogGroups.get(`${row.show_no}|${row.ring_day_no}|${row.class_no}`);
    return cleanFields({
      [CLASS_START_FIELDS.class_start_key]: row.class_start_key,
      [CLASS_START_FIELDS.show_no]: row.show_no,
      [CLASS_START_FIELDS.focus_day]: row.focus_day,
      [CLASS_START_FIELDS.ring_day_no]: row.ring_day_no,
      [CLASS_START_FIELDS.ring_no]: row.ring_no,
      [CLASS_START_FIELDS.event_id]: row.event_id,
      [CLASS_START_FIELDS.class_no]: row.class_no,
      [CLASS_START_FIELDS.class_number]: row.class_number,
      [CLASS_START_FIELDS.class_name]: row.class_name,
      [CLASS_START_FIELDS.class_start_time]: row.class_start_time,
      [CLASS_START_FIELDS.display_time]: row.display_time,
      [CLASS_START_FIELDS.entry_count]: row.entry_count,
      [CLASS_START_FIELDS.source]: row.source,
      [CLASS_START_FIELDS.status]: row.status,
      [CLASS_START_FIELDS.last_synced_at]: new Date().toISOString(),
      [CLASS_START_FIELDS.update_schedule_staging]: airtableRecordLink(row.record_id),
      [CLASS_START_FIELDS.shows]: airtableRecordLink(shows.get(text(row.show_no))),
      [CLASS_START_FIELDS.focus_show]: airtableRecordLink(focusRecordId),
      [CLASS_START_FIELDS.rings]: airtableRecordLink(rings.get(text(row.ring_no))),
      [CLASS_START_FIELDS.ring_days]: airtableRecordLink(ringDays.get(text(row.ring_day_no))),
      [CLASS_START_FIELDS.classes]: airtableRecordLink(classes.get(text(row.class_no))),
      [CLASS_START_FIELDS.class_oog]: airtableRecordLinks(oogGroup?.ids || [])
    });
  });
}

async function syncClassStartTimes(app, baseId, token, focus) {
  const stagingRows = await readLockedStaging(baseId, token, focus.show_no, focus.focus_day);
  const classRows = buildClassStartRows(stagingRows).map((row, index) => ({
    ...row,
    record_id: stagingRows[index]?.record_id
  }));
  const airtableRows = await buildClassStartAirtableRows(baseId, token, classRows, focus.record_id);
  const airtableUpserts = await airtableUpsert(
    baseId,
    TABLES.airtableClassStartTimes,
    CLASS_START_FIELDS.class_start_key,
    airtableRows,
    token
  );

  const existingAirtable = await readFocusClassStarts(baseId, token, focus.show_no, focus.focus_day);
  const activeKeys = new Set(classRows.map((row) => row.class_start_key));
  const staleAirtableIds = existingAirtable
    .filter((row) => !activeKeys.has(row.class_start_key))
    .map((row) => row.record_id);
  const airtableDeletes = await airtableDelete(baseId, TABLES.airtableClassStartTimes, staleAirtableIds, token);

  const existingCatalyst = await zcqlRows(
    app,
    TABLES.catalystClassStartTimes,
    `show_no = ${zcqlValue(Number(focus.show_no))} AND focus_day = ${zcqlValue(focus.focus_day)}`,
    { limit: 200, maxRows: 1000 }
  );
  const catalystRows = classRows.map((row) => ({
    class_start_key: row.class_start_key,
    show_no: row.show_no,
    focus_day: row.focus_day,
    ring_day_no: row.ring_day_no,
    ring_no: row.ring_no,
    ring_name: row.ring_name,
    class_no: row.class_no,
    class_number: row.class_number,
    class_name: row.class_name,
    class_start_time: row.class_start_time,
    display_time: row.display_time,
    entry_count: row.entry_count,
    status: row.status,
    last_synced_at: currentStamp()
  }));
  const catalystResult = await syncCatalystByKey(
    app,
    TABLES.catalystClassStartTimes,
    "class_start_key",
    catalystRows,
    existingCatalyst,
    { deleteStale: true }
  );

  await logRun(baseId, token, {
    action: "class_start_times",
    showNo: focus.show_no,
    focusDay: focus.focus_day,
    status: "ok",
    recordsSeen: stagingRows.length,
    recordsChanged: airtableUpserts.length + airtableDeletes.length,
    summary: `class_start_times source ${stagingRows.length}; airtable upsert ${airtableUpserts.length}; catalyst inserted ${catalystResult.inserted}; updated ${catalystResult.updated}; stale ${catalystResult.deleted}`,
    payload: { source: "update_schedule_staging.full_lock", stale_airtable_deleted: airtableDeletes.length, catalyst: catalystResult }
  });

  return {
    source_locked_staging: stagingRows.length,
    class_start_times_airtable_upserted: airtableUpserts.length,
    class_start_times_airtable_deleted: airtableDeletes.length,
    class_start_times_catalyst: catalystResult
  };
}

async function syncClassOogRollups(app, baseId, token, focus) {
  const classStarts = await readFocusClassStarts(baseId, token, focus.show_no, focus.focus_day);
  const groups = await readClassOogGroups(baseId, token, focus.show_no, focus.focus_day);
  const airtableUpdates = classStarts.map((row) => {
    const group = groups.get(`${row.show_no}|${row.ring_day_no}|${row.class_no}`) || { ids: [], active: 0, total: 0 };
    return {
      id: row.record_id,
      fields: cleanFields({ [CLASS_START_FIELDS.class_oog]: airtableRecordLinks(group.ids) || [] })
    };
  });
  const updated = await airtableUpdate(baseId, TABLES.airtableClassStartTimes, airtableUpdates, token);

  const catalystRows = await zcqlRows(
    app,
    TABLES.catalystClassStartTimes,
    `show_no = ${zcqlValue(Number(focus.show_no))} AND focus_day = ${zcqlValue(focus.focus_day)}`,
    { limit: 200, maxRows: 1000 }
  );
  const updates = catalystRows.map((row) => {
    const group = groups.get(`${row.show_no}|${row.ring_day_no}|${row.class_no}`) || { active: 0, total: 0 };
    return {
      ROWID: row.ROWID,
      class_oog_rows: group.total,
      active_oog_rows: group.active,
      class_oog_refreshed_at: currentStamp()
    };
  });
  for (let index = 0; index < updates.length; index += 100) {
    const chunk = updates.slice(index, index + 100);
    if (chunk.length) await app.datastore().table(TABLES.catalystClassStartTimes).updateRows(chunk);
  }

  await logRun(baseId, token, {
    action: "class_oog_rollups",
    showNo: focus.show_no,
    focusDay: focus.focus_day,
    status: "ok",
    recordsSeen: classStarts.length,
    recordsChanged: updated.length + updates.length,
    summary: `class_oog linked to ${updated.length} class_start_times rows`,
    payload: { class_start_times: classStarts.length, class_oog_groups: groups.size, catalyst_updates: updates.length }
  });

  return { class_start_times: classStarts.length, class_oog_groups: groups.size, airtable_updated: updated.length, catalyst_updated: updates.length };
}

function entryNoFromText(value) {
  const match = text(value).match(/#?(\d+)/);
  return match ? Number(match[1]) : null;
}

function horseFromEntryText(value) {
  const raw = text(value).replace(/<br\s*\/?>.*/i, "");
  const match = raw.match(/^#?\d+\s*,\s*(.+)$/);
  return match ? match[1].trim() : "";
}

async function syncGetOrders(app, baseId, token, focus) {
  const orderFormula = `AND({show_no}=${Number(focus.show_no)},IS_SAME({focus_day},DATETIME_PARSE('${airtableQuote(focus.focus_day)}'),'day'))`;
  const orderRecords = await airtableList(baseId, TABLES.airtableGetOrders, token, { formula: orderFormula });
  const orders = orderRecords.map((record) => {
    const f = record.fields || {};
    return {
      show_no: asNumber(f[GET_ORDERS_FIELDS.show_no]),
      focus_day: isoDate(f[GET_ORDERS_FIELDS.focus_day]),
      ring_day_no: asNumber(f[GET_ORDERS_FIELDS.ring_day_no]),
      ring_no: asNumber(f[GET_ORDERS_FIELDS.ring_no]),
      class_no: asNumber(f[GET_ORDERS_FIELDS.class_no]),
      class_number: classNumberFromLabel(f[GET_ORDERS_FIELDS.class_text]),
      n_gone: asNumber(f[GET_ORDERS_FIELDS.n_gone]),
      n_to_go: asNumber(f[GET_ORDERS_FIELDS.n_to_go]),
      total: asNumber(f[GET_ORDERS_FIELDS.total]),
      timestamp: asNumber(f[GET_ORDERS_FIELDS.timestamp]),
      elapsed: asNumber(f[GET_ORDERS_FIELDS.elapsed]),
      current_entry_no: entryNoFromText(f[GET_ORDERS_FIELDS.entry_text]),
      current_horse: horseFromEntryText(f[GET_ORDERS_FIELDS.entry_text])
    };
  });
  const classStarts = await readFocusClassStarts(baseId, token, focus.show_no, focus.focus_day);
  const matches = matchGetOrdersToClassStart(orders, classStarts);
  const startsByKey = new Map(classStarts.map((row) => [row.class_start_key, row]));
  const airtableUpdates = matches.map((match) => {
    const start = startsByKey.get(match.class_start_key);
    return {
      id: start.record_id,
      fields: cleanFields({
        [CLASS_START_FIELDS.n_gone]: match.updates.n_gone,
        [CLASS_START_FIELDS.n_to_go]: match.updates.n_to_go,
        [CLASS_START_FIELDS.elapsed_seconds]: match.updates.elapsed_seconds,
        [CLASS_START_FIELDS.current_entry_no]: match.order.current_entry_no,
        [CLASS_START_FIELDS.current_horse]: match.order.current_horse,
        [CLASS_START_FIELDS.live_source]: "get_orders",
        [CLASS_START_FIELDS.last_synced_at]: new Date().toISOString()
      })
    };
  });
  const updated = await airtableUpdate(baseId, TABLES.airtableClassStartTimes, airtableUpdates, token);

  const catalystRows = await zcqlRows(
    app,
    TABLES.catalystClassStartTimes,
    `show_no = ${zcqlValue(Number(focus.show_no))} AND focus_day = ${zcqlValue(focus.focus_day)}`,
    { limit: 200, maxRows: 1000 }
  );
  const catalystByKey = new Map(catalystRows.map((row) => [text(row.class_start_key), row]));
  const catalystUpdates = matches
    .map((match) => {
      const row = catalystByKey.get(match.class_start_key);
      if (!row?.ROWID) return null;
      return cleanCatalystRow({
        ROWID: row.ROWID,
        n_gone: match.updates.n_gone,
        n_to_go: match.updates.n_to_go,
        total: match.updates.total,
        elapsed_seconds: match.updates.elapsed_seconds,
        source_timestamp: match.updates.source_timestamp,
        current_entry_no: match.order.current_entry_no,
        current_horse: match.order.current_horse,
        live_source: "get_orders",
        last_synced_at: currentStamp()
      });
    })
    .filter(Boolean);
  for (let index = 0; index < catalystUpdates.length; index += 100) {
    const chunk = catalystUpdates.slice(index, index + 100);
    if (chunk.length) await app.datastore().table(TABLES.catalystClassStartTimes).updateRows(chunk);
  }

  await logRun(baseId, token, {
    action: "get_orders_class_start_enrichment",
    showNo: focus.show_no,
    focusDay: focus.focus_day,
    status: "ok",
    recordsSeen: orders.length,
    recordsChanged: updated.length + catalystUpdates.length,
    summary: `get_orders matched ${matches.length} class_start_times rows`,
    payload: { orders: orders.length, matches: matches.length, airtable_updated: updated.length, catalyst_updated: catalystUpdates.length }
  });

  return { orders: orders.length, matches: matches.length, airtable_updated: updated.length, catalyst_updated: catalystUpdates.length };
}

async function syncClassAlerts(baseId, token, focus, now = new Date()) {
  const classStarts = await readFocusClassStarts(baseId, token, focus.show_no, focus.focus_day);
  const entryGoTimes = await readActiveEntryGoTimes(baseId, token, focus.show_no, focus.focus_day);
  const classAlerts = buildClassAlerts(classStarts, now);
  const entryAlerts = buildEntryAlerts(entryGoTimes, now);
  const alerts = [...classAlerts, ...entryAlerts];
  const activeAlertKeys = new Set(alerts.map((alert) => alert.alert_key));
  const alertTemplateMap = await readAlertTemplateMap(baseId, token);
  const missingTemplates = [...new Set(alerts.map((alert) => alert.alert_type).filter((alertType) => !alertTemplateMap.has(alertType)))];
  if (missingTemplates.length) {
    throw new Error(`Missing alert_templates rows for alert_type: ${missingTemplates.join(", ")}`);
  }
  const airtableRows = alerts.map((alert) => cleanFields({
    [ALERT_FIELDS.alert_key_run]: `${alert.alert_key}|${new Date().toISOString()}`,
    [ALERT_FIELDS.alert_key]: alert.alert_key,
    [ALERT_FIELDS.severity]: "info",
    [ALERT_FIELDS.alert_type]: alert.alert_type,
    [ALERT_FIELDS.alert_type_select]: alert.alert_type,
    [ALERT_FIELDS.message]: alert.message,
    [ALERT_FIELDS.created_at]: new Date().toISOString(),
    [ALERT_FIELDS.status]: "open",
    [ALERT_FIELDS.show_no]: alert.show_no,
    [ALERT_FIELDS.focus_day]: alert.focus_day,
    [ALERT_FIELDS.payload_json]: JSON.stringify(alert),
    [ALERT_FIELDS.alert_templates]: airtableRecordLink(alertTemplateMap.get(alert.alert_type)),
    [ALERT_FIELDS.alert_lane]: alert.alert_lane,
    [ALERT_FIELDS.trigger_minutes]: alert.trigger_minutes ?? alert.time_till,
    [ALERT_FIELDS.time_till]: alert.time_till,
    [ALERT_FIELDS.target_time]: alert.target_time,
    [ALERT_FIELDS.alert_subject]: alert.alert_subject,
    [ALERT_FIELDS.source_table]: alert.source_table
  }));
  const upserts = await airtableUpsert(baseId, TABLES.airtableAlerts, ALERT_FIELDS.alert_key, airtableRows, token);
  const resolved = await resolveStaleTimeAlerts(baseId, token, focus, activeAlertKeys);
  await logRun(baseId, token, {
    action: "class_alerts",
    showNo: focus.show_no,
    focusDay: focus.focus_day,
    status: "ok",
    recordsSeen: classStarts.length + entryGoTimes.length,
    recordsChanged: upserts.length + resolved.length,
    summary: `class_alerts created/updated ${upserts.length}; resolved ${resolved.length}; class ${classAlerts.length}; entry ${entryAlerts.length}`,
    payload: { class_start_times: classStarts.length, entry_go_times: entryGoTimes.length, class_alerts: classAlerts.length, entry_alerts: entryAlerts.length, alerts: upserts.length, resolved: resolved.length }
  });
  return { class_start_times: classStarts.length, entry_go_times: entryGoTimes.length, class_alerts: classAlerts.length, entry_alerts: entryAlerts.length, alerts_upserted: upserts.length, alerts_resolved: resolved.length };
}

async function auditLane(app, baseId, token, focus) {
  const stagingRows = await readLockedStaging(baseId, token, focus.show_no, focus.focus_day);
  const sourceRows = buildClassStartRows(stagingRows);
  const airtableRows = await readFocusClassStarts(baseId, token, focus.show_no, focus.focus_day);
  const catalystRows = await zcqlRows(
    app,
    TABLES.catalystClassStartTimes,
    `show_no = ${zcqlValue(Number(focus.show_no))} AND focus_day = ${zcqlValue(focus.focus_day)}`,
    { limit: 200, maxRows: 1000 }
  );
  const sourceKeys = sourceRows.map((row) => row.class_start_key);
  const airtableCheck = compareKeySets(sourceKeys, airtableRows.map((row) => row.class_start_key));
  const catalystCheck = compareKeySets(sourceKeys, catalystRows.map((row) => text(row.class_start_key)));
  const ok = airtableCheck.ok && catalystCheck.ok;
  await logRun(baseId, token, {
    action: "class_start_times",
    showNo: focus.show_no,
    focusDay: focus.focus_day,
    status: ok ? "ok" : "error",
    recordsSeen: sourceKeys.length,
    recordsChanged: 0,
    summary: `class lane audit ${ok ? "PASS" : "FAIL"} source ${sourceKeys.length}; airtable ${airtableRows.length}; catalyst ${catalystRows.length}`,
    payload: { airtable: airtableCheck, catalyst: catalystCheck }
  });
  return {
    ok,
    source_locked_staging: sourceKeys.length,
    airtable_class_start_times: airtableRows.length,
    catalyst_class_start_times: catalystRows.length,
    airtable: airtableCheck,
    catalyst: catalystCheck
  };
}

async function runAction(req, action, app, baseId, token, focus, query, body) {
  if (shouldPauseAction(action, focus)) {
    await logRun(baseId, token, pausedLogDetail(action, focus));
    return { paused: true, reason: "focus_show.is_pause", focus_show_record_id: focus.record_id };
  }
  if (action === "sync-class-start-times") {
    return syncClassStartTimes(app, baseId, token, focus);
  }
  if (action === "sync-class-oog-rollups") {
    return syncClassOogRollups(app, baseId, token, focus);
  }
  if (action === "sync-get-orders") {
    return syncGetOrders(app, baseId, token, focus);
  }
  if (action === "sync-class-alerts") {
    const nowRaw = text(query.get("now") || body.now);
    return syncClassAlerts(baseId, token, focus, nowRaw ? new Date(nowRaw) : new Date());
  }
  if (action === "audit") {
    return auditLane(app, baseId, token, focus);
  }
  if (action === "run") {
    const classStartTimes = await syncClassStartTimes(app, baseId, token, focus);
    const classOogRollups = await syncClassOogRollups(app, baseId, token, focus);
    const getOrders = await syncGetOrders(app, baseId, token, focus);
    const classAlerts = await syncClassAlerts(baseId, token, focus);
    const audit = await auditLane(app, baseId, token, focus);
    return { class_start_times: classStartTimes, class_oog_rollups: classOogRollups, get_orders: getOrders, class_alerts: classAlerts, audit };
  }
  throw new Error(`unknown action ${action}`);
}

async function handle(req, res) {
  try {
    setCors(res);
    if ((req.method || "").toUpperCase() === "OPTIONS") return res.end("");
    const query = parseQuery(req);
    const body = await readBody(req);
    const authHeader = text(getHeader(req, "x-airtable-token") || getHeader(req, "authorization"));
    const bearerToken = authHeader.match(/^Bearer\s+(.+)$/i)?.[1] || "";
    const token = text(bearerToken || body.airtable_token || query.get("airtable_token") || process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_WEC_TOKEN);
    if (!token) return sendJson(res, 500, { ok: false, error: "missing AIRTABLE_TOKEN fallback" });
    const baseId = text(process.env.WEC_AIRTABLE_BASE_ID || body.base_id || query.get("base_id") || DEFAULT_BASE_ID);
    const action = text(query.get("action") || body.action || "run");
    const app = catalyst.initialize(req);
    const focus = await resolveFocus(baseId, token, query, body);
    if (!focus.show_no || !focus.focus_day) return sendJson(res, 400, { ok: false, action, error: "show_no and focus_day are required" });
    const result = await runAction(req, action, app, baseId, token, focus, query, body);
    return sendJson(res, 200, { ok: true, action, show_no: focus.show_no, focus_day: focus.focus_day, result });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      error: error?.message || String(error),
      details: typeof error === "object" ? JSON.stringify(error, Object.getOwnPropertyNames(error)).slice(0, 1000) : "",
      stack: (error?.stack || "").split("\n").slice(0, 4)
    });
  }
}

handle.__test__ = { isFocusPaused, shouldPauseAction, pausedLogDetail };
module.exports = handle;
