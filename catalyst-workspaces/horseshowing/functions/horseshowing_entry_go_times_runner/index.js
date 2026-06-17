const catalyst = require("zcatalyst-sdk-node");

const DEFAULT_BASE_ID = "app6XS1RvsPNRT6os";
const TABLE_ENTRY_GO_TIMES = "hs_entry_go_times";
const TABLE_AIRTABLE_ENTRY_GO_TIMES = "tblj1qWXAUS79jijF";
const TABLE_WEC_LOGS = "tblaA0n7QD7s5lIYm";

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
  class_oog: "tblgUbX5n8GIuiqUI",
  class_start_times: "tblgOxoLf6r3xGWxB"
};

const ENTRY_GO_FIELDS = {
  entry_go_key: "fldRBul0TP6zQFzSX",
  entry_go_key_mirror: "fldNeDIdsWesI8SDb",
  class_start_times: "fldSArXSblE7U1H0s",
  show_no: "fldYbrC3XUrWEB1nk",
  shows: "fldVQU3YGccKdKArv",
  focus_day: "fldV5YK4Skso0U25t",
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
  entry_count: "fldKQJxjfp7wDcBEN",
  pace_seconds: "fldz7VgAf84pmiEHH",
  time_till: "fldQtVA6Blb02g0fh",
  source: "fld3KEwtV3FA4EXLd",
  last_synced_at: "fld45Urn7mo8sw8KW",
  status: "fldd2hqbkYPzCaPxh",
  inactive_reason: "fldZs4oGxnMTtUHtC",
  inactive_at: "fldg1JSRC0F5EgYEg",
  class_oog: "fldmr4DCDk2Jeq2lI"
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

function intOrNull(value) {
  const parsed = Number.parseInt(text(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function manualInstruction(row) {
  return text(row?.["manual-instructions"] || row?.manual_instructions || row?.["manual instructions"]).toLowerCase();
}

function yyyymmddToIso(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return "";
}

function airtableString(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function airtableValue(value) {
  return `'${airtableString(value)}'`;
}

function link(idOrList) {
  if (!idOrList) return undefined;
  if (Array.isArray(idOrList)) return idOrList.filter(Boolean);
  return [idOrList];
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function zcqlValue(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function cleanRow(row) {
  const clean = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined && value !== null && value !== "") clean[key] = value;
  }
  return clean;
}

function rowChanged(existing, row) {
  return Object.entries(row).some(([key, value]) => text(existing[key]) !== text(value));
}

function normalizeTime(value) {
  const raw = text(value).toLowerCase();
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*([ap])?m?$/);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = match[2] || "00";
  const meridiem = match[3];
  if (meridiem === "p" && hour !== 12) hour += 12;
  if (meridiem === "a" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}:00`;
}

function displayTime(value) {
  const normalized = normalizeTime(value);
  if (!normalized) return text(value) || "check time";
  const [hourRaw, minute] = normalized.split(":");
  const hour24 = Number(hourRaw);
  const suffix = hour24 >= 12 ? "P" : "A";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute}${suffix}`;
}

function addSecondsToTime(timeValue, seconds) {
  const normalized = normalizeTime(timeValue);
  if (!normalized) return "";
  const [h, m, s] = normalized.split(":").map(Number);
  const total = h * 3600 + m * 60 + s + Number(seconds || 0);
  const wrapped = ((total % 86400) + 86400) % 86400;
  const hour = Math.floor(wrapped / 3600);
  const minute = Math.floor((wrapped % 3600) / 60);
  const second = wrapped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

function minutesTill(focusDay, timeValue) {
  const normalized = normalizeTime(timeValue);
  if (!normalized || !focusDay) return null;
  const target = new Date(`${focusDay}T${normalized}`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - Date.now()) / 60000);
}

async function airtableList(baseId, tableName, formula, token) {
  const records = [];
  let offset = "";
  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`);
    url.searchParams.set("pageSize", "100");
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

async function airtableUpdate(baseId, tableId, records, token) {
  const results = [];
  for (let i = 0; i < records.length; i += 10) {
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records: records.slice(i, i + 10), typecast: true })
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Airtable update ${tableId} HTTP ${response.status}: ${raw.slice(0, 500)}`);
    results.push(...(JSON.parse(raw).records || []));
  }
  return results;
}

async function airtableUpsert(baseId, tableId, mergeFieldId, records, token) {
  const results = [];
  for (let i = 0; i < records.length; i += 10) {
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        records: records.slice(i, i + 10).map((fields) => ({ fields })),
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

async function getFocusShow(baseId, showNo, token, focusDayOverride = "") {
  const override = yyyymmddToIso(focusDayOverride);
  const rows = await airtableList(baseId, "focus_show", `{show_no}=${Number(showNo)}`, token);
  const row = override
    ? rows.find((item) => yyyymmddToIso(item.focus_day) === override)
    : rows.find((item) => item.active === true) || rows[0];
  if (!row) throw new Error(`No focus_show for show ${showNo}${focusDayOverride ? ` focus_day ${focusDayOverride}` : ""}`);
  const focusDay = yyyymmddToIso(row.focus_day);
  if (!focusDay) throw new Error(`focus_show ${row.record_id} has no focus_day`);
  return { record_id: row.record_id, focus_day: focusDay };
}

async function readLockedStaging(baseId, showNo, focusDay, token) {
  const formula = `AND({show_no}=${Number(showNo)},{lock}=1,{class_no}>0,IS_SAME({iso_date},DATETIME_PARSE(${airtableValue(focusDay)}),'day'))`;
  const rows = await airtableList(baseId, "update_schedule_staging", formula, token);
  const byKey = new Map();
  for (const row of rows) {
    if (manualInstruction(row) === "remove") continue;
    const classNo = intOrNull(row.class_no);
    const ringDayNo = intOrNull(row.ring_day_no);
    if (!classNo || !ringDayNo) continue;
    byKey.set(`${ringDayNo}|${classNo}`, row);
  }
  return byKey;
}

async function readClassStartTimes(baseId, showNo, focusDay, token) {
  const rows = await airtableList(
    baseId,
    "class_start_times",
    `AND({show_no}=${Number(showNo)},IS_SAME({focus_day},DATETIME_PARSE(${airtableValue(focusDay)}),'day'))`,
    token
  );
  const byKey = new Map();
  for (const row of rows) {
    if (text(row.status) === "inactive") continue;
    const ringDayNo = intOrNull(row.ring_day_no);
    const classNo = intOrNull(row.class_no);
    if (!ringDayNo || !classNo) continue;
    const key = `${showNo}|${focusDay}|${ringDayNo}|${classNo}`;
    byKey.set(key, row);
  }
  return byKey;
}

async function readClassOog(baseId, showNo, focusDay, token) {
  const rows = await airtableList(
    baseId,
    "class_oog",
    `AND({show_no}=${Number(showNo)},IS_SAME({focus_day},DATETIME_PARSE(${airtableValue(focusDay)}),'day'))`,
    token
  );
  return rows.filter((row) =>
    intOrNull(row.class_no) &&
    intOrNull(row.entry_order) &&
    (Array.isArray(row["active (from trainers)"]) ? row["active (from trainers)"].some(Boolean) : true)
  );
}

function buildRows({ showNo, focusDay, focusShow, stagingByClass, classStartsByKey, classOogRows, syncedAt }) {
  const rows = [];
  for (const oog of classOogRows) {
    const classNo = intOrNull(oog.class_no);
    const ringDayNo = intOrNull(oog.ring_day_no || oog.days);
    const staging = stagingByClass.get(`${ringDayNo}|${classNo}`);
    if (!staging) continue;
    const classStartKey = `${showNo}|${focusDay}|${ringDayNo}|${classNo}`;
    const classStart = classStartsByKey.get(classStartKey) || {};
    const entryNo = intOrNull(oog.entry_no);
    const entryOrder = intOrNull(oog.entry_order);
    const paceSeconds = 120;
    const classStartTime = normalizeTime(classStart.class_start_time || staging.time_text);
    const entryGoTime = entryOrder ? addSecondsToTime(classStartTime, Math.max(0, entryOrder - 1) * paceSeconds) : "";
    const key = entryNo
      ? `${showNo}|${focusDay}|${ringDayNo}|${classNo}|${entryNo}`
      : `${showNo}|${focusDay}|${ringDayNo}|${classNo}|${entryOrder}|${text(oog.horse).toLowerCase()}`;
    rows.push({
      entry_go_key: key,
      show_no: Number(showNo),
      focus_day: focusDay,
      focus_show_record_id: focusShow.record_id,
      ring_no: intOrNull(staging.ring_no || oog.ring_no),
      ring_day_no: ringDayNo,
      class_no: classNo,
      class_number: intOrNull(oog.class_number),
      class_name: text(oog.class_name || staging.class_name || staging.event_name),
      entry_no: entryNo,
      entry_order: entryOrder,
      horse: text(oog.horse),
      horse_display: text(first(oog["horse_display (from horses)"]) || oog.horse),
      rider: text(oog.rider),
      trainer: text(oog.trainer),
      trainer_display: text(first(oog["trainer_display (from trainers)"]) || oog.trainer),
      class_start_time: classStartTime,
      display_time: displayTime(classStart.display_time || staging.time_text || classStartTime),
      entry_go_time: entryGoTime,
      entry_count: intOrNull(staging.entry_count || classStart.entry_count),
      pace_seconds: paceSeconds,
      time_till: minutesTill(focusDay, entryGoTime),
      source: "update_schedule_staging+class_oog",
      last_synced_at: syncedAt,
      status: "upcoming",
      shows: link(first(staging.shows || oog.shows)),
      focus_show: link(focusShow.record_id),
      rings: link(first(staging.rings || oog.rings)),
      ring_days: link(first(staging.ring_days || oog.ring_days)),
      classes: link(first(staging.classes || oog.classes)),
      entries: link(first(oog.entries)),
      horses: link(first(oog.horses)),
      riders: link(first(oog.riders)),
      trainers: link(first(oog.trainers)),
      class_oog: link(oog.record_id),
      class_start_times: link(classStart.record_id)
    });
  }
  rows.sort((a, b) =>
    Number(a.ring_no || 0) - Number(b.ring_no || 0) ||
    text(a.class_start_time).localeCompare(text(b.class_start_time)) ||
    Number(a.class_no || 0) - Number(b.class_no || 0) ||
    Number(a.entry_order || 9999) - Number(b.entry_order || 9999)
  );
  return rows;
}

function toCatalystRow(row) {
  return cleanRow({
    entry_go_key: row.entry_go_key,
    show_no: row.show_no,
    focus_day: row.focus_day,
    class_no: row.class_no,
    entry_no: row.entry_no,
    entry_order: row.entry_order,
    horse: row.horse_display || row.horse,
    rider: row.rider,
    trainer: row.trainer,
    go_time: row.entry_go_time
  });
}

async function getCatalystRows(app, showNo, focusDay) {
  const rows = [];
  for (let offset = 0; ; offset += 200) {
    const query = [
      "SELECT ROWID, entry_go_key, show_no, focus_day, class_no, entry_no, entry_order, horse, rider, trainer, go_time",
      `FROM ${TABLE_ENTRY_GO_TIMES}`,
      `WHERE show_no = ${zcqlValue(Number(showNo))} AND focus_day = ${zcqlValue(focusDay)}`,
      `LIMIT 200 OFFSET ${offset}`
    ].join(" ");
    const page = (await app.zcql().executeZCQLQuery(query) || [])
      .map((item) => item?.[TABLE_ENTRY_GO_TIMES])
      .filter(Boolean);
    rows.push(...page);
    if (page.length < 200) break;
  }
  return rows;
}

async function syncCatalyst(app, showNo, focusDay, rows) {
  const existing = new Map((await getCatalystRows(app, showNo, focusDay)).map((row) => [text(row.entry_go_key), row]));
  const incoming = rows.map(toCatalystRow);
  const activeKeys = new Set(incoming.map((row) => text(row.entry_go_key)));
  const inserts = [];
  const updates = [];
  const deletes = [];
  for (const row of incoming) {
    const current = existing.get(text(row.entry_go_key));
    if (!current?.ROWID) {
      inserts.push(row);
      continue;
    }
    const { entry_go_key, show_no, focus_day, ...mutable } = row;
    if (rowChanged(current, mutable)) updates.push({ ...mutable, ROWID: current.ROWID });
  }
  for (const [key, current] of existing.entries()) {
    if (!activeKeys.has(key) && current.ROWID) deletes.push(current.ROWID);
  }
  const table = app.datastore().table(TABLE_ENTRY_GO_TIMES);
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
  return { existing: existing.size, incoming: incoming.length, inserted, updated, deleted };
}

function toAirtableRow(row) {
  return {
    [ENTRY_GO_FIELDS.entry_go_key]: row.entry_go_key,
    [ENTRY_GO_FIELDS.entry_go_key_mirror]: row.entry_go_key,
    [ENTRY_GO_FIELDS.class_start_times]: row.class_start_times,
    [ENTRY_GO_FIELDS.show_no]: row.show_no,
    [ENTRY_GO_FIELDS.shows]: row.shows,
    [ENTRY_GO_FIELDS.focus_day]: row.focus_day,
    [ENTRY_GO_FIELDS.focus_show]: row.focus_show,
    [ENTRY_GO_FIELDS.ring_no]: row.ring_no,
    [ENTRY_GO_FIELDS.rings]: row.rings,
    [ENTRY_GO_FIELDS.ring_day_no]: row.ring_day_no,
    [ENTRY_GO_FIELDS.ring_days]: row.ring_days,
    [ENTRY_GO_FIELDS.class_no]: row.class_no,
    [ENTRY_GO_FIELDS.classes]: row.classes,
    [ENTRY_GO_FIELDS.class_number]: row.class_number,
    [ENTRY_GO_FIELDS.class_name]: row.class_name,
    [ENTRY_GO_FIELDS.entry_no]: row.entry_no,
    [ENTRY_GO_FIELDS.entries]: row.entries,
    [ENTRY_GO_FIELDS.entry_order]: row.entry_order,
    [ENTRY_GO_FIELDS.horse]: row.horse,
    [ENTRY_GO_FIELDS.horses]: row.horses,
    [ENTRY_GO_FIELDS.horse_display]: row.horse_display,
    [ENTRY_GO_FIELDS.rider]: row.rider,
    [ENTRY_GO_FIELDS.riders]: row.riders,
    [ENTRY_GO_FIELDS.trainer]: row.trainer,
    [ENTRY_GO_FIELDS.trainers]: row.trainers,
    [ENTRY_GO_FIELDS.trainer_display]: row.trainer_display,
    [ENTRY_GO_FIELDS.class_start_time]: row.class_start_time,
    [ENTRY_GO_FIELDS.display_time]: row.display_time,
    [ENTRY_GO_FIELDS.entry_go_time]: row.entry_go_time,
    [ENTRY_GO_FIELDS.entry_count]: row.entry_count,
    [ENTRY_GO_FIELDS.pace_seconds]: row.pace_seconds,
    [ENTRY_GO_FIELDS.time_till]: row.time_till,
    [ENTRY_GO_FIELDS.source]: row.source,
    [ENTRY_GO_FIELDS.last_synced_at]: row.last_synced_at,
    [ENTRY_GO_FIELDS.status]: row.status,
    [ENTRY_GO_FIELDS.inactive_reason]: "",
    [ENTRY_GO_FIELDS.inactive_at]: "",
    [ENTRY_GO_FIELDS.class_oog]: row.class_oog
  };
}

async function syncAirtable(baseId, token, showNo, focusDay, rows) {
  const upserted = await airtableUpsert(
    baseId,
    TABLE_AIRTABLE_ENTRY_GO_TIMES,
    ENTRY_GO_FIELDS.entry_go_key,
    rows.map(toAirtableRow),
    token
  );
  const existing = await airtableList(
    baseId,
    "entry_go_times",
    `AND({show_no}=${Number(showNo)},IS_SAME({focus_day},DATETIME_PARSE(${airtableValue(focusDay)}),'day'))`,
    token
  );
  const activeKeys = new Set(rows.map((row) => text(row.entry_go_key)));
  const now = new Date().toISOString();
  const staleUpdates = existing
    .filter((record) => !activeKeys.has(text(record.entry_go_key)) && text(record.status) !== "inactive")
    .map((record) => ({
      id: record.record_id,
      fields: {
        [ENTRY_GO_FIELDS.status]: "inactive",
        [ENTRY_GO_FIELDS.inactive_reason]: "not_active_class_oog",
        [ENTRY_GO_FIELDS.inactive_at]: now
      }
    }));
  const stale = staleUpdates.length
    ? await airtableUpdate(baseId, TABLE_AIRTABLE_ENTRY_GO_TIMES, staleUpdates, token)
    : [];
  return { upserted: upserted.length, existing: existing.length, inactivated: stale.length };
}

async function verifyAirtable(baseId, token, showNo, focusDay, expectedKeys) {
  const rows = await airtableList(
    baseId,
    "entry_go_times",
    `AND({show_no}=${Number(showNo)},IS_SAME({focus_day},DATETIME_PARSE(${airtableValue(focusDay)}),'day'))`,
    token
  );
  const active = rows.filter((row) => text(row.status) !== "inactive");
  const activeKeys = new Set(active.map((row) => text(row.entry_go_key)));
  const missingKeys = [...expectedKeys].filter((key) => !activeKeys.has(key));
  const extraKeys = [...activeKeys].filter((key) => !expectedKeys.has(key));
  const missingLinks = active.filter((row) =>
    !row.shows?.length ||
    !row.focus_show?.length ||
    !row.classes?.length ||
    !row.rings?.length ||
    !row.ring_days?.length ||
    !row.entries?.length ||
    !row.horses?.length ||
    !row.riders?.length ||
    !row.trainers?.length ||
    !row.class_oog?.length ||
    !row.class_start_times?.length
  );
  return {
    total_rows: rows.length,
    active_rows: active.length,
    inactive_rows: rows.length - active.length,
    missing_keys: missingKeys.length,
    extra_active_keys: extraKeys.length,
    missing_required_links: missingLinks.length
  };
}

async function verifyCatalyst(app, showNo, focusDay, expectedKeys) {
  const rows = await getCatalystRows(app, showNo, focusDay);
  const activeKeys = new Set(rows.map((row) => text(row.entry_go_key)));
  return {
    total_rows: rows.length,
    active_rows: rows.length,
    missing_keys: [...expectedKeys].filter((key) => !activeKeys.has(key)).length,
    extra_keys: [...activeKeys].filter((key) => !expectedKeys.has(key)).length
  };
}

async function writeRunLog(baseId, token, detail) {
  const now = new Date().toISOString();
  const payload = { ...detail };
  delete payload.token;
  delete payload.airtable_token;
  const logKey = ["entry-go-times", detail.show_no, detail.focus_day || "no-focus-day"].join("|");
  await airtableUpsert(baseId, TABLE_WEC_LOGS, WEC_LOG_FIELDS.log_key_run, [{
    [WEC_LOG_FIELDS.log_key_run]: `${logKey}|${now}`,
    [WEC_LOG_FIELDS.log_key]: logKey,
    [WEC_LOG_FIELDS.workflow_lanes]: "Alerts",
    [WEC_LOG_FIELDS.log_type]: "entry_go_times",
    [WEC_LOG_FIELDS.check_name]: "sync-entry-go-times",
    [WEC_LOG_FIELDS.show_no]: Number(detail.show_no),
    [WEC_LOG_FIELDS.focus_day]: detail.focus_day || null,
    [WEC_LOG_FIELDS.status]: detail.ok ? "ok" : "error",
    [WEC_LOG_FIELDS.records_seen]: Number(detail.source_rows || 0),
    [WEC_LOG_FIELDS.records_changed]: Number(detail.airtable?.upserted || detail.rows_written || 0),
    [WEC_LOG_FIELDS.summary]: detail.ok
      ? `entry_go_times active ${detail.verify_airtable?.active_rows}; source ${detail.source_rows}; links missing ${detail.verify_airtable?.missing_required_links}`
      : `entry_go_times failed at ${detail.phase || "unknown"}: ${detail.error}`,
    [WEC_LOG_FIELDS.payload_json]: JSON.stringify(payload, null, 2),
    [WEC_LOG_FIELDS.created_at]: now
  }], token);
}

async function handle(req, res) {
  let phase = "start";
  const runLogContext = {};
  try {
    setCors(res);
    if ((req.method || "").toUpperCase() === "OPTIONS") return res.end("");
    const query = parseQuery(req);
    const body = await readBody(req);
    const showNo = text(query.get("show_no") || body.show_no || "14906");
    const focusDayOverride = text(query.get("focus_day") || body.focus_day);
    const baseId = text(process.env.WEC_AIRTABLE_BASE_ID || body.base_id || query.get("base_id") || DEFAULT_BASE_ID);
    const authHeader = text(req.headers?.["x-airtable-token"] || req.headers?.["X-Airtable-Token"] || req.headers?.authorization || req.headers?.Authorization);
    const bearerToken = authHeader.match(/^Bearer\s+(.+)$/i)?.[1] || "";
    const token = text(bearerToken || body.airtable_token || query.get("airtable_token") || process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_WEC_TOKEN);
    if (!token) return sendJson(res, 500, { ok: false, phase, error: "missing AIRTABLE_TOKEN fallback" });
    Object.assign(runLogContext, { baseId, token, show_no: Number(showNo), focus_day: yyyymmddToIso(focusDayOverride) });

    phase = "initialize_catalyst";
    const app = catalyst.initialize(req);
    phase = "read_focus_show";
    const focusShow = await getFocusShow(baseId, showNo, token, focusDayOverride);
    runLogContext.focus_day = focusShow.focus_day;

    phase = "read_locked_update_schedule_staging";
    const stagingByClass = await readLockedStaging(baseId, showNo, focusShow.focus_day, token);
    phase = "read_class_start_times";
    const classStartsByKey = await readClassStartTimes(baseId, showNo, focusShow.focus_day, token);
    phase = "read_class_oog";
    const classOogRows = await readClassOog(baseId, showNo, focusShow.focus_day, token);
    phase = "build_entry_go_rows";
    const syncedAt = new Date().toISOString();
    const rows = buildRows({ showNo, focusDay: focusShow.focus_day, focusShow, stagingByClass, classStartsByKey, classOogRows, syncedAt });
    const expectedKeys = new Set(rows.map((row) => row.entry_go_key));

    phase = "sync_catalyst";
    const catalystResult = await syncCatalyst(app, showNo, focusShow.focus_day, rows);
    phase = "sync_airtable";
    const airtableResult = await syncAirtable(baseId, token, showNo, focusShow.focus_day, rows);
    phase = "verify_catalyst";
    const catalystVerify = await verifyCatalyst(app, showNo, focusShow.focus_day, expectedKeys);
    phase = "verify_airtable";
    const airtableVerify = await verifyAirtable(baseId, token, showNo, focusShow.focus_day, expectedKeys);
    const ok = catalystVerify.missing_keys === 0 &&
      catalystVerify.extra_keys === 0 &&
      airtableVerify.missing_keys === 0 &&
      airtableVerify.extra_active_keys === 0 &&
      airtableVerify.missing_required_links === 0;

    phase = "write_wec_log";
    await writeRunLog(baseId, token, {
      ok,
      show_no: Number(showNo),
      focus_day: focusShow.focus_day,
      source: "update_schedule_staging.locked+class_oog.active",
      source_rows: rows.length,
      staging_classes: stagingByClass.size,
      class_oog_rows: classOogRows.length,
      rows_written: rows.length,
      catalyst: catalystResult,
      airtable: airtableResult,
      verify_catalyst: catalystVerify,
      verify_airtable: airtableVerify
    });

    return sendJson(res, 200, {
      ok,
      source: "update_schedule_staging.locked+class_oog.active",
      target_catalyst: TABLE_ENTRY_GO_TIMES,
      target_airtable: "entry_go_times",
      show_no: Number(showNo),
      focus_day: focusShow.focus_day,
      source_rows: rows.length,
      staging_classes: stagingByClass.size,
      class_oog_rows: classOogRows.length,
      catalyst: catalystResult,
      airtable: airtableResult,
      verify_catalyst: catalystVerify,
      verify_airtable: airtableVerify
    });
  } catch (error) {
    let log_error = "";
    if (runLogContext.baseId && runLogContext.token) {
      try {
        await writeRunLog(runLogContext.baseId, runLogContext.token, {
          ...runLogContext,
          ok: false,
          phase,
          source_rows: 0,
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

module.exports = handle;
