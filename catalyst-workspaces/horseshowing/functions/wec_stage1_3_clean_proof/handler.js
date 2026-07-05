"use strict";

const catalyst = require("zcatalyst-sdk-node");
const cheerio = require("cheerio");
const {
  buildConstKeys,
  buildVisualKeys,
  preflightReason,
  runProbe3A,
  runProbe3B,
  runCleanStage1To3Proof
} = require("./index");

const BASE_URL = "https://www.horseshowing.com";
const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36";

const TABLES = Object.freeze({
  heartbeat: "hs_heartbeat",
  getRingDays: "hs_get_ring_days",
  updateSchedule: "hs_update_schedule",
  classOogRaw: "hs_class_oog_raw",
  classOog: "hs_class_oog",
  horses: "hs_horses",
  riders: "hs_riders",
  trainers: "hs_trainers"
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

function lowerText(value) {
  return text(value).toLowerCase();
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

function catalystDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return catalystDateTime(new Date());
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
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
    is_pause: fields.is_pause === true || text(fields.is_pause).toLowerCase() === "true",
    trainers_allowed: fields.trainers_allowed || fields.allowed_trainers || []
  };
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

async function updateAirtableScheduleProbe(row, progress) {
  const formula = `AND({show_no}=${Number(row.show_no)}, {focus_day_key}='${airtableFormulaValue(row.focus_day_key)}', {class_no}=${Number(row.class_no)})`;
  const found = await airtableRequest(TABLES.updateSchedule, {
    filterByFormula: formula,
    pageSize: "10"
  });
  const records = (found.records || []).map((record) => ({
    id: record.id,
    fields: {
      probe_status: progress.probe_status,
      probe_attempted_at: progress.probe_attempted_at,
      probe_finished_at: progress.probe_finished_at,
      probe_duration_ms: intValue(progress.probe_duration_ms),
      probe_attempt_count: intValue(row.probe_attempt_count) + 1,
      probe_payload_chars: intValue(progress.probe_payload_chars),
      probe_certainty: progress.probe_certainty,
      probe_reason: progress.probe_reason,
      probe_raw_stored: progress.probe_raw_stored === true || text(progress.probe_raw_stored).toLowerCase() === "true"
    }
  }));
  if (!records.length) return { skipped: true, reason: "airtable_hs_update_schedule_not_found" };
  return airtableRequest(TABLES.updateSchedule, {}, "PATCH", { records });
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

function normalizeRingName(value) {
  const upper = text(value).toUpperCase();
  return upper.match(/GRAND|ANNEX|STADIUM|INDOOR [1-6]|HUNTER 2/)?.[0]?.toLowerCase() || text(value).toLowerCase();
}

function scheduleRowForProof(row, focus) {
  const ringNameNormalized = text(row.ring_name_normalized) || normalizeRingName(row.ring_name);
  const base = {
    ROWID: row.ROWID,
    show_no: intValue(row.show_no || focus.show_no),
    focus_day: text(row.focus_day || row.iso_date || focus.focus_day),
    focus_day_key: compactDate(row.focus_day || row.iso_date || focus.focus_day),
    ring_day_no: intValue(row.ring_day_no),
    ring_no: intValue(row.ring_no),
    ring_name: text(row.ring_name || row.ring),
    ring_name_normalized: ringNameNormalized,
    class_no: intValue(row.class_no),
    class_number: text(row.class_number),
    class_name: text(row.class_name || row.event_name),
    time_text: text(row.time_text),
    event_type: intValue(row.event_type),
    entry_count: intValue(row.entry_count)
  };
  return {
    ...row,
    ...base,
    ...buildConstKeys(base),
    ...buildVisualKeys(base)
  };
}

function getClassOogCellMap(cells) {
  const values = cells.map((cell) => text(cheerio.load(cell).text()));
  const joined = values.join(" | ");
  const entryNo = values.map(intValue).find((n) => n > 0 && n < 10000) || 0;
  return {
    entry_order: intValue(values[0]),
    entry_no: entryNo,
    horse: values.find((value) => /[A-Za-z]/.test(value) && !/\d/.test(value)) || "",
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
      ring_day_no: intValue(rawDoc.ring_day_no),
      ring_no: intValue(rawDoc.ring_no),
      ring_name: text(rawDoc.ring_name),
      ring_name_normalized: text(rawDoc.ring_name_normalized),
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

async function readCurrentRows(app, tableName, showNo, focusDay, dateField = "focus_day") {
  const dateClause = dateField === "iso_date"
    ? `iso_date = ${zcqlValue(focusDay)}`
    : `(focus_day = ${zcqlValue(focusDay)} OR iso_date = ${zcqlValue(focusDay)})`;
  const scopedQuery = `SELECT * FROM ${tableName} WHERE show_no = ${Number(showNo)} AND ${dateClause} LIMIT 300`;
  return zcqlRows(app, tableName, scopedQuery);
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
      const heartbeatId = `${row.show_no}|${row.focus_day}|${options.run_id}`;
      return upsertByKey(app, TABLES.heartbeat, "heartbeat_id", filterToSchema(schema, TABLES.heartbeat, {
        ...row,
        heartbeat_id: heartbeatId,
        run_id: options.run_id,
        run_time: catalystDateTime(),
        payload_json: JSON.stringify({ clean_proof: true, stage: "1-3A_FAST", stop_after: "hs_class_oog_raw" })
      }, missingContractFields));
    },
    async fetchRingDays(focus) {
      return readCurrentRows(app, TABLES.getRingDays, focus.show_no, focus.focus_day, "iso_date");
    },
    async upsertRingDays(rows) {
      const updates = rows
        .filter((row) => row.ROWID)
        .map((row) => filterToSchema(schema, TABLES.getRingDays, {
          ROWID: row.ROWID,
          focus_day: row.focus_day,
          focus_day_key: row.focus_day_key,
          ring_name_normalized: row.ring_name_normalized,
          ring_visual_key: row.ring_visual_key
        }, missingContractFields));
      const table = app.datastore().table(TABLES.getRingDays);
      for (const update of updates) await table.updateRow(update);
      return { mode: "current_rows_validated_and_focus_day_backfilled", rows: rows.length, updated: updates.length };
    },
    async fetchUpdateSchedule(focus, ringDay) {
      const rows = await readCurrentRows(app, TABLES.updateSchedule, focus.show_no, focus.focus_day);
      return rows
        .filter((row) => intValue(row.ring_day_no) === intValue(ringDay.ring_day_no))
        .map((row) => scheduleRowForProof(row, focus));
    },
    async upsertUpdateSchedule(rows) {
      const updates = rows
        .filter((row) => row.ROWID)
        .map((row) => filterToSchema(schema, TABLES.updateSchedule, {
          ROWID: row.ROWID,
          focus_day: row.focus_day,
          focus_day_key: row.focus_day_key,
          ring_name_normalized: row.ring_name_normalized,
          ring_visual_key: row.ring_visual_key,
          class_visual_key: row.class_visual_key,
          is_preflight: row.is_preflight,
          preflight_reason: row.preflight_reason
        }, missingContractFields));
      const table = app.datastore().table(TABLES.updateSchedule);
      for (const update of updates) await table.updateRow(update);
      return { rows: rows.length, updated: updates.length };
    },
    async markDroppedUpdateSchedule() {
      return { mode: "not_applied_in_bounded_proof", dropped: 0 };
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
        run_id: row.run_id,
        show_no: intValue(row.show_no),
        focus_day: row.focus_day,
        focus_day_key: row.focus_day_key,
        ring_day_no: intValue(row.ring_day_no),
        ring_no: intValue(row.ring_no),
        ring_name: row.ring_name,
        ring_name_normalized: row.ring_name_normalized,
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
        probe_duration_ms: row.probe_duration_ms,
        probe_certainty: row.probe_certainty,
        probe_reason: row.probe_reason
      };
      const result = await upsertByKey(app, TABLES.classOogRaw, "raw_key", filterToSchema(schema, TABLES.classOogRaw, rawFields, missingContractFields));
      if (!deferAirtableMirror) {
        await upsertAirtableByKey(TABLES.classOogRaw, "raw_key", rawKey, {
          ...rawFields,
          last_synced_at: new Date().toISOString()
        });
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
    async upsertClassOog(rows) {
      let inserted = 0;
      let updated = 0;
      for (const row of rows) {
        const classOogKey = row.entry_const_key;
        const cleanRow = {
          class_oog_key: classOogKey,
          run_id: row.run_id,
          show_no: intValue(row.show_no),
          focus_day: row.focus_day,
          ring_day_no: intValue(row.ring_day_no),
          ring_no: intValue(row.ring_no),
          ring: row.ring_name,
          ring_name: row.ring_name,
          ring_name_normalized: row.ring_name_normalized,
          ring_name_token: row.ring_name_token,
          ring_visual_key: row.ring_visual_key,
          class_visual_key: row.class_visual_key,
          entry_visual_key: row.entry_visual_key,
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
            ring_day_no: cleanRow.ring_day_no,
            ring_no: cleanRow.ring_no,
            ring: cleanRow.ring,
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
        await upsertAirtableByKey(TABLES.classOogRaw, "raw_key", rawDoc.raw_key, {
          parsed_status: patch.parse_status,
          parse_status: patch.parse_status,
          matched_count: patch.matched_count || 0,
          skipped_count: patch.skipped_count || 0,
          parse_error: patch.parse_error || "",
          last_synced_at: new Date().toISOString()
        });
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
  const checkedStatuses = new Set(["checked", "raw_stored"]);
  const uncheckedRows = rows
    .filter((row) => !checkedStatuses.has(lowerText(row.probe_status)))
    .sort((a, b) => (
      text(a.time_text).localeCompare(text(b.time_text)) ||
      intValue(a.ring_no) - intValue(b.ring_no) ||
      intValue(a.class_no) - intValue(b.class_no)
    ));
  const candidateRows = options.class_no
    ? rows.filter((row) => intValue(row.class_no) === intValue(options.class_no))
    : mode === "offset"
      ? rows.slice(requestedOffset, requestedOffset + requestedLimit)
      : uncheckedRows.slice(0, requestedLimit);

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
    unchecked_total: uncheckedRows.length,
    page: {
      mode,
      offset: mode === "offset" ? requestedOffset : 0,
      limit: requestedLimit,
      processed: candidateRows.length,
      next_offset: mode === "offset" ? nextOffset : 0,
      complete: mode === "offset" ? nextOffset === 0 : uncheckedRows.length <= candidateRows.length
    },
    probe3a: {
      attempted: probe3a.length,
      raw_stored: probe3a.filter((item) => item.progress?.probe_raw_stored).length,
      checked_no_match: probe3a.filter((item) => item.progress?.probe_status === "checked").length,
      failed: probe3a.filter((item) => item.error).length
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
    const query = `SELECT * FROM ${TABLES.classOogRaw} WHERE show_no = ${Number(probeFocus.show_no)} AND focus_day = ${zcqlValue(probeFocus.focus_day)} AND (parsed_status = 'pending' OR parsed_status = 'unparsed') LIMIT ${requestedLimit}`;
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

function classOogRawMirrorFields(row) {
  return {
    raw_key: row.raw_key,
    run_id: row.run_id,
    show_no: intValue(row.show_no),
    focus_day: row.focus_day,
    focus_day_key: row.focus_day_key,
    ring_day_no: intValue(row.ring_day_no),
    ring_no: intValue(row.ring_no),
    ring_name: row.ring_name,
    ring_name_normalized: row.ring_name_normalized,
    class_no: intValue(row.class_no),
    class_name: row.class_name,
    raw_html: row.raw_html,
    probe_status: row.probe_status,
    possible_match: row.possible_match === true || text(row.possible_match).toLowerCase() === "true",
    raw_stored: row.raw_stored === true || text(row.raw_stored).toLowerCase() === "true",
    parsed_status: row.parsed_status,
    parse_status: row.parse_status,
    matched_count: intValue(row.matched_count),
    skipped_count: intValue(row.skipped_count),
    parse_error: row.parse_error,
    probe_payload_chars: intValue(row.probe_payload_chars),
    probe_finished_at: row.probe_finished_at,
    probe_duration_ms: intValue(row.probe_duration_ms),
    probe_certainty: row.probe_certainty,
    probe_reason: row.probe_reason,
    last_synced_at: new Date().toISOString()
  };
}

function classOogMirrorFields(row) {
  return {
    class_oog_key: row.class_oog_key,
    run_id: row.run_id,
    show_no: intValue(row.show_no),
    focus_day: row.focus_day,
    ring_day_no: intValue(row.ring_day_no),
    ring_no: intValue(row.ring_no),
    ring: row.ring,
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
}

async function runStep3AirtableMirrorOnly(app, options = {}) {
  const focus = await getActiveFocusShow();
  if (!focus?.show_no) throw new Error("focus_show.show_no_required");
  if (!focus?.focus_day) throw new Error("focus_show.focus_day_required");
  const mirrorTable = text(options.mirror_table || options.table || "hs_update_schedule");
  const requestedOffset = Math.max(0, intValue(options.offset));
  const requestedLimit = intValue(options.limit) || 25;

  const updateRows = mirrorTable === "all" || mirrorTable === TABLES.updateSchedule
    ? await readCurrentRows(app, TABLES.updateSchedule, focus.show_no, focus.focus_day)
    : [];
  let updateScheduleMirrored = 0;
  const updateCandidates = updateRows.filter((item) => text(item.probe_status));
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
      offset: Math.max(0, intValue(query.get("offset") || body.offset || 0))
    };
    const app = catalyst.initialize(req);
    if (action === "wec-step3a-class-oog-probe") {
      const result = await runFast3AOnly(app, options);
      return json(res, 200, result);
    }
    if (action === "wec-step3b-class-oog-parse") {
      const result = await runFast3BOnly(app, options);
      return json(res, result.ok ? 200 : 500, result);
    }
    if (action === "wec-step3-airtable-mirror") {
      const result = await runStep3AirtableMirrorOnly(app, options);
      return json(res, 200, result);
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
      stack: String(error?.stack || "")
    });
  }
}

module.exports = handle;
