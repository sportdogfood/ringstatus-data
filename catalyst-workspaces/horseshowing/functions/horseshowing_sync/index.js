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
  focusShow: "hs_focus_show",
  days: "hs_days",
  ringDays: "hs_ring_days",
  rings: "hs_rings",
  classes: "hs_classes",
  classTimes: "hs_class_times",
  classStartTimes: "hs_class_start_times",
  entryGoTimes: "hs_entry_go_times",
  updateSchedule: "hs_update_schedule",
  counts: "hs_counts",
  classOog: "hs_class_oog",
  getOrders: "hs_get_orders",
  getRings: "hs_get_rings",
  entries: "hs_entries",
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
const AIRTABLE_TOKEN_FALLBACK = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_WEC_TOKEN || "";
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

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
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
  res.status?.(status);
  res.setHeader?.("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, status, body, contentType = "text/plain; charset=utf-8") {
  setCors(res);
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
  return { cookie: "", upstreamRequests: 0 };
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
  if (focusDay) source.searchParams.set("focus_day", String(focusDay));
  source.searchParams.set("pdf", "1");

  const pdf = new URL(WEC_PDF_WORKER_BASE);
  pdf.searchParams.set("url", source.toString());
  pdf.searchParams.set("filename", `wec-${focusDay || "schedule"}-schedule.pdf`);
  pdf.searchParams.set("waitForSelector", 'html[data-rs-pdf-ready="1"]');
  pdf.searchParams.set("cacheTtl", String(cacheTtl));
  return pdf.toString();
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
  if (intValue(classNo) <= 0) return [resultKey(showNo, row.ring_day_no, row.event_id || row.class_order || row.class_label)];
  return [
    resultKey(showNo, classNo),
    resultKey(showNo, row.ring_no, classNo),
    resultKey(showNo, row.ring_day_no, classNo),
    resultKey(showNo, row.ring_day_no, row.ring_no, classNo)
  ];
}

function assignUpdateScheduleKeys(rows, level = 0) {
  const byKey = new Map();
  const keyedRows = rows.filter((row) => updateScheduleKeyTiers(row).length);
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
  return keyedRows;
}

