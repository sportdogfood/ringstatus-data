const catalyst = require("zcatalyst-sdk-node");
const cheerio = require("cheerio");
const fs = require("fs");
const https = require("https");
const path = require("path");
const zlib = require("zlib");

const BASE_URL = "https://www.horseshowing.com";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36";
const UPSTREAM_ATTEMPTS = 5;
const UPSTREAM_TIMEOUT_MS = 20000;
const WEC_PDF_WORKER_BASE = "https://ringstatus-pdf.gombcg.workers.dev/";
const WEC_PUBLIC_PRINT_URL = "https://ringstatus.com/wec-print";
const WEC_PDF_CACHE_TTL = 900;

const TABLES = {
  shows: "hs_shows",
  heartbeat: "hs_heartbeat",
  focusShow: "hs_focus_show",
  days: "hs_days",
  ringDays: "hs_ring_days",
  rings: "hs_rings",
  ringStatus: "hs_ring_status",
  classes: "hs_classes",
  classTimes: "hs_class_times",
  classStartTimes: "hs_class_start_times",
  entryGoTimes: "hs_entry_go_times",
  updateSchedule: "hs_update_schedule",
  updateScheduleRaw: "hs_update_schedule_raw",
  getRingDays: "hs_get_ring_days",
  counts: "hs_counts",
  classOog: "hs_class_oog",
  classOogRaw: "hs_class_oog_raw",
  getOrders: "hs_get_orders",
  getRings: "hs_get_rings",
  entries: "hs_entries",
  horses: "hs_horses",
  riders: "hs_riders",
  trainers: "hs_trainers",
  timeTriggers: "hs_time_triggers",
  resultQueue: "hs_result_queue",
  resultClasses: "hs_result_classes",
  classResults: "hs_class_results"
};

const DEFAULT_SHOW_META = {
  "14906": {
    title: "WEC Ocala Summer Series 1 CSI2*",
    active_trainers: [],
    hide_classes: ["Midway Drag", "FEI Only", "Ring Maintenance", "Ticketed Schooling"],
    rings: {
      "670": "GRAND",
      "675": "INDR_1",
      "676": "INDR_2",
      "677": "INDR_3",
      "678": "INDR_4",
      "683": "INDR_5",
      "684": "INDR_6",
      "737": "ANNEX",
      "750": "HUNTER_2"
    },
    horse_displays: {
      "Calou Us": "Calou",
      "Cardozo 4": "Cardozo",
      "CERVIN DE LA POMME Z": "Cervin",
      "CHOCO DU REVERDY": "Choco",
      "Curtis 89": "Curtis",
      "DF CRUSH": "Crush",
      "Dodicci": "Dottie",
      "ETONEMOI DEL CABALERO": "Toni",
      "FAN FAN BOY": "Fan",
      "Fanfan Boy": "Fan",
      "FENTO DES FONTAINES": "Fento",
      "Fort Knox": "Knox",
      "FORTE": "Macho",
      "Halo": "Paisley",
      "HERMES D'ARMANVILLE": "Hermes",
      "IB MERCEDES": "Ben",
      "Ideal": "Doug",
      "INDIGO VAN DE MUGGENHOEK": "Indy",
      "Insider Bh": "Insider",
      "Irish Coffee Vhl": "Coffee",
      "Kindly": "Bee",
      "King Z": "King",
      "KINMAR QUALITY HERO": "Kinmar",
      "La La Land": "LaLa",
      "Luminosity Class": "Elliot",
      "Markanto A": "Mark",
      "Mastermind": "Munster",
      "NAVIGATOR": "Navy",
      "Peridoni 20": "Peri",
      "Qastaar Van't Heike": "Q",
      "RANGE ROVER": "Ranger",
      "RIMINI DU PRINTEMPS": "Rimini",
      "Sandenal": "Snoop",
      "SPECIALIST": "Tommy",
      "TENOR VAN'T KLAVERTJE VIER": "Shrek",
      "Vote For Pedro": "Pedro"
    },
    horse_display_meta: {},
    trainer_displays: {
      "Alan Korotkin": "CWF"
    }
  }
};

const WEC_AIRTABLE_BASE_ID = process.env.WEC_AIRTABLE_BASE_ID || "app6XS1RvsPNRT6os";
const AIRTABLE_TOKEN_FALLBACK = process.env.AIRTABLE_TOKEN || "";
let runtimeAirtableToken = AIRTABLE_TOKEN_FALLBACK;
const AIRTABLE_WEC_LOGS_TABLE = "tblaA0n7QD7s5lIYm";
const AIRTABLE_WEC_LOG_FIELDS = {
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
const AIRTABLE_UPDATE_SCHEDULE_TABLE = "tblzPWt9G3VBVqVi6";
const AIRTABLE_UPDATE_SCHEDULE_STAGING_TABLE = "tblzsoU59zmYxhPah";
const AIRTABLE_UPDATE_SCHEDULE_STAGING_MOBILE_VIEW = "wec-classes_mobile";
const AIRTABLE_CLASS_OOG_STAGING_TABLE = "class_oog_staging";
const AIRTABLE_BARN_BOARD_HOT_PATCHES_TABLE = "barn_board_hot_patches";
const AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS = {
  board_line: "board_line",
  ring_hint: "ring_hint",
  time_hint: "time_hint",
  class_name_hint: "class_name_hint",
  horses: "horses",
  entry_go_times: "entry_go_times",
  match_status: "match_status",
  hot_patch_active: "hot_patch_active",
  release_status: "release_status",
  focus_day: "focus_day"
};
const AIRTABLE_GET_RING_DAYS_TABLE = "tblXGYMYDpXEx8hW2";
const AIRTABLE_RAW_HEARTBEAT_TABLE = "hs_heartbeat";
const AIRTABLE_RAW_GET_RING_DAYS_TABLE = "hs_get_ring_days";
const AIRTABLE_RAW_UPDATE_SCHEDULE_TABLE = "hs_update_schedule";
const AIRTABLE_RAW_CLASS_OOG_TABLE = "hs_class_oog";
const AIRTABLE_RAW_GET_RINGS_TABLE = "hs_get_rings";
const AIRTABLE_RAW_GET_ORDERS_TABLE = "hs_get_orders";
const AIRTABLE_RAW_RING_STATUS_TABLE = "hs_ring_status";
const AIRTABLE_RAW_CLASS_START_TIMES_TABLE = "hs_class_start_times";
const AIRTABLE_RAW_ENTRY_GO_TIMES_TABLE = "hs_entry_go_times";
const AIRTABLE_GET_RING_DAYS_FIELDS = {
  ring_day_no: "fldVk4eZ01RhELuHx",
  show_no: "fldb6pYIgKVTspy6t",
  ring_no: "fldG3zFAphKcb7B8R",
  ring_name: "fldXqNc4B7amGLm3I",
  date_text: "fldCozI5UW14xfp7y"
};
const AIRTABLE_UPDATE_SCHEDULE_FIELDS = {
  show_no: "fldmnARVSDUfJirnQ",
  class_no: "fldwcTNbe428USaTR",
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
  mirror_update_schedule_key: "fldy6FUgG1MkCL5tf"
};
const AIRTABLE_UPDATE_SCHEDULE_MANUAL_FIELDS = {
  confirm_delete: "fldO7jcDNNO6MBmxc"
};
const AIRTABLE_UPDATE_SCHEDULE_MANUAL_FIELD_IDS = new Set(Object.values(AIRTABLE_UPDATE_SCHEDULE_MANUAL_FIELDS));
const AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS = {
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
  source_key: "fldsBNOFbA5jNVIOD",
  source: "fldhLoErq7yHgQpZJ",
  inactive: "fld78Qo0RgOGbQfzK",
  last_run_time: "fld1vf5NxKMesqzUX"
};
const AIRTABLE_UPDATE_SCHEDULE_STAGING_PROTECTED_FIELDS = {
  shows: "fldr7WPbgPFfPuctf",
  show_days: "fldiW1dfQrPSFiNvv",
  focus_show: "fldg6ox15s03Sw9xk",
  ring_days: "fldTVsQTkDsDvKyPz",
  rings: "fldz3HXUIVufTOlYm",
  events: "flds4Y7IP8eN7JrP1",
  classes: "fld57nJX8y2bOTMcw",
  grab: "fldvr5BoXVUMI7g12",
  is_lock: "fldtUb2tiJvBNHdsD",
  manual_lock: "flddGexUe4bp5dqCT",
  full_lock: "fldL8UsgATV34je1y",
  no_lock: "fldl0nWvRskwvfgrx",
  second_trip: "fldzC5jKL08a6rmxM",
  inactive: "fld78Qo0RgOGbQfzK",
  class_start_times: "fldplhHfHHFb6y6kV",
  class_oog: "fldKuuwOdclVN4nwX",
  entry_go_times: "fld1n25ueoDvr5LUz",
  priority: "fldKQihtS72TdHvsn",
  class_left: "fldWRDx5sXYrKywD0",
  dows: "fldfYkzXpXREAjVQV",
  full_lockv2: "fldt5NXBS1P1s5bWf",
  review_notes: "fld1srOFl2Tz2NcUE",
  review_status: "fldNEtTH1zyeZUGaW",
  update_schedule: "fldQmOVJvWzOIKXGx",
  wec_logs: "fldf2uT0cdmrNBHyH",
  horses: "fldtAjB9H2QA5tLV8",
  barn_name: "fldvsnI5yDq14IuMI",
  manual_instructions: "fldluSwhKkPjPcRtW",
  manual_group: "fldd3teDvkVTxf5k3",
  quick_lock: "fldfg64i7x6nWynZw",
  lock: "fld6RM2CwUYf3GSGK",
  confirm_lock: "fldmXG63Z9lld6dL0",
  active_entries: "fldx5VQzmW1bbDXtD",
  ring_names: "fldG3nhLK46f5AwBN",
  second_trip_copy: "fldhm0o81Yt8pArFS",
  active_entries_3: "fldZSmWFXhZn4MzUR"
};
const AIRTABLE_UPDATE_SCHEDULE_STAGING_PROTECTED_FIELD_IDS = new Set(
  Object.values(AIRTABLE_UPDATE_SCHEDULE_STAGING_PROTECTED_FIELDS)
    .filter((fieldId) => fieldId !== AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.inactive)
);
const AIRTABLE_UPDATE_SCHEDULE_STAGING_NON_WRITABLE_PROTECTED_FIELD_IDS = new Set([
  AIRTABLE_UPDATE_SCHEDULE_STAGING_PROTECTED_FIELDS.is_lock,
  AIRTABLE_UPDATE_SCHEDULE_STAGING_PROTECTED_FIELDS.full_lock,
  AIRTABLE_UPDATE_SCHEDULE_STAGING_PROTECTED_FIELDS.no_lock,
  AIRTABLE_UPDATE_SCHEDULE_STAGING_PROTECTED_FIELDS.full_lockv2,
  AIRTABLE_UPDATE_SCHEDULE_STAGING_PROTECTED_FIELDS.quick_lock,
  AIRTABLE_UPDATE_SCHEDULE_STAGING_PROTECTED_FIELDS.lock
].filter(Boolean));
const AIRTABLE_UPDATE_SCHEDULE_STAGING_WRITABLE_PROTECTED_FIELD_IDS = new Set(
  [...AIRTABLE_UPDATE_SCHEDULE_STAGING_PROTECTED_FIELD_IDS]
    .filter((fieldId) => !AIRTABLE_UPDATE_SCHEDULE_STAGING_NON_WRITABLE_PROTECTED_FIELD_IDS.has(fieldId))
);
const AIRTABLE_UPDATE_SCHEDULE_STAGING_STAGE2C_ALLOWED_PROTECTED_FIELD_IDS = new Set([
  AIRTABLE_UPDATE_SCHEDULE_STAGING_PROTECTED_FIELDS.update_schedule
].filter(Boolean));
const CLASS_OOG_STAGING_HELPER_MAPPINGS = [
  { target_link_field: "shows", source_value_field: "show_no", helper_table: "shows", helper_key_field: "show_no", helper_record_id_field: "rec_id", allow_silent_fail: false },
  { target_link_field: "focus_show", source_value_field: "show_no+focus_day", helper_table: "focus_show", helper_key_field: "show_no+focus_day", helper_record_id_field: "rec_id", allow_silent_fail: false },
  { target_link_field: "show_days", source_value_field: "focus_day", helper_table: "show_days", helper_key_field: "show_day", helper_record_id_field: "rec_id", allow_silent_fail: true },
  { target_link_field: "ring_days", source_value_field: "ring_day_no", helper_table: "ring_days", helper_key_field: "ring_day_no", helper_record_id_field: "rec_id", allow_silent_fail: false },
  { target_link_field: "rings", source_value_field: "ring_no", helper_table: "rings", helper_key_field: "ring_no", helper_record_id_field: "rec_id", allow_silent_fail: true },
  { target_link_field: "classes", source_value_field: "class_no", helper_table: "classes", helper_key_field: "class_no", helper_record_id_field: "rec_id", allow_silent_fail: false },
  { target_link_field: "entries", source_value_field: "entry_no", helper_table: "entries", helper_key_field: "entry_no", helper_record_id_field: "rec_id", allow_silent_fail: true },
  { target_link_field: "events", source_value_field: "event_id", helper_table: "events", helper_key_field: "event_id", helper_record_id_field: "rec_id", allow_silent_fail: true },
  { target_link_field: "horses", source_value_field: "horse", helper_table: "horses", helper_key_field: "horse", helper_record_id_field: "rec_id", allow_silent_fail: true },
  { target_link_field: "riders", source_value_field: "rider", helper_table: "riders", helper_key_field: "rider", helper_record_id_field: "rec_id", allow_silent_fail: true },
  { target_link_field: "trainers", source_value_field: "trainer", helper_table: "trainers", helper_key_field: "trainer", helper_record_id_field: "rec_id", allow_silent_fail: true }
];

const UPDATE_SCHEDULE_STAGING_EVALUATOR_FIELDS = [
  "class_ranges",
  "ages",
  "sizes",
  "skills",
  "levels",
  "disciplines",
  "heights",
  "rs_class_name"
];
const UPDATE_SCHEDULE_STAGING_EVALUATOR_PROTECTED_FIELDS = new Set([
  "is_preflight",
  "class_no",
  "time_format",
  "event_type",
  "is_special",
  "is_medal",
  "is_under_saddle",
  "class_priority_order",
  "class_priority_sort"
]);
const UPDATE_SCHEDULE_STAGING_FORMULA_HELPERS = [
  { table: "ages", keyField: "age", targetField: "ages", sourceField: "this_ages" },
  { table: "skills", keyField: "skill", targetField: "skills", sourceField: "this_skills" },
  { table: "levels", keyField: "level", targetField: "levels", sourceField: "this_levels" },
  { table: "sizes", keyField: "size", targetField: "sizes", sourceField: "this_sizes" },
  { table: "heights", keyField: "height", targetField: "heights", sourceField: "this_heights" },
  { table: "disciplines", keyField: "discipline", targetField: "disciplines", sourceField: "this_disciplines" }
];
const UPDATE_SCHEDULE_STAGING_RS_CLASS_NAME_ORDER = ["levels", "ages", "sizes", "skills", "disciplines", "heights"];
const UPDATE_SCHEDULE_STAGING_PRIORITY_SORT_FIELDS = [
  "rec_id",
  "ring_name_normalized",
  "ring_name_prioritized",
  "ring_no",
  "time_sort",
  "time_format",
  "class_no",
  "is_preflight",
  "rs_class_name",
  "left15",
  "class_priority_sort"
];
const UPDATE_SCHEDULE_STAGING_PRIORITY_SORT_WRITE_FIELDS = ["class_priority_sort"];

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeHelperKey(value) {
  return text(value)
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeTrainerKey(value) {
  return normalizeHelperKey(value);
}

function normalizeHorseHelperKey(value) {
  return normalizeHelperKey(value);
}

function normalizedRecordIdMap(recordIds = {}) {
  const mapped = { ...(recordIds || {}) };
  for (const [name, id] of Object.entries(recordIds || {})) {
    const key = normalizeHelperKey(name);
    if (key && id && !mapped[key]) mapped[key] = id;
  }
  return mapped;
}

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function fieldText(fields, names) {
  for (const name of names) {
    const value = text(firstValue(fields?.[name]));
    if (value) return value;
  }
  return "";
}

function linkedRecordIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map(text).filter(Boolean);
}

function isManualRemoveInstruction(value) {
  return text(value).toLowerCase() === "remove";
}

function airtableFormulaValue(value) {
  return `'${String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function airtableQuote(value) {
  return String(value ?? "").replace(/'/g, "\\'");
}

function intOrNull(value) {
  const parsed = Number.parseInt(text(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolOrNull(value) {
  if (value === true || value === "true" || value === "1" || value === 1) return true;
  if (value === false || value === "false" || value === "0" || value === 0) return false;
  return null;
}

function getHeader(req, name) {
  const lower = name.toLowerCase();
  const headers = req.headers || {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return Array.isArray(value) ? value.join(",") : value;
  }
  return typeof req.get === "function" ? req.get(name) : "";
}

function parseQuery(req) {
  const rawUrl = req.url || req.originalUrl || "";
  const query = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?") + 1) : "";
  return new URLSearchParams(query);
}

async function readBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return Object.fromEntries(new URLSearchParams(req.body));
    }
  }
  if (Buffer.isBuffer(req.body)) {
    const bodyText = req.body.toString("utf8");
    try {
      return JSON.parse(bodyText);
    } catch {
      return Object.fromEntries(new URLSearchParams(bodyText));
    }
  }
  if (typeof req.on === "function") {
    const bodyText = await new Promise((resolve, reject) => {
      let raw = "";
      req.on("data", (chunk) => { raw += chunk; });
      req.on("end", () => resolve(raw));
      req.on("error", reject);
    });
    if (bodyText) {
      try {
        return JSON.parse(bodyText);
      } catch {
        return Object.fromEntries(new URLSearchParams(bodyText));
      }
    }
  }
  return {};
}

function json(res, status, payload) {
  setCors(res);
  res.statusCode = status;
  res.status?.(status);
  res.setHeader?.("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, status, body, contentType = "text/plain; charset=utf-8") {
  setCors(res);
  res.statusCode = status;
  res.status?.(status);
  res.setHeader?.("content-type", contentType);
  res.end(body);
}

function readEmbedAsset(fileName) {
  return fs.readFileSync(path.join(__dirname, "webflow-embeds", fileName), "utf8");
}

function setCors(res) {
  res.setHeader?.("access-control-allow-origin", "*");
  res.setHeader?.("access-control-allow-methods", "GET, POST, OPTIONS");
  res.setHeader?.("access-control-allow-headers", "content-type, x-hscom-phpsessid");
  res.setHeader?.("cache-control", "no-store");
}

function cookieFor(req, showNo) {
  const inboundCookie = getHeader(req, "cookie");
  const phpSessionId = getHeader(req, "x-hscom-phpsessid");
  const parts = [];
  if (inboundCookie) parts.push(inboundCookie);
  if (phpSessionId) parts.push(`PHPSESSID=${phpSessionId}`);
  if (showNo) parts.push(`HscomShowNo=${showNo}`);
  return parts.join("; ");
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

function createWorkflowContext() {
  return { cookie: "", upstreamRequests: 0, sourceSequence: [] };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeResponseBody(buffer, encoding) {
  const normalized = text(encoding).toLowerCase();
  if (!normalized) return Promise.resolve(buffer);
  if (normalized.includes("br") && typeof zlib.brotliDecompress === "function") {
    return new Promise((resolve, reject) => zlib.brotliDecompress(buffer, (error, decoded) => error ? reject(error) : resolve(decoded)));
  }
  if (normalized.includes("gzip")) {
    return new Promise((resolve, reject) => zlib.gunzip(buffer, (error, decoded) => error ? reject(error) : resolve(decoded)));
  }
  if (normalized.includes("deflate")) {
    return new Promise((resolve, reject) => zlib.inflate(buffer, (error, decoded) => error ? reject(error) : resolve(decoded)));
  }
  return Promise.resolve(buffer);
}

function normalizeHeaders(headers = {}) {
  const normalized = new Map();
  for (const [key, value] of Object.entries(headers)) {
    normalized.set(String(key).toLowerCase(), value);
  }
  return {
    get(name) {
      const value = normalized.get(String(name).toLowerCase());
      return Array.isArray(value) ? value.join(", ") : value || null;
    },
    getSetCookie() {
      const value = normalized.get("set-cookie");
      if (!value) return [];
      return Array.isArray(value) ? value : [value];
    }
  };
}

function requestTextViaHttps(url, { method = "GET", headers = {}, body, signal } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`,
      method,
      headers,
      family: 4,
      timeout: UPSTREAM_TIMEOUT_MS
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", async () => {
        try {
          const rawBuffer = Buffer.concat(chunks);
          const decoded = await decodeResponseBody(rawBuffer, res.headers["content-encoding"]);
          const raw = decoded.toString("utf8");
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: normalizeHeaders(res.headers),
            text: async () => raw
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error(`https timeout ${method} ${parsed.pathname}`)));
    req.on("error", reject);
    if (signal) {
      signal.addEventListener("abort", () => req.destroy(new Error(`https abort ${method} ${parsed.pathname}`)), { once: true });
    }
    if (body) req.write(body);
    req.end();
  });
}

async function requestText(url, options = {}) {
  try {
    return await fetch(url, options);
  } catch (error) {
    const { signal, ...fallbackOptions } = options;
    const fallback = await requestTextViaHttps(url, fallbackOptions);
    fallback.transport = "https";
    fallback.fetch_error = error.message;
    return fallback;
  }
}

async function bootstrapCookie(req, showNo, context) {
  if (!showNo) return "";
  if (context?.cookie && /PHPSESSID=/i.test(context.cookie)) return context.cookie;
  let cookie = `HscomShowNo=${showNo}`;
  const showUrl = `${BASE_URL}/show.php?show=${encodeURIComponent(showNo)}`;
  try {
    if (context) context.sourceSequence.push({ method: "GET", path: "/show.php", show_no: text(showNo) });
    const response = await requestText(showUrl, {
      method: "GET",
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "referer": `${BASE_URL}/showsel.php`,
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "upgrade-insecure-requests": "1",
        "user-agent": getHeader(req, "user-agent") || DEFAULT_USER_AGENT,
        cookie
      }
    });
    if (response.ok) {
      cookie = mergeCookies(cookie, getSetCookies(response.headers));
    }
    if (context) context.sourceSequence.push({ method: "GET", path: "/schedule.php", show_no: text(showNo) });
    const scheduleResponse = await requestText(`${BASE_URL}/schedule.php`, {
      method: "GET",
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "referer": showUrl,
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "upgrade-insecure-requests": "1",
        "user-agent": getHeader(req, "user-agent") || DEFAULT_USER_AGENT,
        cookie
      }
    });
    if (scheduleResponse.ok) {
      cookie = mergeCookies(cookie, getSetCookies(scheduleResponse.headers));
    }
  } catch (error) {
    // Fall back to HscomShowNo; upstream will report the real failure if a session is required.
  }
  if (context) context.cookie = cookie;
  return cookie;
}

async function upstream(req, path, { method = "GET", showNo, body, context } = {}) {
  const headers = {
    "accept": method === "POST" ? "application/json, text/javascript, */*; q=0.01" : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "origin": BASE_URL,
    "referer": `${BASE_URL}/schedule.php`,
    "sec-fetch-dest": method === "POST" ? "empty" : "document",
    "sec-fetch-mode": method === "POST" ? "cors" : "navigate",
    "sec-fetch-site": "same-origin",
    "user-agent": getHeader(req, "user-agent") || DEFAULT_USER_AGENT,
    "x-requested-with": method === "POST" ? "XMLHttpRequest" : ""
  };
  if (method === "POST") headers["content-type"] = "application/x-www-form-urlencoded; charset=UTF-8";
  for (const key of Object.keys(headers)) {
    if (!headers[key]) delete headers[key];
  }
  let lastError = null;
  for (let attempt = 1; attempt <= UPSTREAM_ATTEMPTS; attempt++) {
    const requestHeaders = { ...headers };
    const baseCookie = cookieFor(req, showNo);
    if (attempt > 1 && context) context.cookie = "";
    let cookie = "";
    if (/PHPSESSID=/i.test(baseCookie)) {
      cookie = mergeCookies(context?.cookie, baseCookie);
      if (context && !context.cookie) context.cookie = cookie;
    } else {
      cookie = mergeCookies(baseCookie, await bootstrapCookie(req, showNo, context));
    }
    if (cookie) requestHeaders.cookie = cookie;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      if (context) context.upstreamRequests++;
      if (context) context.sourceSequence.push({ method, path, show_no: text(showNo) });
      const response = await requestText(`${BASE_URL}${path}`, { method, headers: requestHeaders, body, signal: controller.signal });
      const raw = await response.text();
      if (!response.ok) throw new Error(`upstream ${path} HTTP ${response.status}: ${raw.slice(0, 200)}`);
      return { status: response.status, contentType: response.headers.get("content-type"), raw, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt < UPSTREAM_ATTEMPTS) await sleep(500 * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function parseCurrentEntry(entryText) {
  const cleaned = text(String(entryText || "").replace(/<br\s*\/?>/gi, " "));
  const match = cleaned.match(/^#?(\d+),\s*(.*?)(?:\s+In ring\b|$)/i);
  return {
    entry_no: match?.[1] || null,
    horse: match?.[2] ? text(match[2]) : null,
    entry_text: cleaned || null
  };
}

function parseClassLabel(classText) {
  const value = text(classText);
  const match = value.match(/^(\d+)\)\s*(.*)$/);
  return {
    class_number: match?.[1] || null,
    class_name: match?.[2] ? text(match[2]) : value,
    class_label: value
  };
}

function parseRingRows(raw) {
  const payload = JSON.parse(raw || "[]");
  return Array.isArray(payload) ? payload.map((row) => {
    const entry = parseCurrentEntry(row.entry);
    const klass = parseClassLabel(row.class);
    return {
      show_no: text(row.show_no),
      ring_no: text(row.ring_no),
      ring_day_no: text(row.ring_day_no),
      ring_name: text(row.ring),
      day_label: text(row.day),
      class_no: text(row.class_no),
      class_label: klass.class_label,
      class_name: klass.class_name,
      entry_count: intOrNull(row.total),
      class_time_text: text(row.time),
      current_entry_text: entry.entry_text,
      current_entry_no: entry.entry_no,
      current_horse: entry.horse,
      entries_gone: intOrNull(row.n_gone),
      entries_to_go: intOrNull(row.n_to_go),
      source_timestamp: intOrNull(row.timestamp),
      elapsed_seconds: intOrNull(row.elapsed),
      live_flag: true,
      source_endpoint: "get_rings.php",
      raw_json: JSON.stringify(row)
    };
  }) : [];
}

function parseOrderRows(raw) {
  const payload = JSON.parse(raw || "[]");
  return Array.isArray(payload) ? payload.map((row) => {
    const entry = parseCurrentEntry(row.entry);
    const klass = parseClassLabel(row.class);
    return {
      show_no: text(row.show_no),
      ring_no: text(row.ring_no),
      ring_day_no: text(row.ring_day_no),
      ring_name: text(row.ring),
      day_label: text(row.day),
      class_no: null,
      class_label: klass.class_label,
      class_name: klass.class_name,
      entry_count: intOrNull(row.total),
      class_time_text: text(row.time),
      current_entry_text: entry.entry_text,
      current_entry_no: entry.entry_no,
      current_horse: entry.horse,
      entries_gone: intOrNull(row.n_gone),
      entries_to_go: intOrNull(row.n_to_go),
      source_timestamp: intOrNull(row.timestamp),
      elapsed_seconds: intOrNull(row.elapsed),
      live_flag: true,
      source_endpoint: "get_orders.php",
      raw_json: JSON.stringify(row)
    };
  }) : [];
}

function parseRingDayRows(raw, showNo) {
  const payload = JSON.parse(raw || "[]");
  const rows = [];
  if (!Array.isArray(payload)) return rows;
  for (const ring of payload) {
    for (const day of ring.ring_days || []) {
      rows.push({
        show_no: showNo,
        ring_no: text(ring.ring_no),
        ring_day_no: text(day.ring_day_no),
        ring_name: text(ring.name),
        day_label: text(day.date),
        raw_json: JSON.stringify({ ring_no: ring.ring_no, ring_name: ring.name, ...day })
      });
    }
  }
  return rows;
}

function tryParseRingDayRows(raw, showNo) {
  try {
    return { ok: true, rows: parseRingDayRows(raw, showNo), error: null };
  } catch (error) {
    return { ok: false, rows: [], error: String(error?.message || error) };
  }
}

function parseCountRows(raw, showNo) {
  const $ = cheerio.load(raw);
  const rows = [];
  $("tr").each((_, tr) => {
    const link = $(tr).find(".name_cell .link").first();
    if (!link.length) return;
    const classNumber = text(link.attr("data-num"));
    const className = text(link.attr("data-name") || link.text());
    rows.push({
      show_no: showNo,
      class_no: text(link.attr("data-class")),
      class_label: classNumber ? `${classNumber}) ${className}` : className,
      class_name: className,
      entry_count: intOrNull($(tr).find(".entries_cell").first().text()),
      source_endpoint: "counts.php",
      raw_json: JSON.stringify({ class_number: classNumber, class_name: className })
    });
  });
  return rows;
}

function parseRingDayScheduleRows(raw, showNo, ringDayNo) {
  const $ = cheerio.load(raw);
  const rows = [];
  $("h3.ring_evt").each((index, node) => {
    const dataName = text($(node).attr("data-name")) || text($(node).find(".ring_evt_name").first().text());
    const dataTime = text($(node).attr("data-time")) || text($(node).find(".ring_evt_time").first().text());
    const dataEntries = text($(node).attr("data-n_entries")) || text($(node).find(".ring_evt_entries").first().text());
    const klass = parseClassLabel(dataName);
    rows.push({
      show_no: text($(node).attr("data-show")) || showNo,
      ring_day_no: ringDayNo,
      event_id: text($(node).attr("id")),
      class_no: text($(node).attr("data-class")),
      class_label: klass.class_label,
      class_name: klass.class_name,
      class_time_text: dataTime,
      class_order: index + 1,
      entry_count: intOrNull(dataEntries),
      re_type: text($(node).attr("data-re_type")),
      oc_id: text($(node).attr("data-oc_id")),
      live_flag: boolOrNull($(node).attr("data-live")),
      source_endpoint: "update_schedule.php",
      source_html: $.html(node),
      raw_json: JSON.stringify({
        event_id: text($(node).attr("id")),
        data_class: text($(node).attr("data-class")),
        data_name: dataName,
        data_time: dataTime,
        data_entries: dataEntries
      })
    });
  });
  return rows;
}

function parseClassOogRows(raw, showNo, classNo) {
  const $ = cheerio.load(raw);
  const orderStatus = text($("#order_option").text());
  const tableNode = $(".lg table.orders_table").first().length
    ? $(".lg table.orders_table").first()
    : $("table.orders_table").first();
  const rows = [];
  tableNode.find("tr").each((index, tr) => {
    if (index === 0) return;
    const cells = $(tr).find("td").map((_, td) => text($(td).text())).get();
    if (cells.length < 4) return;
    rows.push({
      show_no: showNo,
      class_no: classNo,
      entry_order: intOrNull(cells[0]),
      current_entry_no: text(cells[1]),
      current_horse: text(cells[2]),
      rider: text(cells[3]),
      trainer: text(cells[4]),
      order_status: orderStatus,
      source_endpoint: "class_oog.php",
      source_html: $.html(tr),
      raw_json: JSON.stringify({
        class_no: classNo,
        entry_no: text(cells[1]),
        horse: text(cells[2]),
        rider: text(cells[3]),
        trainer: text(cells[4]),
        order_status: orderStatus
      })
    });
  });
  return rows;
}

function dateKey(value) {
  const raw = text(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function cleanPatch(values) {
  const patch = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") patch[key] = value;
  }
  return patch;
}

function splitList(value) {
  return String(value || "").split(/[|,]/).map(text).filter(Boolean);
}

async function getShowConfig(app, showNo) {
  const query = `SELECT ROWID, show_no, show_name, start_date, end_date, focus_day_date, focus_status_cadence, focus_day_cadence, future_days_cadence, zoom_cadence, raw_json FROM ${TABLES.shows} WHERE show_no = ${zcqlValue(showNo)} LIMIT 1`;
  try {
    return (await app.zcql().executeZCQLQuery(query))?.[0]?.[TABLES.shows] || null;
  } catch {
    return null;
  }
}

function showRawConfig(rawJson) {
  const raw = text(rawJson);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function resolveFocusDay(app, showNo, query, body) {
  const supplied = dateKey(query.get("focus_day") || query.get("focus_day_date") || body.focus_day || body.focus_day_date);
  if (supplied) return { focus_day: supplied, source: "request" };
  const config = await getShowConfig(app, showNo);
  const stored = dateKey(config?.focus_day_date);
  return stored ? { focus_day: stored, source: "hs_shows.focus_day_date" } : { focus_day: null, source: null };
}

function activeTrainersFromFocusSource(source) {
  return focusSourceConfig(source).active_trainers || [];
}

function focusSourceConfig(source) {
  const raw = text(source);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return {
      ...parsed,
      active_trainers: Array.isArray(parsed.active_trainers) ? parsed.active_trainers.map(text).filter(Boolean) : [],
      hide_classes: Array.isArray(parsed.hide_classes) ? parsed.hide_classes.map(text).filter(Boolean) : [],
      horse_displays: parsed.horse_displays && typeof parsed.horse_displays === "object" ? parsed.horse_displays : {},
      horse_display_meta: parsed.horse_display_meta && typeof parsed.horse_display_meta === "object" ? parsed.horse_display_meta : {},
      trainer_displays: parsed.trainer_displays && typeof parsed.trainer_displays === "object" ? parsed.trainer_displays : {}
    };
  } catch {
    const marker = "active_trainers=";
    const index = raw.indexOf(marker);
    return {
      active_trainers: index >= 0 ? splitList(raw.slice(index + marker.length)) : [],
      hide_classes: [],
      horse_displays: {},
      horse_display_meta: {},
      trainer_displays: {}
    };
  }
}

async function getFocusShowSourceConfig(app, showNo, focusDay) {
  const focusShowKey = `horseshowing|${showNo}`;
  const legacyFocusShowKey = `${showNo}|${focusDay}`;
  try {
    const queryByKeyAndDay = (key) => [
      "SELECT ROWID, show_no, focus_day, source",
      `FROM ${TABLES.focusShow}`,
      `WHERE focus_show_key = ${zcqlValue(key)} AND focus_day = ${zcqlValue(focusDay)}`,
      "LIMIT 1"
    ].join(" ");
    const queryByKey = (key) => [
      "SELECT ROWID, show_no, focus_day, source",
      `FROM ${TABLES.focusShow}`,
      `WHERE focus_show_key = ${zcqlValue(key)}`,
      "LIMIT 1"
    ].join(" ");
    const row =
      (await app.zcql().executeZCQLQuery(queryByKeyAndDay(focusShowKey)))?.[0]?.[TABLES.focusShow] ||
      (await app.zcql().executeZCQLQuery(queryByKeyAndDay(legacyFocusShowKey)))?.[0]?.[TABLES.focusShow] ||
      (await app.zcql().executeZCQLQuery(queryByKey(focusShowKey)))?.[0]?.[TABLES.focusShow] ||
      (await app.zcql().executeZCQLQuery(queryByKey(legacyFocusShowKey)))?.[0]?.[TABLES.focusShow] ||
      null;
    return focusSourceConfig(row?.source);
  } catch {
    return {};
  }
}

async function getFocusShowActiveTrainers(app, showNo, focusDay) {
  try {
    return (await getFocusShowSourceConfig(app, showNo, focusDay)).active_trainers || [];
  } catch {
    return [];
  }
}

async function getFocusShowHideClasses(app, showNo, focusDay) {
  try {
    return (await getFocusShowSourceConfig(app, showNo, focusDay)).hide_classes || [];
  } catch {
    return [];
  }
}

async function getFocusShowHorseDisplays(app, showNo, focusDay) {
  try {
    return (await getFocusShowSourceConfig(app, showNo, focusDay)).horse_displays || {};
  } catch {
    return {};
  }
}

async function getFocusShowHorseDisplayMeta(app, showNo, focusDay) {
  try {
    return (await getFocusShowSourceConfig(app, showNo, focusDay)).horse_display_meta || {};
  } catch {
    return {};
  }
}

async function getFocusShowTrainerDisplays(app, showNo, focusDay) {
  try {
    return (await getFocusShowSourceConfig(app, showNo, focusDay)).trainer_displays || {};
  } catch {
    return {};
  }
}

async function resolvedFocusShowSourceConfig(app, showNo, focusDay) {
  const source = focusDay ? await getFocusShowSourceConfig(app, showNo, focusDay) : {};
  if (source.active_trainers?.length) return source;
  const airtable = await getAirtableActiveTrainerDebug();
  if (!airtable.active_trainers?.length) return source;
  return {
    ...source,
    active_trainers: airtable.active_trainers,
    trainer_displays: {
      ...(source.trainer_displays || {}),
      ...(airtable.trainer_displays || {})
    }
  };
}

function selectRingDayRows(rows, focusDay, mode) {
  return rows
    .map((row) => ({ ...row, day_key: dateKey(row.day_label) }))
    .filter((row) => {
      if (!row.day_key) return false;
      if (mode === "focus") return row.day_key === focusDay;
      if (mode === "future") return row.day_key > focusDay;
      return true;
    })
    .sort((a, b) => `${a.day_key}|${a.ring_no}|${a.ring_day_no}`.localeCompare(`${b.day_key}|${b.ring_no}|${b.ring_day_no}`));
}

function zcqlValue(value) {
  if (value === null || value === undefined || value === "") return null;
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildWecPrintPdfUrl(showNo, focusDay, { cacheTtl = WEC_PDF_CACHE_TTL, includeShowNo = true } = {}) {
  const source = new URL(WEC_PUBLIC_PRINT_URL);
  if (showNo && includeShowNo) source.searchParams.set("show_no", String(showNo));
  source.searchParams.set("pdf", "1");

  const pdf = new URL(WEC_PDF_WORKER_BASE);
  pdf.searchParams.set("url", source.toString());
  pdf.searchParams.set("filename", `wec-${focusDay || "schedule"}-schedule.pdf`);
  pdf.searchParams.set("waitForSelector", "#rsPdfReady");
  pdf.searchParams.set("cacheTtl", String(cacheTtl));
  return pdf.toString();
}

function buildCatalystFunctionBaseUrl(req) {
  const host = text(getHeader(req, "host")) || "horseshowing-700800454.development.catalystserverless.com";
  const proto = text(getHeader(req, "x-forwarded-proto")) || "https";
  return `${proto}://${host}/server/horseshowing_sync/`;
}

function buildWecPrintSmartBrowzTargetUrl(req, showNo) {
  const target = new URL(buildCatalystFunctionBaseUrl(req));
  target.searchParams.set("action", "wec-print-embed-html");
  target.searchParams.set("show_no", text(showNo));
  target.searchParams.set("pdf", "1");
  target.searchParams.set("orientation", "landscape");
  return target.toString();
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

async function sendWecPrintSmartBrowzPdf(req, res, app, requestedShowNo) {
  const requestStartedAt = new Date();
  const startedMs = Date.now();
  const timing = {
    request_start: requestStartedAt.toISOString(),
    focus_show_resolution_ms: null,
    target_print_html_generation_ms: null,
    target_print_html_status: null,
    target_print_html_bytes: null,
    smartbrowz_browser_start_ms: null,
    smartbrowz_page_navigation_ms: null,
    smartbrowz_wait_for_ready_ms: null,
    smartbrowz_pdf_generation_ms: null,
    smartbrowz_convert_to_pdf_ms: null,
    pdf_stream_buffer_ms: null,
    total_response_ms: null,
    note: "Catalyst SmartBrowz convertToPdf exposes browser start, navigation, selector wait, and PDF rendering as one combined SDK call."
  };
  const focusStartedMs = Date.now();
  const outputFocus = await getOutputFocusShow(requestedShowNo);
  timing.focus_show_resolution_ms = Date.now() - focusStartedMs;
  if (!outputFocus) return json(res, 400, { ok: false, action: "wec-print-smartbrowz-pdf", error: "wec-print-smartbrowz-pdf requires active focus_show" });
  const targetUrl = buildWecPrintSmartBrowzTargetUrl(req, outputFocus.show_no);
  const smartBrowz = typeof app.smartbrowz === "function" ? app.smartbrowz() : null;
  const smartBrowzAvailable = Boolean(smartBrowz?.convertToPdf);
  if (!smartBrowzAvailable) {
    return json(res, 501, {
      ok: false,
      action: "wec-print-smartbrowz-pdf",
      show_no: outputFocus.show_no,
      focus_day: outputFocus.focus_day,
      focus_source: outputFocus.source,
      focus_show_record_id: outputFocus.record_id,
      target_url: targetUrl,
      smartbrowz_available: false,
      error: "Catalyst SDK does not expose app.smartbrowz().convertToPdf"
    });
  }

  try {
    const targetStartedMs = Date.now();
    const targetResponse = await fetch(targetUrl, { method: "GET", headers: { accept: "text/html" } });
    const targetHtml = await targetResponse.text();
    timing.target_print_html_generation_ms = Date.now() - targetStartedMs;
    timing.target_print_html_status = targetResponse.status;
    timing.target_print_html_bytes = targetHtml.length;

    const smartBrowzStartedMs = Date.now();
    const stream = await smartBrowz.convertToPdf(targetUrl, {
      pdf_options: {
        format: "Letter",
        landscape: true,
        print_background: true
      },
      page_options: {
        javascript_enabled: true,
        viewport: { width: 1280, height: 900 }
      },
      navigation_options: {
        timeout: 60000,
        wait_until: "networkidle2"
      }
    });
    timing.smartbrowz_convert_to_pdf_ms = Date.now() - smartBrowzStartedMs;
    timing.smartbrowz_pdf_generation_ms = timing.smartbrowz_convert_to_pdf_ms;
    const bufferStartedMs = Date.now();
    const pdf = await streamToBuffer(stream);
    timing.pdf_stream_buffer_ms = Date.now() - bufferStartedMs;
    timing.total_response_ms = Date.now() - startedMs;
    if (!pdf.length || pdf.slice(0, 5).toString("utf8") !== "%PDF-") {
      return json(res, 502, {
        ok: false,
        action: "wec-print-smartbrowz-pdf",
        show_no: outputFocus.show_no,
        focus_day: outputFocus.focus_day,
        focus_source: outputFocus.source,
        focus_show_record_id: outputFocus.record_id,
        target_url: targetUrl,
        smartbrowz_available: true,
        bytes: pdf.length,
        error: "SmartBrowz response was not a valid PDF"
      });
    }
    setCors(res);
    res.statusCode = 200;
    res.status?.(200);
    res.setHeader?.("content-type", "application/pdf");
    res.setHeader?.("content-disposition", `inline; filename="wec-${outputFocus.focus_day || "schedule"}-schedule.pdf"`);
    res.setHeader?.("x-wec-show-no", outputFocus.show_no);
    res.setHeader?.("x-wec-focus-day", outputFocus.focus_day);
    res.setHeader?.("x-wec-focus-source", outputFocus.source);
    res.setHeader?.("x-wec-smartbrowz-target", targetUrl);
    res.setHeader?.("x-wec-pdf-timing", JSON.stringify(timing));
    return res.end(pdf);
  } catch (error) {
    timing.total_response_ms = Date.now() - startedMs;
    return json(res, 502, {
      ok: false,
      action: "wec-print-smartbrowz-pdf",
      show_no: outputFocus.show_no,
      focus_day: outputFocus.focus_day,
      focus_source: outputFocus.source,
      focus_show_record_id: outputFocus.record_id,
      target_url: targetUrl,
      smartbrowz_available: true,
      timing,
      error: String(error?.message || error),
      code: text(error?.code)
    });
  }
}

async function warmWecPrintPdf(showNo, focusDay) {
  const urls = [
    { lane: "show_no", url: buildWecPrintPdfUrl(showNo, focusDay, { includeShowNo: true }) },
    { lane: "focus_only", url: buildWecPrintPdfUrl(showNo, focusDay, { includeShowNo: false }) }
  ].filter((item, index, items) => items.findIndex((candidate) => candidate.url === item.url) === index);

  const variants = [];
  for (const item of urls) {
    const started = Date.now();
    const response = await fetch(item.url, { method: "GET" });
    const contentType = response.headers.get("content-type") || "";
    const cacheControl = response.headers.get("cache-control") || "";
    const bytes = await response.arrayBuffer();
    variants.push({
      lane: item.lane,
      ok: response.ok && contentType.includes("application/pdf") && bytes.byteLength > 0,
      status: response.status,
      content_type: contentType,
      cache_control: cacheControl,
      bytes: bytes.byteLength,
      ms: Date.now() - started,
      pdf_url: item.url
    });
  }

  const primary = variants[0] || {};
  return {
    ok: variants.length > 0 && variants.every((item) => item.ok),
    status: primary.status,
    content_type: primary.content_type,
    cache_control: primary.cache_control,
    bytes: variants.reduce((sum, item) => sum + (item.bytes || 0), 0),
    ms: variants.reduce((sum, item) => sum + (item.ms || 0), 0),
    pdf_url: primary.pdf_url,
    variants
  };
}

async function findOne(app, tableName, where) {
  const clauses = Object.entries(where)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key} = ${zcqlValue(value)}`);
  if (!clauses.length) return null;
  const query = `SELECT ROWID FROM ${tableName} WHERE ${clauses.join(" AND ")} LIMIT 1`;
  const result = await app.zcql().executeZCQLQuery(query);
  return result?.[0]?.[tableName] || null;
}

async function upsert(app, tableName, where, row) {
  const table = app.datastore().table(tableName);
  const existing = await findOne(app, tableName, where);
  const clean = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined && value !== "") clean[key] = value;
  }
  if (existing?.ROWID) {
    return { action: "update", row: await table.updateRow({ ...clean, ROWID: existing.ROWID }) };
  }
  return { action: "insert", row: await table.insertRow(clean) };
}

function sourcePayload(row) {
  return text(row.raw_json || row.source_payload || JSON.stringify(row || {})).slice(0, 9500);
}

function classPartsFromLabel(label) {
  const raw = text(label);
  const classNumber = text((raw.match(/^(\d+[A-Za-z]?)\)/) || [])[1]);
  const rest = classNumber ? text(raw.replace(/^\d+[A-Za-z]?\)\s*/, "")) : raw;
  const payout = text((rest.match(/(\$[\d,]+)/) || [])[1]);
  const className = payout ? text(rest.replace(payout, "")) : rest;
  return { classNumber, classPayout: payout, className };
}

function datePartsFromLabel(value) {
  const raw = text(value);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { isoDate: null, dow: "" };
  return {
    isoDate: `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`,
    dow: raw.slice(0, 3).toUpperCase()
  };
}

function intValue(value) {
  return intOrNull(value);
}

function updateScheduleKeyTiers(row) {
  const showNo = row.show_no;
  const classNo = row.class_no;
  if (intValue(classNo) <= 0) return [];
  return [
    resultKey(showNo, classNo),
    resultKey(showNo, row.ring_no, classNo),
    resultKey(showNo, row.ring_day_no, classNo),
    resultKey(showNo, row.ring_day_no, row.ring_no, classNo)
  ];
}

function assignUpdateScheduleKeys(rows, level = 0) {
  const byKey = new Map();
  for (const row of rows) {
    const tiers = updateScheduleKeyTiers(row);
    if (!tiers.length) continue;
    const key = tiers[Math.min(level, tiers.length - 1)];
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(row);
  }
  for (const [key, scopedRows] of byKey.entries()) {
    if (scopedRows.length === 1 || level >= 2) {
      for (const row of scopedRows) row.update_schedule_key = key;
      continue;
    }
    assignUpdateScheduleKeys(scopedRows, level + 1);
  }
  return rows;
}

function updateScheduleSourceRow(row) {
  const classParts = classPartsFromLabel(row.class_label || row.class_name);
  const dateParts = datePartsFromLabel(row.day_label || row.day_text || row.date_text);
  const key = text(row.update_schedule_key) || updateScheduleKeyTiers(row)[0];
  if (!key) return null;
  const timeText = text(row.class_time_text || row.time_text || row.time);
  const ringNameNormalized = visualRingName(row.ring_name_normalized || normalizedWecRingName(row.ring_name));
  const ringKey = ringVisualKey(row.ring_no, ringNameNormalized);
  const classKey = classVisualKey(ringNameNormalized, row.class_no);
  return {
    update_schedule_key: key,
    show_no: intValue(row.show_no),
    ring_day_no: intValue(row.ring_day_no),
    ring_no: intValue(row.ring_no),
    ring_name: text(row.ring_name),
    ring_name_normalized: ringNameNormalized,
    ring_visual_key: ringKey,
    class_visual_key: classKey,
    date_text: text(row.day_label || row.day_text || row.date_text),
    class_no: intValue(row.class_no),
    event_id: intValue(row.event_id),
    event_name: text(row.class_label || row.class_name),
    class_number: intValue(classParts.classNumber),
    class_payout: classParts.classPayout,
    class_name: classParts.className,
    time_text: timeText,
    class_start_time: null,
    dow: dateParts.dow,
    iso_date: dateParts.isoDate,
    entry_count: intValue(row.entry_count),
    event_type: intValue(row.re_type || row.event_type),
    oc_id: intValue(row.oc_id),
    live_flag: boolOrNull(row.live_flag) === true ? 1 : 0,
    source_endpoint: "update_schedule.php",
    source_payload: sourcePayload(row)
  };
}

function updateSchedulePreflightReason(row) {
  const sourceRow = updateScheduleSourceRow(row) || row || {};
  const timeText = text(sourceRow.time_text || row?.time_text || row?.class_time_text);
  const classNo = intOrNull(sourceRow.class_no ?? row?.class_no);
  const eventType = intOrNull(sourceRow.event_type ?? row?.event_type ?? row?.re_type);
  const className = text(sourceRow.class_name || row?.class_name || row?.class_label);
  const classNameLower = className.toLowerCase();
  if (!timeText) return "blank_time_text";
  if (!classNo) return "missing_class_no";
  if (eventType === 5) return "event_type_5";
  if (classNameLower.includes("ticketed") || classNameLower.includes("ticket school")) {
    return classNameLower.includes("ticketed") ? "ticketed" : "ticket_school";
  }
  return "";
}

function summarizeUpdateSchedulePreflight(rows) {
  const summary = {
    raw_schedule_rows: (rows || []).length,
    preflight_rows: 0,
    non_preflight_rows: 0,
    preflight_reasons: {}
  };
  for (const row of rows || []) {
    const reason = updateSchedulePreflightReason(row);
    if (reason) {
      summary.preflight_rows += 1;
      summary.preflight_reasons[reason] = (summary.preflight_reasons[reason] || 0) + 1;
    } else {
      summary.non_preflight_rows += 1;
    }
  }
  return summary;
}

function getOrdersSourceRow(row, logMeta = null) {
  const classParts = classPartsFromLabel(row.class_label || row.class_name);
  const key = logMeta?.appendLog
    ? liveSourceLogKey("get_orders", row, logMeta.pollRunId, logMeta.rowIndex)
    : resultKey(row.show_no, row.ring_no, row.ring_day_no, row.class_label || row.class_no);
  if (!key) return null;
  return {
    get_orders_key: key,
    show_no: intValue(row.show_no),
    focus_day: dateKey(row.focus_day),
    ring_no: intValue(row.ring_no),
    ring_day_no: intValue(row.ring_day_no),
    ring_name: text(row.ring_name),
    ring_name_normalized: text(row.ring_name_normalized),
    ring_visual_key: text(row.ring_visual_key),
    class_visual_key: text(row.class_visual_key),
    day_text: text(row.day_label || row.day_text),
    class_no: intValue(row.class_no),
    class_text: text(row.class_label || row.class_name),
    class_number: intValue(classParts.classNumber),
    entry_no: intValue(row.current_entry_no),
    entry_text: text(row.current_entry_text),
    total: intValue(row.entry_count || row.total),
    n_to_go: intValue(row.entries_to_go || row.n_to_go),
    n_gone: intValue(row.entries_gone || row.n_gone),
    time_text: text(row.class_time_text || row.time_text || row.time),
    timestamp_value: intValue(row.source_timestamp || row.timestamp),
    elapsed: intValue(row.elapsed_seconds || row.elapsed),
    source_payload: sourcePayload(row)
  };
}

function getRingsSourceRow(row, logMeta = null) {
  const classParts = classPartsFromLabel(row.class_label || row.class_name);
  const key = logMeta?.appendLog
    ? liveSourceLogKey("get_rings", row, logMeta.pollRunId, logMeta.rowIndex)
    : resultKey(row.show_no, row.ring_no, row.ring_day_no, row.class_no || row.class_label);
  if (!key) return null;
  return {
    get_rings_key: key,
    show_no: intValue(row.show_no),
    focus_day: dateKey(row.focus_day),
    ring_no: intValue(row.ring_no),
    ring_day_no: intValue(row.ring_day_no),
    class_no: intValue(row.class_no),
    class_text: text(row.class_label || row.class_name),
    class_number: intValue(classParts.classNumber),
    entry_no: intValue(row.current_entry_no),
    entry_text: text(row.current_entry_text),
    total: intValue(row.entry_count || row.total),
    n_to_go: intValue(row.entries_to_go || row.n_to_go),
    n_gone: intValue(row.entries_gone || row.n_gone),
    time_text: text(row.class_time_text || row.time_text || row.time),
    timestamp_value: intValue(row.source_timestamp || row.timestamp),
    elapsed: intValue(row.elapsed_seconds || row.elapsed),
    status_type: text(row.status_type || row.type),
    source_payload: sourcePayload(row)
  };
}

function countsSourceRow(row) {
  const classParts = classPartsFromLabel(row.class_label || row.class_name);
  const key = resultKey(row.show_no, row.class_no);
  if (!key) return null;
  return {
    class_key: key,
    show_no: intValue(row.show_no),
    class_no: intValue(row.class_no),
    class_number: intValue(classParts.classNumber),
    class_name: text(row.class_name || classParts.className),
    entry_count: intValue(row.entry_count),
    source_payload: sourcePayload(row)
  };
}

function classOogSourceRow(row, classRow = null, classTimeRow = null) {
  const classLabel = text(row.class_label || classRow?.class_label || classRow?.class_name || row.class_no);
  const key = resultKey(row.show_no, row.class_no, row.current_entry_no || row.entry_no);
  if (!key) return null;
  const ringName = text(row.ring || row.ring_name || classTimeRow?.ring_name);
  const ringNameNormalized = visualRingName(row.ring_name_normalized || normalizedWecRingName(ringName));
  const ringNo = intValue(row.ring_no || classTimeRow?.ring_no);
  const classNo = intValue(row.class_no);
  const entryNo = intValue(row.current_entry_no || row.entry_no);
  const ringKey = ringVisualKey(ringNo, ringNameNormalized);
  const classKey = classVisualKey(ringNameNormalized, classNo);
  const entryKey = entryVisualKey(ringNameNormalized, classNo, entryNo);
  return {
    class_oog_key: key,
    ring: ringName,
    ring_no: ringNo,
    ring_day_no: intValue(row.ring_day_no || classTimeRow?.ring_day_no),
    class_order: intValue(row.class_order || classTimeRow?.class_order),
    class_no: classNo,
    class_label: classLabel,
    ring_name_normalized: ringNameNormalized,
    ring_visual_key: ringKey,
    class_visual_key: classKey,
    entry_visual_key: entryKey,
    class_number: intValue(row.class_number),
    class_payout: text(row.class_payout),
    class_name: text(row.class_name),
    entry_order: intValue(row.entry_order),
    entry_no: entryNo,
    horse: text(row.current_horse || row.horse),
    rider: text(row.rider),
    trainer: text(row.trainer),
    source_endpoint: "class_oog.php",
    source_payload: sourcePayload(row)
  };
}

function updateScheduleDuplicateRecord(row) {
  return {
    record_id: text(row.ROWID || row.id || row.record_id),
    update_schedule_key: text(row.update_schedule_key),
    show_no: text(row.show_no),
    focus_day: text(row.focus_day || row.iso_date || row.date_text),
    ring_day_no: text(row.ring_day_no),
    ring_no: text(row.ring_no),
    class_no: text(row.class_no),
    event_id: text(row.event_id),
    created_at: text(row.CREATEDTIME || row.CREATED_TIME || row.created_at || row.created_time),
    updated_at: text(row.MODIFIEDTIME || row.MODIFIED_TIME || row.updated_at || row.updated_time),
    completeness_score: [
      row.show_no,
      row.focus_day || row.iso_date || row.date_text,
      row.ring_day_no,
      row.ring_no,
      row.class_no,
      row.event_id,
      row.class_name,
      row.time_text
    ].filter((value) => text(value)).length
  };
}

function updateScheduleDuplicateCandidateReport(rows, keyField = "update_schedule_key") {
  const groups = new Map();
  for (const row of rows || []) {
    const key = text(row?.[keyField]);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Array.from(groups.entries())
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => {
      const records = group.map(updateScheduleDuplicateRecord)
        .sort((left, right) => {
          if (right.completeness_score !== left.completeness_score) return right.completeness_score - left.completeness_score;
          const rightTime = text(right.updated_at || right.created_at);
          const leftTime = text(left.updated_at || left.created_at);
          if (rightTime !== leftTime) return rightTime.localeCompare(leftTime);
          return text(left.record_id).localeCompare(text(right.record_id));
        });
      const keep = records[0] || {};
      return {
        key,
        count: group.length,
        records,
        proposed_keep_record_id: keep.record_id || null,
        proposed_delete_record_ids: Array.from(new Set(records.slice(1).map((record) => record.record_id)))
          .filter((recordId) => recordId && recordId !== keep.record_id)
      };
    });
}

function updateScheduleDuplicateAudit(rows, keyField = "update_schedule_key") {
  const keys = (rows || []).map((row) => text(row?.[keyField])).filter(Boolean);
  const unique = new Set(keys);
  const duplicateCandidateReport = updateScheduleDuplicateCandidateReport(rows, keyField);
  return {
    total_rows: (rows || []).length,
    keyed_rows: keys.length,
    unique_keys: unique.size,
    duplicate_keys: duplicateCandidateReport.length,
    duplicate_record_instances: duplicateCandidateReport.reduce((sum, group) => sum + group.count, 0),
    duplicate_candidate_report: duplicateCandidateReport
  };
}

function assertNoDuplicateUpdateScheduleRows(rows, label, keyField = "update_schedule_key") {
  const report = updateScheduleDuplicateCandidateReport(rows, keyField);
  if (!report.length) return;
  const preview = report.slice(0, 5);
  throw new Error(`${label} contains duplicate ${keyField}: ${JSON.stringify(preview)}`);
}

async function getUpdateScheduleRowsByKey(app, key, limit = 50) {
  const pageLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
  const query = `SELECT * FROM ${TABLES.updateSchedule} WHERE update_schedule_key = ${zcqlValue(key)} LIMIT ${pageLimit}`;
  return (await app.zcql().executeZCQLQuery(query) || [])
    .map((item) => item?.[TABLES.updateSchedule])
    .filter(Boolean);
}

async function assertNoExistingUpdateScheduleDuplicateKey(app, key) {
  const rows = await getUpdateScheduleRowsByKey(app, key, 50);
  if (rows.length <= 1) return;
  const report = updateScheduleDuplicateCandidateReport(rows);
  throw new Error(`existing hs_update_schedule duplicate update_schedule_key blocks upsert: ${JSON.stringify(report.slice(0, 5))}`);
}

async function getUpdateScheduleRowsForAudit(app, showNo = "", { limit = 5000 } = {}) {
  if (text(showNo)) {
    return getRowsByShow(app, TABLES.updateSchedule, showNo, { limit: Math.max(1, Math.min(Number(limit) || 5000, 10000)) });
  }
  const rows = [];
  const maxRows = Math.max(1, Math.min(Number(limit) || 5000, 10000));
  for (let offset = 0; offset < maxRows; offset += 200) {
    const pageLimit = Math.min(200, maxRows - offset);
    const query = `SELECT * FROM ${TABLES.updateSchedule} LIMIT ${pageLimit} OFFSET ${offset}`;
    const page = (await app.zcql().executeZCQLQuery(query) || [])
      .map((item) => item?.[TABLES.updateSchedule])
      .filter(Boolean);
    rows.push(...page);
    if (page.length < pageLimit) break;
  }
  return rows;
}

async function writeSourceMirrorRow(app, row) {
  if (row.source_endpoint === "update_schedule.php") {
    const sourceRow = updateScheduleSourceRow(row);
    if (!sourceRow) return null;
    await assertNoExistingUpdateScheduleDuplicateKey(app, sourceRow.update_schedule_key);
    return upsert(app, TABLES.updateSchedule, { update_schedule_key: sourceRow.update_schedule_key }, sourceRow);
  }
  if (row.source_endpoint === "counts.php") {
    const sourceRow = countsSourceRow(row);
    if (!sourceRow) return null;
    return upsert(app, TABLES.counts, { class_key: sourceRow.class_key }, sourceRow);
  }
  if (row.source_endpoint === "get_orders.php") {
    const sourceRow = getOrdersSourceRow(row);
    if (!sourceRow) return null;
    return upsert(app, TABLES.getOrders, { get_orders_key: sourceRow.get_orders_key }, sourceRow);
  }
  if (row.source_endpoint === "get_rings.php") {
    const sourceRow = getRingsSourceRow(row);
    if (!sourceRow) return null;
    return upsert(app, TABLES.getRings, { get_rings_key: sourceRow.get_rings_key }, sourceRow);
  }
  return null;
}

async function writeClassOogSourceMirrorRow(app, row, classRow, classTimeRow) {
  const sourceRow = classOogSourceRow(row, classRow, classTimeRow);
  if (!sourceRow) return null;
  return upsert(app, TABLES.classOog, { class_oog_key: sourceRow.class_oog_key }, sourceRow);
}

async function upsertSourceRowsFast(app, tableName, keyField, sourceRows, { showNo = "" } = {}) {
  const table = app.datastore().table(tableName);
  const incoming = (sourceRows || [])
    .filter(Boolean)
    .map(cleanRowForDatastore);
  if (!incoming.length) return { rows: 0, inserted: 0, updated: 0, skipped: 0 };
  if (tableName === TABLES.updateSchedule) {
    assertNoDuplicateUpdateScheduleRows(incoming, "incoming hs_update_schedule source rows", keyField);
  }

  const existingByKey = new Map();
  if (showNo) {
    const existingRows = await getRowsByShow(app, tableName, showNo, {
      limit: tableName === TABLES.classOog ? 10000 : 2000
    });
    if (tableName === TABLES.updateSchedule) {
      assertNoDuplicateUpdateScheduleRows(existingRows, "existing hs_update_schedule rows", keyField);
    }
    for (const row of existingRows) {
      const key = text(row[keyField]);
      if (key) existingByKey.set(key, row);
    }
  }

  const inserts = [];
  const updates = [];
  let skipped = 0;
  for (const row of incoming) {
    const key = text(row[keyField]);
    if (!key) {
      skipped += 1;
      continue;
    }
    let existing = existingByKey.get(key);
    if (!existing) {
      try {
        existing = await findOne(app, tableName, { [keyField]: key });
      } catch (error) {
        existing = null;
      }
    }
    if (existing?.ROWID) {
      const changed = Object.entries(row).some(([field, value]) => field !== keyField && text(existing[field]) !== text(value));
      if (changed) {
        const mutable = { ...row };
        delete mutable[keyField];
        updates.push({ ...mutable, ROWID: existing.ROWID });
      }
    } else {
      inserts.push(row);
    }
  }

  let inserted = 0;
  let updated = 0;
  for (let index = 0; index < inserts.length; index += 100) {
    const batch = inserts.slice(index, index + 100);
    if (batch.length) {
      await table.insertRows(batch);
      inserted += batch.length;
    }
  }
  for (let index = 0; index < updates.length; index += 100) {
    const batch = updates.slice(index, index + 100);
    if (batch.length) {
      await table.updateRows(batch);
      updated += batch.length;
    }
  }
  return { rows: incoming.length, inserted, updated, skipped };
}

async function replaceClassOogClassRows(app, showNo, classNo, rows, classRow = null, classTimeRow = null) {
  const sourceRows = (rows || [])
    .map((row) => classOogSourceRow({ ...row, show_no: row.show_no || showNo, class_no: row.class_no || classNo }, classRow, classTimeRow))
    .filter(Boolean);
  const result = sourceRows.length
    ? await upsertSourceRowsFast(app, TABLES.classOog, "class_oog_key", sourceRows, { showNo })
    : { rows: 0, inserted: 0, updated: 0, skipped: 0 };
  const activeKeys = new Set(sourceRows.map((row) => text(row.class_oog_key)).filter(Boolean));
  const existingRows = await getRowsByShow(app, TABLES.classOog, showNo, { limit: 10000 });
  const classNoText = text(classNo);
  const staleRows = existingRows
    .filter((row) => {
      const key = text(row.class_oog_key);
      const keyClassNo = key.split("|")[1] || "";
      return key
        && (text(row.class_no) === classNoText || keyClassNo === classNoText)
        && !activeKeys.has(key);
    });
  const confirmedKeys = await classOogConfirmDeleteKeySet(showNo, { classNo });
  const staleDeletePlan = classOogCatalystDeletePlan(staleRows, confirmedKeys);
  const staleDeleteResult = await executeCatalystClassOogDeletePlan(app, staleDeletePlan);
  return {
    ...result,
    deleted: staleDeleteResult.deleted,
    stale_delete_candidates: staleDeletePlan.candidates,
    stale_delete_skipped: staleDeletePlan.skipped,
    stale_delete_skip_reason: staleDeletePlan.skip_reason
  };
}

async function backfillSourceMirrors(app, showNo, sources = ["update_schedule.php", "get_orders.php", "get_rings.php"], limitPerSource = 300, startOffset = 0) {
  const counters = { scanned: 0, source_mirrors: 0, skipped: 0 };
  for (const source of sources) {
    for (let offset = startOffset; offset < startOffset + limitPerSource; offset += 100) {
      const pageLimit = Math.min(100, startOffset + limitPerSource - offset);
      const query = [
        "SELECT *",
        `FROM ${TABLES.classTimes}`,
        `WHERE show_no = ${zcqlValue(showNo)} AND source_endpoint = ${zcqlValue(source)}`,
        `LIMIT ${pageLimit} OFFSET ${offset}`
      ].join(" ");
      const page = (await app.zcql().executeZCQLQuery(query) || [])
        .map((item) => item?.[TABLES.classTimes])
        .filter(Boolean);
      counters.scanned += page.length;
      for (const row of page) {
        const result = await writeSourceMirrorRow(app, row);
        if (result?.row?.ROWID) counters.source_mirrors += 1;
        else counters.skipped += 1;
      }
      if (page.length < pageLimit) break;
    }
  }
  return counters;
}

async function countRows(app, tableName, where = {}, countLimit = 2000) {
  const clauses = Object.entries(where)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key} = ${zcqlValue(value)}`);
  const whereSql = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  const rowIds = new Set();
  let scanned = 0;
  let truncated = false;
  for (let offset = 0; offset < countLimit; offset += 200) {
    const pageLimit = Math.min(200, countLimit - offset);
    const pageQuery = `SELECT ROWID FROM ${tableName}${whereSql} LIMIT ${pageLimit} OFFSET ${offset}`;
    const page = await app.zcql().executeZCQLQuery(pageQuery);
    const rows = (page || []).map((item) => item?.[tableName]).filter(Boolean);
    scanned += rows.length;
    for (const row of rows) {
      const rowId = text(row.ROWID);
      if (rowId) rowIds.add(rowId);
    }
    if (rows.length < pageLimit) break;
    if (offset + pageLimit >= countLimit) truncated = true;
  }
  return { table: tableName, where, rows: rowIds.size, scanned, truncated };
}

async function getPagedRowsFiltered(app, tableName, predicate, { maxRows = 2000 } = {}) {
  const table = app.datastore().table(tableName);
  const rows = [];
  let nextToken = undefined;
  let scanned = 0;
  do {
    const page = await table.getPagedRows({ nextToken, maxRows: 200 });
    const data = page?.data || [];
    scanned += data.length;
    for (const row of data) {
      if (!predicate || predicate(row)) rows.push(row);
      if (rows.length >= maxRows) return { rows, scanned, truncated: true };
    }
    nextToken = page?.next_token;
  } while (nextToken);
  return { rows, scanned, truncated: Boolean(nextToken) };
}

async function getRowsByShow(app, tableName, showNo, { limit = 2000, offset = 0 } = {}) {
  const pageLimit = Math.max(1, Math.min(Number(limit) || 2000, 2000));
  const pageOffset = Math.max(0, Number(offset) || 0);
  const fallback = await getPagedRowsFiltered(
    app,
    tableName,
    (row) => text(row.show_no) === text(showNo) || (tableName === TABLES.classOog && text(row.class_oog_key).startsWith(`${text(showNo)}|`)),
    { maxRows: pageOffset + pageLimit }
  );
  return fallback.rows.slice(pageOffset, pageOffset + pageLimit).map((row) => (
    tableName === TABLES.classOog && !text(row.show_no) && text(row.class_oog_key).startsWith(`${text(showNo)}|`)
      ? { ...row, show_no: showNo }
      : row
  ));
}

async function getRowsByShowFocusZcql(app, tableName, showNo, focusDay, { limit = 1000 } = {}) {
  const safeShowNo = text(showNo);
  const safeFocusDay = dateKey(focusDay);
  if (!safeShowNo || !safeFocusDay) return { rows: [], scanned: 0, truncated: false };
  const rows = [];
  let scanned = 0;
  const pageLimit = 300;
  const maxRows = Math.max(1, Math.min(Number(limit) || 1000, 10000));
  for (let offset = 0; offset < maxRows; offset += pageLimit) {
    const query = `SELECT * FROM ${tableName} WHERE show_no = ${zcqlValue(safeShowNo)} LIMIT ${pageLimit} OFFSET ${offset}`;
    const result = await app.zcql().executeZCQLQuery(query);
    const pageRows = (result || []).map((item) => item?.[tableName]).filter(Boolean);
    scanned += pageRows.length;
    for (const row of pageRows) {
      if (dateKey(row.focus_day || row.iso_date) === safeFocusDay) rows.push(row);
      if (rows.length >= maxRows) return { rows, scanned, truncated: true };
    }
    if (pageRows.length < pageLimit) break;
  }
  return { rows, scanned, truncated: false };
}

async function countRowsSafe(app, tableName, where = {}, countLimit = 2000) {
  try {
    return await countRows(app, tableName, where, countLimit);
  } catch (error) {
    const expected = Object.entries(where)
      .filter(([, value]) => value !== null && value !== undefined && value !== "");
    const fallback = await getPagedRowsFiltered(
      app,
      tableName,
      (row) => expected.every(([key, value]) => (
        text(row[key]) === text(value)
        || (tableName === TABLES.classOog && key === "show_no" && text(row.class_oog_key).startsWith(`${text(value)}|`))
      )),
      { maxRows: countLimit }
    );
    return {
      table: tableName,
      where,
      rows: fallback.rows.length,
      scanned: fallback.scanned,
      truncated: fallback.truncated,
      fallback: "datastore.getPagedRows"
    };
  }
}

async function sourceMirrorAudit(app, showNo) {
  const classTimesGetOrdersUnique = await uniqueSourceMirrorKeysFromClassTimes(app, showNo, "get_orders.php");
  const classTimesGetRingsUnique = await uniqueSourceMirrorKeysFromClassTimes(app, showNo, "get_rings.php");
  return {
    update_schedule: await countRowsSafe(app, TABLES.updateSchedule, { show_no: showNo }),
    counts: await countRowsSafe(app, TABLES.counts, { show_no: showNo }),
    class_oog: await countRowsSafe(app, TABLES.classOog, { show_no: showNo }, 10000),
    get_orders: await countRowsSafe(app, TABLES.getOrders, { show_no: showNo }),
    get_rings: await countRowsSafe(app, TABLES.getRings, { show_no: showNo }),
    result_classes: await countRowsSafe(app, TABLES.resultClasses, { show_no: showNo }),
    class_times_all: await countRowsSafe(app, TABLES.classTimes, { show_no: showNo }),
    class_times_update_schedule: await countRowsSafe(app, TABLES.classTimes, { show_no: showNo, source_endpoint: "update_schedule.php" }),
    class_times_get_orders: await countRowsSafe(app, TABLES.classTimes, { show_no: showNo, source_endpoint: "get_orders.php" }),
    class_times_get_orders_unique_keys: classTimesGetOrdersUnique,
    class_times_get_rings: await countRowsSafe(app, TABLES.classTimes, { show_no: showNo, source_endpoint: "get_rings.php" }),
    class_times_get_rings_unique_keys: classTimesGetRingsUnique,
    helper_classes_counts: await countRowsSafe(app, TABLES.classes, { show_no: showNo, source_endpoint: "counts.php" }),
    helper_classes_update_schedule: await countRowsSafe(app, TABLES.classes, { show_no: showNo, source_endpoint: "update_schedule.php" }),
    helper_classes_class_oog: await countRowsSafe(app, TABLES.classes, { show_no: showNo, source_endpoint: "class_oog.php" }),
    helper_entries_class_oog: await countRowsSafe(app, TABLES.entries, { show_no: showNo, entry_source: "class_oog.php" }, 10000),
    helper_entries_get_orders: await countRowsSafe(app, TABLES.entries, { show_no: showNo, entry_source: "get_orders.php" }),
    helper_entries_get_rings: await countRowsSafe(app, TABLES.entries, { show_no: showNo, entry_source: "get_rings.php" })
  };
}

async function uniqueSourceMirrorKeysFromClassTimes(app, showNo, source, countLimit = 1000) {
  const keys = new Set();
  let scanned = 0;
  for (let offset = 0; offset < countLimit; offset += 200) {
    const pageLimit = Math.min(200, countLimit - offset);
    const query = [
      "SELECT *",
      `FROM ${TABLES.classTimes}`,
      `WHERE show_no = ${zcqlValue(showNo)} AND source_endpoint = ${zcqlValue(source)}`,
      `LIMIT ${pageLimit} OFFSET ${offset}`
    ].join(" ");
    const page = (await app.zcql().executeZCQLQuery(query) || [])
      .map((item) => item?.[TABLES.classTimes])
      .filter(Boolean);
    scanned += page.length;
    for (const row of page) {
      const sourceRow = source === "get_orders.php" ? getOrdersSourceRow(row) : source === "get_rings.php" ? getRingsSourceRow(row) : null;
      const key = sourceRow?.get_orders_key || sourceRow?.get_rings_key;
      if (key) keys.add(key);
    }
    if (page.length < pageLimit) break;
  }
  return { source_endpoint: source, scanned, unique_keys: keys.size, truncated: scanned >= countLimit };
}

async function cleanupMixedClassTimes(app, showNo, sources = ["get_orders.php", "get_rings.php"], limit = 200) {
  const auditBefore = await sourceMirrorAudit(app, showNo);
  const mirrorCounts = {
    "get_orders.php": auditBefore.get_orders.rows,
    "get_rings.php": auditBefore.get_rings.rows
  };
  const requiredMirrorCounts = {
    "get_orders.php": auditBefore.class_times_get_orders_unique_keys.unique_keys,
    "get_rings.php": auditBefore.class_times_get_rings_unique_keys.unique_keys
  };
  for (const source of sources) {
    if ((requiredMirrorCounts[source] || 0) > 0 && (mirrorCounts[source] || 0) < requiredMirrorCounts[source]) {
      return {
        ok: false,
        deleted: 0,
        error: `standalone mirror for ${source} has ${mirrorCounts[source] || 0} rows but source has ${requiredMirrorCounts[source] || 0} unique keys`,
        audit_before: auditBefore
      };
    }
  }
  let deleted = 0;
  const table = app.datastore().table(TABLES.classTimes);
  for (const source of sources) {
    while (deleted < limit) {
      const pageLimit = Math.min(100, limit - deleted);
      const query = [
        "SELECT ROWID",
        `FROM ${TABLES.classTimes}`,
        `WHERE show_no = ${zcqlValue(showNo)} AND source_endpoint = ${zcqlValue(source)}`,
        `LIMIT ${pageLimit}`
      ].join(" ");
      const page = (await app.zcql().executeZCQLQuery(query) || [])
        .map((item) => item?.[TABLES.classTimes]?.ROWID)
        .filter(Boolean);
      if (!page.length) break;
      await table.deleteRows(page);
      deleted += page.length;
      if (page.length < pageLimit) break;
    }
  }
  return {
    ok: true,
    deleted,
    audit_before: auditBefore,
    audit_after: await sourceMirrorAudit(app, showNo)
  };
}

async function cleanupInvalidClassStartTimes(app, showNo, focusDay) {
  const query = [
    "SELECT ROWID, class_start_key, show_no, focus_day, class_no, class_start_time",
    `FROM ${TABLES.classStartTimes}`,
    `WHERE show_no = ${zcqlValue(showNo)} AND focus_day = ${zcqlValue(focusDay)}`,
    "LIMIT 300"
  ].join(" ");
  const rows = (await app.zcql().executeZCQLQuery(query) || [])
    .map((item) => item?.[TABLES.classStartTimes])
    .filter(Boolean);
  const staleIds = rows
    .filter((row) => intOrNull(row.class_no) <= 0 || !text(row.class_start_time))
    .map((row) => row.ROWID)
    .filter(Boolean);
  let deleted = 0;
  const table = app.datastore().table(TABLES.classStartTimes);
  for (let index = 0; index < staleIds.length; index += 100) {
    const batch = staleIds.slice(index, index + 100);
    if (batch.length) {
      await table.deleteRows(batch);
      deleted += batch.length;
    }
  }
  return { scanned: rows.length, deleted };
}

function parsedRawJson(row) {
  try {
    return JSON.parse(text(row.raw_json || row.source_payload) || "{}") || {};
  } catch {
    return {};
  }
}

async function getRowsByShowZcql(app, tableName, showNo, { limit = 200, offset = 0, extraWhere = "" } = {}) {
  const pageLimit = Math.max(1, Math.min(Number(limit) || 200, 200));
  const pageOffset = Math.max(0, Number(offset) || 0);
  const where = [`show_no = ${zcqlValue(showNo)}`];
  if (extraWhere) where.push(extraWhere);
  const query = [
    "SELECT *",
    `FROM ${tableName}`,
    `WHERE ${where.join(" AND ")}`,
    `LIMIT ${pageLimit} OFFSET ${pageOffset}`
  ].join(" ");
  return (await app.zcql().executeZCQLQuery(query) || [])
    .map((item) => item?.[tableName])
    .filter(Boolean);
}

async function repairUpdateScheduleContext(app, showNo, { offset = 0, limit = 100, restore = false } = {}) {
  const pageLimit = Math.max(1, Math.min(Number(limit) || 100, 100));
  const pageOffset = Math.max(0, Number(offset) || 0);
  const ringRows = await getRowsByShow(app, TABLES.rings, showNo, { limit: 1000 });
  const classTimeRows = await getRowsByShow(app, TABLES.classTimes, showNo, { limit: 5000 });
  const updateTable = app.datastore().table(TABLES.updateSchedule);

  let restored = 0;
  if (restore) {
    const restoreRows = classTimeRows
      .filter((item) => text(item.source_endpoint) === "update_schedule.php" || !text(item.source_endpoint))
      .slice(pageOffset, pageOffset + pageLimit);
    for (const row of restoreRows) {
      const result = await writeSourceMirrorRow(app, { ...row, source_endpoint: "update_schedule.php" });
      if (result?.action === "insert") restored += 1;
    }
  }

  const updateRows = await getRowsByShow(app, TABLES.updateSchedule, showNo, { limit: pageLimit, offset: pageOffset });

  const ringByDay = new Map();
  for (const row of ringRows) {
    const ringDayNo = text(row.ring_day_no);
    if (ringDayNo) ringByDay.set(ringDayNo, row);
  }

  const classTimeByKey = new Map();
  for (const row of classTimeRows) {
    const key = resultKey(row.show_no, row.ring_day_no, row.class_no);
    if (key && !classTimeByKey.has(key)) classTimeByKey.set(key, row);
  }

  const updates = [];
  for (const row of updateRows) {
    const key = text(row.update_schedule_key || resultKey(row.show_no, row.ring_day_no, row.class_no));
    const ring = ringByDay.get(text(row.ring_day_no)) || {};
    const classTime = classTimeByKey.get(key) || {};
    const raw = parsedRawJson(classTime);
    const dateParts = datePartsFromLabel(row.date_text || ring.day_label || classTime.day_label);
    const timeText = text(row.time_text || classTime.class_time_text || classTime.time_text);
    const classStartTime = text(row.class_start_time || classStartTimeFromText(classTime.class_time_text || classTime.time_text));
    const candidate = cleanRowForDatastore({
      ROWID: row.ROWID,
      ring_no: intValue(row.ring_no || ring.ring_no || classTime.ring_no),
      ring_name: text(row.ring_name || ring.ring_name || classTime.ring_name),
      date_text: text(row.date_text || ring.day_label || classTime.day_label),
      focus_day: text(row.focus_day || dateParts.isoDate),
      iso_date: text(row.iso_date || dateParts.isoDate),
      event_id: intValue(row.event_id || classTime.event_id || raw.event_id),
      time_text: timeText,
      class_start_time: classStartTime
    });
    const changed = Object.entries(candidate)
      .filter(([field]) => field !== "ROWID")
      .some(([field, value]) => text(row[field]) !== text(value));
    if (changed) updates.push(candidate);
  }

  let updated = 0;
  for (let index = 0; index < updates.length; index += 100) {
    const batch = updates.slice(index, index + 100);
    if (batch.length) {
      await updateTable.updateRows(batch);
      updated += batch.length;
    }
  }

  return {
    scanned: updateRows.length,
    offset: pageOffset,
    limit: pageLimit,
    has_more: updateRows.length === pageLimit,
    restored_from_class_times: restored,
    updated,
    ring_context_rows: ringRows.length,
    class_time_rows: classTimeRows.length
  };
}

async function clearUpdateScheduleCheckTime(app, showNo, { offset = 0, limit = 100 } = {}) {
  const pageLimit = Math.max(1, Math.min(Number(limit) || 100, 100));
  const pageOffset = Math.max(0, Number(offset) || 0);
  const rows = await getRowsByShow(app, TABLES.updateSchedule, showNo, { limit: pageLimit, offset: pageOffset });
  const updates = rows
    .filter((row) => text(row.time_text).toLowerCase() === "check time" || text(row.class_start_time).toLowerCase() === "check time")
    .map((row) => ({ ROWID: row.ROWID, time_text: null, class_start_time: null }));
  if (updates.length) await app.datastore().table(TABLES.updateSchedule).updateRows(updates);
  return {
    scanned: rows.length,
    offset: pageOffset,
    limit: pageLimit,
    has_more: rows.length === pageLimit,
    cleared: updates.length
  };
}

async function deleteUpdateScheduleStale(app, showNo, activeKeys = []) {
  const active = new Set((activeKeys || []).map(text).filter(Boolean));
  if (!active.size) return { scanned: 0, deleted: 0, error: "active_keys required" };
  const rows = await getRowsByShow(app, TABLES.updateSchedule, showNo, { limit: 5000 });
  const staleIds = rows
    .filter((row) => !active.has(text(row.update_schedule_key || resultKey(row.show_no, row.ring_day_no, row.class_no))))
    .map((row) => row.ROWID)
    .filter(Boolean);
  const table = app.datastore().table(TABLES.updateSchedule);
  let deleted = 0;
  for (let index = 0; index < staleIds.length; index += 100) {
    const batch = staleIds.slice(index, index + 100);
    if (batch.length) {
      await table.deleteRows(batch);
      deleted += batch.length;
    }
  }
  return { scanned: rows.length, active_keys: active.size, deleted };
}

async function deleteUpdateScheduleStaleForRingDay(app, showNo, ringDayNo, activeKeys = []) {
  const active = new Set((activeKeys || []).map(text).filter(Boolean));
  if (!active.size || !text(ringDayNo)) return { scanned: 0, deleted: 0, error: "active_keys and ring_day_no required" };
  const rows = await getRowsByShow(app, TABLES.updateSchedule, showNo, { limit: 5000 });
  const staleIds = rows
    .filter((row) => text(row.ring_day_no) === text(ringDayNo))
    .filter((row) => !active.has(text(row.update_schedule_key)))
    .map((row) => row.ROWID)
    .filter(Boolean);
  const table = app.datastore().table(TABLES.updateSchedule);
  let deleted = 0;
  for (let index = 0; index < staleIds.length; index += 100) {
    const batch = staleIds.slice(index, index + 100);
    if (batch.length) {
      await table.deleteRows(batch);
      deleted += batch.length;
    }
  }
  return { scanned: rows.length, ring_day_no: text(ringDayNo), active_keys: active.size, deleted };
}

async function deleteUpdateScheduleNonClassRowsForRingDay(app, showNo, focusDay, ringDayNo) {
  const safeFocusDay = dateKey(focusDay);
  if (!text(showNo) || !safeFocusDay || !text(ringDayNo)) {
    return { scanned: 0, deleted: 0, skipped: true, reason: "show_no_focus_day_ring_day_no_required" };
  }
  const rows = await getRowsByShow(app, TABLES.updateSchedule, showNo, { limit: 5000 });
  const staleIds = rows
    .filter((row) => dateKey(row.focus_day || row.iso_date) === safeFocusDay)
    .filter((row) => text(row.ring_day_no) === text(ringDayNo))
    .filter((row) => intValue(row.class_no) <= 0)
    .map((row) => row.ROWID)
    .filter(Boolean);
  const table = app.datastore().table(TABLES.updateSchedule);
  let deleted = 0;
  for (let index = 0; index < staleIds.length; index += 100) {
    const batch = staleIds.slice(index, index + 100);
    if (batch.length) {
      await table.deleteRows(batch);
      deleted += batch.length;
    }
  }
  return {
    scanned: rows.length,
    focus_day: safeFocusDay,
    ring_day_no: text(ringDayNo),
    deleted
  };
}

async function deleteInvalidUpdateScheduleRows(app, showNo) {
  const rows = await getRowsByShow(app, TABLES.updateSchedule, showNo, { limit: 5000 });
  const staleIds = rows
    .filter((row) => intValue(row.class_no) <= 0)
    .map((row) => row.ROWID)
    .filter(Boolean);
  const table = app.datastore().table(TABLES.updateSchedule);
  let deleted = 0;
  for (let index = 0; index < staleIds.length; index += 100) {
    const batch = staleIds.slice(index, index + 100);
    if (batch.length) {
      await table.deleteRows(batch);
      deleted += batch.length;
    }
  }
  return { scanned: rows.length, deleted };
}

async function deleteUpdateScheduleRowsByShow(app, showNo) {
  const rows = await getRowsByShow(app, TABLES.updateSchedule, showNo, { limit: 5000 });
  const ids = rows.map((row) => row.ROWID).filter(Boolean);
  const table = app.datastore().table(TABLES.updateSchedule);
  let deleted = 0;
  for (let index = 0; index < ids.length; index += 100) {
    const batch = ids.slice(index, index + 100);
    if (batch.length) {
      await table.deleteRows(batch);
      deleted += batch.length;
    }
  }
  return { scanned: rows.length, deleted };
}

async function exportMirrorTable(app, showNo, tableKey, limit = 100, offset = 0) {
  const tables = {
    get_ring_days: TABLES.rings,
    ring_days: TABLES.rings,
    rings: TABLES.rings,
    update_schedule: TABLES.updateSchedule,
    counts: TABLES.counts,
    class_oog: TABLES.classOog,
    class_oog_raw: TABLES.classOogRaw,
    class_times: TABLES.classTimes,
    class_start_times: TABLES.classStartTimes,
    entry_go_times: TABLES.entryGoTimes,
    get_orders: TABLES.getOrders,
    get_rings: TABLES.getRings,
    result_classes: TABLES.resultClasses
  };
  const tableName = tables[tableKey];
  if (!tableName) return { ok: false, error: `unknown mirror table ${tableKey}` };
  const pageLimit = Math.max(1, Math.min(Number(limit) || 100, 200));
  const pageOffset = Math.max(0, Number(offset) || 0);
  const rows = await getRowsByShow(app, tableName, showNo, { limit: pageLimit, offset: pageOffset });
  return {
    ok: true,
    table: tableName,
    table_key: tableKey,
    show_no: showNo,
    offset: pageOffset,
    limit: pageLimit,
    rows: rows.length,
    has_more: rows.length === pageLimit,
    data: rows
  };
}

function resultKey(...parts) {
  return parts.map((part) => text(part)).filter(Boolean).join("|");
}

function compactLogTimestamp(value = new Date()) {
  const parsed = value instanceof Date ? value : new Date(value);
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return date.toISOString().replace(/[-:.]/g, "");
}

function liveSourceLogKey(source, row, pollRunId, rowIndex) {
  return resultKey(
    source,
    row.show_no,
    dateKey(row.focus_day).replace(/-/g, ""),
    pollRunId,
    row.ring_day_no,
    row.ring_no,
    rowIndex
  );
}

function resultRawJson(row) {
  return JSON.stringify(row || {}).slice(0, 9500);
}

function resultClassRow(showNo, focusDay, row) {
  const classNo = text(row.class_no);
  const sectNo = text(row.sect_no);
  const classNumber = text(row.class_number);
  const key = resultKey(showNo, classNo || classNumber, sectNo);
  if (!key || !classNo && !classNumber) return null;
  return {
    result_class_key: key,
    show_no: showNo,
    focus_day: focusDay,
    class_no: classNo,
    sect_no: sectNo,
    class_number: classNumber,
    class_name: text(row.class_name),
    result_entry_count: intOrNull(row.result_entry_count || row.entry_count),
    has_score: boolOrNull(row.has_score) === true,
    has_prize: boolOrNull(row.has_prize) === true,
    completed_at: row.completed_at,
    source: row.source || "horseshowing.results",
    raw_json: resultRawJson(row)
  };
}

function resultClassSourceRow(showNo, row) {
  const classNo = text(row.class_no);
  const sectNo = text(row.sect_no);
  const classNumber = text(row.class_number);
  const key = resultKey(showNo, classNo || classNumber, sectNo);
  if (!key || !classNo && !classNumber) return null;
  return {
    result_class_key: key,
    show_no: showNo,
    class_no: classNo,
    sect_no: sectNo,
    class_number: classNumber,
    class_name: text(row.class_name),
    result_entry_count: intOrNull(row.result_entry_count || row.entry_count),
    source: row.source || "horseshowing.srched_classes",
    raw_json: resultRawJson(row)
  };
}

function classResultRow(showNo, focusDay, row) {
  const classNo = text(row.class_no);
  const classNumber = text(row.class_number);
  const entryNo = text(row.entry_no);
  const identity = resultKey(entryNo, row.place, row.horse, row.rider);
  const key = resultKey(showNo, classNo || classNumber, identity);
  if (!key || !identity) return null;
  return {
    class_result_key: key,
    show_no: showNo,
    focus_day: focusDay,
    class_no: classNo,
    sect_no: text(row.sect_no),
    class_number: classNumber,
    class_name: text(row.class_name),
    place: text(row.place),
    entry_no: entryNo,
    horse: text(row.horse),
    rider: text(row.rider),
    owner: text(row.owner),
    score: text(row.score),
    prize: text(row.prize),
    completed_at: row.completed_at,
    source: row.source || "horseshowing.results",
    raw_json: resultRawJson(row)
  };
}

function resultQueueRow(showNo, focusDay, row) {
  const classNo = text(row.class_no);
  const classNumber = text(row.class_number);
  const key = resultKey(showNo, focusDay, classNo || classNumber);
  if (!key || !classNo && !classNumber) return null;
  return {
    result_queue_key: key,
    show_no: showNo,
    focus_day: focusDay,
    class_no: classNo,
    sect_no: text(row.sect_no),
    class_number: classNumber,
    class_name: text(row.class_name),
    status: row.status || "completed",
    queued_at: row.queued_at,
    next_check_at: row.next_check_at,
    last_checked_at: row.last_checked_at,
    attempts: intOrNull(row.attempts) || 1,
    result_rows: intOrNull(row.result_entry_count || row.entry_count),
    completed_at: row.completed_at,
    source: row.source || "horseshowing.results",
    raw_json: resultRawJson(row)
  };
}

async function upsertResultRows(app, tableName, keyField, rows) {
  const counters = { rows: rows.length, inserted: 0, updated: 0, skipped: 0 };
  for (const row of rows) {
    if (!row?.[keyField]) {
      counters.skipped += 1;
      continue;
    }
    const result = await upsert(app, tableName, { [keyField]: row[keyField] }, row);
    if (result.action === "insert") counters.inserted += 1;
    if (result.action === "update") counters.updated += 1;
  }
  return counters;
}

async function importResults(app, showNo, focusDay, classes, results) {
  const classRows = (classes || []).map((row) => resultClassRow(showNo, focusDay, row)).filter(Boolean);
  const queueRows = (classes || []).map((row) => resultQueueRow(showNo, focusDay, row)).filter(Boolean);
  const resultRows = (results || []).map((row) => classResultRow(showNo, focusDay, row)).filter(Boolean);
  return {
    result_queue: await upsertResultRows(app, TABLES.resultQueue, "result_queue_key", queueRows),
    result_classes: await upsertResultRows(app, TABLES.resultClasses, "result_class_key", classRows),
    class_results: await upsertResultRows(app, TABLES.classResults, "class_result_key", resultRows)
  };
}

async function importResultClassesOnly(app, showNo, focusDay, classes) {
  const classRows = (classes || []).map((row) => resultClassSourceRow(showNo, row)).filter(Boolean);
  return {
    result_classes: await upsertResultRows(app, TABLES.resultClasses, "result_class_key", classRows)
  };
}

async function ensureShow(app, showNo, patch = {}) {
  const result = await upsert(app, TABLES.shows, { show_no: showNo }, {
    provider: "horseshowing",
    show_no: showNo,
    status: "active",
    source_url: `https://www.horseshowing.com/show.php?show=${showNo}`,
    ...patch
  });
  return result.row;
}

async function ensureFocusShow(app, showNo, focusDay, patch = {}) {
  const focusShowKey = `horseshowing|${showNo}`;
  const result = await upsert(app, TABLES.focusShow, { focus_show_key: focusShowKey }, {
    focus_show_key: focusShowKey,
    show_no: showNo,
    focus_day: focusDay,
    ...patch
  });
  return result.row;
}

async function updateCatalystHsFocusShowLiveEmpty(app, showNo, focusDay, lastLiveEmptyAt) {
  const safeFocusDay = dateKey(focusDay);
  const focusDayKey = safeFocusDay ? safeFocusDay.replace(/-/g, "") : "";
  const focusShowKey = `${text(showNo)}|${focusDayKey}`;
  const result = await upsert(app, TABLES.focusShow, { focus_show_key: focusShowKey }, {
    focus_show_key: focusShowKey,
    show_no: intValue(showNo),
    focus_day: safeFocusDay,
    iso_date: safeFocusDay,
    last_live_empty_at: lastLiveEmptyAt
  });
  return {
    updated: true,
    action: result.action,
    focus_show_key: focusShowKey
  };
}

async function getFocusSchedule(app, showNo, focusDay, { limit = 200, offset = 0 } = {}) {
  const query = [
    "SELECT *",
    `FROM ${TABLES.classStartTimes}`,
    `WHERE show_no = ${zcqlValue(showNo)} AND focus_day = ${zcqlValue(focusDay)}`,
    `LIMIT ${limit} OFFSET ${offset}`
  ].join(" ");
  const result = await app.zcql().executeZCQLQuery(query);
  return (result || [])
    .map((item) => item?.[TABLES.classStartTimes])
    .filter(Boolean)
    .sort((a, b) => (
      String(a.class_start_time || "99:99:99").localeCompare(String(b.class_start_time || "99:99:99")) ||
      String(a.ring_name || "").localeCompare(String(b.ring_name || "")) ||
      Number(a.class_no || 0) - Number(b.class_no || 0)
    ));
}

function stagingRecordMatchesFocus(record, showNo, focusDay) {
  const fields = record.fields || {};
  const rowShowNo = fieldText(fields, ["show_no"]);
  const rowFocusDay = dateKey(fieldText(fields, ["focus_day", "iso_date"]));
  return rowShowNo === text(showNo) && rowFocusDay === dateKey(focusDay);
}

function stagingScheduleRowFromRecord(record, showNo, focusDay, source = "update_schedule_staging") {
  const fields = record.fields || {};
  const timeText = fieldText(fields, ["time_text", "display_time", "time"]);
  const classStartTime = normalizeClassStartTime(fieldText(fields, ["class_start_time", "time"]) || timeText);
  const className = fieldText(fields, ["class_name", "event_name", "class_label"]);
  const classLabel = fieldText(fields, ["event_name", "class_label", "class_name"]);
  const classNumber = fieldText(fields, ["class_number"]) || classNumberFromLabel({ class_label: classLabel });
  const showDay = dateKey(fieldText(fields, ["show_day", "focus_day_key", "focus_day", "iso_date"])) || text(focusDay);
  return {
    ROWID: record.id,
    record_id: record.id,
    show_no: fieldText(fields, ["show_no"]) || text(showNo),
    focus_day: dateKey(fieldText(fields, ["focus_day", "iso_date"])) || text(focusDay),
    show_day: showDay,
    focus_day_key: showDay,
    ring_no: fieldText(fields, ["ring_no"]),
    ring_day_no: fieldText(fields, ["ring_day_no", "days"]),
    ring_name: fieldText(fields, ["ring_display", "ring_name", "ring_names", "ring", "rings"]),
    ring_name_prioritized: fieldText(fields, ["ring_name_prioritized"]),
    ring_name_normalized: fieldText(fields, ["ring_name_normalized"]),
    class_no: fieldText(fields, ["class_no"]),
    class_number: classNumber,
    class_name: className,
    class_label: classLabel,
    class_start_time: classStartTime,
    time_text: timeText,
    time_sort: fieldText(fields, ["time_sort"]),
    display_time: fieldText(fields, ["display_time"]) || displayTimeFromStart(classStartTime || timeText),
    class_priority_sort: fieldText(fields, ["class_priority_sort"]),
    class_name_tokens: fieldText(fields, ["class_name_tokens", "fldOCtoXBCbIVcJrM"]),
    this_disciplines: fieldText(fields, ["this_disciplines"]),
    this_skills: fieldText(fields, ["this_skills"]),
    this_ages: fieldText(fields, ["this_ages"]),
    this_levels: fieldText(fields, ["this_levels"]),
    this_sizes: fieldText(fields, ["this_sizes"]),
    this_heights: fieldText(fields, ["this_heights"]),
    is_2nd_trip: boolOrNull(fields.is_2nd_trip) ?? boolOrNull(fields["2nd_trip"]) ?? false,
    is_medal: boolOrNull(fields.is_medal) ?? false,
    is_under_saddle: boolOrNull(fields.is_under_saddle) ?? false,
    is_hunter_classic: boolOrNull(fields.is_hunter_classic) ?? false,
    is_jumper_classic: boolOrNull(fields.is_jumper_classic) ?? false,
    live_flag: fieldText(fields, ["live_flag"]),
    entry_count: intOrNull(fields.entry_count),
    inactive: fields.inactive === true,
    manual_group: fieldText(fields, ["manual_grpup", "manual_group"]),
    manual_horse_ids: linkedRecordIds(fields.horses),
    manual_instructions: fieldText(fields, ["manual-instructions", "manual_instructions", "manual instructions"]),
    source,
    live_source: source
  };
}

async function getAllStagingScheduleRows(showNo, focusDay) {
  const showValue = Number.isFinite(Number(showNo)) ? String(Number(showNo)) : airtableFormulaValue(showNo);
  const records = await airtableListRecords("update_schedule_staging", {
    filterByFormula: `AND({show_no}=${showValue},IS_SAME({iso_date},DATETIME_PARSE(${airtableFormulaValue(focusDay)}),'day'))`
  });
  return records
    .map((record) => stagingScheduleRowFromRecord(record, showNo, focusDay, "update_schedule_staging"))
    .filter((row) => !row.inactive && intOrNull(row.class_no) > 0 && !isManualRemoveInstruction(row.manual_instructions))
    .sort((a, b) => (
      Number(a.ring_no || 9999) - Number(b.ring_no || 9999) ||
      Number(a.ring_day_no || 999999) - Number(b.ring_day_no || 999999) ||
      Number(scheduleSortValue(a.class_start_time, a.class_number)) - Number(scheduleSortValue(b.class_start_time, b.class_number)) ||
      Number(a.class_no || 0) - Number(b.class_no || 0)
    ));
}

async function getStoredRingDayRows(app, showNo, focusDay) {
  const query = [
    "SELECT ROWID, show_no, ring_no, ring_day_no, ring_name, day_label, raw_json",
    `FROM ${TABLES.rings}`,
    `WHERE show_no = ${zcqlValue(showNo)} AND ring_day_no IS NOT NULL`,
    "LIMIT 300"
  ].join(" ");
  return (await app.zcql().executeZCQLQuery(query) || [])
    .map((item) => item?.[TABLES.rings])
    .filter(Boolean)
    .map((row) => ({
      show_no: text(row.show_no || showNo),
      ring_no: text(row.ring_no),
      ring_day_no: text(row.ring_day_no),
      ring_name: text(row.ring_name),
      day_label: text(row.day_label),
      raw_json: row.raw_json
    }))
    .filter((row) => dateKey(row.day_label) === focusDay)
    .sort((a, b) => `${a.ring_no}|${a.ring_day_no}`.localeCompare(`${b.ring_no}|${b.ring_day_no}`));
}

async function countStoredRingDayRows(app, showNo, focusDay = "") {
  const rows = focusDay
    ? await getStoredRingDayRows(app, showNo, dateKey(focusDay))
    : await getStoredAllRingDayRows(app, showNo);
  return rows.length;
}

async function getStoredAllRingDayRows(app, showNo) {
  const query = [
    "SELECT ROWID, show_no, ring_no, ring_day_no, ring_name, day_label, raw_json",
    `FROM ${TABLES.rings}`,
    `WHERE show_no = ${zcqlValue(showNo)} AND ring_day_no IS NOT NULL`,
    "LIMIT 300"
  ].join(" ");
  return (await app.zcql().executeZCQLQuery(query) || [])
    .map((item) => item?.[TABLES.rings])
    .filter(Boolean)
    .map((row) => ({
      show_no: text(row.show_no || showNo),
      ring_no: text(row.ring_no),
      ring_day_no: text(row.ring_day_no),
      ring_name: text(row.ring_name),
      day_label: text(row.day_label),
      raw_json: row.raw_json
    }))
    .sort((a, b) => `${a.ring_no}|${a.ring_day_no}`.localeCompare(`${b.ring_no}|${b.ring_day_no}`));
}

async function getAirtableGetRingDayRows(showNo) {
  const records = await airtableListRecords("get_ring_days", {
    filterByFormula: `{show_no}=${Number(showNo)}`
  });
  return records
    .map((record) => {
      const fields = record.fields || {};
      return {
        show_no: text(fields.show_no || showNo),
        ring_no: text(fields.ring_no),
        ring_day_no: text(fields.ring_day_no),
        ring_name: text(fields.ring_name),
        day_label: text(fields.date_text || fields.ISO || fields.dow),
        date_text: text(fields.date_text),
        iso_date: text(fields.ISO),
        dow: text(fields.dow),
        airtable_get_ring_days_record_id: record.id
      };
    })
    .filter((row) => text(row.ring_day_no) && text(row.ring_no))
    .sort((a, b) => (
      String(a.iso_date || a.day_label || "").localeCompare(String(b.iso_date || b.day_label || "")) ||
      String(a.ring_no || "").localeCompare(String(b.ring_no || "")) ||
      String(a.ring_day_no || "").localeCompare(String(b.ring_day_no || ""))
    ));
}

async function getClassesForSchedule(app, showNo, classNos) {
  const wanted = [...new Set(classNos.filter(Boolean).map(String))].slice(0, 250);
  if (!wanted.length) return new Map();
  const where = wanted.map((classNo) => `class_no = ${zcqlValue(classNo)}`).join(" OR ");
  const query = [
    "SELECT ROWID, show_no, class_no, class_label, class_name, entry_count",
    `FROM ${TABLES.classes}`,
    `WHERE show_no = ${zcqlValue(showNo)} AND (${where})`,
    "LIMIT 250"
  ].join(" ");
  const rows = (await app.zcql().executeZCQLQuery(query) || [])
    .map((item) => item?.[TABLES.classes])
    .filter(Boolean);
  return new Map(rows.map((row) => [String(row.class_no), row]));
}

async function getFocusClassLookup(app, showNo, focusDay) {
  if (!focusDay) {
    return {
      classNos: new Set(),
      byRingDayAndName: new Map(),
      byRingDayRingClassNumber: new Map(),
      byClassNo: new Map()
    };
  }
  const updateScheduleQuery = [
    "SELECT ROWID, show_no, iso_date, focus_day, ring_day_no, ring_no, ring_name, ring_name_normalized, ring_visual_key, class_visual_key, class_no, class_number, class_name, event_name, entry_count, live_flag",
    `FROM ${TABLES.updateSchedule}`,
    `WHERE show_no = ${zcqlValue(showNo)} AND iso_date = ${zcqlValue(focusDay)}`,
    "LIMIT 300"
  ].join(" ");
  const schedule = (await app.zcql().executeZCQLQuery(updateScheduleQuery) || [])
    .map((item) => item?.[TABLES.updateSchedule])
    .filter(Boolean)
    .filter((row) => intOrNull(row.class_no) > 0);
  const classNos = new Set(schedule.map((row) => String(row.class_no || "")).filter(Boolean));
  const classesByNo = await getClassesForSchedule(app, showNo, [...classNos]);
  const byRingDayAndName = new Map();
  const byRingDayRingClassNumber = new Map();
  const byClassNo = new Map();
  for (const row of schedule) {
    const classNo = String(row.class_no || "");
    if (!classNo) continue;
    byClassNo.set(classNo, row);
    const classNumber = intValue(row.class_number);
    if (classNumber) {
      byRingDayRingClassNumber.set(`${text(row.ring_day_no)}|${text(row.ring_no)}|${classNumber}`, row);
    }
    const classRow = classesByNo.get(classNo) || {};
    const names = [
      classRow.class_label,
      classRow.class_name,
      row.class_name,
      row.event_name,
      classDisplayFromLabel(classRow, row.class_name)
    ].map(classNameKey).filter(Boolean);
    for (const name of [...new Set(names)]) {
      byRingDayAndName.set(`${text(row.ring_day_no)}|${name}`, row);
      byRingDayAndName.set(`${text(row.ring_no)}|${name}`, row);
      byRingDayAndName.set(`|${name}`, row);
    }
  }
  return { classNos, byRingDayAndName, byRingDayRingClassNumber, byClassNo };
}

async function applyFocusScopeToCurrentRows(app, showNo, focusDay, rows, source) {
  const lookup = await getFocusClassLookup(app, showNo, focusDay);
  const scoped = [];
  const hasFocusClassScope = lookup.classNos.size > 0;
  for (const row of rows) {
    let classNo = text(row.class_no);
    let scheduleRow = classNo ? lookup.byClassNo.get(classNo) : null;
    if (!classNo && source === "orders") {
      const classNumber = intValue(row.class_number || classPartsFromLabel(row.class_label || row.class_name).classNumber);
      if (classNumber) {
        scheduleRow = lookup.byRingDayRingClassNumber.get(`${text(row.ring_day_no)}|${text(row.ring_no)}|${classNumber}`) || null;
      }
      const name = classNameKey(row.class_label || row.class_name);
      scheduleRow = scheduleRow
        || lookup.byRingDayAndName.get(`${text(row.ring_day_no)}|${name}`)
        || lookup.byRingDayAndName.get(`${text(row.ring_no)}|${name}`)
        || lookup.byRingDayAndName.get(`|${name}`)
        || null;
      classNo = text(scheduleRow?.class_no);
    }
    const ringNameNormalized = visualRingName(scheduleRow?.ring_name_normalized || row.ring_name_normalized || normalizedWecRingName(scheduleRow?.ring_name || row.ring_name));
    const next = classNo ? {
      ...row,
      class_no: classNo,
      ring_name_normalized: ringNameNormalized,
      ring_visual_key: text(scheduleRow?.ring_visual_key) || ringVisualKey(row.ring_no, ringNameNormalized),
      class_visual_key: text(scheduleRow?.class_visual_key) || classVisualKey(ringNameNormalized, classNo)
    } : row;
    if (hasFocusClassScope && next.class_no && !lookup.classNos.has(String(next.class_no))) continue;
    scoped.push(next);
  }
  return {
    rows: scoped,
    focus_class_scope: hasFocusClassScope ? lookup.classNos.size : 0,
    class_no_resolved: scoped.filter((row) => text(row.class_no)).length
  };
}

async function getClassRowsForShow(app, showNo, { limit = 300, offset = 0 } = {}) {
  const query = [
    "SELECT ROWID, show_no, class_no, class_label, class_name, entry_count",
    `FROM ${TABLES.classes}`,
    `WHERE show_no = ${zcqlValue(showNo)} AND class_no IS NOT NULL`,
    `LIMIT ${limit} OFFSET ${offset}`
  ].join(" ");
  return (await app.zcql().executeZCQLQuery(query) || [])
    .map((item) => item?.[TABLES.classes])
    .filter(Boolean);
}

async function getEntriesForSchedule(app, showNo, classNos, activeTrainers) {
  const wanted = [...new Set(classNos.filter(Boolean).map(String))].slice(0, 250);
  if (!wanted.length || !activeTrainers.length) return new Map();
  const activeTrainerSet = new Set(activeTrainers.map((trainer) => text(trainer)).filter(Boolean));
  const classWhere = wanted.map((classNo) => `class_no = ${zcqlValue(classNo)}`).join(" OR ");
  const trainerWhere = activeTrainers.map((trainer) => `trainer = ${zcqlValue(trainer)}`).join(" OR ");
  const query = [
    "SELECT ROWID, show_no, class_no, entry_no, entry_order, horse, rider, trainer",
    `FROM ${TABLES.entries}`,
    `WHERE show_no = ${zcqlValue(showNo)} AND (${classWhere}) AND (${trainerWhere})`,
    "LIMIT 300"
  ].join(" ");
  const rows = (await app.zcql().executeZCQLQuery(query) || [])
    .map((item) => item?.[TABLES.entries])
    .filter(Boolean)
    .sort((a, b) => Number(a.entry_order || 9999) - Number(b.entry_order || 9999));
  const fallbackRows = rows.length
    ? rows
    : (await getEntriesForClasses(app, showNo, wanted))
      .filter((row) => activeTrainerSet.has(text(row.trainer)));
  const byClass = new Map();
  for (const row of fallbackRows) {
    const key = String(row.class_no || "");
    const bucket = byClass.get(key) || [];
    bucket.push(row);
    byClass.set(key, bucket);
  }
  return byClass;
}

function entryGoTimesByClassFromRecords(records, activeTrainers = []) {
  const activeTrainerSet = new Set(activeTrainers.map((trainer) => text(trainer)).filter(Boolean));
  const byClass = new Map();
  for (const record of records || []) {
    const fields = record.fields || record;
    if (text(fields.status).toLowerCase() === "inactive") continue;
    const classNo = text(fields.class_no);
    const ringDayNo = text(fields.ring_day_no || fields.days);
    const ringNo = text(fields.ring_no);
    const trainer = text(fields.trainer);
    if (!classNo || !ringDayNo) continue;
    if (activeTrainerSet.size && !activeTrainerSet.has(trainer)) continue;
    const classKey = `${ringDayNo}|${classNo}`;
    const bucket = byClass.get(classKey) || [];
    const entryGoTime = text(fields.entry_go_time);
    bucket.push({
      show_no: text(fields.show_no),
      ring_day_no: ringDayNo,
      ring_no: ringNo,
      class_no: classNo,
      entry_no: text(fields.entry_no),
      entry_order: text(fields.entry_order),
      horse: text(fields.horse),
      rider: text(fields.rider),
      trainer,
      entry_rollup: text(fields.entry_rollup),
      rider_display: fieldText(fields, ["rider_display (from riders)", "rider_display", "rider"]),
      trainer_display: fieldText(fields, ["trainer_display", "trainer"]),
      entry_go_time: entryGoTime,
      class_start_time: text(fields.class_start_time),
      time_till: text(fields.time_till),
      go_time: entryGoTime
    });
    byClass.set(classKey, bucket);
  }
  for (const bucket of byClass.values()) {
    bucket.sort((a, b) => Number(a.entry_order || 9999) - Number(b.entry_order || 9999));
  }
  return byClass;
}

async function getAirtableEntryGoTimesForSchedule(showNo, focusDay, classNos, activeTrainers = []) {
  if (process.env.NODE_ENV === "test") return new Map();
  if (!AIRTABLE_TOKEN_FALLBACK) return new Map();
  const wanted = new Set([...new Set(classNos.filter(Boolean).map(String))].slice(0, 250));
  if (!wanted.size) return new Map();
  try {
    const showValue = Number.isFinite(Number(showNo)) ? String(Number(showNo)) : `'${String(showNo).replace(/'/g, "\\'")}'`;
    const records = await airtableListRecords("entry_go_times", {
      filterByFormula: `AND({show_no}=${showValue},IS_SAME({focus_day},'${String(focusDay).replace(/'/g, "\\'")}','day'))`
    });
    const byClass = entryGoTimesByClassFromRecords(
      records.filter((record) =>
        wanted.has(text(record.fields?.class_no)) &&
        text(record.fields?.status).toLowerCase() !== "inactive"
      ),
      activeTrainers
    );
    byClass.sourceFetched = true;
    return byClass;
  } catch {
    return new Map();
  }
}

async function getAirtableClassStartTimesForSchedule(showNo, focusDay, classNos) {
  if (process.env.NODE_ENV === "test") return new Map();
  if (!AIRTABLE_TOKEN_FALLBACK) return new Map();
  const wanted = new Set([...new Set(classNos.filter(Boolean).map(String))].slice(0, 250));
  if (!wanted.size) return new Map();
  try {
    const showValue = Number.isFinite(Number(showNo)) ? String(Number(showNo)) : `'${String(showNo).replace(/'/g, "\\'")}'`;
    const records = await airtableListRecords("class_start_times", {
      filterByFormula: `AND({show_no}=${showValue},IS_SAME({focus_day},'${String(focusDay).replace(/'/g, "\\'")}','day'))`
    });
    const byClass = new Map();
    for (const record of records || []) {
      const fields = record.fields || {};
      const classNo = text(fields.class_no);
      if (!wanted.has(classNo)) continue;
      const row = {
        show_no: text(fields.show_no),
        focus_day: dateKey(fields.focus_day),
        ring_day_no: text(fields.ring_day_no),
        ring_no: text(fields.ring_no),
        ring_name: text(fields.ring_name || (Array.isArray(fields["ring_name (from rings)"]) ? fields["ring_name (from rings)"][0] : "")),
        class_no: classNo,
        class_name: text(fields.class_name),
        class_start_time: text(fields.class_start_time || fields.time),
        display_time: text(fields.display_time),
        entry_count: intOrNull(fields.entry_count),
        n_gone: intOrNull(fields.n_gone),
        n_to_go: intOrNull(fields.n_to_go),
        elapsed_seconds: intOrNull(fields.elapsed_seconds),
        pace_seconds: intOrNull(fields.pace_seconds),
        current_entry_no: text(fields.current_entry_no),
        current_horse: text(fields.current_horse),
        rollup_label: text(fields.rollup_label),
        entry_go_times_rollup: fields["Rollup (from entry_go_times)"] || fields.entry_go_times_rollup || "",
        live_source: text(fields.live_source || fields.source)
      };
      const ringClassKey = `${row.ring_day_no}|${classNo}`;
      if (row.ring_day_no) byClass.set(ringClassKey, row);
    }
    return byClass;
  } catch {
    return new Map();
  }
}

function normalizeClassStartTime(value) {
  const raw = text(value);
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(raw)) {
    const [hour, minute, second = "00"] = raw.split(":");
    return `${String(Number(hour)).padStart(2, "0")}:${minute}:${second}`;
  }
  return classStartTimeFromText(raw);
}

async function getLockedStagingSchedule(app, showNo, focusDay, { limit = 300, offset = 0 } = {}) {
  if (process.env.NODE_ENV === "test") {
    const query = [
      "SELECT ROWID, show_no, focus_day, ring_no, ring_name, ring_day_no, class_no, class_name, class_start_time, entry_count",
      `FROM ${TABLES.classStartTimes}`,
      `WHERE show_no = ${zcqlValue(showNo)} AND focus_day = ${zcqlValue(focusDay)}`,
      "LIMIT 300"
    ].join(" ");
    const testRows = (await app.zcql().executeZCQLQuery(query) || [])
      .map((item) => item?.[TABLES.classStartTimes])
      .filter(Boolean)
      .map((row) => ({
        ROWID: row.ROWID,
        record_id: row.ROWID,
        show_no: text(row.show_no) || text(showNo),
        focus_day: dateKey(row.focus_day) || text(focusDay),
        ring_no: text(row.ring_no),
        ring_day_no: text(row.ring_day_no),
        ring_name: text(row.ring_name),
        class_no: text(row.class_no),
        class_number: "",
        class_name: text(row.class_name),
        class_label: text(row.class_name),
        class_start_time: normalizeClassStartTime(row.class_start_time),
        display_time: displayTimeFromStart(row.class_start_time),
        entry_count: intOrNull(row.entry_count),
        n_gone: intOrNull(row.n_gone),
        n_to_go: intOrNull(row.n_to_go),
        elapsed_seconds: intOrNull(row.elapsed_seconds),
        current_entry_no: text(row.current_entry_no),
        current_horse: text(row.current_horse),
        group_display: text(row.group_display),
        sched_display: text(row.sched_display),
        trainer_rollups: row.trainer_rollups,
        manual_group: "",
        manual_horse_ids: [],
        manual_instructions: "",
        source: "test.hs_class_start_times",
        live_source: text(row.live_source) || "test.hs_class_start_times"
      }))
      .filter((row) => intOrNull(row.class_no) > 0);
    const start = Math.max(0, Number(offset || 0));
    const end = start + Math.max(1, Number(limit || testRows.length));
    return testRows.slice(start, end);
  }

  const records = await airtableListRecords("update_schedule_staging", {
    view: AIRTABLE_UPDATE_SCHEDULE_STAGING_MOBILE_VIEW
  });
  const rows = records
    .filter((record) => stagingRecordMatchesFocus(record, showNo, focusDay))
    .map((record) => stagingScheduleRowFromRecord(record, showNo, focusDay, `update_schedule_staging.${AIRTABLE_UPDATE_SCHEDULE_STAGING_MOBILE_VIEW}`))
    .sort((a, b) => (
      Number(a.ring_no || 9999) - Number(b.ring_no || 9999) ||
      Number(a.ring_day_no || 999999) - Number(b.ring_day_no || 999999) ||
      Number(scheduleSortValue(a.class_start_time, a.class_number)) - Number(scheduleSortValue(b.class_start_time, b.class_number)) ||
      Number(a.class_no || 0) - Number(b.class_no || 0)
    ));
  const start = Math.max(0, Number(offset || 0));
  const end = start + Math.max(1, Number(limit || rows.length));
  return rows.slice(start, end);
}

function entryGoKey(showNo, focusDay, entry) {
  const ringDayNo = text(entry.ring_day_no || entry.days);
  const ringNo = text(entry.ring_no);
  const classNo = text(entry.class_no);
  const entryNo = text(entry.entry_no);
  if (entryNo) return `${showNo}|${focusDay}|${ringDayNo}|${ringNo}|${classNo}|${entryNo}`;
  return `${showNo}|${focusDay}|${ringDayNo}|${ringNo}|${classNo}|${text(entry.entry_order)}|${text(entry.horse).toLowerCase()}`;
}

function entryGoContext(row) {
  const parts = text(row.entry_go_key).split("|");
  let ringDayNo = text(row.ring_day_no || row.days);
  let ringNo = text(row.ring_no);
  let classNo = text(row.class_no);
  if (parts.length >= 6) {
    ringDayNo = ringDayNo || text(parts[2]);
    ringNo = ringNo || text(parts[3]);
    classNo = classNo || text(parts[4]);
  } else if (!ringDayNo && parts.length >= 5) {
    ringDayNo = text(parts[2]);
    classNo = classNo || text(parts[3]);
  }
  return { ringDayNo, ringNo, classNo };
}

async function getCatalystEntryGoTimesForSchedule(app, showNo, focusDay, classNos, activeTrainers = []) {
  const wanted = [...new Set(classNos.filter(Boolean).map(String))].slice(0, 250);
  if (!wanted.length) return new Map();
  const activeTrainerSet = new Set(activeTrainers.map((trainer) => text(trainer)).filter(Boolean));
  const classWhere = wanted.map((classNo) => `class_no = ${zcqlValue(classNo)}`).join(" OR ");
  const query = [
    "SELECT ROWID, entry_go_key, show_no, focus_day, class_no, entry_no, entry_order, horse, rider, trainer, go_time, pace_seconds, live_source, last_live_synced_at",
    `FROM ${TABLES.entryGoTimes}`,
    `WHERE show_no = ${zcqlValue(showNo)} AND focus_day = ${zcqlValue(focusDay)} AND (${classWhere})`,
    "LIMIT 300"
  ].join(" ");
  const rows = (await app.zcql().executeZCQLQuery(query) || [])
    .map((item) => item?.[TABLES.entryGoTimes])
    .filter(Boolean);
  const byClass = new Map();
  for (const row of rows) {
    const trainer = text(row.trainer);
    if (activeTrainerSet.size && !activeTrainerSet.has(trainer)) continue;
    const { ringDayNo, ringNo, classNo } = entryGoContext(row);
    if (!ringDayNo || !classNo) continue;
    const classKey = `${ringDayNo}|${classNo}`;
    const bucket = byClass.get(classKey) || [];
    bucket.push({
      show_no: text(row.show_no),
      ring_day_no: ringDayNo,
      ring_no: ringNo,
      class_no: classNo,
      entry_no: text(row.entry_no),
      entry_order: text(row.entry_order),
      horse: text(row.horse),
      rider: text(row.rider),
      trainer,
      entry_rollup: text(row.entry_rollup),
      rider_display: text(row.rider_display || row.rider),
      trainer_display: text(row.trainer_display || row.trainer),
      entry_go_time: text(row.go_time),
      class_start_time: text(row.class_start_time),
      time_till: text(row.time_till),
      go_time: text(row.go_time),
      pace_seconds: text(row.pace_seconds),
      live_source: text(row.live_source),
      last_live_synced_at: text(row.last_live_synced_at)
    });
    byClass.set(classKey, bucket);
  }
  for (const bucket of byClass.values()) {
    bucket.sort((a, b) => Number(a.entry_order || 9999) - Number(b.entry_order || 9999));
  }
  return byClass;
}

async function reconcileEntryGoTimesToCatalyst(app, showNo, focusDay, meta, classNos = []) {
  if (process.env.NODE_ENV === "test") return { rows: 0, updated: 0, skipped: 0 };
  const wantedClassNos = new Set([...new Set(classNos.filter(Boolean).map(String))].slice(0, 250));
  const entryGoTimesByClass = await getAirtableEntryGoTimesForSchedule(showNo, focusDay, classNos, meta.activeTrainers);
  if (!entryGoTimesByClass.size && entryGoTimesByClass.sourceFetched !== true) return { rows: 0, updated: 0, skipped: 0, deleted: 0 };

  const table = app.datastore().table(TABLES.entryGoTimes);
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const activeKeys = new Set();
  for (const entries of entryGoTimesByClass.values()) {
    for (const entry of entries) {
      const key = entryGoKey(showNo, focusDay, entry);
      activeKeys.add(key);
      const classNo = entry.class_no;
      const result = await upsert(app, TABLES.entryGoTimes, { entry_go_key: key }, {
        entry_go_key: key,
        show_no: showNo,
        focus_day: focusDay,
        class_no: classNo,
        entry_no: entry.entry_no,
        entry_order: entry.entry_order,
        horse: entry.horse,
        rider: entry.rider,
        trainer: entry.trainer,
        go_time: entry.go_time
      });
      if (result.action === "insert") inserted += 1;
      else updated += 1;
    }
  }
  const existingRows = wantedClassNos.size
    ? await getRowsByShow(app, TABLES.entryGoTimes, showNo, { limit: 5000 })
    : [];
  const staleIds = existingRows
    .filter((row) =>
      dateKey(row.focus_day) === text(focusDay) &&
      wantedClassNos.has(text(row.class_no)) &&
      !activeKeys.has(text(row.entry_go_key) || entryGoKey(showNo, focusDay, row))
    )
    .map((row) => row.ROWID)
    .filter(Boolean);
  let deleted = 0;
  for (let index = 0; index < staleIds.length; index += 100) {
    const batch = staleIds.slice(index, index + 100);
    if (batch.length) {
      await table.deleteRows(batch);
      deleted += batch.length;
    }
  }
  return { rows: [...entryGoTimesByClass.values()].reduce((sum, rows) => sum + rows.length, 0), classes: entryGoTimesByClass.size, inserted, updated, skipped, deleted };
}

async function getEntriesForClasses(app, showNo, classNos) {
  const wanted = [...new Set(classNos.filter(Boolean).map(String))].slice(0, 250);
  if (!wanted.length) return [];
  const classWhere = wanted.map((classNo) => `class_no = ${zcqlValue(classNo)}`).join(" OR ");
  const rows = [];
  for (let offset = 0; ; offset += 300) {
    const query = [
      "SELECT ROWID, show_no, class_no, entry_no, entry_order, horse, rider, trainer, entry_source, order_status",
      `FROM ${TABLES.entries}`,
      `WHERE show_no = ${zcqlValue(showNo)} AND (${classWhere})`,
      `LIMIT 300 OFFSET ${offset}`
    ].join(" ");
    const page = (await app.zcql().executeZCQLQuery(query) || [])
      .map((item) => item?.[TABLES.entries])
      .filter(Boolean);
    rows.push(...page);
    if (page.length < 300) break;
  }
  return rows.sort((a, b) => (
    Number(a.class_no || 0) - Number(b.class_no || 0) ||
    Number(a.entry_order || 9999) - Number(b.entry_order || 9999)
  ));
}

async function getLiveStatusForSchedule(app, showNo, schedule) {
  const wanted = [...new Set((schedule || []).map((row) => String(row.class_no || "")).filter(Boolean))].slice(0, 250);
  if (!wanted.length) return new Map();
  const classWhere = wanted.map((classNo) => `class_no = ${zcqlValue(classNo)}`).join(" OR ");
  const query = [
    "SELECT ROWID, show_no, ring_day_no, class_no, class_time_text, entry_count, entries_gone, entries_to_go, current_entry_no, current_horse, elapsed_seconds, source_endpoint",
    `FROM ${TABLES.classTimes}`,
    `WHERE show_no = ${zcqlValue(showNo)} AND (${classWhere})`,
    "LIMIT 300"
  ].join(" ");
  const allowedKeys = new Set((schedule || []).map((row) => `${text(row.ring_day_no)}|${text(row.class_no)}`));
  const rows = (await app.zcql().executeZCQLQuery(query) || [])
    .map((item) => item?.[TABLES.classTimes])
    .filter((row) => row && allowedKeys.has(`${text(row.ring_day_no)}|${text(row.class_no)}`));
  const byClass = new Map();
  for (const row of rows) {
    const key = String(row.class_no || "");
    const existing = byClass.get(key);
    const rowId = Number(row.ROWID || 0);
    const existingId = Number(existing?.ROWID || 0);
    if (!existing || rowId >= existingId) byClass.set(key, row);
  }
  return byClass;
}

function displayTimeFromStart(value) {
  const raw = text(value);
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return raw || "check time";
  let hour = Number(match[1]);
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${match[2]} ${suffix}`;
}

function classStartTimeFromText(value) {
  const raw = text(value).toUpperCase().replace(/\s+/g, "");
  if (!raw || raw === "CHECKTIME") return "";
  const hhmmss = raw.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hhmmss) {
    const hour = Number(hhmmss[1]);
    const minute = Number(hhmmss[2]);
    const second = Number(hhmmss[3]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return "";
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
  }
  const match = raw.match(/^(\d{1,2})(?::?(\d{2}))?(AM|PM|A|P)?$/);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const suffix = match[3] || "";
  if (suffix.startsWith("P") && hour < 12) hour += 12;
  if (suffix.startsWith("A") && hour === 12) hour = 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function classNumberFromLabel(row) {
  const label = text(row?.class_label || row?.class_name);
  const match = label.match(/^([A-Za-z0-9]+)\)/);
  return match?.[1] || "";
}

function classDisplayFromLabel(row, fallbackName) {
  const label = text(row?.class_label);
  if (!label) return text(row?.class_name || fallbackName);
  const match = label.match(/^[A-Za-z0-9]+\)\s*(.*)$/);
  return text(match?.[1] || label);
}

function classNameKey(value) {
  return text(value)
    .toLowerCase()
    .replace(/^\d+\)\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ringDisplayFromName(ringName) {
  const value = text(ringName).toUpperCase();
  if (!value) return "";
  if (value.includes("GRAND")) return "GRAND";
  if (value.includes("JUMPER ANNEX") || value.includes("ANNEX")) return "ANNEX";
  if (value.includes("HUNTER 2")) return "HUNTER_2";
  const indoor = value.match(/INDOOR\s*([1-6])/);
  if (indoor) return `INDOOR_${indoor[1]}`;
  return text(ringName);
}

function ringDisplayFromNormalizedName(ringNameNormalized) {
  const value = visualRingName(ringNameNormalized);
  if (!value) return "";
  if (value === "grand") return "Grand";
  if (value === "annex") return "Annex";
  if (value === "stadium") return "Stadium";
  if (value === "hunter 2") return "Hunter 2";
  const indoor = value.match(/^indoor\s*([1-6])$/);
  if (indoor) return `Indoor ${indoor[1]}`;
  return value
    .split(" ")
    .map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : "")
    .join(" ");
}

function scheduleSortValue(startTime, classNumber) {
  const parts = text(startTime).split(":").map((part) => Number(part));
  const seconds = Number.isFinite(parts[0]) ? (parts[0] * 3600) + ((parts[1] || 0) * 60) + (parts[2] || 0) : 999999;
  const klass = Number(classNumber);
  return (seconds * 10000) + (Number.isFinite(klass) ? klass : 0);
}

function dedupeFocusScheduleRows(rows) {
  const byClass = new Map();
  for (const row of rows || []) {
    const key = `${text(row.ring_day_no)}|${text(row.class_no || row.class_name)}`;
    const existing = byClass.get(key);
    if (!existing) {
      byClass.set(key, row);
      continue;
    }
    const rowId = Number(row.ROWID || 0);
    const existingId = Number(existing.ROWID || 0);
    if ((row.class_start_time && !existing.class_start_time) || rowId >= existingId) {
      byClass.set(key, row);
    }
  }
  return [...byClass.values()];
}

function mergeUniqueList(existing, next, delimiter) {
  const seen = new Set();
  const values = [];
  for (const raw of [existing, next]) {
    for (const part of text(raw).split(delimiter).map(text).filter(Boolean)) {
      const key = part.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      values.push(part);
    }
  }
  return values.join(delimiter === "|" ? "|" : `${delimiter} `);
}

function metaForRequest(showNo, query, body, config = {}) {
  const defaults = DEFAULT_SHOW_META[showNo] || {};
  const activeTrainerText = query.get("active_trainers") || body.active_trainers || "";
  const hideClassText = query.get("hide_classes") || body.hide_classes || (defaults.hide_classes || []).join("|");
  const configuredTitle = text(config.show_name);
  const usableConfiguredTitle = configuredTitle && !configuredTitle.includes("|") ? configuredTitle : "";
  let horseDisplays = {};
  let horseDisplayMeta = {};
  let trainerDisplays = {};
  return {
    title: query.get("show_title") || body.show_title || usableConfiguredTitle || defaults.title || `Show ${showNo}`,
    showStartDate: dateKey(config.start_date),
    showEndDate: dateKey(config.end_date),
    activeTrainers: splitList(activeTrainerText || (defaults.active_trainers || []).join("|")),
    hideClasses: splitList(hideClassText),
    horseDisplays: { ...(defaults.horse_displays || {}), ...horseDisplays },
    horseDisplayMeta: { ...(defaults.horse_display_meta || {}), ...horseDisplayMeta },
    trainerDisplays: { ...(defaults.trainer_displays || {}), ...trainerDisplays },
    ringDisplays: defaults.rings || {}
  };
}

function shouldHideScheduleRow(row, hideClasses) {
  const classNo = text(row.class_no);
  const value = [
    row.class_name,
    row.class_label,
    row.group_group_name
  ].map((item) => text(item).toLowerCase()).filter(Boolean).join(" ");
  return hideClasses.some((rawNeedle) => {
    const needle = text(rawNeedle);
    const lower = needle.toLowerCase();
    if (!lower) return false;
    if (lower.startsWith("class_no:")) {
      const target = text(needle.slice("class_no:".length));
      return target && classNo === target;
    }
    if (lower.startsWith("text:")) {
      const target = text(needle.slice("text:".length)).toLowerCase();
      return target && value.includes(target);
    }
    return value.includes(lower);
  });
}

function horseDisplayName(horse, horseDisplays) {
  const raw = text(horse);
  if (!raw) return "";
  const exact = text(horseDisplays?.[raw]);
  if (exact && exact.toLowerCase() !== raw.toLowerCase()) return exact;
  const normalized = normalizeHorseHelperKey(raw);
  const normalizedDisplay = text(horseDisplays?.[normalized]);
  if (normalizedDisplay && normalizedDisplay.toLowerCase() !== normalized) return normalizedDisplay;
  const key = raw.toLowerCase();
  for (const [name, display] of Object.entries(horseDisplays || {})) {
    const value = text(display);
    if (text(name).toLowerCase() === key && value && value.toLowerCase() !== key) return value;
  }
  if (exact) return exact;
  return raw;
}

function horseDisplayMeta(horse, meta = {}) {
  const raw = text(horse);
  const display = horseDisplayName(raw, meta.horseDisplays || {});
  const explicit = meta.horseDisplayMeta?.[raw] || meta.horseDisplayMeta?.[raw.toLowerCase()] || {};
  const barnName = text(explicit.barn_name);
  return {
    horse: raw,
    display,
    barn_name: barnName,
    barn_name_missing: !barnName
  };
}

function trainerDisplayName(trainer, trainerDisplays) {
  const raw = text(trainer);
  if (!raw) return "";
  const exact = text(trainerDisplays?.[raw]);
  if (exact && exact.toLowerCase() !== raw.toLowerCase()) return exact;
  const key = raw.toLowerCase();
  for (const [name, display] of Object.entries(trainerDisplays || {})) {
    const value = text(display);
    if (text(name).toLowerCase() === key && value && value.toLowerCase() !== key) return value;
  }
  if (exact) return exact;
  return raw;
}

async function getManualHorseDisplaysById(horseRecordIds = []) {
  const ids = [...new Set((horseRecordIds || []).map(text).filter(Boolean))];
  const byId = new Map();
  for (let index = 0; index < ids.length; index += 40) {
    const batch = ids.slice(index, index + 40);
    const clauses = batch.map((id) => `RECORD_ID()=${airtableFormulaValue(id)}`);
    const filterByFormula = clauses.length === 1 ? clauses[0] : `OR(${clauses.join(",")})`;
    const records = await airtableListRecords("horses", { filterByFormula });
    for (const record of records || []) {
      const fields = record.fields || {};
      const horse = text(fields.horse);
      const display = horseDisplayFromFields(fields);
      if (!display) continue;
      byId.set(record.id, {
        horse: horse || display,
        display,
        barn_name: text(fields.barn_name),
        barn_name_missing: !text(fields.barn_name)
      });
    }
  }
  return byId;
}

function manualTrainerRollupsForHorseIds(horseRecordIds = [], horseDisplaysById = new Map(), meta = {}) {
  const horses = [];
  for (const id of linkedRecordIds(horseRecordIds)) {
    const horse = horseDisplaysById.get(id);
    if (!horse?.display) continue;
    horses.push({
      horse: horse.horse,
      display: horse.display,
      label: horse.display,
      entry_order: "",
      barn_name: horse.barn_name,
      barn_name_missing: horse.barn_name_missing
    });
  }
  if (!horses.length) return [];
  const trainer = text((meta.activeTrainers || [])[0]) || "team";
  const trainerDisplay = trainerDisplayName(trainer, meta.trainerDisplays || {}) || "TEAM";
  return [{
    trainer,
    trainer_display: trainerDisplay,
    horses
  }];
}

function normalizedBarnBoardTime(value) {
  const normalized = normalizeClassStartTime(value);
  return text(normalized || value).toLowerCase();
}

function barnBoardClassHintMatches(hint, row) {
  const needle = classNameKey(hint);
  if (!needle) return false;
  const candidates = [
    row.class_name,
    row.class_number,
    row.class_no,
    `${text(row.class_number)} ${text(row.class_name)}`,
    `${text(row.class_number)} - ${text(row.class_name)}`
  ].map(classNameKey).filter(Boolean);
  return candidates.some((candidate) => candidate.includes(needle) || needle.includes(candidate));
}

function barnBoardRingHintMatches(hint, row) {
  const raw = normalizeHelperKey(hint);
  if (!raw) return false;
  const numeric = raw.match(/\d+/)?.[0] || "";
  const candidates = [
    row.ring_no,
    numeric ? row.ring_no : "",
    `ring ${text(row.ring_no)}`,
    `indoor ${text(row.ring_no)}`,
    `indoor_${text(row.ring_no)}`
  ].map(normalizeHelperKey).filter(Boolean);
  return candidates.some((candidate) => candidate === raw || (numeric && candidate === numeric));
}

function barnBoardTimeHintMatches(hint, row) {
  const raw = text(hint);
  if (!raw) return false;
  const normalized = normalizedBarnBoardTime(raw);
  const candidates = [
    row.entry_go_time,
    row.display_time,
    row.class_start_time
  ].map(normalizedBarnBoardTime).filter(Boolean);
  return candidates.includes(normalized);
}

function barnBoardEntryMatches(boardFields, entryFields) {
  const horseIds = new Set(linkedRecordIds(boardFields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.horses]));
  if (!horseIds.size) return false;
  const entryHorseIds = linkedRecordIds(entryFields.horses);
  if (!entryHorseIds.some((id) => horseIds.has(id))) return false;
  return barnBoardRingHintMatches(boardFields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.ring_hint], entryFields)
    && barnBoardTimeHintMatches(boardFields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.time_hint], entryFields)
    && barnBoardClassHintMatches(boardFields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.class_name_hint], entryFields);
}

function barnBoardStatusPatch(matchRecord = null) {
  if (matchRecord) {
    return {
      [AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.entry_go_times]: [matchRecord.id],
      [AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.match_status]: "matched",
      [AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.hot_patch_active]: false,
      [AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.release_status]: "released"
    };
  }
  return {
    [AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.match_status]: "hot_patch",
    [AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.hot_patch_active]: true,
    [AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.release_status]: "active"
  };
}

function barnBoardPatchNeedsUpdate(fields, patch) {
  for (const [field, value] of Object.entries(patch)) {
    const current = fields[field];
    if (Array.isArray(value)) {
      const currentIds = linkedRecordIds(current);
      if (currentIds.length !== value.length || currentIds.some((id, index) => id !== value[index])) return true;
    } else if (typeof value === "boolean") {
      if (current !== value) return true;
    } else if (text(current) !== text(value)) {
      return true;
    }
  }
  return false;
}

async function getBarnBoardHotPatchRows(focusDay) {
  const formula = `IS_SAME({${AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.focus_day}},DATETIME_PARSE(${airtableFormulaValue(focusDay)}),'day')`;
  try {
    return await airtableListRecords(AIRTABLE_BARN_BOARD_HOT_PATCHES_TABLE, { filterByFormula: formula });
  } catch (error) {
    if (String(error.message || "").includes("TABLE_NOT_FOUND")) return [];
    throw error;
  }
}

function compactBarnBoardList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[,\n|]/).map(text).filter(Boolean);
}

function barnBoardTruthy(value) {
  if (Array.isArray(value)) return value.some(barnBoardTruthy);
  const boolValue = boolOrNull(value);
  if (boolValue !== null) return boolValue;
  const raw = text(value).toLowerCase();
  return raw === "checked" || raw === "yes";
}

function compactBarnBoardScheduleRow(record) {
  const fields = record.fields || {};
  return {
    record_id: record.id,
    show_no: text(fields.show_no),
    focus_day: dateKey(fields.focus_day || fields.iso_date),
    ring_name_normalized: text(fields.ring_name_normalized),
    ring_no: text(fields.ring_no),
    time_text: text(fields.time_text),
    class_no: text(fields.class_no),
    class_name: text(fields.class_name),
    class_name_tokens: compactBarnBoardList(fields.class_name_tokens),
    barn_from_entry_go_times: compactBarnBoardList(fields.barn_from_entry_go_times),
    horse_from_entry_go_times: compactBarnBoardList(fields.horse_from_entry_go_times)
  };
}

function barnBoardScheduleRowEligible(record) {
  const fields = record.fields || {};
  if (barnBoardTruthy(fields.preflight) || barnBoardTruthy(fields.is_preflight)) return false;
  return Boolean(
    text(fields.ring_no)
    && text(fields.ring_name_normalized)
    && text(fields.time_text)
    && text(fields.class_no)
    && text(fields.class_name)
  );
}

function barnBoardMissingExpectedFields(records, expectedFields) {
  return expectedFields.filter((field) => !records.some((record) => Object.prototype.hasOwnProperty.call(record.fields || {}, field)));
}

function compactBarnBoardHorse(record) {
  const fields = record.fields || {};
  const barnName = text(fields.barn_name || fields.barn || fields.Barn);
  const horseName = text(fields.horse || fields.horse_name || fields.name || fields.Name);
  const horseDisplay = text(fields.horse_display || fields.display || fields.display_name);
  return {
    record_id: record.id,
    barn_name: barnName,
    horse_display: horseDisplay,
    horse: horseName,
    display: barnName || horseDisplay || horseName
  };
}

async function getBarnBoardActiveHorses(warnings) {
  let records = [];
  try {
    records = await airtableListRecords("horses");
  } catch (error) {
    warnings.push({ code: "horses_read_failed", message: error.message });
    return [];
  }
  const activeFieldNames = ["active", "is_active", "Active"];
  const activeField = activeFieldNames.find((field) => records.some((record) => Object.prototype.hasOwnProperty.call(record.fields || {}, field)));
  if (!activeField) warnings.push({ code: "horses_active_field_missing", message: "horses active field was not found; endpoint returned compact horse rows without an active-field filter" });
  return records
    .filter((record) => !activeField || barnBoardTruthy(record.fields?.[activeField]))
    .map(compactBarnBoardHorse)
    .filter((horse) => horse.display);
}

function compactBarnBoardHotPatch(record) {
  const fields = record.fields || {};
  return {
    record_id: record.id,
    board_line: text(fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.board_line]),
    ring_hint: text(fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.ring_hint]),
    time_hint: text(fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.time_hint]),
    class_name_hint: text(fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.class_name_hint]),
    match_status: text(fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.match_status]),
    hot_patch_active: barnBoardTruthy(fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.hot_patch_active]),
    release_status: text(fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.release_status]),
    focus_day: dateKey(fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.focus_day])
  };
}

async function buildBarnBoardFormOptions(requestedShowNo = "") {
  const warnings = [];
  const focusShow = await getOutputFocusShow(requestedShowNo);
  if (!focusShow?.show_no || !focusShow?.focus_day) {
    return {
      ok: false,
      error: "active focus_show not found",
      requested_show_no: text(requestedShowNo) || null
    };
  }

  const showValue = Number.isFinite(Number(focusShow.show_no)) ? String(Number(focusShow.show_no)) : airtableFormulaValue(focusShow.show_no);
  const stagingFormula = `AND({show_no}=${showValue},IS_SAME({iso_date},DATETIME_PARSE(${airtableFormulaValue(focusShow.focus_day)}),'day'))`;
  const expectedFields = [
    "ring_name_normalized",
    "ring_no",
    "time_text",
    "class_no",
    "class_name",
    "class_name_tokens",
    "barn_from_entry_go_times",
    "horse_from_entry_go_times"
  ];
  const scheduleRecords = await airtableListRecords(AIRTABLE_UPDATE_SCHEDULE_STAGING_TABLE, { filterByFormula: stagingFormula });
  const missingExpectedFields = barnBoardMissingExpectedFields(scheduleRecords, expectedFields);
  for (const field of missingExpectedFields) {
    warnings.push({ code: "missing_update_schedule_staging_field", field });
  }
  const eligibleRows = scheduleRecords
    .filter(barnBoardScheduleRowEligible)
    .map(compactBarnBoardScheduleRow);
  const horses = await getBarnBoardActiveHorses(warnings);
  const hotPatchRecords = await getBarnBoardHotPatchRows(focusShow.focus_day);
  const hotPatches = hotPatchRecords.map(compactBarnBoardHotPatch);

  return {
    ok: true,
    source: "airtable.read_only",
    show_no: focusShow.show_no,
    focus_day: focusShow.focus_day,
    focus_show_record_id: focusShow.record_id,
    rows: eligibleRows,
    horses,
    hot_patches: hotPatches,
    counts: {
      update_schedule_staging_rows_read: scheduleRecords.length,
      eligible_update_schedule_staging_rows: eligibleRows.length,
      horses_read: horses.length,
      hot_patches_read: hotPatches.length,
      missing_expected_fields: missingExpectedFields.length
    },
    warnings
  };
}

function normalizeBarnBoardAuditValue(value) {
  return text(value).toLowerCase();
}

function barnBoardAuditSearchMatches(searchText, input) {
  const normalizedInput = normalizeBarnBoardAuditValue(input);
  if (!normalizedInput) return false;
  return normalizeBarnBoardAuditValue(searchText).includes(normalizedInput);
}

function uniqueBarnBoardAuditOptions(options) {
  const seen = new Set();
  const out = [];
  for (const option of options || []) {
    const keyValue = `${normalizeBarnBoardAuditValue(option.value || option.label)}|${normalizeBarnBoardAuditValue(option.search)}`;
    if (!keyValue.trim() || seen.has(keyValue)) continue;
    seen.add(keyValue);
    out.push(option);
  }
  return out;
}

function matchBarnBoardAuditOption(input, options) {
  const normalizedInput = normalizeBarnBoardAuditValue(input);
  if (!normalizedInput) return { status: "MISSING", matches: [] };
  const uniqueOptions = uniqueBarnBoardAuditOptions(options);
  const exact = uniqueOptions.filter((option) => {
    const labels = [option.label, option.value, ...(option.aliases || [])].map(normalizeBarnBoardAuditValue).filter(Boolean);
    return labels.includes(normalizedInput);
  });
  if (exact.length === 1) return { status: "SUCCESS", matches: exact };
  if (exact.length > 1) return { status: "AMBIGUOUS", matches: exact };
  const partial = uniqueOptions.filter((option) => barnBoardAuditSearchMatches(option.search || option.label || option.value, input));
  if (partial.length === 1) return { status: "SUCCESS", matches: partial };
  if (partial.length > 1) return { status: "AMBIGUOUS", matches: partial };
  return { status: "MISSING", matches: [] };
}

function parseBarnBoardAuditLine(line) {
  if (typeof line === "string") {
    const raw = text(line);
    const delimiter = raw.includes("|") ? "|" : ",";
    const [ring = "", time = "", className = "", horse = ""] = raw.split(delimiter).map(text);
    return { input: raw, ring, time, className, horse };
  }
  const fields = line && typeof line === "object" ? line : {};
  const ring = text(fields.ring);
  const timeValue = text(fields.time);
  const className = text(fields.class ?? fields.className ?? fields.class_name);
  const horse = text(fields.horse);
  return {
    input: text(fields.input) || [ring, timeValue, className, horse].join(" | "),
    ring,
    time: timeValue,
    className,
    horse
  };
}

function barnBoardAuditDisplayHorse(horse, activeHorses = []) {
  const direct = activeHorses.find((item) => {
    const values = [item.barn_name, item.horse_display, item.display, item.horse].map(normalizeBarnBoardAuditValue);
    const target = normalizeBarnBoardAuditValue(horse);
    return target && values.includes(target);
  });
  return text(direct?.barn_name || direct?.horse_display || direct?.display || horse);
}

function barnBoardAuditBoundHorseOptions(row, activeHorses = []) {
  const barns = compactBarnBoardList(row.barn_from_entry_go_times);
  const horses = compactBarnBoardList(row.horse_from_entry_go_times);
  const options = [];
  const length = Math.max(barns.length, horses.length);
  for (let index = 0; index < length; index += 1) {
    const barnName = text(barns[index]);
    const horseName = text(horses[index] || barns[index]);
    const display = barnName || barnBoardAuditDisplayHorse(horseName, activeHorses);
    if (!display) continue;
    options.push({
      label: display,
      value: display,
      display,
      horse: horseName,
      bound: true,
      search: [display, barnName, horseName].join(" "),
      aliases: [barnName, horseName, display].filter(Boolean)
    });
  }
  return uniqueBarnBoardAuditOptions(options);
}

function barnBoardAuditActiveHorseOptions(activeHorses = []) {
  return uniqueBarnBoardAuditOptions(activeHorses.map((horse) => {
    const display = text(horse.barn_name || horse.horse_display || horse.display || horse.horse);
    return {
      label: display,
      value: display,
      display,
      horse: text(horse.horse),
      bound: false,
      search: [display, horse.barn_name, horse.horse_display, horse.display, horse.horse].join(" "),
      aliases: [horse.barn_name, horse.horse_display, horse.display, horse.horse].map(text).filter(Boolean)
    };
  }).filter((horse) => horse.display));
}

function barnBoardAuditHotPatchMatches(line, hotPatches = []) {
  const inputText = [line.input, line.ring, line.time, line.className, line.horse].map(normalizeBarnBoardAuditValue).join(" ");
  return (hotPatches || []).some((patch) => {
    const active = patch.hot_patch_active === true || normalizeBarnBoardAuditValue(patch.match_status) === "hot_patch";
    if (!active) return false;
    const patchText = [patch.board_line, patch.ring_hint, patch.time_hint, patch.class_name_hint].map(normalizeBarnBoardAuditValue).join(" ");
    return patchText && inputText && inputText.includes(patchText);
  });
}

function barnBoardAuditResult(input, status, reason, values = {}) {
  return {
    input: input.input,
    ring: text(values.ring || input.ring),
    time: text(values.time || input.time),
    "class": text(values.className || input.className),
    horse: text(values.horse || input.horse),
    status,
    reason
  };
}

function resolveBarnBoardAuditLine(input, data) {
  const rows = data.rows || [];
  const activeHorses = data.horses || [];
  const ringOptions = uniqueBarnBoardAuditOptions(rows.map((row) => ({
    label: row.ring_name_normalized,
    value: row.ring_name_normalized,
    search: row.ring_name_normalized
  })));
  const ringMatch = matchBarnBoardAuditOption(input.ring, ringOptions);
  if (ringMatch.status === "MISSING") return barnBoardAuditResult(input, "MISSING", "Ring could not be resolved.");
  if (ringMatch.status === "AMBIGUOUS") return barnBoardAuditResult(input, "AMBIGUOUS", "Ring matched more than one option.");
  const ring = ringMatch.matches[0].value;

  const ringRows = rows.filter((row) => normalizeBarnBoardAuditValue(row.ring_name_normalized) === normalizeBarnBoardAuditValue(ring));
  const timeOptions = uniqueBarnBoardAuditOptions(ringRows.map((row) => ({
    label: row.time_text,
    value: row.time_text,
    search: row.time_text
  })));
  const timeMatch = matchBarnBoardAuditOption(input.time, timeOptions);
  if (timeMatch.status === "MISSING") return barnBoardAuditResult(input, "MISSING", "Time could not be resolved for the selected ring.", { ring });
  if (timeMatch.status === "AMBIGUOUS") return barnBoardAuditResult(input, "AMBIGUOUS", "Time matched more than one option for the selected ring.", { ring });
  const timeValue = timeMatch.matches[0].value;

  const classRows = ringRows.filter((row) => normalizeBarnBoardAuditValue(row.time_text) === normalizeBarnBoardAuditValue(timeValue));
  const classOptions = uniqueBarnBoardAuditOptions(classRows.map((row) => ({
    label: row.class_name,
    value: row.class_name,
    row,
    search: [row.class_name, ...(row.class_name_tokens || [])].join(" "),
    aliases: [row.class_name, ...(row.class_name_tokens || [])].filter(Boolean)
  })));
  const classMatch = matchBarnBoardAuditOption(input.className, classOptions);
  if (classMatch.status === "MISSING") return barnBoardAuditResult(input, "MISSING", "Class could not be resolved for the selected ring and time.", { ring, time: timeValue });
  if (classMatch.status === "AMBIGUOUS") return barnBoardAuditResult(input, "AMBIGUOUS", "Class matched more than one option for the selected ring and time.", { ring, time: timeValue });
  const className = classMatch.matches[0].value;
  const row = classMatch.matches[0].row;

  const boundHorseMatch = matchBarnBoardAuditOption(input.horse, barnBoardAuditBoundHorseOptions(row, activeHorses));
  if (boundHorseMatch.status === "SUCCESS") {
    const horse = boundHorseMatch.matches[0].display;
    const hotTag = barnBoardAuditHotPatchMatches({ ...input, ring, time: timeValue, className, horse }, data.hot_patches);
    return barnBoardAuditResult(
      input,
      hotTag ? "HOT_TAG" : "SUCCESS",
      hotTag ? "Line matches an active hot-patch/manual tag." : "Horse is bound to the resolved class.",
      { ring, time: timeValue, className, horse }
    );
  }
  if (boundHorseMatch.status === "AMBIGUOUS") {
    return barnBoardAuditResult(input, "AMBIGUOUS", "Horse matched more than one bound horse for the resolved class.", { ring, time: timeValue, className });
  }

  const activeHorseMatch = matchBarnBoardAuditOption(input.horse, barnBoardAuditActiveHorseOptions(activeHorses));
  if (activeHorseMatch.status === "SUCCESS") {
    return barnBoardAuditResult(input, "MISMATCHED", "Horse exists but is not bound to the resolved class.", {
      ring,
      time: timeValue,
      className,
      horse: activeHorseMatch.matches[0].display
    });
  }
  if (activeHorseMatch.status === "AMBIGUOUS") {
    return barnBoardAuditResult(input, "AMBIGUOUS", "Horse matched more than one active horse.", { ring, time: timeValue, className });
  }
  return barnBoardAuditResult(input, "MISSING", "Horse could not be resolved.", { ring, time: timeValue, className });
}

async function auditBarnBoardLines(requestedShowNo = "", lines = []) {
  const data = await buildBarnBoardFormOptions(requestedShowNo);
  if (!data.ok) return data;
  const parsedLines = (Array.isArray(lines) ? lines : [lines]).map(parseBarnBoardAuditLine).filter((line) => line.input);
  const results = parsedLines.map((line) => resolveBarnBoardAuditLine(line, data));
  const counts = {
    lines_received: parsedLines.length,
    lines_resolved: results.filter((result) => ["SUCCESS", "MISMATCHED", "HOT_TAG"].includes(result.status)).length,
    success: results.filter((result) => result.status === "SUCCESS").length,
    missing: results.filter((result) => result.status === "MISSING").length,
    mismatched: results.filter((result) => result.status === "MISMATCHED").length,
    ambiguous: results.filter((result) => result.status === "AMBIGUOUS").length,
    hot_tag: results.filter((result) => result.status === "HOT_TAG").length
  };
  return {
    ok: true,
    show_no: data.show_no,
    focus_day: data.focus_day,
    focus_show_record_id: data.focus_show_record_id,
    counts,
    results,
    warnings: data.warnings || []
  };
}

function barnBoardHotPatchFieldMap(metadataTables = []) {
  const table = (metadataTables || []).find((item) => item.name === AIRTABLE_BARN_BOARD_HOT_PATCHES_TABLE);
  const fields = new Map();
  for (const field of table?.fields || []) fields.set(field.name, field);
  return fields;
}

function barnBoardSingleSelectHasChoice(field, choiceName) {
  return (field?.options?.choices || []).some((choice) => text(choice.name).toLowerCase() === text(choiceName).toLowerCase());
}

function barnBoardAuditMatchStatusForSave(status) {
  if (status === "SUCCESS") return "matched";
  if (["MISMATCHED", "MISSING", "HOT_TAG"].includes(status)) return "hot_patch";
  return "";
}

function barnBoardAuditHorseRecordId(horseName, data) {
  const target = normalizeBarnBoardAuditValue(horseName);
  if (!target) return "";
  const horse = (data.horses || []).find((item) => {
    const values = [item.barn_name, item.horse_display, item.display, item.horse].map(normalizeBarnBoardAuditValue);
    return values.includes(target);
  });
  return text(horse?.record_id);
}

function barnBoardHotPatchSetField(fields, schema, fieldName, value, expectedTypes, warnings) {
  const field = schema.get(fieldName);
  if (!field) {
    warnings.push({ code: "hot_patch_field_missing", field: fieldName });
    return;
  }
  if (expectedTypes?.length && !expectedTypes.includes(field.type)) {
    warnings.push({ code: "hot_patch_field_incompatible", field: fieldName, type: field.type });
    return;
  }
  fields[fieldName] = value;
}

async function saveBarnBoardHotPatch(requestedShowNo = "", line = {}) {
  const data = await buildBarnBoardFormOptions(requestedShowNo);
  if (!data.ok) return data;
  const parsed = parseBarnBoardAuditLine(line);
  if (!parsed.input) {
    return { ok: false, show_no: data.show_no, focus_day: data.focus_day, focus_show_record_id: data.focus_show_record_id, error: "line required", warnings: data.warnings || [] };
  }
  const resolved = resolveBarnBoardAuditLine(parsed, data);
  if (resolved.status === "AMBIGUOUS") {
    return {
      ok: false,
      show_no: data.show_no,
      focus_day: data.focus_day,
      focus_show_record_id: data.focus_show_record_id,
      error: "AMBIGUOUS line requires explicit resolved choice before save",
      result: resolved,
      warnings: data.warnings || []
    };
  }
  if (!["SUCCESS", "MISMATCHED", "MISSING", "HOT_TAG"].includes(resolved.status)) {
    return {
      ok: false,
      show_no: data.show_no,
      focus_day: data.focus_day,
      focus_show_record_id: data.focus_show_record_id,
      error: `Unsupported audit status for save: ${resolved.status}`,
      result: resolved,
      warnings: data.warnings || []
    };
  }

  const warnings = [...(data.warnings || [])];
  const schema = barnBoardHotPatchFieldMap(await airtableBaseMetadataTables());
  const fields = {};
  const boardLine = [resolved.ring, resolved.time, resolved.class, resolved.horse].map(text).join(" | ");
  barnBoardHotPatchSetField(fields, schema, AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.board_line, boardLine, ["singleLineText", "multilineText"], warnings);
  barnBoardHotPatchSetField(fields, schema, AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.ring_hint, resolved.ring, ["singleLineText", "multilineText"], warnings);
  barnBoardHotPatchSetField(fields, schema, AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.time_hint, resolved.time, ["singleLineText", "multilineText"], warnings);
  barnBoardHotPatchSetField(fields, schema, AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.class_name_hint, resolved.class, ["singleLineText", "multilineText"], warnings);
  barnBoardHotPatchSetField(fields, schema, AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.hot_patch_active, true, ["checkbox"], warnings);
  barnBoardHotPatchSetField(fields, schema, AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.focus_day, data.focus_day, ["date"], warnings);

  const matchStatus = barnBoardAuditMatchStatusForSave(resolved.status);
  const matchStatusField = schema.get(AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.match_status);
  if (matchStatusField?.type === "singleSelect" && barnBoardSingleSelectHasChoice(matchStatusField, matchStatus)) {
    fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.match_status] = matchStatus;
  } else {
    warnings.push({ code: "hot_patch_field_incompatible", field: AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.match_status, status: resolved.status });
  }

  const releaseStatusField = schema.get(AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.release_status);
  if (releaseStatusField?.type === "singleSelect" && barnBoardSingleSelectHasChoice(releaseStatusField, "active")) {
    fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.release_status] = "active";
  } else {
    warnings.push({ code: "hot_patch_field_incompatible", field: AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.release_status });
  }

  const horseRecordId = barnBoardAuditHorseRecordId(resolved.horse, data);
  const horsesField = schema.get(AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.horses);
  if (horsesField?.type === "multipleRecordLinks" && horseRecordId) {
    fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.horses] = [horseRecordId];
  } else if (horsesField) {
    warnings.push({ code: "hot_patch_link_skipped", field: AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.horses, reason: horseRecordId ? "incompatible_field_type" : "no_safe_horse_record_id" });
  }

  if (schema.has(AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.entry_go_times)) {
    warnings.push({ code: "hot_patch_link_skipped", field: AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.entry_go_times, reason: "no_safe_entry_go_times_record_id_available" });
  }

  if (!Object.keys(fields).length) {
    return {
      ok: false,
      show_no: data.show_no,
      focus_day: data.focus_day,
      focus_show_record_id: data.focus_show_record_id,
      error: "No usable barn_board_hot_patches fields available for save",
      result: resolved,
      warnings
    };
  }

  const record = await airtableCreateRecord(AIRTABLE_BARN_BOARD_HOT_PATCHES_TABLE, fields);
  return {
    ok: true,
    show_no: data.show_no,
    focus_day: data.focus_day,
    focus_show_record_id: data.focus_show_record_id,
    saved: true,
    table: AIRTABLE_BARN_BOARD_HOT_PATCHES_TABLE,
    record_id: record?.id || null,
    result: resolved,
    fields_written: Object.keys(fields),
    warnings
  };
}

async function getActiveEntryGoTimeRecordsForBarnBoard(showNo, focusDay) {
  const showValue = Number.isFinite(Number(showNo)) ? String(Number(showNo)) : airtableFormulaValue(showNo);
  const formula = `AND({show_no}=${showValue},IS_SAME({focus_day},DATETIME_PARSE(${airtableFormulaValue(focusDay)}),'day'),OR({status}=BLANK(),{status}!='inactive'))`;
  return airtableListRecords("entry_go_times", { filterByFormula: formula });
}

async function syncBarnBoardHotPatches(showNo, focusDay, { dryRun = false } = {}) {
  const boardRows = await getBarnBoardHotPatchRows(focusDay);
  const activeEntryRows = await getActiveEntryGoTimeRecordsForBarnBoard(showNo, focusDay);
  const updates = [];
  const matched = [];
  const hotPatch = [];
  const ambiguous = [];

  for (const boardRow of boardRows) {
    const fields = boardRow.fields || {};
    if (text(fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.release_status]).toLowerCase() === "released"
      && !fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.hot_patch_active]) {
      continue;
    }
    const linkedEntryIds = linkedRecordIds(fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.entry_go_times]);
    const matches = linkedEntryIds.length
      ? activeEntryRows.filter((entry) => linkedEntryIds.includes(entry.id)).slice(0, 2)
      : activeEntryRows.filter((entry) => barnBoardEntryMatches(fields, entry.fields || {}));
    if (matches.length === 1) {
      const patch = barnBoardStatusPatch(matches[0]);
      matched.push(boardRow.id);
      if (barnBoardPatchNeedsUpdate(fields, patch)) updates.push({ id: boardRow.id, fields: patch });
    } else if (matches.length > 1) {
      ambiguous.push(boardRow.id);
    } else {
      const patch = barnBoardStatusPatch();
      hotPatch.push(boardRow.id);
      if (barnBoardPatchNeedsUpdate(fields, patch)) updates.push({ id: boardRow.id, fields: patch });
    }
  }

  const changed = dryRun ? [] : await airtableUpdateRecordsById(AIRTABLE_BARN_BOARD_HOT_PATCHES_TABLE, updates);
  return {
    ok: true,
    source: AIRTABLE_BARN_BOARD_HOT_PATCHES_TABLE,
    focus_day: focusDay,
    board_rows: boardRows.length,
    active_entry_go_times: activeEntryRows.length,
    matched: matched.length,
    hot_patch: hotPatch.length,
    ambiguous: ambiguous.length,
    updates: updates.length,
    records_changed: changed.length,
    dry_run: !!dryRun
  };
}

async function getActiveBarnBoardHotPatchScheduleRows(showNo, focusDay, meta = {}) {
  const boardRows = await getBarnBoardHotPatchRows(focusDay);
  const activeRows = boardRows.filter((record) => {
    const fields = record.fields || {};
    return fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.hot_patch_active] === true
      && text(fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.match_status]).toLowerCase() === "hot_patch"
      && text(fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.release_status]).toLowerCase() !== "released"
      && !linkedRecordIds(fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.entry_go_times]).length;
  });
  const horseDisplaysById = await getManualHorseDisplaysById(
    activeRows.flatMap((record) => linkedRecordIds(record.fields?.[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.horses]))
  );
  return activeRows.map((record, index) => {
    const fields = record.fields || {};
    const horseIds = linkedRecordIds(fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.horses]);
    const trainerRollups = manualTrainerRollupsForHorseIds(horseIds, horseDisplaysById, meta);
    const rollup = horseRollupDisplay(trainerRollups);
    const startTime = normalizeClassStartTime(fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.time_hint]);
    const ringHint = text(fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.ring_hint]);
    const ringNumber = intOrNull(ringHint) || 9998;
    const ringName = meta.ringDisplays?.[String(ringNumber)] || ringDisplayFromName(ringHint) || ringHint || "Barn Board";
    const className = text(fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.class_name_hint]) || text(fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.board_line]) || "Barn board hot patch";
    return {
      show_id: showNo,
      show_days_report_title: meta.title,
      show_days_display_date: focusDay,
      show_start_date: meta.showStartDate || "",
      show_end_date: meta.showEndDate || "",
      show_day_key: focusDay,
      ring_number: ringNumber,
      ring_name: ringName,
      ring_day_no: `barn-board|${focusDay}|${ringHint || ringNumber}`,
      class_group_id: `barn_board_hot_patch:${record.id}`,
      class_group_sequence: scheduleSortValue(startTime, 9000 + index),
      group_group_name: className,
      class_no: `barn_board_hot_patch:${record.id}`,
      class_number: "",
      class_name: className,
      start_display: displayTimeFromStart(startTime || fields[AIRTABLE_BARN_BOARD_HOT_PATCH_FIELDS.time_hint]),
      class_start_time: startTime,
      entry_count: horseIds.length || null,
      n_gone: null,
      n_to_go: null,
      elapsed_seconds: null,
      current_entry_no: "",
      current_horse: "",
      live_source: "barn_board_hot_patches",
      group_display: rollup,
      sched_display: rollup,
      "8778_sched_display": rollup,
      trainer_rollups: trainerRollups,
      rollup_source: "barn_board_hot_patches",
      sched_horses: compactTrainerRollups(trainerRollups)
        .flatMap((item) => item.horses || [])
        .map((horse) => (horse && typeof horse === "object" ? text(horse.display || horse.horse) : text(horse)))
        .filter(Boolean)
        .join("|"),
      source: "barn_board_hot_patches",
      hot_patch: true,
      hot_patch_record_id: record.id
    };
  });
}

function trainerRollupsForEntries(entries, meta) {
  const byTrainer = new Map();
  for (const entry of entries || []) {
    const trainer = text(entry.trainer);
    if (!trainer) continue;
    const trainerDisplay = trainerDisplayName(trainer, meta.trainerDisplays);
    const bucket = byTrainer.get(trainer) || { trainer, trainer_display: trainerDisplay, horses: [] };
    const entryBarnNameRaw = text(entry.barn_name || entry.horse_display);
    const entryRiderName = text(entry.rider_display || entry.rider);
    const entryBarnName = entryBarnNameRaw && entryBarnNameRaw.toLowerCase() !== entryRiderName.toLowerCase()
      ? entryBarnNameRaw
      : "";
    const horseMeta = horseDisplayMeta(entry.horse, meta);
    const horse = entryBarnName
      ? { ...horseMeta, display: entryBarnName, barn_name: entryBarnName, barn_name_missing: false }
      : horseMeta;
    const entryOrder = text(entry.entry_order);
    if (horse.display && !horse.barn_name_missing) {
      bucket.horses.push({
        ...horse,
        entry_order: entryOrder,
        label: entryOrder ? `${horse.display} (${entryOrder})` : horse.display
      });
    }
    byTrainer.set(trainer, bucket);
  }
  return [...byTrainer.values()]
    .map((item) => ({
      ...item,
      horses: [...new Set(item.horses)]
    }))
    .filter((item) => item.horses.length);
}

function compactTrainerRollups(rollups) {
  const byTrainer = new Map();
  for (const item of rollups || []) {
    const trainer = text(item.trainer);
    const trainerDisplay = text(item.trainer_display || item.trainer);
    const trainerKey = trainer || trainerDisplay;
    if (!trainerKey) continue;
    const bucket = byTrainer.get(trainerKey) || {
      trainer: trainer || trainerDisplay,
      trainer_display: trainerDisplay,
      horses: []
    };
    for (const horse of item.horses || []) {
      if (horse && typeof horse === "object") {
        const label = text(horse.label || horse.display || horse.horse);
        if (label) {
          bucket.horses.push({
            horse: text(horse.horse) || label.replace(/\s*\([^)]*\)\s*$/, ""),
            display: text(horse.display) || label.replace(/\s*\([^)]*\)\s*$/, ""),
            label,
            entry_order: text(horse.entry_order),
            barn_name: text(horse.barn_name),
            barn_name_missing: horse.barn_name_missing === true || horse.barn_name_missing === "1" || horse.barn_name_missing === "true"
          });
        }
        continue;
      }
      const clean = text(horse);
      if (clean) bucket.horses.push(clean);
    }
    const seen = new Set();
    bucket.horses = bucket.horses.filter((horse) => {
      const key = typeof horse === "object" ? text(horse.label || horse.display || horse.horse).toLowerCase() : text(horse).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    byTrainer.set(trainerKey, bucket);
  }
  return [...byTrainer.values()].filter((item) => item.horses.length);
}

function schedulePayloadClassKey(row, showNo, focusDay) {
  return [
    text(row.show_id || row.show_no || showNo),
    text(row.show_day_key || row.focus_day || focusDay),
    text(row.ring_day_no),
    text(row.ring_number || row.ring_no),
    text(row.class_no)
  ].join("|");
}

function mergeSchedulePayloadRows(rows, showNo, focusDay) {
  const byKey = new Map();
  for (const row of rows || []) {
    const key = schedulePayloadClassKey(row, showNo, focusDay);
    if (!text(row.class_no) || byKey.has(key) === false) {
      byKey.set(key, { ...row });
      continue;
    }
    const existing = byKey.get(key);
    const mergedRollups = compactTrainerRollups([
      ...(existing.trainer_rollups || []),
      ...(row.trainer_rollups || [])
    ]);
    existing.trainer_rollups = mergedRollups;
    existing.group_display = horseRollupDisplay(mergedRollups) || existing.group_display || row.group_display;
    existing.sched_display = existing.group_display || existing.sched_display || row.sched_display;
    existing["8778_sched_display"] = existing.sched_display;
    existing.sched_horses = mergedRollups
      .flatMap((item) => item.horses || [])
      .map((horse) => (horse && typeof horse === "object" ? text(horse.display || horse.horse) : text(horse)))
      .filter(Boolean)
      .join("|") || existing.sched_horses || row.sched_horses;
    for (const [field, value] of Object.entries(row)) {
      if (existing[field] === undefined || existing[field] === null || existing[field] === "") {
        existing[field] = value;
      }
    }
  }
  return [...byKey.values()];
}

function trainerRollupDisplay(rollups) {
  return compactTrainerRollups(rollups)
    .map((item) => `${item.trainer_display}: ${(item.horses || []).map((horse) => (
      horse && typeof horse === "object" ? text(horse.label || horse.display || horse.horse) : text(horse)
    )).filter(Boolean).join(", ")}`)
    .join(" | ");
}

function horseRollupDisplay(rollups) {
  const horses = [];
  for (const item of compactTrainerRollups(rollups)) {
    horses.push(...(item.horses || []).map((horse) => (
      horse && typeof horse === "object" ? text(horse.label || horse.display || horse.horse) : text(horse)
    )).filter(Boolean));
  }
  return [...new Set(horses)].join(", ");
}

function parseTrainerRollups(value) {
  if (Array.isArray(value)) return compactTrainerRollups(value);
  if (!text(value)) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? compactTrainerRollups(parsed) : [];
  } catch {
    return [];
  }
}

function canonicalRollupText(value) {
  return text(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ",")
    .trim();
}

function secondsFromTime(value) {
  const raw = text(value);
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  if (![hour, minute, second].every(Number.isFinite)) return null;
  return hour * 3600 + minute * 60 + second;
}

function preparedDiffClass(fallback, prepared, next) {
  const classes = [];
  const fallbackSeconds = secondsFromTime(fallback.class_start_time);
  const nextSeconds = secondsFromTime(next.class_start_time);
  if (fallbackSeconds !== null && nextSeconds !== null && Math.abs(nextSeconds - fallbackSeconds) >= 300) {
    classes.push("diff-time");
  }

  const fallbackRollup = canonicalRollupText(fallback.group_display || fallback.sched_display);
  const preparedRollup = canonicalRollupText(next.group_display || next.sched_display);
  const preparedHadRollupSource = parseTrainerRollups(prepared.trainer_rollups || prepared.entry_go_times_rollup || prepared.entry_start_times_rollup).length
    || text(prepared.group_display || prepared.sched_display || prepared.rollup_display);
  if (preparedHadRollupSource && fallbackRollup && preparedRollup && fallbackRollup !== preparedRollup) {
    classes.push("diff-oog");
  }

  return classes.join(" ");
}

function applyPreparedClassStartMobileFields(fallback, prepared = {}) {
  const row = { ...fallback };
  const preparedTime = text(prepared.class_start_time || prepared.display_time);
  if (preparedTime) {
    row.class_start_time = preparedTime;
    row.start_display = displayTimeFromStart(preparedTime) || text(prepared.start_display) || row.start_display;
  }

  const preparedRollups = parseTrainerRollups(prepared.trainer_rollups || prepared.entry_go_times_rollup || prepared.entry_start_times_rollup);
  const preparedGroupDisplay = text(prepared.group_display || prepared.sched_display || prepared.rollup_display);
  const lockRollups = text(row.rollup_source) === "update_schedule_staging.horses";
  if (!lockRollups && preparedRollups.length) {
    row.trainer_rollups = preparedRollups;
    row.group_display = horseRollupDisplay(preparedRollups) || preparedGroupDisplay || row.group_display;
    row.sched_display = row.group_display;
    row["8778_sched_display"] = row.group_display;
    row.sched_horses = preparedRollups
      .flatMap((item) => item.horses || [])
      .map((horse) => text(horse).replace(/\s*\([^)]*\)\s*$/, ""))
      .filter(Boolean)
      .join("|") || row.sched_horses;
  } else if (!lockRollups && preparedGroupDisplay) {
    row.group_display = preparedGroupDisplay;
    row.sched_display = preparedGroupDisplay;
    row["8778_sched_display"] = preparedGroupDisplay;
  }

  row.diff_class = [...new Set([row.diff_class, preparedDiffClass(fallback, prepared, row)]
    .flatMap((item) => text(item).split(/\s+/).map(text).filter(Boolean)))]
    .join(" ");

  return row;
}

async function buildScheduleJson(app, showNo, focusDay, meta, { limit = 300, offset = 0 } = {}) {
  const schedule = await getLockedStagingSchedule(app, showNo, focusDay, { limit, offset });
  const manualHorseDisplaysById = await getManualHorseDisplaysById(
    schedule.flatMap((row) => row.manual_horse_ids || [])
  );
  const classNos = schedule.map((row) => row.class_no).filter(Boolean);
  const entryClassNos = [...new Set(classNos.map(text).filter(Boolean))];
  if (meta.reconcileEntryGoTimes !== false && offset === 0 && !meta.entryGoTimesByClass) {
    await reconcileEntryGoTimesToCatalyst(app, showNo, focusDay, meta, entryClassNos);
  }
  let entryGoTimesByClass = meta.entryGoTimesByClass instanceof Map
    ? meta.entryGoTimesByClass
    : await getAirtableEntryGoTimesForSchedule(showNo, focusDay, entryClassNos, meta.activeTrainers);
  if (!entryGoTimesByClass.size && entryGoTimesByClass.sourceFetched !== true) {
    entryGoTimesByClass = await getCatalystEntryGoTimesForSchedule(app, showNo, focusDay, entryClassNos, meta.activeTrainers);
  }
  if (process.env.NODE_ENV === "test" && !entryGoTimesByClass.size) {
    const fallbackEntriesByClass = await getEntriesForSchedule(app, showNo, classNos, meta.activeTrainers);
    const ringDayByClass = new Map(schedule.map((row) => [text(row.class_no), text(row.ring_day_no)]));
    for (const [classNo, entries] of fallbackEntriesByClass.entries()) {
      const ringDayNo = ringDayByClass.get(text(classNo));
      if (ringDayNo) entryGoTimesByClass.set(`${ringDayNo}|${text(classNo)}`, entries);
    }
  }
  const classStartTimesByClass = meta.classStartTimesByClass instanceof Map
    ? meta.classStartTimesByClass
    : await getAirtableClassStartTimesForSchedule(showNo, focusDay, classNos);
  const liveByClass = await getLiveStatusForSchedule(app, showNo, schedule);
  const rows = schedule
    .map((row) => {
      const preparedClassStart = classStartTimesByClass.get(`${text(row.ring_day_no)}|${text(row.class_no)}`)
        || {};
      const scheduleRow = { ...row, ...preparedClassStart };
      const scheduleRingNo = text(preparedClassStart.ring_no) || text(row.ring_no);
      const scheduleRingDayNo = text(preparedClassStart.ring_day_no) || text(row.ring_day_no);
      const scheduleRingName = text(preparedClassStart.ring_name) || text(row.ring_name);
      const liveRow = liveByClass.get(String(row.class_no)) || {};
      const classNumber = text(row.class_number);
      const className = text(row.class_name);
      const entries = entryGoTimesByClass.get(`${text(row.ring_day_no)}|${text(row.class_no)}`)
        || entryGoTimesByClass.get(text(row.class_no))
        || [];
      const manualTrainerRollups = manualTrainerRollupsForHorseIds(row.manual_horse_ids, manualHorseDisplaysById, meta);
      const trainerRollups = manualTrainerRollups.length ? manualTrainerRollups : trainerRollupsForEntries(entries, meta);
      const rollup = horseRollupDisplay(trainerRollups);
      return applyPreparedClassStartMobileFields({
        show_id: showNo,
        show_days_report_title: meta.title,
        show_days_display_date: focusDay,
        show_start_date: meta.showStartDate || "",
        show_end_date: meta.showEndDate || "",
        focus_day: text(row.focus_day) || focusDay,
        show_day: text(row.show_day) || text(row.focus_day_key) || focusDay,
        show_day_key: text(row.focus_day_key) || text(row.show_day) || focusDay,
        ring_number: Number(scheduleRingNo || 9999),
        ring_no: scheduleRingNo,
        ring_name: meta.ringDisplays[String(scheduleRingNo)] || ringDisplayFromName(scheduleRingName),
        ring_day_no: scheduleRingDayNo,
        ring_name_prioritized: text(row.ring_name_prioritized),
        ring_name_normalized: text(row.ring_name_normalized),
        class_group_id: String(scheduleRow.class_no || row.ROWID),
        class_group_sequence: scheduleSortValue(scheduleRow.class_start_time, classNumber),
        group_group_name: className,
        class_no: scheduleRow.class_no,
        class_number: classNumber,
        class_name: className,
        class_label: text(row.class_label) || text(scheduleRow.class_label) || className,
        start_display: displayTimeFromStart(scheduleRow.class_start_time),
        class_start_time: scheduleRow.class_start_time,
        display_time: text(scheduleRow.display_time) || displayTimeFromStart(scheduleRow.class_start_time),
        time_text: text(row.time_text),
        time_sort: text(row.time_sort) || text(scheduleSortValue(scheduleRow.class_start_time, classNumber)),
        class_priority_sort: text(row.class_priority_sort),
        class_name_tokens: text(row.class_name_tokens),
        this_disciplines: text(row.this_disciplines),
        this_skills: text(row.this_skills),
        this_ages: text(row.this_ages),
        this_levels: text(row.this_levels),
        this_sizes: text(row.this_sizes),
        this_heights: text(row.this_heights),
        is_2nd_trip: row.is_2nd_trip === true,
        is_medal: row.is_medal === true,
        is_under_saddle: row.is_under_saddle === true,
        is_hunter_classic: row.is_hunter_classic === true,
        is_jumper_classic: row.is_jumper_classic === true,
        live_flag: text(row.live_flag),
        entry_count: intOrNull(liveRow.entry_count) ?? intOrNull(scheduleRow.entry_count),
        n_gone: intOrNull(liveRow.entries_gone) ?? intOrNull(scheduleRow.n_gone),
        n_to_go: intOrNull(liveRow.entries_to_go) ?? intOrNull(scheduleRow.n_to_go),
        elapsed_seconds: intOrNull(liveRow.elapsed_seconds) ?? intOrNull(scheduleRow.elapsed_seconds),
        current_entry_no: liveRow.current_entry_no || scheduleRow.current_entry_no || "",
        current_horse: liveRow.current_horse || scheduleRow.current_horse || "",
        live_source: liveRow.source_endpoint || scheduleRow.live_source || "",
        group_display: rollup,
        sched_display: rollup,
        "8778_sched_display": rollup,
        trainer_rollups: trainerRollups,
        rollup_source: manualTrainerRollups.length ? "update_schedule_staging.horses" : "entry_go_times",
        rollup_label: text(scheduleRow.rollup_label),
        entry_go_times_rollup: scheduleRow.entry_go_times_rollup,
        entry_go_times: entries,
        sched_horses: compactTrainerRollups(trainerRollups)
          .flatMap((item) => item.horses || [])
          .map((horse) => (horse && typeof horse === "object" ? text(horse.display || horse.horse) : text(horse)))
          .filter(Boolean)
          .join("|")
      }, scheduleRow);
    });

  const hotPatchRows = offset === 0
    ? await getActiveBarnBoardHotPatchScheduleRows(showNo, focusDay, meta)
    : [];

  return mergeSchedulePayloadRows([...rows, ...hotPatchRows], showNo, focusDay)
    .sort((a, b) => (
      Number(a.ring_number || 9999) - Number(b.ring_number || 9999) ||
      Number(a.class_group_sequence || 9999999999) - Number(b.class_group_sequence || 9999999999)
    ));
}

function compactMobileEntryPayload(entries) {
  return (entries || []).map((entry) => ({
    entry_rollup: text(entry.entry_rollup),
    barn_name: text(entry.barn_name || entry.entry_rollup),
    horse: text(entry.horse),
    horse_display: text(entry.horse_display || entry.barn_name || entry.entry_rollup),
    rider_display: text(entry.rider_display || entry.rider),
    trainer_display: text(entry.trainer_display || entry.trainer),
    entry_go_time: text(entry.entry_go_time || entry.go_time),
    go_time: text(entry.go_time || entry.entry_go_time),
    entry_go_time_label: text(entry.entry_go_time || entry.go_time) ? text(entry.entry_go_time_label || "Source-derived go time") : "",
    entry_go_time_source: text(entry.entry_go_time || entry.go_time) ? text(entry.entry_go_time_source || entry.live_source || "source_derived_pace") : "",
    pace_seconds: text(entry.pace_seconds),
    live_source: text(entry.live_source),
    last_live_synced_at: text(entry.last_live_synced_at),
    class_start_time: text(entry.class_start_time),
    time_till: text(entry.time_till)
  })).filter((entry) => (
    entry.entry_rollup ||
    entry.barn_name ||
    entry.horse ||
    entry.rider_display ||
    entry.trainer_display ||
    entry.entry_go_time ||
    entry.pace_seconds ||
    entry.live_source ||
    entry.class_start_time ||
    entry.time_till
  ));
}

function buildMobileLivePayload(showNo, focusDay, meta, rows) {
  const rings = new Map();
  for (const row of rows || []) {
    const ringNo = text(row.ring_number);
    const ringNameNormalized = text(row.ring_name_normalized);
    const ringVisualKeyValue = text(row.ring_visual_key) || ringVisualKey(ringNo || row.ring_no, ringNameNormalized);
    const ringGroupKey = ringNameNormalized || ringVisualKeyValue || ringNo;
    const ringDisplay = ringDisplayFromNormalizedName(ringNameNormalized) || text(row.ring_display || row.ring_name) || ringDisplayFromName(row.ring_name);
    const ring = rings.get(ringGroupKey) || {
      ring_key: ringGroupKey,
      ring_no: Number(row.ring_number || 0),
      ring_name: text(row.ring_name),
      ring_name_normalized: ringNameNormalized,
      ring_visual_key: ringVisualKeyValue,
      ring_display: ringDisplay,
      classes: []
    };
    const classNumberText = text(row.class_number);
    const classNameText = text(row.class_name);
    ring.classes.push({
      show_no: text(row.show_id || showNo),
      focus_day: text(row.focus_day || row.show_day_key || focusDay),
      show_day: text(row.show_day || row.show_day_key || focusDay),
      ring_day_no: text(row.ring_day_no),
      ring_no: Number(row.ring_number || row.ring_no || 0),
      class_no: Number(row.class_no || 0),
      class_number: classNumberText,
      class_label: text(row.class_label) || (classNumberText ? `${classNumberText} - ${classNameText}` : classNameText),
      class_name: classNameText,
      class_time: row.start_display,
      class_start_time: row.class_start_time,
      display_time: text(row.display_time || row.start_display),
      time_text: text(row.time_text),
      time_sort: text(row.time_sort || row.class_group_sequence),
      class_priority_sort: text(row.class_priority_sort),
      class_name_tokens: text(row.class_name_tokens),
      this_disciplines: text(row.this_disciplines),
      this_skills: text(row.this_skills),
      this_ages: text(row.this_ages),
      this_levels: text(row.this_levels),
      this_sizes: text(row.this_sizes),
      this_heights: text(row.this_heights),
      is_2nd_trip: row.is_2nd_trip === true,
      is_medal: row.is_medal === true,
      is_under_saddle: row.is_under_saddle === true,
      is_hunter_classic: row.is_hunter_classic === true,
      is_jumper_classic: row.is_jumper_classic === true,
      ring_name_prioritized: text(row.ring_name_prioritized),
      ring_name_normalized: ringNameNormalized,
      ring_visual_key: ringVisualKeyValue,
      ring_display: ringDisplay,
      live_flag: text(row.live_flag),
      entry_count: row.entry_count,
      n_gone: row.n_gone,
      n_to_go: row.n_to_go,
      elapsed_seconds: row.elapsed_seconds,
      current_entry_no: row.current_entry_no,
      current_horse: row.current_horse,
      rollup_label: text(row.rollup_label),
      rollups: compactTrainerRollups(row.trainer_rollups),
      entries: compactMobileEntryPayload(row.entry_go_times)
    });
    rings.set(ringGroupKey, ring);
  }
  return {
    show_no: showNo,
    show_name: meta.title,
    show_start_date: meta.showStartDate || "",
    show_end_date: meta.showEndDate || "",
    show_focus_date: focusDay,
    last_updated: new Date().toISOString(),
    rings: [...rings.values()].sort((a, b) => (
      Number(a.ring_no || 9999) - Number(b.ring_no || 9999) ||
      text(a.ring_name_normalized).localeCompare(text(b.ring_name_normalized))
    ))
  };
}

async function getResultsForSchedule(app, showNo, focusDay, classNos) {
  const wanted = [...new Set((classNos || []).map(text).filter(Boolean))].slice(0, 250);
  const empty = { queueByClass: new Map(), resultClassByClass: new Map(), classResultsByClass: new Map(), classResultsByEntry: new Map() };
  if (!wanted.length) return empty;
  const classWhere = wanted.map((classNo) => `class_no = ${zcqlValue(classNo)}`).join(" OR ");
  const commonWhere = `show_no = ${zcqlValue(showNo)} AND focus_day = ${zcqlValue(focusDay)} AND (${classWhere})`;
  const queryRows = async (tableName, fields) => {
    const query = [
      `SELECT ${fields}`,
      `FROM ${tableName}`,
      `WHERE ${commonWhere}`,
      "LIMIT 300"
    ].join(" ");
    return (await app.zcql().executeZCQLQuery(query) || [])
      .map((item) => item?.[tableName])
      .filter(Boolean);
  };

  const queueRows = await queryRows(TABLES.resultQueue, "ROWID, result_queue_key, show_no, focus_day, class_no, status, result_rows, completed_at");
  const resultClassRows = await queryRows(TABLES.resultClasses, "ROWID, result_class_key, show_no, focus_day, class_no, result_entry_count, completed_at");
  const classResultRows = await queryRows(TABLES.classResults, "ROWID, class_result_key, show_no, focus_day, class_no, entry_no, horse, rider, owner, score, prize, completed_at");

  const queueByClass = new Map();
  for (const row of queueRows) {
    const classNo = text(row.class_no);
    if (classNo) queueByClass.set(classNo, row);
  }

  const resultClassByClass = new Map();
  for (const row of resultClassRows) {
    const classNo = text(row.class_no);
    if (classNo) resultClassByClass.set(classNo, row);
  }

  const classResultsByClass = new Map();
  const classResultsByEntry = new Map();
  for (const row of classResultRows) {
    const classNo = text(row.class_no);
    const entryNo = text(row.entry_no);
    if (!classNo) continue;
    const bucket = classResultsByClass.get(classNo) || [];
    bucket.push(row);
    classResultsByClass.set(classNo, bucket);
    if (entryNo) classResultsByEntry.set(`${classNo}|${entryNo}`, row);
  }

  return { queueByClass, resultClassByClass, classResultsByClass, classResultsByEntry };
}

function addIndexEntry(index, key, value, { preserveCase = false } = {}) {
  const cleanKey = preserveCase ? text(key) : text(key).toLowerCase();
  if (!cleanKey) return;
  if (!index[cleanKey]) index[cleanKey] = [];
  index[cleanKey].push(value);
}

function richEntryFromGoTime(entry, meta, resultRow = {}) {
  const horse = text(entry.horse || resultRow.horse);
  const rider = text(entry.rider || resultRow.rider);
  const trainer = text(entry.trainer);
  const horseMeta = horseDisplayMeta(horse, meta);
  return {
    entry_no: text(entry.entry_no || resultRow.entry_no),
    entry_order: text(entry.entry_order),
    horse,
    horse_display: horseMeta.display,
    rider,
    trainer,
    trainer_display: trainerDisplayName(trainer, meta.trainerDisplays),
    go_time: text(entry.go_time || entry.entry_go_time),
    go_time_label: text(entry.go_time || entry.entry_go_time) ? text(entry.go_time_label || entry.entry_go_time_label || "Source-derived go time") : "",
    go_time_source: text(entry.go_time || entry.entry_go_time) ? text(entry.go_time_source || entry.entry_go_time_source || entry.live_source || "source_derived_pace") : "",
    pace_seconds: text(entry.pace_seconds),
    live_source: text(entry.live_source),
    last_live_synced_at: text(entry.last_live_synced_at),
    result: text(resultRow.class_result_key) ? {
      score: text(resultRow.score),
      prize: text(resultRow.prize),
      completed_at: text(resultRow.completed_at),
      source: "hs_class_results"
    } : null
  };
}

async function buildRichApiPayload(app, showNo, focusDay, meta, { limit = 300, offset = 0 } = {}) {
  const rows = await buildScheduleJson(app, showNo, focusDay, meta, { limit, offset });
  const classNos = [...new Set(rows.map((row) => text(row.class_no)).filter(Boolean))];
  const entryGoTimesByClass = await getCatalystEntryGoTimesForSchedule(app, showNo, focusDay, classNos, meta.activeTrainers);
  const results = await getResultsForSchedule(app, showNo, focusDay, classNos);
  const mobile = buildMobileLivePayload(showNo, focusDay, meta, rows);
  const richRings = new Map();
  const indexes = {
    by_ring: {},
    by_class_no: {},
    by_entry_no: {},
    by_horse: {},
    by_rider: {},
    by_trainer: {}
  };

  for (const row of rows) {
    const classNo = text(row.class_no);
    const ringNo = text(row.ring_number);
    const ringDisplay = text(row.ring_name) || ringDisplayFromName(row.ring_name);
    const queue = results.queueByClass.get(classNo) || {};
    const resultClass = results.resultClassByClass.get(classNo) || {};
    const resultRows = results.classResultsByClass.get(classNo) || [];
    const entryRows = entryGoTimesByClass.get(`${text(row.ring_day_no)}|${classNo}`)
      || entryGoTimesByClass.get(classNo)
      || [];
    const entries = entryRows.map((entry) => richEntryFromGoTime(entry, meta, results.classResultsByEntry.get(`${classNo}|${text(entry.entry_no)}`) || {}));
    const status = text(queue.status) || (text(resultClass.completed_at) ? "completed" : "upcoming");
    const classPayload = {
      class_no: classNo,
      class_number: text(row.class_number),
      class_label: text(row.class_number) ? `${text(row.class_number)} - ${text(row.class_name)}` : text(row.class_name),
      class_name: text(row.class_name),
      class_time: text(row.start_display),
      class_start_time: text(row.class_start_time),
      status,
      entry_count: intOrNull(row.entry_count),
      n_gone: intOrNull(row.n_gone),
      n_to_go: intOrNull(row.n_to_go),
      elapsed_seconds: intOrNull(row.elapsed_seconds),
      current_entry_no: text(row.current_entry_no),
      current_horse: text(row.current_horse),
      live_source: text(row.live_source),
      result_rows: intOrNull(queue.result_rows),
      completed_at: text(queue.completed_at || resultClass.completed_at),
      rollups: compactTrainerRollups(row.trainer_rollups),
      entries,
      results: resultRows.map((resultRow) => ({
        entry_no: text(resultRow.entry_no),
        horse: text(resultRow.horse),
        rider: text(resultRow.rider),
        owner: text(resultRow.owner),
        score: text(resultRow.score),
        prize: text(resultRow.prize),
        completed_at: text(resultRow.completed_at)
      })),
      sources: {
        schedule: "update_schedule_staging.lock_schedule",
        class_time: text(row.live_source || "class_start_times"),
        entries: "hs_entry_go_times",
        results: "hs_result_queue|hs_result_classes|hs_class_results"
      }
    };

    const ring = richRings.get(ringNo) || {
      ring_no: Number(row.ring_number || 0),
      ring_display: ringDisplay,
      classes: []
    };
    ring.classes.push(classPayload);
    richRings.set(ringNo, ring);

    const smsClass = {
      ring_display: ringDisplay,
      class_no: classNo,
      class_number: classPayload.class_number,
      class_name: classPayload.class_name,
      class_time: classPayload.class_time,
      status,
      n_gone: classPayload.n_gone,
      n_to_go: classPayload.n_to_go
    };
    addIndexEntry(indexes.by_ring, ringDisplay, classNo, { preserveCase: true });
    indexes.by_class_no[classNo] = smsClass;
    for (const entry of entries) {
      const smsEntry = { ...smsClass, entry_no: entry.entry_no, entry_order: entry.entry_order, horse_display: entry.horse_display, rider: entry.rider, trainer_display: entry.trainer_display, go_time: entry.go_time };
      addIndexEntry(indexes.by_entry_no, entry.entry_no, smsEntry);
      addIndexEntry(indexes.by_horse, entry.horse_display || entry.horse, smsEntry);
      addIndexEntry(indexes.by_rider, entry.rider, smsEntry);
      addIndexEntry(indexes.by_trainer, entry.trainer || entry.trainer_display, smsEntry);
    }
  }

  const rings = [...richRings.values()].sort((a, b) => Number(a.ring_no || 9999) - Number(b.ring_no || 9999));
  const printRows = rows.map((row) => ({
    ring_no: text(row.ring_number),
    ring_display: text(row.ring_name),
    time: text(row.start_display),
    class_no: text(row.class_no),
    class_number: text(row.class_number),
    class_name: text(row.class_name),
    status: text(results.queueByClass.get(text(row.class_no))?.status) || (text(results.resultClassByClass.get(text(row.class_no))?.completed_at) ? "completed" : "upcoming"),
    rollup: text(row.group_display)
  }));

  return {
    ok: true,
    show_no: text(showNo),
    show_name: meta.title,
    show_start_date: meta.showStartDate || "",
    show_end_date: meta.showEndDate || "",
    show_focus_date: focusDay,
    last_updated: new Date().toISOString(),
    sources: {
      backbone: "update_schedule_staging.lock_schedule",
      class_times: "hs_class_start_times",
      entries: "hs_entry_go_times",
      live: "hs_class_times|get_orders|get_rings",
      results: "hs_result_queue|hs_result_classes|hs_class_results"
    },
    outputs: {
      wec_mobile: mobile,
      wec_mobile_pro: { ...mobile, rings },
      wec_print: { show_no: text(showNo), show_name: meta.title, show_focus_date: focusDay, rows: printRows, rings },
      wec_alerts: {
        classes: rings.flatMap((ring) => ring.classes.map((item) => ({
          class_no: item.class_no,
          class_time: item.class_time,
          status: item.status,
          n_gone: item.n_gone,
          n_to_go: item.n_to_go,
          completed_at: item.completed_at
        }))),
        entries: rings.flatMap((ring) => ring.classes.flatMap((item) => item.entries.map((entry) => ({
          class_no: item.class_no,
          entry_no: entry.entry_no,
          go_time: entry.go_time,
          status: item.status,
          completed_at: entry.result?.completed_at || ""
        }))))
      },
      sms: { indexes }
    },
    rings,
    indexes
  };
}

async function metaForFocusRender(app, showNo, focusDay, query, body) {
  const config = await getShowConfig(app, showNo);
  const meta = metaForRequest(showNo, query, body, config);
  const showRaw = showRawConfig(config?.raw_json);
  if (!meta.hideClasses.length || !query.get("hide_classes")) {
    const focusHideClasses = await getFocusShowHideClasses(app, showNo, focusDay);
    if (focusHideClasses.length) meta.hideClasses = focusHideClasses.map((item) => item.toLowerCase());
  }
  meta.horseDisplays = {
    ...meta.horseDisplays,
    ...(await getFocusShowHorseDisplays(app, showNo, focusDay))
  };
  meta.horseDisplayMeta = {
    ...(meta.horseDisplayMeta || {}),
    ...(await getFocusShowHorseDisplayMeta(app, showNo, focusDay))
  };
  meta.horseDisplays = {
    ...(meta.horseDisplays || {}),
    ...(showRaw.horse_displays || {})
  };
  meta.horseDisplayMeta = {
    ...(meta.horseDisplayMeta || {}),
    ...(showRaw.horse_display_meta || {})
  };
  meta.trainerDisplays = {
    ...(meta.trainerDisplays || {}),
    ...(await getFocusShowTrainerDisplays(app, showNo, focusDay))
  };
  if (!meta.activeTrainers.length) meta.activeTrainers = await getFocusShowActiveTrainers(app, showNo, focusDay);
  if (!meta.activeTrainers.length) {
    const activeTrainerConfig = await getActiveTrainerConfig(app, showNo);
    meta.activeTrainers = activeTrainerConfig.active_trainers;
    meta.trainerDisplays = {
      ...(meta.trainerDisplays || {}),
      ...(activeTrainerConfig.trainer_displays || {})
    };
  }
  const catalystHorseDisplays = await getCatalystHorseDisplayConfig(app);
  const airtableHorseDisplays = await getAirtableHorseDisplayConfig(meta.activeTrainers || [], meta.trainerDisplays || {});
  meta.horseDisplays = {
    ...(meta.horseDisplays || {}),
    ...(catalystHorseDisplays.horse_displays || {}),
    ...(airtableHorseDisplays.horse_displays || {})
  };
  meta.horseDisplayMeta = {
    ...(meta.horseDisplayMeta || {}),
    ...(catalystHorseDisplays.horse_display_meta || {}),
    ...(airtableHorseDisplays.horse_display_meta || {})
  };
  meta.airtableHorseDisplayStatus = {
    ok: catalystHorseDisplays.ok || airtableHorseDisplays.ok,
    source: airtableHorseDisplays.ok ? airtableHorseDisplays.source : catalystHorseDisplays.source,
    filter_formula: airtableHorseDisplays.filter_formula || "",
    count: Object.keys(meta.horseDisplays || {}).length,
    catalyst_count: Object.keys(catalystHorseDisplays.horse_displays || {}).length,
    airtable_count: Object.keys(airtableHorseDisplays.horse_displays || {}).length,
    error: airtableHorseDisplays.error || catalystHorseDisplays.error || "",
    scanned: catalystHorseDisplays.scanned,
    truncated: catalystHorseDisplays.truncated
  };
  return meta;
}

async function getVisibleFocusClassNos(app, showNo, focusDay, meta) {
  const schedule = dedupeFocusScheduleRows(await getFocusSchedule(app, showNo, focusDay, { limit: 300, offset: 0 }))
    .filter((row) => intOrNull(row.class_no) > 0);
  const classNos = schedule.map((row) => row.class_no).filter(Boolean);
  const classesByNo = await getClassesForSchedule(app, showNo, classNos);
  return [...new Set(schedule
    .map((row) => {
      const classRow = classesByNo.get(String(row.class_no)) || {};
      const className = classDisplayFromLabel(classRow, row.class_name);
      return { ...row, class_name: className };
    })
    .filter((row) => row.class_no && !shouldHideScheduleRow(row, meta.hideClasses))
    .map((row) => String(row.class_no)))];
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = [];
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current], current);
    }
  });
  await Promise.all(runners);
  return results;
}

async function refreshFocusClassOog(req, app, showNo, focusDay, meta, context, { offset = 0, limit = 8 } = {}) {
  const classNos = await getVisibleFocusClassNos(app, showNo, focusDay, meta);
  const selectedClassNos = classNos.slice(offset, offset + limit);
  const results = await mapWithConcurrency(selectedClassNos, 3, (classNo) => fetchAndSyncClassOog(req, app, showNo, classNo, context));
  const nextOffset = offset + selectedClassNos.length;
  return {
    class_nos: classNos,
    selected_class_nos: selectedClassNos,
    classes_seen: classNos.length,
    offset,
    limit,
    next_offset: nextOffset < classNos.length ? nextOffset : null,
    has_more: nextOffset < classNos.length,
    classes_synced: results.length,
    parsed_rows: results.reduce((sum, item) => sum + Number(item?.parsed_rows || 0), 0),
    entries: results.reduce((sum, item) => sum + Number(item?.counters?.entries || 0), 0),
    failed: results.filter((item) => !item || item.upstream_status >= 400),
    results
  };
}

async function auditFocusRender(app, showNo, focusDay, meta, renderedRows, expectedClassNos = null) {
  const classNos = expectedClassNos || [...new Set(renderedRows.map((row) => String(row.class_no || "")).filter(Boolean))];
  const activeRows = await getEntriesForClasses(app, showNo, classNos);
  const activeTrainerSet = new Set(meta.activeTrainers.map(text).filter(Boolean));
  const expected = activeRows
    .filter((row) => activeTrainerSet.has(text(row.trainer)))
    .map((row) => ({
      class_no: String(row.class_no || ""),
      entry_no: text(row.entry_no),
      horse: text(row.horse),
      trainer: text(row.trainer)
    }));
  const renderedHorseText = renderedRows.map((row) => text(row.sched_horses)).join("|");
  const missing = expected.filter((row) => row.horse && !renderedHorseText.includes(horseDisplayName(row.horse, meta.horseDisplays)));
  return {
    active_trainers: [...activeTrainerSet],
    audited_classes: classNos.length,
    expected_active_entries: expected.length,
    rendered_rows_with_horses: renderedRows.filter((row) => text(row.sched_horses)).length,
    missing_active_entries: missing
  };
}

async function buildFocusDaySnapshot(app, showNo, focusDay) {
  const schedule = dedupeFocusScheduleRows(await getFocusSchedule(app, showNo, focusDay, { limit: 300, offset: 0 }))
    .filter((row) => intOrNull(row.class_no) > 0);
  const classNos = [...new Set(schedule.map((row) => String(row.class_no || "")).filter(Boolean))];
  const classesByNo = await getClassesForSchedule(app, showNo, classNos);
  const allClassRows = await getClassRowsForShow(app, showNo);
  const entries = await getEntriesForClasses(app, showNo, classNos);
  const scheduleByClassNo = new Map(schedule.map((row) => [String(row.class_no || ""), row]));

  const updateSchedule = schedule.map((row) => {
    const classRow = classesByNo.get(String(row.class_no)) || {};
    const classLabel = text(classRow.class_label || row.class_name);
    return {
      show_no: Number(showNo),
      focus_day: focusDay,
      ring_day_no: intOrNull(row.ring_day_no),
      ring_no: intOrNull(row.ring_no),
      ring_name: row.ring_name,
      date_text: focusDay,
      class_no: intOrNull(row.class_no),
      event_name: classLabel || row.class_name,
      time_text: displayTimeFromStart(row.class_start_time),
      time: row.class_start_time || "",
      entry_count: intOrNull(row.entry_count),
      source: "update_schedule.php"
    };
  });

  const focusClassNoSet = new Set(classNos.map(String));
  const counts = allClassRows
    .filter((row) => focusClassNoSet.has(String(row.class_no || "")))
    .map((row) => ({
    show_no: Number(showNo),
    class_no: intOrNull(row.class_no),
    class_number: intOrNull(classNumberFromLabel(row, row.class_no)),
    class_name: classDisplayFromLabel(row, row.class_name),
    entry_count: intOrNull(row.entry_count)
  })).filter((row) => row.class_no);

  const classOog = entries.map((entry) => {
    const scheduleRow = scheduleByClassNo.get(String(entry.class_no || "")) || {};
    const classRow = classesByNo.get(String(entry.class_no || "")) || {};
    const classLabel = text(classRow.class_label || scheduleRow.class_name);
    return {
      ring: scheduleRow.ring_name || "",
      ring_no: intOrNull(scheduleRow.ring_no),
      ring_day_no: intOrNull(scheduleRow.ring_day_no),
      class_order: null,
      class_no: intOrNull(entry.class_no),
      class_label: classLabel,
      entry_order: intOrNull(entry.entry_order),
      entry_no: intOrNull(entry.entry_no),
      horse: entry.horse || "",
      rider: entry.rider || "",
      trainer: entry.trainer || "",
      source: "class_oog.php"
    };
  }).filter((row) => row.class_no && row.entry_no);

  const helperCandidates = {
    horses: [...new Set(classOog.map((row) => row.horse).filter(Boolean))].map((horse) => ({
      horse,
      trainer: classOog.find((row) => row.horse === horse)?.trainer || "",
      source: "class_oog.php"
    })),
    riders: [...new Set(classOog.map((row) => row.rider).filter(Boolean))].map((rider) => ({
      rider,
      trainer: classOog.find((row) => row.rider === rider)?.trainer || "",
      source: "class_oog.php"
    })),
    trainers: [...new Set(classOog.map((row) => row.trainer).filter(Boolean))].map((trainer) => ({
      trainer,
      source: "class_oog.php"
    }))
  };

  return {
    show_no: showNo,
    focus_day: focusDay,
    update_schedule: updateSchedule,
    counts,
    class_oog: classOog,
    helpers: helperCandidates
  };
}

async function getActiveTrainers(app, showNo) {
  const query = [
    "SELECT ROWID, show_no, trainer, trainer_display, active",
    `FROM ${TABLES.trainers}`,
    `WHERE show_no = ${zcqlValue(showNo)}`,
    "LIMIT 300"
  ].join(" ");
  try {
    const rows = (await app.zcql().executeZCQLQuery(query) || [])
      .map((item) => item?.[TABLES.trainers])
      .filter(Boolean);
    return rows
      .filter((row) => {
        const active = String(row.active ?? "").trim().toLowerCase();
        return active === "1" || active === "true" || active === "yes";
      })
      .map((row) => text(row.trainer))
      .filter(Boolean);
  } catch (error) {
    return getAirtableActiveTrainers();
  }
}

async function getActiveTrainerConfig(app, showNo) {
  const query = [
    "SELECT ROWID, show_no, trainer, trainer_display, active",
    `FROM ${TABLES.trainers}`,
    `WHERE show_no = ${zcqlValue(showNo)}`,
    "LIMIT 300"
  ].join(" ");
  try {
    const rows = (await app.zcql().executeZCQLQuery(query) || [])
      .map((item) => item?.[TABLES.trainers])
      .filter(Boolean)
      .filter((row) => {
        const active = String(row.active ?? "").trim().toLowerCase();
        return active === "1" || active === "true" || active === "yes";
      });
    return {
      active_trainers: rows.map((row) => text(row.trainer)).filter(Boolean),
      trainer_displays: Object.fromEntries(rows
        .map((row) => [text(row.trainer), text(row.trainer_display) || text(row.trainer)])
        .filter(([trainer]) => trainer))
    };
  } catch {
    const debug = await getAirtableActiveTrainerDebug();
    return {
      active_trainers: debug.active_trainers || [],
      trainer_displays: debug.trainer_displays || {}
    };
  }
}

async function getActiveTrainerDebug(app, showNo) {
  const airtable = await getAirtableActiveTrainerDebug();
  const query = [
    "SELECT ROWID, show_no, trainer, trainer_display, active",
    `FROM ${TABLES.trainers}`,
    `WHERE show_no = ${zcqlValue(showNo)}`,
    "LIMIT 20"
  ].join(" ");
  try {
    const rows = (await app.zcql().executeZCQLQuery(query) || [])
      .map((item) => item?.[TABLES.trainers])
      .filter(Boolean);
    return {
      catalyst: {
        ok: true,
        query,
        rows,
        active_trainers: rows
          .filter((row) => {
            const active = String(row.active ?? "").trim().toLowerCase();
            return active === "1" || active === "true" || active === "yes";
          })
          .map((row) => text(row.trainer))
          .filter(Boolean),
        trainer_displays: Object.fromEntries(rows
          .filter((row) => {
            const active = String(row.active ?? "").trim().toLowerCase();
            return active === "1" || active === "true" || active === "yes";
          })
          .map((row) => [text(row.trainer), text(row.trainer_display) || text(row.trainer)])
          .filter(([trainer]) => trainer))
      },
      airtable
    };
  } catch (error) {
    return {
      catalyst: {
        ok: false,
        query,
        error: error.message
      },
      airtable
    };
  }
}

async function getAirtableActiveTrainers() {
  const debug = await getAirtableActiveTrainerDebug();
  return debug.active_trainers || [];
}

async function getAirtableActiveTrainerDebug() {
  if (!AIRTABLE_TOKEN_FALLBACK) {
    return { ok: false, source: "airtable.trainers", error: "Missing AIRTABLE_TOKEN fallback", active_trainers: [] };
  }
  const formula = encodeURIComponent("{active}=TRUE()");
  const url = `https://api.airtable.com/v0/${encodeURIComponent(WEC_AIRTABLE_BASE_ID)}/trainers?filterByFormula=${formula}&pageSize=100`;
  try {
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${AIRTABLE_TOKEN_FALLBACK}`
      }
    });
    if (!response.ok) {
      return { ok: false, source: "airtable.trainers", status: response.status, error: await response.text(), active_trainers: [] };
    }
    const payload = await response.json();
    const rows = (payload.records || [])
      .map((record) => record.fields || {})
      .filter((fields) => text(fields.trainer));
    return {
      ok: true,
      source: "airtable.trainers",
      rows: rows.length,
      active_trainers: rows.map((fields) => text(fields.trainer)).filter(Boolean),
      trainer_displays: Object.fromEntries(rows
        .map((fields) => [text(fields.trainer), text(fields.trainer_display) || text(fields.trainer)])
        .filter(([trainer]) => trainer))
    };
  } catch (error) {
    return { ok: false, source: "airtable.trainers", error: error.message, active_trainers: [] };
  }
}

function airtableRecordIdFormula(recordIds = []) {
  const ids = [...new Set((recordIds || []).map(text).filter(Boolean))];
  if (!ids.length) return "";
  return `OR(${ids.map((id) => `RECORD_ID()='${id.replace(/'/g, "\\'")}'`).join(",")})`;
}

async function getAirtableActiveTrainerEntryScope(showNo) {
  if (!AIRTABLE_TOKEN_FALLBACK) {
    return {
      ok: false,
      source: "airtable.trainers.active_entries",
      error: "Missing AIRTABLE_TOKEN fallback",
      active_trainers: [],
      active_entry_record_ids: [],
      active_entry_nos: []
    };
  }
  const trainerRows = await airtableListRecords("trainers", {
    filterByFormula: "{active}=TRUE()"
  });
  const activeTrainers = trainerRows
    .map((record) => text(record.fields?.trainer))
    .filter(Boolean);
  const entryRecordIds = [...new Set(trainerRows.flatMap((record) => [
    ...linkedRecordIds(record.fields?.entries),
    ...linkedRecordIds(record.fields?.active_entries),
    ...linkedRecordIds(record.fields?.["active_entries 2"])
  ]))];
  const entryRows = [];
  for (let index = 0; index < entryRecordIds.length; index += 50) {
    const chunk = entryRecordIds.slice(index, index + 50);
    const formula = airtableRecordIdFormula(chunk);
    if (!formula) continue;
    entryRows.push(...await airtableListRecords("entries", {
      filterByFormula: formula
    }));
  }
  const activeEntryNos = entryRows
    .filter((record) => {
      const rowShowNo = text(record.fields?.show_no || firstValue(record.fields?.["show_no (from shows)"]));
      return !rowShowNo || rowShowNo === text(showNo);
    })
    .map((record) => text(record.fields?.entry_no))
    .filter(Boolean);
  return {
    ok: true,
    source: "airtable.trainers.active_entries",
    active_trainers: activeTrainers,
    active_trainer_records: trainerRows.length,
    active_entry_record_ids: entryRecordIds,
    active_entry_nos: [...new Set(activeEntryNos)]
  };
}

async function airtableListRecords(table, params = {}) {
  const token = runtimeAirtableToken || AIRTABLE_TOKEN_FALLBACK;
  if (!token) {
    throw new Error("Missing AIRTABLE_TOKEN fallback");
  }
  const records = [];
  let offset = "";
  do {
    const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(WEC_AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "100");
    for (const [key, value] of Object.entries(params || {})) {
      if (value !== null && value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) {
      throw new Error(`Airtable ${table} failed ${response.status}: ${await response.text()}`);
    }
    const payload = await response.json();
    records.push(...(payload.records || []));
    offset = payload.offset || "";
  } while (offset);
  return records;
}

async function airtableListRecordsWindow(table, { offset = 0, limit = 25, returnFieldsByFieldId = false } = {}) {
  const token = runtimeAirtableToken || AIRTABLE_TOKEN_FALLBACK;
  if (!token) {
    throw new Error("Missing AIRTABLE_TOKEN fallback");
  }
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
  const targetCount = safeOffset + safeLimit + 1;
  const records = [];
  let airtableOffset = "";
  do {
    const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(WEC_AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", String(Math.min(100, targetCount - records.length)));
    url.searchParams.set("maxRecords", String(targetCount));
    if (returnFieldsByFieldId) url.searchParams.set("returnFieldsByFieldId", "true");
    if (airtableOffset) url.searchParams.set("offset", airtableOffset);
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) {
      throw new Error(`Airtable ${table} window failed ${response.status}: ${await response.text()}`);
    }
    const payload = await response.json();
    records.push(...(payload.records || []));
    airtableOffset = payload.offset || "";
  } while (airtableOffset && records.length < targetCount);
  const windowRecords = records.slice(safeOffset, safeOffset + safeLimit);
  const hasMore = records.length > safeOffset + safeLimit || Boolean(airtableOffset);
  return {
    records: windowRecords,
    offset: safeOffset,
    limit: safeLimit,
    processed_records: windowRecords.length,
    next_offset: hasMore ? safeOffset + windowRecords.length : null,
    has_more: hasMore,
    source_records_total: hasMore ? safeOffset + windowRecords.length + 1 : safeOffset + windowRecords.length,
    source_records_total_is_exact: !hasMore
  };
}

async function airtableBaseMetadataTables() {
  const token = runtimeAirtableToken || AIRTABLE_TOKEN_FALLBACK;
  if (!token) {
    throw new Error("Missing AIRTABLE_TOKEN fallback");
  }
  const response = await fetch(`https://api.airtable.com/v0/meta/bases/${encodeURIComponent(WEC_AIRTABLE_BASE_ID)}/tables`, {
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Airtable metadata failed ${response.status}: ${raw.slice(0, 500)}`);
  return JSON.parse(raw).tables || [];
}

async function airtableCreateTable(tableName, fields) {
  const token = runtimeAirtableToken || AIRTABLE_TOKEN_FALLBACK;
  if (!token) {
    throw new Error("Missing AIRTABLE_TOKEN fallback");
  }
  const response = await fetch(`https://api.airtable.com/v0/meta/bases/${encodeURIComponent(WEC_AIRTABLE_BASE_ID)}/tables`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ name: tableName, fields })
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Airtable create table ${tableName} failed ${response.status}: ${raw.slice(0, 500)}`);
  return JSON.parse(raw);
}

async function airtableCreateField(tableId, field) {
  const token = runtimeAirtableToken || AIRTABLE_TOKEN_FALLBACK;
  if (!token) {
    throw new Error("Missing AIRTABLE_TOKEN fallback");
  }
  const response = await fetch(`https://api.airtable.com/v0/meta/bases/${encodeURIComponent(WEC_AIRTABLE_BASE_ID)}/tables/${encodeURIComponent(tableId)}/fields`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(field)
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Airtable create field ${field.name} failed ${response.status}: ${raw.slice(0, 500)}`);
  return JSON.parse(raw);
}

async function airtableCreateRecord(table, fields) {
  const token = runtimeAirtableToken || AIRTABLE_TOKEN_FALLBACK;
  if (!token) {
    throw new Error("Missing AIRTABLE_TOKEN fallback");
  }
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(WEC_AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ records: [{ fields }], typecast: true })
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Airtable create ${table} failed ${response.status}: ${raw.slice(0, 500)}`);
  return JSON.parse(raw).records?.[0] || null;
}

async function airtableUpsertByFieldId(table, mergeFieldId, records) {
  const token = runtimeAirtableToken || AIRTABLE_TOKEN_FALLBACK;
  if (!token) {
    throw new Error("Missing AIRTABLE_TOKEN fallback");
  }
  const results = [];
  for (let index = 0; index < records.length; index += 10) {
    const chunk = records.slice(index, index + 10).filter(Boolean);
    if (!chunk.length) continue;
    const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(WEC_AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        records: chunk.map((fields) => ({ fields })),
        performUpsert: { fieldsToMergeOn: [mergeFieldId] },
        typecast: true
      })
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Airtable upsert ${table} failed ${response.status}: ${raw.slice(0, 500)}`);
    results.push(...(JSON.parse(raw).records || []));
  }
  return results;
}

async function airtableUpdateRecordsById(table, records) {
  const token = runtimeAirtableToken || AIRTABLE_TOKEN_FALLBACK;
  if (!token) {
    throw new Error("Missing AIRTABLE_TOKEN fallback");
  }
  const results = [];
  for (let index = 0; index < records.length; index += 10) {
    const chunk = records.slice(index, index + 10).filter((record) => record?.id && record?.fields);
    if (!chunk.length) continue;
    const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(WEC_AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        records: chunk.map((record) => ({ id: record.id, fields: record.fields })),
        typecast: true
      })
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Airtable update ${table} failed ${response.status}: ${raw.slice(0, 500)}`);
    results.push(...(JSON.parse(raw).records || []));
  }
  return results;
}

async function airtableDeleteRecords(table, recordIds) {
  const token = runtimeAirtableToken || AIRTABLE_TOKEN_FALLBACK;
  if (!token) {
    throw new Error("Missing AIRTABLE_TOKEN fallback");
  }
  let deleted = 0;
  for (let index = 0; index < recordIds.length; index += 10) {
    const chunk = recordIds.slice(index, index + 10).filter(Boolean);
    if (!chunk.length) continue;
    const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(WEC_AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
    for (const id of chunk) url.searchParams.append("records[]", id);
    const response = await fetch(url.toString(), {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Airtable delete ${table} failed ${response.status}: ${raw.slice(0, 500)}`);
    deleted += (JSON.parse(raw).records || []).filter((record) => record.deleted).length;
  }
  return deleted;
}

function airtableScopedScheduleFormula(showNo, focusDay, ringDayNo = "") {
  const clauses = [
    `{show_no}=${Number(showNo)}`,
    `IS_SAME({iso_date},DATETIME_PARSE(${airtableFormulaValue(focusDay)}),'day')`
  ];
  if (text(ringDayNo)) clauses.push(`{ring_day_no}=${Number(ringDayNo)}`);
  return `AND(${clauses.join(",")})`;
}

function airtableConfirmedDeleteFormula(showNo, focusDay = "", ringDayNo = "") {
  const clauses = [
    "{confirm_delete}=1",
    `{show_no}=${Number(showNo)}`
  ];
  if (text(focusDay)) clauses.push(`IS_SAME({iso_date},DATETIME_PARSE(${airtableFormulaValue(focusDay)}),'day')`);
  if (text(ringDayNo)) clauses.push(`{ring_day_no}=${Number(ringDayNo)}`);
  return `AND(${clauses.join(",")})`;
}

async function deleteAirtableRowsNotInKeys(table, keyFieldId, records, activeKeys) {
  const staleIds = (records || [])
    .filter((record) => {
      const key = text(record.fields?.[keyFieldId]);
      return key && !activeKeys.has(key);
    })
    .map((record) => record.id)
    .filter(Boolean);
  return airtableDeleteRecords(table, staleIds);
}

async function deleteRawAirtableUpdateScheduleNonClassRows(showNo, focusDay, ringDayNo) {
  const safeFocusDay = dateKey(focusDay);
  if (!text(showNo) || !safeFocusDay || !text(ringDayNo)) {
    return { scanned: 0, deleted: 0, skipped: true, reason: "show_no_focus_day_ring_day_no_required" };
  }
  const rows = await airtableListRecords(AIRTABLE_RAW_UPDATE_SCHEDULE_TABLE, {
    filterByFormula: airtableScopedScheduleFormula(showNo, safeFocusDay, ringDayNo),
    returnFieldsByFieldId: "false"
  });
  const staleIds = (rows || [])
    .filter((record) => intValue(record.fields?.class_no) <= 0)
    .map((record) => record.id)
    .filter(Boolean);
  const deleted = await airtableDeleteRecords(AIRTABLE_RAW_UPDATE_SCHEDULE_TABLE, staleIds);
  return {
    scanned: rows.length,
    focus_day: safeFocusDay,
    ring_day_no: text(ringDayNo),
    deleted
  };
}

function airtableUpdateScheduleRecordKey(record) {
  const fields = record?.fields || {};
  return text(fields[AIRTABLE_UPDATE_SCHEDULE_FIELDS.mirror_update_schedule_key] || fields.mirror_update_schedule_key || fields.update_schedule_key);
}

async function readConfirmedDeleteUpdateScheduleRows(showNo, { focusDay = "", ringDayNo = "" } = {}) {
  return airtableListRecords(AIRTABLE_UPDATE_SCHEDULE_TABLE, {
    filterByFormula: airtableConfirmedDeleteFormula(showNo, focusDay, ringDayNo),
    returnFieldsByFieldId: "true"
  });
}

async function buildConfirmedDeleteUpdateSchedulePlan(app, showNo, { focusDay = "", ringDayNo = "" } = {}) {
  const rows = await readConfirmedDeleteUpdateScheduleRows(showNo, { focusDay, ringDayNo });
  const candidates = [];
  const missingKeys = [];
  const missingCatalystMatches = [];
  const duplicateCatalystKeyBlockers = [];
  for (const record of rows) {
    const key = airtableUpdateScheduleRecordKey(record);
    if (!key) {
      missingKeys.push({ airtable_record_id: record.id });
      continue;
    }
    const matches = await getUpdateScheduleRowsByKey(app, key, 10);
    if (!matches.length) {
      missingCatalystMatches.push({ airtable_record_id: record.id, update_schedule_key: key });
      candidates.push({ airtable_record_id: record.id, update_schedule_key: key, catalyst_row_ids: [] });
      continue;
    }
    if (matches.length > 1) {
      duplicateCatalystKeyBlockers.push({
        airtable_record_id: record.id,
        update_schedule_key: key,
        catalyst_row_ids: matches.map((row) => text(row.ROWID)).filter(Boolean)
      });
      continue;
    }
    candidates.push({
      airtable_record_id: record.id,
      update_schedule_key: key,
      catalyst_row_ids: matches.map((row) => text(row.ROWID)).filter(Boolean)
    });
  }
  return {
    confirmed_delete_rows: rows.length,
    confirmed_delete_keys: rows.map(airtableUpdateScheduleRecordKey).filter(Boolean),
    catalyst_delete_candidates: candidates,
    missing_confirm_delete_keys: missingKeys,
    missing_catalyst_matches: missingCatalystMatches,
    duplicate_catalyst_key_blockers: duplicateCatalystKeyBlockers
  };
}

async function deleteConfirmedUpdateScheduleCatalystRows(app, plan) {
  if (plan.duplicate_catalyst_key_blockers?.length) {
    throw new Error(`confirm_delete blocked by duplicate hs_update_schedule keys: ${JSON.stringify(plan.duplicate_catalyst_key_blockers.slice(0, 5))}`);
  }
  const rowIds = [...new Set((plan.catalyst_delete_candidates || [])
    .flatMap((candidate) => candidate.catalyst_row_ids || [])
    .map(text)
    .filter(Boolean))];
  const table = app.datastore().table(TABLES.updateSchedule);
  let deleted = 0;
  for (let index = 0; index < rowIds.length; index += 100) {
    const batch = rowIds.slice(index, index + 100);
    if (batch.length) {
      await table.deleteRows(batch);
      deleted += batch.length;
    }
  }
  return { deleted, catalyst_row_ids: rowIds };
}

async function applyUpdateScheduleConfirmDeleteGate(app, showNo, { focusDay = "", ringDayNo = "", execute = false } = {}) {
  const plan = await buildConfirmedDeleteUpdateSchedulePlan(app, showNo, { focusDay, ringDayNo });
  if (!plan.confirmed_delete_rows) {
    return {
      ...plan,
      executed: false,
      catalyst_rows_deleted: 0,
      pending_approval: false
    };
  }
  if (!execute) {
    return {
      ...plan,
      executed: false,
      catalyst_rows_deleted: 0,
      pending_approval: true
    };
  }
  const deletion = await deleteConfirmedUpdateScheduleCatalystRows(app, plan);
  return {
    ...plan,
    executed: true,
    catalyst_rows_deleted: deletion.deleted,
    deleted_catalyst_row_ids: deletion.catalyst_row_ids,
    pending_approval: false
  };
}

function hasAirtableProtectedValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = text(value).toLowerCase();
    return Boolean(normalized && normalized !== "0" && normalized !== "false" && normalized !== "no");
  }
  return value !== null && value !== undefined;
}

function protectedStagingFieldsPresent(record) {
  const fields = record?.fields || {};
  return [...AIRTABLE_UPDATE_SCHEDULE_STAGING_PROTECTED_FIELD_IDS]
    .filter((fieldId) => hasAirtableProtectedValue(fields[fieldId]));
}

function assertNoProtectedStagingUpdateFields(fields) {
  const protectedIds = Object.keys(fields || {})
    .filter((fieldId) =>
      AIRTABLE_UPDATE_SCHEDULE_STAGING_PROTECTED_FIELD_IDS.has(fieldId)
      && !AIRTABLE_UPDATE_SCHEDULE_STAGING_STAGE2C_ALLOWED_PROTECTED_FIELD_IDS.has(fieldId)
    );
  if (protectedIds.length) {
    throw new Error(`Stage 2C update payload includes protected update_schedule_staging fields: ${protectedIds.join(",")}`);
  }
  return fields;
}

function updateScheduleStagingCanonicalKey(rowOrFields) {
  const row = rowOrFields || {};
  const get = (name, fieldId) => row[name] ?? row[fieldId];
  return resultKey(
    get("show_no", AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.show_no),
    dateKey(get("focus_day", AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.iso_date) || get("iso_date", AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.iso_date) || get("date_text", AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.date_text)),
    get("ring_day_no", AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.ring_day_no),
    get("ring_no", AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.ring_no),
    get("class_no", AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.class_no)
  );
}

function hasValidStagingClassNo(rowOrFields) {
  const row = rowOrFields || {};
  const raw = row.class_no ?? row[AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.class_no];
  const value = Number(raw);
  return Number.isFinite(value) && value > 0;
}

function sourceUpdateScheduleRecordIds(row) {
  const ids = [
    ...(Array.isArray(row?.update_schedule_record_ids) ? row.update_schedule_record_ids : []),
    row?.update_schedule_record_id
  ].map(text).filter(Boolean);
  return [...new Set(ids)];
}

function mergeUpdateScheduleRowsToClassGrain(rows) {
  const byKey = new Map();
  for (const row of rows || []) {
    const key = updateScheduleStagingCanonicalKey(row);
    if (!key) continue;
    const existing = byKey.get(key);
    const sourceIds = sourceUpdateScheduleRecordIds(row);
    if (!existing) {
      byKey.set(key, { ...row, update_schedule_key: key, source_key: text(row.update_schedule_key), update_schedule_record_ids: sourceIds });
      continue;
    }
    for (const [field, value] of Object.entries(row)) {
      if (field === "update_schedule_record_id" || field === "update_schedule_record_ids") continue;
      if ((existing[field] === null || existing[field] === undefined || existing[field] === "") && value !== null && value !== undefined && value !== "") {
        existing[field] = value;
      }
    }
    existing.update_schedule_record_ids = [...new Set([
      ...sourceUpdateScheduleRecordIds(existing),
      ...sourceIds
    ])];
    const currentEntryCount = intOrNull(existing.entry_count);
    const nextEntryCount = intOrNull(row.entry_count);
    if (nextEntryCount !== null && (currentEntryCount === null || nextEntryCount > currentEntryCount)) {
      existing.entry_count = nextEntryCount;
    }
    existing.update_schedule_key = key;
  }
  return [...byKey.values()];
}

function stagingRecordCanonicalKey(record) {
  return updateScheduleStagingCanonicalKey(record?.fields || {});
}

function stagingClassGrainStatus(records) {
  const active = [];
  const protectedStale = [];
  const groups = new Map();
  for (const record of records || []) {
    const fields = record?.fields || {};
    const key = stagingRecordCanonicalKey(record);
    if (fields[AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.inactive] === true) {
      protectedStale.push(record);
      continue;
    }
    active.push(record);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return {
    active_count: active.length,
    unique_keys: groups.size,
    duplicate_groups: [...groups.values()].filter((group) => group.length > 1).length,
    protected_stale_count: protectedStale.length
  };
}

function protectedFieldMergeValue(current, incoming) {
  if (!hasAirtableProtectedValue(incoming)) return { value: current, conflict: false, changed: false };
  if (!hasAirtableProtectedValue(current)) return { value: incoming, conflict: false, changed: true };
  if (Array.isArray(current) || Array.isArray(incoming)) {
    const values = [...(Array.isArray(current) ? current : [current]), ...(Array.isArray(incoming) ? incoming : [incoming])]
      .map((value) => text(value))
      .filter(Boolean);
    return { value: [...new Set(values)], conflict: false, changed: true };
  }
  if (typeof current === "boolean" || typeof incoming === "boolean") {
    return { value: Boolean(current || incoming), conflict: false, changed: Boolean(current) !== Boolean(current || incoming) };
  }
  if (String(current) === String(incoming)) return { value: current, conflict: false, changed: false };
  return { value: current, conflict: true, changed: false };
}

function protectedFieldScore(record) {
  return protectedStagingFieldsPresent(record).length;
}

function chooseStagingSurvivor(records, key) {
  return [...records].sort((a, b) => (
    protectedFieldScore(b) - protectedFieldScore(a) ||
    Number(text(b.fields?.[AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.staging_key]) === key) - Number(text(a.fields?.[AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.staging_key]) === key) ||
    String(a.createdTime || "").localeCompare(String(b.createdTime || ""))
  ))[0];
}

function buildStagingSurvivorMerge(group, survivor, key, activePayload) {
  const merged = { ...(survivor.fields || {}) };
  const conflicts = [];
  for (const record of group) {
    if (record.id === survivor.id) continue;
    for (const fieldId of AIRTABLE_UPDATE_SCHEDULE_STAGING_WRITABLE_PROTECTED_FIELD_IDS) {
      const result = protectedFieldMergeValue(merged[fieldId], record.fields?.[fieldId]);
      if (result.conflict) {
        conflicts.push({
          field_id: fieldId,
          survivor: merged[fieldId],
          duplicate: record.fields?.[fieldId],
          duplicate_record_id: record.id
        });
      } else if (result.changed) {
        merged[fieldId] = result.value;
      }
    }
  }
  const updateFields = {
    ...(activePayload || {}),
    [AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.staging_key]: key
  };
  for (const fieldId of AIRTABLE_UPDATE_SCHEDULE_STAGING_WRITABLE_PROTECTED_FIELD_IDS) {
    if (hasAirtableProtectedValue(merged[fieldId])) updateFields[fieldId] = merged[fieldId];
  }
  return { fields: updateFields, conflicts };
}

async function dedupeUpdateScheduleStagingClassGrain(records, activePayloadsByKey) {
  const groups = new Map();
  for (const record of records || []) {
    const key = stagingRecordCanonicalKey(record);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  const updates = [];
  const duplicateInactiveUpdates = [];
  const conflicts = [];
  const processed = [];
  let protectedValuesMerged = 0;
  let checkboxTrueValuesPreserved = 0;
  let linksUnioned = 0;
  for (const [key, group] of groups.entries()) {
    if (group.length < 2) continue;
    const survivor = chooseStagingSurvivor(group, key);
    const { fields, conflicts: groupConflicts } = buildStagingSurvivorMerge(group, survivor, key, activePayloadsByKey.get(key));
    if (groupConflicts.length) {
      conflicts.push({ key, survivor_record_id: survivor.id, conflicts: groupConflicts });
      continue;
    }
    for (const fieldId of AIRTABLE_UPDATE_SCHEDULE_STAGING_WRITABLE_PROTECTED_FIELD_IDS) {
      const value = fields[fieldId];
      if (hasAirtableProtectedValue(value)) protectedValuesMerged += 1;
      if (value === true) checkboxTrueValuesPreserved += 1;
      if (Array.isArray(value) && value.length) linksUnioned += 1;
    }
    updates.push({ id: survivor.id, fields });
    for (const record of group) {
      if (record.id !== survivor.id) {
        duplicateInactiveUpdates.push({
          id: record.id,
          fields: { [AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.inactive]: true }
        });
      }
    }
    processed.push({ key, survivor_record_id: survivor.id, duplicate_records: group.length - 1 });
  }
  if (conflicts.length) {
    return {
      status: "CONFLICT",
      processed: processed.length,
      merged: 0,
      skipped_due_to_conflict: conflicts.length,
      conflict_detail: conflicts,
      protected_values_merged: protectedValuesMerged,
      checkbox_true_values_preserved: checkboxTrueValuesPreserved,
      links_unioned: linksUnioned,
      deleted: 0
    };
  }
  await airtableUpdateRecordsById(AIRTABLE_UPDATE_SCHEDULE_STAGING_TABLE, updates);
  const markedInactive = await airtableUpdateRecordsById(AIRTABLE_UPDATE_SCHEDULE_STAGING_TABLE, duplicateInactiveUpdates);
  return {
    status: "PASS",
    processed: processed.length,
    merged: processed.length,
    skipped_due_to_conflict: 0,
    conflict_detail: [],
    protected_values_merged: protectedValuesMerged,
    checkbox_true_values_preserved: checkboxTrueValuesPreserved,
    links_unioned: linksUnioned,
    deleted: 0,
    duplicate_rows_marked_inactive: markedInactive.length
  };
}

async function markStaleAirtableRowsInactiveNotInKeys(table, keyFieldId, records, activeKeys) {
  const unprotectedStale = [];
  const protectedStale = [];
  for (const record of records || []) {
    const key = text(record.fields?.[keyFieldId]);
    if (!key || activeKeys.has(key)) continue;
    const protectedFields = protectedStagingFieldsPresent(record);
    if (protectedFields.length) {
      protectedStale.push({ id: record.id, key, protected_fields: protectedFields });
    } else {
      unprotectedStale.push({ id: record.id, key, protected_fields: [] });
    }
  }
  const staleRows = [...protectedStale, ...unprotectedStale];
  const markedStale = await airtableUpdateRecordsById(table, staleRows.map((record) => ({
    id: record.id,
    fields: { [AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.inactive]: true }
  })));
  return {
    deleted: 0,
    protected_stale_preserved: protectedStale.length,
    protected_stale_marked: protectedStale.length,
    protected_stale_records: protectedStale,
    unprotected_stale_marked: unprotectedStale.length,
    stale_marked_inactive: markedStale.length
  };
}

function updateScheduleRawKey(showNo, focusDay, ringDayNo) {
  return resultKey(showNo, dateKey(focusDay) || "no-focus-day", ringDayNo);
}

function classOogRawKey(showNo, focusDay, ringDayNo, ringNo, classNo) {
  return resultKey(showNo, dateKey(focusDay) || "no-focus-day", ringDayNo, ringNo, classNo);
}

function canonicalClassOogKey(showNo, focusDay, ringDayNo, ringNo, classNo, entryNo) {
  return resultKey(showNo, dateKey(focusDay) || "no-focus-day", ringDayNo, ringNo, classNo, entryNo);
}

function catalystDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return catalystDateTime(new Date());
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

function assertNoUpdateScheduleManualMirrorFields(fields) {
  const blocked = Object.keys(fields || {}).filter((fieldId) => AIRTABLE_UPDATE_SCHEDULE_MANUAL_FIELD_IDS.has(fieldId));
  if (blocked.length) {
    throw new Error(`update_schedule mirror payload includes protected manual fields: ${blocked.join(",")}`);
  }
  return fields;
}

function mapGetRingDayFields(row) {
  const fields = {
    [AIRTABLE_GET_RING_DAYS_FIELDS.ring_day_no]: intValue(row.ring_day_no),
    [AIRTABLE_GET_RING_DAYS_FIELDS.show_no]: intValue(row.show_no),
    [AIRTABLE_GET_RING_DAYS_FIELDS.ring_no]: intValue(row.ring_no),
    [AIRTABLE_GET_RING_DAYS_FIELDS.ring_name]: text(row.ring_name),
    [AIRTABLE_GET_RING_DAYS_FIELDS.date_text]: text(row.day_label || row.date_text)
  };
  return fields;
}

function normalizedWecRingName(value) {
  const raw = text(value).toUpperCase();
  const match = raw.match(/GRAND|ANNEX|STADIUM|INDOOR [1-6]|HUNTER 2/);
  return match?.[0] || "";
}

function visualRingName(value) {
  return text(value).toLowerCase();
}

function visualKeyRingToken(value) {
  return visualRingName(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function ringVisualKey(ringNo, ringNameNormalized) {
  const token = visualKeyRingToken(ringNameNormalized);
  return intValue(ringNo) && token ? `${intValue(ringNo)}|${token}` : "";
}

function classVisualKey(ringNameNormalized, classNo) {
  const token = visualKeyRingToken(ringNameNormalized);
  return token && intValue(classNo) ? `${token}|${intValue(classNo)}` : "";
}

function entryVisualKey(ringNameNormalized, classNo, entryNo) {
  const classKey = classVisualKey(ringNameNormalized, classNo);
  return classKey && intValue(entryNo) ? `${classKey}|${intValue(entryNo)}` : "";
}

function uniqueRowsByKey(rows, keyField) {
  const byKey = new Map();
  for (const row of rows || []) {
    const key = text(row?.[keyField]);
    if (key) byKey.set(key, row);
  }
  return [...byKey.values()];
}

function prioritizedWecRingName(value) {
  const raw = text(value).toUpperCase();
  const match = raw.match(/WEC GRAND ARENA|ANNEX RING|\bANNEX\b|STADIUM|INDOOR [1-6]|HUNTER 2/);
  const key = match?.[0] || "";
  return ({
    "WEC GRAND ARENA": 1,
    "ANNEX RING": 2,
    ANNEX: 2,
    STADIUM: 3,
    "INDOOR 1": 11,
    "INDOOR 2": 12,
    "INDOOR 3": 13,
    "INDOOR 4": 14,
    "INDOOR 5": 15,
    "INDOOR 6": 16,
    "HUNTER 2": 22
  })[key] || null;
}

async function syncAirtableGetRingDayRows(showNo, rows) {
  const sourceRows = rows
    .filter((row) => intValue(row.show_no || showNo) === intValue(showNo))
    .filter((row) => intValue(row.ring_day_no) > 0);
  const upserts = await airtableUpsertByFieldId(
    AIRTABLE_GET_RING_DAYS_TABLE,
    AIRTABLE_GET_RING_DAYS_FIELDS.ring_day_no,
    sourceRows.map(mapGetRingDayFields)
  );
  return {
    get_ring_days_rows: sourceRows.length,
    get_ring_days_upserts: upserts.length
  };
}

function mapRawAirtableGetRingDayFields(row, showNo, { heartbeatId = "", runId = "" } = {}) {
  const isoDate = dateKey(row.day_label || row.date_text);
  const focusDayKey = isoDate ? isoDate.replace(/-/g, "") : "";
  const ringDayNo = intValue(row.ring_day_no);
  const ringNo = intValue(row.ring_no);
  return {
    ring_day_key: resultKey(showNo, ringDayNo, ringNo),
    heartbeat_id: heartbeatId,
    run_id: runId,
    show_no: intValue(row.show_no || showNo),
    focus_day: isoDate,
    focus_day_key: focusDayKey,
    show_focus_key: focusDayKey ? `${showNo}|${focusDayKey}` : "",
    ring_day_no: ringDayNo,
    ring_no: ringNo,
    ring_name: text(row.ring_name),
    ring_name_normalized: normalizedWecRingName(row.ring_name),
    ring_name_prioritized: prioritizedWecRingName(row.ring_name),
    date_text: isoDate ? displayDateText(isoDate) : text(row.day_label || row.date_text),
    iso_date: isoDate,
    source_endpoint: "get_ring_days.php",
    source_row_json: sourcePayload({ ...row, source_endpoint: "get_ring_days.php" })
  };
}

async function syncRawAirtableGetRingDayRows(showNo, rows, options = {}) {
  const sourceRows = (rows || [])
    .filter((row) => intValue(row.show_no || showNo) === intValue(showNo))
    .filter((row) => intValue(row.ring_day_no) > 0)
    .map((row) => mapRawAirtableGetRingDayFields(row, showNo, options));
  const upserts = await airtableUpsertByFieldId(
    AIRTABLE_RAW_GET_RING_DAYS_TABLE,
    "ring_day_key",
    sourceRows
  );
  return {
    airtable_hs_get_ring_days_rows: sourceRows.length,
    airtable_hs_get_ring_days_upserts: upserts.length
  };
}

const RAW_UPDATE_SCHEDULE_REQUIRED_FIELDS = [
  "update_schedule_key",
  "heartbeat_id",
  "run_id",
  "show_no",
  "focus_day",
  "focus_day_key",
  "show_focus_key",
  "ring_day_no",
  "ring_no",
  "ring_name",
  "date_text",
  "iso_date",
  "class_no",
  "event_id",
  "event_name",
  "class_number",
  "class_payout",
  "class_name",
  "time_text",
  "entry_count",
  "event_type",
  "oc_id",
  "live_flag",
  "source_endpoint",
  "source_payload"
];
const RAW_UPDATE_SCHEDULE_OPTIONAL_FIELDS = [
  "hs_is_preflight",
  "preflight_reason"
];
const RAW_UPDATE_SCHEDULE_CREATE_OPTIONAL_FIELDS = [
  { name: "hs_is_preflight", type: "checkbox", options: { icon: "check", color: "greenBright" } }
];

async function ensureRawAirtableUpdateScheduleTable() {
  const tables = await airtableBaseMetadataTables();
  const existing = (tables || []).find((table) => table.name === AIRTABLE_RAW_UPDATE_SCHEDULE_TABLE);
  if (existing) {
    const fields = [...(existing.fields || [])];
    const existingFields = new Set(fields.map((field) => field.name));
    const missing = RAW_UPDATE_SCHEDULE_REQUIRED_FIELDS.filter((field) => !existingFields.has(field));
    if (missing.length) {
      throw new Error(`Airtable ${AIRTABLE_RAW_UPDATE_SCHEDULE_TABLE} missing required fields: ${missing.join(", ")}`);
    }
    const optionalFieldsCreated = [];
    for (const field of RAW_UPDATE_SCHEDULE_CREATE_OPTIONAL_FIELDS) {
      if (existingFields.has(field.name)) continue;
      const created = await airtableCreateField(existing.id, field);
      fields.push(created);
      existingFields.add(field.name);
      optionalFieldsCreated.push(field.name);
    }
    const optionalFields = RAW_UPDATE_SCHEDULE_OPTIONAL_FIELDS.filter((field) => existingFields.has(field));
    return {
      created: false,
      table_id: existing.id,
      fields: fields.map((field) => ({ name: field.name, type: field.type })),
      optional_fields: optionalFields,
      optional_fields_skipped: RAW_UPDATE_SCHEDULE_OPTIONAL_FIELDS.filter((field) => !existingFields.has(field)),
      optional_fields_created: optionalFieldsCreated
    };
  }
  const fields = RAW_UPDATE_SCHEDULE_REQUIRED_FIELDS.map((name) => ({
    name,
    type: name === "source_payload" ? "multilineText" : "singleLineText"
  })).concat(RAW_UPDATE_SCHEDULE_CREATE_OPTIONAL_FIELDS);
  const created = await airtableCreateTable(AIRTABLE_RAW_UPDATE_SCHEDULE_TABLE, fields);
  return {
    created: true,
    table_id: created.id,
    fields: (created.fields || []).map((field) => ({ name: field.name, type: field.type })),
    optional_fields: RAW_UPDATE_SCHEDULE_OPTIONAL_FIELDS.filter((field) => field === "hs_is_preflight"),
    optional_fields_skipped: RAW_UPDATE_SCHEDULE_OPTIONAL_FIELDS.filter((field) => field !== "hs_is_preflight"),
    optional_fields_created: ["hs_is_preflight"]
  };
}

function mapRawAirtableUpdateScheduleFields(row, showNo, focusDay, { heartbeatId = "", runId = "", optionalFields = [] } = {}) {
  const sourceRow = updateScheduleSourceRow({
    ...row,
    show_no: row.show_no || showNo,
    source_endpoint: "update_schedule.php"
  }) || row;
  const isoDate = dateKey(sourceRow.iso_date || sourceRow.date_text || row.iso_date || row.date_text || row.day_label || focusDay);
  const focusDayKey = isoDate ? isoDate.replace(/-/g, "") : "";
  const preflightReason = updateSchedulePreflightReason({ ...row, ...sourceRow });
  const optionalFieldSet = new Set(optionalFields || []);
  const fields = {
    update_schedule_key: text(sourceRow.update_schedule_key || row.update_schedule_key),
    heartbeat_id: heartbeatId,
    run_id: runId,
    show_no: text(sourceRow.show_no || row.show_no || showNo),
    focus_day: isoDate,
    focus_day_key: focusDayKey,
    show_focus_key: focusDayKey ? `${text(sourceRow.show_no || row.show_no || showNo)}|${focusDayKey}` : "",
    ring_day_no: text(sourceRow.ring_day_no || row.ring_day_no),
    ring_no: text(sourceRow.ring_no || row.ring_no),
    ring_name: text(sourceRow.ring_name || row.ring_name),
    date_text: text(sourceRow.date_text || row.date_text || row.day_label),
    iso_date: isoDate,
    class_no: text(sourceRow.class_no || row.class_no),
    event_id: text(sourceRow.event_id || row.event_id),
    event_name: text(sourceRow.event_name || row.event_name || row.class_label || row.class_name),
    class_number: text(sourceRow.class_number || row.class_number),
    class_payout: text(sourceRow.class_payout || row.class_payout),
    class_name: text(sourceRow.class_name || row.class_name),
    time_text: text(sourceRow.time_text || row.time_text || row.class_time_text),
    entry_count: text(sourceRow.entry_count || row.entry_count),
    event_type: text(sourceRow.event_type || row.event_type || row.re_type),
    oc_id: text(sourceRow.oc_id || row.oc_id),
    live_flag: text(sourceRow.live_flag || row.live_flag),
    source_endpoint: text(sourceRow.source_endpoint || row.source_endpoint || "update_schedule.php"),
    source_payload: sourcePayload(sourceRow.source_payload ? sourceRow : row)
  };
  if (optionalFieldSet.has("hs_is_preflight")) fields.hs_is_preflight = Boolean(preflightReason);
  if (optionalFieldSet.has("preflight_reason")) fields.preflight_reason = preflightReason;
  return fields;
}

async function syncRawAirtableUpdateScheduleRows(showNo, focusDay, rows, options = {}) {
  const tableStatus = await ensureRawAirtableUpdateScheduleTable();
  const optionalFields = tableStatus.optional_fields || [];
  const sourceRows = (rows || [])
    .filter((row) => text(row.update_schedule_key))
    .map((row) => mapRawAirtableUpdateScheduleFields(row, showNo, focusDay, { ...options, optionalFields }));
  const upserts = await airtableUpsertByFieldId(
    AIRTABLE_RAW_UPDATE_SCHEDULE_TABLE,
    "update_schedule_key",
    sourceRows
  );
  return {
    airtable_hs_update_schedule_table_created: tableStatus.created,
    airtable_hs_update_schedule_table_id: tableStatus.table_id,
    airtable_hs_update_schedule_rows: sourceRows.length,
    airtable_hs_update_schedule_upserts: upserts.length,
    optional_fields_written: optionalFields,
    optional_fields_created: tableStatus.optional_fields_created || [],
    optional_fields_skipped: tableStatus.optional_fields_skipped || []
  };
}

const RAW_CLASS_OOG_REQUIRED_FIELDS = [
  "class_oog_key",
  "heartbeat_id",
  "run_id",
  "show_no",
  "focus_day",
  "focus_day_key",
  "show_focus_key",
  "ring_day_no",
  "ring_no",
  "ring",
  "class_no",
  "class_label",
  "class_name",
  "entry_order",
  "entry_no",
  "horse",
  "rider",
  "trainer",
  "source_endpoint",
  "source_payload"
];

async function rawAirtableClassOogTableStatus() {
  const tables = await airtableBaseMetadataTables();
  const existing = (tables || []).find((table) => table.name === AIRTABLE_RAW_CLASS_OOG_TABLE);
  if (!existing) {
    const fields = RAW_CLASS_OOG_REQUIRED_FIELDS.map((name) => ({
      name,
      type: name === "source_payload" ? "multilineText" : "singleLineText"
    }));
    const created = await airtableCreateTable(AIRTABLE_RAW_CLASS_OOG_TABLE, fields);
    return {
      exists: true,
      created: true,
      table_id: created.id,
      missing_fields: [],
      fields: (created.fields || []).map((field) => ({ name: field.name, type: field.type }))
    };
  }
  const existingFields = new Set((existing.fields || []).map((field) => field.name));
  const missing = RAW_CLASS_OOG_REQUIRED_FIELDS.filter((field) => !existingFields.has(field));
  return {
    exists: true,
    created: false,
    table_id: existing.id,
    missing_fields: missing,
    fields: (existing.fields || []).map((field) => ({ name: field.name, type: field.type }))
  };
}

function mapRawAirtableClassOogFields(row, showNo, focusDay, { heartbeatId = "", runId = "" } = {}) {
  const safeFocusDay = dateKey(row.focus_day || focusDay);
  const focusDayKey = safeFocusDay ? safeFocusDay.replace(/-/g, "") : "";
  return {
    class_oog_key: text(row.class_oog_key),
    heartbeat_id: heartbeatId,
    run_id: runId,
    show_no: text(row.show_no || showNo),
    focus_day: safeFocusDay,
    focus_day_key: focusDayKey,
    show_focus_key: focusDayKey ? `${text(row.show_no || showNo)}|${focusDayKey}` : "",
    ring_day_no: text(row.ring_day_no),
    ring_no: text(row.ring_no),
    ring: text(row.ring),
    class_no: text(row.class_no),
    class_label: text(row.class_label),
    class_name: text(row.class_name),
    entry_order: text(row.entry_order),
    entry_no: text(row.entry_no),
    horse: text(row.horse),
    rider: text(row.rider),
    trainer: text(row.trainer),
    source_endpoint: text(row.source_endpoint || "class_oog.php"),
    source_payload: sourcePayload(row)
  };
}

async function syncRawAirtableClassOogRows(showNo, focusDay, rows, options = {}) {
  const tableStatus = await rawAirtableClassOogTableStatus();
  if (!tableStatus.exists || tableStatus.missing_fields?.length) {
    return {
      airtable_hs_class_oog_rows: 0,
      airtable_hs_class_oog_upserts: 0,
      skipped: true,
      table_status: tableStatus
    };
  }
  const sourceRows = (rows || [])
    .filter((row) => text(row.class_oog_key))
    .map((row) => mapRawAirtableClassOogFields(row, showNo, focusDay, options));
  const upserts = await airtableUpsertByFieldId(
    AIRTABLE_RAW_CLASS_OOG_TABLE,
    "class_oog_key",
    sourceRows
  );
  return {
    airtable_hs_class_oog_rows: sourceRows.length,
    airtable_hs_class_oog_upserts: upserts.length,
    skipped: false,
    table_status: tableStatus
  };
}

const RAW_RING_STATUS_REQUIRED_FIELDS = [
  "ring_status_key",
  "show_no",
  "focus_day",
  "ring_day_no",
  "ring_no",
  "ring_name",
  "ring_name_normalized",
  "ring_visual_key",
  "status",
  "source",
  "last_synced_at",
  "is_live",
  "current_class_no",
  "n_gone",
  "n_to_go",
  "elapsed_seconds",
  "live_source",
  "last_live_synced_at"
];

const RAW_CLASS_START_TIMES_REQUIRED_FIELDS = [
  "class_start_key",
  "show_no",
  "focus_day",
  "ring_day_no",
  "ring_no",
  "ring_name",
  "ring_name_normalized",
  "ring_visual_key",
  "class_visual_key",
  "class_no",
  "class_number",
  "class_name",
  "class_start_time",
  "display_time",
  "entry_count",
  "n_gone",
  "n_to_go",
  "elapsed_seconds",
  "status",
  "live_source",
  "last_synced_at",
  "pace_seconds",
  "last_live_synced_at"
];

const RAW_ENTRY_GO_TIMES_REQUIRED_FIELDS = [
  "entry_go_key",
  "show_no",
  "focus_day",
  "ring_name_normalized",
  "ring_visual_key",
  "class_visual_key",
  "entry_visual_key",
  "class_no",
  "entry_no",
  "entry_order",
  "horse",
  "rider",
  "trainer",
  "go_time",
  "status",
  "last_synced_at",
  "pace_seconds",
  "live_source",
  "last_live_synced_at"
];

const RAW_GET_RINGS_REQUIRED_FIELDS = [
  "get_rings_key",
  "show_no",
  "focus_day",
  "ring_no",
  "ring_day_no",
  "class_no",
  "class_text",
  "class_number",
  "entry_no",
  "entry_text",
  "total",
  "n_to_go",
  "n_gone",
  "time_text",
  "timestamp_value",
  "elapsed",
  "status_type",
  "source_payload"
];

const RAW_GET_ORDERS_REQUIRED_FIELDS = [
  "get_orders_key",
  "show_no",
  "focus_day",
  "ring_no",
  "ring_day_no",
  "ring_name",
  "day_text",
  "class_no",
  "class_text",
  "class_number",
  "entry_no",
  "entry_text",
  "total",
  "n_to_go",
  "n_gone",
  "time_text",
  "timestamp_value",
  "elapsed",
  "source_payload"
];

async function rawAirtableStep4MirrorTableStatus(tableName, requiredFields) {
  const tables = await airtableBaseMetadataTables();
  const existing = (tables || []).find((table) => table.name === tableName);
  if (!existing) {
    const fields = requiredFields.map((name) => ({
      name,
      type: "singleLineText"
    }));
    const created = await airtableCreateTable(tableName, fields);
    return {
      exists: true,
      created: true,
      table_id: created.id,
      missing_fields: [],
      fields: (created.fields || []).map((field) => ({ name: field.name, type: field.type }))
    };
  }
  const existingFields = new Set((existing.fields || []).map((field) => field.name));
  const missing = requiredFields.filter((field) => !existingFields.has(field));
  return {
    exists: true,
    created: false,
    table_id: existing.id,
    missing_fields: missing,
    fields: (existing.fields || []).map((field) => ({ name: field.name, type: field.type }))
  };
}

function mapRawAirtableRingStatusFields(row) {
  return {
    ring_status_key: text(row.ring_status_key),
    show_no: text(row.show_no),
    focus_day: dateKey(row.focus_day),
    ring_day_no: text(row.ring_day_no),
    ring_no: text(row.ring_no),
    ring_name: text(row.ring_name),
    ring_name_normalized: text(row.ring_name_normalized),
    ring_visual_key: text(row.ring_visual_key),
    status: text(row.status),
    source: text(row.source),
    last_synced_at: text(row.last_synced_at),
    is_live: text(row.is_live),
    current_class_no: text(row.current_class_no),
    n_gone: text(row.n_gone),
    n_to_go: text(row.n_to_go),
    elapsed_seconds: text(row.elapsed_seconds),
    live_source: text(row.live_source),
    last_live_synced_at: text(row.last_live_synced_at)
  };
}

function mapRawAirtableClassStartFields(row) {
  return {
    class_start_key: text(row.class_start_key),
    show_no: text(row.show_no),
    focus_day: dateKey(row.focus_day),
    ring_day_no: text(row.ring_day_no),
    ring_no: text(row.ring_no),
    ring_name: text(row.ring_name),
    ring_name_normalized: text(row.ring_name_normalized),
    ring_visual_key: text(row.ring_visual_key),
    class_visual_key: text(row.class_visual_key),
    class_no: text(row.class_no),
    class_number: text(row.class_number),
    class_name: text(row.class_name),
    class_start_time: text(row.class_start_time),
    display_time: text(row.display_time),
    entry_count: text(row.entry_count),
    n_gone: text(row.n_gone),
    n_to_go: text(row.n_to_go),
    elapsed_seconds: text(row.elapsed_seconds),
    status: text(row.status),
    live_source: text(row.live_source),
    last_synced_at: text(row.last_synced_at),
    pace_seconds: text(row.pace_seconds),
    last_live_synced_at: text(row.last_live_synced_at)
  };
}

function mapRawAirtableEntryGoFields(row, runTime) {
  return {
    entry_go_key: text(row.entry_go_key),
    show_no: text(row.show_no),
    focus_day: dateKey(row.focus_day),
    ring_name_normalized: text(row.ring_name_normalized),
    ring_visual_key: text(row.ring_visual_key),
    class_visual_key: text(row.class_visual_key),
    entry_visual_key: text(row.entry_visual_key),
    class_no: text(row.class_no),
    entry_no: text(row.entry_no),
    entry_order: text(row.entry_order),
    horse: text(row.horse),
    rider: text(row.rider),
    trainer: text(row.trainer),
    go_time: text(row.go_time),
    status: text(row.status || "active"),
    last_synced_at: text(row.last_synced_at || catalystDateTime(runTime)),
    pace_seconds: text(row.pace_seconds),
    live_source: text(row.live_source),
    last_live_synced_at: text(row.last_live_synced_at)
  };
}

function mapRawAirtableGetRingsFields(row) {
  return {
    get_rings_key: text(row.get_rings_key),
    show_no: text(row.show_no),
    focus_day: dateKey(row.focus_day),
    ring_no: text(row.ring_no),
    ring_day_no: text(row.ring_day_no),
    class_no: text(row.class_no),
    class_text: text(row.class_text),
    class_number: text(row.class_number),
    entry_no: text(row.entry_no),
    entry_text: text(row.entry_text),
    total: text(row.total),
    n_to_go: text(row.n_to_go),
    n_gone: text(row.n_gone),
    time_text: text(row.time_text),
    timestamp_value: text(row.timestamp_value),
    elapsed: text(row.elapsed),
    status_type: text(row.status_type),
    source_payload: text(row.source_payload)
  };
}

function mapRawAirtableGetOrdersFields(row) {
  return {
    get_orders_key: text(row.get_orders_key),
    show_no: text(row.show_no),
    focus_day: dateKey(row.focus_day),
    ring_no: text(row.ring_no),
    ring_day_no: text(row.ring_day_no),
    ring_name: text(row.ring_name),
    day_text: text(row.day_text),
    class_no: text(row.class_no),
    class_text: text(row.class_text),
    class_number: text(row.class_number),
    entry_no: text(row.entry_no),
    entry_text: text(row.entry_text),
    total: text(row.total),
    n_to_go: text(row.n_to_go),
    n_gone: text(row.n_gone),
    time_text: text(row.time_text),
    timestamp_value: text(row.timestamp_value),
    elapsed: text(row.elapsed),
    source_payload: text(row.source_payload)
  };
}

function airtableRawMirrorFocusFormula(showNo, focusDay) {
  const safeFocusDay = dateKey(focusDay);
  const showNumber = intValue(showNo);
  const showClause = showNumber
    ? `VALUE({show_no}&'')=${showNumber}`
    : `{show_no}=${airtableFormulaValue(text(showNo))}`;
  return `AND(${showClause},LEFT({focus_day}&'',10)=${airtableFormulaValue(safeFocusDay)})`;
}

async function deleteAirtableMirrorRowsNotInKeys(table, keyField, showNo, focusDay, activeKeys) {
  const records = await airtableListRecords(table, {
    filterByFormula: airtableRawMirrorFocusFormula(showNo, focusDay)
  });
  const staleIds = (records || [])
    .filter((record) => {
      const key = text(record.fields?.[keyField]);
      return key && !activeKeys.has(key);
    })
    .map((record) => record.id)
    .filter(Boolean);
  const deleted = await airtableDeleteRecords(table, staleIds);
  return {
    table,
    key_field: keyField,
    scanned: records.length,
    active_keys: activeKeys.size,
    deleted,
    skipped: false
  };
}

async function countAirtableRawMirrorRows(table, showNo, focusDay) {
  const records = await airtableListRecords(table, {
    filterByFormula: airtableRawMirrorFocusFormula(showNo, focusDay)
  });
  return records.length;
}

async function syncRawAirtableStep4Mirror(tableName, keyField, requiredFields, rows, mapper, showNo, focusDay, { appendOnly = false } = {}) {
  const tableStatus = await rawAirtableStep4MirrorTableStatus(tableName, requiredFields);
  if (!tableStatus.exists || tableStatus.missing_fields?.length) {
    return {
      table: tableName,
      key_field: keyField,
      table_status: tableStatus,
      source_rows: 0,
      upserts: 0,
      current_day_count: 0,
      cleanup: { deleted: 0, skipped: true },
      skipped: true
    };
  }
  const sourceRows = (rows || [])
    .map(mapper)
    .filter((row) => text(row[keyField]));
  const upserts = await airtableUpsertByFieldId(tableName, keyField, sourceRows);
  const cleanup = appendOnly
    ? { deleted: 0, skipped: true, reason: "append_only_log" }
    : await deleteAirtableMirrorRowsNotInKeys(
      tableName,
      keyField,
      showNo,
      focusDay,
      new Set(sourceRows.map((row) => text(row[keyField])).filter(Boolean))
    );
  const currentDayCount = await countAirtableRawMirrorRows(tableName, showNo, focusDay);
  return {
    table: tableName,
    key_field: keyField,
    table_status: tableStatus,
    source_rows: sourceRows.length,
    upserts: upserts.length,
    current_day_count: currentDayCount,
    cleanup,
    skipped: false
  };
}

async function syncRawAirtableStep4RuntimeRows(showNo, focusDay, { ringStatusRows = [], classStartRows = [], entryGoRows = [], runTime = "" } = {}) {
  const hsRingStatus = await syncRawAirtableStep4Mirror(
    AIRTABLE_RAW_RING_STATUS_TABLE,
    "ring_status_key",
    RAW_RING_STATUS_REQUIRED_FIELDS,
    ringStatusRows,
    mapRawAirtableRingStatusFields,
    showNo,
    focusDay
  );
  const hsClassStartTimes = await syncRawAirtableStep4Mirror(
    AIRTABLE_RAW_CLASS_START_TIMES_TABLE,
    "class_start_key",
    RAW_CLASS_START_TIMES_REQUIRED_FIELDS,
    classStartRows,
    mapRawAirtableClassStartFields,
    showNo,
    focusDay
  );
  const hsEntryGoTimes = await syncRawAirtableStep4Mirror(
    AIRTABLE_RAW_ENTRY_GO_TIMES_TABLE,
    "entry_go_key",
    RAW_ENTRY_GO_TIMES_REQUIRED_FIELDS,
    entryGoRows,
    (row) => mapRawAirtableEntryGoFields(row, runTime),
    showNo,
    focusDay
  );
  return {
    hs_ring_status: hsRingStatus,
    hs_class_start_times: hsClassStartTimes,
    hs_entry_go_times: hsEntryGoTimes
  };
}

async function syncRawAirtableStep5LiveRows(showNo, focusDay, { getRingsRows = [], getOrdersRows = [] } = {}) {
  const hsGetRings = await syncRawAirtableStep4Mirror(
    AIRTABLE_RAW_GET_RINGS_TABLE,
    "get_rings_key",
    RAW_GET_RINGS_REQUIRED_FIELDS,
    getRingsRows,
    mapRawAirtableGetRingsFields,
    showNo,
    focusDay,
    { appendOnly: true }
  );
  const hsGetOrders = (getOrdersRows || []).length
    ? await syncRawAirtableStep4Mirror(
      AIRTABLE_RAW_GET_ORDERS_TABLE,
      "get_orders_key",
      RAW_GET_ORDERS_REQUIRED_FIELDS,
      getOrdersRows,
      mapRawAirtableGetOrdersFields,
      showNo,
      focusDay,
      { appendOnly: true }
    )
    : {
      table: AIRTABLE_RAW_GET_ORDERS_TABLE,
      key_field: "get_orders_key",
      source_rows: 0,
      upserts: 0,
      current_day_count: 0,
      cleanup: { deleted: 0, skipped: true, reason: "retired_from_hot_lane" },
      skipped: false,
      retired: true
    };
  return {
    hs_get_rings: hsGetRings,
    hs_get_orders: hsGetOrders
  };
}

function getRingDaySourceRow(row, showNo) {
  const isoDate = dateKey(row.day_label || row.date_text);
  const focusDayKey = isoDate ? isoDate.replace(/-/g, "") : "";
  const dateParts = datePartsFromLabel(row.day_label || row.date_text);
  const ringDayNo = intValue(row.ring_day_no);
  const ringNo = intValue(row.ring_no);
  const ringNameNormalized = visualRingName(row.ring_name_normalized || normalizedWecRingName(row.ring_name));
  const ringKey = ringVisualKey(ringNo, ringNameNormalized);
  if (!ringDayNo) return null;
  return {
    ring_day_no: ringDayNo,
    show_no: intValue(row.show_no || showNo),
    ring_no: ringNo,
    ring_name: text(row.ring_name),
    ring_name_normalized: ringNameNormalized,
    ring_visual_key: ringKey,
    date_text: isoDate ? displayDateText(isoDate) : text(row.day_label || row.date_text),
    dow: dateParts.dow,
    iso_date: isoDate,
    focus_day_key: focusDayKey,
    source_payload: sourcePayload({ ...row, source_endpoint: "get_ring_days.php" })
  };
}

async function syncCatalystGetRingDayRows(app, showNo, rows) {
  const sourceRows = (rows || [])
    .filter((row) => intValue(row.show_no || showNo) === intValue(showNo))
    .map((row) => getRingDaySourceRow(row, showNo))
    .filter(Boolean);
  const result = await upsertSourceRowsFast(app, TABLES.getRingDays, "ring_day_no", sourceRows, { showNo });
  return {
    hs_get_ring_days_rows: result.rows,
    hs_get_ring_days_inserted: result.inserted,
    hs_get_ring_days_updated: result.updated,
    hs_get_ring_days_skipped: result.skipped
  };
}

async function countStoredGetRingDayRows(app, showNo, focusDay = "") {
  const safeFocusDay = dateKey(focusDay);
  const clauses = [
    `show_no = ${zcqlValue(intValue(showNo))}`
  ];
  if (safeFocusDay) clauses.push(`iso_date = ${zcqlValue(safeFocusDay)}`);
  const query = [
    "SELECT ROWID, ring_day_no, show_no, iso_date",
    `FROM ${TABLES.getRingDays}`,
    `WHERE ${clauses.join(" AND ")}`,
    "LIMIT 300"
  ].join(" ");
  const rows = await app.zcql().executeZCQLQuery(query) || [];
  return rows.map((item) => item?.[TABLES.getRingDays]).filter(Boolean).length;
}

async function getStoredGetRingDayRows(app, showNo, focusDay = "") {
  const safeFocusDay = dateKey(focusDay);
  const clauses = [
    `show_no = ${zcqlValue(intValue(showNo))}`
  ];
  if (safeFocusDay) clauses.push(`iso_date = ${zcqlValue(safeFocusDay)}`);
  const query = [
    "SELECT ROWID, ring_day_no, ring_no, ring_name, date_text, iso_date, focus_day_key, show_no",
    `FROM ${TABLES.getRingDays}`,
    `WHERE ${clauses.join(" AND ")}`,
    "LIMIT 300"
  ].join(" ");
  const rows = await app.zcql().executeZCQLQuery(query) || [];
  return rows
    .map((item) => item?.[TABLES.getRingDays])
    .filter(Boolean)
    .map((row) => ({
      row_id: row.ROWID,
      show_no: text(row.show_no || showNo),
      ring_day_no: text(row.ring_day_no),
      ring_no: text(row.ring_no),
      ring_name: text(row.ring_name),
      day_label: text(row.date_text || row.iso_date),
      iso_date: dateKey(row.iso_date || row.date_text),
      focus_day_key: text(row.focus_day_key)
    }))
    .filter((row) => intValue(row.ring_day_no) > 0)
    .sort((a, b) => `${a.ring_no}|${a.ring_day_no}`.localeCompare(`${b.ring_no}|${b.ring_day_no}`));
}

async function countStoredUpdateScheduleRows(app, showNo, focusDay = "") {
  const safeFocusDay = dateKey(focusDay);
  const rows = await getPagedRowsFiltered(
    app,
    TABLES.updateSchedule,
    (row) => (
      text(row.show_no) === text(showNo)
      && (!safeFocusDay || dateKey(row.iso_date || row.date_text) === safeFocusDay)
    ),
    { maxRows: 5000 }
  );
  return rows.rows.length;
}

async function getStoredUpdateScheduleRows(app, showNo, focusDay = "") {
  const safeFocusDay = dateKey(focusDay);
  const rows = await getPagedRowsFiltered(
    app,
    TABLES.updateSchedule,
    (row) => (
      text(row.show_no) === text(showNo)
      && (!safeFocusDay || dateKey(row.iso_date || row.date_text || row.focus_day) === safeFocusDay)
    ),
    { maxRows: 5000 }
  );
  return rows.rows
    .map((row) => ({
      update_schedule_key: text(row.update_schedule_key),
      row_id: row.ROWID,
      show_no: text(row.show_no || showNo),
      focus_day: dateKey(row.iso_date || row.date_text || row.focus_day),
      ring_day_no: text(row.ring_day_no),
      ring_no: text(row.ring_no),
      ring_name: text(row.ring_name),
      date_text: text(row.date_text),
      iso_date: dateKey(row.iso_date || row.date_text),
      class_no: text(row.class_no),
      event_id: text(row.event_id),
      event_name: text(row.event_name),
      class_number: text(row.class_number),
      class_payout: text(row.class_payout),
      class_name: text(row.class_name),
      time_text: text(row.time_text),
      entry_count: text(row.entry_count),
      event_type: text(row.event_type),
      oc_id: text(row.oc_id),
      live_flag: text(row.live_flag),
      source_endpoint: text(row.source_endpoint || "update_schedule.php"),
      source_payload: text(row.source_payload)
    }))
    .filter((row) => row.update_schedule_key)
    .sort((a, b) => `${a.ring_no}|${a.ring_day_no}|${a.time_text}|${a.class_no}`.localeCompare(`${b.ring_no}|${b.ring_day_no}|${b.time_text}|${b.class_no}`));
}

async function countStoredRingStatusRows(app, showNo, focusDay = "") {
  const safeFocusDay = dateKey(focusDay);
  const rows = await getPagedRowsFiltered(
    app,
    TABLES.ringStatus,
    (row) => (
      text(row.show_no) === text(showNo)
      && (!safeFocusDay || dateKey(row.focus_day) === safeFocusDay)
    ),
    { maxRows: 1000 }
  );
  return rows.rows.length;
}

async function countStoredClassStartRows(app, showNo, focusDay = "") {
  const safeFocusDay = dateKey(focusDay);
  const rows = await getPagedRowsFiltered(
    app,
    TABLES.classStartTimes,
    (row) => (
      text(row.show_no) === text(showNo)
      && (!safeFocusDay || dateKey(row.focus_day) === safeFocusDay)
    ),
    { maxRows: 5000 }
  );
  return rows.rows.length;
}

async function getStoredClassOogRows(app, showNo, focusDay = "") {
  const safeFocusDay = dateKey(focusDay);
  const rows = await getPagedRowsFiltered(
    app,
    TABLES.classOog,
    (row) => (
      text(row.show_no) === text(showNo)
      && (!safeFocusDay || dateKey(row.focus_day) === safeFocusDay)
    ),
    { maxRows: 10000 }
  );
  return rows.rows
    .map((row) => ({
      row_id: row.ROWID,
      class_oog_key: text(row.class_oog_key),
      show_no: text(row.show_no || showNo),
      focus_day: dateKey(row.focus_day || focusDay),
      ring_day_no: text(row.ring_day_no),
      ring_no: text(row.ring_no),
      ring: text(row.ring),
      class_no: text(row.class_no),
      class_label: text(row.class_label),
      class_name: text(row.class_name),
      entry_order: text(row.entry_order),
      entry_no: text(row.entry_no),
      horse: text(row.horse),
      rider: text(row.rider),
      trainer: text(row.trainer)
    }))
    .filter((row) => text(row.class_oog_key) || (text(row.class_no) && text(row.entry_no)))
    .sort((a, b) => `${a.ring_no}|${a.ring_day_no}|${a.class_no}|${a.entry_order}|${a.entry_no}`.localeCompare(`${b.ring_no}|${b.ring_day_no}|${b.class_no}|${b.entry_order}|${b.entry_no}`));
}

async function countStoredEntryGoRows(app, showNo, focusDay = "") {
  const safeFocusDay = dateKey(focusDay);
  const rows = await getPagedRowsFiltered(
    app,
    TABLES.entryGoTimes,
    (row) => (
      text(row.show_no) === text(showNo)
      && (!safeFocusDay || dateKey(row.focus_day) === safeFocusDay)
    ),
    { maxRows: 10000 }
  );
  return rows.rows.length;
}

async function getStep4RuntimeRows(app, showNo, focusDay, meta) {
  const safeFocusDay = dateKey(focusDay);
  const currentFocusFilter = (row) => (
    text(row.show_no) === text(showNo)
    && (!safeFocusDay || dateKey(row.focus_day) === safeFocusDay)
  );
  const [ringStatusPage, classStartPage, entryGoPage] = await Promise.all([
    getPagedRowsFiltered(app, TABLES.ringStatus, currentFocusFilter, { maxRows: 1000 }),
    getPagedRowsFiltered(app, TABLES.classStartTimes, currentFocusFilter, { maxRows: 5000 }),
    getPagedRowsFiltered(app, TABLES.entryGoTimes, currentFocusFilter, { maxRows: 10000 })
  ]);

  const ringStatusRows = ringStatusPage.rows || [];
  const classStartRows = classStartPage.rows || [];
  const entryRows = entryGoPage.rows || [];
  const ringsByVisualKey = new Map();
  const ringsByNo = new Map();
  for (const row of ringStatusRows) {
    const ringVisual = text(row.ring_visual_key || row.ring_status_key);
    const ringNo = text(row.ring_no);
    if (ringVisual) ringsByVisualKey.set(ringVisual, row);
    if (ringNo) ringsByNo.set(ringNo, row);
  }

  const entriesByClassKey = new Map();
  for (const row of entryRows) {
    const ringNameNormalized = text(row.ring_name_normalized);
    const classNo = text(row.class_no);
    const classConst = text(row.class_const_key);
    const classVisual = text(row.class_visual_key) || classVisualKey(ringNameNormalized, classNo);
    const keys = [classConst, classVisual].filter(Boolean);
    if (!keys.length) continue;
    const sourceHorse = text(row.horse);
    const horseMeta = horseDisplayMeta(sourceHorse, meta);
    const barnName = text(horseMeta.barn_name || horseMeta.display);
    const payload = {
      entry_no: text(row.entry_no),
      entry_order: text(row.entry_order),
      horse: sourceHorse,
      barn_name: barnName,
      horse_display: barnName || sourceHorse,
      rider: text(row.rider),
      trainer: text(row.trainer),
      entry_rollup: barnName || sourceHorse,
      rider_display: text(row.rider),
      trainer_display: trainerDisplayName(text(row.trainer), meta.trainerDisplays),
      entry_go_time: text(row.go_time || row.entry_go_time),
      go_time: text(row.go_time || row.entry_go_time),
      pace_seconds: text(row.pace_seconds),
      live_source: text(row.live_source),
      last_live_synced_at: text(row.last_live_synced_at),
      entry_go_time_label: text(row.go_time) ? "Source-derived go time" : "Estimated go time",
      entry_go_time_source: text(row.go_time) ? "source_derived_pace" : "estimate",
      time_till: text(row.time_till),
      class_const_key: classConst,
      class_visual_key: classVisual,
      entry_visual_key: text(row.entry_visual_key || row.entry_go_key)
    };
    for (const key of keys) {
      const bucket = entriesByClassKey.get(key) || [];
      bucket.push(payload);
      entriesByClassKey.set(key, bucket);
    }
  }
  for (const bucket of entriesByClassKey.values()) {
    bucket.sort((a, b) => Number(a.entry_order || 9999) - Number(b.entry_order || 9999));
  }

  const outputRows = classStartRows
    .map((row) => {
      const ringNo = text(row.ring_no);
      const ringVisual = text(row.ring_visual_key);
      const classConst = text(row.class_const_key);
      const classVisual = text(row.class_visual_key || row.class_start_key);
      const ringRow = ringsByVisualKey.get(ringVisual) || ringsByNo.get(ringNo) || {};
      const ringNameNormalized = text(row.ring_name_normalized || ringRow.ring_name_normalized);
      const ringName = text(row.ring_name || ringRow.ring_name);
      const ringDisplay = ringDisplayFromNormalizedName(ringNameNormalized) || ringName;
      const classNo = text(row.class_no);
      const classNumber = text(row.class_number);
      const className = text(row.class_name);
      const classStartTime = text(row.class_start_time);
      const entries = (entriesByClassKey.get(classConst) || entriesByClassKey.get(classVisual) || [])
        .map((entry) => ({ ...entry, class_start_time: classStartTime }));
      const trainerRollups = trainerRollupsForEntries(entries, meta);
      const rollup = horseRollupDisplay(trainerRollups);
      return {
        ROWID: row.ROWID,
        record_id: row.ROWID,
        show_id: text(showNo),
        show_no: text(showNo),
        focus_day: safeFocusDay,
        show_day: safeFocusDay,
        show_day_key: safeFocusDay,
        focus_day_key: safeFocusDay.replace(/-/g, ""),
        ring_number: Number(ringNo || 9999),
        ring_no: ringNo,
        ring_day_no: text(row.ring_day_no),
        ring_name: ringName,
        ring_display: ringDisplay,
        ring_name_prioritized: text(row.ring_name_prioritized || ringName),
        ring_name_normalized: ringNameNormalized,
        ring_visual_key: ringVisual,
        class_const_key: classConst,
        class_visual_key: classVisual,
        class_group_id: classNo || text(row.ROWID),
        class_group_sequence: scheduleSortValue(classStartTime, classNumber),
        group_group_name: className,
        class_no: classNo,
        class_number: classNumber,
        class_name: className,
        class_label: text(row.class_label) || (classNumber ? `${classNumber} - ${className}` : className),
        class_start_time: classStartTime,
        start_display: displayTimeFromStart(classStartTime),
        display_time: text(row.display_time) || displayTimeFromStart(classStartTime),
        time_text: text(row.time_text) || displayTimeFromStart(classStartTime),
        time_sort: text(row.time_sort) || text(scheduleSortValue(classStartTime, classNumber)),
        class_priority_sort: text(row.class_priority_sort),
        class_name_tokens: text(row.class_name_tokens),
        this_disciplines: text(row.this_disciplines),
        this_skills: text(row.this_skills),
        this_ages: text(row.this_ages),
        this_levels: text(row.this_levels),
        this_sizes: text(row.this_sizes),
        this_heights: text(row.this_heights),
        is_2nd_trip: row.is_2nd_trip === true,
        is_medal: row.is_medal === true,
        is_under_saddle: row.is_under_saddle === true,
        is_hunter_classic: row.is_hunter_classic === true,
        is_jumper_classic: row.is_jumper_classic === true,
        live_flag: text(row.live_flag),
        entry_count: intOrNull(row.entry_count) ?? entries.length,
        n_gone: intOrNull(row.n_gone),
        n_to_go: intOrNull(row.n_to_go),
        elapsed_seconds: intOrNull(row.elapsed_seconds),
        current_entry_no: text(row.current_entry_no),
        current_horse: text(row.current_horse),
        live_source: text(row.live_source || row.source || "hs_class_start_times.step4_runtime"),
        status: text(row.status || "active"),
        group_display: rollup,
        sched_display: rollup,
        "8778_sched_display": rollup,
        rollup: rollup,
        trainer_rollups: trainerRollups,
        rollup_source: "hs_entry_go_times",
        rollup_label: text(row.rollup_label),
        entry_go_times_rollup: rollup,
        entry_go_times: entries,
        sched_horses: compactTrainerRollups(trainerRollups)
          .flatMap((item) => item.horses || [])
          .map((horse) => (horse && typeof horse === "object" ? text(horse.display || horse.horse) : text(horse)))
          .filter(Boolean)
          .join("|"),
        is_preflight: false,
        source: "catalyst.step4_runtime"
      };
    })
    .filter((row) => intOrNull(row.class_no) > 0)
    .sort((a, b) => (
      Number(a.ring_number || 9999) - Number(b.ring_number || 9999) ||
      Number(a.class_group_sequence || 9999999999) - Number(b.class_group_sequence || 9999999999) ||
      Number(a.class_no || 0) - Number(b.class_no || 0)
    ));
  outputRows.runtime_ring_status_rows = ringStatusRows;
  return outputRows;
}

function step4RuntimeRingPayloads(rows) {
  return (rows?.runtime_ring_status_rows || [])
    .map((row) => {
      const ringNameNormalized = text(row.ring_name_normalized);
      return {
        ring_no: Number(row.ring_no || 0),
        ring_key: ringNameNormalized || text(row.ring_visual_key || row.ring_status_key) || text(row.ring_no),
        ring_name_normalized: ringNameNormalized,
        ring_visual_key: text(row.ring_visual_key || row.ring_status_key),
        ring_display: ringDisplayFromNormalizedName(ringNameNormalized) || text(row.ring_display || row.ring_name) || ringDisplayFromName(row.ring_name),
        ring_name: text(row.ring_name),
        focus_day: dateKey(row.focus_day),
        classes: []
      };
    })
    .filter((row) => row.ring_no);
}

function buildStep4RuntimeMobilePayload(showNo, focusDay, meta, rows) {
  const payload = buildMobileLivePayload(showNo, focusDay, meta, rows);
  const byRingKey = new Map((payload.rings || []).map((ring) => [text(ring.ring_name_normalized || ring.ring_visual_key || ring.ring_no), ring]));
  for (const ring of step4RuntimeRingPayloads(rows)) {
    const ringKey = text(ring.ring_name_normalized || ring.ring_visual_key || ring.ring_no);
    if (!byRingKey.has(ringKey)) {
      byRingKey.set(ringKey, {
        ring_key: ringKey,
        ring_no: ring.ring_no,
        ring_name: ring.ring_name,
        ring_name_normalized: ring.ring_name_normalized,
        ring_visual_key: ring.ring_visual_key,
        ring_display: ring.ring_display,
        classes: []
      });
    }
  }
  payload.rings = [...byRingKey.values()].sort((a, b) => (
    Number(a.ring_no || 9999) - Number(b.ring_no || 9999) ||
    text(a.ring_name_normalized).localeCompare(text(b.ring_name_normalized))
  ));
  return payload;
}

function deriveStep4RuntimePrintLayout(showNo, focusDay, rows) {
  const layout = derivePrintLayoutFromScheduleRows(showNo, focusDay, rows);
  const byRingKey = new Map((layout.rings || []).map((ring) => [text(ring.ring_name_normalized || ring.ring_visual_key || ring.ring_no), ring]));
  for (const ring of step4RuntimeRingPayloads(rows)) {
    const ringKey = text(ring.ring_name_normalized || ring.ring_visual_key || ring.ring_no);
    if (!byRingKey.has(ringKey)) {
      byRingKey.set(ringKey, {
        ring_group_key: `${showNo}|${dateKey(focusDay)}|${ringKey}`,
        show_no: intOrNull(showNo),
        focus_day: dateKey(focusDay),
        ring_no: ring.ring_no,
        ring_name_normalized: ring.ring_name_normalized,
        ring_visual_key: ring.ring_visual_key,
        ring_display: ring.ring_display,
        ring_name: ring.ring_name || ring.ring_display,
        source_rows: 0,
        hidden_rows: 0,
        visible_classes: 0,
        visible_rollups: 0,
        print_rows: 2,
        portrait_col: null,
        landscape_col: null,
        source: "catalyst.step4_runtime"
      });
    }
  }
  const rings = [...byRingKey.values()].sort((a, b) => (
    Number(a.ring_no || 9999) - Number(b.ring_no || 9999) ||
    text(a.ring_name_normalized).localeCompare(text(b.ring_name_normalized))
  ));
  layout.rings = rings;
  layout.print_meta = {
    ...(layout.print_meta || {}),
    ring_group_count: rings.length,
    visible_classes: rings.reduce((sum, ring) => sum + (intOrNull(ring.visible_classes) || 0), 0),
    visible_rollups: rings.reduce((sum, ring) => sum + (intOrNull(ring.visible_rollups) || 0), 0),
    total_print_rows: rings.reduce((sum, ring) => sum + (intOrNull(ring.print_rows) || 0), 0),
    source: "catalyst.step4_runtime"
  };
  layout.placement = Object.fromEntries(rings.map((ring) => [String(ring.ring_no), {
    portrait_col: ring.portrait_col,
    landscape_col: ring.landscape_col,
    print_rows: ring.print_rows,
    ring_name: ring.ring_name
  }]));
  return layout;
}

async function deleteCurrentFocusRowsNotInKeys(app, tableName, keyField, showNo, focusDay, activeKeys) {
  const safeFocusDay = dateKey(focusDay);
  const allowed = new Set([...(activeKeys || new Set())].map(text).filter(Boolean));
  if (!safeFocusDay || !allowed.size) {
    return { table: tableName, deleted: 0, scanned: 0, skipped: true, reason: "missing_focus_day_or_active_keys" };
  }
  const rows = await getPagedRowsFiltered(
    app,
    tableName,
    (row) => (
      text(row.show_no) === text(showNo)
      && dateKey(row.focus_day) === safeFocusDay
    ),
    { maxRows: 10000 }
  );
  const staleIds = rows.rows
    .filter((row) => !allowed.has(text(row[keyField])))
    .map((row) => row.ROWID)
    .filter(Boolean);
  const table = app.datastore().table(tableName);
  let deleted = 0;
  for (let index = 0; index < staleIds.length; index += 100) {
    const batch = staleIds.slice(index, index + 100);
    if (batch.length) {
      await table.deleteRows(batch);
      deleted += batch.length;
    }
  }
  return {
    table: tableName,
    key_field: keyField,
    scanned: rows.rows.length,
    active_keys: allowed.size,
    deleted,
    skipped: false
  };
}

function ringStatusRowsFromGetRingDays(showNo, focusDay, rows, runTime) {
  return uniqueRowsByKey((rows || []).map((row) => {
    const ringDayNo = intValue(row.ring_day_no);
    const ringNo = intValue(row.ring_no);
    const safeFocusDay = dateKey(row.iso_date || row.day_label || focusDay);
    const ringNameNormalized = visualRingName(row.ring_name_normalized || normalizedWecRingName(row.ring_name));
    const visualKey = ringVisualKey(ringNo, ringNameNormalized);
    if (!ringDayNo || !ringNo || !safeFocusDay || !ringNameNormalized || !visualKey) return null;
    return {
      ring_status_key: `${intValue(showNo)}|${safeFocusDay}|${visualKey}`,
      ring_visual_key: visualKey,
      show_no: intValue(showNo),
      focus_day: safeFocusDay,
      focus_day_key: safeFocusDay.replace(/-/g, ""),
      ring_day_no: ringDayNo,
      ring_no: ringNo,
      ring_name: text(row.ring_name),
      ring_name_normalized: ringNameNormalized,
      ring_name_prioritized: prioritizedWecRingName(row.ring_name),
      status: "active",
      source: "hs_get_ring_days.step4_runtime_prep",
      last_synced_at: catalystDateTime(runTime)
    };
  }).filter(Boolean), "ring_status_key");
}

function classStartRowsFromUpdateSchedule(showNo, focusDay, rows, runTime) {
  const safeFocusDay = dateKey(focusDay);
  return uniqueRowsByKey((rows || [])
    .filter((row) => !updateSchedulePreflightReason(row))
    .map((row) => {
      const classNo = intValue(row.class_no);
      const ringDayNo = intValue(row.ring_day_no);
      const ringNo = intValue(row.ring_no);
      const classStartTime = classStartTimeFromText(row.time_text);
      const ringNameNormalized = visualRingName(row.ring_name_normalized || normalizedWecRingName(row.ring_name));
      const ringKey = ringVisualKey(ringNo, ringNameNormalized);
      const classKey = classVisualKey(ringNameNormalized, classNo);
      if (!classNo || !ringDayNo || !ringNo || !classStartTime || !ringNameNormalized || !ringKey || !classKey) return null;
      return {
        class_start_key: `${intValue(showNo)}|${safeFocusDay}|${classKey}`,
        ring_name_normalized: ringNameNormalized,
        ring_visual_key: ringKey,
        class_visual_key: classKey,
        show_no: intValue(showNo),
        focus_day: safeFocusDay,
        ring_day_no: ringDayNo,
        ring_no: ringNo,
        ring_name: text(row.ring_name),
        class_no: classNo,
        class_name: text(row.class_name || row.event_name),
        class_start_time: classStartTime,
        entry_count: intValue(row.entry_count),
        display_time: displayTimeFromStart(row.time_text || classStartTime),
        class_number: intValue(row.class_number),
        status: "active",
        live_source: "hs_update_schedule.step4_runtime_prep",
        last_synced_at: catalystDateTime(runTime)
      };
    })
    .filter(Boolean), "class_start_key");
}

function entryGoRowsFromClassOog(showNo, focusDay, rows) {
  const safeFocusDay = dateKey(focusDay);
  return uniqueRowsByKey((rows || []).map((row) => {
    const ringDayNo = intValue(row.ring_day_no);
    const ringNo = intValue(row.ring_no);
    const classNo = intValue(row.class_no);
    const entryNo = intValue(row.entry_no);
    const entryOrder = intValue(row.entry_order);
    const ringNameNormalized = visualRingName(row.ring_name_normalized || normalizedWecRingName(row.ring));
    const ringKey = ringVisualKey(ringNo, ringNameNormalized);
    const classKey = classVisualKey(ringNameNormalized, classNo);
    const entryKey = entryVisualKey(ringNameNormalized, classNo, entryNo);
    if (!ringDayNo || !ringNo || !classNo || !entryNo || !entryOrder || !ringNameNormalized || !ringKey || !classKey || !entryKey) return null;
    return {
      entry_go_key: `${intValue(showNo)}|${safeFocusDay}|${entryKey}`,
      ring_name_normalized: ringNameNormalized,
      ring_visual_key: ringKey,
      class_visual_key: classKey,
      entry_visual_key: entryKey,
      show_no: intValue(showNo),
      focus_day: safeFocusDay,
      class_no: classNo,
      entry_no: entryNo,
      entry_order: entryOrder,
      horse: text(row.horse),
      rider: text(row.rider),
      trainer: text(row.trainer)
    };
  }).filter(Boolean), "entry_go_key");
}

function step4IdentityMisses({ ringDays = [], updateScheduleRows = [], classOogRows = [] } = {}) {
  const misses = [];
  for (const row of ringDays || []) {
    if (!intValue(row.ring_day_no) || !intValue(row.ring_no)) {
      misses.push({ lane: "ring_status", row_id: text(row.row_id), reason: "missing_ring_identity" });
    }
  }
  for (const row of (updateScheduleRows || []).filter((item) => !updateSchedulePreflightReason(item))) {
    if (!intValue(row.ring_day_no) || !intValue(row.ring_no) || !intValue(row.class_no) || !classStartTimeFromText(row.time_text)) {
      misses.push({
        lane: "class_start_times",
        row_id: text(row.row_id),
        update_schedule_key: text(row.update_schedule_key),
        reason: "missing_class_start_identity"
      });
    }
  }
  for (const row of classOogRows || []) {
    if (!intValue(row.ring_day_no) || !intValue(row.ring_no) || !intValue(row.class_no) || !intValue(row.entry_no) || !intValue(row.entry_order)) {
      misses.push({
        lane: "entry_go_times",
        row_id: text(row.row_id),
        class_oog_key: text(row.class_oog_key),
        reason: "missing_entry_identity"
      });
    }
  }
  return misses;
}

function step4HelperWarnings() {
  return [
    { helper: "heartbeat", status: "warning", reason: "Catalyst runtime destination tables do not expose helper link columns yet" },
    { helper: "shows", status: "warning", reason: "Catalyst runtime destination tables do not expose helper link columns yet" },
    { helper: "focus_show", status: "warning", reason: "Catalyst runtime destination tables do not expose helper link columns yet" },
    { helper: "ring_days", status: "warning", reason: "Catalyst runtime destination tables do not expose helper link columns yet" },
    { helper: "rings", status: "warning", reason: "hs_rings remains helper/reference only; Step 4 does not write hs_rings" },
    { helper: "ring_names", status: "warning", reason: "Catalyst runtime destination tables do not expose helper link columns yet" },
    { helper: "classes", status: "warning", reason: "Catalyst runtime destination tables do not expose helper link columns yet" },
    { helper: "entries", status: "warning", reason: "Catalyst runtime destination tables do not expose helper link columns yet" },
    { helper: "horses", status: "warning", reason: "Catalyst runtime destination tables do not expose helper link columns yet" },
    { helper: "riders", status: "warning", reason: "Catalyst runtime destination tables do not expose helper link columns yet" },
    { helper: "trainers", status: "warning", reason: "Catalyst runtime destination tables do not expose helper link columns yet" },
    { helper: "owners", status: "warning", reason: "No Catalyst helper/reference table or destination link column is currently defined for owners" }
  ];
}

async function writeStageHeartbeat(app, heartbeatId, patch) {
  const payload = cleanRowForDatastore({
    heartbeat_id: heartbeatId,
    ...patch
  });
  return upsert(app, TABLES.heartbeat, { heartbeat_id: heartbeatId }, payload);
}

async function writeRawAirtableHeartbeat(heartbeatId, patch) {
  const fields = cleanPatch({
    heartbeat_id: heartbeatId,
    ...patch,
    focus_show: patch.focus_show_record_id ? [patch.focus_show_record_id] : undefined,
    run_time: patch.run_time ? text(patch.run_time).replace(" ", "T") : ""
  });
  const upserts = await airtableUpsertByFieldId(AIRTABLE_RAW_HEARTBEAT_TABLE, "heartbeat_id", [fields]);
  return upserts?.[0] || null;
}

async function writeWecHeartbeatOnly(app, action, query, body) {
  const activeFocus = await getActiveAirtableFocusShowStrict();
  if (!activeFocus.ok) {
    return {
      ok: false,
      status_code: 409,
      action,
      blocker: activeFocus.blocker,
      active_count: activeFocus.active_count || 0,
      source_fetch_run: false,
      upstream_requests: 0,
      downstream_run: false
    };
  }
  const runTime = new Date().toISOString();
  const runId = text(query.get("run_id") || body.run_id) || `wec-heartbeat-${runTime.replace(/[^0-9A-Za-z]/g, "")}`;
  const focusDay = dateKey(activeFocus.focus_day);
  const branch = activeFocus.is_pause ? "paused" : "active";
  const heartbeatId = `${activeFocus.show_no}|${focusDay}|${runId}`;
  const payload = {
    action,
    focus_source: activeFocus.source,
    source_fetch_run: false,
    upstream_requests: 0,
    get_ring_days_run: false,
    update_schedule_run: false,
    downstream_run: false
  };
  const heartbeatPatch = {
    run_id: runId,
    run_time: catalystDateTime(runTime),
    show_no: intValue(activeFocus.show_no),
    focus_day: focusDay,
    focus_day_key: focusDay.replace(/-/g, ""),
    focus_show_record_id: activeFocus.focus_show_record_id,
    is_pause: activeFocus.is_pause,
    is_lock: activeFocus.is_lock,
    live_enrichment: activeFocus.live_enrichment,
    branch,
    status: "pass",
    blocker: "",
    parsed_rows: 0,
    materialized_hs_get_ring_days_rows: 0,
    materialized_ring_day_rows: 0,
    source_sequence_json: JSON.stringify([], null, 2),
    payload_json: JSON.stringify(payload, null, 2)
  };
  await writeStageHeartbeat(app, heartbeatId, heartbeatPatch);
  await writeRawAirtableHeartbeat(heartbeatId, {
    ...heartbeatPatch,
    run_time: runTime
  });
  return {
    ok: true,
    status_code: 200,
    action,
    heartbeat_id: heartbeatId,
    run_id: runId,
    run_time: runTime,
    focus_source: activeFocus.source,
    focus_show_record_id: activeFocus.focus_show_record_id,
    show_no: activeFocus.show_no,
    focus_day: focusDay,
    is_pause: activeFocus.is_pause,
    is_lock: activeFocus.is_lock,
    live_enrichment: activeFocus.live_enrichment,
    branch,
    status: "pass",
    source_fetch_run: false,
    upstream_requests: 0,
    source_request_sequence: [],
    get_ring_days_run: false,
    update_schedule_run: false,
    downstream_run: false,
    get_orders_run: false,
    get_rings_run: false,
    alerts_run: false
  };
}

async function runWecStep1HeartbeatGetRingDays(req, app, action, query, body) {
  const activeFocus = await getActiveAirtableFocusShowStrict();
  if (!activeFocus.ok) {
    return {
      ok: false,
      status_code: 409,
      action,
      blocker: activeFocus.blocker,
      active_count: activeFocus.active_count || 0,
      downstream_run: false,
      source_fetch_run: false,
      get_ring_days_run: false,
      update_schedule_run: false
    };
  }

  const runTime = new Date().toISOString();
  const runId = text(query.get("run_id") || body.run_id) || `wec-step1-${runTime.replace(/[^0-9A-Za-z]/g, "")}`;
  const focusDay = dateKey(activeFocus.focus_day);
  const focusDayKey = focusDay.replace(/-/g, "");
  const heartbeatId = `${activeFocus.show_no}|${focusDay}|${runId}`;
  const cadenceWindow = text(query.get("cadence_window") || body.cadence_window || "");
  const existingCurrentRows = await countStoredGetRingDayRows(app, activeFocus.show_no, focusDay);
  const triggerReason = activeFocus.is_pause
    ? "focus_show.is_pause"
    : existingCurrentRows > 0
      ? `cadence${cadenceWindow ? `_${cadenceWindow}` : ""}`
      : "focus_day_change_or_missing_current_rows";

  const basePatch = {
    run_id: runId,
    run_time: catalystDateTime(runTime),
    show_no: intValue(activeFocus.show_no),
    focus_day: focusDay,
    focus_day_key: focusDayKey,
    focus_show_record_id: activeFocus.focus_show_record_id,
    is_pause: activeFocus.is_pause,
    is_lock: activeFocus.is_lock,
    live_enrichment: activeFocus.live_enrichment,
    branch: "step1_get_ring_days",
    blocker: "",
    parsed_rows: 0,
    materialized_hs_get_ring_days_rows: existingCurrentRows,
    materialized_ring_day_rows: 0,
    source_sequence_json: JSON.stringify([], null, 2)
  };

  if (activeFocus.is_pause) {
    const payload = {
      action,
      focus_source: activeFocus.source,
      cadence_window: cadenceWindow,
      trigger_reason: triggerReason,
      source_fetch_run: false,
      upstream_requests: 0,
      get_ring_days_run: false,
      update_schedule_run: false,
      downstream_run: false
    };
    const pausedPatch = {
      ...basePatch,
      status: "skipped",
      blocker: "focus_show.is_pause",
      payload_json: JSON.stringify(payload, null, 2)
    };
    await writeStageHeartbeat(app, heartbeatId, pausedPatch);
    await writeRawAirtableHeartbeat(heartbeatId, {
      ...pausedPatch,
      run_time: runTime
    });
    return {
      ok: true,
      status_code: 200,
      action,
      status: "skipped",
      blocker: "focus_show.is_pause",
      heartbeat_id: heartbeatId,
      run_id: runId,
      run_time: runTime,
      focus_source: activeFocus.source,
      focus_show_record_id: activeFocus.focus_show_record_id,
      show_no: activeFocus.show_no,
      focus_day: focusDay,
      is_pause: activeFocus.is_pause,
      is_lock: activeFocus.is_lock,
      live_enrichment: activeFocus.live_enrichment,
      cadence_window: cadenceWindow,
      trigger_reason: triggerReason,
      source_fetch_run: false,
      upstream_requests: 0,
      source_request_sequence: [],
      get_ring_days_run: false,
      update_schedule_run: false,
      downstream_run: false,
      get_orders_run: false,
      get_rings_run: false,
      alerts_run: false
    };
  }

  const runningPayload = {
    action,
    focus_source: activeFocus.source,
    cadence_window: cadenceWindow,
    trigger_reason: triggerReason,
    source_fetch_run: true,
    get_ring_days_run: true,
    update_schedule_run: false,
    downstream_run: false
  };
  await writeStageHeartbeat(app, heartbeatId, {
    ...basePatch,
    status: "running",
    payload_json: JSON.stringify(runningPayload, null, 2)
  });
  await writeRawAirtableHeartbeat(heartbeatId, {
    ...basePatch,
    run_time: runTime,
    status: "running",
    payload_json: JSON.stringify(runningPayload, null, 2)
  });

  const context = createWorkflowContext();
  let result = null;
  let blocker = "";
  try {
    result = await fetchAndSyncRingDays(req, app, activeFocus.show_no, context, {
      focusDay,
      refreshExisting: true,
      syncAirtableMirror: false,
      syncRawAirtableMirror: true,
      heartbeatId,
      runId
    });
    blocker = !Number(result.parsed_rows || 0)
      ? "get_ring_days_source_empty"
      : !Number(result.materialized_hs_get_ring_days_rows || 0)
        ? "hs_get_ring_days_materialization_empty"
        : !Number(result.materialized_ring_day_rows || 0)
          ? "hs_ring_days_materialization_empty"
          : "";
  } catch (error) {
    blocker = String(error?.message || error);
    result = {};
  }

  const finalPayload = {
    action,
    focus_source: activeFocus.source,
    cadence_window: cadenceWindow,
    trigger_reason: triggerReason,
    upstream_requests: context.upstreamRequests,
    source_request_sequence: context.sourceSequence,
    source_fetch_run: true,
    get_ring_days_run: true,
    update_schedule_run: false,
    downstream_run: false,
    result
  };
  const finalPatch = {
    ...basePatch,
    status: blocker ? "fail" : "pass",
    blocker,
    parsed_rows: Number(result.parsed_rows || 0),
    materialized_hs_get_ring_days_rows: Number(result.materialized_hs_get_ring_days_rows || 0),
    materialized_ring_day_rows: Number(result.materialized_ring_day_rows || 0),
    source_sequence_json: JSON.stringify(context.sourceSequence || [], null, 2),
    payload_json: JSON.stringify(finalPayload, null, 2)
  };
  await writeStageHeartbeat(app, heartbeatId, finalPatch);
  await writeRawAirtableHeartbeat(heartbeatId, {
    ...finalPatch,
    run_time: runTime
  });

  return {
    ok: !blocker,
    status_code: blocker ? 500 : 200,
    action,
    blocker,
    heartbeat_id: heartbeatId,
    run_id: runId,
    run_time: runTime,
    focus_source: activeFocus.source,
    focus_show_record_id: activeFocus.focus_show_record_id,
    show_no: activeFocus.show_no,
    focus_day: focusDay,
    is_pause: activeFocus.is_pause,
    is_lock: activeFocus.is_lock,
    live_enrichment: activeFocus.live_enrichment,
    cadence_window: cadenceWindow,
    trigger_reason: triggerReason,
    source_fetch_run: true,
    upstream_requests: context.upstreamRequests,
    source_request_sequence: context.sourceSequence,
    get_ring_days_run: true,
    update_schedule_run: false,
    downstream_run: false,
    get_orders_run: false,
    get_rings_run: false,
    alerts_run: false,
    ...result
  };
}

async function runWecStep2UpdateScheduleOnly(req, app, action, query, body) {
  const activeFocus = await getActiveAirtableFocusShowStrict();
  if (!activeFocus.ok) {
    return {
      ok: false,
      status_code: 409,
      action,
      blocker: activeFocus.blocker,
      active_count: activeFocus.active_count || 0,
      get_ring_days_run: false,
      update_schedule_run: false,
      downstream_run: false
    };
  }

  const runTime = new Date().toISOString();
  const runId = text(query.get("run_id") || body.run_id) || `wec-step2-${runTime.replace(/[^0-9A-Za-z]/g, "")}`;
  const focusDay = dateKey(activeFocus.focus_day);
  const focusDayKey = focusDay.replace(/-/g, "");
  const heartbeatId = `${activeFocus.show_no}|${focusDay}|${runId}`;
  const cadenceWindow = text(query.get("cadence_window") || body.cadence_window || "");
  const basePatch = {
    run_id: runId,
    run_time: catalystDateTime(runTime),
    show_no: intValue(activeFocus.show_no),
    focus_day: focusDay,
    focus_day_key: focusDayKey,
    focus_show_record_id: activeFocus.focus_show_record_id,
    is_pause: activeFocus.is_pause,
    is_lock: activeFocus.is_lock,
    live_enrichment: activeFocus.live_enrichment,
    branch: "step2_update_schedule",
    blocker: "",
    parsed_rows: 0,
    materialized_hs_get_ring_days_rows: 0,
    materialized_ring_day_rows: 0,
    source_sequence_json: JSON.stringify([], null, 2)
  };

  if (activeFocus.is_pause) {
    const payload = {
      action,
      focus_source: activeFocus.source,
      cadence_window: cadenceWindow,
      trigger_reason: "focus_show.is_pause",
      source_fetch_run: false,
      upstream_requests: 0,
      get_ring_days_run: false,
      update_schedule_run: false,
      downstream_run: false
    };
    const pausedPatch = {
      ...basePatch,
      status: "skipped",
      blocker: "focus_show.is_pause",
      payload_json: JSON.stringify(payload, null, 2)
    };
    await writeStageHeartbeat(app, heartbeatId, pausedPatch);
    await writeRawAirtableHeartbeat(heartbeatId, {
      ...pausedPatch,
      run_time: runTime
    });
    return {
      ok: true,
      status_code: 200,
      action,
      status: "skipped",
      blocker: "focus_show.is_pause",
      heartbeat_id: heartbeatId,
      run_id: runId,
      run_time: runTime,
      focus_source: activeFocus.source,
      focus_show_record_id: activeFocus.focus_show_record_id,
      show_no: activeFocus.show_no,
      focus_day: focusDay,
      is_pause: activeFocus.is_pause,
      is_lock: activeFocus.is_lock,
      live_enrichment: activeFocus.live_enrichment,
      cadence_window: cadenceWindow,
      trigger_reason: "focus_show.is_pause",
      source_fetch_run: false,
      upstream_requests: 0,
      source_request_sequence: [],
      hs_get_ring_days_count: 0,
      update_schedule_run: false,
      downstream_run: false,
      get_orders_run: false,
      get_rings_run: false,
      alerts_run: false
    };
  }

  const ringDayRows = await getStoredGetRingDayRows(app, activeFocus.show_no, focusDay);
  const runningPayload = {
    action,
    focus_source: activeFocus.source,
    cadence_window: cadenceWindow,
    trigger_reason: ringDayRows.length ? "current_hs_get_ring_days_available" : "missing_current_hs_get_ring_days",
    source_fetch_run: Boolean(ringDayRows.length),
    get_ring_days_run: false,
    update_schedule_run: Boolean(ringDayRows.length),
    downstream_run: false,
    hs_get_ring_days_count: ringDayRows.length
  };
  await writeStageHeartbeat(app, heartbeatId, {
    ...basePatch,
    status: "running",
    materialized_hs_get_ring_days_rows: ringDayRows.length,
    payload_json: JSON.stringify(runningPayload, null, 2)
  });
  await writeRawAirtableHeartbeat(heartbeatId, {
    ...basePatch,
    run_time: runTime,
    status: "running",
    materialized_hs_get_ring_days_rows: ringDayRows.length,
    payload_json: JSON.stringify(runningPayload, null, 2)
  });

  const context = createWorkflowContext();
  const schedules = [];
  let blocker = "";
  if (!ringDayRows.length) {
    blocker = "missing_current_hs_get_ring_days";
  } else {
    for (const ringDayRow of ringDayRows) {
      try {
        schedules.push(await fetchAndSyncUpdateScheduleOnly(req, app, activeFocus.show_no, ringDayRow, context, {
          replace: false,
          syncRawAirtableMirror: true,
          focusDay,
          heartbeatId,
          runId
        }));
      } catch (error) {
        blocker = `update_schedule_failed:${ringDayRow.ring_day_no}:${String(error?.message || error)}`;
        break;
      }
    }
  }

  const parsedRows = schedules.reduce((sum, item) => sum + Number(item.parsed_rows || 0), 0);
  const rawScheduleRows = schedules.reduce((sum, item) => sum + Number(item.raw_schedule_rows || item.parsed_rows || 0), 0);
  const preflightRows = schedules.reduce((sum, item) => sum + Number(item.preflight_rows || 0), 0);
  const nonPreflightRows = schedules.reduce((sum, item) => sum + Number(item.non_preflight_rows || 0), 0);
  const airtableMirrorRows = schedules.reduce((sum, item) => sum + Number(item.raw_airtable_mirror?.airtable_hs_update_schedule_rows || 0), 0);
  const airtableMirrorUpserts = schedules.reduce((sum, item) => sum + Number(item.raw_airtable_mirror?.airtable_hs_update_schedule_upserts || 0), 0);
  const airtableMirrorCreated = schedules.some((item) => item.raw_airtable_mirror?.airtable_hs_update_schedule_table_created === true);
  const updateScheduleCount = await countStoredUpdateScheduleRows(app, activeFocus.show_no, focusDay);
  if (!blocker && !parsedRows) blocker = "update_schedule_source_empty";
  if (!blocker && !updateScheduleCount) blocker = "hs_update_schedule_materialization_empty";
  if (!blocker && !airtableMirrorUpserts) blocker = "airtable_hs_update_schedule_mirror_empty";

  const finalPayload = {
    action,
    focus_source: activeFocus.source,
    cadence_window: cadenceWindow,
    trigger_reason: ringDayRows.length ? "current_hs_get_ring_days_available" : "missing_current_hs_get_ring_days",
    upstream_requests: context.upstreamRequests,
    source_request_sequence: context.sourceSequence,
    source_fetch_run: Boolean(ringDayRows.length),
    get_ring_days_run: false,
    hs_get_ring_days_count: ringDayRows.length,
    update_schedule_run: Boolean(ringDayRows.length),
    update_schedule_ring_day_requests: schedules.length,
    update_schedule_parsed_rows: parsedRows,
    raw_schedule_rows: rawScheduleRows,
    preflight_rows: preflightRows,
    non_preflight_rows: nonPreflightRows,
    hs_update_schedule_count: updateScheduleCount,
    airtable_hs_update_schedule_table_created: airtableMirrorCreated,
    airtable_hs_update_schedule_rows: airtableMirrorRows,
    airtable_hs_update_schedule_upserts: airtableMirrorUpserts,
    downstream_run: false,
    get_orders_run: false,
    get_rings_run: false,
    alerts_run: false,
    schedules
  };
  const finalPatch = {
    ...basePatch,
    status: blocker ? "fail" : "pass",
    blocker,
    parsed_rows: parsedRows,
    materialized_hs_get_ring_days_rows: ringDayRows.length,
    source_sequence_json: JSON.stringify(context.sourceSequence || [], null, 2),
    payload_json: JSON.stringify(finalPayload, null, 2)
  };
  await writeStageHeartbeat(app, heartbeatId, finalPatch);
  await writeRawAirtableHeartbeat(heartbeatId, {
    ...finalPatch,
    run_time: runTime
  });

  return {
    ok: !blocker,
    status_code: blocker ? 500 : 200,
    action,
    blocker,
    heartbeat_id: heartbeatId,
    run_id: runId,
    run_time: runTime,
    focus_source: activeFocus.source,
    focus_show_record_id: activeFocus.focus_show_record_id,
    show_no: activeFocus.show_no,
    focus_day: focusDay,
    is_pause: activeFocus.is_pause,
    is_lock: activeFocus.is_lock,
    live_enrichment: activeFocus.live_enrichment,
    cadence_window: cadenceWindow,
    trigger_reason: finalPayload.trigger_reason,
    source_fetch_run: Boolean(ringDayRows.length),
    upstream_requests: context.upstreamRequests,
    source_request_sequence: context.sourceSequence,
    hs_get_ring_days_count: ringDayRows.length,
    update_schedule_run: Boolean(ringDayRows.length),
    update_schedule_ring_day_requests: schedules.length,
    update_schedule_parsed_rows: parsedRows,
    raw_schedule_rows: rawScheduleRows,
    preflight_rows: preflightRows,
    non_preflight_rows: nonPreflightRows,
    hs_update_schedule_count: updateScheduleCount,
    airtable_hs_update_schedule_table_created: airtableMirrorCreated,
    airtable_hs_update_schedule_rows: airtableMirrorRows,
    airtable_hs_update_schedule_upserts: airtableMirrorUpserts,
    downstream_run: false,
    get_orders_run: false,
    get_rings_run: false,
    alerts_run: false,
    schedules
  };
}

async function countStoredClassOogRows(app, showNo, focusDay = "") {
  const safeFocusDay = dateKey(focusDay);
  const rows = await getPagedRowsFiltered(
    app,
    TABLES.classOog,
    (row) => (
      text(row.show_no) === text(showNo)
      && (!safeFocusDay || dateKey(row.focus_day) === safeFocusDay)
    ),
    { maxRows: 10000 }
  );
  return rows.rows.length;
}

async function deleteActiveFocusClassOogRows(app, showNo, focusDay) {
  const safeFocusDay = dateKey(focusDay);
  const rows = await getPagedRowsFiltered(
    app,
    TABLES.classOog,
    (row) => (
      text(row.show_no) === text(showNo)
      && dateKey(row.focus_day) === safeFocusDay
    ),
    { maxRows: 20000 }
  );
  const rowIds = rows.rows.map((row) => row.ROWID).filter(Boolean);
  const table = app.datastore().table(TABLES.classOog);
  let deleted = 0;
  for (let index = 0; index < rowIds.length; index += 100) {
    const batch = rowIds.slice(index, index + 100);
    if (batch.length) {
      await table.deleteRows(batch);
      deleted += batch.length;
    }
  }
  return {
    scanned: rows.rows.length,
    deleted,
    remaining: await countStoredClassOogRows(app, showNo, safeFocusDay)
  };
}

async function deleteRawAirtableClassOogRows(showNo, focusDay) {
  const tableStatus = await rawAirtableClassOogTableStatus();
  if (!tableStatus.exists || tableStatus.missing_fields?.length) {
    return {
      scanned: 0,
      deleted: 0,
      remaining: 0,
      skipped: true,
      table_status: tableStatus
    };
  }
  const safeFocusDay = dateKey(focusDay);
  const filterByFormula = `AND({show_no}=${airtableFormulaValue(text(showNo))},{focus_day}=${airtableFormulaValue(safeFocusDay)})`;
  const rows = await airtableListRecords(AIRTABLE_RAW_CLASS_OOG_TABLE, { filterByFormula });
  const deleted = await airtableDeleteRecords(AIRTABLE_RAW_CLASS_OOG_TABLE, rows.map((record) => record.id).filter(Boolean));
  const remaining = await airtableListRecords(AIRTABLE_RAW_CLASS_OOG_TABLE, { filterByFormula });
  return {
    scanned: rows.length,
    deleted,
    remaining: remaining.length,
    skipped: false,
    table_status: tableStatus
  };
}

function step3CheckpointHeartbeatId(showNo, focusDay) {
  return `${text(showNo)}|${dateKey(focusDay)}|step3-checkpoint`;
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(text(value) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function readRawAirtableHeartbeatById(heartbeatId) {
  try {
    const filterByFormula = `{heartbeat_id}=${airtableFormulaValue(heartbeatId)}`;
    const rows = await airtableListRecords(AIRTABLE_RAW_HEARTBEAT_TABLE, { filterByFormula });
    const row = rows[0] || null;
    return row ? { id: row.id, fields: row.fields || {} } : null;
  } catch {
    return null;
  }
}

async function readHeartbeatPayloadExact(app, heartbeatId) {
  const query = [
    "SELECT ROWID, heartbeat_id, payload_json",
    `FROM ${TABLES.heartbeat}`,
    `WHERE heartbeat_id = ${zcqlValue(heartbeatId)}`,
    "LIMIT 1"
  ].join(" ");
  const result = await app.zcql().executeZCQLQuery(query);
  const catalystRow = result?.[0]?.[TABLES.heartbeat] || null;
  let payload = parseJsonObject(catalystRow?.payload_json);
  if (Object.keys(payload).length) {
    return {
      exists: true,
      row_id: catalystRow.ROWID || "",
      payload,
      source: "catalyst.zcql"
    };
  }
  const airtableRow = await readRawAirtableHeartbeatById(heartbeatId);
  payload = parseJsonObject(airtableRow?.fields?.payload_json);
  if (Object.keys(payload).length) {
    return {
      exists: true,
      row_id: catalystRow?.ROWID || "",
      airtable_record_id: airtableRow.id,
      payload,
      source: catalystRow ? "airtable.hs_heartbeat_fallback" : "airtable.hs_heartbeat"
    };
  }
  return {
    exists: Boolean(catalystRow || airtableRow),
    row_id: catalystRow?.ROWID || "",
    airtable_record_id: airtableRow?.id || "",
    payload: {},
    source: catalystRow ? "catalyst.zcql_empty_or_invalid_payload" : (airtableRow ? "airtable.empty_or_invalid_payload" : "missing")
  };
}

function step3ScheduleSignature(row) {
  return [
    text(row.update_schedule_key),
    text(row.ring_day_no),
    text(row.ring_no),
    text(row.time_text),
    text(row.class_no),
    text(row.class_name),
    text(row.event_type),
    text(row.entry_count)
  ].join("|");
}

function step3EntryScopeSignature(activeEntryNos, activeTrainerKeys) {
  const entries = [...(activeEntryNos || new Set())].map(text).filter(Boolean).sort();
  if (entries.length) return `entries:${entries.join("|")}`;
  return `trainers:${[...(activeTrainerKeys || new Set())].map(text).filter(Boolean).sort().join("|")}`;
}

async function readStep3Checkpoint(app, showNo, focusDay) {
  const checkpointId = step3CheckpointHeartbeatId(showNo, focusDay);
  const checkpoint = await readHeartbeatPayloadExact(app, checkpointId);
  return {
    exists: checkpoint.exists,
    row_id: checkpoint.row_id || "",
    airtable_record_id: checkpoint.airtable_record_id || "",
    heartbeat_id: checkpointId,
    payload: checkpoint.payload || {},
    source: checkpoint.source,
    corrupt: checkpoint.exists && !Object.keys(checkpoint.payload || {}).length
  };
}

function buildStep3Checkpoint({
  existingPayload = {},
  showNo,
  focusDay,
  runId,
  runTime,
  eligibleRows = [],
  activeEntryScopeKey = "",
  activeEntryNos = new Set(),
  activeTrainers = [],
  classResults = [],
  requestedOffset = 0,
  requestedLimit = 8,
  resetReason = "",
  force = false
} = {}) {
  const previousChecked = existingPayload?.checked_classes && typeof existingPayload.checked_classes === "object"
    ? existingPayload.checked_classes
    : {};
  const checkedClasses = resetReason || force ? {} : { ...previousChecked };
  for (const result of classResults || []) {
    const key = text(result.update_schedule_key);
    if (!key) continue;
    checkedClasses[key] = {
      update_schedule_key: key,
      class_no: text(result.class_no),
      ring_day_no: text(result.ring_day_no),
      ring_no: text(result.ring_no),
      entry_count: intOrNull(result.entry_count),
      status: text(result.status || "parsed"),
      hold_reason: text(result.hold_reason),
      schedule_signature: text(result.schedule_signature),
      last_checked_at: runTime,
      parsed_rows: Number(result.parsed_rows || 0),
      matched_rows: Number(result.active_trainer_matched_rows || 0),
      skipped_broad_rows: Number(result.broad_nonmatching_rows_skipped || 0)
    };
  }
  const signaturesByKey = new Map(eligibleRows.map((row) => [text(row.update_schedule_key), step3ScheduleSignature(row)]));
  const currentKeys = new Set([...signaturesByKey.keys()]);
  for (const key of Object.keys(checkedClasses)) {
    if (!currentKeys.has(key)) delete checkedClasses[key];
  }
  const checkedCurrentKeys = Object.entries(checkedClasses)
    .filter(([key, item]) => currentKeys.has(key) && text(item.schedule_signature) === text(signaturesByKey.get(key)))
    .map(([key]) => key);
  const checkedSet = new Set(checkedCurrentKeys);
  const nextUncheckedIndex = eligibleRows.findIndex((row) => !checkedSet.has(text(row.update_schedule_key)));
  const parsedTotal = Object.values(checkedClasses).reduce((sum, item) => sum + Number(item.parsed_rows || 0), 0);
  const matchedTotal = Object.values(checkedClasses).reduce((sum, item) => sum + Number(item.matched_rows || 0), 0);
  const skippedTotal = Object.values(checkedClasses).reduce((sum, item) => sum + Number(item.skipped_broad_rows || 0), 0);
  const heldTotal = Object.values(checkedClasses).filter((item) => text(item.status) === "held").length;
  return {
    checkpoint_version: 1,
    show_no: text(showNo),
    focus_day: dateKey(focusDay),
    focus_day_key: dateKey(focusDay).replace(/-/g, ""),
    show_focus_key: `${text(showNo)}|${dateKey(focusDay).replace(/-/g, "")}`,
    run_id: runId,
    last_checked_at: runTime,
    active_entry_scope_key: activeEntryScopeKey,
    active_entry_nos: [...(activeEntryNos || new Set())].map(text).filter(Boolean).sort(),
    active_trainers: activeTrainers,
    total_eligible_classes: eligibleRows.length,
    checked_class_count: checkedCurrentKeys.length,
    next_unchecked_index: nextUncheckedIndex < 0 ? eligibleRows.length : nextUncheckedIndex,
    requested_offset: requestedOffset,
    requested_limit: requestedLimit,
    parsed_row_count: parsedTotal,
    matched_row_count: matchedTotal,
    skipped_broad_row_count: skippedTotal,
    held_class_count: heldTotal,
    complete: eligibleRows.length > 0 && checkedCurrentKeys.length >= eligibleRows.length,
    reset_reason: resetReason,
    checked_classes: checkedClasses
  };
}

async function writeStep3Checkpoint(app, showNo, focusDay, checkpointPayload, basePatch = {}) {
  const heartbeatId = step3CheckpointHeartbeatId(showNo, focusDay);
  const focusDayKey = dateKey(focusDay).replace(/-/g, "");
  const patch = {
    ...basePatch,
    heartbeat_id: heartbeatId,
    run_id: text(checkpointPayload.run_id || "step3-checkpoint"),
    show_no: intValue(showNo),
    focus_day: dateKey(focusDay),
    focus_day_key: focusDayKey,
    branch: "step3_class_oog_checkpoint",
    status: checkpointPayload.complete ? "complete" : "open",
    blocker: "",
    parsed_rows: Number(checkpointPayload.parsed_row_count || 0),
    payload_json: JSON.stringify(checkpointPayload, null, 2)
  };
  await writeStageHeartbeat(app, heartbeatId, patch);
  await writeRawAirtableHeartbeat(heartbeatId, patch);
  return { heartbeat_id: heartbeatId, ...checkpointPayload };
}

async function runWecStep3CleanActiveClassOog(req, app, action, query, body) {
  const activeFocus = await getActiveAirtableFocusShowStrict();
  if (!activeFocus.ok) {
    return {
      ok: false,
      status_code: 409,
      action,
      blocker: activeFocus.blocker,
      active_count: activeFocus.active_count || 0
    };
  }
  const focusDay = dateKey(activeFocus.focus_day);
  const cleanup = await deleteActiveFocusClassOogRows(app, activeFocus.show_no, focusDay);
  const airtableCleanup = await deleteRawAirtableClassOogRows(activeFocus.show_no, focusDay);
  const isClean = cleanup.remaining === 0 && airtableCleanup.remaining === 0;
  return {
    ok: isClean,
    status_code: isClean ? 200 : 500,
    action,
    focus_source: activeFocus.source,
    focus_show_record_id: activeFocus.focus_show_record_id,
    show_no: activeFocus.show_no,
    focus_day: focusDay,
    scanned_active_focus_rows: cleanup.scanned,
    deleted_active_focus_rows: cleanup.deleted,
    remaining_active_focus_rows: cleanup.remaining,
    airtable_hs_class_oog_scanned_active_focus_rows: airtableCleanup.scanned,
    airtable_hs_class_oog_deleted_active_focus_rows: airtableCleanup.deleted,
    airtable_hs_class_oog_remaining_active_focus_rows: airtableCleanup.remaining,
    airtable_hs_class_oog_table_status: airtableCleanup.table_status,
    old_show_delete_scope: false,
    downstream_run: false,
    get_orders_run: false,
    get_rings_run: false,
    alerts_run: false,
    blocker: isClean ? "" : "active_focus_hs_class_oog_cleanup_incomplete"
  };
}

async function fetchAndSyncClassOogForScheduleRow(req, app, showNo, focusDay, scheduleRow, context, activeEntryNos = new Set(), activeTrainerKeys = new Set(), helperConfig = {}) {
  const classNo = text(scheduleRow.class_no);
  const upstreamResponse = await upstream(req, `/class_oog.php?class_no=${encodeURIComponent(classNo)}`, {
    method: "GET",
    showNo,
    context
  });
  const parsedRows = parseClassOogRows(upstreamResponse.raw, showNo, classNo);
  const parsedEntryNos = [...new Set(parsedRows.map((row) => text(row.current_entry_no || row.entry_no)).filter(Boolean))];
  const parsedHorseNames = [...new Set(parsedRows.map((row) => text(row.current_horse || row.horse)).filter(Boolean))];
  const matchReasonCounts = {};
  const matchedRows = parsedRows.filter((row) => {
    const match = step3ClassOogMatch(row, activeEntryNos, activeTrainerKeys, helperConfig);
    for (const reason of match.reasons || []) {
      matchReasonCounts[reason] = Number(matchReasonCounts[reason] || 0) + 1;
    }
    return match.matched;
  });
  const rawRow = {
    show_no: showNo,
    focus_day: focusDay,
    ring_day_no: scheduleRow.ring_day_no,
    ring_no: scheduleRow.ring_no,
    ring_name: scheduleRow.ring_name,
    class_no: classNo,
    class_label: scheduleRow.class_name || scheduleRow.event_name || classNo,
    class_name: scheduleRow.class_name || scheduleRow.event_name || "",
    staging_record_id: scheduleRow.row_id || "",
    raw_key: classOogRawKey(showNo, focusDay, scheduleRow.ring_day_no, scheduleRow.ring_no, classNo)
  };
  const sourceRows = matchedRows
    .map((row) => classOogSourceRowCanonical(row, rawRow))
    .filter(Boolean);
  const result = sourceRows.length
    ? await upsertSourceRowsFast(app, TABLES.classOog, "class_oog_key", sourceRows, { showNo })
    : { rows: 0, inserted: 0, updated: 0, skipped: 0 };
  return {
    update_schedule_key: scheduleRow.update_schedule_key,
    ring_day_no: scheduleRow.ring_day_no,
    ring_no: scheduleRow.ring_no,
    ring_name: scheduleRow.ring_name,
    class_no: classNo,
    class_name: scheduleRow.class_name,
    schedule_signature: step3ScheduleSignature(scheduleRow),
    upstream_status: upstreamResponse.status,
    parsed_rows: parsedRows.length,
    parsed_entry_nos: parsedEntryNos,
    parsed_horse_names: parsedHorseNames,
    source_contains_hermes_274: parsedRows.some((row) => (
      text(row.current_entry_no || row.entry_no) === "274"
      && normalizeHorseHelperKey(row.current_horse || row.horse).includes("hermes")
    )),
    active_trainer_matched_rows: matchedRows.length,
    match_reason_counts: matchReasonCounts,
    broad_nonmatching_rows_skipped: Math.max(0, parsedRows.length - matchedRows.length),
    source_rows: sourceRows.length,
    inserted: result.inserted,
    updated: result.updated,
    skipped: result.skipped,
    rows: result.rows,
    class_oog_rows: sourceRows
  };
}

function step3MatchSummary(parsedRows = [], activeEntryNos = new Set(), activeTrainerKeys = new Set(), helperConfig = {}) {
  const matchReasonCounts = {};
  const matchedRows = [];
  const skippedRows = [];
  for (const row of parsedRows || []) {
    const match = step3ClassOogMatch(row, activeEntryNos, activeTrainerKeys, helperConfig);
    if (match.matched) {
      matchedRows.push(row);
      for (const reason of match.reasons || []) {
        matchReasonCounts[reason] = Number(matchReasonCounts[reason] || 0) + 1;
      }
    } else {
      skippedRows.push(row);
    }
  }
  return {
    matched_rows: matchedRows,
    skipped_rows: skippedRows,
    matched_count: matchedRows.length,
    skipped_count: skippedRows.length,
    match_reason_counts: matchReasonCounts,
    possible_match: matchedRows.length > 0
  };
}

async function resolveStep3Scope(app, activeFocus) {
  const activeTrainerConfig = await getActiveTrainerConfig(app, activeFocus.show_no);
  const activeTrainerEntryScope = await getAirtableActiveTrainerEntryScope(activeFocus.show_no);
  const activeTrainers = (activeTrainerConfig.active_trainers || []).map(text).filter(Boolean);
  const activeTrainerKeys = new Set(activeTrainers.map(normalizeTrainerKey).filter(Boolean));
  const activeEntryNos = new Set((activeTrainerEntryScope.active_entry_nos || []).map(text).filter(Boolean));
  const helperConfig = await getStep3CatalystHelperMatchConfig(app, activeFocus.show_no, activeTrainerKeys);
  const hasScope = Boolean(
    activeEntryNos.size
    || activeTrainerKeys.size
    || helperConfig.trainer_keys.size
    || helperConfig.horse_keys.size
    || helperConfig.rider_keys.size
  );
  return {
    activeTrainerConfig,
    activeTrainerEntryScope,
    activeTrainers,
    activeTrainerKeys,
    activeEntryNos,
    helperConfig,
    hasScope
  };
}

function step3RawPayloadFromSchedule(activeFocus, focusDay, scheduleRow, rawHtml, upstreamStatus, runTime, matchSummary = {}) {
  const probeStatus = text(matchSummary.probe_status) || (matchSummary.possible_match ? "match_possible" : "checked_no_match");
  const parsedStatus = text(matchSummary.parsed_status) || "unparsed";
  const parseStatus = text(matchSummary.parse_status) || (rawHtml ? "stored" : probeStatus);
  return cleanRowForDatastore({
    raw_key: classOogRawKey(activeFocus.show_no, focusDay, scheduleRow.ring_day_no, scheduleRow.ring_no, scheduleRow.class_no),
    show_no: text(activeFocus.show_no),
    focus_day: focusDay,
    ring_day_no: text(scheduleRow.ring_day_no),
    ring_no: text(scheduleRow.ring_no),
    ring_name: text(scheduleRow.ring_name),
    class_no: text(scheduleRow.class_no),
    class_label: text(scheduleRow.class_name || scheduleRow.event_name || scheduleRow.class_no),
    staging_record_id: text(scheduleRow.row_id),
    raw_html: rawHtml || "",
    upstream_status: intValue(upstreamStatus) ?? 200,
    fetched_at: catalystDateTime(runTime),
    last_checked_at: catalystDateTime(runTime),
    parse_status: parseStatus,
    probe_status: probeStatus,
    possible_match: matchSummary.possible_match === true,
    raw_stored: Boolean(rawHtml),
    parsed_status: parsedStatus,
    matched_count: intValue(matchSummary.matched_count) || 0,
    skipped_count: intValue(matchSummary.skipped_count) || 0,
    match_reason_counts: JSON.stringify(matchSummary.match_reason_counts || {}, null, 2)
  });
}

const STEP3_LARGE_CLASS_ENTRY_LIMIT = 20;

function step3LargeClassHoldReason(row) {
  const entryCount = intOrNull(row?.entry_count);
  if (entryCount !== null && entryCount > STEP3_LARGE_CLASS_ENTRY_LIMIT) return "large_class_over_20";
  return "";
}

function step3HeldClassResult(row, runTime, holdReason) {
  return {
    update_schedule_key: text(row.update_schedule_key),
    class_no: text(row.class_no),
    ring_day_no: text(row.ring_day_no),
    ring_no: text(row.ring_no),
    entry_count: intOrNull(row.entry_count),
    status: "held",
    hold_reason: holdReason,
    schedule_signature: step3ScheduleSignature(row),
    parsed_rows: 0,
    active_trainer_matched_rows: 0,
    broad_nonmatching_rows_skipped: 0,
    match_reason_counts: { [holdReason]: 1 },
    last_checked_at: runTime
  };
}

async function holdStep3LargeClassRaw(app, activeFocus, focusDay, scheduleRow, runTime, holdReason) {
  const rawPayload = step3RawPayloadFromSchedule(
    activeFocus,
    focusDay,
    scheduleRow,
    "",
    0,
    runTime,
    {
      possible_match: false,
      matched_count: 0,
      skipped_count: 0,
      probe_status: holdReason,
      parse_status: "held",
      parsed_status: "held",
      match_reason_counts: {
        [holdReason]: 1,
        entry_count: intOrNull(scheduleRow.entry_count),
        threshold: STEP3_LARGE_CLASS_ENTRY_LIMIT
      }
    }
  );
  const result = await upsert(app, TABLES.classOogRaw, { raw_key: rawPayload.raw_key }, rawPayload);
  return {
    raw_key: rawPayload.raw_key,
    raw_rec_id: result.row?.ROWID || "",
    hold_reason: holdReason,
    entry_count: intOrNull(scheduleRow.entry_count)
  };
}

async function downloadStep3ClassOogRaw(req, app, activeFocus, focusDay, scheduleRow, context, runTime) {
  const upstreamResponse = await upstream(req, `/class_oog.php?class_no=${encodeURIComponent(text(scheduleRow.class_no))}`, {
    method: "GET",
    showNo: activeFocus.show_no,
    context
  });
  const rawPayload = step3RawPayloadFromSchedule(
    activeFocus,
    focusDay,
    scheduleRow,
    upstreamResponse.raw,
    upstreamResponse.status,
    runTime,
    {
      possible_match: false,
      matched_count: 0,
      skipped_count: 0,
      probe_status: "downloaded",
      parse_status: "stored",
      parsed_status: "unparsed",
      match_reason_counts: {}
    }
  );
  const result = await upsert(app, TABLES.classOogRaw, { raw_key: rawPayload.raw_key }, rawPayload);
  return {
    raw_key: rawPayload.raw_key,
    raw_rec_id: result.row?.ROWID || "",
    raw_html: upstreamResponse.raw,
    upstream_status: upstreamResponse.status
  };
}

async function parseStoredStep3ClassOogRaw(app, activeFocus, focusDay, rawRow, scope, runTime, heartbeatId, runId) {
  const allParsedRows = parseClassOogRows(rawRow.raw_html, activeFocus.show_no, rawRow.class_no);
  const matchSummary = step3MatchSummary(allParsedRows, scope.activeEntryNos, scope.activeTrainerKeys, scope.helperConfig);
  const sourceRows = matchSummary.matched_rows
    .map((row) => classOogSourceRowCanonical(row, rawRow))
    .filter(Boolean);
  const catalystResult = sourceRows.length
    ? await upsertSourceRowsFast(app, TABLES.classOog, "class_oog_key", sourceRows, { showNo: activeFocus.show_no })
    : { rows: 0, inserted: 0, updated: 0, skipped: 0 };
  const airtableMirror = sourceRows.length
    ? await syncRawAirtableClassOogRows(activeFocus.show_no, focusDay, sourceRows, { heartbeatId, runId })
    : {
        airtable_hs_class_oog_rows: 0,
        airtable_hs_class_oog_upserts: 0,
        skipped: true,
        table_status: { skipped: true, reason: "no_source_rows" }
      };
  if (rawRow?.ROWID) {
    await app.datastore().table(TABLES.classOogRaw).updateRow({
      ROWID: rawRow.ROWID,
      parsed_at: catalystDateTime(runTime),
      parse_status: "parsed",
      parsed_status: "parsed",
      probe_status: "downloaded_parsed",
      possible_match: matchSummary.possible_match === true,
      matched_count: matchSummary.matched_count,
      skipped_count: matchSummary.skipped_count,
      match_reason_counts: JSON.stringify(matchSummary.match_reason_counts || {}, null, 2)
    });
  }
  return {
    update_schedule_key: text(rawRow.update_schedule_key || rawRow.class_no),
    class_no: text(rawRow.class_no),
    ring_day_no: text(rawRow.ring_day_no),
    ring_no: text(rawRow.ring_no),
    entry_count: intOrNull(rawRow.entry_count),
    status: "parsed",
    hold_reason: "",
    schedule_signature: text(rawRow.schedule_signature),
    parsed_rows: allParsedRows.length,
    active_trainer_matched_rows: sourceRows.length,
    broad_nonmatching_rows_skipped: Math.max(0, allParsedRows.length - sourceRows.length),
    match_reason_counts: matchSummary.match_reason_counts,
    source_rows: sourceRows.length,
    catalyst_rows: catalystResult.rows,
    catalyst_inserted: catalystResult.inserted,
    catalyst_updated: catalystResult.updated,
    airtable_hs_class_oog_rows: airtableMirror.airtable_hs_class_oog_rows,
    airtable_hs_class_oog_upserts: airtableMirror.airtable_hs_class_oog_upserts,
    matched_rows: sourceRows.map((row) => ({
      class_no: row.class_no,
      entry_no: row.entry_no,
      horse: row.horse,
      rider: row.rider,
      trainer: row.trainer,
      entry_order: row.entry_order
    }))
  };
}

async function getClassOogRawRowByKey(app, rawKey) {
  const key = text(rawKey);
  if (!key) return null;
  const query = `SELECT ROWID, raw_key, show_no, focus_day, ring_day_no, ring_no, ring_name, class_no, class_label, staging_record_id, raw_html, upstream_status, probe_status, possible_match, raw_stored, parsed_status, matched_count, skipped_count, match_reason_counts FROM ${TABLES.classOogRaw} WHERE raw_key = ${zcqlValue(key)} LIMIT 1`;
  return (await app.zcql().executeZCQLQuery(query))?.[0]?.[TABLES.classOogRaw] || null;
}

async function runWecStep3ClassOogProbeOnly(req, app, action, query, body) {
  const activeFocus = await getActiveAirtableFocusShowStrict();
  if (!activeFocus.ok) {
    return {
      ok: false,
      status_code: 409,
      action,
      blocker: activeFocus.blocker,
      active_count: activeFocus.active_count || 0
    };
  }
  const runTime = new Date().toISOString();
  const runId = text(query.get("run_id") || body.run_id) || `wec-step3a-${runTime.replace(/[^0-9A-Za-z]/g, "")}`;
  const focusDay = dateKey(activeFocus.focus_day);
  const heartbeatId = `${activeFocus.show_no}|${focusDay}|${runId}`;
  const context = createWorkflowContext();
  let blocker = "";
  let targetRow = null;
  let rawResult = null;
  let parsedRows = [];
  let matchSummary = step3MatchSummary([]);
  let rawBefore = null;
  let rawAfter = null;
  const updateScheduleRows = await getStoredUpdateScheduleRows(app, activeFocus.show_no, focusDay);
  const preflightSummary = summarizeUpdateSchedulePreflight(updateScheduleRows);
  const eligibleRows = updateScheduleRows.filter((row) => !updateSchedulePreflightReason(row));
  const scope = await resolveStep3Scope(app, activeFocus);
  const targetClassNo = text(query.get("class_no") || body.class_no);
  if (activeFocus.is_pause) {
    blocker = "focus_show.is_pause";
  } else if (!updateScheduleRows.length) {
    blocker = "missing_current_hs_update_schedule";
  } else if (!eligibleRows.length) {
    blocker = "missing_non_preflight_hs_update_schedule";
  } else if (!scope.hasScope) {
    blocker = "missing_active_trainer_scope";
  } else if (targetClassNo) {
    targetRow = eligibleRows.find((row) => text(row.class_no) === targetClassNo) || null;
    if (!targetRow) blocker = `target_class_not_found_or_preflight:${targetClassNo}`;
  } else {
    for (const row of eligibleRows) {
      const rawKey = classOogRawKey(activeFocus.show_no, focusDay, row.ring_day_no, row.ring_no, row.class_no);
      const existingRaw = await getClassOogRawRowByKey(app, rawKey);
      if (!existingRaw || query.get("force") === "1" || body.force === true || body.force === "1") {
        targetRow = row;
        break;
      }
    }
    if (!targetRow) blocker = "no_unchecked_class_oog_probe_candidates";
  }
  if (!blocker && targetRow) {
    const rawKey = classOogRawKey(activeFocus.show_no, focusDay, targetRow.ring_day_no, targetRow.ring_no, targetRow.class_no);
    rawBefore = await getClassOogRawRowByKey(app, rawKey);
    const upstreamResponse = await upstream(req, `/class_oog.php?class_no=${encodeURIComponent(text(targetRow.class_no))}`, {
      method: "GET",
      showNo: activeFocus.show_no,
      context
    });
    parsedRows = parseClassOogRows(upstreamResponse.raw, activeFocus.show_no, targetRow.class_no);
    matchSummary = step3MatchSummary(parsedRows, scope.activeEntryNos, scope.activeTrainerKeys, scope.helperConfig);
    const rawPayload = step3RawPayloadFromSchedule(
      activeFocus,
      focusDay,
      targetRow,
      matchSummary.possible_match ? upstreamResponse.raw : "",
      upstreamResponse.status,
      runTime,
      matchSummary
    );
    rawResult = await upsert(app, TABLES.classOogRaw, { raw_key: rawPayload.raw_key }, rawPayload);
    rawAfter = await getClassOogRawRowByKey(app, rawPayload.raw_key);
  }
  const payload = {
    action,
    focus_source: activeFocus.source,
    focus_show_record_id: activeFocus.focus_show_record_id,
    show_no: activeFocus.show_no,
    focus_day: focusDay,
    target_class_no: targetRow?.class_no || targetClassNo || "",
    source_fetch_run: Boolean(!blocker && targetRow),
    upstream_requests: context.upstreamRequests,
    source_request_sequence: context.sourceSequence,
    class_oog_requests: context.upstreamRequests,
    parsed_rows_checked_for_match: parsedRows.length,
    possible_match: matchSummary.possible_match,
    raw_stored: Boolean(rawAfter?.raw_html),
    raw_key: rawAfter?.raw_key || rawResult?.row?.raw_key || "",
    raw_rec_id: rawAfter?.ROWID || rawResult?.row?.ROWID || "",
    probe_status: rawAfter?.probe_status || "",
    parsed_status: rawAfter?.parsed_status || "",
    matched_count: matchSummary.matched_count,
    skipped_count: matchSummary.skipped_count,
    match_reason_counts: matchSummary.match_reason_counts,
    helper_match_source: scope.helperConfig.source,
    helper_match_counts: scope.helperConfig.counts,
    helper_match_warnings: scope.helperConfig.warnings,
    active_trainers: scope.activeTrainers,
    active_entry_nos: [...scope.activeEntryNos],
    hs_update_schedule_count: updateScheduleRows.length,
    raw_schedule_rows: preflightSummary.raw_schedule_rows,
    preflight_rows: preflightSummary.preflight_rows,
    non_preflight_rows: preflightSummary.non_preflight_rows,
    hs_class_oog_written: false,
    checkpoint_advanced: false,
    raw_existing_before_probe: Boolean(rawBefore),
    step1_run: false,
    step2_run: false,
    step3_parse_run: false,
    step4_run: false,
    step5_run: false,
    step6_run: false,
    downstream_run: false,
    get_orders_run: false,
    get_rings_run: false,
    get_results_run: false,
    alerts_run: false,
    output_run: false
  };
  const patch = {
    heartbeat_id: heartbeatId,
    run_id: runId,
    run_time: catalystDateTime(runTime),
    show_no: intValue(activeFocus.show_no),
    focus_day: focusDay,
    focus_day_key: focusDay.replace(/-/g, ""),
    focus_show_record_id: activeFocus.focus_show_record_id,
    branch: "step3_class_oog_probe",
    status: blocker ? (blocker === "focus_show.is_pause" ? "skipped" : "fail") : "pass",
    blocker,
    parsed_rows: parsedRows.length,
    source_sequence_json: JSON.stringify(context.sourceSequence || [], null, 2),
    payload_json: JSON.stringify(payload, null, 2)
  };
  await writeStageHeartbeat(app, heartbeatId, patch);
  await writeRawAirtableHeartbeat(heartbeatId, { ...patch, run_time: runTime });
  return {
    ok: !blocker || blocker === "focus_show.is_pause",
    status_code: blocker && blocker !== "focus_show.is_pause" ? 500 : 200,
    blocker,
    heartbeat_id: heartbeatId,
    run_id: runId,
    run_time: runTime,
    ...payload
  };
}

async function runWecStep3ClassOogParseOnly(app, action, query, body) {
  const activeFocus = await getActiveAirtableFocusShowStrict();
  if (!activeFocus.ok) {
    return {
      ok: false,
      status_code: 409,
      action,
      blocker: activeFocus.blocker,
      active_count: activeFocus.active_count || 0
    };
  }
  const runTime = new Date().toISOString();
  const runId = text(query.get("run_id") || body.run_id) || `wec-step3b-${runTime.replace(/[^0-9A-Za-z]/g, "")}`;
  const focusDay = dateKey(activeFocus.focus_day);
  const heartbeatId = `${activeFocus.show_no}|${focusDay}|${runId}`;
  const updateScheduleRows = await getStoredUpdateScheduleRows(app, activeFocus.show_no, focusDay);
  const eligibleRows = updateScheduleRows.filter((row) => !updateSchedulePreflightReason(row));
  const targetClassNo = text(query.get("class_no") || body.class_no);
  const rawRecId = text(query.get("raw_rec_id") || body.raw_rec_id);
  const scope = await resolveStep3Scope(app, activeFocus);
  let blocker = "";
  let rawRow = null;
  let scheduleRow = null;
  if (activeFocus.is_pause) {
    blocker = "focus_show.is_pause";
  } else if (!scope.hasScope) {
    blocker = "missing_active_trainer_scope";
  } else if (rawRecId) {
    rawRow = await getClassOogRawRow(app, rawRecId);
  } else {
    scheduleRow = targetClassNo
      ? eligibleRows.find((row) => text(row.class_no) === targetClassNo)
      : eligibleRows.find((row) => true);
    if (scheduleRow) {
      rawRow = await getClassOogRawRowByKey(app, classOogRawKey(activeFocus.show_no, focusDay, scheduleRow.ring_day_no, scheduleRow.ring_no, scheduleRow.class_no));
    }
  }
  if (!blocker && !rawRow) blocker = targetClassNo ? `raw_class_oog_not_found:${targetClassNo}` : "raw_class_oog_not_found";
  if (!blocker && !text(rawRow.raw_html)) blocker = "raw_class_oog_html_missing";
  const allParsedRows = blocker ? [] : parseClassOogRows(rawRow.raw_html, activeFocus.show_no, rawRow.class_no);
  const matchSummary = step3MatchSummary(allParsedRows, scope.activeEntryNos, scope.activeTrainerKeys, scope.helperConfig);
  const sourceRows = blocker
    ? []
    : matchSummary.matched_rows.map((row) => classOogSourceRowCanonical(row, rawRow)).filter(Boolean);
  const catalystResult = sourceRows.length
    ? await upsertSourceRowsFast(app, TABLES.classOog, "class_oog_key", sourceRows, { showNo: activeFocus.show_no })
    : { rows: 0, inserted: 0, updated: 0, skipped: 0 };
  const airtableMirror = sourceRows.length
    ? await syncRawAirtableClassOogRows(activeFocus.show_no, focusDay, sourceRows, { heartbeatId, runId })
    : {
        airtable_hs_class_oog_rows: 0,
        airtable_hs_class_oog_upserts: 0,
        skipped: true,
        table_status: { skipped: true, reason: "no_source_rows" }
      };
  if (!blocker && rawRow?.ROWID) {
    await app.datastore().table(TABLES.classOogRaw).updateRow({
      ROWID: rawRow.ROWID,
      parsed_at: catalystDateTime(runTime),
      parse_status: "parsed",
      parsed_status: "parsed",
      matched_count: matchSummary.matched_count,
      skipped_count: matchSummary.skipped_count,
      match_reason_counts: JSON.stringify(matchSummary.match_reason_counts || {}, null, 2)
    });
  }
  const hermesMaterialized = sourceRows.some((row) => text(row.entry_no) === "274" && normalizeHorseHelperKey(row.horse).includes("hermes"));
  const sandenalMaterialized = sourceRows.some((row) => normalizeHorseHelperKey(row.horse).includes("sandenal"));
  const payload = {
    action,
    focus_source: activeFocus.source,
    focus_show_record_id: activeFocus.focus_show_record_id,
    show_no: activeFocus.show_no,
    focus_day: focusDay,
    target_class_no: rawRow?.class_no || targetClassNo || "",
    raw_key: rawRow?.raw_key || "",
    raw_rec_id: rawRow?.ROWID || "",
    source_fetch_run: false,
    upstream_requests: 0,
    source_request_sequence: [],
    total_parsed_rows: allParsedRows.length,
    matched_count: matchSummary.matched_count,
    skipped_count: matchSummary.skipped_count,
    match_reason_counts: matchSummary.match_reason_counts,
    source_rows: sourceRows.length,
    hs_class_oog_rows: catalystResult.rows,
    hs_class_oog_inserted: catalystResult.inserted,
    hs_class_oog_updated: catalystResult.updated,
    airtable_hs_class_oog: airtableMirror,
    hermes_materialized: hermesMaterialized,
    sandenal_materialized: sandenalMaterialized,
    helper_match_source: scope.helperConfig.source,
    helper_match_counts: scope.helperConfig.counts,
    helper_match_warnings: scope.helperConfig.warnings,
    active_trainers: scope.activeTrainers,
    active_entry_nos: [...scope.activeEntryNos],
    matched_rows: sourceRows.map((row) => ({
      class_no: row.class_no,
      entry_no: row.entry_no,
      horse: row.horse,
      rider: row.rider,
      trainer: row.trainer,
      entry_order: row.entry_order
    })),
    step1_run: false,
    step2_run: false,
    step3_probe_run: false,
    step4_run: false,
    step5_run: false,
    step6_run: false,
    downstream_run: false,
    get_orders_run: false,
    get_rings_run: false,
    get_results_run: false,
    alerts_run: false,
    output_run: false
  };
  const patch = {
    heartbeat_id: heartbeatId,
    run_id: runId,
    run_time: catalystDateTime(runTime),
    show_no: intValue(activeFocus.show_no),
    focus_day: focusDay,
    focus_day_key: focusDay.replace(/-/g, ""),
    focus_show_record_id: activeFocus.focus_show_record_id,
    branch: "step3_class_oog_parse",
    status: blocker ? (blocker === "focus_show.is_pause" ? "skipped" : "fail") : "pass",
    blocker,
    parsed_rows: allParsedRows.length,
    source_sequence_json: JSON.stringify([], null, 2),
    payload_json: JSON.stringify(payload, null, 2)
  };
  await writeStageHeartbeat(app, heartbeatId, patch);
  await writeRawAirtableHeartbeat(heartbeatId, { ...patch, run_time: runTime });
  return {
    ok: !blocker || blocker === "focus_show.is_pause",
    status_code: blocker && blocker !== "focus_show.is_pause" ? 500 : 200,
    blocker,
    heartbeat_id: heartbeatId,
    run_id: runId,
    run_time: runTime,
    ...payload
  };
}

async function runWecStep3ClassOogOnly(req, app, action, query, body) {
  const activeFocus = await getActiveAirtableFocusShowStrict();
  if (!activeFocus.ok) {
    return {
      ok: false,
      status_code: 409,
      action,
      blocker: activeFocus.blocker,
      active_count: activeFocus.active_count || 0,
      update_schedule_run: false,
      class_oog_run: false,
      downstream_run: false
    };
  }
  const runTime = new Date().toISOString();
  const runId = text(query.get("run_id") || body.run_id) || `wec-step3-${runTime.replace(/[^0-9A-Za-z]/g, "")}`;
  const focusDay = dateKey(activeFocus.focus_day);
  const focusDayKey = focusDay.replace(/-/g, "");
  const updateScheduleRows = await getStoredUpdateScheduleRows(app, activeFocus.show_no, focusDay);
  const preflightSummary = summarizeUpdateSchedulePreflight(updateScheduleRows);
  const eligibleRows = updateScheduleRows.filter((row) => !updateSchedulePreflightReason(row));
  const scope = await resolveStep3Scope(app, activeFocus);
  const activeEntryScopeKey = step3HelperScopeSignature(scope.activeEntryNos, scope.activeTrainerKeys, scope.helperConfig);
  const checkpointBefore = await readStep3Checkpoint(app, activeFocus.show_no, focusDay);
  const step3Force = query.get("step3_force") === "1" || body.step3_force === "1" || body.step3_force === true;
  const requestedClassNo = text(query.get("class_no") || body.class_no);
  let checkpointResetReason = "";
  if (checkpointBefore.corrupt) checkpointResetReason = "checkpoint_corrupt";
  if (!checkpointResetReason && text(checkpointBefore.payload?.show_focus_key) && text(checkpointBefore.payload.show_focus_key) !== `${text(activeFocus.show_no)}|${focusDayKey}`) {
    checkpointResetReason = "show_focus_key_changed";
  }
  if (!checkpointResetReason && text(checkpointBefore.payload?.active_entry_scope_key) && text(checkpointBefore.payload.active_entry_scope_key) !== activeEntryScopeKey) {
    checkpointResetReason = "active_entry_scope_changed";
  }
  if (step3Force) checkpointResetReason = "manual_force";
  const usableCheckedClasses = checkpointResetReason ? {} : (checkpointBefore.payload?.checked_classes || {});
  const shouldProbeRow = (row) => {
    const key = text(row.update_schedule_key);
    const checked = key ? usableCheckedClasses[key] : null;
    return !checked || text(checked.schedule_signature) !== step3ScheduleSignature(row);
  };
  const step3Limit = requestedClassNo
    ? 1
    : Math.max(1, Math.min(intOrNull(query.get("step3_limit") || body.step3_limit) || 10, 15));
  const targetRows = requestedClassNo
    ? eligibleRows.filter((row) => text(row.class_no) === requestedClassNo).slice(0, 1)
    : eligibleRows.filter(shouldProbeRow).slice(0, step3Limit);
  const classResults = [];
  const heldClasses = [];
  const downloadedClasses = [];
  const parsedClasses = [];
  let blocker = "";
  const context = createWorkflowContext();
  if (activeFocus.is_pause) blocker = "focus_show.is_pause";
  else if (!updateScheduleRows.length) blocker = "missing_current_hs_update_schedule";
  else if (!eligibleRows.length) blocker = "missing_non_preflight_hs_update_schedule";
  else if (!scope.hasScope) blocker = "missing_active_trainer_scope";
  else if (!targetRows.length) blocker = requestedClassNo ? `target_class_not_found_or_preflight:${requestedClassNo}` : "";

  if (!blocker && targetRows.length) {
    for (const row of targetRows) {
      const holdReason = step3LargeClassHoldReason(row);
      if (holdReason && !requestedClassNo) {
        const heldRaw = await holdStep3LargeClassRaw(app, activeFocus, focusDay, row, runTime, holdReason);
        const heldResult = step3HeldClassResult(row, runTime, holdReason);
        classResults.push(heldResult);
        heldClasses.push({
          class_no: text(row.class_no),
          ring_day_no: text(row.ring_day_no),
          ring_no: text(row.ring_no),
          entry_count: intOrNull(row.entry_count),
          hold_reason: holdReason,
          raw_key: heldRaw.raw_key,
          raw_rec_id: heldRaw.raw_rec_id
        });
        continue;
      }

      let downloaded = null;
      try {
        downloaded = await downloadStep3ClassOogRaw(req, app, activeFocus, focusDay, row, context, runTime);
      } catch (error) {
        blocker = `class_oog_download_failed:${text(row.class_no)}:${String(error?.message || error)}`;
        break;
      }
      downloadedClasses.push({
        class_no: text(row.class_no),
        ring_day_no: text(row.ring_day_no),
        ring_no: text(row.ring_no),
        entry_count: intOrNull(row.entry_count),
        raw_key: downloaded.raw_key,
        raw_rec_id: downloaded.raw_rec_id
      });
      const rawRow = {
        ...(await getClassOogRawRowByKey(app, downloaded.raw_key)),
        update_schedule_key: text(row.update_schedule_key),
        schedule_signature: step3ScheduleSignature(row),
        entry_count: intOrNull(row.entry_count)
      };
      if (!text(rawRow.raw_html)) {
        blocker = `raw_class_oog_html_missing_after_download:${text(row.class_no)}`;
        break;
      }
      const parsed = await parseStoredStep3ClassOogRaw(app, activeFocus, focusDay, rawRow, scope, runTime, `${activeFocus.show_no}|${focusDay}|${runId}`, runId);
      classResults.push(parsed);
      parsedClasses.push(parsed);
    }
  }

  const checkpointPayload = buildStep3Checkpoint({
    existingPayload: checkpointBefore.payload,
    showNo: activeFocus.show_no,
    focusDay,
    runId,
    runTime,
    eligibleRows,
    activeEntryScopeKey,
    activeEntryNos: scope.activeEntryNos,
    activeTrainers: scope.activeTrainers,
    classResults,
    requestedOffset: targetRows.length ? eligibleRows.findIndex((row) => text(row.update_schedule_key) === text(targetRows[0].update_schedule_key)) : eligibleRows.length,
    requestedLimit: step3Limit,
    resetReason: checkpointResetReason,
    force: step3Force
  });
  const parsedRowCount = parsedClasses.reduce((sum, item) => sum + Number(item.parsed_rows || 0), 0);
  const matchedCount = parsedClasses.reduce((sum, item) => sum + Number(item.active_trainer_matched_rows || 0), 0);
  const skippedCount = parsedClasses.reduce((sum, item) => sum + Number(item.broad_nonmatching_rows_skipped || 0), 0);
  const hsClassOogRows = parsedClasses.reduce((sum, item) => sum + Number(item.source_rows || item.catalyst_rows || 0), 0);
  const matchedRows = parsedClasses.flatMap((item) => item.matched_rows || []);
  const sourceSequence = context.sourceSequence || [];
  const basePatch = {
    run_id: runId,
    run_time: catalystDateTime(runTime),
    show_no: intValue(activeFocus.show_no),
    focus_day: focusDay,
    focus_day_key: focusDayKey,
    focus_show_record_id: activeFocus.focus_show_record_id,
    is_pause: activeFocus.is_pause,
    is_lock: activeFocus.is_lock,
    live_enrichment: activeFocus.live_enrichment,
    branch: "step3_class_oog_probe_parse",
    blocker: "",
    parsed_rows: parsedRowCount,
    materialized_hs_get_ring_days_rows: 0,
    materialized_ring_day_rows: 0,
    source_sequence_json: JSON.stringify(sourceSequence, null, 2)
  };
  const checkpointAfter = await writeStep3Checkpoint(app, activeFocus.show_no, focusDay, checkpointPayload, basePatch);
  const checkedCount = Number(checkpointAfter.checked_class_count || 0);
  const finalPayload = {
    action,
    focus_source: activeFocus.source,
    focus_show_record_id: activeFocus.focus_show_record_id,
    show_no: activeFocus.show_no,
    focus_day: focusDay,
    trigger_reason: targetRows.length ? "bounded_raw_download_parse_batch" : (checkpointAfter.complete ? "step3_checkpoint_complete" : "no_step3_candidate"),
    one_class_per_run: false,
    classes_per_run_limit: step3Limit,
    probe_first_contract: true,
    target_class_no: requestedClassNo || "",
    target_class_nos: targetRows.map((row) => text(row.class_no)),
    source_fetch_run: downloadedClasses.length > 0,
    upstream_requests: Number(context.upstreamRequests || 0),
    source_request_sequence: sourceSequence,
    class_oog_requests: downloadedClasses.length,
    raw_download_only_contract: true,
    large_class_entry_limit: STEP3_LARGE_CLASS_ENTRY_LIMIT,
    held_large_classes: heldClasses,
    held_class_count: heldClasses.length,
    downloaded_classes: downloadedClasses,
    downloaded_class_count: downloadedClasses.length,
    parsed_classes: parsedClasses.map((item) => ({
      class_no: item.class_no,
      ring_day_no: item.ring_day_no,
      ring_no: item.ring_no,
      entry_count: item.entry_count,
      parsed_rows: item.parsed_rows,
      matched_rows: item.active_trainer_matched_rows,
      skipped_broad_rows: item.broad_nonmatching_rows_skipped
    })),
    parsed_class_count: parsedClasses.length,
    parsed_rows_checked_for_match: parsedRowCount,
    total_parsed_rows: parsedRowCount,
    matched_count: matchedCount,
    skipped_count: skippedCount,
    hs_class_oog_rows: hsClassOogRows,
    hermes_materialized: matchedRows.some((row) => text(row.entry_no) === "274" && normalizeHorseHelperKey(row.horse).includes("hermes")),
    sandenal_materialized: matchedRows.some((row) => normalizeHorseHelperKey(row.horse).includes("sandenal")),
    checkpoint_heartbeat_id: checkpointAfter.heartbeat_id,
    checkpoint_checked_class_count: checkedCount,
    checkpoint_next_unchecked_index: checkpointAfter.next_unchecked_index,
    checkpoint_complete: checkpointAfter.complete,
    checkpoint_held_class_count: checkpointAfter.held_class_count || 0,
    step3_remaining_rows: Math.max(0, eligibleRows.length - checkedCount),
    helper_match_source: scope.helperConfig.source,
    helper_match_counts: scope.helperConfig.counts,
    helper_match_warnings: scope.helperConfig.warnings,
    active_trainers: scope.activeTrainers,
    active_entry_nos: [...scope.activeEntryNos],
    hs_update_schedule_count: updateScheduleRows.length,
    raw_schedule_rows: preflightSummary.raw_schedule_rows,
    preflight_rows: preflightSummary.preflight_rows,
    non_preflight_rows: preflightSummary.non_preflight_rows,
    step1_run: false,
    step2_run: false,
    step4_run: false,
    step5_run: false,
    step6_run: false,
    downstream_run: false,
    get_orders_run: false,
    get_rings_run: false,
    get_results_run: false,
    alerts_run: false,
    output_run: false
  };
  const heartbeatId = `${activeFocus.show_no}|${focusDay}|${runId}`;
  const finalPatch = {
    ...basePatch,
    heartbeat_id: heartbeatId,
    status: blocker ? (blocker === "focus_show.is_pause" ? "skipped" : "fail") : "pass",
    blocker,
    parsed_rows: finalPayload.parsed_rows_checked_for_match || finalPayload.total_parsed_rows,
    payload_json: JSON.stringify(finalPayload, null, 2)
  };
  await writeStageHeartbeat(app, heartbeatId, finalPatch);
  await writeRawAirtableHeartbeat(heartbeatId, { ...finalPatch, run_time: runTime });
  return {
    ok: !blocker || blocker === "focus_show.is_pause",
    status_code: blocker && blocker !== "focus_show.is_pause" ? 500 : 200,
    blocker,
    heartbeat_id: heartbeatId,
    run_id: runId,
    run_time: runTime,
    ...finalPayload
  };
}

async function runWecStep3ClassOogLegacyOnly(req, app, action, query, body) {
  const activeFocus = await getActiveAirtableFocusShowStrict();
  if (!activeFocus.ok) {
    return {
      ok: false,
      status_code: 409,
      action,
      blocker: activeFocus.blocker,
      active_count: activeFocus.active_count || 0,
      update_schedule_run: false,
      class_oog_run: false,
      downstream_run: false
    };
  }

  const runTime = new Date().toISOString();
  const runId = text(query.get("run_id") || body.run_id) || `wec-step3-${runTime.replace(/[^0-9A-Za-z]/g, "")}`;
  const focusDay = dateKey(activeFocus.focus_day);
  const focusDayKey = focusDay.replace(/-/g, "");
  const heartbeatId = `${activeFocus.show_no}|${focusDay}|${runId}`;
  const cadenceWindow = text(query.get("cadence_window") || body.cadence_window || "");
  const hasExplicitStep3Offset = query.has("step3_offset") || body.step3_offset !== undefined;
  const step3Force = query.get("step3_force") === "1" || body.step3_force === "1" || body.step3_force === true;
  const step3Offset = Math.max(0, intOrNull(query.get("step3_offset") || body.step3_offset) || 0);
  const step3Limit = Math.max(1, Math.min(intOrNull(query.get("step3_limit") || body.step3_limit) || 8, 10));
  const basePatch = {
    run_id: runId,
    run_time: catalystDateTime(runTime),
    show_no: intValue(activeFocus.show_no),
    focus_day: focusDay,
    focus_day_key: focusDayKey,
    focus_show_record_id: activeFocus.focus_show_record_id,
    is_pause: activeFocus.is_pause,
    is_lock: activeFocus.is_lock,
    live_enrichment: activeFocus.live_enrichment,
    branch: "step3_class_oog",
    blocker: "",
    parsed_rows: 0,
    materialized_hs_get_ring_days_rows: 0,
    materialized_ring_day_rows: 0,
    source_sequence_json: JSON.stringify([], null, 2)
  };

  if (activeFocus.is_pause) {
    const payload = {
      action,
      focus_source: activeFocus.source,
      cadence_window: cadenceWindow,
      trigger_reason: "focus_show.is_pause",
      source_fetch_run: false,
      upstream_requests: 0,
      get_ring_days_run: false,
      update_schedule_run: false,
      class_oog_run: false,
      downstream_run: false
    };
    const pausedPatch = {
      ...basePatch,
      status: "skipped",
      blocker: "focus_show.is_pause",
      payload_json: JSON.stringify(payload, null, 2)
    };
    await writeStageHeartbeat(app, heartbeatId, pausedPatch);
    await writeRawAirtableHeartbeat(heartbeatId, {
      ...pausedPatch,
      run_time: runTime
    });
    return {
      ok: true,
      status_code: 200,
      action,
      status: "skipped",
      blocker: "focus_show.is_pause",
      heartbeat_id: heartbeatId,
      run_id: runId,
      run_time: runTime,
      focus_source: activeFocus.source,
      focus_show_record_id: activeFocus.focus_show_record_id,
      show_no: activeFocus.show_no,
      focus_day: focusDay,
      is_pause: activeFocus.is_pause,
      is_lock: activeFocus.is_lock,
      live_enrichment: activeFocus.live_enrichment,
      cadence_window: cadenceWindow,
      source_fetch_run: false,
      upstream_requests: 0,
      source_request_sequence: [],
      get_ring_days_run: false,
      update_schedule_run: false,
      class_oog_run: false,
      downstream_run: false,
      get_orders_run: false,
      get_rings_run: false,
      alerts_run: false
    };
  }

  const updateScheduleRows = await getStoredUpdateScheduleRows(app, activeFocus.show_no, focusDay);
  const preflightSummary = summarizeUpdateSchedulePreflight(updateScheduleRows);
  const eligibleRows = updateScheduleRows.filter((row) => !updateSchedulePreflightReason(row));
  const activeTrainerConfig = await getActiveTrainerConfig(app, activeFocus.show_no);
  const activeTrainerEntryScope = await getAirtableActiveTrainerEntryScope(activeFocus.show_no);
  const activeTrainers = (activeTrainerConfig.active_trainers || []).map(text).filter(Boolean);
  const activeTrainerKeys = new Set(activeTrainers.map(normalizeTrainerKey).filter(Boolean));
  const activeEntryNos = new Set((activeTrainerEntryScope.active_entry_nos || []).map(text).filter(Boolean));
  const helperConfig = await getStep3CatalystHelperMatchConfig(app, activeFocus.show_no, activeTrainerKeys);
  const activeEntryScopeKey = step3HelperScopeSignature(activeEntryNos, activeTrainerKeys, helperConfig);
  const hasStep3MatchScope = Boolean(
    activeEntryNos.size
    || activeTrainerKeys.size
    || helperConfig.trainer_keys.size
    || helperConfig.horse_keys.size
    || helperConfig.rider_keys.size
  );
  const targetClassNo = text(query.get("class_no") || body.class_no);
  if (targetClassNo) {
    const targetRows = eligibleRows.filter((row) => text(row.class_no) === targetClassNo);
    const targetRow = targetRows[0] || null;
    const context = createWorkflowContext();
    let blocker = "";
    let classResult = null;
    if (!updateScheduleRows.length) {
      blocker = "missing_current_hs_update_schedule";
    } else if (!eligibleRows.length) {
      blocker = "missing_non_preflight_hs_update_schedule";
    } else if (!targetRow) {
      blocker = `target_class_not_found_or_preflight:${targetClassNo}`;
    } else if (!hasStep3MatchScope) {
      blocker = "missing_active_trainer_scope";
    } else {
      try {
        classResult = await fetchAndSyncClassOogForScheduleRow(req, app, activeFocus.show_no, focusDay, targetRow, context, activeEntryNos, activeTrainerKeys, helperConfig);
      } catch (error) {
        blocker = `class_oog_failed:${targetClassNo}:${String(error?.message || error)}`;
      }
    }
    const sourceRows = classResult?.class_oog_rows || [];
    const rawAirtableMirror = sourceRows.length
      ? await syncRawAirtableClassOogRows(activeFocus.show_no, focusDay, sourceRows, { heartbeatId, runId })
      : {
          airtable_hs_class_oog_rows: 0,
          airtable_hs_class_oog_upserts: 0,
          skipped: true,
          table_status: { skipped: true, reason: "no_source_rows" }
        };
    const hermesMaterialized = sourceRows.some((row) => (
      text(row.entry_no) === "274"
      && normalizeHorseHelperKey(row.horse).includes("hermes")
    ));
    const sandenalMaterialized = sourceRows.some((row) => normalizeHorseHelperKey(row.horse).includes("sandenal"));
    if (!blocker && !classResult?.parsed_rows) blocker = "class_oog_source_empty";
    if (!blocker && !hermesMaterialized) blocker = "target_hermes_not_materialized";
    const payload = {
      action,
      focus_source: activeFocus.source,
      targeted_class_oog_rerun: true,
      target_class_no: targetClassNo,
      checkpoint_advanced: false,
      checkpoint_write_run: false,
      source_fetch_run: Boolean(targetRow && hasStep3MatchScope),
      upstream_requests: context.upstreamRequests,
      source_request_sequence: context.sourceSequence,
      get_ring_days_run: false,
      update_schedule_run: false,
      downstream_run: false,
      get_orders_run: false,
      get_rings_run: false,
      get_results_run: false,
      alerts_run: false,
      hs_update_schedule_count: updateScheduleRows.length,
      raw_schedule_rows: preflightSummary.raw_schedule_rows,
      preflight_rows: preflightSummary.preflight_rows,
      non_preflight_rows: preflightSummary.non_preflight_rows,
      target_rows_found: targetRows.length,
      helper_match_source: helperConfig.source,
      helper_match_counts: helperConfig.counts,
      helper_match_warnings: helperConfig.warnings,
      active_trainer_source: "getActiveTrainerConfig",
      active_entry_source: activeTrainerEntryScope.source,
      active_trainers: activeTrainers,
      active_entry_nos: [...activeEntryNos],
      class_oog_requests: classResult ? 1 : 0,
      class_oog_parsed_rows: Number(classResult?.parsed_rows || 0),
      parsed_entry_nos: classResult?.parsed_entry_nos || [],
      parsed_horse_names: classResult?.parsed_horse_names || [],
      source_contains_hermes_274: classResult?.source_contains_hermes_274 === true,
      active_trainer_matched_rows: Number(classResult?.active_trainer_matched_rows || 0),
      match_reason_counts: classResult?.match_reason_counts || {},
      broad_nonmatching_rows_skipped: Number(classResult?.broad_nonmatching_rows_skipped || 0),
      source_rows: sourceRows.length,
      hermes_materialized: hermesMaterialized,
      sandenal_materialized: sandenalMaterialized,
      airtable_hs_class_oog: rawAirtableMirror,
      matched_rows: sourceRows.map((row) => ({
        class_no: row.class_no,
        entry_no: row.entry_no,
        horse: row.horse,
        rider: row.rider,
        trainer: row.trainer,
        entry_order: row.entry_order
      }))
    };
    const finalPatch = {
      ...basePatch,
      branch: "step3_class_oog_targeted",
      status: blocker ? "fail" : "pass",
      blocker,
      parsed_rows: Number(classResult?.parsed_rows || 0),
      source_sequence_json: JSON.stringify(context.sourceSequence || [], null, 2),
      payload_json: JSON.stringify(payload, null, 2)
    };
    await writeStageHeartbeat(app, heartbeatId, finalPatch);
    await writeRawAirtableHeartbeat(heartbeatId, {
      ...finalPatch,
      run_time: runTime
    });
    return {
      ok: !blocker,
      status_code: blocker ? 500 : 200,
      action,
      blocker,
      heartbeat_id: heartbeatId,
      run_id: runId,
      run_time: runTime,
      focus_source: activeFocus.source,
      focus_show_record_id: activeFocus.focus_show_record_id,
      show_no: activeFocus.show_no,
      focus_day: focusDay,
      ...payload
    };
  }
  const checkpointBefore = await readStep3Checkpoint(app, activeFocus.show_no, focusDay);
  let checkpointResetReason = "";
  if (checkpointBefore.corrupt) checkpointResetReason = "checkpoint_corrupt";
  if (!checkpointResetReason && text(checkpointBefore.payload?.show_focus_key) && text(checkpointBefore.payload.show_focus_key) !== `${text(activeFocus.show_no)}|${focusDayKey}`) {
    checkpointResetReason = "show_focus_key_changed";
  }
  if (!checkpointResetReason && text(checkpointBefore.payload?.active_entry_scope_key) && text(checkpointBefore.payload.active_entry_scope_key) !== activeEntryScopeKey) {
    checkpointResetReason = "active_entry_scope_changed";
  }
  if (step3Force) checkpointResetReason = "manual_force";
  const usableCheckedClasses = checkpointResetReason ? {} : (checkpointBefore.payload?.checked_classes || {});
  const shouldProbeRow = (row) => {
    const key = text(row.update_schedule_key);
    const checked = key ? usableCheckedClasses[key] : null;
    return !checked || text(checked.schedule_signature) !== step3ScheduleSignature(row);
  };
  const requestedWindowRows = hasExplicitStep3Offset
    ? eligibleRows.slice(step3Offset, step3Offset + step3Limit)
    : eligibleRows.filter(shouldProbeRow).slice(0, step3Limit);
  const autoWindowStartIndex = requestedWindowRows.length
    ? eligibleRows.findIndex((row) => text(row.update_schedule_key) === text(requestedWindowRows[0].update_schedule_key))
    : eligibleRows.length;
  const effectiveStep3Offset = hasExplicitStep3Offset ? step3Offset : Math.max(0, autoWindowStartIndex);
  const chunkRows = requestedWindowRows.filter(shouldProbeRow);
  const skippedAlreadyCheckedRows = Math.max(0, requestedWindowRows.length - chunkRows.length);
  const checkpointNoop = Boolean(requestedWindowRows.length && !chunkRows.length && !checkpointResetReason);
  const runningPayload = {
    action,
    focus_source: activeFocus.source,
    cadence_window: cadenceWindow,
    trigger_reason: eligibleRows.length ? "current_hs_update_schedule_non_preflight_available" : "missing_non_preflight_hs_update_schedule",
    source_fetch_run: Boolean(chunkRows.length && hasStep3MatchScope),
    get_ring_days_run: false,
    update_schedule_run: false,
    class_oog_run: Boolean(chunkRows.length && hasStep3MatchScope),
    downstream_run: false,
    hs_update_schedule_count: updateScheduleRows.length,
    raw_schedule_rows: preflightSummary.raw_schedule_rows,
    preflight_rows: preflightSummary.preflight_rows,
    non_preflight_rows: preflightSummary.non_preflight_rows,
    bounded_probe: true,
    step3_offset: effectiveStep3Offset,
    step3_limit: step3Limit,
    step3_force: step3Force,
    checkpoint_heartbeat_id: checkpointBefore.heartbeat_id,
    checkpoint_exists: checkpointBefore.exists,
    checkpoint_reset_reason: checkpointResetReason,
    checkpoint_noop: checkpointNoop,
    skipped_already_checked_rows: skippedAlreadyCheckedRows,
    requested_window_rows: requestedWindowRows.length,
    step3_chunk_rows: chunkRows.length,
    step3_remaining_rows: Math.max(0, eligibleRows.filter(shouldProbeRow).length - chunkRows.length),
    active_trainer_source: "getActiveTrainerConfig",
    active_entry_source: activeTrainerEntryScope.source,
    helper_match_source: helperConfig.source,
    helper_match_counts: helperConfig.counts,
    helper_match_warnings: helperConfig.warnings,
    active_trainers: activeTrainers,
    active_entry_nos: [...activeEntryNos]
  };
  await writeStageHeartbeat(app, heartbeatId, {
    ...basePatch,
    status: "running",
    payload_json: JSON.stringify(runningPayload, null, 2)
  });
  await writeRawAirtableHeartbeat(heartbeatId, {
    ...basePatch,
    run_time: runTime,
    status: "running",
    payload_json: JSON.stringify(runningPayload, null, 2)
  });

  const context = createWorkflowContext();
  const classResults = [];
  let blocker = "";
  if (!updateScheduleRows.length) {
    blocker = "missing_current_hs_update_schedule";
  } else if (!eligibleRows.length) {
    blocker = "missing_non_preflight_hs_update_schedule";
  } else if (!hasStep3MatchScope) {
    blocker = "missing_active_trainer_scope";
  } else if (!requestedWindowRows.length) {
    blocker = "step3_chunk_empty";
  } else if (checkpointNoop) {
    blocker = "";
  } else {
    for (const scheduleRow of chunkRows) {
      try {
        classResults.push(await fetchAndSyncClassOogForScheduleRow(req, app, activeFocus.show_no, focusDay, scheduleRow, context, activeEntryNos, activeTrainerKeys, helperConfig));
      } catch (error) {
        blocker = `class_oog_failed:${scheduleRow.class_no}:${String(error?.message || error)}`;
        break;
      }
    }
  }

  const parsedRows = classResults.reduce((sum, item) => sum + Number(item.parsed_rows || 0), 0);
  const activeTrainerMatchedRows = classResults.reduce((sum, item) => sum + Number(item.active_trainer_matched_rows || 0), 0);
  const broadNonmatchingRowsSkipped = classResults.reduce((sum, item) => sum + Number(item.broad_nonmatching_rows_skipped || 0), 0);
  const sourceRows = classResults.flatMap((item) => item.class_oog_rows || []);
  const catalystClassOogRows = await countStoredClassOogRows(app, activeFocus.show_no, focusDay);
  const rawAirtableMirror = sourceRows.length
    ? await syncRawAirtableClassOogRows(activeFocus.show_no, focusDay, sourceRows, { heartbeatId, runId })
    : {
        airtable_hs_class_oog_rows: 0,
        airtable_hs_class_oog_upserts: 0,
        skipped: true,
        table_status: { skipped: true, reason: "no_source_rows" }
      };
  const checkpointPayload = buildStep3Checkpoint({
    existingPayload: checkpointBefore.payload,
    showNo: activeFocus.show_no,
    focusDay,
    runId,
    runTime,
    eligibleRows,
    activeEntryScopeKey,
    activeEntryNos,
    activeTrainers,
    classResults,
    requestedOffset: effectiveStep3Offset,
    requestedLimit: step3Limit,
    resetReason: checkpointResetReason,
    force: step3Force
  });
  const checkpointAfter = await writeStep3Checkpoint(app, activeFocus.show_no, focusDay, checkpointPayload, basePatch);
  if (!blocker && !parsedRows && !checkpointNoop) blocker = "class_oog_source_empty";
  if (!blocker && !catalystClassOogRows) blocker = "hs_class_oog_materialization_empty";

  const finalPayload = {
    action,
    focus_source: activeFocus.source,
    cadence_window: cadenceWindow,
    trigger_reason: runningPayload.trigger_reason,
    upstream_requests: context.upstreamRequests,
    source_request_sequence: context.sourceSequence,
    source_fetch_run: Boolean(chunkRows.length && hasStep3MatchScope),
    get_ring_days_run: false,
    update_schedule_run: false,
    hs_update_schedule_count: updateScheduleRows.length,
    raw_schedule_rows: preflightSummary.raw_schedule_rows,
    preflight_rows: preflightSummary.preflight_rows,
    non_preflight_rows: preflightSummary.non_preflight_rows,
    class_oog_run: Boolean(chunkRows.length && hasStep3MatchScope),
    class_oog_input_rows: eligibleRows.length,
    bounded_probe: true,
    step3_offset: effectiveStep3Offset,
    step3_limit: step3Limit,
    step3_force: step3Force,
    checkpoint_heartbeat_id: checkpointAfter.heartbeat_id,
    checkpoint_exists_before: checkpointBefore.exists,
    checkpoint_reset_reason: checkpointResetReason,
    checkpoint_noop: checkpointNoop,
    skipped_already_checked_rows: skippedAlreadyCheckedRows,
    requested_window_rows: requestedWindowRows.length,
    checkpoint_checked_class_count: checkpointAfter.checked_class_count,
    checkpoint_next_unchecked_index: checkpointAfter.next_unchecked_index,
    checkpoint_complete: checkpointAfter.complete,
    step3_chunk_rows: chunkRows.length,
    step3_remaining_rows: Math.max(0, eligibleRows.length - checkpointAfter.checked_class_count),
    active_trainer_source: "getActiveTrainerConfig",
    active_entry_source: activeTrainerEntryScope.source,
    helper_match_source: helperConfig.source,
    helper_match_counts: helperConfig.counts,
    helper_match_warnings: helperConfig.warnings,
    active_trainers: activeTrainers,
    active_entry_nos: [...activeEntryNos],
    match_reason_counts: classResults.reduce((acc, item) => {
      for (const [reason, count] of Object.entries(item.match_reason_counts || {})) {
        acc[reason] = Number(acc[reason] || 0) + Number(count || 0);
      }
      return acc;
    }, {}),
    class_oog_requests: classResults.length,
    class_oog_parsed_rows: parsedRows,
    active_trainer_matched_rows: activeTrainerMatchedRows,
    broad_nonmatching_rows_skipped: broadNonmatchingRowsSkipped,
    hs_class_oog_count: catalystClassOogRows,
    airtable_hs_class_oog: rawAirtableMirror,
    checkpoint: checkpointAfter,
    downstream_run: false,
    get_orders_run: false,
    get_rings_run: false,
    alerts_run: false,
    class_results: classResults.map((item) => {
      const { class_oog_rows, ...summary } = item;
      return summary;
    })
  };
  const finalPatch = {
    ...basePatch,
    status: blocker ? "fail" : "pass",
    blocker,
    parsed_rows: parsedRows,
    source_sequence_json: JSON.stringify(context.sourceSequence || [], null, 2),
    payload_json: JSON.stringify(finalPayload, null, 2)
  };
  await writeStageHeartbeat(app, heartbeatId, finalPatch);
  await writeRawAirtableHeartbeat(heartbeatId, {
    ...finalPatch,
    run_time: runTime
  });

  return {
    ok: !blocker,
    status_code: blocker ? 500 : 200,
    action,
    blocker,
    heartbeat_id: heartbeatId,
    run_id: runId,
    run_time: runTime,
    focus_source: activeFocus.source,
    focus_show_record_id: activeFocus.focus_show_record_id,
    show_no: activeFocus.show_no,
    focus_day: focusDay,
    is_pause: activeFocus.is_pause,
    is_lock: activeFocus.is_lock,
    live_enrichment: activeFocus.live_enrichment,
    cadence_window: cadenceWindow,
    upstream_requests: context.upstreamRequests,
    source_request_sequence: context.sourceSequence,
    source_fetch_run: Boolean(chunkRows.length && hasStep3MatchScope),
    get_ring_days_run: false,
    update_schedule_run: false,
    hs_update_schedule_count: updateScheduleRows.length,
    raw_schedule_rows: preflightSummary.raw_schedule_rows,
    preflight_rows: preflightSummary.preflight_rows,
    non_preflight_rows: preflightSummary.non_preflight_rows,
    class_oog_run: Boolean(chunkRows.length && hasStep3MatchScope),
    class_oog_input_rows: eligibleRows.length,
    bounded_probe: true,
    step3_offset: effectiveStep3Offset,
    step3_limit: step3Limit,
    step3_force: step3Force,
    checkpoint_heartbeat_id: checkpointAfter.heartbeat_id,
    checkpoint_exists_before: checkpointBefore.exists,
    checkpoint_reset_reason: checkpointResetReason,
    checkpoint_noop: checkpointNoop,
    skipped_already_checked_rows: skippedAlreadyCheckedRows,
    requested_window_rows: requestedWindowRows.length,
    checkpoint_checked_class_count: checkpointAfter.checked_class_count,
    checkpoint_next_unchecked_index: checkpointAfter.next_unchecked_index,
    checkpoint_complete: checkpointAfter.complete,
    step3_chunk_rows: chunkRows.length,
    step3_remaining_rows: Math.max(0, eligibleRows.length - checkpointAfter.checked_class_count),
    active_trainer_source: "getActiveTrainerConfig",
    active_entry_source: activeTrainerEntryScope.source,
    helper_match_source: helperConfig.source,
    helper_match_counts: helperConfig.counts,
    helper_match_warnings: helperConfig.warnings,
    active_trainers: activeTrainers,
    active_entry_nos: [...activeEntryNos],
    match_reason_counts: classResults.reduce((acc, item) => {
      for (const [reason, count] of Object.entries(item.match_reason_counts || {})) {
        acc[reason] = Number(acc[reason] || 0) + Number(count || 0);
      }
      return acc;
    }, {}),
    class_oog_requests: classResults.length,
    class_oog_parsed_rows: parsedRows,
    active_trainer_matched_rows: activeTrainerMatchedRows,
    broad_nonmatching_rows_skipped: broadNonmatchingRowsSkipped,
    hs_class_oog_count: catalystClassOogRows,
    airtable_hs_class_oog_rows: rawAirtableMirror.airtable_hs_class_oog_rows || 0,
    airtable_hs_class_oog_upserts: rawAirtableMirror.airtable_hs_class_oog_upserts || 0,
    airtable_hs_class_oog_skipped: rawAirtableMirror.skipped === true,
    airtable_hs_class_oog_table_status: rawAirtableMirror.table_status,
    downstream_run: false,
    get_orders_run: false,
    get_rings_run: false,
    alerts_run: false,
    class_results: finalPayload.class_results
  };
}

function mapUpdateScheduleMirrorFields(row) {
  return assertNoUpdateScheduleManualMirrorFields({
    [AIRTABLE_UPDATE_SCHEDULE_FIELDS.mirror_update_schedule_key]: row.update_schedule_key,
    [AIRTABLE_UPDATE_SCHEDULE_FIELDS.show_no]: row.show_no,
    [AIRTABLE_UPDATE_SCHEDULE_FIELDS.class_no]: row.class_no,
    [AIRTABLE_UPDATE_SCHEDULE_FIELDS.ring_day_no]: row.ring_day_no,
    [AIRTABLE_UPDATE_SCHEDULE_FIELDS.ring_no]: row.ring_no,
    [AIRTABLE_UPDATE_SCHEDULE_FIELDS.ring_name]: row.ring_name,
    [AIRTABLE_UPDATE_SCHEDULE_FIELDS.date_text]: row.date_text,
    [AIRTABLE_UPDATE_SCHEDULE_FIELDS.iso_date]: row.iso_date,
    [AIRTABLE_UPDATE_SCHEDULE_FIELDS.event_id]: row.event_id,
    [AIRTABLE_UPDATE_SCHEDULE_FIELDS.event_name]: row.event_name,
    [AIRTABLE_UPDATE_SCHEDULE_FIELDS.class_payout]: row.class_payout,
    [AIRTABLE_UPDATE_SCHEDULE_FIELDS.class_name]: row.class_name,
    [AIRTABLE_UPDATE_SCHEDULE_FIELDS.time_text]: row.time_text,
    [AIRTABLE_UPDATE_SCHEDULE_FIELDS.entry_count]: row.entry_count,
    [AIRTABLE_UPDATE_SCHEDULE_FIELDS.event_type]: row.event_type,
    [AIRTABLE_UPDATE_SCHEDULE_FIELDS.oc_id]: row.oc_id,
    [AIRTABLE_UPDATE_SCHEDULE_FIELDS.live_flag]: row.live_flag,
    [AIRTABLE_UPDATE_SCHEDULE_FIELDS.source]: "update_schedule.php"
  });
}

function mapUpdateScheduleStagingFields(row, runTime) {
  const stagingKey = updateScheduleStagingCanonicalKey(row);
  const displayDate = displayDateText(row.iso_date || row.date_text);
  const fields = {
    [AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.staging_key]: stagingKey,
    [AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.show_no]: row.show_no,
    [AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.class_no]: row.class_no,
    [AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.ring_day_no]: row.ring_day_no,
    [AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.ring_no]: row.ring_no,
    [AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.ring_name]: row.ring_name,
    [AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.date_text]: displayDate,
    [AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.iso_date]: row.iso_date,
    [AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.event_id]: row.event_id,
    [AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.event_name]: row.event_name,
    [AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.class_name]: row.class_name,
    [AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.time_text]: row.time_text,
    [AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.entry_count]: row.entry_count,
    [AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.event_type]: row.event_type,
    [AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.oc_id]: row.oc_id,
    [AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.live_flag]: row.live_flag,
    [AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.source]: "update_schedule.php",
    [AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.inactive]: false,
    [AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.last_run_time]: runTime
  };
  const sourceRecordIds = sourceUpdateScheduleRecordIds(row);
  if (sourceRecordIds.length) {
    fields[AIRTABLE_UPDATE_SCHEDULE_STAGING_PROTECTED_FIELDS.update_schedule] = sourceRecordIds;
  }
  if (hasValidStagingClassNo(row)) {
    fields[AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.source_key] = stagingKey;
  }
  return assertNoProtectedStagingUpdateFields(fields);
}

function updateScheduleRowFromAirtableRecord(record) {
  const row = updateScheduleRowFromAirtableFields(record?.fields || {});
  row.update_schedule_record_id = record?.id || "";
  row.update_schedule_record_ids = row.update_schedule_record_id ? [row.update_schedule_record_id] : [];
  return row;
}

function updateScheduleRowFromAirtableFields(fields) {
  return {
    update_schedule_key: text(fields[AIRTABLE_UPDATE_SCHEDULE_FIELDS.mirror_update_schedule_key]),
    show_no: fields[AIRTABLE_UPDATE_SCHEDULE_FIELDS.show_no],
    class_no: fields[AIRTABLE_UPDATE_SCHEDULE_FIELDS.class_no],
    ring_day_no: fields[AIRTABLE_UPDATE_SCHEDULE_FIELDS.ring_day_no],
    ring_no: fields[AIRTABLE_UPDATE_SCHEDULE_FIELDS.ring_no],
    ring_name: fields[AIRTABLE_UPDATE_SCHEDULE_FIELDS.ring_name],
    date_text: fields[AIRTABLE_UPDATE_SCHEDULE_FIELDS.date_text],
    iso_date: fields[AIRTABLE_UPDATE_SCHEDULE_FIELDS.iso_date],
    event_id: fields[AIRTABLE_UPDATE_SCHEDULE_FIELDS.event_id],
    event_name: fields[AIRTABLE_UPDATE_SCHEDULE_FIELDS.event_name],
    class_payout: fields[AIRTABLE_UPDATE_SCHEDULE_FIELDS.class_payout],
    class_name: fields[AIRTABLE_UPDATE_SCHEDULE_FIELDS.class_name],
    time_text: fields[AIRTABLE_UPDATE_SCHEDULE_FIELDS.time_text],
    entry_count: fields[AIRTABLE_UPDATE_SCHEDULE_FIELDS.entry_count],
    event_type: fields[AIRTABLE_UPDATE_SCHEDULE_FIELDS.event_type],
    oc_id: fields[AIRTABLE_UPDATE_SCHEDULE_FIELDS.oc_id],
    live_flag: fields[AIRTABLE_UPDATE_SCHEDULE_FIELDS.live_flag]
  };
}

async function readActiveFocusShowControl(showNo, focusDay) {
  const clauses = ["{active}=1"];
  if (text(showNo)) clauses.push(`{show_no}=${Number(showNo)}`);
  if (text(focusDay)) clauses.push(`IS_SAME({focus_day},DATETIME_PARSE(${airtableFormulaValue(focusDay)}),'day')`);
  const rows = await airtableListRecords("focus_show", {
    filterByFormula: `AND(${clauses.join(",")})`,
    maxRecords: "10"
  });
  if (rows.length !== 1) {
    return {
      found: false,
      record_count: rows.length,
      is_pause: null,
      is_lock: null,
      run_id: "",
      run_time: ""
    };
  }
  const fields = rows[0].fields || {};
  return {
    found: true,
    record_id: rows[0].id,
    is_pause: boolOrNull(fields.is_pause) === true,
    is_lock: boolOrNull(fields.is_lock) === true,
    run_id: text(fields.run_id),
    run_time: text(fields.run_time)
  };
}

function sourceLinkStatus(records) {
  const active = (records || []).filter((record) => record?.fields?.[AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.inactive] !== true);
  const linked = active.filter((record) => linkedRecordIds(record?.fields?.[AIRTABLE_UPDATE_SCHEDULE_STAGING_PROTECTED_FIELDS.update_schedule]).length > 0);
  return {
    active_rows_checked: active.length,
    linked_rows: linked.length,
    missing_links: active.length - linked.length
  };
}

async function markOutOfFocusStagingRowsInactive(showNo, focusDay, focusControl) {
  if (!(focusControl?.is_pause === true && focusControl?.out_of_focus_cleanup_enabled === true)) {
    return {
      condition_met: false,
      checked: 0,
      marked_inactive: 0
    };
  }
  const rows = await airtableListRecords(AIRTABLE_UPDATE_SCHEDULE_STAGING_TABLE, {
    filterByFormula: `AND({show_no}=${Number(showNo)},NOT(IS_SAME({iso_date},DATETIME_PARSE(${airtableFormulaValue(focusDay)}),'day')),NOT({inactive}=1))`,
    returnFieldsByFieldId: "true"
  });
  const updated = await airtableUpdateRecordsById(AIRTABLE_UPDATE_SCHEDULE_STAGING_TABLE, rows.map((record) => ({
    id: record.id,
    fields: { [AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.inactive]: true }
  })));
  return {
    condition_met: true,
    checked: rows.length,
    marked_inactive: updated.length
  };
}

function stage2cHelperTruthy(value) {
  if (value === true || value === 1) return true;
  const clean = text(value).toLowerCase();
  return clean === "1" || clean === "true" || clean === "yes" || clean === "checked";
}

function stage2cRecordField(row, fieldName) {
  return row?.fields?.[fieldName];
}

function stage2cLinkedFieldBlank(row, fieldName) {
  const value = stage2cRecordField(row, fieldName);
  if (Array.isArray(value)) return linkedRecordIds(value).length === 0;
  return value === undefined || value === null || text(value) === "";
}

function stage2cRowDate(row) {
  for (const field of ["focus_day", "iso_date", "ISO", "date", "show_day_date", "day_label"]) {
    const value = stage2cRecordField(row, field);
    const day = dateKey(value);
    if (day) return day;
  }
  const showDay = text(stage2cRecordField(row, "show_day"));
  const compact = showDay.match(/(20\d{6})/);
  if (compact) return `${compact[1].slice(0, 4)}-${compact[1].slice(4, 6)}-${compact[1].slice(6, 8)}`;
  return "";
}

function stage2cYyyymmdd(value) {
  return text(dateKey(value)).replace(/-/g, "");
}

function stage2cNormalizeLoose(value) {
  return normalizeHelperKey(value).replace(/[^a-z0-9]+/g, "");
}

function stage2cHelperScopeMatches(row, focus) {
  const showNo = text(stage2cRecordField(row, "show_no"));
  if (showNo && showNo !== focus.show_no) return false;
  const day = stage2cRowDate(row);
  if (day && day !== focus.focus_day) return false;
  return true;
}

function stage2cVariantsForValue(value, focus, showNoOverride = "") {
  const values = new Set();
  const raw = text(value);
  if (raw) values.add(raw);
  if (/^\d+$/.test(raw) && raw.length !== 8) return [...values].filter(Boolean);
  const day = dateKey(raw);
  if (day) {
    const showNo = text(showNoOverride || focus.show_no);
    values.add(day);
    values.add(stage2cYyyymmdd(day));
    if (showNo) {
      values.add(`${showNo}|${day}`);
      values.add(`${showNo}|${stage2cYyyymmdd(day)}`);
    }
  }
  return [...values].filter(Boolean);
}

function stage2cTargetSourceValues(row, mapping, focus) {
  const sourceField = text(stage2cRecordField(mapping, "source_value_field"));
  const rowShowNo = text(stage2cRecordField(row, "show_no")) || text(focus.show_no);
  const rowDate = stage2cRowDate(row);
  if (sourceField === "show_no+focus_day") {
    if (!rowShowNo || !rowDate) return [];
    return [`${rowShowNo}|${rowDate}`, `${rowShowNo}|${stage2cYyyymmdd(rowDate)}`];
  }
  if (sourceField === "focus_day") return stage2cVariantsForValue(rowDate || stage2cRecordField(row, "focus_day"), focus, rowShowNo);
  if (sourceField === "show_day") {
    const showDay = text(stage2cRecordField(row, "show_day"));
    const values = new Set(stage2cVariantsForValue(showDay || rowDate, focus, rowShowNo));
    if (rowDate) {
      values.add(rowDate);
      values.add(stage2cYyyymmdd(rowDate));
      if (rowShowNo) {
        values.add(`${rowShowNo}|${rowDate}`);
        values.add(`${rowShowNo}|${stage2cYyyymmdd(rowDate)}`);
      }
    }
    return [...values].filter(Boolean);
  }
  const direct = stage2cRecordField(row, sourceField);
  if (text(direct)) return stage2cVariantsForValue(direct, focus, rowShowNo);
  if (["iso_date", "ISO", "date", "day_label"].includes(sourceField)) return stage2cVariantsForValue(rowDate, focus, rowShowNo);
  return [];
}

function stage2cResolvedHelperKeyField(mapping) {
  const helperTable = text(stage2cRecordField(mapping, "helper_table"));
  const helperField = text(stage2cRecordField(mapping, "helper_key_field"));
  const aliases = {
    dows: { dow: "dow_name" }
  };
  return aliases[helperTable]?.[helperField] || helperField;
}

function stage2cHelperKeyValues(row, mapping, focus) {
  const helperField = stage2cResolvedHelperKeyField(mapping);
  if (helperField === "show_no+focus_day") {
    return [`${text(stage2cRecordField(row, "show_no"))}|${stage2cRowDate(row)}`];
  }
  const rowShowNo = text(stage2cRecordField(row, "show_no")) || text(focus.show_no);
  if (helperField === "focus_day") return stage2cVariantsForValue(stage2cRowDate(row) || stage2cRecordField(row, helperField), focus, rowShowNo);
  if (helperField === "show_day") return stage2cVariantsForValue(stage2cRecordField(row, helperField) || stage2cRowDate(row), focus, rowShowNo);
  return stage2cVariantsForValue(stage2cRecordField(row, helperField), focus, rowShowNo);
}

function stage2cCoerceHelperFieldValue(field, value) {
  const raw = text(value);
  if (!raw) return null;
  if (["show_no", "ring_no", "ring_day_no", "class_no", "class_number", "event_id", "event_type"].includes(field)) {
    const parsed = intOrNull(raw);
    return parsed === null ? null : parsed;
  }
  return raw;
}

function stage2cHelperCreateFields(row, mapping, focus) {
  const helperTable = text(stage2cRecordField(mapping, "helper_table"));
  const helperKeyField = stage2cResolvedHelperKeyField(mapping);
  const sourceValues = stage2cTargetSourceValues(row, mapping, focus);
  const sourceValue = sourceValues.find((value) => text(value));
  if (!helperTable || !helperKeyField || !sourceValue) return {};

  const allowlists = {
    classes: ["class_no", "class_number", "class_payout", "class_name", "class_label"],
    events: ["event_id"],
    dows: ["dow_name"],
    ring_days: ["ring_day_no", "date_text"],
    rings: ["ring_no", "ring_name"],
    shows: ["show_no"],
    show_days: ["show_day"]
  };
  const fields = {};
  const keyValue = stage2cCoerceHelperFieldValue(helperKeyField, sourceValue);
  if (keyValue !== null) fields[helperKeyField] = keyValue;
  for (const field of allowlists[helperTable] || []) {
    if (field === helperKeyField) continue;
    let value = stage2cRecordField(row, field);
    if (field === "show_day") value = stage2cRecordField(row, "show_day") || stage2cYyyymmdd(stage2cRowDate(row));
    if (field === "dow_name") value = stage2cRecordField(row, "dow");
    if (field === "class_label") value = stage2cRecordField(row, "event_name") || stage2cRecordField(row, "class_label");
    const coerced = stage2cCoerceHelperFieldValue(field, value);
    if (coerced !== null) fields[field] = coerced;
  }
  return fields;
}

async function stage2cCreateHelperRecordForSource(row, mapping, focus) {
  const helperTable = text(stage2cRecordField(mapping, "helper_table"));
  const creatableTables = new Set(["classes", "events", "dows", "ring_days", "rings", "shows", "show_days"]);
  if (!creatableTables.has(helperTable)) return null;
  const fields = stage2cHelperCreateFields(row, mapping, focus);
  if (!Object.keys(fields).length) return null;
  return airtableCreateRecord(helperTable, fields);
}

function stage2cBuildHelperIndex(rows, mapping, focus) {
  const index = new Map();
  for (const row of rows || []) {
    if (!stage2cHelperScopeMatches(row, focus)) continue;
    for (const value of stage2cHelperKeyValues(row, mapping, focus)) {
      for (const key of [normalizeHelperKey(value), stage2cNormalizeLoose(value)]) {
        if (!key) continue;
        if (!index.has(key)) index.set(key, []);
        if (!index.get(key).some((existing) => existing.id === row.id)) index.get(key).push(row);
      }
    }
  }
  return index;
}

function stage2cHelperRecordId(row, mapping) {
  const recordIdField = text(stage2cRecordField(mapping, "helper_record_id_field")) || "rec_id";
  const value = text(stage2cRecordField(row, recordIdField));
  return value.startsWith("rec") ? value : row.id;
}

function stage2cCompactMiss(miss) {
  return {
    record_id: miss.record_id,
    target_link_field: miss.target_link_field,
    source_value: miss.source_value,
    helper_table: miss.helper_table,
    helper_key_field: miss.helper_key_field,
    matches: miss.matches,
    reason: miss.reason
  };
}

function stage2cHelperLinkRelevant(row, targetLinkField) {
  if (targetLinkField !== "classes") return true;
  return Number(stage2cRecordField(row, "class_no")) > 0;
}

async function ensureClassOogStagingAllowedHelpers() {
  const existing = await airtableListRecords("allowed_helpers", {
    filterByFormula: `{target_table}='${AIRTABLE_CLASS_OOG_STAGING_TABLE}'`
  });
  const obsolete = existing.filter((record) =>
    stage2cHelperTruthy(stage2cRecordField(record, "active"))
    && text(stage2cRecordField(record, "target_link_field")) === "ring_days"
    && text(stage2cRecordField(record, "source_value_field")) === "days"
    && text(stage2cRecordField(record, "helper_table")) === "ring_days"
    && text(stage2cRecordField(record, "helper_key_field")) === "ring_day_no"
  );
  if (obsolete.length) {
    await airtableUpdateRecordsById("allowed_helpers", obsolete.map((record) => ({
      id: record.id,
      fields: { active: false }
    })));
  }
  const existingKeys = new Set(existing.map((record) => [
    text(stage2cRecordField(record, "target_link_field")),
    text(stage2cRecordField(record, "source_value_field")),
    text(stage2cRecordField(record, "helper_table")),
    text(stage2cRecordField(record, "helper_key_field"))
  ].join("|")));
  const created = [];
  for (const mapping of CLASS_OOG_STAGING_HELPER_MAPPINGS) {
    const key = [
      mapping.target_link_field,
      mapping.source_value_field,
      mapping.helper_table,
      mapping.helper_key_field
    ].join("|");
    if (existingKeys.has(key)) continue;
    const record = await airtableCreateRecord("allowed_helpers", {
      target_table: AIRTABLE_CLASS_OOG_STAGING_TABLE,
      active: true,
      target_link_field: mapping.target_link_field,
      source_value_field: mapping.source_value_field,
      helper_table: mapping.helper_table,
      helper_key_field: mapping.helper_key_field,
      helper_record_id_field: mapping.helper_record_id_field,
      allow_silent_fail: mapping.allow_silent_fail,
      notes: "WorkflowV4 class_oog_staging helper-link contract"
    });
    if (record?.id) created.push({ id: record.id, ...mapping });
    existingKeys.add(key);
  }
  return {
    expected_mappings: CLASS_OOG_STAGING_HELPER_MAPPINGS.length,
    existing_mappings_before: existing.length,
    obsolete_mappings_disabled: obsolete.length,
    created_mappings: created.length,
    created_mapping_detail: created
  };
}

async function repairAllowedHelperLinksForTarget(targetTable, showNo, focusDay) {
  const focus = { show_no: text(showNo), focus_day: dateKey(focusDay) };
  const rows = await airtableListRecords(targetTable, {
    filterByFormula: `AND({show_no}=${Number(showNo)},IS_SAME({focus_day},DATETIME_PARSE(${airtableFormulaValue(focus.focus_day)}),'day'),NOT({inactive}=1))`
  });
  const allowedRows = (await airtableListRecords("allowed_helpers"))
    .filter((row) => stage2cHelperTruthy(stage2cRecordField(row, "active")))
    .filter((row) => text(stage2cRecordField(row, "target_table")) === targetTable);
  const helperCache = new Map();
  const updateMap = new Map();
  const linksPopulatedByHelper = {};
  const silentMisses = [];
  const blockingMisses = [];
  const skipped = [];
  const helperRecordsCreatedByTable = {};
  const helperRecordsCreated = [];
  let notRelevant = 0;

  for (const mapping of allowedRows) {
    const targetLinkField = text(stage2cRecordField(mapping, "target_link_field"));
    const sourceValueField = text(stage2cRecordField(mapping, "source_value_field"));
    const helperTable = text(stage2cRecordField(mapping, "helper_table"));
    const helperKeyField = text(stage2cRecordField(mapping, "helper_key_field"));
    const allowSilentFail = stage2cHelperTruthy(stage2cRecordField(mapping, "allow_silent_fail"));
    if (!targetLinkField || !sourceValueField || !helperTable || !helperKeyField) {
      skipped.push({ mapping: mapping.id, reason: "missing required mapping field" });
      continue;
    }
    let helperRows = helperCache.get(helperTable);
    if (!helperRows) {
      helperRows = await airtableListRecords(helperTable);
      helperCache.set(helperTable, helperRows);
    }
    let helperIndex = stage2cBuildHelperIndex(helperRows, mapping, focus);
    for (const row of rows) {
      if (!stage2cLinkedFieldBlank(row, targetLinkField)) continue;
      if (!stage2cHelperLinkRelevant(row, targetLinkField)) {
        notRelevant += 1;
        continue;
      }
      const sourceValues = stage2cTargetSourceValues(row, mapping, focus);
      const sourceKeys = [...new Set(sourceValues.flatMap((value) => [normalizeHelperKey(value), stage2cNormalizeLoose(value)]).filter(Boolean))];
      if (!sourceKeys.length) {
        const miss = { record_id: row.id, target_link_field: targetLinkField, source_value: "", helper_table: helperTable, helper_key_field: helperKeyField, matches: 0, reason: "blank source value" };
        if (allowSilentFail) silentMisses.push(miss); else blockingMisses.push(miss);
        continue;
      }
      const matches = [];
      for (const key of sourceKeys) {
        for (const helperRow of helperIndex.get(key) || []) {
          if (!matches.some((existing) => existing.id === helperRow.id)) matches.push(helperRow);
        }
      }
      if (!matches.length) {
        const created = await stage2cCreateHelperRecordForSource(row, mapping, focus);
        if (created?.id) {
          helperRows.push(created);
          helperCache.set(helperTable, helperRows);
          helperIndex = stage2cBuildHelperIndex(helperRows, mapping, focus);
          helperRecordsCreated.push({ table: helperTable, id: created.id, target_link_field: targetLinkField, source_value: sourceValues[0] || "" });
          helperRecordsCreatedByTable[helperTable] = (helperRecordsCreatedByTable[helperTable] || 0) + 1;
          for (const key of sourceKeys) {
            for (const helperRow of helperIndex.get(key) || []) {
              if (!matches.some((existing) => existing.id === helperRow.id)) matches.push(helperRow);
            }
          }
        }
      }
      if (matches.length !== 1) {
        const miss = { record_id: row.id, target_link_field: targetLinkField, source_value: sourceValues.join(" | "), helper_table: helperTable, helper_key_field: helperKeyField, matches: matches.length, reason: matches.length ? "ambiguous match" : "no match" };
        if (matches.length > 1 && !allowSilentFail) blockingMisses.push(miss); else silentMisses.push(miss);
        continue;
      }
      const linkedId = stage2cHelperRecordId(matches[0], mapping);
      if (!linkedId) {
        const miss = { record_id: row.id, target_link_field: targetLinkField, source_value: sourceValues.join(" | "), helper_table: helperTable, helper_key_field: helperKeyField, matches: 1, reason: "helper record id missing" };
        if (allowSilentFail) silentMisses.push(miss); else blockingMisses.push(miss);
        continue;
      }
      if (!updateMap.has(row.id)) updateMap.set(row.id, {});
      updateMap.get(row.id)[targetLinkField] = [linkedId];
      linksPopulatedByHelper[targetLinkField] = (linksPopulatedByHelper[targetLinkField] || 0) + 1;
    }
  }

  if (blockingMisses.length) {
    return {
      status: "BLOCKED",
      target_table: targetTable,
      rows_checked: rows.length,
      records_updated: 0,
      links_populated: 0,
      links_populated_by_helper: linksPopulatedByHelper,
      blocking_miss_count: blockingMisses.length,
      blocking_misses: blockingMisses.slice(0, 50).map(stage2cCompactMiss),
      silent_miss_count: silentMisses.length,
      silent_misses: silentMisses.slice(0, 50).map(stage2cCompactMiss),
      not_relevant: notRelevant,
      mappings_skipped: skipped
    };
  }

  const updates = [...updateMap.entries()].map(([id, fields]) => ({ id, fields }));
  const updated = await airtableUpdateRecordsById(targetTable, updates);
  return {
    status: "PASS",
    target_table: targetTable,
    rows_checked: rows.length,
    records_updated: updated.length,
    links_populated: Object.values(linksPopulatedByHelper).reduce((sum, count) => sum + count, 0),
    links_populated_by_helper: linksPopulatedByHelper,
    helper_records_created: helperRecordsCreated.length,
    helper_records_created_by_table: helperRecordsCreatedByTable,
    helper_records_created_detail: helperRecordsCreated,
    blocking_miss_count: 0,
    blocking_misses: [],
    silent_miss_count: silentMisses.length,
    silent_misses: silentMisses.slice(0, 50).map(stage2cCompactMiss),
    not_relevant: notRelevant,
    mappings_skipped: skipped
  };
}

async function repairUpdateScheduleStagingHelperLinks(showNo, focusDay) {
  const focus = { show_no: text(showNo), focus_day: dateKey(focusDay) };
  const rows = await airtableListRecords(AIRTABLE_UPDATE_SCHEDULE_STAGING_TABLE, {
    filterByFormula: `AND({show_no}=${Number(showNo)},IS_SAME({iso_date},DATETIME_PARSE(${airtableFormulaValue(focus.focus_day)}),'day'),NOT({inactive}=1))`
  });
  const allowedRows = (await airtableListRecords("allowed_helpers"))
    .filter((row) => stage2cHelperTruthy(stage2cRecordField(row, "active")))
    .filter((row) => text(stage2cRecordField(row, "target_table")) === "update_schedule_staging");
  const helperCache = new Map();
  const updateMap = new Map();
  const linksPopulatedByHelper = {};
  const silentMisses = [];
  const blockingMisses = [];
  const skipped = [];
  const helperRecordsCreatedByTable = {};
  const helperRecordsCreated = [];
  let notRelevant = 0;

  for (const mapping of allowedRows) {
    const targetLinkField = text(stage2cRecordField(mapping, "target_link_field"));
    const sourceValueField = text(stage2cRecordField(mapping, "source_value_field"));
    const helperTable = text(stage2cRecordField(mapping, "helper_table"));
    const helperKeyField = text(stage2cRecordField(mapping, "helper_key_field"));
    const allowSilentFail = stage2cHelperTruthy(stage2cRecordField(mapping, "allow_silent_fail"));
    if (!targetLinkField || !sourceValueField || !helperTable || !helperKeyField) {
      skipped.push({ mapping: mapping.id, reason: "missing required mapping field" });
      continue;
    }
    let helperRows = helperCache.get(helperTable);
    if (!helperRows) {
      helperRows = await airtableListRecords(helperTable);
      helperCache.set(helperTable, helperRows);
    }
    let helperIndex = stage2cBuildHelperIndex(helperRows, mapping, focus);
    for (const row of rows) {
      if (!stage2cLinkedFieldBlank(row, targetLinkField)) continue;
      if (!stage2cHelperLinkRelevant(row, targetLinkField)) {
        notRelevant += 1;
        continue;
      }
      const sourceValues = stage2cTargetSourceValues(row, mapping, focus);
      const sourceKeys = [...new Set(sourceValues.flatMap((value) => [normalizeHelperKey(value), stage2cNormalizeLoose(value)]).filter(Boolean))];
      if (!sourceKeys.length) {
        const miss = { record_id: row.id, target_link_field: targetLinkField, source_value: "", helper_table: helperTable, helper_key_field: helperKeyField, matches: 0, reason: "blank source value" };
        silentMisses.push(miss);
        continue;
      }
      const matches = [];
      for (const key of sourceKeys) {
        for (const helperRow of helperIndex.get(key) || []) {
          if (!matches.some((existing) => existing.id === helperRow.id)) matches.push(helperRow);
        }
      }
      if (!matches.length) {
        const created = await stage2cCreateHelperRecordForSource(row, mapping, focus);
        if (created?.id) {
          helperRows.push(created);
          helperCache.set(helperTable, helperRows);
          helperIndex = stage2cBuildHelperIndex(helperRows, mapping, focus);
          helperRecordsCreated.push({ table: helperTable, id: created.id, target_link_field: targetLinkField, source_value: sourceValues[0] || "" });
          helperRecordsCreatedByTable[helperTable] = (helperRecordsCreatedByTable[helperTable] || 0) + 1;
          for (const key of sourceKeys) {
            for (const helperRow of helperIndex.get(key) || []) {
              if (!matches.some((existing) => existing.id === helperRow.id)) matches.push(helperRow);
            }
          }
        }
      }
      if (matches.length !== 1) {
        const miss = { record_id: row.id, target_link_field: targetLinkField, source_value: sourceValues.join(" | "), helper_table: helperTable, helper_key_field: helperKeyField, matches: matches.length, reason: matches.length ? "ambiguous match" : "no match" };
        if (matches.length > 1 && !allowSilentFail) blockingMisses.push(miss); else silentMisses.push(miss);
        continue;
      }
      const linkedId = stage2cHelperRecordId(matches[0], mapping);
      if (!linkedId) {
        const miss = { record_id: row.id, target_link_field: targetLinkField, source_value: sourceValues.join(" | "), helper_table: helperTable, helper_key_field: helperKeyField, matches: 1, reason: "helper record id missing" };
        if (allowSilentFail) silentMisses.push(miss); else blockingMisses.push(miss);
        continue;
      }
      if (!updateMap.has(row.id)) updateMap.set(row.id, {});
      updateMap.get(row.id)[targetLinkField] = [linkedId];
      linksPopulatedByHelper[targetLinkField] = (linksPopulatedByHelper[targetLinkField] || 0) + 1;
    }
  }

  if (blockingMisses.length) {
    return {
      status: "BLOCKED",
      rows_checked: rows.length,
      records_updated: 0,
      links_populated: 0,
      links_populated_by_helper: linksPopulatedByHelper,
      blocking_miss_count: blockingMisses.length,
      blocking_misses: blockingMisses.slice(0, 50).map(stage2cCompactMiss),
      silent_miss_count: silentMisses.length,
      silent_misses: silentMisses.slice(0, 50).map(stage2cCompactMiss),
      not_relevant: notRelevant,
      mappings_skipped: skipped
    };
  }

  const updates = [...updateMap.entries()].map(([id, fields]) => ({ id, fields }));
  const updated = await airtableUpdateRecordsById(AIRTABLE_UPDATE_SCHEDULE_STAGING_TABLE, updates);
  return {
    status: "PASS",
    rows_checked: rows.length,
    records_updated: updated.length,
    links_populated: Object.values(linksPopulatedByHelper).reduce((sum, count) => sum + count, 0),
    links_populated_by_helper: linksPopulatedByHelper,
    helper_records_created: helperRecordsCreated.length,
    helper_records_created_by_table: helperRecordsCreatedByTable,
    helper_records_created_detail: helperRecordsCreated,
    blocking_miss_count: 0,
    blocking_misses: [],
    silent_miss_count: silentMisses.length,
    silent_misses: silentMisses.slice(0, 50).map(stage2cCompactMiss),
    not_relevant: notRelevant,
    mappings_skipped: skipped
  };
}

function evaluatorNormalizeFormulaValue(value) {
  return text(value)
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[+'&."]/g, "-")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function evaluatorFormulaTokens(value) {
  return evaluatorUnique(text(value).split(",").map((part) => part.trim()));
}

function evaluatorUnique(values) {
  const seen = new Set();
  const unique = [];
  for (const value of values || []) {
    const clean = text(value);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    unique.push(clean);
  }
  return unique;
}

function evaluatorSameLinkedIds(currentValue, targetIds) {
  const current = linkedRecordIds(currentValue);
  const target = (targetIds || []).map(text).filter(Boolean);
  if (current.length !== target.length) return false;
  return current.every((id, index) => id === target[index]);
}

function evaluatorStagingFieldChanged(currentValue, targetValue) {
  if (Array.isArray(targetValue)) return !evaluatorSameLinkedIds(currentValue, targetValue);
  return text(currentValue) !== text(targetValue);
}

function evaluatorFieldMap(table) {
  return new Map((table?.fields || []).map((field) => [field.name, field]));
}

function evaluatorSchemaFailure(missingByTable) {
  const missing = Object.entries(missingByTable)
    .filter(([, fields]) => fields.length)
    .map(([table, fields]) => `${table}: ${fields.join(", ")}`);
  return missing;
}

function validateUpdateScheduleStagingEvaluatorSchema(tables) {
  const tableMap = new Map((tables || []).map((table) => [table.name, table]));
  const missingByTable = {};
  const staging = tableMap.get("update_schedule_staging");
  if (!staging) {
    missingByTable.update_schedule_staging = ["table"];
  } else {
    const fields = evaluatorFieldMap(staging);
    const required = [
      "rec_id",
      "class_number_range",
      ...UPDATE_SCHEDULE_STAGING_FORMULA_HELPERS.map((helper) => helper.sourceField),
      ...UPDATE_SCHEDULE_STAGING_EVALUATOR_FIELDS
    ];
    missingByTable.update_schedule_staging = required.filter((field) => !fields.has(field));
    for (const protectedField of UPDATE_SCHEDULE_STAGING_EVALUATOR_PROTECTED_FIELDS) {
      if (UPDATE_SCHEDULE_STAGING_EVALUATOR_FIELDS.includes(protectedField)) {
        missingByTable.update_schedule_staging.push(`approved writer conflicts with protected field ${protectedField}`);
      }
    }
  }

  for (const helper of UPDATE_SCHEDULE_STAGING_FORMULA_HELPERS) {
    const table = tableMap.get(helper.table);
    if (!table) {
      missingByTable[helper.table] = ["table"];
      continue;
    }
    const fields = evaluatorFieldMap(table);
    const required = [helper.keyField, "rec_id", "update_schedule_staging"];
    missingByTable[helper.table] = required.filter((field) => !fields.has(field));
  }

  const classRanges = tableMap.get("class_ranges");
  if (!classRanges) {
    missingByTable.class_ranges = ["table"];
  } else {
    const fields = evaluatorFieldMap(classRanges);
    missingByTable.class_ranges = ["class_number_range", "rec_id", "update_schedule_staging"].filter((field) => !fields.has(field));
  }

  const missing = evaluatorSchemaFailure(missingByTable);
  return {
    ok: missing.length === 0,
    missing,
    tableMap,
    schema_evidence: {
      update_schedule_staging: "rec_id, class_number_range, this_ages, this_sizes, this_levels, this_skills, this_disciplines, this_heights, class_ranges, ages, sizes, skills, levels, disciplines, heights, rs_class_name",
      helpers: UPDATE_SCHEDULE_STAGING_FORMULA_HELPERS.map((helper) => `${helper.table}.${helper.keyField}`).join(", "),
      class_ranges: "class_number_range, rec_id, update_schedule_staging"
    }
  };
}

function evaluatorHelperRowActive(row, helperSchema) {
  if (!helperSchema.has("active")) return true;
  return stage2cHelperTruthy(row?.fields?.active);
}

async function loadEvaluatorHelperRows(helper, helperSchema) {
  const rows = (await airtableListRecords(helper.table))
    .filter((row) => evaluatorHelperRowActive(row, helperSchema));
  const index = new Map();
  for (const row of rows) {
    const keyValue = text(row.fields?.[helper.keyField]);
    const normalized = evaluatorNormalizeFormulaValue(keyValue);
    const recId = text(row.fields?.rec_id) || row.id;
    if (!normalized || !recId) continue;
    if (!index.has(normalized)) index.set(normalized, []);
    index.get(normalized).push({ row, rec_id: recId, key_value: keyValue });
  }
  return { rows, index };
}

function evaluatorClassRangeIndex(rows) {
  const index = new Map();
  for (const row of rows || []) {
    const key = text(row?.fields?.class_number_range);
    const recId = text(row?.fields?.rec_id) || row.id;
    if (!key || !recId) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(recId);
  }
  return index;
}

function prioritySortNumber(value) {
  const clean = text(value);
  if (!clean) return Number.POSITIVE_INFINITY;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function prioritySortText(value) {
  return text(value).toLowerCase();
}

function prioritySortCompareRows(a, b) {
  return prioritySortText(a.fields.ring_name_prioritized).localeCompare(prioritySortText(b.fields.ring_name_prioritized))
    || prioritySortNumber(a.fields.time_sort) - prioritySortNumber(b.fields.time_sort)
    || prioritySortNumber(a.fields.class_no) - prioritySortNumber(b.fields.class_no)
    || prioritySortText(a.fields.rec_id || a.id).localeCompare(prioritySortText(b.fields.rec_id || b.id));
}

function prioritySortBaseKey(fields) {
  return [
    prioritySortText(fields.ring_name_normalized),
    text(fields.ring_no),
    prioritySortText(fields.time_format),
    text(fields.time_sort)
  ].join("|");
}

function prioritySortIsPreflight(row) {
  return stage2cHelperTruthy(row?.fields?.is_preflight);
}

function prioritySortFind(parent, index) {
  let current = index;
  while (parent[current] !== current) {
    parent[current] = parent[parent[current]];
    current = parent[current];
  }
  return current;
}

function prioritySortUnion(parent, left, right) {
  const leftRoot = prioritySortFind(parent, left);
  const rightRoot = prioritySortFind(parent, right);
  if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
}

function prioritySortAssignmentsForGroup(rows) {
  const parent = rows.map((_, index) => index);
  const byRsClassName = new Map();
  const byLeft15 = new Map();
  rows.forEach((row, index) => {
    const rsClassName = prioritySortText(row.fields.rs_class_name);
    const left15 = prioritySortText(row.fields.left15);
    if (rsClassName) {
      if (byRsClassName.has(rsClassName)) prioritySortUnion(parent, byRsClassName.get(rsClassName), index);
      else byRsClassName.set(rsClassName, index);
    }
    if (left15) {
      if (byLeft15.has(left15)) prioritySortUnion(parent, byLeft15.get(left15), index);
      else byLeft15.set(left15, index);
    }
  });
  const components = new Map();
  rows.forEach((row, index) => {
    const root = prioritySortFind(parent, index);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(row);
  });
  const assignments = new Map();
  for (const componentRows of components.values()) {
    componentRows.sort(prioritySortCompareRows);
    componentRows.forEach((row, index) => assignments.set(row.id, index + 1));
  }
  return { assignments, component_count: components.size };
}

function validateUpdateScheduleStagingPrioritySortSchema(tables) {
  const tableMap = new Map((tables || []).map((table) => [table.name, table]));
  const staging = tableMap.get("update_schedule_staging");
  if (!staging) {
    return { ok: false, missing: ["update_schedule_staging: table"] };
  }
  const fields = evaluatorFieldMap(staging);
  const missing = UPDATE_SCHEDULE_STAGING_PRIORITY_SORT_FIELDS.filter((field) => !fields.has(field));
  return {
    ok: missing.length === 0,
    missing: missing.length ? [`update_schedule_staging: ${missing.join(", ")}`] : [],
    class_priority_order_present: fields.has("class_priority_order")
  };
}

async function evaluateUpdateScheduleStagingPrioritySort(scope = {}) {
  const metadataTables = await airtableBaseMetadataTables();
  const schema = validateUpdateScheduleStagingPrioritySortSchema(metadataTables);
  if (!schema.ok) {
    return {
      status: "BLOCKED",
      blocker: "update_schedule_staging priority sort schema contract mismatch",
      rows_read: 0,
      rows_processed: 0,
      missing_or_different_fields: schema.missing,
      records_updated: 0
    };
  }
  const showNo = text(scope.show_no);
  const focusDay = dateKey(scope.focus_day);
  const filterByFormula = showNo && focusDay
    ? `AND({show_no}=${Number(showNo)},IS_SAME({iso_date},DATETIME_PARSE(${airtableFormulaValue(focusDay)}),'day'))`
    : "";
  const rows = await airtableListRecords(AIRTABLE_UPDATE_SCHEDULE_STAGING_TABLE, { filterByFormula });
  const preparedRows = rows.map((row) => ({ id: row.id, fields: row.fields || {} })).sort(prioritySortCompareRows);
  const nonPreflightRows = preparedRows.filter((row) => !prioritySortIsPreflight(row));
  const preflightRows = preparedRows.filter(prioritySortIsPreflight);
  const grouped = new Map();
  for (const row of nonPreflightRows) {
    const ringGroup = prioritySortText(row.fields.ring_name_normalized) || "_blank_ring_name_normalized";
    if (!grouped.has(ringGroup)) grouped.set(ringGroup, []);
    grouped.get(ringGroup).push(row);
  }

  const targetById = new Map();
  let comparableGroups = 0;
  let comparisonComponents = 0;
  for (const ringRows of grouped.values()) {
    const baseGroups = new Map();
    for (const row of ringRows) {
      const key = prioritySortBaseKey(row.fields);
      if (!baseGroups.has(key)) baseGroups.set(key, []);
      baseGroups.get(key).push(row);
    }
    comparableGroups += baseGroups.size;
    for (const baseRows of baseGroups.values()) {
      const result = prioritySortAssignmentsForGroup(baseRows);
      comparisonComponents += result.component_count;
      for (const [id, value] of result.assignments.entries()) targetById.set(id, value);
    }
  }

  const updates = [];
  for (const row of nonPreflightRows) {
    const target = targetById.get(row.id) || 1;
    if (prioritySortNumber(row.fields.class_priority_sort) !== target) {
      updates.push({ id: row.id, fields: { class_priority_sort: target } });
    }
  }
  for (const row of preflightRows) {
    if (text(row.fields.class_priority_sort)) {
      updates.push({ id: row.id, fields: { class_priority_sort: null } });
    }
  }
  const forbiddenWrites = [...new Set(updates.flatMap((update) => Object.keys(update.fields)))]
    .filter((field) => !UPDATE_SCHEDULE_STAGING_PRIORITY_SORT_WRITE_FIELDS.includes(field));
  if (forbiddenWrites.length) {
    return {
      status: "BLOCKED",
      blocker: "update_schedule_staging priority sort prepared forbidden fields",
      rows_read: rows.length,
      rows_processed: rows.length,
      preflight_rows: preflightRows.length,
      non_preflight_rows: nonPreflightRows.length,
      forbidden_writes: forbiddenWrites,
      records_updated: 0
    };
  }
  const updated = await airtableUpdateRecordsById(AIRTABLE_UPDATE_SCHEDULE_STAGING_TABLE, updates);
  return {
    status: "PASS",
    rows_read: rows.length,
    rows_processed: rows.length,
    preflight_rows: preflightRows.length,
    non_preflight_rows: nonPreflightRows.length,
    preflight_rows_cleared: updates.filter((update) => preflightRows.some((row) => row.id === update.id)).length,
    non_preflight_rows_assigned: nonPreflightRows.length,
    ring_groups: grouped.size,
    comparable_groups: comparableGroups,
    comparison_components: comparisonComponents,
    sort_order: "ring_name_prioritized ASC, time_sort ASC, class_no ASC, rec_id ASC",
    comparable_rule: "same ring_no and time_format; same priority group when same rs_class_name or same left15",
    reset_rule: "ring, time_format, time_sort, rs_class_name/left15 comparison group",
    approved_fields_written: UPDATE_SCHEDULE_STAGING_PRIORITY_SORT_WRITE_FIELDS,
    class_priority_order_present: schema.class_priority_order_present,
    records_updated: updated.length,
    prepared_updates: updates.length,
    show_no: showNo || "",
    focus_day: focusDay || "",
    scoped: Boolean(filterByFormula)
  };
}

async function evaluateUpdateScheduleStagingHelpers(scope = {}) {
  const metadataTables = await airtableBaseMetadataTables();
  const schema = validateUpdateScheduleStagingEvaluatorSchema(metadataTables);
  if (!schema.ok) {
    return {
      status: "BLOCKED",
      blocker: "update_schedule_staging evaluator schema contract mismatch",
      rows_read: 0,
      rows_processed: 0,
      helper_tables_read: 0,
      missing_or_different_fields: schema.missing,
      schema_evidence: schema.schema_evidence,
      records_updated: 0
    };
  }

  const showNo = text(scope.show_no);
  const focusDay = dateKey(scope.focus_day);
  const filterByFormula = showNo && focusDay
    ? `AND({show_no}=${Number(showNo)},IS_SAME({iso_date},DATETIME_PARSE(${airtableFormulaValue(focusDay)}),'day'))`
    : "";
  const rows = await airtableListRecords(AIRTABLE_UPDATE_SCHEDULE_STAGING_TABLE, { filterByFormula });
  const classRangeRows = await airtableListRecords("class_ranges");
  const classRangeIndex = evaluatorClassRangeIndex(classRangeRows);
  const helperRowsByTarget = {};
  const helperReadCounts = {};
  for (const helper of UPDATE_SCHEDULE_STAGING_FORMULA_HELPERS) {
    const helperSchema = evaluatorFieldMap(schema.tableMap.get(helper.table));
    const helperRows = await loadEvaluatorHelperRows(helper, helperSchema);
    helperRowsByTarget[helper.targetField] = { helper, rows: helperRows };
    helperReadCounts[helper.table] = helperRows.rows.length;
  }

  const updates = [];
  const linkEvidence = Object.fromEntries(UPDATE_SCHEDULE_STAGING_FORMULA_HELPERS.map((helper) => [helper.targetField, {
    helper_table: helper.table,
    source_field: helper.sourceField,
    rows_read: helperReadCounts[helper.table] || 0,
    rows_with_formula_values: 0,
    rows_with_matches: 0,
    links_matched: 0,
    unmatched_values: []
  }]));
  let classRangesAttempted = 0;
  let classRangesMatched = 0;
  let rsClassNameBuilt = 0;

  for (const row of rows) {
    const fields = row.fields || {};
    const targetFields = {};
    const matchedKeyValuesByTarget = {};

    const classNumberRange = text(fields.class_number_range);
    if (classNumberRange) classRangesAttempted += 1;
    const classRangeIds = classNumberRange ? evaluatorUnique(classRangeIndex.get(classNumberRange) || []) : [];
    if (classRangeIds.length) classRangesMatched += 1;
    targetFields.class_ranges = classRangeIds;

    for (const targetField of ["ages", "skills", "levels", "sizes", "heights", "disciplines"]) {
      const helperGroup = helperRowsByTarget[targetField];
      const matches = [];
      const keyValues = [];
      const formulaTokens = evaluatorFormulaTokens(fields[helperGroup?.helper?.sourceField]);
      if (formulaTokens.length) linkEvidence[targetField].rows_with_formula_values += 1;
      if (formulaTokens.length && helperGroup) {
        for (const token of formulaTokens) {
          const normalizedToken = evaluatorNormalizeFormulaValue(token);
          const helperMatches = helperGroup.rows.index.get(normalizedToken) || [];
          if (!helperMatches.length) {
            if (!linkEvidence[targetField].unmatched_values.includes(token)) {
              linkEvidence[targetField].unmatched_values.push(token);
            }
            continue;
          }
          for (const helperRow of helperMatches) {
            matches.push(helperRow.rec_id);
            keyValues.push(helperRow.key_value);
          }
        }
      }
      const linkedIds = evaluatorUnique(matches);
      const uniqueKeyValues = evaluatorUnique(keyValues);
      targetFields[targetField] = linkedIds;
      matchedKeyValuesByTarget[targetField] = uniqueKeyValues;
      if (linkedIds.length) {
        linkEvidence[targetField].rows_with_matches += 1;
        linkEvidence[targetField].links_matched += linkedIds.length;
      }
    }

    const rsClassNameTokens = evaluatorUnique(UPDATE_SCHEDULE_STAGING_RS_CLASS_NAME_ORDER
      .flatMap((targetField) => matchedKeyValuesByTarget[targetField] || []));
    targetFields.rs_class_name = rsClassNameTokens.join(" ");
    if (targetFields.rs_class_name) rsClassNameBuilt += 1;

    const changedFields = {};
    for (const field of UPDATE_SCHEDULE_STAGING_EVALUATOR_FIELDS) {
      if (evaluatorStagingFieldChanged(fields[field], targetFields[field])) {
        changedFields[field] = targetFields[field];
      }
    }
    if (Object.keys(changedFields).length) updates.push({ id: row.id, fields: changedFields });
  }

  const forbiddenWrites = [...new Set(updates.flatMap((update) => Object.keys(update.fields)))]
    .filter((field) => !UPDATE_SCHEDULE_STAGING_EVALUATOR_FIELDS.includes(field) || UPDATE_SCHEDULE_STAGING_EVALUATOR_PROTECTED_FIELDS.has(field));
  if (forbiddenWrites.length) {
    return {
      status: "BLOCKED",
      blocker: "update_schedule_staging evaluator prepared forbidden fields",
      rows_read: rows.length,
      rows_processed: rows.length,
      forbidden_writes: forbiddenWrites,
      records_updated: 0
    };
  }

  const updated = await airtableUpdateRecordsById(AIRTABLE_UPDATE_SCHEDULE_STAGING_TABLE, updates);
  return {
    status: "PASS",
    rows_read: rows.length,
    rows_processed: rows.length,
    helper_tables_read: UPDATE_SCHEDULE_STAGING_FORMULA_HELPERS.length + 1,
    helper_source: "update_schedule_staging.this_* formula fields",
    formula_delimiter: "comma",
    helper_schema_evidence: schema.schema_evidence,
    class_ranges: {
      helper_rows_read: classRangeRows.length,
      rows_with_class_number_range: classRangesAttempted,
      rows_matched: classRangesMatched
    },
    helper_links: linkEvidence,
    rs_class_name: {
      rows_built: rsClassNameBuilt,
      token_order: UPDATE_SCHEDULE_STAGING_RS_CLASS_NAME_ORDER
    },
    approved_fields_written: UPDATE_SCHEDULE_STAGING_EVALUATOR_FIELDS,
    protected_fields_unchanged: [...UPDATE_SCHEDULE_STAGING_EVALUATOR_PROTECTED_FIELDS],
    records_updated: updated.length,
    prepared_updates: updates.length,
    show_no: showNo || "",
    focus_day: focusDay || "",
    scoped: Boolean(filterByFormula)
  };
}

async function countCatalystUpdateScheduleForFocusDay(app, showNo, focusDay) {
  const rows = await getRowsByShow(app, TABLES.updateSchedule, showNo, { limit: 5000 });
  return rows.filter((row) => dateKey(row.iso_date || row.date_text || row.day_label) === focusDay).length;
}

async function syncUpdateScheduleStagingFromMirror(app, showNo, focusDay) {
  const focusControl = await readActiveFocusShowControl(showNo, focusDay);
  const confirmDelete = await buildConfirmedDeleteUpdateSchedulePlan(app, showNo, { focusDay });
  if (confirmDelete.confirmed_delete_rows) {
    return {
      show_no: showNo,
      focus_day: focusDay,
      status: "BLOCKED",
      blocker: "update_schedule confirm_delete rows remain; mirror/delete contract must pass before staging",
      confirm_delete: {
        ...confirmDelete,
        executed: false,
        catalyst_rows_deleted: 0,
        pending_approval: true
      },
      payload_rows: 0,
      update_schedule_rows: 0,
      update_schedule_staging_rows: 0,
      update_schedule_staging_upserts: 0,
      update_schedule_staging_stale_deleted: 0
    };
  }
  const formula = airtableScopedScheduleFormula(showNo, focusDay);
  const updateScheduleRecords = await airtableListRecords(AIRTABLE_UPDATE_SCHEDULE_TABLE, {
    filterByFormula: formula,
    returnFieldsByFieldId: "true"
  });
  const runTime = new Date().toISOString();
  const sourceRows = updateScheduleRecords
    .map(updateScheduleRowFromAirtableRecord)
    .filter((row) => text(row.update_schedule_key));
  const canonicalSourceRows = mergeUpdateScheduleRowsToClassGrain(sourceRows);
  const activePayloadsByKey = new Map(canonicalSourceRows.map((row) => {
    const fields = mapUpdateScheduleStagingFields(row, runTime);
    return [text(fields[AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.staging_key]), fields];
  }));
  const activeKeys = new Set(canonicalSourceRows.map((row) => updateScheduleStagingCanonicalKey(row)).filter(Boolean));
  const existingBeforeDedupe = await airtableListRecords(AIRTABLE_UPDATE_SCHEDULE_STAGING_TABLE, {
    filterByFormula: formula,
    returnFieldsByFieldId: "true"
  });
  const duplicateGroupsBefore = [...existingBeforeDedupe.reduce((groups, record) => {
    const key = stagingRecordCanonicalKey(record);
    if (!key) return groups;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
    return groups;
  }, new Map()).values()].filter((group) => group.length > 1).length;
  const dedupeResult = await dedupeUpdateScheduleStagingClassGrain(existingBeforeDedupe, activePayloadsByKey);
  if (dedupeResult.status === "CONFLICT") {
    return {
      show_no: showNo,
      focus_day: focusDay,
      status: "CONFLICT",
      payload_rows: canonicalSourceRows.length,
      update_schedule_rows: updateScheduleRecords.length,
      update_schedule_staging_rows_before: existingBeforeDedupe.length,
      update_schedule_staging_unique_keys_before: activeKeys.size,
      update_schedule_staging_duplicate_groups_before: duplicateGroupsBefore,
      update_schedule_staging_dedupe_groups_processed: dedupeResult.processed,
      update_schedule_staging_dedupe_groups_merged: dedupeResult.merged,
      update_schedule_staging_dedupe_groups_skipped_due_to_conflict: dedupeResult.skipped_due_to_conflict,
      update_schedule_staging_conflict_detail: dedupeResult.conflict_detail,
      update_schedule_staging_dedupe_deleted: 0
    };
  }
  const stagingRecords = await airtableUpsertByFieldId(
    AIRTABLE_UPDATE_SCHEDULE_STAGING_TABLE,
    AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.staging_key,
    canonicalSourceRows.map((row) => mapUpdateScheduleStagingFields(row, runTime))
  );
  const existingStaging = await airtableListRecords(AIRTABLE_UPDATE_SCHEDULE_STAGING_TABLE, {
    filterByFormula: formula,
    returnFieldsByFieldId: "true"
  });
  const staleResult = await markStaleAirtableRowsInactiveNotInKeys(
    AIRTABLE_UPDATE_SCHEDULE_STAGING_TABLE,
    AIRTABLE_UPDATE_SCHEDULE_STAGING_FIELDS.staging_key,
    existingStaging,
    activeKeys
  );
  const inactiveResult = await markOutOfFocusStagingRowsInactive(showNo, focusDay, focusControl);
  const helperLinkResult = await repairUpdateScheduleStagingHelperLinks(showNo, focusDay);
  if (helperLinkResult.status === "BLOCKED") {
    return {
      show_no: showNo,
      focus_day: focusDay,
      source: "airtable.update_schedule",
      status: "BLOCKED",
      blocker: "update_schedule_staging helper-link repair has blocking misses",
      focus_show_control: focusControl,
      payload_rows: canonicalSourceRows.length,
      update_schedule_rows: updateScheduleRecords.length,
      update_schedule_staging_rows_before: existingBeforeDedupe.length,
      update_schedule_staging_upserts: stagingRecords.length,
      update_schedule_staging_stale_deleted: staleResult.deleted,
      update_schedule_staging_stale_marked_inactive: staleResult.stale_marked_inactive,
      update_schedule_staging_out_of_focus_inactive_checked: inactiveResult.checked,
      update_schedule_staging_out_of_focus_marked_inactive: inactiveResult.marked_inactive,
      update_schedule_staging_helper_links: helperLinkResult
    };
  }
  const evaluatorResult = await evaluateUpdateScheduleStagingHelpers({ show_no: showNo, focus_day: focusDay });
  if (evaluatorResult.status === "BLOCKED") {
    return {
      show_no: showNo,
      focus_day: focusDay,
      source: "airtable.update_schedule",
      status: "BLOCKED",
      blocker: "update_schedule_staging helper evaluator blocked",
      focus_show_control: focusControl,
      payload_rows: canonicalSourceRows.length,
      update_schedule_rows: updateScheduleRecords.length,
      update_schedule_staging_rows_before: existingBeforeDedupe.length,
      update_schedule_staging_upserts: stagingRecords.length,
      update_schedule_staging_stale_deleted: staleResult.deleted,
      update_schedule_staging_stale_marked_inactive: staleResult.stale_marked_inactive,
      update_schedule_staging_out_of_focus_inactive_checked: inactiveResult.checked,
      update_schedule_staging_out_of_focus_marked_inactive: inactiveResult.marked_inactive,
      update_schedule_staging_helper_links: helperLinkResult,
      update_schedule_staging_helper_evaluator: evaluatorResult
    };
  }
  const finalStaging = await airtableListRecords(AIRTABLE_UPDATE_SCHEDULE_STAGING_TABLE, {
    filterByFormula: formula,
    returnFieldsByFieldId: "true"
  });
  const finalClassGrainStatus = stagingClassGrainStatus(finalStaging);
  const sourceLinks = sourceLinkStatus(finalStaging);
  return {
    show_no: showNo,
    focus_day: focusDay,
    source: "airtable.update_schedule",
    focus_show_control: focusControl,
    payload_rows: canonicalSourceRows.length,
    update_schedule_rows: updateScheduleRecords.length,
    update_schedule_staging_rows: finalStaging.length,
    update_schedule_staging_upserts: stagingRecords.length,
    update_schedule_staging_stale_deleted: staleResult.deleted,
    update_schedule_staging_stale_marked_inactive: staleResult.stale_marked_inactive,
    update_schedule_staging_unprotected_stale_marked_inactive: staleResult.unprotected_stale_marked,
    update_schedule_staging_protected_stale_preserved: staleResult.protected_stale_preserved,
    update_schedule_staging_protected_stale_marked: staleResult.protected_stale_marked,
    update_schedule_staging_protected_stale_records: staleResult.protected_stale_records,
    update_schedule_staging_out_of_focus_inactive_checked: inactiveResult.checked,
    update_schedule_staging_out_of_focus_marked_inactive: inactiveResult.marked_inactive,
    update_schedule_staging_helper_link_rows_checked: helperLinkResult.rows_checked,
    update_schedule_staging_helper_link_records_updated: helperLinkResult.records_updated,
    update_schedule_staging_helper_links_populated: helperLinkResult.links_populated,
    update_schedule_staging_helper_links_by_field: helperLinkResult.links_populated_by_helper,
    update_schedule_staging_helper_link_blocking_misses: helperLinkResult.blocking_miss_count,
    update_schedule_staging_helper_link_silent_misses: helperLinkResult.silent_miss_count,
    update_schedule_staging_helper_link_not_relevant: helperLinkResult.not_relevant,
    update_schedule_staging_helper_link_mappings_skipped: helperLinkResult.mappings_skipped,
    update_schedule_staging_evaluator_rows_read: evaluatorResult.rows_read,
    update_schedule_staging_evaluator_rows_processed: evaluatorResult.rows_processed,
    update_schedule_staging_evaluator_records_updated: evaluatorResult.records_updated,
    update_schedule_staging_evaluator_class_ranges: evaluatorResult.class_ranges,
    update_schedule_staging_evaluator_helper_links: evaluatorResult.helper_links,
    update_schedule_staging_evaluator_rs_class_name: evaluatorResult.rs_class_name,
    update_schedule_staging_source_link_rows_checked: sourceLinks.active_rows_checked,
    update_schedule_staging_source_link_rows: sourceLinks.linked_rows,
    update_schedule_staging_source_link_missing: sourceLinks.missing_links,
    update_schedule_staging_active_canonical_rows: finalClassGrainStatus.active_count,
    update_schedule_staging_active_unique_keys: finalClassGrainStatus.unique_keys,
    update_schedule_staging_active_duplicate_groups: finalClassGrainStatus.duplicate_groups,
    update_schedule_staging_protected_stale_rows: finalClassGrainStatus.protected_stale_count,
    update_schedule_staging_rows_before: existingBeforeDedupe.length,
    update_schedule_staging_unique_keys_before: activeKeys.size,
    update_schedule_staging_duplicate_groups_before: duplicateGroupsBefore,
    update_schedule_staging_dedupe_groups_processed: dedupeResult.processed,
    update_schedule_staging_dedupe_groups_merged: dedupeResult.merged,
    update_schedule_staging_dedupe_groups_skipped_due_to_conflict: dedupeResult.skipped_due_to_conflict,
    update_schedule_staging_conflict_detail: dedupeResult.conflict_detail,
    update_schedule_staging_dedupe_deleted: dedupeResult.deleted,
    update_schedule_staging_dedupe_marked_inactive: dedupeResult.duplicate_rows_marked_inactive || 0,
    update_schedule_staging_protected_values_merged: dedupeResult.protected_values_merged,
    update_schedule_staging_checkbox_true_values_preserved: dedupeResult.checkbox_true_values_preserved,
    update_schedule_staging_links_unioned: dedupeResult.links_unioned
  };
}

async function storeUpdateScheduleRaw(app, payload) {
  const showNo = text(payload.show_no);
  const focusDay = dateKey(payload.focus_day);
  const ringDayNo = text(payload.ring_day_no);
  const rawHtml = String(payload.raw_html || payload.raw || "");
  if (!showNo) throw new Error("store-update-schedule-raw requires show_no");
  if (!focusDay) throw new Error("store-update-schedule-raw requires focus_day");
  if (!ringDayNo) throw new Error("store-update-schedule-raw requires ring_day_no");
  if (!rawHtml) throw new Error("store-update-schedule-raw requires raw_html");
  const rawKey = updateScheduleRawKey(showNo, focusDay, ringDayNo);
  const row = {
    raw_key: rawKey,
    show_no: intValue(showNo),
    focus_day: focusDay,
    ring_day_no: intValue(ringDayNo),
    ring_no: intValue(payload.ring_no),
    ring_name: text(payload.ring_name),
    day_label: text(payload.day_label),
    raw_html: rawHtml,
    upstream_status: intValue(payload.upstream_status) || 200,
    fetched_at: catalystDateTime(payload.fetched_at || new Date()),
    parse_status: "stored"
  };
  const result = await upsert(app, TABLES.updateScheduleRaw, { raw_key: rawKey }, row);
  return {
    raw_rec_id: result.row?.ROWID || null,
    raw_key: rawKey,
    ring_day_no: ringDayNo,
    raw_length: rawHtml.length,
    stored_action: result.action
  };
}

async function getUpdateScheduleRawRow(app, rawRecId) {
  const id = Number(rawRecId);
  if (!Number.isFinite(id)) throw new Error("parse-update-schedule-raw-chunk requires numeric raw_rec_id");
  const query = `SELECT ROWID, raw_key, show_no, focus_day, ring_day_no, ring_no, ring_name, day_label, raw_html, upstream_status FROM ${TABLES.updateScheduleRaw} WHERE ROWID = ${id} LIMIT 1`;
  return (await app.zcql().executeZCQLQuery(query))?.[0]?.[TABLES.updateScheduleRaw] || null;
}

async function parseStoredUpdateScheduleRawChunk(app, rawRecId, { executeConfirmDelete = false } = {}) {
  const rawRow = await getUpdateScheduleRawRow(app, rawRecId);
  if (!rawRow) throw new Error(`raw_rec_id not found: ${rawRecId}`);
  const showNo = text(rawRow.show_no);
  const focusDay = dateKey(rawRow.focus_day);
  const ringDayNo = text(rawRow.ring_day_no);
  const parsedRows = assignUpdateScheduleKeys(parseRingDayScheduleRows(rawRow.raw_html, showNo, ringDayNo)
    .map((row) => ({
      ...row,
      ring_no: rawRow.ring_no,
      ring_name: rawRow.ring_name,
      day_label: rawRow.day_label,
      source_endpoint: "update_schedule.php"
    })));
  const sourceRowsBeforeConfirmDelete = parsedRows
    .map(updateScheduleSourceRow)
    .filter(Boolean);
  const confirmDelete = await applyUpdateScheduleConfirmDeleteGate(app, showNo, {
    focusDay,
    ringDayNo,
    execute: executeConfirmDelete
  });
  if (confirmDelete.pending_approval) {
    return {
      status: "BLOCKED",
      blocker: "confirm_delete approval required before update_schedule mirror sync",
      raw_rec_id: rawRow.ROWID,
      show_no: showNo,
      focus_day: focusDay,
      ring_day_no: ringDayNo,
      parsed_rows: parsedRows.length,
      confirm_delete: confirmDelete,
      hs_update_schedule_rows: 0,
      hs_update_schedule_stale_deleted: 0,
      update_schedule_rows: 0,
      update_schedule_stale_deleted: 0
    };
  }
  const confirmedDeleteKeys = new Set((confirmDelete.confirmed_delete_keys || []).map(text).filter(Boolean));
  const sourceRows = sourceRowsBeforeConfirmDelete
    .filter((row) => !confirmedDeleteKeys.has(text(row.update_schedule_key)));
  const catalystResult = await upsertSourceRowsFast(app, TABLES.updateSchedule, "update_schedule_key", sourceRows, { showNo });
  const activeKeys = new Set(sourceRows.map((row) => text(row.update_schedule_key)).filter(Boolean));
  const catalystStale = await deleteUpdateScheduleStaleForRingDay(app, showNo, ringDayNo, Array.from(activeKeys));
  const runTime = new Date().toISOString();
  const updateScheduleRecords = await airtableUpsertByFieldId(
    AIRTABLE_UPDATE_SCHEDULE_TABLE,
    AIRTABLE_UPDATE_SCHEDULE_FIELDS.mirror_update_schedule_key,
    sourceRows.map(mapUpdateScheduleMirrorFields)
  );
  const existingUpdateSchedule = await airtableListRecords(AIRTABLE_UPDATE_SCHEDULE_TABLE, {
    filterByFormula: airtableScopedScheduleFormula(showNo, focusDay, ringDayNo),
    returnFieldsByFieldId: "true"
  });
  const updateScheduleStaleDeleted = await deleteAirtableRowsNotInKeys(
    AIRTABLE_UPDATE_SCHEDULE_TABLE,
    AIRTABLE_UPDATE_SCHEDULE_FIELDS.mirror_update_schedule_key,
    existingUpdateSchedule,
    activeKeys
  );
  const table = app.datastore().table(TABLES.updateScheduleRaw);
  await table.updateRow({
    ROWID: rawRow.ROWID,
    parsed_at: catalystDateTime(runTime),
    parse_status: "parsed"
  });
  const logType = "core_update_schedule";
  const logKey = `${logType}|${showNo}|${focusDay || "no-focus-day"}|${ringDayNo}`;
  const logRecord = await airtableCreateRecord(AIRTABLE_WEC_LOGS_TABLE, {
    [AIRTABLE_WEC_LOG_FIELDS.log_key_run]: `${logKey}|${runTime}`,
    [AIRTABLE_WEC_LOG_FIELDS.log_key]: logKey,
    [AIRTABLE_WEC_LOG_FIELDS.workflow_lanes]: "Core",
    [AIRTABLE_WEC_LOG_FIELDS.log_type]: logType,
    [AIRTABLE_WEC_LOG_FIELDS.check_name]: "parse-update-schedule-raw-chunk",
    [AIRTABLE_WEC_LOG_FIELDS.show_no]: Number(showNo),
    [AIRTABLE_WEC_LOG_FIELDS.focus_day]: focusDay || null,
    [AIRTABLE_WEC_LOG_FIELDS.status]: "ok",
    [AIRTABLE_WEC_LOG_FIELDS.records_seen]: sourceRows.length,
    [AIRTABLE_WEC_LOG_FIELDS.records_changed]: Number(catalystResult.inserted || 0) + Number(catalystResult.updated || 0),
    [AIRTABLE_WEC_LOG_FIELDS.summary]: `parsed update_schedule raw ${ringDayNo}: ${sourceRows.length} rows`,
    [AIRTABLE_WEC_LOG_FIELDS.payload_json]: JSON.stringify({
      raw_rec_id: rawRow.ROWID,
      raw_key: rawRow.raw_key,
      ring_day_no: ringDayNo,
      upstream_status: rawRow.upstream_status,
      parsed_rows: parsedRows.length,
      confirm_delete: confirmDelete,
      hs_update_schedule: catalystResult,
      hs_update_schedule_stale: catalystStale,
      update_schedule_records: updateScheduleRecords.length,
      update_schedule_stale_deleted: updateScheduleStaleDeleted
    }, null, 2),
    [AIRTABLE_WEC_LOG_FIELDS.created_at]: runTime
  });
  return {
    raw_rec_id: rawRow.ROWID,
    parse_wec_log_rec_id: logRecord?.id || null,
    show_no: showNo,
    focus_day: focusDay,
    ring_day_no: ringDayNo,
    parsed_rows: parsedRows.length,
    confirm_delete: confirmDelete,
    hs_update_schedule_rows: catalystResult.rows,
    hs_update_schedule_stale_deleted: catalystStale.deleted || 0,
    update_schedule_rows: updateScheduleRecords.length,
    update_schedule_stale_deleted: updateScheduleStaleDeleted
  };
}

async function storeClassOogRaw(app, payload) {
  const showNo = text(payload.show_no);
  const focusDay = dateKey(payload.focus_day);
  const ringDayNo = text(payload.ring_day_no);
  const ringNo = text(payload.ring_no);
  const classNo = text(payload.class_no);
  const rawHtml = String(payload.raw_html || payload.raw || "");
  if (!showNo) throw new Error("store-class-oog-raw requires show_no");
  if (!focusDay) throw new Error("store-class-oog-raw requires focus_day");
  if (!ringDayNo) throw new Error("store-class-oog-raw requires ring_day_no");
  if (!ringNo) throw new Error("store-class-oog-raw requires ring_no");
  if (!classNo) throw new Error("store-class-oog-raw requires class_no");
  if (!rawHtml) throw new Error("store-class-oog-raw requires raw_html");
  const rawKey = classOogRawKey(showNo, focusDay, ringDayNo, ringNo, classNo);
  const row = {
    raw_key: rawKey,
    show_no: showNo,
    focus_day: focusDay,
    ring_day_no: ringDayNo,
    ring_no: ringNo,
    ring_name: text(payload.ring_name),
    class_no: classNo,
    class_label: text(payload.class_label || payload.class_name),
    staging_record_id: text(payload.staging_record_id),
    raw_html: rawHtml,
    upstream_status: intValue(payload.upstream_status) || 200,
    fetched_at: catalystDateTime(payload.fetched_at || new Date()),
    parse_status: "stored"
  };
  const result = await upsert(app, TABLES.classOogRaw, { raw_key: rawKey }, row);
  return {
    raw_rec_id: result.row?.ROWID || null,
    raw_key: rawKey,
    ring_day_no: ringDayNo,
    ring_no: ringNo,
    class_no: classNo,
    raw_length: rawHtml.length,
    stored_action: result.action
  };
}

async function getClassOogRawRow(app, rawRecId) {
  const id = Number(rawRecId);
  if (!Number.isFinite(id)) throw new Error("parse-class-oog-raw-chunk requires numeric raw_rec_id");
  const query = `SELECT ROWID, raw_key, show_no, focus_day, ring_day_no, ring_no, ring_name, class_no, class_label, staging_record_id, raw_html, upstream_status FROM ${TABLES.classOogRaw} WHERE ROWID = ${id} LIMIT 1`;
  return (await app.zcql().executeZCQLQuery(query))?.[0]?.[TABLES.classOogRaw] || null;
}

function classOogSourceRowCanonical(row, rawRow) {
  const entryNo = text(row.current_entry_no || row.entry_no);
  const showNo = text(rawRow.show_no);
  const focusDay = dateKey(rawRow.focus_day);
  const ringDayNo = text(rawRow.ring_day_no);
  const ringNo = text(rawRow.ring_no);
  const classNo = text(row.class_no || rawRow.class_no);
  const classLabel = text(rawRow.class_label || rawRow.class_name || row.class_label || classNo);
  const key = canonicalClassOogKey(showNo, focusDay, ringDayNo, ringNo, classNo, entryNo);
  if (!key) return null;
  const ringNameNormalized = visualRingName(rawRow.ring_name_normalized || normalizedWecRingName(rawRow.ring_name));
  const ringKey = ringVisualKey(ringNo, ringNameNormalized);
  const classKey = classVisualKey(ringNameNormalized, classNo);
  const entryKey = entryVisualKey(ringNameNormalized, classNo, entryNo);
  return {
    class_oog_key: key,
    show_no: intValue(showNo),
    focus_day: focusDay,
    ring: text(rawRow.ring_name),
    ring_no: intValue(ringNo),
    ring_day_no: intValue(ringDayNo),
    class_no: intValue(classNo),
    class_label: classLabel,
    ring_name_normalized: ringNameNormalized,
    ring_visual_key: ringKey,
    class_visual_key: classKey,
    entry_visual_key: entryKey,
    class_number: intValue(row.class_number),
    class_payout: text(row.class_payout),
    class_name: text(row.class_name || rawRow.class_name || classLabel),
    entry_order: intValue(row.entry_order),
    entry_no: intValue(entryNo),
    horse: text(row.current_horse || row.horse),
    rider: text(row.rider),
    trainer: text(row.trainer),
    staging_record_id: text(rawRow.staging_record_id),
    source_endpoint: "class_oog.php",
    source_payload: sourcePayload({
      raw_key: rawRow.raw_key,
      raw_rec_id: rawRow.ROWID,
      order_status: row.order_status,
      parsed_row: row
    })
  };
}

async function deleteCatalystClassOogStaleForClass(app, showNo, focusDay, ringDayNo, ringNo, classNo, activeKeys) {
  const rows = await getRowsByShow(app, TABLES.classOog, showNo, { limit: 10000 });
  const active = new Set((activeKeys || []).map(text).filter(Boolean));
  const staleRows = rows
    .filter((row) => dateKey(row.focus_day) === focusDay)
    .filter((row) => text(row.ring_day_no) === text(ringDayNo))
    .filter((row) => text(row.ring_no) === text(ringNo))
    .filter((row) => text(row.class_no) === text(classNo))
    .filter((row) => !active.has(text(row.class_oog_key)));
  const confirmedKeys = await classOogConfirmDeleteKeySet(showNo, { focusDay, ringDayNo, ringNo, classNo });
  const plan = classOogCatalystDeletePlan(staleRows, confirmedKeys);
  const deletion = await executeCatalystClassOogDeletePlan(app, plan);
  return {
    scanned: rows.length,
    deleted: deletion.deleted,
    candidates: plan.candidates,
    deletable: plan.deletable,
    skipped: plan.skipped,
    skipped_reason: plan.skip_reason,
    skipped_detail: plan.skipped_detail
  };
}

function airtableClassOogFormula(showNo, focusDay, ringDayNo = "", ringNo = "", classNo = "") {
  const clauses = [
    `{show_no}=${Number(showNo)}`,
    `IS_SAME({focus_day},DATETIME_PARSE(${airtableFormulaValue(focusDay)}),'day')`
  ];
  if (text(ringDayNo)) clauses.push(`{ring_day_no}=${Number(ringDayNo)}`);
  if (text(ringNo)) clauses.push(`{ring_no}=${Number(ringNo)}`);
  if (text(classNo)) clauses.push(`{class_no}=${Number(classNo)}`);
  return `AND(${clauses.join(",")})`;
}

function airtableConfirmedClassOogFormula(showNo, { focusDay = "", ringDayNo = "", ringNo = "", classNo = "", key = "" } = {}) {
  const clauses = [
    "{confirm_delete}=1",
    `{show_no}=${Number(showNo)}`
  ];
  if (text(focusDay)) clauses.push(`IS_SAME({focus_day},DATETIME_PARSE(${airtableFormulaValue(focusDay)}),'day')`);
  if (text(ringDayNo)) clauses.push(`{ring_day_no}=${Number(ringDayNo)}`);
  if (text(ringNo)) clauses.push(`{ring_no}=${Number(ringNo)}`);
  if (text(classNo)) clauses.push(`{class_no}=${Number(classNo)}`);
  if (text(key)) clauses.push(`{mirror_class_oog_key}=${airtableFormulaValue(key)}`);
  return `AND(${clauses.join(",")})`;
}

function classOogMirrorRecordKey(record) {
  const fields = record?.fields || {};
  return text(fields.mirror_class_oog_key || fields.class_oog_key);
}

async function readConfirmedDeleteClassOogRows(showNo, filters = {}) {
  return airtableListRecords("class_oog", {
    filterByFormula: airtableConfirmedClassOogFormula(showNo, filters)
  });
}

async function classOogConfirmDeleteKeySet(showNo, filters = {}) {
  const rows = await readConfirmedDeleteClassOogRows(showNo, filters);
  return new Set(rows.map(classOogMirrorRecordKey).filter(Boolean));
}

function classOogCatalystDeletePlan(staleRows, confirmedKeys) {
  const confirmed = confirmedKeys instanceof Set ? confirmedKeys : new Set();
  const candidates = (staleRows || [])
    .map((row) => ({
      row_id: text(row.ROWID),
      class_oog_key: text(row.class_oog_key)
    }))
    .filter((row) => row.row_id && row.class_oog_key);
  const deletableRows = candidates.filter((row) => confirmed.has(row.class_oog_key));
  const skippedRows = candidates.filter((row) => !confirmed.has(row.class_oog_key));
  return {
    candidates: candidates.length,
    deletable: deletableRows.length,
    skipped: skippedRows.length,
    skip_reason: skippedRows.length ? "confirm_delete_missing_or_false" : "",
    catalyst_row_ids: deletableRows.map((row) => row.row_id),
    skipped_detail: skippedRows.slice(0, 50)
  };
}

async function executeCatalystClassOogDeletePlan(app, plan, { execute = true } = {}) {
  const rowIds = [...new Set((plan?.catalyst_row_ids || []).map(text).filter(Boolean))];
  if (!execute || !rowIds.length) return { deleted: 0, catalyst_row_ids: rowIds };
  const table = app.datastore().table(TABLES.classOog);
  let deleted = 0;
  for (let index = 0; index < rowIds.length; index += 100) {
    const batch = rowIds.slice(index, index + 100);
    if (batch.length) {
      await table.deleteRows(batch);
      deleted += batch.length;
    }
  }
  return { deleted, catalyst_row_ids: rowIds };
}

function mapClassOogMirrorFields(row, trainerRecordIds = {}) {
  const normalizedTrainerRecordIds = normalizedRecordIdMap(trainerRecordIds);
  const fields = {
    mirror_class_oog_key: row.class_oog_key,
    show_no: row.show_no,
    focus_day: row.focus_day,
    days: row.ring_day_no,
    ring_day_no: row.ring_day_no,
    ring_no: row.ring_no,
    ring: row.ring,
    class_no: row.class_no,
    class_label: row.class_label,
    class_order: row.class_order,
    entry_order: row.entry_order,
    entry_no: row.entry_no,
    horse: row.horse,
    rider: row.rider,
    trainer: row.trainer,
    source: "catalyst.hs_class_oog"
  };
  const trainerId = trainerRecordIds[text(row.trainer)] || normalizedTrainerRecordIds[normalizeTrainerKey(row.trainer)];
  if (trainerId) fields.trainers = [trainerId];
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

async function mirrorClassOogToAirtable(showNo, focusDay, ringDayNo, ringNo, classNo, rows, trainerRecordIds = {}) {
  const activeKeys = new Set(rows.map((row) => text(row.class_oog_key)).filter(Boolean));
  const records = await airtableUpsertByFieldId(
    "class_oog",
    "mirror_class_oog_key",
    rows.map((row) => mapClassOogMirrorFields(row, trainerRecordIds))
  );
  const existing = await airtableListRecords("class_oog", {
    filterByFormula: airtableClassOogFormula(showNo, focusDay, ringDayNo, ringNo, classNo)
  });
  const staleRows = existing.filter((record) => {
    const key = classOogMirrorRecordKey(record);
    return key && !activeKeys.has(key);
  });
  const finalRows = await airtableListRecords("class_oog", {
    filterByFormula: airtableClassOogFormula(showNo, focusDay)
  });
  return {
    records: records.length,
    stale_deleted: 0,
    stale_delete_candidates: staleRows.length,
    stale_delete_skipped: staleRows.length,
    stale_delete_skip_reason: staleRows.length ? "mirror_only_no_airtable_delete" : "",
    final_count: finalRows.length
  };
}

function classOogStagingClassKeyFromFields(fields = {}) {
  return resultKey(
    fields.show_no,
    dateKey(fields.focus_day),
    fields.ring_day_no,
    fields.ring_no,
    fields.class_no
  );
}

function classOogStagingEntryKeyFromFields(fields = {}) {
  return resultKey(
    fields.show_no,
    dateKey(fields.focus_day),
    fields.ring_day_no,
    fields.ring_no,
    fields.class_no,
    fields.entry_no
  );
}

function airtableClassOogStagingFormula(showNo, focusDay) {
  return `AND({show_no}=${Number(showNo)},IS_SAME({focus_day},DATETIME_PARSE(${airtableFormulaValue(focusDay)}),'day'))`;
}

function linkedFieldValue(fields, name) {
  const ids = linkedRecordIds(fields?.[name]);
  return ids.length ? ids : null;
}

function copyLinkedField(target, sourceFields, name) {
  const ids = linkedFieldValue(sourceFields, name);
  if (ids) target[name] = ids;
}

function comparableAirtableValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value.name ?? value.id ?? JSON.stringify(value);
  }
  return value;
}

function sameAirtableValue(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    const leftIds = linkedRecordIds(Array.isArray(left) ? left : [left]).sort();
    const rightIds = linkedRecordIds(Array.isArray(right) ? right : [right]).sort();
    return leftIds.join("|") === rightIds.join("|");
  }
  const leftValue = comparableAirtableValue(left);
  const rightValue = comparableAirtableValue(right);
  const leftDate = dateKey(leftValue);
  const rightDate = dateKey(rightValue);
  if (leftDate || rightDate) return leftDate === rightDate;
  return text(leftValue) === text(rightValue);
}

function classOogStagingFieldsChanged(existingFields = {}, nextFields = {}) {
  return Object.entries(nextFields).some(([field, value]) => !sameAirtableValue(existingFields[field], value));
}

function mapClassOogToStagingFields(sourceRecord, stagingRecordIdByClassKey) {
  const fields = sourceRecord?.fields || {};
  const mirrorKey = text(fields.mirror_class_oog_key || fields.class_oog_key);
  if (!mirrorKey) return null;
  const ringDayNo = intValue(fields.ring_day_no || fields.days);
  const focusDay = dateKey(fields.focus_day || fields.iso_date);
  const payload = cleanPatch({
    mirror_class_oog_key: mirrorKey,
    show_no: intValue(fields.show_no),
    focus_day: focusDay,
    iso_date: focusDay,
    date_text: text(fields.date_text) || displayDateText(focusDay),
    days: ringDayNo,
    ring_day_no: ringDayNo,
    ring_no: intValue(fields.ring_no),
    ring: text(fields.ring || fields.ring_name),
    class_no: intValue(fields.class_no),
    class_label: text(fields.class_label),
    class_order: intValue(fields.class_order),
    entry_order: intValue(fields.entry_order),
    entry_no: intValue(fields.entry_no),
    horse: text(fields.horse),
    rider: text(fields.rider),
    trainer: text(fields.trainer),
    class_payout: text(fields.class_payout),
    class_name: text(fields.class_name),
    event_id: intValue(fields.event_id),
    source: "class_oog",
    active: true,
    inactive: false,
    class_oog: [sourceRecord.id]
  });
  const directStagingLinks = linkedFieldValue(fields, "update_schedule_staging");
  if (directStagingLinks) {
    payload.update_schedule_staging = directStagingLinks;
  } else {
    const classKey = classOogStagingClassKeyFromFields(payload);
    const stagingRecordId = stagingRecordIdByClassKey.get(classKey);
    if (stagingRecordId) payload.update_schedule_staging = [stagingRecordId];
  }
  for (const linkField of [
    "shows",
    "focus_show",
    "show_days",
    "ring_days",
    "rings",
    "ring_names",
    "classes",
    "entries",
    "events",
    "horses",
    "riders",
    "trainers"
  ]) {
    copyLinkedField(payload, fields, linkField);
  }
  return payload;
}

async function getActiveUpdateScheduleStagingClassIndex(showNo, focusDay) {
  const rows = await airtableListRecords(AIRTABLE_UPDATE_SCHEDULE_STAGING_TABLE, {
    filterByFormula: `AND({show_no}=${Number(showNo)},IS_SAME({iso_date},DATETIME_PARSE(${airtableFormulaValue(focusDay)}),'day'),NOT({inactive}=1))`
  });
  const index = new Map();
  const duplicateKeys = [];
  for (const row of rows) {
    const fields = row.fields || {};
    const key = resultKey(fields.show_no, dateKey(fields.iso_date), fields.ring_day_no, fields.ring_no, fields.class_no);
    if (!key) continue;
    if (index.has(key)) duplicateKeys.push(key);
    else index.set(key, row.id);
  }
  return { rows, index, duplicateKeys: [...new Set(duplicateKeys)] };
}

async function markStaleClassOogStagingRowsInactive(showNo, focusDay, activeKeys) {
  const rows = await airtableListRecords(AIRTABLE_CLASS_OOG_STAGING_TABLE, {
    filterByFormula: `{show_no}=${Number(showNo)}`
  });
  const active = new Set([...activeKeys].map(text).filter(Boolean));
  const stale = rows.filter((row) => {
    const fields = row.fields || {};
    const key = text(fields.mirror_class_oog_key || fields.class_oog_key);
    const day = dateKey(fields.focus_day);
    return fields.inactive !== true && (day !== focusDay || !active.has(key));
  });
  const updated = await airtableUpdateRecordsById(AIRTABLE_CLASS_OOG_STAGING_TABLE, stale.map((row) => ({
    id: row.id,
    fields: { inactive: true, active: false }
  })));
  return {
    checked: rows.length,
    marked_inactive: updated.length,
    stale_detail: stale.slice(0, 50).map((row) => ({
      record_id: row.id,
      mirror_class_oog_key: text(row.fields?.mirror_class_oog_key || row.fields?.class_oog_key),
      focus_day: dateKey(row.fields?.focus_day)
    }))
  };
}

function classOogStagingRequiredLinkStatus(rows) {
  const active = rows.filter((row) => row.fields?.inactive !== true);
  const classOogLinked = active.filter((row) => linkedRecordIds(row.fields?.class_oog).length > 0);
  const stagingLinked = active.filter((row) => linkedRecordIds(row.fields?.update_schedule_staging).length > 0);
  return {
    active_rows_checked: active.length,
    class_oog_linked: classOogLinked.length,
    class_oog_missing: active.length - classOogLinked.length,
    update_schedule_staging_linked: stagingLinked.length,
    update_schedule_staging_missing: active.length - stagingLinked.length
  };
}

async function syncClassOogStagingFromClassOog(showNo, focusDay) {
  const safeFocusDay = dateKey(focusDay);
  if (!text(showNo)) throw new Error("sync-class-oog-staging-from-class-oog requires show_no");
  if (!safeFocusDay) throw new Error("sync-class-oog-staging-from-class-oog requires focus_day");
  const helperMappings = await ensureClassOogStagingAllowedHelpers();
  const stagingIndex = await getActiveUpdateScheduleStagingClassIndex(showNo, safeFocusDay);
  if (stagingIndex.duplicateKeys.length) {
    return {
      status: "BLOCKED",
      blocker: "duplicate active update_schedule_staging class keys block class_oog_staging handoff",
      duplicate_update_schedule_staging_keys: stagingIndex.duplicateKeys
    };
  }
  const sourceRows = await airtableListRecords("class_oog", {
    filterByFormula: airtableClassOogFormula(showNo, safeFocusDay)
  });
  const existingRows = await airtableListRecords(AIRTABLE_CLASS_OOG_STAGING_TABLE, {
    filterByFormula: airtableClassOogStagingFormula(showNo, safeFocusDay)
  });
  const existingByKey = new Map(existingRows
    .map((record) => [text(record.fields?.mirror_class_oog_key || record.fields?.class_oog_key), record])
    .filter(([key]) => key));
  const sourceCandidates = sourceRows
    .map((record) => mapClassOogToStagingFields(record, stagingIndex.index))
    .filter(Boolean)
    .filter((fields) => text(fields.mirror_class_oog_key) && text(fields.entry_no));
  const candidatesByEntryKey = new Map();
  const duplicateSourceRowsIgnored = [];
  for (const fields of sourceCandidates) {
    const entryKey = classOogStagingEntryKeyFromFields(fields);
    if (!entryKey) continue;
    const current = candidatesByEntryKey.get(entryKey);
    if (!current) {
      candidatesByEntryKey.set(entryKey, fields);
      continue;
    }
    const currentHasExistingStaging = existingByKey.has(text(current.mirror_class_oog_key));
    const nextHasExistingStaging = existingByKey.has(text(fields.mirror_class_oog_key));
    if (!currentHasExistingStaging && nextHasExistingStaging) {
      duplicateSourceRowsIgnored.push({
        entry_key: entryKey,
        ignored_mirror_class_oog_key: text(current.mirror_class_oog_key),
        kept_mirror_class_oog_key: text(fields.mirror_class_oog_key)
      });
      candidatesByEntryKey.set(entryKey, fields);
    } else {
      duplicateSourceRowsIgnored.push({
        entry_key: entryKey,
        ignored_mirror_class_oog_key: text(fields.mirror_class_oog_key),
        kept_mirror_class_oog_key: text(current.mirror_class_oog_key)
      });
    }
  }
  const sourcePayloads = [...candidatesByEntryKey.values()];
  const activeKeys = new Set(sourcePayloads.map((fields) => text(fields.mirror_class_oog_key)));
  const recordsCreated = sourcePayloads.filter((fields) => !existingByKey.has(text(fields.mirror_class_oog_key))).length;
  const recordsChanged = sourcePayloads.filter((fields) => {
    const existing = existingByKey.get(text(fields.mirror_class_oog_key));
    return existing && classOogStagingFieldsChanged(existing.fields || {}, fields);
  }).length;
  const recordsUnchanged = sourcePayloads.length - recordsCreated - recordsChanged;
  const upserted = await airtableUpsertByFieldId(
    AIRTABLE_CLASS_OOG_STAGING_TABLE,
    "mirror_class_oog_key",
    sourcePayloads
  );
  const stale = await markStaleClassOogStagingRowsInactive(showNo, safeFocusDay, activeKeys);
  const helperRepair = await repairAllowedHelperLinksForTarget(AIRTABLE_CLASS_OOG_STAGING_TABLE, showNo, safeFocusDay);
  if (helperRepair.status === "BLOCKED") {
    return {
      status: "BLOCKED",
      blocker: "class_oog_staging helper-link misses found",
      show_no: showNo,
      focus_day: safeFocusDay,
      source_rows: sourceRows.length,
      target_upserted: upserted.length,
      helper_mappings: helperMappings,
      helper_repair: helperRepair
    };
  }
  const finalRows = await airtableListRecords(AIRTABLE_CLASS_OOG_STAGING_TABLE, {
    filterByFormula: airtableClassOogStagingFormula(showNo, safeFocusDay)
  });
  const linkStatus = classOogStagingRequiredLinkStatus(finalRows);
  const finalKeys = new Set(finalRows
    .filter((row) => row.fields?.inactive !== true)
    .map((row) => text(row.fields?.mirror_class_oog_key || row.fields?.class_oog_key))
    .filter(Boolean));
  const missingTargetRows = [...activeKeys].filter((key) => !finalKeys.has(key));
  const extraTargetRows = [...finalKeys].filter((key) => !activeKeys.has(key));
  const requiredLinksPass = linkStatus.class_oog_missing === 0 && linkStatus.update_schedule_staging_missing === 0;
  const countsMatch = activeKeys.size === finalKeys.size && missingTargetRows.length === 0 && extraTargetRows.length === 0;
  return {
    status: countsMatch && requiredLinksPass ? "PASS" : "BLOCKED",
    blocker: countsMatch && requiredLinksPass ? "" : "class_oog_staging reconciliation failed",
    show_no: showNo,
    focus_day: safeFocusDay,
    source: "class_oog",
    target: AIRTABLE_CLASS_OOG_STAGING_TABLE,
    source_rows: sourceRows.length,
    source_candidates: sourceCandidates.length,
    duplicate_source_rows_ignored: duplicateSourceRowsIgnored.length,
    duplicate_source_row_detail: duplicateSourceRowsIgnored.slice(0, 50),
    source_entry_keys: activeKeys.size,
    target_active_rows: finalRows.filter((row) => row.fields?.inactive !== true).length,
    target_active_keys: finalKeys.size,
    records_created: recordsCreated,
    records_updated: recordsChanged,
    records_unchanged: recordsUnchanged,
    records_marked_inactive: stale.marked_inactive,
    stale_checked: stale.checked,
    class_oog_link_evidence: {
      linked: linkStatus.class_oog_linked,
      missing: linkStatus.class_oog_missing
    },
    update_schedule_staging_link_evidence: {
      linked: linkStatus.update_schedule_staging_linked,
      missing: linkStatus.update_schedule_staging_missing
    },
    helper_link_evidence: {
      mappings: helperMappings,
      repair: helperRepair
    },
    entrywise_grain_evidence: {
      source_entry_keys: activeKeys.size,
      target_entry_keys: finalKeys.size,
      missing_target_rows: missingTargetRows,
      extra_target_rows: extraTargetRows
    },
    diff_evidence: {
      new: recordsCreated,
      changed: recordsChanged,
      dropped: stale.marked_inactive,
      unchanged: recordsUnchanged
    },
    protected_manual_field_evidence: {
      fields_not_written: ["active_entries", "hide", "conflict", "counts", "result_classes", "class_start_times", "entry_go_times"]
    }
  };
}

async function parseStoredClassOogRawChunk(app, rawRecId, { activeTrainers = [], trainerRecordIds = {} } = {}) {
  const rawRow = await getClassOogRawRow(app, rawRecId);
  if (!rawRow) throw new Error(`class_oog raw_rec_id not found: ${rawRecId}`);
  const showNo = text(rawRow.show_no);
  const focusDay = dateKey(rawRow.focus_day);
  const ringDayNo = text(rawRow.ring_day_no);
  const ringNo = text(rawRow.ring_no);
  const classNo = text(rawRow.class_no);
  const activeTrainerNames = (activeTrainers || []).map(text).filter(Boolean);
  const activeTrainerByKey = new Map(activeTrainerNames
    .map((trainer) => [normalizeTrainerKey(trainer), trainer])
    .filter(([key]) => key));
  const activeTrainerSet = new Set(activeTrainerByKey.keys());
  const allParsedRows = parseClassOogRows(rawRow.raw_html, showNo, classNo);
  const matchedRowsByTrainer = Object.fromEntries(activeTrainerNames.map((trainer) => [trainer, 0]));
  const parsedRows = allParsedRows.filter((row) => {
    const key = normalizeTrainerKey(row.trainer);
    if (!activeTrainerSet.size) {
      const trainer = text(row.trainer);
      if (trainer) matchedRowsByTrainer[trainer] = (matchedRowsByTrainer[trainer] || 0) + 1;
      return true;
    }
    const matchedTrainer = activeTrainerByKey.get(key);
    if (!matchedTrainer) return false;
    matchedRowsByTrainer[matchedTrainer] = (matchedRowsByTrainer[matchedTrainer] || 0) + 1;
    return true;
  });
  const sourceRows = parsedRows
    .map((row) => classOogSourceRowCanonical(row, rawRow))
    .filter(Boolean);
  const catalystResult = await upsertSourceRowsFast(app, TABLES.classOog, "class_oog_key", sourceRows, { showNo });
  const activeKeys = sourceRows.map((row) => text(row.class_oog_key)).filter(Boolean);
  const catalystStale = await deleteCatalystClassOogStaleForClass(app, showNo, focusDay, ringDayNo, ringNo, classNo, activeKeys);
  const airtableMirror = await mirrorClassOogToAirtable(showNo, focusDay, ringDayNo, ringNo, classNo, sourceRows, trainerRecordIds);
  const runTime = new Date().toISOString();
  await app.datastore().table(TABLES.classOogRaw).updateRow({
    ROWID: rawRow.ROWID,
    parsed_at: catalystDateTime(runTime),
    parse_status: "parsed"
  });
  const logType = "core_class_oog";
  const logKey = `${logType}|${showNo}|${focusDay}|${ringDayNo}|${classNo}`;
  const logRecord = await airtableCreateRecord(AIRTABLE_WEC_LOGS_TABLE, {
    [AIRTABLE_WEC_LOG_FIELDS.log_key_run]: `${logKey}|${runTime}`,
    [AIRTABLE_WEC_LOG_FIELDS.log_key]: logKey,
    [AIRTABLE_WEC_LOG_FIELDS.workflow_lanes]: "Core",
    [AIRTABLE_WEC_LOG_FIELDS.log_type]: logType,
    [AIRTABLE_WEC_LOG_FIELDS.check_name]: "parse-class-oog-raw-chunk",
    [AIRTABLE_WEC_LOG_FIELDS.show_no]: Number(showNo),
    [AIRTABLE_WEC_LOG_FIELDS.focus_day]: focusDay || null,
    [AIRTABLE_WEC_LOG_FIELDS.status]: "ok",
    [AIRTABLE_WEC_LOG_FIELDS.records_seen]: sourceRows.length,
    [AIRTABLE_WEC_LOG_FIELDS.records_changed]: Number(catalystResult.inserted || 0) + Number(catalystResult.updated || 0),
    [AIRTABLE_WEC_LOG_FIELDS.summary]: `parsed class_oog ${classNo}: ${sourceRows.length} active-trainer rows`,
    [AIRTABLE_WEC_LOG_FIELDS.payload_json]: JSON.stringify({
      raw_rec_id: rawRow.ROWID,
      raw_key: rawRow.raw_key,
      ring_day_no: ringDayNo,
      class_no: classNo,
      upstream_status: rawRow.upstream_status,
      total_parsed_rows: allParsedRows.length,
      parsed_rows: parsedRows.length,
      matched_rows_by_trainer: matchedRowsByTrainer,
      hs_class_oog: catalystResult,
      hs_class_oog_stale: catalystStale,
      class_oog_records: airtableMirror.records,
      class_oog_stale_deleted: airtableMirror.stale_deleted
    }, null, 2),
    [AIRTABLE_WEC_LOG_FIELDS.created_at]: runTime
  });
  return {
    raw_rec_id: rawRow.ROWID,
    parse_wec_log_rec_id: logRecord?.id || null,
    show_no: showNo,
    focus_day: focusDay,
    ring_day_no: ringDayNo,
    ring_no: ringNo,
    class_no: classNo,
    total_parsed_rows: allParsedRows.length,
    parsed_rows: parsedRows.length,
    matched_rows_by_trainer: matchedRowsByTrainer,
    hs_class_oog_rows: catalystResult.rows,
    hs_class_oog_stale_deleted: catalystStale.deleted || 0,
    class_oog_rows: airtableMirror.records,
    class_oog_stale_deleted: airtableMirror.stale_deleted,
    class_oog_final_count: airtableMirror.final_count
  };
}

function classStartRowFromLockedStagingRow(row, focusDay) {
  const classStartTime = classStartTimeFromText(row.class_time_text || row.time_text);
  if (!focusDay || intOrNull(row.class_no) <= 0 || !classStartTime) return null;
  return {
    class_start_key: `${row.show_no}|${focusDay}|${row.ring_day_no}|${row.class_no}`,
    show_no: intValue(row.show_no),
    focus_day: focusDay,
    ring_day_no: intValue(row.ring_day_no),
    ring_no: intValue(row.ring_no),
    ring_name: text(row.ring_name),
    class_no: intValue(row.class_no),
    class_name: text(row.class_name),
    class_number: intValue(row.class_number || row.class_no),
    class_start_time: classStartTime,
    display_time: displayTimeFromStart(classStartTime),
    entry_count: intValue(row.entry_count),
    live_source: "update_schedule_staging.is_lock",
    last_synced_at: catalystDateTime(new Date())
  };
}

function airtableClassStartFormula(showNo, focusDay) {
  return `AND({show_no}=${Number(showNo)},IS_SAME({focus_day},DATETIME_PARSE(${airtableFormulaValue(focusDay)}),'day'))`;
}

function mapClassStartMirrorFields(row, stagingRecordIds = {}) {
  const fields = {
    class_start_key: row.class_start_key,
    show_no: row.show_no,
    focus_day: row.focus_day,
    ring_day_no: row.ring_day_no,
    ring_no: row.ring_no,
    class_no: row.class_no,
    class_name: row.class_name,
    class_number: row.class_number,
    class_start_time: row.class_start_time,
    display_time: row.display_time,
    entry_count: row.entry_count,
    source: "catalyst.hs_class_start_times",
    live_source: row.live_source,
    last_synced_at: new Date().toISOString()
  };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

async function syncClassStartTimesFromLockedRows(app, showNo, focusDay, rows) {
  const sourceRows = (rows || []).map((row) => classStartRowFromLockedStagingRow(row, focusDay)).filter(Boolean);
  const result = await upsertSourceRowsFast(app, TABLES.classStartTimes, "class_start_key", sourceRows, { showNo });
  const existingCatalyst = await getRowsByShow(app, TABLES.classStartTimes, showNo, { limit: 2000 });
  const activeKeys = new Set(sourceRows.map((row) => text(row.class_start_key)).filter(Boolean));
  const staleIds = existingCatalyst
    .filter((row) => dateKey(row.focus_day) === focusDay)
    .filter((row) => !activeKeys.has(text(row.class_start_key)))
    .map((row) => row.ROWID)
    .filter(Boolean);
  let catalystStaleDeleted = 0;
  const table = app.datastore().table(TABLES.classStartTimes);
  for (let index = 0; index < staleIds.length; index += 100) {
    const batch = staleIds.slice(index, index + 100);
    if (batch.length) {
      await table.deleteRows(batch);
      catalystStaleDeleted += batch.length;
    }
  }
  const stagingRecordIds = Object.fromEntries((rows || [])
    .map((row) => [text(`${row.show_no}|${focusDay}|${row.ring_day_no}|${row.class_no}`), text(row.staging_record_id)])
    .filter(([key, id]) => key && id));
  const airtableRecords = await airtableUpsertByFieldId(
    "class_start_times",
    "class_start_key",
    sourceRows.map((row) => mapClassStartMirrorFields(row, stagingRecordIds))
  );
  const existingAirtable = await airtableListRecords("class_start_times", {
    filterByFormula: airtableClassStartFormula(showNo, focusDay)
  });
  const airtableStaleDeleted = await deleteAirtableRowsNotInKeys("class_start_times", "class_start_key", existingAirtable, activeKeys);
  const finalAirtable = await airtableListRecords("class_start_times", {
    filterByFormula: airtableClassStartFormula(showNo, focusDay)
  });
  const finalCatalyst = (await getRowsByShow(app, TABLES.classStartTimes, showNo, { limit: 2000 }))
    .filter((row) => dateKey(row.focus_day) === focusDay);
  const runTime = new Date().toISOString();
  const logType = "class_start_times";
  const logKey = `${logType}|${showNo}|${focusDay}`;
  const logRecord = await airtableCreateRecord(AIRTABLE_WEC_LOGS_TABLE, {
    [AIRTABLE_WEC_LOG_FIELDS.log_key_run]: `${logKey}|${runTime}`,
    [AIRTABLE_WEC_LOG_FIELDS.log_key]: logKey,
    [AIRTABLE_WEC_LOG_FIELDS.workflow_lanes]: "Core",
    [AIRTABLE_WEC_LOG_FIELDS.log_type]: logType,
    [AIRTABLE_WEC_LOG_FIELDS.check_name]: "sync-class-start-times-from-locked-staging",
    [AIRTABLE_WEC_LOG_FIELDS.show_no]: Number(showNo),
    [AIRTABLE_WEC_LOG_FIELDS.focus_day]: focusDay || null,
    [AIRTABLE_WEC_LOG_FIELDS.status]: "ok",
    [AIRTABLE_WEC_LOG_FIELDS.records_seen]: sourceRows.length,
    [AIRTABLE_WEC_LOG_FIELDS.records_changed]: Number(result.inserted || 0) + Number(result.updated || 0),
    [AIRTABLE_WEC_LOG_FIELDS.summary]: `synced class_start_times from locked staging: ${sourceRows.length} rows`,
    [AIRTABLE_WEC_LOG_FIELDS.payload_json]: JSON.stringify({
      hs_class_start_times: result,
      hs_class_start_times_stale_deleted: catalystStaleDeleted,
      class_start_times_records: airtableRecords.length,
      class_start_times_stale_deleted: airtableStaleDeleted
    }, null, 2),
    [AIRTABLE_WEC_LOG_FIELDS.created_at]: runTime
  });
  return {
    show_no: showNo,
    focus_day: focusDay,
    source_rows: sourceRows.length,
    hs_class_start_times_rows: finalCatalyst.length,
    hs_class_start_times_upserts: result.rows,
    hs_class_start_times_stale_deleted: catalystStaleDeleted,
    class_start_times_rows: finalAirtable.length,
    class_start_times_upserts: airtableRecords.length,
    class_start_times_stale_deleted: airtableStaleDeleted,
    class_start_times_wec_log_rec_id: logRecord?.id || null
  };
}

function parseClockMinutes(value) {
  const raw = text(value).toLowerCase();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2})(?::?(\d{2}))?\s*([ap])m?$/) || raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3] || "";
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (meridiem === "p" && hour !== 12) hour += 12;
  if (meridiem === "a" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function floridaDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(now).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const hour = Number(parts.hour === "24" ? "0" : parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second || 0);
  return {
    iso_date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: hour * 60 + minute,
    time_text: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`
  };
}

function floridaCatalystDateTime(now = new Date()) {
  const parts = floridaDateParts(now);
  return `${parts.iso_date} ${parts.time_text}`;
}

function isLiveWindowNearClose(liveWindow) {
  const nowMinutes = intOrNull(liveWindow?.now?.minutes);
  const endMinutes = intOrNull(liveWindow?.end_minutes);
  return nowMinutes !== null && endMinutes !== null && nowMinutes >= endMinutes - 60;
}

async function getAirtableFocusShow(showNo = "") {
  const requestedShowNo = text(showNo);
  const records = await airtableListRecords("focus_show");
  const rows = records.map((record) => ({ record_id: record.id, fields: record.fields || {} }));
  const activeRows = rows.filter((row) => row.fields.active === true);
  const matchingActive = activeRows.find((row) => !requestedShowNo || text(row.fields.show_no) === requestedShowNo);
  const matchingAny = rows.find((row) => !requestedShowNo || text(row.fields.show_no) === requestedShowNo);
  const selected = matchingActive || matchingAny || activeRows[0] || rows[0];
  if (!selected) return null;
  return {
    record_id: selected.record_id,
    show_no: text(selected.fields.show_no),
    focus_day: dateKey(selected.fields.focus_day),
    show_name: text(selected.fields.show_name || selected.fields.name),
    show_start_time: text(selected.fields.show_start_time),
    show_end_time: text(selected.fields.show_end_time),
    active: selected.fields.active === true
  };
}

async function getActiveAirtableFocusShowStrict() {
  const records = await airtableListRecords("focus_show");
  const activeRows = records
    .map((record) => ({ record_id: record.id, fields: record.fields || {} }))
    .filter((row) => row.fields.active === true);
  if (activeRows.length !== 1) {
    return {
      ok: false,
      blocker: activeRows.length ? "multiple_active_focus_show" : "missing_active_focus_show",
      active_count: activeRows.length
    };
  }
  const selected = activeRows[0];
  const fields = selected.fields || {};
  const showNo = text(fields.show_no);
  const focusDay = dateKey(fields.focus_day);
  if (!showNo || !focusDay) {
    return {
      ok: false,
      blocker: "active_focus_show_missing_show_or_day",
      active_count: 1,
      focus_show_record_id: selected.record_id,
      show_no: showNo,
      focus_day: focusDay
    };
  }
  return {
    ok: true,
    source: "airtable.focus_show.active",
    active_count: 1,
    focus_show_record_id: selected.record_id,
    show_no: showNo,
    focus_day: focusDay,
    show_name: text(fields.show_name || fields.name),
    show_start_time: text(fields.show_start_time),
    show_end_time: text(fields.show_end_time),
    is_pause: fields.is_pause === true,
    is_lock: fields.is_lock === true,
    live_enrichment: fields["live-enrichment"] === true || fields.live_enrichment === true
  };
}

async function getOutputFocusShow(showNo = "") {
  const requestedShowNo = text(showNo);
  const records = await airtableListRecords("focus_show");
  const activeRows = records
    .map((record) => ({ record_id: record.id, fields: record.fields || {} }))
    .filter((row) => row.fields.active === true && dateKey(row.fields.focus_day));
  const selected = requestedShowNo
    ? activeRows.find((row) => text(row.fields.show_no) === requestedShowNo)
    : activeRows[0];
  if (!selected) return null;
  return {
    record_id: selected.record_id,
    show_no: text(selected.fields.show_no),
    focus_day: dateKey(selected.fields.focus_day),
    show_name: text(selected.fields.show_name || selected.fields.name),
    active: true,
    source: "airtable.focus_show.active"
  };
}

async function getAirtableFocusShowForDay(showNo, focusDay) {
  const safeFocusDay = dateKey(focusDay);
  const records = await airtableListRecords("focus_show", { filterByFormula: `{show_no}=${Number(showNo)}` });
  const selected = safeFocusDay
    ? records.find((record) => dateKey(record.fields?.focus_day) === safeFocusDay)
    : records.find((record) => record.fields?.active === true) || records[0];
  const fields = selected?.fields || {};
  if (!selected) return null;
  return {
    record_id: selected.id,
    show_no: text(fields.show_no),
    focus_day: dateKey(fields.focus_day),
    show_start_time: text(fields.show_start_time),
    show_end_time: text(fields.show_end_time),
    active: fields.active === true
  };
}

async function updateAirtableHsFocusShowLiveEmpty(showNo, focusDay, lastLiveEmptyAt) {
  try {
    const safeFocusDay = dateKey(focusDay);
    const showValue = Number.isFinite(Number(showNo)) ? String(Number(showNo)) : airtableFormulaValue(showNo);
    const formula = `AND({show_no}=${showValue},IS_SAME({focus_day},DATETIME_PARSE(${airtableFormulaValue(safeFocusDay)}),'day'))`;
    const records = await airtableListRecords("hs_focus_show", { filterByFormula: formula });
    const record = records[0];
    if (!record?.id) {
      return { updated: false, skipped: true, reason: "hs_focus_show_row_not_found" };
    }
    const updated = await airtableUpdateRecordsById("hs_focus_show", [{
      id: record.id,
      fields: { last_live_empty_at: lastLiveEmptyAt }
    }]);
    return { updated: updated.length > 0, skipped: false, records: updated.length };
  } catch (error) {
    return { updated: false, skipped: true, error: String(error?.message || error) };
  }
}

async function writeLiveWorkflowLog({ source, showNo, focusDay, status, summary, payload = {}, recordsSeen = 0, recordsChanged = 0 }) {
  const now = new Date().toISOString();
  const logType = source === "orders" ? "get-orders" : "get-rings";
  const logKey = `${logType}|${showNo}|${focusDay || "no-focus-day"}`;
  const cleanPayload = { ...payload };
  delete cleanPayload.token;
  delete cleanPayload.airtable_token;
  await airtableCreateRecord(AIRTABLE_WEC_LOGS_TABLE, {
    [AIRTABLE_WEC_LOG_FIELDS.log_key_run]: `${logKey}|${now}`,
    [AIRTABLE_WEC_LOG_FIELDS.log_key]: logKey,
    [AIRTABLE_WEC_LOG_FIELDS.workflow_lanes]: "Live",
    [AIRTABLE_WEC_LOG_FIELDS.log_type]: logType,
    [AIRTABLE_WEC_LOG_FIELDS.check_name]: `sync-${source}`,
    [AIRTABLE_WEC_LOG_FIELDS.show_no]: Number(showNo),
    [AIRTABLE_WEC_LOG_FIELDS.focus_day]: focusDay || null,
    [AIRTABLE_WEC_LOG_FIELDS.status]: status,
    [AIRTABLE_WEC_LOG_FIELDS.records_seen]: Number(recordsSeen || 0),
    [AIRTABLE_WEC_LOG_FIELDS.records_changed]: Number(recordsChanged || 0),
    [AIRTABLE_WEC_LOG_FIELDS.summary]: summary,
    [AIRTABLE_WEC_LOG_FIELDS.payload_json]: JSON.stringify(cleanPayload, null, 2),
    [AIRTABLE_WEC_LOG_FIELDS.created_at]: now
  });
}

async function getLiveWindowGate(showNo, focusDay, source) {
  try {
    const focusShow = await getAirtableFocusShowForDay(showNo, focusDay);
    const safeFocusDay = focusShow?.focus_day || dateKey(focusDay);
    const startMinutes = parseClockMinutes(focusShow?.show_start_time);
    const endMinutes = parseClockMinutes(focusShow?.show_end_time);
    const now = floridaDateParts();
    if (!focusShow) {
      return { allowed: false, reason: "missing_focus_show", source, show_no: showNo, focus_day: safeFocusDay || focusDay || "", now };
    }
    if (!safeFocusDay || startMinutes === null || endMinutes === null) {
      return {
        allowed: false,
        reason: "missing_live_window",
        source,
        show_no: showNo,
        focus_day: safeFocusDay,
        show_start_time: focusShow.show_start_time,
        show_end_time: focusShow.show_end_time,
        now
      };
    }
    const inDate = now.iso_date === safeFocusDay;
    const inTime = startMinutes <= endMinutes
      ? now.minutes >= startMinutes && now.minutes <= endMinutes
      : now.minutes >= startMinutes || now.minutes <= endMinutes;
    return {
      allowed: inDate && inTime,
      reason: inDate && inTime ? "within_live_window" : "outside_live_window",
      source,
      show_no: showNo,
      focus_day: safeFocusDay,
      show_start_time: focusShow.show_start_time,
      show_end_time: focusShow.show_end_time,
      start_minutes: startMinutes,
      end_minutes: endMinutes,
      now
    };
  } catch (error) {
    return {
      allowed: false,
      reason: "live_window_check_failed",
      source,
      show_no: showNo,
      focus_day: dateKey(focusDay),
      error: String(error?.message || error)
    };
  }
}

async function getAirtablePrintLayout(showNo, focusDay) {
  const safeFocusDay = dateKey(focusDay);
  if (!safeFocusDay) return { ok: false, source: "airtable.wec_print_meta", error: "focus_day required" };
  try {
    const printMetaKey = `${showNo}|${safeFocusDay}`;
    const metaRecords = await airtableListRecords("wec_print_meta", {
      filterByFormula: `{print_meta_key}='${printMetaKey.replace(/'/g, "\\'")}'`
    });
    const ringGroupRecords = await airtableListRecords("ring_groups", {
      filterByFormula: `AND({show_no}=${Number(showNo)},IS_SAME({focus_day},DATETIME_PARSE('${safeFocusDay}'),'day'))`
    });
    const rings = ringGroupRecords
      .map((record) => {
        const fields = record.fields || {};
        return {
          record_id: record.id,
          ring_group_key: text(fields.ring_group_key),
          show_no: intOrNull(fields.show_no),
          focus_day: dateKey(fields.focus_day),
          ring_day_no: intOrNull(fields.ring_day_no),
          ring_no: intOrNull(fields.ring_no),
          ring_name: text(fields.ring_name),
          source_rows: intOrNull(fields.source_rows) || 0,
          hidden_rows: intOrNull(fields.hidden_rows) || 0,
          visible_classes: intOrNull(fields.visible_classes) || 0,
          visible_rollups: intOrNull(fields.visible_rollups) || 0,
          print_rows: intOrNull(fields.print_rows) || 0,
          portrait_col: intOrNull(fields.portrait_col),
          landscape_col: intOrNull(fields.landscape_col),
          source: text(fields.source)
        };
      })
      .filter((ring) => ring.ring_no);
    const metaFields = metaRecords[0]?.fields || {};
    return {
      ok: true,
      source: "airtable.wec_print_meta+ring_groups",
      show_no: String(showNo),
      focus_day: safeFocusDay,
      print_meta: metaRecords[0] ? {
        record_id: metaRecords[0].id,
        print_meta_key: text(metaFields.print_meta_key),
        ring_group_count: intOrNull(metaFields.ring_group_count) || rings.length,
        visible_classes: intOrNull(metaFields.visible_classes) || 0,
        visible_rollups: intOrNull(metaFields.visible_rollups) || 0,
        total_print_rows: intOrNull(metaFields.total_print_rows) || 0,
        portrait_summary: text(metaFields.portrait_summary),
        portrait_col_1: text(metaFields.portrait_col_1),
        portrait_col_2: text(metaFields.portrait_col_2),
        landscape_summary: text(metaFields.landscape_summary),
        landscape_col_1: text(metaFields.landscape_col_1),
        landscape_col_2: text(metaFields.landscape_col_2),
        landscape_col_3: text(metaFields.landscape_col_3),
        source: text(metaFields.source)
      } : null,
      rings,
      placement: Object.fromEntries(rings.map((ring) => [String(ring.ring_no), {
        portrait_col: ring.portrait_col,
        landscape_col: ring.landscape_col,
        print_rows: ring.print_rows,
        ring_name: ring.ring_name
      }]))
    };
  } catch (error) {
    return {
      ok: false,
      source: "airtable.wec_print_meta+ring_groups",
      show_no: String(showNo),
      focus_day: safeFocusDay,
      error: error.message,
      rings: [],
      placement: {}
    };
  }
}

function derivePrintLayoutFromScheduleRows(showNo, focusDay, rows) {
  const safeFocusDay = dateKey(focusDay);
  const grouped = new Map();
  for (const row of rows || []) {
    const ringNo = text(row.ring_number ?? row.ring_no ?? row.ringNo);
    const ringNameNormalized = text(row.ring_name_normalized);
    const ringVisualKeyValue = text(row.ring_visual_key) || ringVisualKey(ringNo, ringNameNormalized);
    const ringGroupKey = ringNameNormalized || ringVisualKeyValue || ringNo;
    const ringDisplay = ringDisplayFromNormalizedName(ringNameNormalized) || text(row.ring_display ?? row.ringDisplay ?? row.ring_name);
    if (!ringGroupKey) continue;
    if (!grouped.has(ringGroupKey)) {
      grouped.set(ringGroupKey, {
        ring_group_id: ringGroupKey,
        ring_no: intOrNull(ringNo),
        ring_name: text(row.ring_name),
        ring_name_normalized: ringNameNormalized,
        ring_visual_key: ringVisualKeyValue,
        ring_display: ringDisplay,
        rows: []
      });
    }
    grouped.get(ringGroupKey).rows.push(row);
  }
  const rings = [...grouped.values()]
    .sort((a, b) => (
      Number(a.ring_no || 9999) - Number(b.ring_no || 9999) ||
      text(a.ring_name_normalized).localeCompare(text(b.ring_name_normalized))
    ))
    .map((ring) => {
      const visibleRollups = ring.rows.filter((row) => text(row.group_display ?? row.rollup)).length;
      return {
        ring_group_key: `${showNo}|${safeFocusDay}|${ring.ring_group_id}`,
        show_no: intOrNull(showNo),
        focus_day: safeFocusDay,
        ring_no: ring.ring_no,
        ring_name: ring.ring_name,
        ring_name_normalized: ring.ring_name_normalized,
        ring_visual_key: ring.ring_visual_key,
        ring_display: ring.ring_display,
        source_rows: ring.rows.length,
        hidden_rows: 0,
        visible_classes: ring.rows.length,
        visible_rollups: visibleRollups,
        print_rows: 2 + ring.rows.length + visibleRollups,
        portrait_col: null,
        landscape_col: null,
        source: "catalyst.wec-print-live"
      };
    });

  const totalPrintRows = rings.reduce((sum, ring) => sum + ring.print_rows, 0);
  const target = Math.ceil(totalPrintRows / 2);
  let leftRows = 0;
  let usingRight = false;
  for (const ring of rings) {
    if (!usingRight && leftRows > 0 && leftRows + ring.print_rows > target) usingRight = true;
    ring.portrait_col = usingRight ? 2 : 1;
    ring.landscape_col = ring.portrait_col;
    if (!usingRight) leftRows += ring.print_rows;
  }

  return {
    ok: true,
    source: "catalyst.wec-print-live",
    show_no: String(showNo),
    focus_day: safeFocusDay,
    print_meta: {
      print_meta_key: `${showNo}|${safeFocusDay}`,
      ring_group_count: rings.length,
      visible_classes: rings.reduce((sum, ring) => sum + ring.visible_classes, 0),
      visible_rollups: rings.reduce((sum, ring) => sum + ring.visible_rollups, 0),
      total_print_rows: totalPrintRows,
      portrait_summary: rings.map((ring) => `${ring.ring_display || ring.ring_name}:${ring.portrait_col}`).join("|"),
      landscape_summary: rings.map((ring) => `${ring.ring_display || ring.ring_name}:${ring.landscape_col}`).join("|"),
      source: "catalyst.wec-print-live"
    },
    rings,
    placement: Object.fromEntries(rings.map((ring) => [String(ring.ring_name_normalized || ring.ring_visual_key || ring.ring_no), {
      portrait_col: ring.portrait_col,
      landscape_col: ring.landscape_col,
      print_rows: ring.print_rows,
      ring_name: ring.ring_name,
      ring_name_normalized: ring.ring_name_normalized,
      ring_visual_key: ring.ring_visual_key,
      ring_display: ring.ring_display
    }]))
  };
}

function splitAliasText(value) {
  return text(value)
    .split(/[,\n|]/)
    .map(text)
    .filter(Boolean);
}

function helperRowIsEnabled(row = {}, { requireAllowed = false, requireFollow = false } = {}) {
  const action = text(row.sync_action).toLowerCase();
  if (action === "ignore" || action === "remove" || action === "inactive") return false;
  const status = text(row.status).toLowerCase();
  if (status === "ignore" || status === "remove" || status === "inactive") return false;
  const active = boolOrNull(row.active);
  const follow = boolOrNull(row.follow);
  const allowed = boolOrNull(row.allowed);
  if (active === false) return false;
  if (requireFollow && follow !== true) return false;
  if (!requireFollow && follow === false) return false;
  if (requireAllowed && allowed !== true) return false;
  if (!requireAllowed && allowed === false) return false;
  return true;
}

function addHelperTokens(target, values = []) {
  for (const value of values || []) {
    const raw = text(value);
    if (!raw) continue;
    target.add(normalizeHelperKey(raw));
    for (const alias of splitAliasText(raw)) {
      const normalized = normalizeHelperKey(alias);
      if (normalized) target.add(normalized);
    }
  }
}

function helperMatchSetFromRows(rows = [], fieldGroups = [], options = {}) {
  const tokens = new Set();
  let activeRows = 0;
  for (const row of rows || []) {
    if (!helperRowIsEnabled(row, options)) continue;
    activeRows += 1;
    for (const fields of fieldGroups) {
      addHelperTokens(tokens, fields.map((field) => row[field]));
    }
  }
  tokens.delete("");
  return { tokens, active_rows: activeRows };
}

function step3HelperScopeSignature(activeEntryNos, activeTrainerKeys, helperConfig = {}) {
  const entries = [...(activeEntryNos || new Set())].map(text).filter(Boolean).sort();
  const trainers = [
    ...(activeTrainerKeys || new Set()),
    ...(helperConfig.trainer_keys || new Set())
  ].map(text).filter(Boolean).sort();
  const horses = [...(helperConfig.horse_keys || new Set())].map(text).filter(Boolean).sort();
  const riders = [...(helperConfig.rider_keys || new Set())].map(text).filter(Boolean).sort();
  return [
    `entries:${entries.join("|")}`,
    `trainers:${trainers.join("|")}`,
    `horses:${horses.join("|")}`,
    `riders:${riders.join("|")}`
  ].join(";");
}

async function getStep3CatalystHelperMatchConfig(app, showNo, activeTrainerKeys = new Set()) {
  const config = {
    source: "catalyst.hs_helpers",
    horse_keys: new Set(),
    rider_keys: new Set(),
    trainer_keys: new Set(),
    counts: {
      hs_horses_active: 0,
      hs_riders_active: 0,
      hs_trainers_active: 0
    },
    warnings: []
  };
  try {
    const horseRows = await getPagedRowsFiltered(app, TABLES.horses, () => true, { maxRows: 5000 });
    const horseMatch = helperMatchSetFromRows(horseRows.rows || [], [
      ["horse_name", "horse"],
      ["barn_name", "horse_display"],
      ["horse_aka", "aka"]
    ], { requireFollow: true });
    config.horse_keys = horseMatch.tokens;
    config.counts.hs_horses_active = horseMatch.active_rows;
  } catch (error) {
    config.warnings.push(`hs_horses_unavailable:${error.message}`);
  }
  try {
    const riderRows = await getPagedRowsFiltered(app, TABLES.riders, () => true, { maxRows: 5000 });
    const riderMatch = helperMatchSetFromRows(riderRows.rows || [], [
      ["rider_name", "rider"],
      ["team_name", "rider_display"],
      ["rider_aliases"]
    ], { requireFollow: true });
    config.rider_keys = riderMatch.tokens;
    config.counts.hs_riders_active = riderMatch.active_rows;
  } catch (error) {
    config.warnings.push(`hs_riders_unavailable:${error.message}`);
  }
  try {
    const trainerRows = await getPagedRowsFiltered(
      app,
      TABLES.trainers,
      (row) => !text(row.show_no) || text(row.show_no) === text(showNo),
      { maxRows: 5000 }
    );
    const trainerMatch = helperMatchSetFromRows(trainerRows.rows || [], [
      ["trainer_name", "trainer"],
      ["tenant_name", "trainer_display"],
      ["trainer_aliases"]
    ], { requireAllowed: true });
    config.trainer_keys = new Set([
      ...(activeTrainerKeys || new Set()),
      ...trainerMatch.tokens
    ]);
    config.counts.hs_trainers_active = trainerMatch.active_rows;
  } catch (error) {
    config.trainer_keys = new Set([...(activeTrainerKeys || new Set())]);
    config.warnings.push(`hs_trainers_unavailable:${error.message}`);
  }
  return config;
}

function step3ClassOogMatch(row, activeEntryNos = new Set(), activeTrainerKeys = new Set(), helperConfig = {}) {
  const entryNo = text(row.current_entry_no || row.entry_no);
  const trainerKey = normalizeTrainerKey(row.trainer);
  const horseKey = normalizeHorseHelperKey(row.current_horse || row.horse);
  const riderKey = normalizeHelperKey(row.rider);
  const reasons = [];
  if (entryNo && activeEntryNos.has(entryNo)) reasons.push("active_entry_no");
  if (trainerKey && activeTrainerKeys.has(trainerKey)) reasons.push("focus_show_trainer");
  if (trainerKey && helperConfig.trainer_keys?.has(trainerKey)) reasons.push("hs_trainers");
  if (horseKey && helperConfig.horse_keys?.has(horseKey)) reasons.push("hs_horses");
  if (riderKey && helperConfig.rider_keys?.has(riderKey)) reasons.push("hs_riders");
  return {
    matched: reasons.length > 0,
    reasons
  };
}

function horseDisplayFromFields(fields) {
  return text(fields.barn_name || fields.horse_display || fields.horse);
}

function activeHorseFormula(activeTrainers = [], trainerDisplays = {}) {
  const displays = activeTrainers
    .map((trainer) => text(trainerDisplays[trainer] || trainer))
    .filter(Boolean);
  const clauses = [];
  if (displays.some((display) => display.toLowerCase() === "cwf")) clauses.push("{cwf}=1");
  for (const trainer of activeTrainers.map(text).filter(Boolean)) {
    clauses.push(`{trainer}='${trainer.replace(/'/g, "\\'")}'`);
  }
  if (!clauses.length) return "";
  return clauses.length === 1 ? clauses[0] : `OR(${clauses.join(",")})`;
}

async function getAirtableHorseDisplayConfig(activeTrainers = [], trainerDisplays = {}) {
  if (!AIRTABLE_TOKEN_FALLBACK) {
    return {
      ok: false,
      source: "airtable.horses",
      error: "Missing AIRTABLE_TOKEN fallback",
      horse_displays: {},
      horse_display_meta: {}
    };
  }
  try {
    const formula = activeHorseFormula(activeTrainers, trainerDisplays);
    const displays = {};
    const meta = {};
    const helperRows = [];
    const normalizedHorseRecords = new Map();
    const duplicateHorseGroups = {};
    let offset = "";
    do {
      const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(WEC_AIRTABLE_BASE_ID)}/horses`);
      url.searchParams.set("pageSize", "100");
      if (formula) url.searchParams.set("filterByFormula", formula);
      if (offset) url.searchParams.set("offset", offset);
      const response = await fetch(url, {
        headers: {
          authorization: `Bearer ${AIRTABLE_TOKEN_FALLBACK}`
        }
      });
      if (!response.ok) {
        return {
          ok: false,
          source: "airtable.horses",
          status: response.status,
          error: await response.text(),
          horse_displays: displays,
          horse_display_meta: meta
        };
      }
      const payload = await response.json();
      for (const record of payload.records || []) {
        const fields = record.fields || {};
        const horse = text(fields.horse);
        const display = horseDisplayFromFields(fields);
        if (!horse || !display) continue;
        helperRows.push({
          horse,
          horse_display: display,
          barn_name: text(fields.barn_name),
          aka: text(fields.aka || fields.AKA || fields.alias || fields.aliases),
          trainer: text(fields.trainer),
          rider: text(fields.rider),
          active: boolOrNull(fields.active ?? fields.Active ?? fields.follow ?? fields.Follow) ?? true,
          follow: boolOrNull(fields.follow ?? fields.Follow ?? fields.active ?? fields.Active) ?? true,
          sync_action: text(fields.sync_action || fields.Sync_Action || fields.syncAction),
          rec_id: record.id,
          source: "airtable.horses",
          last_synced_at: catalystDateTime(new Date())
        });
        const horseMeta = {
          barn_name: text(fields.barn_name),
          barn_name_missing: !text(fields.barn_name),
          source: "airtable.horses"
        };
        displays[horse] = display;
        meta[horse] = horseMeta;
        const normalizedHorse = normalizeHorseHelperKey(horse);
        if (normalizedHorse) {
          const current = { id: record.id, horse, display, meta: horseMeta };
          const existing = normalizedHorseRecords.get(normalizedHorse);
          if (existing && existing.id !== record.id) {
            duplicateHorseGroups[normalizedHorse] = [...(duplicateHorseGroups[normalizedHorse] || [existing.horse]), horse];
          } else if (!existing) {
            normalizedHorseRecords.set(normalizedHorse, current);
          }
        }
        for (const alias of splitAliasText(fields.aka || fields.AKA || fields.alias || fields.aliases)) {
          displays[alias] = display;
          meta[alias] = {
            barn_name: text(fields.barn_name),
            barn_name_missing: !text(fields.barn_name),
            source: "airtable.horses.aka",
            horse
          };
          const normalizedAlias = normalizeHorseHelperKey(alias);
          if (normalizedAlias) {
            const current = { id: record.id, horse, display, meta: meta[alias] };
            const existing = normalizedHorseRecords.get(normalizedAlias);
            if (existing && existing.id !== record.id) {
              duplicateHorseGroups[normalizedAlias] = [...(duplicateHorseGroups[normalizedAlias] || [existing.horse]), horse];
            } else if (!existing) {
              normalizedHorseRecords.set(normalizedAlias, current);
            }
          }
        }
      }
      offset = payload.offset || "";
    } while (offset);
    for (const [key, record] of normalizedHorseRecords.entries()) {
      if (duplicateHorseGroups[key]) continue;
      if (!displays[key]) displays[key] = record.display;
      if (!meta[key]) meta[key] = { ...record.meta, source: "airtable.horses.normalized", horse: record.horse };
    }
    return {
      ok: true,
      source: "airtable.horses",
      filter_formula: formula,
      horse_displays: displays,
      horse_display_meta: meta,
      helper_rows: helperRows,
      horse_normalized_key: "trim|lowercase|collapse_spaces|smart_apostrophe_normalized",
      duplicate_horse_groups: duplicateHorseGroups
    };
  } catch (error) {
    return {
      ok: false,
      source: "airtable.horses",
      error: error.message,
      horse_displays: {},
      horse_display_meta: {},
      helper_rows: []
    };
  }
}

function horseHelperDisplaysFromRows(rows = []) {
  const displays = {};
  const meta = {};
  const normalizedHorseRecords = new Map();
  const duplicateHorseGroups = {};
  for (const row of rows || []) {
    const action = text(row.sync_action).toLowerCase();
    if (action === "ignore" || action === "remove" || action === "inactive") continue;
    if (row.active === false || row.follow === false || row.active === "false" || row.follow === "false") continue;
    const horse = text(row.horse);
    const display = text(row.barn_name || row.horse_display || row.horse);
    if (!horse || !display) continue;
    const horseMeta = {
      barn_name: text(row.barn_name),
      barn_name_missing: !text(row.barn_name),
      source: "catalyst.hs_horses",
      rec_id: text(row.rec_id),
      ROWID: text(row.ROWID)
    };
    displays[horse] = display;
    meta[horse] = horseMeta;
    const normalizedHorse = normalizeHorseHelperKey(horse);
    if (normalizedHorse) {
      const current = { id: text(row.ROWID || row.rec_id), horse, display, meta: horseMeta };
      const existing = normalizedHorseRecords.get(normalizedHorse);
      if (existing && existing.id !== current.id) {
        duplicateHorseGroups[normalizedHorse] = [...(duplicateHorseGroups[normalizedHorse] || [existing.horse]), horse];
      } else if (!existing) {
        normalizedHorseRecords.set(normalizedHorse, current);
      }
    }
    for (const alias of splitAliasText(row.aka)) {
      displays[alias] = display;
      meta[alias] = { ...horseMeta, source: "catalyst.hs_horses.aka", horse };
      const normalizedAlias = normalizeHorseHelperKey(alias);
      if (normalizedAlias) {
        const current = { id: text(row.ROWID || row.rec_id), horse, display, meta: meta[alias] };
        const existing = normalizedHorseRecords.get(normalizedAlias);
        if (existing && existing.id !== current.id) {
          duplicateHorseGroups[normalizedAlias] = [...(duplicateHorseGroups[normalizedAlias] || [existing.horse]), horse];
        } else if (!existing) {
          normalizedHorseRecords.set(normalizedAlias, current);
        }
      }
    }
  }
  for (const [key, record] of normalizedHorseRecords.entries()) {
    if (duplicateHorseGroups[key]) continue;
    if (!displays[key]) displays[key] = record.display;
    if (!meta[key]) meta[key] = { ...record.meta, source: "catalyst.hs_horses.normalized", horse: record.horse };
  }
  return { horse_displays: displays, horse_display_meta: meta, duplicate_horse_groups: duplicateHorseGroups };
}

async function getCatalystHorseDisplayConfig(app) {
  try {
    const result = await getPagedRowsFiltered(app, TABLES.horses, () => true, { maxRows: 5000 });
    const mapped = horseHelperDisplaysFromRows(result.rows || []);
    return {
      ok: true,
      source: "catalyst.hs_horses",
      count: Object.keys(mapped.horse_displays || {}).length,
      scanned: result.scanned,
      truncated: result.truncated,
      ...mapped
    };
  } catch (error) {
    return {
      ok: false,
      source: "catalyst.hs_horses",
      error: error.message,
      horse_displays: {},
      horse_display_meta: {}
    };
  }
}

async function syncCatalystHorseHelpersFromAirtable(app, activeTrainers = [], trainerDisplays = {}) {
  const airtableConfig = await getAirtableHorseDisplayConfig(activeTrainers, trainerDisplays);
  const rows = (airtableConfig.helper_rows || []).map(cleanRowForDatastore);
  const result = { rows: rows.length, inserted: 0, updated: 0, skipped: 0 };
  for (const row of rows) {
    const horse = text(row.horse);
    if (!horse) {
      result.skipped += 1;
      continue;
    }
    const write = await upsert(app, TABLES.horses, { horse }, row);
    if (write.action === "insert") result.inserted += 1;
    if (write.action === "update") result.updated += 1;
  }
  const catalystConfig = await getCatalystHorseDisplayConfig(app);
  return {
    ok: airtableConfig.ok && catalystConfig.ok,
    source: "airtable.horses_to_catalyst.hs_horses",
    airtable_source_ok: airtableConfig.ok,
    airtable_filter_formula: airtableConfig.filter_formula || "",
    airtable_horse_rows: rows.length,
    catalyst_upsert: result,
    catalyst_horse_display_count: Object.keys(catalystConfig.horse_displays || {}).length,
    catalyst_source: catalystConfig.source,
    duplicate_horse_groups: catalystConfig.duplicate_horse_groups || airtableConfig.duplicate_horse_groups || {},
    error: airtableConfig.error || catalystConfig.error || ""
  };
}

const HELPER_SYNC_CONFIGS = {
  hs_rings: {
    source_table: "rings",
    catalyst_table: TABLES.rings,
    mirror_table: "hs_rings",
    key_field: "ring_key",
    fallback_key_field: "ring_no",
    mirror_fields: [
      ["ring_key", "singleLineText"],
      ["ring_no", "number"],
      ["ring_name", "singleLineText"],
      ["ring_name_normalized", "singleLineText"],
      ["ring_name_prioritized", "singleLineText"],
      ["ring_name_slugified", "singleLineText"],
      ["ring_aliases", "multilineText"],
      ["active", "checkbox"],
      ["follow", "checkbox"],
      ["sync_action", "singleLineText"],
      ["rec_id", "singleLineText"],
      ["catalyst_ROWID", "singleLineText"],
      ["last_synced_at", "singleLineText"],
      ["sync_error", "multilineText"]
    ]
  },
  hs_horses: {
    source_table: "horses",
    catalyst_table: TABLES.horses,
    mirror_table: "hs_horses",
    key_field: "horse_key",
    fallback_key_field: "horse",
    source_return_fields_by_id: true,
    mirror_fields: [
      ["horse_key", "singleLineText"],
      ["horse_name", "singleLineText"],
      ["barn_name", "singleLineText"],
      ["horse_display", "singleLineText"],
      ["horse_aka", "multilineText"],
      ["rider_name", "singleLineText"],
      ["trainer_name", "singleLineText"],
      ["active", "checkbox"],
      ["follow", "checkbox"],
      ["sync_action", "singleLineText"],
      ["rec_id", "singleLineText"],
      ["catalyst_ROWID", "singleLineText"],
      ["last_synced_at", "singleLineText"],
      ["sync_error", "multilineText"]
    ]
  },
  hs_riders: {
    source_table: "riders",
    catalyst_table: TABLES.riders,
    mirror_table: "hs_riders",
    key_field: "rider_key",
    fallback_key_field: "rider",
    mirror_fields: [
      ["rider_key", "singleLineText"],
      ["rider_name", "singleLineText"],
      ["team_name", "singleLineText"],
      ["first_name", "singleLineText"],
      ["last_name", "singleLineText"],
      ["rider_aliases", "multilineText"],
      ["active", "checkbox"],
      ["follow", "checkbox"],
      ["sync_action", "singleLineText"],
      ["rec_id", "singleLineText"],
      ["catalyst_ROWID", "singleLineText"],
      ["last_synced_at", "singleLineText"],
      ["sync_error", "multilineText"]
    ]
  },
  hs_trainers: {
    source_table: "trainers",
    catalyst_table: TABLES.trainers,
    mirror_table: "hs_trainers",
    key_field: "trainer_key",
    fallback_key_field: "trainer",
    mirror_fields: [
      ["trainer_key", "singleLineText"],
      ["trainer_name", "singleLineText"],
      ["tenant_name", "singleLineText"],
      ["coach_name", "singleLineText"],
      ["first_name", "singleLineText"],
      ["trainer_aliases", "multilineText"],
      ["allowed", "checkbox"],
      ["active", "checkbox"],
      ["follow", "checkbox"],
      ["sync_action", "singleLineText"],
      ["rec_id", "singleLineText"],
      ["catalyst_ROWID", "singleLineText"],
      ["last_synced_at", "singleLineText"],
      ["sync_error", "multilineText"]
    ]
  }
};

function airtableMirrorFieldSpec([name, type]) {
  if (type === "number") return { name, type: "number", options: { precision: 0 } };
  if (type === "checkbox") return { name, type: "checkbox", options: { icon: "check", color: "greenBright" } };
  if (type === "multilineText") return { name, type: "multilineText" };
  return { name, type: "singleLineText" };
}

async function ensureAirtableHelperMirrorTable(config) {
  const tables = await airtableBaseMetadataTables();
  const existing = (tables || []).find((table) => table.name === config.mirror_table);
  if (!existing) {
    const created = await airtableCreateTable(
      config.mirror_table,
      config.mirror_fields.map(airtableMirrorFieldSpec)
    );
    return {
      exists: true,
      created: true,
      table_id: created.id,
      missing_fields: []
    };
  }
  const existingFields = new Set((existing.fields || []).map((field) => field.name));
  return {
    exists: true,
    created: false,
    table_id: existing.id,
    missing_fields: config.mirror_fields.map(([name]) => name).filter((name) => !existingFields.has(name))
  };
}

function sourceValue(fields, names) {
  const source = fields || {};
  const lowerToName = new Map(Object.keys(source).map((key) => [key.toLowerCase(), key]));
  for (const name of names || []) {
    const actualName = Object.prototype.hasOwnProperty.call(source, name)
      ? name
      : lowerToName.get(text(name).toLowerCase());
    if (!actualName) continue;
    return source[actualName];
  }
  return undefined;
}

function sourceField(fields, names) {
  for (const name of names || []) {
    const value = firstValue(sourceValue(fields, [name]));
    const stringValue = text(value);
    if (stringValue) return stringValue;
  }
  return "";
}

function sourceBool(fields, names, defaultValue = true) {
  for (const name of names || []) {
    const value = firstValue(sourceValue(fields, [name]));
    const parsed = boolOrNull(value);
    if (parsed !== null) return parsed;
  }
  return defaultValue;
}

function helperSyncAction(fields) {
  return text(firstValue(sourceValue(fields, ["sync_action", "status"]))).toLowerCase();
}

function helperStatusFromAction(action) {
  if (action === "remove") return "remove_pending";
  if (action === "inactive") return "inactive";
  return "active";
}

function splitPersonName(value) {
  const parts = text(value).split(" ").filter(Boolean);
  return {
    first_name: parts[0] || "",
    last_name: parts.length > 1 ? parts.slice(1).join(" ") : ""
  };
}

function mapAirtableHelperSourceRecord(helperName, record, runTime) {
  const fields = record.fields || {};
  const action = helperSyncAction(fields);
  if (action === "ignore") return null;
  const inactive = action === "remove" || action === "inactive";
  const active = inactive ? false : sourceBool(fields, ["active", "is_active"], true);
  const followDefault = helperName === "hs_rings";
  const follow = inactive ? false : sourceBool(fields, ["follow", "is_follow", "followed"], followDefault);
  const recId = sourceField(fields, ["rec_id"]) || record.id;
  const lastSyncedAt = catalystDateTime(runTime);
  if (helperName === "hs_rings") {
    const ringNo = intValue(sourceField(fields, ["ring_no"]));
    const ringName = sourceField(fields, ["ring_name"]);
    const normalized = visualRingName(sourceField(fields, ["ring_name_normalized"]) || normalizedWecRingName(ringName));
    const slugified = sourceField(fields, ["ring_name_slugified"]) || visualKeyRingToken(normalized || ringName);
    const ringKey = ringVisualKey(ringNo, normalized || ringName) || (ringNo && slugified ? `${ringNo}|${slugified}` : "");
    if (!ringKey) return null;
    return cleanRowForDatastore({
      ring_key: ringKey,
      ring_no: ringNo,
      ring_name: ringName,
      ring_name_normalized: normalized,
      ring_name_prioritized: sourceField(fields, ["ring_name_prioritized"]) || text(prioritizedWecRingName(ringName)),
      ring_name_slugified: slugified,
      ring_aliases: sourceField(fields, ["ring_aliases", "ring_names"]),
      active,
      follow,
      sync_action: action || "add",
      status: helperStatusFromAction(action),
      rec_id: recId,
      last_synced_at: lastSyncedAt
    });
  }
  if (helperName === "hs_horses") {
    const horseName = sourceField(fields, ["horse_name", "horse", "fldP3vOT3rz8ZVEAI"]);
    const horseKey = normalizeHorseHelperKey(horseName);
    if (!horseKey) return null;
    const horseBarnName = sourceField(fields, ["barn_name", "fld9Om5SddBjscPiB", "fldzNriL5HfMjW3y0"]);
    const horseDisplay = sourceField(fields, ["horse_display", "barn_name", "horse", "fldzNriL5HfMjW3y0", "fld9Om5SddBjscPiB", "fldP3vOT3rz8ZVEAI"]);
    const horseFollow = inactive ? false : sourceBool(fields, ["follow", "is_follow", "followed", "fldfQQgftvgL981XT"], followDefault);
    return cleanRowForDatastore({
      horse_key: horseKey,
      horse: horseName,
      horse_name: horseName,
      barn_name: horseBarnName,
      horse_display: horseDisplay,
      aka: sourceField(fields, ["horse_aka", "aka", "fldZXx5m25Va1mj9X"]),
      horse_aka: sourceField(fields, ["horse_aka", "aka", "fldZXx5m25Va1mj9X"]),
      rider: sourceField(fields, ["rider_name", "rider"]),
      rider_name: sourceField(fields, ["rider_name", "rider"]),
      trainer: sourceField(fields, ["trainer_name", "trainer"]),
      trainer_name: sourceField(fields, ["trainer_name", "trainer"]),
      active,
      follow: horseFollow,
      sync_action: action || "add",
      status: helperStatusFromAction(action),
      rec_id: recId,
      last_synced_at: lastSyncedAt
    });
  }
  if (helperName === "hs_riders") {
    const riderName = sourceField(fields, ["rider_name", "rider"]);
    const riderKey = normalizeHelperKey(riderName);
    if (!riderKey) return null;
    const names = splitPersonName(riderName);
    return cleanRowForDatastore({
      rider_key: riderKey,
      rider: riderName,
      rider_name: riderName,
      team_name: sourceField(fields, ["team_name", "rider_display"]) || names.first_name,
      first_name: sourceField(fields, ["first_name"]) || names.first_name,
      last_name: sourceField(fields, ["last_name"]) || names.last_name,
      rider_aliases: sourceField(fields, ["rider_aliases", "tag"]),
      active,
      follow,
      sync_action: action || "add",
      status: helperStatusFromAction(action),
      rec_id: recId,
      last_synced_at: lastSyncedAt
    });
  }
  if (helperName === "hs_trainers") {
    const trainerName = sourceField(fields, ["trainer_name", "trainer"]);
    const trainerKey = normalizeTrainerKey(trainerName);
    if (!trainerKey) return null;
    const names = splitPersonName(trainerName);
    const display = sourceField(fields, ["coach_name", "tenant_name", "trainer_display"]);
    return cleanRowForDatastore({
      trainer_key: trainerKey,
      trainer: trainerName,
      trainer_name: trainerName,
      tenant_name: sourceField(fields, ["tenant_name", "trainer_display"]) || display,
      coach_name: sourceField(fields, ["coach_name", "trainer_display"]) || display,
      first_name: sourceField(fields, ["first_name"]) || names.first_name,
      trainer_aliases: sourceField(fields, ["trainer_aliases", "tag"]),
      allowed: inactive ? false : sourceBool(fields, ["allowed"], false),
      active,
      follow,
      sync_action: action || "add",
      status: helperStatusFromAction(action),
      rec_id: recId,
      last_synced_at: lastSyncedAt
    });
  }
  return null;
}

async function upsertCatalystHelperRows(app, config, rows) {
  const table = app.datastore().table(config.catalyst_table);
  const result = { rows: rows.length, inserted: 0, updated: 0, skipped: 0, errors: [] };
  const syncedRows = [];
  for (const row of rows) {
    const key = text(row[config.key_field]);
    if (!key) {
      result.skipped += 1;
      continue;
    }
    try {
      let existing = await findOne(app, config.catalyst_table, { [config.key_field]: key });
      if (!existing?.ROWID && config.fallback_key_field && row[config.fallback_key_field]) {
        existing = await findOne(app, config.catalyst_table, { [config.fallback_key_field]: row[config.fallback_key_field] });
      }
      if (existing?.ROWID) {
        const mutable = { ...row };
        await table.updateRow({ ...mutable, ROWID: existing.ROWID });
        result.updated += 1;
        syncedRows.push({ ...row, ROWID: existing.ROWID, sync_error: "" });
      } else {
        const inserted = await table.insertRow(row);
        result.inserted += 1;
        syncedRows.push({ ...row, ROWID: inserted.ROWID, sync_error: "" });
      }
    } catch (error) {
      result.skipped += 1;
      const message = String(error?.message || error).slice(0, 1000);
      result.errors.push({ key, error: message });
      syncedRows.push({ ...row, sync_error: message });
    }
  }
  return { ...result, synced_rows: syncedRows };
}

function mapCatalystHelperRowToAirtable(config, row) {
  const fields = {};
  for (const [fieldName] of config.mirror_fields) {
    if (fieldName === "catalyst_ROWID") fields[fieldName] = text(row.ROWID);
    else if (fieldName in row) fields[fieldName] = row[fieldName];
  }
  return fields;
}

async function syncOneHelperTable(app, helperName, runTime, { offset = 0, limit = 25, recordIds = [] } = {}) {
  const config = HELPER_SYNC_CONFIGS[helperName];
  const mirrorStatus = await ensureAirtableHelperMirrorTable(config);
  if (mirrorStatus.missing_fields.length) {
    return {
      helper: helperName,
      ok: false,
      blocker: "airtable_helper_mirror_missing_fields",
      table_status: mirrorStatus,
      source_rows: 0,
      catalyst_rows: 0,
      airtable_mirror_rows: 0
    };
  }
  const targetRecordIds = [...new Set((recordIds || []).map(text).filter(Boolean))];
  const returnFieldsByFieldId = config.source_return_fields_by_id === true;
  const sourceWindow = targetRecordIds.length
    ? {
        records: await airtableListRecords(config.source_table, {
          filterByFormula: airtableRecordIdFormula(targetRecordIds),
          returnFieldsByFieldId
        }),
        offset: 0,
        limit: targetRecordIds.length,
        processed_records: targetRecordIds.length,
        next_offset: null,
        has_more: false,
        source_records_total: targetRecordIds.length,
        source_records_total_is_exact: true,
        targeted_record_ids: targetRecordIds
      }
    : await airtableListRecordsWindow(config.source_table, { offset, limit, returnFieldsByFieldId });
  const sourceRecords = sourceWindow.records;
  const sourceRows = sourceRecords
    .map((record) => mapAirtableHelperSourceRecord(helperName, record, runTime))
    .filter(Boolean);
  const catalystResult = await upsertCatalystHelperRows(app, config, sourceRows);
  const mirrorRows = catalystResult.synced_rows.map((row) => mapCatalystHelperRowToAirtable(config, row));
  const mirrorUpserts = await airtableUpsertByFieldId(config.mirror_table, config.key_field, mirrorRows);
  return {
    helper: helperName,
    ok: catalystResult.errors.length === 0,
    blocker: catalystResult.errors.length ? "catalyst_helper_upsert_errors" : "",
    source_table: config.source_table,
    catalyst_table: config.catalyst_table,
    mirror_table: config.mirror_table,
    table_status: mirrorStatus,
    offset: sourceWindow.offset,
    limit: sourceWindow.limit,
    targeted_record_ids: sourceWindow.targeted_record_ids || [],
    processed_records: sourceWindow.processed_records,
    next_offset: sourceWindow.next_offset,
    has_more: sourceWindow.has_more,
    source_records_total: sourceWindow.source_records_total,
    source_records_total_is_exact: sourceWindow.source_records_total_is_exact,
    source_records: sourceRecords.length,
    source_rows: sourceRows.length,
    catalyst_rows: catalystResult.rows,
    catalyst_inserted: catalystResult.inserted,
    catalyst_updated: catalystResult.updated,
    catalyst_skipped: catalystResult.skipped,
    catalyst_errors: catalystResult.errors,
    airtable_mirror_rows: mirrorRows.length,
    airtable_mirror_upserts: mirrorUpserts.length
  };
}

async function runWecSyncHelpers(app, action, { helper = "all", offset = 0, limit = 25, recordIds = [] } = {}) {
  const runTime = new Date().toISOString();
  const helpers = {};
  let blocker = "";
  const validHelpers = ["hs_rings", "hs_horses", "hs_riders", "hs_trainers"];
  const requestedHelper = text(helper || "all");
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
  const helperNames = requestedHelper === "all" ? validHelpers : [requestedHelper];
  const invalidHelpers = helperNames.filter((name) => !validHelpers.includes(name));
  if (invalidHelpers.length) {
    blocker = `invalid_helper:${invalidHelpers.join(",")}`;
  }
  for (const helperName of blocker ? [] : helperNames) {
    const result = await syncOneHelperTable(app, helperName, runTime, {
      offset: safeOffset,
      limit: safeLimit,
      recordIds
    });
    helpers[helperName] = result;
    if (!blocker && !result.ok) blocker = `${helperName}:${result.blocker || "sync_failed"}`;
  }
  return {
    ok: !blocker,
    status_code: blocker ? 500 : 200,
    action,
    blocker,
    run_time: runTime,
    requested_helper: requestedHelper,
    offset: safeOffset,
    limit: safeLimit,
    targeted_record_ids: [...new Set((recordIds || []).map(text).filter(Boolean))],
    helper_sync_run: true,
    step1_run: false,
    step2_run: false,
    step3_run: false,
    step4_run: false,
    step5_run: false,
    step6_run: false,
    get_orders_run: false,
    get_rings_run: false,
    get_results_run: false,
    alerts_run: false,
    output_run: false,
    helpers
  };
}

const HELPER_SEARCH_CONFIGS = {
  horses: {
    table: TABLES.horses,
    entity_type: "horse",
    key_field: "horse_key",
    display_fields: ["barn_name", "horse_display", "horse_name", "horse"],
    primary_search_fields: ["horse_name", "horse", "barn_name", "horse_display", "horse_aka", "aka"],
    searchable_fields: [
      "horse_name",
      "horse",
      "barn_name",
      "horse_display",
      "horse_aka",
      "aka"
    ],
    scope_field: "follow"
  },
  riders: {
    table: TABLES.riders,
    entity_type: "rider",
    key_field: "rider_key",
    display_fields: ["team_name", "rider_name", "rider"],
    primary_search_fields: ["rider_name", "rider", "team_name", "first_name", "last_name", "rider_aliases"],
    searchable_fields: [
      "rider_name",
      "rider",
      "team_name",
      "first_name",
      "last_name",
      "rider_aliases"
    ],
    scope_field: "follow"
  },
  trainers: {
    table: TABLES.trainers,
    entity_type: "trainer",
    key_field: "trainer_key",
    display_fields: ["coach_name", "tenant_name", "trainer_name", "trainer"],
    primary_search_fields: ["trainer_name", "trainer", "tenant_name", "coach_name", "first_name", "trainer_aliases"],
    searchable_fields: [
      "trainer_name",
      "trainer",
      "tenant_name",
      "coach_name",
      "first_name",
      "trainer_aliases"
    ],
    scope_field: "allowed"
  }
};

function helperSearchMode(value) {
  const mode = text(value || "catalyst").toLowerCase();
  if (["scan", "datastore", "debug_scan"].includes(mode)) return "scan";
  return "catalyst";
}

function helperSearchColumnMap(configs = []) {
  const map = {};
  for (const config of configs || []) {
    if (!config?.table) continue;
    map[config.table] = [...new Set(config.searchable_fields || [])];
  }
  return map;
}

function unwrapCatalystSearchRow(table, value) {
  if (!value) return null;
  if (value[table] && typeof value[table] === "object") return value[table];
  if (value.data && value.data[table] && typeof value.data[table] === "object") return value.data[table];
  if (value.content && value.content[table] && typeof value.content[table] === "object") return value.content[table];
  return value;
}

function normalizeCatalystSearchGroups(raw, configs = []) {
  const tables = new Set((configs || []).map((config) => config.table).filter(Boolean));
  const groups = Object.fromEntries([...tables].map((table) => [table, []]));
  const visited = new Set();

  function addRow(table, row) {
    const unwrapped = unwrapCatalystSearchRow(table, row);
    if (!unwrapped || typeof unwrapped !== "object") return;
    const key = `${table}|${text(unwrapped.ROWID) || JSON.stringify(unwrapped).slice(0, 500)}`;
    if (visited.has(key)) return;
    visited.add(key);
    groups[table].push(unwrapped);
  }

  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== "object") return;
    for (const table of tables) {
      const direct = node[table];
      if (Array.isArray(direct)) {
        for (const item of direct) addRow(table, item);
      } else if (direct && typeof direct === "object") {
        addRow(table, direct);
      }
    }
    for (const key of ["content", "data", "results", "search_result", "searchResult", "details"]) {
      if (node[key] && node[key] !== node) walk(node[key]);
    }
    if (text(node.table_name) && tables.has(text(node.table_name))) addRow(text(node.table_name), node);
    if (text(node.table) && tables.has(text(node.table))) addRow(text(node.table), node);
  }

  walk(raw);
  return groups;
}

async function runCatalystHelperSearch(app, configs, q, limit) {
  if (!app?.search) {
    const error = new Error("Catalyst Search SDK is unavailable in this runtime");
    error.blocker = "catalyst_search_sdk_unavailable";
    throw error;
  }
  const search = app.search();
  if (!search?.executeSearchQuery) {
    const error = new Error("Catalyst executeSearchQuery is unavailable in this runtime");
    error.blocker = "catalyst_search_sdk_unavailable";
    throw error;
  }
  const searchText = text(q).endsWith("*") ? text(q) : `${text(q)}*`;
  const searchTableColumns = helperSearchColumnMap(configs);
  const raw = await search.executeSearchQuery({
    search: searchText,
    search_table_columns: searchTableColumns
  });
  const rawGroups = normalizeCatalystSearchGroups(raw, configs);
  const groups = {};
  const allMatches = [];
  for (const config of configs) {
    const rows = rawGroups[config.table] || [];
    const matches = helperSearchRankedMatches(config, rows, q, limit);
    groups[config.entity_type] = {
      table: config.table,
      search_indexed: true,
      scanned: false,
      returned: rows.length,
      count: matches.length,
      matches
    };
    allMatches.push(...matches);
  }
  return {
    source: "catalyst.search",
    search: searchText,
    search_table_columns: searchTableColumns,
    groups,
    allMatches
  };
}

async function runScanHelperSearch(app, configs, q, limit) {
  const groups = {};
  const allMatches = [];
  for (const config of configs) {
    const page = await getPagedRowsFiltered(app, config.table, () => true, { maxRows: 5000 });
    const searchRows = config.table === TABLES.horses
      ? await mergeAirtableHelperRowsForSearch(page.rows || [])
      : (page.rows || []);
    const matches = helperSearchRankedMatches(config, searchRows, q, limit);
    groups[config.entity_type] = {
      table: config.table,
      search_indexed: false,
      scanned: page.scanned,
      truncated: page.truncated,
      count: matches.length,
      matches
    };
    allMatches.push(...matches);
  }
  return {
    source: "catalyst.datastore_scan",
    groups,
    allMatches
  };
}

async function mergeAirtableHelperRowsForSearch(catalystRows = []) {
  const rowsByKey = new Map();
  for (const row of catalystRows || []) {
    const key = text(row.horse_key || row.horse || row.horse_name || row.ROWID);
    if (key) rowsByKey.set(key, row);
  }
  try {
    const records = await airtableListRecords(TABLES.horses);
    for (const record of records || []) {
      const fields = record.fields || {};
      const key = text(fields.horse_key || fields.horse || fields.horse_name || record.id);
      if (!key) continue;
      rowsByKey.set(key, {
        ...(rowsByKey.get(key) || {}),
        ...fields,
        rec_id: text(fields.rec_id || record.id),
        helper_source: "airtable.hs_horses"
      });
    }
  } catch {
    // Helper search must still work from Catalyst if the Airtable mirror is unavailable.
  }
  return [...rowsByKey.values()];
}

function helperSearchLooseKey(value) {
  return normalizeHelperKey(value).replace(/[^a-z0-9]+/g, "");
}

function helperSearchValues(row = {}, fields = []) {
  const values = [];
  for (const field of fields || []) {
    const raw = text(row[field]);
    if (!raw) continue;
    values.push({ field, value: raw });
    for (const alias of splitAliasText(raw)) {
      if (alias && alias !== raw) values.push({ field, value: alias });
    }
  }
  return values;
}

function helperSearchScore(query, value) {
  const q = normalizeHelperKey(query);
  const v = normalizeHelperKey(value);
  if (!q || !v) return null;
  const qLoose = helperSearchLooseKey(q);
  const vLoose = helperSearchLooseKey(v);
  if (v === q) return { score: 100, match_type: "exact" };
  if (vLoose && qLoose && vLoose === qLoose) return { score: 95, match_type: "exact_loose" };
  if (v.startsWith(q)) return { score: 90, match_type: "prefix" };
  if (v.startsWith(`${q} `) || v.startsWith(`${q}-`) || v.startsWith(`${q}'`)) return { score: 85, match_type: "prefix" };
  if (v.includes(` ${q} `) || v.endsWith(` ${q}`) || v.includes(` ${q}-`)) return { score: 75, match_type: "word_contains" };
  if (v.includes(q)) return { score: 60, match_type: "contains" };
  if (vLoose && qLoose && vLoose.includes(qLoose)) return { score: 55, match_type: "contains_loose" };
  return null;
}

function helperSearchFieldBoost(config, field) {
  if (config.entity_type === "horse" && field === "barn_name") return 70;
  if (config.entity_type === "horse" && field === "horse_display") return 50;
  if ((config.primary_search_fields || []).includes(field)) return 30;
  if ((config.display_fields || []).includes(field)) return 20;
  return 0;
}

function mergeHelperSearchResults(primary, secondary, limit) {
  const groups = { ...(primary.groups || {}) };
  const byKey = new Map();
  for (const match of [...(primary.allMatches || []), ...(secondary.allMatches || [])]) {
    const key = `${match.entity_type}|${match.ROWID || match.helper_key || match.display_name}`;
    const existing = byKey.get(key);
    if (!existing || match.score > existing.score) byKey.set(key, match);
  }
  const allMatches = [...byKey.values()]
    .sort((a, b) => b.score - a.score || a.display_name.localeCompare(b.display_name))
    .slice(0, limit);
  for (const [entityType, group] of Object.entries(secondary.groups || {})) {
    const existing = groups[entityType] || {};
    const mergedMatches = [...new Map([
      ...((existing.matches || []).map((match) => [`${match.ROWID || match.helper_key || match.display_name}`, match])),
      ...((group.matches || []).map((match) => [`${match.ROWID || match.helper_key || match.display_name}`, match]))
    ]).values()]
      .sort((a, b) => b.score - a.score || a.display_name.localeCompare(b.display_name))
      .slice(0, limit);
    groups[entityType] = {
      ...existing,
      count: mergedMatches.length,
      matches: mergedMatches,
      scan_merged: true
    };
  }
  return {
    ...primary,
    source: "catalyst.search_plus_helper_scan",
    warning: primary.warning || "helper_scan_merged_for_barn_name_completeness",
    groups,
    allMatches
  };
}

function helperSearchRankedMatches(config, rows = [], q, limit) {
  const matches = (rows || [])
    .map((row) => helperSearchRow(config, row, q))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.display_name.localeCompare(b.display_name));
  const strongMatches = matches.filter((match) => ["exact", "exact_loose", "prefix"].includes(match.match_type));
  return (strongMatches.length ? strongMatches : matches).slice(0, limit);
}

function helperSearchRow(config, row, query) {
  let best = null;
  for (const candidate of helperSearchValues(row, config.searchable_fields)) {
    const scored = helperSearchScore(query, candidate.value);
    if (!scored) continue;
    const match = {
      ...scored,
      base_score: scored.score,
      score: scored.score + helperSearchFieldBoost(config, candidate.field),
      matched_field: candidate.field,
      matched_value: candidate.value
    };
    if (!best || match.score > best.score) best = match;
  }
  if (!best) return null;
  const action = text(row.sync_action).toLowerCase();
  const status = text(row.status).toLowerCase();
  const active = boolOrNull(row.active);
  const follow = boolOrNull(row.follow);
  const allowed = boolOrNull(row.allowed);
  const scopeValue = config.scope_field === "allowed" ? allowed : follow;
  const blockedByAction = action === "ignore" || action === "remove" || action === "inactive";
  const blockedByStatus = status === "ignore" || status === "remove" || status === "inactive";
  const eligibleForStep3 = !blockedByAction && !blockedByStatus && active !== false && scopeValue === true;
  return {
    entity_type: config.entity_type,
    helper_key: text(row[config.key_field]),
    display_name: sourceField(row, config.display_fields),
    ...best,
    active,
    follow,
    allowed,
    status: status || "active",
    sync_action: action || "add",
    eligible_for_step3: eligibleForStep3,
    rec_id: text(row.rec_id),
    ROWID: text(row.ROWID),
    fields: Object.fromEntries(
      [...new Set([...config.display_fields, ...config.searchable_fields, config.scope_field, "active", "status", "sync_action"])]
        .map((field) => [field, row[field]])
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
    )
  };
}

function helperSearchRuntimeTerms(match = {}) {
  return [...new Set([
    match.helper_key,
    match.display_name,
    match.matched_value,
    match.fields?.horse_name,
    match.fields?.horse,
    match.fields?.barn_name,
    match.fields?.horse_display,
    match.fields?.rider_name,
    match.fields?.rider,
    match.fields?.team_name,
    match.fields?.trainer_name,
    match.fields?.trainer,
    match.fields?.tenant_name,
    match.fields?.coach_name
  ].map(normalizeHelperKey).filter(Boolean))];
}

function helperSearchRuntimeRowMatches(match = {}, row = {}) {
  const terms = helperSearchRuntimeTerms(match);
  if (!terms.length) return false;
  const entityType = text(match.entity_type);
  const values = [];
  if (entityType === "horse") values.push(row.horse, row.current_horse);
  else if (entityType === "rider") values.push(row.rider);
  else if (entityType === "trainer") values.push(row.trainer);
  else values.push(row.horse, row.current_horse, row.rider, row.trainer);
  const rowKeys = values.map(normalizeHelperKey).filter(Boolean);
  return rowKeys.some((key) => terms.includes(key));
}

function hydrateHelperSearchMatchFromRows(match = {}, { showNo = "", focusDay = "", classOogRows = [], entryGoRows = [], classStartRows = [] } = {}) {
  const classStartByVisual = new Map();
  const classStartByNo = new Map();
  for (const row of classStartRows || []) {
    const classVisual = text(row.class_visual_key || row.class_start_key);
    if (classVisual && !classStartByVisual.has(classVisual)) classStartByVisual.set(classVisual, row);
    const classNo = text(row.class_no);
    if (classNo && !classStartByNo.has(classNo)) classStartByNo.set(classNo, row);
  }
  const appearancesByKey = new Map();
  function addAppearance(sourceTable, row) {
    if (!helperSearchRuntimeRowMatches(match, row)) return;
    const classVisual = text(row.class_visual_key);
    const classStart = (classVisual && classStartByVisual.get(classVisual)) || classStartByNo.get(text(row.class_no)) || {};
    const key = [
      text(row.entry_visual_key || row.class_oog_key || row.entry_go_key),
      text(row.class_no),
      text(row.entry_no)
    ].join("|");
    const previous = appearancesByKey.get(key) || {};
    const sourceTables = [...new Set([...(previous.source_tables || []), sourceTable].filter(Boolean))];
    appearancesByKey.set(key, {
      ...previous,
      source_table: sourceTable,
      source_tables: sourceTables,
      show_no: text(row.show_no || showNo),
      focus_day: dateKey(row.focus_day || focusDay),
      ring_name_normalized: text(row.ring_name_normalized || classStart.ring_name_normalized),
      ring_visual_key: text(row.ring_visual_key || classStart.ring_visual_key),
      class_visual_key: text(row.class_visual_key || classStart.class_visual_key),
      entry_visual_key: text(row.entry_visual_key),
      class_no: intValue(row.class_no),
      class_name: text(row.class_name || classStart.class_name),
      class_start_time: text(classStart.class_start_time),
      display_time: text(classStart.display_time) || displayTimeFromStart(classStart.class_start_time),
      entry_no: intValue(row.entry_no),
      entry_order: intValue(row.entry_order),
      horse: text(row.horse || row.current_horse),
      rider: text(row.rider),
      trainer: text(row.trainer),
      go_time: text(row.go_time || previous.go_time),
      live_source: text(row.live_source || previous.live_source)
    });
  }
  for (const row of classOogRows || []) addAppearance(TABLES.classOog, row);
  for (const row of entryGoRows || []) addAppearance(TABLES.entryGoTimes, row);
  const appearances = [...appearancesByKey.values()]
    .sort((a, b) => String(a.class_start_time || "99:99:99").localeCompare(String(b.class_start_time || "99:99:99")) || Number(a.entry_order || 0) - Number(b.entry_order || 0));
  return {
    show_no: text(showNo),
    focus_day: dateKey(focusDay),
    entity_type: match.entity_type,
    entity_key: match.helper_key,
    entity_name: match.fields?.horse_name || match.fields?.rider_name || match.fields?.trainer_name || match.display_name,
    display_name: match.display_name,
    current_mapping_status: appearances.length ? "mapped_current_focus" : "known_entity_missing_from_current_mapping",
    current_day_appearance_count: appearances.length,
    appearances
  };
}

async function hydrateHelperSearchMatches(app, matches = [], { showNo = "", focusDay = "" } = {}) {
  const safeShowNo = text(showNo);
  const safeFocusDay = dateKey(focusDay);
  if (!safeShowNo || !safeFocusDay || !matches.length) {
    return {
      ok: false,
      skipped: true,
      reason: "missing_show_focus_or_matches",
      show_no: safeShowNo,
      focus_day: safeFocusDay,
      results: []
    };
  }
  const currentFocusFilter = (row) => text(row.show_no) === safeShowNo && dateKey(row.focus_day) === safeFocusDay;
  const [classOogPage, entryGoPage, classStartPage] = await Promise.all([
    getPagedRowsFiltered(app, TABLES.classOog, currentFocusFilter, { maxRows: 10000 }),
    getPagedRowsFiltered(app, TABLES.entryGoTimes, currentFocusFilter, { maxRows: 10000 }),
    getPagedRowsFiltered(app, TABLES.classStartTimes, currentFocusFilter, { maxRows: 10000 })
  ]);
  return {
    ok: true,
    skipped: false,
    show_no: safeShowNo,
    focus_day: safeFocusDay,
    source_counts: {
      hs_class_oog: classOogPage.rows.length,
      hs_entry_go_times: entryGoPage.rows.length,
      hs_class_start_times: classStartPage.rows.length
    },
    results: matches.map((match) => hydrateHelperSearchMatchFromRows(match, {
      showNo: safeShowNo,
      focusDay: safeFocusDay,
      classOogRows: classOogPage.rows,
      entryGoRows: entryGoPage.rows,
      classStartRows: classStartPage.rows
    }))
  };
}

async function hydrateBarnEntrySearchMatches(app, matches = [], { showNo = "", focusDay = "" } = {}) {
  const safeShowNo = text(showNo);
  const safeFocusDay = dateKey(focusDay);
  if (!safeShowNo || !safeFocusDay || !matches.length) {
    return {
      ok: false,
      skipped: true,
      hydrate_scope: "barn_entry",
      reason: "missing_show_focus_or_matches",
      show_no: safeShowNo,
      focus_day: safeFocusDay,
      results: []
    };
  }

  const classOogPage = await getRowsByShowFocusZcql(app, TABLES.classOog, safeShowNo, safeFocusDay, { limit: 10000 });
  const classOogRowsByMatchIndex = matches.map(() => []);
  const wantedClassVisualKeys = new Set();
  const wantedClassNos = new Set();

  for (const row of classOogPage.rows || []) {
    matches.forEach((match, index) => {
      if (!helperSearchRuntimeRowMatches(match, row)) return;
      classOogRowsByMatchIndex[index].push(row);
      const classVisual = text(row.class_visual_key);
      const classNo = text(row.class_no);
      if (classVisual) wantedClassVisualKeys.add(classVisual);
      if (classNo) wantedClassNos.add(classNo);
    });
  }

  let classStartPage = { rows: [], scanned: 0, truncated: false };
  let classStartRows = [];
  if (wantedClassVisualKeys.size || wantedClassNos.size) {
    classStartPage = await getRowsByShowFocusZcql(app, TABLES.classStartTimes, safeShowNo, safeFocusDay, { limit: 2000 });
    classStartRows = (classStartPage.rows || []).filter((row) => {
      const classVisual = text(row.class_visual_key || row.class_start_key);
      const classNo = text(row.class_no);
      return (classVisual && wantedClassVisualKeys.has(classVisual)) || (classNo && wantedClassNos.has(classNo));
    });
  }

  return {
    ok: true,
    skipped: false,
    hydrate_scope: "barn_entry",
    show_no: safeShowNo,
    focus_day: safeFocusDay,
    source_counts: {
      hs_class_oog: classOogPage.rows.length,
      hs_class_oog_matched: classOogRowsByMatchIndex.reduce((sum, rows) => sum + rows.length, 0),
      hs_class_start_times: classStartRows.length
    },
    source_scanned: {
      hs_class_oog: classOogPage.scanned,
      hs_class_start_times: classStartPage.scanned
    },
    results: matches.map((match, index) => hydrateHelperSearchMatchFromRows(match, {
      showNo: safeShowNo,
      focusDay: safeFocusDay,
      classOogRows: classOogRowsByMatchIndex[index],
      entryGoRows: [],
      classStartRows
    }))
  };
}

async function runWecHelperSearch(app, action, query, body) {
  const q = text(query.get("q") || query.get("query") || body.q || body.query);
  const requestedType = text(query.get("type") || body.type || "all").toLowerCase();
  const limit = Math.max(1, Math.min(Number(query.get("limit") || body.limit || 10) || 10, 50));
  const hydrate = text(query.get("hydrate") || body.hydrate || "1") !== "0";
  const hydrateScope = text(query.get("hydrate_scope") || body.hydrate_scope || "full").toLowerCase();
  const searchMode = helperSearchMode(query.get("search_mode") || query.get("mode") || body.search_mode || body.mode);
  const fallbackScan = text(query.get("fallback_scan") || body.fallback_scan || "0") === "1";
  if (!q) {
    return {
      ok: false,
      status_code: 400,
      action,
      blocker: "query_required",
      read_only: true
    };
  }
  const configs = requestedType === "all"
    ? Object.values(HELPER_SEARCH_CONFIGS)
    : [HELPER_SEARCH_CONFIGS[requestedType]].filter(Boolean);
  if (!configs.length) {
    return {
      ok: false,
      status_code: 400,
      action,
      blocker: `invalid_type:${requestedType}`,
      valid_types: ["all", ...Object.keys(HELPER_SEARCH_CONFIGS)],
      read_only: true
    };
  }
  let searchResult;
  try {
    searchResult = searchMode === "scan"
      ? await runScanHelperSearch(app, configs, q, limit)
      : await runCatalystHelperSearch(app, configs, q, limit);
    if (searchMode === "catalyst" && configs.some((config) => config.entity_type === "horse")) {
      const scanResult = await runScanHelperSearch(app, configs, q, limit);
      searchResult = mergeHelperSearchResults(searchResult, scanResult, limit);
    }
    if (searchMode === "catalyst" && !(searchResult.allMatches || []).length) {
      const scanResult = await runScanHelperSearch(app, configs, q, limit);
      if ((scanResult.allMatches || []).length) {
        searchResult = {
          ...scanResult,
          source: "catalyst.search_zero_fallback_scan",
          warning: "catalyst_search_returned_zero_but_datastore_found_matches"
        };
      }
    }
  } catch (error) {
    if (fallbackScan) {
      searchResult = await runScanHelperSearch(app, configs, q, limit);
      searchResult.warning = `catalyst_search_failed_fallback_scan:${error.blocker || error.message}`;
    } else {
      return {
        ok: false,
        status_code: 503,
        action,
        blocker: error.blocker || "catalyst_search_unavailable_or_index_missing",
        error: String(error?.message || error),
        search_mode: "catalyst",
        fallback_scan_available: true,
        fallback_scan_param: "fallback_scan=1",
        required_search_table_columns: helperSearchColumnMap(configs),
        read_only: true,
        step1_run: false,
        step2_run: false,
        step3_run: false,
        step4_run: false,
        step5_run: false,
        step6_run: false,
        get_orders_run: false,
        get_rings_run: false,
        get_results_run: false,
        alerts_run: false,
        output_run: false
      };
    }
  }
  const groups = searchResult.groups || {};
  const allMatches = searchResult.allMatches || [];
  allMatches.sort((a, b) => b.score - a.score || a.entity_type.localeCompare(b.entity_type));
  let hydration = { skipped: true, reason: "hydrate_disabled", results: [] };
  if (hydrate && allMatches.length) {
    const requestedShowNo = text(query.get("show_no") || body.show_no);
    const requestedFocusDay = dateKey(query.get("focus_day") || body.focus_day);
    let activeFocus = null;
    if (!requestedShowNo || !requestedFocusDay) {
      const resolved = await getActiveAirtableFocusShowStrict();
      if (resolved.ok) activeFocus = resolved;
    }
    const hydrateFn = hydrateScope === "barn_entry" ? hydrateBarnEntrySearchMatches : hydrateHelperSearchMatches;
    hydration = await hydrateFn(app, allMatches.slice(0, limit), {
      showNo: requestedShowNo || activeFocus?.show_no,
      focusDay: requestedFocusDay || activeFocus?.focus_day
    });
    if (activeFocus) {
      hydration.focus_source = activeFocus.source;
      hydration.focus_show_record_id = activeFocus.focus_show_record_id;
    }
  }
  return {
    ok: true,
    status_code: 200,
    action,
    query: q,
    normalized_query: normalizeHelperKey(q),
    loose_query: helperSearchLooseKey(q),
    type: requestedType,
    search_mode: searchMode,
    read_only: true,
    source: searchResult.source,
    search_table_columns: searchResult.search_table_columns,
    warning: searchResult.warning,
    top_matches: allMatches.slice(0, limit),
    hydration,
    groups,
    step1_run: false,
    step2_run: false,
    step3_run: false,
    step4_run: false,
    step5_run: false,
    step6_run: false,
    get_orders_run: false,
    get_rings_run: false,
    get_results_run: false,
    alerts_run: false,
    output_run: false
  };
}

function minutesUntil(now, focusDay, timeValue) {
  if (!timeValue) return null;
  const iso = `${focusDay}T${timeValue.length === 5 ? `${timeValue}:00` : timeValue}-04:00`;
  const target = new Date(iso);
  const diff = Math.round((target.getTime() - now.getTime()) / 60000);
  return Number.isFinite(diff) ? diff : null;
}

async function writeTimeTriggers(app, showNo, focusDay, rows, now = new Date()) {
  const table = app.datastore().table(TABLES.timeTriggers);
  const created = [];
  for (const row of rows) {
    for (const threshold of [60, 30]) {
      const diff = minutesUntil(now, focusDay, row.class_start_time);
      if (diff === null || diff > threshold || diff < 0) continue;
      const trigger_key = `${showNo}|${focusDay}|class_start|${row.class_no}|${threshold}`;
      const existing = await findOne(app, TABLES.timeTriggers, { trigger_key });
      if (existing?.ROWID) continue;
      const inserted = await table.insertRow({
        trigger_key,
        show_no: showNo,
        focus_day: focusDay,
        trigger_type: "class_start",
        threshold_minutes: threshold,
        class_no: row.class_no,
        ring_day_no: row.ring_day_no,
        ring_name: row.ring_name,
        display_time: row.start_display,
        status: "pending"
      });
      created.push(inserted);
    }
  }
  return created;
}

async function ensureDay(app, showRow, showNo, dayLabel) {
  const result = await upsert(app, TABLES.days, { show_no: showNo, day_label: dayLabel }, {
    show_ref: showRow.ROWID,
    show_no: showNo,
    day_label: dayLabel,
    source_key: `${showNo}|${dayLabel}`
  });
  return result.row;
}

async function ensureRing(app, showRow, dayRow, row) {
  const result = await upsert(app, TABLES.rings, {
    show_no: row.show_no,
    ring_day_no: row.ring_day_no,
    ring_no: row.ring_no
  }, {
    show_ref: showRow.ROWID,
    day_ref: dayRow.ROWID,
    show_no: row.show_no,
    ring_no: row.ring_no,
    ring_day_no: row.ring_day_no,
    ring_name: row.ring_name,
    day_label: row.day_label,
    raw_json: row.raw_json
  });
  return result.row;
}

async function ensureClass(app, showRow, ringRow, row) {
  const where = row.class_no
    ? { show_no: row.show_no, class_no: row.class_no }
    : { show_no: row.show_no, class_label: row.class_label };
  const result = await upsert(app, TABLES.classes, {
    ...where
  }, {
    show_ref: showRow.ROWID,
    ring_ref: ringRow?.ROWID || null,
    show_no: row.show_no,
    class_no: row.class_no,
    class_label: row.class_label,
    class_name: row.class_name,
    entry_count: row.entry_count,
    source_endpoint: row.source_endpoint || "get_rings.php",
    raw_json: row.raw_json
  });
  return result.row;
}

async function ensureClassTime(app, showRow, dayRow, ringRow, classRow, row) {
  const where = row.class_no
    ? { show_no: row.show_no, ring_day_no: row.ring_day_no, class_no: row.class_no }
    : { show_no: row.show_no, ring_day_no: row.ring_day_no, class_label: row.class_label };
  const result = await upsert(app, TABLES.classTimes, {
    ...where
  }, {
    show_ref: showRow.ROWID,
    day_ref: dayRow.ROWID,
    ring_ref: ringRow.ROWID,
    class_ref: classRow.ROWID,
    show_no: row.show_no,
    ring_day_no: row.ring_day_no,
    class_no: row.class_no,
    class_label: row.class_label,
    class_time_text: row.class_time_text,
    class_order: row.class_order,
    entry_count: row.entry_count,
    re_type: row.re_type,
    oc_id: row.oc_id,
    live_flag: row.live_flag,
    source_endpoint: row.source_endpoint || "get_rings.php",
    source_html: row.source_html,
    current_entry_text: row.current_entry_text,
    current_entry_no: row.current_entry_no,
    current_horse: row.current_horse,
    entries_gone: row.entries_gone,
    entries_to_go: row.entries_to_go,
    source_timestamp: row.source_timestamp,
    elapsed_seconds: row.elapsed_seconds,
    raw_json: row.raw_json
  });

  const focusDay = dateKey(row.day_label);
  if (focusDay) {
    const classStartTime = classStartTimeFromText(row.class_time_text);
    if (intOrNull(row.class_no) > 0 && classStartTime) {
      const classStartKey = `${row.show_no}|${focusDay}|${row.ring_day_no}|${row.class_no}`;
      await upsert(app, TABLES.classStartTimes, {
        class_start_key: classStartKey
      }, {
        class_start_key: classStartKey,
        show_no: row.show_no,
        focus_day: focusDay,
        ring_day_no: row.ring_day_no,
        ring_no: row.ring_no,
        ring_name: row.ring_name,
        class_no: row.class_no,
        class_name: row.class_name,
        class_start_time: classStartTime,
        entry_count: row.entry_count
      });
    }
  }

  return result.row;
}

async function ensureEntry(app, showRow, classRow, classTimeRow, row) {
  if (!row.current_entry_no && !row.current_horse) return null;
  const where = row.class_no
    ? { show_no: row.show_no, class_no: row.class_no, entry_no: row.current_entry_no }
    : { show_no: row.show_no, entry_no: row.current_entry_no, horse: row.current_horse };
  const result = await upsert(app, TABLES.entries, {
    ...where
  }, {
    show_ref: showRow.ROWID,
    class_ref: classRow.ROWID,
    class_time_ref: classTimeRow.ROWID,
    show_no: row.show_no,
    class_no: row.class_no,
    entry_no: row.current_entry_no,
    horse: row.current_horse,
    entry_source: row.source_endpoint || "get_rings.php",
    raw_json: JSON.stringify({ entry: row.current_entry_text })
  });
  return result.row;
}

async function ensureOogEntry(app, showRow, classRow, classTimeRow, row) {
  if (!row.current_entry_no && !row.current_horse) return null;
  const result = await upsert(app, TABLES.entries, {
    show_no: row.show_no,
    class_no: row.class_no,
    entry_no: row.current_entry_no
  }, {
    show_ref: showRow.ROWID,
    class_ref: classRow?.ROWID || null,
    class_time_ref: classTimeRow?.ROWID || null,
    show_no: row.show_no,
    class_no: row.class_no,
    entry_no: row.current_entry_no,
    entry_order: row.entry_order,
    horse: row.current_horse,
    rider: row.rider,
    trainer: row.trainer,
    entry_source: row.source_endpoint || "class_oog.php",
    order_status: row.order_status,
    source_html: row.source_html,
    raw_json: row.raw_json
  });
  return result.row;
}

async function syncRows(app, showNo, rows) {
  const showRow = await ensureShow(app, showNo);
  const counters = { shows: 1, days: 0, rings: 0, classes: 0, class_times: 0, entries: 0, focus: 0, source_mirrors: 0 };
  const seen = { days: new Set(), rings: new Set(), classes: new Set(), classTimes: new Set(), entries: new Set() };
  const samples = [];
  for (const row of rows) {
    const sourceMirror = await writeSourceMirrorRow(app, row);
    if (sourceMirror?.row?.ROWID) counters.source_mirrors++;
    if (row.source_endpoint === "counts.php" || row.source_endpoint === "get_orders.php" || row.source_endpoint === "get_rings.php") {
      continue;
    }

    const dayRow = await ensureDay(app, showRow, row.show_no, row.day_label || row.day_text || row.ring_day_no);
    if (!seen.days.has(dayRow.ROWID)) counters.days++;
    seen.days.add(dayRow.ROWID);

    const ringRow = await ensureRing(app, showRow, dayRow, row);
    if (!seen.rings.has(ringRow.ROWID)) counters.rings++;
    seen.rings.add(ringRow.ROWID);

    const classRow = await ensureClass(app, showRow, ringRow, row);
    if (!seen.classes.has(classRow.ROWID)) counters.classes++;
    seen.classes.add(classRow.ROWID);

    const classTimeRow = await ensureClassTime(app, showRow, dayRow, ringRow, classRow, row);
    if (!seen.classTimes.has(classTimeRow.ROWID)) counters.class_times++;
    seen.classTimes.add(classTimeRow.ROWID);

    const entryRow = await ensureEntry(app, showRow, classRow, classTimeRow, row);
    if (entryRow && !seen.entries.has(entryRow.ROWID)) counters.entries++;
    if (entryRow) seen.entries.add(entryRow.ROWID);

    if (samples.length < 3) {
      samples.push({
        show: showRow.ROWID,
        day: dayRow.ROWID,
        ring: ringRow.ROWID,
        class: classRow.ROWID,
        class_time: classTimeRow.ROWID,
        entry: entryRow?.ROWID || null
      });
    }
  }
  return { counters, samples };
}

async function syncOogRows(app, showNo, classNo, rows) {
  const showRow = await ensureShow(app, showNo);
  const classRow = await findOne(app, TABLES.classes, { show_no: showNo, class_no: classNo })
    || await ensureClass(app, showRow, null, {
      show_no: showNo,
      class_no: classNo,
      class_label: classNo,
      class_name: classNo,
      source_endpoint: "class_oog.php"
    });
  const classTimeRow = await findOne(app, TABLES.classTimes, { show_no: showNo, class_no: classNo });
  const classOogSync = await replaceClassOogClassRows(app, showNo, classNo, rows, classRow, classTimeRow);
  const counters = { shows: 1, classes: classRow ? 1 : 0, class_times: classTimeRow ? 1 : 0, class_oog: classOogSync.inserted + classOogSync.updated, entries: 0 };
  const samples = [];
  const seen = new Set();
  for (const row of rows) {
    const entryRow = await ensureOogEntry(app, showRow, classRow, classTimeRow, row);
    if (entryRow && !seen.has(entryRow.ROWID)) counters.entries++;
    if (entryRow) seen.add(entryRow.ROWID);
    if (entryRow && samples.length < 3) {
      samples.push({ class: classRow?.ROWID || null, class_time: classTimeRow?.ROWID || null, entry: entryRow.ROWID });
    }
  }
  return { counters, samples };
}

async function classTimeRowsByClassNo(app, showNo) {
  const rows = await getRowsByShow(app, TABLES.classTimes, showNo, { limit: 2000, offset: 0 });
  const byClassNo = new Map();
  for (const row of rows) {
    const classNo = text(row.class_no);
    if (classNo && !byClassNo.has(classNo)) byClassNo.set(classNo, row);
  }
  return byClassNo;
}

async function backfillClassOogFromEntries(app, showNo, { offset = 0, limit = 200 } = {}) {
  const pageLimit = Math.max(1, Math.min(Number(limit) || 200, 200));
  const pageOffset = Math.max(0, Number(offset) || 0);
  const query = [
    "SELECT ROWID, show_no, class_no, entry_no, entry_order, horse, rider, trainer, order_status, raw_json",
    `FROM ${TABLES.entries}`,
    `WHERE show_no = ${zcqlValue(showNo)} AND entry_source = ${zcqlValue("class_oog.php")}`,
    `LIMIT ${pageLimit} OFFSET ${pageOffset}`
  ].join(" ");
  const entryRows = (await app.zcql().executeZCQLQuery(query) || [])
    .map((item) => item?.[TABLES.entries])
    .filter(Boolean);
  const classTimes = await classTimeRowsByClassNo(app, showNo);
  const sourceRows = entryRows
    .map((row) => classOogSourceRow({
      show_no: showNo,
      class_no: row.class_no,
      entry_order: row.entry_order,
      entry_no: row.entry_no,
      horse: row.horse,
      rider: row.rider,
      trainer: row.trainer,
      order_status: row.order_status,
      raw_json: row.raw_json
    }, null, classTimes.get(text(row.class_no))))
    .filter(Boolean);
  const result = await upsertSourceRowsFast(app, TABLES.classOog, "class_oog_key", sourceRows, { showNo });
  return {
    offset: pageOffset,
    limit: pageLimit,
    entries_seen: entryRows.length,
    source_rows: sourceRows.length,
    has_more: entryRows.length === pageLimit,
    next_offset: entryRows.length === pageLimit ? pageOffset + pageLimit : null,
    ...result
  };
}

async function repairClassOogShowNo(app, showNo, { limit = 200 } = {}) {
  const table = app.datastore().table(TABLES.classOog);
  const maxUpdates = Math.max(1, Math.min(Number(limit) || 200, 1000));
  let nextToken = undefined;
  let scanned = 0;
  let updated = 0;
  const samples = [];
  do {
    const page = await table.getPagedRows({ nextToken, maxRows: 200 });
    const rows = page?.data || [];
    scanned += rows.length;
    for (const row of rows.slice(0, Math.max(0, 3 - samples.length))) {
      samples.push({
        ROWID: row.ROWID,
        class_oog_key: row.class_oog_key,
        show_no: row.show_no,
        class_no: row.class_no,
        entry_no: row.entry_no
      });
    }
    const updates = rows
      .filter((row) => !text(row.show_no) && text(row.class_oog_key))
      .slice(0, Math.max(0, maxUpdates - updated))
      .map((row) => ({ ROWID: row.ROWID, show_no: showNo }));
    if (updates.length) {
      await table.updateRows(updates);
      updated += updates.length;
    }
    nextToken = page?.next_token;
    if (updated >= maxUpdates) break;
  } while (nextToken);
  return {
    scanned,
    updated,
    has_more: Boolean(nextToken),
    samples
  };
}

async function syncRingDayRows(app, showNo, rows, { refreshExisting = false } = {}) {
  const showRow = await ensureShow(app, showNo);
  const counters = { shows: 1, days: 0, rings: 0 };
  const samples = [];
  const dayTable = app.datastore().table(TABLES.days);
  const ringTable = app.datastore().table(TABLES.rings);

  const dayInputsByKey = new Map();
  const ringInputsByKey = new Map();
  for (const row of rows) {
    const dayLabel = row.day_label || row.ring_day_no;
    const dayKey = `${row.show_no}|${dayLabel}`;
    if (!dayInputsByKey.has(dayKey)) {
      dayInputsByKey.set(dayKey, cleanRowForDatastore({
        show_ref: showRow.ROWID,
        show_no: row.show_no,
        day_label: dayLabel,
        source_key: dayKey
      }));
    }
    const ringKey = `${row.show_no}|${row.ring_day_no}|${row.ring_no}`;
    ringInputsByKey.set(ringKey, {
      key: ringKey,
      dayKey,
      row: cleanRowForDatastore({
        show_ref: showRow.ROWID,
        show_no: row.show_no,
        ring_no: row.ring_no,
        ring_day_no: row.ring_day_no,
        ring_name: row.ring_name,
        day_label: row.day_label,
        raw_json: row.raw_json
      })
    });
  }

  const existingDaysQuery = [
    "SELECT ROWID, show_no, day_label, source_key",
    `FROM ${TABLES.days}`,
    `WHERE show_no = ${zcqlValue(showNo)}`,
    "LIMIT 300"
  ].join(" ");
  const existingDays = (await app.zcql().executeZCQLQuery(existingDaysQuery) || [])
    .map((item) => item?.[TABLES.days])
    .filter(Boolean);
  const existingDaysByKey = new Map(existingDays.map((row) => [text(row.source_key || `${row.show_no}|${row.day_label}`), row]));
  const dayInserts = [];
  const dayUpdates = [];
  for (const [dayKey, row] of dayInputsByKey) {
    const existing = existingDaysByKey.get(dayKey);
    if (existing?.ROWID) {
      const changed = Object.entries(row).some(([key, value]) => text(existing[key]) !== text(value));
      if (refreshExisting && changed) {
        const { source_key, show_no, day_label, ...mutable } = row;
        dayUpdates.push({ ...mutable, ROWID: existing.ROWID });
      }
    } else {
      dayInserts.push(row);
    }
  }
  if (dayInserts.length) {
    const inserted = await dayTable.insertRows(dayInserts);
    for (const row of inserted || []) {
      existingDaysByKey.set(text(row.source_key || `${row.show_no}|${row.day_label}`), row);
    }
    counters.days += dayInserts.length;
  }
  if (dayUpdates.length) {
    await dayTable.updateRows(dayUpdates);
  }

  const existingRingsQuery = [
    "SELECT ROWID, show_no, ring_no, ring_day_no, ring_name, day_label, raw_json",
    `FROM ${TABLES.rings}`,
    `WHERE show_no = ${zcqlValue(showNo)} AND ring_day_no IS NOT NULL`,
    "LIMIT 300"
  ].join(" ");
  const existingRings = (await app.zcql().executeZCQLQuery(existingRingsQuery) || [])
    .map((item) => item?.[TABLES.rings])
    .filter(Boolean);
  const existingRingsByKey = new Map(existingRings.map((row) => [`${row.show_no}|${row.ring_day_no}|${row.ring_no}`, row]));
  const ringInserts = [];
  const ringUpdates = [];
  for (const item of ringInputsByKey.values()) {
    const dayRow = existingDaysByKey.get(item.dayKey);
    const row = cleanRowForDatastore({
      ...item.row,
      day_ref: dayRow?.ROWID || null
    });
    const existing = existingRingsByKey.get(item.key);
    if (existing?.ROWID) {
      const changed = Object.entries(row).some(([key, value]) => text(existing[key]) !== text(value));
      if (refreshExisting && changed) {
        const { show_no, ring_no, ring_day_no, ...mutable } = row;
        ringUpdates.push({ ...mutable, ROWID: existing.ROWID });
      }
      if (samples.length < 3) samples.push({ show: showRow.ROWID, day: row.day_ref, ring: existing.ROWID });
    } else {
      ringInserts.push(row);
    }
  }
  for (let index = 0; index < ringInserts.length; index += 100) {
    const batch = ringInserts.slice(index, index + 100);
    if (batch.length) {
      const inserted = await ringTable.insertRows(batch);
      counters.rings += batch.length;
      for (const row of inserted || []) {
        if (samples.length < 3) samples.push({ show: showRow.ROWID, day: row.day_ref, ring: row.ROWID });
      }
    }
  }
  for (let index = 0; index < ringUpdates.length; index += 100) {
    const batch = ringUpdates.slice(index, index + 100);
    if (batch.length) {
      await ringTable.updateRows(batch);
    }
  }

  counters.days += dayUpdates.length;
  counters.rings += ringUpdates.length;
  return { counters, samples };
}

async function syncClassRows(app, showNo, rows) {
  const showRow = await ensureShow(app, showNo);
  const counters = { shows: 1, classes: 0 };
  const samples = [];
  const seen = new Set();
  for (const row of rows) {
    const classRow = await ensureClass(app, showRow, null, row);
    if (!seen.has(classRow.ROWID)) counters.classes++;
    seen.add(classRow.ROWID);
    if (samples.length < 3) samples.push({ show: showRow.ROWID, class: classRow.ROWID });
  }
  return { counters, samples };
}

async function syncCountRows(app, showNo, rows) {
  await ensureShow(app, showNo);
  const sourceRows = rows.map(countsSourceRow).filter(Boolean);
  const result = await upsertSourceRowsFast(app, TABLES.counts, "class_key", sourceRows, { showNo });
  return {
    counters: { shows: 1, counts: result.inserted + result.updated },
    source_rows: result.rows,
    inserted: result.inserted,
    updated: result.updated,
    skipped: result.skipped,
    samples: sourceRows.slice(0, 3).map((row) => ({ class_key: row.class_key }))
  };
}

async function fetchAndSyncRingDays(req, app, showNo, context, { focusDay = "", refreshExisting = false, syncAirtableMirror = true, syncRawAirtableMirror = false, heartbeatId = "", runId = "" } = {}) {
  const upstreamResponse = await upstream(req, "/get_ring_days.php", { method: "GET", showNo, context });
  const rows = parseRingDayRows(upstreamResponse.raw, showNo);
  const rawCatalystSync = await syncCatalystGetRingDayRows(app, showNo, rows);
  const catalystSync = await syncRingDayRows(app, showNo, rows, { refreshExisting });
  const airtableSync = syncAirtableMirror
    ? await syncAirtableGetRingDayRows(showNo, rows)
    : { get_ring_days_rows: 0, get_ring_days_upserts: 0, get_ring_days_skipped: rows.length };
  const rawAirtableSync = syncRawAirtableMirror
    ? await syncRawAirtableGetRingDayRows(showNo, rows, { heartbeatId, runId })
    : { airtable_hs_get_ring_days_rows: 0, airtable_hs_get_ring_days_upserts: 0 };
  const materializedRows = await countStoredRingDayRows(app, showNo, focusDay);
  const rawMaterializedRows = await countStoredGetRingDayRows(app, showNo, focusDay);
  return {
    upstream_status: upstreamResponse.status,
    parsed_rows: rows.length,
    materialized_focus_day: dateKey(focusDay),
    materialized_ring_day_rows: materializedRows,
    materialized_hs_get_ring_days_rows: rawMaterializedRows,
    refresh_existing: refreshExisting,
    ...rawCatalystSync,
    ...catalystSync,
    ...airtableSync,
    ...rawAirtableSync
  };
}

async function fetchAndSyncCounts(req, app, showNo, context, { offset = 0, limit = 100 } = {}) {
  const upstreamResponse = await upstream(req, "/counts.php", { method: "GET", showNo, context });
  const allRows = parseCountRows(upstreamResponse.raw, showNo);
  const rows = allRows.slice(offset, offset + limit);
  const nextOffset = offset + rows.length;
  return {
    upstream_status: upstreamResponse.status,
    total_rows: allRows.length,
    offset,
    limit,
    parsed_rows: rows.length,
    next_offset: nextOffset < allRows.length ? nextOffset : null,
    has_more: nextOffset < allRows.length,
    ...(await syncCountRows(app, showNo, rows))
  };
}

async function fetchAndSyncCountsOnly(req, app, showNo, context, { offset = 0, limit = 100 } = {}) {
  const upstreamResponse = await upstream(req, "/counts.php", { method: "GET", showNo, context });
  const allRows = parseCountRows(upstreamResponse.raw, showNo);
  const rows = allRows.slice(offset, offset + limit);
  const nextOffset = offset + rows.length;
  const sourceRows = rows.map(countsSourceRow).filter(Boolean);
  const result = await upsertSourceRowsFast(app, TABLES.counts, "class_key", sourceRows, { showNo });
  return {
    upstream_status: upstreamResponse.status,
    total_rows: allRows.length,
    offset,
    limit,
    parsed_rows: rows.length,
    next_offset: nextOffset < allRows.length ? nextOffset : null,
    has_more: nextOffset < allRows.length,
    rows: result.rows,
    inserted: result.inserted,
    updated: result.updated,
    skipped: result.skipped
  };
}

async function fetchAndSyncCurrent(req, app, showNo, source, context, { focusDay = "" } = {}) {
  const gate = await getLiveWindowGate(showNo, focusDay, source);
  if (!gate.allowed) {
    let log_error = "";
    try {
      await writeLiveWorkflowLog({
        source,
        showNo,
        focusDay: gate.focus_day || focusDay,
        status: "skipped",
        summary: `${source === "orders" ? "get_orders" : "get_rings"} skipped: ${gate.reason}`,
        payload: gate
      });
    } catch (error) {
      log_error = String(error?.message || error);
    }
    return {
      skipped: true,
      skip_reason: gate.reason,
      live_window: gate,
      log_error,
      upstream_status: null,
      raw_rows: 0,
      parsed_rows: 0,
      focus_class_scope: 0,
      class_no_resolved: 0,
      counters: { source_mirrors: 0 },
      samples: []
    };
  }
  const path = source === "orders" ? "/get_orders.php" : "/get_rings.php";
  try {
    const upstreamResponse = await upstream(req, path, {
      method: "POST",
      showNo,
      body: new URLSearchParams({ show_no: showNo }).toString(),
      context
    });
    const result = await syncCurrentPayload(app, showNo, source, upstreamResponse.raw, {
      focusDay: gate.focus_day || focusDay,
      upstreamStatus: upstreamResponse.status
    });
    let log_error = "";
    try {
      await writeLiveWorkflowLog({
        source,
        showNo,
        focusDay: gate.focus_day || focusDay,
        status: "ok",
        recordsSeen: result.raw_rows,
        recordsChanged: result.counters?.source_mirrors || 0,
        summary: `${source === "orders" ? "get_orders" : "get_rings"} ok: raw ${result.raw_rows}; parsed ${result.parsed_rows}; mirrors ${result.counters?.source_mirrors || 0}`,
        payload: { live_window: gate, result }
      });
    } catch (error) {
      log_error = String(error?.message || error);
    }
    return { ...result, live_window: gate, log_error };
  } catch (error) {
    let log_error = "";
    try {
      await writeLiveWorkflowLog({
        source,
        showNo,
        focusDay: gate.focus_day || focusDay,
        status: "error",
        summary: `${source === "orders" ? "get_orders" : "get_rings"} failed: ${String(error?.message || error)}`,
        payload: { live_window: gate, error: String(error?.message || error) }
      });
    } catch (logError) {
      log_error = String(logError?.message || logError);
    }
    error.live_log_error = log_error;
    throw error;
  }
}

async function fetchStep5LiveSource(req, app, showNo, focusDay, source, context) {
  const gate = await getLiveWindowGate(showNo, focusDay, source);
  const tableName = source === "orders" ? TABLES.getOrders : TABLES.getRings;
  const keyField = source === "orders" ? "get_orders_key" : "get_rings_key";
  if (!gate.allowed) {
    return {
      source,
      skipped: true,
      skip_reason: gate.reason,
      live_window: gate,
      get_run: false,
      upstream_status: null,
      raw_rows: 0,
      parsed_rows: 0,
      source_rows: [],
      catalyst_mirror: { rows: 0, inserted: 0, updated: 0, skipped: 0 },
      cleanup: { deleted: 0, skipped: true }
    };
  }

  const path = source === "orders" ? "/get_orders.php" : "/get_rings.php";
  const upstreamResponse = await upstream(req, path, {
    method: "POST",
    showNo,
    body: new URLSearchParams({ show_no: showNo }).toString(),
    context
  });
  const parser = source === "orders" ? parseOrderRows : parseRingRows;
  const parsedRows = parser(upstreamResponse.raw)
    .map((row) => ({ ...row, focus_day: gate.focus_day || focusDay }));
  const scoped = await applyFocusScopeToCurrentRows(app, showNo, gate.focus_day || focusDay, parsedRows, source);
  const pollRunId = compactLogTimestamp();
  const sourceRows = scoped.rows
    .map((row, index) => source === "orders"
      ? getOrdersSourceRow(row, { appendLog: true, pollRunId, rowIndex: index + 1 })
      : getRingsSourceRow(row, { appendLog: true, pollRunId, rowIndex: index + 1 }))
    .filter(Boolean);
  const catalystMirror = await upsertSourceRowsFast(app, tableName, keyField, sourceRows, { showNo });
  const cleanup = { deleted: 0, skipped: true, reason: "append_only_log" };
  return {
    source,
    skipped: false,
    live_window: gate,
    get_run: true,
    upstream_status: upstreamResponse.status,
    raw_rows: parsedRows.length,
    parsed_rows: scoped.rows.length,
    focus_class_scope: scoped.focus_class_scope,
    class_no_resolved: scoped.class_no_resolved,
    poll_run_id: pollRunId,
    source_rows: sourceRows,
    catalyst_mirror: catalystMirror,
    cleanup
  };
}

function classVisualKeyForLiveRow(row, ringStatusByRing) {
  const ringDayNo = text(row.ring_day_no);
  const ringNo = text(row.ring_no);
  const classNo = intValue(row.class_no);
  const ringStatus = ringStatusByRing.get(`${ringDayNo}|${ringNo}`) || ringStatusByRing.get(`|${ringNo}`) || null;
  const ringNameNormalized = visualRingName(ringStatus?.ring_name_normalized || normalizedWecRingName(row.ring_name));
  if (!ringNameNormalized || !classNo) return "";
  return classVisualKey(ringNameNormalized, classNo);
}

function cleanStep5ClassKey(showNo, focusDay, ringDayNo, ringNo, classNo) {
  const show = text(showNo);
  const focusDayKey = dateKey(focusDay).replace(/-/g, "");
  const ringDay = text(ringDayNo);
  const ring = text(ringNo);
  const klass = text(classNo);
  if (!show || !focusDayKey || !ringDay || !ring || !klass) return "";
  return `${show}|${focusDayKey}|${ringDay}|${ring}|${klass}`;
}

function cleanStep5ClassKeyForRuntimeRow(row, showNo, focusDay) {
  const stored = text(row.class_const_key || row.class_start_key);
  if (stored) return stored;
  return cleanStep5ClassKey(
    row.show_no || showNo,
    row.focus_day_key || row.focus_day || row.iso_date || focusDay,
    row.ring_day_no,
    row.ring_no,
    row.class_no
  );
}

function cleanStep5ClassKeyForLiveRow(row, showNo, focusDay) {
  return cleanStep5ClassKey(
    row.show_no || showNo,
    row.focus_day_key || row.focus_day || row.iso_date || focusDay,
    row.ring_day_no,
    row.ring_no,
    row.class_no
  );
}

function sourceDerivedPaceSeconds(row) {
  const gone = intOrNull(row.n_gone);
  const elapsed = intOrNull(row.elapsed);
  if (!gone || gone < 1 || !elapsed || elapsed < 1) return null;
  return Math.max(1, Math.round(elapsed / gone));
}

function addSecondsToTimeText(startTime, seconds) {
  const normalized = classStartTimeFromText(startTime);
  const match = normalized.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  const offset = Number(seconds);
  if (!match || !Number.isFinite(offset)) return "";
  const total = (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3]) + Math.max(0, Math.round(offset));
  const wrapped = ((total % 86400) + 86400) % 86400;
  const hour = Math.floor(wrapped / 3600);
  const minute = Math.floor((wrapped % 3600) / 60);
  const second = wrapped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(text(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function readSoonClassStatusKeys(showNo, focusDay) {
  const result = {
    class_start_keys: new Set(),
    class_visual_keys: new Set(),
    class_nos: new Set(),
    rows: 0,
    error: ""
  };
  if (!AIRTABLE_TOKEN_FALLBACK) {
    result.error = "missing_airtable_token";
    return result;
  }
  try {
    const formula = `AND({show_no}=${Number(showNo)},IS_SAME({focus_day},DATETIME_PARSE('${airtableQuote(focusDay)}'),'day'),{status}='open',{alert_lane}='class_start_times')`;
    const records = await airtableListRecords("wec-alerts", { filterByFormula: formula });
    result.rows = records.length;
    for (const record of records) {
      const fields = record.fields || {};
      const payload = parseJsonObject(fields.payload_json || fields.payload || fields.Payload || fields["payload_json"]);
      const classStartKey = text(payload.class_start_key || fields.class_start_key || fields["class_start_key"]);
      const classVisual = text(payload.class_visual_key || fields.class_visual_key || fields["class_visual_key"]);
      const classNo = text(payload.class_no || fields.class_no || fields["class_no"]);
      if (classStartKey) result.class_start_keys.add(classStartKey);
      if (classVisual) result.class_visual_keys.add(classVisual);
      if (classNo) result.class_nos.add(classNo);
    }
  } catch (error) {
    result.error = String(error?.message || error);
  }
  return result;
}

function classStatusForStart(row, liveRow, soonKeys) {
  const entryCount = intOrNull(row.entry_count);
  const gone = intOrNull(liveRow?.n_gone ?? row.n_gone);
  const toGo = intOrNull(liveRow?.n_to_go ?? row.n_to_go);
  if (entryCount && gone === entryCount && (toGo === null || toGo === 0)) return "Done";
  if (liveRow) return "Now";
  const classStartKey = text(row.class_start_key);
  const classVisual = text(row.class_visual_key || row.class_start_key);
  const classNo = text(row.class_no);
  if (
    soonKeys?.class_start_keys?.has(classStartKey) ||
    soonKeys?.class_visual_keys?.has(classVisual) ||
    soonKeys?.class_nos?.has(classNo)
  ) return "Soon";
  return "Today";
}

async function enrichStep5RuntimeRows(app, showNo, focusDay, { getRingsRows = [], getOrdersRows = [], runTime = "" } = {}) {
  const safeFocusDay = dateKey(focusDay);
  const currentFilter = (row) => text(row.show_no) === text(showNo) && dateKey(row.focus_day) === safeFocusDay;
  const [ringStatusPage, classStartPage, entryGoPage] = await Promise.all([
    getPagedRowsFiltered(app, TABLES.ringStatus, currentFilter, { maxRows: 1000 }),
    getPagedRowsFiltered(app, TABLES.classStartTimes, currentFilter, { maxRows: 5000 }),
    getPagedRowsFiltered(app, TABLES.entryGoTimes, currentFilter, { maxRows: 10000 })
  ]);
  const ringStatusRows = ringStatusPage.rows || [];
  const classStartRows = classStartPage.rows || [];
  const entryGoRows = entryGoPage.rows || [];
  const soonClassStatusKeys = await readSoonClassStatusKeys(showNo, safeFocusDay);

  const ringStatusByRing = new Map();
  for (const row of ringStatusRows) {
    const key = `${text(row.ring_day_no)}|${text(row.ring_no)}`;
    if (text(row.ring_no)) {
      ringStatusByRing.set(key, row);
      ringStatusByRing.set(`|${text(row.ring_no)}`, row);
    }
  }

  const classStartByClassKey = new Map();
  const classStartByClassNo = new Map();
  for (const row of classStartRows) {
    const key = cleanStep5ClassKeyForRuntimeRow(row, showNo, safeFocusDay);
    if (key) classStartByClassKey.set(key, row);
    const classNo = text(row.class_no);
    if (classNo) {
      if (classStartByClassNo.has(classNo)) classStartByClassNo.set(classNo, null);
      else classStartByClassNo.set(classNo, row);
    }
  }

  const liveRows = [...(getRingsRows || []), ...(getOrdersRows || [])]
    .filter((row) => intValue(row.class_no));
  const bestLiveByClass = new Map();
  for (const row of liveRows) {
    const classKey = cleanStep5ClassKeyForLiveRow(row, showNo, safeFocusDay);
    if (!classKey || !classStartByClassKey.has(classKey)) continue;
    const existing = bestLiveByClass.get(classKey);
    const nextPace = sourceDerivedPaceSeconds(row);
    const existingPace = existing ? sourceDerivedPaceSeconds(existing) : null;
    if (!existing || (nextPace && !existingPace) || text(row.get_orders_key)) {
      bestLiveByClass.set(classKey, row);
    }
  }

  const liveSyncedAt = catalystDateTime(runTime || new Date().toISOString());
  const ringUpdates = [];
  for (const row of getRingsRows || []) {
    const ringStatus = ringStatusByRing.get(`${text(row.ring_day_no)}|${text(row.ring_no)}`) || ringStatusByRing.get(`|${text(row.ring_no)}`);
    if (!ringStatus?.ring_status_key) continue;
    ringUpdates.push({
      ring_status_key: text(ringStatus.ring_status_key),
      is_live: true,
      current_class_no: intValue(row.class_no),
      n_gone: intValue(row.n_gone),
      n_to_go: intValue(row.n_to_go),
      elapsed_seconds: intValue(row.elapsed),
      live_source: "hs_get_rings.step5_live_enrichment",
      last_live_synced_at: liveSyncedAt
    });
  }

  const classUpdateByKey = new Map();
  for (const row of classStartRows) {
    const classStartKey = text(row.class_start_key);
    if (!classStartKey) continue;
    classUpdateByKey.set(classStartKey, {
      class_start_key: classStartKey,
      class_status: classStatusForStart(row, null, soonClassStatusKeys)
    });
  }
  const paceByClassKey = new Map();
  const paceByClassNo = new Map();
  const sourceDerivedPaceBySource = {
    hs_get_rings: 0,
    hs_get_orders: 0
  };
  for (const [classKey, liveRow] of bestLiveByClass.entries()) {
    const classRow = classStartByClassKey.get(classKey);
    if (!classRow?.class_start_key) continue;
    const pace = sourceDerivedPaceSeconds(liveRow);
    if (pace) {
      paceByClassKey.set(classKey, pace);
      if (text(liveRow.get_orders_key)) sourceDerivedPaceBySource.hs_get_orders += 1;
      else sourceDerivedPaceBySource.hs_get_rings += 1;
    }
    const classNo = text(classRow.class_no || liveRow.class_no);
    if (pace && classNo) {
      if (paceByClassNo.has(classNo)) paceByClassNo.set(classNo, null);
      else paceByClassNo.set(classNo, pace);
    }
    classUpdateByKey.set(text(classRow.class_start_key), {
      ...(classUpdateByKey.get(text(classRow.class_start_key)) || {}),
      class_start_key: text(classRow.class_start_key),
      n_gone: intValue(liveRow.n_gone),
      n_to_go: intValue(liveRow.n_to_go),
      elapsed_seconds: intValue(liveRow.elapsed),
      pace_seconds: pace || undefined,
      current_entry_no: intValue(liveRow.entry_no),
      current_horse: text(liveRow.entry_text),
      class_status: classStatusForStart(classRow, liveRow, soonClassStatusKeys),
      live_source: text(liveRow.get_orders_key) ? "hs_get_orders.step5_live_enrichment" : "hs_get_rings.step5_live_enrichment",
      last_live_synced_at: liveSyncedAt
    });
  }
  const classUpdates = [...classUpdateByKey.values()];

  const entryUpdates = [];
  const entrySkipReasons = {
    missing_class_key: 0,
    missing_pace: 0,
    missing_class_row: 0,
    missing_entry_order: 0,
    missing_class_start_time: 0,
    invalid_go_time: 0
  };
  for (const row of entryGoRows) {
    const classKey = cleanStep5ClassKeyForRuntimeRow(row, showNo, safeFocusDay);
    const classNo = text(row.class_no);
    if (!classKey && !classNo) {
      entrySkipReasons.missing_class_key += 1;
      continue;
    }
    const pace = paceByClassKey.get(classKey) || paceByClassNo.get(classNo);
    if (!pace) {
      entrySkipReasons.missing_pace += 1;
      continue;
    }
    const classRow = classStartByClassKey.get(classKey) || classStartByClassNo.get(classNo);
    if (!classRow?.class_start_key) {
      entrySkipReasons.missing_class_row += 1;
      continue;
    }
    const entryOrder = intOrNull(row.entry_order);
    if (!entryOrder) {
      entrySkipReasons.missing_entry_order += 1;
      continue;
    }
    if (!classRow.class_start_time) {
      entrySkipReasons.missing_class_start_time += 1;
      continue;
    }
    const goTime = addSecondsToTimeText(classRow.class_start_time, (entryOrder - 1) * pace);
    if (!goTime) {
      entrySkipReasons.invalid_go_time += 1;
      continue;
    }
    entryUpdates.push({
      entry_go_key: text(row.entry_go_key),
      go_time: goTime,
      pace_seconds: pace,
      live_source: "source_derived_pace.step5_live_enrichment",
      last_live_synced_at: liveSyncedAt
    });
  }

  const ringResult = ringUpdates.length
    ? await upsertSourceRowsFast(app, TABLES.ringStatus, "ring_status_key", ringUpdates, { showNo })
    : { rows: 0, inserted: 0, updated: 0, skipped: 0 };
  const classResult = classUpdates.length
    ? await upsertSourceRowsFast(app, TABLES.classStartTimes, "class_start_key", classUpdates, { showNo })
    : { rows: 0, inserted: 0, updated: 0, skipped: 0 };
  const entryResult = entryUpdates.length
    ? await upsertSourceRowsFast(app, TABLES.entryGoTimes, "entry_go_key", entryUpdates, { showNo })
    : { rows: 0, inserted: 0, updated: 0, skipped: 0 };

  const entryUpdateByKey = new Map(entryUpdates.map((row) => [text(row.entry_go_key), row]));
  const refreshedEntryGoRows = (await getPagedRowsFiltered(app, TABLES.entryGoTimes, currentFilter, { maxRows: 10000 })).rows || [];
  const mirrorEntryGoRows = refreshedEntryGoRows.map((row) => {
    const update = entryUpdateByKey.get(text(row.entry_go_key));
    return update ? { ...row, ...update } : row;
  });
  const refreshedRows = await getStep4RuntimeRows(app, showNo, safeFocusDay, { trainerDisplays: new Map() });
  const airtableRuntimeMirror = await syncRawAirtableStep4RuntimeRows(showNo, safeFocusDay, {
    ringStatusRows: refreshedRows.runtime_ring_status_rows || [],
    classStartRows: (await getPagedRowsFiltered(app, TABLES.classStartTimes, currentFilter, { maxRows: 5000 })).rows || [],
    entryGoRows: mirrorEntryGoRows,
    runTime
  });

  return {
    source_runtime_counts: {
      hs_ring_status: ringStatusRows.length,
      hs_class_start_times: classStartRows.length,
      hs_entry_go_times: entryGoRows.length
    },
    class_live_matches: bestLiveByClass.size,
    source_derived_pace_classes: paceByClassKey.size,
    source_derived_pace_by_source: sourceDerivedPaceBySource,
    class_status: {
      soon_alert_rows: soonClassStatusKeys.rows,
      soon_alert_read_error: soonClassStatusKeys.error,
      updated_rows: classUpdates.filter((row) => text(row.class_status)).length,
      counts: classUpdates.reduce((counts, row) => {
        const status = text(row.class_status || "Today");
        counts[status] = (counts[status] || 0) + 1;
        return counts;
      }, {})
    },
    ring_status_enrichment: ringResult,
    class_start_times_enrichment: classResult,
    entry_go_times_enrichment: entryResult,
    entry_go_times_go_time_updates: entryUpdates.length,
    entry_go_times_skip_reasons: entrySkipReasons,
    fallback_go_times_created: 0,
    airtable_runtime_mirror: airtableRuntimeMirror
  };
}

function summarizeStep5Mirror(mirror) {
  if (!mirror) return null;
  const summary = {};
  for (const [key, value] of Object.entries(mirror)) {
    if (!value || typeof value !== "object") {
      summary[key] = value;
      continue;
    }
    summary[key] = {
      table: value.table,
      key_field: value.key_field,
      source_rows: value.source_rows,
      upserts: value.upserts,
      current_day_count: value.current_day_count,
      skipped: value.skipped,
      cleanup: value.cleanup,
      table_status: value.table_status ? {
        exists: value.table_status.exists,
        created: value.table_status.created,
        table_id: value.table_status.table_id,
        missing_fields: value.table_status.missing_fields || []
      } : undefined
    };
  }
  return summary;
}

function summarizeStep5RuntimeEnrichment(runtime) {
  if (!runtime) return null;
  return {
    source_runtime_counts: runtime.source_runtime_counts,
    class_live_matches: runtime.class_live_matches,
    source_derived_pace_classes: runtime.source_derived_pace_classes,
    source_derived_pace_by_source: runtime.source_derived_pace_by_source,
    class_status: runtime.class_status,
    ring_status_enrichment: runtime.ring_status_enrichment,
    class_start_times_enrichment: runtime.class_start_times_enrichment,
    entry_go_times_enrichment: runtime.entry_go_times_enrichment,
    entry_go_times_go_time_updates: runtime.entry_go_times_go_time_updates,
    entry_go_times_skip_reasons: runtime.entry_go_times_skip_reasons,
    fallback_go_times_created: runtime.fallback_go_times_created,
    airtable_runtime_mirror: summarizeStep5Mirror(runtime.airtable_runtime_mirror)
  };
}

async function syncCurrentPayload(app, showNo, source, raw, { focusDay = "", upstreamStatus = 200 } = {}) {
  const parser = source === "orders" ? parseOrderRows : parseRingRows;
  const parsedRows = parser(raw);
  const scoped = await applyFocusScopeToCurrentRows(app, showNo, focusDay, parsedRows, source);
  return {
    upstream_status: upstreamStatus,
    raw_rows: parsedRows.length,
    parsed_rows: scoped.rows.length,
    focus_class_scope: scoped.focus_class_scope,
    class_no_resolved: scoped.class_no_resolved,
    ...(await syncRows(app, showNo, scoped.rows))
  };
}

async function runWecStep4RuntimePrepOnly(app, action, query, body) {
  const activeFocus = await getActiveAirtableFocusShowStrict();
  if (!activeFocus.ok) {
    return {
      ok: false,
      status_code: 409,
      action,
      blocker: activeFocus.blocker,
      active_count: activeFocus.active_count || 0,
      runtime_prep_run: false,
      downstream_run: false
    };
  }

  const runTime = new Date().toISOString();
  const runId = text(query.get("run_id") || body.run_id) || `wec-step4-${runTime.replace(/[^0-9A-Za-z]/g, "")}`;
  const focusDay = dateKey(activeFocus.focus_day);
  const focusDayKey = focusDay.replace(/-/g, "");
  const heartbeatId = `${activeFocus.show_no}|${focusDay}|${runId}`;
  const cadenceWindow = text(query.get("cadence_window") || body.cadence_window || "");
  const basePatch = {
    run_id: runId,
    run_time: catalystDateTime(runTime),
    show_no: intValue(activeFocus.show_no),
    focus_day: focusDay,
    focus_day_key: focusDayKey,
    focus_show_record_id: activeFocus.focus_show_record_id,
    is_pause: activeFocus.is_pause,
    is_lock: activeFocus.is_lock,
    live_enrichment: activeFocus.live_enrichment,
    branch: "step4_runtime_prep",
    blocker: "",
    parsed_rows: 0,
    materialized_hs_get_ring_days_rows: 0,
    materialized_ring_day_rows: 0,
    source_sequence_json: JSON.stringify([], null, 2)
  };

  const ringDayRows = await getStoredGetRingDayRows(app, activeFocus.show_no, focusDay);
  const updateScheduleRows = await getStoredUpdateScheduleRows(app, activeFocus.show_no, focusDay);
  const classOogRows = await getStoredClassOogRows(app, activeFocus.show_no, focusDay);
  const preflightSummary = summarizeUpdateSchedulePreflight(updateScheduleRows);
  const identityMisses = step4IdentityMisses({ ringDays: ringDayRows, updateScheduleRows, classOogRows });
  const helperWarnings = step4HelperWarnings();
  const ringStatusRows = ringStatusRowsFromGetRingDays(activeFocus.show_no, focusDay, ringDayRows, runTime);
  const classStartRows = classStartRowsFromUpdateSchedule(activeFocus.show_no, focusDay, updateScheduleRows, runTime);
  const entryGoRows = entryGoRowsFromClassOog(activeFocus.show_no, focusDay, classOogRows);

  let blocker = "";
  if (activeFocus.is_pause) blocker = "focus_show.is_pause";
  else if (!ringDayRows.length) blocker = "missing_current_hs_get_ring_days";
  else if (!updateScheduleRows.length) blocker = "missing_current_hs_update_schedule";
  else if (!classOogRows.length) blocker = "missing_current_hs_class_oog";
  else if (identityMisses.length) blocker = "step4_required_identity_missing";
  else if (!ringStatusRows.length) blocker = "hs_ring_status_source_empty";
  else if (!classStartRows.length) blocker = "hs_class_start_times_source_empty";
  else if (!entryGoRows.length) blocker = "hs_entry_go_times_source_empty";

  const runningPayload = {
    action,
    focus_source: activeFocus.source,
    cadence_window: cadenceWindow,
    trigger_reason: blocker || "current_step1_step2_step3_sources_available",
    runtime_prep_run: !blocker,
    source_counts: {
      hs_get_ring_days: ringDayRows.length,
      hs_update_schedule: updateScheduleRows.length,
      hs_class_oog: classOogRows.length
    },
    preflight: preflightSummary,
    planned_rows: {
      hs_ring_status: ringStatusRows.length,
      hs_class_start_times: classStartRows.length,
      hs_entry_go_times: entryGoRows.length
    },
    identity_misses: identityMisses,
    helper_warnings: helperWarnings,
    downstream_run: false,
    get_orders_run: false,
    get_rings_run: false,
    get_results_run: false,
    alerts_send_run: false,
    wec_alerts_created: 0
  };

  await writeStageHeartbeat(app, heartbeatId, {
    ...basePatch,
    status: blocker ? "fail" : "running",
    blocker,
    parsed_rows: ringDayRows.length + updateScheduleRows.length + classOogRows.length,
    materialized_hs_get_ring_days_rows: ringDayRows.length,
    payload_json: JSON.stringify(runningPayload, null, 2)
  });
  await writeRawAirtableHeartbeat(heartbeatId, {
    ...basePatch,
    run_time: runTime,
    status: blocker ? "fail" : "running",
    blocker,
    parsed_rows: ringDayRows.length + updateScheduleRows.length + classOogRows.length,
    materialized_hs_get_ring_days_rows: ringDayRows.length,
    payload_json: JSON.stringify(runningPayload, null, 2)
  });

  let ringStatusResult = { rows: 0, inserted: 0, updated: 0, skipped: 0 };
  let classStartResult = { rows: 0, inserted: 0, updated: 0, skipped: 0 };
  let entryGoResult = { rows: 0, inserted: 0, updated: 0, skipped: 0 };
  let cleanupResult = {
    hs_ring_status: { deleted: 0, skipped: true },
    hs_class_start_times: { deleted: 0, skipped: true },
    hs_entry_go_times: { deleted: 0, skipped: true }
  };
  let airtableMirrorResult = {
    hs_ring_status: { current_day_count: 0, skipped: true },
    hs_class_start_times: { current_day_count: 0, skipped: true },
    hs_entry_go_times: { current_day_count: 0, skipped: true }
  };
  if (!blocker) {
    ringStatusResult = await upsertSourceRowsFast(app, TABLES.ringStatus, "ring_status_key", ringStatusRows, { showNo: activeFocus.show_no });
    classStartResult = await upsertSourceRowsFast(app, TABLES.classStartTimes, "class_start_key", classStartRows, { showNo: activeFocus.show_no });
    entryGoResult = await upsertSourceRowsFast(app, TABLES.entryGoTimes, "entry_go_key", entryGoRows, { showNo: activeFocus.show_no });
    cleanupResult = {
      hs_ring_status: await deleteCurrentFocusRowsNotInKeys(app, TABLES.ringStatus, "ring_status_key", activeFocus.show_no, focusDay, new Set(ringStatusRows.map((row) => row.ring_status_key))),
      hs_class_start_times: await deleteCurrentFocusRowsNotInKeys(app, TABLES.classStartTimes, "class_start_key", activeFocus.show_no, focusDay, new Set(classStartRows.map((row) => row.class_start_key))),
      hs_entry_go_times: await deleteCurrentFocusRowsNotInKeys(app, TABLES.entryGoTimes, "entry_go_key", activeFocus.show_no, focusDay, new Set(entryGoRows.map((row) => row.entry_go_key)))
    };
    airtableMirrorResult = await syncRawAirtableStep4RuntimeRows(activeFocus.show_no, focusDay, {
      ringStatusRows,
      classStartRows,
      entryGoRows,
      runTime
    });
  }

  const ringStatusCount = await countStoredRingStatusRows(app, activeFocus.show_no, focusDay);
  const classStartCount = await countStoredClassStartRows(app, activeFocus.show_no, focusDay);
  const entryGoCount = await countStoredEntryGoRows(app, activeFocus.show_no, focusDay);
  if (!blocker && !ringStatusCount) blocker = "hs_ring_status_materialization_empty";
  if (!blocker && !classStartCount) blocker = "hs_class_start_times_materialization_empty";
  if (!blocker && !entryGoCount) blocker = "hs_entry_go_times_materialization_empty";
  if (!blocker && airtableMirrorResult.hs_ring_status.skipped) blocker = "airtable_hs_ring_status_mirror_skipped";
  if (!blocker && airtableMirrorResult.hs_class_start_times.skipped) blocker = "airtable_hs_class_start_times_mirror_skipped";
  if (!blocker && airtableMirrorResult.hs_entry_go_times.skipped) blocker = "airtable_hs_entry_go_times_mirror_skipped";
  if (!blocker && airtableMirrorResult.hs_ring_status.current_day_count !== ringStatusCount) blocker = "airtable_hs_ring_status_mirror_count_mismatch";
  if (!blocker && airtableMirrorResult.hs_class_start_times.current_day_count !== classStartCount) blocker = "airtable_hs_class_start_times_mirror_count_mismatch";
  if (!blocker && airtableMirrorResult.hs_entry_go_times.current_day_count !== entryGoCount) blocker = "airtable_hs_entry_go_times_mirror_count_mismatch";

  const finalPayload = {
    ...runningPayload,
    runtime_prep_run: !blocker,
    materialized_rows: {
      hs_ring_status: ringStatusResult,
      hs_class_start_times: classStartResult,
      hs_entry_go_times: entryGoResult
    },
    cleanup: cleanupResult,
    visual_key_samples: {
      ring_status_key: ringStatusRows[0]?.ring_status_key || "",
      ring_visual_key: ringStatusRows[0]?.ring_visual_key || "",
      class_start_key: classStartRows[0]?.class_start_key || "",
      class_visual_key: classStartRows[0]?.class_visual_key || "",
      entry_go_key: entryGoRows[0]?.entry_go_key || "",
      entry_visual_key: entryGoRows[0]?.entry_visual_key || "",
      ring_name_normalized: classStartRows[0]?.ring_name_normalized || entryGoRows[0]?.ring_name_normalized || ringStatusRows[0]?.ring_name_normalized || ""
    },
    destination_counts: {
      hs_ring_status: ringStatusCount,
      hs_class_start_times: classStartCount,
      hs_entry_go_times: entryGoCount
    },
    airtable_mirror: airtableMirrorResult,
    hs_rings_written: false,
    hs_rings_usage: "helper_reference_only",
    blocker
  };
  const finalPatch = {
    ...basePatch,
    status: blocker ? "fail" : "pass",
    blocker,
    parsed_rows: ringDayRows.length + updateScheduleRows.length + classOogRows.length,
    materialized_hs_get_ring_days_rows: ringDayRows.length,
    payload_json: JSON.stringify(finalPayload, null, 2)
  };
  await writeStageHeartbeat(app, heartbeatId, finalPatch);
  await writeRawAirtableHeartbeat(heartbeatId, {
    ...finalPatch,
    run_time: runTime
  });

  return {
    ok: !blocker,
    status_code: blocker ? 500 : 200,
    action,
    blocker,
    heartbeat_id: heartbeatId,
    run_id: runId,
    run_time: runTime,
    focus_source: activeFocus.source,
    focus_show_record_id: activeFocus.focus_show_record_id,
    show_no: activeFocus.show_no,
    focus_day: focusDay,
    is_pause: activeFocus.is_pause,
    is_lock: activeFocus.is_lock,
    live_enrichment: activeFocus.live_enrichment,
    cadence_window: cadenceWindow,
    source_counts: finalPayload.source_counts,
    preflight: preflightSummary,
    planned_rows: finalPayload.planned_rows,
    materialized_rows: finalPayload.materialized_rows,
    cleanup: cleanupResult,
    airtable_mirror: finalPayload.airtable_mirror,
    visual_key_samples: finalPayload.visual_key_samples,
    destination_counts: finalPayload.destination_counts,
    helper_warnings: helperWarnings,
    identity_misses: identityMisses,
    hs_rings_written: false,
    hs_rings_usage: "helper_reference_only",
    wec_alerts_created: 0,
    downstream_run: false,
    get_orders_run: false,
    get_rings_run: false,
    get_results_run: false,
    alerts_send_run: false,
    external_notifications_sent: 0
  };
}

async function runWecStep5LiveEnrichmentOnly(req, app, action, query, body) {
  const activeFocus = await getActiveAirtableFocusShowStrict();
  if (!activeFocus.ok) {
    return {
      ok: false,
      status_code: 409,
      action,
      blocker: activeFocus.blocker,
      active_count: activeFocus.active_count || 0,
      live_enrichment_run: false,
      get_orders_run: false,
      get_rings_run: false
    };
  }

  const focusDay = dateKey(activeFocus.focus_day);
  if (activeFocus.live_enrichment !== true) {
    return {
      ok: true,
      status_code: 200,
      action,
      skipped: true,
      skip_reason: "focus_show.live_enrichment_not_enabled",
      focus_source: activeFocus.source,
      focus_show_record_id: activeFocus.focus_show_record_id,
      show_no: activeFocus.show_no,
      focus_day: focusDay,
      live_enrichment: activeFocus.live_enrichment,
      live_enrichment_run: false,
      upstream_requests: 0,
      get_orders_run: false,
      get_rings_run: false,
      get_results_run: false,
      step1_run: false,
      step2_run: false,
      step3_run: false,
      step4_run: false,
      alerts_run: false,
      output_run: false,
      external_notifications_sent: 0
    };
  }

  const runTime = new Date().toISOString();
  const runId = text(query.get("run_id") || body.run_id) || `wec-step5-${runTime.replace(/[^0-9A-Za-z]/g, "")}`;
  const focusDayKey = focusDay.replace(/-/g, "");
  const heartbeatId = `${activeFocus.show_no}|${focusDay}|${runId}`;
  const cadenceWindow = text(query.get("cadence_window") || body.cadence_window || "");
  const context = createWorkflowContext();
  const basePatch = {
    run_id: runId,
    run_time: catalystDateTime(runTime),
    show_no: intValue(activeFocus.show_no),
    focus_day: focusDay,
    focus_day_key: focusDayKey,
    focus_show_record_id: activeFocus.focus_show_record_id,
    is_pause: activeFocus.is_pause,
    is_lock: activeFocus.is_lock,
    live_enrichment: activeFocus.live_enrichment,
    branch: "step5_live_enrichment",
    blocker: "",
    parsed_rows: 0,
    materialized_hs_get_ring_days_rows: 0,
    materialized_ring_day_rows: 0,
    source_sequence_json: JSON.stringify([], null, 2)
  };

  const runningPayload = {
    action,
    focus_source: activeFocus.source,
    cadence_window: cadenceWindow,
    live_enrichment_run: true,
    step1_run: false,
    step2_run: false,
    step3_run: false,
    step4_run: false,
    get_orders_run: false,
    get_rings_run: false,
    get_results_run: false,
    alerts_run: false,
    output_run: false
  };

  await writeStageHeartbeat(app, heartbeatId, {
    ...basePatch,
    status: "running",
    payload_json: JSON.stringify(runningPayload, null, 2)
  });
  await writeRawAirtableHeartbeat(heartbeatId, {
    ...basePatch,
    run_time: runTime,
    status: "running",
    payload_json: JSON.stringify(runningPayload, null, 2)
  });

  let blocker = "";
  let rings = null;
  let orders = null;
  let airtableLiveMirror = null;
  let runtimeEnrichment = null;
  let closingDaySignal = null;
  try {
    rings = await fetchStep5LiveSource(req, app, activeFocus.show_no, focusDay, "rings", context);
    orders = {
      source: "orders",
      skipped: true,
      skip_reason: "retired_from_hot_lane_use_get_rings",
      get_run: false,
      upstream_status: null,
      raw_rows: 0,
      parsed_rows: 0,
      source_rows: [],
      catalyst_mirror: { rows: 0, inserted: 0, updated: 0, skipped: 0 },
      cleanup: { deleted: 0, skipped: true, reason: "retired_from_hot_lane" }
    };
    if (!rings.get_run) blocker = "live_source_gate_blocked";
    if (!blocker) {
      if (!(rings.source_rows || []).length) {
        blocker = "live_source_empty";
        const ringsNearClose = isLiveWindowNearClose(rings.live_window);
        if (ringsNearClose) {
          const lastLiveEmptyAt = floridaCatalystDateTime(runTime);
          const catalystHsFocusShow = await updateCatalystHsFocusShowLiveEmpty(app, activeFocus.show_no, focusDay, lastLiveEmptyAt);
          const airtableHsFocusShow = await updateAirtableHsFocusShowLiveEmpty(activeFocus.show_no, focusDay, lastLiveEmptyAt);
          closingDaySignal = {
            signal: "live_source_empty_near_show_end",
            last_live_empty_at: lastLiveEmptyAt,
            catalyst_hs_focus_show: catalystHsFocusShow,
            airtable_hs_focus_show: airtableHsFocusShow,
            focus_show_active_unchanged: true,
            live_enrichment_unchanged: true
          };
        }
      } else {
        airtableLiveMirror = await syncRawAirtableStep5LiveRows(activeFocus.show_no, focusDay, {
          getRingsRows: rings.source_rows || [],
          getOrdersRows: orders.source_rows || []
        });
        if (airtableLiveMirror.hs_get_rings.skipped || airtableLiveMirror.hs_get_orders.skipped) {
          blocker = "airtable_live_mirror_skipped";
        }
      }
    }
    if (!blocker) {
      runtimeEnrichment = await enrichStep5RuntimeRows(app, activeFocus.show_no, focusDay, {
        getRingsRows: rings.source_rows || [],
        getOrdersRows: orders.source_rows || [],
        runTime
      });
    }
  } catch (error) {
    blocker = String(error?.message || error);
  }

  const finalRuntimeEnrichment = summarizeStep5RuntimeEnrichment(runtimeEnrichment);
  const finalAirtableLiveMirror = summarizeStep5Mirror(airtableLiveMirror);
  const finalPayload = {
    ...runningPayload,
    live_enrichment_run: !blocker,
    upstream_requests: context.upstreamRequests,
    source_sequence: context.sourceSequence,
    get_rings_run: Boolean(rings?.get_run),
    get_orders_run: Boolean(orders?.get_run),
    get_rings: rings ? { ...rings, source_rows: undefined } : null,
    get_orders: orders ? { ...orders, source_rows: undefined } : null,
    catalyst_live_mirror_counts: {
      hs_get_rings: rings?.source_rows?.length || 0,
      hs_get_orders: orders?.source_rows?.length || 0
    },
    airtable_live_mirror: finalAirtableLiveMirror,
    runtime_enrichment: finalRuntimeEnrichment,
    closing_day_signal: closingDaySignal,
    fallback_go_times_created: runtimeEnrichment?.fallback_go_times_created || 0,
    step1_run: false,
    step2_run: false,
    step3_run: false,
    step4_run: false,
    get_results_run: false,
    alerts_run: false,
    output_run: false,
    external_notifications_sent: 0,
    blocker
  };
  const finalPatch = {
    ...basePatch,
    status: blocker ? "fail" : "pass",
    blocker,
    parsed_rows: (rings?.parsed_rows || 0) + (orders?.parsed_rows || 0),
    source_sequence_json: JSON.stringify(context.sourceSequence || [], null, 2),
    payload_json: JSON.stringify(finalPayload, null, 2)
  };
  await writeStageHeartbeat(app, heartbeatId, finalPatch);
  await writeRawAirtableHeartbeat(heartbeatId, {
    ...finalPatch,
    run_time: runTime
  });

  return {
    ok: !blocker,
    status_code: blocker ? 500 : 200,
    action,
    blocker,
    heartbeat_id: heartbeatId,
    run_id: runId,
    run_time: runTime,
    focus_source: activeFocus.source,
    focus_show_record_id: activeFocus.focus_show_record_id,
    show_no: activeFocus.show_no,
    focus_day: focusDay,
    live_enrichment: activeFocus.live_enrichment,
    cadence_window: cadenceWindow,
    upstream_requests: context.upstreamRequests,
    get_rings_run: Boolean(rings?.get_run),
    get_orders_run: Boolean(orders?.get_run),
    get_results_run: false,
    catalyst_live_mirror_counts: finalPayload.catalyst_live_mirror_counts,
    airtable_live_mirror: finalAirtableLiveMirror,
    runtime_enrichment: finalRuntimeEnrichment,
    fallback_go_times_created: finalPayload.fallback_go_times_created,
    step1_run: false,
    step2_run: false,
    step3_run: false,
    step4_run: false,
    alerts_run: false,
    output_run: false,
    external_notifications_sent: 0
  };
}

async function fetchAndSyncRingDaySchedule(req, app, showNo, ringDayRow, context) {
  const upstreamResponse = await upstream(req, "/update_schedule.php", {
    method: "POST",
    showNo,
    body: new URLSearchParams({ show_no: showNo, ring_day_no: ringDayRow.ring_day_no }).toString(),
    context
  });
  const rows = parseRingDayScheduleRows(upstreamResponse.raw, showNo, ringDayRow.ring_day_no)
    .map((row) => ({
      ...row,
      ring_no: ringDayRow.ring_no,
      ring_name: ringDayRow.ring_name,
      day_label: ringDayRow.day_label
    }));
  return {
    ring_day_no: ringDayRow.ring_day_no,
    ring_no: ringDayRow.ring_no,
    ring_name: ringDayRow.ring_name,
    day_label: ringDayRow.day_label,
    upstream_status: upstreamResponse.status,
    parsed_rows: rows.length,
    ...(await syncRows(app, showNo, rows))
  };
}

async function fetchAndSyncUpdateScheduleOnly(req, app, showNo, ringDayRow, context, { replace = false, syncRawAirtableMirror = false, focusDay = "", heartbeatId = "", runId = "" } = {}) {
  const upstreamResponse = await upstream(req, "/update_schedule.php", {
    method: "POST",
    showNo,
    body: new URLSearchParams({ show_no: showNo, ring_day_no: ringDayRow.ring_day_no }).toString(),
    context
  });
  const rows = assignUpdateScheduleKeys(parseRingDayScheduleRows(upstreamResponse.raw, showNo, ringDayRow.ring_day_no)
    .map((row) => ({
      ...row,
      ring_no: ringDayRow.ring_no,
      ring_name: ringDayRow.ring_name,
      day_label: ringDayRow.day_label,
      source_endpoint: "update_schedule.php"
    })));
  const preflightSummary = summarizeUpdateSchedulePreflight(rows);
  const activeKeys = rows.map((row) => text(row.update_schedule_key)).filter(Boolean);
  const result = await importUpdateScheduleOnly(app, showNo, rows);
  const nonClassCleanup = await deleteUpdateScheduleNonClassRowsForRingDay(app, showNo, focusDay || ringDayRow.iso_date || ringDayRow.focus_day, ringDayRow.ring_day_no);
  const rawAirtableMirror = syncRawAirtableMirror
    ? await syncRawAirtableUpdateScheduleRows(showNo, focusDay, rows.map((row) => ({ ...row, show_no: row.show_no || showNo })), { heartbeatId, runId })
    : {
        airtable_hs_update_schedule_rows: 0,
        airtable_hs_update_schedule_upserts: 0,
        skipped: true
      };
  const rawAirtableNonClassCleanup = syncRawAirtableMirror
    ? await deleteRawAirtableUpdateScheduleNonClassRows(showNo, focusDay || ringDayRow.iso_date || ringDayRow.focus_day, ringDayRow.ring_day_no)
    : { scanned: 0, deleted: 0, skipped: true };
  const stale = replace
    ? await deleteUpdateScheduleStaleForRingDay(app, showNo, ringDayRow.ring_day_no, activeKeys)
    : { scanned: 0, deleted: 0, skipped: true };
  return {
    ring_day_no: ringDayRow.ring_day_no,
    ring_no: ringDayRow.ring_no,
    ring_name: ringDayRow.ring_name,
    day_label: ringDayRow.day_label,
    upstream_status: upstreamResponse.status,
    parsed_rows: rows.length,
    raw_schedule_rows: preflightSummary.raw_schedule_rows,
    preflight_rows: preflightSummary.preflight_rows,
    non_preflight_rows: preflightSummary.non_preflight_rows,
    preflight_reasons: preflightSummary.preflight_reasons,
    counters: {
      rows: result.rows,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped
    },
    raw_airtable_mirror: rawAirtableMirror,
    non_class_cleanup: nonClassCleanup,
    raw_airtable_non_class_cleanup: rawAirtableNonClassCleanup,
    stale
  };
}

function classStartRowFromScheduleRow(row, focusDay) {
  const classStartTime = classStartTimeFromText(row.class_time_text);
  if (!focusDay || intOrNull(row.class_no) <= 0 || !classStartTime) return null;
  return {
    class_start_key: `${row.show_no}|${focusDay}|${row.ring_day_no}|${row.class_no}`,
    show_no: row.show_no,
    focus_day: focusDay,
    ring_day_no: row.ring_day_no,
    ring_no: row.ring_no,
    ring_name: row.ring_name,
    class_no: row.class_no,
    class_name: row.class_name,
    class_start_time: classStartTime,
    entry_count: row.entry_count
  };
}

function cleanRowForDatastore(row) {
  const clean = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined && value !== null && value !== "") clean[key] = value;
  }
  return clean;
}

async function upsertClassStartRowsFast(app, showNo, focusDay, rows) {
  const table = app.datastore().table(TABLES.classStartTimes);
  const incoming = rows
    .map((row) => classStartRowFromScheduleRow(row, focusDay))
    .filter(Boolean)
    .map(cleanRowForDatastore);
  if (!incoming.length) return { rows: 0, inserted: 0, updated: 0 };

  const existingQuery = [
    "SELECT ROWID, class_start_key, show_no, focus_day, ring_day_no, ring_no, ring_name, class_no, class_name, class_start_time, entry_count",
    `FROM ${TABLES.classStartTimes}`,
    `WHERE show_no = ${zcqlValue(showNo)} AND focus_day = ${zcqlValue(focusDay)}`,
    "LIMIT 300"
  ].join(" ");
  const existingRows = (await app.zcql().executeZCQLQuery(existingQuery) || [])
    .map((item) => item?.[TABLES.classStartTimes])
    .filter(Boolean);
  const existingByKey = new Map(existingRows.map((row) => [text(row.class_start_key), row]));
  const activeKeys = new Set(incoming.map((row) => text(row.class_start_key)).filter(Boolean));
  const inserts = [];
  const updates = [];
  for (const row of incoming) {
    const existing = existingByKey.get(text(row.class_start_key))
      || await findOne(app, TABLES.classStartTimes, { class_start_key: row.class_start_key });
    if (existing?.ROWID) {
      const changed = Object.entries(row).some(([key, value]) => text(existing[key]) !== text(value));
      if (changed) {
        const { class_start_key, show_no, focus_day, ...mutable } = row;
        updates.push({ ...mutable, ROWID: existing.ROWID });
      }
    } else {
      inserts.push(row);
    }
  }

  let inserted = 0;
  let updated = 0;
  for (let index = 0; index < inserts.length; index += 100) {
    const batch = inserts.slice(index, index + 100);
    if (batch.length) {
      await table.insertRows(batch);
      inserted += batch.length;
    }
  }
  for (let index = 0; index < updates.length; index += 100) {
    const batch = updates.slice(index, index + 100);
    if (batch.length) {
      await table.updateRows(batch);
      updated += batch.length;
    }
  }
  const staleIds = existingRows
    .filter((row) => !activeKeys.has(text(row.class_start_key)))
    .map((row) => row.ROWID)
    .filter(Boolean);
  let deleted = 0;
  for (let index = 0; index < staleIds.length; index += 100) {
    const batch = staleIds.slice(index, index + 100);
    if (batch.length) {
      await table.deleteRows(batch);
      deleted += batch.length;
    }
  }
  return { rows: incoming.length, inserted, updated, deleted };
}

async function fetchAndSyncRingDayScheduleFast(req, app, showNo, ringDayRow, focusDay, context, { dryRun = false } = {}) {
  const upstreamResponse = await upstream(req, "/update_schedule.php", {
    method: "POST",
    showNo,
    body: new URLSearchParams({ show_no: showNo, ring_day_no: ringDayRow.ring_day_no }).toString(),
    context
  });
  const rows = parseRingDayScheduleRows(upstreamResponse.raw, showNo, ringDayRow.ring_day_no)
    .map((row) => ({
      ...row,
      ring_no: ringDayRow.ring_no,
      ring_name: ringDayRow.ring_name,
      day_label: ringDayRow.day_label
    }));
  return {
    ring_day_no: ringDayRow.ring_day_no,
    ring_no: ringDayRow.ring_no,
    ring_name: ringDayRow.ring_name,
    day_label: ringDayRow.day_label,
    upstream_status: upstreamResponse.status,
    parsed_rows: rows.length,
    class_start_times: dryRun
      ? { rows: rows.map((row) => classStartRowFromScheduleRow(row, focusDay)).filter(Boolean).length, inserted: 0, updated: 0, dry_run: true }
      : await upsertClassStartRowsFast(app, showNo, focusDay, rows)
  };
}

async function fetchAndSyncSelectedDaysFast(req, app, showNo, context, { focusDay, mode, offset = 0, limit = 12, useStoredRingDays = true, dryRun = false } = {}) {
  let upstreamResponse = { status: null };
  let parsedRingDays = { ok: false, rows: [], error: "" };
  let allRingDays = [];
  let selectedAll = [];
  let ringDaySource = "stored_hs_rings";
  if (!useStoredRingDays) {
    upstreamResponse = await upstream(req, "/get_ring_days.php", { method: "GET", showNo, context });
    parsedRingDays = tryParseRingDayRows(upstreamResponse.raw, showNo);
    allRingDays = parsedRingDays.ok ? parsedRingDays.rows : [];
    selectedAll = selectRingDayRows(allRingDays, focusDay, mode);
    ringDaySource = "get_ring_days.php";
  }
  if (!selectedAll.length && mode === "focus") {
    selectedAll = await getStoredRingDayRows(app, showNo, focusDay);
    ringDaySource = "stored_hs_rings";
  }
  const selected = selectedAll.slice(offset, offset + limit);
  const schedules = [];
  for (const ringDayRow of selected) {
    schedules.push(await fetchAndSyncRingDayScheduleFast(req, app, showNo, ringDayRow, focusDay, context, { dryRun }));
  }
  const nextOffset = offset + selected.length;
  return {
    focus_day: focusDay,
    mode,
    ring_day_source: ringDaySource,
    ring_days_upstream_status: upstreamResponse.status,
    ring_days_parse_ok: parsedRingDays.ok,
    ring_days_parse_error: parsedRingDays.error,
    total_ring_days: allRingDays.length,
    selected_ring_days_total: selectedAll.length,
    offset,
    limit,
    selected_ring_days: selected.length,
    next_offset: nextOffset < selectedAll.length ? nextOffset : null,
    has_more: nextOffset < selectedAll.length,
    schedule_rows: schedules.reduce((sum, item) => sum + item.parsed_rows, 0),
    inserted: schedules.reduce((sum, item) => sum + Number(item.class_start_times?.inserted || 0), 0),
    updated: schedules.reduce((sum, item) => sum + Number(item.class_start_times?.updated || 0), 0),
    schedules
  };
}

async function fetchAndSyncSelectedDays(req, app, showNo, context, { focusDay, mode, offset = 0, limit = 12, useStoredRingDays = false } = {}) {
  let upstreamResponse = { status: null };
  let parsedRingDays = { ok: false, rows: [], error: "" };
  let allRingDays = [];
  let selectedAll = [];
  let ringDaySource = "stored_hs_rings";
  if (!useStoredRingDays) {
    upstreamResponse = await upstream(req, "/get_ring_days.php", { method: "GET", showNo, context });
    parsedRingDays = tryParseRingDayRows(upstreamResponse.raw, showNo);
    allRingDays = parsedRingDays.ok ? parsedRingDays.rows : [];
    selectedAll = selectRingDayRows(allRingDays, focusDay, mode);
    ringDaySource = "get_ring_days.php";
  }
  if (!selectedAll.length && mode === "focus") {
    selectedAll = await getStoredRingDayRows(app, showNo, focusDay);
    ringDaySource = "stored_hs_rings";
  }
  const selected = selectedAll.slice(offset, offset + limit);
  const support = await syncRingDayRows(app, showNo, selected);
  const schedules = [];
  for (const ringDayRow of selected) {
    schedules.push(await fetchAndSyncRingDaySchedule(req, app, showNo, ringDayRow, context));
  }
  const nextOffset = offset + selected.length;
  return {
    focus_day: focusDay,
    mode,
    ring_day_source: ringDaySource,
    ring_days_upstream_status: upstreamResponse.status,
    ring_days_parse_ok: parsedRingDays.ok,
    ring_days_parse_error: parsedRingDays.error,
    total_ring_days: allRingDays.length,
    selected_ring_days_total: selectedAll.length,
    offset,
    limit,
    selected_ring_days: selected.length,
    next_offset: nextOffset < selectedAll.length ? nextOffset : null,
    has_more: nextOffset < selectedAll.length,
    support,
    schedule_rows: schedules.reduce((sum, item) => sum + item.parsed_rows, 0),
    schedules
  };
}

async function fetchAndReplaceUpdateScheduleRawFull(req, app, showNo, context, { offset = 0, limit = 8, replace = false } = {}) {
  return fetchUpdateScheduleRawResponses(req, showNo, context, { offset, limit });
}

async function fetchUpdateScheduleRawResponses(req, showNo, context, { offset = 0, limit = 100 } = {}) {
  const ringDays = await getAirtableGetRingDayRows(showNo);
  const selected = ringDays.slice(offset, offset + limit);
  const responses = [];
  for (const ringDayRow of selected) {
    const upstreamResponse = await upstream(req, "/update_schedule.php", {
      method: "POST",
      showNo,
      body: new URLSearchParams({ show_no: showNo, ring_day_no: ringDayRow.ring_day_no }).toString(),
      context
    });
    responses.push({
      show_no: Number(showNo),
      ring_day_no: ringDayRow.ring_day_no,
      ring_no: ringDayRow.ring_no,
      ring_name: ringDayRow.ring_name,
      date_text: ringDayRow.date_text,
      day_label: ringDayRow.day_label,
      airtable_get_ring_days_record_id: ringDayRow.record_id,
      status: upstreamResponse.status,
      content_type: upstreamResponse.contentType,
      raw: upstreamResponse.raw
    });
  }
  const nextOffset = offset + selected.length;
  return {
    source: "update_schedule.php",
    show_no: Number(showNo),
    ring_days: ringDays.length,
    offset,
    limit,
    selected_ring_days: selected.length,
    next_offset: nextOffset < ringDays.length ? nextOffset : null,
    has_more: nextOffset < ringDays.length,
    responses
  };
}

async function fetchUpdateScheduleRawResponse(req, showNo, context, ringDayNo) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  let response;
  const body = new URLSearchParams({ show_no: showNo, ring_day_no: ringDayNo }).toString();
  const headers = {
    "accept": "application/json, text/javascript, */*; q=0.01",
    "accept-encoding": "identity",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    "connection": "close",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "origin": BASE_URL,
    "referer": `${BASE_URL}/schedule.php`,
    "sec-ch-ua": "\"Microsoft Edge\";v=\"149\", \"Chromium\";v=\"149\", \"Not)A;Brand\";v=\"24\"",
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": "\"Android\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": getHeader(req, "user-agent") || DEFAULT_USER_AGENT,
    "x-requested-with": "XMLHttpRequest",
    "cookie": `HscomShowNo=${showNo}`
  };
  let method = "fetch";
  try {
    if (context) context.upstreamRequests++;
    response = await fetch(`${BASE_URL}/update_schedule.php`, {
      method: "POST",
      signal: controller.signal,
      headers,
      body
    });
  } catch (error) {
    if (context) context.upstreamRequests++;
    method = `https-fallback-after-${error.message}`;
    response = await requestText(`${BASE_URL}/update_schedule.php`, {
      method: "POST",
      headers,
      body
    });
  } finally {
    clearTimeout(timeout);
  }
  const raw = await response.text();
  if (!response.ok) throw new Error(`upstream update_schedule.php HTTP ${response.status}: ${raw.slice(0, 200)}`);
  return {
    source: "update_schedule.php",
    show_no: Number(showNo),
    responses: [{
      show_no: Number(showNo),
      ring_day_no: ringDayNo,
      status: response.status,
      content_type: response.headers.get("content-type"),
      method,
      raw
    }]
  };
}

async function fetchAndSyncClassOog(req, app, showNo, classNo, context) {
  const upstreamResponse = await upstream(req, `/class_oog.php?class_no=${encodeURIComponent(classNo)}`, {
    method: "GET",
    showNo,
    context
  });
  const rows = parseClassOogRows(upstreamResponse.raw, showNo, classNo);
  return {
    class_no: classNo,
    upstream_status: upstreamResponse.status,
    parsed_rows: rows.length,
    order_status: rows[0]?.order_status || null,
    ...(await syncOogRows(app, showNo, classNo, rows))
  };
}

async function fetchAndSyncClassOogOnly(req, app, showNo, classNo, context) {
  const upstreamResponse = await upstream(req, `/class_oog.php?class_no=${encodeURIComponent(classNo)}`, {
    method: "GET",
    showNo,
    context
  });
  const rows = parseClassOogRows(upstreamResponse.raw, showNo, classNo);
  const result = await replaceClassOogClassRows(app, showNo, classNo, rows);
  return {
    class_no: classNo,
    upstream_status: upstreamResponse.status,
    parsed_rows: rows.length,
    order_status: rows[0]?.order_status || null,
    rows: result.rows,
    inserted: result.inserted,
    updated: result.updated,
    skipped: result.skipped,
    deleted: result.deleted
  };
}

async function importCountsOnly(app, showNo, rows) {
  const sourceRows = (rows || []).map((row) => countsSourceRow({ ...row, show_no: row.show_no || showNo })).filter(Boolean);
  return upsertSourceRowsFast(app, TABLES.counts, "class_key", sourceRows, { showNo });
}

async function importUpdateScheduleOnly(app, showNo, rows) {
  const keyedRows = assignUpdateScheduleKeys((rows || [])
    .map((row) => ({ ...row, show_no: row.show_no || showNo, source_endpoint: "update_schedule.php" })));
  const sourceRows = keyedRows.map(updateScheduleSourceRow).filter(Boolean);
  return upsertSourceRowsFast(app, TABLES.updateSchedule, "update_schedule_key", sourceRows, { showNo });
}

async function replaceUpdateScheduleOnly(app, showNo, rows) {
  const sourceRows = assignUpdateScheduleKeys((rows || [])
    .map((row) => ({ ...row, show_no: row.show_no || showNo, source_endpoint: "update_schedule.php" })))
    .map(updateScheduleSourceRow)
    .filter(Boolean);
  const activeKeys = new Set(sourceRows.map((row) => text(row.update_schedule_key)).filter(Boolean));
  const result = await upsertSourceRowsFast(app, TABLES.updateSchedule, "update_schedule_key", sourceRows, { showNo });
  const deleted = await deleteSourceRowsNotInKeys(app, TABLES.updateSchedule, "update_schedule_key", showNo, activeKeys);
  return { ...result, deleted: deleted.deleted, active_keys: activeKeys.size };
}

async function importClassOogOnly(app, showNo, rows) {
  const sourceRows = (rows || []).map((row) => classOogSourceRow({ ...row, show_no: row.show_no || showNo })).filter(Boolean);
  return upsertSourceRowsFast(app, TABLES.classOog, "class_oog_key", sourceRows, { showNo });
}

async function deleteSourceRowsNotInKeys(app, tableName, keyField, showNo, activeKeys) {
  const table = app.datastore().table(tableName);
  const existingRows = await getRowsByShow(app, tableName, showNo, {
    limit: tableName === TABLES.classOog ? 10000 : 2000
  });
  const staleIds = existingRows
    .filter((row) => {
      const key = text(row[keyField]);
      return key && !activeKeys.has(key);
    })
    .map((row) => row.ROWID)
    .filter(Boolean);
  let deleted = 0;
  for (let index = 0; index < staleIds.length; index += 100) {
    const batch = staleIds.slice(index, index + 100);
    if (batch.length) {
      await table.deleteRows(batch);
      deleted += batch.length;
    }
  }
  return deleted;
}

async function replaceCountsOnly(app, showNo, rows) {
  const sourceRows = (rows || []).map((row) => countsSourceRow({ ...row, show_no: row.show_no || showNo })).filter(Boolean);
  const result = await upsertSourceRowsFast(app, TABLES.counts, "class_key", sourceRows, { showNo });
  const activeKeys = new Set(sourceRows.map((row) => text(row.class_key)).filter(Boolean));
  return {
    ...result,
    deleted: await deleteSourceRowsNotInKeys(app, TABLES.counts, "class_key", showNo, activeKeys)
  };
}

async function replaceClassOogOnly(app, showNo, rows) {
  const sourceRows = (rows || []).map((row) => classOogSourceRow({ ...row, show_no: row.show_no || showNo })).filter(Boolean);
  const result = await upsertSourceRowsFast(app, TABLES.classOog, "class_oog_key", sourceRows, { showNo });
  const activeKeys = new Set(sourceRows.map((row) => text(row.class_oog_key)).filter(Boolean));
  const existingRows = await getRowsByShow(app, TABLES.classOog, showNo, { limit: 10000 });
  const staleRows = existingRows.filter((row) => {
    const key = text(row.class_oog_key);
    return key && !activeKeys.has(key);
  });
  const confirmedKeys = await classOogConfirmDeleteKeySet(showNo);
  const staleDeletePlan = classOogCatalystDeletePlan(staleRows, confirmedKeys);
  const staleDeleteResult = await executeCatalystClassOogDeletePlan(app, staleDeletePlan);
  return {
    ...result,
    deleted: staleDeleteResult.deleted,
    stale_delete_candidates: staleDeletePlan.candidates,
    stale_delete_skipped: staleDeletePlan.skipped,
    stale_delete_skip_reason: staleDeletePlan.skip_reason
  };
}

async function deleteClassOogKey(app, key) {
  const existing = await findOne(app, TABLES.classOog, { class_oog_key: key });
  if (!existing?.ROWID) return { deleted: 0 };
  const showNo = text(existing.show_no || text(key).split("|")[0]);
  const confirmedKeys = await classOogConfirmDeleteKeySet(showNo, { key });
  const plan = classOogCatalystDeletePlan([existing], confirmedKeys);
  const deletion = await executeCatalystClassOogDeletePlan(app, plan);
  return {
    deleted: deletion.deleted,
    stale_delete_candidates: plan.candidates,
    stale_delete_skipped: plan.skipped,
    stale_delete_skip_reason: plan.skip_reason
  };
}

async function getClassPage(app, showNo, offset, limit) {
  const query = `SELECT ROWID, class_no, class_label FROM ${TABLES.classes} WHERE show_no = ${zcqlValue(showNo)} AND class_no IS NOT NULL LIMIT ${limit} OFFSET ${offset}`;
  const result = await app.zcql().executeZCQLQuery(query);
  return (result || [])
    .map((item) => item?.[TABLES.classes])
    .filter((row) => row?.class_no);
}

async function auditTable(app, tableName, where = {}, { limit = 3, countLimit = 1000 } = {}) {
  const clauses = Object.entries(where)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key} = ${zcqlValue(value)}`);
  const whereSql = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  let total = 0;
  let truncated = false;
  for (let offset = 0; offset < countLimit; offset += 200) {
    const pageLimit = Math.min(200, countLimit - offset);
    const pageQuery = `SELECT ROWID FROM ${tableName}${whereSql} LIMIT ${pageLimit} OFFSET ${offset}`;
    const page = await app.zcql().executeZCQLQuery(pageQuery);
    const rows = (page || []).map((item) => item?.[tableName]).filter(Boolean);
    total += rows.length;
    if (rows.length < pageLimit) break;
    if (offset + pageLimit >= countLimit) truncated = true;
  }
  const sampleQuery = `SELECT * FROM ${tableName}${whereSql} LIMIT ${limit}`;
  const sampleResult = await app.zcql().executeZCQLQuery(sampleQuery);
  const sample = (sampleResult || []).map((item) => item?.[tableName]).filter(Boolean);
  return { table: tableName, where, rows: total, truncated, sample };
}

async function handle(req, res) {
  try {
    setCors(res);
    if ((req.method || "").toUpperCase() === "OPTIONS") return res.end("");
    const earlyQuery = parseQuery(req);
    const earlyAction = earlyQuery.get("action");
    const earlyRingDayNo = earlyQuery.get("ring_day_no");
    if ((earlyAction === "fetch-update-schedule-raw" || earlyAction === "sync-update-schedule-raw-full") && earlyRingDayNo) {
      const context = createWorkflowContext();
      const earlyShowNo = earlyQuery.get("show_no");
      if (!earlyShowNo) return json(res, 400, { ok: false, action: earlyAction, error: "show_no required" });
      const result = await fetchUpdateScheduleRawResponse(req, earlyShowNo, context, earlyRingDayNo);
      return json(res, 200, { ok: true, action: earlyAction, upstream_requests: context.upstreamRequests, ...result });
    }
    if (earlyAction === "probe-horseshowing-egress") {
      const probeShowNo = earlyQuery.get("show_no");
      const target = earlyQuery.get("target") || (probeShowNo ? `${BASE_URL}/show.php?show=${encodeURIComponent(probeShowNo)}` : "");
      if (!target) return json(res, 400, { ok: false, action: earlyAction, error: "target or show_no required" });
      const started = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await requestText(target, {
          signal: controller.signal,
          headers: {
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-encoding": "identity",
            "connection": "close",
            "user-agent": DEFAULT_USER_AGENT
          }
        });
        const raw = await response.text();
        return json(res, 200, {
          ok: true,
          action: earlyAction,
          target,
          status: response.status,
          ms: Date.now() - started,
          raw_length: raw.length,
          preview: raw.slice(0, 200)
        });
      } finally {
        clearTimeout(timeout);
      }
    }
    const app = catalyst.initialize(req);
    const query = parseQuery(req);
    const body = await readBody(req);
    const authHeader = text(getHeader(req, "x-airtable-token") || getHeader(req, "authorization"));
    const bearerToken = authHeader.match(/^Bearer\s+(.+)$/i)?.[1] || "";
    runtimeAirtableToken = text(bearerToken || body.airtable_token || query.get("airtable_token") || AIRTABLE_TOKEN_FALLBACK);
    const action = query.get("action") || body.action || "sync-rings";
    const showNo = text(query.get("show_no") || body.show_no);
    const countsOffset = intOrNull(query.get("counts_offset") || body.counts_offset) || 0;
    const countsLimit = intOrNull(query.get("counts_limit") || body.counts_limit) || 100;
    const daysOffset = intOrNull(query.get("days_offset") || body.days_offset) || 0;
    const daysLimit = intOrNull(query.get("days_limit") || body.days_limit) || 12;
    const classOffset = intOrNull(query.get("class_offset") || body.class_offset) || 0;
    const classLimit = intOrNull(query.get("class_limit") || body.class_limit) || 10;
    const oogOffset = intOrNull(query.get("oog_offset") || body.oog_offset) || 0;
    const oogLimit = intOrNull(query.get("oog_limit") || body.oog_limit) || 8;
    const skipSchedule = boolOrNull(query.get("skip_schedule") || body.skip_schedule) === true;
    const scheduleOnly = boolOrNull(query.get("schedule_only") || body.schedule_only) === true;

    if (action === "wec-mobile-embed-html") {
      return sendText(res, 200, readEmbedAsset("wec-mobile.html"), "text/html; charset=utf-8");
    }

    if (action === "wec-print-embed-html") {
      return sendText(res, 200, readEmbedAsset("wec-print.html"), "text/html; charset=utf-8");
    }

    const canResolveActiveFocusShow = new Set([
      "schedule-json",
      "wec-print-live",
      "wec-schedule-live",
      "reconcile-entry-rollups",
      "wec-mobile-live",
      "wec-rich-live",
      "wec-rich-api",
      "wec-print-layout",
      "wec-print-pdf-url",
      "wec-print-smartbrowz-pdf",
      "prebuild-wec-print-pdf",
      "wec-heartbeat-only",
      "wec-step1-heartbeat-get-ring-days",
      "wec-step2-update-schedule-only",
      "wec-step3-clean-active-class-oog",
      "wec-step3-class-oog",
      "wec-step3-class-oog-probe",
      "wec-step3-class-oog-parse",
      "wec-step4-runtime-prep",
      "wec-step5-live-enrichment",
      "wec-cadence-step1-step2",
      "wec-cadence-step1-step4",
      "wec-sync-helpers",
      "wec-helper-search",
      "barn-board-form-options",
      "barn-board-audit-lines",
      "barn-board-save-hot-patch"
    ]);
    if (!showNo && !canResolveActiveFocusShow.has(action)) {
      return json(res, 400, { ok: false, action, error: "show_no required" });
    }

    if (action === "barn-board-form-options") {
      const result = await buildBarnBoardFormOptions(showNo);
      return json(res, result.ok ? 200 : 400, { action, ...result });
    }

    if (action === "barn-board-audit-lines") {
      const result = await auditBarnBoardLines(showNo, Array.isArray(body.lines) ? body.lines : []);
      return json(res, result.ok ? 200 : 400, { action, ...result });
    }

    if (action === "barn-board-save-hot-patch") {
      const result = await saveBarnBoardHotPatch(showNo, body.line || {});
      return json(res, result.ok ? 200 : 400, { action, ...result });
    }

    if (action === "seed-sample") {
      const rows = [{
        show_no: "14905",
        ring_no: "665",
        ring_day_no: "3834",
        ring_name: "Indoor 4 - Gary",
        day_label: "Saturday, June 6, 2026",
        class_no: "28785",
        class_label: "756) $500 1.10m Amateur Jumper II.2d",
        class_name: "$500 1.10m Amateur Jumper II.2d",
        entry_count: 29,
        class_time_text: "2:48pm",
        current_entry_text: "#2017, United Del Coco<br>In ring at 2:48pm",
        current_entry_no: "2017",
        current_horse: "United Del Coco",
        entries_gone: 7,
        entries_to_go: 22,
        source_endpoint: "seed-sample",
        raw_json: "{\"source\":\"horseshowing_sync seed\"}"
      }];
      return json(res, 200, { ok: true, action, ...(await syncRows(app, "14905", rows)) });
    }

    if (action === "import-results") {
      const focusDay = dateKey(query.get("focus_day") || body.focus_day || body.focus_day_date) || dateKey(body.generated_at) || "2000-01-01";
      const classes = Array.isArray(body.classes) ? body.classes : [];
      const results = Array.isArray(body.results) ? body.results : [];
      if (!classes.length && !results.length) {
        return json(res, 400, { ok: false, action, error: "import-results requires classes or results arrays" });
      }
      const imported = await importResults(app, showNo, focusDay, classes, results);
      return json(res, 200, {
        ok: true,
        action,
        show_no: showNo,
        focus_day: focusDay,
        imported
      });
    }

    if (action === "import-result-classes-only") {
      const focusDay = dateKey(query.get("focus_day") || body.focus_day || body.focus_day_date) || dateKey(body.generated_at) || "2000-01-01";
      const classes = Array.isArray(body.classes) ? body.classes : [];
      if (!classes.length) {
        return json(res, 400, { ok: false, action, error: "import-result-classes-only requires classes array" });
      }
      const imported = await importResultClassesOnly(app, showNo, focusDay, classes);
      return json(res, 200, {
        ok: true,
        action,
        show_no: showNo,
        focus_day: focusDay,
        imported
      });
    }

    if (action === "backfill-source-mirrors") {
      const source = text(query.get("source") || body.source);
      const sources = source ? [source] : ["update_schedule.php", "get_orders.php", "get_rings.php"];
      const limit = intOrNull(query.get("limit") || body.limit) || 100;
      const offset = intOrNull(query.get("offset") || body.offset) || 0;
      return json(res, 200, {
        ok: true,
        action,
        show_no: showNo,
        sources,
        offset,
        ...(await backfillSourceMirrors(app, showNo, sources, limit, offset))
      });
    }

    if (action === "audit-source-mirrors") {
      return json(res, 200, {
        ok: true,
        action,
        show_no: showNo,
        audit: await sourceMirrorAudit(app, showNo)
      });
    }

    if (action === "cleanup-mixed-class-times") {
      const limit = intOrNull(query.get("limit") || body.limit) || 200;
      return json(res, 200, {
        action,
        show_no: showNo,
        ...(await cleanupMixedClassTimes(app, showNo, ["get_orders.php", "get_rings.php"], limit))
      });
    }

    if (action === "datastore-schema") {
      const requested = text(query.get("table") || body.table || "");
      const tables = {
        counts: TABLES.counts,
        class_oog: TABLES.classOog,
        update_schedule: TABLES.updateSchedule,
        class_times: TABLES.classTimes,
        class_start_times: TABLES.classStartTimes,
        entry_go_times: TABLES.entryGoTimes,
        get_orders: TABLES.getOrders,
        get_rings: TABLES.getRings,
        result_classes: TABLES.resultClasses
      };
      const tableName = tables[requested] || requested;
      if (!tableName) return json(res, 400, { ok: false, action, error: "datastore-schema requires table" });
      const table = app.datastore().table(tableName);
      const columns = await table.getAllColumns();
      return json(res, 200, {
        ok: true,
        action,
        table: tableName,
        columns: (columns || []).map((column) => ({
          id: column.column_id,
          name: column.column_name,
          type: column.data_type,
          max_length: column.max_length,
          is_unique: column.is_unique,
          raw: column
        }))
      });
    }

    if (action === "datastore-sample") {
      const requested = text(query.get("table") || body.table || "");
      const tables = {
        counts: TABLES.counts,
        class_oog: TABLES.classOog,
        update_schedule: TABLES.updateSchedule,
        class_times: TABLES.classTimes,
        class_start_times: TABLES.classStartTimes,
        entry_go_times: TABLES.entryGoTimes,
        entries: TABLES.entries
      };
      const tableName = tables[requested] || requested;
      if (!tableName) return json(res, 400, { ok: false, action, error: "datastore-sample requires table" });
      const limit = Math.max(1, Math.min(intOrNull(query.get("limit") || body.limit) || 5, 20));
      const page = await app.datastore().table(tableName).getPagedRows({ maxRows: limit });
      return json(res, 200, {
        ok: true,
        action,
        table: tableName,
        rows: (page?.data || []).length,
        data: page?.data || []
      });
    }

    if (action === "export-mirror-table") {
      const tableKey = text(query.get("table") || body.table);
      const limit = intOrNull(query.get("limit") || body.limit) || 100;
      const offset = intOrNull(query.get("offset") || body.offset) || 0;
      const result = await exportMirrorTable(app, showNo, tableKey, limit, offset);
      return json(res, result.ok ? 200 : 400, { action, ...result });
    }

    if (action === "set-show-config") {
      const focusDay = dateKey(query.get("focus_day") || query.get("focus_day_date") || body.focus_day || body.focus_day_date);
      if (!focusDay) return json(res, 400, { ok: false, action, error: "set-show-config requires focus_day" });
      const patch = cleanPatch({
        show_name: query.get("show_title") || query.get("show_name") || body.show_title || body.show_name,
        start_date: dateKey(query.get("show_start_date") || query.get("start_date") || body.show_start_date || body.start_date),
        end_date: dateKey(query.get("show_end_date") || query.get("end_date") || body.show_end_date || body.end_date),
        focus_day_date: focusDay,
        focus_status_cadence: query.get("focus_status_cadence") || body.focus_status_cadence,
        focus_day_cadence: query.get("focus_day_cadence") || body.focus_day_cadence,
        future_days_cadence: query.get("future_days_cadence") || body.future_days_cadence,
        zoom_cadence: query.get("zoom_cadence") || body.zoom_cadence
      });
      const show = await ensureShow(app, showNo, patch);
      const focusShow = await ensureFocusShow(app, showNo, focusDay, {
        show_title: patch.show_name,
        show_start: patch.start_date,
        show_end: patch.end_date
      });
      return json(res, 200, { ok: true, action, show_no: showNo, focus_day: focusDay, stored: patch, show, focus_show: focusShow });
    }

    if (action === "get-focus-schedule") {
      const focusDay = dateKey(query.get("focus_day") || query.get("focus_day_date") || body.focus_day || body.focus_day_date);
      if (!focusDay) return json(res, 400, { ok: false, action, error: "get-focus-schedule requires focus_day" });
      const rows = await getFocusSchedule(app, showNo, focusDay, { limit: daysLimit || 200, offset: daysOffset || 0 });
      return json(res, 200, {
        ok: true,
        action,
        show_no: showNo,
        focus_day: focusDay,
        rows: rows.length,
        missing_times: rows.filter((row) => !row.class_start_time).length,
        schedule: rows
      });
    }

    if (action === "debug-active-trainers") {
      return json(res, 200, { ok: true, action, show_no: showNo, ...(await getActiveTrainerDebug(app, showNo)) });
    }

    if (action === "debug-show-config") {
      const resolved = await resolveFocusDay(app, showNo, query, body);
      const focusSource = resolved.focus_day ? await resolvedFocusShowSourceConfig(app, showNo, resolved.focus_day) : {};
      const meta = resolved.focus_day ? await metaForFocusRender(app, showNo, resolved.focus_day, query, body) : {};
      return json(res, 200, {
        ok: true,
        action,
        show_no: showNo,
        focus_day: resolved.focus_day,
        config: await getShowConfig(app, showNo),
        focus_source: focusSource,
        resolved: {
          active_trainers: meta.activeTrainers || [],
          trainer_displays: meta.trainerDisplays || {},
          horse_display_count: Object.keys(meta.horseDisplays || {}).length,
          airtable_horse_display_status: meta.airtableHorseDisplayStatus || null
        }
      });
    }

    if (action === "debug-catalyst-columns") {
      const tableName = query.get("table") || body.table || TABLES.classStartTimes;
      const table = app.datastore().table(tableName);
      const columns = await table.getAllColumns();
      return json(res, 200, { ok: true, action, table: tableName, columns });
    }

    if (action === "debug-catalyst-tables") {
      const tables = await app.datastore().getAllTables();
      return json(res, 200, { ok: true, action, tables: tables.map((table) => table.toJSON ? table.toJSON() : table) });
    }

    if (action === "wec-sync-helpers") {
      const recordIds = [
        ...text(query.get("record_ids") || query.get("rec_ids") || body.record_ids || body.rec_ids)
          .split(/[,\s]+/)
          .map(text)
          .filter(Boolean),
        ...(Array.isArray(body.record_ids) ? body.record_ids.map(text).filter(Boolean) : []),
        ...(Array.isArray(body.rec_ids) ? body.rec_ids.map(text).filter(Boolean) : [])
      ];
      const result = await runWecSyncHelpers(app, action, {
        helper: query.get("helper") || body.helper || "all",
        limit: query.get("limit") || body.limit || 25,
        offset: query.get("offset") || body.offset || 0,
        recordIds
      });
      return json(res, result.status_code, result);
    }

    if (action === "wec-helper-search") {
      const result = await runWecHelperSearch(app, action, query, body);
      return json(res, result.status_code, result);
    }

    if (action === "audit-datastore") {
      const resolved = await resolveFocusDay(app, showNo, query, body);
      const focusDay = dateKey(query.get("focus_day") || body.focus_day || resolved.focus_day);
      const classStartWhere = cleanPatch({ show_no: showNo, focus_day: focusDay });
      return json(res, 200, {
        ok: true,
        action,
        show_no: showNo,
        focus_day: focusDay,
        audits: {
          focus_show: await auditTable(app, TABLES.focusShow, { show_no: showNo, focus_day: focusDay }),
          ring_days: await auditTable(app, TABLES.ringDays, { show_no: showNo }),
          update_schedule: await auditTable(app, TABLES.classStartTimes, classStartWhere),
          counts_classes: await auditTable(app, TABLES.classes, { show_no: showNo }),
          class_oog_entries: await auditTable(app, TABLES.entries, { show_no: showNo })
        }
      });
    }

    if (action === "set-active-trainers") {
      const resolved = await resolveFocusDay(app, showNo, query, body);
      const focusDay = resolved.focus_day;
      if (!focusDay) return json(res, 400, { ok: false, action, error: "set-active-trainers requires focus_day" });
      const activeTrainers = splitList(query.get("active_trainers") || body.active_trainers);
      let trainerDisplays = {};
      const rawTrainerDisplays = query.get("trainer_displays") || body.trainer_displays || "";
      if (typeof rawTrainerDisplays === "string" && rawTrainerDisplays.trim()) {
        try {
          trainerDisplays = JSON.parse(rawTrainerDisplays);
        } catch {
          trainerDisplays = Object.fromEntries(splitList(rawTrainerDisplays).map((pair) => {
            const [trainer, display] = pair.split("=");
            return [text(trainer), text(display)];
          }).filter(([trainer, display]) => trainer && display));
        }
      } else if (rawTrainerDisplays && typeof rawTrainerDisplays === "object") {
        trainerDisplays = rawTrainerDisplays;
      }
      const existingConfig = await getFocusShowSourceConfig(app, showNo, focusDay);
      const focusShow = await ensureFocusShow(app, showNo, focusDay, {
        source: JSON.stringify({
          ...existingConfig,
          source: "airtable.trainers",
          active_trainers: activeTrainers,
          trainer_displays: trainerDisplays
        })
      });
      return json(res, 200, { ok: true, action, show_no: showNo, focus_day: focusDay, active_trainers: activeTrainers, trainer_displays: Object.keys(trainerDisplays).length, focus_show: focusShow });
    }

    if (action === "set-hide-classes") {
      const resolved = await resolveFocusDay(app, showNo, query, body);
      const focusDay = resolved.focus_day;
      if (!focusDay) return json(res, 400, { ok: false, action, error: "set-hide-classes requires focus_day" });
      const hideClasses = splitList(query.get("hide_classes") || body.hide_classes);
      const activeTrainers = splitList(query.get("active_trainers") || body.active_trainers);
      let trainerDisplays = {};
      const rawTrainerDisplays = query.get("trainer_displays") || body.trainer_displays || "";
      if (typeof rawTrainerDisplays === "string" && rawTrainerDisplays.trim()) {
        try {
          trainerDisplays = JSON.parse(rawTrainerDisplays);
        } catch {
          trainerDisplays = Object.fromEntries(splitList(rawTrainerDisplays).map((pair) => {
            const [trainer, display] = pair.split("=");
            return [text(trainer), text(display)];
          }).filter(([trainer, display]) => trainer && display));
        }
      } else if (rawTrainerDisplays && typeof rawTrainerDisplays === "object") {
        trainerDisplays = rawTrainerDisplays;
      }
      const existingConfig = await getFocusShowSourceConfig(app, showNo, focusDay);
      const focusShow = await ensureFocusShow(app, showNo, focusDay, {
        source: JSON.stringify({
          source: "airtable.class_hide",
          hide_classes: hideClasses
        })
      });
      return json(res, 200, { ok: true, action, show_no: showNo, focus_day: focusDay, hide_classes: hideClasses, focus_show: focusShow });
    }

    if (action === "sync-hs-horses-helper") {
      const requestedShowNo = text(query.get("show_no") || body.show_no);
      const outputFocus = await getOutputFocusShow(requestedShowNo || showNo);
      if (!outputFocus) return json(res, 400, { ok: false, action, error: "sync-hs-horses-helper requires active focus_show" });
      let trainerDisplays = await getFocusShowTrainerDisplays(app, outputFocus.show_no, outputFocus.focus_day);
      let activeTrainers = await getFocusShowActiveTrainers(app, outputFocus.show_no, outputFocus.focus_day);
      if (!activeTrainers.length) {
        const activeTrainerConfig = await getActiveTrainerConfig(app, outputFocus.show_no);
        activeTrainers = activeTrainerConfig.active_trainers;
        trainerDisplays = {
          ...(trainerDisplays || {}),
          ...(activeTrainerConfig.trainer_displays || {})
        };
      }
      const result = await syncCatalystHorseHelpersFromAirtable(app, activeTrainers, trainerDisplays);
      return json(res, result.ok ? 200 : 500, {
        ok: result.ok,
        action,
        show_no: outputFocus.show_no,
        focus_day: outputFocus.focus_day,
        focus_show_record_id: outputFocus.record_id,
        active_trainers: activeTrainers,
        ...result
      });
    }

    if (action === "set-horse-displays") {
      const resolved = await resolveFocusDay(app, showNo, query, body);
      const focusDay = resolved.focus_day;
      if (!focusDay) return json(res, 400, { ok: false, action, error: "set-horse-displays requires focus_day" });
      let horseDisplays = {};
      let horseDisplayMeta = {};
      const activeTrainers = splitList(query.get("active_trainers") || body.active_trainers);
      let trainerDisplays = {};
      const rawTrainerDisplays = query.get("trainer_displays") || body.trainer_displays || "";
      if (typeof rawTrainerDisplays === "string" && rawTrainerDisplays.trim()) {
        try {
          trainerDisplays = JSON.parse(rawTrainerDisplays);
        } catch {
          trainerDisplays = Object.fromEntries(splitList(rawTrainerDisplays).map((pair) => {
            const [trainer, display] = pair.split("=");
            return [text(trainer), text(display)];
          }).filter(([trainer, display]) => trainer && display));
        }
      } else if (rawTrainerDisplays && typeof rawTrainerDisplays === "object") {
        trainerDisplays = rawTrainerDisplays;
      }
      const raw = query.get("horse_displays") || body.horse_displays || "";
      if (typeof raw === "string" && raw.trim()) {
        try {
          horseDisplays = JSON.parse(raw);
        } catch {
          horseDisplays = Object.fromEntries(splitList(raw).map((pair) => {
            const [horse, display] = pair.split("=");
            return [text(horse), text(display)];
          }).filter(([horse, display]) => horse && display));
        }
      } else if (raw && typeof raw === "object") {
        horseDisplays = raw;
      }
      const rawMeta = query.get("horse_display_meta") || body.horse_display_meta || "";
      if (typeof rawMeta === "string" && rawMeta.trim()) {
        try {
          horseDisplayMeta = JSON.parse(rawMeta);
        } catch {
          horseDisplayMeta = {};
        }
      } else if (rawMeta && typeof rawMeta === "object") {
        horseDisplayMeta = rawMeta;
      }
      const existingConfig = await getFocusShowSourceConfig(app, showNo, focusDay);
      const focusConfig = {
        ...existingConfig,
        source: "airtable.horses",
        horse_display_count: Object.keys(horseDisplays).length,
        horse_display_meta_count: Object.keys(horseDisplayMeta).length,
        ...(activeTrainers.length ? { active_trainers: activeTrainers } : {}),
        ...(Object.keys(trainerDisplays).length ? {
          trainer_displays: {
            ...(existingConfig.trainer_displays || {}),
            ...trainerDisplays
          }
        } : {})
      };
      delete focusConfig.horse_displays;
      delete focusConfig.horse_display_meta;
      const focusShow = await ensureFocusShow(app, showNo, focusDay, {
        source: JSON.stringify(focusConfig)
      });
      const existingShowRaw = showRawConfig((await getShowConfig(app, showNo))?.raw_json);
      const show = await ensureShow(app, showNo, {
        raw_json: JSON.stringify({
          ...existingShowRaw,
          source: "airtable.horses",
          horse_displays: {
            ...(existingShowRaw.horse_displays || {}),
            ...horseDisplays
          },
          horse_display_meta: {
            ...(existingShowRaw.horse_display_meta || {}),
            ...horseDisplayMeta
          }
        }),
        zoom_cadence: Object.entries(horseDisplays)
          .map(([horse, display]) => `${text(horse)}=${text(display)}`)
          .filter((pair) => !pair.endsWith("="))
          .join("|")
      });
      return json(res, 200, { ok: true, action, show_no: showNo, focus_day: focusDay, horse_displays: Object.keys(horseDisplays).length, horse_display_meta: Object.keys(horseDisplayMeta).length, focus_show: focusShow, show });
    }

    if (action === "sync-barn-board-hot-patches") {
      const resolved = await resolveFocusDay(app, showNo, query, body);
      const focusDay = dateKey(query.get("focus_day") || body.focus_day || resolved.focus_day);
      if (!focusDay) return json(res, 400, { ok: false, action, error: "sync-barn-board-hot-patches requires focus_day" });
      const dryRun = boolOrNull(query.get("dry_run") || body.dry_run) === true;
      const result = await syncBarnBoardHotPatches(showNo, focusDay, { dryRun });
      return json(res, 200, { ok: true, action, show_no: showNo, ...result });
    }

    if (action === "schedule-json" || action === "wec-schedule-live") {
      const resolved = await resolveFocusDay(app, showNo, query, body);
      const requestedShowNo = text(query.get("show_no") || body.show_no);
      const airtableFocus = (!requestedShowNo || !resolved.focus_day) ? await getAirtableFocusShow(requestedShowNo) : null;
      const renderShowNo = requestedShowNo || airtableFocus?.show_no || showNo;
      const focusDay = resolved.focus_day || airtableFocus?.focus_day;
      if (!focusDay) return json(res, 400, { ok: false, action, error: `${action} requires focus_day` });
      const meta = await metaForFocusRender(app, renderShowNo, focusDay, query, body);
      const requestedLimit = intOrNull(query.get("limit") || query.get("days_limit") || body.limit || body.days_limit);
      const rows = await buildScheduleJson(app, renderShowNo, focusDay, meta, { limit: Math.min(requestedLimit || 300, 300), offset: daysOffset || 0 });
      return json(res, 200, rows);
    }

    if (action === "wec-print-live") {
      const requestedShowNo = text(query.get("show_no") || body.show_no);
      const outputFocus = await getOutputFocusShow(requestedShowNo || showNo);
      if (!outputFocus) return json(res, 400, { ok: false, action, error: "wec-print-live requires active focus_show" });
      const meta = await metaForFocusRender(app, outputFocus.show_no, outputFocus.focus_day, query, body);
      meta.reconcileEntryGoTimes = false;
      const requestedLimit = intOrNull(query.get("limit") || query.get("days_limit") || body.limit || body.days_limit);
      const allRows = await getStep4RuntimeRows(app, outputFocus.show_no, outputFocus.focus_day, meta);
      const start = Math.max(0, Number(daysOffset || 0));
      const end = start + Math.min(requestedLimit || 300, 300);
      const rows = allRows.slice(start, end);
      rows.runtime_ring_status_rows = allRows.runtime_ring_status_rows;
      if (!rows.length) {
        return json(res, 200, {
          ok: false,
          action,
          show_no: outputFocus.show_no,
          focus_day: outputFocus.focus_day,
          focus_source: outputFocus.source,
          focus_show_record_id: outputFocus.record_id,
          reason: "no_current_focus_rows",
          rows: []
        });
      }
      return json(res, 200, rows);
    }

    if (action === "reconcile-entry-rollups") {
      const requestedShowNo = text(query.get("show_no") || body.show_no);
      const airtableFocus = requestedShowNo ? null : await getAirtableFocusShow("");
      const renderShowNo = requestedShowNo || airtableFocus?.show_no || showNo;
      const resolved = await resolveFocusDay(app, renderShowNo, query, body);
      const focusDay = resolved.focus_day || airtableFocus?.focus_day;
      if (!focusDay) return json(res, 400, { ok: false, action, error: "reconcile-entry-rollups requires focus_day" });
      const meta = await metaForFocusRender(app, renderShowNo, focusDay, query, body);
      const schedule = dedupeFocusScheduleRows(await getFocusSchedule(app, renderShowNo, focusDay, { limit: 300, offset: 0 }))
        .filter((row) => intOrNull(row.class_no) > 0);
      const result = await reconcileEntryGoTimesToCatalyst(app, renderShowNo, focusDay, meta, schedule.map((row) => row.class_no).filter(Boolean));
      return json(res, 200, { ok: true, action, show_no: renderShowNo, focus_day: focusDay, ...result });
    }

    if (action === "wec-mobile-live") {
      const requestedShowNo = text(query.get("show_no") || body.show_no);
      const outputFocus = await getOutputFocusShow(requestedShowNo || showNo);
      if (!outputFocus) return json(res, 400, { ok: false, action, error: "wec-mobile-live requires active focus_show" });
      const meta = await metaForFocusRender(app, outputFocus.show_no, outputFocus.focus_day, query, body);
      meta.reconcileEntryGoTimes = false;
      const rows = await getStep4RuntimeRows(app, outputFocus.show_no, outputFocus.focus_day, meta);
      if (!rows.length) {
        return json(res, 200, {
          ok: false,
          action,
          focus_source: outputFocus.source,
          focus_show_record_id: outputFocus.record_id,
          show_no: outputFocus.show_no,
          focus_day: outputFocus.focus_day,
          reason: "no_current_focus_rows",
          rings: []
        });
      }
      return json(res, 200, { ok: true, action, focus_source: outputFocus.source, focus_show_record_id: outputFocus.record_id, ...buildStep4RuntimeMobilePayload(outputFocus.show_no, outputFocus.focus_day, meta, rows) });
    }

    if (action === "wec-rich-live" || action === "wec-rich-api") {
      const requestedShowNo = text(query.get("show_no") || body.show_no);
      const airtableFocus = requestedShowNo ? null : await getAirtableFocusShow("");
      const renderShowNo = requestedShowNo || airtableFocus?.show_no || showNo;
      const resolved = await resolveFocusDay(app, renderShowNo, query, body);
      const focusDay = resolved.focus_day || airtableFocus?.focus_day;
      if (!focusDay) return json(res, 400, { ok: false, action, error: `${action} requires focus_day` });
      const meta = await metaForFocusRender(app, renderShowNo, focusDay, query, body);
      const requestedLimit = intOrNull(query.get("limit") || body.limit);
      const payload = await buildRichApiPayload(app, renderShowNo, focusDay, meta, { limit: Math.min(requestedLimit || 300, 300), offset: daysOffset || 0 });
      return json(res, 200, { action, focus_source: resolved.source || "airtable.focus_show", ...payload });
    }

    if (action === "wec-print-layout") {
      const requestedShowNo = text(query.get("show_no") || body.show_no);
      const outputFocus = await getOutputFocusShow(requestedShowNo || showNo);
      if (!outputFocus) return json(res, 400, { ok: false, action, error: "wec-print-layout requires active focus_show" });
      const airtableLayout = await getAirtablePrintLayout(outputFocus.show_no, outputFocus.focus_day);
      if (airtableLayout.ok && Array.isArray(airtableLayout.rings) && airtableLayout.rings.length > 0) {
        return json(res, 200, { action, focus_source: outputFocus.source, focus_show_record_id: outputFocus.record_id, ...airtableLayout });
      }
      const meta = await metaForFocusRender(app, outputFocus.show_no, outputFocus.focus_day, query, body);
      meta.reconcileEntryGoTimes = false;
      const requestedLimit = intOrNull(query.get("limit") || query.get("days_limit") || body.limit || body.days_limit);
      const allRows = await getStep4RuntimeRows(app, outputFocus.show_no, outputFocus.focus_day, meta);
      const start = Math.max(0, Number(daysOffset || 0));
      const end = start + Math.min(requestedLimit || 300, 300);
      const rows = allRows.slice(start, end);
      rows.runtime_ring_status_rows = allRows.runtime_ring_status_rows;
      if (!rows.length) {
        return json(res, 200, {
          ok: false,
          action,
          focus_source: outputFocus.source,
          focus_show_record_id: outputFocus.record_id,
          show_no: outputFocus.show_no,
          focus_day: outputFocus.focus_day,
          reason: "no_current_focus_rows",
          print_meta: null,
          rings: [],
          placement: {}
        });
      }
      return json(res, 200, { action, focus_source: outputFocus.source, focus_show_record_id: outputFocus.record_id, ...deriveStep4RuntimePrintLayout(outputFocus.show_no, outputFocus.focus_day, rows) });
    }

    if (action === "wec-print-pdf-url") {
      const requestedShowNo = text(query.get("show_no") || body.show_no);
      const outputFocus = await getOutputFocusShow(requestedShowNo || showNo);
      if (!outputFocus) return json(res, 400, { ok: false, action, error: "wec-print-pdf-url requires active focus_show" });
      return json(res, 200, {
        ok: true,
        action,
        show_no: outputFocus.show_no,
        focus_day: outputFocus.focus_day,
        focus_source: outputFocus.source,
        focus_show_record_id: outputFocus.record_id,
        pdf_url: buildWecPrintPdfUrl(outputFocus.show_no, outputFocus.focus_day)
      });
    }

    if (action === "wec-print-smartbrowz-pdf") {
      const requestedShowNo = text(query.get("show_no") || body.show_no);
      return sendWecPrintSmartBrowzPdf(req, res, app, requestedShowNo || showNo);
    }

    if (action === "prebuild-wec-print-pdf") {
      const requestedShowNo = text(query.get("show_no") || body.show_no);
      const outputFocus = await getOutputFocusShow(requestedShowNo || showNo);
      if (!outputFocus) return json(res, 400, { ok: false, action, error: "prebuild-wec-print-pdf requires active focus_show" });
      const warmed = await warmWecPrintPdf(outputFocus.show_no, outputFocus.focus_day);
      return json(res, warmed.ok ? 200 : 502, {
        ok: warmed.ok,
        action,
        show_no: outputFocus.show_no,
        focus_day: outputFocus.focus_day,
        focus_source: outputFocus.source,
        focus_show_record_id: outputFocus.record_id,
        ...warmed
      });
    }

    if (action === "focus-day-snapshot") {
      const resolved = await resolveFocusDay(app, showNo, query, body);
      const focusDay = resolved.focus_day;
      if (!focusDay) return json(res, 400, { ok: false, action, error: "focus-day-snapshot requires focus_day" });
      return json(res, 200, { ok: true, action, ...(await buildFocusDaySnapshot(app, showNo, focusDay)) });
    }

    if (action === "heartbeat") {
      const resolved = await resolveFocusDay(app, showNo, query, body);
      const focusDay = resolved.focus_day;
      if (!focusDay) return json(res, 400, { ok: false, action, error: "heartbeat requires focus_day/focus_day_date in request or hs_shows.focus_day_date" });
      const context = createWorkflowContext();
      let live = null;
      let orders = null;
      let live_error = null;
      let orders_error = null;
      try {
        live = await fetchAndSyncCurrent(req, app, showNo, "rings", context, { focusDay });
      } catch (error) {
        live_error = String(error?.message || error);
      }
      try {
        orders = await fetchAndSyncCurrent(req, app, showNo, "orders", context, { focusDay });
      } catch (error) {
        orders_error = String(error?.message || error);
      }
      const meta = await metaForFocusRender(app, showNo, focusDay, query, body);
      const rows = await buildScheduleJson(app, showNo, focusDay, meta, { limit: 300, offset: 0 });
      let triggers = [];
      let trigger_error = null;
      return json(res, 200, {
        ok: true,
        action,
        show_no: showNo,
        focus_day: focusDay,
        upstream_requests: context.upstreamRequests,
        live,
        live_error,
        orders,
        orders_error,
        schedule_rows: rows.length,
        created_triggers: triggers.length,
        trigger_error
      });
    }

    if (action === "wec-heartbeat-only") {
      const result = await writeWecHeartbeatOnly(app, action, query, body);
      return json(res, result.status_code || (result.ok ? 200 : 500), result);
    }

    if (action === "wec-step1-heartbeat-get-ring-days") {
      const result = await runWecStep1HeartbeatGetRingDays(req, app, action, query, body);
      return json(res, result.status_code || (result.ok ? 200 : 500), result);
    }

    if (action === "wec-step2-update-schedule-only") {
      const result = await runWecStep2UpdateScheduleOnly(req, app, action, query, body);
      return json(res, result.status_code || (result.ok ? 200 : 500), result);
    }

    if (action === "wec-step3-class-oog") {
      const result = await runWecStep3ClassOogOnly(req, app, action, query, body);
      return json(res, result.status_code || (result.ok ? 200 : 500), result);
    }

    if (action === "wec-step3-class-oog-probe") {
      const result = await runWecStep3ClassOogProbeOnly(req, app, action, query, body);
      return json(res, result.status_code || (result.ok ? 200 : 500), result);
    }

    if (action === "wec-step3-class-oog-parse") {
      const result = await runWecStep3ClassOogParseOnly(app, action, query, body);
      return json(res, result.status_code || (result.ok ? 200 : 500), result);
    }

    if (action === "wec-step3-clean-active-class-oog") {
      const result = await runWecStep3CleanActiveClassOog(req, app, action, query, body);
      return json(res, result.status_code || (result.ok ? 200 : 500), result);
    }

    if (action === "wec-step4-runtime-prep") {
      const result = await runWecStep4RuntimePrepOnly(app, action, query, body);
      return json(res, result.status_code || (result.ok ? 200 : 500), result);
    }

    if (action === "wec-step5-live-enrichment") {
      const result = await runWecStep5LiveEnrichmentOnly(req, app, action, query, body);
      return json(res, result.status_code || (result.ok ? 200 : 500), result);
    }

    if (action === "wec-cadence-step1-step2") {
      const step1 = await runWecStep1HeartbeatGetRingDays(req, app, action, query, body);
      let step2 = null;
      if (step1.ok) {
        const step2Query = new URLSearchParams(query.toString());
        step2Query.set("run_id", `${step1.run_id}-step2`);
        if (!step2Query.get("cadence_window") && step1.cadence_window) {
          step2Query.set("cadence_window", step1.cadence_window);
        }
        step2 = await runWecStep2UpdateScheduleOnly(
          req,
          app,
          action,
          step2Query,
          { ...body, run_id: `${step1.run_id}-step2`, cadence_window: step1.cadence_window || body.cadence_window }
        );
      }
      const ok = Boolean(step1.ok && (!step2 || step2.ok));
      return json(res, ok ? 200 : (step2?.status_code || step1.status_code || 500), {
        ok,
        action,
        focus_source: step1.focus_source,
        focus_show_record_id: step1.focus_show_record_id,
        show_no: step1.show_no,
        focus_day: step1.focus_day,
        cadence_window: step1.cadence_window,
        step1,
        step2,
        get_ring_days_run: Boolean(step1.get_ring_days_run),
        update_schedule_run: Boolean(step2?.update_schedule_run),
        downstream_run: false,
        get_orders_run: false,
        get_rings_run: false,
        alerts_run: false
      });
    }

    if (action === "wec-cadence-step1-step4") {
      const step1 = await runWecStep1HeartbeatGetRingDays(req, app, action, query, body);
      let step2 = null;
      let step3 = null;
      let step4 = null;
      let step3Checkpoint = null;
      let step3CheckpointComplete = false;
      let stopReason = "";

      if (step1.ok) {
        const step2Query = new URLSearchParams(query.toString());
        step2Query.set("run_id", `${step1.run_id}-step2`);
        if (!step2Query.get("cadence_window") && step1.cadence_window) {
          step2Query.set("cadence_window", step1.cadence_window);
        }
        step2 = await runWecStep2UpdateScheduleOnly(
          req,
          app,
          action,
          step2Query,
          { ...body, run_id: `${step1.run_id}-step2`, cadence_window: step1.cadence_window || body.cadence_window }
        );
      } else {
        stopReason = "step1_failed";
      }

      if (step1.ok && step2?.ok) {
        const checkpointBeforeStep3 = await readStep3Checkpoint(app, step1.show_no, step1.focus_day);
        if (checkpointBeforeStep3.payload?.complete === true) {
          step3Checkpoint = checkpointBeforeStep3.payload;
          step3CheckpointComplete = true;
          step3 = {
            ok: true,
            skipped: true,
            reason: "step3_checkpoint_already_complete",
            checkpoint_heartbeat_id: checkpointBeforeStep3.heartbeat_id,
            checkpoint_complete: true,
            checkpoint_checked_class_count: checkpointBeforeStep3.payload.checked_class_count || 0,
            step3_remaining_rows: 0,
            downstream_run: false,
            get_orders_run: false,
            get_rings_run: false,
            alerts_run: false
          };
        } else {
          const step3Query = new URLSearchParams(query.toString());
          step3Query.set("run_id", `${step1.run_id}-step3`);
          if (!step3Query.get("cadence_window") && step1.cadence_window) {
            step3Query.set("cadence_window", step1.cadence_window);
          }
          step3 = await runWecStep3ClassOogOnly(
            req,
            app,
            action,
            step3Query,
            { ...body, run_id: `${step1.run_id}-step3`, cadence_window: step1.cadence_window || body.cadence_window }
          );
          step3CheckpointComplete = step3?.checkpoint_complete === true;
          step3Checkpoint = step3?.checkpoint || null;
        }
      } else if (step1.ok) {
        stopReason = "step2_failed";
      }

      if (step1.ok && step2?.ok && step3?.ok && step3CheckpointComplete) {
        const step4Query = new URLSearchParams(query.toString());
        step4Query.set("run_id", `${step1.run_id}-step4`);
        if (!step4Query.get("cadence_window") && step1.cadence_window) {
          step4Query.set("cadence_window", step1.cadence_window);
        }
        step4 = await runWecStep4RuntimePrepOnly(
          app,
          action,
          step4Query,
          { ...body, run_id: `${step1.run_id}-step4`, cadence_window: step1.cadence_window || body.cadence_window }
        );
      } else if (step1.ok && step2?.ok && step3?.ok) {
        stopReason = "step3_checkpoint_incomplete";
      } else if (step1.ok && step2?.ok) {
        stopReason = "step3_failed";
      }

      if (!stopReason) {
        if (!step1.ok) stopReason = "step1_failed";
        else if (!step2?.ok) stopReason = "step2_failed";
        else if (!step3?.ok) stopReason = "step3_failed";
        else if (!step3CheckpointComplete) stopReason = "step3_checkpoint_incomplete";
        else if (!step4?.ok) stopReason = "step4_failed";
        else stopReason = "step4_complete";
      }

      const ok = Boolean(step1.ok && step2?.ok && step3?.ok && (step3CheckpointComplete ? step4?.ok : true));
      return json(res, ok ? 200 : (step4?.status_code || step3?.status_code || step2?.status_code || step1.status_code || 500), {
        ok,
        action,
        focus_source: step1.focus_source,
        focus_show_record_id: step1.focus_show_record_id,
        show_no: step1.show_no,
        focus_day: step1.focus_day,
        cadence_window: step1.cadence_window,
        stop_reason: stopReason,
        step1_ran: true,
        step1_pass: Boolean(step1.ok),
        step2_ran: Boolean(step2),
        step2_pass: Boolean(step2?.ok),
        step3_ran: Boolean(step3 && !step3.skipped),
        step3_pass: Boolean(step3?.ok),
        step3_checkpoint_complete: step3CheckpointComplete,
        step3_checkpoint: step3Checkpoint,
        step4_ran: Boolean(step4),
        step4_pass: Boolean(step4?.ok),
        step1,
        step2,
        step3,
        step4,
        get_ring_days_run: Boolean(step1.get_ring_days_run),
        update_schedule_run: Boolean(step2?.update_schedule_run),
        class_oog_run: Boolean(step3?.class_oog_run),
        runtime_prep_run: Boolean(step4?.runtime_prep_run),
        downstream_run: false,
        get_orders_run: false,
        get_rings_run: false,
        get_results_run: false,
        alerts_run: false,
        alerts_send_run: false,
        external_notifications_sent: 0
      });
    }

    if (action === "sync-ring-days") {
      const context = createWorkflowContext();
      const focusDay = dateKey(query.get("focus_day") || query.get("focus_day_date") || body.focus_day || body.focus_day_date);
      const result = await fetchAndSyncRingDays(req, app, showNo, context, {
        focusDay,
        refreshExisting: query.get("refresh_existing") === "1" || body.refresh_existing === "1"
      });
      const now = new Date().toISOString();
      const logType = "get_ring_days";
      const logKey = `${logType}|${showNo}|${focusDay || "no-focus-day"}`;
      const logRecord = await airtableCreateRecord(AIRTABLE_WEC_LOGS_TABLE, {
        [AIRTABLE_WEC_LOG_FIELDS.log_key_run]: `${logKey}|${now}`,
        [AIRTABLE_WEC_LOG_FIELDS.log_key]: logKey,
        [AIRTABLE_WEC_LOG_FIELDS.workflow_lanes]: "Core",
        [AIRTABLE_WEC_LOG_FIELDS.log_type]: logType,
        [AIRTABLE_WEC_LOG_FIELDS.check_name]: "sync-ring-days",
        [AIRTABLE_WEC_LOG_FIELDS.show_no]: Number(showNo),
        [AIRTABLE_WEC_LOG_FIELDS.focus_day]: focusDay || null,
        [AIRTABLE_WEC_LOG_FIELDS.status]: "ok",
        [AIRTABLE_WEC_LOG_FIELDS.records_seen]: Number(result.parsed_rows || 0),
        [AIRTABLE_WEC_LOG_FIELDS.records_changed]: Number(result.counters?.rings || 0),
        [AIRTABLE_WEC_LOG_FIELDS.summary]: `sync-ring-days parsed ${result.parsed_rows || 0} ring-day rows`,
        [AIRTABLE_WEC_LOG_FIELDS.payload_json]: JSON.stringify({
          action,
          upstream_requests: context.upstreamRequests,
          source_request_sequence: context.sourceSequence,
          upstream_status: result.upstream_status,
          parsed_rows: result.parsed_rows,
          materialized_ring_day_rows: result.materialized_ring_day_rows,
          refresh_existing: result.refresh_existing,
          counters: result.counters
        }, null, 2),
        [AIRTABLE_WEC_LOG_FIELDS.created_at]: now
      });
      return json(res, 200, { ok: true, action, upstream_requests: context.upstreamRequests, source_request_sequence: context.sourceSequence, wec_log_rec_id: logRecord?.id || null, ...result });
    }

    if (action === "wec-stage0-stage1-get-ring-days") {
      const activeFocus = await getActiveAirtableFocusShowStrict();
      if (!activeFocus.ok) {
        return json(res, 409, {
          ok: false,
          action,
          blocker: activeFocus.blocker,
          active_count: activeFocus.active_count || 0,
          downstream_run: false
        });
      }
      if (activeFocus.is_pause) {
        return json(res, 200, {
          ok: true,
          action,
          status: "paused",
          blocker: "focus_show.is_pause",
          focus_source: activeFocus.source,
          focus_show_record_id: activeFocus.focus_show_record_id,
          show_no: activeFocus.show_no,
          focus_day: activeFocus.focus_day,
          downstream_run: false,
          source_fetch_run: false
        });
      }
      const runTime = new Date().toISOString();
      const runId = text(query.get("run_id") || body.run_id) || `wec-stage0-stage1-${runTime.replace(/[^0-9A-Za-z]/g, "")}`;
      const heartbeatId = `${activeFocus.show_no}|${dateKey(activeFocus.focus_day)}|${runId}`;
      await writeStageHeartbeat(app, heartbeatId, {
        run_id: runId,
        run_time: catalystDateTime(runTime),
        show_no: intValue(activeFocus.show_no),
        focus_day: activeFocus.focus_day,
        focus_day_key: activeFocus.focus_day.replace(/-/g, ""),
        focus_show_record_id: activeFocus.focus_show_record_id,
        is_pause: activeFocus.is_pause,
        is_lock: activeFocus.is_lock,
        live_enrichment: activeFocus.live_enrichment,
        branch: "stage0_stage1_get_ring_days",
        status: "running",
        blocker: "",
        payload_json: JSON.stringify({
          action,
          focus_source: activeFocus.source,
          downstream_run: false
        }, null, 2)
      });
      await writeRawAirtableHeartbeat(heartbeatId, {
        run_id: runId,
        run_time: runTime,
        show_no: intValue(activeFocus.show_no),
        focus_day: activeFocus.focus_day,
        focus_day_key: activeFocus.focus_day.replace(/-/g, ""),
        focus_show_record_id: activeFocus.focus_show_record_id,
        is_pause: activeFocus.is_pause,
        is_lock: activeFocus.is_lock,
        live_enrichment: activeFocus.live_enrichment,
        branch: "stage0_stage1_get_ring_days",
        status: "running",
        blocker: "",
        payload_json: JSON.stringify({
          action,
          focus_source: activeFocus.source,
          downstream_run: false
        }, null, 2)
      });
      const context = createWorkflowContext();
      let result = null;
      let blocker = "";
      try {
        result = await fetchAndSyncRingDays(req, app, activeFocus.show_no, context, {
          focusDay: activeFocus.focus_day,
          refreshExisting: true,
          syncAirtableMirror: false,
          syncRawAirtableMirror: true,
          heartbeatId,
          runId
        });
        blocker = !Number(result.parsed_rows || 0)
          ? "get_ring_days_source_empty"
          : !Number(result.materialized_hs_get_ring_days_rows || 0)
            ? "hs_get_ring_days_materialization_empty"
            : !Number(result.materialized_ring_day_rows || 0)
              ? "hs_ring_days_materialization_empty"
              : "";
      } catch (error) {
        blocker = String(error?.message || error);
        result = {};
      }
      await writeStageHeartbeat(app, heartbeatId, {
        run_id: runId,
        run_time: catalystDateTime(runTime),
        show_no: intValue(activeFocus.show_no),
        focus_day: activeFocus.focus_day,
        focus_day_key: activeFocus.focus_day.replace(/-/g, ""),
        focus_show_record_id: activeFocus.focus_show_record_id,
        is_pause: activeFocus.is_pause,
        is_lock: activeFocus.is_lock,
        live_enrichment: activeFocus.live_enrichment,
        branch: "stage0_stage1_get_ring_days",
        status: blocker ? "fail" : "pass",
        blocker,
        parsed_rows: Number(result.parsed_rows || 0),
        materialized_hs_get_ring_days_rows: Number(result.materialized_hs_get_ring_days_rows || 0),
        materialized_ring_day_rows: Number(result.materialized_ring_day_rows || 0),
        source_sequence_json: JSON.stringify(context.sourceSequence || [], null, 2),
        payload_json: JSON.stringify({
          action,
          focus_source: activeFocus.source,
          upstream_requests: context.upstreamRequests,
          source_request_sequence: context.sourceSequence,
          result
        }, null, 2)
      });
      await writeRawAirtableHeartbeat(heartbeatId, {
        run_id: runId,
        run_time: runTime,
        show_no: intValue(activeFocus.show_no),
        focus_day: activeFocus.focus_day,
        focus_day_key: activeFocus.focus_day.replace(/-/g, ""),
        focus_show_record_id: activeFocus.focus_show_record_id,
        is_pause: activeFocus.is_pause,
        is_lock: activeFocus.is_lock,
        live_enrichment: activeFocus.live_enrichment,
        branch: "stage0_stage1_get_ring_days",
        status: blocker ? "fail" : "pass",
        blocker,
        parsed_rows: Number(result.parsed_rows || 0),
        materialized_hs_get_ring_days_rows: Number(result.materialized_hs_get_ring_days_rows || 0),
        materialized_ring_day_rows: Number(result.materialized_ring_day_rows || 0),
        source_sequence_json: JSON.stringify(context.sourceSequence || [], null, 2),
        payload_json: JSON.stringify({
          action,
          focus_source: activeFocus.source,
          upstream_requests: context.upstreamRequests,
          source_request_sequence: context.sourceSequence,
          result
        }, null, 2)
      });
      return json(res, blocker ? 500 : 200, {
        ok: !blocker,
        action,
        blocker,
        heartbeat_id: heartbeatId,
        run_id: runId,
        run_time: runTime,
        focus_source: activeFocus.source,
        focus_show_record_id: activeFocus.focus_show_record_id,
        show_no: activeFocus.show_no,
        focus_day: activeFocus.focus_day,
        is_pause: activeFocus.is_pause,
        is_lock: activeFocus.is_lock,
        live_enrichment: activeFocus.live_enrichment,
        upstream_requests: context.upstreamRequests,
        source_request_sequence: context.sourceSequence,
        downstream_run: false,
        update_schedule_run: false,
        get_orders_run: false,
        get_rings_run: false,
        ...result
      });
    }

    if (action === "sync-counts") {
      const context = createWorkflowContext();
      const result = await fetchAndSyncCounts(req, app, showNo, context, { offset: countsOffset, limit: countsLimit });
      return json(res, 200, { ok: true, action, upstream_requests: context.upstreamRequests, ...result });
    }

    if (action === "sync-counts-only") {
      const context = createWorkflowContext();
      const result = await fetchAndSyncCountsOnly(req, app, showNo, context, { offset: countsOffset, limit: countsLimit });
      return json(res, 200, { ok: true, action, upstream_requests: context.upstreamRequests, ...result });
    }

    if (action === "import-counts-only") {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) return json(res, 400, { ok: false, action, error: "import-counts-only requires rows array" });
      const result = await importCountsOnly(app, showNo, rows);
      return json(res, 200, { ok: true, action, show_no: showNo, ...result });
    }

    if (action === "import-update-schedule-only") {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) return json(res, 400, { ok: false, action, error: "import-update-schedule-only requires rows array" });
      const result = await importUpdateScheduleOnly(app, showNo, rows);
      return json(res, 200, { ok: true, action, show_no: showNo, ...result });
    }

    if (action === "store-update-schedule-raw") {
      const result = await storeUpdateScheduleRaw(app, {
        ...body,
        show_no: body.show_no || query.get("show_no"),
        focus_day: body.focus_day || query.get("focus_day"),
        ring_day_no: body.ring_day_no || query.get("ring_day_no"),
        ring_no: body.ring_no || query.get("ring_no"),
        ring_name: body.ring_name || query.get("ring_name"),
        day_label: body.day_label || query.get("day_label")
      });
      return json(res, 200, { ok: true, action, ...result });
    }

    if (action === "parse-update-schedule-raw-chunk") {
      const rawRecId = query.get("raw_rec_id") || body.raw_rec_id;
      if (!rawRecId) return json(res, 400, { ok: false, action, error: "parse-update-schedule-raw-chunk requires raw_rec_id" });
      const executeConfirmDelete = query.get("execute_confirm_delete") === "1"
        || body.execute_confirm_delete === "1"
        || body.execute_confirm_delete === true
        || process.env.WEC_EXECUTE_CONFIRM_DELETE === "1";
      const result = await parseStoredUpdateScheduleRawChunk(app, rawRecId, { executeConfirmDelete });
      if (result.status === "BLOCKED") {
        return json(res, 409, { ok: false, action, ...result });
      }
      return json(res, 200, { ok: true, action, ...result });
    }

    if (action === "store-class-oog-raw") {
      const result = await storeClassOogRaw(app, {
        ...body,
        show_no: body.show_no || query.get("show_no"),
        focus_day: body.focus_day || query.get("focus_day"),
        ring_day_no: body.ring_day_no || query.get("ring_day_no"),
        ring_no: body.ring_no || query.get("ring_no"),
        ring_name: body.ring_name || query.get("ring_name"),
        class_no: body.class_no || query.get("class_no"),
        class_label: body.class_label || query.get("class_label"),
        staging_record_id: body.staging_record_id || query.get("staging_record_id")
      });
      return json(res, 200, { ok: true, action, ...result });
    }

    if (action === "parse-class-oog-raw-chunk") {
      const rawRecId = query.get("raw_rec_id") || body.raw_rec_id;
      if (!rawRecId) return json(res, 400, { ok: false, action, error: "parse-class-oog-raw-chunk requires raw_rec_id" });
      const activeTrainers = Array.isArray(body.active_trainers)
        ? body.active_trainers
        : String(query.get("active_trainers") || "").split(",").map(text).filter(Boolean);
      const trainerRecordIds = body.trainer_record_ids && typeof body.trainer_record_ids === "object"
        ? body.trainer_record_ids
        : {};
      const result = await parseStoredClassOogRawChunk(app, rawRecId, { activeTrainers, trainerRecordIds });
      return json(res, 200, { ok: true, action, ...result });
    }

    if (action === "sync-class-start-times-from-locked-staging") {
      const focusDay = dateKey(body.focus_day || query.get("focus_day"));
      if (!showNo) return json(res, 400, { ok: false, action, error: "show_no required" });
      if (!focusDay) return json(res, 400, { ok: false, action, error: "focus_day required" });
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) return json(res, 400, { ok: false, action, error: "sync-class-start-times-from-locked-staging requires rows array" });
      const result = await syncClassStartTimesFromLockedRows(app, showNo, focusDay, rows);
      return json(res, 200, { ok: true, action, ...result });
    }

    if (action === "sync-update-schedule-staging-from-mirror") {
      const resolved = await resolveFocusDay(app, showNo, query, body);
      if (!resolved.focus_day) {
        return json(res, 400, {
          ok: false,
          action,
          error: "sync-update-schedule-staging-from-mirror requires focus_day/focus_day_date in the request or hs_shows.focus_day_date"
        });
      }
      const result = await syncUpdateScheduleStagingFromMirror(app, showNo, resolved.focus_day);
      if (result.status === "BLOCKED") {
        return json(res, 409, { ok: false, action, ...result });
      }
      return json(res, 200, { ok: true, action, ...result });
    }

    if (action === "repair-update-schedule-staging-helper-links") {
      const resolved = await resolveFocusDay(app, showNo, query, body);
      if (!resolved.focus_day) {
        return json(res, 400, {
          ok: false,
          action,
          error: "repair-update-schedule-staging-helper-links requires focus_day/focus_day_date in the request or hs_shows.focus_day_date"
        });
      }
      const result = await repairUpdateScheduleStagingHelperLinks(showNo, resolved.focus_day);
      if (result.status === "BLOCKED") {
        return json(res, 409, { ok: false, action, show_no: showNo, focus_day: resolved.focus_day, ...result });
      }
      return json(res, 200, { ok: true, action, show_no: showNo, focus_day: resolved.focus_day, ...result });
    }

    if (action === "evaluate-update-schedule-staging-helpers") {
      const prioritySortOnly = query.get("priority_sort_only") === "1"
        || query.get("priority-sort-only") === "1"
        || body.priority_sort_only === "1"
        || body.priority_sort_only === 1
        || body.priority_sort_only === true;
      const prioritySortScope = {
        show_no: showNo,
        focus_day: dateKey(query.get("focus_day") || body.focus_day || body.focus_day_date)
      };
      const result = prioritySortOnly
        ? await evaluateUpdateScheduleStagingPrioritySort(prioritySortScope)
        : await evaluateUpdateScheduleStagingHelpers();
      if (result.status === "BLOCKED") {
        return json(res, 409, { ok: false, action, ...result });
      }
      return json(res, 200, { ok: true, action, ...result });
    }

    if (action === "sync-class-oog-staging-from-class-oog") {
      const resolved = await resolveFocusDay(app, showNo, query, body);
      if (!resolved.focus_day) {
        return json(res, 400, {
          ok: false,
          action,
          error: "sync-class-oog-staging-from-class-oog requires focus_day/focus_day_date in the request or hs_shows.focus_day_date"
        });
      }
      const result = await syncClassOogStagingFromClassOog(showNo, resolved.focus_day);
      if (result.status === "BLOCKED") {
        return json(res, 409, { ok: false, action, ...result });
      }
      return json(res, 200, { ok: true, action, ...result });
    }

    if (action === "replace-counts-only") {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) return json(res, 400, { ok: false, action, error: "replace-counts-only requires rows array" });
      const result = await replaceCountsOnly(app, showNo, rows);
      return json(res, 200, { ok: true, action, show_no: showNo, ...result });
    }

    if (action === "sync-rings") {
      const context = createWorkflowContext();
      const resolved = await resolveFocusDay(app, showNo, query, body);
      const result = await fetchAndSyncCurrent(req, app, showNo, "rings", context, { focusDay: resolved.focus_day });
      return json(res, 200, { ok: true, action, upstream_requests: context.upstreamRequests, ...result });
    }

    if (action === "sync-orders") {
      const context = createWorkflowContext();
      const resolved = await resolveFocusDay(app, showNo, query, body);
      const result = await fetchAndSyncCurrent(req, app, showNo, "orders", context, { focusDay: resolved.focus_day });
      return json(res, 200, { ok: true, action, upstream_requests: context.upstreamRequests, ...result });
    }

    if (action === "sync-rings-payload" || action === "sync-orders-payload") {
      const resolved = await resolveFocusDay(app, showNo, query, body);
      const raw = body.raw || body.payload || "";
      if (!raw) return json(res, 400, { ok: false, action, error: `${action} requires raw` });
      const source = action === "sync-orders-payload" ? "orders" : "rings";
      const result = await syncCurrentPayload(app, showNo, source, raw, {
        focusDay: resolved.focus_day,
        upstreamStatus: intOrNull(body.upstream_status) || 200
      });
      return json(res, 200, {
        ok: true,
        action,
        upstream_requests: 0,
        payload_source: source,
        ...result
      });
    }

    if (action === "sync-focus-status" || action === "sync-live") {
      const context = createWorkflowContext();
      const resolved = await resolveFocusDay(app, showNo, query, body);
      const rings = await fetchAndSyncCurrent(req, app, showNo, "rings", context, { focusDay: resolved.focus_day });
      const orders = await fetchAndSyncCurrent(req, app, showNo, "orders", context, { focusDay: resolved.focus_day });
      return json(res, 200, {
        ok: true,
        action,
        canonical_action: "sync-focus-status",
        alias_used: action === "sync-live",
        upstream_requests: context.upstreamRequests,
        rings,
        orders
      });
    }

    if (action === "sync-support") {
      const context = createWorkflowContext();
      const ringDays = await fetchAndSyncRingDays(req, app, showNo, context);
      const counts = await fetchAndSyncCounts(req, app, showNo, context, { offset: countsOffset, limit: countsLimit });
      return json(res, 200, { ok: true, action, upstream_requests: context.upstreamRequests, ringDays, counts });
    }

    if (action === "sync-all") {
      const context = createWorkflowContext();
      const resolved = await resolveFocusDay(app, showNo, query, body);
      const ringDays = await fetchAndSyncRingDays(req, app, showNo, context);
      const counts = await fetchAndSyncCounts(req, app, showNo, context, { offset: countsOffset, limit: countsLimit });
      const rings = await fetchAndSyncCurrent(req, app, showNo, "rings", context, { focusDay: resolved.focus_day });
      const orders = await fetchAndSyncCurrent(req, app, showNo, "orders", context, { focusDay: resolved.focus_day });
      return json(res, 200, { ok: true, action, upstream_requests: context.upstreamRequests, ringDays, counts, rings, orders });
    }

    if (action === "sync-ring-day") {
      const ringDayNo = query.get("ring_day_no") || body.ring_day_no;
      const ringNo = query.get("ring_no") || body.ring_no || "";
      const ringName = query.get("ring_name") || body.ring_name || "";
      const dayLabel = query.get("day_label") || body.day_label || ringDayNo;
      if (!ringDayNo) return json(res, 400, { ok: false, error: "sync-ring-day requires ring_day_no" });
      const context = createWorkflowContext();
      const upstreamResponse = await upstream(req, "/update_schedule.php", {
        method: "POST",
        showNo,
        body: new URLSearchParams({ show_no: showNo, ring_day_no: ringDayNo }).toString(),
        context
      });
      const parsed = parseRingDayScheduleRows(upstreamResponse.raw, showNo, ringDayNo)
        .map((row) => ({ ...row, ring_no: ringNo, ring_name: ringName, day_label: dayLabel }));
      return json(res, 200, { ok: true, action, upstream_requests: context.upstreamRequests, upstream_status: upstreamResponse.status, parsed_rows: parsed.length, ...(await syncRows(app, showNo, parsed)) });
    }

    if (action === "sync-update-schedule-only") {
      const ringDayNo = query.get("ring_day_no") || body.ring_day_no;
      const ringNo = query.get("ring_no") || body.ring_no || "";
      const ringName = query.get("ring_name") || body.ring_name || "";
      const dayLabel = query.get("day_label") || body.day_label || ringDayNo;
      if (!ringDayNo) return json(res, 400, { ok: false, error: "sync-update-schedule-only requires ring_day_no" });
      const context = createWorkflowContext();
      const result = await fetchAndSyncUpdateScheduleOnly(req, app, showNo, {
        ring_day_no: ringDayNo,
        ring_no: ringNo,
        ring_name: ringName,
        day_label: dayLabel
      }, context, {
        replace: query.get("replace") === "1" || body.replace === "1"
      });
      return json(res, 200, { ok: true, action, upstream_requests: context.upstreamRequests, ...result });
    }

    if (action === "sync-update-schedule-raw-full") {
      const context = createWorkflowContext();
      const ringDayNo = query.get("ring_day_no") || body.ring_day_no;
      const result = ringDayNo
        ? await fetchUpdateScheduleRawResponse(req, showNo, context, ringDayNo)
        : await fetchAndReplaceUpdateScheduleRawFull(req, app, showNo, context, {
        offset: Number(query.get("offset") || body.offset || 0),
        limit: Number(query.get("limit") || body.limit || 8),
        replace: query.get("replace") === "1" || body.replace === "1"
      });
      return json(res, 200, { ok: true, action, upstream_requests: context.upstreamRequests, show_no: showNo, ...result });
    }

    if (action === "fetch-update-schedule-raw") {
      const context = createWorkflowContext();
      const ringDayNo = query.get("ring_day_no") || body.ring_day_no;
      const result = ringDayNo
        ? await fetchUpdateScheduleRawResponse(req, showNo, context, ringDayNo)
        : await fetchUpdateScheduleRawResponses(req, showNo, context, {
        offset: Number(query.get("offset") || body.offset || 0),
        limit: Number(query.get("limit") || body.limit || 100)
      });
      return json(res, 200, { ok: true, action, upstream_requests: context.upstreamRequests, ...result });
    }

    if (action === "cleanup-update-schedule-invalid") {
      const result = await deleteInvalidUpdateScheduleRows(app, showNo);
      return json(res, 200, { ok: true, action, show_no: showNo, ...result });
    }

    if (action === "delete-update-schedule-show") {
      const result = await deleteUpdateScheduleRowsByShow(app, showNo);
      return json(res, 200, { ok: true, action, show_no: showNo, ...result });
    }

    if (action === "sync-focus-schedule-fast") {
      const resolved = await resolveFocusDay(app, showNo, query, body);
      if (!resolved.focus_day) {
        return json(res, 400, {
          ok: false,
          action,
          error: "sync-focus-schedule-fast requires focus_day/focus_day_date in the request or hs_shows.focus_day_date"
        });
      }
      const context = createWorkflowContext();
      const result = await fetchAndSyncSelectedDaysFast(req, app, showNo, context, {
        focusDay: resolved.focus_day,
        mode: "focus",
        offset: daysOffset,
        limit: daysLimit,
        useStoredRingDays: query.get("use_stored_ring_days") !== "0" && body.use_stored_ring_days !== "0",
        dryRun: query.get("dry_run") === "1" || body.dry_run === "1"
      });
      return json(res, 200, {
        ok: true,
        complete: !result.has_more,
        action,
        focus_day_source: resolved.source,
        upstream_requests: context.upstreamRequests,
        ...result
      });
    }

    if (action === "sync-class-oog") {
      const classNo = query.get("class_no") || body.class_no;
      if (!classNo) return json(res, 400, { ok: false, action, error: "sync-class-oog requires class_no" });
      const context = createWorkflowContext();
      const result = await fetchAndSyncClassOog(req, app, showNo, classNo, context);
      return json(res, 200, { ok: true, action, upstream_requests: context.upstreamRequests, ...result });
    }

    if (action === "sync-class-oog-only") {
      const classNo = query.get("class_no") || body.class_no;
      if (!classNo) return json(res, 400, { ok: false, action, error: "sync-class-oog-only requires class_no" });
      const context = createWorkflowContext();
      const result = await fetchAndSyncClassOogOnly(req, app, showNo, classNo, context);
      return json(res, 200, { ok: true, action, upstream_requests: context.upstreamRequests, ...result });
    }

    if (action === "import-class-oog-only") {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) return json(res, 400, { ok: false, action, error: "import-class-oog-only requires rows array" });
      const result = await importClassOogOnly(app, showNo, rows);
      return json(res, 200, { ok: true, action, show_no: showNo, ...result });
    }

    if (action === "replace-class-oog-only") {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) return json(res, 400, { ok: false, action, error: "replace-class-oog-only requires rows array" });
      const result = await replaceClassOogOnly(app, showNo, rows);
      return json(res, 200, { ok: true, action, show_no: showNo, ...result });
    }

    if (action === "delete-class-oog-key") {
      const key = text(query.get("key") || body.key);
      if (!key) return json(res, 400, { ok: false, action, error: "delete-class-oog-key requires key" });
      return json(res, 200, { ok: true, action, key, ...(await deleteClassOogKey(app, key)) });
    }

    if (action === "backfill-class-oog-from-entries") {
      const result = await backfillClassOogFromEntries(app, showNo, { offset: classOffset, limit: classLimit });
      return json(res, 200, {
        ok: true,
        action,
        show_no: showNo,
        ...result
      });
    }

    if (action === "repair-class-oog-show-no") {
      const result = await repairClassOogShowNo(app, showNo, { limit: classLimit });
      return json(res, 200, {
        ok: true,
        action,
        show_no: showNo,
        ...result
      });
    }

    if (action === "repair-update-schedule-context") {
      const repairOffset = Number(query.get("offset") || body.offset || 0);
      const repairLimit = Number(query.get("limit") || body.limit || 100);
      const repairRestore = query.get("restore") === "1" || body.restore === "1" || body.restore === true;
      const result = await repairUpdateScheduleContext(app, showNo, { offset: repairOffset, limit: repairLimit, restore: repairRestore });
      return json(res, 200, {
        ok: true,
        action,
        show_no: showNo,
        ...result
      });
    }

    if (action === "clear-update-schedule-check-time") {
      const clearOffset = Number(query.get("offset") || body.offset || 0);
      const clearLimit = Number(query.get("limit") || body.limit || 100);
      const result = await clearUpdateScheduleCheckTime(app, showNo, { offset: clearOffset, limit: clearLimit });
      return json(res, 200, {
        ok: true,
        action,
        show_no: showNo,
        ...result
      });
    }

    if (action === "delete-update-schedule-stale") {
      const activeKeys = Array.isArray(body.active_keys)
        ? body.active_keys
        : text(body.active_keys).split(",").map((item) => item.trim()).filter(Boolean);
      const result = await deleteUpdateScheduleStale(app, showNo, activeKeys);
      return json(res, result.error ? 400 : 200, {
        ok: !result.error,
        action,
        show_no: showNo,
        ...result
      });
    }

    if (action === "audit-update-schedule-duplicates") {
      const auditLimit = intOrNull(query.get("limit") || body.limit) || 5000;
      const auditRows = await getUpdateScheduleRowsForAudit(app, showNo, { limit: auditLimit });
      return json(res, 200, {
        ok: true,
        action,
        show_no: showNo || null,
        table: TABLES.updateSchedule,
        ...updateScheduleDuplicateAudit(auditRows)
      });
    }

    if (action === "sync-oog-page") {
      const context = createWorkflowContext();
      const classes = await getClassPage(app, showNo, classOffset, classLimit);
      const results = [];
      for (const classRow of classes) {
        results.push(await fetchAndSyncClassOog(req, app, showNo, classRow.class_no, context));
      }
      return json(res, 200, {
        ok: true,
        action,
        upstream_requests: context.upstreamRequests,
        class_offset: classOffset,
        class_limit: classLimit,
        classes_seen: classes.length,
        has_more: classes.length === classLimit,
        next_offset: classes.length === classLimit ? classOffset + classLimit : null,
        parsed_rows: results.reduce((sum, item) => sum + item.parsed_rows, 0),
        entries: results.reduce((sum, item) => sum + item.counters.entries, 0),
        results
      });
    }

    if (action === "sync-focus-day" || action === "sync-future-days") {
      const resolved = await resolveFocusDay(app, showNo, query, body);
      if (!resolved.focus_day) {
        return json(res, 400, {
          ok: false,
          action,
          error: `${action} requires focus_day/focus_day_date in the request or hs_shows.focus_day_date`
        });
      }
      const context = createWorkflowContext();
      const result = skipSchedule
        ? {
            focus_day: resolved.focus_day,
            mode: action === "sync-focus-day" ? "focus" : "future",
            ring_day_source: "skipped",
            selected_ring_days: 0,
            has_more: false,
            schedule_rows: 0,
            schedules: []
          }
          : await fetchAndSyncSelectedDays(req, app, showNo, context, {
            focusDay: resolved.focus_day,
            mode: action === "sync-focus-day" ? "focus" : "future",
            offset: daysOffset,
            limit: daysLimit,
            useStoredRingDays: query.get("use_stored_ring_days") === "1" || body.use_stored_ring_days === "1"
          });
      const classStartCleanup = skipSchedule
        ? { scanned: 0, deleted: 0, skipped: true }
        : await cleanupInvalidClassStartTimes(app, showNo, resolved.focus_day);
      if (scheduleOnly) {
        return json(res, 200, {
          ok: true,
          complete: !result.has_more,
          action,
          schedule_only: true,
          focus_day_source: resolved.source,
          upstream_requests: context.upstreamRequests,
          class_start_cleanup: classStartCleanup,
          ...result
        });
      }
      if (action === "sync-focus-day") {
        const meta = await metaForFocusRender(app, showNo, resolved.focus_day, query, body);
        const classOog = await refreshFocusClassOog(req, app, showNo, resolved.focus_day, meta, context, {
          offset: oogOffset,
          limit: Math.max(1, Math.min(oogLimit, 10))
        });
        const rows = await buildScheduleJson(app, showNo, resolved.focus_day, meta, { limit: 300, offset: 0 });
        const audit = classOog.has_more ? null : await auditFocusRender(app, showNo, resolved.focus_day, meta, rows, classOog.class_nos);
        const failed = classOog.failed.length > 0 || !!(audit && audit.missing_active_entries.length > 0);
        const complete = !classOog.has_more && !failed;
        return json(res, failed ? 409 : 200, {
          ok: !failed,
          complete,
          action,
          focus_day_source: resolved.source,
          upstream_requests: context.upstreamRequests,
          class_start_cleanup: classStartCleanup,
          ...result,
          class_oog: classOog,
          schedule_rows: rows.length,
          audit,
          error: failed ? "sync-focus-day failed: class_oog refresh or active-trainer audit failed" : undefined
        });
      }
      return json(res, 200, {
        ok: true,
        action,
        focus_day_source: resolved.source,
        upstream_requests: context.upstreamRequests,
        class_start_cleanup: classStartCleanup,
        ...result
      });
    }

    return json(res, 400, { ok: false, error: `Unknown action: ${action}` });
  } catch (error) {
    return json(res, 500, { ok: false, error: String(error?.message || error), stack: String(error?.stack || "") });
  }
}

module.exports = handle;
if (process.env.NODE_ENV === "test") {
  module.exports.__test__ = {
    buildScheduleJson,
    buildRichApiPayload,
    applyPreparedClassStartMobileFields,
    parseTrainerRollups,
    helperSearchRow,
    helperSearchRankedMatches,
    helperSearchColumnMap,
    normalizeCatalystSearchGroups,
    hydrateHelperSearchMatchFromRows,
    HELPER_SEARCH_CONFIGS
  };
}



