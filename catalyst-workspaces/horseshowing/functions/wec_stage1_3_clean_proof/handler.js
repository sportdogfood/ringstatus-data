"use strict";

const catalyst = require("zcatalyst-sdk-node");
const cheerio = require("cheerio");
const { createRouterRun, executeLoggedAction } = require("@ringstatus/catalyst-router-logger");
const {
  buildConstKeys,
  preflightReason,
  rowMatchesEvidence,
  runStage1HeartbeatAndRingDays,
  runStage2UpdateSchedule,
  runProbe3A,
  runProbe3B,
  runCleanStage1To3Proof
} = require("./index");

const BASE_URL = "https://www.horseshowing.com";
const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36";

const TABLES = Object.freeze({
  heartbeat: "hs_heartbeat",
  focusShow: "hs_focus_show",
  getRingDays: "hs_get_ring_days",
  updateSchedule: "hs_update_schedule",
  classOogRaw: "hs_class_oog_raw",
  classOog: "hs_class_oog",
  ringStatus: "hs_ring_status",
  classStartTimes: "hs_class_start_times",
  entryGoTimes: "hs_entry_go_times",
  getRings: "hs_get_rings",
  statewiseNow: "statewise_now",
  riderResults: "hs_rider_results",
  timeEngine: "time_engine",
  timeEngineTriggers: "time_engine_triggers",
  timeEngineLogs: "time_engine_logs",
  routerLogs: "hs_router_logs",
  horses: "hs_horses",
  riders: "hs_riders",
  trainers: "hs_trainers"
});

const TIME_ENGINE_FIELDS = Object.freeze([
  "time_engine_key", "run_id", "show_no", "focus_day", "iso_date", "focus_day_key",
  "level", "endpoint", "source_table", "source_key", "ring_const_key", "class_const_key",
  "entry_const_key", "ring_name_normalized", "ring_name_prioritized", "class_no",
  "entry_no", "entry_order", "class_start_time", "estimated_class_end_time",
  "entry_go_time", "starts_in_mins", "ends_in_mins", "go_in_mins", "pace_seconds",
  "tags", "status", "trigger_ready", "result_ready", "result_ready_at",
  "result_ready_rule", "generated_at", "expires_at", "payload_json", "last_synced_at"
]);

const TIME_ENGINE_TRIGGER_FIELDS = Object.freeze([
  "trigger_key", "run_id", "show_no", "focus_day", "focus_day_key", "level",
  "trigger_type", "status", "source_table", "source_key", "ring_const_key",
  "class_const_key", "entry_const_key", "class_no", "entry_no", "trigger_time",
  "generated_at", "estimated_pace_now", "starts_in", "ends_in", "entry_order_now",
  "entries_ahead", "entry_go_time_now", "go_in", "class_status", "tags",
  "ring_no", "horse", "rider", "trainer", "followed_class", "tracked_entry_count",
  "snapshot_id", "snapshot_source", "as_of_time", "row_count", "payload_json"
]);

const STATEWISE_NOW_ENDPOINT_FIELDS = Object.freeze([
  "statewise_now_key", "show_no", "focus_day", "ring_no", "class_no", "entry_no",
  "horse", "rider", "trainer", "as_of_time", "mins_since_updated", "state",
  "sort_order", "ends_in", "starts_in", "CREATEDTIME", "MODIFIEDTIME"
]);

const STATEWISE_NOW_FIELDS = Object.freeze([
  "statewise_now_key", "show_no", "focus_day", "focus_day_key", "snapshot_id",
  "snapshot_source", "as_of_time", "mins_since_updated", "lane", "lookup_type",
  "lookup_key", "ring_const_key", "class_const_key", "entry_const_key", "ring_no",
  "class_no", "entry_no", "ring_name", "class_name", "horse", "rider", "trainer",
  "state", "sort_order", "class_start_time", "entry_go_time_now", "entry_count_now",
  "n_gone_now", "n_to_go_now", "entries_ahead", "go_in", "starts_in", "ends_in",
  "estimated_pace_now", "tags", "payload_json", "last_synced_at"
]);

const AIRTABLE_STATEWISE_NOW_FIELDS = Object.freeze([
  "statewise_now_key", "show_no", "focus_day", "ring_no", "class_no", "entry_no",
  "horse", "rider", "trainer", "as_of_time", "mins_since_updated", "state",
  "sort_order", "ends_in", "starts_in"
]);

const CUSTOMER_TRIGGER_TYPES = Object.freeze(new Set([
  "class_start_60", "class_start_30", "class_live", "entry_go_40", "entry_go_20",
  "entry_class_10_gone", "entry_10_away", "ring_late_15", "ring_late_30"
]));

const INTERNAL_TRIGGER_TYPES = Object.freeze(new Set([
  "ring_class_change", "result_ready", "statewise_snapshot_due"
]));

const APPROVED_TRIGGER_TYPES = Object.freeze(new Set([
  ...CUSTOMER_TRIGGER_TYPES,
  ...INTERNAL_TRIGGER_TYPES
]));

const RIDER_RESULT_ENDPOINT_FIELDS = Object.freeze([
  "rider_result_key", "show_no", "focus_day", "class_no", "entry_no", "horse",
  "rider", "place", "score", "result_time", "result_status", "result_source",
  "observed_at", "run_id", "CREATEDTIME", "MODIFIEDTIME"
]);
const AIRTABLE_TIME_ENGINE_TRIGGER_FIELDS = Object.freeze([
  "trigger_key", "run_id", "show_no", "focus_day", "focus_day_key", "level",
  "trigger_type", "status", "source_table", "source_key", "ring_const_key",
  "class_const_key", "entry_const_key", "class_no", "entry_no", "trigger_time",
  "generated_at", "payload_json",
  "ring_no", "horse", "rider", "trainer"
]);

const TIME_ENGINE_LOG_FIELDS = Object.freeze([
  "time_engine_log_key", "run_id", "show_no", "focus_day", "focus_day_key",
  "started_at", "finished_at", "duration_ms", "status", "source_counts",
  "rows_written", "trigger_ready_count", "endpoints", "warning_count",
  "warning_summary", "error_message", "payload_json", "last_synced_at"
]);

const GET_RINGS_ENDPOINT_FIELDS = Object.freeze([
  "get_rings_key", "show_no", "focus_day", "ring_no", "ring_day_no", "class_no",
  "class_text", "class_number", "entry_no", "entry_text", "total", "n_to_go",
  "n_gone", "time_text", "timestamp_value", "elapsed", "status_type", "source_payload",
  "CREATEDTIME", "MODIFIEDTIME"
]);

const ROUTER_LOG_ENDPOINT_FIELDS = Object.freeze([
  "router_log_key", "run_id", "parent_run_id", "show_no", "focus_day", "lane", "stage",
  "event_type", "status", "sequence_no", "source_function", "source_action", "trigger_source",
  "trigger_reason", "started_at", "finished_at", "duration_ms", "input_count", "output_count",
  "next_lane", "next_action", "http_status", "error_code", "error_message", "retryable",
  "payload_json", "logged_at", "CREATEDTIME", "MODIFIEDTIME"
]);

const AIRTABLE_ALERTS_TABLE = "wec-alerts";

const STEP4_REQUIRED_COLUMNS = Object.freeze({
  hs_ring_status: [
    "ring_status_key", "show_no", "focus_day", "iso_date", "focus_day_key",
    "ring_day_no", "ring_no", "ring_name", "ring_name_normalized",
    "show_const_key", "focus_day_const_key", "ring_day_const_key", "ring_const_key",
    "status", "last_synced_at"
  ],
  hs_class_start_times: [
    "class_start_key", "show_no", "focus_day", "iso_date", "focus_day_key",
    "ring_day_no", "ring_no", "ring_name", "ring_name_normalized",
    "show_const_key", "focus_day_const_key", "ring_day_const_key",
    "ring_const_key", "class_const_key", "class_no", "class_number",
    "class_name", "class_start_time", "display_time", "entry_count",
    "status", "live_source", "last_synced_at"
  ],
  hs_entry_go_times: [
    "entry_go_key", "show_no", "focus_day", "iso_date", "focus_day_key",
    "ring_day_no", "ring_no", "ring_name", "ring_name_normalized",
    "show_const_key", "focus_day_const_key",
    "ring_day_const_key", "ring_const_key", "class_const_key",
    "entry_const_key", "class_no", "entry_no", "entry_order", "horse",
    "rider", "trainer", "class_start_time", "display_time", "go_time",
    "pace_seconds", "status", "live_source", "last_synced_at"
  ]
});

function text(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(",");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).replace(/\s+/g, " ").trim();
}

function intValue(value) {
  const n = Number.parseInt(text(value), 10);
  return Number.isFinite(n) ? n : 0;
}

function optionalIntValue(value) {
  if (value === null || value === undefined || text(value) === "") return undefined;
  return intValue(value);
}

function nullablePositiveInt(value) {
  const number = intValue(value);
  return number > 0 ? number : null;
}

function airtableRecordLinks(value) {
  const values = Array.isArray(value) ? value : [value];
  const links = values.map(text).filter((item) => /^rec[A-Za-z0-9]{14}$/.test(item));
  return links.length ? links : undefined;
}

function boolValue(value) {
  return value === true || text(value).toLowerCase() === "true" || text(value) === "1";
}

function minutesFromClockText(value) {
  const raw = text(value).toLowerCase();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return null;
    return numeric > 1440 ? Math.floor(numeric / 60) : Math.floor(numeric);
  }
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*([ap]m)?$/i);
  if (!match) return null;
  let hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2] || "0", 10);
  const suffix = match[4] || "";
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function nowEasternParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    isoDate: `${parts.year}-${parts.month}-${parts.day}`,
    minuteOfDay: Number.parseInt(parts.hour, 10) * 60 + Number.parseInt(parts.minute, 10)
  };
}

function timeEngineWakeGate(focus, wakeReason, now = new Date()) {
  if (focus.is_pause === true) {
    return { ok: false, reason: "focus_show.is_pause" };
  }
  if (wakeReason !== "clock_window") {
    return { ok: true, reason: "state_wake" };
  }
  if (!boolValue(focus.active ?? focus.is_active ?? true)) {
    return { ok: false, reason: "focus_show.active_false" };
  }
  const start = minutesFromClockText(focus.show_start_time);
  const end = minutesFromClockText(focus.show_end_time);
  if (start === null || end === null) {
    return { ok: false, reason: "focus_show.show_window_missing" };
  }
  const current = nowEasternParts(now);
  if (current.isoDate !== text(focus.focus_day)) {
    return { ok: false, reason: "outside_focus_day" };
  }
  const inWindow = start <= end
    ? current.minuteOfDay >= start && current.minuteOfDay <= end
    : current.minuteOfDay >= start || current.minuteOfDay <= end;
  return inWindow
    ? { ok: true, reason: "clock_window" }
    : { ok: false, reason: "outside_show_window" };
}

function lowerText(value) {
  return text(value).toLowerCase();
}

const NO_MATCH_PROBE_RETRY_MAX_ATTEMPTS = 3;
const STAGE_4S_SYNC_DEFAULT_LIMIT = 100;

function boolish(value) {
  return value === true || lowerText(value) === "true" || text(value) === "1";
}

function isRawStoredProbe(row) {
  return lowerText(row.probe_status) === "raw_stored" || boolish(row.probe_raw_stored);
}

function isCheckedNoMatchProbe(row) {
  return lowerText(row.probe_status) === "checked" &&
    !isRawStoredProbe(row) &&
    lowerText(row.probe_reason) === "no_allowed_trainer_evidence";
}

function isRetryableNoMatchProbe(row) {
  return isCheckedNoMatchProbe(row) &&
    intValue(row.probe_attempt_count) > 0 &&
    intValue(row.probe_attempt_count) < NO_MATCH_PROBE_RETRY_MAX_ATTEMPTS;
}

function isProbeCandidate(row) {
  if (isRawStoredProbe(row)) return false;
  return lowerText(row.probe_status) !== "checked";
}

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function zcqlValue(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function airtableFormulaValue(value) {
  return String(value ?? "").replace(/'/g, "\\'");
}

function compactDate(value) {
  return text(value).replace(/-/g, "");
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

function displayDateText(value) {
  const key = dateKey(value);
  if (!key) return text(value);
  const parsed = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return text(value);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(parsed);
}

function catalystDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return catalystDateTime(new Date());
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

function catalystDateTimeToUtcIso(value) {
  const raw = text(value);
  const catalystMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/);
  const date = catalystMatch ? new Date(`${catalystMatch[1]}T${catalystMatch[2]}.000Z`) : new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toISOString();
}

function queryParams(req) {
  const url = new URL(req.url || "/", "http://local");
  return url.searchParams;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function zcqlRows(app, tableName, query) {
  const result = await app.zcql().executeZCQLQuery(query);
  return (result || []).map((item) => item?.[tableName]).filter(Boolean);
}

async function firstRow(app, tableName, query) {
  return (await zcqlRows(app, tableName, query))[0] || null;
}

async function zcqlSingle(app, tableName, query) {
  return firstRow(app, tableName, query);
}

async function upsertByKey(app, tableName, keyField, row) {
  const key = text(row[keyField]);
  if (!key) throw new Error(`missing_key:${tableName}.${keyField}`);
  const existing = await firstRow(
    app,
    tableName,
    `SELECT ROWID, ${keyField} FROM ${tableName} WHERE ${keyField} = ${zcqlValue(key)} LIMIT 1`
  );
  const table = app.datastore().table(tableName);
  if (existing?.ROWID) {
    return { operation: "update", row: await table.updateRow({ ...row, ROWID: existing.ROWID }) };
  }
  return { operation: "insert", row: await table.insertRow(row) };
}

async function loadSchema(app) {
  const tables = await app.datastore().getAllTables();
  const schema = new Map();
  for (const table of tables) {
    const name = table._tableDetails?.table_name || table.table_name || "";
    if (!Object.values(TABLES).includes(name)) continue;
    const cols = await app.datastore().table(name).getAllColumns();
    schema.set(name, new Set((cols || []).map((col) => col.column_name)));
  }
  return schema;
}

function filterToSchema(schema, tableName, row, missing) {
  const columns = schema.get(tableName);
  if (!columns) return row;
  const filtered = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (columns.has(key)) filtered[key] = value;
    else {
      const missingKey = `${tableName}.${key}`;
      if (!missing.includes(missingKey)) missing.push(missingKey);
    }
  }
  return filtered;
}

function missingRequiredColumns(schema, requirements) {
  const missing = [];
  for (const [tableName, fields] of Object.entries(requirements || {})) {
    const columns = schema.get(tableName) || new Set();
    for (const field of fields || []) {
      if (!columns.has(field)) missing.push(`${tableName}.${field}`);
    }
  }
  return missing;
}

function mergeCookies(current, setCookieHeaders = []) {
  const jar = new Map();
  text(current).split(";").map((part) => part.trim()).filter(Boolean).forEach((part) => {
    const [name, ...rest] = part.split("=");
    if (name) jar.set(name, rest.join("="));
  });
  for (const header of setCookieHeaders) {
    const first = String(header || "").split(";")[0];
    const [name, ...rest] = first.split("=");
    if (name) jar.set(name.trim(), rest.join("=").trim());
  }
  return Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join("; ");
}

function setCookies(response) {
  if (typeof response.headers.getSetCookie === "function") return response.headers.getSetCookie();
  const cookie = response.headers.get("set-cookie");
  return cookie ? [cookie] : [];
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeout_ms || 30000));
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.text();
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

async function bootstrapCookie(showNo) {
  let cookie = `HscomShowNo=${showNo}`;
  const show = await fetchText(`${BASE_URL}/show.php?show=${encodeURIComponent(showNo)}`, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": USER_AGENT,
      cookie
    }
  });
  cookie = mergeCookies(cookie, setCookies(show.response));
  const schedule = await fetchText(`${BASE_URL}/schedule.php`, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      referer: `${BASE_URL}/show.php?show=${encodeURIComponent(showNo)}`,
      "user-agent": USER_AGENT,
      cookie
    }
  });
  return mergeCookies(cookie, setCookies(schedule.response));
}

async function fetchClassOogRaw(showNo, classNo, cookie) {
  const result = await fetchText(`${BASE_URL}/class_oog.php?class_no=${encodeURIComponent(classNo)}`, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-encoding": "identity",
      "accept-language": "en-US,en;q=0.9",
      referer: `${BASE_URL}/schedule.php`,
      "user-agent": USER_AGENT,
      cookie
    },
    timeout_ms: 60000
  });
  if (!result.response.ok) throw new Error(`class_oog_http_${result.response.status}`);
  return result.body;
}

async function fetchRingDaysRaw(showNo) {
  const cookie = await bootstrapCookie(showNo);
  const result = await fetchText(`${BASE_URL}/get_ring_days.php`, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-encoding": "identity",
      "accept-language": "en-US,en;q=0.9",
      referer: `${BASE_URL}/schedule.php`,
      "user-agent": USER_AGENT,
      cookie
    },
    timeout_ms: 30000
  });
  if (!result.response.ok) throw new Error(`get_ring_days_http_${result.response.status}`);
  return result.body;
}

function parseRingDayRows(raw, showNo) {
  const payload = JSON.parse(raw || "[]");
  const rows = [];
  if (!Array.isArray(payload)) return rows;
  for (const ring of payload) {
    for (const day of ring.ring_days || []) {
      rows.push({
        show_no: intValue(showNo),
        ring_no: intValue(ring.ring_no),
        ring_day_no: intValue(day.ring_day_no),
        ring_name: text(ring.name),
        date_text: text(day.date),
        day_label: text(day.date),
        source_endpoint: "get_ring_days.php",
        source_payload: JSON.stringify({ ring_no: ring.ring_no, ring_name: ring.name, ...day })
      });
    }
  }
  return rows;
}

async function fetchUpdateScheduleRaw(showNo, ringDayNo, cookie) {
  const body = new URLSearchParams({
    show_no: String(showNo),
    ring_day_no: String(ringDayNo)
  }).toString();
  const result = await fetchText(`${BASE_URL}/update_schedule.php`, {
    method: "POST",
    headers: {
      accept: "text/html, */*; q=0.01",
      "accept-encoding": "identity",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      origin: BASE_URL,
      referer: `${BASE_URL}/schedule.php`,
      "user-agent": USER_AGENT,
      "x-requested-with": "XMLHttpRequest",
      cookie
    },
    body,
    timeout_ms: 30000
  });
  if (!result.response.ok) throw new Error(`update_schedule_http_${result.response.status}`);
  return result.body;
}

function parseUpdateScheduleRows(raw, focus, ringDay) {
  const $ = cheerio.load(raw || "");
  const rows = [];
  $("h3.ring_evt").each((index, node) => {
    const classText = text($(node).attr("data-name")) || text($(node).find(".ring_evt_name").first().text());
    const timeText = text($(node).attr("data-time")) || text($(node).find(".ring_evt_time").first().text());
    const entryCount = text($(node).attr("data-n_entries")) || text($(node).find(".ring_evt_entries").first().text());
    const base = {
      show_no: intValue(focus.show_no),
      focus_day: text(focus.focus_day),
      iso_date: text(focus.focus_day),
      focus_day_key: compactDate(focus.focus_day),
      ring_day_no: intValue(ringDay.ring_day_no),
      ring_no: intValue(ringDay.ring_no),
      ring_name: text(ringDay.ring_name),
      ring_name_normalized: text(ringDay.ring_name_normalized) || normalizeRingName(ringDay.ring_name),
      ring_name_prioritized: intValue(ringDay.ring_name_prioritized),
      event_id: text($(node).attr("id")),
      class_no: intValue($(node).attr("data-class")),
      class_label: classText,
      class_name: classText,
      time_text: timeText,
      class_time_text: timeText,
      class_start_time: normalizeClassStartTime(timeText),
      display_time: displayTimeFromStart(timeText),
      class_order: index + 1,
      entry_count: intValue(entryCount),
      event_type: intValue($(node).attr("data-re_type")),
      re_type: text($(node).attr("data-re_type")),
      oc_id: text($(node).attr("data-oc_id")),
      live_flag: text($(node).attr("data-live")).toLowerCase() === "true" ? 1 : 0,
      source_endpoint: "update_schedule.php",
      source_payload: JSON.stringify({
        event_id: text($(node).attr("id")),
        data_class: text($(node).attr("data-class")),
        data_name: classText,
        data_time: timeText,
        data_entries: entryCount
      })
    };
    rows.push({
      ...base,
      ...buildConstKeys(base)
    });
  });
  return rows;
}

async function getActiveFocusShow() {
  const records = await getAirtableRecords("focus_show", { pageSize: "100" });
  const active = (records || []).filter((record) => {
    const fields = record.fields || {};
    const activeValue = fields.is_active ?? fields.active;
    return activeValue === true || text(activeValue).toLowerCase() === "true" || text(activeValue) === "1";
  });
  if (active.length !== 1) throw new Error(`focus_show_active_count:${active.length}`);
  const fields = active[0].fields || {};
  return {
    source: "airtable.focus_show",
    focus_show_record_id: active[0].id,
    show_no: intValue(fields.show_no),
    focus_day: text(fields.focus_day || fields.iso_date),
    iso_date: text(fields.iso_date || fields.focus_day),
    active: fields.is_active ?? fields.active,
    is_pause: boolValue(fields.is_pause),
    live_enrichment: boolValue(fields.live_enrichment),
    show_start_time: text(fields.show_start_time || fields.show_start_seconds || fields.show_start || fields.start_time),
    show_end_time: text(fields.show_end_time || fields.show_end_seconds || fields.show_end || fields.end_time),
    trainers_allowed: fields.trainers_allowed || fields.allowed_trainers || []
  };
}

async function syncFocusShowMirror(app, schema, focus, missingContractFields) {
  const focusDay = text(focus.focus_day || focus.iso_date);
  const focusKey = `${intValue(focus.show_no)}|${compactDate(focusDay)}`;
  const row = filterToSchema(schema, TABLES.focusShow, {
    focus_show_key: focusKey,
    show_no: intValue(focus.show_no),
    focus_day: focusDay,
    iso_date: focusDay,
    source: "airtable.focus_show"
  }, missingContractFields);
  const catalystResult = await upsertByKey(app, TABLES.focusShow, "focus_show_key", row);
  await upsertAirtableByKey(TABLES.focusShow, "focus_show_key", focusKey, {
    focus_show_key: focusKey,
    show_no: intValue(focus.show_no),
    focus_day: focusDay,
    iso_date: focusDay,
    source: "airtable.focus_show",
    focus_show_record_id: text(focus.focus_show_record_id),
    last_synced_at: new Date().toISOString()
  });
  return catalystResult;
}

async function getAirtableRecords(tableName, params = {}) {
  const token = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_PAT;
  const baseId = process.env.AIRTABLE_BASE_ID || "app6XS1RvsPNRT6os";
  if (!token) throw new Error("AIRTABLE_TOKEN_required_for_focus_show");
  const records = [];
  let offset = "";
  do {
    const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
    }
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    const payload = await response.json();
    if (!response.ok) throw new Error(`${tableName}_airtable_${response.status}:${JSON.stringify(payload).slice(0, 300)}`);
    records.push(...(payload.records || []));
    offset = payload.offset || "";
  } while (offset);
  return records;
}

async function airtableRequest(tableName, params = {}, method = "GET", body = null) {
  const token = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_PAT;
  const baseId = process.env.AIRTABLE_BASE_ID || "app6XS1RvsPNRT6os";
  if (!token) throw new Error("AIRTABLE_TOKEN_required");
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${tableName}_airtable_${response.status}:${JSON.stringify(payload).slice(0, 300)}`);
  return payload;
}

async function airtableMetadataRequest(path, method = "GET", body = null) {
  const token = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_PAT;
  const baseId = process.env.AIRTABLE_BASE_ID || "app6XS1RvsPNRT6os";
  if (!token) throw new Error("AIRTABLE_TOKEN_required_for_metadata");
  const response = await fetch(`https://api.airtable.com/v0/meta/bases/${encodeURIComponent(baseId)}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`airtable_metadata_${method}_${path}_${response.status}:${raw.slice(0, 500)}`);
  return raw ? JSON.parse(raw) : {};
}

function airtableMirrorField(name, index) {
  return {
    name,
    type: index === 0 || name.endsWith("_json") || name.includes("summary") || name.includes("message")
      ? (name.endsWith("_json") || name.includes("summary") || name.includes("message") ? "multilineText" : "singleLineText")
      : "singleLineText"
  };
}

async function ensureAirtableMirrorTable(tableName, fields) {
  const tables = await airtableMetadataRequest("/tables");
  const existing = (tables.tables || []).find((table) => table.name === tableName);
  if (!existing) {
    const created = await airtableMetadataRequest("/tables", "POST", {
      name: tableName,
      fields: fields.map(airtableMirrorField)
    });
    return { table_name: tableName, created: true, fields_created: (created.fields || []).map((field) => field.name), missing_fields: [] };
  }
  const existingNames = new Set((existing.fields || []).map((field) => field.name));
  const missing = fields.filter((field) => !existingNames.has(field));
  const createdFields = [];
  for (const field of missing) {
    const created = await airtableMetadataRequest(`/tables/${encodeURIComponent(existing.id)}/fields`, "POST", airtableMirrorField(field, fields.indexOf(field)));
    createdFields.push(created.name || field);
  }
  return { table_name: tableName, created: false, fields_created: createdFields, missing_fields: [] };
}

function updateScheduleReviewFields(row, progress = row) {
  return {
    update_schedule_key: text(row.update_schedule_key || row.class_const_key || progress.class_const_key),
    heartbeat_id: text(row.heartbeat_id),
    show_no: intValue(row.show_no),
    focus_day: text(row.focus_day),
    focus_day_key: text(row.focus_day_key),
    ring_day_no: intValue(row.ring_day_no),
    ring_no: intValue(row.ring_no),
    ring_name: text(row.ring_name),
    iso_date: text(row.iso_date || row.focus_day),
    class_no: intValue(row.class_no),
    class_name: text(row.class_name),
    time_text: text(row.time_text),
    entry_count: intValue(row.entry_count),
    event_type: intValue(row.event_type),
    live_flag: text(row.live_flag),
    source_payload: text(row.source_payload),
    preflight_reason: text(row.preflight_reason),
    hs_is_preflight: row.is_preflight === true || text(row.is_preflight).toLowerCase() === "true",
    probe_status: text(progress.probe_status || row.probe_status),
    probe_attempted_at: text(progress.probe_attempted_at || row.probe_attempted_at),
    probe_certainty: text(progress.probe_certainty || row.probe_certainty),
    probe_reason: text(progress.probe_reason || row.probe_reason),
    probe_attempt_count: intValue(progress.probe_attempt_count || row.probe_attempt_count),
    probe_payload_chars: intValue(progress.probe_payload_chars || row.probe_payload_chars),
    probe_raw_stored: progress.probe_raw_stored === true || row.probe_raw_stored === true ||
      text(progress.probe_raw_stored || row.probe_raw_stored).toLowerCase() === "true",
    probe_finished_at: text(progress.probe_finished_at || row.probe_finished_at),
    probe_duration_ms: intValue(progress.probe_duration_ms || row.probe_duration_ms),
    show_const_key: text(row.show_const_key),
    focus_day_const_key: text(row.focus_day_const_key),
    ring_day_const_key: text(row.ring_day_const_key),
    ring_const_key: text(row.ring_const_key),
    class_const_key: text(row.class_const_key),
    ring_name_normalized: text(row.ring_name_normalized)
  };
}

function getRingDaysReviewFields(row) {
  return {
    ring_day_key: text(row.ring_day_key || row.ring_const_key),
    iso_date: text(row.iso_date || row.focus_day),
    show_no: intValue(row.show_no),
    focus_day: text(row.focus_day),
    ring_day_no: intValue(row.ring_day_no),
    ring_no: intValue(row.ring_no),
    ring_name_normalized: text(row.ring_name_normalized),
    ring_name: text(row.ring_name),
    date_text: text(row.date_text),
    source_row_json: text(row.source_row_json || row.source_payload),
    ring_const_key: text(row.ring_const_key)
  };
}

async function updateAirtableScheduleProbe(row, progress) {
  const classConstKey = text(row.class_const_key || progress.class_const_key);
  const rawStored = progress.probe_raw_stored === true ||
    progress.raw_stored === true ||
    text(progress.probe_raw_stored).toLowerCase() === "true" ||
    text(progress.raw_stored).toLowerCase() === "true" ||
    text(progress.probe_status) === "raw_stored";
  const probeStatus = rawStored ? "raw_stored" : progress.probe_status;
  return upsertAirtableByKey(TABLES.updateSchedule, "update_schedule_key", classConstKey, updateScheduleReviewFields(row, {
    ...progress,
    probe_status: probeStatus,
    probe_raw_stored: rawStored
  }));
}

async function upsertAirtableByKey(tableName, keyField, keyValue, fields) {
  const formula = `{${keyField}}='${airtableFormulaValue(keyValue)}'`;
  const found = await airtableRequest(tableName, { filterByFormula: formula, pageSize: "1" });
  const existing = (found.records || [])[0];
  if (existing?.id) {
    return airtableRequest(tableName, {}, "PATCH", {
      records: [{ id: existing.id, fields }]
    });
  }
  return airtableRequest(tableName, {}, "POST", {
    records: [{ fields }]
  });
}

async function upsertAirtableBatchByKey(tableName, keyField, rows) {
  let written = 0;
  for (let index = 0; index < (rows || []).length; index += 10) {
    const chunk = rows.slice(index, index + 10).filter(Boolean);
    if (!chunk.length) continue;
    await airtableRequest(tableName, {}, "PATCH", {
      records: chunk.map((fields) => ({ fields })),
      performUpsert: { fieldsToMergeOn: [keyField] },
      typecast: true
    });
    written += chunk.length;
  }
  return written;
}

async function writeAirtableRowsByKey(tableName, keyField, rows) {
  const sourceRows = (rows || []).filter((row) => text(row?.[keyField]));
  if (!sourceRows.length) return 0;
  const existing = await getAirtableRecords(tableName, {
    filterByFormula: currentStageAirtableFilter({
      show_no: sourceRows[0].show_no,
      focus_day: sourceRows[0].focus_day
    }),
    pageSize: "100"
  });
  const plan = planAirtableRowsByKey(sourceRows, existing, keyField);
  const updated = await updateAirtableRecordsInBatches(tableName, plan.updates);
  const created = await upsertAirtableBatchByKey(tableName, keyField, plan.creates);
  return updated + created;
}

function cleanAirtableLogFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).filter(([, value]) => (
    value !== undefined && value !== null && value !== ""
  )));
}

function planAirtableRowsByKey(rows, existingRecords, keyField) {
  const existingByKey = new Map();
  for (const record of existingRecords || []) {
    const key = text((record.fields || record)[keyField]);
    if (!key || !record.id) continue;
    const prior = existingByKey.get(key);
    if (!prior || text(record.createdTime) < text(prior.createdTime)) existingByKey.set(key, record);
  }
  const sourceByKey = new Map();
  for (const row of rows || []) {
    const clean = cleanAirtableLogFields(row);
    const key = text(clean[keyField]);
    if (key) sourceByKey.set(key, clean);
  }
  const updates = [];
  const creates = [];
  let unchanged = 0;
  for (const [key, fields] of sourceByKey) {
    const existing = existingByKey.get(key);
    if (!existing) {
      creates.push(fields);
      continue;
    }
    const existingFields = existing.fields || existing;
    const changed = Object.entries(fields).some(([field, value]) => {
      const prior = existingFields[field];
      if (value === false && (prior === undefined || prior === null || prior === false)) return false;
      return JSON.stringify(value) !== JSON.stringify(prior);
    });
    if (changed) updates.push({ id: existing.id, fields });
    else unchanged += 1;
  }
  return {
    updates,
    creates,
    unchanged,
    existing_unique: existingByKey.size
  };
}

