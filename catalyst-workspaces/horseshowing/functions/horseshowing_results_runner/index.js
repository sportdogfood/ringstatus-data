const catalyst = require("zcatalyst-sdk-node");
const https = require("https");

const DEFAULT_BASE_ID = "app6XS1RvsPNRT6os";
const HORSESHOWING_BASE_URL = "https://www.horseshowing.com";
const UPSTREAM_TIMEOUT_MS = 30000;

const TABLES = {
  resultClasses: "hs_result_classes",
  classResults: "hs_class_results",
  resultQueue: "hs_result_queue"
};

const AIRTABLE_TABLES = {
  focus_show: "tblQldkP8wwIRxd4z",
  class_oog: "tblgUbX5n8GIuiqUI",
  result_classes: "tblWkg90eimLzzMHk",
  class_results: "tblnyxgTAf6QVFLEO",
  result_queue: "tblCHKu87YF5DYaqr",
  wec_logs: "tblaA0n7QD7s5lIYm"
};

const FOCUS_SHOW_FIELDS = {
  show_no: "show_no",
  focus_day: "focus_day",
  active: "active",
  shows: "shows",
  is_pause: "is_pause",
  is_pause_id: "fldgWn3BIdGzcGow1"
};

const CLASS_OOG_FIELDS = {
  show_no: "fldDXivEZ0eidEJ6b",
  focus_day: "fldC7MKhrW9PlglBq",
  class_no: "fld6gnl7rJ0z8SWX6",
  class_number: "fld4tTvM1i3nV5vsb",
  class_name: "fldkpBpdlcP3SapRk",
  entry_no: "fldCQiSaDvmsarXYu",
  horse: "fldszG7lLOFg5SMNe",
  rider: "fld85WfTfZvQPuic7",
  trainer: "fld40yaYmp7Y5G1dv",
  active: "fldfTmimL22O7Le1t",
  lock: "fldono4ieXaXoMlmL",
  hide: "fldm8XB4NKR8JY1AE",
  classes: "fldZiHE2suY1dFA6f",
  entries: "fldWH39c6ewlvG0CR",
  horses: "fldp4KyA7AqCXUJli",
  riders: "fldYJ7lsNfH2jSZVy"
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
  class_oog: "fldUvtR0P3Q4culkP"
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
  raw_json: "fldMgGlzJvgRmNkpj"
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
  raw_json: "fldms216XQGSe0Y4T"
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
  return JSON.stringify(value || {}).slice(0, 9500);
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

function lookupTrue(value) {
  if (value === true) return true;
  if (Array.isArray(value)) return value.some(lookupTrue);
  if (value && typeof value === "object") {
    if (value.name) return String(value.name).toLowerCase() === "true";
    if (value.valuesByLinkedRecordId) return Object.values(value.valuesByLinkedRecordId).some(lookupTrue);
  }
  return false;
}

function resultKey(...parts) {
  return parts.map((part) => text(part)).filter(Boolean).join("|");
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

async function getFocusShow(baseId, showNo, token, focusDayOverride) {
  const rows = await airtableList(baseId, "focus_show", `{show_no}=${Number(showNo)}`, token);
  const override = isoDate(focusDayOverride);
  const row = override
    ? rows.find((item) => isoDate(item[FOCUS_SHOW_FIELDS.focus_day]) === override)
    : rows.find((item) => item[FOCUS_SHOW_FIELDS.active] === true) || rows[0];
  if (!row) throw new Error(`No focus_show found for show_no=${showNo}`);
  const focusDay = isoDate(row[FOCUS_SHOW_FIELDS.focus_day]);
  if (!focusDay) throw new Error(`focus_show has no focus_day for show_no=${showNo}`);
  return {
    record_id: row.record_id,
    focus_day: focusDay,
    is_pause: isFocusPaused(row),
    shows: links(row[FOCUS_SHOW_FIELDS.shows])
  };
}

function classOogFormula(showNo, focusDay) {
  return `AND({show_no}=${Number(showNo)}, ${airtableDateFormula("focus_day", focusDay)})`;
}

async function getActiveLockedClassOogRows(baseId, showNo, focusDay, token) {
  const rows = await airtableList(baseId, AIRTABLE_TABLES.class_oog, classOogFormula(showNo, focusDay), token, { returnFieldsByFieldId: true });
  return rows
    .map((row) => ({
      record_id: row.record_id,
      show_no: row[CLASS_OOG_FIELDS.show_no],
      focus_day: row[CLASS_OOG_FIELDS.focus_day],
      class_no: intOrNull(row[CLASS_OOG_FIELDS.class_no]),
      class_number: intOrNull(row[CLASS_OOG_FIELDS.class_number]),
      class_name: text(row[CLASS_OOG_FIELDS.class_name]),
      entry_no: intOrNull(row[CLASS_OOG_FIELDS.entry_no]),
      horse: text(row[CLASS_OOG_FIELDS.horse]),
      rider: text(row[CLASS_OOG_FIELDS.rider]),
      trainer: text(row[CLASS_OOG_FIELDS.trainer]),
      active: lookupTrue(row[CLASS_OOG_FIELDS.active]),
      lock: lookupTrue(row[CLASS_OOG_FIELDS.lock]),
      hide: row[CLASS_OOG_FIELDS.hide] === true,
      classes: links(row[CLASS_OOG_FIELDS.classes]),
      entries: links(row[CLASS_OOG_FIELDS.entries]),
      horses: links(row[CLASS_OOG_FIELDS.horses]),
      riders: links(row[CLASS_OOG_FIELDS.riders])
    }))
    .filter((row) => row.class_no && row.entry_no && row.active && row.lock && !row.hide);
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
    const attempts = Math.max(1, Number(options.attempts || 2));
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
      has_prize: hasPrize,
      source: "horseshowing.show_results4"
    };
    classes.push(classRow);
    const body = block.split(/<\/thead>/i)[1] || "";
    for (const rowMatch of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => stripTags(cell[1]));
      if (cells.length < 5) continue;
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
        score: hasScore ? cells[5] || "" : "",
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
        class_number: text(row.class_number),
        class_name: row.class_name,
        class_oog_ids: [],
        classes: row.classes
      });
    }
    grouped.get(key).class_oog_ids.push(row.record_id);
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

