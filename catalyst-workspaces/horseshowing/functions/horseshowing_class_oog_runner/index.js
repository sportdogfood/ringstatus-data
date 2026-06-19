const catalyst = require("zcatalyst-sdk-node");
const cheerio = require("cheerio");
const https = require("https");
const {
  classContextKey,
  classOogKey,
  selectClassOogScope,
  stagingContextKey
} = require("./scope");

const DEFAULT_BASE_ID = "app6XS1RvsPNRT6os";
const HORSESHOWING_BASE_URL = "https://www.horseshowing.com";
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36";
const UPSTREAM_TIMEOUT_MS = 15000;
const PROBE_TIMEOUT_MS = 5000;
const TABLE_CLASS_OOG = "hs_class_oog";
const TABLE_AIRTABLE_CLASS_OOG = "tblgUbX5n8GIuiqUI";
const TABLE_WEC_LOGS = "tblaA0n7QD7s5lIYm";
const VIEW_UPDATE_SCHEDULE_STAGING_LOCK_SCHEDULE = "lock_schedule";
const AIRTABLE_TABLES = {
  shows: "tblyjlXwdf0zg0mhn",
  focus_show: "tblQldkP8wwIRxd4z",
  classes: "tblhxn7Jhkcnetaq5",
  rings: "tbl5WKTbwL6IVrjyI",
  ring_days: "tblMw8DPVzlt3H8M7",
  entries: "tblrRnqH6utOdyhSk",
  horses: "tblgWogH7B6Cvusvm",
  riders: "tbl75W08G7nB4MYAl",
  trainers: "tblB72MubQbWfEqdf",
  show_days: "tblqAdx2mA9qDw3KU",
  ring_names: "tblcHfnJzCYLoBhjf"
};

const STAGING_FIELDS = {
  staging_key: "fldFBo8SVsESz3Lm9",
  lock: "fldtUb2tiJvBNHdsD",
  show_no: "fldfMmNiM6yiZbp8O",
  class_no: "flduv43XDZA8Z2rO4",
  ring_day_no: "fldyJ89RRtoic3F8m",
  ring_no: "fldivIFX6Mi3HEFH5",
  ring_name: "fldBlOdFMhDE6pwcs",
  iso_date: "fld6RUZaBhxh0plgf",
  event_name: "flde1tofvuV34iKc6",
  class_name: "fldvV3xLV9PduvCrB",
  time_text: "fld2EahZkPs2SSVfN",
  entry_count: "fldsiU6NKYacpz8CT",
  full_lock: "fldL8UsgATV34je1y"
};

const AIRTABLE_OOG_FIELDS = {
  mirror_class_oog_key: "fldAoLjy9rLTPm1pl",
  show_no: "fldDXivEZ0eidEJ6b",
  shows: "fldBbICUQh0mcTBwB",
  focus_show: "fldRxd0qygbKIiKj0",
  focus_day: "fldC7MKhrW9PlglBq",
  ring: "fldGhNWjc7nSrxepz",
  ring_names: "fldSi8sd56KrWiwaP",
  class_no: "fld6gnl7rJ0z8SWX6",
  classes: "fldZiHE2suY1dFA6f",
  ring_no: "fldVBfv4sel04F9JL",
  rings: "fldQiuT7l90WPXnqZ",
  days: "fldZLVLCshk9S3R7q",
  ring_days: "fldOp8L3ZwdhwJ2Bm",
  show_days: "fldgJ60VyWhbgXy79",
  class_order: "fldXVaC325kMxFh7Z",
  class_label: "fldfErCWxXJSNEvGt",
  class_payout: "fld4h9RSMTlVScL42",
  class_name: "fldkpBpdlcP3SapRk",
  entry_order: "fldMV3Zq2BN5PZ5zs",
  entry_no: "fldCQiSaDvmsarXYu",
  entries: "fldWH39c6ewlvG0CR",
  horse: "fldszG7lLOFg5SMNe",
  horses: "fldp4KyA7AqCXUJli",
  rider: "fld85WfTfZvQPuic7",
  riders: "fldYJ7lsNfH2jSZVy",
  trainer: "fld40yaYmp7Y5G1dv",
  trainers: "flds11P8qlNGsYj6x",
  source: "fld36DAxxktBq4nll",
  update_schedule_staging: "fld1ub9MgRg1Yl20F"
};

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