async function updateAirtableRecordsInBatches(tableName, rows) {
  let updated = 0;
  for (let index = 0; index < (rows || []).length; index += 10) {
    const chunk = rows.slice(index, index + 10);
    if (!chunk.length) continue;
    await airtableRequest(tableName, {}, "PATCH", {
      records: chunk,
      typecast: true
    });
    updated += chunk.length;
  }
  return updated;
}

function buildHeartbeatActiveLinkUpdates(focusShowRecordId, heartbeatRecordId, focusDataRecords) {
  const focusId = text(focusShowRecordId);
  const heartbeatId = text(heartbeatRecordId);
  return {
    focus_show_update: focusId && heartbeatId
      ? { id: focusId, fields: { hs_heartbeat: [heartbeatId] } }
      : null,
    focus_data_updates: (focusDataRecords || [])
      .filter((record) => record?.id && focusId && heartbeatId)
      .map((record) => ({
        id: record.id,
        fields: {
          hs_heartbeat: [heartbeatId],
          focus_show: [focusId]
        }
      }))
  };
}

async function syncAirtableActiveHeartbeatLinks(focus, heartbeatFields) {
  const focusShowRecordId = text(focus.focus_show_record_id);
  if (!focusShowRecordId) throw new Error("active_focus_show_record_id_required_for_heartbeat_links");
  await upsertAirtableByKey(TABLES.heartbeat, "heartbeat_id", heartbeatFields.heartbeat_id, {
    heartbeat_id: heartbeatFields.heartbeat_id,
    run_id: heartbeatFields.run_id,
    show_no: intValue(heartbeatFields.show_no),
    focus_day: heartbeatFields.focus_day,
    iso_date: heartbeatFields.iso_date || heartbeatFields.focus_day,
    focus_day_key: heartbeatFields.focus_day_key || compactDate(heartbeatFields.focus_day),
    focus_show: [focusShowRecordId],
    focus_show_record_id: focusShowRecordId,
    run_time: new Date().toISOString(),
    status: heartbeatFields.status || "started",
    blocker: heartbeatFields.blocker || "",
    payload_json: heartbeatFields.payload_json
  });

  const latestFormula = `AND({show_no}=${intValue(heartbeatFields.show_no)},{focus_show_record_id}='${airtableFormulaValue(focusShowRecordId)}')`;
  const latestRecords = await getAirtableRecords(TABLES.heartbeat, {
    filterByFormula: latestFormula,
    "sort[0][field]": "Created",
    "sort[0][direction]": "desc",
    maxRecords: "1",
    pageSize: "1"
  });
  const latestHeartbeat = latestRecords[0];
  if (!latestHeartbeat?.id) throw new Error("latest_active_airtable_heartbeat_not_found");

  const focusDataRecords = await getAirtableRecords("focus_data", {
    view: "heartbeat_active",
    pageSize: "100"
  });
  const plan = buildHeartbeatActiveLinkUpdates(focusShowRecordId, latestHeartbeat.id, focusDataRecords);
  if (plan.focus_show_update) {
    await airtableRequest("focus_show", {}, "PATCH", {
      records: [plan.focus_show_update],
      typecast: true
    });
  }
  const focusDataUpdated = await updateAirtableRecordsInBatches("focus_data", plan.focus_data_updates);
  return {
    ok: true,
    latest_heartbeat_record_id: latestHeartbeat.id,
    latest_heartbeat_id: text(latestHeartbeat.fields?.heartbeat_id),
    focus_show_record_id: focusShowRecordId,
    focus_show_updated: Boolean(plan.focus_show_update),
    focus_data_view: "heartbeat_active",
    focus_data_seen: focusDataRecords.length,
    focus_data_updated: focusDataUpdated
  };
}

async function markAirtableRowsNotInKeySet(tableName, keyField, focus, activeKeys) {
  const formula = `AND({show_no}=${Number(focus.show_no)},DATETIME_FORMAT({focus_day}, 'YYYY-MM-DD')='${airtableFormulaValue(focus.focus_day)}',{status}='active')`;
  const records = await getAirtableRecords(tableName, {
    filterByFormula: formula,
    pageSize: "100"
  });
  const stale = (records || [])
    .filter((record) => !activeKeys.has(text(record.fields?.[keyField])))
    .map((record) => ({
      id: record.id,
      fields: { status: "dropped_old_key_shape" }
    }));
  for (let index = 0; index < stale.length; index += 10) {
    await airtableRequest(tableName, {}, "PATCH", { records: stale.slice(index, index + 10) });
  }
  return { reviewed: records.length, marked: stale.length };
}

function normalizeRingName(value) {
  const upper = text(value).toUpperCase();
  return upper.match(/GRAND|ANNEX|STADIUM|INDOOR [1-6]|HUNTER 2/)?.[0]?.toLowerCase() || text(value).toLowerCase();
}

function uniqueRowsByKey(rows, keyField) {
  const map = new Map();
  for (const row of rows || []) {
    const key = text(row?.[keyField]);
    if (key) map.set(key, row);
  }
  return Array.from(map.values());
}

function normalizeClassStartTime(value) {
  const raw = text(value);
  let match = raw.match(/^([01]?\d|2[0-3]):([0-5]\d):([0-5]\d)$/);
  if (match) {
    return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}:${match[3]}`;
  }
  match = raw.match(/^(\d{1,2}):([0-5]\d)\s*([AP]M)$/i);
  if (match) {
    let hour = Number(match[1]);
    const minute = match[2];
    const suffix = match[3].toUpperCase();
    if (hour < 1 || hour > 12) return "";
    if (suffix === "PM" && hour !== 12) hour += 12;
    if (suffix === "AM" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${minute}:00`;
  }
  match = raw.match(/^(\d{1,2}):([0-5]\d)$/);
  if (match) {
    const hour = Number(match[1]);
    if (hour < 0 || hour > 23) return "";
    return `${String(hour).padStart(2, "0")}:${match[2]}:00`;
  }
  return "";
}

