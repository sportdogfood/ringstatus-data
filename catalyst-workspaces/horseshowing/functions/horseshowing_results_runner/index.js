const catalyst = require("zcatalyst-sdk-node");
const crypto = require("crypto");
const https = require("https");
const { createRouterRun, executeLoggedAction } = require("@ringstatus/catalyst-router-logger");

const DEFAULT_BASE_ID = "app6XS1RvsPNRT6os";
const HORSESHOWING_BASE_URL = "https://www.horseshowing.com";
const RESULTS_UPSTREAM_TIMEOUT_MS = 8000;
const RESULTS_UPSTREAM_ATTEMPTS = 1;
const UPSTREAM_TIMEOUT_MS = RESULTS_UPSTREAM_TIMEOUT_MS;
const RESULT_ALERT_SOURCE_TABLE = "hs_class_results";

const TABLES = {
  resultClasses: "hs_result_classes",
  classResults: "hs_class_results",
  resultQueue: "hs_result_queue",
  riderResults: "hs_rider_results",
  updateSchedule: "hs_update_schedule",
  classStartTimes: "hs_class_start_times",
  entryGoTimes: "hs_entry_go_times",
  classOog: "hs_class_oog",
  timeEngine: "time_engine",
  timeEngineTriggers: "time_engine_triggers"
};

const AIRTABLE_TABLES = {
  focus_show: "tblQldkP8wwIRxd4z",
  class_oog_staging: "class_oog_staging",
  entry_go_times: "entry_go_times",
  result_classes: "tblWkg90eimLzzMHk",
  class_results: "tblnyxgTAf6QVFLEO",
  result_queue: "tblCHKu87YF5DYaqr",
  hs_result_classes: "hs_result_classes",
  hs_class_results: "hs_class_results",
  hs_result_queue: "hs_result_queue",
  hs_rider_results: "tblxVtA4irfT5WJe5",
  hs_class_start_times: "hs_class_start_times",
  wec_alerts: "tblqkxLPy9zZ2FI6z",
  alert_templates: "tblcHUmGzoWFOTvx2",
  wec_logs: "tblaA0n7QD7s5lIYm"
};

const SOURCE_CLASS_OOG_STAGING_VIEW = "active_entries";
const RESULT_SOURCE = "class_oog_staging.active_entries";
const CLEAN_RESULT_SOURCE = "time_engine.result_ready";

const FOCUS_SHOW_FIELDS = {
  show_no: "show_no",
  focus_day: "focus_day",
  active: "active",
  shows: "shows",
  is_pause: "is_pause",
  is_pause_id: "fldgWn3BIdGzcGow1",
  results_enabled: "results_enabled",
  results_enabled_alt: "results-enabled"
};

const RESULT_CLASS_FIELDS = {
  result_class_key: "fldnCmXAf7eKYRFSA",
  show_no: "fldf4bJRE9CMRw0fo",
  focus_day: "fld36YImlXgPgdGeS",
  class_no: "fldeiZHLgyBaRfuHc",
  sect_no: "fldndnZpu8fF8RYOy",
  class_number: "fld7UN1MTFHoSNBmy",
  class_name: "fldprgSfUzxjhqxxO",
  result_entry_count: "fldcvws9AMIQ24T6i",
  has_score: "fld54D5jcglgey8e9",
  has_prize: "fldLQYITE4yzuIUCV",
  completed_at: "fldTqTWnww6rO88ac",
  source: "fldiEMBFRqYegjZi1",
  raw_json: "fldTVnCFHn1KRygdt",
  classes: "fldOQtu66BjKZ9dKa",
  class_oog: "fldUvtR0P3Q4culkP",
  result_queue: "fldH1FIhmG5tzVNei",
  class_oog_staging: "fldxF7KyCoMKEBvmB"
};

const CLASS_RESULT_FIELDS = {
  class_result_key: "fldJuoSLvBPoFL9cE",
  show_no: "fldyLsGHjfNZvRAPe",
  shows: "fldbFwbNsrcOOiJRU",
  focus_show: "fld5Agqo3IZdTgWm8",
  focus_day: "fldSSgz8KMvHspQET",
  class_no: "fldXsUa3r4aLCpVai",
  classes: "fldFhcj8XVbx0y1xV",
  sect_no: "fldPfpLVyGBagvf4B",
  class_number: "fldClaYj165BhptIm",
  class_name: "fld6IWx0E2V0dV7JK",
  place: "fldNeZomWqxKnzvbm",
  entry_no: "fldicrK4XddzWZFgU",
  entries: "fldmJs5oHMhTy2nbW",
  horse: "fldKvY7IWQIqk3VCN",
  horses: "fldiGHvzlEJKXBWEH",
  rider: "fldT0fGpl3WRw7yga",
  riders: "fld0SBBKT8ARWmfEe",
  owner: "fldKFG31AHVMBlvno",
  score: "fldjAWPghLrvRJxzf",
  prize: "fldpjChiTQejMcINU",
  completed_at: "fldJsfY7Lkq8hkpiz",
  source: "fldQrPbHS3fZKpvTf",
  raw_json: "fldMgGlzJvgRmNkpj",
  class_oog_staging: "fldfpyPCwM1NW7omB",
  entry_go_times: "fldGIJrHryJBDlLqG",
  show_days: "fldzNNtTEXZEh6rIb",
  ring_days: "fldqvByyGxzriJIqo",
  rings: "fld0bbtjl1Wlq3Hi4",
  ring_names: "fldIrnRDddBAf0SOx",
  trainers: "fld0xZuCHqNSKB8sb"
};

const RESULT_QUEUE_FIELDS = {
  result_queue_key: "fldazokYgM2fDdCqU",
  show_no: "fldQ3SUB7lCMGj41V",
  shows: "fldVZNEHveI2c9u9G",
  focus_show: "fldivfL7rGFdgM05L",
  focus_day: "fldITuZ6PKkaaZKBC",
  class_no: "fldn3uJJdikH5IU71",
  classes: "fldrdRWCmyIsGvs6U",
  sect_no: "fldGMOZ0079r22EEK",
  class_number: "fldqR8tfXxAmiXD3e",
  class_name: "fldhSFKHEyMIuA5bB",
  status: "fldFUhxL122G5DTKT",
  queued_at: "fldMmPNMzP1dSPLE9",
  next_check_at: "flddQkaG6zsILiUAh",
  last_checked_at: "fldHWNjo716Ck6dT5",
  attempts: "fldJV74GJAhRcG2FQ",
  result_rows: "fldUR9n3Hxkn4G8JD",
  completed_at: "fldZ2vI9NrtVgiUp0",
  source: "fldMloYxFPMm8uoPt",
  raw_json: "fldms216XQGSe0Y4T",
  class_oog_staging: "fldLUFcR7uOs08ymo"
};

const ALERT_TEMPLATE_FIELDS = {
  alerts: "alerts",
  model: "model"
};

const ALERT_FIELDS = {
  alert_key_run: "fldqmUWNw44ESEC72",
  alert_key: "fldVpNdCVtZBaMDFU",
  severity: "fldKvdb52FCg2VRcJ",
  alert_type: "fldvnYBU0FmHYnxOl",
  message: "fldSPL7ywbch1kplg",
  created_at: "fldqusD5FeihMgXhg",
  status: "fldc5JuLx6UgvzDD0",
  show_no: "fldZfl5FCkyAHmXYu",
  focus_day: "fldmsq7bV1rEFHRJi",
  payload_json: "fld7e5ZLz0TlLQ4Ru",
  alert_templates: "fldfJBdTTdFZnKYFp",
  alert_lane: "fldyIMoAtIIXSsNMs",
  alert_subject: "fldBUx8SiI1xyOudr",
  source_table: "fldn7yxOdsIB476Ou",
  shows: "fldmWM1UaUT92gM9x",
  focus_show: "fldEAydOTiIMSXPbh",
  show_days: "fldlhQo9dYcvm6Dtg",
  ring_days: "fldkZyuRFuwnI9RYd",
  rings: "fldw1Q3Ngx8s57Mn7",
  ring_names: "fldw7GT1cqpk6DA75",
  classes: "fldeD7vODmTvDoORa",
  entries: "fld5Pipfp1qquBXzi",
  horses: "fldfECzStfkd98xjj",
  riders: "fldF8b3oWuhKpb66Q",
  trainers: "fld44SFZFEs1ndM0m",
  class_results: "fldfSwZt4oT9hF393"
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

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Airtable-Token");
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

function flagTrue(value) {
  const raw = text(value).toLowerCase();
  return value === true || raw === "1" || raw === "true" || raw === "yes";
}

function isFocusPaused(row) {
  return row?.[FOCUS_SHOW_FIELDS.is_pause] === true || row?.[FOCUS_SHOW_FIELDS.is_pause_id] === true;
}

function intOrNull(value) {
  const parsed = Number.parseInt(text(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return "";
}

function catalystDateTime(date = new Date()) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function airtableDateTime(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) return `${raw.replace(" ", "T")}Z`;
  return raw;
}

function safeJson(value) {
  const serialized = JSON.stringify(value || {});
  if (serialized.length <= 9500) return serialized;
  const bounded = {
    _truncated: true,
    _reason: "serialized_json_exceeded_9500_chars"
  };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of ["class_no", "class_const_key", "status", "result_rows", "attempts", "next_check_at", "task07"]) {
      if (Object.prototype.hasOwnProperty.call(value, key)) bounded[key] = value[key];
    }
    bounded._omitted_keys = Object.keys(value).filter((key) => !Object.prototype.hasOwnProperty.call(bounded, key));
  }
  const boundedSerialized = JSON.stringify(bounded);
  if (boundedSerialized.length <= 9500) return boundedSerialized;
  return JSON.stringify({ _truncated: true, _reason: "serialized_json_exceeded_9500_chars" });
}

function parseJsonObject(value) {
  const raw = text(value);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function htmlDecode(value) {
  return text(String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">"));
}

function stripTags(value) {
  return htmlDecode(String(value ?? "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "));
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const value = headers.get("set-cookie");
  return value ? [value] : [];
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

async function requestText(url, { method = "GET", headers = {}, body = "", signal, timeoutMs = UPSTREAM_TIMEOUT_MS, fallback = true } = {}) {
  try {
    return await fetch(url, { method, headers, body: body || undefined, signal });
  } catch (error) {
    if (!fallback) throw error;
    const fallbackResponse = await requestTextViaHttps(url, { method, headers, body, timeoutMs });
    fallbackResponse.transport = "https";
    fallbackResponse.fetch_error = error.message;
    return fallbackResponse;
  }
}

function unique(values) {
  return [...new Set((values || []).map((value) => text(value)).filter(Boolean))];
}

function linkIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => text(item?.id || item)).filter(Boolean);
  if (typeof value === "object" && Array.isArray(value.linkedRecordIds)) return value.linkedRecordIds.map(text).filter(Boolean);
  return [];
}

function links(value) {
  const ids = unique(Array.isArray(value) ? value : linkIds(value));
  return ids.length ? ids : undefined;
}

function resultKey(...parts) {
  return parts.map((part) => text(part)).filter(Boolean).join("|");
}

function classEntryKey(row) {
  return resultKey(row?.class_no, row?.entry_no);
}

function focusDayKey(value) {
  const iso = isoDate(value);
  return iso ? iso.replace(/-/g, "") : text(value).replace(/\D/g, "").slice(0, 8);
}

function hasCleanConstKey(value, parts) {
  const key = text(value);
  if (!key) return false;
  const pieces = key.split("|");
  return pieces.length === parts && /^\d+$/.test(pieces[0] || "") && /^\d{8}$/.test(pieces[1] || "");
}

function runtimeClassConstKey(row) {
  if (hasCleanConstKey(row?.class_const_key, 5)) return text(row.class_const_key);
  if (hasCleanConstKey(row?.class_start_key, 5)) return text(row.class_start_key);
  const showNo = text(row?.show_no);
  const dayKey = focusDayKey(row?.focus_day || row?.iso_date || row?.focus_day_key);
  const ringDayNo = text(row?.ring_day_no);
  const ringNo = text(row?.ring_no);
  const classNo = text(row?.class_no);
  if (!showNo || !dayKey || !ringDayNo || !ringNo || !classNo) return "";
  return resultKey(showNo, dayKey, ringDayNo, ringNo, classNo);
}

function runtimeEntryConstKey(row) {
  if (hasCleanConstKey(row?.entry_const_key, 6)) return text(row.entry_const_key);
  if (hasCleanConstKey(row?.entry_go_key, 6)) return text(row.entry_go_key);
  const classKey = runtimeClassConstKey(row);
  const entryNo = text(row?.entry_no);
  if (!classKey || !entryNo) return "";
  return resultKey(classKey, entryNo);
}

function classResultSourceKey(row) {
  return classEntryKey(row);
}

function airtableDateFormula(fieldName, iso) {
  return `IS_SAME({${fieldName}}, DATETIME_PARSE('${iso}'), 'day')`;
}

function airtableString(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function cleanFields(fields) {
  const clean = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== "" && value !== null) clean[key] = value;
  }
  return clean;
}

function uniqueRowsByKey(rows, keyField) {
  const byKey = new Map();
  for (const row of rows || []) {
    const key = text(row?.[keyField]);
    if (key && !byKey.has(key)) byKey.set(key, row);
  }
  return [...byKey.values()];
}

function focusShowMatches(row, focusShow) {
  return text(row?.show_no) === text(focusShow?.show_no) && isoDate(row?.focus_day) === isoDate(focusShow?.focus_day);
}

function focusShowLinksFor(row, focusShow) {
  if (!focusShowMatches(row, focusShow)) return undefined;
  return links(row?.focus_show) || links([focusShow.record_id]);
}

function ringNameLinksFor(row) {
  return text(row?.ring_name_normalized) ? links(row?.ring_names) : undefined;
}

function appendLinks(target, values) {
  for (const id of links(values) || []) {
    if (!target.includes(id)) target.push(id);
  }
}

function fieldValue(record, fieldId, fieldName) {
  return record?.fields?.[fieldId] ?? record?.fields?.[fieldName];
}

