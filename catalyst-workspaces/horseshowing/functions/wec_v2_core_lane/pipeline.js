'use strict';

const crypto = require('node:crypto');
const cheerio = require('cheerio');
const {
  changeKey,
  compactDate,
  datasetKey,
  transitionWork,
  workKey
} = require('./contract');

function text(value) {
  return String(value ?? '').trim();
}

function normalized(value) {
  return text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      if (!['CREATEDTIME', 'MODIFIEDTIME', 'ROWID'].includes(key)) result[key] = stableObject(value[key]);
      return result;
    }, {});
  }
  return value;
}

function stateHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stableObject(value))).digest('hex');
}

function preflightReason(row) {
  const source = normalized([row.class_name, row.class_label, row.event_name].filter(Boolean).join(' '));
  if (/ticketed?\s*school/.test(source)) return 'ticketed_schooling';
  return '';
}

function normalizeScheduleRows(ring, sourceRows) {
  const showNo = Number(ring.show_no || 0);
  const day = text(ring.focus_day);
  const dayKey = compactDate(day);
  return (sourceRows || []).map((source) => {
    const classNo = Number(source.class_no || 0);
    const row = {
      show_no: showNo,
      focus_day: day,
      focus_day_key: dayKey,
      ring_day_no: Number(ring.ring_day_no || 0),
      ring_no: Number(ring.ring_no || 0),
      ring_name: text(ring.ring_name),
      class_no: classNo,
      class_number: Number(source.class_number || 0),
      class_name: text(source.class_name || source.event_name),
      time_text: text(source.time_text),
      class_start_time: text(source.class_start_time || source.time_text),
      entry_count: Number(source.entry_count || 0)
    };
    row.class_key = `${showNo}|${dayKey}|${row.ring_day_no}|${row.ring_no}|${classNo}`;
    row.is_preflight = Boolean(preflightReason(row));
    row.preflight_reason = preflightReason(row);
    return row;
  }).filter((row) => row.show_no && row.ring_day_no && row.ring_no && row.class_no);
}

function createProbeWork(scheduleRows) {
  return (scheduleRows || []).filter((row) => !row.is_preflight).map((row) => {
    const dataset = datasetKey(row.show_no, row.focus_day);
    return {
      work_key: workKey(dataset, 'C3A_PROBE_CLASS', row.class_key),
      dataset_key: dataset,
      stage: 'C3A_PROBE_CLASS',
      entity_type: 'class',
      entity_key: row.class_key,
      status: 'queued',
      source_attempt_count: 0,
      probe_attempt_count: 0,
      max_source_attempts: 3,
      max_probe_attempts: 3,
      payload: row
    };
  });
}

function payloadHasEvidence(rawPayload, evidence) {
  const haystack = normalized(rawPayload);
  return (evidence?.trainers || []).some((trainer) => {
    const needle = normalized(trainer);
    return needle && haystack.includes(needle);
  });
}

async function processProbeWork({ work, repository, fetchClass, evidence, now = () => new Date().toISOString() }) {
  if (!['queued', 'source_wait'].includes(work.status)) throw new Error(`probe_source_start_invalid:${work.status}`);
  let current = {
    ...work,
    status: 'fetching',
    source_attempt_count: Number(work.source_attempt_count || 0) + 1,
    probe_attempt_count: Number(work.probe_attempt_count || 0),
    source_started_at: now(),
    last_error: ''
  };
  await repository.saveWork(current);
  try {
    const rawPayload = await fetchClass(current);
    current = {
      ...current,
      status: 'probing',
      probe_attempt_count: Number(current.probe_attempt_count || 0) + 1,
      probe_started_at: now()
    };
    await repository.saveWork(current);
    const matched = payloadHasEvidence(rawPayload, evidence);
    if (matched) {
      await repository.saveRaw({
        raw_key: current.entity_key,
        dataset_key: current.dataset_key,
        class_key: current.entity_key,
        raw_html: rawPayload,
        parse_status: 'pending'
      });
    }
    current = {
      ...current,
      status: 'complete',
      outcome: matched ? 'raw_stored' : 'checked_no_match',
      probe_finished_at: now(),
      finished_at: now(),
      last_error: ''
    };
    await repository.saveWork(current);
    return current;
  } catch (error) {
    const sourceAttempts = Number(current.source_attempt_count || 0);
    const maxSourceAttempts = Number(current.max_source_attempts || 3);
    current = {
      ...current,
      status: sourceAttempts >= maxSourceAttempts ? 'source_review_required' : 'source_wait',
      source_finished_at: now(),
      last_error: text(error?.message || error)
    };
    await repository.saveWork(current);
    return current;
  }
}

