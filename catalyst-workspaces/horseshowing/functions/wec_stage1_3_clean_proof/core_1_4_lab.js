"use strict";

/*
 * Isolated Core 1-4 lab lane.
 *
 * This script reads mirrored Airtable data, applies Core probe/parse/runtime
 * policy in memory, and prints a JSON report. It does not write heartbeat,
 * source, runtime, Airtable, or Catalyst rows.
 */

const {
  buildConstKeys,
  preflightReason,
  rowMatchesEvidence,
  scanClassOogPayload
} = require("./index");
const cheerio = require("cheerio");

const TABLES = Object.freeze({
  ringDays: "hs_get_ring_days",
  updateSchedule: "hs_update_schedule",
  classOogRaw: "hs_class_oog_raw",
  classOog: "hs_class_oog",
  trainers: "hs_trainers",
  horses: "hs_horses",
  riders: "hs_riders"
});

const NO_MATCH_PROBE_RETRY_MAX_ATTEMPTS = 3;
const PACE_SECONDS = 198;
const BASE_URL = "https://www.horseshowing.com";
const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36";

function text(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(",");
  return String(value).replace(/\s+/g, " ").trim();
}

function lowerText(value) {
  return text(value).toLowerCase();
}

function intValue(value) {
  const n = Number.parseInt(text(value), 10);
  return Number.isFinite(n) ? n : 0;
}

function boolish(value) {
  return value === true || lowerText(value) === "true" || text(value) === "1";
}

function compactDate(value) {
  return text(value).replace(/-/g, "");
}

