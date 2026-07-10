'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  auditScheduleCoverage,
  canMaterializePrimaryRuntime,
  datasetKey,
  transitionWork,
  workKey
} = require('../contract');

test('dataset and work keys are deterministic and date scoped', () => {
  const dataset = datasetKey(14910, '2026-07-10');
  assert.equal(dataset, 'wec_v2|14910|20260710');
  assert.equal(
    workKey(dataset, 'C2_SCHEDULE_RING', '4208|710'),
    'wec_v2|14910|20260710|C2_SCHEDULE_RING|4208|710'
  );
});

test('stage 2 remains open and identifies every missing ring', () => {
  const discovered = [708, 709, 710, 711, 712, 713, 714, 740, 772].map((ringNo) => ({ ring_no: ringNo }));
  const terminal = [708, 709, 710, 711, 740, 772].map((ringNo) => ({ ring_no: ringNo, status: 'complete' }));

  assert.deepEqual(auditScheduleCoverage(discovered, terminal), {
    status: 'OPEN',
    discovered_count: 9,
    terminal_count: 6,
    missing_ring_nos: [712, 713, 714],
    failed_ring_nos: []
  });
});

test('second-pass work never blocks primary runtime readiness', () => {
  assert.equal(canMaterializePrimaryRuntime({
    schedule_coverage: { status: 'PASS' },
    primary_probe_pending: 0,
    primary_parse_pending: 0,
    second_pass_pending: 44
  }), true);
});

test('work transition records start before attempts and caps total attempts at three', () => {
  const queued = {
    status: 'queued',
    attempt_count: 0,
    max_attempts: 3
  };
  const started = transitionWork(queued, { type: 'start', at: '2026-07-10T01:00:00.000Z' });
  assert.equal(started.status, 'started');
  assert.equal(started.attempt_count, 1);

  const retry = transitionWork(started, { type: 'retry', error: 'timeout' });
  const startedAgain = transitionWork(retry, { type: 'start', at: '2026-07-10T01:01:00.000Z' });
  const retryAgain = transitionWork(startedAgain, { type: 'retry', error: 'timeout' });
  const finalStart = transitionWork(retryAgain, { type: 'start', at: '2026-07-10T01:02:00.000Z' });
  const terminal = transitionWork(finalStart, { type: 'retry', error: 'timeout' });

  assert.equal(terminal.status, 'review_required');
  assert.equal(terminal.attempt_count, 3);
});