function parseClassOogRows(rawDoc) {
  const $ = cheerio.load(rawDoc.raw_html || '');
  const entries = [];
  $('tr').each((_, tr) => {
    const values = $(tr).find('td').toArray().map((cell) => text($(cell).text()));
    if (values.length < 5) return;
    const entryNo = Number(values[1] || 0);
    if (!entryNo) return;
    entries.push({
      class_key: rawDoc.class_key,
      show_no: Number(rawDoc.show_no || 0),
      focus_day: text(rawDoc.focus_day),
      ring_day_no: Number(rawDoc.ring_day_no || 0),
      ring_no: Number(rawDoc.ring_no || 0),
      class_no: Number(rawDoc.class_no || 0),
      entry_order: Number(values[0] || 0),
      entry_no: entryNo,
      horse: values[2],
      rider: values[values.length - 2],
      trainer: values[values.length - 1]
    });
  });
  return entries;
}

function buildRuntimeRows({ schedule, entries, activeTrainers }) {
  const active = new Set((activeTrainers || []).map(normalized));
  const classStartTimes = (schedule || []).filter((row) => !row.is_preflight).map((row) => ({
    entity_key: row.class_key,
    class_start_key: row.class_key,
    show_no: row.show_no,
    focus_day: row.focus_day,
    ring_day_no: row.ring_day_no,
    ring_no: row.ring_no,
    ring_name: row.ring_name,
    class_no: row.class_no,
    class_name: row.class_name,
    class_start_time: row.class_start_time,
    status: 'scheduled'
  }));
  const ringMap = new Map();
  for (const row of classStartTimes) {
    const key = `${row.show_no}|${compactDate(row.focus_day)}|${row.ring_day_no}|${row.ring_no}`;
    if (!ringMap.has(key)) ringMap.set(key, {
      entity_key: key,
      ring_status_key: key,
      show_no: row.show_no,
      focus_day: row.focus_day,
      ring_day_no: row.ring_day_no,
      ring_no: row.ring_no,
      ring_name: row.ring_name,
      status: 'scheduled'
    });
  }
  const entryGoTimes = (entries || []).filter((row) => active.has(normalized(row.trainer))).map((row) => ({
    ...row,
    entity_key: `${row.class_key}|${row.entry_no}`,
    entry_go_key: `${row.class_key}|${row.entry_no}`,
    status: 'scheduled'
  }));
  return {
    ring_status: [...ringMap.values()],
    class_start_times: classStartTimes,
    entry_go_times: entryGoTimes
  };
}

function changedFields(previous, current) {
  const keys = new Set([...Object.keys(previous || {}), ...Object.keys(current || {})]);
  return [...keys].filter((key) => JSON.stringify(previous?.[key]) !== JSON.stringify(current?.[key])).sort();
}

function buildChangeEvents({ entityType, previous, current, stage }) {
  const prior = new Map((previous || []).map((row) => [row.entity_key, row]));
  const events = [];
  for (const row of current || []) {
    const before = prior.get(row.entity_key);
    const beforeHash = before ? stateHash(before) : '';
    const afterHash = stateHash(row);
    if (beforeHash === afterHash) continue;
    const dataset = row.show_no && row.focus_day ? datasetKey(row.show_no, row.focus_day) : text(row.dataset_key || 'wec_v2');
    events.push({
      change_key: changeKey(dataset, entityType, row.entity_key, afterHash),
      dataset_key: dataset,
      entity_type: entityType,
      entity_key: row.entity_key,
      change_type: before ? 'updated' : 'created',
      source_stage: stage,
      before_hash: beforeHash,
      after_hash: afterHash,
      changed_fields: changedFields(before, row),
      payload: row
    });
  }
  return events;
}

module.exports = {
  buildChangeEvents,
  buildRuntimeRows,
  createProbeWork,
  normalizeScheduleRows,
  parseClassOogRows,
  preflightReason,
  processProbeWork,
  stateHash
};