function keyEvidence(rows, keyField) {
  const counts = new Map();
  const missing = [];
  for (const row of rows || []) {
    const key = text(row?.[keyField]);
    if (!key) {
      missing.push({
        class_no: text(row?.class_no),
        entry_no: text(row?.entry_no),
        place: text(row?.place)
      });
      continue;
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));
  return {
    rows: (rows || []).length,
    populated_keys: counts.size,
    missing_keys: missing.length,
    duplicate_keys: duplicates.length,
    missing_examples: missing.slice(0, 10),
    duplicate_examples: duplicates.slice(0, 10)
  };
}

function duplicateCount(values) {
  const counts = new Map();
  for (const value of values || []) {
    const key = text(value);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

function payloadKeyEvidence(queueRows, resultClassRows, classResultRows) {
  const resultQueue = keyEvidence(queueRows, "result_queue_key");
  const resultClasses = keyEvidence(resultClassRows, "result_class_key");
  const classResults = keyEvidence(classResultRows, "class_result_key");
  return {
    result_queue: resultQueue,
    result_classes: resultClasses,
    class_results: classResults,
    total_missing_keys: resultQueue.missing_keys + resultClasses.missing_keys + classResults.missing_keys,
    total_duplicate_keys: resultQueue.duplicate_keys + resultClasses.duplicate_keys + classResults.duplicate_keys
  };
}

function sourceFieldEvidence(rows) {
  const requiredFields = ["show_no", "focus_day", "class_no", "entry_no", "horse", "rider", "class_name"];
  const requiredLinks = ["class_oog_ids"];
  const missing = [];
  for (const row of rows || []) {
    const missingFields = [];
    for (const field of requiredFields) {
      if (!text(row?.[field])) missingFields.push(field);
    }
    for (const field of requiredLinks) {
      if (!Array.isArray(row?.[field]) || row[field].length === 0) missingFields.push(field);
    }
    if (missingFields.length) {
      missing.push({
        record_id: row.record_id,
        class_no: row.class_no,
        entry_no: row.entry_no,
        missing: missingFields
      });
    }
  }
  const classNameRawPopulated = (rows || []).filter((row) => text(row.class_name_raw)).length;
  const classLabelFallbackRows = (rows || []).filter((row) => !text(row.class_name_raw) && text(row.class_label)).length;
  return {
    rows_checked: (rows || []).length,
    required_fields: requiredFields,
    required_links: requiredLinks,
    missing_required_rows: missing.length,
    missing_required_examples: missing.slice(0, 10),
    class_name_raw_populated: classNameRawPopulated,
    class_name_after_fallback_populated: (rows || []).filter((row) => text(row.class_name)).length,
    class_label_fallback_rows: classLabelFallbackRows,
    class_name_required_for_keys: false,
    class_label_fallback_safe: true,
    class_oog_backlink_rows: (rows || []).filter((row) => Array.isArray(row.class_oog_ids) && row.class_oog_ids.length).length,
    optional_link_coverage: {
      classes: (rows || []).filter((row) => Array.isArray(row.classes) && row.classes.length).length,
      entries: (rows || []).filter((row) => Array.isArray(row.entries) && row.entries.length).length,
      horses: (rows || []).filter((row) => Array.isArray(row.horses) && row.horses.length).length,
      riders: (rows || []).filter((row) => Array.isArray(row.riders) && row.riders.length).length,
      trainers: (rows || []).filter((row) => Array.isArray(row.trainers) && row.trainers.length).length
    }
  };
}

async function airtableList(baseId, tableIdOrName, formula, token, options = {}) {
  const records = [];
  let offset = "";
  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableIdOrName)}`);
    url.searchParams.set("pageSize", "100");
    if (options.returnFieldsByFieldId) url.searchParams.set("returnFieldsByFieldId", "true");
    if (options.view) url.searchParams.set("view", options.view);
    if (formula) url.searchParams.set("filterByFormula", formula);
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Airtable list ${tableIdOrName} HTTP ${response.status}: ${raw.slice(0, 500)}`);
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
    if (!chunk.length) continue;
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        records: chunk.map((fields) => ({ fields: cleanFields(fields) })),
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
    body: JSON.stringify({ records: [{ fields: cleanFields(fields) }], typecast: true })
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Airtable create ${tableId} HTTP ${response.status}: ${raw.slice(0, 500)}`);
  return JSON.parse(raw);
}

async function getFocusShow(baseId, showNo, token) {
  const formula = showNo ? `{show_no}=${Number(showNo)}` : "";
  const rows = await airtableList(baseId, "focus_show", formula, token);
  const row = rows.find((item) => item[FOCUS_SHOW_FIELDS.active] === true);
  if (!row) throw new Error(showNo ? `No active focus_show found for show_no=${showNo}` : "No active focus_show found");
  const focusDay = isoDate(row[FOCUS_SHOW_FIELDS.focus_day]);
  if (!focusDay) throw new Error(`active focus_show has no focus_day`);
  return {
    record_id: row.record_id,
    show_no: Number(row[FOCUS_SHOW_FIELDS.show_no] || showNo),
    focus_day: focusDay,
    is_pause: isFocusPaused(row),
    results_enabled: flagTrue(row[FOCUS_SHOW_FIELDS.results_enabled] ?? row[FOCUS_SHOW_FIELDS.results_enabled_alt]),
    shows: links(row[FOCUS_SHOW_FIELDS.shows])
  };
}

function activeFocusFormula(showNo, focusDay) {
  return `AND({show_no}=${Number(showNo)}, ${airtableDateFormula("focus_day", focusDay)})`;
}

async function getActiveClassOogStagingRows(baseId, showNo, focusDay, token) {
  const rows = await airtableList(
    baseId,
    AIRTABLE_TABLES.class_oog_staging,
    activeFocusFormula(showNo, focusDay),
    token,
    { view: SOURCE_CLASS_OOG_STAGING_VIEW }
  );
  const sourceRows = rows
    .map((row) => {
      const classOogIds = links(row.class_oog) || [];
      const classNameRaw = text(row.class_name);
      const classLabel = text(row.class_label);
      return {
        record_id: row.record_id,
        show_no: row.show_no,
        focus_day: row.focus_day,
        class_no: intOrNull(row.class_no),
        class_number: intOrNull(row.class_number),
        class_name: text(classNameRaw || classLabel),
        class_name_raw: classNameRaw,
        class_label: classLabel,
        class_name_source: classNameRaw ? "class_name" : (classLabel ? "class_label" : ""),
        entry_no: intOrNull(row.entry_no),
        horse: text(row.horse),
        rider: text(row.rider),
        trainer: text(row.trainer),
        hide: row.hide === true,
        classes: links(row.classes),
        entries: links(row.entries),
        horses: links(row.horses),
        riders: links(row.riders),
        trainers: links(row.trainers),
        shows: links(row.shows),
        focus_show: links(row.focus_show),
        show_days: links(row.show_days),
        ring_days: links(row.ring_days),
        rings: links(row.rings),
        ring_name_normalized: text(row.ring_name_normalized),
        ring_names: links(row.ring_names),
        class_oog_ids: classOogIds
      };
    })
    .filter((row) => row.class_no && row.entry_no && !row.hide);
  const missingClassOogLinks = sourceRows.filter((row) => !row.class_oog_ids.length);
  if (missingClassOogLinks.length) {
    throw new Error(`${RESULT_SOURCE} rows missing class_oog backlink: ${JSON.stringify(missingClassOogLinks.slice(0, 20).map((row) => ({
      record_id: row.record_id,
      class_no: row.class_no,
      entry_no: row.entry_no
    })))}`);
  }
  return sourceRows;
}

async function getEntryGoTimeRows(baseId, showNo, focusDay, token) {
  const rows = await airtableList(
    baseId,
    AIRTABLE_TABLES.entry_go_times,
    activeFocusFormula(showNo, focusDay),
    token
  );
  return rows
    .map((row) => ({
      record_id: row.record_id,
      show_no: row.show_no,
      focus_day: row.focus_day,
      class_no: intOrNull(row.class_no),
      entry_no: intOrNull(row.entry_no)
    }))
    .filter((row) => row.class_no && row.entry_no);
}

async function getClassResultsForAlerts(baseId, showNo, focusDay, token) {
  const rows = await airtableList(
    baseId,
    RESULT_ALERT_SOURCE_TABLE,
    activeFocusFormula(showNo, focusDay),
    token
  );
  return rows
    .map((row) => ({
      record_id: row.record_id,
      class_result_key: text(row.class_result_key),
      show_no: row.show_no,
      focus_day: row.focus_day,
      class_no: row.class_no,
      class_number: row.class_number,
      class_name: text(row.class_name),
      place: text(row.place),
      entry_no: row.entry_no,
      horse: text(row.horse),
      rider: text(row.rider),
      score: text(row.score),
      prize: text(row.prize),
      shows: links(row.shows),
      focus_show: links(row.focus_show),
      show_days: links(row.show_days),
      ring_days: links(row.ring_days),
      rings: links(row.rings),
      ring_names: links(row.ring_names),
      classes: links(row.classes),
      entries: links(row.entries),
      horses: links(row.horses),
      riders: links(row.riders),
      trainers: links(row.trainers)
    }))
    .filter((row) => row.class_result_key);
}

async function getResultAlertTemplateId(baseId, token) {
  const rows = await airtableList(baseId, AIRTABLE_TABLES.alert_templates, "", token);
  const resultTemplate = rows.find((row) => {
    const alertName = text(row[ALERT_TEMPLATE_FIELDS.alerts]).toLowerCase();
    const modelName = text(row[ALERT_TEMPLATE_FIELDS.model]).toLowerCase();
    return alertName === "results" || modelName === "results";
  });
  if (!resultTemplate?.record_id) throw new Error("Missing alert_templates row for results");
  return resultTemplate.record_id;
}

async function getScopedResultAlerts(baseId, showNo, focusDay, token) {
  const formula = `AND({show_no}=${Number(showNo)}, ${airtableDateFormula("focus_day", focusDay)}, LEFT({alert_key}, 7)='result|')`;
  const rows = await airtableList(baseId, AIRTABLE_TABLES.wec_alerts, formula, token);
  return rows.map((row) => ({
    record_id: row.record_id,
    alert_key: text(row.alert_key),
    class_results: links(row.class_results),
    show_days: links(row.show_days),
    ring_names: links(row.ring_names)
  }));
}

function pendingResultAlertRows(classResults, existingAlerts, limit = 25) {
  const existingKeys = new Set((existingAlerts || []).map((row) => text(row.alert_key)).filter(Boolean));
  return (classResults || [])
    .filter((row) => text(row.class_result_key) && !existingKeys.has(resultAlertKey(row.class_result_key)))
    .slice(0, Math.max(1, Number(limit) || 25));
}

function resultAlertKey(classResultKey) {
  return `result|${text(classResultKey)}`;
}

function resultAlertSubject(row) {
  const place = text(row.place);
  const horse = text(row.horse);
  const rider = text(row.rider);
  const className = text(row.class_name);
  return [`Result`, place ? `#${place}` : "", horse, rider ? `/ ${rider}` : "", className ? `- ${className}` : ""]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function toResultAlertRow(row, templateId, runStamp) {
  const alertKey = resultAlertKey(row.class_result_key);
  return cleanFields({
    [ALERT_FIELDS.alert_key_run]: `${alertKey}|${runStamp}`,
    [ALERT_FIELDS.alert_key]: alertKey,
    [ALERT_FIELDS.severity]: "info",
    [ALERT_FIELDS.alert_type]: "results",
    [ALERT_FIELDS.message]: resultAlertSubject(row),
    [ALERT_FIELDS.created_at]: runStamp,
    [ALERT_FIELDS.status]: "open",
    [ALERT_FIELDS.show_no]: Number(row.show_no),
    [ALERT_FIELDS.focus_day]: isoDate(row.focus_day),
    [ALERT_FIELDS.payload_json]: safeJson({
      source_table: "class_results",
      class_result_key: row.class_result_key,
      class_no: row.class_no,
      entry_no: row.entry_no,
      place: row.place,
      horse: row.horse,
      rider: row.rider,
      score: row.score,
      prize: row.prize
    }),
    [ALERT_FIELDS.alert_templates]: links([templateId]),
    [ALERT_FIELDS.alert_lane]: "class_results",
    [ALERT_FIELDS.alert_subject]: resultAlertSubject(row),
    [ALERT_FIELDS.source_table]: "class_results",
    [ALERT_FIELDS.shows]: links(row.shows),
    [ALERT_FIELDS.focus_show]: links(row.focus_show),
    [ALERT_FIELDS.show_days]: links(row.show_days),
    [ALERT_FIELDS.ring_days]: links(row.ring_days),
    [ALERT_FIELDS.rings]: links(row.rings),
    [ALERT_FIELDS.ring_names]: links(row.ring_names),
    [ALERT_FIELDS.classes]: links(row.classes),
    [ALERT_FIELDS.entries]: links(row.entries),
    [ALERT_FIELDS.horses]: links(row.horses),
    [ALERT_FIELDS.riders]: links(row.riders),
    [ALERT_FIELDS.trainers]: links(row.trainers)
  });
}

async function writeResultAlertsForClassResults(baseId, token, showNo, focusDay, classResults, options = {}) {
  const rows = (classResults || []).filter((row) => text(row.class_result_key) && text(row.record_id));
  const templateId = await getResultAlertTemplateId(baseId, token);
  const existingBefore = await getScopedResultAlerts(baseId, showNo, focusDay, token);
  const existingKeys = new Set(existingBefore.map((row) => row.alert_key));
  const runStamp = new Date().toISOString();
  const alertRows = rows.map((row) => toResultAlertRow(row, templateId, runStamp));
  const alertKeys = alertRows.map((row) => row[ALERT_FIELDS.alert_key]).filter(Boolean);
  if (options.noWrite) {
    return {
      no_write: true,
      result_alert_template_id: templateId,
      source_rows: rows.length,
      candidates: alertRows.length,
      alert_keys: alertKeys,
      created: 0,
      updated: 0,
      duplicate_alert_keys: duplicateCount(alertKeys),
      notifications_sent: 0,
      records_changed: 0
    };
  }
  const upserts = await airtableUpsert(baseId, AIRTABLE_TABLES.wec_alerts, ALERT_FIELDS.alert_key, alertRows, token);
  const existingAfter = await getScopedResultAlerts(baseId, showNo, focusDay, token);
  return {
    no_write: false,
    result_alert_template_id: templateId,
    source_rows: rows.length,
    candidates: alertRows.length,
    created: alertKeys.filter((key) => !existingKeys.has(key)).length,
    updated: alertKeys.filter((key) => existingKeys.has(key)).length,
    upserted: upserts.length,
    duplicate_alert_keys: duplicateCount(existingAfter.map((row) => row.alert_key)),
    class_results_links: existingAfter.filter((row) => alertKeys.includes(row.alert_key) && row.class_results.length).length,
    show_days_links: existingAfter.filter((row) => alertKeys.includes(row.alert_key) && row.show_days.length).length,
    ring_names_links: existingAfter.filter((row) => alertKeys.includes(row.alert_key) && row.ring_names.length).length,
    notifications_sent: 0,
    records_changed: upserts.length
  };
}

