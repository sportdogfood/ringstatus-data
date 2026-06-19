#!/usr/bin/env node

const DEFAULT_BASE_ID = "app6XS1RvsPNRT6os";

const TABLES = {
  activeEntries: "active_entries",
  focusShow: "focus_show",
  showDays: "show_days",
  staging: "update_schedule_staging",
  classOog: "class_oog",
  classStartTimes: "class_start_times",
  entryGoTimes: "entry_go_times",
  trainers: "trainers",
  horses: "horses",
  rings: "rings",
  ringDays: "ring_days",
  classes: "classes"
};

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function truthy(value) {
  if (value === true || value === 1) return true;
  const clean = text(value).toLowerCase();
  return clean === "1" || clean === "true" || clean === "yes" || clean === "checked";
}

function numberText(value) {
  const clean = text(value);
  if (!clean) return "";
  const match = clean.match(/\d+/);
  return match ? String(Number(match[0])) : "";
}

function dateKey(value) {
  const clean = text(value);
  if (!clean) return "";
  const match = clean.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(clean);
  if (Number.isNaN(parsed.getTime())) return clean;
  return parsed.toISOString().slice(0, 10);
}

function normalizeName(value) {
  return text(value)
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[^\p{L}\p{N}' ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeTime(value) {
  const clean = text(value).toLowerCase();
  if (!clean) return "";
  const match = clean.match(/(\d{1,2})(?::(\d{2}))?\s*([ap]m)?/);
  if (!match) return clean;
  let hour = Number(match[1]);
  const minute = Number(match[2] || "0");
  const suffix = match[3] || "";
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "1";
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function airtableUrl(baseId, tableName) {
  return `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
}

async function airtableFetch(baseId, token, tableName, options = {}) {
  const url = new URL(airtableUrl(baseId, tableName));
  if (options.offset) url.searchParams.set("offset", options.offset);
  if (options.pageSize) url.searchParams.set("pageSize", String(options.pageSize));
  const response = await fetch(url.toString(), {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Airtable ${tableName} failed ${response.status}: ${body.slice(0, 1000)}`);
  return body ? JSON.parse(body) : {};
}

async function airtableList(baseId, token, tableName) {
  const rows = [];
  let offset = "";
  do {
    const payload = await airtableFetch(baseId, token, tableName, { offset, pageSize: 100 });
    rows.push(...(payload.records || []));
    offset = payload.offset || "";
  } while (offset);
  return rows;
}

async function airtableUpdate(baseId, token, tableName, updates) {
  for (let index = 0; index < updates.length; index += 10) {
    await airtableFetch(baseId, token, tableName, {
      method: "PATCH",
      body: { records: updates.slice(index, index + 10), typecast: true }
    });
  }
}

function field(row, name) {
  return row?.fields?.[name];
}

function linked(id) {
  return id ? [id] : undefined;
}

function firstField(row, names) {
  for (const name of names) {
    const value = field(row, name);
    if (text(value)) return value;
  }
  return "";
}

function rowFocusDay(row) {
  return dateKey(firstField(row, ["focus_day", "iso_date", "ISO", "date_text"]));
}

function rowShowNo(row) {
  return text(field(row, "show_no"));
}

function scoped(row, showNo, focusDay) {
  if (rowShowNo(row) && rowShowNo(row) !== showNo) return false;
  const day = rowFocusDay(row);
  return !day || day === focusDay;
}

function byNumber(rows, fields, value, { showNo = "", focusDay = "" } = {}) {
  const key = numberText(value);
  if (!key) return [];
  return rows.filter((row) => {
    if (showNo || focusDay) {
      if (!scoped(row, showNo, focusDay)) return false;
    }
    return fields.some((name) => numberText(field(row, name)) === key);
  });
}

function byName(rows, fields, value) {
  const key = normalizeName(value);
  if (!key) return [];
  return rows.filter((row) => fields.some((name) => normalizeName(field(row, name)) === key));
}

function disambiguateSchedule(rows, hints) {
  let candidates = rows;
  if (hints.ringNo) {
    const ringNo = numberText(hints.ringNo);
    candidates = candidates.filter((row) => numberText(field(row, "ring_no")) === ringNo);
  }
  if (hints.time) {
    const time = normalizeTime(hints.time);
    const timed = candidates.filter((row) => normalizeTime(firstField(row, ["time_text", "time", "class_start_time"])) === time);
    if (timed.length) candidates = timed;
  }
  return candidates;
}

function singleOrStatus(matches) {
  if (matches.length === 1) return { status: "matched", record: matches[0] };
  if (matches.length > 1) return { status: "ambiguous", records: matches };
  return { status: "missing", records: [] };
}

async function getActiveFocus(baseId, token) {
  const rows = await airtableList(baseId, token, TABLES.focusShow);
  const active = rows.filter((row) => truthy(field(row, "active")));
  if (active.length !== 1) throw new Error(`active focus_show must resolve to one row; found ${active.length}`);
  const row = active[0];
  const showNo = text(field(row, "show_no"));
  const focusDay = dateKey(field(row, "focus_day"));
  if (!showNo || !focusDay) throw new Error("active focus_show missing show_no or focus_day");
  return { row, show_no: showNo, focus_day: focusDay };
}

function buildResolution(entry, focus, data) {
  const fields = entry.fields || {};
  const hints = {
    focusDay: dateKey(fields.focus_day_input) || focus.focus_day,
    ringNo: fields.ring_no_input,
    time: fields.time_input,
    classNo: fields.class_no_input,
    trainerNo: fields.trainer_no_input,
    horse: fields.horse_input
  };
  const notes = [];
  const updates = {
    new_input: false,
    focus_day: hints.focusDay || focus.focus_day,
    time: text(hints.time),
    resolved_at: new Date().toISOString(),
    resolved_by: "process_active_entries"
  };

  if (hints.focusDay && hints.focusDay !== focus.focus_day) {
    notes.push(`focus_day_input ${hints.focusDay} does not match active focus_day ${focus.focus_day}`);
  }

  const showDay = singleOrStatus(data.showDays.filter((row) => scoped(row, focus.show_no, hints.focusDay || focus.focus_day)));
  if (showDay.record) updates.show_days = linked(showDay.record.id);

  const ring = singleOrStatus(byNumber(data.rings, ["ring_no"], hints.ringNo, { showNo: focus.show_no }));
  if (ring.record) {
    updates.ring_no = Number(numberText(hints.ringNo));
    updates.rings = linked(ring.record.id);
  } else if (hints.ringNo) {
    notes.push(`ring match ${ring.status} for ${text(hints.ringNo)}`);
  }

  const ringDays = byNumber(data.ringDays, ["ring_day_no", "ring_no"], hints.ringNo, { showNo: focus.show_no, focusDay: focus.focus_day });
  const ringDay = singleOrStatus(ringDays);
  if (ringDay.record) updates.ring_days = linked(ringDay.record.id);

  const classMatch = singleOrStatus(byNumber(data.classes, ["class_no"], hints.classNo, { showNo: focus.show_no }));
  if (classMatch.record) {
    updates.class_no = Number(numberText(hints.classNo));
    updates.classes = linked(classMatch.record.id);
  } else if (hints.classNo) {
    notes.push(`class match ${classMatch.status} for ${text(hints.classNo)}`);
  }

  const trainerMatch = singleOrStatus(byNumber(data.trainers, ["trainer_no", "number", "trainer_id"], hints.trainerNo, { showNo: focus.show_no }));
  if (trainerMatch.record) {
    updates.trainer_no = Number(numberText(hints.trainerNo));
    updates.trainers = linked(trainerMatch.record.id);
  } else if (hints.trainerNo) {
    notes.push(`trainer match ${trainerMatch.status} for ${text(hints.trainerNo)}`);
  }

  const horseMatch = singleOrStatus(byName(data.horses, ["horse", "horse_name", "show_name", "barn_name", "name"], hints.horse));
  if (horseMatch.record) {
    updates.horse = text(hints.horse);
    updates.horses = linked(horseMatch.record.id);
  } else if (hints.horse) {
    notes.push(`horse match ${horseMatch.status} for ${text(hints.horse)}`);
  }

  const scheduleRows = byNumber(data.staging, ["class_no"], hints.classNo, { showNo: focus.show_no, focusDay: focus.focus_day });
  const scheduleMatch = singleOrStatus(disambiguateSchedule(scheduleRows, hints));
  if (scheduleMatch.record) updates.update_schedule_staging = linked(scheduleMatch.record.id);
  else if (hints.classNo) notes.push(`schedule match ${scheduleMatch.status}`);

  const classStartMatch = singleOrStatus(disambiguateSchedule(byNumber(data.classStartTimes, ["class_no"], hints.classNo, { showNo: focus.show_no, focusDay: focus.focus_day }), hints));
  if (classStartMatch.record) updates.class_start_times = linked(classStartMatch.record.id);

  const classOogRows = byNumber(data.classOog, ["class_no"], hints.classNo, { showNo: focus.show_no, focusDay: focus.focus_day })
    .filter((row) => !hints.horse || normalizeName(firstField(row, ["horse", "horse_name", "show_name", "barn_name"])) === normalizeName(hints.horse));
  const classOogMatch = singleOrStatus(classOogRows);
  if (classOogMatch.record) updates.class_oog = linked(classOogMatch.record.id);

  const entryRows = byNumber(data.entryGoTimes, ["class_no"], hints.classNo, { showNo: focus.show_no, focusDay: focus.focus_day })
    .filter((row) => !hints.horse || normalizeName(firstField(row, ["horse", "horse_name", "show_name", "barn_name"])) === normalizeName(hints.horse));
  const entryMatch = singleOrStatus(entryRows);
  if (entryMatch.record) updates.entry_go_times = linked(entryMatch.record.id);

  const blockingStatuses = [
    scheduleMatch.status,
    hints.horse ? horseMatch.status : "matched",
    hints.trainerNo ? trainerMatch.status : "matched",
    classOogRows.length > 1 ? "ambiguous" : "matched",
    entryRows.length > 1 ? "ambiguous" : "matched"
  ];
  const ambiguous = blockingStatuses.includes("ambiguous");
  const matchedOnSchedule = Boolean(scheduleMatch.record && (classOogMatch.record || entryMatch.record || !hints.horse));

  if (ambiguous) {
    updates.match_status = "ambiguous";
    updates.approval_status = "needs_approval";
    updates.needs_approval = true;
    updates.matched_on_schedule = false;
    updates.match_confidence = 0.25;
  } else if (matchedOnSchedule) {
    updates.match_status = "matched";
    updates.approval_status = "already_on_schedule";
    updates.needs_approval = false;
    updates.matched_on_schedule = true;
    updates.match_confidence = 1;
  } else {
    updates.match_status = "needs_review";
    updates.approval_status = "needs_approval";
    updates.needs_approval = true;
    updates.matched_on_schedule = false;
    updates.match_confidence = scheduleMatch.record ? 0.5 : 0;
  }
  updates.focus_show = linked(focus.row.id);
  updates.match_notes = notes.join("; ");
  return { fields: updates, ambiguous, matchedOnSchedule };
}

async function main() {
  const args = parseArgs(process.argv);
  const baseId = args["base-id"] || args.base_id || process.env.WEC_AIRTABLE_BASE_ID || DEFAULT_BASE_ID;
  const token = args["airtable-token"] || args.airtable_token || process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error("AIRTABLE_TOKEN required");

  const focus = await getActiveFocus(baseId, token);
  const [activeEntries, showDays, staging, classOog, classStartTimes, entryGoTimes, trainers, horses, rings, ringDays, classes] = await Promise.all([
    airtableList(baseId, token, TABLES.activeEntries),
    airtableList(baseId, token, TABLES.showDays),
    airtableList(baseId, token, TABLES.staging),
    airtableList(baseId, token, TABLES.classOog),
    airtableList(baseId, token, TABLES.classStartTimes),
    airtableList(baseId, token, TABLES.entryGoTimes),
    airtableList(baseId, token, TABLES.trainers),
    airtableList(baseId, token, TABLES.horses),
    airtableList(baseId, token, TABLES.rings),
    airtableList(baseId, token, TABLES.ringDays),
    airtableList(baseId, token, TABLES.classes)
  ]);

  const inputRows = activeEntries.filter((row) => truthy(field(row, "new_input")));
  const data = { showDays, staging, classOog, classStartTimes, entryGoTimes, trainers, horses, rings, ringDays, classes };
  const updates = inputRows.map((row) => ({ id: row.id, fields: buildResolution(row, focus, data).fields }));
  await airtableUpdate(baseId, token, TABLES.activeEntries, updates);

  const processed = updates.map((update) => update.fields);
  const summary = {
    ok: true,
    action: "process-active-entries",
    active_show_no: focus.show_no,
    active_focus_day: focus.focus_day,
    matched_records_processed: updates.length,
    needs_review_records: processed.filter((row) => row.match_status === "needs_review").length,
    already_on_schedule_records: processed.filter((row) => row.approval_status === "already_on_schedule").length,
    ambiguous_records: processed.filter((row) => row.match_status === "ambiguous").length,
    missing_horse_records: processed.filter((row) => /horse match missing/.test(row.match_notes || "")).length,
    missing_trainer_records: processed.filter((row) => /trainer match missing/.test(row.match_notes || "")).length,
    duplicates_created: 0,
    records_deleted: 0
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
