const catalyst = require("zcatalyst-sdk-node");
const cheerio = require("cheerio");

const DEFAULT_BASE_ID = "app6XS1RvsPNRT6os";
const HORSESHOWING_BASE_URL = "https://www.horseshowing.com";
const TABLE_COUNTS = "hs_counts";
const TABLE_AIRTABLE_COUNTS = "tblmMztUikqZJlHU1";
const TABLE_WEC_LOGS = "tblaA0n7QD7s5lIYm";

const COUNTS_FIELDS = {
  class_no: "fld8fsYHqFRHTCUzY",
  show_no: "fldE7eFeiYUZTUNlG",
  class_number: "fldui20ry3u9ci2RE",
  class_name: "fldMo57AwXC5H3ZrJ",
  mirror_class_key: "fldQBnCogYtb3vUW2",
  entry_count: "fldhOgYal3RasREc4"
};

const WEC_LOG_FIELDS = {
  log_key_run: "fldlTpAEAqOF7lsFN",
  log_key: "fldtfwD9STjbiqZVL",
  workflow_lanes: "fldcejlTPlfei7Ltt",
  log_type: "fldH0a8UuciyJ68X1",
  check_name: "fldxNUbWvV48y9Yqi",
  show_no: "fldgExOeT4WsVAXgj",
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

function intOrNull(value) {
  const parsed = Number.parseInt(text(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function asNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function bootstrapCookie(showNo) {
  let cookie = `HscomShowNo=${showNo}`;
  const response = await fetch(`${HORSESHOWING_BASE_URL}/show.php?show=${encodeURIComponent(showNo)}`, {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-encoding": "identity",
      "accept-language": "en-US,en;q=0.9",
      referer: `${HORSESHOWING_BASE_URL}/showsel.php`,
      "user-agent": "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36",
      cookie
    }
  });
  if (response.ok) cookie = mergeCookies(cookie, getSetCookies(response.headers));
  return cookie;
}

async function fetchCounts(showNo) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  let response;
  const cookie = await bootstrapCookie(showNo);
  try {
    response = await fetch(`${HORSESHOWING_BASE_URL}/counts.php`, {
      method: "GET",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-encoding": "identity",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        connection: "close",
        referer: `${HORSESHOWING_BASE_URL}/schedule.php`,
        "user-agent": "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36",
        cookie
      }
    });
  } finally {
    clearTimeout(timeout);
  }
  const raw = await response.text();
  if (!response.ok) throw new Error(`counts.php HTTP ${response.status}: ${raw.slice(0, 300)}`);
  return { status: response.status, content_type: response.headers.get("content-type"), raw };
}

function parseCountRows(raw, showNo) {
  const $ = cheerio.load(raw || "");
  const rows = [];
  $("tr").each((_, tr) => {
    const link = $(tr).find(".name_cell .link").first();
    if (!link.length) return;
    const classNo = intOrNull(link.attr("data-class"));
    const classNumber = intOrNull(link.attr("data-num"));
    const className = text(link.attr("data-name") || link.text());
    const entryCount = intOrNull($(tr).find(".entries_cell").first().text());
    if (!classNo) return;
    rows.push({
      class_key: `${showNo}|${classNo}`,
      show_no: Number(showNo),
      class_no: classNo,
      class_number: classNumber,
      class_name: className,
      entry_count: entryCount,
      source_payload: JSON.stringify({
        class_no: classNo,
        class_number: classNumber,
        class_name: className,
        entry_count: entryCount,
        source_endpoint: "counts.php"
      })
    });
  });
  return rows;
}

async function getCatalystRowsByShow(app, showNo) {
  const rows = [];
  for (let offset = 0; ; offset += 200) {
    const query = `SELECT * FROM ${TABLE_COUNTS} WHERE show_no = ${Number(showNo)} LIMIT 200 OFFSET ${offset}`;
    const page = (await app.zcql().executeZCQLQuery(query) || [])
      .map((item) => item?.[TABLE_COUNTS])
      .filter(Boolean);
    rows.push(...page);
    if (page.length < 200) break;
  }
  return rows;
}

async function upsertCatalystCounts(app, showNo, rows) {
  const existing = new Map();
  for (const row of await getCatalystRowsByShow(app, showNo)) {
    if (text(row.class_key)) existing.set(text(row.class_key), row);
  }

  const inserts = [];
  const updates = [];
  for (const row of rows) {
    const current = existing.get(row.class_key);
    if (!current?.ROWID) {
      inserts.push(row);
      continue;
    }
    const changed = ["show_no", "class_no", "class_number", "class_name", "entry_count", "source_payload"]
      .some((field) => text(current[field]) !== text(row[field]));
    if (changed) updates.push({ ...row, ROWID: current.ROWID });
  }

  const table = app.datastore().table(TABLE_COUNTS);
  let inserted = 0;
  let updated = 0;
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
  return { inserted, updated };
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

function toAirtableRows(rows) {
  return rows.map((row) => ({
    [COUNTS_FIELDS.mirror_class_key]: row.class_key,
    [COUNTS_FIELDS.show_no]: row.show_no,
    [COUNTS_FIELDS.class_no]: row.class_no,
    [COUNTS_FIELDS.class_number]: row.class_number,
    [COUNTS_FIELDS.class_name]: row.class_name,
    [COUNTS_FIELDS.entry_count]: row.entry_count
  }));
}

async function writeRunLog(baseId, token, detail) {
  const now = new Date().toISOString();
  const logKey = ["sync-counts", detail.show_no, `offset-${detail.offset}`, `limit-${detail.limit}`].join("|");
  await airtableCreate(baseId, TABLE_WEC_LOGS, {
    [WEC_LOG_FIELDS.log_key_run]: `${logKey}|${now}`,
    [WEC_LOG_FIELDS.log_key]: logKey,
    [WEC_LOG_FIELDS.workflow_lanes]: "Core",
    [WEC_LOG_FIELDS.log_type]: "core_counts",
    [WEC_LOG_FIELDS.check_name]: "sync-counts",
    [WEC_LOG_FIELDS.show_no]: Number(detail.show_no),
    [WEC_LOG_FIELDS.status]: detail.ok ? "ok" : "error",
    [WEC_LOG_FIELDS.records_seen]: detail.total_rows,
    [WEC_LOG_FIELDS.records_changed]: detail.selected_rows,
    [WEC_LOG_FIELDS.summary]: detail.ok
      ? `counts.php total ${detail.total_rows}; wrote ${detail.selected_rows}; offset ${detail.offset}`
      : `counts.php failed: ${detail.error}`,
    [WEC_LOG_FIELDS.payload_json]: JSON.stringify(detail, null, 2),
    [WEC_LOG_FIELDS.created_at]: now
  }, token);
}

async function handle(req, res) {
  try {
    setCors(res);
    if ((req.method || "").toUpperCase() === "OPTIONS") return res.end("");
    const query = parseQuery(req);
    const body = await readBody(req);
    const showNo = text(query.get("show_no") || body.show_no || "14906");
    const offset = Math.max(0, asNumber(query.get("counts_offset") || body.counts_offset, 0));
    const limit = Math.max(1, asNumber(query.get("counts_limit") || body.counts_limit, 100));
    const baseId = text(process.env.WEC_AIRTABLE_BASE_ID || body.base_id || query.get("base_id") || DEFAULT_BASE_ID);
    const token = text(process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_WEC_TOKEN);
    if (!token) return sendJson(res, 500, { ok: false, error: "missing AIRTABLE_TOKEN fallback" });

    const app = catalyst.initialize(req);
    const fetched = await fetchCounts(showNo);
    const allRows = parseCountRows(fetched.raw, showNo);
    const selected = allRows.slice(offset, offset + limit);

    const catalystResult = await upsertCatalystCounts(app, showNo, selected);
    const airtableRecords = await airtableUpsert(
      baseId,
      TABLE_AIRTABLE_COUNTS,
      COUNTS_FIELDS.mirror_class_key,
      toAirtableRows(selected),
      token
    );

    await writeRunLog(baseId, token, {
      ok: true,
      show_no: Number(showNo),
      source_endpoint: "counts.php",
      upstream_status: fetched.status,
      total_rows: allRows.length,
      offset,
      limit,
      selected_rows: selected.length,
      next_offset: offset + selected.length < allRows.length ? offset + selected.length : null,
      catalyst_inserted: catalystResult.inserted,
      catalyst_updated: catalystResult.updated,
      airtable_records: airtableRecords.length
    });

    return sendJson(res, 200, {
      ok: true,
      source_endpoint: "counts.php",
      target_catalyst: TABLE_COUNTS,
      target_airtable: "counts",
      show_no: Number(showNo),
      upstream_status: fetched.status,
      total_rows: allRows.length,
      offset,
      limit,
      selected_rows: selected.length,
      next_offset: offset + selected.length < allRows.length ? offset + selected.length : null,
      catalyst_inserted: catalystResult.inserted,
      catalyst_updated: catalystResult.updated,
      airtable_records: airtableRecords.length
    });
  } catch (error) {
    return sendJson(res, 200, { ok: false, error: error.message, stack: error.stack });
  }
}

module.exports = handle;
