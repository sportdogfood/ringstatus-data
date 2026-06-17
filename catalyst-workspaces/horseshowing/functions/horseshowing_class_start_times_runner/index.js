const catalyst = require("zcatalyst-sdk-node");

const DEFAULT_BASE_ID = "app6XS1RvsPNRT6os";
const TABLE_CLASS_START_TIMES = "hs_class_start_times";
const TABLE_AIRTABLE_CLASS_START_TIMES = "tblgOxoLf6r3xGWxB";
const VIEW_UPDATE_SCHEDULE_STAGING_LOCK_SCHEDULE = "lock_schedule";
const TABLE_WEC_LOGS = "tblaA0n7QD7s5lIYm";

const AIRTABLE_TABLES = {
  shows: "tblyjlXwdf0zg0mhn",
  focus_show: "tblQldkP8wwIRxd4z",
  classes: "tblhxn7Jhkcnetaq5",
  rings: "tbl5WKTbwL6IVrjyI",
  ring_days: "tblMw8DPVzlt3H8M7",
  class_oog: "tblgUbX5n8GIuiqUI"
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
  event_id: "fld5prDB3w7mdg3JR",
  event_name: "flde1tofvuV34iKc6",
  class_name: "fldvV3xLV9PduvCrB",
  time_text: "fld2EahZkPs2SSVfN",
  entry_count: "fldsiU6NKYacpz8CT"
};

const AIRTABLE_CLASS_START_FIELDS = {
  class_start_key: "fldO5aTUlni7JdMIX",
  class_start_key_mirror: "fldiDX0xpa4dfSaLm",
  class_no: "fldKYQonbwrWF5uCw",
  classes: "fldl8fAPABhnzoHhn",
  show_no: "fldgDifl9IQuoeYyn",
  shows: "fldw723bXNUSCqRgl",
  focus_day: "fld3QiD3GGyeiiJBE",
  focus_show: "fldJe99IYjIqfrrTG",
  ring_no: "fld2W7zzZA46trKPW",
  rings: "fldIylu3s86XMkyVF",
  ring_day_no: "flde2MALK8ybCvcGs",
  ring_days: "fld8dzETvNnQUf2Mv",
  class_number: "fld6N7n5mYGdIqm9f",
  class_name: "fldnWNFxsrFAQh4oB",
  class_start_time: "fldrgRZOX43NJyC41",
  display_time: "fld2gZEInYk2vkRBk",
  entry_count: "fldjFVCkr22lXinWd",
  source: "fldeQ7UHJgPO9P8m4",
  last_synced_at: "fld8eg6NkDv79UkVD",
  status: "fldocBXrphhGAq2TN",
  inactive_reason: "fldMx0qWOA06SXhTY",
  inactive_at: "fld9ckr97E2VzxegM",
  class_oog: "fldeOgjlzJtR5f0VO"
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

function link(id) {
  return id ? [id] : undefined;
}

function links(ids) {
  const clean = unique(ids || []);
  return clean.length ? clean : undefined;
}

function normalizeTime(value) {
  const raw = text(value).toLowerCase();
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])m?$/);
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

function classNumber(label) {
  const match = text(label).match(/^\s*(\d+)\)/);
  return match ? Number(match[1]) : null;
}

