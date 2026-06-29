const catalyst = require("zcatalyst-sdk-node");
const {
  buildClassStartRows,
  matchGetOrdersToClassStart,
  matchGetRingsToClassStart,
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
  airtableClassOogStaging: "tbljJQRgFvf1oL0Kf",
  airtableClassStartTimes: "tblgOxoLf6r3xGWxB",
  airtableClassOog: "tblgUbX5n8GIuiqUI",
  airtableGetOrders: "tblxaVS0dtetxjiGZ",
  airtableGetRings: "tblPWRF978F9YV3qW",
  airtableShows: "tblyjlXwdf0zg0mhn",
  airtableShowDays: "tblqAdx2mA9qDw3KU",
  airtableRingDays: "tblMw8DPVzlt3H8M7",
  airtableRings: "tbl5WKTbwL6IVrjyI",
  airtableRingNames: "tblcHfnJzCYLoBhjf",
  airtableClasses: "tblhxn7Jhkcnetaq5",
  airtableEntries: "tblrRnqH6utOdyhSk",
  airtableHorses: "tblgWogH7B6Cvusvm",
  airtableRingStatus: "tblP7h7fNmmZNmALW",
  airtableEntryGoTimes: "tblj1qWXAUS79jijF",
  airtableAlertTemplates: "tblcHUmGzoWFOTvx2",
  airtableAlerts: "tblqkxLPy9zZ2FI6z",
  airtableLogs: "tblaA0n7QD7s5lIYm"
};

const FOCUS_SHOW_FIELDS = {
  focus_day_key: "fldIyqZYNX8Bj6Drd",
  show_no: "fldZ1Ym2XNz9IYbBo",
  focus_day: "fldW9urR1cuWf1K96",
  focus_show_key: "fldEBalhN3NswTQEg",
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
  full_lock: "fldL8UsgATV34je1y",
  shows: "fldr7WPbgPFfPuctf",
  show_day: "fldluxeWNNmRpmLhi",
  show_days: "fldiW1dfQrPSFiNvv",
  focus_show: "fldg6ox15s03Sw9xk",
  ring_days: "fldTVsQTkDsDvKyPz",
  rings: "fldz3HXUIVufTOlYm",
  focus_day_key: "fldOAE0Umi7G2nBRv",
  ring_name_normalized: "fld5Po7YYBATaPq6l",
  ring_names: "fldG3nhLK46f5AwBN",
  events: "flds4Y7IP8eN7JrP1",
  classes: "fld57nJX8y2bOTMcw"
};

const CLASS_START_FIELDS = {
  class_start_key: "fldO5aTUlni7JdMIX",
  update_schedule_staging: "fldSRIxFxLt8Tm7vp",
  shows: "fldw723bXNUSCqRgl",
  show_no: "fldgDifl9IQuoeYyn",
  ring_no: "fld2W7zzZA46trKPW",
  rings: "fldIylu3s86XMkyVF",
  event_id: "fldiS6GqGV9SM0lyt",
  events: "fldG0zhaNr27MXecv",
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
  shows: "fldBbICUQh0mcTBwB",
  focus_day: "fldC7MKhrW9PlglBq",
  focus_day_key: "fld6LYyAQHWio4iaf",
  show_days: "fldgJ60VyWhbgXy79",
  focus_show: "fldRxd0qygbKIiKj0",
  ring_no: "fldVBfv4sel04F9JL",
  ring_day_no: "fldZLVLCshk9S3R7q",
  ring_name_normalized: "fldczBE8imOjXaw0G",
  ring_names: "fldSi8sd56KrWiwaP",
  class_no: "fld6gnl7rJ0z8SWX6",
  active_from_trainers: "fldfTmimL22O7Le1t"
};

const CLASS_OOG_STAGING_FIELDS = {
  show_no: "fldGMXpPhnNB77jWI",
  shows: "fldE0nw58EzF6mbm8",
  focus_day: "fldFWrEsJjI8fJVrX",
  focus_day_key: "fld9ADsL84vBixS0M",
  show_days: "fldjyLU6QjQuaq8XG",
  focus_show: "fldUmSUBQDK3CLk9x",
  ring_name_normalized: "fldfogyjAJnCRD6Qd",
  ring_names: "fldV7NmontjKQL60m"
};

const GET_ORDERS_FIELDS = {
  focus_day: "fldUqGKwsCMT7Mife",
  show_day: "fldmhieDzDw2FxPf6",
  show_days: "fldUJasr2yadFfwtZ",
  show_no: "fldNrmCIspFnaMrSu",
  shows: "fld7xsiuCBHukUI2R",
  ring_no: "fldodPLuth9pAYgRE",
  rings: "fldNBiePps9pamHkr",
  ring_day_no: "fldFCnmRdMtA7kCH6",
  ring_days: "fldzaLTxW71AR1Ml4",
  class_no: "flddnzH6IUlY1rbtf",
  classes: "fld8M0tTvdlo3lzmy",
  class_text: "fldMFQJ9dMqKp4WMG",
  entry_no: "fldNQXtbVgOCJimk9",
  entries: "fldCcFR3KuXBcb4W3",
  entry_text: "fldO5cnADy7JGghrh",
  focus_show: "fldUCCyskXbQWXdas",
  ring_name_normalized: "fldPH5ET9OiFCsbln",
  ring_names: "flduBgftsNmg7r2wH",
  class_start_times: "flduCIR4u4HO2lWTn",
  total: "fldnJ01pecAwkDHTl",
  n_to_go: "fld1mJWzJQuq1abUP",
  n_gone: "fldwwdq5bvOdYxAcM",
  timestamp: "fld84wGQJZNAsT9b4",
  elapsed: "fldl1WytMPEENPhmj"
};

const GET_RINGS_FIELDS = {
  focus_day: "fldXbenLpHK8XD9uQ",
  show_day: "fldFw3gOyCMza7bYi",
  show_days: "fldWNMipgPyDOuXCR",
  show_no: "fldk5B2101tYkVaDV",
  ring_no: "fldvPhQYpinwNYPKP",
  ring_day_no: "fldh7saao3sdocdcE",
  class_no: "fldnER8imL8073cdn",
  class_text: "fldOLZn3RmrwJk4f0",
  entry_text: "fldpjPk9qhHZg1TwR",
  total: "fldQoxHg3MaOSevXh",
  n_to_go: "fldx4KC27sIAP3EMf",
  n_gone: "fldUtkHiu8JhGT0MO",
  timestamp: "fldJotd3vLHv16UzF",
  elapsed: "fld7PScHi1Rx9gFV0",
  type: "fldKp21d0kHt3SXpu",
  ring_name_normalized: "fldYq3BFkm1VeB5c6",
  ring_visual_key: "fldbfXmdIDdj6wCDw",
  horse_now: "fldU3UTNNo6KKgOOQ",
  shows: "fldvp6ntjIHKNYPIo",
  focus_show: "flduzDhPr1y0uAr5x",
  ring_days: "fldgWdepPXM7JCLwH",
  rings: "fldiSs4mrSTX115mg",
  ring_names: "fldqAvVI3hEDDXLDd",
  classes: "fldEh1oIZPmGUZxNe",
  entries: "fldonSFYLsuAVrbmT",
  horses: "fldz4k7FsEP74YLfa",
  ring_status: "fld9AlEGjV7OkHH6Y"
};