function toAirtableResultClass(row, sourceClass) {
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
    [RESULT_CLASS_FIELDS.class_oog]: links(sourceClass?.class_oog_ids)
  });
}

function toAirtableClassResult(row, sourceEntry, focusShow) {
  return cleanFields({
    [CLASS_RESULT_FIELDS.class_result_key]: row.class_result_key,
    [CLASS_RESULT_FIELDS.show_no]: Number(row.show_no),
    [CLASS_RESULT_FIELDS.shows]: links(focusShow.shows),
    [CLASS_RESULT_FIELDS.focus_show]: links([focusShow.record_id]),
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
    [CLASS_RESULT_FIELDS.raw_json]: row.raw_json
  });
}

function toAirtableQueue(row, sourceClass, focusShow) {
  return cleanFields({
    [RESULT_QUEUE_FIELDS.result_queue_key]: row.result_queue_key,
    [RESULT_QUEUE_FIELDS.show_no]: Number(row.show_no),
    [RESULT_QUEUE_FIELDS.shows]: links(focusShow.shows),
    [RESULT_QUEUE_FIELDS.focus_show]: links([focusShow.record_id]),
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
    [RESULT_QUEUE_FIELDS.raw_json]: row.raw_json
  });
}

async function writeLog(baseId, token, detail) {
  const now = new Date().toISOString();
  await airtableCreate(baseId, AIRTABLE_TABLES.wec_logs, {
    [WEC_LOG_FIELDS.log_key_run]: `${now}|results|probe_results`,
    [WEC_LOG_FIELDS.log_key]: `results|${detail.show_no}|${detail.focus_day}`,
    [WEC_LOG_FIELDS.workflow_lanes]: "Results",
    [WEC_LOG_FIELDS.log_type]: "result_classes",
    [WEC_LOG_FIELDS.check_name]: "probe_results",
    [WEC_LOG_FIELDS.show_no]: Number(detail.show_no),
    [WEC_LOG_FIELDS.focus_day]: detail.focus_day,
    [WEC_LOG_FIELDS.status]: detail.ok ? "ok" : "error",
    [WEC_LOG_FIELDS.records_seen]: detail.source_rows,
    [WEC_LOG_FIELDS.records_changed]: detail.changed_rows,
    [WEC_LOG_FIELDS.summary]: detail.ok
      ? `results probed ${detail.probed_classes}; completed ${detail.completed_classes}; class_results ${detail.class_results}`
      : `results failed at ${detail.phase}: ${detail.error}`,
    [WEC_LOG_FIELDS.payload_json]: safeJson(detail),
    [WEC_LOG_FIELDS.created_at]: now
  }, token);
}