function dateKey(value) {
  const raw = text(value);
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`;
}

function normalizeRingName(value) {
  return text(value)
    .toLowerCase()
    .replace(/\s*-\s*.*/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isRawStoredProbe(row) {
  return lowerText(row.probe_status) === "raw_stored" || boolish(row.probe_raw_stored);
}

function isCheckedNoMatchProbe(row) {
  return lowerText(row.probe_status) === "checked" &&
    !isRawStoredProbe(row) &&
    lowerText(row.probe_reason) === "no_allowed_trainer_evidence";
}

function isRetryableNoMatchProbe(row) {
  return isCheckedNoMatchProbe(row) &&
    intValue(row.probe_attempt_count) > 0 &&
    intValue(row.probe_attempt_count) < NO_MATCH_PROBE_RETRY_MAX_ATTEMPTS;
}

function isProbeCandidate(row) {
  if (isRawStoredProbe(row)) return false;
  return lowerText(row.probe_status) !== "checked";
}

function normalizeClassStartTime(value) {
  const raw = text(value).toLowerCase();
  if (!raw) return "";
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*([ap]m)?$/i);
  if (!match) return raw.includes(":") ? raw : "";
  let hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2] || "0", 10);
  const second = Number.parseInt(match[3] || "0", 10);
  const suffix = match[4] || "";
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

function displayTimeFromStart(value) {
  const normalized = normalizeClassStartTime(value);
  if (!normalized) return "";
  let [hour, minute] = normalized.split(":").map((part) => Number(part));
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function addSecondsToTime(value, seconds) {
  const normalized = normalizeClassStartTime(value);
  if (!normalized) return "";
  const [hour, minute, second] = normalized.split(":").map((part) => Number(part));
  const total = hour * 3600 + minute * 60 + second + Math.max(0, intValue(seconds));
  const wrapped = ((total % 86400) + 86400) % 86400;
  const h = Math.floor(wrapped / 3600);
  const m = Math.floor((wrapped % 3600) / 60);
  const s = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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

async function fetchRingDaysRaw(showNo) {
  const cookie = await bootstrapCookie(showNo);
  const result = await fetchText(`${BASE_URL}/get_ring_days.php`, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-encoding": "identity",
      "accept-language": "en-US,en;q=0.9",
      referer: `${BASE_URL}/schedule.php`,
      "user-agent": USER_AGENT,
      cookie
    },
    timeout_ms: 30000
  });
  if (!result.response.ok) throw new Error(`get_ring_days_http_${result.response.status}`);
  return { raw: result.body, cookie };
}

function parseRingDayRows(raw, showNo) {
  const payload = JSON.parse(raw || "[]");
  const rows = [];
  if (!Array.isArray(payload)) return rows;
  for (const ring of payload) {
    for (const day of ring.ring_days || []) {
      rows.push({
        show_no: intValue(showNo),
        ring_no: intValue(ring.ring_no),
        ring_day_no: intValue(day.ring_day_no),
        ring_name: text(ring.name),
        date_text: text(day.date),
        day_label: text(day.date),
        source_endpoint: "get_ring_days.php",
        source_payload: JSON.stringify({ ring_no: ring.ring_no, ring_name: ring.name, ...day })
      });
    }
  }
  return rows;
}

async function fetchUpdateScheduleRaw(showNo, ringDayNo, cookie) {
  const body = new URLSearchParams({
    show_no: String(showNo),
    ring_day_no: String(ringDayNo)
  }).toString();
  const result = await fetchText(`${BASE_URL}/update_schedule.php`, {
    method: "POST",
    headers: {
      accept: "text/html, */*; q=0.01",
      "accept-encoding": "identity",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      origin: BASE_URL,
      referer: `${BASE_URL}/schedule.php`,
      "user-agent": USER_AGENT,
      "x-requested-with": "XMLHttpRequest",
      cookie
    },
    body,
    timeout_ms: 30000
  });
  if (!result.response.ok) throw new Error(`update_schedule_http_${result.response.status}`);
  return result.body;
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

function parseUpdateScheduleRows(raw, focus, ringDay) {
  const $ = cheerio.load(raw || "");
  const rows = [];
  $("h3.ring_evt").each((index, node) => {
    const classText = text($(node).attr("data-name")) || text($(node).find(".ring_evt_name").first().text());
    const timeText = text($(node).attr("data-time")) || text($(node).find(".ring_evt_time").first().text());
    const entryCount = text($(node).attr("data-n_entries")) || text($(node).find(".ring_evt_entries").first().text());
    const base = {
      show_no: intValue(focus.show_no),
      focus_day: text(focus.focus_day),
      iso_date: text(focus.focus_day),
      focus_day_key: compactDate(focus.focus_day),
      ring_day_no: intValue(ringDay.ring_day_no),
      ring_no: intValue(ringDay.ring_no),
      ring_name: text(ringDay.ring_name),
      ring_name_normalized: text(ringDay.ring_name_normalized) || normalizeRingName(ringDay.ring_name),
      ring_name_prioritized: intValue(ringDay.ring_name_prioritized),
      event_id: text($(node).attr("id")),
      class_no: intValue($(node).attr("data-class")),
      class_label: classText,
      class_name: classText,
      time_text: timeText,
      class_time_text: timeText,
      class_start_time: normalizeClassStartTime(timeText),
      display_time: displayTimeFromStart(timeText),
      class_order: index + 1,
      entry_count: intValue(entryCount),
      event_type: intValue($(node).attr("data-re_type")),
      re_type: text($(node).attr("data-re_type")),
      oc_id: text($(node).attr("data-oc_id")),
      live_flag: text($(node).attr("data-live")).toLowerCase() === "true" ? 1 : 0,
      source_endpoint: "update_schedule.php",
      source_payload: JSON.stringify({
        event_id: text($(node).attr("id")),
        data_class: text($(node).attr("data-class")),
        data_name: classText,
        data_time: timeText,
        data_entries: entryCount
      })
    };
    rows.push({
      ...base,
      ...buildConstKeys(base)
    });
  });
  return rows;
}

function getClassOogCellMap(cells) {
  const values = cells.map((cell) => text(cheerio.load(cell).text()));
  const joined = values.join(" | ");
  const entryOrder = intValue(values[0]);
  const entryNo = intValue(values[1]) || values.slice(1).map(intValue).find((n) => n > 0 && n < 10000 && n !== entryOrder) || 0;
  return {
    entry_order: entryOrder,
    entry_no: entryNo,
    horse: values[2] || "",
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
      iso_date: text(rawDoc.iso_date || rawDoc.focus_day),
      ring_day_no: intValue(rawDoc.ring_day_no),
      ring_no: intValue(rawDoc.ring_no),
      ring_name: text(rawDoc.ring_name),
      ring_name_normalized: text(rawDoc.ring_name_normalized),
      ring_name_prioritized: intValue(rawDoc.ring_name_prioritized),
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

function uniqueRowsByKey(rows, keyField) {
  const seen = new Map();
  for (const row of rows || []) {
    const key = text(row?.[keyField]);
    if (key) seen.set(key, row);
  }
  return Array.from(seen.values());
}

function rewriteFocusDay(row, sourceFocusDay, targetFocusDay) {
  if (!targetFocusDay || targetFocusDay === sourceFocusDay) return { ...row };
  const sourceKey = compactDate(sourceFocusDay);
  const targetKey = compactDate(targetFocusDay);
  const rewritten = { ...row };
  for (const [key, value] of Object.entries(rewritten)) {
    if (typeof value === "string") {
      rewritten[key] = value
        .replaceAll(sourceFocusDay, targetFocusDay)
        .replaceAll(sourceKey, targetKey);
    }
  }
  rewritten.focus_day = targetFocusDay;
  rewritten.iso_date = targetFocusDay;
  rewritten.focus_day_key = targetKey;
  return rewritten;
}

function runtimeIdentity(input, focus) {
  const ringNameNormalized = text(input.ring_name_normalized) || normalizeRingName(input.ring_name || input.ring);
  const base = {
    ...input,
    show_no: intValue(input.show_no || focus.show_no),
    focus_day: text(input.focus_day || input.iso_date || focus.focus_day),
    iso_date: text(input.iso_date || input.focus_day || focus.focus_day),
    focus_day_key: compactDate(input.focus_day_key || input.focus_day || input.iso_date || focus.focus_day),
    ring_day_no: intValue(input.ring_day_no),
    ring_no: intValue(input.ring_no),
    ring_name: text(input.ring_name || input.ring),
    ring_name_normalized: ringNameNormalized,
    ring_name_prioritized: intValue(input.ring_name_prioritized),
    class_no: intValue(input.class_no),
    entry_no: intValue(input.entry_no)
  };
  return {
    ...base,
    ...buildConstKeys(base)
  };
}

function ringStatusRowsFromRingDays(rows, focus, runTime) {
  return uniqueRowsByKey((rows || []).map((row) => {
    const source = runtimeIdentity(row, focus);
    if (!source.ring_const_key) return null;
    return {
      ring_status_key: source.ring_const_key,
      show_no: source.show_no,
      focus_day: source.focus_day,
      iso_date: source.iso_date,
      focus_day_key: source.focus_day_key,
      ring_day_no: source.ring_day_no,
      ring_no: source.ring_no,
      ring_name: source.ring_name,
      ring_name_normalized: source.ring_name_normalized,
      show_const_key: source.show_const_key,
      focus_day_const_key: source.focus_day_const_key,
      ring_day_const_key: source.ring_day_const_key,
      ring_const_key: source.ring_const_key,
      status: "active",
      source: "core_1_4_lab",
      last_synced_at: runTime
    };
  }).filter(Boolean), "ring_status_key");
}

function classStartRowsFromUpdateSchedule(rows, focus, runTime) {
  return uniqueRowsByKey((rows || [])
    .map((row) => runtimeIdentity(row, focus))
    .filter((row) => intValue(row.class_no) && preflightReason(row).length === 0)
    .map((row) => {
      const classStartTime = normalizeClassStartTime(row.time_text || row.class_start_time);
      if (!row.class_const_key || !classStartTime) return null;
      return {
        class_start_key: row.class_const_key,
        show_no: row.show_no,
        focus_day: row.focus_day,
        iso_date: row.iso_date,
        focus_day_key: row.focus_day_key,
        ring_day_no: row.ring_day_no,
        ring_no: row.ring_no,
        ring_name: row.ring_name,
        ring_name_normalized: row.ring_name_normalized,
        show_const_key: row.show_const_key,
        focus_day_const_key: row.focus_day_const_key,
        ring_day_const_key: row.ring_day_const_key,
        ring_const_key: row.ring_const_key,
        class_const_key: row.class_const_key,
        class_no: row.class_no,
        class_number: intValue(row.class_number),
        class_name: text(row.class_name || row.event_name),
        class_start_time: classStartTime,
        display_time: displayTimeFromStart(row.time_text || classStartTime),
        entry_count: intValue(row.entry_count),
        status: "active",
        live_source: "core_1_4_lab",
        last_synced_at: runTime
      };
    })
    .filter(Boolean), "class_start_key");
}

function entryGoRowsFromClassOog(rows, focus, classStartByClassKey, runTime) {
  return uniqueRowsByKey((rows || []).map((row) => {
    const source = runtimeIdentity(row, focus);
    if (!source.entry_const_key) return null;
    const classStart = classStartByClassKey.get(source.class_const_key) || {};
    const entryOrder = intValue(row.entry_order);
    const classStartTime = text(classStart.class_start_time);
    const goTime = entryOrder > 0 ? addSecondsToTime(classStartTime, (entryOrder - 1) * PACE_SECONDS) : "";
    return {
      entry_go_key: source.entry_const_key,
      show_no: source.show_no,
      focus_day: source.focus_day,
      iso_date: source.iso_date,
      focus_day_key: source.focus_day_key,
      ring_day_no: source.ring_day_no,
      ring_no: source.ring_no,
      ring_name: source.ring_name,
      ring_name_normalized: source.ring_name_normalized,
      show_const_key: source.show_const_key,
      focus_day_const_key: source.focus_day_const_key,
      ring_day_const_key: source.ring_day_const_key,
      ring_const_key: source.ring_const_key,
      class_const_key: source.class_const_key,
      entry_const_key: source.entry_const_key,
      class_no: source.class_no,
      entry_no: source.entry_no,
      entry_order: entryOrder,
      horse: text(row.horse),
      rider: text(row.rider),
      trainer: text(row.trainer),
      class_start_time: classStartTime,
      display_time: text(classStart.display_time),
      go_time: goTime,
      pace_seconds: PACE_SECONDS,
      status: "active",
      live_source: "core_1_4_lab",
      last_synced_at: runTime
    };
  }).filter(Boolean), "entry_go_key");
}

function buildEvidence(dataset) {
  const trainerRows = dataset[TABLES.trainers] || [];
  const horseRows = dataset[TABLES.horses] || [];
  const riderRows = dataset[TABLES.riders] || [];
  const activeTrainerTokens = trainerRows
    .filter((row) => boolish(row.allowed))
    .flatMap((row) => [row.trainer_name, row.tenant_name, row.coach_name, row.trainer_aliases].map(text).filter(Boolean));
  return {
    trainers_allowed: Array.from(new Set(activeTrainerTokens)),
    horse_tokens: horseRows
      .filter((row) => boolish(row.active) || boolish(row.follow) || lowerText(row.status) === "active")
      .flatMap((row) => [row.horse, row.horse_name, row.barn_name, row.horse_display, row.horse_aka].map(text).filter(Boolean)),
    rider_tokens: riderRows
      .filter((row) => boolish(row.active) || boolish(row.follow) || lowerText(row.status) === "active")
      .flatMap((row) => [row.rider_name, row.team_name, row.first_name, row.last_name, row.rider_aliases].map(text).filter(Boolean)),
    trainer_tokens: activeTrainerTokens
  };
}

function coreLabRun(dataset, options) {
  const sourceFocusDay = options.sourceFocusDay;
  const targetFocusDay = options.targetFocusDay || sourceFocusDay;
  const focus = {
    show_no: options.showNo,
    focus_day: targetFocusDay,
    iso_date: targetFocusDay
  };
  const runTime = new Date().toISOString();
  const mapped = {};
  for (const [table, rows] of Object.entries(dataset)) {
    mapped[table] = (rows || []).map((row) => rewriteFocusDay(row, sourceFocusDay, targetFocusDay));
  }

  const ringRows = mapped[TABLES.ringDays] || [];
  const scheduleRows = mapped[TABLES.updateSchedule] || [];
  const rawRows = mapped[TABLES.classOogRaw] || [];
  const classOogRows = mapped[TABLES.classOog] || [];
  const scheduleWithClass = scheduleRows.filter((row) => intValue(row.class_no));
  const preflightRows = scheduleWithClass.filter((row) => preflightReason(row).length > 0);
  const eligibleRows = scheduleWithClass.filter((row) => preflightReason(row).length === 0);
  const rawStoredRows = eligibleRows.filter(isRawStoredProbe);
  const checkedNoMatchRows = eligibleRows.filter(isCheckedNoMatchProbe);
  const retryableNoMatchRows = eligibleRows.filter(isRetryableNoMatchProbe);
  const probeCandidates = eligibleRows.filter(isProbeCandidate);
  const pendingRaw = rawRows.filter((row) => ["pending", "unparsed"].includes(lowerText(row.parsed_status || row.parse_status)));
  const parsedRaw = rawRows.filter((row) => lowerText(row.parsed_status || row.parse_status) === "parsed");

  const evidence = buildEvidence(mapped);
  const matchedClassOogRows = [];
  const skippedClassOogRows = [];
  for (const row of classOogRows) {
    const match = rowMatchesEvidence(row, evidence);
    if (match.keep) matchedClassOogRows.push({ ...row, match_reason: "trainer_allowed" });
    else skippedClassOogRows.push(row);
  }

  const ringStatusRows = ringStatusRowsFromRingDays(ringRows, focus, runTime);
  const classStartRows = classStartRowsFromUpdateSchedule(scheduleRows, focus, runTime);
  const classStartByClassKey = new Map(classStartRows.map((row) => [text(row.class_const_key), row]));
  const entryGoRows = entryGoRowsFromClassOog(matchedClassOogRows, focus, classStartByClassKey, runTime);
  let blocker = "";
  if (!ringRows.length) blocker = "missing_current_hs_get_ring_days";
  else if (!scheduleRows.length) blocker = "missing_current_hs_update_schedule";
  else if (!classOogRows.length) blocker = "missing_current_hs_class_oog";
  else if (!ringStatusRows.length) blocker = "hs_ring_status_source_empty";
  else if (!classStartRows.length) blocker = "hs_class_start_times_source_empty";
  else if (!entryGoRows.length) blocker = "hs_entry_go_times_source_empty";

  const naturalNextStage = probeCandidates.length > 0
    ? "3A"
    : pendingRaw.length > 0
      ? "3B"
      : "4";

  return {
    ok: !blocker,
    mode: "core_1_4_lab",
    dry_run: true,
    wrote_records: false,
    heartbeat_written: false,
    source_focus_day: sourceFocusDay,
    target_focus_day: targetFocusDay,
    date_rewrite: targetFocusDay !== sourceFocusDay,
    focus,
    policy: {
      no_match_probe_retry_max_attempts: NO_MATCH_PROBE_RETRY_MAX_ATTEMPTS,
      retry_checked_no_match: true
    },
    natural_gate: {
      next_stage: naturalNextStage,
      reason: naturalNextStage === "3A"
        ? "probe_candidates_remaining"
        : naturalNextStage === "3B"
          ? "raw_docs_pending_parse"
          : "runtime_ready"
    },
    stage1: {
      hs_get_ring_days_rows: ringRows.length
    },
    stage2: {
      hs_update_schedule_rows: scheduleRows.length,
      schedule_rows_with_class_no: scheduleWithClass.length,
      preflight_rows: preflightRows.length,
      non_preflight_rows: eligibleRows.length
    },
    stage3a: {
      probe_candidates: probeCandidates.length,
      new_or_unattempted: eligibleRows.filter((row) => !text(row.probe_status) && intValue(row.probe_attempt_count) === 0).length,
      retryable_no_match: retryableNoMatchRows.length,
      checked_no_match_total: checkedNoMatchRows.length,
      terminal_no_match: checkedNoMatchRows.length - retryableNoMatchRows.length,
      raw_stored: rawStoredRows.length,
      planned_endpoint_calls_if_not_dry_run: probeCandidates.length
    },
    stage3b: {
      raw_docs_total: rawRows.length,
      raw_docs_pending_parse: pendingRaw.length,
      raw_docs_parsed: parsedRaw.length
    },
    step4: {
      forced_runtime_projection: true,
      blocker,
      source_counts: {
        hs_get_ring_days: ringRows.length,
        hs_update_schedule: scheduleRows.length,
        hs_class_oog: classOogRows.length
      },
      class_oog_scope: {
        matched_for_entry_go_times: matchedClassOogRows.length,
        skipped_broad_rows: skippedClassOogRows.length
      },
      planned_rows: {
        hs_ring_status: ringStatusRows.length,
        hs_class_start_times: classStartRows.length,
        hs_entry_go_times: entryGoRows.length
      },
      key_samples: {
        ring_status_key: ringStatusRows[0]?.ring_status_key || "",
        class_start_key: classStartRows[0]?.class_start_key || "",
        entry_go_key: entryGoRows[0]?.entry_go_key || ""
      }
    }
  };
}

function airtableFormula(showNo, focusDay) {
  const day = text(focusDay);
  return `AND({show_no}=${Number(showNo)},OR({focus_day}='${day}',DATETIME_FORMAT({focus_day}, 'YYYY-MM-DD')='${day}',{iso_date}='${day}'))`;
}

async function fetchAirtableRows(tableName, formula) {
  const baseId = process.env.WEC_AIRTABLE_BASE_ID || "app6XS1RvsPNRT6os";
  const token = process.env.AIRTABLE_PAT || process.env.AIRTABLE_TOKEN;
  if (!baseId || !token) throw new Error("AIRTABLE_BASE_ID and AIRTABLE_PAT/AIRTABLE_TOKEN are required");
  const rows = [];
  let offset = "";
  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`);
    url.searchParams.set("pageSize", "100");
    if (formula) url.searchParams.set("filterByFormula", formula);
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) {
      throw new Error(`airtable_fetch_failed:${tableName}:${response.status}:${await response.text()}`);
    }
    const payload = await response.json();
    for (const record of payload.records || []) {
      rows.push({ ...(record.fields || {}), _airtable_record_id: record.id });
    }
    offset = payload.offset || "";
  } while (offset);
  return rows;
}