class HorseShowingSession {
  constructor() {
    this.cookies = new Map();
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }

  storeCookies(response) {
    const rawCookies = getSetCookies(response.headers);
    if (!rawCookies.length) return;
    for (const item of rawCookies.flatMap((raw) => String(raw || "").split(/,(?=[^;,]+=)/))) {
      const [pair] = item.split(";");
      const [key, ...rest] = pair.split("=");
      if (key && rest.length) this.cookies.set(key.trim(), rest.join("=").trim());
    }
  }

  async request(url, options = {}) {
    const timeoutMs = Math.max(1000, Number(options.timeoutMs || UPSTREAM_TIMEOUT_MS));
    const attempts = Math.max(1, Number(options.attempts || RESULTS_UPSTREAM_ATTEMPTS));
    const headers = {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      "accept-encoding": "identity",
      "cache-control": "no-cache",
      connection: "close",
      "user-agent": "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36",
      ...(this.cookieHeader() ? { cookie: this.cookieHeader() } : {}),
      ...(options.headers || {})
    };
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await requestText(url, {
          method: options.method || "GET",
          body: options.body || "",
          timeoutMs,
          signal: controller.signal,
          headers: {
            ...headers,
            ...(options.body ? { "content-length": Buffer.byteLength(String(options.body)) } : {})
          }
        });
        this.storeCookies(response);
        const raw = await response.text();
        if (!response.ok) throw new Error(`${url} HTTP ${response.status}: ${raw.slice(0, 300)}`);
        return raw;
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError;
  }
}

function parseClassHeader(block) {
  const headerHtml = (block.match(/<th class="th_nb"[^>]*>([\s\S]*?)<\/th>/i) || [])[1] || "";
  const entries = Number.parseInt(((headerHtml.match(/Entries:\s*(\d+)/i) || [])[1] || ""), 10) || 0;
  const label = stripTags(headerHtml.replace(/<span[\s\S]*?<\/span>/gi, ""));
  const classNumber = (label.match(/^(\d+[A-Za-z]?)\)/) || [])[1] || "";
  const className = text(label.replace(/^\d+[A-Za-z]?\)\s*/, ""));
  return { class_label: label, class_number: classNumber, class_name: className, result_entry_count: entries };
}

function parseResults(html, classRows) {
  const byNumber = new Map(classRows.map((row) => [text(row.class_number), row]).filter(([key]) => key));
  const results = [];
  const classes = [];
  const blocks = [...String(html || "").matchAll(/<div class="lg[^"]*">([\s\S]*?)<\/div>\s*<!-- lg -->/gi)];
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex][1];
    const parsedClass = parseClassHeader(block);
    const classSource = byNumber.get(text(parsedClass.class_number)) || classRows[blockIndex] || {};
    const hasScore = /<th[^>]*>\s*Score\s*<\/th>/i.test(block);
    const hasPrize = /<th[^>]*>\s*Prize/i.test(block);
    const classRow = {
      ...parsedClass,
      class_no: text(classSource.class_no),
      sect_no: text(classSource.sect_no),
      has_score: hasScore,
      has_time: /<th[^>]*>\s*Time\s*<\/th>/i.test(block),
      has_prize: hasPrize,
      source: "horseshowing.show_results4"
    };
    classes.push(classRow);
    const body = block.split(/<\/thead>/i)[1] || "";
    for (const rowMatch of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => stripTags(cell[1]));
      if (cells.length < 5) continue;
      let metricIndex = 5;
      const score = hasScore ? cells[metricIndex++] || "" : "";
      const time = classRow.has_time ? cells[metricIndex++] || "" : "";
      results.push({
        class_no: classRow.class_no,
        sect_no: classRow.sect_no,
        class_number: classRow.class_number,
        class_name: classRow.class_name,
        place: cells[0],
        entry_no: cells[1],
        horse: cells[2],
        rider: cells[3],
        owner: cells[4],
        score,
        time,
        prize: hasPrize ? cells[cells.length - 1] || "" : "",
        source: "horseshowing.show_results4"
      });
    }
  }
  return { classes, results, blocks: blocks.length };
}

async function fetchResults(showNo, classRows) {
  const session = new HorseShowingSession();
  try {
    await session.request(`${HORSESHOWING_BASE_URL}/show.php?show=${encodeURIComponent(showNo)}`, {
      headers: { referer: `${HORSESHOWING_BASE_URL}/showsel.php` }
    });
  } catch (error) {
    throw new Error(`show.php bootstrap failed: ${error.message}`);
  }
  const classNos = classRows.map((row) => text(row.class_no)).filter(Boolean);
  const form = new URLSearchParams({
    class_nos: JSON.stringify(classNos),
    sect_nos: JSON.stringify([])
  });
  let html;
  try {
    html = await session.request(`${HORSESHOWING_BASE_URL}/show_results4.php`, {
      method: "POST",
      body: form.toString(),
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
        origin: HORSESHOWING_BASE_URL,
        referer: `${HORSESHOWING_BASE_URL}/hrot4.php`
      }
    });
  } catch (error) {
    throw new Error(`show_results4.php failed: ${error.message}`);
  }
  return { html, parsed: parseResults(html, classRows) };
}

function zcqlValue(value) {
  if (value === null || value === undefined || value === "") return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function findOne(app, tableName, keyField, keyValue) {
  const rows = await app.zcql().executeZCQLQuery(
    `SELECT ROWID FROM ${tableName} WHERE ${keyField} = ${zcqlValue(keyValue)} LIMIT 1`
  );
  return rows?.[0]?.[tableName] || null;
}

async function upsertCatalyst(app, tableName, keyField, row) {
  if (!row?.[keyField]) return { action: "skipped" };
  const table = app.datastore().table(tableName);
  const existing = await findOne(app, tableName, keyField, row[keyField]);
  const clean = cleanFields(row);
  if (existing?.ROWID) {
    await table.updateRow({ ...clean, ROWID: existing.ROWID });
    return { action: "updated" };
  }
  await table.insertRow(clean);
  return { action: "inserted" };
}

async function insertCatalystIfMissing(app, tableName, keyField, row) {
  if (!row?.[keyField]) return { action: "skipped" };
  const existing = await findOne(app, tableName, keyField, row[keyField]);
  if (existing?.ROWID) return { action: "existing" };
  await app.datastore().table(tableName).insertRow(cleanFields(row));
  return { action: "inserted" };
}

async function upsertCatalystClassResult(app, row) {
  try {
    return await upsertCatalyst(app, TABLES.classResults, "class_result_key", row);
  } catch (error) {
    if (!Object.prototype.hasOwnProperty.call(row || {}, "time")) throw error;
    const withoutTime = { ...row };
    delete withoutTime.time;
    const result = await upsertCatalyst(app, TABLES.classResults, "class_result_key", withoutTime);
    return { ...result, warning: "catalyst_time_column_missing_time_omitted" };
  }
}

async function catalystRows(app, tableName, showNo, focusDay) {
  const rows = [];
  for (let offset = 0; ; offset += 200) {
    const query = [
      `SELECT * FROM ${tableName}`,
      `WHERE show_no = ${zcqlValue(showNo)} AND focus_day = ${zcqlValue(focusDay)}`,
      `LIMIT 200 OFFSET ${offset}`
    ].join(" ");
    const page = (await app.zcql().executeZCQLQuery(query) || [])
      .map((item) => item?.[tableName])
      .filter(Boolean);
    rows.push(...page);
    if (page.length < 200) break;
  }
  return rows;
}

function existingCompletedClassNos(rows) {
  return new Set((rows || [])
    .filter((row) => text(row.completed_at))
    .map((row) => text(row.class_no))
    .filter(Boolean));
}

function buildClassRows(classOogRows, skippedCompleted) {
  const grouped = new Map();
  for (const row of classOogRows) {
    const key = text(row.class_no);
    if (!key || skippedCompleted.has(key)) continue;
    if (!grouped.has(key)) {
      grouped.set(key, {
        class_no: key,
        sect_no: "",
        show_no: row.show_no,
        focus_day: row.focus_day,
        class_number: text(row.class_number),
        class_name: row.class_name,
        class_oog_ids: [],
        class_oog_staging_ids: [],
        classes: row.classes,
        shows: row.shows,
        focus_show: row.focus_show,
        show_days: row.show_days,
        ring_days: row.ring_days,
        rings: row.rings,
        ring_name_normalized: row.ring_name_normalized,
        ring_names: row.ring_names
      });
    }
    const target = grouped.get(key);
    appendLinks(target.class_oog_ids, row.class_oog_ids?.length ? row.class_oog_ids : [row.record_id]);
    appendLinks(target.class_oog_staging_ids, [row.record_id]);
  }
  return [...grouped.values()];
}

function resultClassRow(showNo, focusDay, row, now) {
  const classNo = text(row.class_no);
  const classNumber = text(row.class_number);
  const key = resultKey(showNo, classNo || classNumber, row.sect_no);
  if (!key) return null;
  return {
    result_class_key: key,
    show_no: text(showNo),
    focus_day: focusDay,
    class_no: classNo,
    sect_no: text(row.sect_no),
    class_number: classNumber,
    class_name: text(row.class_name),
    result_entry_count: intOrNull(row.result_entry_count),
    has_score: row.has_score === true,
    has_prize: row.has_prize === true,
    completed_at: now,
    source: "horseshowing.show_results4",
    raw_json: safeJson(row)
  };
}

function classResultRow(showNo, focusDay, row, now, sourceEntry = {}) {
  const classNo = text(row.class_no);
  const classNumber = text(row.class_number);
  const entryNo = text(row.entry_no);
  const identity = resultKey(entryNo, row.place, row.horse, row.rider);
  const key = resultKey(showNo, classNo || classNumber, identity);
  if (!key || !identity) return null;
  return {
    class_result_key: key,
    show_no: text(showNo),
    focus_day: focusDay,
    class_no: classNo,
    sect_no: text(row.sect_no),
    class_number: classNumber,
    class_name: text(row.class_name),
    place: text(row.place),
    entry_no: entryNo,
    horse: text(row.horse) || text(sourceEntry.horse),
    rider: text(row.rider) || text(sourceEntry.rider),
    owner: text(row.owner),
    score: text(row.score),
    time: text(row.time),
    prize: text(row.prize),
    completed_at: now,
    source: "horseshowing.show_results4",
    raw_json: safeJson(row)
  };
}

function resultQueueRow(showNo, focusDay, classRow, status, resultRows, now) {
  const key = resultKey(showNo, focusDay, classRow.class_no || classRow.class_number);
  return {
    result_queue_key: key,
    show_no: text(showNo),
    focus_day: focusDay,
    class_no: text(classRow.class_no),
    sect_no: text(classRow.sect_no),
    class_number: text(classRow.class_number),
    class_name: text(classRow.class_name),
    status,
    queued_at: now,
    last_checked_at: now,
    attempts: 1,
    result_rows: resultRows,
    completed_at: status === "completed" ? now : "",
    source: "horseshowing.show_results4",
    raw_json: safeJson({ class_no: classRow.class_no, status, result_rows: resultRows })
  };
}

function doneByRuntimeCounts(row) {
  const entryCount = intOrNull(row.entry_count);
  const gone = intOrNull(row.n_gone);
  const toGo = intOrNull(row.n_to_go);
  return entryCount > 0 && gone === entryCount && (toGo === null || toGo === 0);
}

function queueRetryDue(row, now = new Date()) {
  if (text(row?.status).toLowerCase() !== "pending") return false;
  const raw = text(row?.next_check_at);
  if (!raw) return true;
  const parsed = new Date(raw.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) || parsed <= now;
}

function classIsCompleted(row) {
  return text(row?.status).toLowerCase() === "completed" || !!text(row?.completed_at);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function parseClassStartClock(value) {
  const raw = text(value);
  let match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    const second = Number(match[3] || 0);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59) {
      return { hour, minute, second };
    }
  }
  match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)$/i);
  if (match) {
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const second = Number(match[3] || 0);
    const meridian = match[4].toUpperCase();
    if (hour >= 1 && hour <= 12 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59) {
      if (meridian === "PM" && hour !== 12) hour += 12;
      if (meridian === "AM" && hour === 12) hour = 0;
      return { hour, minute, second };
    }
  }
  return null;
}

function zonedDateTime(focusDay, clock, timeZone = "America/New_York") {
  const iso = isoDate(focusDay);
  if (!iso || !clock) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const targetUtc = Date.UTC(year, month - 1, day, clock.hour, clock.minute, clock.second || 0);
  let candidate = new Date(targetUtc);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  for (let i = 0; i < 3; i += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(candidate).map((part) => [part.type, part.value]));
    const renderedUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    const delta = targetUtc - renderedUtc;
    if (delta === 0) break;
    candidate = new Date(candidate.getTime() + delta);
  }
  return candidate;
}

function resultProbeInfo(row, nowDate) {
  const entryCount = intOrNull(row?.entry_count);
  if (!entryCount || entryCount <= 0) {
    return { check_results: false, ready_at: "", reason: "missing_entry_count" };
  }
  const clock = parseClassStartClock(row?.class_start_time) || parseClassStartClock(row?.display_time);
  if (!clock) {
    return { check_results: false, ready_at: "", reason: "missing_class_start_time" };
  }
  const startAt = zonedDateTime(row?.focus_day, clock);
  if (!startAt) {
    return { check_results: false, ready_at: "", reason: "invalid_class_start_time" };
  }
  const readyAt = addMinutes(startAt, entryCount * 3.3);
  const checkResults = nowDate >= readyAt;
  return {
    check_results: checkResults,
    ready_at: catalystDateTime(readyAt),
    reason: checkResults ? "estimated_runtime_elapsed" : "not_due"
  };
}