function className(label, fallback) {
  const raw = text(label);
  const close = raw.indexOf(")");
  return close >= 0 ? raw.slice(close + 1).trim() : text(fallback || raw);
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

function updateScheduleKey(showNo, ringDayNo, ringNo, eventId, classNo) {
  const parts = [showNo, ringDayNo, ringNo, eventId, classNo].map((value) => text(value));
  if (parts.some((part) => !part)) return "";
  return parts.join("|");
}

function rowChanged(existing, row) {
  return Object.entries(row).some(([key, value]) => text(existing[key]) !== text(value));
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

async function airtableUpdate(baseId, tableId, records, token) {
  const results = [];
  for (let i = 0; i < records.length; i += 10) {
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ records: records.slice(i, i + 10), typecast: true })
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Airtable update ${tableId} HTTP ${response.status}: ${raw.slice(0, 500)}`);
    results.push(...(JSON.parse(raw).records || []));
  }
  return results;
}

async function airtableDelete(baseId, tableId, recordIds, token) {
  let deleted = 0;
  for (let i = 0; i < recordIds.length; i += 10) {
    const batch = recordIds.slice(i, i + 10);
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${tableId}`);
    for (const id of batch) url.searchParams.append("records[]", id);
    const response = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Airtable delete ${tableId} HTTP ${response.status}: ${raw.slice(0, 500)}`);
    deleted += (JSON.parse(raw).records || []).length;
  }
  return deleted;
}

async function airtableUpsert(baseId, tableId, mergeFieldId, records, token) {
  const results = [];
  for (let i = 0; i < records.length; i += 10) {
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
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

async function getFocusShow(baseId, showNo, token, overrideFocusDay) {
  const override = yyyymmddToIso(overrideFocusDay);
  const rows = await airtableList(baseId, "focus_show", `{show_no}=${Number(showNo)}`, token);
  const row = override
    ? rows.find((item) => yyyymmddToIso(item.focus_day) === override)
    : rows.find((item) => item.active === true) || rows[0];
  if (!row) throw new Error(`No focus_show found for show_no=${showNo}${override ? ` focus_day=${override}` : " active=1"}`);
  const focusDay = yyyymmddToIso(row.focus_day);
  if (!focusDay) throw new Error(`focus_show has no focus_day for show_no=${showNo}`);
  return { record_id: row.record_id, focus_day: focusDay, is_pause: isFocusPaused(row) };
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
  for (let i = 0; i < missing.length; i += 10) {
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        records: missing.slice(i, i + 10).map((key) => ({ fields: { [keyField]: fieldValue(keyField, key) } })),
        typecast: true
      })
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Airtable create helper ${tableName} HTTP ${response.status}: ${raw.slice(0, 500)}`);
    for (const record of JSON.parse(raw).records || []) {
      map.set(text(record.fields?.[keyField]), record.id);
    }
  }
  return map;
}

async function getClassOogLinkMap(baseId, showNo, focusDay, token) {
  const rows = await airtableList(baseId, "class_oog", `{show_no}=${Number(showNo)}`, token);
  const map = new Map();
  for (const row of rows) {
    if (yyyymmddToIso(row.focus_day) !== focusDay) continue;
    const key = `${text(row.ring_day_no || row.days)}|${text(row.class_no)}`;
    if (!text(row.class_no) || !row.record_id) continue;
    const bucket = map.get(key) || [];
    bucket.push(row.record_id);
    map.set(key, bucket);
  }
  return map;
}

async function buildLinkMaps(baseId, showNo, focusShow, rows, token) {
  return {
    shows: await ensureRecordMap(baseId, AIRTABLE_TABLES.shows, "shows", "show_no", [showNo], token),
    classes: await ensureRecordMap(baseId, AIRTABLE_TABLES.classes, "classes", "class_no", rows.map((row) => row.class_no), token),
    rings: await ensureRecordMap(baseId, AIRTABLE_TABLES.rings, "rings", "ring_no", rows.map((row) => row.ring_no), token),
    ring_days: await ensureRecordMap(baseId, AIRTABLE_TABLES.ring_days, "ring_days", "ring_day_no", rows.map((row) => row.ring_day_no), token),
    focus_show: new Map([[focusShow.focus_day, focusShow.record_id]]),
    class_oog: await getClassOogLinkMap(baseId, showNo, focusShow.focus_day, token)
  };
}

async function getLockedStagingRows(baseId, showNo, focusDay, token) {
  const rows = await airtableList(baseId, "update_schedule_staging", "", token, { view: VIEW_UPDATE_SCHEDULE_STAGING_LOCK_SCHEDULE });
  const byKey = new Map();
  for (const row of rows) {
    if (Number(row.show_no) !== Number(showNo) || yyyymmddToIso(row.iso_date) !== focusDay) {
      throw new Error(`lock_schedule row outside active show/focus_day: record=${row.record_id} show_no=${row.show_no} iso_date=${row.iso_date}`);
    }
    const classNo = intOrNull(row.class_no);
    const ringNo = intOrNull(row.ring_no);
    const eventId = intOrNull(row.event_id);
    if (!classNo || !ringNo || !eventId) {
      throw new Error(`lock_schedule row missing key field: record=${row.record_id} class_no=${row.class_no} ring_no=${row.ring_no} event_id=${row.event_id}`);
    }
    const key = updateScheduleKey(showNo, row.ring_day_no, ringNo, eventId, classNo);
    if (!key) throw new Error(`lock_schedule row cannot form class_start key: record=${row.record_id}`);
    if (byKey.has(key)) throw new Error(`lock_schedule duplicate class_start key: ${key}`);
    byKey.set(key, row);
  }
  return [...byKey.entries()]
    .map(([key, row]) => ({ key, row }))
    .sort((a, b) =>
      Number(a.row.ring_no || 0) - Number(b.row.ring_no || 0) ||
      text(a.row.time_text).localeCompare(text(b.row.time_text)) ||
      Number(a.row.class_no || 0) - Number(b.row.class_no || 0)
    );
}