function displayTimeFromStart(value) {
  const normalized = normalizeClassStartTime(value);
  if (!normalized) return text(value);
  let [hour, minute] = normalized.split(":").map((part) => Number(part));
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function addSecondsToTime(value, seconds) {
  const normalized = normalizeClassStartTime(value);
  if (!normalized) return "";
  const [hour, minute, second] = normalized.split(":").map((part) => Number(part));
  const total = hour * 3600 + minute * 60 + second + Math.max(0, intValue(seconds));
  const wrapped = ((total % 86400) + 86400) % 86400;
  const h = Math.floor(wrapped / 3600);
  const m = Math.floor((wrapped % 3600) / 60);
  const s = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function runtimeIdentity(input, focus) {
  const ringNameNormalized = text(input.ring_name_normalized) || normalizeRingName(input.ring_name || input.ring);
  const base = {
    ...input,
    show_no: intValue(input.show_no || focus.show_no),
    focus_day: text(input.focus_day || input.iso_date || focus.focus_day),
    iso_date: text(input.iso_date || input.focus_day || focus.focus_day),
    focus_day_key: compactDate(input.focus_day_key || input.focus_day || input.iso_date || focus.focus_day),
    ring_day_no: intValue(input.ring_day_no),
    ring_no: intValue(input.ring_no),
    ring_name: text(input.ring_name || input.ring),
    ring_name_normalized: ringNameNormalized,
    ring_name_prioritized: intValue(input.ring_name_prioritized),
    class_no: intValue(input.class_no),
    entry_no: intValue(input.entry_no)
  };
  return {
    ...base,
    ...buildConstKeys(base)
  };
}

function classVisualKeyFromSource(source, fallback = {}) {
  const classKey = text(source.class_const_key || fallback.class_const_key || fallback.class_start_key);
  const classNumber = intValue(source.class_number || fallback.class_number);
  return classKey && classNumber ? `${classKey}|${classNumber}` : classKey;
}

function ticketedClassReason(row) {
  const haystack = [
    row.class_name,
    row.class_label,
    row.event_name,
    row.source_payload
  ].map(text).filter(Boolean).join(" ").toLowerCase();
  const reasons = [];
  if (haystack.includes("ticketed")) reasons.push("ticketed");
  if (haystack.includes("ticket school") || haystack.includes("ticketed school")) reasons.push("ticket_school");
  return reasons;
}

function ringStatusRowsFromRingDays(rows, focus, runTime) {
  return uniqueRowsByKey((rows || []).map((row) => {
    const source = runtimeIdentity(row, focus);
    if (!source.ring_const_key) return null;
    return {
      ring_status_key: source.ring_const_key,
      ring_visual_key: source.ring_const_key,
      show_no: source.show_no,
      focus_day: source.focus_day,
      iso_date: source.iso_date,
      focus_day_key: source.focus_day_key,
      ring_day_no: source.ring_day_no,
      ring_no: source.ring_no,
      ring_name: source.ring_name,
      ring_name_normalized: source.ring_name_normalized,
      show_const_key: source.show_const_key,
      focus_day_const_key: source.focus_day_const_key,
      ring_day_const_key: source.ring_day_const_key,
      ring_const_key: source.ring_const_key,
      status: "active",
      source: "hs_get_ring_days.clean_step4_runtime",
      last_synced_at: catalystDateTime(runTime)
    };
  }).filter(Boolean), "ring_status_key");
}

function classStartRowsFromUpdateSchedule(rows, focus, runTime) {
  return uniqueRowsByKey((rows || [])
    .map((row) => scheduleRowForProof(row, focus))
    .filter((row) => intValue(row.class_no) && preflightReason(row).length === 0)
    .map((row) => {
      const source = runtimeIdentity(row, focus);
      const classStartTime = normalizeClassStartTime(row.time_text);
      if (!source.class_const_key || !classStartTime) return null;
      const classNumber = intValue(row.class_number);
      return {
        class_start_key: source.class_const_key,
        ring_visual_key: source.ring_const_key,
        class_visual_key: classVisualKeyFromSource({ ...source, class_number: classNumber }),
        show_no: source.show_no,
        focus_day: source.focus_day,
        iso_date: source.iso_date,
        focus_day_key: source.focus_day_key,
        ring_day_no: source.ring_day_no,
        ring_no: source.ring_no,
        ring_name: source.ring_name,
        ring_name_normalized: source.ring_name_normalized,
        show_const_key: source.show_const_key,
        focus_day_const_key: source.focus_day_const_key,
        ring_day_const_key: source.ring_day_const_key,
        ring_const_key: source.ring_const_key,
        class_const_key: source.class_const_key,
        class_no: source.class_no,
        class_number: classNumber,
        class_name: text(row.class_name || row.event_name),
        class_start_time: classStartTime,
        display_time: displayTimeFromStart(row.time_text || classStartTime),
        entry_count: intValue(row.entry_count),
        status: "active",
        live_source: "hs_update_schedule.clean_step4_runtime",
        last_synced_at: catalystDateTime(runTime)
      };
    })
    .filter(Boolean), "class_start_key");
}

function entryGoRowsFromClassOog(rows, focus, classStartByClassKey = new Map(), runTime) {
  return uniqueRowsByKey((rows || []).map((row) => {
    const source = runtimeIdentity(row, focus);
    if (!source.entry_const_key) return null;
    const classStart = classStartByClassKey.get(source.class_const_key) || {};
    const paceSeconds = 198;
    const entryOrder = intValue(row.entry_order);
    const classStartTime = text(classStart.class_start_time);
    const goTime = entryOrder > 0 ? addSecondsToTime(classStartTime, (entryOrder - 1) * paceSeconds) : "";
    return {
      entry_go_key: source.entry_const_key,
      ring_visual_key: source.ring_const_key,
      class_visual_key: classVisualKeyFromSource(source, classStart),
      show_no: source.show_no,
      focus_day: source.focus_day,
      iso_date: source.iso_date,
      focus_day_key: source.focus_day_key,
      ring_day_no: source.ring_day_no,
      ring_no: source.ring_no,
      ring_name: source.ring_name,
      ring_name_normalized: source.ring_name_normalized,
      show_const_key: source.show_const_key,
      focus_day_const_key: source.focus_day_const_key,
      ring_day_const_key: source.ring_day_const_key,
      ring_const_key: source.ring_const_key,
      class_const_key: source.class_const_key,
      entry_const_key: source.entry_const_key,
      class_no: source.class_no,
      entry_no: source.entry_no,
      entry_order: entryOrder,
      horse: text(row.horse),
      rider: text(row.rider),
      trainer: text(row.trainer),
      class_start_time: classStartTime,
      display_time: text(classStart.display_time),
      go_time: goTime,
      pace_seconds: paceSeconds,
      status: "active",
      live_source: goTime ? "estimated_schedule_pace.clean_step4_runtime" : "hs_class_oog.clean_step4_runtime",
      last_synced_at: catalystDateTime(runTime)
    };
  }).filter(Boolean), "entry_go_key");
}

function parseDateTime(focusDay, timeValue) {
  const day = text(focusDay);
  const time = normalizeClassStartTime(timeValue);
  if (!day || !time) return null;
  const date = new Date(`${day}T${time}-04:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function minutesUntil(target, now = new Date()) {
  if (!target) return null;
  return Math.round((target.getTime() - now.getTime()) / 60000);
}

function addSecondsToDate(date, seconds) {
  if (!date) return null;
  return new Date(date.getTime() + intValue(seconds) * 1000);
}

function isoTime(date) {
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(11, 19);
}

function classAlertTags(startsInMins) {
  const tags = [];
  if (startsInMins === null || startsInMins < 0) return tags;
  if (startsInMins <= 60) tags.push("starts_in_60");
  if (startsInMins <= 30) tags.push("starts_in_30");
  return tags;
}

function entryAlertTags(goInMins) {
  const tags = [];
  if (goInMins === null || goInMins < 0) return tags;
  if (goInMins <= 40) tags.push("go_in_40");
  if (goInMins <= 20) tags.push("go_in_20");
  return tags;
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(text(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function previousAlertState(previousRow) {
  const state = parseJsonObject(previousRow?.payload_json).alert_state;
  return state && typeof state === "object" && !Array.isArray(state) ? state : {};
}

function nextRingAlertState(previousRow, row, vars, eventTimeIso = new Date().toISOString()) {
  const previous = previousAlertState(previousRow);
  const initialized = boolish(previous.ring_initialized);
  const isLive = boolish(row?.is_live);
  const previousClassNo = intValue(previous.current_class_no);
  const currentClassNo = intValue(row?.current_class_no || vars?.now_class?.class_no);
  const classChanged = initialized && previousClassNo > 0 && currentClassNo > 0 && previousClassNo !== currentClassNo;
  const previousAlertStatus = text(previous.ring_alert_status);
  const currentAlertStatus = text(vars?.ring_alert_status);
  const lateMins = Math.max(0, intValue(vars?.running_late_mins));
  const late15Now = lateMins >= 15;
  const late30Now = lateMins >= 30;

  return {
    ring_initialized: true,
    ring_live_active: isLive,
    current_class_no: currentClassNo,
    previous_class_no: classChanged ? previousClassNo : intValue(previous.previous_class_no),
    ring_class_change_sequence: classChanged ? Math.max(0, intValue(previous.ring_class_change_sequence)) + 1 : Math.max(0, intValue(previous.ring_class_change_sequence)),
    ring_class_changed_at: classChanged ? eventTimeIso : text(previous.ring_class_changed_at),
    ring_late_15_reached: boolish(previous.ring_late_15_reached) || late15Now,
    ring_late_15_reached_at: text(previous.ring_late_15_reached_at) || (late15Now ? eventTimeIso : ""),
    ring_late_30_reached: boolish(previous.ring_late_30_reached) || late30Now,
    ring_late_30_reached_at: text(previous.ring_late_30_reached_at) || (late30Now ? eventTimeIso : ""),
    ring_alert_status: currentAlertStatus,
    previous_ring_alert_status: previousAlertStatus
  };
}

function finiteIntOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function nextClassAlertState(previousRow, vars, eventTimeIso = new Date().toISOString()) {
  const previous = previousAlertState(previousRow);
  const tags = Array.isArray(vars?.tags) ? vars.tags : [];
  const classStart60Now = tags.includes("starts_in_60");
  const classStart30Now = tags.includes("starts_in_30");
  const classStart60Reached = boolish(previous.class_start_60_reached) || classStart60Now;
  const classStart30Reached = boolish(previous.class_start_30_reached) || classStart30Now;
  const wasLive = boolish(previous.class_live_active);
  const isLive = lowerText(vars?.class_status) === "now" || vars?.is_live === true;
  const previousSequence = Math.max(0, intValue(previous.class_live_sequence));
  const enteringLive = isLive && !wasLive;

  return {
    class_start_60_reached: classStart60Reached,
    class_start_60_reached_at: text(previous.class_start_60_reached_at) || (classStart60Now ? eventTimeIso : ""),
    class_start_60_time_till: previous.class_start_60_time_till !== undefined
      ? finiteIntOrNull(previous.class_start_60_time_till)
      : (classStart60Now ? finiteIntOrNull(vars?.starts_in_mins) : null),
    class_start_30_reached: classStart30Reached,
    class_start_30_reached_at: text(previous.class_start_30_reached_at) || (classStart30Now ? eventTimeIso : ""),
    class_start_30_time_till: previous.class_start_30_time_till !== undefined
      ? finiteIntOrNull(previous.class_start_30_time_till)
      : (classStart30Now ? finiteIntOrNull(vars?.starts_in_mins) : null),
    class_live_active: isLive,
    class_live_sequence: enteringLive ? previousSequence + 1 : previousSequence,
    class_live_started_at: enteringLive ? eventTimeIso : text(previous.class_live_started_at)
  };
}

function nextEntryAlertState(previousRow, vars, eventTimeIso = new Date().toISOString()) {
  const previous = previousAlertState(previousRow);
  const tags = Array.isArray(vars?.tags) ? vars.tags : [];
  const go40Now = tags.includes("go_in_40");
  const go20Now = tags.includes("go_in_20");
  return {
    entry_go_40_reached: boolish(previous.entry_go_40_reached) || go40Now,
    entry_go_40_reached_at: text(previous.entry_go_40_reached_at) || (go40Now ? eventTimeIso : ""),
    entry_go_40_time_till: previous.entry_go_40_time_till !== undefined
      ? finiteIntOrNull(previous.entry_go_40_time_till)
      : (go40Now ? finiteIntOrNull(vars?.go_in_mins) : null),
    entry_go_20_reached: boolish(previous.entry_go_20_reached) || go20Now,
    entry_go_20_reached_at: text(previous.entry_go_20_reached_at) || (go20Now ? eventTimeIso : ""),
    entry_go_20_time_till: previous.entry_go_20_time_till !== undefined
      ? finiteIntOrNull(previous.entry_go_20_time_till)
      : (go20Now ? finiteIntOrNull(vars?.go_in_mins) : null)
  };
}

function buildClassAlertEvents(row, vars, alertState, eventTimeIso) {
  const events = [];
  const showNo = intValue(row.show_no);
  const focusDay = text(row.focus_day || row.iso_date);
  const classNo = intValue(row.class_no);
  const sourceKey = text(row.class_const_key || row.class_start_key);
  const subject = text(row.class_name) || `Class ${classNo}`;

  if (alertState.class_start_60_reached) {
    events.push({
      alert_key: `${showNo}|${focusDay}|${classNo}|class_start_60`,
      trigger_identity: "class_start_60",
      alert_type: "class_start_60",
      alert_lane: "class_start_times",
      event_time_iso: text(alertState.class_start_60_reached_at) || eventTimeIso,
      show_no: showNo,
      focus_day: focusDay,
      level: "class",
      class_no: classNo,
      entry_no: 0,
      class_const_key: sourceKey,
      entry_const_key: "",
      source_table: TABLES.classStartTimes,
      source_key: sourceKey,
      trigger_minutes: 60,
      time_till: alertState.class_start_60_time_till,
      target_time: `${focusDay} ${text(row.class_start_time)}`,
      alert_subject: subject,
      message: `${text(row.display_time || row.class_start_time)} ${subject}`.trim()
    });
  }

  if (alertState.class_start_30_reached) {
    events.push({
      alert_key: `${showNo}|${focusDay}|${classNo}|class_start_30`,
      trigger_identity: "class_start_30",
      alert_type: "class_start_30",
      alert_lane: "class_start_times",
      event_time_iso: text(alertState.class_start_30_reached_at) || eventTimeIso,
      show_no: showNo,
      focus_day: focusDay,
      level: "class",
      class_no: classNo,
      entry_no: 0,
      class_const_key: sourceKey,
      entry_const_key: "",
      source_table: TABLES.classStartTimes,
      source_key: sourceKey,
      trigger_minutes: 30,
      time_till: alertState.class_start_30_time_till,
      target_time: `${focusDay} ${text(row.class_start_time)}`,
      alert_subject: subject,
      message: `${text(row.display_time || row.class_start_time)} ${subject}`.trim()
    });
  }

  if (alertState.class_live_active && intValue(alertState.class_live_sequence) > 0) {
    const sequence = intValue(alertState.class_live_sequence);
    events.push({
      alert_key: `${showNo}|${focusDay}|${classNo}|class_live|${sequence}`,
      trigger_identity: `class_live|${sequence}`,
      alert_type: "class_live",
      alert_lane: "class_start_times",
      event_time_iso: text(alertState.class_live_started_at) || eventTimeIso,
      show_no: showNo,
      focus_day: focusDay,
      level: "class",
      class_no: classNo,
      entry_no: 0,
      class_const_key: sourceKey,
      entry_const_key: "",
      source_table: TABLES.classStartTimes,
      source_key: sourceKey,
      trigger_minutes: null,
      time_till: null,
      target_time: text(alertState.class_live_started_at) || eventTimeIso,
      alert_subject: subject,
      message: `${subject} is live${text(row.ring_name_normalized) ? ` in ${text(row.ring_name_normalized)}` : ""}.`
    });
  }

  return events;
}

function buildRingAlertEvents(row, alertState, eventTimeIso) {
  const showNo = intValue(row.show_no);
  const focusDay = text(row.focus_day || row.iso_date);
  const ringNo = intValue(row.ring_no);
  const sourceKey = text(row.ring_const_key || row.ring_status_key);
  const subject = text(row.ring_name_normalized || row.ring_name) || `Ring ${ringNo}`;
  const base = {
    alert_lane: "ring_status",
    show_no: showNo,
    focus_day: focusDay,
    level: "ring",
    ring_no: ringNo,
    class_no: intValue(alertState.current_class_no),
    entry_no: 0,
    ring_const_key: sourceKey,
    class_const_key: "",
    entry_const_key: "",
    source_table: TABLES.ringStatus,
    source_key: sourceKey,
    alert_subject: subject
  };
  const events = [];
  if (intValue(alertState.ring_class_change_sequence) > 0) events.push({
    ...base,
    alert_key: `${showNo}|${focusDay}|${ringNo}|ring_class_change|${intValue(alertState.ring_class_change_sequence)}`,
    trigger_identity: `ring_class_change|${intValue(alertState.ring_class_change_sequence)}`,
    alert_type: "ring_class_change",
    event_time_iso: text(alertState.ring_class_changed_at) || eventTimeIso,
    previous_class_no: intValue(alertState.previous_class_no),
    current_class_no: intValue(alertState.current_class_no),
    message: `${subject} changed from class ${intValue(alertState.previous_class_no)} to ${intValue(alertState.current_class_no)}.`
  });
  for (const threshold of [15, 30]) {
    if (!boolish(alertState[`ring_late_${threshold}_reached`])) continue;
    events.push({
      ...base,
      alert_key: `${showNo}|${focusDay}|${ringNo}|ring_late_${threshold}`,
      trigger_identity: `ring_late_${threshold}`,
      alert_type: `ring_late_${threshold}`,
      event_time_iso: text(alertState[`ring_late_${threshold}_reached_at`]) || eventTimeIso,
      trigger_minutes: threshold,
      message: `${subject} is at least ${threshold} minutes late.`
    });
  }
  return events;
}

function buildEntryAlertEvents(row, vars, alertState, eventTimeIso) {
  if (!alertState.entry_go_40_reached && !alertState.entry_go_20_reached) return [];
  const showNo = intValue(row.show_no);
  const focusDay = text(row.focus_day || row.iso_date);
  const classNo = intValue(row.class_no);
  const entryNo = intValue(row.entry_no);
  const sourceKey = text(row.entry_const_key || row.entry_go_key);
  const subject = text(row.horse) || `Entry ${entryNo}`;
  const base = {
    alert_lane: "entry_go_times",
    show_no: showNo,
    focus_day: focusDay,
    level: "entry",
    class_no: classNo,
    entry_no: entryNo,
    class_const_key: text(row.class_const_key),
    entry_const_key: sourceKey,
    horse: text(row.horse),
    rider: text(row.rider),
    trainer: text(row.trainer),
    source_table: TABLES.entryGoTimes,
    source_key: sourceKey,
    target_time: `${focusDay} ${text(row.go_time || row.entry_go_time)}`,
    alert_subject: `${subject} (${entryNo})`
  };
  const events = [];
  if (alertState.entry_go_40_reached) {
    events.push({
      ...base,
      alert_key: `${showNo}|${focusDay}|${classNo}|${entryNo}|entry_go_40`,
      trigger_identity: "entry_go_40",
      alert_type: "entry_go_40",
      event_time_iso: text(alertState.entry_go_40_reached_at) || eventTimeIso,
      trigger_minutes: 40,
      time_till: alertState.entry_go_40_time_till,
      message: `${subject} entry ${entryNo} estimated go in about 40 minutes.`
    });
  }
  if (alertState.entry_go_20_reached) {
    events.push({
      ...base,
      alert_key: `${showNo}|${focusDay}|${classNo}|${entryNo}|entry_go_20`,
      trigger_identity: "entry_go_20",
      alert_type: "entry_go_20",
      event_time_iso: text(alertState.entry_go_20_reached_at) || eventTimeIso,
      trigger_minutes: 20,
      time_till: alertState.entry_go_20_time_till,
      message: `${subject} entry ${entryNo} estimated go in about 20 minutes.`
    });
  }
  return events;
}

function planAppendOnlyAlertEvents(events, existingRecords) {
  const existingKeys = new Set((existingRecords || [])
    .map((record) => text((record.fields || record).alert_key))
    .filter(Boolean));
  const sourceByKey = new Map();
  for (const event of events || []) {
    const key = text(event?.alert_key);
    if (key) sourceByKey.set(key, event);
  }
  return {
    creates: [...sourceByKey.values()].filter((event) => !existingKeys.has(text(event.alert_key))),
    existing: [...sourceByKey.keys()].filter((key) => existingKeys.has(key))
  };
}

function statusFromVars(row, vars, level) {
  const status = lowerText(row.class_status || row.entry_status || row.ring_status || row.status);
  if (status === "results" || status === "done" || status === "now") return status;
  if (row.is_live === true || lowerText(row.is_live) === "true" || lowerText(row.is_live) === "1") return "now";
  if (level === "class" && (vars.tags || []).length) return "soon";
  if (level === "entry" && (vars.tags || []).length) return "soon";
  return "today";
}

function buildFieldVarsForClass(classRow, entryRows, now = new Date()) {
  const classStart = parseDateTime(classRow.focus_day || classRow.iso_date, classRow.class_start_time || classRow.display_time);
  const paceSeconds = intValue(classRow.pace_seconds) || intValue(entryRows[0]?.pace_seconds) || 198;
  const entryCount = intValue(classRow.entry_count);
  const estimatedEnd = entryCount > 0 ? addSecondsToDate(classStart, entryCount * paceSeconds) : null;
  const startsInMins = minutesUntil(classStart, now);
  const endsInMins = minutesUntil(estimatedEnd, now);
  const tags = classAlertTags(startsInMins);
  const resultReady = Boolean(estimatedEnd && now.getTime() >= estimatedEnd.getTime());
  if (resultReady) tags.push("result_ready");
  const vars = {
    class_start_time: text(classRow.class_start_time),
    estimated_class_end_time: isoTime(estimatedEnd),
    starts_in_mins: startsInMins,
    ends_in_mins: endsInMins,
    pace_seconds: paceSeconds,
    entry_count: entryCount,
    n_gone: intValue(classRow.n_gone),
    n_to_go: intValue(classRow.n_to_go),
    is_live: classRow.is_live === true || lowerText(classRow.is_live) === "true" || lowerText(classRow.is_live) === "1",
    result_ready: resultReady,
    result_ready_at: estimatedEnd ? catalystDateTime(estimatedEnd) : "",
    result_ready_rule: "class_start_time + entry_count * pace_seconds",
    tags
  };
  return {
    ...vars,
    class_status: statusFromVars(classRow, vars, "class")
  };
}

function optionalResultReadyAt(value) {
  const resultReadyAt = text(value);
  return resultReadyAt ? { result_ready_at: resultReadyAt } : {};
}

function buildFieldVarsForEntry(entryRow, now = new Date()) {
  const goDate = parseDateTime(entryRow.focus_day || entryRow.iso_date, entryRow.go_time || entryRow.entry_go_time);
  const goInMins = minutesUntil(goDate, now);
  const tags = entryAlertTags(goInMins);
  const vars = {
    entry_go_time: text(entryRow.go_time || entryRow.entry_go_time),
    go_time: text(entryRow.go_time || entryRow.entry_go_time),
    go_in_mins: goInMins,
    pace_seconds: intValue(entryRow.pace_seconds),
    tags
  };
  return {
    ...vars,
    entry_status: statusFromVars(entryRow, vars, "entry")
  };
}

function compactRingClass(item) {
  if (!item) return null;
  const row = item.row || {};
  const vars = item.vars || {};
  return {
    class_const_key: text(row.class_const_key || row.class_start_key),
    class_no: intValue(row.class_no),
    class_number: text(row.class_number),
    class_name: text(row.class_name),
    class_start_time: text(row.class_start_time),
    estimated_class_end_time: text(vars.estimated_class_end_time),
    starts_in_mins: vars.starts_in_mins,
    ends_in_mins: vars.ends_in_mins,
    entry_count: intValue(vars.entry_count),
    n_gone: intValue(vars.n_gone),
    n_to_go: intValue(vars.n_to_go),
    status: text(vars.class_status)
  };
}

function buildRingFieldVars(ringRow, ringClasses) {
  const sorted = [...ringClasses].sort((a, b) => {
    const aStart = a.vars.starts_in_mins;
    const bStart = b.vars.starts_in_mins;
    if (aStart === null && bStart === null) return 0;
    if (aStart === null) return 1;
    if (bStart === null) return -1;
    return aStart - bStart;
  });
  const nowClass = sorted
    .filter((item) => item.vars.starts_in_mins !== null && item.vars.ends_in_mins !== null)
    .find((item) => item.vars.starts_in_mins <= 0 && item.vars.ends_in_mins >= 0) || null;
  const nextClass = sorted.find((item) => item.vars.starts_in_mins !== null && item.vars.starts_in_mins >= 0) || null;
  const sourceStatus = lowerText(ringRow.ring_status || ringRow.status || "ontime");
  const lateMins = intValue(ringRow.running_late_mins || ringRow.late_mins || ringRow.delay_mins);
  const ringAlertStatus = sourceStatus.includes("late") || lateMins > 0
    ? "late"
    : (!nowClass && !nextClass ? "check_gate" : "ontime");
  const paceSeconds = intValue(ringRow.pace_seconds)
    || intValue(nowClass?.vars?.pace_seconds)
    || intValue(nextClass?.vars?.pace_seconds)
    || 198;
  const tags = [];
  if (ringAlertStatus === "late") tags.push("ring_late");
  if (ringAlertStatus === "check_gate") tags.push("ring_check_gate");
  return {
    ring_status: sourceStatus === "active" ? "ontime" : (sourceStatus || "ontime"),
    ring_alert_status: ringAlertStatus,
    running_late_mins: lateMins,
    pace_seconds: paceSeconds,
    now_class: compactRingClass(nowClass),
    next_class: compactRingClass(nextClass),
    starts_in_mins: nextClass?.vars?.starts_in_mins ?? null,
    ends_in_mins: nowClass?.vars?.ends_in_mins ?? null,
    tags
  };
}

function outputDateText(focusDay) {
  const date = new Date(`${text(focusDay)}T12:00:00-04:00`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York"
  }).format(date);
}

function byNumberThenText(a, b, numberField, textField) {
  const an = intValue(a[numberField]);
  const bn = intValue(b[numberField]);
  if (an !== bn) return an - bn;
  return text(a[textField]).localeCompare(text(b[textField]));
}

function normalizeHorseLookupKey(value) {
  return text(value)
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addHorseDisplayAlias(map, raw, display) {
  const key = normalizeHorseLookupKey(raw);
  const value = text(display);
  if (key && value) map.set(key, value);
}

function horseDisplayFromHelperFields(fields = {}) {
  return text(fields.barn_name || fields.horse_display || fields.horse_name || fields.horse);
}

function addHorseDisplayRow(map, row = {}) {
  const display = horseDisplayFromHelperFields(row);
  if (!display) return;
  for (const value of [row.horse, row.horse_name, row.horse_display, row.barn_name]) {
    addHorseDisplayAlias(map, value, display);
  }
  for (const alias of text(row.horse_aka || row.aka).split(/[,\n|;]/).map(text).filter(Boolean)) {
    addHorseDisplayAlias(map, alias, display);
  }
}

async function loadHorseDisplayMap(app) {
  const map = new Map();
  try {
    const catalystRows = await zcqlRows(app, TABLES.horses, `SELECT * FROM ${TABLES.horses} LIMIT 300`);
    for (const row of catalystRows) addHorseDisplayRow(map, row);
  } catch {
    // Output can still render from runtime rows if helper rows are unavailable.
  }
  try {
    const airtableRows = await getAirtableRecords(TABLES.horses, { pageSize: "100" });
    for (const record of airtableRows) addHorseDisplayRow(map, record.fields || {});
  } catch {
    // Airtable helper corrections are best-effort at render time.
  }
  return map;
}

function displayHorseForEntry(entry = {}, horseDisplayMap = new Map()) {
  for (const value of [entry.horse, entry.horse_name, entry.horse_display, entry.barn_name]) {
    const mapped = horseDisplayMap.get(normalizeHorseLookupKey(value));
    if (mapped) return mapped;
  }
  return text(entry.barn_name || entry.horse_display || entry.horse);
}

async function buildMobileProPayload(app, options = {}) {
  const focus = await getActiveFocusShow();
  if (!focus?.show_no) throw new Error("focus_show.show_no_required");
  if (!focus?.focus_day) throw new Error("focus_show.focus_day_required");

  const now = options.now ? new Date(options.now) : new Date();
  const horseDisplayMap = await loadHorseDisplayMap(app);
  const ringRows = await readCurrentRows(app, TABLES.ringStatus, focus.show_no, focus.focus_day, "focus_day_only");
  const classRows = await readCurrentRows(app, TABLES.classStartTimes, focus.show_no, focus.focus_day, "focus_day_only");
  const entryRows = await readCurrentRows(app, TABLES.entryGoTimes, focus.show_no, focus.focus_day, "focus_day_only");

  const entriesByClass = new Map();
  for (const row of entryRows) {
    const key = text(row.class_const_key);
    if (!key) continue;
    if (!entriesByClass.has(key)) entriesByClass.set(key, []);
    entriesByClass.get(key).push(row);
  }
  for (const rows of entriesByClass.values()) {
    rows.sort((a, b) => byNumberThenText(a, b, "entry_order", "horse"));
  }

  const classesByRing = new Map();
  const classes = classRows
    .filter((row) => text(row.status) !== "dropped_old_key_shape")
    .sort((a, b) => text(a.class_start_time).localeCompare(text(b.class_start_time)) || byNumberThenText(a, b, "class_no", "class_name"))
    .map((row) => {
      const classEntries = entriesByClass.get(text(row.class_const_key)) || [];
      const fieldVars = buildFieldVarsForClass(row, classEntries, now);
      const payload = {
        class_const_key: text(row.class_const_key || row.class_start_key),
        ring_const_key: text(row.ring_const_key),
        ring_day_no: intValue(row.ring_day_no),
        ring_no: intValue(row.ring_no),
        ring_name: text(row.ring_name),
        ring_name_normalized: text(row.ring_name_normalized),
        class_no: intValue(row.class_no),
        class_number: text(row.class_number),
        class_name: text(row.class_name),
        class_start_time: text(row.class_start_time),
        display_time: text(row.display_time),
        entry_count: intValue(row.entry_count),
        field_vars: fieldVars,
        tags: fieldVars.tags,
        status: fieldVars.class_status,
        entries: classEntries.map((entry) => {
          const entryVars = buildFieldVarsForEntry(entry, now);
          return {
            entry_const_key: text(entry.entry_const_key || entry.entry_go_key),
            class_const_key: text(entry.class_const_key),
            entry_no: intValue(entry.entry_no),
            entry_order: intValue(entry.entry_order),
            barn_name: displayHorseForEntry(entry, horseDisplayMap),
            horse: text(entry.horse),
            rider: text(entry.rider),
            trainer: text(entry.trainer),
            go_time: text(entry.go_time),
            field_vars: entryVars,
            tags: entryVars.tags,
            status: entryVars.entry_status
          };
        })
      };
      const ringKey = payload.ring_const_key || `${payload.ring_day_no}|${payload.ring_no}`;
      if (!classesByRing.has(ringKey)) classesByRing.set(ringKey, []);
      classesByRing.get(ringKey).push(payload);
      return payload;
    });

  const rings = ringRows
    .filter((row) => text(row.status) !== "dropped_old_key_shape")
    .sort((a, b) => byNumberThenText(a, b, "ring_no", "ring_name_normalized"))
    .map((row) => {
      const ringKey = text(row.ring_const_key || row.ring_status_key);
      const ringClasses = classesByRing.get(ringKey) || [];
      const nowClass = ringClasses.find((item) => item.status === "now") || null;
      const nextClass = ringClasses.find((item) => item.field_vars.starts_in_mins !== null && item.field_vars.starts_in_mins >= 0) || null;
      return {
        ring_const_key: ringKey,
        ring_day_const_key: text(row.ring_day_const_key),
        ring_day_no: intValue(row.ring_day_no),
        ring_no: intValue(row.ring_no),
        ring_name: text(row.ring_name),
        ring_name_normalized: text(row.ring_name_normalized),
        ring_status: text(row.ring_status || row.status || "ontime") === "active" ? "ontime" : text(row.ring_status || row.status || "ontime"),
        now: nowClass,
        next: nextClass,
        classes: ringClasses
      };
    });

  return {
    ok: true,
    mode: "wec-mobile-pro-live",
    source: "clean_runtime_tables",
    show_no: intValue(focus.show_no),
    focus_day: text(focus.focus_day),
    iso_date: text(focus.iso_date || focus.focus_day),
    focus_day_key: compactDate(focus.focus_day),
    date_text: outputDateText(focus.focus_day),
    generated_at: now.toISOString(),
    field_vars_version: "clean_runtime_v1",
    counts: {
      rings: rings.length,
      classes: classes.length,
      entries: entryRows.length
    },
    pages: {
      orderwise: classes,
      schedule_by_ring_time: rings,
      schedule_by_time: classes,
      entry_nextups: classes.flatMap((item) => item.entries).sort((a, b) => intValue(a.field_vars.go_in_mins) - intValue(b.field_vars.go_in_mins)),
      ring_now_nexts: rings.map((ring) => ({
        ring_const_key: ring.ring_const_key,
        ring_name_normalized: ring.ring_name_normalized,
        ring_status: ring.ring_status,
        now: ring.now,
        next: ring.next
      })),
      alerts_lists_feed: classes.flatMap((item) => [
        ...item.tags.map((tag) => ({ type: tag, class_const_key: item.class_const_key, class_no: item.class_no })),
        ...item.entries.flatMap((entry) => entry.tags.map((tag) => ({
          type: tag,
          class_const_key: item.class_const_key,
          entry_const_key: entry.entry_const_key,
          entry_no: entry.entry_no
        })))
      ])
    },
    rings,
    classes,
    output_run: true,
    workflow_run: false,
    live_run: false,
    alerts_run: false
  };
}

function compactJson(value) {
  return JSON.stringify(value || {});
}

function textForAirtable(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(",");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function airtableTimeEngineFields(row, keyField) {
  const fields = {};
  for (const field of keyField === "time_engine_log_key" ? TIME_ENGINE_LOG_FIELDS : TIME_ENGINE_FIELDS) {
    fields[field] = textForAirtable(row[field]);
  }
  return fields;
}

function airtableTimeEngineTriggerFields(row) {
  const fields = {};
  for (const field of AIRTABLE_TIME_ENGINE_TRIGGER_FIELDS) {
    const value = row[field];
    if (value === null || value === undefined || text(value) === "") continue;
    fields[field] = textForAirtable(value);
  }
  return fields;
}

function planAppendOnlyTimeEngineTriggers(triggerRows, existingRecords) {
  const existingKeys = new Set((existingRecords || []).map((record) => text(record?.fields?.trigger_key)).filter(Boolean));
  const plannedKeys = new Set();
  const creates = [];
  for (const trigger of triggerRows || []) {
    const key = text(trigger?.trigger_key);
    if (!key || existingKeys.has(key) || plannedKeys.has(key)) continue;
    plannedKeys.add(key);
    creates.push(trigger);
  }
  return { creates, existing: [...existingKeys] };
}

function approvedTimeEngineTriggers(triggerRows) {
  return (triggerRows || []).filter((trigger) => APPROVED_TRIGGER_TYPES.has(text(trigger?.trigger_type)));
}

async function appendAirtableTimeEngineTriggers(focus, triggerRows) {
  if (!(triggerRows || []).length) {
    return { candidates: 0, created: 0, existing: 0, created_keys: [], existing_keys: [] };
  }
  const existingRecords = await getAirtableRecords(TABLES.timeEngineTriggers, {
    filterByFormula: `AND({show_no}='${airtableFormulaValue(focus.show_no)}',{focus_day}='${airtableFormulaValue(focus.focus_day)}')`,
    pageSize: "100"
  });
  const plan = planAppendOnlyTimeEngineTriggers(triggerRows, existingRecords);
  const createdKeys = [];
  for (let index = 0; index < plan.creates.length; index += 10) {
    const chunk = plan.creates.slice(index, index + 10);
    const result = await airtableRequest(TABLES.timeEngineTriggers, {}, "POST", {
      records: chunk.map((trigger) => ({ fields: airtableTimeEngineTriggerFields(trigger) })),
      typecast: true
    });
    createdKeys.push(...(result.records || []).map((record) => text(record.fields?.trigger_key)).filter(Boolean));
  }
  return {
    candidates: triggerRows.length,
    created: createdKeys.length,
    existing: plan.existing.length,
    created_keys: createdKeys,
    existing_keys: plan.existing
  };
}

function timeEngineKey(parts) {
  return parts.map(text).filter(Boolean).join("|");
}

function buildTimeEngineTrigger(row, triggerType, runId, generatedAt, payload = {}) {
  const triggerIdentity = text(payload.trigger_identity || triggerType);
  const triggerKey = timeEngineKey([
    row.show_no,
    compactDate(row.focus_day),
    row.level,
    row.source_key || row.class_const_key || row.entry_const_key || row.ring_const_key,
    triggerIdentity
  ]);
  return {
    trigger_key: triggerKey,
    run_id: runId,
    show_no: intValue(row.show_no),
    focus_day: text(row.focus_day),
    focus_day_key: compactDate(row.focus_day),
    level: text(row.level),
    trigger_type: text(triggerType),
    status: "pending",
    source_table: text(row.source_table),
    source_key: text(row.source_key),
    ring_const_key: text(row.ring_const_key),
    class_const_key: text(row.class_const_key),
    entry_const_key: text(row.entry_const_key),
    ring_no: nullablePositiveInt(row.ring_no || payload.ring_no),
    class_no: nullablePositiveInt(row.class_no || payload.class_no || payload.current_class_no),
    entry_no: nullablePositiveInt(row.entry_no || payload.entry_no),
    horse: text(row.horse || payload.horse),
    rider: text(row.rider || payload.rider),
    trainer: text(row.trainer || payload.trainer),
    followed_class: payload.followed_class === true,
    tracked_entry_count: nullablePositiveInt(payload.tracked_entry_count),
    snapshot_id: text(payload.snapshot_id),
    snapshot_source: text(payload.snapshot_source),
    as_of_time: text(payload.as_of_time),
    row_count: nullablePositiveInt(payload.row_count),
    estimated_pace_now: nullablePositiveInt(row.pace_seconds || payload.estimated_pace_now),
    starts_in: nullablePositiveInt(row.starts_in_mins || payload.starts_in),
    ends_in: nullablePositiveInt(row.ends_in_mins || payload.ends_in),
    entry_order_now: nullablePositiveInt(payload.entry_order_now),
    entries_ahead: nullablePositiveInt(payload.entries_ahead),
    entry_go_time_now: text(row.entry_go_time || payload.entry_go_time_now),
    go_in: nullablePositiveInt(row.go_in_mins || payload.go_in),
    class_status: text(row.status || payload.class_status),
    tags: text(row.tags || payload.tags),
    trigger_time: generatedAt,
    generated_at: generatedAt,
    payload_json: compactJson(payload)
  };
}

function pushAlertEventTriggers(triggers, engineRow, events, runId, generatedAt, extraPayload = {}) {
  for (const event of events || []) {
    triggers.push(buildTimeEngineTrigger(engineRow, event.alert_type, runId, generatedAt, {
      ...event,
      ...extraPayload,
      alert_event: true
    }));
  }
}

function alertEventFromTrigger(trigger) {
  const payload = parseJsonObject(trigger?.payload_json);
  return payload.alert_event === true && text(payload.alert_key) ? payload : null;
}

function airtableAlertEventFields(event) {
  return cleanAirtableLogFields({
    alert_key_run: `${text(event.alert_key)}|${text(event.event_time_iso)}`,
    alert_key: text(event.alert_key),
    severity: "info",
    alert_type: text(event.alert_type),
    alert_type_select: text(event.alert_type),
    created_at: text(event.event_time_iso),
    status: "open",
    show_no: intValue(event.show_no),
    focus_day: text(event.focus_day),
    message: text(event.message),
    payload_json: compactJson(event),
    alert_lane: text(event.alert_lane),
    trigger_minutes: event.trigger_minutes,
    time_till: event.time_till,
    target_time: text(event.target_time),
    alert_subject: text(event.alert_subject),
    source_table: text(event.source_table)
  });
}

async function appendAirtableAlertEvents(focus, triggerRows) {
  const events = (triggerRows || []).map(alertEventFromTrigger).filter(Boolean);
  if (!events.length) {
    return { candidates: 0, created: 0, existing: 0, created_keys: [], existing_keys: [] };
  }
  const existingRecords = await getAirtableRecords(AIRTABLE_ALERTS_TABLE, {
    filterByFormula: `AND({show_no}=${Number(focus.show_no)},DATETIME_FORMAT({focus_day}, 'YYYY-MM-DD')='${airtableFormulaValue(focus.focus_day)}')`,
    pageSize: "100"
  });
  const plan = planAppendOnlyAlertEvents(events, existingRecords);
  const createdKeys = [];
  for (let index = 0; index < plan.creates.length; index += 10) {
    const chunk = plan.creates.slice(index, index + 10);
    const result = await airtableRequest(AIRTABLE_ALERTS_TABLE, {}, "POST", {
      records: chunk.map((event) => ({ fields: airtableAlertEventFields(event) })),
      typecast: true
    });
    createdKeys.push(...(result.records || []).map((record) => text(record.fields?.alert_key)).filter(Boolean));
  }
  return {
    candidates: events.length,
    created: createdKeys.length,
    existing: plan.existing.length,
    created_keys: createdKeys,
    existing_keys: plan.existing
  };
}

async function insertNewTimeEngineTriggers(app, schema, triggerRows, missingContractFields) {
  const inserted = [];
  const existing = [];
  const table = app.datastore().table(TABLES.timeEngineTriggers);
  for (const trigger of triggerRows) {
    const prior = await zcqlSingle(
      app,
      TABLES.timeEngineTriggers,
      `SELECT ROWID, trigger_key, status FROM ${TABLES.timeEngineTriggers} WHERE trigger_key = ${zcqlValue(trigger.trigger_key)} LIMIT 1`
    );
    if (prior?.ROWID) {
      existing.push(trigger.trigger_key);
      continue;
    }
    const catalystTrigger = helperEndpointFields(trigger, TIME_ENGINE_TRIGGER_FIELDS);
    inserted.push(await table.insertRow(filterToSchema(schema, TABLES.timeEngineTriggers, catalystTrigger, missingContractFields)));
  }
  return { inserted: inserted.length, existing: existing.length };
}

function statewiseSnapshotId(focus, snapshotSource, asOfDate = new Date()) {
  const bucket = new Date(asOfDate);
  bucket.setUTCSeconds(0, 0);
  const bucketMinute = Math.floor(bucket.getUTCMinutes() / 12) * 12;
  bucket.setUTCMinutes(bucketMinute);
  const stamp = bucket.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").slice(0, 13);
  return [focus.show_no, compactDate(focus.focus_day), snapshotSource, stamp].map(text).join("|");
}

function statewiseProjectionIdentity(row) {
  const entityIdentity = text(row.entry_const_key || row.class_const_key || row.ring_const_key || row.lookup_key);
  return [row.lane, row.lookup_type, row.lookup_key, row.state, entityIdentity].map(text).join("|");
}

function normalizedSignatureValue(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).sort();
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
  const asNumber = Number(value);
  if (text(value) !== "" && Number.isFinite(asNumber) && /^-?\d+(\.\d+)?$/.test(text(value))) return Math.round(asNumber);
  return text(value);
}

function catalystStatewisePreparedSignature(row) {
  const fields = [
    "lane", "lookup_type", "lookup_key", "state", "ring_const_key", "class_const_key",
    "entry_const_key", "ring_no", "class_no", "entry_no", "ring_name", "class_name",
    "horse", "rider", "trainer", "sort_order", "class_start_time", "entry_go_time_now",
    "entry_count_now", "n_gone_now", "n_to_go_now", "entries_ahead", "go_in",
    "starts_in", "ends_in", "estimated_pace_now", "tags"
  ];
  return compactJson(Object.fromEntries(fields.map((field) => [field, normalizedSignatureValue(row[field])])));
}

function statewiseRowKey(snapshotId, row) {
  return [snapshotId, row.lane, row.lookup_type, row.lookup_key, row.state, row.entry_const_key || row.class_const_key || row.ring_const_key || row.lookup_key]
    .map(text)
    .join("|");
}

function timeEnginePayload(row) {
  return parseJsonObject(row.payload_json);
}

function statewiseBaseRow(focus, snapshotId, snapshotSource, asOfTime, row) {
  const catalystAsOfTime = catalystDateTime(asOfTime);
  return {
    show_no: intValue(focus.show_no),
    focus_day: focus.focus_day,
    focus_day_key: compactDate(focus.focus_day),
    snapshot_id: snapshotId,
    snapshot_source: snapshotSource,
    as_of_time: catalystAsOfTime,
    mins_since_updated: 0,
    last_synced_at: catalystAsOfTime,
    ...row
  };
}

function buildStatewiseRowsFromTimeEngineRows(focus, timeEngineRows, options = {}) {
  const asOfDate = options.now ? new Date(options.now) : new Date();
  const asOfTime = asOfDate.toISOString();
  const snapshotSource = text(options.snapshot_source || "scheduled");
  const snapshotId = text(options.snapshot_id) || statewiseSnapshotId(focus, snapshotSource, asOfDate);
  const rows = [];
  for (const engineRow of (timeEngineRows || []).filter((row) => text(row.level) === "ring")) {
    const payload = timeEnginePayload(engineRow);
    const nowClass = payload.now_class || {};
    const nextClass = payload.next_class || {};
    const ringLookup = text(engineRow.ring_name_normalized || engineRow.ring_name_prioritized || engineRow.ring_no);
    if (nowClass.class_no) {
      rows.push(statewiseBaseRow(focus, snapshotId, snapshotSource, asOfTime, {
        lane: "ring", lookup_type: "ring", lookup_key: ringLookup, state: "now", sort_order: 1,
        ring_const_key: text(engineRow.ring_const_key), class_const_key: text(nowClass.class_const_key),
        ring_no: intValue(engineRow.ring_no), class_no: intValue(nowClass.class_no), entry_no: 0,
        ring_name: text(engineRow.ring_name_normalized), class_name: text(nowClass.class_name),
        class_start_time: text(nowClass.class_start_time), entry_count_now: intValue(nowClass.entry_count),
        n_gone_now: intValue(nowClass.n_gone), n_to_go_now: intValue(nowClass.n_to_go),
        ends_in: nullableEndpointInt(engineRow.ends_in_mins), estimated_pace_now: nullableEndpointInt(engineRow.pace_seconds),
        tags: text(engineRow.tags)
      }));
    }
    if (nextClass.class_no) {
      rows.push(statewiseBaseRow(focus, snapshotId, snapshotSource, asOfTime, {
        lane: "ring", lookup_type: "ring", lookup_key: ringLookup, state: "nextup", sort_order: 2,
        ring_const_key: text(engineRow.ring_const_key), class_const_key: text(nextClass.class_const_key),
        ring_no: intValue(engineRow.ring_no), class_no: intValue(nextClass.class_no), entry_no: 0,
        ring_name: text(engineRow.ring_name_normalized), class_name: text(nextClass.class_name),
        class_start_time: text(nextClass.class_start_time), entry_count_now: intValue(nextClass.entry_count),
        n_gone_now: intValue(nextClass.n_gone), n_to_go_now: intValue(nextClass.n_to_go),
        starts_in: nullableEndpointInt(engineRow.starts_in_mins), estimated_pace_now: nullableEndpointInt(engineRow.pace_seconds),
        tags: text(engineRow.tags)
      }));
    }
  }
  const nearestByPerson = new Map();
  for (const engineRow of (timeEngineRows || []).filter((row) => text(row.level) === "entry")) {
    const goIn = nullableEndpointInt(engineRow.go_in_mins);
    if (goIn === null || goIn < 0) continue;
    for (const [lookupType, lookupValue] of [["horse", engineRow.horse], ["rider", engineRow.rider]]) {
      const lookupKey = text(lookupValue);
      if (!lookupKey) continue;
      const key = `${lookupType}|${lookupKey.toLowerCase()}`;
      const existing = nearestByPerson.get(key);
      if (!existing || goIn < nullableEndpointInt(existing.go_in)) {
        nearestByPerson.set(key, statewiseBaseRow(focus, snapshotId, snapshotSource, asOfTime, {
          lane: "person", lookup_type: lookupType, lookup_key: lookupKey, state: "nextup", sort_order: 2,
          ring_const_key: text(engineRow.ring_const_key), class_const_key: text(engineRow.class_const_key),
          entry_const_key: text(engineRow.entry_const_key), ring_no: intValue(engineRow.ring_no),
          class_no: intValue(engineRow.class_no), entry_no: intValue(engineRow.entry_no),
          horse: text(engineRow.horse), rider: text(engineRow.rider), trainer: text(engineRow.trainer),
          class_start_time: text(engineRow.class_start_time), entry_go_time_now: text(engineRow.entry_go_time),
          entries_ahead: nullableEndpointInt(timeEnginePayload(engineRow).field_vars?.entries_ahead),
          go_in: goIn, estimated_pace_now: nullableEndpointInt(engineRow.pace_seconds), tags: text(engineRow.tags)
        }));
      }
    }
  }
  rows.push(...nearestByPerson.values());
  return rows.map((row) => ({
    ...row,
    statewise_now_key: statewiseRowKey(snapshotId, row),
    payload_json: compactJson({ signature: catalystStatewisePreparedSignature(row), projection_identity: statewiseProjectionIdentity(row) })
  }));
}

async function readLatestCompletedCatalystStatewiseGeneration(app, focus, excludeSnapshotId = "") {
  const receipts = await zcqlRows(
    app,
    TABLES.timeEngineTriggers,
    `SELECT * FROM ${TABLES.timeEngineTriggers} WHERE show_no = ${Number(focus.show_no)} AND focus_day = ${zcqlValue(focus.focus_day)} AND trigger_type = 'statewise_snapshot_due' ORDER BY generated_at DESC LIMIT 20`
  );
  for (const receipt of receipts) {
    const payload = parseJsonObject(receipt.payload_json);
    const snapshotId = text(receipt.snapshot_id || payload.snapshot_id);
    if (!snapshotId || snapshotId === excludeSnapshotId) continue;
    const rows = await zcqlRows(
      app,
      TABLES.statewiseNow,
      `SELECT * FROM ${TABLES.statewiseNow} WHERE show_no = ${Number(focus.show_no)} AND focus_day = ${zcqlValue(focus.focus_day)} AND snapshot_id = ${zcqlValue(snapshotId)} LIMIT 300`
    );
    if (rows.length === intValue(receipt.row_count || payload.row_count)) {
      return { snapshot_id: snapshotId, receipt, rows };
    }
  }
  return { snapshot_id: "", receipt: null, rows: [] };
}

function planAirtableStatewiseChangesFromCatalyst(newRows, previousRows) {
  const previousByIdentity = new Map((previousRows || []).map((row) => [statewiseProjectionIdentity(row), catalystStatewisePreparedSignature(row)]));
  const creates = [];
  const unchanged = [];
  for (const row of newRows || []) {
    const identity = statewiseProjectionIdentity(row);
    const signature = catalystStatewisePreparedSignature(row);
    if (previousByIdentity.get(identity) === signature) unchanged.push(row);
    else creates.push(row);
  }
  return { creates, unchanged };
}

function airtableStatewiseFields(row) {
  const source = cleanAirtableLogFields(Object.fromEntries(AIRTABLE_STATEWISE_NOW_FIELDS.map((field) => [field, row[field]])));
  if (source.as_of_time !== undefined) source.as_of_time = catalystDateTimeToUtcIso(source.as_of_time);
  return Object.fromEntries(AIRTABLE_STATEWISE_NOW_FIELDS.filter((field) => source[field] !== undefined).map((field) => [field, source[field]]));
}

async function readAirtableStatewiseKeysForGeneration(focus, snapshotId) {
  const records = await getAirtableRecords(TABLES.statewiseNow, {
    filterByFormula: `AND({show_no}=${Number(focus.show_no)},DATETIME_FORMAT({focus_day}, 'YYYY-MM-DD')='${airtableFormulaValue(focus.focus_day)}')`,
    pageSize: "100"
  });
  const counts = new Map();
  for (const record of records || []) {
    const key = text(record?.fields?.statewise_now_key);
    if (!key.startsWith(`${snapshotId}|`)) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

async function appendAirtableStatewiseChanges(focus, snapshotId, rows) {
  const existingCounts = await readAirtableStatewiseKeysForGeneration(focus, snapshotId);
  const missingRows = (rows || []).filter((row) => !existingCounts.has(text(row.statewise_now_key)));
  for (let index = 0; index < missingRows.length; index += 10) {
    const chunk = missingRows.slice(index, index + 10);
    await airtableRequest(TABLES.statewiseNow, {}, "POST", {
      records: chunk.map((row) => ({ fields: airtableStatewiseFields(row) })),
      typecast: true
    });
  }
  const verifiedCounts = await readAirtableStatewiseKeysForGeneration(focus, snapshotId);
  const plannedKeys = [...new Set((rows || []).map((row) => text(row.statewise_now_key)).filter(Boolean))];
  const missing = plannedKeys.filter((key) => !verifiedCounts.has(key));
  const duplicated = plannedKeys.filter((key) => verifiedCounts.get(key) !== 1);
  if (missing.length || duplicated.length) {
    throw new Error(`statewise_airtable_verify_failed:${compactJson({ missing, duplicated })}`);
  }
  return { planned: plannedKeys.length, created: missingRows.length, existing: plannedKeys.length - missingRows.length };
}

function statewiseCompletionTrigger(focus, snapshotId, snapshotSource, asOfTime, rowCount, previousSnapshotId, airtableResult, runId, generatedAt) {
  const catalystAsOfTime = catalystDateTime(asOfTime);
  return buildTimeEngineTrigger({
    show_no: intValue(focus.show_no),
    focus_day: focus.focus_day,
    level: "statewise",
    source_table: TABLES.statewiseNow,
    source_key: snapshotId
  }, "statewise_snapshot_due", runId, generatedAt, {
    trigger_identity: `statewise_snapshot_due|${snapshotId}`,
    snapshot_id: snapshotId,
    snapshot_source: snapshotSource,
    as_of_time: catalystAsOfTime,
    row_count: rowCount,
    previous_completed_snapshot_id: previousSnapshotId,
    airtable_changed_count: airtableResult.planned,
    airtable_created_count: airtableResult.created,
    airtable_existing_same_generation_count: airtableResult.existing
  });
}

async function produceStatewiseSnapshot(app, schema, focus, timeEngineRows, options = {}) {
  const snapshotSource = text(options.snapshot_source || "scheduled");
  if (!["scheduled", "manual_refresh", "sms_request"].includes(snapshotSource)) {
    throw new Error("statewise_now.invalid_snapshot_source");
  }
  const now = options.now ? new Date(options.now) : new Date();
  const asOfTime = now.toISOString();
  const snapshotId = text(options.snapshot_id) || statewiseSnapshotId(focus, snapshotSource, now);
  const generatedAt = catalystDateTime(now);
  const runId = text(options.run_id) || `statewise-${Date.now()}`;
  const priorReceipt = await zcqlSingle(
    app,
    TABLES.timeEngineTriggers,
    `SELECT * FROM ${TABLES.timeEngineTriggers} WHERE trigger_key = ${zcqlValue(timeEngineKey([focus.show_no, compactDate(focus.focus_day), "statewise", snapshotId, `statewise_snapshot_due|${snapshotId}`]))} LIMIT 1`
  );
  if (priorReceipt?.ROWID) {
    return { ok: true, status: "SKIPPED", reason: "statewise_snapshot_already_complete", snapshot_id: snapshotId, rows_written: 0, airtable_changed_count: 0 };
  }
  const missingRequired = missingRequiredColumns(schema, { [TABLES.statewiseNow]: STATEWISE_NOW_FIELDS });
  if (missingRequired.length) throw new Error(`missing_statewise_now_columns:${missingRequired.join(",")}`);
  const missingContractFields = options.missingContractFields || [];
  const rows = buildStatewiseRowsFromTimeEngineRows(focus, timeEngineRows, { snapshot_source: snapshotSource, snapshot_id: snapshotId, now });
  const catalystWrite = await upsertRowsByKey(app, schema, TABLES.statewiseNow, "statewise_now_key", rows, missingContractFields);
  const catalystRows = await zcqlRows(
    app,
    TABLES.statewiseNow,
    `SELECT * FROM ${TABLES.statewiseNow} WHERE show_no = ${Number(focus.show_no)} AND focus_day = ${zcqlValue(focus.focus_day)} AND snapshot_id = ${zcqlValue(snapshotId)} LIMIT 300`
  );
  if (catalystRows.length !== rows.length) {
    throw new Error(`statewise_catalyst_verify_failed:expected_${rows.length}_got_${catalystRows.length}`);
  }
  const previous = await readLatestCompletedCatalystStatewiseGeneration(app, focus, snapshotId);
  const changePlan = planAirtableStatewiseChangesFromCatalyst(rows, previous.rows);
  const airtableResult = await appendAirtableStatewiseChanges(focus, snapshotId, changePlan.creates);
  const receipt = statewiseCompletionTrigger(focus, snapshotId, snapshotSource, asOfTime, rows.length, previous.snapshot_id, airtableResult, runId, generatedAt);
  const receiptInsert = await insertNewTimeEngineTriggers(app, schema, [receipt], missingContractFields);
  return {
    ok: true,
    status: "PASS",
    snapshot_id: snapshotId,
    snapshot_source: snapshotSource,
    as_of_time: asOfTime,
    rows_written: rows.length,
    catalyst_write: catalystWrite,
    previous_completed_snapshot_id: previous.snapshot_id,
    airtable_changed_count: airtableResult.planned,
    airtable_created_count: airtableResult.created,
    airtable_existing_same_generation_count: airtableResult.existing,
    receipt_insert: receiptInsert
  };
}

async function buildTimeEngineRows(app, focus, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const generatedAt = catalystDateTime(now);
  const eventTimeIso = now.toISOString();
  const expiresAt = catalystDateTime(new Date(now.getTime() + 10 * 60000));
  const runId = options.run_id || `time-engine-${Date.now()}`;
  const endpoint = "mobile_pro|print|two_way|alerts";
  const ringRows = await readCurrentRows(app, TABLES.ringStatus, focus.show_no, focus.focus_day, "focus_day_only");
  const classRows = await readCurrentRows(app, TABLES.classStartTimes, focus.show_no, focus.focus_day, "focus_day_only");
  const entryRows = await readCurrentRows(app, TABLES.entryGoTimes, focus.show_no, focus.focus_day, "focus_day_only");
  const scheduleRows = await readCurrentRows(app, TABLES.updateSchedule, focus.show_no, focus.focus_day);
  const previousEngineRows = await readCurrentRows(app, TABLES.timeEngine, focus.show_no, focus.focus_day, "focus_day_only");
  const previousEngineByKey = new Map(previousEngineRows.map((row) => [text(row.time_engine_key), row]));

  const entriesByClass = new Map();
  const trackedClassKeys = new Set();
  const trackedClassNos = new Set();
  for (const row of entryRows) {
    const key = text(row.class_const_key);
    const classNo = intValue(row.class_no);
    if (key) trackedClassKeys.add(key);
    if (classNo) trackedClassNos.add(classNo);
    if (!key) continue;
    if (!entriesByClass.has(key)) entriesByClass.set(key, []);
    entriesByClass.get(key).push(row);
  }

  const classVarsByKey = new Map();
  const classesByRing = new Map();
  for (const row of classRows.filter((item) => text(item.status) !== "dropped_old_key_shape")) {
    const entryScope = entriesByClass.get(text(row.class_const_key)) || [];
    const vars = buildFieldVarsForClass(row, entryScope, now);
    const classKey = text(row.class_const_key || row.class_start_key);
    classVarsByKey.set(classKey, vars);
    const ringKey = text(row.ring_const_key);
    if (!classesByRing.has(ringKey)) classesByRing.set(ringKey, []);
    classesByRing.get(ringKey).push({ row, vars });
  }

  const rows = [];
  const triggers = [];
  for (const row of ringRows.filter((item) => text(item.status) !== "dropped_old_key_shape")) {
    const ringKey = text(row.ring_const_key || row.ring_status_key);
    const ringVars = buildRingFieldVars(row, classesByRing.get(ringKey) || []);
    const timeEngineKeyValue = timeEngineKey([focus.show_no, compactDate(focus.focus_day), "ring", row.ring_const_key || row.ring_status_key]);
    const alertState = nextRingAlertState(previousEngineByKey.get(timeEngineKeyValue), row, ringVars, eventTimeIso);
    const ringEvents = buildRingAlertEvents(row, alertState, eventTimeIso);
    const ringEngineRow = {
      time_engine_key: timeEngineKeyValue,
      run_id: runId,
      show_no: intValue(focus.show_no),
      focus_day: focus.focus_day,
      iso_date: focus.focus_day,
      focus_day_key: compactDate(focus.focus_day),
      level: "ring",
      endpoint,
      source_table: TABLES.ringStatus,
      source_key: text(row.ring_status_key || row.ring_const_key),
      ring_const_key: text(row.ring_const_key || row.ring_status_key),
      class_const_key: "",
      entry_const_key: "",
      ring_name_normalized: text(row.ring_name_normalized),
      ring_name_prioritized: text(row.ring_name_prioritized),
      ring_no: intValue(row.ring_no),
      class_no: 0,
      entry_no: 0,
      entry_order: 0,
      class_start_time: text(ringVars.next_class?.class_start_time || ringVars.now_class?.class_start_time),
      estimated_class_end_time: text(ringVars.now_class?.estimated_class_end_time),
      entry_go_time: "",
      starts_in_mins: ringVars.starts_in_mins,
      ends_in_mins: ringVars.ends_in_mins,
      go_in_mins: null,
      pace_seconds: intValue(ringVars.pace_seconds),
      tags: (ringVars.tags || []).join(","),
      status: text(ringVars.ring_alert_status),
      trigger_ready: ringEvents.length > 0,
      generated_at: generatedAt,
      expires_at: expiresAt,
      payload_json: compactJson({
        ring_status: ringVars.ring_status,
        ring_alert_status: ringVars.ring_alert_status,
        running_late_mins: ringVars.running_late_mins,
        now_class: ringVars.now_class,
        next_class: ringVars.next_class,
        alert_state: alertState
      }),
      last_synced_at: generatedAt
    };
    rows.push(ringEngineRow);
    pushAlertEventTriggers(
      triggers,
      ringEngineRow,
      ringEvents,
      runId,
      generatedAt
    );
  }

  for (const row of classRows.filter((item) => text(item.status) !== "dropped_old_key_shape")) {
    const vars = classVarsByKey.get(text(row.class_const_key || row.class_start_key))
      || buildFieldVarsForClass(row, entriesByClass.get(text(row.class_const_key)) || [], now);
    const followedClass = trackedClassKeys.has(text(row.class_const_key || row.class_start_key))
      || trackedClassNos.has(intValue(row.class_no));
    const trackedEntryCount = (entriesByClass.get(text(row.class_const_key || row.class_start_key)) || []).length;
    const timeEngineKeyValue = timeEngineKey([focus.show_no, compactDate(focus.focus_day), "class", row.class_const_key || row.class_start_key]);
    const alertState = nextClassAlertState(previousEngineByKey.get(timeEngineKeyValue), vars, eventTimeIso);
    const classEngineRow = {
      time_engine_key: timeEngineKeyValue,
      run_id: runId,
      show_no: intValue(focus.show_no),
      focus_day: focus.focus_day,
      iso_date: focus.focus_day,
      focus_day_key: compactDate(focus.focus_day),
      level: "class",
      endpoint,
      source_table: TABLES.classStartTimes,
      source_key: text(row.class_start_key || row.class_const_key),
      ring_const_key: text(row.ring_const_key),
      class_const_key: text(row.class_const_key || row.class_start_key),
      entry_const_key: "",
      ring_name_normalized: text(row.ring_name_normalized),
      ring_name_prioritized: text(row.ring_name_prioritized),
      ring_no: intValue(row.ring_no),
      class_no: intValue(row.class_no),
      entry_no: 0,
      entry_order: 0,
      class_start_time: text(row.class_start_time),
      estimated_class_end_time: text(vars.estimated_class_end_time),
      entry_go_time: "",
      starts_in_mins: vars.starts_in_mins,
      ends_in_mins: vars.ends_in_mins,
      go_in_mins: null,
      pace_seconds: intValue(vars.pace_seconds),
      tags: (vars.tags || []).join(","),
      status: text(vars.class_status),
      trigger_ready: (vars.tags || []).length > 0,
      result_ready: vars.result_ready === true,
      ...optionalResultReadyAt(vars.result_ready_at),
      result_ready_rule: text(vars.result_ready_rule),
      generated_at: generatedAt,
      expires_at: expiresAt,
      payload_json: compactJson({
        class_no: intValue(row.class_no),
        class_name: row.class_name,
        class_start_time: row.class_start_time,
        followed_class: followedClass,
        tracked_entry_count: trackedEntryCount,
        field_vars: vars,
        alert_state: alertState
      }),
      last_synced_at: generatedAt
    };
    rows.push(classEngineRow);
    if (followedClass) {
      pushAlertEventTriggers(
        triggers,
        classEngineRow,
        buildClassAlertEvents(row, vars, alertState, eventTimeIso),
        runId,
        generatedAt,
        { followed_class: true, tracked_entry_count: trackedEntryCount }
      );
    }
    if (followedClass && vars.result_ready === true) {
      triggers.push(buildTimeEngineTrigger(classEngineRow, "result_ready", runId, generatedAt, {
        meaning: "safe_to_start_checking_results",
        result_ready: true,
        result_exists_claim: false,
        result_ready_rule: vars.result_ready_rule,
        result_ready_at: vars.result_ready_at,
        class_no: intValue(row.class_no),
        entry_count: intValue(vars.entry_count),
        followed_class: true,
        tracked_entry_count: trackedEntryCount
      }));
    }
  }

  for (const row of entryRows.filter((item) => text(item.status) !== "dropped_old_key_shape")) {
    const vars = buildFieldVarsForEntry(row, now);
    const timeEngineKeyValue = timeEngineKey([focus.show_no, compactDate(focus.focus_day), "entry", row.entry_const_key || row.entry_go_key]);
    const alertState = nextEntryAlertState(previousEngineByKey.get(timeEngineKeyValue), vars, eventTimeIso);
    const entryEngineRow = {
      time_engine_key: timeEngineKeyValue,
      run_id: runId,
      show_no: intValue(focus.show_no),
      focus_day: focus.focus_day,
      iso_date: focus.focus_day,
      focus_day_key: compactDate(focus.focus_day),
      level: "entry",
      endpoint,
      source_table: TABLES.entryGoTimes,
      source_key: text(row.entry_go_key || row.entry_const_key),
      ring_const_key: text(row.ring_const_key),
      class_const_key: text(row.class_const_key),
      entry_const_key: text(row.entry_const_key || row.entry_go_key),
      ring_name_normalized: text(row.ring_name_normalized),
      ring_name_prioritized: text(row.ring_name_prioritized),
      ring_no: intValue(row.ring_no),
      class_no: intValue(row.class_no),
      entry_no: intValue(row.entry_no),
      horse: text(row.horse),
      rider: text(row.rider),
      trainer: text(row.trainer),
      entry_order: intValue(row.entry_order),
      class_start_time: text(row.class_start_time),
      estimated_class_end_time: "",
      entry_go_time: text(vars.entry_go_time),
      starts_in_mins: null,
      ends_in_mins: null,
      go_in_mins: vars.go_in_mins,
      pace_seconds: intValue(vars.pace_seconds),
      tags: (vars.tags || []).join(","),
      status: text(vars.entry_status),
      trigger_ready: (vars.tags || []).length > 0,
      generated_at: generatedAt,
      expires_at: expiresAt,
      payload_json: compactJson({
        class_no: intValue(row.class_no),
        entry_no: intValue(row.entry_no),
        horse: row.horse,
        rider: row.rider,
        trainer: row.trainer,
        field_vars: vars,
        alert_state: alertState
      }),
      last_synced_at: generatedAt
    };
    rows.push(entryEngineRow);
    pushAlertEventTriggers(
      triggers,
      entryEngineRow,
      buildEntryAlertEvents(row, vars, alertState, eventTimeIso),
      runId,
      generatedAt
    );
  }

  return {
    run_id: runId,
    generated_at: generatedAt,
    expires_at: expiresAt,
    source_counts: {
      hs_ring_status: ringRows.length,
      hs_class_start_times: classRows.length,
      hs_entry_go_times: entryRows.length,
      hs_update_schedule: scheduleRows.length
    },
    rows,
    triggers: approvedTimeEngineTriggers(triggers)
  };
}

async function runTimeEngineOnly(app, options = {}) {
  const started = new Date();
  const focus = await getActiveFocusShow();
  if (!focus?.show_no) throw new Error("focus_show.show_no_required");
  if (!focus?.focus_day) throw new Error("focus_show.focus_day_required");
  const wakeReason = text(options.wake_reason || options.wakeReason || "state_wake") || "state_wake";
  const schema = await loadSchema(app);
  const missingContractFields = [];
  const missingRequired = missingRequiredColumns(schema, {
    [TABLES.timeEngine]: TIME_ENGINE_FIELDS,
    [TABLES.timeEngineTriggers]: TIME_ENGINE_TRIGGER_FIELDS,
    [TABLES.timeEngineLogs]: TIME_ENGINE_LOG_FIELDS
  });
  const gate = timeEngineWakeGate(focus, wakeReason, started);
  if (!gate.ok) {
    if (!missingRequired.length) {
      const finished = new Date();
      const runId = text(options.run_id) || `clean-proof-${Date.now()}`;
      const logRow = {
        time_engine_log_key: `${runId}|${compactDate(focus.focus_day)}`,
        run_id: runId,
        show_no: intValue(focus.show_no),
        focus_day: focus.focus_day,
        focus_day_key: compactDate(focus.focus_day),
        started_at: catalystDateTime(started),
        finished_at: catalystDateTime(finished),
        duration_ms: finished.getTime() - started.getTime(),
        status: "SKIPPED",
        source_counts: compactJson({}),
        rows_written: 0,
        trigger_ready_count: 0,
        endpoints: "mobile_pro|print|two_way|alerts",
        warning_count: 0,
        warning_summary: "",
        error_message: gate.reason,
        payload_json: compactJson({
          wake_reason: wakeReason,
          gate_reason: gate.reason,
          show_start_time: focus.show_start_time,
          show_end_time: focus.show_end_time
        }),
        last_synced_at: catalystDateTime(finished)
      };
      await upsertRowsByKey(app, schema, TABLES.timeEngineLogs, "time_engine_log_key", [logRow], missingContractFields);
    }
    return {
      ok: true,
      mode: "wec-time-engine",
      status: "SKIPPED",
      wake_reason: wakeReason,
      skip_reason: gate.reason,
      focus,
      workflow_run: false,
      live_run: false,
      alerts_run: false,
      output_publish_run: false
    };
  }
  if (missingRequired.length) {
    return {
      ok: false,
      mode: "wec-time-engine",
      focus,
      blocker: "missing_time_engine_columns",
      missing_required_columns: missingRequired,
      workflow_run: false,
      live_run: false,
      alerts_run: false,
      output_publish_run: false
    };
  }

  const built = await buildTimeEngineRows(app, focus, options);
  const requestedOffset = Math.max(0, intValue(options.offset));
  const requestedLimit = intValue(options.limit);
  const mirrorLimit = intValue(options.mirror_limit) || 300;
  const writeRows = requestedLimit > 0
    ? built.rows.slice(requestedOffset, requestedOffset + requestedLimit)
    : built.rows;
  const upsert = await upsertRowsByKeyFast(app, schema, TABLES.timeEngine, "time_engine_key", writeRows, missingContractFields);
  const triggerInsert = await insertNewTimeEngineTriggers(app, schema, built.triggers || [], missingContractFields);
  const airtableTriggerEvents = await appendAirtableTimeEngineTriggers(focus, built.triggers || []);
  const statewise = await produceStatewiseSnapshot(app, schema, focus, built.rows || [], {
    snapshot_source: "scheduled",
    now: started,
    run_id: built.run_id,
    missingContractFields
  });
  const alertEvents = { disabled: true, owner: TABLES.timeEngineTriggers, created: 0 };
  const triggerReadyCount = built.rows.filter((row) => row.trigger_ready === true).length;
  const finished = new Date();
  const logRow = {
    time_engine_log_key: `${built.run_id}|${compactDate(focus.focus_day)}`,
    run_id: built.run_id,
    show_no: intValue(focus.show_no),
    focus_day: focus.focus_day,
    focus_day_key: compactDate(focus.focus_day),
    started_at: catalystDateTime(started),
    finished_at: catalystDateTime(finished),
    duration_ms: finished.getTime() - started.getTime(),
    status: "PASS",
    source_counts: compactJson(built.source_counts),
    rows_written: writeRows.length,
    trigger_ready_count: triggerReadyCount,
    endpoints: "mobile_pro|print|two_way|alerts",
    warning_count: missingContractFields.length,
    warning_summary: missingContractFields.join(","),
    error_message: "",
    payload_json: compactJson({
      wake_reason: wakeReason,
      gate_reason: gate.reason,
      source_counts: built.source_counts,
      rows_written: writeRows.length,
      trigger_ready_count: triggerReadyCount,
      trigger_candidates: (built.triggers || []).length,
      triggers_inserted: triggerInsert.inserted,
      triggers_existing: triggerInsert.existing,
      statewise,
      alert_events: alertEvents
    }),
    last_synced_at: catalystDateTime(finished)
  };
  const logUpsert = await upsertRowsByKey(app, schema, TABLES.timeEngineLogs, "time_engine_log_key", [logRow], missingContractFields);

  const airtableTables = { disabled: true, reason: "catalyst_to_airtable_mirroring_disabled" };
  const nextOffset = requestedLimit > 0 && requestedOffset + writeRows.length < built.rows.length ? requestedOffset + writeRows.length : 0;

  return {
    ok: true,
    mode: "wec-time-engine",
    wake_reason: wakeReason,
    gate_reason: gate.reason,
    focus,
    run_id: built.run_id,
    source_counts: built.source_counts,
    total_rows: built.rows.length,
    offset: requestedOffset,
    limit: requestedLimit || 0,
    rows_written: writeRows.length,
    next_offset: nextOffset,
    complete: nextOffset === 0,
    trigger_ready_count: triggerReadyCount,
    trigger_candidates: (built.triggers || []).length,
    triggers_inserted: triggerInsert.inserted,
    triggers_existing: triggerInsert.existing,
    statewise_now: statewise,
    airtable_trigger_events: airtableTriggerEvents,
    alert_events: alertEvents,
    catalyst_upserts: {
      time_engine: upsert,
      time_engine_triggers: triggerInsert,
      time_engine_logs: logUpsert
    },
    airtable_tables: airtableTables,
    airtable_mirror_counts: {
      time_engine: 0,
      time_engine_triggers: 0,
      time_engine_logs: 0
    },
    missing_contract_fields: missingContractFields,
    workflow_run: false,
    live_run: false,
    alerts_run: false,
    output_publish_run: false
  };
}

function scheduleRowForProof(row, focus) {
  const ringNameNormalized = text(row.ring_name_normalized) || normalizeRingName(row.ring_name);
  const base = {
    ROWID: row.ROWID,
    show_no: intValue(row.show_no || focus.show_no),
    focus_day: text(row.focus_day || row.iso_date || focus.focus_day),
    iso_date: text(row.iso_date || row.focus_day || focus.focus_day),
    focus_day_key: compactDate(row.focus_day || row.iso_date || focus.focus_day),
    ring_day_no: intValue(row.ring_day_no),
    ring_no: intValue(row.ring_no),
    ring_name: text(row.ring_name || row.ring),
    ring_name_normalized: ringNameNormalized,
    ring_name_prioritized: intValue(row.ring_name_prioritized),
    class_no: intValue(row.class_no),
    class_name: text(row.class_name || row.event_name),
    time_text: text(row.time_text),
    event_type: intValue(row.event_type),
    entry_count: intValue(row.entry_count)
  };
  return {
    ...row,
    ...base,
    ...buildConstKeys(base)
  };
}

function getClassOogCellMap(cells) {
  const values = cells.map((cell) => text(cheerio.load(cell).text()));
  const joined = values.join(" | ");
  const entryOrder = intValue(values[0]);
  const entryNo = intValue(values[1]) || values.slice(1).map(intValue).find((n) => n > 0 && n < 10000 && n !== entryOrder) || 0;
  return {
    entry_order: entryOrder,
    entry_no: entryNo,
    horse: values[2] || "",
    rider: values[values.length - 2] || "",
    trainer: values[values.length - 1] || "",
    source_text: joined
  };
}

function parseClassOogRaw(rawDoc) {
  const $ = cheerio.load(rawDoc.raw_html || "");
  const rows = [];
  $("tr").each((_, tr) => {
    const cells = $(tr).find("td").toArray();
    if (cells.length < 4) return;
    const mapped = getClassOogCellMap(cells.map((cell) => $.html(cell)));
    if (!mapped.entry_no) return;
    rows.push({
      show_no: intValue(rawDoc.show_no),
      focus_day: text(rawDoc.focus_day),
      iso_date: text(rawDoc.iso_date || rawDoc.focus_day),
      ring_day_no: intValue(rawDoc.ring_day_no),
      ring_no: intValue(rawDoc.ring_no),
      ring_name: text(rawDoc.ring_name),
      ring_name_normalized: text(rawDoc.ring_name_normalized),
      ring_name_prioritized: intValue(rawDoc.ring_name_prioritized),
      class_no: intValue(rawDoc.class_no),
      class_name: text(rawDoc.class_name),
      entry_no: mapped.entry_no,
      entry_order: mapped.entry_order,
      horse: mapped.horse,
      rider: mapped.rider,
      trainer: mapped.trainer,
      source_endpoint: "class_oog.php",
      source_payload: mapped.source_text
    });
  });
  return rows;
}

async function readCurrentRows(app, tableName, showNo, focusDay, dateField = "focus_day", orderBy = "") {
  const dateClause = dateField === "iso_date"
    ? `iso_date = ${zcqlValue(focusDay)}`
    : dateField === "focus_day_only"
      ? `focus_day = ${zcqlValue(focusDay)}`
    : `(focus_day = ${zcqlValue(focusDay)} OR iso_date = ${zcqlValue(focusDay)})`;
  const orderClause = text(orderBy) ? ` ORDER BY ${orderBy}` : "";
  const scopedQuery = `SELECT * FROM ${tableName} WHERE show_no = ${Number(showNo)} AND ${dateClause}${orderClause} LIMIT 300`;
  return zcqlRows(app, tableName, scopedQuery);
}

async function upsertRowsByKey(app, schema, tableName, keyField, rows, missingContractFields) {
  const existingRows = await zcqlRows(
    app,
    tableName,
    `SELECT ROWID, ${keyField} FROM ${tableName} WHERE show_no = ${Number(rows[0]?.show_no || 0)} AND focus_day = ${zcqlValue(rows[0]?.focus_day || "")} LIMIT 300`
  );
  const existingByKey = new Map(existingRows.map((row) => [text(row[keyField]), row]));
  const table = app.datastore().table(tableName);
  let inserted = 0;
  let updated = 0;
  let verified = 0;
  for (const row of rows || []) {
    const key = text(row[keyField]);
    if (!key) continue;
    const existing = existingByKey.get(key);
    const clean = filterToSchema(schema, tableName, existing?.ROWID ? { ...row, ROWID: existing.ROWID } : row, missingContractFields);
    if (existing?.ROWID) {
      await table.updateRow(clean);
      updated += 1;
    } else {
      await table.insertRow(clean);
      inserted += 1;
    }
    const readback = await firstRow(
      app,
      tableName,
      `SELECT ROWID, ${keyField} FROM ${tableName} WHERE ${keyField} = ${zcqlValue(key)} LIMIT 1`
    );
    if (!readback?.ROWID) {
      throw new Error(`write_readback_missing:${tableName}:${keyField}:${key}`);
    }
    verified += 1;
  }
  return { rows: rows.length, inserted, updated, verified };
}

async function upsertRowsByKeyFast(app, schema, tableName, keyField, rows, missingContractFields) {
  const first = rows?.[0] || {};
  const existingRows = await zcqlRows(
    app,
    tableName,
    `SELECT ROWID, ${keyField} FROM ${tableName} WHERE show_no = ${Number(first.show_no || 0)} AND focus_day = ${zcqlValue(first.focus_day || "")} LIMIT 300`
  );
  const existingByKey = new Map(existingRows.map((row) => [text(row[keyField]), row]));
  const table = app.datastore().table(tableName);
  let inserted = 0;
  let updated = 0;
  for (const row of rows || []) {
    const key = text(row[keyField]);
    if (!key) continue;
    const existing = existingByKey.get(key);
    const clean = filterToSchema(schema, tableName, existing?.ROWID ? { ...row, ROWID: existing.ROWID } : row, missingContractFields);
    if (existing?.ROWID) {
      await table.updateRow(clean);
      updated += 1;
    } else {
      await table.insertRow(clean);
      inserted += 1;
    }
  }
  return { rows: rows.length, inserted, updated, verified: inserted + updated, readback: "skipped_for_time_engine_speed" };
}

async function markRowsNotInKeySet(app, schema, tableName, keyField, showNo, focusDay, activeKeys, missingContractFields, runTime) {
  const rows = await readCurrentRows(app, tableName, showNo, focusDay, "focus_day_only");
  const table = app.datastore().table(tableName);
  let marked = 0;
  for (const row of rows) {
    const key = text(row[keyField]);
    if (!key || activeKeys.has(key) || text(row.status) === "dropped_old_key_shape") continue;
    const clean = filterToSchema(schema, tableName, {
      ROWID: row.ROWID,
      status: "dropped_old_key_shape",
      last_synced_at: catalystDateTime(runTime)
    }, missingContractFields);
    await table.updateRow(clean);
    marked += 1;
  }
  return { reviewed: rows.length, marked };
}

async function deleteRowsNotInKeySet(app, tableName, keyField, showNo, focusDay, activeKeys) {
  const rows = await readCurrentRows(app, tableName, showNo, focusDay, "focus_day_only");
  const deleteIds = rows
    .filter((row) => !activeKeys.has(text(row[keyField])))
    .map((row) => row.ROWID)
    .filter(Boolean);
  const table = app.datastore().table(tableName);
  for (let index = 0; index < deleteIds.length; index += 100) {
    await table.deleteRows(deleteIds.slice(index, index + 100));
  }
  return { reviewed: rows.length, deleted: deleteIds.length };
}

async function deleteRowsByIds(app, tableName, rowIds) {
  const ids = (rowIds || []).filter(Boolean);
  const table = app.datastore().table(tableName);
  for (let index = 0; index < ids.length; index += 100) {
    await table.deleteRows(ids.slice(index, index + 100));
  }
  return ids.length;
}

async function countActiveRowsInKeySet(app, tableName, keyField, showNo, focusDay, activeKeys) {
  const rows = await readCurrentRows(app, tableName, showNo, focusDay, "focus_day_only");
  return rows.filter((row) => activeKeys.has(text(row[keyField])) && text(row.status) === "active").length;
}

async function countCurrentRows(app, tableName, showNo, focusDay) {
  return (await readCurrentRows(app, tableName, showNo, focusDay, "focus_day_only")).length;
}

async function buildProbeEvidence(app, focus) {
  const allowedTrainerRecords = await getAirtableRecords(TABLES.trainers, {
    view: "allowed",
    pageSize: "100"
  });
  const allowedTrainerNames = new Set();
  const trainerTable = app.datastore().table(TABLES.trainers);
  for (const record of allowedTrainerRecords) {
    const fields = record.fields || {};
    const trainerName = text(fields.trainer_name || fields.trainer);
    if (!trainerName) continue;
    allowedTrainerNames.add(trainerName);
    const existing = await firstRow(
      app,
      TABLES.trainers,
      `SELECT ROWID, trainer_name FROM ${TABLES.trainers} WHERE trainer_name = ${zcqlValue(trainerName)} LIMIT 1`
    );
    if (existing?.ROWID) {
      await trainerTable.updateRow({
        ROWID: existing.ROWID,
        trainer_name: trainerName,
        allowed: true,
        follow: fields.follow === true,
        active: fields.active !== false,
        rec_id: text(fields.rec_id || record.id)
      });
    }
  }
  const trainerRows = await zcqlRows(app, TABLES.trainers, `SELECT * FROM ${TABLES.trainers} LIMIT 300`);
  const horseRows = await zcqlRows(app, TABLES.horses, `SELECT * FROM ${TABLES.horses} LIMIT 300`);
  const riderRows = await zcqlRows(app, TABLES.riders, `SELECT * FROM ${TABLES.riders} LIMIT 300`);
  const activeTrainerTokens = trainerRows
    .filter((row) => row.allowed === true || text(row.allowed).toLowerCase() === "true")
    .flatMap((row) => [row.trainer_name, row.tenant_name, row.coach_name, row.trainer_aliases].map(text).filter(Boolean));
  const focusTrainerTokens = Array.isArray(focus.trainers_allowed)
    ? focus.trainers_allowed.map(text).filter(Boolean)
    : text(focus.trainers_allowed).split(/[,|]/).map(text).filter(Boolean);
  return {
    trainers_allowed: Array.from(new Set([...focusTrainerTokens, ...activeTrainerTokens, ...allowedTrainerNames])),
    horse_tokens: horseRows
      .filter((row) => row.active === true || row.follow === true || text(row.status).toLowerCase() === "active")
      .flatMap((row) => [row.horse, row.horse_name, row.barn_name, row.horse_display, row.horse_aka].map(text).filter(Boolean)),
    rider_tokens: riderRows
      .filter((row) => row.active === true || row.follow === true || text(row.status).toLowerCase() === "active")
      .flatMap((row) => [row.rider_name, row.team_name, row.first_name, row.last_name, row.rider_aliases].map(text).filter(Boolean)),
    trainer_tokens: activeTrainerTokens
  };
}

async function buildCatalystProbeEvidence(app, focus) {
  const trainerRows = await zcqlRows(app, TABLES.trainers, `SELECT * FROM ${TABLES.trainers} LIMIT 300`);
  const horseRows = await zcqlRows(app, TABLES.horses, `SELECT * FROM ${TABLES.horses} LIMIT 300`);
  const riderRows = await zcqlRows(app, TABLES.riders, `SELECT * FROM ${TABLES.riders} LIMIT 300`);
  const activeTrainerTokens = trainerRows
    .filter((row) => row.allowed === true || text(row.allowed).toLowerCase() === "true")
    .flatMap((row) => [row.trainer_name, row.tenant_name, row.coach_name, row.trainer_aliases].map(text).filter(Boolean));
  const focusTrainerTokens = Array.isArray(focus.trainers_allowed)
    ? focus.trainers_allowed.map(text).filter(Boolean)
    : text(focus.trainers_allowed).split(/[,|]/).map(text).filter(Boolean);
  return {
    trainers_allowed: Array.from(new Set([...focusTrainerTokens, ...activeTrainerTokens])),
    horse_tokens: horseRows
      .filter((row) => row.active === true || row.follow === true || text(row.status).toLowerCase() === "active")
      .flatMap((row) => [row.horse, row.horse_name, row.barn_name, row.horse_display, row.horse_aka].map(text).filter(Boolean)),
    rider_tokens: riderRows
      .filter((row) => row.active === true || row.follow === true || text(row.status).toLowerCase() === "active")
      .flatMap((row) => [row.rider_name, row.team_name, row.first_name, row.last_name, row.rider_aliases].map(text).filter(Boolean)),
    trainer_tokens: activeTrainerTokens
  };
}

async function makeAdapters(app, options) {
  let cookie = "";
  const schema = await loadSchema(app);
  const missingContractFields = [];
  const deferAirtableMirror = options.defer_airtable_mirror === true;
  return {
    getActiveFocusShow,
    async writeHeartbeat(row) {
      const heartbeatId = `${intValue(row.show_no)}|${compactDate(row.focus_day)}|${options.run_id}`;
      const focus = await getActiveFocusShow();
      await syncFocusShowMirror(app, schema, focus, missingContractFields);
      const fields = {
        ...row,
        heartbeat_id: heartbeatId,
        run_id: options.run_id,
        iso_date: row.iso_date || row.focus_day,
        run_time: catalystDateTime(),
        payload_json: JSON.stringify({ clean_proof: true, stage: "1-3A_FAST", stop_after: "hs_class_oog_raw" })
      };
      const result = await upsertByKey(app, TABLES.heartbeat, "heartbeat_id", filterToSchema(schema, TABLES.heartbeat, fields, missingContractFields));
      let airtableHeartbeatLinks = null;
      try {
        airtableHeartbeatLinks = await syncAirtableActiveHeartbeatLinks(focus, fields);
      } catch (error) {
        const message = String(error?.message || error).slice(0, 240);
        missingContractFields.push(`airtable.${TABLES.heartbeat}:${message}`);
        airtableHeartbeatLinks = { ok: false, error: message };
      }
      return { ...result, heartbeat_id: heartbeatId, airtable_heartbeat_links: airtableHeartbeatLinks };
    },
    async fetchRingDays(focus) {
      const current = await readCurrentRows(app, TABLES.getRingDays, focus.show_no, focus.focus_day, "iso_date");
      if (current.length) return current;
      const raw = await fetchRingDaysRaw(focus.show_no);
      return parseRingDayRows(raw, focus.show_no)
        .filter((row) => dateKey(row.day_label || row.date_text) === text(focus.focus_day));
    },
    async upsertRingDays(rows) {
      const table = app.datastore().table(TABLES.getRingDays);
      const prepared = rows.map((row) => {
        const isoDate = dateKey(row.iso_date || row.focus_day || row.day_label || row.date_text);
        const focusDayKey = compactDate(row.focus_day_key || isoDate);
        const ringNameNormalized = normalizeRingName(row.ring_name);
        const identity = {
          ...row,
          show_no: intValue(row.show_no),
          focus_day: isoDate,
          iso_date: isoDate,
          focus_day_key: focusDayKey,
          ring_day_no: intValue(row.ring_day_no),
          ring_no: intValue(row.ring_no),
          ring_name: text(row.ring_name),
          ring_name_normalized: ringNameNormalized,
          ring_name_prioritized: intValue(row.ring_name_prioritized)
        };
        return {
          ...identity,
          ...buildConstKeys(identity),
          date_text: displayDateText(isoDate),
          source_endpoint: row.source_endpoint || "get_ring_days.php",
          source_payload: row.source_payload || JSON.stringify(row)
        };
      });
      let inserted = 0;
      let updated = 0;
      for (const row of prepared) {
        if (!row.ring_const_key) continue;
        const payload = filterToSchema(schema, TABLES.getRingDays, {
          ring_day_key: row.ring_const_key,
          heartbeat_id: row.heartbeat_id,
          focus_day: row.focus_day,
          iso_date: row.iso_date || row.focus_day,
          focus_day_key: row.focus_day_key,
          show_no: row.show_no,
          ring_day_no: row.ring_day_no,
          ring_no: row.ring_no,
          ring_name: row.ring_name,
          date_text: row.date_text,
          show_const_key: row.show_const_key,
          focus_day_const_key: row.focus_day_const_key,
          ring_day_const_key: row.ring_day_const_key,
          ring_const_key: row.ring_const_key,
          ring_name_normalized: row.ring_name_normalized,
          ring_name_prioritized: row.ring_name_prioritized,
          source_endpoint: row.source_endpoint,
          source_payload: row.source_payload
        }, missingContractFields);
        const existing = await firstRow(
          app,
          TABLES.getRingDays,
          `SELECT ROWID, ring_const_key FROM ${TABLES.getRingDays} WHERE ring_const_key = ${zcqlValue(row.ring_const_key)} LIMIT 1`
        );
        if (existing?.ROWID) {
          await table.updateRow({ ...payload, ROWID: existing.ROWID });
          updated++;
        } else {
          await table.insertRow(payload);
          inserted++;
        }
        if (!deferAirtableMirror) {
          try {
            await upsertAirtableByKey(TABLES.getRingDays, "ring_day_key", row.ring_const_key, getRingDaysReviewFields(row));
          } catch (error) {
            missingContractFields.push(`airtable.${TABLES.getRingDays}:${String(error?.message || error).slice(0, 160)}`);
          }
        }
      }
      return { mode: "source_fetch_create_or_update", rows: prepared.length, inserted, updated };
    },
    async fetchUpdateSchedule(focus, ringDay) {
      if (!cookie) cookie = await bootstrapCookie(focus.show_no);
      const raw = await fetchUpdateScheduleRaw(focus.show_no, ringDay.ring_day_no, cookie);
      return parseUpdateScheduleRows(raw, focus, ringDay).map((row) => scheduleRowForProof(row, focus));
    },
    async upsertUpdateSchedule(rows) {
      const prepared = (rows || [])
        .map((row) => scheduleRowForProof(row, { show_no: row.show_no, focus_day: row.focus_day }))
        .filter((row) => text(row.class_const_key))
        .map((row) => filterToSchema(schema, TABLES.updateSchedule, {
          update_schedule_key: row.class_const_key,
          heartbeat_id: row.heartbeat_id,
          show_no: intValue(row.show_no),
          focus_day: row.focus_day,
          iso_date: row.iso_date || row.focus_day,
          focus_day_key: row.focus_day_key,
          show_const_key: row.show_const_key,
          focus_day_const_key: row.focus_day_const_key,
          ring_day_const_key: row.ring_day_const_key,
          ring_const_key: row.ring_const_key,
          class_const_key: row.class_const_key,
          ring_day_no: intValue(row.ring_day_no),
          ring_no: intValue(row.ring_no),
          ring_name: row.ring_name,
          ring_name_normalized: row.ring_name_normalized,
          ring_name_prioritized: intValue(row.ring_name_prioritized),
          class_no: intValue(row.class_no),
          class_label: row.class_label,
          class_name: row.class_name,
          time_text: row.time_text,
          class_time_text: row.class_time_text || row.time_text,
          class_start_time: normalizeClassStartTime(row.class_start_time || row.time_text),
          display_time: row.display_time || displayTimeFromStart(row.time_text),
          class_order: intValue(row.class_order),
          entry_count: intValue(row.entry_count),
          event_id: row.event_id,
          event_type: intValue(row.event_type),
          re_type: row.re_type,
          oc_id: row.oc_id,
          live_flag: intValue(row.live_flag),
          is_active_focus_day: true,
          is_preflight: row.is_preflight,
          preflight_reason: row.preflight_reason,
          status: row.is_preflight ? "preflight" : "active",
          source_endpoint: "update_schedule.php",
          source_payload: row.source_payload,
          last_synced_at: catalystDateTime()
        }, missingContractFields));
      let inserted = 0;
      let updated = 0;
      for (const row of prepared) {
        const result = await upsertByKey(app, TABLES.updateSchedule, "update_schedule_key", row);
        if (result.operation === "insert") inserted += 1;
        if (result.operation === "update") updated += 1;
      }
      if (!deferAirtableMirror && prepared.length) {
        try {
          await writeAirtableRowsByKey(
            TABLES.updateSchedule,
            "update_schedule_key",
            prepared.map((row) => updateScheduleReviewFields(row))
          );
        } catch (error) {
          missingContractFields.push(`airtable.${TABLES.updateSchedule}:${String(error?.message || error).slice(0, 160)}`);
        }
      }
      return { mode: "source_fetch_create_or_update", rows: rows.length, inserted, updated };
    },
    async markDroppedUpdateSchedule(rows, { focus } = {}) {
      const activeKeys = new Set((rows || []).map((row) => text(row.class_const_key)).filter(Boolean));
      const current = await readCurrentRows(app, TABLES.updateSchedule, focus.show_no, focus.focus_day);
      const stale = current.filter((row) => {
        const key = text(row.update_schedule_key || row.class_const_key);
        return key && !activeKeys.has(key) && lowerText(row.status) !== "dropped";
      });
      const table = app.datastore().table(TABLES.updateSchedule);
      let dropped = 0;
      for (const row of stale) {
        if (!row.ROWID) continue;
        await table.updateRow(filterToSchema(schema, TABLES.updateSchedule, {
          ROWID: row.ROWID,
          status: "dropped",
          is_active_focus_day: false,
          last_synced_at: catalystDateTime()
        }, missingContractFields));
        dropped += 1;
      }
      return { mode: "mark_dropped_not_deleted", reviewed: current.length, dropped };
    },
    async buildProbeEvidence(focus) {
      return buildProbeEvidence(app, focus);
    },
    async fetchClassOog(focus, row) {
      if (!cookie) cookie = await bootstrapCookie(focus.show_no);
      return fetchClassOogRaw(focus.show_no, row.class_no, cookie);
    },
    async markClassOogProbeProgress(row, progress) {
      if (!row.ROWID) return { skipped: true, reason: "missing_update_schedule_ROWID" };
      const catalystResult = await app.datastore().table(TABLES.updateSchedule).updateRow(filterToSchema(schema, TABLES.updateSchedule, {
        ROWID: row.ROWID,
        probe_status: progress.probe_status,
        probe_attempted_at: catalystDateTime(progress.probe_attempted_at),
        probe_finished_at: catalystDateTime(progress.probe_finished_at),
        probe_duration_ms: progress.probe_duration_ms,
        probe_attempt_count: intValue(row.probe_attempt_count) + 1,
        probe_payload_chars: progress.probe_payload_chars,
        probe_certainty: progress.probe_certainty,
        probe_reason: progress.probe_reason,
        probe_raw_stored: progress.probe_raw_stored
      }, missingContractFields));
      if (!deferAirtableMirror) await updateAirtableScheduleProbe(row, progress);
      return catalystResult;
    },
    async storeClassOogRaw(row) {
      const rawKey = row.class_const_key;
      const rawFields = {
        raw_key: rawKey,
        heartbeat_id: row.heartbeat_id,
        run_id: row.run_id,
        show_no: intValue(row.show_no),
        focus_day: row.focus_day,
        iso_date: row.iso_date || row.focus_day,
        focus_day_key: row.focus_day_key,
        show_const_key: row.show_const_key,
        focus_day_const_key: row.focus_day_const_key,
        ring_day_const_key: row.ring_day_const_key,
        ring_const_key: row.ring_const_key,
        class_const_key: row.class_const_key,
        ring_day_no: intValue(row.ring_day_no),
        ring_no: intValue(row.ring_no),
        ring_name: row.ring_name,
        ring_name_normalized: row.ring_name_normalized,
        ring_name_prioritized: intValue(row.ring_name_prioritized),
        class_no: intValue(row.class_no),
        class_name: row.class_name,
        raw_html: row.raw_html,
        probe_status: row.probe_status,
        possible_match: row.probe_raw_stored,
        raw_stored: row.probe_raw_stored,
        parsed_status: row.parse_status,
        parse_status: row.parse_status,
        matched_count: 0,
        skipped_count: 0,
        parse_error: "",
        probe_payload_chars: row.probe_payload_chars,
        probe_finished_at: catalystDateTime(row.probe_finished_at),
        probe_duration_ms: row.probe_duration_ms,
        probe_certainty: row.probe_certainty,
        probe_reason: row.probe_reason
      };
      const result = await upsertByKey(app, TABLES.classOogRaw, "raw_key", filterToSchema(schema, TABLES.classOogRaw, rawFields, missingContractFields));
      if (!deferAirtableMirror) {
        await upsertAirtableByKey(TABLES.classOogRaw, "raw_key", rawKey, classOogRawMirrorFields(rawFields));
      }
      return result;
    },
    async listPendingClassOogRaw(focus, context) {
      const query = `SELECT * FROM ${TABLES.classOogRaw} WHERE show_no = ${Number(focus.show_no)} AND focus_day = ${zcqlValue(focus.focus_day)} AND run_id = ${zcqlValue(context.run_id)} AND (parsed_status = 'pending' OR parsed_status = 'unparsed') LIMIT 50`;
      return zcqlRows(app, TABLES.classOogRaw, query);
    },
    async parseClassOogRaw(rawDoc) {
      return parseClassOogRaw(rawDoc);
    },
    async clearClassOogForRawDoc(rawDoc, scopedRows) {
      const classKey = text(rawDoc.raw_key || rawDoc.class_const_key);
      if (!classKey) return { reviewed: 0, deleted: 0 };
      const keepKeys = new Set((scopedRows || []).map((row) => text(row.entry_const_key)).filter(Boolean));
      const existingRows = await zcqlRows(
        app,
        TABLES.classOog,
        `SELECT ROWID, class_oog_key FROM ${TABLES.classOog} WHERE show_no = ${Number(rawDoc.show_no)} AND focus_day = ${zcqlValue(rawDoc.focus_day)} AND class_const_key = ${zcqlValue(classKey)} LIMIT 300`
      );
      const deleteIds = existingRows
        .filter((row) => !keepKeys.has(text(row.class_oog_key)))
        .map((row) => row.ROWID)
        .filter(Boolean);
      const deleted = await deleteRowsByIds(app, TABLES.classOog, deleteIds);
      return { reviewed: existingRows.length, deleted };
    },
    async upsertClassOog(rows) {
      let inserted = 0;
      let updated = 0;
      for (const row of rows) {
        const classOogKey = row.entry_const_key;
        const cleanRow = {
          class_oog_key: classOogKey,
          heartbeat_id: row.heartbeat_id,
          run_id: row.run_id,
          show_no: intValue(row.show_no),
          focus_day: row.focus_day,
          iso_date: row.iso_date || row.focus_day,
          focus_day_key: row.focus_day_key,
          ring_day_no: intValue(row.ring_day_no),
          ring_no: intValue(row.ring_no),
          ring: row.ring_name,
          ring_name: row.ring_name,
          ring_name_normalized: row.ring_name_normalized,
          ring_name_prioritized: intValue(row.ring_name_prioritized),
          show_const_key: row.show_const_key,
          focus_day_const_key: row.focus_day_const_key,
          ring_day_const_key: row.ring_day_const_key,
          ring_const_key: row.ring_const_key,
          class_const_key: row.class_const_key,
          entry_const_key: row.entry_const_key,
          class_no: intValue(row.class_no),
          class_name: row.class_name,
          entry_order: intValue(row.entry_order),
          entry_no: intValue(row.entry_no),
          horse: row.horse,
          rider: row.rider,
          trainer: row.trainer,
          source_endpoint: row.source_endpoint,
          source_payload: row.source_payload
        };
        const result = await upsertByKey(app, TABLES.classOog, "class_oog_key", filterToSchema(schema, TABLES.classOog, cleanRow, missingContractFields));
        if (!deferAirtableMirror) {
          await upsertAirtableByKey(TABLES.classOog, "class_oog_key", classOogKey, {
            class_oog_key: classOogKey,
            run_id: cleanRow.run_id,
            show_no: cleanRow.show_no,
            focus_day: cleanRow.focus_day,
            iso_date: cleanRow.iso_date,
            focus_day_key: cleanRow.focus_day_key,
            show_const_key: cleanRow.show_const_key,
            focus_day_const_key: cleanRow.focus_day_const_key,
            ring_day_const_key: cleanRow.ring_day_const_key,
            ring_const_key: cleanRow.ring_const_key,
            class_const_key: cleanRow.class_const_key,
            entry_const_key: cleanRow.entry_const_key,
            ring_day_no: cleanRow.ring_day_no,
            ring_no: cleanRow.ring_no,
            ring: cleanRow.ring,
            ring_name: cleanRow.ring_name,
            ring_name_normalized: cleanRow.ring_name_normalized,
            ring_name_prioritized: intValue(cleanRow.ring_name_prioritized),
            class_no: cleanRow.class_no,
            class_name: cleanRow.class_name,
            entry_order: cleanRow.entry_order,
            entry_no: cleanRow.entry_no,
            horse: cleanRow.horse,
            rider: cleanRow.rider,
            trainer: cleanRow.trainer,
            source_endpoint: cleanRow.source_endpoint,
            source_payload: cleanRow.source_payload
          });
        }
        if (result.operation === "insert") inserted += 1;
        else updated += 1;
      }
      return { rows: rows.length, inserted, updated };
    },
    async markClassOogRawParsed(rawDoc, patch) {
      if (!rawDoc.ROWID) return { skipped: true };
      const fields = {
        ROWID: rawDoc.ROWID,
        parsed_status: patch.parse_status,
        parse_status: patch.parse_status,
        matched_count: patch.matched_count || 0,
        skipped_count: patch.skipped_count || 0,
        parse_error: patch.parse_error || ""
      };
      const result = await app.datastore().table(TABLES.classOogRaw).updateRow(filterToSchema(schema, TABLES.classOogRaw, fields, missingContractFields));
      if (!deferAirtableMirror && rawDoc.raw_key) {
        await upsertAirtableByKey(TABLES.classOogRaw, "raw_key", rawDoc.raw_key, classOogRawMirrorFields({
          ...rawDoc,
          parsed_status: patch.parse_status,
          parse_status: patch.parse_status,
          matched_count: patch.matched_count || 0,
          skipped_count: patch.skipped_count || 0,
          parse_error: patch.parse_error || ""
        }));
      }
      return result;
    },
    missingContractFields: () => missingContractFields.slice()
  };
}

async function runFast3AOnly(app, options) {
  const focus = await getActiveFocusShow();
  if (!focus?.show_no) throw new Error("focus_show.show_no_required");
  if (!focus?.focus_day) throw new Error("focus_show.focus_day_required");
  if (focus.is_pause === true || text(focus.is_pause).toLowerCase() === "true") {
    throw new Error("focus_show.is_pause");
  }

  const context = {
    run_id: options.run_id || `fast-3a-${Date.now()}`,
    started_at: new Date().toISOString()
  };
  const rows = (await readCurrentRows(app, TABLES.updateSchedule, focus.show_no, focus.focus_day))
    .map((row) => scheduleRowForProof(row, focus))
    .filter((row) => intValue(row.class_no) && preflightReason(row).length === 0);
  const requestedOffset = Math.max(0, intValue(options.offset));
  const requestedLimit = intValue(options.limit) || 1;
  const mode = text(options.mode || "next_unchecked");
  const primaryProbeRows = rows
    .filter(isProbeCandidate)
    .sort((a, b) => (
      text(a.time_text).localeCompare(text(b.time_text)) ||
      intValue(a.ring_no) - intValue(b.ring_no) ||
      intValue(a.class_no) - intValue(b.class_no)
    ));
  const retryNoMatchRows = rows
    .filter(isRetryableNoMatchProbe)
    .sort((a, b) => (
      intValue(a.probe_attempt_count) - intValue(b.probe_attempt_count) ||
      text(a.time_text).localeCompare(text(b.time_text)) ||
      intValue(a.ring_no) - intValue(b.ring_no) ||
      intValue(a.class_no) - intValue(b.class_no)
    ));
  const candidatePool = mode === "retry_no_match" ? retryNoMatchRows : primaryProbeRows;
  const candidateRows = options.class_no
    ? rows.filter((row) => intValue(row.class_no) === intValue(options.class_no))
    : mode === "offset"
      ? rows.slice(requestedOffset, requestedOffset + requestedLimit)
      : candidatePool.slice(0, requestedLimit);

  const adapters = await makeAdapters(app, { ...options, defer_airtable_mirror: true });
  const evidence = await buildCatalystProbeEvidence(app, focus);
  const probe3a = await runProbe3A(adapters, context, focus, candidateRows, evidence);
  const nextOffset = options.class_no || requestedOffset + candidateRows.length >= rows.length
    ? 0
    : requestedOffset + candidateRows.length;

  return {
    ok: true,
    mode: "wec-step3a-class-oog-probe",
    run_id: context.run_id,
    focus,
    eligible_total: rows.length,
    unchecked_total: primaryProbeRows.length,
    retry_no_match_total: retryNoMatchRows.length,
    probe_policy: {
      no_match_retry_max_attempts: NO_MATCH_PROBE_RETRY_MAX_ATTEMPTS,
      retry_checked_no_match: true,
      retry_checked_no_match_blocks_primary_runtime: false,
      retry_lane: "3A2"
    },
    page: {
      mode,
      offset: mode === "offset" ? requestedOffset : 0,
      limit: requestedLimit,
      processed: candidateRows.length,
      next_offset: mode === "offset" ? nextOffset : 0,
      complete: mode === "offset" ? nextOffset === 0 : candidatePool.length <= candidateRows.length
    },
    probe3a: {
      attempted: probe3a.length,
      raw_stored: probe3a.filter((item) => item.progress?.probe_raw_stored).length,
      checked_no_match: probe3a.filter((item) => item.progress?.probe_status === "checked").length,
      failed: probe3a.filter((item) => item.error).length,
      failed_examples: probe3a
        .filter((item) => item.error)
        .slice(0, 5)
        .map((item) => ({
          class_const_key: item.row?.class_const_key,
          class_no: intValue(item.row?.class_no),
          class_name: item.row?.class_name,
          reason: item.error
        }))
    },
    step1_run: false,
    step2_run: false,
    stage3b_run: false,
    hs_class_oog_materialization_run: false,
    airtable_mirror_deferred: true,
    step4_run: false,
    live_run: false,
    alerts_run: false,
    output_run: false,
    missing_contract_fields: adapters.missingContractFields()
  };
}

async function runFast3BOnly(app, options) {
  const focus = await getActiveFocusShow();
  if (!focus?.show_no) throw new Error("focus_show.show_no_required");
  if (!focus?.focus_day) throw new Error("focus_show.focus_day_required");
  if (focus.is_pause === true || text(focus.is_pause).toLowerCase() === "true") {
    throw new Error("focus_show.is_pause");
  }

  const context = {
    run_id: options.run_id || `fast-3b-${Date.now()}`,
    started_at: new Date().toISOString()
  };
  const requestedLimit = intValue(options.limit) || 25;
  const adapters = await makeAdapters(app, { ...options, defer_airtable_mirror: true });
  adapters.listPendingClassOogRaw = async (probeFocus) => {
    const statusClause = options.force === true
      ? "raw_stored = true"
      : "(parsed_status = 'pending' OR parsed_status = 'unparsed')";
    const query = `SELECT * FROM ${TABLES.classOogRaw} WHERE show_no = ${Number(probeFocus.show_no)} AND focus_day = ${zcqlValue(probeFocus.focus_day)} AND ${statusClause} LIMIT ${requestedLimit}`;
    return zcqlRows(app, TABLES.classOogRaw, query);
  };
  const evidence = await buildCatalystProbeEvidence(app, focus);
  const probe3b = await runProbe3B(adapters, context, focus, evidence);
  const parsedDocs = probe3b.filter((item) => !item.error).length;
  const failedDocs = probe3b.filter((item) => item.error).length;
  const materializedRows = probe3b.reduce((sum, item) => sum + (item.rows?.length || 0), 0);

  return {
    ok: failedDocs === 0,
    mode: "wec-step3b-class-oog-parse",
    run_id: context.run_id,
    focus,
    raw_docs_attempted: probe3b.length,
    raw_docs_parsed: parsedDocs,
    raw_docs_failed: failedDocs,
    hs_class_oog_rows: materializedRows,
    step1_run: false,
    step2_run: false,
    stage3a_run: false,
    stage3b_run: true,
    step4_run: false,
    live_run: false,
    alerts_run: false,
    output_run: false,
    missing_contract_fields: adapters.missingContractFields()
  };
}

async function cleanSource13State(app, focus, evidence) {
  const scheduleRows = (await readCurrentRows(app, TABLES.updateSchedule, focus.show_no, focus.focus_day))
    .map((row) => scheduleRowForProof(row, focus))
    .filter((row) => intValue(row.class_no) && preflightReason(row).length === 0);
  const classKeys = new Set(scheduleRows.map((row) => text(row.class_const_key)).filter(Boolean));

  const rawRows = await zcqlRows(
    app,
    TABLES.classOogRaw,
    `SELECT * FROM ${TABLES.classOogRaw} WHERE show_no = ${Number(focus.show_no)} AND focus_day = ${zcqlValue(focus.focus_day)} LIMIT 300`
  );
  const rawKeepByKey = new Map();
  const rawDeleteIds = [];
  const sortedRawRows = rawRows.slice().sort((a, b) => Number(b.ROWID || 0) - Number(a.ROWID || 0));
  for (const row of sortedRawRows) {
    const key = text(row.raw_key || row.class_const_key);
    if (!key || !classKeys.has(key) || rawKeepByKey.has(key)) {
      rawDeleteIds.push(row.ROWID);
      continue;
    }
    rawKeepByKey.set(key, row);
  }
  const rawDeleted = await deleteRowsByIds(app, TABLES.classOogRaw, rawDeleteIds);

  const classOogRows = await zcqlRows(
    app,
    TABLES.classOog,
    `SELECT * FROM ${TABLES.classOog} WHERE show_no = ${Number(focus.show_no)} AND focus_day = ${zcqlValue(focus.focus_day)} LIMIT 300`
  );
  const classOogKeepByKey = new Map();
  const classOogDeleteIds = [];
  const sortedClassOogRows = classOogRows.slice().sort((a, b) => Number(b.ROWID || 0) - Number(a.ROWID || 0));
  for (const row of sortedClassOogRows) {
    const key = text(row.class_oog_key || row.entry_const_key);
    const classKey = text(row.class_const_key);
    const match = rowMatchesEvidence(row, evidence);
    if (!key || !classKeys.has(classKey) || !match.keep || classOogKeepByKey.has(key)) {
      classOogDeleteIds.push(row.ROWID);
      continue;
    }
    classOogKeepByKey.set(key, row);
  }
  const classOogDeleted = await deleteRowsByIds(app, TABLES.classOog, classOogDeleteIds);

  return {
    hs_update_schedule_non_preflight: scheduleRows.length,
    hs_class_oog_raw: {
      reviewed: rawRows.length,
      kept: rawKeepByKey.size,
      deleted: rawDeleted
    },
    hs_class_oog: {
      reviewed: classOogRows.length,
      kept: classOogKeepByKey.size,
      deleted: classOogDeleted
    }
  };
}

async function runCleanBuildUpdateOnly(app, options = {}) {
  const context = {
    run_id: options.run_id || `clean-build-update-${Date.now()}`,
    started_at: new Date().toISOString()
  };
  const adapters = await makeAdapters(app, {
    ...options,
    run_id: context.run_id,
    defer_airtable_mirror: options.defer_airtable_mirror === true
  });
  const stage1 = await runStage1HeartbeatAndRingDays(adapters, context);
  const stage2 = await runStage2UpdateSchedule(adapters, context, stage1);

  return {
    ok: true,
    mode: "wec-clean-build-update",
    run_id: context.run_id,
    focus: stage1.focus,
    stage1: {
      heartbeat_id: stage1.heartbeat?.heartbeat_id || stage1.heartbeat?.id || "",
      hs_get_ring_days_rows: stage1.rows.length,
      upsert: stage1.upsert
    },
    stage2: {
      hs_update_schedule_rows: stage2.rows.length,
      non_preflight_rows: stage2.eligible_rows.length,
      upsert: stage2.upsert,
      dropped: stage2.dropped
    },
    next_stage: "3A",
    step1_run: true,
    step2_run: true,
    stage3a_run: false,
    stage3b_run: false,
    step4_run: false,
    live_run: false,
    alerts_run: false,
    output_run: false,
    missing_contract_fields: adapters.missingContractFields()
  };
}

async function runCleanStage1To3BProofOnly(app, options = {}) {
  const context = {
    run_id: options.run_id || `clean-stage1-3b-${Date.now()}`,
    started_at: new Date().toISOString()
  };
  const adapters = await makeAdapters(app, { ...options, run_id: context.run_id, defer_airtable_mirror: false });
  const stage1 = await runStage1HeartbeatAndRingDays(adapters, context);
  const stage2 = await runStage2UpdateSchedule(adapters, context, stage1);
  if (!stage2.eligible_rows.length) {
    return {
      ok: false,
      mode: "wec-clean-stage1-3b-proof",
      run_id: context.run_id,
      focus: stage1.focus,
      stage1: {
        heartbeat_id: stage1.heartbeat?.heartbeat_id || stage1.heartbeat?.id || "",
        hs_get_ring_days_rows: stage1.rows.length,
        upsert: stage1.upsert
      },
      stage2: {
        hs_update_schedule_rows: stage2.rows.length,
        non_preflight_rows: 0,
        upsert: stage2.upsert,
        dropped: stage2.dropped
      },
      stop_stage: "2",
      stop_reason: "missing_current_hs_update_schedule",
      next_stage: "2",
      stage3a_run: false,
      stage3b_run: false,
      step4_run: false,
      live_run: false,
      alerts_run: false,
      output_run: false,
      missing_contract_fields: adapters.missingContractFields()
    };
  }
  const evidence = await adapters.buildProbeEvidence(stage1.focus, { context });
  const eligibleRows = stage2.eligible_rows;
  const requestedLimit = intValue(options.limit);
  const probeRows = options.class_no
    ? eligibleRows.filter((row) => intValue(row.class_no) === intValue(options.class_no))
    : requestedLimit > 0
      ? eligibleRows.slice(0, requestedLimit)
      : eligibleRows;
  const stage3a = await runProbe3A(adapters, context, stage1.focus, probeRows, evidence);
  const stage3b = await runProbe3B(adapters, context, stage1.focus, evidence);
  const stage3bFailures = stage3b.filter((item) => item.error).length;
  const stage3bRows = stage3b.reduce((sum, item) => sum + (item.rows?.length || 0), 0);
  const keySamples = {
    ring_day_key: stage1.rows[0]?.ring_const_key || "",
    update_schedule_key: stage2.rows.find((row) => row.class_const_key)?.class_const_key || "",
    raw_key: stage3a.find((item) => item.raw)?.raw?.row?.raw_key || "",
    class_oog_key: stage3b.find((item) => item.rows?.[0])?.rows?.[0]?.entry_const_key || ""
  };
  return {
    ok: stage3bFailures === 0,
    mode: "wec-clean-stage1-3b-proof",
    run_id: context.run_id,
    focus: stage1.focus,
    stage1: {
      heartbeat_id: stage1.heartbeat?.heartbeat_id || stage1.heartbeat?.id || "",
      hs_get_ring_days_rows: stage1.rows.length,
      upsert: stage1.upsert
    },
    stage2: {
      hs_update_schedule_rows: stage2.rows.length,
      non_preflight_rows: stage2.eligible_rows.length,
      upsert: stage2.upsert,
      dropped: stage2.dropped
    },
    stage3a: {
      attempted: stage3a.length,
      raw_stored: stage3a.filter((item) => item.progress?.probe_raw_stored).length,
      checked_no_match: stage3a.filter((item) => item.progress?.probe_status === "checked").length,
      failed: stage3a.filter((item) => item.error).length
    },
    stage3b: {
      raw_docs_attempted: stage3b.length,
      raw_docs_parsed: stage3b.filter((item) => !item.error).length,
      raw_docs_failed: stage3bFailures,
      hs_class_oog_rows: stage3bRows
    },
    canonical_key_samples: keySamples,
    step1_run: true,
    step2_run: true,
    stage3a_run: true,
    stage3b_run: true,
    step4_run: false,
    live_run: false,
    alerts_run: false,
    output_run: false,
    missing_contract_fields: adapters.missingContractFields(),
    stop_after: "hs_class_oog"
  };
}

async function summarizeCleanStageState(app, focus) {
  const allScheduleRows = (await readCurrentRows(app, TABLES.updateSchedule, focus.show_no, focus.focus_day))
    .map((row) => scheduleRowForProof(row, focus))
    .filter((row) => intValue(row.class_no));
  const preflightRows = allScheduleRows.filter((row) => preflightReason(row).length > 0);
  const updateRows = allScheduleRows.filter((row) => preflightReason(row).length === 0);
  const unchecked = updateRows.filter(isProbeCandidate);
  const checkedNoMatch = updateRows.filter(isCheckedNoMatchProbe);
  const retryableNoMatch = updateRows.filter(isRetryableNoMatchProbe);
  const rawStored = updateRows.filter(isRawStoredProbe);
  const newOrUnattempted = updateRows.filter((row) => !text(row.probe_status) && intValue(row.probe_attempt_count) === 0);
  const rawRows = await zcqlRows(
    app,
    TABLES.classOogRaw,
    `SELECT * FROM ${TABLES.classOogRaw} WHERE show_no = ${Number(focus.show_no)} AND focus_day = ${zcqlValue(focus.focus_day)} LIMIT 300`
  );
  const pendingRaw = rawRows.filter((row) => ["pending", "unparsed"].includes(lowerText(row.parsed_status || row.parse_status)));
  const parsedRaw = rawRows.filter((row) => lowerText(row.parsed_status || row.parse_status) === "parsed");

  return {
    schedule_rows_total: allScheduleRows.length,
    non_preflight_rows: updateRows.length,
    preflight_rows: preflightRows.length,
    probe_unchecked_rows: unchecked.length,
    probe_new_or_unattempted_rows: newOrUnattempted.length,
    probe_retryable_no_match_rows: retryableNoMatch.length,
    probe_checked_no_match_rows: checkedNoMatch.length,
    probe_terminal_no_match_rows: checkedNoMatch.length - retryableNoMatch.length,
    probe_raw_stored_rows: rawStored.length,
    probe_policy: {
      no_match_retry_max_attempts: NO_MATCH_PROBE_RETRY_MAX_ATTEMPTS,
      retry_checked_no_match: true,
      retry_checked_no_match_blocks_primary_runtime: false,
      retry_lane: "3A2"
    },
    raw_docs_total: rawRows.length,
    raw_docs_pending_parse: pendingRaw.length,
    raw_docs_parsed: parsedRaw.length
  };
}

function stage4GateDetail(before, after, step4) {
  const summary = after || before || {};
  return {
    meaning: "runtime_rows_built_after_core_probe_and_parse_gates_cleared",
    probe_gate: Number(summary.probe_unchecked_rows || 0) > 0 ? "open" : "closed",
    parse_gate: Number(summary.raw_docs_pending_parse || 0) > 0 ? "open" : "closed",
    probe_policy: summary.probe_policy || {
      no_match_retry_max_attempts: NO_MATCH_PROBE_RETRY_MAX_ATTEMPTS,
      retry_checked_no_match: true,
      retry_checked_no_match_blocks_primary_runtime: false,
      retry_lane: "3A2"
    },
    schedule_rows_total: intValue(summary.schedule_rows_total),
    preflight_rows: intValue(summary.preflight_rows),
    non_preflight_rows: intValue(summary.non_preflight_rows),
    probe_new_or_unattempted_rows: intValue(summary.probe_new_or_unattempted_rows),
    probe_retryable_no_match_rows: intValue(summary.probe_retryable_no_match_rows),
    probe_checked_no_match_rows: intValue(summary.probe_checked_no_match_rows),
    probe_terminal_no_match_rows: intValue(summary.probe_terminal_no_match_rows),
    probe_raw_stored_rows: intValue(summary.probe_raw_stored_rows),
    raw_docs_total: intValue(summary.raw_docs_total),
    raw_docs_pending_parse: intValue(summary.raw_docs_pending_parse),
    raw_docs_parsed: intValue(summary.raw_docs_parsed),
    runtime_ok: Boolean(step4?.ok),
    runtime_blocker: text(step4?.blocker)
  };
}

async function summarizeCoreRuntimeDrift(app, focus, preRuntimeCounts) {
  const [updateRows, classStartRows, entryGoRows, classOogRows] = await Promise.all([
    readCurrentRows(app, TABLES.updateSchedule, focus.show_no, focus.focus_day),
    readCurrentRows(app, TABLES.classStartTimes, focus.show_no, focus.focus_day),
    readCurrentRows(app, TABLES.entryGoTimes, focus.show_no, focus.focus_day),
    readCurrentRows(app, TABLES.classOog, focus.show_no, focus.focus_day, "focus_day_only")
  ]);
  const activeUpdatePreflight = updateRows
    .filter((row) => text(row.status) !== "dropped_old_key_shape")
    .map((row) => ({ row, reasons: preflightReason(row) }))
    .filter(isUnexpectedActivePreflight);
  const runtimeTicketedClassStarts = classStartRows
    .filter((row) => text(row.status) !== "dropped_old_key_shape")
    .map((row) => ({ row, reasons: ticketedClassReason(row) }))
    .filter((item) => item.reasons.length > 0);
  const classOogEntryKeys = new Set(classOogRows
    .map((row) => text(row.entry_const_key || row.class_oog_key))
    .filter(Boolean));
  const entryWithoutClassOog = entryGoRows
    .filter((row) => text(row.status) !== "dropped_old_key_shape")
    .filter((row) => {
      const key = text(row.entry_const_key || row.entry_go_key);
      return key && !classOogEntryKeys.has(key);
    });
  const reasons = [];
  if (activeUpdatePreflight.length) reasons.push("active_update_schedule_preflight_rows");
  if (runtimeTicketedClassStarts.length) reasons.push("runtime_ticketed_schooling_rows");
  if (entryWithoutClassOog.length) reasons.push("entry_go_rows_without_class_oog_source");
  return {
    ok: reasons.length === 0,
    reasons,
    pre_runtime_counts: preRuntimeCounts,
    source_counts: {
      hs_update_schedule: updateRows.length,
      hs_class_start_times: classStartRows.length,
      hs_entry_go_times: entryGoRows.length,
      hs_class_oog: classOogRows.length
    },
    findings: {
      active_update_schedule_preflight_rows: activeUpdatePreflight.length,
      runtime_ticketed_schooling_rows: runtimeTicketedClassStarts.length,
      entry_go_rows_without_class_oog_source: entryWithoutClassOog.length
    },
    samples: {
      active_update_schedule_preflight_rows: activeUpdatePreflight.slice(0, 5).map((item) => ({
        update_schedule_key: text(item.row.update_schedule_key || item.row.class_const_key),
        class_name: text(item.row.class_name),
        reasons: item.reasons
      })),
      runtime_ticketed_schooling_rows: runtimeTicketedClassStarts.slice(0, 5).map((item) => ({
        class_start_key: text(item.row.class_start_key || item.row.class_const_key),
        class_name: text(item.row.class_name),
        reasons: item.reasons
      })),
      entry_go_rows_without_class_oog_source: entryWithoutClassOog.slice(0, 5).map((row) => ({
        entry_go_key: text(row.entry_go_key || row.entry_const_key),
        class_no: intValue(row.class_no),
        horse: text(row.horse)
      }))
    }
  };
}

function isUnexpectedActivePreflight(item) {
  const isPreflight = item.row.is_preflight === true
    || Number(item.row.is_preflight) === 1
    || text(item.row.is_preflight).toLowerCase() === "true";
  return item.reasons.length > 0
    && !isPreflight
    && text(item.row.status) !== "preflight";
}

async function runCleanCadenceStack(app, options = {}) {
  const runId = options.run_id || `clean-stack-${Date.now()}`;
  const probeLimit = intValue(options.probe_limit || options.limit) || 300;
  const parseLimit = intValue(options.parse_limit) || 300;
  const activeFocus = await getActiveFocusShow();
  const preRuntimeCounts = {
    hs_class_oog: await countCurrentRows(app, TABLES.classOog, activeFocus.show_no, activeFocus.focus_day),
    hs_ring_status: await countCurrentRows(app, TABLES.ringStatus, activeFocus.show_no, activeFocus.focus_day),
    hs_class_start_times: await countCurrentRows(app, TABLES.classStartTimes, activeFocus.show_no, activeFocus.focus_day),
    hs_entry_go_times: await countCurrentRows(app, TABLES.entryGoTimes, activeFocus.show_no, activeFocus.focus_day)
  };
  const preRuntimeExists = preRuntimeCounts.hs_class_oog > 0
    && preRuntimeCounts.hs_ring_status > 0
    && preRuntimeCounts.hs_class_start_times > 0
    && preRuntimeCounts.hs_entry_go_times > 0;
  const coreRuntimeDrift = preRuntimeExists
    ? await summarizeCoreRuntimeDrift(app, activeFocus, preRuntimeCounts)
    : { ok: true, reasons: [], pre_runtime_counts: preRuntimeCounts };
  if (preRuntimeExists && coreRuntimeDrift.ok) {
    let timeEngine = null;
    try {
      timeEngine = await runTimeEngineOnly(app, {
        ...options,
        run_id: `${runId}-time-engine-seed`,
        wake_reason: "core_runtime_ready"
      });
    } catch (error) {
      timeEngine = {
        ok: false,
        mode: "wec-time-engine",
        wake_reason: "core_runtime_ready",
        blocker: text(error?.message || error),
        workflow_run: false,
        live_run: false,
        alerts_run: false,
        output_publish_run: false
      };
    }
    const timeEngineOk = Boolean(timeEngine?.ok) && text(timeEngine?.status) !== "SKIPPED";
    const result = {
      ok: timeEngineOk,
      mode: "wec-clean-cadence-stack",
      run_id: runId,
      focus: activeFocus,
      stage1_run: false,
      step2_run: false,
      stage3a_run: false,
      stage3b_run: false,
      step4_run: false,
      time_engine: timeEngine,
      stop_stage: "4",
      stop_reason: timeEngineOk ? "runtime_already_complete_time_engine_seeded" : "time_engine_seed_wake_failed",
      next_stage: timeEngineOk ? "live_enrich_or_time_engine_clock" : "time_engine",
      missing_contract_fields: [],
      core_runtime_drift: coreRuntimeDrift,
      mirror_backlog: {
        deferred: true,
        reason: "airtable_mirror_outside_core_hot_lane"
      },
      live_run: false,
      alerts_run: false,
      output_run: false,
      time_engine_run: Boolean(timeEngine)
    };
    result.heartbeat_finalized = await writeStandaloneCadenceHeartbeat(app, activeFocus, runId, result);
    return result;
  }
  const build = await runCleanBuildUpdateOnly(app, { ...options, run_id: runId, defer_airtable_mirror: true });
  const finalizeHeartbeat = async (result) => {
    result.core_runtime_drift = result.core_runtime_drift || coreRuntimeDrift;
    const heartbeatId = build.stage1?.heartbeat_id || `${intValue(build.focus.show_no)}|${compactDate(build.focus.focus_day)}|${runId}`;
    const existing = await firstRow(
      app,
      TABLES.heartbeat,
      `SELECT ROWID, heartbeat_id FROM ${TABLES.heartbeat} WHERE heartbeat_id = ${zcqlValue(heartbeatId)} LIMIT 1`
    );
    if (!existing?.ROWID) return { skipped: true, reason: "heartbeat_not_found" };
    const payload = {
      clean_proof: true,
      mode: result.mode,
      run_id: result.run_id,
      stop_stage: result.stop_stage,
      stop_reason: result.stop_reason,
      next_stage: result.next_stage,
      core_runtime_drift: result.core_runtime_drift || coreRuntimeDrift,
      missing_contract_fields: result.missing_contract_fields || [],
      stage3a: result.stage3a?.probe3a
        ? {
          attempted: result.stage3a.probe3a.attempted,
          raw_stored: result.stage3a.probe3a.raw_stored,
          checked_no_match: result.stage3a.probe3a.checked_no_match,
          failed: result.stage3a.probe3a.failed,
          failed_examples: result.stage3a.probe3a.failed_examples || []
        }
        : undefined,
      stage3b: result.stage3b
        ? {
          raw_docs_total: result.stage3b.raw_docs_total,
          raw_docs_parsed: result.stage3b.raw_docs_parsed,
          raw_docs_failed: result.stage3b.raw_docs_failed
        }
        : undefined,
      schedule_probe_mirror: result.schedule_probe_mirror
        ? {
          ok: result.schedule_probe_mirror.ok,
          reviewed: result.schedule_probe_mirror.reviewed,
          mirrored: result.schedule_probe_mirror.mirrored,
          errors: result.schedule_probe_mirror.errors || []
        }
        : undefined,
      raw_mirror: result.raw_mirror
        ? {
          ok: result.raw_mirror.ok,
          reviewed: result.raw_mirror.reviewed,
          mirrored: result.raw_mirror.mirrored,
          errors: result.raw_mirror.errors || []
        }
        : undefined,
      step4: result.step4
        ? {
          ok: result.step4.ok,
          blocker: result.step4.blocker,
          source_counts: result.step4.source_counts,
          class_oog_scope: result.step4.class_oog_scope,
          planned_rows: result.step4.planned_rows,
          destination_counts: result.step4.destination_counts,
          key_samples: result.step4.key_samples
        }
        : undefined,
      stage4_detail: result.stage4_detail,
      step4_mirror: result.step4_mirror
        ? {
          ok: result.step4_mirror.ok,
          mirror_table: result.step4_mirror.mirror_table,
          processed: result.step4_mirror.processed,
          total: result.step4_mirror.total,
          next_offset: result.step4_mirror.next_offset,
          complete: result.step4_mirror.complete
        }
        : undefined,
      step4_mirror_state: result.step4_mirror_state,
      mirror_backlog: result.mirror_backlog,
      time_engine: result.time_engine
        ? {
          ok: result.time_engine.ok,
          status: result.time_engine.status,
          wake_reason: result.time_engine.wake_reason,
          gate_reason: result.time_engine.gate_reason,
          blocker: result.time_engine.blocker,
          skip_reason: result.time_engine.skip_reason,
          rows_written: result.time_engine.rows_written,
          total_rows: result.time_engine.total_rows,
          trigger_ready_count: result.time_engine.trigger_ready_count,
          trigger_candidates: result.time_engine.trigger_candidates,
          triggers_inserted: result.time_engine.triggers_inserted,
          triggers_existing: result.time_engine.triggers_existing,
          source_counts: result.time_engine.source_counts
        }
        : undefined,
      before: result.before,
      after: result.after
    };
    const heartbeatFields = {
      ROWID: existing.ROWID,
      status: result.ok ? "complete" : "failed",
      blocker: result.ok ? "" : text(result.stop_reason),
      payload_json: JSON.stringify(payload),
      run_time: catalystDateTime()
    };
    const catalystResult = await app.datastore().table(TABLES.heartbeat).updateRow(heartbeatFields);
    return { ...catalystResult, airtable_mirror: false, airtable_mirror_disabled: true };
  };

  if (intValue(build.stage2?.non_preflight_rows) === 0) {
    const after = await summarizeCleanStageState(app, build.focus);
    const result = {
      ok: false,
      mode: "wec-clean-cadence-stack",
      run_id: runId,
      focus: build.focus,
      stage1: build.stage1,
      stage2: build.stage2,
      stage3a_run: false,
      stage3b_run: false,
      step4_run: false,
      stop_stage: "2",
      stop_reason: "missing_current_hs_update_schedule",
      source_cleanup: { skipped: true, reason: "stage2_not_complete" },
      before: after,
      after,
      next_stage: "2",
      live_run: false,
      alerts_run: false,
      output_run: false
    };
    result.heartbeat_finalized = await finalizeHeartbeat(result);
    return result;
  }

  const stage12MirrorWarnings = (build.missing_contract_fields || [])
    .filter((field) => text(field).startsWith("airtable.hs_get_ring_days") || text(field).startsWith("airtable.hs_update_schedule"));

  const evidence = await buildCatalystProbeEvidence(app, build.focus);
  const sourceCleanup = await cleanSource13State(app, build.focus, evidence);
  const rawAccounting = await ensureClassOogRawAccountingRows(app, build.focus);
  const rawAccountingMirror = {
    skipped: true,
    deferred: true,
    reason: "airtable_mirror_outside_core_hot_lane"
  };
  const before = await summarizeCleanStageState(app, build.focus);

  if (before.probe_unchecked_rows > 0) {
    const stage3a = await runFast3AOnly(app, {
      ...options,
      run_id: runId,
      limit: probeLimit,
      mode: "next_unchecked"
    });
    const after = await summarizeCleanStageState(app, build.focus);
    const scheduleProbeMirror = { skipped: true, deferred: true, reason: "airtable_mirror_outside_core_hot_lane" };
    const rawMirror = { skipped: true, deferred: true, reason: "airtable_mirror_outside_core_hot_lane" };
    const result = {
      ok: Boolean(stage3a.ok),
      mode: "wec-clean-cadence-stack",
      run_id: runId,
      focus: build.focus,
      stage1: build.stage1,
      stage2: build.stage2,
      stage3a,
      schedule_probe_mirror: scheduleProbeMirror,
      raw_mirror: rawMirror,
      stage3b_run: false,
      step4_run: false,
      stop_stage: "3A",
      stop_reason: after.probe_unchecked_rows > 0 ? "probe_remaining" : "probe_complete_parse_next",
      missing_contract_fields: stage12MirrorWarnings,
      source_cleanup: sourceCleanup,
      raw_accounting: rawAccounting,
      raw_accounting_mirror: rawAccountingMirror,
      before,
      after,
      next_stage: after.probe_unchecked_rows > 0 ? "3A" : "3B",
      mirror_backlog: {
        deferred: true,
        reason: "airtable_mirror_outside_core_hot_lane",
        warnings: stage12MirrorWarnings
      },
      live_run: false,
      alerts_run: false,
      output_run: false
    };
    result.heartbeat_finalized = await finalizeHeartbeat(result);
    return result;
  }

  if (before.raw_docs_pending_parse > 0) {
    const stage3b = await runFast3BOnly(app, {
      ...options,
      run_id: runId,
      limit: parseLimit
    });
    const after = await summarizeCleanStageState(app, build.focus);
    const scheduleProbeMirror = { skipped: true, deferred: true, reason: "airtable_mirror_outside_core_hot_lane" };
    const rawMirror = { skipped: true, deferred: true, reason: "airtable_mirror_outside_core_hot_lane" };
    const result = {
      ok: Boolean(stage3b.ok),
      mode: "wec-clean-cadence-stack",
      run_id: runId,
      focus: build.focus,
      stage1: build.stage1,
      stage2: build.stage2,
      stage3a_run: false,
      stage3b,
      schedule_probe_mirror: scheduleProbeMirror,
      raw_mirror: rawMirror,
      step4_run: false,
      stop_stage: "3B",
      stop_reason: stage3b.ok
        ? (after.raw_docs_pending_parse > 0 ? "parse_remaining" : "parse_complete_runtime_next")
        : "parse_failed",
      missing_contract_fields: stage12MirrorWarnings,
      source_cleanup: sourceCleanup,
      raw_accounting: rawAccounting,
      raw_accounting_mirror: rawAccountingMirror,
      before,
      after,
      next_stage: stage3b.ok && after.raw_docs_pending_parse === 0 ? "4" : "3B",
      mirror_backlog: {
        deferred: true,
        reason: "airtable_mirror_outside_core_hot_lane",
        warnings: stage12MirrorWarnings
      },
      live_run: false,
      alerts_run: false,
      output_run: false
    };
    result.heartbeat_finalized = await finalizeHeartbeat(result);
    return result;
  }

  const step4 = await runStep4RuntimePrepCleanOnly(app, { ...options, run_id: runId });
  const after = await summarizeCleanStageState(app, build.focus);
  let timeEngine = null;
  if (step4.ok) {
    try {
      timeEngine = await runTimeEngineOnly(app, {
        ...options,
        run_id: `${runId}-time-engine-seed`,
        wake_reason: "core_runtime_ready"
      });
    } catch (error) {
      timeEngine = {
        ok: false,
        mode: "wec-time-engine",
        wake_reason: "core_runtime_ready",
        blocker: text(error?.message || error),
        workflow_run: false,
        live_run: false,
        alerts_run: false,
        output_publish_run: false
      };
    }
  }
  const timeEngineOk = !step4.ok || (Boolean(timeEngine?.ok) && text(timeEngine?.status) !== "SKIPPED");
  const ok = Boolean(step4.ok) && timeEngineOk;
  const stopReason = step4.blocker
    || (!timeEngineOk ? "time_engine_seed_wake_failed" : "runtime_complete_time_engine_seeded");
  const result = {
    ok,
    mode: "wec-clean-cadence-stack",
    run_id: runId,
    focus: build.focus,
    stage1: build.stage1,
    stage2: build.stage2,
    stage3a_run: false,
    stage3b_run: false,
    step4,
    time_engine: timeEngine,
    stop_stage: !step4.ok ? "4_failed" : "4",
    stop_reason: stopReason,
    stage4_detail: stage4GateDetail(before, after, step4),
    source_cleanup: sourceCleanup,
    raw_accounting: rawAccounting,
    raw_accounting_mirror: rawAccountingMirror,
    mirror_backlog: {
      deferred: true,
      reason: "airtable_mirror_outside_core_hot_lane",
      warnings: stage12MirrorWarnings
    },
    before,
    after,
    next_stage: ok ? "live_enrich_or_time_engine_clock" : "time_engine",
    live_run: false,
    alerts_run: false,
    output_run: false,
    time_engine_run: Boolean(timeEngine)
  };
  result.heartbeat_finalized = await finalizeHeartbeat(result);
  return result;
}

async function runCleanStage1To4Proof(app, options = {}) {
  const context = {
    run_id: options.run_id || `clean-stage1-4-${Date.now()}`,
    started_at: new Date().toISOString()
  };
  const adapters = await makeAdapters(app, { ...options, run_id: context.run_id, defer_airtable_mirror: false });

  const stage1 = await runStage1HeartbeatAndRingDays(adapters, context);
  const stage2 = await runStage2UpdateSchedule(adapters, context, stage1);
  const evidence = await adapters.buildProbeEvidence(stage1.focus, { context });
  const eligibleRows = stage2.eligible_rows;
  const requestedLimit = intValue(options.limit);
  const probeRows = options.class_no
    ? eligibleRows.filter((row) => intValue(row.class_no) === intValue(options.class_no))
    : requestedLimit > 0
      ? eligibleRows.slice(0, requestedLimit)
      : eligibleRows;

  const stage3a = await runProbe3A(adapters, context, stage1.focus, probeRows, evidence);
  const stage3b = await runProbe3B(adapters, context, stage1.focus, evidence);
  const stage3bFailures = stage3b.filter((item) => item.error).length;
  const stage3bRows = stage3b.reduce((sum, item) => sum + (item.rows?.length || 0), 0);

  if (stage3bFailures) {
    return {
      ok: false,
      mode: "wec-clean-stage1-4-proof",
      run_id: context.run_id,
      focus: stage1.focus,
      stop_stage: "3B",
      blocker: "stage3b_parse_failed",
      stage1: {
        heartbeat_id: stage1.heartbeat?.heartbeat_id || stage1.heartbeat?.id || "",
        hs_get_ring_days_rows: stage1.rows.length,
        upsert: stage1.upsert
      },
      stage2: {
        hs_update_schedule_rows: stage2.rows.length,
        non_preflight_rows: stage2.eligible_rows.length,
        upsert: stage2.upsert,
        dropped: stage2.dropped
      },
      stage3a: {
        attempted: stage3a.length,
        raw_stored: stage3a.filter((item) => item.progress?.probe_raw_stored).length,
        checked_no_match: stage3a.filter((item) => item.progress?.probe_status === "checked").length,
        failed: stage3a.filter((item) => item.error).length
      },
      stage3b: {
        raw_docs_attempted: stage3b.length,
        raw_docs_failed: stage3bFailures,
        hs_class_oog_rows: stage3bRows
      },
      step4_run: false,
      live_run: false,
      alerts_run: false,
      output_run: false,
      missing_contract_fields: adapters.missingContractFields()
    };
  }

  const step4 = await runStep4RuntimePrepCleanOnly(app, { ...options, run_id: context.run_id });

  return {
    ok: Boolean(step4.ok),
    mode: "wec-clean-stage1-4-proof",
    run_id: context.run_id,
    focus: stage1.focus,
    stop_stage: step4.ok ? "4" : "4_failed",
    blocker: step4.blocker || "",
    stage1: {
      heartbeat_id: stage1.heartbeat?.heartbeat_id || stage1.heartbeat?.id || "",
      hs_get_ring_days_rows: stage1.rows.length,
      upsert: stage1.upsert
    },
    stage2: {
      hs_update_schedule_rows: stage2.rows.length,
      non_preflight_rows: stage2.eligible_rows.length,
      upsert: stage2.upsert,
      dropped: stage2.dropped
    },
    stage3a: {
      attempted: stage3a.length,
      raw_stored: stage3a.filter((item) => item.progress?.probe_raw_stored).length,
      checked_no_match: stage3a.filter((item) => item.progress?.probe_status === "checked").length,
      failed: stage3a.filter((item) => item.error).length
    },
    stage3b: {
      raw_docs_attempted: stage3b.length,
      raw_docs_parsed: stage3b.filter((item) => !item.error).length,
      raw_docs_failed: stage3bFailures,
      hs_class_oog_rows: stage3bRows
    },
    step4: {
      source_counts: step4.source_counts,
      class_oog_scope: step4.class_oog_scope,
      planned_rows: step4.planned_rows,
      catalyst_upserts: step4.catalyst_upserts,
      stale_cleanup: step4.stale_cleanup,
      destination_counts: step4.destination_counts,
      key_samples: step4.key_samples,
      missing_contract_fields: step4.missing_contract_fields,
      missing_required_columns: step4.missing_required_columns
    },
    step4_run: Boolean(step4.step4_run),
    live_run: false,
    alerts_run: false,
    output_run: false,
    missing_contract_fields: Array.from(new Set([
      ...adapters.missingContractFields(),
      ...(step4.missing_contract_fields || [])
    ]))
  };
}

function classOogRawMirrorFields(row) {
  return {
    raw_key: row.raw_key,
    show_no: intValue(row.show_no),
    focus_day: row.focus_day,
    ring_no: intValue(row.ring_no),
    ring_name_normalized: row.ring_name_normalized,
    class_no: intValue(row.class_no),
    class_name: row.class_name,
    probe_status: row.probe_status,
    possible_match: row.possible_match === true || text(row.possible_match).toLowerCase() === "true",
    raw_stored: row.raw_stored === true || text(row.raw_stored).toLowerCase() === "true",
    probe_payload_chars: intValue(row.probe_payload_chars),
    probe_certainty: row.probe_certainty,
    probe_reason: row.probe_reason,
    parsed_status: row.parsed_status,
    parse_status: row.parse_status,
    matched_count: intValue(row.matched_count),
    skipped_count: intValue(row.skipped_count),
    iso_date: row.iso_date || row.focus_day,
    parse_error: row.parse_error,
    raw_html: row.raw_html,
    last_synced_at: row.last_synced_at || row.probe_finished_at,
    probe_finished_at: row.probe_finished_at,
    probe_duration_ms: intValue(row.probe_duration_ms),
    show_const_key: row.show_const_key,
    focus_day_const_key: row.focus_day_const_key,
    ring_day_const_key: row.ring_day_const_key,
    ring_const_key: row.ring_const_key,
    class_const_key: row.class_const_key
  };
}

async function mirrorCurrentClassOogRawToAirtable(app, focus, limit = 300) {
  const rows = await zcqlRows(
    app,
    TABLES.classOogRaw,
    `SELECT * FROM ${TABLES.classOogRaw} WHERE show_no = ${Number(focus.show_no)} AND focus_day = ${zcqlValue(focus.focus_day)} LIMIT ${Number(limit) || 300}`
  );
  const candidates = rows.filter((row) => text(row.raw_key));
  const errors = [];
  let mirrored = 0;
  for (const row of candidates) {
    try {
      await upsertAirtableByKey(TABLES.classOogRaw, "raw_key", row.raw_key, classOogRawMirrorFields(row));
      mirrored += 1;
    } catch (error) {
      errors.push(`airtable.${TABLES.classOogRaw}.${text(row.raw_key)}:${String(error?.message || error).slice(0, 180)}`);
    }
  }
  return {
    ok: errors.length === 0,
    table: TABLES.classOogRaw,
    reviewed: candidates.length,
    mirrored,
    errors
  };
}

async function mirrorCurrentUpdateScheduleProbeToAirtable(app, focus, limit = 300) {
  const rows = await readCurrentRows(app, TABLES.updateSchedule, focus.show_no, focus.focus_day);
  const candidates = rows
    .filter((row) => intValue(row.class_no) > 0)
    .slice(0, Number(limit) || 300);
  const errors = [];
  let mirrored = 0;
  for (const row of candidates) {
    try {
      await updateAirtableScheduleProbe(row, row);
      mirrored += 1;
    } catch (error) {
      errors.push(`airtable.${TABLES.updateSchedule}.${text(row.class_const_key || row.class_no)}:${String(error?.message || error).slice(0, 180)}`);
    }
  }
  return {
    ok: errors.length === 0,
    table: TABLES.updateSchedule,
    reviewed: candidates.length,
    mirrored,
    errors
  };
}

async function ensureClassOogRawAccountingRows(app, focus) {
  const schema = await loadSchema(app);
  const missingContractFields = [];
  const scheduleRows = (await readCurrentRows(app, TABLES.updateSchedule, focus.show_no, focus.focus_day))
    .map((row) => scheduleRowForProof(row, focus))
    .filter((row) => intValue(row.class_no) > 0)
    .filter((row) => ["checked", "raw_stored"].includes(lowerText(row.probe_status)));
  const rawRows = await readCurrentRows(app, TABLES.classOogRaw, focus.show_no, focus.focus_day);
  const existingRawKeys = new Set(rawRows.map((row) => text(row.raw_key || row.class_const_key)).filter(Boolean));
  const rows = [];
  for (const row of scheduleRows) {
    const rawKey = text(row.class_const_key);
    if (!rawKey || existingRawKeys.has(rawKey)) continue;
    const rawStored = lowerText(row.probe_status) === "raw_stored" || row.probe_raw_stored === true || lowerText(row.probe_raw_stored) === "true";
    rows.push({
      raw_key: rawKey,
      heartbeat_id: row.heartbeat_id,
      run_id: text(row.run_id) || `accounting-${Date.now()}`,
      show_no: intValue(row.show_no),
      focus_day: row.focus_day,
      iso_date: row.iso_date || row.focus_day,
      focus_day_key: row.focus_day_key,
      show_const_key: row.show_const_key,
      focus_day_const_key: row.focus_day_const_key,
      ring_day_const_key: row.ring_day_const_key,
      ring_const_key: row.ring_const_key,
      class_const_key: rawKey,
      ring_day_no: intValue(row.ring_day_no),
      ring_no: intValue(row.ring_no),
      ring_name: row.ring_name,
      ring_name_normalized: row.ring_name_normalized,
      ring_name_prioritized: intValue(row.ring_name_prioritized),
      class_no: intValue(row.class_no),
      class_name: row.class_name,
      raw_html: "",
      probe_status: row.probe_status,
      possible_match: rawStored,
      raw_stored: false,
      parsed_status: "not_applicable",
      parse_status: "not_applicable",
      matched_count: 0,
      skipped_count: 0,
      parse_error: "",
      probe_payload_chars: intValue(row.probe_payload_chars),
      probe_finished_at: row.probe_finished_at,
      probe_duration_ms: intValue(row.probe_duration_ms),
      probe_certainty: row.probe_certainty,
      probe_reason: row.probe_reason || "probe_accounting_no_raw_stored",
      last_synced_at: catalystDateTime()
    });
  }
  const upsert = await upsertRowsByKey(app, schema, TABLES.classOogRaw, "raw_key", rows, missingContractFields);
  return {
    reviewed: scheduleRows.length,
    existing: rawRows.length,
    inserted_or_updated: rows.length,
    upsert,
    missing_contract_fields: missingContractFields
  };
}

async function countAirtableCurrentRowsForDay(tableName, focus) {
  const records = await getAirtableRecords(tableName, {
    filterByFormula: `{show_no}=${Number(focus.show_no)}`,
    pageSize: "100"
  });
  return (records || []).filter((record) => {
    const fields = record.fields || {};
    return text(fields.focus_day).slice(0, 10) === text(focus.focus_day)
      || text(fields.iso_date).slice(0, 10) === text(focus.focus_day);
  }).length;
}

async function summarizeStep4MirrorState(focus, catalystCounts) {
  return {
    catalyst: catalystCounts,
    airtable: {
      hs_class_oog: await countAirtableCurrentRowsForDay(TABLES.classOog, focus),
      hs_ring_status: await countAirtableCurrentRowsForDay(TABLES.ringStatus, focus),
      hs_class_start_times: await countAirtableCurrentRowsForDay(TABLES.classStartTimes, focus),
      hs_entry_go_times: await countAirtableCurrentRowsForDay(TABLES.entryGoTimes, focus)
    }
  };
}

function nextStep4MirrorTarget(mirrorState) {
  const order = [
    { table: TABLES.classOog, count: mirrorState.airtable.hs_class_oog, total: mirrorState.catalyst.hs_class_oog },
    { table: TABLES.ringStatus, count: mirrorState.airtable.hs_ring_status, total: mirrorState.catalyst.hs_ring_status },
    { table: TABLES.classStartTimes, count: mirrorState.airtable.hs_class_start_times, total: mirrorState.catalyst.hs_class_start_times },
    { table: TABLES.entryGoTimes, count: mirrorState.airtable.hs_entry_go_times, total: mirrorState.catalyst.hs_entry_go_times }
  ];
  return order.find((item) => Number(item.total) > 0 && Number(item.count) < Number(item.total)) || null;
}

async function writeStandaloneCadenceHeartbeat(app, focus, runId, result) {
  const schema = await loadSchema(app);
  const missingContractFields = [];
  await syncFocusShowMirror(app, schema, focus, missingContractFields);
  const heartbeatId = `${intValue(focus.show_no)}|${compactDate(focus.focus_day)}|${runId}`;
  const payload = {
    clean_proof: true,
    mode: result.mode,
    run_id: runId,
    stop_stage: result.stop_stage,
    stop_reason: result.stop_reason,
    next_stage: result.next_stage,
    missing_contract_fields: result.missing_contract_fields || [],
    step4_mirror: result.step4_mirror
      ? {
        ok: result.step4_mirror.ok,
        mirror_table: result.step4_mirror.mirror_table,
        processed: result.step4_mirror.processed,
        total: result.step4_mirror.total,
        next_offset: result.step4_mirror.next_offset,
        complete: result.step4_mirror.complete
      }
      : undefined,
    step4_mirror_state: result.step4_mirror_state,
    mirror_backlog: result.mirror_backlog
  };
  const row = filterToSchema(schema, TABLES.heartbeat, {
    heartbeat_id: heartbeatId,
    run_id: runId,
    show_no: intValue(focus.show_no),
    focus_day: focus.focus_day,
    iso_date: focus.focus_day,
    focus_day_key: compactDate(focus.focus_day),
    focus_show_record_id: text(focus.focus_show_record_id),
    status: result.ok ? "complete" : "failed",
    blocker: result.ok ? "" : text(result.stop_reason),
    payload_json: JSON.stringify(payload),
    run_time: catalystDateTime()
  }, missingContractFields);
  const catalystResult = await upsertByKey(app, TABLES.heartbeat, "heartbeat_id", row);
  let airtableHeartbeatLinks = null;
  try {
    airtableHeartbeatLinks = await syncAirtableActiveHeartbeatLinks(focus, row);
  } catch (error) {
    airtableHeartbeatLinks = { ok: false, error: String(error?.message || error).slice(0, 240) };
  }
  return {
    ...catalystResult,
    airtable_mirror: false,
    airtable_mirror_disabled: true,
    airtable_heartbeat_links: airtableHeartbeatLinks
  };
}

function classOogMirrorFields(row) {
  return {
    class_oog_key: row.class_oog_key,
    show_no: intValue(row.show_no),
    focus_day: row.focus_day,
    focus_day_key: row.focus_day_key,
    ring_day_no: intValue(row.ring_day_no),
    ring_no: intValue(row.ring_no),
    ring: row.ring,
    class_no: intValue(row.class_no),
    class_label: row.class_label,
    class_name: row.class_name,
    entry_order: intValue(row.entry_order),
    entry_no: intValue(row.entry_no),
    horse: row.horse,
    horses: row.horses || row.horse,
    "follow (from horses)": row["follow (from horses)"],
    rider: row.rider,
    trainer: row.trainer,
    source_endpoint: row.source_endpoint,
    source_payload: row.source_payload,
    iso_date: row.iso_date || row.focus_day,
    show_const_key: row.show_const_key,
    focus_day_const_key: row.focus_day_const_key,
    ring_day_const_key: row.ring_day_const_key,
    ring_const_key: row.ring_const_key,
    class_const_key: row.class_const_key,
    entry_const_key: row.entry_const_key,
    ring_name: row.ring_name,
    ring_name_normalized: row.ring_name_normalized
  };
}

function classOogLogFields(row) {
  const fields = classOogMirrorFields(row);
  delete fields.horses;
  delete fields["follow (from horses)"];
  return fields;
}

function ringStatusMirrorFields(row) {
  return cleanAirtableLogFields({
    ring_status_key: text(row.ring_status_key),
    show_no: intValue(row.show_no),
    focus_day: row.focus_day,
    iso_date: row.iso_date || row.focus_day,
    focus_day_key: row.focus_day_key,
    ring_day_no: intValue(row.ring_day_no),
    ring_no: intValue(row.ring_no),
    ring_name: row.ring_name,
    ring_name_normalized: row.ring_name_normalized,
    current_class_no: optionalIntValue(row.current_class_no),
    n_gone: optionalIntValue(row.n_gone),
    n_to_go: optionalIntValue(row.n_to_go),
    is_live: row.is_live === undefined || row.is_live === null || text(row.is_live) === ""
      ? undefined
      : String(boolValue(row.is_live)),
    status: row.status,
    source: row.source,
    last_synced_at: row.last_synced_at
  });
}

function classStartMirrorFields(row) {
  return {
    class_start_key: text(row.class_start_key),
    show_no: intValue(row.show_no),
    focus_day: row.focus_day,
    ring_day_no: intValue(row.ring_day_no),
    ring_no: intValue(row.ring_no),
    ring_name: row.ring_name,
    ring_name_normalized: row.ring_name_normalized,
    class_no: intValue(row.class_no),
    class_number: intValue(row.class_number),
    class_name: row.class_name,
    class_start_time: row.class_start_time,
    display_time: row.display_time,
    entry_count: intValue(row.entry_count),
    n_gone: intValue(row.n_gone),
    n_to_go: intValue(row.n_to_go),
    elapsed_seconds: intValue(row.elapsed_seconds),
    status: row.status,
    live_source: row.live_source,
    last_synced_at: row.last_synced_at,
    pace_seconds: intValue(row.pace_seconds),
    last_live_synced_at: row.last_live_synced_at,
    result_probe_ready_at: row.result_probe_ready_at,
    result_probe_reason: row.result_probe_reason,
    class_status: row.class_status,
    focus_show: row.focus_show || row.focus_day_const_key,
    iso_date: row.iso_date || row.focus_day,
    ring_visual_key: text(row.ring_visual_key || row.ring_const_key),
    class_visual_key: text(row.class_visual_key || classVisualKeyFromSource(row))
  };
}

function classStartLogFields(row) {
  return cleanAirtableLogFields({
    class_start_key: text(row.class_start_key),
    show_no: intValue(row.show_no),
    focus_day: row.focus_day,
    ring_day_no: intValue(row.ring_day_no),
    ring_no: intValue(row.ring_no),
    ring_name: row.ring_name,
    ring_name_normalized: row.ring_name_normalized,
    class_no: intValue(row.class_no),
    class_number: optionalIntValue(row.class_number),
    class_name: row.class_name,
    class_start_time: row.class_start_time,
    display_time: row.display_time,
    entry_count: intValue(row.entry_count),
    status: row.status,
    live_source: row.live_source,
    last_synced_at: row.last_synced_at,
    n_gone: optionalIntValue(row.n_gone),
    n_to_go: optionalIntValue(row.n_to_go),
    elapsed_seconds: optionalIntValue(row.elapsed_seconds),
    pace_seconds: optionalIntValue(row.pace_seconds),
    last_live_synced_at: row.last_live_synced_at,
    result_probe_ready_at: row.result_probe_ready_at,
    result_probe_reason: row.result_probe_reason,
    class_status: row.class_status,
    focus_show: airtableRecordLinks(row.focus_show || row.focus_show_record_id),
    iso_date: row.iso_date || row.focus_day,
  });
}

function entryGoLogFields(row) {
  return cleanAirtableLogFields({
    entry_go_key: text(row.entry_go_key),
    show_no: intValue(row.show_no),
    focus_day: row.focus_day,
    ring_name_normalized: row.ring_name_normalized,
    class_no: intValue(row.class_no),
    entry_no: intValue(row.entry_no),
    entry_order: intValue(row.entry_order),
    horse: row.horse,
    class_start_time: row.class_start_time,
    rider: row.rider,
    trainer: row.trainer,
    go_time: row.go_time,
    status: row.status,
    last_synced_at: row.last_synced_at,
    pace_seconds: row.pace_seconds === undefined || row.pace_seconds === null
      ? null
      : text(row.pace_seconds),
    live_source: row.live_source,
    last_live_synced_at: row.last_live_synced_at,
    focus_day_key: row.focus_day_key,
    display_time: row.display_time,
    iso_date: row.iso_date || row.focus_day
  });
}

function entryGoMirrorFields(row) {
  return {
    entry_go_key: text(row.entry_go_key),
    show_no: intValue(row.show_no),
    focus_day: row.focus_day,
    ring_name_normalized: row.ring_name_normalized,
    update_schedule_uuid: text(row.update_schedule_uuid || row.class_const_key),
    class_no: intValue(row.class_no),
    entry_no: intValue(row.entry_no),
    entry_order: intValue(row.entry_order),
    horse: row.horse,
    class_start_time: row.class_start_time,
    rider: row.rider,
    trainer: row.trainer,
    go_time: row.go_time,
    status: row.status,
    last_synced_at: row.last_synced_at,
    pace_seconds: intValue(row.pace_seconds),
    live_source: row.live_source,
    last_live_synced_at: row.last_live_synced_at,
    focus_day_key: row.focus_day_key,
    display_time: row.display_time,
    iso_date: row.iso_date || row.focus_day
  };
}

async function runStep4RuntimePrepCleanOnly(app, options = {}) {
  const focus = await getActiveFocusShow();
  if (!focus?.show_no) throw new Error("focus_show.show_no_required");
  if (!focus?.focus_day) throw new Error("focus_show.focus_day_required");
  if (focus.is_pause === true || text(focus.is_pause).toLowerCase() === "true") {
    throw new Error("focus_show.is_pause");
  }

  const runTime = new Date();
  const schema = await loadSchema(app);
  const missingContractFields = [];
  const missingRequiredStep4Columns = missingRequiredColumns(schema, STEP4_REQUIRED_COLUMNS);
  const ringDayRows = await readCurrentRows(app, TABLES.getRingDays, focus.show_no, focus.focus_day, "iso_date");
  const updateRows = await readCurrentRows(app, TABLES.updateSchedule, focus.show_no, focus.focus_day);
  const classOogRows = await readCurrentRows(app, TABLES.classOog, focus.show_no, focus.focus_day, "focus_day_only");
  const evidence = await buildCatalystProbeEvidence(app, focus);
  const matchedClassOogRows = [];
  const skippedClassOogRows = [];
  for (const row of classOogRows) {
    const match = rowMatchesEvidence(row, evidence);
    if (match.keep) matchedClassOogRows.push({ ...row, match_reason: match.trainer_matches.length ? "trainer_allowed" : "helper_match" });
    else skippedClassOogRows.push(row);
  }
  const ringStatusRows = ringStatusRowsFromRingDays(ringDayRows, focus, runTime);
  const classStartRows = classStartRowsFromUpdateSchedule(updateRows, focus, runTime);
  const classStartByClassKey = new Map(classStartRows.map((row) => [text(row.class_const_key), row]));
  const entryGoRows = entryGoRowsFromClassOog(matchedClassOogRows, focus, classStartByClassKey, runTime);

  let blocker = "";
  if (missingRequiredStep4Columns.length) blocker = "missing_step4_required_columns";
  else if (!ringDayRows.length) blocker = "missing_current_hs_get_ring_days";
  else if (!updateRows.length) blocker = "missing_current_hs_update_schedule";
  else if (!classOogRows.length) blocker = "missing_current_hs_class_oog";
  else if (!ringStatusRows.length) blocker = "hs_ring_status_source_empty";
  else if (!classStartRows.length) blocker = "hs_class_start_times_source_empty";
  else if (!entryGoRows.length) blocker = "hs_entry_go_times_source_empty";

  let ringStatusResult = { rows: 0, inserted: 0, updated: 0 };
  let classStartResult = { rows: 0, inserted: 0, updated: 0 };
  let entryGoResult = { rows: 0, inserted: 0, updated: 0 };
  let staleCleanup = {
    hs_ring_status: { reviewed: 0, deleted: 0 },
    hs_class_start_times: { reviewed: 0, deleted: 0 },
    hs_entry_go_times: { reviewed: 0, deleted: 0 }
  };
  const ringStatusKeys = new Set(ringStatusRows.map((row) => text(row.ring_status_key)).filter(Boolean));
  const classStartKeys = new Set(classStartRows.map((row) => text(row.class_start_key)).filter(Boolean));
  const entryGoKeys = new Set(entryGoRows.map((row) => text(row.entry_go_key)).filter(Boolean));
  if (!blocker) {
    staleCleanup = {
      hs_ring_status: await deleteRowsNotInKeySet(app, TABLES.ringStatus, "ring_status_key", focus.show_no, focus.focus_day, ringStatusKeys),
      hs_class_start_times: await deleteRowsNotInKeySet(app, TABLES.classStartTimes, "class_start_key", focus.show_no, focus.focus_day, classStartKeys),
      hs_entry_go_times: await deleteRowsNotInKeySet(app, TABLES.entryGoTimes, "entry_go_key", focus.show_no, focus.focus_day, entryGoKeys)
    };
    ringStatusResult = await upsertRowsByKey(app, schema, TABLES.ringStatus, "ring_status_key", ringStatusRows, missingContractFields);
    classStartResult = await upsertRowsByKey(app, schema, TABLES.classStartTimes, "class_start_key", classStartRows, missingContractFields);
    entryGoResult = await upsertRowsByKey(app, schema, TABLES.entryGoTimes, "entry_go_key", entryGoRows, missingContractFields);
  }

  const destinationCounts = {
    hs_ring_status: await countCurrentRows(app, TABLES.ringStatus, focus.show_no, focus.focus_day),
    hs_class_start_times: await countCurrentRows(app, TABLES.classStartTimes, focus.show_no, focus.focus_day),
    hs_entry_go_times: await countCurrentRows(app, TABLES.entryGoTimes, focus.show_no, focus.focus_day)
  };

  return {
    ok: !blocker,
    mode: "wec-step4-runtime-prep-clean",
    run_id: options.run_id || `clean-step4-${Date.now()}`,
    focus,
    source_counts: {
      hs_get_ring_days: ringDayRows.length,
      hs_update_schedule: updateRows.length,
      hs_class_oog: classOogRows.length
    },
    class_oog_scope: {
      matched_for_entry_go_times: matchedClassOogRows.length,
      skipped_broad_rows: skippedClassOogRows.length
    },
    planned_rows: {
      hs_ring_status: ringStatusRows.length,
      hs_class_start_times: classStartRows.length,
      hs_entry_go_times: entryGoRows.length
    },
    catalyst_upserts: {
      hs_ring_status: ringStatusResult,
      hs_class_start_times: classStartResult,
      hs_entry_go_times: entryGoResult
    },
    stale_cleanup: staleCleanup,
    destination_counts: destinationCounts,
    key_samples: {
      ring_status_key: ringStatusRows[0]?.ring_status_key || "",
      class_start_key: classStartRows[0]?.class_start_key || "",
      entry_go_key: entryGoRows[0]?.entry_go_key || ""
    },
    missing_contract_fields: missingContractFields,
    missing_required_columns: missingRequiredStep4Columns,
    blocker,
    airtable_mirror_deferred: true,
    step1_run: false,
    step2_run: false,
    stage3a_run: false,
    stage3b_run: false,
    step4_run: !blocker,
    live_run: false,
    alerts_run: false,
    output_run: false
  };
}

async function runStep4AirtableMirrorOnly(app, options = {}) {
  const focus = await getActiveFocusShow();
  if (!focus?.show_no) throw new Error("focus_show.show_no_required");
  if (!focus?.focus_day) throw new Error("focus_show.focus_day_required");
  const mirrorTable = text(options.mirror_table || options.table || TABLES.ringStatus);
  const requestedOffset = Math.max(0, intValue(options.offset));
  const requestedLimit = intValue(options.limit) || STAGE_4S_SYNC_DEFAULT_LIMIT;
  const readRows = async (tableName) => readCurrentRows(app, tableName, focus.show_no, focus.focus_day, "focus_day_only");

  let keyField = "";
  let mirrorFields = null;
  if (mirrorTable === TABLES.ringStatus) {
    keyField = "ring_status_key";
    mirrorFields = ringStatusMirrorFields;
  } else if (mirrorTable === TABLES.classStartTimes) {
    keyField = "class_start_key";
    mirrorFields = classStartMirrorFields;
  } else if (mirrorTable === TABLES.entryGoTimes) {
    keyField = "entry_go_key";
    mirrorFields = entryGoMirrorFields;
  } else {
    throw new Error(`unsupported_step4_mirror_table:${mirrorTable}`);
  }

  const rows = (await readRows(mirrorTable))
    .filter((row) => text(row[keyField]) && text(row.status) === "active");
  const activeKeys = new Set(rows.map((row) => text(row[keyField])).filter(Boolean));
  const staleAirtableCleanup = requestedOffset === 0
    ? await markAirtableRowsNotInKeySet(mirrorTable, keyField, focus, activeKeys)
    : { reviewed: 0, marked: 0 };
  let mirrored = 0;
  for (const row of rows.slice(requestedOffset, requestedOffset + requestedLimit)) {
    await upsertAirtableByKey(mirrorTable, keyField, row[keyField], mirrorFields(row));
    mirrored += 1;
  }
  const nextOffset = requestedOffset + mirrored < rows.length ? requestedOffset + mirrored : 0;
  return {
    ok: true,
    mode: "stage-4S-sync",
    endpoint_alias: "wec-step4-airtable-mirror",
    focus,
    mirror_table: mirrorTable,
    key_field: keyField,
    offset: requestedOffset,
    limit: requestedLimit,
    processed: mirrored,
    total: rows.length,
    stale_airtable_cleanup: staleAirtableCleanup,
    next_offset: nextOffset,
    complete: nextOffset === 0,
    step1_run: false,
    step2_run: false,
    stage3a_run: false,
    stage3b_run: false,
    step4_run: false,
    live_run: false,
    alerts_run: false,
    output_run: false
  };
}

function currentStageAirtableFilter(focus) {
  return `AND({show_no}=${Number(focus.show_no)},DATETIME_FORMAT({focus_day}, 'YYYY-MM-DD')='${airtableFormulaValue(focus.focus_day)}')`;
}

async function appendCurrentStageTableLog({
  tableName,
  keyField,
  rows,
  mapper,
  focus,
  limit = STAGE_4S_SYNC_DEFAULT_LIMIT
}) {
  const existing = await getAirtableRecords(tableName, {
    filterByFormula: currentStageAirtableFilter(focus),
    pageSize: "100"
  });
  const mapped = (rows || []).map(mapper).filter((row) => text(row[keyField]));
  const plan = planAirtableRowsByKey(mapped, existing, keyField);
  const safeLimit = Math.max(0, intValue(limit));
  const creates = plan.creates.slice(0, safeLimit);
  const updates = plan.updates.slice(0, Math.max(0, safeLimit - creates.length));
  const created = await upsertAirtableBatchByKey(tableName, keyField, creates);
  const updated = await updateAirtableRecordsInBatches(tableName, updates);
  const pending = plan.creates.length + plan.updates.length - created - updated;
  return {
    table: tableName,
    source_rows: mapped.length,
    existing_records: existing.length,
    existing_unique: plan.existing_unique,
    unchanged: plan.unchanged,
    updated,
    created,
    processed: updated + created,
    pending,
    complete: pending === 0,
    key_upsert: true
  };
}

async function runCoreAirtableLogsOnly(app) {
  const focus = await getActiveFocusShow();
  if (!focus?.show_no) throw new Error("focus_show.show_no_required");
  if (!focus?.focus_day) throw new Error("focus_show.focus_day_required");
  const readRows = (tableName, dateField = "focus_day") => (
    readCurrentRows(app, tableName, focus.show_no, focus.focus_day, dateField)
  );
  const updateRows = await readRows(TABLES.updateSchedule);
  const rawRows = await readRows(TABLES.classOogRaw);
  const classOogRows = await readRows(TABLES.classOog, "focus_day_only");
  const ringStatusRows = await readRows(TABLES.ringStatus, "focus_day_only");
  const classStartRows = await readRows(TABLES.classStartTimes, "focus_day_only");
  const entryGoRows = await readRows(TABLES.entryGoTimes, "focus_day_only");

  const tableSpecs = [
    ["hs_class_oog_raw", TABLES.classOogRaw, "raw_key", rawRows, classOogRawMirrorFields],
    ["hs_class_oog", TABLES.classOog, "class_oog_key", classOogRows, classOogLogFields],
    ["hs_ring_status", TABLES.ringStatus, "ring_status_key", ringStatusRows, ringStatusMirrorFields],
    ["hs_class_start_times", TABLES.classStartTimes, "class_start_key", classStartRows, classStartLogFields],
    ["hs_entry_go_times", TABLES.entryGoTimes, "entry_go_key", entryGoRows, entryGoLogFields],
    ["hs_update_schedule", TABLES.updateSchedule, "update_schedule_key", updateRows, updateScheduleReviewFields]
  ];
  const logs = {};
  const errors = [];
  let remaining = STAGE_4S_SYNC_DEFAULT_LIMIT;
  for (const [name, tableName, keyField, rows, mapper] of tableSpecs) {
    try {
      logs[name] = await appendCurrentStageTableLog({
        tableName,
        keyField,
        rows,
        mapper,
        focus,
        limit: remaining
      });
      remaining = Math.max(0, remaining - logs[name].processed);
    } catch (error) {
      const message = String(error?.message || error).slice(0, 500);
      logs[name] = { table: tableName, processed: 0, pending: null, complete: false, error: message };
      errors.push({ table: tableName, error: message });
    }
  }
  const logValues = Object.values(logs);
  return {
    ok: true,
    mode: "wec-core-airtable-logs",
    focus,
    key_upsert: true,
    limit: STAGE_4S_SYNC_DEFAULT_LIMIT,
    processed: STAGE_4S_SYNC_DEFAULT_LIMIT - remaining,
    remaining,
    updates: logValues.reduce((sum, item) => sum + (item.updated || 0), 0),
    deletes: 0,
    created: logValues.reduce((sum, item) => sum + (item.created || 0), 0),
    pending: logValues.some((item) => item.pending === null)
      ? null
      : logValues.reduce((sum, item) => sum + (item.pending || 0), 0),
    complete: errors.length === 0 && logValues.every((item) => item.complete),
    disabled_tables: [TABLES.getRingDays],
    warnings: errors,
    logs,
    core_run: false,
    live_run: false,
    time_engine_run: false,
    results_run: false,
    alerts_run: false,
    publish_run: false
  };
}

async function runStep3AirtableMirrorOnly(app, options = {}) {
  const focus = await getActiveFocusShow();
  if (!focus?.show_no) throw new Error("focus_show.show_no_required");
  if (!focus?.focus_day) throw new Error("focus_show.focus_day_required");
  const mirrorTable = text(options.mirror_table || options.table || "hs_update_schedule");
  const requestedOffset = Math.max(0, intValue(options.offset));
  const requestedLimit = intValue(options.limit) || STAGE_4S_SYNC_DEFAULT_LIMIT;

  const updateRows = mirrorTable === "all" || mirrorTable === TABLES.updateSchedule
    ? await readCurrentRows(app, TABLES.updateSchedule, focus.show_no, focus.focus_day)
    : [];
  let updateScheduleMirrored = 0;
  const updateCandidates = updateRows.filter((item) => intValue(item.class_no) > 0);
  for (const row of updateCandidates.slice(requestedOffset, requestedOffset + requestedLimit)) {
    await updateAirtableScheduleProbe(row, row);
    updateScheduleMirrored += 1;
  }

  const rawRows = mirrorTable === "all" || mirrorTable === TABLES.classOogRaw
    ? await zcqlRows(app, TABLES.classOogRaw, `SELECT * FROM ${TABLES.classOogRaw} WHERE show_no = ${Number(focus.show_no)} AND focus_day = ${zcqlValue(focus.focus_day)} LIMIT 300`)
    : [];
  let rawMirrored = 0;
  const rawCandidates = rawRows.filter((item) => text(item.raw_key));
  for (const row of rawCandidates.slice(requestedOffset, requestedOffset + requestedLimit)) {
    await upsertAirtableByKey(TABLES.classOogRaw, "raw_key", row.raw_key, classOogRawMirrorFields(row));
    rawMirrored += 1;
  }

  const classOogRows = mirrorTable === "all" || mirrorTable === TABLES.classOog
    ? await zcqlRows(app, TABLES.classOog, `SELECT * FROM ${TABLES.classOog} WHERE show_no = ${Number(focus.show_no)} AND focus_day = ${zcqlValue(focus.focus_day)} LIMIT 300`)
    : [];
  let classOogMirrored = 0;
  const classOogCandidates = classOogRows.filter((item) => text(item.class_oog_key));
  for (const row of classOogCandidates.slice(requestedOffset, requestedOffset + requestedLimit)) {
    await upsertAirtableByKey(TABLES.classOog, "class_oog_key", row.class_oog_key, classOogMirrorFields(row));
    classOogMirrored += 1;
  }
  const total = mirrorTable === TABLES.updateSchedule
    ? updateCandidates.length
    : mirrorTable === TABLES.classOogRaw
      ? rawCandidates.length
      : mirrorTable === TABLES.classOog
        ? classOogCandidates.length
        : updateCandidates.length + rawCandidates.length + classOogCandidates.length;
  const processed = updateScheduleMirrored + rawMirrored + classOogMirrored;
  const nextOffset = requestedOffset + processed < total ? requestedOffset + processed : 0;

  return {
    ok: true,
    mode: "wec-step3-airtable-mirror",
    focus,
    mirror_table: mirrorTable,
    offset: requestedOffset,
    limit: requestedLimit,
    processed,
    total,
    next_offset: nextOffset,
    complete: nextOffset === 0,
    hs_update_schedule_mirrored: updateScheduleMirrored,
    hs_class_oog_raw_mirrored: rawMirrored,
    hs_class_oog_mirrored: classOogMirrored,
    step1_run: false,
    step2_run: false,
    stage3a_run: false,
    stage3b_run: false,
    step4_run: false,
    live_run: false,
    alerts_run: false,
    output_run: false
  };
}

const CORE_DATA_ENDPOINTS = Object.freeze({
  "wec-data-hs-update-schedule": {
    tableName: TABLES.updateSchedule,
    keyField: "update_schedule_key",
    dateField: "focus_day",
    mapper: updateScheduleReviewFields
  },
  "wec-data-hs-class-oog-raw": {
    tableName: TABLES.classOogRaw,
    keyField: "raw_key",
    dateField: "focus_day",
    mapper: classOogRawMirrorFields
  },
  "wec-data-hs-class-oog": {
    tableName: TABLES.classOog,
    keyField: "class_oog_key",
    dateField: "focus_day_only",
    mapper: classOogLogFields
  },
  "wec-data-hs-ring-status": {
    tableName: TABLES.ringStatus,
    keyField: "ring_status_key",
    dateField: "focus_day_only",
    mapper: ringStatusMirrorFields
  },
  "wec-data-hs-class-start-times": {
    tableName: TABLES.classStartTimes,
    keyField: "class_start_key",
    dateField: "focus_day_only",
    mapper: classStartLogFields
  },
  "wec-data-hs-entry-go-times": {
    tableName: TABLES.entryGoTimes,
    keyField: "entry_go_key",
    dateField: "focus_day_only",
    mapper: entryGoLogFields
  },
  "wec-data-hs-get-rings": {
    tableName: TABLES.getRings,
    keyField: "get_rings_key",
    dateField: "focus_day_only",
    orderBy: "CREATEDTIME DESC",
    mapper: (row) => helperEndpointFields(row, GET_RINGS_ENDPOINT_FIELDS)
  },
  "wec-data-hs-rings": {
    tableName: TABLES.ringStatus,
    responseTable: "hs_rings",
    keyField: "ring_key",
    dateField: "focus_day_only",
    mapper: ringProjectionEndpointFields,
    requiresExplicitFocus: true,
    preserveOrder: true
  },
  "wec-data-statewise-now": {
    tableName: TABLES.statewiseNow,
    keyField: "statewise_now_key",
    dateField: "focus_day_only",
    orderBy: "as_of_time ASC",
    mapper: statewiseNowEndpointFields,
    preserveNulls: true,
    pagedMaximumRows: 5000
  },
  "wec-data-hs-rider-results": {
    tableName: TABLES.riderResults,
    keyField: "rider_result_key",
    dateField: "focus_day_only",
    orderBy: "observed_at DESC",
    mapper: riderResultEndpointFields,
    requiresExplicitFocus: true,
    preserveOrder: true,
    pagedMaximumRows: 5000
  },
  "wec-data-time-engine-triggers": {
    tableName: TABLES.timeEngineTriggers,
    keyField: "trigger_key",
    dateField: "focus_day_only",
    orderBy: "generated_at DESC",
    mapper: timeEngineTriggerEndpointFields,
    preserveOrder: true,
    pagedMaximumRows: 5000
  },
  "wec-data-time-engine-logs": {
    tableName: TABLES.timeEngineLogs,
    keyField: "time_engine_log_key",
    dateField: "focus_day_only",
    orderBy: "started_at DESC",
    mapper: (row) => helperEndpointFields(row, [...TIME_ENGINE_LOG_FIELDS, "CREATEDTIME", "MODIFIEDTIME"])
  },
  "wec-data-hs-router-logs": {
    tableName: TABLES.routerLogs,
    keyField: "router_log_key",
    dateField: "focus_day_only",
    orderBy: "logged_at DESC",
    mapper: (row) => helperEndpointFields(row, ROUTER_LOG_ENDPOINT_FIELDS)
  }
});

const HELPER_DATA_ENDPOINTS = Object.freeze({
  "wec-data-hs-horses": {
    tableName: TABLES.horses,
    keyField: "horse_key",
    fields: [
      "horse_key", "horse", "horse_name", "horse_display", "barn_name", "horse_aka", "aka",
      "entry_no", "rider", "rider_name", "trainer", "trainer_name", "active", "follow",
      "status", "tag", "source", "rec_id", "last_synced_at", "sync_action", "sync_error"
    ]
  },
  "wec-data-hs-trainers": {
    tableName: TABLES.trainers,
    keyField: "trainer_key",
    fields: [
      "trainer_key", "trainer", "trainer_name", "trainer_aliases", "coach_name", "first_name",
      "tenant_name", "active", "allowed", "follow", "status", "tag", "source", "rec_id",
      "last_synced_at", "sync_action", "sync_error"
    ]
  },
  "wec-data-hs-riders": {
    tableName: TABLES.riders,
    keyField: "rider_key",
    fields: [
      "rider_key", "rider", "rider_name", "rider_aliases", "team_name", "first_name",
      "last_name", "horse", "trainer", "active", "follow", "status", "tag", "source",
      "rec_id", "last_synced_at", "sync_action", "sync_error"
    ]
  }
});

function coreDataEndpointContract() {
  return Object.entries(CORE_DATA_ENDPOINTS).map(([action, config]) => [
    action,
    config.tableName,
    config.keyField
  ]);
}

function helperDataEndpointContract() {
  return Object.entries(HELPER_DATA_ENDPOINTS).map(([action, config]) => [
    action,
    config.tableName,
    config.keyField
  ]);
}

function helperDataEndpointResponseContract() {
  return {
    consumer_pagination: false,
    internal_page_size: 200,
    maximum_rows: 5000
  };
}

function helperEndpointFields(row, fields) {
  return cleanAirtableLogFields(Object.fromEntries(fields.map((field) => [field, row[field]])));
}

function triggerRingNo(row) {
  const payload = parseJsonObject(row?.payload_json);
  const keyParts = text(row?.ring_const_key).split("|");
  return intValue(row?.ring_no || payload.ring_no || keyParts[3]);
}

function timeEngineTriggerEndpointFields(row) {
  const payload = parseJsonObject(row?.payload_json);
  return cleanAirtableLogFields({
    ...helperEndpointFields(row, [...TIME_ENGINE_TRIGGER_FIELDS, "CREATEDTIME", "MODIFIEDTIME"]),
    ring_no: triggerRingNo(row) || undefined,
    horse: text(row.horse || payload.horse) || undefined,
    rider: text(row.rider || payload.rider) || undefined,
    trainer: text(row.trainer || payload.trainer) || undefined
  });
}

function ringProjectionEndpointFields(row) {
  return {
    ring_key: text(row.ring_const_key || row.ring_status_key),
    show_no: intValue(row.show_no),
    focus_day: text(row.focus_day || row.iso_date),
    ring_day_no: nullableEndpointInt(row.ring_day_no),
    ring_no: nullableEndpointInt(row.ring_no),
    ring_name: text(row.ring_name) || null,
    ring_name_normalized: text(row.ring_name_normalized) || null,
    ring_name_prioritized: nullableEndpointInt(row.ring_name_prioritized),
    active: true,
    is_live: row.is_live === true || lowerText(row.is_live) === "true" || text(row.is_live) === "1",
    current_class_no: nullableEndpointInt(row.current_class_no),
    last_synced_at: text(row.last_live_synced_at || row.last_synced_at) || null
  };
}

function riderResultEndpointFields(row) {
  return {
    ...helperEndpointFields(row, RIDER_RESULT_ENDPOINT_FIELDS),
    time: text(row.result_time) || null,
    source: text(row.result_source) || null
  };
}

function nullableEndpointInt(value) {
  if (value === undefined || value === null || text(value) === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function statewiseNowEndpointFields(row) {
  const selected = helperEndpointFields(row, STATEWISE_NOW_ENDPOINT_FIELDS);
  return {
    ...selected,
    ring_no: nullableEndpointInt(row.ring_no),
    class_no: nullableEndpointInt(row.class_no),
    entry_no: nullableEndpointInt(row.entry_no),
    horse: text(row.horse) || null,
    rider: text(row.rider) || null,
    trainer: text(row.trainer) || null,
    mins_since_updated: nullableEndpointInt(row.mins_since_updated),
    state: lowerText(row.state || row.now) || null,
    sort_order: nullableEndpointInt(row.sort_order),
    ends_in: nullableEndpointInt(row.ends_in),
    starts_in: nullableEndpointInt(row.starts_in)
  };
}

function normalizeTimeEngineTriggerEndpointFilters(filters = {}) {
  const showNo = intValue(filters.show_no);
  if (!showNo) throw new Error("time_engine_triggers.show_no_required");
  const suppliedDay = text(filters.focus_day).slice(0, 10);
  const suppliedDayKey = text(filters.focus_day_key).replace(/[^0-9]/g, "").slice(0, 8);
  const focusDay = /^\d{4}-\d{2}-\d{2}$/.test(suppliedDay)
    ? suppliedDay
    : /^\d{8}$/.test(suppliedDayKey)
      ? `${suppliedDayKey.slice(0, 4)}-${suppliedDayKey.slice(4, 6)}-${suppliedDayKey.slice(6, 8)}`
      : "";
  if (!focusDay) throw new Error("time_engine_triggers.focus_day_or_focus_day_key_required");
  return {
    show_no: showNo,
    focus_day: focusDay,
    focus_day_key: compactDate(focusDay),
    level: lowerText(filters.level),
    trigger_type: lowerText(filters.trigger_type),
    class_no: intValue(filters.class_no),
    entry_no: intValue(filters.entry_no),
    ring_no: intValue(filters.ring_no)
  };
}

function filterTimeEngineTriggerEndpointRows(rows, filters) {
  return (rows || []).filter((row) => (
    (!filters.level || lowerText(row.level) === filters.level)
    && (!filters.trigger_type || lowerText(row.trigger_type) === filters.trigger_type)
    && (!filters.class_no || intValue(row.class_no) === filters.class_no)
    && (!filters.entry_no || intValue(row.entry_no) === filters.entry_no)
    && (!filters.ring_no || triggerRingNo(row) === filters.ring_no)
  ));
}

function normalizeEndpointFocusDay(filters, prefix) {
  const showNo = intValue(filters.show_no);
  if (!showNo) throw new Error(`${prefix}.show_no_required`);
  const suppliedDay = text(filters.focus_day).slice(0, 10);
  const suppliedDayKey = text(filters.focus_day_key).replace(/[^0-9]/g, "").slice(0, 8);
  const focusDay = /^\d{4}-\d{2}-\d{2}$/.test(suppliedDay)
    ? suppliedDay
    : /^\d{8}$/.test(suppliedDayKey)
      ? `${suppliedDayKey.slice(0, 4)}-${suppliedDayKey.slice(4, 6)}-${suppliedDayKey.slice(6, 8)}`
      : "";
  if (!focusDay) throw new Error(`${prefix}.focus_day_or_focus_day_key_required`);
  return { show_no: showNo, focus_day: focusDay, focus_day_key: compactDate(focusDay) };
}

function normalizeStatewiseNowEndpointFilters(filters = {}, now = new Date()) {
  const focus = normalizeEndpointFocusDay(filters, "statewise_now");
  const state = lowerText(filters.state);
  if (state && state !== "now" && state !== "nextup") {
    throw new Error("statewise_now.state_must_be_now_or_nextup");
  }
  const requestedAnchor = lowerText(filters.as_of_time);
  const useServerTime = !requestedAnchor || requestedAnchor === "true";
  const anchor = useServerTime ? now : new Date(text(filters.as_of_time));
  if (!(anchor instanceof Date) || Number.isNaN(anchor.getTime())) {
    throw new Error("statewise_now.as_of_time_must_be_true_or_iso8601");
  }
  return {
    ...focus,
    ring_no: intValue(filters.ring_no),
    state,
    class_no: intValue(filters.class_no),
    entry_no: intValue(filters.entry_no),
    as_of_time: anchor.toISOString(),
    as_of_time_source: useServerTime ? "server" : "device"
  };
}

function filterStatewiseNowEndpointRows(rows, filters) {
  return (rows || []).filter((row) => (
    (!filters.ring_no || intValue(row.ring_no) === filters.ring_no)
    && (!filters.state || lowerText(row.state) === filters.state)
    && (!filters.class_no || intValue(row.class_no) === filters.class_no)
    && (!filters.entry_no || intValue(row.entry_no) === filters.entry_no)
  ));
}

function filterIdentityEndpointRows(rows, filters) {
  return (rows || []).filter((row) => (
    (!filters.ring_no || intValue(row.ring_no) === filters.ring_no)
    && (!filters.class_no || intValue(row.class_no) === filters.class_no)
    && (!filters.entry_no || intValue(row.entry_no) === filters.entry_no)
  ));
}

function endpointTimestampMs(value) {
  const raw = text(value);
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    ? `${raw.replace(" ", "T")}Z`
    : raw;
  const milliseconds = Date.parse(normalized);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function sliceStatewiseNowSnapshots(rows, anchorTime, before = 3, after = 3) {
  const anchorMs = endpointTimestampMs(anchorTime);
  if (anchorMs === null) throw new Error("statewise_now.invalid_anchor_time");
  const snapshots = new Map();
  for (const row of rows || []) {
    const milliseconds = endpointTimestampMs(row.as_of_time);
    if (milliseconds === null || snapshots.has(milliseconds)) continue;
    snapshots.set(milliseconds, text(row.as_of_time));
  }
  const ordered = [...snapshots.entries()].sort((left, right) => left[0] - right[0]);
  if (!ordered.length) return { rows: [], anchor_snapshot_time: null, snapshot_times: [] };
  let anchorIndex = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    if (Math.abs(ordered[index][0] - anchorMs) < Math.abs(ordered[anchorIndex][0] - anchorMs)) anchorIndex = index;
  }
  const selected = ordered.slice(Math.max(0, anchorIndex - before), anchorIndex + after + 1);
  const selectedMilliseconds = new Set(selected.map(([milliseconds]) => milliseconds));
  const selectedRows = (rows || [])
    .filter((row) => selectedMilliseconds.has(endpointTimestampMs(row.as_of_time)))
    .sort((left, right) => (
      endpointTimestampMs(left.as_of_time) - endpointTimestampMs(right.as_of_time)
      || intValue(left.sort_order) - intValue(right.sort_order)
      || intValue(left.ring_no) - intValue(right.ring_no)
    ));
  return {
    rows: selectedRows,
    anchor_snapshot_time: ordered[anchorIndex][1],
    snapshot_times: selected.map(([, value]) => value)
  };
}

async function readPagedCurrentRows(app, config, focus) {
  const pageSize = 300;
  const maximumRows = intValue(config.pagedMaximumRows) || pageSize;
  const rows = [];
  for (let offset = 0; offset < maximumRows; offset += pageSize) {
    const page = await zcqlRows(
      app,
      config.tableName,
      `SELECT * FROM ${config.tableName} WHERE show_no = ${Number(focus.show_no)} AND focus_day = ${zcqlValue(focus.focus_day)} ORDER BY ${config.orderBy || "CREATEDTIME ASC"} LIMIT ${pageSize} OFFSET ${offset}`
    );
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function dedupeHelperEndpointRows(rows, keyField) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = text(row[keyField]);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function filterHelperEndpointRows(action, rows, filters = {}) {
  if (action !== "wec-data-hs-horses") return rows;
  const requireBarnName = lowerText(filters.barn_name) === "populated";
  const requireFollow = lowerText(filters.follow) === "true" || text(filters.follow) === "1";
  if (!requireBarnName && !requireFollow) return rows;
  return rows.filter((row) => {
    if (requireBarnName && !text(row.barn_name)) return false;
    if (requireFollow && !boolValue(row.follow)) return false;
    return true;
  });
}

async function runHelperDataEndpoint(app, action, filters = {}) {
  const config = HELPER_DATA_ENDPOINTS[action];
  if (!config) throw new Error(`unsupported_helper_data_endpoint:${action}`);
  const contract = helperDataEndpointResponseContract();
  const sourceRows = [];
  for (let offset = 0; offset < contract.maximum_rows; offset += contract.internal_page_size) {
    const page = await zcqlRows(
      app,
      config.tableName,
      `SELECT * FROM ${config.tableName} LIMIT ${contract.internal_page_size} OFFSET ${offset}`
    );
    sourceRows.push(...page);
    if (page.length < contract.internal_page_size) break;
  }
  const truncated = sourceRows.length === contract.maximum_rows;
  const rows = filterHelperEndpointRows(action, dedupeHelperEndpointRows(sourceRows
    .map((row) => helperEndpointFields(row, config.fields))
    .filter((row) => text(row[config.keyField])), config.keyField), filters)
    .sort((left, right) => text(left[config.keyField]).localeCompare(text(right[config.keyField])));
  return {
    ok: true,
    mode: "wec-helper-data-endpoint",
    endpoint: action,
    table: config.tableName,
    key_field: config.keyField,
    count: rows.length,
    truncated,
    rows
  };
}

async function runCoreDataEndpoint(app, action, requestFilters = {}) {
  const config = CORE_DATA_ENDPOINTS[action];
  if (!config) throw new Error(`unsupported_core_data_endpoint:${action}`);
  const triggerFilters = action === "wec-data-time-engine-triggers"
    ? normalizeTimeEngineTriggerEndpointFilters(requestFilters)
    : null;
  const statewiseFilters = action === "wec-data-statewise-now"
    ? normalizeStatewiseNowEndpointFilters(requestFilters)
    : null;
  const explicitFilters = config.requiresExplicitFocus
    ? { ...normalizeEndpointFocusDay(requestFilters, config.responseTable || config.tableName),
      ring_no: intValue(requestFilters.ring_no),
      class_no: intValue(requestFilters.class_no),
      entry_no: intValue(requestFilters.entry_no) }
    : null;
  const focus = triggerFilters || statewiseFilters || explicitFilters || await getActiveFocusShow();
  if (!focus?.show_no) throw new Error("focus_show.show_no_required");
  if (!focus?.focus_day) throw new Error("focus_show.focus_day_required");
  const sourceRows = config.pagedMaximumRows
    ? await readPagedCurrentRows(app, config, focus)
    : await readCurrentRows(
      app,
      config.tableName,
      focus.show_no,
      focus.focus_day,
      config.dateField,
      config.orderBy
    );
  const mappedRows = sourceRows
    .map(config.mapper)
    .map((row) => config.preserveNulls ? row : cleanAirtableLogFields(row))
    .filter((row) => text(row[config.keyField]));
  const filteredRows = triggerFilters
    ? filterTimeEngineTriggerEndpointRows(mappedRows, triggerFilters)
    : statewiseFilters
      ? filterStatewiseNowEndpointRows(mappedRows, statewiseFilters)
      : explicitFilters
        ? filterIdentityEndpointRows(mappedRows, explicitFilters)
        : mappedRows;
  const statewiseWindow = statewiseFilters
    ? sliceStatewiseNowSnapshots(filteredRows, statewiseFilters.as_of_time)
    : null;
  const rows = statewiseWindow
    ? statewiseWindow.rows
    : config.preserveOrder
      ? filteredRows
      : filteredRows.sort((left, right) => text(left[config.keyField]).localeCompare(text(right[config.keyField])));
  return {
    ok: true,
    mode: "wec-core-data-endpoint",
    endpoint: action,
    table: config.responseTable || config.tableName,
    ...(config.responseTable ? { source_table: config.tableName } : {}),
    key_field: config.keyField,
    show_no: intValue(focus.show_no),
    focus_day: focus.focus_day,
    ...((triggerFilters || statewiseFilters || explicitFilters) ? { filters: triggerFilters || statewiseFilters || explicitFilters } : {}),
    ...(statewiseWindow ? {
      anchor_snapshot_time: statewiseWindow.anchor_snapshot_time,
      snapshot_times: statewiseWindow.snapshot_times,
      snapshot_window_before: 3,
      snapshot_window_after: 3
    } : {}),
    count: rows.length,
    limit: 300,
    truncated: sourceRows.length === (config.pagedMaximumRows || 300),
    rows
  };
}

async function handle(req, res) {
  try {
    const query = queryParams(req);
    const body = await readBody(req);
    const action = text(query.get("action") || body.action);
    const options = {
      run_id: text(query.get("run_id") || body.run_id) || `clean-proof-${Date.now()}`,
      class_no: text(query.get("class_no") || body.class_no),
      mirror_table: text(query.get("mirror_table") || query.get("table") || body.mirror_table || body.table),
      mode: text(query.get("mode") || body.mode || "next_unchecked"),
      limit: Math.max(0, intValue(query.get("limit") || body.limit || 0)),
      probe_limit: Math.max(0, intValue(query.get("probe_limit") || body.probe_limit || 0)),
      parse_limit: Math.max(0, intValue(query.get("parse_limit") || body.parse_limit || 0)),
      offset: Math.max(0, intValue(query.get("offset") || body.offset || 0)),
      wake_reason: text(query.get("wake_reason") || query.get("wakeReason") || body.wake_reason || body.wakeReason),
      force: text(query.get("force") || body.force).toLowerCase() === "1" || text(query.get("force") || body.force).toLowerCase() === "true"
    };
    const app = catalyst.initialize(req);
    if (HELPER_DATA_ENDPOINTS[action]) {
      const result = await runHelperDataEndpoint(app, action, {
        barn_name: query.get("barn_name") ?? body.barn_name,
        follow: query.get("follow") ?? body.follow
      });
      return json(res, 200, result);
    }
    if (action === "wec-data-statewise-now" && text(req.method).toUpperCase() === "POST") {
      const snapshotSource = lowerText(query.get("snapshot_source") ?? body.snapshot_source);
      const refresh = lowerText(query.get("refresh") ?? body.refresh);
      if (snapshotSource === "scheduled") {
        return json(res, 400, { ok: false, error: "statewise_now.public_scheduled_source_rejected" });
      }
      if (!["manual_refresh", "sms_request"].includes(snapshotSource)) {
        return json(res, 400, { ok: false, error: "statewise_now.snapshot_source_must_be_manual_refresh_or_sms_request" });
      }
      if (refresh !== "true" && refresh !== "1") {
        return json(res, 400, { ok: false, error: "statewise_now.refresh_true_required" });
      }
      const focus = normalizeEndpointFocusDay({
        show_no: query.get("show_no") ?? body.show_no,
        focus_day: query.get("focus_day") ?? body.focus_day,
        focus_day_key: query.get("focus_day_key") ?? body.focus_day_key
      }, "statewise_now");
      const schema = await loadSchema(app);
      const engineRows = await readCurrentRows(app, TABLES.timeEngine, focus.show_no, focus.focus_day, "focus_day_only");
      const result = await produceStatewiseSnapshot(app, schema, focus, engineRows, {
        snapshot_source: snapshotSource,
        now: new Date(),
        run_id: options.run_id,
        missingContractFields: []
      });
      return json(res, result.ok ? 200 : 500, result);
    }
    if (CORE_DATA_ENDPOINTS[action]) {
      const result = await runCoreDataEndpoint(app, action, {
        show_no: query.get("show_no") ?? body.show_no,
        focus_day: query.get("focus_day") ?? body.focus_day,
        focus_day_key: query.get("focus_day_key") ?? body.focus_day_key,
        level: query.get("level") ?? body.level,
        trigger_type: query.get("trigger_type") ?? body.trigger_type,
        class_no: query.get("class_no") ?? body.class_no,
        entry_no: query.get("entry_no") ?? body.entry_no,
        ring_no: query.get("ring_no") ?? body.ring_no,
        state: query.get("state") ?? body.state,
        as_of_time: query.get("as_of_time") ?? body.as_of_time
      });
      return json(res, 200, result);
    }
    if (action.startsWith("wec-data-")) {
      return json(res, 400, { ok: false, error: `unsupported_data_endpoint:${action}` });
    }
    if (action === "wec-clean-build-update") {
      const result = await runCleanBuildUpdateOnly(app, options);
      return json(res, 200, result);
    }
    if (action === "wec-clean-probe-3a" || action === "wec-step3a-class-oog-probe") {
      const result = await runFast3AOnly(app, options);
      return json(res, 200, result);
    }
    if (action === "wec-clean-process-3b" || action === "wec-step3b-class-oog-parse") {
      const result = await runFast3BOnly(app, options);
      return json(res, result.ok ? 200 : 500, result);
    }
    if (action === "wec-clean-stage1-3b-proof") {
      return json(res, 410, {
        ok: false,
        mode: "wec-clean-stage1-3b-proof",
        disabled: true,
        reason: "deprecated_all_in_one_action_split_stages_required",
        use_actions: [
          "wec-clean-build-update",
          "wec-clean-probe-3a",
          "wec-clean-process-3b"
        ],
        step1_run: false,
        step2_run: false,
        stage3a_run: false,
        stage3b_run: false,
        step4_run: false,
        live_run: false,
        alerts_run: false,
        output_run: false
      });
    }
    if (action === "wec-step3-airtable-mirror") {
      const result = await runStep3AirtableMirrorOnly(app, options);
      return json(res, 200, result);
    }
    if (action === "wec-clean-runtime-4" || action === "wec-step4-runtime-prep-clean") {
      const result = await runStep4RuntimePrepCleanOnly(app, options);
      return json(res, result.ok ? 200 : 500, result);
    }
    if (action === "wec-step4-airtable-mirror") {
      const result = await runStep4AirtableMirrorOnly(app, options);
      return json(res, 200, result);
    }
    if (action === "wec-core-airtable-logs") {
      const result = await runCoreAirtableLogsOnly(app);
      return json(res, 200, result);
    }
    if (action === "wec-mobile-pro-live") {
      const result = await buildMobileProPayload(app, options);
      return json(res, 200, result);
    }
    if (action === "wec-time-engine") {
      const router = createRouterRun({
        app,
        base: {
          run_id: options.run_id,
          parent_run_id: text(query.get("parent_run_id") || body.parent_run_id),
          lane: "time_engine",
          source_function: "wec_stage1_3_clean_proof",
          source_action: action,
          trigger_source: "catalyst_job_scheduling",
          trigger_reason: options.wake_reason || "clock_window"
        }
      });
      const result = await executeLoggedAction(router, {
        stage: "time_engine",
        after: async (businessResult, run) => {
          const focus = businessResult.focus || {};
          await run.log({
            show_no: focus.show_no,
            focus_day: focus.focus_day,
            stage: "time_engine_triggers",
            event_type: Number(businessResult.airtable_trigger_events?.created || 0) > 0 ? "pass" : "skip",
            status: Number(businessResult.airtable_trigger_events?.created || 0) > 0 ? "PASS" : "SKIP",
            input_count: businessResult.trigger_candidates,
            output_count: businessResult.airtable_trigger_events?.created || 0,
            next_lane: "time_engine_triggers",
            trigger_reason: Number(businessResult.airtable_trigger_events?.created || 0) > 0 ? "trigger_events_appended" : "no_new_trigger_events"
          });
          if (Number(businessResult.triggers_inserted || 0) > 0) {
            await run.log({
              show_no: focus.show_no,
              focus_day: focus.focus_day,
              stage: "results_wake",
              event_type: "dispatch",
              status: "OPEN",
              output_count: businessResult.triggers_inserted,
              next_lane: "results",
              next_action: "wec-step6-results",
              trigger_reason: "time_engine_triggers_inserted"
            });
          }
        },
        outcome: (businessResult) => ({
          show_no: businessResult.focus?.show_no,
          focus_day: businessResult.focus?.focus_day,
          input_count: Object.values(businessResult.source_counts || {}).reduce((sum, count) => sum + intValue(count), 0),
          output_count: businessResult.rows_written || 0,
          http_status: businessResult.ok ? 200 : 500,
          payload_json: { wake_reason: businessResult.wake_reason, skip_reason: businessResult.skip_reason, blocker: businessResult.blocker }
        })
      }, () => runTimeEngineOnly(app, options));
      return json(res, result.ok ? 200 : 500, result);
    }
    if (action === "wec-clean-cadence-stack" || action === "wec-clean-stage1-4-proof") {
      const router = createRouterRun({
        app,
        base: {
          run_id: options.run_id,
          parent_run_id: text(query.get("parent_run_id") || body.parent_run_id),
          lane: "core",
          source_function: "wec_stage1_3_clean_proof",
          source_action: action,
          trigger_source: "catalyst_job_scheduling",
          trigger_reason: "scheduled_core_cadence"
        }
      });
      const result = await executeLoggedAction(router, {
        stage: "core",
        after: async (businessResult, run) => {
          const focus = businessResult.focus || {};
          const stages = [
            ["stage1", businessResult.stage1 || businessResult.stage1_run, businessResult.stage1?.materialized_rows],
            ["stage2", businessResult.stage2 || businessResult.step2_run, businessResult.stage2?.non_preflight_rows],
            ["stage3a", businessResult.stage3a || businessResult.stage3a_run, businessResult.stage3a?.probe3a?.attempted],
            ["stage3b", businessResult.stage3b || businessResult.stage3b_run, businessResult.stage3b?.raw_docs_parsed],
            ["stage4", businessResult.step4 || businessResult.step4_run, businessResult.step4?.destination_counts?.hs_class_start_times]
          ];
          for (const [stage, ran, outputCount] of stages) {
            await run.log({
              show_no: focus.show_no,
              focus_day: focus.focus_day,
              stage,
              event_type: ran ? "pass" : "skip",
              status: ran ? "PASS" : "SKIP",
              output_count: outputCount,
              trigger_reason: ran ? `${stage}_completed` : `${stage}_not_run_this_cycle`
            });
          }
          if (businessResult.time_engine) {
            await run.log({
              show_no: focus.show_no,
              focus_day: focus.focus_day,
              stage: "time_engine",
              event_type: "dispatch",
              status: businessResult.time_engine.ok ? "PASS" : "FAIL",
              parent_run_id: options.run_id,
              next_lane: "time_engine",
              next_action: "wec-time-engine",
              trigger_reason: businessResult.time_engine.wake_reason || "core_runtime_ready"
            });
            await run.log({
              show_no: focus.show_no,
              focus_day: focus.focus_day,
              stage: "time_engine_triggers",
              event_type: Number(businessResult.time_engine.airtable_trigger_events?.created || 0) > 0 ? "pass" : "skip",
              status: Number(businessResult.time_engine.airtable_trigger_events?.created || 0) > 0 ? "PASS" : "SKIP",
              input_count: businessResult.time_engine.trigger_candidates,
              output_count: businessResult.time_engine.airtable_trigger_events?.created || 0,
              next_lane: "time_engine_triggers",
              trigger_reason: Number(businessResult.time_engine.airtable_trigger_events?.created || 0) > 0 ? "trigger_events_appended" : "no_new_trigger_events"
            });
            if (Number(businessResult.time_engine.triggers_inserted || 0) > 0) {
              await run.log({
                show_no: focus.show_no,
                focus_day: focus.focus_day,
                stage: "results_wake",
                event_type: "dispatch",
                status: "OPEN",
                output_count: businessResult.time_engine.triggers_inserted,
                next_lane: "results",
                next_action: "wec-step6-results",
                trigger_reason: "time_engine_triggers_inserted"
              });
            }
          }
          await run.log({
            show_no: focus.show_no,
            focus_day: focus.focus_day,
            stage: "downstream_wake",
            event_type: businessResult.ok ? "dispatch" : "skip",
            status: businessResult.ok ? "OPEN" : "SKIP",
            next_lane: businessResult.next_stage,
            next_action: businessResult.next_stage === "time_engine" ? "wec-time-engine" : "wec-step5-live-enrichment",
            trigger_reason: businessResult.stop_reason
          });
        },
        outcome: (businessResult) => ({
          show_no: businessResult.focus?.show_no,
          focus_day: businessResult.focus?.focus_day,
          output_count: businessResult.after?.destination_counts?.hs_class_start_times,
          http_status: businessResult.ok ? 200 : 500,
          payload_json: { stop_stage: businessResult.stop_stage, stop_reason: businessResult.stop_reason, next_stage: businessResult.next_stage }
        })
      }, () => runCleanCadenceStack(app, options));
      return json(res, result.ok ? 200 : 500, result);
    }
    const adapters = await makeAdapters(app, options);
    const result = await runCleanStage1To3Proof(adapters, options);
    return json(res, 200, {
      ok: true,
      mode: "isolated_clean_stage1_3a_fast_probe",
      existing_workflow_used: false,
      current_workflow_mutated: false,
      stage3b_run: false,
      hs_class_oog_materialization_run: false,
      step4_run: false,
      live_run: false,
      alerts_run: false,
      output_run: false,
      missing_contract_fields: adapters.missingContractFields(),
      ...result
    });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      mode: "isolated_clean_stage1_3a_fast_probe",
      error: String(error?.message || error),
      router_logging: error?.router_logging,
      stack: String(error?.stack || "")
    });
  }
}

module.exports = handle;
module.exports.__test = {
  parseUpdateScheduleRows,
  coreDataEndpointContract,
  helperDataEndpointContract,
  helperDataEndpointResponseContract,
  dedupeHelperEndpointRows,
  filterHelperEndpointRows,
  classOogLogFields,
  ringStatusMirrorFields,
  classStartLogFields,
  entryGoLogFields,
  currentStageAirtableFilter,
  planAirtableRowsByKey,
  buildHeartbeatActiveLinkUpdates,
  nextRingAlertState,
  nextClassAlertState,
  nextEntryAlertState,
  buildRingAlertEvents,
  buildTimeEngineTrigger,
  buildClassAlertEvents,
  buildEntryAlertEvents,
  airtableTimeEngineTriggerFields,
  planAppendOnlyAlertEvents,
  planAppendOnlyTimeEngineTriggers,
  normalizeTimeEngineTriggerEndpointFilters,
  filterTimeEngineTriggerEndpointRows,
  normalizeStatewiseNowEndpointFilters,
  filterStatewiseNowEndpointRows,
  sliceStatewiseNowSnapshots,
  approvedTimeEngineTriggers,
  statewiseSnapshotId,
  buildStatewiseRowsFromTimeEngineRows,
  statewiseCompletionTrigger,
  statewiseProjectionIdentity,
  catalystStatewisePreparedSignature,
  catalystDateTimeToUtcIso,
  planAirtableStatewiseChangesFromCatalyst,
  airtableStatewiseFields,
  optionalResultReadyAt,
  isUnexpectedActivePreflight
};