const ENTRY_GO_FIELDS = {
  entry_go_key: "fldRBul0TP6zQFzSX",
  class_start_times: "fldSArXSblE7U1H0s",
  show_no: "fldYbrC3XUrWEB1nk",
  shows: "fldVQU3YGccKdKArv",
  focus_day: "fldV5YK4Skso0U25t",
  focus_day_key: "fldiENo8kvcW2UIsS",
  show_days: "fldGsTUFX0MmosfpT",
  focus_show: "fldapzivs4yDu15xc",
  ring_no: "fldp7C0JtYiT9TKsf",
  rings: "flduLNNe6hHxm4Lch",
  ring_day_no: "fldLvJcrh5ufukbdQ",
  ring_days: "fld7qexs3AaIRcWsu",
  class_no: "fldRtenp2KT6kxSwD",
  classes: "fldlWPmzYpjExu8PY",
  class_number: "fldxwAR9fZEgKxAf5",
  class_name: "fldzmdZLw25EGxfAa",
  entry_no: "flda59MfCPviuf9CZ",
  entries: "fldK0nv6HCMEl2qo2",
  entry_order: "fldgEZbFPXdqzKGFS",
  horse: "fldspWOxM6Vebcvl3",
  horses: "fldsQOPqU9o9VwOqd",
  horse_display: "fldXFYR9onEqDdC9t",
  rider: "fldlIG9u6L9LItRVt",
  riders: "fldT5EJMZxgTYEKFH",
  trainer: "fldzvFMZSXLfsTDVv",
  trainers: "fldB60uaBtZJxK0gw",
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
  source_table: "fldn7yxOdsIB476Ou",
  shows: "fldmWM1UaUT92gM9x",
  focus_show: "fldEAydOTiIMSXPbh",
  ring_days: "fldkZyuRFuwnI9RYd",
  rings: "fldw1Q3Ngx8s57Mn7",
  classes: "fldeD7vODmTvDoORa",
  entries: "fld5Pipfp1qquBXzi",
  horses: "fldfECzStfkd98xjj",
  riders: "fldF8b3oWuhKpb66Q",
  trainers: "fld44SFZFEs1ndM0m",
  class_start_times: "fldVO1mV5cGaMNeCa",
  entry_go_times: "fld4hVFO6C2pr9RER"
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

async function airtableList(baseId, table, token, { formula = "", view = "", fields = [], returnFieldIds = true } = {}) {
  const records = [];
  let offset = "";
  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    if (formula) url.searchParams.set("filterByFormula", formula);
    if (view) url.searchParams.set("view", view);
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

async function airtableGetRecordsById(baseId, table, token, ids) {
  const records = new Map();
  for (const id of [...new Set((ids || []).filter(Boolean))]) {
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Airtable get ${table}/${id} HTTP ${response.status}: ${raw.slice(0, 500)}`);
    const record = JSON.parse(raw);
    records.set(record.id, record);
  }
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

function compactDayToIso(value) {
  const raw = text(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return "";
}

function rowFocusDay(row) {
  return compactDayToIso(row.focus_day) || compactDayToIso(row.show_day) || compactDayToIso(row.focus_day_key);
}

function rowShowNo(row, fallbackShowNo = "") {
  return text(row.show_no || fallbackShowNo);
}

function rowFocusShowKeys(row, fallbackShowNo = "") {
  const showNo = rowShowNo(row, fallbackShowNo);
  const day = rowFocusDay(row);
  if (!showNo || !day) return [];
  return [`${showNo}|${day}`, `${showNo}|${ymd(day)}`];
}

function rowMatchesActiveFocusShow(row, focus) {
  const showNo = rowShowNo(row);
  const day = rowFocusDay(row);
  return Boolean(
    showNo &&
    day &&
    text(focus?.record_id) &&
    showNo === text(focus?.show_no) &&
    day === compactDayToIso(focus?.focus_day)
  );
}

function activeFocusShowLink(row, focus) {
  return rowMatchesActiveFocusShow(row, focus) ? airtableRecordLink(focus.record_id) : [];
}

function rowShowDayKeys(row) {
  const values = new Set();
  const raw = text(row.show_day);
  if (raw) values.add(raw);
  const day = rowFocusDay(row);
  if (day) {
    values.add(day);
    values.add(ymd(day));
    const showNo = rowShowNo(row);
    if (showNo) {
      values.add(`${showNo}|${day}`);
      values.add(`${showNo}|${ymd(day)}`);
    }
  }
  return [...values].filter(Boolean);
}

async function focusShowMapForRows(baseId, token, rows) {
  const showNos = [...new Set((rows || []).map((row) => rowShowNo(row)).filter(Boolean))];
  if (!showNos.length) return new Map();
  const focusRows = [];
  for (let index = 0; index < showNos.length; index += 25) {
    const chunk = showNos.slice(index, index + 25);
    const formula = chunk.length === 1
      ? `{show_no}=${Number(chunk[0])}`
      : `OR(${chunk.map((showNo) => `{show_no}=${Number(showNo)}`).join(",")})`;
    focusRows.push(...await airtableList(baseId, TABLES.airtableFocusShow, token, { formula }));
  }
  const map = new Map();
  for (const record of focusRows) {
    const fields = record.fields || {};
    const showNo = text(fields[FOCUS_SHOW_FIELDS.show_no]);
    const day = compactDayToIso(fields[FOCUS_SHOW_FIELDS.focus_day]);
    const rawKeys = [
      fields[FOCUS_SHOW_FIELDS.focus_day_key],
      fields[FOCUS_SHOW_FIELDS.focus_show_key],
      day,
      ymd(day)
    ].map(text).filter(Boolean);
    for (const rawKey of rawKeys) {
      map.set(rawKey, record.id);
      if (showNo) map.set(`${showNo}|${rawKey}`, record.id);
    }
    if (showNo && day) {
      map.set(`${showNo}|${day}`, record.id);
      map.set(`${showNo}|${ymd(day)}`, record.id);
    }
  }
  return map;
}

function linkOrMissingFromValues(missing, row, field, values, map) {
  for (const value of values || []) {
    const recordId = map.get(text(value));
    if (recordId) return airtableRecordLink(recordId);
  }
  missing.push({
    record_id: row.record_id,
    field,
    value: (values || []).map(text).filter(Boolean).join(","),
    ring_visual_key: row.ring_visual_key,
    ring_day_no: row.ring_day_no,
    ring_no: row.ring_no,
    class_no: row.class_no,
    entry_no: row.current_entry_no,
    horse_now: row.horse_now
  });
  return undefined;
}

function linkedIds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => typeof item === "string" ? item : item?.id)
    .filter(Boolean);
}

function sameLinkedIds(current, next) {
  const left = linkedIds(current).sort();
  const right = linkedIds(next).sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function recordMapByKey(baseId, token, tableName, keyName, keys = null) {
  const values = keys === null ? null : [...new Set((keys || []).map(text).filter(Boolean))];
  const rows = [];
  if (values === null) {
    rows.push(...await airtableList(baseId, tableName, token, { returnFieldIds: false }));
  } else {
    for (let index = 0; index < values.length; index += 25) {
      const chunk = values.slice(index, index + 25);
      if (!chunk.length) continue;
      const formula = chunk.length === 1
        ? `{${keyName}}='${airtableQuote(chunk[0])}'`
        : `OR(${chunk.map((key) => `{${keyName}}='${airtableQuote(key)}'`).join(",")})`;
      rows.push(...await airtableList(baseId, tableName, token, { formula, returnFieldIds: false }));
    }
  }
  const map = new Map();
  const duplicateKeys = new Map();
  const blankRows = [];
  for (const row of rows) {
    const key = text(row.fields?.[keyName]);
    if (!key) {
      blankRows.push(row.id);
      continue;
    }
    if (map.has(key)) {
      duplicateKeys.set(key, [...(duplicateKeys.get(key) || [map.get(key)]), row.id]);
      continue;
    }
    map.set(key, row.id);
  }
  return { map, duplicateKeys, blankRows, rows };
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
      full_lock: truthy(f[STAGING_FIELDS.full_lock]),
      shows: f[STAGING_FIELDS.shows] || [],
      focus_show: f[STAGING_FIELDS.focus_show] || [],
      ring_days: f[STAGING_FIELDS.ring_days] || [],
      rings: f[STAGING_FIELDS.rings] || [],
      events: f[STAGING_FIELDS.events] || [],
      classes: f[STAGING_FIELDS.classes] || []
    };
  });
}

async function readFocusClassStarts(baseId, token, showNo, focusDay, { allShowDays = false, view = "" } = {}) {
  const formula = allShowDays
    ? `{show_no}=${Number(showNo)}`
    : `AND({show_no}=${Number(showNo)},IS_SAME({focus_day},DATETIME_PARSE('${airtableQuote(focusDay)}'),'day'))`;
  const rows = await airtableList(baseId, TABLES.airtableClassStartTimes, token, { formula, view });
  const classStarts = rows.map((record) => {
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
      display_time: text(f[CLASS_START_FIELDS.display_time]),
      update_schedule_staging: f[CLASS_START_FIELDS.update_schedule_staging] || [],
      shows: f[CLASS_START_FIELDS.shows] || [],
      focus_show: f[CLASS_START_FIELDS.focus_show] || [],
      ring_days: f[CLASS_START_FIELDS.ring_days] || [],
      rings: f[CLASS_START_FIELDS.rings] || [],
      classes: f[CLASS_START_FIELDS.classes] || []
    };
  });
  const stagingById = await airtableGetRecordsById(
    baseId,
    TABLES.airtableStaging,
    token,
    classStarts.flatMap((row) => row.update_schedule_staging || [])
  );
  return classStarts.map((row) => {
    const stagingId = (row.update_schedule_staging || [])[0];
    const stagingFields = stagingById.get(stagingId)?.fields || {};
    return {
      ...row,
      shows: row.shows?.length ? row.shows : stagingFields[STAGING_FIELDS.shows] || [],
      focus_show: row.focus_show?.length ? row.focus_show : stagingFields[STAGING_FIELDS.focus_show] || [],
      ring_days: row.ring_days?.length ? row.ring_days : stagingFields[STAGING_FIELDS.ring_days] || [],
      rings: row.rings?.length ? row.rings : stagingFields[STAGING_FIELDS.rings] || [],
      classes: row.classes?.length ? row.classes : stagingFields[STAGING_FIELDS.classes] || []
    };
  });
}

async function readActiveEntryGoTimes(baseId, token, showNo, focusDay, { view = "" } = {}) {
  const formula = `AND({show_no}=${Number(showNo)},IS_SAME({focus_day},DATETIME_PARSE('${airtableQuote(focusDay)}'),'day'),{status}='active')`;
  const rows = await airtableList(baseId, TABLES.airtableEntryGoTimes, token, { formula, view });
  return rows.map((record) => {
    const f = record.fields || {};
    return {
      record_id: record.id,
      entry_go_key: text(f[ENTRY_GO_FIELDS.entry_go_key]),
      class_start_times: f[ENTRY_GO_FIELDS.class_start_times] || [],
      show_no: asNumber(f[ENTRY_GO_FIELDS.show_no]),
      shows: f[ENTRY_GO_FIELDS.shows] || [],
      focus_day: isoDate(f[ENTRY_GO_FIELDS.focus_day]),
      focus_show: f[ENTRY_GO_FIELDS.focus_show] || [],
      ring_day_no: asNumber(f[ENTRY_GO_FIELDS.ring_day_no]),
      ring_days: f[ENTRY_GO_FIELDS.ring_days] || [],
      ring_no: asNumber(f[ENTRY_GO_FIELDS.ring_no]),
      rings: f[ENTRY_GO_FIELDS.rings] || [],
      class_no: asNumber(f[ENTRY_GO_FIELDS.class_no]),
      classes: f[ENTRY_GO_FIELDS.classes] || [],
      class_number: asNumber(f[ENTRY_GO_FIELDS.class_number]),
      class_name: text(f[ENTRY_GO_FIELDS.class_name]),
      entry_no: asNumber(f[ENTRY_GO_FIELDS.entry_no]),
      entries: f[ENTRY_GO_FIELDS.entries] || [],
      entry_order: asNumber(f[ENTRY_GO_FIELDS.entry_order]),
      horse: text(f[ENTRY_GO_FIELDS.horse]),
      horses: f[ENTRY_GO_FIELDS.horses] || [],
      horse_display: text(f[ENTRY_GO_FIELDS.horse_display]),
      rider: text(f[ENTRY_GO_FIELDS.rider]),
      riders: f[ENTRY_GO_FIELDS.riders] || [],
      trainer: text(f[ENTRY_GO_FIELDS.trainer]),
      trainers: f[ENTRY_GO_FIELDS.trainers] || [],
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
  const updates = await buildStaleTimeAlertUpdates(baseId, token, focus, activeAlertKeys);
  return updates.length ? airtableUpdate(baseId, TABLES.airtableAlerts, updates, token) : [];
}

async function buildStaleTimeAlertUpdates(baseId, token, focus, activeAlertKeys) {
  const formula = `AND({show_no}=${Number(focus.show_no)},IS_SAME({focus_day},DATETIME_PARSE('${airtableQuote(focus.focus_day)}'),'day'),{status}='open',OR({alert_lane}='class_start_times',{alert_lane}='entry_go_times'))`;
  const rows = await airtableList(baseId, TABLES.airtableAlerts, token, { formula });
  return rows
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
      [CLASS_START_FIELDS.shows]: row.shows?.length ? airtableRecordLinks(row.shows) : airtableRecordLink(shows.get(text(row.show_no))),
      [CLASS_START_FIELDS.focus_show]: row.focus_show?.length ? airtableRecordLinks(row.focus_show) : airtableRecordLink(focusRecordId),
      [CLASS_START_FIELDS.rings]: row.rings?.length ? airtableRecordLinks(row.rings) : airtableRecordLink(rings.get(text(row.ring_no))),
      [CLASS_START_FIELDS.ring_days]: row.ring_days?.length ? airtableRecordLinks(row.ring_days) : airtableRecordLink(ringDays.get(text(row.ring_day_no))),
      [CLASS_START_FIELDS.events]: airtableRecordLinks(row.events),
      [CLASS_START_FIELDS.classes]: row.classes?.length ? airtableRecordLinks(row.classes) : airtableRecordLink(classes.get(text(row.class_no))),
      [CLASS_START_FIELDS.class_oog]: airtableRecordLinks(oogGroup?.ids || [])
    });
  });
}

async function syncClassStartTimes(app, baseId, token, focus) {
  const stagingRows = await readLockedStaging(baseId, token, focus.show_no, focus.focus_day);
  const classRows = buildClassStartRows(stagingRows);
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

function classScopeKey(row) {
  return [
    text(row.show_no),
    text(row.focus_day),
    text(row.ring_day_no),
    text(row.ring_no),
    text(row.class_no)
  ].join("|");
}

function duplicateKeys(keys) {
  const counts = new Map();
  for (const key of keys.filter(Boolean)) counts.set(key, (counts.get(key) || 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));
}

async function readFocusGetOrders(baseId, token, focus, { allShowDays = false } = {}) {
  const orderFormula = allShowDays
    ? `{show_no}=${Number(focus.show_no)}`
    : `AND({show_no}=${Number(focus.show_no)},IS_SAME({focus_day},DATETIME_PARSE('${airtableQuote(focus.focus_day)}'),'day'))`;
  const orderRecords = await airtableList(baseId, TABLES.airtableGetOrders, token, { formula: orderFormula });
  return orderRecords.map((record) => {
    const f = record.fields || {};
    return {
      record_id: record.id,
      show_no: asNumber(f[GET_ORDERS_FIELDS.show_no]),
      focus_day: isoDate(f[GET_ORDERS_FIELDS.focus_day]),
      show_day: text(f[GET_ORDERS_FIELDS.show_day]),
      ring_day_no: asNumber(f[GET_ORDERS_FIELDS.ring_day_no]),
      ring_no: asNumber(f[GET_ORDERS_FIELDS.ring_no]),
      class_no: asNumber(f[GET_ORDERS_FIELDS.class_no]),
      class_number: classNumberFromLabel(f[GET_ORDERS_FIELDS.class_text]),
      ring_name_normalized: text(f[GET_ORDERS_FIELDS.ring_name_normalized]),
      n_gone: asNumber(f[GET_ORDERS_FIELDS.n_gone]),
      n_to_go: asNumber(f[GET_ORDERS_FIELDS.n_to_go]),
      total: asNumber(f[GET_ORDERS_FIELDS.total]),
      timestamp: asNumber(f[GET_ORDERS_FIELDS.timestamp]),
      elapsed: asNumber(f[GET_ORDERS_FIELDS.elapsed]),
      current_entry_no: asNumber(f[GET_ORDERS_FIELDS.entry_no]) || entryNoFromText(f[GET_ORDERS_FIELDS.entry_text]),
      current_horse: horseFromEntryText(f[GET_ORDERS_FIELDS.entry_text]),
      class_start_times: linkedIds(f[GET_ORDERS_FIELDS.class_start_times]),
      shows: linkedIds(f[GET_ORDERS_FIELDS.shows]),
      show_days: linkedIds(f[GET_ORDERS_FIELDS.show_days]),
      focus_show: linkedIds(f[GET_ORDERS_FIELDS.focus_show]),
      ring_days: linkedIds(f[GET_ORDERS_FIELDS.ring_days]),
      rings: linkedIds(f[GET_ORDERS_FIELDS.rings]),
      ring_names: linkedIds(f[GET_ORDERS_FIELDS.ring_names]),
      classes: linkedIds(f[GET_ORDERS_FIELDS.classes]),
      entries: linkedIds(f[GET_ORDERS_FIELDS.entries])
    };
  });
}

async function syncGetOrdersLinks(baseId, token, focus, { includeOrders = false, allShowDays = false } = {}) {
  const orders = await readFocusGetOrders(baseId, token, focus, { allShowDays });
  const classStarts = await readFocusClassStarts(baseId, token, focus.show_no, focus.focus_day, { allShowDays });
  const matches = matchGetOrdersToClassStart(orders, classStarts);
  const startsByKey = new Map(classStarts.map((row) => [row.class_start_key, row]));
  const matchByOrderId = new Map(matches.map((match) => [match.order.record_id, match]));
  const matchedOrderIds = new Set(matches.map((match) => match.order.record_id));
  const [
    shows,
    showDays,
    ringDays,
    ringMap,
    ringNames,
    classes,
    entries
  ] = await Promise.all([
    linkMap(baseId, token, TABLES.airtableShows, "show_no", orders.map((row) => row.show_no)),
    linkMap(baseId, token, TABLES.airtableShowDays, "show_day", orders.flatMap(rowShowDayKeys)),
    linkMap(baseId, token, TABLES.airtableRingDays, "ring_day_no", orders.map((row) => row.ring_day_no)),
    linkMap(baseId, token, TABLES.airtableRings, "ring_no", orders.map((row) => row.ring_no)),
    linkMap(baseId, token, TABLES.airtableRingNames, "ring_name", orders.map((row) => row.ring_name_normalized)),
    linkMap(baseId, token, TABLES.airtableClasses, "class_no", orders.map((row) => row.class_no)),
    linkMap(baseId, token, TABLES.airtableEntries, "entry_no", orders.map((row) => row.current_entry_no))
  ]);

  const missing = [];
  const missingRingNameNormalized = [];
  const unmatched = orders
    .filter((row) => row.class_no && !matchedOrderIds.has(row.record_id))
    .map((row) => ({
      record_id: row.record_id,
      show_no: row.show_no,
      focus_day: row.focus_day,
      ring_day_no: row.ring_day_no,
      ring_no: row.ring_no,
      class_no: row.class_no,
      class_number: row.class_number
    }));
  const updates = [];
  for (const order of orders) {
    const match = matchByOrderId.get(order.record_id);
    const start = match ? startsByKey.get(match.class_start_key) : null;
    const fields = cleanFields({
      [GET_ORDERS_FIELDS.class_start_times]: start?.record_id ? airtableRecordLink(start.record_id) : undefined,
      [GET_ORDERS_FIELDS.shows]: start?.shows?.length
        ? airtableRecordLinks(start.shows)
        : linkOrMissing(missing, order, "shows", text(order.show_no), shows.get(text(order.show_no))),
      [GET_ORDERS_FIELDS.show_days]: linkOrMissingFromValues(missing, order, "show_days", rowShowDayKeys(order), showDays),
      [GET_ORDERS_FIELDS.focus_show]: activeFocusShowLink(order, focus),
      [GET_ORDERS_FIELDS.ring_days]: start?.ring_days?.length
        ? airtableRecordLinks(start.ring_days)
        : linkOrMissing(missing, order, "ring_days", text(order.ring_day_no), ringDays.get(text(order.ring_day_no))),
      [GET_ORDERS_FIELDS.rings]: start?.rings?.length
        ? airtableRecordLinks(start.rings)
        : linkOrMissing(missing, order, "rings", text(order.ring_no), ringMap.get(text(order.ring_no))),
      [GET_ORDERS_FIELDS.classes]: start?.classes?.length
        ? airtableRecordLinks(start.classes)
        : linkOrMissing(missing, order, "classes", text(order.class_no), classes.get(text(order.class_no))),
      [GET_ORDERS_FIELDS.entries]: linkOrMissing(missing, order, "entries", text(order.current_entry_no), entries.get(text(order.current_entry_no)))
    });
    if (order.ring_name_normalized) {
      fields[GET_ORDERS_FIELDS.ring_names] = linkOrMissing(
        missing,
        order,
        "ring_names",
        order.ring_name_normalized,
        ringNames.get(order.ring_name_normalized)
      );
    } else {
      fields[GET_ORDERS_FIELDS.ring_names] = [];
      missingRingNameNormalized.push({
        record_id: order.record_id,
        ring_day_no: order.ring_day_no,
        ring_no: order.ring_no,
        class_no: order.class_no
      });
    }
    const currentByField = {
      [GET_ORDERS_FIELDS.class_start_times]: order.class_start_times,
      [GET_ORDERS_FIELDS.shows]: order.shows,
      [GET_ORDERS_FIELDS.show_days]: order.show_days,
      [GET_ORDERS_FIELDS.focus_show]: order.focus_show,
      [GET_ORDERS_FIELDS.ring_days]: order.ring_days,
      [GET_ORDERS_FIELDS.rings]: order.rings,
      [GET_ORDERS_FIELDS.ring_names]: order.ring_names,
      [GET_ORDERS_FIELDS.classes]: order.classes,
      [GET_ORDERS_FIELDS.entries]: order.entries
    };
    const changed = Object.entries(fields).some(([fieldId, next]) => !sameLinkedIds(currentByField[fieldId] || [], next));
    if (changed) updates.push({ id: order.record_id, fields });
  }

  if (missing.length) {
    await logRun(baseId, token, {
      action: "get_orders_linkback_enrichment",
      showNo: focus.show_no,
      focusDay: focus.focus_day,
      status: "error",
      recordsSeen: orders.length,
      recordsChanged: 0,
      summary: `get_orders helper/linkback missing ${missing.length} required links`,
      payload: {
        matches: matches.length,
        unmatched: unmatched.slice(0, 25),
        missing: missing.slice(0, 25),
        missing_ring_name_normalized: missingRingNameNormalized.slice(0, 25)
      }
    });
    throw new Error(`get_orders helper/linkback missing ${missing.length} required links`);
  }

  const updated = await airtableUpdate(baseId, TABLES.airtableGetOrders, updates, token);
  await logRun(baseId, token, {
    action: "get_orders_linkback_enrichment",
    showNo: focus.show_no,
    focusDay: focus.focus_day,
    status: "ok",
    recordsSeen: orders.length,
      recordsChanged: updated.length,
    summary: `get_orders direct links updated ${updated.length}/${orders.length}; matched ${matches.length}`,
    payload: {
      orders: orders.length,
      all_show_days: allShowDays,
      matches: matches.length,
      updated: updated.length,
      unmatched: unmatched.slice(0, 25),
      missing_ring_name_normalized: missingRingNameNormalized
    }
  });
  const result = {
    orders: orders.length,
    matches: matches.length,
    updated: updated.length,
    unmatched,
    missing_ring_name_normalized: missingRingNameNormalized
  };
  if (includeOrders) {
    result.orders_rows = orders;
    result.class_starts = classStarts;
    result.matches_rows = matches;
  }
  return result;
}

async function syncGetOrders(app, baseId, token, focus) {
  const linkback = await syncGetOrdersLinks(baseId, token, focus, { includeOrders: true });
  const orders = linkback.orders_rows;
  const classStarts = linkback.class_starts;
  const matches = linkback.matches_rows;
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
    payload: {
      orders: orders.length,
      matches: matches.length,
      airtable_updated: updated.length,
      catalyst_updated: catalystUpdates.length,
      get_orders_linkback: {
        updated: linkback.updated,
        missing_ring_name_normalized: linkback.missing_ring_name_normalized,
        unmatched: linkback.unmatched
      }
    }
  });

  return {
    orders: orders.length,
    matches: matches.length,
    airtable_updated: updated.length,
    catalyst_updated: catalystUpdates.length,
    get_orders_linkback: {
      updated: linkback.updated,
      missing_ring_name_normalized: linkback.missing_ring_name_normalized,
      unmatched: linkback.unmatched
    }
  };
}

async function readFocusGetRings(baseId, token, focus, { allShowDays = false } = {}) {
  const ringFormula = allShowDays
    ? `{show_no}='${airtableQuote(focus.show_no)}'`
    : `AND({show_no}='${airtableQuote(focus.show_no)}',IS_SAME({focus_day},DATETIME_PARSE('${airtableQuote(focus.focus_day)}'),'day'))`;
  const ringRecords = await airtableList(baseId, TABLES.airtableGetRings, token, { formula: ringFormula });
  return ringRecords.map((record) => {
    const f = record.fields || {};
    return {
      record_id: record.id,
      show_no: asNumber(f[GET_RINGS_FIELDS.show_no]),
      focus_day: isoDate(f[GET_RINGS_FIELDS.focus_day]),
      show_day: text(f[GET_RINGS_FIELDS.show_day]),
      ring_day_no: asNumber(f[GET_RINGS_FIELDS.ring_day_no]),
      ring_no: asNumber(f[GET_RINGS_FIELDS.ring_no]),
      class_no: asNumber(f[GET_RINGS_FIELDS.class_no]),
      class_number: classNumberFromLabel(f[GET_RINGS_FIELDS.class_text]),
      n_gone: asNumber(f[GET_RINGS_FIELDS.n_gone]),
      n_to_go: asNumber(f[GET_RINGS_FIELDS.n_to_go]),
      total: asNumber(f[GET_RINGS_FIELDS.total]),
      timestamp: asNumber(f[GET_RINGS_FIELDS.timestamp]),
      elapsed: asNumber(f[GET_RINGS_FIELDS.elapsed]),
      entry_text: text(f[GET_RINGS_FIELDS.entry_text]),
      current_entry_no: entryNoFromText(f[GET_RINGS_FIELDS.entry_text]),
      current_horse: horseFromEntryText(f[GET_RINGS_FIELDS.entry_text]),
      type: text(f[GET_RINGS_FIELDS.type]),
      ring_name_normalized: text(f[GET_RINGS_FIELDS.ring_name_normalized]),
      ring_visual_key: text(f[GET_RINGS_FIELDS.ring_visual_key]),
      horse_now: text(f[GET_RINGS_FIELDS.horse_now]),
      shows: linkedIds(f[GET_RINGS_FIELDS.shows]),
      show_days: linkedIds(f[GET_RINGS_FIELDS.show_days]),
      focus_show: linkedIds(f[GET_RINGS_FIELDS.focus_show]),
      ring_days: linkedIds(f[GET_RINGS_FIELDS.ring_days]),
      rings: linkedIds(f[GET_RINGS_FIELDS.rings]),
      ring_names: linkedIds(f[GET_RINGS_FIELDS.ring_names]),
      classes: linkedIds(f[GET_RINGS_FIELDS.classes]),
      entries: linkedIds(f[GET_RINGS_FIELDS.entries]),
      horses: linkedIds(f[GET_RINGS_FIELDS.horses]),
      ring_status: linkedIds(f[GET_RINGS_FIELDS.ring_status])
    };
  });
}

function linkOrMissing(missing, row, field, value, recordId) {
  if (!value || !recordId) {
    missing.push({
      record_id: row.record_id,
      field,
      value,
      helper_record_id: recordId || "",
      ring_visual_key: row.ring_visual_key,
      ring_day_no: row.ring_day_no,
      ring_no: row.ring_no,
      class_no: row.class_no,
      entry_no: row.current_entry_no,
      horse_now: row.horse_now
    });
    return undefined;
  }
  return airtableRecordLink(recordId);
}

async function syncGetRingsLinks(baseId, token, focus, { allShowDays = false } = {}) {
  const rings = await readFocusGetRings(baseId, token, focus, { allShowDays });
  const showNos = rings.map((row) => row.show_no);
  const showDayValues = rings.flatMap(rowShowDayKeys);
  const ringDayNos = rings.map((row) => row.ring_day_no);
  const ringNos = rings.map((row) => row.ring_no);
  const ringNameNormalized = rings.map((row) => row.ring_name_normalized);
  const classNos = rings.map((row) => row.class_no);
  const entryNos = rings.map((row) => row.current_entry_no);
  const horseNow = rings.map((row) => row.horse_now);
  const ringVisualKeys = rings.map((row) => row.ring_visual_key);
  const [
    shows,
    showDays,
    ringDays,
    ringMap,
    ringNames,
    classes,
    entries,
    horses,
    ringStatusAll
  ] = await Promise.all([
    linkMap(baseId, token, TABLES.airtableShows, "show_no", showNos),
    linkMap(baseId, token, TABLES.airtableShowDays, "show_day", showDayValues),
    linkMap(baseId, token, TABLES.airtableRingDays, "ring_day_no", ringDayNos),
    linkMap(baseId, token, TABLES.airtableRings, "ring_no", ringNos),
    recordMapByKey(baseId, token, TABLES.airtableRingNames, "ring_name", ringNameNormalized),
    linkMap(baseId, token, TABLES.airtableClasses, "class_no", classNos),
    linkMap(baseId, token, TABLES.airtableEntries, "entry_no", entryNos),
    linkMap(baseId, token, TABLES.airtableHorses, "horse", horseNow),
    recordMapByKey(baseId, token, TABLES.airtableRingStatus, "ring_visual_key", null)
  ]);

  if (ringStatusAll.blankRows.length || ringStatusAll.duplicateKeys.size) {
    const detail = {
      blank_ring_status_rows: ringStatusAll.blankRows.slice(0, 10),
      duplicate_ring_visual_keys: Object.fromEntries([...ringStatusAll.duplicateKeys.entries()].slice(0, 10))
    };
    await logRun(baseId, token, {
      action: "get_rings_linkback_enrichment",
      showNo: focus.show_no,
      focusDay: focus.focus_day,
      status: "error",
      recordsSeen: rings.length,
      recordsChanged: 0,
      summary: "get_rings ring_status ring_visual_key uniqueness failed",
      payload: detail
    });
    throw new Error(`ring_status ring_visual_key uniqueness failed: ${JSON.stringify(detail)}`);
  }

  const missing = [];
  const missingRingNameNormalized = [];
  const missingHorseNow = [];
  const updates = [];
  for (const row of rings) {
    const fields = cleanFields({
      [GET_RINGS_FIELDS.shows]: linkOrMissing(missing, row, "shows", text(row.show_no), shows.get(text(row.show_no))),
      [GET_RINGS_FIELDS.show_days]: linkOrMissingFromValues(missing, row, "show_days", rowShowDayKeys(row), showDays),
      [GET_RINGS_FIELDS.focus_show]: activeFocusShowLink(row, focus),
      [GET_RINGS_FIELDS.ring_days]: linkOrMissing(missing, row, "ring_days", text(row.ring_day_no), ringDays.get(text(row.ring_day_no))),
      [GET_RINGS_FIELDS.rings]: linkOrMissing(missing, row, "rings", text(row.ring_no), ringMap.get(text(row.ring_no))),
      [GET_RINGS_FIELDS.classes]: linkOrMissing(missing, row, "classes", text(row.class_no), classes.get(text(row.class_no))),
      [GET_RINGS_FIELDS.entries]: linkOrMissing(missing, row, "entries", text(row.current_entry_no), entries.get(text(row.current_entry_no))),
      [GET_RINGS_FIELDS.ring_status]: linkOrMissing(missing, row, "ring_status", row.ring_visual_key, ringStatusAll.map.get(row.ring_visual_key))
    });
    if (row.ring_name_normalized) {
      fields[GET_RINGS_FIELDS.ring_names] = linkOrMissing(missing, row, "ring_names", row.ring_name_normalized, ringNames.map.get(row.ring_name_normalized));
    } else {
      fields[GET_RINGS_FIELDS.ring_names] = [];
      missingRingNameNormalized.push({
        record_id: row.record_id,
        ring_day_no: row.ring_day_no,
        ring_no: row.ring_no,
        class_no: row.class_no
      });
    }
    if (row.horse_now) {
      fields[GET_RINGS_FIELDS.horses] = linkOrMissing(missing, row, "horses", row.horse_now, horses.get(row.horse_now));
    } else {
      missingHorseNow.push({
        record_id: row.record_id,
        ring_day_no: row.ring_day_no,
        ring_no: row.ring_no,
        class_no: row.class_no,
        entry_no: row.current_entry_no
      });
    }
    const changed = Object.entries(fields).some(([fieldId, next]) => !sameLinkedIds(row[Object.keys(GET_RINGS_FIELDS).find((name) => GET_RINGS_FIELDS[name] === fieldId)] || [], next));
    if (changed) updates.push({ id: row.record_id, fields });
  }

  if (missing.length) {
    await logRun(baseId, token, {
      action: "get_rings_linkback_enrichment",
      showNo: focus.show_no,
      focusDay: focus.focus_day,
      status: "error",
      recordsSeen: rings.length,
      recordsChanged: 0,
      summary: `get_rings helper/linkback missing ${missing.length} required links`,
      payload: {
        missing: missing.slice(0, 25),
        missing_ring_name_normalized: missingRingNameNormalized.slice(0, 25),
        missing_horse_now: missingHorseNow.slice(0, 25)
      }
    });
    throw new Error(`get_rings helper/linkback missing ${missing.length} required links`);
  }

  const updated = await airtableUpdate(baseId, TABLES.airtableGetRings, updates, token);
  await logRun(baseId, token, {
    action: "get_rings_linkback_enrichment",
    showNo: focus.show_no,
    focusDay: focus.focus_day,
    status: "ok",
    recordsSeen: rings.length,
    recordsChanged: updated.length,
    summary: `get_rings direct links updated ${updated.length}/${rings.length}`,
    payload: {
      rings: rings.length,
      updated: updated.length,
      all_show_days: allShowDays,
      ring_status_keys: ringStatusAll.map.size,
      missing_ring_name_normalized: missingRingNameNormalized,
      missing_horse_now: missingHorseNow
    }
  });
  return {
    rings: rings.length,
    updated: updated.length,
    ring_status_keys: ringStatusAll.map.size,
    missing_ring_name_normalized: missingRingNameNormalized,
    missing_horse_now: missingHorseNow
  };
}

const ACTIVE_FOCUS_HELPER_REPAIR_CONFIGS = [
  {
    name: "get_orders",
    tableId: TABLES.airtableGetOrders,
    fields: {
      showNo: GET_ORDERS_FIELDS.show_no,
      shows: GET_ORDERS_FIELDS.shows,
      focusDay: GET_ORDERS_FIELDS.focus_day,
      showDay: GET_ORDERS_FIELDS.show_day,
      showDays: GET_ORDERS_FIELDS.show_days,
      focusShow: GET_ORDERS_FIELDS.focus_show,
      ringNameNormalized: GET_ORDERS_FIELDS.ring_name_normalized,
      ringNames: GET_ORDERS_FIELDS.ring_names
    }
  },
  {
    name: "get_rings",
    tableId: TABLES.airtableGetRings,
    fields: {
      showNo: GET_RINGS_FIELDS.show_no,
      shows: GET_RINGS_FIELDS.shows,
      focusDay: GET_RINGS_FIELDS.focus_day,
      showDay: GET_RINGS_FIELDS.show_day,
      showDays: GET_RINGS_FIELDS.show_days,
      focusShow: GET_RINGS_FIELDS.focus_show,
      ringNameNormalized: GET_RINGS_FIELDS.ring_name_normalized,
      ringNames: GET_RINGS_FIELDS.ring_names
    }
  },
  {
    name: "update_schedule_staging",
    tableId: TABLES.airtableStaging,
    fields: {
      showNo: STAGING_FIELDS.show_no,
      shows: STAGING_FIELDS.shows,
      focusDay: STAGING_FIELDS.iso_date,
      showDay: STAGING_FIELDS.show_day,
      focusDayKey: STAGING_FIELDS.focus_day_key,
      showDays: STAGING_FIELDS.show_days,
      focusShow: STAGING_FIELDS.focus_show,
      ringNameNormalized: STAGING_FIELDS.ring_name_normalized,
      ringNames: STAGING_FIELDS.ring_names
    }
  },
  {
    name: "class_oog_staging",
    tableId: TABLES.airtableClassOogStaging,
    fields: {
      showNo: CLASS_OOG_STAGING_FIELDS.show_no,
      shows: CLASS_OOG_STAGING_FIELDS.shows,
      focusDay: CLASS_OOG_STAGING_FIELDS.focus_day,
      focusDayKey: CLASS_OOG_STAGING_FIELDS.focus_day_key,
      showDays: CLASS_OOG_STAGING_FIELDS.show_days,
      focusShow: CLASS_OOG_STAGING_FIELDS.focus_show,
      ringNameNormalized: CLASS_OOG_STAGING_FIELDS.ring_name_normalized,
      ringNames: CLASS_OOG_STAGING_FIELDS.ring_names
    }
  },
  {
    name: "entry_go_times",
    tableId: TABLES.airtableEntryGoTimes,
    fields: {
      showNo: ENTRY_GO_FIELDS.show_no,
      shows: ENTRY_GO_FIELDS.shows,
      focusDay: ENTRY_GO_FIELDS.focus_day,
      focusDayKey: ENTRY_GO_FIELDS.focus_day_key,
      showDays: ENTRY_GO_FIELDS.show_days,
      focusShow: ENTRY_GO_FIELDS.focus_show
    }
  },
  {
    name: "class_start_times",
    tableId: TABLES.airtableClassStartTimes,
    fields: {
      showNo: CLASS_START_FIELDS.show_no,
      shows: CLASS_START_FIELDS.shows,
      focusDay: CLASS_START_FIELDS.focus_day,
      focusShow: CLASS_START_FIELDS.focus_show
    }
  },
  {
    name: "wec-alerts",
    tableId: TABLES.airtableAlerts,
    fields: {
      showNo: ALERT_FIELDS.show_no,
      shows: ALERT_FIELDS.shows,
      focusDay: ALERT_FIELDS.focus_day,
      focusShow: ALERT_FIELDS.focus_show
    }
  },
  {
    name: "class_oog",
    tableId: TABLES.airtableClassOog,
    fields: {
      showNo: CLASS_OOG_FIELDS.show_no,
      shows: CLASS_OOG_FIELDS.shows,
      focusDay: CLASS_OOG_FIELDS.focus_day,
      focusDayKey: CLASS_OOG_FIELDS.focus_day_key,
      showDays: CLASS_OOG_FIELDS.show_days,
      focusShow: CLASS_OOG_FIELDS.focus_show,
      ringNameNormalized: CLASS_OOG_FIELDS.ring_name_normalized,
      ringNames: CLASS_OOG_FIELDS.ring_names
    }
  }
];

function helperRowFromRecord(record, fieldIds) {
  const fields = record.fields || {};
  return {
    record_id: record.id,
    show_no: fieldIds.showNo ? fields[fieldIds.showNo] : "",
    focus_day: fieldIds.focusDay ? fields[fieldIds.focusDay] : "",
    show_day: fieldIds.showDay ? fields[fieldIds.showDay] : "",
    focus_day_key: fieldIds.focusDayKey ? fields[fieldIds.focusDayKey] : "",
    ring_name_normalized: fieldIds.ringNameNormalized ? text(fields[fieldIds.ringNameNormalized]) : "",
    current: fields
  };
}

function firstLinkedIdFromValues(map, values) {
  for (const value of values || []) {
    const recordId = map.get(text(value));
    if (recordId) return airtableRecordLink(recordId);
  }
  return [];
}

function assignLinkedFieldIfChanged(fields, currentFields, fieldId, next) {
  if (!fieldId) return false;
  const current = linkedIds(currentFields[fieldId]);
  if (sameLinkedIds(current, next)) return false;
  fields[fieldId] = next;
  return true;
}

async function repairActiveFocusHelperLinks(baseId, token, focus) {
  const rowsByTable = new Map();
  const allRows = [];
  for (const config of ACTIVE_FOCUS_HELPER_REPAIR_CONFIGS) {
    const records = await airtableList(baseId, config.tableId, token, { returnFieldIds: true });
    const rows = records
      .map((record) => helperRowFromRecord(record, config.fields))
      .filter((row) => rowShowNo(row) === text(focus.show_no));
    rowsByTable.set(config.name, rows);
    allRows.push(...rows);
  }

  const [shows, showDays, ringNames] = await Promise.all([
    linkMap(baseId, token, TABLES.airtableShows, "show_no", allRows.map((row) => row.show_no)),
    linkMap(baseId, token, TABLES.airtableShowDays, "show_day", allRows.flatMap(rowShowDayKeys)),
    linkMap(baseId, token, TABLES.airtableRingNames, "ring_name", allRows.map((row) => row.ring_name_normalized))
  ]);

  const result = {
    active_focus_show_record: focus.record_id,
    active_show_no: focus.show_no,
    active_focus_day: focus.focus_day,
    tables: {},
    records_updated: 0,
    focus_show_linked_rows: 0,
    focus_show_cleared_rows: 0,
    show_days_linked_rows: 0,
    shows_linked_rows: 0,
    ring_names_linked_rows: 0,
    missing_show_days: [],
    missing_shows: [],
    missing_ring_name_normalized: [],
    missing_ring_names: []
  };

  for (const config of ACTIVE_FOCUS_HELPER_REPAIR_CONFIGS) {
    const rows = rowsByTable.get(config.name) || [];
    const updates = [];
    const tableStats = {
      rows_checked: rows.length,
      records_updated: 0,
      focus_show_linked_rows: 0,
      focus_show_cleared_rows: 0,
      show_days_linked_rows: 0,
      shows_linked_rows: 0,
      ring_names_linked_rows: 0
    };

    for (const row of rows) {
      const fields = {};
      const showNo = text(rowShowNo(row));
      if (config.fields.shows) {
        const nextShows = shows.get(showNo) ? airtableRecordLink(shows.get(showNo)) : [];
        assignLinkedFieldIfChanged(fields, row.current, config.fields.shows, nextShows);
        if (nextShows.length) {
          tableStats.shows_linked_rows += 1;
          result.shows_linked_rows += 1;
        } else if (showNo) {
          result.missing_shows.push({ table: config.name, record_id: row.record_id, show_no: showNo });
        }
      }

      if (config.fields.showDays) {
        const showDayKeys = rowShowDayKeys(row);
        const nextShowDays = firstLinkedIdFromValues(showDays, showDayKeys);
        assignLinkedFieldIfChanged(fields, row.current, config.fields.showDays, nextShowDays);
        if (nextShowDays.length) {
          tableStats.show_days_linked_rows += 1;
          result.show_days_linked_rows += 1;
        } else if (showDayKeys.length) {
          result.missing_show_days.push({ table: config.name, record_id: row.record_id, show_day: showDayKeys[0] });
        }
      }

      if (config.fields.focusShow) {
        const nextFocusShow = activeFocusShowLink(row, focus);
        assignLinkedFieldIfChanged(fields, row.current, config.fields.focusShow, nextFocusShow);
        if (nextFocusShow.length) {
          tableStats.focus_show_linked_rows += 1;
          result.focus_show_linked_rows += 1;
        } else if (linkedIds(row.current[config.fields.focusShow]).length) {
          tableStats.focus_show_cleared_rows += 1;
          result.focus_show_cleared_rows += 1;
        }
      }

      if (config.fields.ringNames) {
        const normalized = text(row.ring_name_normalized);
        const nextRingNames = normalized && ringNames.get(normalized) ? airtableRecordLink(ringNames.get(normalized)) : [];
        assignLinkedFieldIfChanged(fields, row.current, config.fields.ringNames, nextRingNames);
        if (nextRingNames.length) {
          tableStats.ring_names_linked_rows += 1;
          result.ring_names_linked_rows += 1;
        } else if (!normalized) {
          result.missing_ring_name_normalized.push({ table: config.name, record_id: row.record_id });
        } else {
          result.missing_ring_names.push({ table: config.name, record_id: row.record_id, ring_name_normalized: normalized });
        }
      }

      if (Object.keys(fields).length) updates.push({ id: row.record_id, fields });
    }

    const updated = await airtableUpdate(baseId, config.tableId, updates, token);
    tableStats.records_updated = updated.length;
    result.records_updated += updated.length;
    result.tables[config.name] = tableStats;
  }

  await logRun(baseId, token, {
    action: "repair-active-focus-helper-links",
    showNo: focus.show_no,
    focusDay: focus.focus_day,
    status: "ok",
    recordsSeen: allRows.length,
    recordsChanged: result.records_updated,
    summary: "active focus_show/show_days/ring_names helper repair completed",
    payload: result
  });

  return result;
}

async function syncGetRings(app, baseId, token, focus) {
  const linkback = await syncGetRingsLinks(baseId, token, focus);
  const rings = await readFocusGetRings(baseId, token, focus);
  const classStarts = await readFocusClassStarts(baseId, token, focus.show_no, focus.focus_day);
  const matches = matchGetRingsToClassStart(rings, classStarts);
  const sourceKeys = rings.map(classScopeKey);
  const targetKeys = classStarts.map(classScopeKey);
  const matchedKeys = new Set(matches.map((match) => classScopeKey(match.ring)));
  const targetKeySet = new Set(targetKeys);
  const missing = rings
    .filter((row) => !targetKeySet.has(classScopeKey(row)))
    .map((row) => ({
      key: classScopeKey(row),
      class_no: row.class_no,
      class_number: row.class_number,
      ring_day_no: row.ring_day_no,
      ring_no: row.ring_no,
      entry_text: row.entry_text
    }));
  const extras = classStarts
    .filter((row) => matchedKeys.has(classScopeKey(row)) && !sourceKeys.includes(classScopeKey(row)))
    .map((row) => classScopeKey(row));
  const startsByKey = new Map(classStarts.map((row) => [row.class_start_key, row]));
  const airtableUpdates = matches.map((match) => {
    const start = startsByKey.get(match.class_start_key);
    return {
      id: start.record_id,
      fields: cleanFields({
        [CLASS_START_FIELDS.n_gone]: match.updates.n_gone,
        [CLASS_START_FIELDS.n_to_go]: match.updates.n_to_go,
        [CLASS_START_FIELDS.elapsed_seconds]: match.updates.elapsed_seconds,
        [CLASS_START_FIELDS.current_entry_no]: match.ring.current_entry_no,
        [CLASS_START_FIELDS.current_horse]: match.ring.current_horse,
        [CLASS_START_FIELDS.live_source]: "get_rings",
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
        current_entry_no: match.ring.current_entry_no,
        current_horse: match.ring.current_horse,
        live_source: "get_rings",
        last_synced_at: currentStamp()
      });
    })
    .filter(Boolean);
  for (let index = 0; index < catalystUpdates.length; index += 100) {
    const chunk = catalystUpdates.slice(index, index + 100);
    if (chunk.length) await app.datastore().table(TABLES.catalystClassStartTimes).updateRows(chunk);
  }

  await logRun(baseId, token, {
    action: "get_rings_class_start_enrichment",
    showNo: focus.show_no,
    focusDay: focus.focus_day,
    status: "ok",
    recordsSeen: rings.length,
    recordsChanged: updated.length + catalystUpdates.length,
    summary: `get_rings matched ${matches.length} class_start_times rows`,
    payload: {
      rings: rings.length,
      matches: matches.length,
      airtable_updated: updated.length,
      catalyst_updated: catalystUpdates.length,
      source_unique_keys: new Set(sourceKeys).size,
      target_unique_keys: new Set(targetKeys).size,
      duplicate_source_keys: duplicateKeys(sourceKeys),
      duplicate_target_keys: duplicateKeys(targetKeys),
      get_rings_linkback: linkback,
      missing,
      extras
    }
  });

  return {
    rings: rings.length,
    target_class_start_times: classStarts.length,
    matches: matches.length,
    airtable_updated: updated.length,
    catalyst_updated: catalystUpdates.length,
    source_unique_keys: new Set(sourceKeys).size,
    target_unique_keys: new Set(targetKeys).size,
    duplicate_source_keys: duplicateKeys(sourceKeys),
    duplicate_target_keys: duplicateKeys(targetKeys),
    missing,
    extras
  };
}

const ALERT_CREATE_ONLY_FIELDS = new Set([
  ALERT_FIELDS.alert_key_run,
  ALERT_FIELDS.created_at,
  ALERT_FIELDS.time_till,
  ALERT_FIELDS.payload_json,
]);

const ALERT_LINK_FIELDS = new Set([
  ALERT_FIELDS.alert_templates,
  ALERT_FIELDS.shows,
  ALERT_FIELDS.focus_show,
  ALERT_FIELDS.ring_days,
  ALERT_FIELDS.rings,
  ALERT_FIELDS.classes,
  ALERT_FIELDS.entries,
  ALERT_FIELDS.horses,
  ALERT_FIELDS.riders,
  ALERT_FIELDS.trainers,
  ALERT_FIELDS.class_start_times,
  ALERT_FIELDS.entry_go_times,
]);

async function readExistingTimeAlerts(baseId, token, focus) {
  const formula = `AND({show_no}=${Number(focus.show_no)},IS_SAME({focus_day},DATETIME_PARSE('${airtableQuote(focus.focus_day)}'),'day'),OR({alert_lane}='class_start_times',{alert_lane}='entry_go_times'))`;
  const rows = await airtableList(baseId, TABLES.airtableAlerts, token, { formula });
  const byKey = new Map();
  const duplicateKeys = [];
  for (const record of rows) {
    const key = text((record.fields || {})[ALERT_FIELDS.alert_key]);
    if (!key) continue;
    if (byKey.has(key)) duplicateKeys.push(key);
    else byKey.set(key, record);
  }
  return { rows, byKey, duplicateKeys };
}

function comparableValue(value) {
  if (Array.isArray(value)) return value.map(comparableValue);
  if (value && typeof value === "object") {
    if ("id" in value) return value.id;
    if ("name" in value) return value.name;
  }
  if (value === null || value === undefined) return "";
  return value;
}

function comparableScalar(value) {
  const normalized = comparableValue(value);
  if (typeof normalized === "number") return String(normalized);
  return text(normalized);
}

function alertFieldChanged(currentFields, fieldId, nextValue) {
  if (ALERT_LINK_FIELDS.has(fieldId)) return !sameLinkedIds(currentFields[fieldId] || [], nextValue || []);
  return comparableScalar(currentFields[fieldId]) !== comparableScalar(nextValue);
}

function alertUpdateFields(existing, nextFields) {
  const current = existing.fields || {};
  const fields = {};
  for (const [fieldId, nextValue] of Object.entries(nextFields)) {
    if (ALERT_CREATE_ONLY_FIELDS.has(fieldId)) continue;
    if (fieldId === ALERT_FIELDS.status) {
      const currentStatus = comparableScalar(current[fieldId]);
      if (!currentStatus || currentStatus === "resolved") fields[fieldId] = "open";
      continue;
    }
    if (alertFieldChanged(current, fieldId, nextValue)) fields[fieldId] = nextValue;
  }
  return cleanFields(fields);
}

function planAlertWrites(alertRows, existingAlerts) {
  const creates = [];
  const updates = [];
  const unchanged = [];
  const statusTransitions = [];

  for (const fields of alertRows) {
    const alertKey = text(fields[ALERT_FIELDS.alert_key]);
    if (!alertKey) continue;
    const existing = existingAlerts.byKey.get(alertKey);
    if (!existing) {
      creates.push(fields);
      continue;
    }
    const patchFields = alertUpdateFields(existing, fields);
    const patchFieldIds = Object.keys(patchFields);
    if (!patchFieldIds.length) {
      unchanged.push(alertKey);
      continue;
    }
    const update = { id: existing.id, fields: patchFields };
    updates.push(update);
    if (patchFieldIds.includes(ALERT_FIELDS.status)) statusTransitions.push(alertKey);
  }

  return { creates, updates, unchanged, statusTransitions };
}

async function syncClassAlerts(baseId, token, focus, now = new Date(), options = {}) {
  const dryRun = truthy(options.dryRun) || truthy(options.noSend) || truthy(options.candidateOnly);
  const classStarts = await readFocusClassStarts(baseId, token, focus.show_no, focus.focus_day, { view: "active_entries" });
  const entryGoTimes = await readActiveEntryGoTimes(baseId, token, focus.show_no, focus.focus_day, { view: "active_entries" });
  const classAlerts = buildClassAlerts(classStarts, now, { windowed: false });
  const entryAlerts = buildEntryAlerts(entryGoTimes, now, { windowed: false });
  const alerts = [...classAlerts, ...entryAlerts];
  const activeAlertKeys = new Set(alerts.map((alert) => alert.alert_key));
  const alertTemplateMap = await readAlertTemplateMap(baseId, token);
  const missingTemplates = [...new Set(alerts.map((alert) => alert.alert_type).filter((alertType) => !alertTemplateMap.has(alertType)))];
  if (missingTemplates.length && !dryRun) {
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
    [ALERT_FIELDS.source_table]: alert.source_table,
    [ALERT_FIELDS.shows]: airtableRecordLinks(alert.shows),
    [ALERT_FIELDS.focus_show]: airtableRecordLinks(alert.focus_show),
    [ALERT_FIELDS.ring_days]: airtableRecordLinks(alert.ring_days),
    [ALERT_FIELDS.rings]: airtableRecordLinks(alert.rings),
    [ALERT_FIELDS.classes]: airtableRecordLinks(alert.classes),
    [ALERT_FIELDS.entries]: airtableRecordLinks(alert.entries),
    [ALERT_FIELDS.horses]: airtableRecordLinks(alert.horses),
    [ALERT_FIELDS.riders]: airtableRecordLinks(alert.riders),
    [ALERT_FIELDS.trainers]: airtableRecordLinks(alert.trainers),
    [ALERT_FIELDS.class_start_times]: alert.source_table === "class_start_times"
      ? airtableRecordLink(alert.class_start_times_record_id)
      : airtableRecordLinks(alert.class_start_times),
    [ALERT_FIELDS.entry_go_times]: alert.source_table === "entry_go_times" ? airtableRecordLink(alert.entry_go_times_record_id) : undefined
  }));
  const existingAlerts = await readExistingTimeAlerts(baseId, token, focus);
  const writePlan = planAlertWrites(airtableRows, existingAlerts);
  const staleUpdates = await buildStaleTimeAlertUpdates(baseId, token, focus, activeAlertKeys);
  if (dryRun) {
    const candidates = alerts.map((alert, index) => ({
      alert_key: alert.alert_key,
      alert_type: alert.alert_type,
      alert_lane: alert.alert_lane,
      source_table: alert.source_table,
      time_till: alert.time_till,
      target_time: alert.target_time,
      alert_subject: alert.alert_subject,
      class_start_times_record_id: alert.class_start_times_record_id || "",
      entry_go_times_record_id: alert.entry_go_times_record_id || "",
      class_start_times_link_payload: airtableRows[index][ALERT_FIELDS.class_start_times] || [],
      entry_go_times_link_payload: airtableRows[index][ALERT_FIELDS.entry_go_times] || []
    }));
    return {
      dry_run: true,
      no_send: true,
      now: now.toISOString(),
      class_start_times: classStarts.length,
      entry_go_times: entryGoTimes.length,
      class_alerts: classAlerts.length,
      entry_alerts: entryAlerts.length,
      candidates,
      missing_templates: missingTemplates,
      airtable_upsert_skipped: true,
      stale_resolution_skipped: true,
      would_create: writePlan.creates.length,
      would_update: writePlan.updates.length,
      would_unchanged: writePlan.unchanged.length,
      would_status_transition: writePlan.statusTransitions.length,
      would_resolve_stale: staleUpdates.length,
      duplicate_existing_alert_keys: existingAlerts.duplicateKeys,
      notifications_sent: 0,
      records_changed: 0
    };
  }
  const created = await airtableUpsert(baseId, TABLES.airtableAlerts, ALERT_FIELDS.alert_key, writePlan.creates, token);
  const updated = writePlan.updates.length ? await airtableUpdate(baseId, TABLES.airtableAlerts, writePlan.updates, token) : [];
  const resolved = staleUpdates.length ? await airtableUpdate(baseId, TABLES.airtableAlerts, staleUpdates, token) : [];
  return {
    class_start_times: classStarts.length,
    entry_go_times: entryGoTimes.length,
    class_alerts: classAlerts.length,
    entry_alerts: entryAlerts.length,
    alerts_created: created.length,
    alerts_updated: updated.length,
    alerts_unchanged: writePlan.unchanged.length,
    alerts_status_transitioned: writePlan.statusTransitions.length,
    alerts_resolved: resolved.length,
    duplicate_existing_alert_keys: existingAlerts.duplicateKeys,
    records_changed: created.length + updated.length + resolved.length,
    notifications_sent: 0,
    log_skipped: true
  };
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
  if (action === "sync-get-orders-linkback") {
    const allShowDays = truthy(query.get("all_days") || body.all_days || query.get("all_show_days") || body.all_show_days);
    return syncGetOrdersLinks(baseId, token, focus, { allShowDays });
  }
  if (action === "sync-get-orders") {
    return syncGetOrders(app, baseId, token, focus);
  }
  if (action === "sync-get-rings-linkback") {
    const allShowDays = truthy(query.get("all_days") || body.all_days || query.get("all_show_days") || body.all_show_days);
    return syncGetRingsLinks(baseId, token, focus, { allShowDays });
  }
  if (action === "repair-active-focus-helper-links") {
    return repairActiveFocusHelperLinks(baseId, token, focus);
  }
  if (action === "sync-get-rings") {
    return syncGetRings(app, baseId, token, focus);
  }
  if (action === "sync-class-alerts") {
    const nowRaw = text(query.get("now") || body.now);
    const dryRun = truthy(query.get("dry_run") || body.dry_run);
    const noSend = truthy(query.get("no_send") || body.no_send);
    const candidateOnly = truthy(query.get("candidate_only") || body.candidate_only);
    return syncClassAlerts(baseId, token, focus, nowRaw ? new Date(nowRaw) : new Date(), { dryRun, noSend, candidateOnly });
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
    const token = text(bearerToken || body.airtable_token || query.get("airtable_token") || process.env.AIRTABLE_TOKEN);
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