const FOCUS_SHOW_FIELDS = {
  is_pause: "fldgWn3BIdGzcGow1"
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

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isFocusPaused(row) {
  return row?.is_pause === true || row?.[FOCUS_SHOW_FIELDS.is_pause] === true;
}

function intOrNull(value) {
  const parsed = Number.parseInt(text(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function yyyymmddToIso(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return "";
}

function isoToYyyymmdd(value) {
  const iso = yyyymmddToIso(value);
  return iso ? iso.replace(/-/g, "") : "";
}

function asNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function airtableString(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function airtableValue(value) {
  return `'${airtableString(value)}'`;
}

function isNumericKeyField(field) {
  return new Set(["show_no", "class_no", "ring_no", "ring_day_no", "entry_no"]).has(field);
}

function formulaValue(field, value) {
  return isNumericKeyField(field) ? Number(value) : airtableValue(value);
}

function fieldValue(field, value) {
  return isNumericKeyField(field) ? Number(value) : text(value);
}

function unique(values) {
  return [...new Set(values.map((value) => text(value)).filter(Boolean))];
}

function parseNumberList(value) {
  return unique(String(value || "").split(",")).map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
}

function link(id) {
  return id ? [id] : undefined;
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const value = headers.get("set-cookie");
  return value ? [value] : [];
}

function mergeCookies(...cookieInputs) {
  const jar = new Map();
  for (const input of cookieInputs) {
    for (const part of Array.isArray(input) ? input : String(input || "").split(";")) {
      const cookie = String(part || "").split(";")[0].trim();
      const eq = cookie.indexOf("=");
      if (eq > 0) jar.set(cookie.slice(0, eq), cookie.slice(eq + 1));
    }
  }
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

function requestTextViaHttps(url, { method = "GET", headers = {}, body = "", timeoutMs = UPSTREAM_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, { method, headers }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          headers: {
            get(name) {
              const value = response.headers[String(name).toLowerCase()];
              return Array.isArray(value) ? value.join(",") : value || "";
            }
          },
          text: async () => raw
        });
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error("request timeout")));
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

async function requestText(url, { method = "GET", headers = {}, body = "", signal, fallback = true } = {}) {
  try {
    return await fetch(url, { method, headers, body: body || undefined, signal });
  } catch (error) {
    if (!fallback) throw error;
    const fallbackResponse = await requestTextViaHttps(url, { method, headers, body });
    fallbackResponse.transport = "https";
    fallbackResponse.fetch_error = error.message;
    return fallbackResponse;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bootstrapCookie(showNo, phpSessionId = "") {
  let cookie = `HscomShowNo=${showNo}`;
  if (text(phpSessionId)) return mergeCookies(cookie, `PHPSESSID=${text(phpSessionId)}`);
  const request = {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-encoding": "identity",
      "accept-language": "en-US,en;q=0.9",
      referer: `${HORSESHOWING_BASE_URL}/showsel.php`,
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "same-origin",
      "upgrade-insecure-requests": "1",
      "user-agent": DEFAULT_USER_AGENT,
      cookie
    }
  };
  let response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      response = await requestText(`${HORSESHOWING_BASE_URL}/show.php?show=${encodeURIComponent(showNo)}`, { ...request, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (response.ok) cookie = mergeCookies(cookie, getSetCookies(response.headers));
    const scheduleController = new AbortController();
    const scheduleTimeout = setTimeout(() => scheduleController.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const scheduleResponse = await requestText(`${HORSESHOWING_BASE_URL}/schedule.php`, {
        method: "GET",
        headers: {
          ...request.headers,
          referer: `${HORSESHOWING_BASE_URL}/show.php?show=${encodeURIComponent(showNo)}`,
          cookie
        },
        signal: scheduleController.signal
      });
      if (scheduleResponse.ok) cookie = mergeCookies(cookie, getSetCookies(scheduleResponse.headers));
    } finally {
      clearTimeout(scheduleTimeout);
    }
  } catch {
    return cookie;
  }
  return cookie;
}

function classOogCookie(showNo, phpSessionId = "") {
  let cookie = `HscomShowNo=${showNo}`;
  if (text(phpSessionId)) cookie = mergeCookies(cookie, `PHPSESSID=${text(phpSessionId)}`);
  return cookie;
}

async function airtableList(baseId, tableName, formula, token, options = {}) {
  const records = [];
  let offset = "";
  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`);
    url.searchParams.set("pageSize", "100");
    if (options.view) url.searchParams.set("view", options.view);
    if (formula) url.searchParams.set("filterByFormula", formula);
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Airtable ${tableName} HTTP ${response.status}: ${raw.slice(0, 500)}`);
    const json = JSON.parse(raw);
    records.push(...(json.records || []));
    offset = json.offset || "";
  } while (offset);
  return records.map((record) => ({ record_id: record.id, ...record.fields }));
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

async function airtableCreateRecords(baseId, tableId, records, token) {
  const results = [];
  for (let i = 0; i < records.length; i += 10) {
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        records: records.slice(i, i + 10).map((fields) => ({ fields })),
        typecast: true
      })
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Airtable create ${tableId} HTTP ${response.status}: ${raw.slice(0, 500)}`);
    results.push(...(JSON.parse(raw).records || []));
  }
  return results;
}

async function airtableDeleteRecords(baseId, tableId, recordIds, token) {
  let deleted = 0;
  for (let i = 0; i < recordIds.length; i += 10) {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${tableId}`);
    for (const id of recordIds.slice(i, i + 10)) url.searchParams.append("records[]", id);
    const response = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Airtable delete ${tableId} HTTP ${response.status}: ${raw.slice(0, 500)}`);
    deleted += (JSON.parse(raw).records || []).filter((record) => record.deleted).length;
  }
  return deleted;
}

async function getFocusShow(baseId, showNo, token, overrideFocusDay) {
  const override = yyyymmddToIso(overrideFocusDay);
  const rows = await airtableList(baseId, "focus_show", `{show_no}=${Number(showNo)}`, token);
  const row = override
    ? rows.find((item) => yyyymmddToIso(item.focus_day) === override)
    : rows.find((item) => item.active === true) || rows[0];
  if (!row) throw new Error(`No focus_show found for show_no=${showNo}${override ? ` focus_day=${override}` : " active=1"}`);
  const focusDay = yyyymmddToIso(row.focus_day);
  if (!focusDay) throw new Error(`focus_show has no focus_day for show_no=${showNo}`);
  return {
    record_id: row.record_id,
    focus_day: focusDay,
    focus_day_key: text(row.focus_day_key || row.focus_show_key || ""),
    is_pause: isFocusPaused(row)
  };
}

async function getActiveTrainerNames(baseId, token) {
  const rows = await airtableList(baseId, "trainers", "{active}=1", token);
  return new Set(rows.map((row) => text(row.trainer)).filter(Boolean));
}

function filterRowsByActiveTrainer(rows, activeTrainerNames) {
  return rows.filter((row) => activeTrainerNames.has(text(row.trainer)));
}

function probeClassOogActiveTrainers(raw, activeTrainerNames) {
  const $ = cheerio.load(raw || "");
  const tableNode = $(".lg table.orders_table").first().length
    ? $(".lg table.orders_table").first()
    : $("table.orders_table").first();
  const matches = [];
  let upstreamRows = 0;
  tableNode.find("tr").each((index, tr) => {
    if (index === 0) return;
    const cells = $(tr).find("td").map((_, td) => text($(td).text())).get();
    if (cells.length < 4) return;
    upstreamRows += 1;
    const trainer = text(cells[4]);
    if (!activeTrainerNames.has(trainer)) return;
    matches.push({
      entry_order: intOrNull(cells[0]),
      entry_no: intOrNull(cells[1]),
      horse: text(cells[2]),
      rider: text(cells[3]),
      trainer
    });
  });
  return { upstream_rows: upstreamRows, active_trainer_rows: matches.length, matches };
}

async function getClassOogStats(baseId, showNo, focusDay, token) {
  const activeTrainers = await getActiveTrainerNames(baseId, token);
  const rows = await airtableList(baseId, "class_oog", `{show_no}=${Number(showNo)}`, token);
  const activeClassNos = new Set();
  const rowCounts = new Map();
  for (const row of rows) {
    if (yyyymmddToIso(row.focus_day) !== focusDay) continue;
    const classNo = Number(row.class_no);
    if (!Number.isFinite(classNo)) continue;
    rowCounts.set(classNo, (rowCounts.get(classNo) || 0) + 1);
    if (activeTrainers.has(text(row.trainer))) activeClassNos.add(classNo);
  }
  return { activeClassNos, rowCounts };
}

function buildClassOogQueue(classes, activeClassNos, rowCounts, maxEntries) {
  const lanes = [
    { lane: "active_trainers", predicate: (row) => activeClassNos.has(Number(row.class_no)) },
    { lane: "full", predicate: () => true }
  ];
  const result = [];
  for (const lane of lanes) {
    let current = [];
    let currentEntries = 0;
    const source = classes.filter(lane.predicate);
    for (const row of source) {
      const estimated = Math.max(1, Number(row.entry_count || 0), Number(rowCounts.get(Number(row.class_no)) || 0));
      if (current.length && currentEntries + estimated > maxEntries) {
        result.push({
          lane: lane.lane,
          class_nos: current.map((item) => item.class_no),
          estimated_entries: currentEntries,
          classes: current.length
        });
        current = [];
        currentEntries = 0;
      }
      current.push(row);
      currentEntries += estimated;
    }
    if (current.length) {
      result.push({
        lane: lane.lane,
        class_nos: current.map((item) => item.class_no),
        estimated_entries: currentEntries,
        classes: current.length
      });
    }
  }
  return result;
}

async function findRecordMap(baseId, tableName, keyField, values, token) {
  const map = new Map();
  const keys = unique(values);
  for (let i = 0; i < keys.length; i += 40) {
    const chunk = keys.slice(i, i + 40);
    const formula = chunk.length === 1
      ? `{${keyField}}=${formulaValue(keyField, chunk[0])}`
      : `OR(${chunk.map((value) => `{${keyField}}=${formulaValue(keyField, value)}`).join(",")})`;
    for (const row of await airtableList(baseId, tableName, formula, token)) {
      map.set(text(row[keyField]), row.record_id);
    }
  }
  return map;
}

async function ensureRecordMap(baseId, tableId, tableName, keyField, values, token) {
  const keys = unique(values);
  const map = await findRecordMap(baseId, tableName, keyField, keys, token);
  const missing = keys.filter((key) => !map.has(key));
  if (missing.length) {
    const created = await airtableCreateRecords(baseId, tableId, missing.map((key) => ({
      [keyField]: fieldValue(keyField, key)
    })), token);
    for (const record of created) {
      const value = record?.fields?.[keyField];
      map.set(text(value), record.id);
    }
  }
  return map;
}

async function buildLinkMaps(baseId, showNo, focusShow, rows, selected, token) {
  const showDayKey = isoToYyyymmdd(focusShow.focus_day);
  const maps = {
    shows: await ensureRecordMap(baseId, AIRTABLE_TABLES.shows, "shows", "show_no", [showNo], token),
    classes: await ensureRecordMap(baseId, AIRTABLE_TABLES.classes, "classes", "class_no", rows.map((row) => row.class_no), token),
    rings: await ensureRecordMap(baseId, AIRTABLE_TABLES.rings, "rings", "ring_no", rows.map((row) => row.ring_no), token),
    ring_days: await ensureRecordMap(baseId, AIRTABLE_TABLES.ring_days, "ring_days", "ring_day_no", rows.map((row) => row.ring_day_no), token),
    entries: await ensureRecordMap(baseId, AIRTABLE_TABLES.entries, "entries", "entry_no", rows.map((row) => row.entry_no), token),
    horses: await ensureRecordMap(baseId, AIRTABLE_TABLES.horses, "horses", "horse", rows.map((row) => row.horse), token),
    riders: await ensureRecordMap(baseId, AIRTABLE_TABLES.riders, "riders", "rider", rows.map((row) => row.rider), token),
    trainers: await ensureRecordMap(baseId, AIRTABLE_TABLES.trainers, "trainers", "trainer", rows.map((row) => row.trainer), token),
    ring_names: await ensureRecordMap(baseId, AIRTABLE_TABLES.ring_names, "ring_names", "ring_name", selected.map((row) => row.ring_name), token),
    show_days: await ensureRecordMap(baseId, AIRTABLE_TABLES.show_days, "show_days", "show_day", [showDayKey], token)
  };
  maps.focus_show = new Map([[focusShow.focus_day, focusShow.record_id]]);
  return maps;
}

async function deleteAirtableRowsOutsideKeys(baseId, showNo, focusDay, classNo, ringDayNo, ringNo, activeKeys, token) {
  const rows = await airtableList(
    baseId,
    "class_oog",
    `AND({show_no}=${Number(showNo)},{class_no}=${Number(classNo)},{days}=${Number(ringDayNo)},{ring_no}=${Number(ringNo)},IS_SAME({focus_day},DATETIME_PARSE(${airtableValue(focusDay)}),'day'))`,
    token
  );
  const stale = rows
    .filter((row) => !activeKeys.has(text(row.mirror_class_oog_key)))
    .map((row) => row.record_id)
    .filter(Boolean);
  return airtableDeleteRecords(baseId, TABLE_AIRTABLE_CLASS_OOG, stale, token);
}

async function deleteAirtableRowsOutsideContexts(baseId, showNo, focusDay, allowedContexts, token) {
  const rows = await airtableList(
    baseId,
    "class_oog",
    `AND({show_no}=${Number(showNo)},IS_SAME({focus_day},DATETIME_PARSE(${airtableValue(focusDay)}),'day'))`,
    token
  );
  const stale = rows
    .filter((row) => !allowedContexts.has(classContextKey(row)))
    .map((row) => row.record_id)
    .filter(Boolean);
  return airtableDeleteRecords(baseId, TABLE_AIRTABLE_CLASS_OOG, stale, token);
}

async function fetchClassOog(showNo, classNo, cookie, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || UPSTREAM_TIMEOUT_MS));
  const attempts = Math.max(1, Number(options.attempts || 2));
  const url = `${HORSESHOWING_BASE_URL}/class_oog.php?class_no=${encodeURIComponent(classNo)}`;
  const request = {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-encoding": "identity",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      connection: "close",
      referer: `${HORSESHOWING_BASE_URL}/schedule.php`,
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "same-origin",
      "upgrade-insecure-requests": "1",
      "user-agent": DEFAULT_USER_AGENT,
      cookie
    }
  };
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = options.forceHttps
          ? await requestTextViaHttps(url, { ...request, timeoutMs })
          : await requestText(url, { ...request, signal: controller.signal, fallback: options.fallback !== false });
        const raw = await response.text();
        if (!response.ok) throw new Error(`class_oog.php HTTP ${response.status}: ${raw.slice(0, 300)}`);
        return { status: response.status, content_type: response.headers.get("content-type"), raw, attempts: attempt };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(750 * attempt);
    }
  }
  throw lastError;
}

function classPartsFromLabel(label) {
  const raw = text(label);
  const numberMatch = raw.match(/^\s*(\d+)\)/);
  const classNumber = numberMatch ? Number(numberMatch[1]) : null;
  let rest = numberMatch ? raw.slice(numberMatch[0].length).trim() : raw;
  let classPayout = "";
  if (rest.startsWith("$")) {
    const payoutMatch = rest.match(/^(\$\S+)/);
    if (payoutMatch) {
      classPayout = payoutMatch[1];
      rest = rest.slice(payoutMatch[0].length).trim();
    }
  }
  return { classNumber, classPayout, className: rest || raw };
}

function parseClassOogRows(raw, showNo, classInfo) {
  const $ = cheerio.load(raw || "");
  const tableNode = $(".lg table.orders_table").first().length
    ? $(".lg table.orders_table").first()
    : $("table.orders_table").first();
  const classLabel = text(classInfo.event_name || classInfo.class_label || classInfo.class_name || classInfo.class_no);
  const classParts = classPartsFromLabel(classLabel);
  const rows = [];
  tableNode.find("tr").each((index, tr) => {
    if (index === 0) return;
    const cells = $(tr).find("td").map((_, td) => text($(td).text())).get();
    if (cells.length < 4) return;
    const entryNo = intOrNull(cells[1]);
    if (!entryNo) return;
    const classNo = Number(classInfo.class_no);
    const ringDayNo = intOrNull(classInfo.ring_day_no);
    rows.push({
      class_oog_key: classOogKey({ show_no: showNo, ring_day_no: ringDayNo, ring_no: classInfo.ring_no, class_no: classNo, entry_no: entryNo }),
      show_no: Number(showNo),
      ring: text(classInfo.ring_name),
      ring_no: intOrNull(classInfo.ring_no),
      ring_day_no: ringDayNo,
      staging_record_id: text(classInfo.staging_record_id),
      class_order: intOrNull(classInfo.class_order),
      class_no: classNo,
      class_label: classLabel,
      class_number: classParts.classNumber,
      class_payout: classParts.classPayout,
      class_name: classParts.className,
      entry_order: intOrNull(cells[0]),
      entry_no: entryNo,
      horse: text(cells[2]),
      rider: text(cells[3]),
      trainer: text(cells[4]),
      source_endpoint: "class_oog.php",
      source_payload: JSON.stringify({
        show_no: Number(showNo),
        class_no: classNo,
        entry_order: intOrNull(cells[0]),
        entry_no: entryNo,
        horse: text(cells[2]),
        rider: text(cells[3]),
        trainer: text(cells[4])
      })
    });
  });
  return rows;
}

function normalizeLocalClassOogRows(localRows, showNo, classInfo) {
  const classLabel = text(classInfo.event_name || classInfo.class_label || classInfo.class_name || classInfo.class_no);
  const classParts = classPartsFromLabel(classLabel);
  const classNo = Number(classInfo.class_no);
  const ringDayNo = intOrNull(classInfo.ring_day_no);
  return (Array.isArray(localRows) ? localRows : [])
    .filter((row) => Number(row.class_no) === classNo)
    .filter((row) => intOrNull(row.ring_day_no ?? row.days) === ringDayNo)
    .filter((row) => intOrNull(row.ring_no) === intOrNull(classInfo.ring_no))
    .map((row) => {
      const entryNo = intOrNull(row.entry_no);
      return {
        class_oog_key: text(row.class_oog_key) || classOogKey({ show_no: showNo, ring_day_no: ringDayNo, ring_no: classInfo.ring_no, class_no: classNo, entry_no: entryNo }),
        show_no: Number(showNo),
        ring: text(classInfo.ring_name || row.ring),
        ring_no: intOrNull(classInfo.ring_no),
        ring_day_no: ringDayNo,
        staging_record_id: text(classInfo.staging_record_id || row.staging_record_id),
        class_order: intOrNull(classInfo.class_order || row.class_order),
        class_no: classNo,
        class_label: classLabel,
        class_number: classParts.classNumber,
        class_payout: classParts.classPayout,
        class_name: classParts.className,
        entry_order: intOrNull(row.entry_order),
        entry_no: entryNo,
        horse: text(row.horse),
        rider: text(row.rider),
        trainer: text(row.trainer),
        source_endpoint: "class_oog.php",
        source_payload: JSON.stringify({
          show_no: Number(showNo),
          class_no: classNo,
          entry_order: intOrNull(row.entry_order),
          entry_no: entryNo,
          horse: text(row.horse),
          rider: text(row.rider),
          trainer: text(row.trainer),
          source: "local_html_probe"
        })
      };
    })
    .filter((row) => row.class_oog_key && row.entry_no);
}

async function getCatalystRowsByShowClass(app, showNo, classNo, ringDayNo, ringNo) {
  const rows = [];
  for (let offset = 0; ; offset += 200) {
    const query = [
      `SELECT * FROM ${TABLE_CLASS_OOG}`,
      `WHERE show_no = ${Number(showNo)} AND class_no = ${Number(classNo)} AND ring_day_no = ${Number(ringDayNo)} AND ring_no = ${Number(ringNo)}`,
      `LIMIT 200 OFFSET ${offset}`
    ].join(" ");
    const page = (await app.zcql().executeZCQLQuery(query) || [])
      .map((item) => item?.[TABLE_CLASS_OOG])
      .filter(Boolean);
    rows.push(...page);
    if (page.length < 200) break;
  }
  return rows;
}

async function getCatalystRowsByShowRingDay(app, showNo, ringDayNo) {
  const rows = [];
  for (let offset = 0; ; offset += 200) {
    const query = [
      `SELECT * FROM ${TABLE_CLASS_OOG}`,
      `WHERE show_no = ${Number(showNo)} AND ring_day_no = ${Number(ringDayNo)}`,
      `LIMIT 200 OFFSET ${offset}`
    ].join(" ");
    const page = (await app.zcql().executeZCQLQuery(query) || [])
      .map((item) => item?.[TABLE_CLASS_OOG])
      .filter(Boolean);
    rows.push(...page);
    if (page.length < 200) break;
  }
  return rows;
}

async function deleteCatalystRowsOutsideContexts(app, showNo, ringDayNos, allowedContexts) {
  const table = app.datastore().table(TABLE_CLASS_OOG);
  let deleted = 0;
  for (const ringDayNo of ringDayNos) {
    const rows = await getCatalystRowsByShowRingDay(app, showNo, ringDayNo);
    const staleIds = rows
      .filter((row) => !allowedContexts.has(classContextKey(row)))
      .map((row) => row.ROWID)
      .filter(Boolean);
    for (let i = 0; i < staleIds.length; i += 100) {
      const batch = staleIds.slice(i, i + 100);
      if (batch.length) {
        await table.deleteRows(batch);
        deleted += batch.length;
      }
    }
  }
  return deleted;
}

function toCatalystClassOogRow(row) {
  const { staging_record_id, ...catalystRow } = row;
  return catalystRow;
}

async function upsertCatalystClassOog(app, showNo, classNo, ringDayNo, ringNo, rows) {
  const catalystRows = rows.map(toCatalystClassOogRow);
  const existing = new Map();
  for (const row of await getCatalystRowsByShowClass(app, showNo, classNo, ringDayNo, ringNo)) {
    if (text(row.class_oog_key)) existing.set(text(row.class_oog_key), row);
  }
  const activeKeys = new Set(catalystRows.map((row) => row.class_oog_key));
  const inserts = [];
  const updates = [];
  const deletes = [];
  for (const [key, row] of existing.entries()) {
    if (!activeKeys.has(key) && row.ROWID) deletes.push(row.ROWID);
  }
  for (const row of catalystRows) {
    const current = existing.get(row.class_oog_key);
    if (!current?.ROWID) {
      inserts.push(row);
      continue;
    }
    const changed = Object.keys(row).some((field) => field !== "class_oog_key" && text(current[field]) !== text(row[field]));
    if (changed) {
      const patch = { ...row, ROWID: current.ROWID };
      delete patch.class_oog_key;
      updates.push(patch);
    }
  }
  const table = app.datastore().table(TABLE_CLASS_OOG);
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
  return { inserted, updated, deleted };
}

function toAirtableRows(rows, focusDay, linkMaps = {}) {
  const showDayKey = isoToYyyymmdd(focusDay);
  return rows.map((row) => ({
    [AIRTABLE_OOG_FIELDS.mirror_class_oog_key]: row.class_oog_key,
    [AIRTABLE_OOG_FIELDS.show_no]: row.show_no,
    [AIRTABLE_OOG_FIELDS.shows]: link(linkMaps.shows?.get(text(row.show_no))),
    [AIRTABLE_OOG_FIELDS.focus_show]: link(linkMaps.focus_show?.get(focusDay)),
    [AIRTABLE_OOG_FIELDS.focus_day]: focusDay || null,
    [AIRTABLE_OOG_FIELDS.ring]: row.ring,
    [AIRTABLE_OOG_FIELDS.ring_names]: link(linkMaps.ring_names?.get(text(row.ring))),
    [AIRTABLE_OOG_FIELDS.class_no]: row.class_no,
    [AIRTABLE_OOG_FIELDS.classes]: link(linkMaps.classes?.get(text(row.class_no))),
    [AIRTABLE_OOG_FIELDS.ring_no]: row.ring_no,
    [AIRTABLE_OOG_FIELDS.rings]: link(linkMaps.rings?.get(text(row.ring_no))),
    [AIRTABLE_OOG_FIELDS.days]: row.ring_day_no,
    [AIRTABLE_OOG_FIELDS.ring_days]: link(linkMaps.ring_days?.get(text(row.ring_day_no))),
    [AIRTABLE_OOG_FIELDS.show_days]: link(linkMaps.show_days?.get(showDayKey)),
    [AIRTABLE_OOG_FIELDS.update_schedule_staging]: link(row.staging_record_id),
    [AIRTABLE_OOG_FIELDS.class_order]: row.class_order,
    [AIRTABLE_OOG_FIELDS.class_label]: row.class_label,
    [AIRTABLE_OOG_FIELDS.class_payout]: row.class_payout,
    [AIRTABLE_OOG_FIELDS.class_name]: row.class_name,
    [AIRTABLE_OOG_FIELDS.entry_order]: row.entry_order,
    [AIRTABLE_OOG_FIELDS.entry_no]: row.entry_no,
    [AIRTABLE_OOG_FIELDS.entries]: link(linkMaps.entries?.get(text(row.entry_no))),
    [AIRTABLE_OOG_FIELDS.horse]: row.horse,
    [AIRTABLE_OOG_FIELDS.horses]: link(linkMaps.horses?.get(text(row.horse))),
    [AIRTABLE_OOG_FIELDS.rider]: row.rider,
    [AIRTABLE_OOG_FIELDS.riders]: link(linkMaps.riders?.get(text(row.rider))),
    [AIRTABLE_OOG_FIELDS.trainer]: row.trainer,
    [AIRTABLE_OOG_FIELDS.trainers]: link(linkMaps.trainers?.get(text(row.trainer))),
    [AIRTABLE_OOG_FIELDS.source]: "class_oog.php"
  }));
}

async function writeRunLog(baseId, token, detail) {
  const now = new Date().toISOString();
  const payload = { ...detail };
  delete payload.token;
  delete payload.airtable_token;
  const classNos = Array.isArray(detail.class_nos) ? detail.class_nos.map(String).filter(Boolean) : [];
  const classPart = classNos.length ? `classes-${classNos.join(".")}` : `ring-${detail.ring_no || "none"}|offset-${detail.offset}|limit-${detail.limit}`;
  const classesSeen = Number(detail.classes_seen || classNos.length || 0);
  const rowsWritten = Number(detail.rows_written || 0);
  const upstreamRows = Number(detail.upstream_rows_total || 0);
  const checkName = detail.probe ? "class_oog_probe" : "sync-class-oog";
  const logKey = [checkName, detail.show_no, detail.focus_day || "no-focus-day", classPart].join("|");
  await airtableCreate(baseId, TABLE_WEC_LOGS, {
    [WEC_LOG_FIELDS.log_key_run]: `${logKey}|${now}`,
    [WEC_LOG_FIELDS.log_key]: logKey,
    [WEC_LOG_FIELDS.workflow_lanes]: "Core",
    [WEC_LOG_FIELDS.log_type]: "core_class_oog",
    [WEC_LOG_FIELDS.check_name]: checkName,
    [WEC_LOG_FIELDS.show_no]: Number(detail.show_no),
    [WEC_LOG_FIELDS.focus_day]: detail.focus_day || null,
    [WEC_LOG_FIELDS.status]: detail.ok ? "ok" : "error",
    [WEC_LOG_FIELDS.records_seen]: classesSeen,
    [WEC_LOG_FIELDS.records_changed]: rowsWritten,
    [WEC_LOG_FIELDS.summary]: detail.ok
      ? detail.probe
        ? `class_oog probe classes ${classesSeen}; upstream rows ${upstreamRows}; matched classes ${Number(detail.matched_classes || 0)}; active rows ${Number(detail.active_trainer_rows || 0)}`
        : `class_oog classes ${classesSeen}; upstream rows ${upstreamRows}; active rows ${rowsWritten}; catalyst deleted ${Number(detail.catalyst_deleted || 0)}; airtable deleted ${Number(detail.airtable_deleted || 0)}`
      : `class_oog failed at ${detail.phase || "unknown"}: ${detail.error}`,
    [WEC_LOG_FIELDS.payload_json]: JSON.stringify(payload, null, 2),
    [WEC_LOG_FIELDS.created_at]: now
  }, token);
}

async function handle(req, res) {
  let phase = "start";
  const runLogContext = {};
  try {
    setCors(res);
    if ((req.method || "").toUpperCase() === "OPTIONS") return res.end("");
    const query = parseQuery(req);
    const body = await readBody(req);
    const showNo = text(query.get("show_no") || body.show_no);
    if (!showNo) return sendJson(res, 400, { ok: false, error: "show_no required" });
    const focusDayOverride = text(query.get("focus_day") || body.focus_day);
    const ringNo = intOrNull(query.get("ring_no") || body.ring_no);
    const classNos = parseNumberList(query.get("class_nos") || body.class_nos);
    const planOnly = text(query.get("plan") || body.plan) === "1";
    const probeActiveTrainers = text(query.get("probe") || body.probe) === "active-trainers";
    const maxEntries = Math.max(1, asNumber(query.get("max_entries") || body.max_entries, 50));
    const offset = Math.max(0, asNumber(query.get("offset") || body.offset, 0));
    const limit = Math.max(1, asNumber(query.get("limit") || body.limit, 5));
    const onlyLocked = true;
    const phpSessionId = text(query.get("php_session_id") || body.php_session_id || process.env.HSCOM_PHPSESSID);
    const baseId = text(process.env.WEC_AIRTABLE_BASE_ID || body.base_id || query.get("base_id") || DEFAULT_BASE_ID);
    const authHeader = text(req.headers?.["x-airtable-token"] || req.headers?.["X-Airtable-Token"] || req.headers?.authorization || req.headers?.Authorization);
    const bearerToken = authHeader.match(/^Bearer\s+(.+)$/i)?.[1] || "";
    const token = text(bearerToken || body.airtable_token || query.get("airtable_token") || process.env.AIRTABLE_TOKEN);
    if (!token) return sendJson(res, 500, { ok: false, error: "missing AIRTABLE_TOKEN fallback" });
    Object.assign(runLogContext, {
      baseId,
      token,
      show_no: Number(showNo),
      focus_day: yyyymmddToIso(focusDayOverride),
      ring_no: ringNo,
      offset,
      limit,
      only_locked: onlyLocked,
      class_nos: classNos
    });

    phase = "initialize_catalyst";
    const app = catalyst.initialize(req);
    phase = "read_focus_show";
    const focusShow = await getFocusShow(baseId, showNo, token, focusDayOverride);
    runLogContext.focus_day = focusShow.focus_day;
    runLogContext.focus_show_record_id = focusShow.record_id;
    if (focusShow.is_pause) {
      const detail = {
        ok: true,
        paused: true,
        reason: "focus_show.is_pause",
        show_no: Number(showNo),
        focus_day: focusShow.focus_day,
        focus_show_record_id: focusShow.record_id,
        ring_no: ringNo,
        offset,
        limit,
        only_locked: onlyLocked,
        classes_seen: 0,
        upstream_rows_total: 0,
        rows_written: 0,
        active_trainers: 0,
        class_nos: []
      };
      phase = "write_wec_log_paused";
      await writeRunLog(baseId, token, detail);
      return sendJson(res, 200, {
        ok: true,
        paused: true,
        reason: "focus_show.is_pause",
        source_endpoint: "class_oog.php",
        target_catalyst: TABLE_CLASS_OOG,
        target_airtable: "class_oog",
        show_no: Number(showNo),
        focus_day: focusShow.focus_day,
        focus_show_record_id: focusShow.record_id
      });
    }
    phase = "read_active_trainers";
    const activeTrainerNames = await getActiveTrainerNames(baseId, token);
    if (!activeTrainerNames.size) throw new Error("No active trainers found; class_oog active-team write stopped");
    phase = "read_update_schedule_staging";
    const stagingRows = await airtableList(baseId, "update_schedule_staging", "", token, { view: VIEW_UPDATE_SCHEDULE_STAGING_LOCK_SCHEDULE });
    const uniqueByContext = new Map();
    const duplicateContexts = [];
    const allFocusStagingRows = selectClassOogScope(stagingRows, { showNo, focusDay: focusShow.focus_day })
      .sort((a, b) =>
        Number(a.ring_no || 0) - Number(b.ring_no || 0) ||
        Number(a.ring_day_no || 0) - Number(b.ring_day_no || 0) ||
        text(a.time_text).localeCompare(text(b.time_text)) ||
        Number(a.class_no || 0) - Number(b.class_no || 0)
      );
    const focusStagingRows = allFocusStagingRows;
    for (const row of focusStagingRows) {
      const classNo = intOrNull(row.class_no);
      const ringDayNo = intOrNull(row.ring_day_no);
      if (!classNo || !ringDayNo) continue;
      const classInfo = {
        show_no: Number(showNo),
        class_no: classNo,
        ring_day_no: ringDayNo,
        ring_no: intOrNull(row.ring_no),
        ring_name: text(row.ring_name),
        focus_day: focusShow.focus_day,
        time_text: text(row.time_text),
        event_name: text(row.event_name),
        class_name: text(row.class_name),
        entry_count: intOrNull(row.entry_count),
        staging_record_id: row.record_id,
        class_order: null
      };
      const key = stagingContextKey(row);
      if (uniqueByContext.has(key)) {
        duplicateContexts.push(classInfo);
        continue;
      }
      uniqueByContext.set(key, classInfo);
    }
    const allowedContexts = new Set([...uniqueByContext.values()].map(classContextKey).filter(Boolean));
    const focusRingDayNos = unique(allFocusStagingRows.map((row) => row.ring_day_no)).map(Number).filter(Boolean);
    let scopeCatalystDeleted = 0;
    let scopeAirtableDeleted = 0;
    const requestedClassNos = new Set(classNos.map(Number));
    const classes = [...uniqueByContext.values()]
      .filter((row) => !ringNo || Number(row.ring_no) === Number(ringNo))
      .sort((a, b) =>
      Number(a.ring_no || 0) - Number(b.ring_no || 0) ||
      Number(a.ring_day_no || 0) - Number(b.ring_day_no || 0) ||
      text(a.time_text).localeCompare(text(b.time_text)) ||
      Number(a.class_no || 0) - Number(b.class_no || 0)
    ).map((row, index) => ({ ...row, class_order: index + 1 }));
    const duplicateContextsToClear = duplicateContexts.filter((row) => {
      if (requestedClassNos.size) return requestedClassNos.has(Number(row.class_no));
      if (ringNo) return Number(row.ring_no) === Number(ringNo);
      return true;
    });
    const ringsAvailable = unique(focusStagingRows.map((row) => row.ring_no)).map(Number).sort((a, b) => a - b);
    if (planOnly) {
      phase = "build_queue_plan";
      const stats = await getClassOogStats(baseId, showNo, focusShow.focus_day, token);
      const queue = buildClassOogQueue(classes, stats.activeClassNos, stats.rowCounts, maxEntries);
      return sendJson(res, 200, {
        ok: true,
        action: "class-oog-plan",
        show_no: Number(showNo),
        focus_day: focusShow.focus_day,
        max_entries: maxEntries,
        target_classes_total: classes.length,
        active_trainer_classes: stats.activeClassNos.size,
        chunks: queue.length,
        queue
      });
    }
    if (probeActiveTrainers) {
      const selected = classNos.length
        ? classes.filter((row) => classNos.includes(Number(row.class_no)))
        : classes.slice(offset, offset + limit);
      phase = "bootstrap_class_oog_cookie";
      const cookie = await bootstrapCookie(showNo, phpSessionId);
      const class_results = [];
      const matchedClassNos = [];
      let upstreamRowsTotal = 0;
      let activeTrainerRows = 0;
      for (const classInfo of selected) {
        phase = `probe_class_oog_${classInfo.class_no}`;
        try {
          const fetched = await fetchClassOog(showNo, classInfo.class_no, cookie, { timeoutMs: UPSTREAM_TIMEOUT_MS, attempts: 1 });
          const probe = probeClassOogActiveTrainers(fetched.raw, activeTrainerNames);
          upstreamRowsTotal += probe.upstream_rows;
          activeTrainerRows += probe.active_trainer_rows;
          if (probe.active_trainer_rows > 0) matchedClassNos.push(Number(classInfo.class_no));
          class_results.push({
            class_no: classInfo.class_no,
            ring_day_no: classInfo.ring_day_no,
            ring_no: classInfo.ring_no,
            upstream_status: fetched.status,
            upstream_rows: probe.upstream_rows,
            active_trainer_rows: probe.active_trainer_rows,
            matches: probe.matches
          });
        } catch (error) {
          class_results.push({
            class_no: classInfo.class_no,
            ring_day_no: classInfo.ring_day_no,
            ring_no: classInfo.ring_no,
            upstream_status: "error",
            upstream_rows: 0,
            active_trainer_rows: 0,
            error: String(error?.message || error),
            matches: []
          });
        }
      }
      await writeRunLog(baseId, token, {
        ok: true,
        probe: true,
        show_no: Number(showNo),
        focus_day: focusShow.focus_day,
        ring_no: ringNo,
        offset,
        limit,
        only_locked: onlyLocked,
        focus_show_record_id: focusShow.record_id,
        target_classes_total: classes.length,
        classes_seen: selected.length,
        class_nos: selected.map((row) => Number(row.class_no)),
        upstream_rows_total: upstreamRowsTotal,
        rows_written: 0,
        matched_classes: matchedClassNos.length,
        matched_class_nos: matchedClassNos,
        active_trainer_rows: activeTrainerRows,
        active_trainers: activeTrainerNames.size,
        class_results
      });
      return sendJson(res, 200, {
        ok: true,
        action: "class-oog-probe-active-trainers",
        source_endpoint: "class_oog.php",
        show_no: Number(showNo),
        focus_day: focusShow.focus_day,
        focus_show_record_id: focusShow.record_id,
        ring_no: ringNo,
        only_locked: onlyLocked,
        target_classes_total: classes.length,
        offset,
        limit,
        selected_classes: selected.length,
        next_offset: offset + selected.length < classes.length ? offset + selected.length : null,
        active_trainers: activeTrainerNames.size,
        matched_classes: matchedClassNos.length,
        matched_class_nos: matchedClassNos,
        active_trainer_rows: activeTrainerRows,
        upstream_rows_total: upstreamRowsTotal,
        class_results
      });
    }
    const localRows = Array.isArray(body.local_rows) ? body.local_rows : [];
    if (localRows.length || text(query.get("source") || body.source) === "local_html_probe") {
      const localClassNos = new Set(parseNumberList(body.class_nos || query.get("class_nos")));
      for (const row of localRows) {
        const classNo = intOrNull(row.class_no);
        if (classNo) localClassNos.add(classNo);
      }
      const selected = classes.filter((row) => localClassNos.has(Number(row.class_no)));
      const class_results = [];
      let rowsWritten = 0;
      let catalystInserted = 0;
      let catalystUpdated = 0;
      let catalystDeleted = 0;
      let airtableRecords = 0;
      let airtableDeletedTotal = 0;
      let upstreamRowsTotal = 0;
      for (const classInfo of selected) {
        phase = `write_local_class_oog_${classInfo.class_no}`;
        const rows = filterRowsByActiveTrainer(normalizeLocalClassOogRows(localRows, showNo, classInfo), activeTrainerNames);
        phase = `write_local_catalyst_${classInfo.class_no}`;
        const catalystResult = await upsertCatalystClassOog(app, showNo, classInfo.class_no, classInfo.ring_day_no, classInfo.ring_no, rows);
        phase = `write_local_airtable_${classInfo.class_no}`;
        const linkMaps = rows.length ? await buildLinkMaps(baseId, showNo, focusShow, rows, [classInfo], token) : {};
        const airtableRows = toAirtableRows(rows, focusShow.focus_day, linkMaps);
        const airtableResult = airtableRows.length
          ? await airtableUpsert(baseId, TABLE_AIRTABLE_CLASS_OOG, AIRTABLE_OOG_FIELDS.mirror_class_oog_key, airtableRows, token)
          : [];
        const airtableDeleted = await deleteAirtableRowsOutsideKeys(
          baseId,
          showNo,
          focusShow.focus_day,
          classInfo.class_no,
          classInfo.ring_day_no,
          classInfo.ring_no,
          new Set(rows.map((row) => row.class_oog_key)),
          token
        );
        rowsWritten += rows.length;
        upstreamRowsTotal += rows.length;
        catalystInserted += catalystResult.inserted;
        catalystUpdated += catalystResult.updated;
        catalystDeleted += catalystResult.deleted;
        airtableRecords += airtableResult.length;
        airtableDeletedTotal += airtableDeleted;
        class_results.push({
          class_no: classInfo.class_no,
          ring_day_no: classInfo.ring_day_no,
          ring_no: classInfo.ring_no,
          source: "local_html_probe",
          upstream_rows: rows.length,
          active_trainer_rows: rows.length,
          catalyst_inserted: catalystResult.inserted,
          catalyst_updated: catalystResult.updated,
          catalyst_deleted: catalystResult.deleted,
          airtable_records: airtableResult.length,
          airtable_deleted: airtableDeleted
        });
      }
      await writeRunLog(baseId, token, {
        ok: true,
        show_no: Number(showNo),
        focus_day: focusShow.focus_day,
        ring_no: ringNo,
        offset,
        limit,
        only_locked: onlyLocked,
        focus_show_record_id: focusShow.record_id,
        target_classes_total: classes.length,
        classes_seen: selected.length,
        class_nos: selected.map((row) => Number(row.class_no)),
        upstream_rows_total: upstreamRowsTotal,
        rows_written: rowsWritten,
        catalyst_inserted: catalystInserted,
        catalyst_updated: catalystUpdated,
        catalyst_deleted: catalystDeleted,
        airtable_records: airtableRecords,
        airtable_deleted: airtableDeletedTotal,
        active_trainers: activeTrainerNames.size,
        source: "local_html_probe",
        class_results
      });
      return sendJson(res, 200, {
        ok: true,
        action: "class-oog-local-html-write",
        source_endpoint: "class_oog.php",
        source: "local_html_probe",
        target_catalyst: TABLE_CLASS_OOG,
        target_airtable: "class_oog",
        show_no: Number(showNo),
        focus_day: focusShow.focus_day,
        focus_show_record_id: focusShow.record_id,
        only_locked: onlyLocked,
        target_classes_total: classes.length,
        selected_classes: selected.length,
        rows_written: rowsWritten,
        catalyst_inserted: catalystInserted,
        catalyst_updated: catalystUpdated,
        catalyst_deleted: catalystDeleted,
        airtable_records: airtableRecords,
        airtable_deleted: airtableDeletedTotal,
        active_trainers: activeTrainerNames.size,
        class_results
      });
    }
    phase = "cleanup_class_oog_scope";
    scopeCatalystDeleted = onlyLocked
      ? await deleteCatalystRowsOutsideContexts(app, showNo, focusRingDayNos, allowedContexts)
      : 0;
    scopeAirtableDeleted = onlyLocked
      ? await deleteAirtableRowsOutsideContexts(baseId, showNo, focusShow.focus_day, allowedContexts, token)
      : 0;
    if (!ringNo) {
      if (classNos.length) {
        const selectedByClass = classes.filter((row) => classNos.includes(Number(row.class_no)));
        classes.splice(0, classes.length, ...selectedByClass);
      } else {
      await writeRunLog(baseId, token, {
        ok: true,
        show_no: Number(showNo),
        focus_day: focusShow.focus_day,
        ring_no: ringNo,
        offset,
        limit,
        only_locked: onlyLocked,
        focus_show_record_id: focusShow.record_id,
        target_classes_total: classes.length,
        classes_seen: 0,
        class_nos: [],
        upstream_rows_total: 0,
        rows_written: 0,
        catalyst_deleted: scopeCatalystDeleted,
        airtable_deleted: scopeAirtableDeleted,
        scope_catalyst_deleted: scopeCatalystDeleted,
        scope_airtable_deleted: scopeAirtableDeleted,
        active_trainers: activeTrainerNames.size,
        class_results: []
      });
      return sendJson(res, 200, {
        ok: true,
        source_endpoint: "class_oog.php",
        target_catalyst: TABLE_CLASS_OOG,
        target_airtable: "class_oog",
        show_no: Number(showNo),
        focus_day: focusShow.focus_day,
        focus_show_record_id: focusShow.record_id,
        ring_no_required: true,
        rings_available: ringsAvailable,
        target_classes_total: classes.length,
        selected_classes: 0,
        scope_catalyst_deleted: scopeCatalystDeleted,
        scope_airtable_deleted: scopeAirtableDeleted,
        rows_written: 0
      });
      }
    }
    const selected = classNos.length ? classes : classes.slice(offset, offset + limit);
    phase = "bootstrap_class_oog_cookie";
    const cookie = await bootstrapCookie(showNo, phpSessionId);
    const class_results = [];
    let rowsWritten = 0;
    let catalystInserted = 0;
    let catalystUpdated = 0;
    let catalystDeleted = scopeCatalystDeleted;
    let airtableRecords = 0;
    let airtableDeletedTotal = scopeAirtableDeleted;
    let upstreamRowsTotal = 0;
    let duplicateContextsCleared = 0;
    for (const duplicate of duplicateContextsToClear) {
      const catalystResult = await upsertCatalystClassOog(app, showNo, duplicate.class_no, duplicate.ring_day_no, duplicate.ring_no, []);
      const airtableDeleted = await deleteAirtableRowsOutsideKeys(
        baseId,
        showNo,
        focusShow.focus_day,
        duplicate.class_no,
        duplicate.ring_day_no,
        duplicate.ring_no,
        new Set(),
        token
      );
      catalystDeleted += catalystResult.deleted;
      airtableDeletedTotal += airtableDeleted;
      duplicateContextsCleared += 1;
    }
    for (const classInfo of selected) {
      phase = `fetch_class_oog_${classInfo.class_no}`;
      const fetched = await fetchClassOog(showNo, classInfo.class_no, cookie);
      phase = `parse_class_oog_${classInfo.class_no}`;
      const parsedRows = parseClassOogRows(fetched.raw, showNo, classInfo);
      const rows = filterRowsByActiveTrainer(parsedRows, activeTrainerNames);
      phase = `write_catalyst_${classInfo.class_no}`;
      const catalystResult = await upsertCatalystClassOog(app, showNo, classInfo.class_no, classInfo.ring_day_no, classInfo.ring_no, rows);
      phase = `write_airtable_${classInfo.class_no}`;
      const linkMaps = rows.length ? await buildLinkMaps(baseId, showNo, focusShow, rows, [classInfo], token) : {};
      const airtableRows = toAirtableRows(rows, focusShow.focus_day, linkMaps);
      const airtableResult = airtableRows.length
        ? await airtableUpsert(baseId, TABLE_AIRTABLE_CLASS_OOG, AIRTABLE_OOG_FIELDS.mirror_class_oog_key, airtableRows, token)
        : [];
      const airtableDeleted = await deleteAirtableRowsOutsideKeys(
        baseId,
        showNo,
        focusShow.focus_day,
        classInfo.class_no,
        classInfo.ring_day_no,
        classInfo.ring_no,
        new Set(rows.map((row) => row.class_oog_key)),
        token
      );
      rowsWritten += rows.length;
      upstreamRowsTotal += parsedRows.length;
      catalystInserted += catalystResult.inserted;
      catalystUpdated += catalystResult.updated;
      catalystDeleted += catalystResult.deleted;
      airtableRecords += airtableResult.length;
      airtableDeletedTotal += airtableDeleted;
      class_results.push({
        class_no: classInfo.class_no,
        ring_day_no: classInfo.ring_day_no,
        upstream_status: fetched.status,
        upstream_rows: parsedRows.length,
        active_trainer_rows: rows.length,
        catalyst_inserted: catalystResult.inserted,
        catalyst_updated: catalystResult.updated,
        catalyst_deleted: catalystResult.deleted,
        airtable_records: airtableResult.length,
        airtable_deleted: airtableDeleted
      });
    }
    phase = "write_wec_log";
    await writeRunLog(baseId, token, {
      ok: true,
      show_no: Number(showNo),
      focus_day: focusShow.focus_day,
      ring_no: ringNo,
      offset,
      limit,
      only_locked: onlyLocked,
      focus_show_record_id: focusShow.record_id,
      target_classes_total: classes.length,
      classes_seen: selected.length,
      class_nos: selected.map((row) => Number(row.class_no)),
      upstream_rows_total: upstreamRowsTotal,
      rows_written: rowsWritten,
      catalyst_inserted: catalystInserted,
      catalyst_updated: catalystUpdated,
      catalyst_deleted: catalystDeleted,
      airtable_records: airtableRecords,
      airtable_deleted: airtableDeletedTotal,
      scope_catalyst_deleted: scopeCatalystDeleted,
      scope_airtable_deleted: scopeAirtableDeleted,
      active_trainers: activeTrainerNames.size,
      class_results
    });
    return sendJson(res, 200, {
      ok: true,
      source_endpoint: "class_oog.php",
      target_catalyst: TABLE_CLASS_OOG,
      target_airtable: "class_oog",
      show_no: Number(showNo),
      focus_day: focusShow.focus_day,
      focus_show_record_id: focusShow.record_id,
      ring_no: ringNo,
      only_locked: onlyLocked,
      rings_available: ringsAvailable,
      duplicate_contexts_cleared: duplicateContextsCleared,
      scope_catalyst_deleted: scopeCatalystDeleted,
      scope_airtable_deleted: scopeAirtableDeleted,
      target_classes_total: classes.length,
      offset,
      limit,
      selected_classes: selected.length,
      next_offset: offset + selected.length < classes.length ? offset + selected.length : null,
      rows_written: rowsWritten,
      catalyst_inserted: catalystInserted,
      catalyst_updated: catalystUpdated,
      catalyst_deleted: catalystDeleted,
      airtable_records: airtableRecords,
      airtable_deleted: airtableDeletedTotal,
      scope_catalyst_deleted: scopeCatalystDeleted,
      scope_airtable_deleted: scopeAirtableDeleted,
      active_trainers: activeTrainerNames.size,
      class_results
    });
  } catch (error) {
    let log_error = "";
    if (runLogContext.baseId && runLogContext.token) {
      try {
        await writeRunLog(runLogContext.baseId, runLogContext.token, {
          ...runLogContext,
          ok: false,
          phase,
          classes_seen: runLogContext.class_nos?.length || 0,
          rows_written: 0,
          error: String(error?.message || error)
        });
      } catch (logError) {
        log_error = String(logError?.message || logError);
      }
    }
    return sendJson(res, 200, { ok: false, phase, error: String(error?.message || error), log_error, stack: error?.stack || "" });
  }
}

handle.__test__ = { isFocusPaused };
module.exports = handle;
