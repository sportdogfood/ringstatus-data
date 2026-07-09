"use strict";

/*
 * Clean WEC Stage 1-3 proof runner.
 *
 * This file is intentionally isolated from horseshowing_sync. It does not import,
 * patch, or call the existing workflow code. Runtime integrations are supplied by
 * adapters so the data-store and Airtable wiring can be approved explicitly.
 */

const CERTAINTY = Object.freeze({
  NONE: "none",
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high"
});

const PROBE_STATUS = Object.freeze({
  PENDING: "pending",
  CHECKED: "checked",
  RAW_STORED: "raw_stored",
  SKIPPED: "skipped",
  FAILED: "failed"
});

const PARSE_STATUS = Object.freeze({
  PENDING: "pending",
  PARSED: "parsed",
  FAILED: "failed"
});

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function intValue(value) {
  const n = Number.parseInt(text(value), 10);
  return Number.isFinite(n) ? n : 0;
}

function compactDate(value) {
  return text(value).replace(/-/g, "");
}

function normalizeSearchText(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ringNameToken(value) {
  return normalizeSearchText(value).replace(/\s+/g, "_");
}

function buildConstKeys(input) {
  const showNo = intValue(input.show_no);
  const focusDayKey = compactDate(input.focus_day_key || input.focus_day);
  const ringDayNo = intValue(input.ring_day_no);
  const ringNo = intValue(input.ring_no);
  const classNo = intValue(input.class_no);
  const entryNo = intValue(input.entry_no);

  return {
    show_const_key: showNo ? String(showNo) : "",
    focus_day_const_key: showNo && focusDayKey ? `${showNo}|${focusDayKey}` : "",
    ring_day_const_key: showNo && focusDayKey && ringDayNo ? `${showNo}|${focusDayKey}|${ringDayNo}` : "",
    ring_const_key: showNo && focusDayKey && ringDayNo && ringNo ? `${showNo}|${focusDayKey}|${ringDayNo}|${ringNo}` : "",
    class_const_key: showNo && focusDayKey && ringDayNo && ringNo && classNo
      ? `${showNo}|${focusDayKey}|${ringDayNo}|${ringNo}|${classNo}`
      : "",
    entry_const_key: showNo && focusDayKey && ringDayNo && ringNo && classNo && entryNo
      ? `${showNo}|${focusDayKey}|${ringDayNo}|${ringNo}|${classNo}|${entryNo}`
      : ""
  };
}

function preflightReason(row) {
  const reasons = [];
  const timeText = text(row.time_text);
  const classNo = intValue(row.class_no);
  const eventType = intValue(row.event_type);
  const classText = normalizeSearchText([
    row.class_name,
    row.class_label,
    row.event_name,
    row.source_payload
  ].map(text).filter(Boolean).join(" "));

  if (!timeText) reasons.push("blank_time_text");
  if (!classNo) reasons.push("blank_or_zero_class_no");
  if (eventType === 5) reasons.push("event_type_5");
  if (classText.includes("ticketed")) reasons.push("ticketed");
  if (classText.includes("ticket school") || classText.includes("ticketed school")) reasons.push("ticket_school");

  return reasons;
}

function tokenEvidence(rawPayload, tokens) {
  const payload = normalizeSearchText(rawPayload);
  const found = [];

  for (const token of tokens || []) {
    const normalized = normalizeSearchText(token);
    if (normalized && payload.includes(normalized)) found.push(token);
  }

  return found;
}

function scanClassOogPayload(rawPayload, evidence) {
  const raw = text(rawPayload);
  const trainersAllowed = evidence?.trainers_allowed || [];
  const helperTokens = [
    ...(evidence?.horse_tokens || []),
    ...(evidence?.rider_tokens || []),
    ...(evidence?.trainer_tokens || [])
  ];

  const trainerMatches = tokenEvidence(raw, trainersAllowed);
  const helperMatches = tokenEvidence(raw, helperTokens);
  const hasTrainer = trainerMatches.length > 0;

  let certainty = CERTAINTY.NONE;
  if (hasTrainer && helperMatches.length > 0) certainty = CERTAINTY.HIGH;
  else if (hasTrainer) certainty = CERTAINTY.HIGH;

  return {
    char_count: raw.length,
    certainty,
    possible_match: hasTrainer,
    trainer_matches: trainerMatches,
    helper_matches: helperMatches,
    reason: certainty === CERTAINTY.NONE
      ? "no_allowed_trainer_evidence"
      : "allowed_trainer_evidence_found"
  };
}

function rowMatchesEvidence(row, evidence) {
  const rowText = [
    row?.horse,
    row?.rider,
    row?.trainer,
    row?.source_text,
    row?.source_payload
  ].map(text).filter(Boolean).join(" ");
  const trainerMatches = tokenEvidence(rowText, evidence?.trainers_allowed || []);
  const helperMatches = tokenEvidence(rowText, [
    ...(evidence?.horse_tokens || []),
    ...(evidence?.rider_tokens || []),
    ...(evidence?.trainer_tokens || [])
  ]);

  return {
    keep: trainerMatches.length > 0,
    trainer_matches: trainerMatches,
    helper_matches: helperMatches
  };
}

function assertAdapter(adapters, name) {
  if (!adapters || typeof adapters[name] !== "function") {
    throw new Error(`missing_required_adapter:${name}`);
  }
}

function assertFocus(focus) {
  if (!focus) throw new Error("missing_active_focus_show");
  if (!intValue(focus.show_no)) throw new Error("focus_show.show_no_required");
  if (!text(focus.focus_day)) throw new Error("focus_show.focus_day_required");
  if (focus.is_pause === true || text(focus.is_pause).toLowerCase() === "true") {
    throw new Error("focus_show.is_pause");
  }
}

async function runStage1HeartbeatAndRingDays(adapters, context) {
  assertAdapter(adapters, "getActiveFocusShow");
  assertAdapter(adapters, "writeHeartbeat");
  assertAdapter(adapters, "fetchRingDays");
  assertAdapter(adapters, "upsertRingDays");

  const focus = await adapters.getActiveFocusShow();
  assertFocus(focus);

  const focusDayKey = compactDate(focus.focus_day);
  const heartbeat = await adapters.writeHeartbeat({
    show_no: intValue(focus.show_no),
    focus_day: text(focus.focus_day),
    iso_date: text(focus.focus_day),
    focus_day_key: focusDayKey,
    focus_show_record_id: text(focus.focus_show_record_id),
    status: "running",
    branch: "clean_stage1_heartbeat_get_ring_days"
  });

  const ringDays = await adapters.fetchRingDays(focus);
  const rows = (ringDays || []).map((row) => ({
    ...row,
    ...buildConstKeys({ ...row, show_no: focus.show_no, focus_day: focus.focus_day }),
    focus_day: text(focus.focus_day),
    iso_date: text(focus.focus_day),
    focus_day_key: focusDayKey,
    is_active_focus_day: true,
    heartbeat_id: heartbeat?.heartbeat_id || heartbeat?.id || ""
  }));

  const upsert = await adapters.upsertRingDays(rows, { focus, heartbeat, context });

  return { focus, heartbeat, rows, upsert };
}

async function runStage2UpdateSchedule(adapters, context, stage1) {
  assertAdapter(adapters, "fetchUpdateSchedule");
  assertAdapter(adapters, "upsertUpdateSchedule");
  assertAdapter(adapters, "markDroppedUpdateSchedule");

  const focus = stage1.focus;
  const schedules = [];

  for (const ringDay of stage1.rows) {
    const fetched = await adapters.fetchUpdateSchedule(focus, ringDay);
    for (const row of fetched || []) {
      const reasons = preflightReason(row);
      schedules.push({
        ...row,
        ...buildConstKeys({ ...row, show_no: focus.show_no, focus_day: focus.focus_day }),
        focus_day: text(focus.focus_day),
        iso_date: text(focus.focus_day),
        focus_day_key: compactDate(focus.focus_day),
        heartbeat_id: stage1.heartbeat?.heartbeat_id || "",
        is_active_focus_day: true,
        is_preflight: reasons.length > 0,
        preflight_reason: reasons.join(",")
      });
    }
  }

  const upsert = await adapters.upsertUpdateSchedule(schedules, { focus, stage1, context });
  const dropped = await adapters.markDroppedUpdateSchedule(schedules, { focus, stage1, context });

  return {
    rows: schedules,
    eligible_rows: schedules.filter((row) => row.is_active_focus_day && !row.is_preflight),
    upsert,
    dropped
  };
}

async function runProbe3A(adapters, context, focus, scheduleRows, evidence) {
  assertAdapter(adapters, "fetchClassOog");
  assertAdapter(adapters, "markClassOogProbeProgress");
  assertAdapter(adapters, "storeClassOogRaw");

  const results = [];

  for (const row of scheduleRows) {
    const probeStartedAt = new Date().toISOString();
    const startedMs = Date.now();
    let raw = null;
    let rawStored = false;
    try {
      const rawPayload = await adapters.fetchClassOog(focus, row);
      const scan = scanClassOogPayload(rawPayload, evidence);
      const progress = {
        class_const_key: row.class_const_key,
        class_no: intValue(row.class_no),
        probe_status: scan.possible_match ? PROBE_STATUS.RAW_STORED : PROBE_STATUS.CHECKED,
        probe_attempted_at: probeStartedAt,
        probe_finished_at: new Date().toISOString(),
        probe_duration_ms: Date.now() - startedMs,
        probe_payload_chars: scan.char_count,
        probe_certainty: scan.certainty,
        probe_reason: scan.reason,
        probe_raw_stored: scan.possible_match
      };

      raw = await adapters.storeClassOogRaw({
        ...row,
        run_id: context.run_id,
        raw_html: scan.possible_match ? rawPayload : "",
        parse_status: scan.possible_match ? PARSE_STATUS.PENDING : "not_applicable",
        parsed_status: scan.possible_match ? PARSE_STATUS.PENDING : "not_applicable",
        ...progress
      }, { focus, context });
      rawStored = scan.possible_match;

      await adapters.markClassOogProbeProgress(row, progress, { focus, context });
      results.push({ row, progress, scan, raw });
    } catch (error) {
      const progress = {
        class_const_key: row.class_const_key,
        class_no: intValue(row.class_no),
        probe_status: rawStored ? PROBE_STATUS.RAW_STORED : PROBE_STATUS.FAILED,
        probe_attempted_at: probeStartedAt,
        probe_finished_at: new Date().toISOString(),
        probe_duration_ms: Date.now() - startedMs,
        probe_payload_chars: 0,
        probe_certainty: rawStored ? CERTAINTY.HIGH : CERTAINTY.NONE,
        probe_reason: String(error?.message || error),
        probe_raw_stored: rawStored
      };
      await adapters.markClassOogProbeProgress(row, progress, { focus, context });
      results.push({ row, progress, error: progress.probe_reason });
    }
  }

  return results;
}

async function runProbe3B(adapters, context, focus, evidence) {
  assertAdapter(adapters, "listPendingClassOogRaw");
  assertAdapter(adapters, "parseClassOogRaw");
  assertAdapter(adapters, "upsertClassOog");
  assertAdapter(adapters, "markClassOogRawParsed");

  const rawDocs = await adapters.listPendingClassOogRaw(focus, context);
  const materialized = [];

  for (const rawDoc of rawDocs || []) {
    try {
      const parsedRows = await adapters.parseClassOogRaw(rawDoc, { focus, context });
      const scopedRows = [];
      for (const row of parsedRows || []) {
        const match = rowMatchesEvidence(row, evidence);
        if (!match.keep) continue;
        scopedRows.push({
          ...rawDoc,
          ...row,
          iso_date: text(rawDoc.iso_date || rawDoc.focus_day || focus.focus_day),
          match_reason: match.trainer_matches.length ? "trainer_allowed" : "helper_match",
          ...buildConstKeys({ ...rawDoc, ...row, show_no: focus.show_no, focus_day: focus.focus_day })
        });
      }
      if (typeof adapters.clearClassOogForRawDoc === "function") {
        await adapters.clearClassOogForRawDoc(rawDoc, scopedRows, { focus, context });
      }
      const upsert = await adapters.upsertClassOog(scopedRows, { focus, rawDoc, context });
      await adapters.markClassOogRawParsed(rawDoc, {
        parse_status: PARSE_STATUS.PARSED,
        matched_count: scopedRows.length,
        skipped_count: Math.max(0, (parsedRows || []).length - scopedRows.length)
      }, { focus, context });
      materialized.push({ rawDoc, rows: scopedRows, upsert });
    } catch (error) {
      await adapters.markClassOogRawParsed(rawDoc, {
        parse_status: PARSE_STATUS.FAILED,
        parse_error: String(error?.message || error)
      }, { focus, context });
      materialized.push({ rawDoc, rows: [], error: String(error?.message || error) });
    }
  }

  return materialized;
}

async function runCleanStage1To3Proof(adapters, options = {}) {
  const context = {
    run_id: options.run_id || `clean-stage1-3-${Date.now()}`,
    started_at: new Date().toISOString()
  };

  const stage1 = await runStage1HeartbeatAndRingDays(adapters, context);
  const stage2 = await runStage2UpdateSchedule(adapters, context, stage1);
  const evidence = await adapters.buildProbeEvidence(stage1.focus, { context });
  const requestedLimit = intValue(options.limit);
  const requestedOffset = Math.max(0, intValue(options.offset));
  const eligibleRows = stage2.eligible_rows;
  const candidateRows = options.class_no
    ? eligibleRows.filter((row) => intValue(row.class_no) === intValue(options.class_no))
    : eligibleRows.slice(requestedOffset);
  const probeRows = options.class_no
    ? candidateRows
    : requestedLimit > 0
      ? candidateRows.slice(0, requestedLimit)
      : candidateRows;
  const probe3a = await runProbe3A(adapters, context, stage1.focus, probeRows, evidence);
  const nextOffset = options.class_no
    ? 0
    : requestedLimit > 0 && requestedOffset + probeRows.length < eligibleRows.length
      ? requestedOffset + probeRows.length
      : 0;

  return {
    ok: true,
    run_id: context.run_id,
    focus: stage1.focus,
    stage1: {
      heartbeat_id: stage1.heartbeat?.heartbeat_id || stage1.heartbeat?.id || "",
      hs_get_ring_days_rows: stage1.rows.length,
      upsert: stage1.upsert
    },
    stage2: {
      hs_update_schedule_rows: stage2.rows.length,
      non_preflight_rows: stage2.eligible_rows.length,
      upsert: stage2.upsert,
      dropped: stage2.dropped
    },
    page: {
      offset: requestedOffset,
      limit: requestedLimit,
      processed: probeRows.length,
      eligible_total: eligibleRows.length,
      next_offset: nextOffset,
      complete: nextOffset === 0
    },
    probe3a: {
      attempted: probe3a.length,
      raw_stored: probe3a.filter((item) => item.progress?.probe_raw_stored).length,
      failed: probe3a.filter((item) => item.error).length,
      checked: probe3a.filter((item) => item.progress?.probe_status === PROBE_STATUS.CHECKED).length,
      certainty: probe3a.reduce((counts, item) => {
        const key = item.progress?.probe_certainty || CERTAINTY.NONE;
        counts[key] = (counts[key] || 0) + 1;
        return counts;
      }, {})
    },
    probe3b: {
      skipped: true,
      reason: "FAST_3A_probe_only"
    },
    stop_reason: nextOffset === 0 ? "completed_stage_1_to_3a_fast_probe" : "page_complete_more_remaining",
    hs_class_oog_materialized: false
  };
}

module.exports = {
  CERTAINTY,
  PROBE_STATUS,
  PARSE_STATUS,
  buildConstKeys,
  preflightReason,
  scanClassOogPayload,
  rowMatchesEvidence,
  runStage1HeartbeatAndRingDays,
  runStage2UpdateSchedule,
  runProbe3A,
  runProbe3B,
  runCleanStage1To3Proof
};