function scopedClassConstKeysFromEntries(rows) {
  const scoped = new Set();
  for (const row of rows || []) {
    const classConstKey = runtimeClassConstKey(row);
    if (classConstKey && text(row?.entry_no)) scoped.add(classConstKey);
  }
  return scoped;
}

function outsideTrackedClassKeys(classRows, entryRows) {
  const tracked = scopedClassConstKeysFromEntries(entryRows);
  return (classRows || [])
    .map((row) => getRuntimeClassKey(row))
    .filter(Boolean)
    .filter((key) => !tracked.has(key));
}

function latestQueueByClassConstKey(queueRows) {
  const map = new Map();
  for (const row of queueRows || []) {
    const key = hasCleanConstKey(row?.result_queue_key, 5) ? text(row.result_queue_key) : runtimeClassConstKey(row);
    if (!key) continue;
    const existing = map.get(key);
    const existingTime = new Date(text(existing?.last_checked_at || existing?.MODIFIEDTIME || "")).getTime() || 0;
    const rowTime = new Date(text(row?.last_checked_at || row?.MODIFIEDTIME || "")).getTime() || 0;
    if (!existing || rowTime >= existingTime) map.set(key, row);
  }
  return map;
}

function rowIsTrue(value) {
  return value === true || text(value).toLowerCase() === "true" || text(value) === "1";
}

function timeEngineResultReadyClassKeys(rows) {
  const ready = new Set();
  for (const row of rows || []) {
    const level = text(row?.level).toLowerCase();
    if (level !== "class") continue;
    if (!rowIsTrue(row?.trigger_ready)) continue;
    const tags = text(row?.tags).toLowerCase();
    const status = text(row?.status).toLowerCase();
    const payload = text(row?.payload_json).toLowerCase();
    const looksResultReady = tags.includes("result")
      || tags.includes("check_results")
      || status === "results"
      || status === "done"
      || payload.includes("check_results")
      || payload.includes("result_ready");
    if (!looksResultReady) continue;
    const key = hasCleanConstKey(row?.class_const_key, 5)
      ? text(row.class_const_key)
      : runtimeClassConstKey(row);
    if (key) ready.add(key);
  }
  return ready;
}

function timeEngineTriggerResultReadyClassKeys(rows) {
  const ready = new Set();
  for (const row of rows || []) {
    if (text(row?.trigger_type).toLowerCase() !== "result_ready") continue;
    const key = hasCleanConstKey(row?.class_const_key, 5) ? text(row.class_const_key) : runtimeClassConstKey(row);
    if (key) ready.add(key);
  }
  return ready;
}

function trackedEntriesByClassConstKey(entryRows) {
  const map = new Map();
  for (const row of entryRows || []) {
    const classKey = runtimeClassConstKey(row);
    const entryNo = text(row?.entry_no);
    if (!classKey || !entryNo) continue;
    if (!map.has(classKey)) map.set(classKey, []);
    map.get(classKey).push(row);
  }
  for (const rows of map.values()) {
    rows.sort((a, b) => (intOrNull(a.entry_order) || 0) - (intOrNull(b.entry_order) || 0)
      || Number(text(a.entry_no)) - Number(text(b.entry_no)));
  }
  return map;
}

function classIsNoLongerLive(row) {
  if (row?.is_live === true || text(row?.is_live).toLowerCase() === "true" || text(row?.is_live) === "1") return false;
  const status = text(row?.class_status || row?.status).toLowerCase();
  return status !== "now" && status !== "live";
}

function normalizedResultBlockForClass(classNo, parsed) {
  const classRow = (parsed?.classes || []).find((row) => text(row.class_no) === text(classNo));
  if (!classRow) return "";
  const results = (parsed?.results || [])
    .filter((row) => text(row.class_no) === text(classNo))
    .map((row) => ({
      class_no: text(row.class_no),
      sect_no: text(row.sect_no),
      class_number: text(row.class_number),
      class_name: text(row.class_name),
      place: text(row.place),
      entry_no: text(row.entry_no),
      horse: text(row.horse),
      rider: text(row.rider),
      owner: text(row.owner),
      score: text(row.score),
      time: text(row.time),
      prize: text(row.prize)
    }));
  return JSON.stringify({
    class: {
      class_no: text(classRow.class_no),
      sect_no: text(classRow.sect_no),
      class_number: text(classRow.class_number),
      class_name: text(classRow.class_name),
      result_entry_count: intOrNull(classRow.result_entry_count) || 0,
      has_score: classRow.has_score === true,
      has_time: classRow.has_time === true,
      has_prize: classRow.has_prize === true
    },
    results
  });
}

function resultBlockHash(normalizedBlock) {
  const raw = text(normalizedBlock);
  return raw ? crypto.createHash("sha256").update(raw, "utf8").digest("hex") : "";
}

function task07MetadataFromQueue(row) {
  return parseJsonObject(row?.raw_json).task07 || {};
}

function task07Stability(previousQueue, resultBlockHashValue, schedulerOwned) {
  const previous = task07MetadataFromQueue(previousQueue);
  const previousHash = text(previous.result_block_hash);
  if (!resultBlockHashValue) {
    return { stable_count: 0, previous_hash: previousHash, finality_satisfied: false };
  }
  const previousCount = intOrNull(previous.stable_count) || 0;
  const stableCount = schedulerOwned && previousHash === resultBlockHashValue ? Math.max(1, previousCount) + 1 : 1;
  return {
    stable_count: stableCount,
    previous_hash: previousHash,
    finality_satisfied: stableCount >= 2
  };
}

function mergeTask07QueueRawJson(classRow, status, resultRows, nextCheckAt, task07) {
  const previous = parseJsonObject(classRow.previous_queue?.raw_json);
  return safeJson({
    ...previous,
    class_no: classRow.class_no,
    class_const_key: text(classRow.class_const_key || classRow.class_visual_key),
    status,
    result_rows: resultRows,
    attempts: (intOrNull(classRow.previous_attempts) || 0) + 1,
    next_check_at: nextCheckAt,
    task07
  });
}

function riderResultKey(showNo, focusDay, classNo, entryNo) {
  return resultKey(showNo, focusDayKey(focusDay), classNo, entryNo);
}

function existingKeySet(rows, fieldName) {
  return new Set((rows || []).map((row) => text(row?.[fieldName])).filter(Boolean));
}

function buildTerminalRiderResults(showNo, focusDay, classRow, trackedEntries, parsedResults, now, runId) {
  const byEntryNo = new Map((parsedResults || [])
    .filter((row) => text(row.class_no) === text(classRow.class_no))
    .map((row) => [text(row.entry_no), row]));
  return (trackedEntries || []).map((entry) => {
    const parsed = byEntryNo.get(text(entry.entry_no)) || null;
    const placed = !!parsed && !!text(parsed.place);
    return {
      rider_result_key: riderResultKey(showNo, focusDay, classRow.class_no, entry.entry_no),
      show_no: Number(showNo),
      focus_day: focusDay,
      class_no: intOrNull(classRow.class_no),
      entry_no: intOrNull(entry.entry_no),
      horse: text(parsed?.horse) || text(entry.horse),
      rider: text(parsed?.rider) || text(entry.rider),
      place: placed ? text(parsed.place) : "",
      score: text(parsed?.score),
      result_time: text(parsed?.time),
      result_status: placed ? "placed" : "no_place",
      result_source: "horseshowing.show_results4.operational_finality",
      observed_at: now,
      run_id: runId
    };
  });
}

function toAirtableHsRiderResult(row) {
  return cleanFields({
    rider_result_key: row.rider_result_key,
    show_no: Number(row.show_no),
    focus_day: row.focus_day,
    class_no: intOrNull(row.class_no),
    entry_no: intOrNull(row.entry_no),
    horse: row.horse,
    rider: row.rider,
    place: row.place,
    score: row.score,
    time: row.result_time,
    result_status: row.result_status,
    source: row.result_source,
    observed_at: airtableDateTime(row.observed_at)
  });
}

function resultAvailableTrigger(row, classRow, entryRow, generatedAt) {
  const triggerKey = resultKey(row.show_no, focusDayKey(row.focus_day), "rider", row.class_no, row.entry_no, "result_available");
  return {
    trigger_key: triggerKey,
    run_id: row.run_id,
    show_no: Number(row.show_no),
    focus_day: row.focus_day,
    focus_day_key: focusDayKey(row.focus_day),
    level: "rider",
    trigger_type: "result_available",
    status: "pending",
    source_table: TABLES.riderResults,
    source_key: row.rider_result_key,
    ring_const_key: text(classRow?.ring_const_key),
    class_const_key: text(classRow?.class_const_key || classRow?.class_visual_key),
    entry_const_key: runtimeEntryConstKey(entryRow),
    class_no: intOrNull(row.class_no),
    entry_no: intOrNull(row.entry_no),
    trigger_time: generatedAt,
    generated_at: generatedAt,
    horse: row.horse,
    rider: row.rider,
    trainer: text(entryRow?.trainer),
    payload_json: safeJson({
      rider_result_key: row.rider_result_key,
      class_no: row.class_no,
      entry_no: row.entry_no,
      result_status: row.result_status,
      place: row.place,
      score: row.score,
      result_time: row.result_time,
      source: row.result_source
    })
  };
}

function watchedScheduleClassKeys(updateRows, entryRows, nowDate = new Date()) {
  const tracked = scopedClassConstKeysFromEntries(entryRows);
  const hasLiveFlagRows = (updateRows || []).some((row) => rowIsTrue(row?.live_flag));
  const ready = new Map();
  for (const row of updateRows || []) {
    const classConstKey = runtimeClassConstKey(row);
    if (!classConstKey) continue;
    if (!tracked.has(classConstKey)) continue;
    const liveFlag = rowIsTrue(row?.live_flag);
    if (hasLiveFlagRows && !liveFlag) continue;
    const probe = resultProbeInfo(row, nowDate);
    ready.set(classConstKey, {
      ready: probe.check_results === true,
      ready_at: probe.ready_at,
      reason: probe.check_results
        ? (liveFlag ? "watched_live_flag_estimated_end_elapsed" : "tracked_entry_estimated_end_elapsed")
        : probe.reason
    });
  }
  return ready;
}

function getRuntimeClassNo(row) {
  return text(row?.class_no);
}

function getRuntimeClassKey(row) {
  return runtimeClassConstKey(row);
}

function runtimeClassSourceEvidence(rows, entryRows = [], queueRows = [], nowDate = new Date(), resultReadyKeys = new Set(), watchedReady = new Map()) {
  const scoped = scopedClassConstKeysFromEntries(entryRows);
  const latestQueue = latestQueueByClassConstKey(queueRows);
  const scopedRows = (rows || []).filter((row) => scoped.has(getRuntimeClassKey(row)));
  return {
    source_rows: rows.length,
    done_status_rows: rows.filter((row) => text(row.class_status).toLowerCase() === "done").length,
    done_count_rows: rows.filter(doneByRuntimeCounts).length,
    class_const_key_rows: rows.filter((row) => runtimeClassConstKey(row)).length,
    entry_const_key_rows: entryRows.filter((row) => runtimeEntryConstKey(row)).length,
    class_visual_key_rows: rows.filter((row) => text(row.class_visual_key)).length,
    ring_visual_key_rows: rows.filter((row) => text(row.ring_visual_key)).length,
    ring_name_normalized_rows: rows.filter((row) => text(row.ring_name_normalized)).length,
    our_rider_scoped_class_count: scoped.size,
    scoped_class_start_rows: scopedRows.length,
    time_engine_result_ready_rows: scopedRows.filter((row) => resultReadyKeys.has(getRuntimeClassKey(row))).length,
    watched_result_ready_rows: scopedRows.filter((row) => watchedReady.get(getRuntimeClassKey(row))?.ready === true).length,
    pending_due_rows: scopedRows.filter((row) => queueRetryDue(latestQueue.get(getRuntimeClassKey(row)), nowDate)).length,
    exhausted_rows: scopedRows.filter((row) => text(latestQueue.get(getRuntimeClassKey(row))?.status).toLowerCase() === "exhausted").length,
    completed_rows: scopedRows.filter((row) => text(latestQueue.get(getRuntimeClassKey(row))?.status).toLowerCase() === "completed").length
  };
}