async function loadDataset(options) {
  const scopedFormula = airtableFormula(options.showNo, options.sourceFocusDay);
  const dataset = {};
  for (const table of [TABLES.ringDays, TABLES.updateSchedule, TABLES.classOogRaw, TABLES.classOog]) {
    dataset[table] = await fetchAirtableRows(table, scopedFormula);
  }
  for (const table of [TABLES.trainers, TABLES.horses, TABLES.riders]) {
    dataset[table] = await fetchAirtableRows(table, "");
  }
  return dataset;
}

async function loadLiveSourceDataset(options) {
  const focus = {
    show_no: intValue(options.showNo),
    focus_day: text(options.sourceFocusDay),
    iso_date: text(options.sourceFocusDay)
  };
  const dataset = {
    [TABLES.ringDays]: [],
    [TABLES.updateSchedule]: [],
    [TABLES.classOogRaw]: [],
    [TABLES.classOog]: [],
    [TABLES.trainers]: await fetchAirtableRows(TABLES.trainers, ""),
    [TABLES.horses]: await fetchAirtableRows(TABLES.horses, ""),
    [TABLES.riders]: await fetchAirtableRows(TABLES.riders, "")
  };
  const diagnostics = {
    source: "horseshowing_live",
    get_ring_days: {
      ok: false,
      total_rows: 0,
      focus_day_rows: 0,
      error: ""
    },
    update_schedule: {
      ok: false,
      rings_attempted: 0,
      rings_with_rows: 0,
      rows: 0,
      errors: []
    },
    class_oog_probe: {
      enabled: options.runProbe === true,
      attempted: 0,
      raw_stored: 0,
      checked_no_match: 0,
      parsed_docs: 0,
      class_oog_rows: 0,
      errors: []
    }
  };

  const ringDaysResult = await fetchRingDaysRaw(focus.show_no);
  const allRingDays = parseRingDayRows(ringDaysResult.raw, focus.show_no)
    .map((row) => {
      const isoDate = dateKey(row.day_label || row.date_text);
      const base = {
        ...row,
        focus_day: isoDate,
        iso_date: isoDate,
        focus_day_key: compactDate(isoDate),
        ring_name_normalized: normalizeRingName(row.ring_name),
        ring_name_prioritized: 0
      };
      return {
        ...base,
        ...buildConstKeys(base)
      };
    });
  const focusRingDays = allRingDays.filter((row) => row.focus_day === focus.focus_day);
  dataset[TABLES.ringDays] = focusRingDays;
  diagnostics.get_ring_days = {
    ok: focusRingDays.length > 0,
    total_rows: allRingDays.length,
    focus_day_rows: focusRingDays.length,
    focus_day_ring_day_nos: focusRingDays.map((row) => row.ring_day_no),
    error: focusRingDays.length > 0 ? "" : "no_ring_days_for_focus_day"
  };

  for (const ringDay of focusRingDays) {
    diagnostics.update_schedule.rings_attempted += 1;
    try {
      const raw = await fetchUpdateScheduleRaw(focus.show_no, ringDay.ring_day_no, ringDaysResult.cookie);
      const rows = parseUpdateScheduleRows(raw, focus, ringDay);
      if (rows.length) diagnostics.update_schedule.rings_with_rows += 1;
      dataset[TABLES.updateSchedule].push(...rows);
    } catch (error) {
      diagnostics.update_schedule.errors.push({
        ring_day_no: ringDay.ring_day_no,
        ring_no: ringDay.ring_no,
        ring_name: ringDay.ring_name,
        error: String(error?.message || error)
      });
    }
  }
  diagnostics.update_schedule.rows = dataset[TABLES.updateSchedule].length;
  diagnostics.update_schedule.ok = diagnostics.update_schedule.rings_attempted > 0 &&
    diagnostics.update_schedule.errors.length === 0 &&
    diagnostics.update_schedule.rows > 0;

  if (options.runProbe === true) {
    const evidence = buildEvidence(dataset);
    const maxPasses = options.retryNoMatchToCap === true ? NO_MATCH_PROBE_RETRY_MAX_ATTEMPTS : 1;
    diagnostics.class_oog_probe.max_passes = maxPasses;
    diagnostics.class_oog_probe.passes = [];
    for (let pass = 1; pass <= maxPasses; pass += 1) {
      const eligibleRows = dataset[TABLES.updateSchedule]
        .filter((row) => intValue(row.class_no))
        .filter((row) => preflightReason(row).length === 0)
        .filter((row) => pass === 1 ? isProbeCandidate(row) : isRetryableNoMatchProbe(row));
      const passSummary = {
        pass,
        candidates: eligibleRows.length,
        raw_stored: 0,
        checked_no_match: 0,
        errors: 0
      };
      diagnostics.class_oog_probe.passes.push(passSummary);
      if (!eligibleRows.length) break;
      for (const row of eligibleRows) {
        diagnostics.class_oog_probe.attempted += 1;
        try {
          const rawHtml = await fetchClassOogRaw(focus.show_no, row.class_no, ringDaysResult.cookie);
          const scan = scanClassOogPayload(rawHtml, evidence);
          if (!scan.possible_match) {
            row.probe_status = "checked";
            row.probe_attempt_count = intValue(row.probe_attempt_count) + 1;
            row.probe_certainty = scan.certainty;
            row.probe_reason = scan.reason;
            row.probe_raw_stored = false;
            diagnostics.class_oog_probe.checked_no_match += 1;
            passSummary.checked_no_match += 1;
            continue;
          }
          row.probe_status = "raw_stored";
          row.probe_attempt_count = intValue(row.probe_attempt_count) + 1;
          row.probe_certainty = scan.certainty;
          row.probe_reason = scan.reason;
          row.probe_raw_stored = true;
          const rawDoc = {
            ...row,
            raw_key: row.class_const_key,
            raw_html: rawHtml,
            probe_status: "raw_stored",
            possible_match: true,
            raw_stored: true,
            parsed_status: "pending",
            parse_status: "pending",
            probe_payload_chars: scan.char_count,
            probe_certainty: scan.certainty,
            probe_reason: scan.reason
          };
          if (!dataset[TABLES.classOogRaw].some((existing) => text(existing.raw_key || existing.class_const_key) === text(rawDoc.raw_key))) {
            dataset[TABLES.classOogRaw].push(rawDoc);
            diagnostics.class_oog_probe.raw_stored += 1;
            passSummary.raw_stored += 1;
            const parsedRows = parseClassOogRaw(rawDoc);
            diagnostics.class_oog_probe.parsed_docs += 1;
            rawDoc.parsed_status = "parsed";
            rawDoc.parse_status = "parsed";
            rawDoc.matched_count = 0;
            rawDoc.skipped_count = 0;
            for (const parsedRow of parsedRows) {
              const match = rowMatchesEvidence(parsedRow, evidence);
              if (!match.keep) continue;
              rawDoc.matched_count += 1;
              const classOogRow = {
                ...rawDoc,
                ...parsedRow,
                match_reason: match.trainer_matches.length ? "trainer_allowed" : "helper_match",
                ...buildConstKeys({ ...rawDoc, ...parsedRow, show_no: focus.show_no, focus_day: focus.focus_day })
              };
              dataset[TABLES.classOog].push(classOogRow);
            }
            rawDoc.skipped_count = Math.max(0, parsedRows.length - rawDoc.matched_count);
          }
        } catch (error) {
          passSummary.errors += 1;
          diagnostics.class_oog_probe.errors.push({
            pass,
            class_no: row.class_no,
            class_name: row.class_name,
            error: String(error?.message || error)
          });
        }
      }
    }
    diagnostics.class_oog_probe.class_oog_rows = dataset[TABLES.classOog].length;
  }
  return { dataset, diagnostics };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceFocusDay = text(args["source-focus-day"] || args.focusDay || args.focus_day);
  if (!sourceFocusDay) throw new Error("--source-focus-day is required");
  const showNo = intValue(args["show-no"] || args.showNo);
  if (!showNo) throw new Error("--show-no is required");
  const targetFocusDay = text(args["target-focus-day"] || args.targetFocusDay || sourceFocusDay);
  const datasetSource = lowerText(args["dataset-source"] || args.datasetSource || "airtable");
  const runProbe = args["run-probe"] === true ||
    lowerText(args["run-probe"] || args.runProbe) === "true" ||
    text(args["run-probe"] || args.runProbe) === "1";
  const retryNoMatchToCap = args["retry-no-match-to-cap"] === true ||
    lowerText(args["retry-no-match-to-cap"] || args.retryNoMatchToCap) === "true" ||
    text(args["retry-no-match-to-cap"] || args.retryNoMatchToCap) === "1";
  const loaded = datasetSource === "live"
    ? await loadLiveSourceDataset({ showNo, sourceFocusDay, runProbe, retryNoMatchToCap })
    : { dataset: await loadDataset({ showNo, sourceFocusDay }), diagnostics: { source: "airtable_mirror" } };
  const dataset = loaded.dataset;
  const result = coreLabRun(dataset, { showNo, sourceFocusDay, targetFocusDay });
  result.dataset_source = datasetSource;
  result.source_diagnostics = loaded.diagnostics;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  coreLabRun,
  loadDataset
};