function buildClassStartRows(stagingPairs, showNo, focusDay, syncedAt) {
  return stagingPairs.map(({ key, row }) => {
    const time = normalizeTime(row.time_text);
    return {
      class_start_key: key,
      class_start_key_mirror: key,
      show_no: Number(showNo),
      focus_day: focusDay,
      ring_no: intOrNull(row.ring_no),
      ring_day_no: intOrNull(row.ring_day_no),
      ring_name: text(row.ring_name),
      class_no: intOrNull(row.class_no),
      class_number: classNumber(row.event_name),
      class_name: className(row.event_name, row.class_name),
      class_start_time: time,
      display_time: displayTime(row.time_text),
      entry_count: intOrNull(row.entry_count) || 0,
      source: "update_schedule_staging.lock_schedule",
      source_endpoint: "update_schedule.php",
      last_synced_at: syncedAt,
      status: time ? "upcoming" : "check_time"
    };
  });
}

function toCatalystRow(row) {
  return cleanRow({
    class_start_key: row.class_start_key,
    show_no: row.show_no,
    focus_day: row.focus_day,
    ring_day_no: row.ring_day_no,
    ring_no: row.ring_no,
    ring_name: row.ring_name,
    class_no: row.class_no,
    class_name: row.class_name,
    class_start_time: row.class_start_time,
    entry_count: row.entry_count
  });
}

async function getCatalystClassStartRows(app, showNo, focusDay) {
  const rows = [];
  for (let offset = 0; ; offset += 200) {
    const query = [
      "SELECT ROWID, class_start_key, show_no, focus_day, ring_day_no, ring_no, ring_name, class_no, class_name, class_start_time, entry_count",
      `FROM ${TABLE_CLASS_START_TIMES}`,
      `WHERE show_no = ${zcqlValue(Number(showNo))} AND focus_day = ${zcqlValue(focusDay)}`,
      `LIMIT 200 OFFSET ${offset}`
    ].join(" ");
    const page = (await app.zcql().executeZCQLQuery(query) || [])
      .map((item) => item?.[TABLE_CLASS_START_TIMES])
      .filter(Boolean);
    rows.push(...page);
    if (page.length < 200) break;
  }
  return rows;
}

