"use strict";

const catalyst = require("zcatalyst-sdk-node");
const cheerio = require("cheerio");
const {
  buildConstKeys,
  buildVisualKeys,
  preflightReason,
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

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function zcqlValue(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
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
  const token = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_PAT;
  const baseId = process.env.AIRTABLE_BASE_ID || "app6XS1RvsPNRT6os";
  if (!token) throw new Error("AIRTABLE_TOKEN_required_for_focus_show");
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/focus_show`);
  url.searchParams.set("pageSize", "100");
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`focus_show_airtable_${response.status}:${JSON.stringify(payload).slice(0, 300)}`);
  const active = (payload.records || []).filter((record) => {
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

async function readCurrentRows(app, tableName, showNo, focusDay) {
  const query = `SELECT * FROM ${tableName} WHERE show_no = ${Number(showNo)} AND (focus_day = ${zcqlValue(focusDay)} OR iso_date = ${zcqlValue(focusDay)}) LIMIT 500`;
  return zcqlRows(app, tableName, query);
}

async function buildProbeEvidence(app, focus) {
  const trainerRows = await zcqlRows(app, TABLES.trainers, `SELECT * FROM ${TABLES.trainers} LIMIT 500`);
  const horseRows = await zcqlRows(app, TABLES.horses, `SELECT * FROM ${TABLES.horses} LIMIT 500`);
  const riderRows = await zcqlRows(app, TABLES.riders, `SELECT * FROM ${TABLES.riders} LIMIT 500`);
  const activeTrainerTokens = trainerRows
    .filter((row) => row.allowed === true || row.active === true || row.follow === true || text(row.status).toLowerCase() === "active")
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
  return {
    getActiveFocusShow,
    async writeHeartbeat(row) {
      const heartbeatId = `${row.show_no}|${row.focus_day}|${options.run_id}`;
      return upsertByKey(app, TABLES.heartbeat, "heartbeat_id", {
        ...row,
        heartbeat_id: heartbeatId,
        run_id: options.run_id,
        run_time: catalystDateTime(),
        payload_json: JSON.stringify({ clean_proof: true, stage: "1-3B" })
      });
    },
    async fetchRingDays(focus) {
      return readCurrentRows(app, TABLES.getRingDays, focus.show_no, focus.focus_day);
    },
    async upsertRingDays(rows) {
      return { mode: "current_rows_validated", rows: rows.length, writes: 0 };
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
        .map((row) => ({
          ROWID: row.ROWID,
          focus_day: row.focus_day,
          focus_day_key: row.focus_day_key,
          ring_name_normalized: row.ring_name_normalized,
          ring_visual_key: row.ring_visual_key,
          class_visual_key: row.class_visual_key,
          is_preflight: row.is_preflight,
          preflight_reason: row.preflight_reason
        }));
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
      return app.datastore().table(TABLES.updateSchedule).updateRow({
        ROWID: row.ROWID,
        probe_status: progress.probe_status,
        probe_attempted_at: catalystDateTime(progress.probe_attempted_at),
        probe_attempt_count: intValue(row.probe_attempt_count) + 1,
        probe_payload_chars: progress.probe_payload_chars,
        probe_certainty: progress.probe_certainty,
        probe_reason: progress.probe_reason,
        probe_raw_stored: progress.probe_raw_stored
      });
    },
    async storeClassOogRaw(row) {
      const rawKey = row.class_const_key;
      return upsertByKey(app, TABLES.classOogRaw, "raw_key", {
        raw_key: rawKey,
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
        probe_payload_chars: row.probe_payload_chars,
        probe_certainty: row.probe_certainty,
        probe_reason: row.probe_reason
      });
    },
    async listPendingClassOogRaw(focus) {
      const query = `SELECT * FROM ${TABLES.classOogRaw} WHERE show_no = ${Number(focus.show_no)} AND focus_day = ${zcqlValue(focus.focus_day)} AND parsed_status = 'pending' LIMIT 50`;
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
        const result = await upsertByKey(app, TABLES.classOog, "class_oog_key", {
          ...row,
          class_oog_key: classOogKey
        });
        if (result.operation === "insert") inserted += 1;
        else updated += 1;
      }
      return { rows: rows.length, inserted, updated };
    },
    async markClassOogRawParsed(rawDoc, patch) {
      if (!rawDoc.ROWID) return { skipped: true };
      return app.datastore().table(TABLES.classOogRaw).updateRow({
        ROWID: rawDoc.ROWID,
        parsed_status: patch.parse_status,
        parse_status: patch.parse_status,
        matched_count: patch.matched_count || 0,
        skipped_count: patch.skipped_count || 0,
        parse_error: patch.parse_error || ""
      });
    }
  };
}

async function handle(req, res) {
  try {
    const query = queryParams(req);
    const body = await readBody(req);
    const options = {
      run_id: text(query.get("run_id") || body.run_id) || `clean-proof-${Date.now()}`,
      class_no: text(query.get("class_no") || body.class_no)
    };
    if (!options.class_no) {
      throw new Error("class_no_required_for_bounded_clean_proof");
    }
    const app = catalyst.initialize(req);
    const adapters = await makeAdapters(app, options);
    const result = await runCleanStage1To3Proof(adapters, options);
    return json(res, 200, {
      ok: true,
      mode: "isolated_clean_stage1_3_proof",
      existing_workflow_used: false,
      current_workflow_mutated: false,
      step4_run: false,
      live_run: false,
      alerts_run: false,
      output_run: false,
      ...result
    });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      mode: "isolated_clean_stage1_3_proof",
      error: String(error?.message || error),
      stack: String(error?.stack || "")
    });
  }
}

module.exports = handle;