function updateScheduleSourceRow(row) {
  const classParts = classPartsFromLabel(row.class_label || row.class_name);
  const dateParts = datePartsFromLabel(row.day_label || row.day_text || row.date_text);
  const key = text(row.update_schedule_key) || updateScheduleKeyTiers(row)[0];
  if (!key) return null;
  const timeText = text(row.class_time_text || row.time_text || row.time);
  return {
    update_schedule_key: key,
    show_no: intValue(row.show_no),
    ring_day_no: intValue(row.ring_day_no),
    ring_no: intValue(row.ring_no),
    ring_name: text(row.ring_name),
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

function getOrdersSourceRow(row) {
  const classParts = classPartsFromLabel(row.class_label || row.class_name);
  const key = resultKey(row.show_no, row.ring_no, row.ring_day_no, row.class_no || row.class_label);
  if (!key) return null;
  return {
    get_orders_key: key,
    show_no: intValue(row.show_no),
    ring_no: intValue(row.ring_no),
    ring_day_no: intValue(row.ring_day_no),
    ring_name: text(row.ring_name),
    day_text: text(row.day_label || row.day_text),
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

function getRingsSourceRow(row) {
  const classParts = classPartsFromLabel(row.class_label || row.class_name);
  const key = resultKey(row.show_no, row.ring_no, row.ring_day_no, row.class_no || row.class_label);
  if (!key) return null;
  return {
    get_rings_key: key,
    show_no: intValue(row.show_no),
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
  const classParts = classPartsFromLabel(classLabel);
  const key = resultKey(row.show_no, row.class_no, row.current_entry_no || row.entry_no);
  if (!key) return null;
  return {
    class_oog_key: key,
    ring: text(row.ring || row.ring_name || classTimeRow?.ring_name),
    ring_no: intValue(row.ring_no || classTimeRow?.ring_no),
    ring_day_no: intValue(row.ring_day_no || classTimeRow?.ring_day_no),
    class_order: intValue(row.class_order || classTimeRow?.class_order),
    class_no: intValue(row.class_no),
    class_label: classLabel,
    class_number: intValue(row.class_number || classParts.classNumber),
    class_payout: text(row.class_payout || classParts.classPayout),
    class_name: text(row.class_name || classParts.className),
    entry_order: intValue(row.entry_order),
    entry_no: intValue(row.current_entry_no || row.entry_no),
    horse: text(row.current_horse || row.horse),
    rider: text(row.rider),
    trainer: text(row.trainer),
    source_endpoint: "class_oog.php",
    source_payload: sourcePayload(row)
  };
}

async function writeSourceMirrorRow(app, row) {
  if (row.source_endpoint === "update_schedule.php") {
    const sourceRow = updateScheduleSourceRow(row);
    if (!sourceRow) return null;
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

  const existingByKey = new Map();
  if (showNo) {
    const existingRows = await getRowsByShow(app, tableName, showNo, {
      limit: tableName === TABLES.classOog ? 10000 : 2000
    });
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
  const table = app.datastore().table(TABLES.classOog);
  const existingRows = await getRowsByShow(app, TABLES.classOog, showNo, { limit: 10000 });
  const classNoText = text(classNo);
  const staleIds = existingRows
    .filter((row) => {
      const key = text(row.class_oog_key);
      const keyClassNo = key.split("|")[1] || "";
      return key
        && (text(row.class_no) === classNoText || keyClassNo === classNoText)
        && !activeKeys.has(key);
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
  return { ...result, deleted };
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
  if (!focusDay) return { classNos: new Set(), byRingDayAndName: new Map() };
  const schedule = dedupeFocusScheduleRows(await getFocusSchedule(app, showNo, focusDay, { limit: 300, offset: 0 }))
    .filter((row) => intOrNull(row.class_no) > 0);
  const classNos = new Set(schedule.map((row) => String(row.class_no || "")).filter(Boolean));
  const classesByNo = await getClassesForSchedule(app, showNo, [...classNos]);
  const byRingDayAndName = new Map();
  for (const row of schedule) {
    const classNo = String(row.class_no || "");
    if (!classNo) continue;
    const classRow = classesByNo.get(classNo) || {};
    const names = [
      classRow.class_label,
      classRow.class_name,
      row.class_name,
      classDisplayFromLabel(classRow, row.class_name)
    ].map(classNameKey).filter(Boolean);
    for (const name of [...new Set(names)]) {
      byRingDayAndName.set(`${text(row.ring_day_no)}|${name}`, classNo);
      byRingDayAndName.set(`${text(row.ring_no)}|${name}`, classNo);
      byRingDayAndName.set(`|${name}`, classNo);
    }
  }
  return { classNos, byRingDayAndName };
}

async function applyFocusScopeToCurrentRows(app, showNo, focusDay, rows, source) {
  const lookup = await getFocusClassLookup(app, showNo, focusDay);
  const scoped = [];
  const hasFocusClassScope = lookup.classNos.size > 0;
  for (const row of rows) {
    let classNo = text(row.class_no);
    if (!classNo && source === "orders") {
      const name = classNameKey(row.class_label || row.class_name);
      classNo = lookup.byRingDayAndName.get(`${text(row.ring_day_no)}|${name}`)
        || lookup.byRingDayAndName.get(`${text(row.ring_no)}|${name}`)
        || lookup.byRingDayAndName.get(`|${name}`)
        || "";
    }
    const next = classNo ? { ...row, class_no: classNo } : row;
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
    const trainer = text(fields.trainer);
    if (!classNo || !ringDayNo) continue;
    if (activeTrainerSet.size && !activeTrainerSet.has(trainer)) continue;
    const classKey = `${ringDayNo}|${classNo}`;
    const bucket = byClass.get(classKey) || [];
    bucket.push({
      show_no: text(fields.show_no),
      ring_day_no: ringDayNo,
      class_no: classNo,
      entry_no: text(fields.entry_no),
      entry_order: text(fields.entry_order),
      horse: text(fields.horse),
      rider: text(fields.rider),
      trainer
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
    return entryGoTimesByClassFromRecords(
      records.filter((record) =>
        wanted.has(text(record.fields?.class_no)) &&
        text(record.fields?.status).toLowerCase() !== "inactive"
      ),
      activeTrainers
    );
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

async function getLockedStagingSchedule(showNo, focusDay, { limit = 300, offset = 0 } = {}) {
  const showValue = Number.isFinite(Number(showNo)) ? String(Number(showNo)) : airtableFormulaValue(showNo);
  const records = await airtableListRecords("update_schedule_staging", {
    view: "lock_schedule",
    filterByFormula: `AND({show_no}=${showValue},IS_SAME({iso_date},DATETIME_PARSE(${airtableFormulaValue(focusDay)}),'day'))`
  });
  const rows = records
    .map((record) => {
      const fields = record.fields || {};
      const timeText = fieldText(fields, ["time_text", "display_time", "time"]);
      const classStartTime = normalizeClassStartTime(fieldText(fields, ["class_start_time", "time"]) || timeText);
      const className = fieldText(fields, ["class_name", "event_name", "class_label"]);
      const classLabel = fieldText(fields, ["event_name", "class_label", "class_name"]);
      const classNumber = fieldText(fields, ["class_number"]) || classNumberFromLabel({ class_label: classLabel });
      return {
        ROWID: record.id,
        record_id: record.id,
        show_no: fieldText(fields, ["show_no"]) || text(showNo),
        focus_day: dateKey(fieldText(fields, ["focus_day", "iso_date"])) || text(focusDay),
        ring_no: fieldText(fields, ["ring_no"]),
        ring_day_no: fieldText(fields, ["ring_day_no", "days"]),
        ring_name: fieldText(fields, ["ring_display", "ring_name", "ring_names", "ring", "rings"]),
        class_no: fieldText(fields, ["class_no"]),
        class_number: classNumber,
        class_name: className,
        class_label: className,
        class_start_time: classStartTime,
        display_time: fieldText(fields, ["display_time"]) || displayTimeFromStart(classStartTime || timeText),
        entry_count: intOrNull(fields.entry_count),
        manual_group: fieldText(fields, ["manual_grpup", "manual_group"]),
        manual_horse_ids: linkedRecordIds(fields.horses),
        manual_instructions: fieldText(fields, ["manual-instructions", "manual_instructions", "manual instructions"]),
        source: "update_schedule_staging.locked",
        live_source: "update_schedule_staging.locked"
      };
    })
    .filter((row) => intOrNull(row.class_no) > 0 && !isManualRemoveInstruction(row.manual_instructions))
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
  const classNo = text(entry.class_no);
  const entryNo = text(entry.entry_no);
  if (entryNo) return `${showNo}|${focusDay}|${ringDayNo}|${classNo}|${entryNo}`;
  return `${showNo}|${focusDay}|${ringDayNo}|${classNo}|${text(entry.entry_order)}|${text(entry.horse).toLowerCase()}`;
}

function entryGoContext(row) {
  const parts = text(row.entry_go_key).split("|");
  let ringDayNo = text(row.ring_day_no || row.days);
  let classNo = text(row.class_no);
  if (!ringDayNo && parts.length >= 5) {
    ringDayNo = text(parts[2]);
    classNo = classNo || text(parts[3]);
  }
  return { ringDayNo, classNo };
}

async function getCatalystEntryGoTimesForSchedule(app, showNo, focusDay, classNos, activeTrainers = []) {
  const wanted = [...new Set(classNos.filter(Boolean).map(String))].slice(0, 250);
  if (!wanted.length) return new Map();
  const activeTrainerSet = new Set(activeTrainers.map((trainer) => text(trainer)).filter(Boolean));
  const classWhere = wanted.map((classNo) => `class_no = ${zcqlValue(classNo)}`).join(" OR ");
  const query = [
    "SELECT ROWID, entry_go_key, show_no, focus_day, class_no, entry_no, entry_order, horse, rider, trainer, go_time",
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
    const { ringDayNo, classNo } = entryGoContext(row);
    if (!ringDayNo || !classNo) continue;
    const classKey = `${ringDayNo}|${classNo}`;
    const bucket = byClass.get(classKey) || [];
    bucket.push({
      show_no: text(row.show_no),
      ring_day_no: ringDayNo,
      class_no: classNo,
      entry_no: text(row.entry_no),
      entry_order: text(row.entry_order),
      horse: text(row.horse),
      rider: text(row.rider),
      trainer,
      go_time: text(row.go_time)
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
  const entryGoTimesByClass = await getAirtableEntryGoTimesForSchedule(showNo, focusDay, classNos, meta.activeTrainers);
  if (!entryGoTimesByClass.size) return { rows: 0, updated: 0, skipped: 0 };

  const table = app.datastore().table(TABLES.entryGoTimes);
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  for (const entries of entryGoTimesByClass.values()) {
    for (const entry of entries) {
      const key = entryGoKey(showNo, focusDay, entry);
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
  return { rows: [...entryGoTimesByClass.values()].reduce((sum, rows) => sum + rows.length, 0), classes: entryGoTimesByClass.size, inserted, updated, skipped };
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
  const match = raw.match(/^(\d{1,2})(?::?(\d{2}))?(AM|PM|A|P)?$/);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const suffix = match[3] || "";
  if (suffix.startsWith("P") && hour < 12) hour += 12;
  if (suffix.startsWith("A") && hour === 12) hour = 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
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
    barn_name_missing: false
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

function trainerRollupsForEntries(entries, meta) {
  const byTrainer = new Map();
  for (const entry of entries || []) {
    const trainer = text(entry.trainer);
    if (!trainer) continue;
    const trainerDisplay = trainerDisplayName(trainer, meta.trainerDisplays);
    const bucket = byTrainer.get(trainer) || { trainer, trainer_display: trainerDisplay, horses: [] };
    const horse = horseDisplayMeta(entry.horse, meta);
    const entryOrder = text(entry.entry_order);
    if (horse.display) {
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
    const trainerDisplay = text(item.trainer_display || item.trainer);
    if (!trainerDisplay) continue;
    const bucket = byTrainer.get(trainerDisplay) || {
      trainer: text(item.trainer) || trainerDisplay,
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
    byTrainer.set(trainerDisplay, bucket);
  }
  return [...byTrainer.values()].filter((item) => item.horses.length);
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
  const schedule = (await getLockedStagingSchedule(showNo, focusDay, { limit, offset }))
    .filter((row) => intOrNull(row.class_no) > 0);
  const manualHorseDisplaysById = await getManualHorseDisplaysById(
    schedule.flatMap((row) => row.manual_horse_ids || [])
  );
  const classNos = schedule.map((row) => row.class_no).filter(Boolean);
  if (meta.reconcileEntryGoTimes !== false && offset === 0 && !meta.entryGoTimesByClass) {
    await reconcileEntryGoTimesToCatalyst(app, showNo, focusDay, meta, classNos);
  }
  const classesByNo = await getClassesForSchedule(app, showNo, classNos);
  const entryGoTimesByClass = meta.entryGoTimesByClass instanceof Map
    ? meta.entryGoTimesByClass
    : await getCatalystEntryGoTimesForSchedule(app, showNo, focusDay, classNos, meta.activeTrainers);
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
      const classRow = classesByNo.get(String(row.class_no)) || {};
      const liveRow = liveByClass.get(String(row.class_no)) || {};
      const classNumber = classNumberFromLabel(classRow) || text(scheduleRow.class_number);
      const className = text(scheduleRow.manual_group) || classDisplayFromLabel(classRow, scheduleRow.class_name);
      const entries = entryGoTimesByClass.get(`${text(row.ring_day_no)}|${text(row.class_no)}`) || [];
      const manualTrainerRollups = manualTrainerRollupsForHorseIds(row.manual_horse_ids, manualHorseDisplaysById, meta);
      const trainerRollups = manualTrainerRollups.length ? manualTrainerRollups : trainerRollupsForEntries(entries, meta);
      const rollup = horseRollupDisplay(trainerRollups);
      return applyPreparedClassStartMobileFields({
        show_id: showNo,
        show_days_report_title: meta.title,
        show_days_display_date: focusDay,
        show_start_date: meta.showStartDate || "",
        show_end_date: meta.showEndDate || "",
        show_day_key: focusDay,
        ring_number: Number(scheduleRingNo || 9999),
        ring_name: meta.ringDisplays[String(scheduleRingNo)] || ringDisplayFromName(scheduleRingName),
        ring_day_no: scheduleRingDayNo,
        class_group_id: String(scheduleRow.class_no || row.ROWID),
        class_group_sequence: scheduleSortValue(scheduleRow.class_start_time, classNumber),
        group_group_name: className,
        class_no: scheduleRow.class_no,
        class_number: classNumber,
        class_name: className,
        start_display: displayTimeFromStart(scheduleRow.class_start_time),
        class_start_time: scheduleRow.class_start_time,
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
        sched_horses: compactTrainerRollups(trainerRollups)
          .flatMap((item) => item.horses || [])
          .map((horse) => (horse && typeof horse === "object" ? text(horse.display || horse.horse) : text(horse)))
          .filter(Boolean)
          .join("|")
      }, scheduleRow);
    });

  return rows
    .sort((a, b) => (
      Number(a.ring_number || 9999) - Number(b.ring_number || 9999) ||
      Number(a.class_group_sequence || 9999999999) - Number(b.class_group_sequence || 9999999999)
    ));
}

function buildMobileLivePayload(showNo, focusDay, meta, rows) {
  const rings = new Map();
  for (const row of rows || []) {
    const ringNo = text(row.ring_number);
    const ringDisplay = text(row.ring_name) || ringDisplayFromName(row.ring_name);
    const ring = rings.get(ringNo) || {
      ring_no: Number(row.ring_number || 0),
      ring_display: ringDisplay,
      classes: []
    };
    const classNumberText = text(row.class_number);
    const classNameText = text(row.class_name);
    ring.classes.push({
      class_no: Number(row.class_no || 0),
      class_number: classNumberText,
      class_label: classNumberText ? `${classNumberText} - ${classNameText}` : classNameText,
      class_name: classNameText,
      show_start_date: meta.showStartDate || row.show_start_date || "",
      show_end_date: meta.showEndDate || row.show_end_date || "",
      class_time: row.start_display,
      class_start_time: row.class_start_time,
      entry_count: row.entry_count,
      n_gone: row.n_gone,
      n_to_go: row.n_to_go,
      elapsed_seconds: row.elapsed_seconds,
      current_entry_no: row.current_entry_no,
      current_horse: row.current_horse,
      live_source: row.live_source,
      diff_class: text(row.diff_class),
      rollups: compactTrainerRollups(row.trainer_rollups)
    });
    rings.set(ringNo, ring);
  }
  return {
    show_no: showNo,
    show_name: meta.title,
    show_start_date: meta.showStartDate || "",
    show_end_date: meta.showEndDate || "",
    show_focus_date: focusDay,
    last_updated: new Date().toISOString(),
    rings: [...rings.values()].sort((a, b) => Number(a.ring_no || 9999) - Number(b.ring_no || 9999))
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
  const airtableHorseDisplays = await getAirtableHorseDisplayConfig(meta.activeTrainers, meta.trainerDisplays);
  meta.horseDisplays = {
    ...(meta.horseDisplays || {}),
    ...(airtableHorseDisplays.horse_displays || {})
  };
  meta.horseDisplayMeta = {
    ...(meta.horseDisplayMeta || {}),
    ...(airtableHorseDisplays.horse_display_meta || {})
  };
  meta.airtableHorseDisplayStatus = {
    ok: airtableHorseDisplays.ok,
    source: airtableHorseDisplays.source,
    filter_formula: airtableHorseDisplays.filter_formula,
    count: Object.keys(airtableHorseDisplays.horse_displays || {}).length,
    error: airtableHorseDisplays.error || ""
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
    hour12: false
  }).formatToParts(now).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const hour = Number(parts.hour === "24" ? "0" : parts.hour);
  const minute = Number(parts.minute);
  return {
    iso_date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: hour * 60 + minute
  };
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

function splitAliasText(value) {
  return text(value)
    .split(/[,\n|]/)
    .map(text)
    .filter(Boolean);
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
        displays[horse] = display;
        meta[horse] = {
          barn_name: text(fields.barn_name),
          barn_name_missing: !text(fields.barn_name),
          source: "airtable.horses"
        };
        for (const alias of splitAliasText(fields.aka || fields.AKA || fields.alias || fields.aliases)) {
          displays[alias] = display;
          meta[alias] = {
            barn_name: text(fields.barn_name),
            barn_name_missing: !text(fields.barn_name),
            source: "airtable.horses.aka",
            horse
          };
        }
      }
      offset = payload.offset || "";
    } while (offset);
    return {
      ok: true,
      source: "airtable.horses",
      filter_formula: formula,
      horse_displays: displays,
      horse_display_meta: meta
    };
  } catch (error) {
    return {
      ok: false,
      source: "airtable.horses",
      error: error.message,
      horse_displays: {},
      horse_display_meta: {}
    };
  }
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

async function fetchAndSyncRingDays(req, app, showNo, context, { refreshExisting = false } = {}) {
  const upstreamResponse = await upstream(req, "/get_ring_days.php", { method: "GET", showNo, context });
  const rows = parseRingDayRows(upstreamResponse.raw, showNo);
  return {
    upstream_status: upstreamResponse.status,
    parsed_rows: rows.length,
    refresh_existing: refreshExisting,
    ...(await syncRingDayRows(app, showNo, rows, { refreshExisting }))
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

async function fetchAndSyncUpdateScheduleOnly(req, app, showNo, ringDayRow, context, { replace = false } = {}) {
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
  const activeKeys = rows.map((row) => text(row.update_schedule_key)).filter(Boolean);
  const result = await importUpdateScheduleOnly(app, showNo, rows);
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
    counters: {
      rows: result.rows,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped
    },
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
  return {
    ...result,
    deleted: await deleteSourceRowsNotInKeys(app, TABLES.classOog, "class_oog_key", showNo, activeKeys)
  };
}

async function deleteClassOogKey(app, key) {
  const existing = await findOne(app, TABLES.classOog, { class_oog_key: key });
  if (!existing?.ROWID) return { deleted: 0 };
  await app.datastore().table(TABLES.classOog).deleteRow(existing.ROWID);
  return { deleted: 1 };
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
      const earlyShowNo = earlyQuery.get("show_no") || "14905";
      const result = await fetchUpdateScheduleRawResponse(req, earlyShowNo, context, earlyRingDayNo);
      return json(res, 200, { ok: true, action: earlyAction, upstream_requests: context.upstreamRequests, ...result });
    }
    if (earlyAction === "probe-horseshowing-egress") {
      const target = earlyQuery.get("target") || `${BASE_URL}/show.php?show=${encodeURIComponent(earlyQuery.get("show_no") || "14906")}`;
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
    const showNo = query.get("show_no") || body.show_no || "14905";
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

    if (action === "schedule-json" || action === "wec-print-live" || action === "wec-schedule-live") {
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
      const airtableFocus = requestedShowNo ? null : await getAirtableFocusShow("");
      const renderShowNo = requestedShowNo || airtableFocus?.show_no || showNo;
      const resolved = await resolveFocusDay(app, renderShowNo, query, body);
      const focusDay = resolved.focus_day || airtableFocus?.focus_day;
      if (!focusDay) return json(res, 400, { ok: false, action, error: "wec-mobile-live requires focus_day" });
      const meta = await metaForFocusRender(app, renderShowNo, focusDay, query, body);
      const rows = await buildScheduleJson(app, renderShowNo, focusDay, meta, { limit: 300, offset: 0 });
      return json(res, 200, { ok: true, action, focus_source: resolved.source || "airtable.focus_show", ...buildMobileLivePayload(renderShowNo, focusDay, meta, rows) });
    }

    if (action === "wec-print-layout") {
      const resolved = await resolveFocusDay(app, showNo, query, body);
      const requestedShowNo = text(query.get("show_no") || body.show_no);
      const airtableFocus = (!requestedShowNo || !resolved.focus_day) ? await getAirtableFocusShow(requestedShowNo) : null;
      const layoutShowNo = requestedShowNo || airtableFocus?.show_no || showNo;
      const focusDay = resolved.focus_day || airtableFocus?.focus_day;
      if (!focusDay) return json(res, 400, { ok: false, action, error: "wec-print-layout requires focus_day" });
      return json(res, 200, { action, focus_source: resolved.source || "airtable.focus_show", ...(await getAirtablePrintLayout(layoutShowNo, focusDay)) });
    }

    if (action === "wec-print-pdf-url") {
      const requestedShowNo = text(query.get("show_no") || body.show_no);
      const airtableFocus = requestedShowNo ? null : await getAirtableFocusShow("");
      const renderShowNo = requestedShowNo || airtableFocus?.show_no || showNo;
      const resolved = await resolveFocusDay(app, renderShowNo, query, body);
      const focusDay = resolved.focus_day || airtableFocus?.focus_day;
      if (!focusDay) return json(res, 400, { ok: false, action, error: "wec-print-pdf-url requires focus_day" });
      return json(res, 200, {
        ok: true,
        action,
        show_no: renderShowNo,
        focus_day: focusDay,
        pdf_url: buildWecPrintPdfUrl(renderShowNo, focusDay)
      });
    }

    if (action === "prebuild-wec-print-pdf") {
      const requestedShowNo = text(query.get("show_no") || body.show_no);
      const airtableFocus = requestedShowNo ? null : await getAirtableFocusShow("");
      const renderShowNo = requestedShowNo || airtableFocus?.show_no || showNo;
      const resolved = await resolveFocusDay(app, renderShowNo, query, body);
      const focusDay = resolved.focus_day || airtableFocus?.focus_day;
      if (!focusDay) return json(res, 400, { ok: false, action, error: "prebuild-wec-print-pdf requires focus_day" });
      const warmed = await warmWecPrintPdf(renderShowNo, focusDay);
      return json(res, warmed.ok ? 200 : 502, {
        ok: warmed.ok,
        action,
        show_no: renderShowNo,
        focus_day: focusDay,
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

    if (action === "sync-ring-days") {
      const context = createWorkflowContext();
      const result = await fetchAndSyncRingDays(req, app, showNo, context, {
        refreshExisting: query.get("refresh_existing") === "1" || body.refresh_existing === "1"
      });
      return json(res, 200, { ok: true, action, upstream_requests: context.upstreamRequests, ...result });
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
    applyPreparedClassStartMobileFields,
    parseTrainerRollups
  };
}