async function syncCatalyst(app, showNo, focusDay, rows) {
  const existing = new Map((await getCatalystClassStartRows(app, showNo, focusDay)).map((row) => [text(row.class_start_key), row]));
  const incoming = rows.map(toCatalystRow);
  const activeKeys = new Set(incoming.map((row) => text(row.class_start_key)));
  const inserts = [];
  const updates = [];
  const deletes = [];
  for (const row of incoming) {
    const current = existing.get(text(row.class_start_key));
    if (!current?.ROWID) {
      inserts.push(row);
      continue;
    }
    const { class_start_key, show_no, focus_day, ...mutable } = row;
    if (rowChanged(current, mutable)) updates.push({ ...mutable, ROWID: current.ROWID });
  }
  for (const [key, current] of existing.entries()) {
    if (!activeKeys.has(key) && current.ROWID) deletes.push(current.ROWID);
  }
  const table = app.datastore().table(TABLE_CLASS_START_TIMES);
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

function toAirtableRows(rows, focusShow, linkMaps) {
  return rows.map((row) => {
    const classOogKey = `${text(row.ring_day_no)}|${text(row.class_no)}`;
    return {
      [AIRTABLE_CLASS_START_FIELDS.class_start_key]: row.class_start_key,
      [AIRTABLE_CLASS_START_FIELDS.class_start_key_mirror]: row.class_start_key,
      [AIRTABLE_CLASS_START_FIELDS.show_no]: row.show_no,
      [AIRTABLE_CLASS_START_FIELDS.shows]: link(linkMaps.shows.get(text(row.show_no))),
      [AIRTABLE_CLASS_START_FIELDS.focus_day]: row.focus_day,
      [AIRTABLE_CLASS_START_FIELDS.focus_show]: link(linkMaps.focus_show.get(focusShow.focus_day)),
      [AIRTABLE_CLASS_START_FIELDS.ring_no]: row.ring_no,
      [AIRTABLE_CLASS_START_FIELDS.rings]: link(linkMaps.rings.get(text(row.ring_no))),
      [AIRTABLE_CLASS_START_FIELDS.ring_day_no]: String(row.ring_day_no),
      [AIRTABLE_CLASS_START_FIELDS.ring_days]: link(linkMaps.ring_days.get(text(row.ring_day_no))),
      [AIRTABLE_CLASS_START_FIELDS.class_no]: row.class_no,
      [AIRTABLE_CLASS_START_FIELDS.classes]: link(linkMaps.classes.get(text(row.class_no))),
      [AIRTABLE_CLASS_START_FIELDS.class_number]: row.class_number,
      [AIRTABLE_CLASS_START_FIELDS.class_name]: row.class_name,
      [AIRTABLE_CLASS_START_FIELDS.class_start_time]: row.class_start_time,
      [AIRTABLE_CLASS_START_FIELDS.display_time]: row.display_time,
      [AIRTABLE_CLASS_START_FIELDS.entry_count]: row.entry_count,
      [AIRTABLE_CLASS_START_FIELDS.source]: row.source,
      [AIRTABLE_CLASS_START_FIELDS.last_synced_at]: row.last_synced_at,
      [AIRTABLE_CLASS_START_FIELDS.status]: row.status,
      [AIRTABLE_CLASS_START_FIELDS.inactive_reason]: "",
      [AIRTABLE_CLASS_START_FIELDS.inactive_at]: "",
      [AIRTABLE_CLASS_START_FIELDS.class_oog]: links(linkMaps.class_oog.get(classOogKey))
    };
  });
}

async function syncAirtable(baseId, token, showNo, focusDay, rows, focusShow) {
  const linkMaps = await buildLinkMaps(baseId, showNo, focusShow, rows, token);
  const airtableRows = toAirtableRows(rows, focusShow, linkMaps);
  const upserted = await airtableUpsert(
    baseId,
    TABLE_AIRTABLE_CLASS_START_TIMES,
    AIRTABLE_CLASS_START_FIELDS.class_start_key,
    airtableRows,
    token
  );
  const existing = await airtableList(
    baseId,
    "class_start_times",
    `AND({show_no}=${Number(showNo)},IS_SAME({focus_day},DATETIME_PARSE(${airtableValue(focusDay)}),'day'))`,
    token
  );
  const activeKeys = new Set(rows.map((row) => text(row.class_start_key)));
  const staleIds = existing
    .filter((record) => !activeKeys.has(text(record.class_start_key)))
    .map((record) => record.record_id)
    .filter(Boolean);
  const deleted = staleIds.length
    ? await airtableDelete(baseId, TABLE_AIRTABLE_CLASS_START_TIMES, staleIds, token)
    : 0;
  return { upserted: upserted.length, existing: existing.length, deleted };
}

async function verifyAirtable(baseId, token, showNo, focusDay, expectedKeys) {
  const rows = await airtableList(
    baseId,
    "class_start_times",
    `AND({show_no}=${Number(showNo)},IS_SAME({focus_day},DATETIME_PARSE(${airtableValue(focusDay)}),'day'))`,
    token
  );
  const active = rows.filter((row) => text(row.status) !== "inactive");
  const activeKeys = new Set(active.map((row) => text(row.class_start_key)));
  const missingKeys = [...expectedKeys].filter((key) => !activeKeys.has(key));
  const extraKeys = [...activeKeys].filter((key) => !expectedKeys.has(key));
  const missingLinks = active.filter((row) =>
    !row.shows?.length ||
    !row.focus_show?.length ||
    !row.classes?.length ||
    !row.rings?.length ||
    !row.ring_days?.length
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
  const rows = await getCatalystClassStartRows(app, showNo, focusDay);
  const activeKeys = new Set(rows.map((row) => text(row.class_start_key)));
  return {
    total_rows: rows.length,
    active_rows: rows.length,
    inactive_rows: 0,
    missing_keys: [...expectedKeys].filter((key) => !activeKeys.has(key)).length,
    extra_active_keys: [...activeKeys].filter((key) => !expectedKeys.has(key)).length
  };
}

async function writeRunLog(baseId, token, detail) {
  const now = new Date().toISOString();
  const logKey = ["sync-class-start-times", detail.show_no, detail.focus_day].join("|");
  await airtableCreate(baseId, TABLE_WEC_LOGS, {
    [WEC_LOG_FIELDS.log_key_run]: `${logKey}|${now}`,
    [WEC_LOG_FIELDS.log_key]: logKey,
    [WEC_LOG_FIELDS.workflow_lanes]: "Alerts",
    [WEC_LOG_FIELDS.log_type]: "class_start_times",
    [WEC_LOG_FIELDS.check_name]: "sync-class-start-times",
    [WEC_LOG_FIELDS.show_no]: Number(detail.show_no),
    [WEC_LOG_FIELDS.focus_day]: detail.focus_day,
    [WEC_LOG_FIELDS.status]: detail.ok ? "ok" : "error",
    [WEC_LOG_FIELDS.records_seen]: detail.source_rows,
    [WEC_LOG_FIELDS.records_changed]: detail.airtable?.upserted || 0,
    [WEC_LOG_FIELDS.summary]: detail.ok
      ? `class_start_times active ${detail.verify_airtable?.active_rows}; source ${detail.source_rows}`
      : `class_start_times failed: ${detail.error}`,
    [WEC_LOG_FIELDS.payload_json]: JSON.stringify(detail, null, 2),
    [WEC_LOG_FIELDS.created_at]: now
  }, token);
}

async function handle(req, res) {
  let phase = "start";
  try {
    setCors(res);
    if ((req.method || "").toUpperCase() === "OPTIONS") return res.end("");
    const query = parseQuery(req);
    const body = await readBody(req);
    const showNo = text(query.get("show_no") || body.show_no || "14906");
    const focusDayOverride = text(query.get("focus_day") || body.focus_day);
    const baseId = text(process.env.WEC_AIRTABLE_BASE_ID || body.base_id || query.get("base_id") || DEFAULT_BASE_ID);
    const authHeader = text(req.headers?.["x-airtable-token"] || req.headers?.authorization || req.headers?.Authorization);
    const bearerToken = authHeader.match(/^Bearer\s+(.+)$/i)?.[1] || "";
    const token = text(bearerToken || body.airtable_token || query.get("airtable_token") || process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_WEC_TOKEN);
    if (!token) return sendJson(res, 500, { ok: false, phase, error: "missing AIRTABLE_TOKEN fallback" });

    phase = "initialize_catalyst";
    const app = catalyst.initialize(req);
    phase = "read_focus_show";
    const focusShow = await getFocusShow(baseId, showNo, token, focusDayOverride);
    if (focusShow.is_pause) {
      const detail = {
        ok: true,
        paused: true,
        reason: "focus_show.is_pause",
        source: "update_schedule_staging.lock_schedule",
        target_catalyst: TABLE_CLASS_START_TIMES,
        target_airtable: "class_start_times",
        show_no: Number(showNo),
        focus_day: focusShow.focus_day,
        source_rows: 0,
        source_keys: 0
      };
      phase = "write_wec_log_paused";
      await writeRunLog(baseId, token, detail);
      return sendJson(res, 200, detail);
    }
    phase = "read_locked_update_schedule_staging";
    const stagingPairs = await getLockedStagingRows(baseId, showNo, focusShow.focus_day, token);
    const syncedAt = new Date().toISOString();
    const rows = buildClassStartRows(stagingPairs, showNo, focusShow.focus_day, syncedAt);
    const expectedKeys = new Set(rows.map((row) => row.class_start_key));

    phase = "sync_catalyst";
    const catalystResult = await syncCatalyst(app, showNo, focusShow.focus_day, rows);
    phase = "sync_airtable";
    const airtableResult = await syncAirtable(baseId, token, showNo, focusShow.focus_day, rows, focusShow);
    phase = "verify_catalyst";
    const verifyCatalystResult = await verifyCatalyst(app, showNo, focusShow.focus_day, expectedKeys);
    phase = "verify_airtable";
    const verifyAirtableResult = await verifyAirtable(baseId, token, showNo, focusShow.focus_day, expectedKeys);
    const ok = verifyCatalystResult.active_rows === rows.length
      && verifyCatalystResult.missing_keys === 0
      && verifyCatalystResult.extra_active_keys === 0
      && verifyAirtableResult.total_rows === rows.length
      && verifyAirtableResult.active_rows === rows.length
      && verifyAirtableResult.missing_keys === 0
      && verifyAirtableResult.extra_active_keys === 0
      && verifyAirtableResult.missing_required_links === 0;
    const detail = {
      ok,
      source: "update_schedule_staging.lock_schedule",
      target_catalyst: TABLE_CLASS_START_TIMES,
      target_airtable: "class_start_times",
      show_no: Number(showNo),
      focus_day: focusShow.focus_day,
      source_rows: rows.length,
      source_keys: expectedKeys.size,
      catalyst: catalystResult,
      airtable: airtableResult,
      verify_catalyst: verifyCatalystResult,
      verify_airtable: verifyAirtableResult
    };
    phase = "write_wec_log";
    await writeRunLog(baseId, token, detail);
    return sendJson(res, 200, detail);
  } catch (error) {
    const baseId = DEFAULT_BASE_ID;
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
