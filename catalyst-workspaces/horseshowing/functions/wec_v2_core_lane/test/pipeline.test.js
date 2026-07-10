'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createProbeWork,
  normalizeScheduleRows
} = require('../pipeline');

test('schedule normalization preserves ring identity and preflights ticketed schooling', () => {
  const rows = normalizeScheduleRows({
    show_no: 14910,
    focus_day: '2026-07-10',
    ring_day_no: 4432,
    ring_no: 772,
    ring_name: 'HUNTER 2 - Robbie'
  }, [{
    class_no: 31643,
    class_number: 9015,
    class_name: 'Ticketed Schooling- Friday Hunter 2 8am- 3pm',
    time_text: '8:00am'
  }]);

  assert.equal(rows[0].class_key, '14910|20260710|4432|772|31643');
  assert.equal(rows[0].is_preflight, true);
  assert.equal(rows[0].preflight_reason, 'ticketed_schooling');
  assert.deepEqual(createProbeWork(rows), []);
});

test('non-preflight classes produce one primary probe item each', () => {
  const rows = normalizeScheduleRows({
    show_no: 14910,
    focus_day: '2026-07-10',
    ring_day_no: 4208,
    ring_no: 710,
    ring_name: 'INDOOR 6 - Brandon'
  }, [{ class_no: 31357, class_number: 638, class_name: '$500 1.20m Jumper II.2b', time_text: '7:30 am' }]);

  const work = createProbeWork(rows);
  assert.equal(work.length, 1);
  assert.equal(work[0].stage, 'C3A_PROBE_CLASS');
  assert.equal(work[0].entity_key, rows[0].class_key);
  assert.equal(work[0].max_probe_attempts, 3);
  assert.equal(work[0].status, 'awaiting_payload');
});