function pendingQueueByClassConstKey(queueRows) {
  const map = new Map();
  for (const row of queueRows || []) {
    const key = hasCleanConstKey(row?.result_queue_key, 5) ? text(row.result_queue_key) : runtimeClassConstKey(row);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function completedClassConstKeys(queueRows, resultClassRows, classResultRows = []) {
  const completed = new Set();
  for (const row of queueRows || []) {
    const key = hasCleanConstKey(row?.result_queue_key, 5) ? text(row.result_queue_key) : runtimeClassConstKey(row);
    if (classIsCompleted(row) && key) completed.add(key);
  }
  for (const row of resultClassRows || []) {
    const key = hasCleanConstKey(row?.result_class_key, 5) ? text(row.result_class_key) : runtimeClassConstKey(row);
    if (classIsCompleted(row) && key) completed.add(key);
  }
  for (const row of classResultRows || []) {
    const key = runtimeClassConstKey(row);
    if (key) completed.add(key);
  }
  return completed;
}

function buildStep6ClassRows(classStartRows, entryRows, queueRows, resultClassRows, classResultRows, resultReadyKeys, watchedReady, force, nowDate) {
  const scoped = scopedClassConstKeysFromEntries(entryRows);
  const latestQueue = latestQueueByClassConstKey(queueRows);
  const completedKeys = force ? new Set() : completedClassConstKeys(queueRows, resultClassRows, classResultRows);
  const candidates = [];
  for (const row of classStartRows || []) {
    const classNo = getRuntimeClassNo(row);
    const classConstKey = getRuntimeClassKey(row);
    if (!classNo || !classConstKey) continue;
    if (!scoped.has(classConstKey)) continue;
    const previousQueue = latestQueue.get(classConstKey) || null;
    const previousStatus = text(previousQueue?.status).toLowerCase();
    const previousAttempts = intOrNull(previousQueue?.attempts) || 0;
    const pendingDue = queueRetryDue(previousQueue, nowDate);
    const timeEngineReady = resultReadyKeys.has(classConstKey);
    const watchedProbe = watchedReady.get(classConstKey) || null;
    const watchedReadyNow = watchedProbe?.ready === true;
    if (!force && previousStatus === "completed") continue;
    if (!force && previousStatus === "exhausted") continue;
    if (!force && previousAttempts >= 5) continue;
    if (!force && completedKeys.has(classConstKey) && !pendingDue) continue;
    if (!timeEngineReady && !watchedReadyNow && !pendingDue) continue;
    if (!force && completedKeys.has(classConstKey) && !pendingDue) continue;
    const probe = resultProbeInfo(row, nowDate);
    const reason = pendingDue && !timeEngineReady && !watchedReadyNow
      ? "pending_retry_due"
      : (timeEngineReady ? "time_engine_result_ready" : (watchedProbe?.reason || probe.reason));
    candidates.push({
      class_start_key: text(row.class_start_key || classConstKey),
      show_no: row.show_no,
      focus_day: isoDate(row.focus_day),
      focus_day_key: focusDayKey(row.focus_day || row.iso_date || row.focus_day_key),
      ring_day_no: intOrNull(row.ring_day_no),
      ring_no: intOrNull(row.ring_no),
      ring_name_normalized: text(row.ring_name_normalized),
      ring_visual_key: text(row.ring_visual_key),
      class_visual_key: classConstKey,
      class_const_key: classConstKey,
      class_no: classNo,
      sect_no: text(row.sect_no),
      class_number: text(row.class_number),
      class_name: text(row.class_name),
      class_status: text(row.class_status),
      entry_count: intOrNull(row.entry_count),
      check_results: timeEngineReady || watchedReadyNow || pendingDue,
      result_probe_ready_at: watchedProbe?.ready_at || probe.ready_at,
      result_probe_reason: reason,
      previous_attempts: previousAttempts,
      previous_queue_status: previousStatus
    });
  }
  return candidates.sort((a, b) => {
    const ringCompare = text(a.ring_name_normalized).localeCompare(text(b.ring_name_normalized));
    if (ringCompare) return ringCompare;
    return Number(a.class_no) - Number(b.class_no);
  });
}

function completedTask07ClassConstKeys(queueRows, riderResultRows, trackedByClass) {
  const completed = new Set();
  const existing = existingKeySet(riderResultRows, "rider_result_key");
  const latestQueue = latestQueueByClassConstKey(queueRows);
  for (const [classKey, entries] of trackedByClass.entries()) {
    const queue = latestQueue.get(classKey);
    const task07 = task07MetadataFromQueue(queue);
    const queueComplete = text(queue?.status).toLowerCase() === "completed" && task07.finality_satisfied === true;
    const allTerminal = (entries || []).length > 0 && entries.every((entry) => {
      const classNo = getRuntimeClassNo(entry);
      return existing.has(riderResultKey(entry.show_no, entry.focus_day, classNo, entry.entry_no));
    });
    if (allTerminal || (queueComplete && allTerminal)) completed.add(classKey);
  }
  return completed;
}

function buildTask07ClassRows(classStartRows, entryRows, queueRows, resultReadyKeys, riderResultRows, force, nowDate) {
  const trackedByClass = trackedEntriesByClassConstKey(entryRows);
  const latestQueue = latestQueueByClassConstKey(queueRows);
  const completedKeys = force ? new Set() : completedTask07ClassConstKeys(queueRows, riderResultRows, trackedByClass);
  const candidates = [];
  for (const row of classStartRows || []) {
    const classNo = getRuntimeClassNo(row);
    const classConstKey = getRuntimeClassKey(row);
    if (!classNo || !classConstKey) continue;
    if (!trackedByClass.has(classConstKey)) continue;
    if (!force && completedKeys.has(classConstKey)) continue;
    const previousQueue = latestQueue.get(classConstKey) || null;
    const pendingDue = queueRetryDue(previousQueue, nowDate);
    const timeEngineReady = resultReadyKeys.has(classConstKey);
    if (!force && !timeEngineReady && !pendingDue) continue;
    const previousStatus = text(previousQueue?.status).toLowerCase();
    const previousAttempts = intOrNull(previousQueue?.attempts) || 0;
    const probe = resultProbeInfo(row, nowDate);
    const reason = pendingDue && !timeEngineReady ? "pending_retry_due" : "time_engine_result_ready";
    candidates.push({
      class_start_key: text(row.class_start_key || classConstKey),
      show_no: row.show_no,
      focus_day: isoDate(row.focus_day),
      focus_day_key: focusDayKey(row.focus_day || row.iso_date || row.focus_day_key),
      ring_day_no: intOrNull(row.ring_day_no),
      ring_no: intOrNull(row.ring_no),
      ring_name_normalized: text(row.ring_name_normalized),
      ring_const_key: text(row.ring_const_key || row.ring_visual_key),
      ring_visual_key: text(row.ring_visual_key),
      class_visual_key: classConstKey,
      class_const_key: classConstKey,
      class_no: classNo,
      sect_no: text(row.sect_no),
      class_number: text(row.class_number),
      class_name: text(row.class_name),
      class_status: text(row.class_status),
      is_live: row.is_live,
      entry_count: intOrNull(row.entry_count),
      check_results: timeEngineReady || pendingDue,
      result_probe_ready_at: probe.ready_at,
      result_probe_reason: reason,
      previous_attempts: previousAttempts,
      previous_queue_status: previousStatus,
      previous_queue: previousQueue
    });
  }
  return candidates.sort((a, b) => {
    const ringCompare = text(a.ring_name_normalized).localeCompare(text(b.ring_name_normalized));
    if (ringCompare) return ringCompare;
    return Number(a.class_no) - Number(b.class_no);
  });
}

function step6ResultClassRow(showNo, focusDay, row, now, sourceClass = {}) {
  const classNo = text(row.class_no);
  const classConstKey = text(sourceClass.class_const_key || sourceClass.class_visual_key || row.class_const_key || row.class_visual_key);
  const key = classConstKey;
  if (!key || !classConstKey) return null;
  return {
    result_class_key: key,
    show_no: text(showNo),
    focus_day: focusDay,
    ring_name_normalized: text(sourceClass.ring_name_normalized),
    ring_visual_key: text(sourceClass.ring_visual_key),
    class_visual_key: classConstKey,
    class_no: classNo,
    sect_no: text(row.sect_no || sourceClass.sect_no),
    class_number: text(row.class_number || sourceClass.class_number),
    class_name: text(row.class_name || sourceClass.class_name),
    result_entry_count: intOrNull(row.result_entry_count),
    has_score: row.has_score === true,
    has_prize: row.has_prize === true,
    completed_at: now,
    source: "horseshowing.show_results4",
    raw_json: safeJson({ ...row, class_const_key: classConstKey })
  };
}

function entryConstKeyFromResult(resultRow, sourceClass, entryGoTimeByClassEntry) {
  const existing = entryGoTimeByClassEntry.get(classEntryKey(resultRow));
  const existingKey = runtimeEntryConstKey(existing);
  if (existingKey) return existingKey;
  const classKey = text(sourceClass.class_const_key || sourceClass.class_visual_key);
  const entryNo = text(resultRow.entry_no);
  if (!classKey || !entryNo) return "";
  return resultKey(classKey, entryNo);
}

function step6ClassResultRow(showNo, focusDay, row, now, sourceClass = {}, entryGoTimeByClassEntry = new Map()) {
  const classNo = text(row.class_no);
  const entryNo = text(row.entry_no);
  const entryConstKey = entryConstKeyFromResult(row, sourceClass, entryGoTimeByClassEntry);
  const identity = resultKey(row.place, row.score, row.prize);
  const key = resultKey(entryConstKey, identity);
  if (!key || !entryConstKey) return null;
  return {
    class_result_key: key,
    show_no: text(showNo),
    focus_day: focusDay,
    ring_name_normalized: text(sourceClass.ring_name_normalized),
    ring_visual_key: text(sourceClass.ring_visual_key),
    class_visual_key: text(sourceClass.class_const_key || sourceClass.class_visual_key),
    entry_visual_key: entryConstKey,
    class_no: classNo,
    sect_no: text(row.sect_no || sourceClass.sect_no),
    class_number: text(row.class_number || sourceClass.class_number),
    class_name: text(row.class_name || sourceClass.class_name),
    place: text(row.place),
    entry_no: entryNo,
    horse: text(row.horse) || text(entryGoTimeByClassEntry.get(classEntryKey(row))?.horse),
    rider: text(row.rider) || text(entryGoTimeByClassEntry.get(classEntryKey(row))?.rider),
    owner: text(row.owner),
    score: text(row.score),
    prize: text(row.prize),
    completed_at: now,
    source: "horseshowing.show_results4",
    raw_json: safeJson({ ...row, entry_const_key: entryConstKey })
  };
}

function step6ResultQueueRow(showNo, focusDay, classRow, status, resultRows, now, nowDate, task07 = null) {
  const key = text(classRow.class_const_key || classRow.class_visual_key);
  const attempts = (intOrNull(classRow.previous_attempts) || 0) + 1;
  const nextCheckAt = status === "pending" ? catalystDateTime(addMinutes(nowDate, 6)) : "";
  return {
    result_queue_key: key,
    show_no: text(showNo),
    focus_day: focusDay,
    ring_name_normalized: text(classRow.ring_name_normalized),
    ring_visual_key: text(classRow.ring_visual_key),
    class_visual_key: key,
    class_no: text(classRow.class_no),
    sect_no: text(classRow.sect_no),
    class_number: text(classRow.class_number),
    class_name: text(classRow.class_name),
    status,
    queued_at: now,
    last_checked_at: now,
    next_check_at: nextCheckAt,
    attempts,
    result_rows: resultRows,
    completed_at: status === "completed" ? now : "",
    source: "horseshowing.show_results4",
    raw_json: task07
      ? mergeTask07QueueRawJson(classRow, status, resultRows, nextCheckAt, task07)
      : safeJson({
        class_no: classRow.class_no,
        class_const_key: key,
        status,
        result_rows: resultRows,
        attempts,
        next_check_at: nextCheckAt
      })
  };
}

function toAirtableHsResultQueue(row) {
  return cleanFields({
    result_queue_key: row.result_queue_key,
    show_no: Number(row.show_no),
    focus_day: row.focus_day,
    ring_name_normalized: row.ring_name_normalized,
    ring_visual_key: row.ring_visual_key,
    class_visual_key: row.class_visual_key,
    class_no: intOrNull(row.class_no),
    sect_no: row.sect_no,
    class_number: row.class_number,
    class_name: row.class_name,
    status: row.status,
    queued_at: airtableDateTime(row.queued_at),
    next_check_at: airtableDateTime(row.next_check_at),
    last_checked_at: airtableDateTime(row.last_checked_at),
    attempts: row.attempts,
    result_rows: row.result_rows,
    completed_at: airtableDateTime(row.completed_at),
    source: row.source,
    raw_json: row.raw_json
  });
}

function toAirtableHsResultClass(row) {
  return cleanFields({
    result_class_key: row.result_class_key,
    show_no: Number(row.show_no),
    focus_day: row.focus_day,
    ring_name_normalized: row.ring_name_normalized,
    ring_visual_key: row.ring_visual_key,
    class_visual_key: row.class_visual_key,
    class_no: intOrNull(row.class_no),
    sect_no: row.sect_no,
    class_number: row.class_number,
    class_name: row.class_name,
    result_entry_count: row.result_entry_count,
    has_score: row.has_score,
    has_prize: row.has_prize,
    completed_at: airtableDateTime(row.completed_at),
    source: row.source,
    raw_json: row.raw_json
  });
}

function toAirtableHsClassResult(row) {
  return cleanFields({
    class_result_key: row.class_result_key,
    show_no: Number(row.show_no),
    focus_day: row.focus_day,
    ring_name_normalized: row.ring_name_normalized,
    ring_visual_key: row.ring_visual_key,
    class_visual_key: row.class_visual_key,
    entry_visual_key: row.entry_visual_key,
    class_no: intOrNull(row.class_no),
    sect_no: row.sect_no,
    class_number: row.class_number,
    class_name: row.class_name,
    place: row.place,
    entry_no: intOrNull(row.entry_no),
    horse: row.horse,
    rider: row.rider,
    owner: row.owner,
    score: row.score,
    time: row.time,
    prize: row.prize,
    completed_at: airtableDateTime(row.completed_at),
    source: row.source,
    raw_json: row.raw_json
  });
}

function step6ClassStartStatusRow(classRow, resultRows, task07Complete = false, now = catalystDateTime()) {
  const row = {
    class_start_key: classRow.class_start_key,
    show_no: text(classRow.show_no),
    focus_day: classRow.focus_day,
    check_results: classRow.check_results === true,
    result_probe_ready_at: classRow.result_probe_ready_at,
    result_probe_reason: classRow.result_probe_reason
  };
  if (task07Complete) {
    row.class_status = "Done";
    row.completed_at = now;
    row.completed_reason = "task07_operational_finality";
  }
  return row;
}

function toAirtableHsClassStartStatus(row) {
  const fields = {
    class_start_key: row.class_start_key,
    show_no: Number(row.show_no),
    focus_day: row.focus_day,
    check_results: row.check_results === true,
    result_probe_ready_at: airtableDateTime(row.result_probe_ready_at),
    result_probe_reason: row.result_probe_reason
  };
  if (text(row.class_status)) fields.class_status = row.class_status;
  if (text(row.completed_at)) fields.completed_at = airtableDateTime(row.completed_at);
  if (text(row.completed_reason)) fields.completed_reason = row.completed_reason;
  return cleanFields(fields);
}

async function runWecStep6Results(app, baseId, token, focusShow, options = {}) {
  if (!focusShow.results_enabled) {
    return {
      ok: true,
      skipped: true,
      reason: "focus_show.results_enabled_false",
      action: "wec-step6-results",
      show_no: Number(focusShow.show_no),
      focus_day: focusShow.focus_day,
      source: [CLEAN_RESULT_SOURCE, "hs_update_schedule.live_flag", "hs_class_start_times", "hs_entry_go_times"],
      writes: { catalyst: 0, airtable: 0 },
      step_1_5_run: false,
      result_alerts_run: false
    };
  }

  const showNo = text(focusShow.show_no);
  const focusDay = focusShow.focus_day;
  const nowDate = new Date();
  const now = catalystDateTime(nowDate);
  const force = options.force === true;
  const limit = Math.max(1, Math.min(5, intOrNull(options.limit) || 3));
  const offset = Math.max(0, intOrNull(options.offset) || 0);

  const updateScheduleRows = await catalystRows(app, TABLES.updateSchedule, showNo, focusDay);
  const classStartRows = await catalystRows(app, TABLES.classStartTimes, showNo, focusDay);
  const entryGoTimeRows = await catalystRows(app, TABLES.entryGoTimes, showNo, focusDay);
  const timeEngineRows = await catalystRows(app, TABLES.timeEngine, showNo, focusDay);
  const timeEngineTriggerRows = await catalystRows(app, TABLES.timeEngineTriggers, showNo, focusDay);
  const resultReadyKeys = timeEngineTriggerResultReadyClassKeys(timeEngineTriggerRows);
  const watchedReady = watchedScheduleClassKeys(updateScheduleRows, entryGoTimeRows, nowDate);
  const existingQueueRows = await catalystRows(app, TABLES.resultQueue, showNo, focusDay);
  const existingResultClassRows = await catalystRows(app, TABLES.resultClasses, showNo, focusDay);
  const existingClassResultRows = await catalystRows(app, TABLES.classResults, showNo, focusDay);
  const existingRiderResultRows = await catalystRows(app, TABLES.riderResults, showNo, focusDay);
  const trackedByClass = trackedEntriesByClassConstKey(entryGoTimeRows);
  const allClassRows = buildTask07ClassRows(classStartRows, entryGoTimeRows, existingQueueRows, resultReadyKeys, existingRiderResultRows, force, nowDate);
  const classRows = allClassRows.slice(offset, offset + limit);
  const classByNo = new Map(classRows.map((row) => [text(row.class_no), row]));
  const entryGoTimeByClassEntry = new Map(entryGoTimeRows.map((row) => [classEntryKey(row), row]));

  if (!classRows.length) {
    return {
      ok: true,
      action: "wec-step6-results",
      show_no: Number(showNo),
      focus_day: focusDay,
      results_enabled: true,
      source: [CLEAN_RESULT_SOURCE, "hs_update_schedule.live_flag", "hs_class_start_times", "hs_entry_go_times"],
      source_counts: {
        hs_update_schedule: updateScheduleRows.length,
        tracked_hs_entry_go_times_classes: scopedClassConstKeysFromEntries(entryGoTimeRows).size,
        watched_live_flag_classes: [...watchedReady.values()].length,
        watched_result_ready: [...watchedReady.values()].filter((row) => row.ready === true).length,
        time_engine: timeEngineRows.length,
        time_engine_triggers: timeEngineTriggerRows.length,
        time_engine_result_ready: resultReadyKeys.size,
        hs_class_start_times: classStartRows.length,
        hs_entry_go_times: entryGoTimeRows.length,
        hs_result_queue: existingQueueRows.length,
        hs_result_classes: existingResultClassRows.length,
        hs_class_results: existingClassResultRows.length,
        hs_rider_results: existingRiderResultRows.length
      },
      eligibility: runtimeClassSourceEvidence(classStartRows, entryGoTimeRows, existingQueueRows, nowDate, resultReadyKeys, watchedReady),
      guard: {
        only_hs_entry_go_times_classes: true,
        outside_tracked_class_keys: outsideTrackedClassKeys(allClassRows, entryGoTimeRows).length
      },
      check_results_count: resultReadyKeys.size,
      target_classes_total: allClassRows.length,
      offset,
      limit,
      next_offset: 0,
      probed_classes: 0,
      parsed_blocks: 0,
      completed_classes: 0,
      class_results: 0,
      queue_rows: 0,
      changed_rows: 0,
      no_old_airtable_staging_source: true,
      result_alerts_run: false,
      step_1_5_run: false
    };
  }

  const fetched = await fetchResults(showNo, classRows);
  const parsedClassNos = new Set(fetched.parsed.classes.map((row) => text(row.class_no)).filter(Boolean));
  const resultClassRows = fetched.parsed.classes
    .map((row) => step6ResultClassRow(showNo, focusDay, row, now, classByNo.get(text(row.class_no))))
    .filter(Boolean);
  const classResultRows = uniqueRowsByKey(fetched.parsed.results
    .map((row) => step6ClassResultRow(showNo, focusDay, row, now, classByNo.get(text(row.class_no)), entryGoTimeByClassEntry))
    .filter(Boolean), "class_result_key");
  const terminalByClassKey = new Map();
  const queueRows = classRows.map((classRow) => {
    const resultRows = fetched.parsed.results.filter((row) => text(row.class_no) === text(classRow.class_no)).length;
    const normalizedBlock = normalizedResultBlockForClass(classRow.class_no, fetched.parsed);
    const hash = resultBlockHash(normalizedBlock);
    const stability = task07Stability(classRow.previous_queue, hash, true);
    const resultReady = resultReadyKeys.has(text(classRow.class_const_key));
    const parsedBlockExists = parsedClassNos.has(text(classRow.class_no)) && !!hash;
    const noLongerLive = classIsNoLongerLive(classRow);
    const finalitySatisfied = resultReady && noLongerLive && parsedBlockExists && stability.finality_satisfied;
    const task07 = {
      result_block_hash: hash,
      previous_result_block_hash: stability.previous_hash,
      stable_count: stability.stable_count,
      finality_satisfied: finalitySatisfied,
      observation_status: finalitySatisfied ? "second_identical_observation_terminal" : (parsedBlockExists ? "first_or_changed_observation" : "no_parsed_result_block"),
      observed_at: now
    };
    if (finalitySatisfied) {
      const entries = trackedByClass.get(text(classRow.class_const_key)) || [];
      terminalByClassKey.set(text(classRow.class_const_key), buildTerminalRiderResults(showNo, focusDay, classRow, entries, fetched.parsed.results, now, `wec-results-${Date.now()}`));
    }
    return step6ResultQueueRow(showNo, focusDay, classRow, finalitySatisfied ? "completed" : "pending", resultRows, now, nowDate, task07);
  });
  const classStartStatusRows = classRows.map((classRow) => {
    const resultRows = fetched.parsed.results.filter((row) => text(row.class_no) === text(classRow.class_no)).length;
    const terminalRows = terminalByClassKey.get(text(classRow.class_const_key)) || [];
    return step6ClassStartStatusRow(classRow, resultRows, terminalRows.length > 0, now);
  });
  const terminalRiderRows = uniqueRowsByKey([...terminalByClassKey.values()].flat(), "rider_result_key");
  const existingRiderResultKeys = existingKeySet(existingRiderResultRows, "rider_result_key");
  const riderRowsToCreate = terminalRiderRows.filter((row) => !existingRiderResultKeys.has(text(row.rider_result_key)));
  const existingResultAvailableKeys = existingKeySet(
    timeEngineTriggerRows.filter((row) => text(row.trigger_type).toLowerCase() === "result_available"),
    "trigger_key"
  );
  const resultAvailableTriggers = terminalRiderRows
    .map((row) => {
      const classRow = classByNo.get(text(row.class_no));
      const entryRow = entryGoTimeByClassEntry.get(classEntryKey(row));
      return resultAvailableTrigger(row, classRow, entryRow, now);
    })
    .filter((row) => !existingResultAvailableKeys.has(text(row.trigger_key)));

  const catalystCounters = { result_classes: { inserted: 0, updated: 0 }, class_results: { inserted: 0, updated: 0 }, result_queue: { inserted: 0, updated: 0 }, class_start_times: { inserted: 0, updated: 0 }, rider_results: { inserted: 0, existing: 0 }, result_available: { inserted: 0, existing: 0 } };
  let catalystTimeColumnMissingRows = 0;
  for (const row of resultClassRows) {
    const result = await upsertCatalyst(app, TABLES.resultClasses, "result_class_key", row);
    if (result.action === "inserted") catalystCounters.result_classes.inserted += 1;
    if (result.action === "updated") catalystCounters.result_classes.updated += 1;
  }
  for (const row of classResultRows) {
    const result = await upsertCatalystClassResult(app, row);
    if (result.warning === "catalyst_time_column_missing_time_omitted") catalystTimeColumnMissingRows += 1;
    if (result.action === "inserted") catalystCounters.class_results.inserted += 1;
    if (result.action === "updated") catalystCounters.class_results.updated += 1;
  }
  for (const row of riderRowsToCreate) {
    const result = await insertCatalystIfMissing(app, TABLES.riderResults, "rider_result_key", row);
    if (result.action === "inserted") catalystCounters.rider_results.inserted += 1;
    if (result.action === "existing") catalystCounters.rider_results.existing += 1;
  }
  for (const row of resultAvailableTriggers) {
    const result = await insertCatalystIfMissing(app, TABLES.timeEngineTriggers, "trigger_key", row);
    if (result.action === "inserted") catalystCounters.result_available.inserted += 1;
    if (result.action === "existing") catalystCounters.result_available.existing += 1;
  }

  let airtableRiderResultsCreated = 0;
  let airtableRiderResultsExisting = 0;
  if (terminalRiderRows.length) {
    const existingAirtableRows = await airtableList(baseId, AIRTABLE_TABLES.hs_rider_results, activeFocusFormula(showNo, focusDay), token);
    const existingAirtableKeys = existingKeySet(existingAirtableRows, "rider_result_key");
    for (const row of terminalRiderRows) {
      if (existingAirtableKeys.has(text(row.rider_result_key))) {
        airtableRiderResultsExisting += 1;
        continue;
      }
      await airtableCreate(baseId, AIRTABLE_TABLES.hs_rider_results, toAirtableHsRiderResult(row), token);
      existingAirtableKeys.add(text(row.rider_result_key));
      airtableRiderResultsCreated += 1;
    }
  }
  for (const row of queueRows) {
    const result = await upsertCatalyst(app, TABLES.resultQueue, "result_queue_key", row);
    if (result.action === "inserted") catalystCounters.result_queue.inserted += 1;
    if (result.action === "updated") catalystCounters.result_queue.updated += 1;
  }
  for (const row of classStartStatusRows) {
    const result = await upsertCatalyst(app, TABLES.classStartTimes, "class_start_key", row);
    if (result.action === "inserted") catalystCounters.class_start_times.inserted += 1;
    if (result.action === "updated") catalystCounters.class_start_times.updated += 1;
  }

  const verifyCatalystQueue = await catalystRows(app, TABLES.resultQueue, showNo, focusDay);
  const verifyCatalystClasses = await catalystRows(app, TABLES.resultClasses, showNo, focusDay);
  const verifyCatalystResults = await catalystRows(app, TABLES.classResults, showNo, focusDay);
  const verifyCatalystRiderResults = await catalystRows(app, TABLES.riderResults, showNo, focusDay);
  const verifyCatalystTriggers = await catalystRows(app, TABLES.timeEngineTriggers, showNo, focusDay);
  const nextOffset = offset + limit < allClassRows.length ? offset + limit : 0;
  return {
    ok: verifyCatalystQueue.length > 0 || queueRows.length === 0,
    action: "wec-step6-results",
    show_no: Number(showNo),
    focus_day: focusDay,
    results_enabled: true,
    source: [CLEAN_RESULT_SOURCE, "hs_update_schedule.live_flag", "hs_class_start_times", "hs_entry_go_times"],
    result_source_endpoint: "show_results4.php",
    source_request_uses_native_class_no: true,
    target_catalyst: ["hs_result_queue", "hs_result_classes", "hs_class_results", "hs_rider_results", "hs_class_start_times", "time_engine_triggers"],
    target_airtable: ["hs_rider_results"],
    source_counts: {
      hs_update_schedule: updateScheduleRows.length,
      tracked_hs_entry_go_times_classes: scopedClassConstKeysFromEntries(entryGoTimeRows).size,
      watched_live_flag_classes: [...watchedReady.values()].length,
      watched_result_ready: [...watchedReady.values()].filter((row) => row.ready === true).length,
      time_engine: timeEngineRows.length,
      time_engine_triggers: timeEngineTriggerRows.length,
      time_engine_result_ready: resultReadyKeys.size,
      hs_class_start_times: classStartRows.length,
      hs_entry_go_times: entryGoTimeRows.length,
      hs_result_queue: existingQueueRows.length,
      hs_result_classes: existingResultClassRows.length,
      hs_class_results: existingClassResultRows.length,
      hs_rider_results: existingRiderResultRows.length
    },
    eligibility: runtimeClassSourceEvidence(classStartRows, entryGoTimeRows, existingQueueRows, nowDate, resultReadyKeys, watchedReady),
    guard: {
      only_hs_entry_go_times_classes: true,
      outside_tracked_class_keys: outsideTrackedClassKeys(allClassRows, entryGoTimeRows).length
    },
    check_results_count: resultReadyKeys.size,
    target_classes_total: allClassRows.length,
    offset,
    limit,
    next_offset: nextOffset,
    probed_classes: classRows.length,
    probed_class_nos: classRows.map((row) => text(row.class_no)),
    parsed_blocks: fetched.parsed.blocks,
    completed_classes: resultClassRows.length,
    class_results: classResultRows.length,
    terminal_rider_results: terminalRiderRows.length,
    terminal_rider_results_created: riderRowsToCreate.length,
    result_available_events_created: resultAvailableTriggers.length,
    queue_rows: queueRows.length,
    changed_rows: resultClassRows.length + classResultRows.length + queueRows.length + classStartStatusRows.length + riderRowsToCreate.length + resultAvailableTriggers.length,
    attempts: queueRows.map((row) => ({
      class_no: row.class_no,
      status: row.status,
      attempts: row.attempts,
      next_check_at: row.next_check_at || "",
      result_rows: row.result_rows
    })),
    pending_next_check_at_count: queueRows.filter((row) => row.status === "pending" && text(row.next_check_at)).length,
    exhausted_classes: queueRows.filter((row) => row.status === "exhausted").length,
    completed_class_status_updates: classStartStatusRows.filter((row) => row.class_status === "Done").length,
    fake_results_created: 0,
    catalyst: catalystCounters,
    catalyst_time_column_missing_rows: catalystTimeColumnMissingRows,
    airtable: { hs_rider_results: { created: airtableRiderResultsCreated, existing: airtableRiderResultsExisting } },
    verify: {
      catalyst_result_queue: verifyCatalystQueue.length,
      catalyst_result_classes: verifyCatalystClasses.length,
      catalyst_class_results: verifyCatalystResults.length,
      catalyst_hs_rider_results: verifyCatalystRiderResults.length,
      catalyst_time_engine_triggers: verifyCatalystTriggers.length
    },
    no_old_airtable_staging_source: true,
    result_alerts_run: false,
    step_1_5_run: false
  };
}

function toAirtableResultClass(row, sourceClass, resultQueueByKey) {
  const queueKey = resultKey(row.show_no, row.focus_day, row.class_no || row.class_number);
  return cleanFields({
    [RESULT_CLASS_FIELDS.result_class_key]: row.result_class_key,
    [RESULT_CLASS_FIELDS.show_no]: Number(row.show_no),
    [RESULT_CLASS_FIELDS.focus_day]: row.focus_day,
    [RESULT_CLASS_FIELDS.class_no]: intOrNull(row.class_no),
    [RESULT_CLASS_FIELDS.sect_no]: intOrNull(row.sect_no),
    [RESULT_CLASS_FIELDS.class_number]: intOrNull(row.class_number),
    [RESULT_CLASS_FIELDS.class_name]: row.class_name,
    [RESULT_CLASS_FIELDS.result_entry_count]: row.result_entry_count,
    [RESULT_CLASS_FIELDS.has_score]: row.has_score,
    [RESULT_CLASS_FIELDS.has_prize]: row.has_prize,
    [RESULT_CLASS_FIELDS.completed_at]: airtableDateTime(row.completed_at),
    [RESULT_CLASS_FIELDS.source]: row.source,
    [RESULT_CLASS_FIELDS.raw_json]: row.raw_json,
    [RESULT_CLASS_FIELDS.classes]: links(sourceClass?.classes),
    [RESULT_CLASS_FIELDS.class_oog]: links(sourceClass?.class_oog_ids),
    [RESULT_CLASS_FIELDS.result_queue]: links([resultQueueByKey.get(queueKey)]),
    [RESULT_CLASS_FIELDS.class_oog_staging]: links(sourceClass?.class_oog_staging_ids)
  });
}

function toAirtableClassResult(row, sourceEntry, focusShow, entryGoTimeByClassEntry) {
  return cleanFields({
    [CLASS_RESULT_FIELDS.class_result_key]: row.class_result_key,
    [CLASS_RESULT_FIELDS.show_no]: Number(row.show_no),
    [CLASS_RESULT_FIELDS.shows]: links(sourceEntry?.shows || focusShow.shows),
    [CLASS_RESULT_FIELDS.focus_show]: focusShowLinksFor(sourceEntry, focusShow),
    [CLASS_RESULT_FIELDS.focus_day]: row.focus_day,
    [CLASS_RESULT_FIELDS.class_no]: intOrNull(row.class_no),
    [CLASS_RESULT_FIELDS.classes]: links(sourceEntry?.classes),
    [CLASS_RESULT_FIELDS.sect_no]: intOrNull(row.sect_no),
    [CLASS_RESULT_FIELDS.class_number]: intOrNull(row.class_number),
    [CLASS_RESULT_FIELDS.class_name]: row.class_name,
    [CLASS_RESULT_FIELDS.place]: row.place,
    [CLASS_RESULT_FIELDS.entry_no]: intOrNull(row.entry_no),
    [CLASS_RESULT_FIELDS.entries]: links(sourceEntry?.entries),
    [CLASS_RESULT_FIELDS.horse]: row.horse,
    [CLASS_RESULT_FIELDS.horses]: links(sourceEntry?.horses),
    [CLASS_RESULT_FIELDS.rider]: row.rider,
    [CLASS_RESULT_FIELDS.riders]: links(sourceEntry?.riders),
    [CLASS_RESULT_FIELDS.owner]: row.owner,
    [CLASS_RESULT_FIELDS.score]: row.score,
    [CLASS_RESULT_FIELDS.prize]: row.prize,
    [CLASS_RESULT_FIELDS.completed_at]: airtableDateTime(row.completed_at),
    [CLASS_RESULT_FIELDS.source]: row.source,
    [CLASS_RESULT_FIELDS.raw_json]: row.raw_json,
    [CLASS_RESULT_FIELDS.class_oog_staging]: links([sourceEntry?.record_id]),
    [CLASS_RESULT_FIELDS.entry_go_times]: links([entryGoTimeByClassEntry.get(classResultSourceKey(row))]),
    [CLASS_RESULT_FIELDS.show_days]: links(sourceEntry?.show_days),
    [CLASS_RESULT_FIELDS.ring_days]: links(sourceEntry?.ring_days),
    [CLASS_RESULT_FIELDS.rings]: links(sourceEntry?.rings),
    [CLASS_RESULT_FIELDS.ring_names]: ringNameLinksFor(sourceEntry),
    [CLASS_RESULT_FIELDS.trainers]: links(sourceEntry?.trainers)
  });
}

function toAirtableQueue(row, sourceClass, focusShow) {
  return cleanFields({
    [RESULT_QUEUE_FIELDS.result_queue_key]: row.result_queue_key,
    [RESULT_QUEUE_FIELDS.show_no]: Number(row.show_no),
    [RESULT_QUEUE_FIELDS.shows]: links(focusShow.shows),
    [RESULT_QUEUE_FIELDS.focus_show]: focusShowLinksFor(sourceClass, focusShow),
    [RESULT_QUEUE_FIELDS.focus_day]: row.focus_day,
    [RESULT_QUEUE_FIELDS.class_no]: intOrNull(row.class_no),
    [RESULT_QUEUE_FIELDS.classes]: links(sourceClass?.classes),
    [RESULT_QUEUE_FIELDS.sect_no]: intOrNull(row.sect_no),
    [RESULT_QUEUE_FIELDS.class_number]: intOrNull(row.class_number),
    [RESULT_QUEUE_FIELDS.class_name]: row.class_name,
    [RESULT_QUEUE_FIELDS.status]: row.status,
    [RESULT_QUEUE_FIELDS.queued_at]: airtableDateTime(row.queued_at),
    [RESULT_QUEUE_FIELDS.last_checked_at]: airtableDateTime(row.last_checked_at),
    [RESULT_QUEUE_FIELDS.attempts]: row.attempts,
    [RESULT_QUEUE_FIELDS.result_rows]: row.result_rows,
    [RESULT_QUEUE_FIELDS.completed_at]: airtableDateTime(row.completed_at),
    [RESULT_QUEUE_FIELDS.source]: row.source,
    [RESULT_QUEUE_FIELDS.raw_json]: row.raw_json,
    [RESULT_QUEUE_FIELDS.class_oog_staging]: links(sourceClass?.class_oog_staging_ids)
  });
}

async function writeLog(baseId, token, detail) {
  const now = new Date().toISOString();
  const isResultAlert = detail.action === "sync-result-alerts";
  const checkName = isResultAlert ? "sync_result_alerts" : "probe_results";
  await airtableCreate(baseId, AIRTABLE_TABLES.wec_logs, {
    [WEC_LOG_FIELDS.log_key_run]: `${now}|${isResultAlert ? "alerts" : "results"}|${checkName}`,
    [WEC_LOG_FIELDS.log_key]: `${isResultAlert ? "alerts" : "results"}|${detail.show_no}|${detail.focus_day}`,
    [WEC_LOG_FIELDS.workflow_lanes]: isResultAlert ? "Alerts" : "Results",
    [WEC_LOG_FIELDS.log_type]: "result_classes",
    [WEC_LOG_FIELDS.check_name]: checkName,
    [WEC_LOG_FIELDS.show_no]: Number(detail.show_no),
    [WEC_LOG_FIELDS.focus_day]: detail.focus_day,
    [WEC_LOG_FIELDS.status]: detail.ok ? "ok" : "error",
    [WEC_LOG_FIELDS.records_seen]: detail.source_rows,
    [WEC_LOG_FIELDS.records_changed]: detail.changed_rows,
    [WEC_LOG_FIELDS.summary]: detail.ok
      ? (isResultAlert
        ? `result alerts checked ${detail.source_rows}; changed ${detail.changed_rows}`
        : detail.skipped
        ? `results skipped: ${detail.reason}`
        : `results probed ${detail.probed_classes}; completed ${detail.completed_classes}; class_results ${detail.class_results}`)
      : `results failed at ${detail.phase}: ${detail.error}`,
    [WEC_LOG_FIELDS.payload_json]: safeJson(detail),
    [WEC_LOG_FIELDS.created_at]: now
  }, token);
}

function isAllowedResultsAction(action) {
  return action === "wec-step6-results" || action === "sync-result-alerts";
}

function resultsErrorStatusCode() {
  return 500;
}

function step6LogDetail(detail, phase) {
  return {
    ...detail,
    phase,
    source_rows: intOrNull(detail.source_rows) ?? intOrNull(detail.target_classes_total) ?? 0,
    changed_rows: intOrNull(detail.changed_rows) ?? 0
  };
}

function resultAlertLogDetail({ showNo, focusDay, sourceRows, resultAlerts, phase }) {
  return {
    ok: Number(resultAlerts?.duplicate_alert_keys || 0) === 0,
    action: "sync-result-alerts",
    phase,
    show_no: Number(showNo),
    focus_day: focusDay,
    source_rows: Number(sourceRows || 0),
    changed_rows: Number(resultAlerts?.records_changed || 0),
    result_alerts: resultAlerts
  };
}

async function handle(req, res) {
  let phase = "start";
  let logContext = {};
  let query = new URLSearchParams();
  let body = {};
  let noWrite = false;
  let action = "";
  try {
    setCors(res);
    if ((req.method || "").toUpperCase() === "OPTIONS") return res.end("");
    query = parseQuery(req);
    body = await readBody(req);
    const requestedShowNo = text(query.get("show_no") || body.show_no);
    const force = text(query.get("force") || body.force) === "1" || body.force === true;
    action = text(query.get("action") || body.action);
    const offset = Math.max(0, intOrNull(query.get("offset") || body.offset) || 0);
    const limit = Math.max(1, Math.min(25, intOrNull(query.get("limit") || body.limit) || 25));
    noWrite = flagTrue(query.get("no_write") || body.no_write)
      || flagTrue(query.get("dry_run") || body.dry_run)
      || flagTrue(query.get("dryRun") || body.dryRun);
    const baseId = text(process.env.WEC_AIRTABLE_BASE_ID || body.base_id || query.get("base_id") || DEFAULT_BASE_ID);
    const authHeader = text(req.headers?.["x-airtable-token"] || req.headers?.authorization || req.headers?.Authorization);
    const bearerToken = authHeader.match(/^Bearer\s+(.+)$/i)?.[1] || "";
    const token = text(bearerToken || body.airtable_token || query.get("airtable_token") || process.env.AIRTABLE_TOKEN);
    if (!token) return sendJson(res, 500, { ok: false, phase, error: "missing AIRTABLE_TOKEN fallback" });

    phase = "initialize_catalyst";
    const app = catalyst.initialize(req);
    phase = "read_focus_show";
    const focusShow = await getFocusShow(baseId, requestedShowNo, token);
    const showNo = text(focusShow.show_no);
    logContext = { show_no: Number(showNo), focus_day: focusShow.focus_day };
    if (!isAllowedResultsAction(action)) {
      return sendJson(res, 410, {
        ok: false,
        action: action || "",
        error: "legacy_results_action_disabled",
        allowed_action: "wec-step6-results",
        source: CLEAN_RESULT_SOURCE,
        no_class_oog_staging_source: true,
        step_1_5_run: false,
        result_alerts_run: false
      });
    }
    const routerRunId = text(query.get("run_id") || body.run_id) || `wec-step6-results-${new Date().toISOString().replace(/[^0-9A-Za-z]/g, "")}`;
    const router = action === "wec-step6-results" ? createRouterRun({
      app,
      base: {
        run_id: routerRunId,
        parent_run_id: text(query.get("parent_run_id") || body.parent_run_id),
        show_no: Number(showNo),
        focus_day: focusShow.focus_day,
        lane: "results",
        source_function: "horseshowing_results_runner",
        source_action: action,
        trigger_source: "catalyst_job_scheduling",
        trigger_reason: "scheduled_results_wake"
      }
    }) : null;
    if (focusShow.is_pause) {
      const executePaused = async () => {
        const detail = {
          ok: true,
          skipped: true,
          paused: true,
          reason: "focus_show.is_pause",
          action,
          source: CLEAN_RESULT_SOURCE,
          show_no: Number(showNo),
          focus_day: focusShow.focus_day,
          source_rows: 0,
          changed_rows: 0,
          probed_classes: 0,
          completed_classes: 0,
          class_results: 0,
          no_write: noWrite,
          catalyst_writes: 0,
          airtable_writes: 0,
          wec_log_written: !noWrite
        };
        if (!noWrite && !router) {
          phase = "write_wec_log_paused";
          await writeLog(baseId, token, detail);
        }
        return detail;
      };
      const detail = router
        ? await executeLoggedAction(router, { stage: "results", outcome: () => ({ trigger_reason: "focus_show.is_pause" }) }, executePaused)
        : await executePaused();
      return sendJson(res, 200, detail);
    }

    if (action === "sync-result-alerts") {
      phase = "read_class_results_for_result_alerts";
      const allClassResults = await getClassResultsForAlerts(baseId, showNo, focusShow.focus_day, token);
      const existingResultAlerts = await getScopedResultAlerts(baseId, showNo, focusShow.focus_day, token);
      const pendingClassResults = pendingResultAlertRows(allClassResults, existingResultAlerts, allClassResults.length || 1);
      const classResultsPage = pendingClassResults.slice(0, limit);
      phase = noWrite ? "dry_run_result_alerts" : "write_result_alerts";
      const resultAlerts = await writeResultAlertsForClassResults(
        baseId,
        token,
        showNo,
        focusShow.focus_day,
        classResultsPage,
        { noWrite }
      );
      const response = {
        ok: resultAlerts.duplicate_alert_keys === 0,
        phase,
        action,
        source: "class_results",
        target: "wec-alerts",
        show_no: Number(showNo),
        focus_day: focusShow.focus_day,
        class_results_source_rows: allClassResults.length,
        offset: 0,
        limit,
        pending_before_run: pendingClassResults.length,
        remaining: Math.max(0, pendingClassResults.length - classResultsPage.length),
        complete: pendingClassResults.length <= classResultsPage.length,
        next_offset: 0,
        result_alerts: resultAlerts,
        notifications_sent: 0,
        downstream_run: false
      };
      if (!noWrite) {
        await writeLog(baseId, token, resultAlertLogDetail({
          showNo,
          focusDay: focusShow.focus_day,
          sourceRows: allClassResults.length,
          resultAlerts,
          phase
        }));
      }
      return sendJson(res, 200, response);
    }

    if (action === "wec-step6-results") {
      phase = "wec_step6_results";
      const detail = await executeLoggedAction(router, {
        stage: "results",
        after: async (businessResult, run) => {
          const probed = Number(businessResult.probed_classes || 0);
          await run.log({
            stage: "result_probe",
            event_type: probed > 0 ? "pass" : "skip",
            status: probed > 0 ? "PASS" : "SKIP",
            input_count: businessResult.target_classes_total,
            output_count: probed,
            trigger_reason: probed > 0 ? "eligible_classes_probed" : "no_eligible_classes"
          });
          await run.log({
            stage: "result_write",
            event_type: businessResult.ok ? "pass" : "error",
            status: businessResult.ok ? "PASS" : "FAIL",
            input_count: probed,
            output_count: businessResult.changed_rows || 0,
            next_lane: "hs_class_results"
          });
          await run.log({
            stage: "rider_results_target",
            event_type: "skip",
            status: "SKIP",
            next_lane: "hs_rider_results",
            trigger_reason: "future_target_not_implemented"
          });
          await run.log({
            stage: "customer_output_publish",
            event_type: "skip",
            status: "SKIP",
            trigger_reason: "no_active_publish_refresh_in_results_action"
          });
        },
        outcome: (businessResult) => ({
          input_count: businessResult.target_classes_total,
          output_count: businessResult.changed_rows || 0,
          http_status: businessResult.ok ? 200 : 500,
          payload_json: {
            probed_classes: businessResult.probed_classes,
            completed_classes: businessResult.completed_classes,
            class_results: businessResult.class_results
          }
        })
      }, async () => {
        const businessResult = await runWecStep6Results(app, baseId, token, focusShow, {
          force,
          offset,
          limit: intOrNull(query.get("limit") || body.limit) || 3
        });
        return businessResult;
      });
      return sendJson(res, detail.ok ? 200 : 500, detail);
    }

    phase = "read_source_class_oog_staging_active_entries";
    const classOogRows = await getActiveClassOogStagingRows(baseId, showNo, focusShow.focus_day, token);
    const sourceClassNos = unique(classOogRows.map((row) => row.class_no));

    phase = "check_existing_result_classes";
    const existingClasses = await catalystRows(app, TABLES.resultClasses, showNo, focusShow.focus_day);
    const completedExisting = force ? new Set() : existingCompletedClassNos(existingClasses);
    const allClassRows = buildClassRows(classOogRows, completedExisting);
    const classRows = allClassRows.slice(offset, offset + limit);
    const classByNo = new Map(classRows.map((row) => [text(row.class_no), row]));
    const sourceEntryByClassEntry = new Map(classOogRows.map((row) => [`${text(row.class_no)}|${text(row.entry_no)}`, row]));
    phase = "read_entry_go_times_link_targets";
    const entryGoTimeRows = await getEntryGoTimeRows(baseId, showNo, focusShow.focus_day, token);
    const entryGoTimeByClassEntry = new Map(entryGoTimeRows.map((row) => [classEntryKey(row), row.record_id]));

    const now = catalystDateTime();
    if (!classRows.length) {
      const detail = {
        ok: true,
        phase,
        action: "probe-results",
        show_no: Number(showNo),
        focus_day: focusShow.focus_day,
        source: RESULT_SOURCE,
        source_rows: classOogRows.length,
        source_classes: sourceClassNos.length,
        skipped_completed: completedExisting.size,
        target_classes_total: allClassRows.length,
        offset,
        limit,
        next_offset: 0,
        probed_classes: 0,
        completed_classes: 0,
        class_results: 0,
        changed_rows: 0,
        no_write: noWrite,
        source_field_evidence: sourceFieldEvidence(classOogRows),
        catalyst_writes: 0,
        airtable_writes: 0,
        wec_log_written: !noWrite
      };
      if (!noWrite) await writeLog(baseId, token, detail);
      return sendJson(res, 200, detail);
    }

    phase = "fetch_show_results4";
    const fetched = await fetchResults(showNo, classRows);
    const parsedClassNos = new Set(fetched.parsed.classes.map((row) => text(row.class_no)).filter(Boolean));
    const parsedResultsForActiveEntries = fetched.parsed.results
      .filter((row) => sourceEntryByClassEntry.has(`${text(row.class_no)}|${text(row.entry_no)}`));
    const resultClassRows = fetched.parsed.classes
      .filter((row) => parsedClassNos.has(text(row.class_no)))
      .map((row) => resultClassRow(showNo, focusShow.focus_day, row, now))
      .filter(Boolean);
    const classResultRows = parsedResultsForActiveEntries
      .map((row) => classResultRow(showNo, focusShow.focus_day, row, now, sourceEntryByClassEntry.get(`${text(row.class_no)}|${text(row.entry_no)}`)))
      .filter(Boolean);
    const queueRows = classRows.map((classRow) => {
      const resultRows = fetched.parsed.results.filter((row) => text(row.class_no) === text(classRow.class_no)).length;
      const status = parsedClassNos.has(text(classRow.class_no)) ? "completed" : "pending";
      const parsedClass = fetched.parsed.classes.find((row) => text(row.class_no) === text(classRow.class_no)) || classRow;
      return resultQueueRow(showNo, focusShow.focus_day, { ...classRow, ...parsedClass }, status, resultRows, now);
    });

    if (noWrite) {
      phase = "no_write_verify_results";
      const sourceEvidence = sourceFieldEvidence(classOogRows);
      const keyEvidenceSummary = payloadKeyEvidence(queueRows, resultClassRows, classResultRows);
      const ok = sourceEvidence.missing_required_rows === 0
        && keyEvidenceSummary.total_missing_keys === 0
        && keyEvidenceSummary.total_duplicate_keys === 0;
      return sendJson(res, ok ? 200 : 500, {
        ok,
        phase,
        action: "probe-results",
        no_write: true,
        dry_run: true,
        source: RESULT_SOURCE,
        result_source_endpoint: "show_results4.php",
        target_catalyst: ["hs_result_queue", "hs_result_classes", "hs_class_results"],
        target_airtable: ["result_queue", "result_classes", "class_results"],
        show_no: Number(showNo),
        focus_day: focusShow.focus_day,
        source_rows: classOogRows.length,
        source_classes: sourceClassNos.length,
        skipped_completed: completedExisting.size,
        target_classes_total: allClassRows.length,
        offset,
        limit,
        next_offset: offset + limit < allClassRows.length ? offset + limit : 0,
        probed_classes: classRows.length,
        parsed_blocks: fetched.parsed.blocks,
        completed_classes: resultClassRows.length,
        class_results: classResultRows.length,
        queue_rows: queueRows.length,
        changed_rows: 0,
        source_field_evidence: sourceEvidence,
        payload_key_evidence: keyEvidenceSummary,
        class_oog_backlink_mapping: {
          required: true,
          source_field: "class_oog_staging.class_oog",
          rows_with_backlink: sourceEvidence.class_oog_backlink_rows,
          rows_checked: sourceEvidence.rows_checked
        },
        class_name_evidence: {
          class_name_raw_populated: sourceEvidence.class_name_raw_populated,
          class_name_after_fallback_populated: sourceEvidence.class_name_after_fallback_populated,
          class_label_fallback_rows: sourceEvidence.class_label_fallback_rows,
          class_name_required_for_keys: false,
          class_label_fallback_safe: true
        },
        catalyst_writes: 0,
        airtable_writes: 0,
        wec_log_written: false
      });
    }

    phase = "write_catalyst_results";
    const catalystCounters = { result_classes: { inserted: 0, updated: 0 }, class_results: { inserted: 0, updated: 0 }, result_queue: { inserted: 0, updated: 0 } };
    const insertedClassResultKeys = new Set();
    for (const row of resultClassRows) {
      const result = await upsertCatalyst(app, TABLES.resultClasses, "result_class_key", row);
      if (result.action === "inserted") catalystCounters.result_classes.inserted += 1;
      if (result.action === "updated") catalystCounters.result_classes.updated += 1;
    }
    for (const row of classResultRows) {
      const result = await upsertCatalyst(app, TABLES.classResults, "class_result_key", row);
      if (result.action === "inserted") {
        catalystCounters.class_results.inserted += 1;
        insertedClassResultKeys.add(text(row.class_result_key));
      }
      if (result.action === "updated") catalystCounters.class_results.updated += 1;
    }
    for (const row of queueRows) {
      const result = await upsertCatalyst(app, TABLES.resultQueue, "result_queue_key", row);
      if (result.action === "inserted") catalystCounters.result_queue.inserted += 1;
      if (result.action === "updated") catalystCounters.result_queue.updated += 1;
    }

    phase = "write_airtable_results";
    const airtableQueue = await airtableUpsert(
      baseId,
      AIRTABLE_TABLES.result_queue,
      RESULT_QUEUE_FIELDS.result_queue_key,
      queueRows.map((row) => toAirtableQueue(row, classByNo.get(text(row.class_no)), focusShow)),
      token
    );
    const resultQueueByKey = new Map(airtableQueue.map((record) => [
      text(fieldValue(record, RESULT_QUEUE_FIELDS.result_queue_key, "result_queue_key")),
      record.id
    ]));
    const airtableResultClasses = await airtableUpsert(
      baseId,
      AIRTABLE_TABLES.result_classes,
      RESULT_CLASS_FIELDS.result_class_key,
      resultClassRows.map((row) => toAirtableResultClass(row, classByNo.get(text(row.class_no)), resultQueueByKey)),
      token
    );
    const airtableClassResults = await airtableUpsert(
      baseId,
      AIRTABLE_TABLES.class_results,
      CLASS_RESULT_FIELDS.class_result_key,
      classResultRows.map((row) => toAirtableClassResult(row, sourceEntryByClassEntry.get(`${text(row.class_no)}|${text(row.entry_no)}`), focusShow, entryGoTimeByClassEntry)),
      token
    );
    let resultAlerts = {
      source_rows: 0,
      candidates: 0,
      created: 0,
      updated: 0,
      upserted: 0,
      duplicate_alert_keys: 0,
      notifications_sent: 0,
      records_changed: 0
    };
    if (insertedClassResultKeys.size) {
      phase = "write_result_alerts_for_new_class_results";
      const insertedClassResults = (await getClassResultsForAlerts(baseId, showNo, focusShow.focus_day, token))
        .filter((row) => insertedClassResultKeys.has(text(row.class_result_key)));
      resultAlerts = await writeResultAlertsForClassResults(baseId, token, showNo, focusShow.focus_day, insertedClassResults);
    }

    phase = "verify_results";
    const verifyCatalystClasses = await catalystRows(app, TABLES.resultClasses, showNo, focusShow.focus_day);
    const verifyCatalystQueue = await catalystRows(app, TABLES.resultQueue, showNo, focusShow.focus_day);
    const completedClassCount = resultClassRows.length;
    const changedRows = resultClassRows.length + classResultRows.length + queueRows.length + resultAlerts.records_changed;
    const ok = verifyCatalystQueue.length >= queueRows.length
      && verifyCatalystClasses.filter((row) => parsedClassNos.has(text(row.class_no))).length >= completedClassCount;
    const detail = {
      ok,
      phase,
      action: "probe-results",
      source: RESULT_SOURCE,
      result_source_endpoint: "show_results4.php",
      target_catalyst: ["hs_result_queue", "hs_result_classes", "hs_class_results"],
      target_airtable: ["result_queue", "result_classes", "class_results"],
      show_no: Number(showNo),
      focus_day: focusShow.focus_day,
      source_rows: classOogRows.length,
      source_classes: sourceClassNos.length,
      skipped_completed: completedExisting.size,
      target_classes_total: allClassRows.length,
      offset,
      limit,
      next_offset: offset + limit < allClassRows.length ? offset + limit : 0,
      probed_classes: classRows.length,
      parsed_blocks: fetched.parsed.blocks,
      completed_classes: completedClassCount,
      class_results: classResultRows.length,
      queue_rows: queueRows.length,
      changed_rows: changedRows,
      catalyst: catalystCounters,
      airtable: {
        result_classes: airtableResultClasses.length,
        class_results: airtableClassResults.length,
        result_queue: airtableQueue.length,
        wec_alerts: resultAlerts
      },
      verify: {
        catalyst_result_classes: verifyCatalystClasses.length,
        catalyst_result_queue: verifyCatalystQueue.length
      }
    };
    phase = "write_wec_log";
    await writeLog(baseId, token, detail);
    return sendJson(res, ok ? 200 : 500, detail);
  } catch (error) {
    try {
      const token = text(body.airtable_token || query.get("airtable_token") || process.env.AIRTABLE_TOKEN);
      if (token && !noWrite && action !== "wec-step6-results") {
        await writeLog(DEFAULT_BASE_ID, token, {
          ok: false,
          phase,
          show_no: logContext.show_no || intOrNull(query.get("show_no") || body.show_no) || 0,
          focus_day: logContext.focus_day || isoDate(query.get("focus_day") || body.focus_day),
          source_rows: 0,
          changed_rows: 0,
          error: String(error?.message || error)
        });
      }
    } catch {
      // Preserve the original workflow error.
    }
    return sendJson(res, resultsErrorStatusCode(), {
      ok: false,
      phase,
      error: String(error?.message || error),
      router_logging: error?.router_logging,
      stack: error?.stack || ""
    });
  }
}

handle.__test__ = {
  isFocusPaused,
  uniqueRowsByKey,
  resultsErrorStatusCode,
  isAllowedResultsAction,
  step6LogDetail,
  resultAlertLogDetail,
  pendingResultAlertRows,
  toResultAlertRow,
  safeJson,
  normalizedResultBlockForClass,
  resultBlockHash,
  task07Stability,
  completedTask07ClassConstKeys,
  trackedEntriesByClassConstKey,
  buildTerminalRiderResults,
  resultAvailableTrigger,
  toAirtableHsRiderResult,
  RESULTS_UPSTREAM_TIMEOUT_MS,
  RESULTS_UPSTREAM_ATTEMPTS,
  RESULT_ALERT_SOURCE_TABLE
};
module.exports = handle;
