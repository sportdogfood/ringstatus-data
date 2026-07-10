'use strict';

const manifest = require('./manifest.json');

function text(value) {
  return String(value ?? '').trim();
}

function compactDate(value) {
  const compact = text(value).replace(/[^0-9]/g, '');
  if (compact.length !== 8) throw new Error('focus_day_invalid');
  return compact;
}

function datasetKey(showNo, focusDay) {
  const show = text(showNo);
  if (!show) throw new Error('show_no_required');
  return `wec_v2|${show}|${compactDate(focusDay)}`;
}

function workKey(dataset, stage, entityKey) {
  if (!manifest.stages.includes(stage)) throw new Error(`stage_invalid:${stage}`);
  return `${text(dataset)}|${stage}|${text(entityKey)}`;
}

function changeKey(dataset, entityType, entityKey, afterHash) {
  if (!manifest.change_entity_types.includes(entityType)) {
    throw new Error(`change_entity_type_invalid:${entityType}`);
  }
  return `${text(dataset)}|${entityType}|${text(entityKey)}|${text(afterHash)}`;
}

function ringNo(row) {
  return Number(row?.ring_no || 0);
}

function auditScheduleCoverage(discoveredRows, terminalRows) {
  const discovered = [...new Set((discoveredRows || []).map(ringNo).filter(Boolean))].sort((a, b) => a - b);
  const terminals = new Map();
  for (const row of terminalRows || []) {
    const ring = ringNo(row);
    if (ring) terminals.set(ring, text(row.status).toLowerCase());
  }
  const terminalStatuses = new Set(['complete', 'empty', 'failed', 'review_required']);
  const terminalRingNos = discovered.filter((ring) => terminalStatuses.has(terminals.get(ring)));
  const missingRingNos = discovered.filter((ring) => !terminalStatuses.has(terminals.get(ring)));
  const failedRingNos = discovered.filter((ring) => ['failed', 'review_required'].includes(terminals.get(ring)));
  return {
    status: missingRingNos.length || failedRingNos.length ? 'OPEN' : 'PASS',
    discovered_count: discovered.length,
    terminal_count: terminalRingNos.length,
    missing_ring_nos: missingRingNos,
    failed_ring_nos: failedRingNos
  };
}

function transitionWork(item, event) {
  const current = { ...item };
  const maxAttempts = Number(current.max_attempts || manifest.max_probe_attempts);
  if (event.type === 'start') {
    if (!['queued', 'retry_wait'].includes(current.status)) throw new Error(`work_start_invalid:${current.status}`);
    if (Number(current.attempt_count || 0) >= maxAttempts) throw new Error('work_attempt_cap_reached');
    return {
      ...current,
      status: 'started',
      attempt_count: Number(current.attempt_count || 0) + 1,
      started_at: event.at || new Date().toISOString(),
      last_error: ''
    };
  }
  if (event.type === 'retry') {
    if (current.status !== 'started') throw new Error(`work_retry_invalid:${current.status}`);
    return {
      ...current,
      status: Number(current.attempt_count || 0) >= maxAttempts ? 'review_required' : 'retry_wait',
      last_error: text(event.error),
      finished_at: event.at || new Date().toISOString()
    };
  }
  if (event.type === 'complete') {
    if (current.status !== 'started') throw new Error(`work_complete_invalid:${current.status}`);
    return {
      ...current,
      status: 'complete',
      outcome: text(event.outcome || 'complete'),
      finished_at: event.at || new Date().toISOString(),
      last_error: ''
    };
  }
  throw new Error(`work_event_invalid:${event.type}`);
}

function canMaterializePrimaryRuntime(snapshot) {
  return snapshot?.schedule_coverage?.status === 'PASS' &&
    Number(snapshot.primary_probe_pending || 0) === 0 &&
    Number(snapshot.primary_parse_pending || 0) === 0;
}

module.exports = {
  auditScheduleCoverage,
  canMaterializePrimaryRuntime,
  changeKey,
  compactDate,
  datasetKey,
  manifest,
  transitionWork,
  workKey
};