async function handle(req, res) {
  let phase = "start";
  let logContext = {};
  let query = new URLSearchParams();
  let body = {};
  try {
    setCors(res);
    if ((req.method || "").toUpperCase() === "OPTIONS") return res.end("");
    query = parseQuery(req);
    body = await readBody(req);
    const showNo = text(query.get("show_no") || body.show_no);
    if (!showNo) return sendJson(res, 400, { ok: false, error: "show_no required" });
    const focusDayOverride = text(query.get("focus_day") || body.focus_day);
    const force = text(query.get("force") || body.force) === "1" || body.force === true;
    const offset = Math.max(0, intOrNull(query.get("offset") || body.offset) || 0);
    const limit = Math.max(1, Math.min(5, intOrNull(query.get("limit") || body.limit) || 1));
    const baseId = text(process.env.WEC_AIRTABLE_BASE_ID || body.base_id || query.get("base_id") || DEFAULT_BASE_ID);
    const authHeader = text(req.headers?.["x-airtable-token"] || req.headers?.authorization || req.headers?.Authorization);
    const bearerToken = authHeader.match(/^Bearer\s+(.+)$/i)?.[1] || "";
    const token = text(bearerToken || body.airtable_token || query.get("airtable_token") || process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_WEC_TOKEN);
    if (!token) return sendJson(res, 500, { ok: false, phase, error: "missing AIRTABLE_TOKEN fallback" });

    phase = "initialize_catalyst";
    const app = catalyst.initialize(req);
    phase = "read_focus_show";
    const focusShow = await getFocusShow(baseId, showNo, token, focusDayOverride);
    logContext = { show_no: Number(showNo), focus_day: focusShow.focus_day };
    if (focusShow.is_pause) {
      const detail = {
        ok: true,
        paused: true,
        reason: "focus_show.is_pause",
        action: "probe-results",
        show_no: Number(showNo),
        focus_day: focusShow.focus_day,
        source_rows: 0,
        changed_rows: 0,
        probed_classes: 0,
        completed_classes: 0,
        class_results: 0
      };
      phase = "write_wec_log_paused";
      await writeLog(baseId, token, detail);
      return sendJson(res, 200, detail);
    }

    phase = "read_source_class_oog";
    const classOogRows = await getActiveLockedClassOogRows(baseId, showNo, focusShow.focus_day, token);
    const sourceClassNos = unique(classOogRows.map((row) => row.class_no));

    phase = "check_existing_result_classes";
    const existingClasses = await catalystRows(app, TABLES.resultClasses, showNo, focusShow.focus_day);
    const completedExisting = force ? new Set() : existingCompletedClassNos(existingClasses);
    const allClassRows = buildClassRows(classOogRows, completedExisting);
    const classRows = allClassRows.slice(offset, offset + limit);
    const classByNo = new Map(classRows.map((row) => [text(row.class_no), row]));
    const sourceEntryByClassEntry = new Map(classOogRows.map((row) => [`${text(row.class_no)}|${text(row.entry_no)}`, row]));

    const now = catalystDateTime();
    if (!classRows.length) {
      const detail = {
        ok: true,
        phase,
        action: "probe-results",
        show_no: Number(showNo),
        focus_day: focusShow.focus_day,
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
        changed_rows: 0
      };
      await writeLog(baseId, token, detail);
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

    phase = "write_catalyst_results";
    const catalystCounters = { result_classes: { inserted: 0, updated: 0 }, class_results: { inserted: 0, updated: 0 }, result_queue: { inserted: 0, updated: 0 } };
    for (const row of resultClassRows) {
      const result = await upsertCatalyst(app, TABLES.resultClasses, "result_class_key", row);
      if (result.action === "inserted") catalystCounters.result_classes.inserted += 1;
      if (result.action === "updated") catalystCounters.result_classes.updated += 1;
    }
    for (const row of classResultRows) {
      const result = await upsertCatalyst(app, TABLES.classResults, "class_result_key", row);
      if (result.action === "inserted") catalystCounters.class_results.inserted += 1;
      if (result.action === "updated") catalystCounters.class_results.updated += 1;
    }
    for (const row of queueRows) {
      const result = await upsertCatalyst(app, TABLES.resultQueue, "result_queue_key", row);
      if (result.action === "inserted") catalystCounters.result_queue.inserted += 1;
      if (result.action === "updated") catalystCounters.result_queue.updated += 1;
    }

    phase = "write_airtable_results";
    const airtableResultClasses = await airtableUpsert(
      baseId,
      AIRTABLE_TABLES.result_classes,
      RESULT_CLASS_FIELDS.result_class_key,
      resultClassRows.map((row) => toAirtableResultClass(row, classByNo.get(text(row.class_no)))),
      token
    );
    const airtableClassResults = await airtableUpsert(
      baseId,
      AIRTABLE_TABLES.class_results,
      CLASS_RESULT_FIELDS.class_result_key,
      classResultRows.map((row) => toAirtableClassResult(row, sourceEntryByClassEntry.get(`${text(row.class_no)}|${text(row.entry_no)}`), focusShow)),
      token
    );
    const airtableQueue = await airtableUpsert(
      baseId,
      AIRTABLE_TABLES.result_queue,
      RESULT_QUEUE_FIELDS.result_queue_key,
      queueRows.map((row) => toAirtableQueue(row, classByNo.get(text(row.class_no)), focusShow)),
      token
    );

    phase = "verify_results";
    const verifyCatalystClasses = await catalystRows(app, TABLES.resultClasses, showNo, focusShow.focus_day);
    const verifyCatalystQueue = await catalystRows(app, TABLES.resultQueue, showNo, focusShow.focus_day);
    const completedClassCount = resultClassRows.length;
    const changedRows = resultClassRows.length + classResultRows.length + queueRows.length;
    const ok = verifyCatalystQueue.length >= queueRows.length
      && verifyCatalystClasses.filter((row) => parsedClassNos.has(text(row.class_no))).length >= completedClassCount;
    const detail = {
      ok,
      phase,
      action: "probe-results",
      source: "class_oog.active_locked",
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
        result_queue: airtableQueue.length
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
      const token = text(body.airtable_token || query.get("airtable_token") || process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_WEC_TOKEN);
      if (token) {
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
    return sendJson(res, 200, {
      ok: false,
      phase,
      error: String(error?.message || error),
      stack: error?.stack || ""
    });
  }
}

handle.__test__ = { isFocusPaused };
module.exports = handle;
