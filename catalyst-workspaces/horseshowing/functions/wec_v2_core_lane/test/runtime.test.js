'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildChangeEvents,
  buildRuntimeRows,
  parseClassOogRows
} = require('../pipeline');

test('parser preserves punctuation, international letters, and numbers', () => {
  const entries = parseClassOogRows({
    class_key: '14910|20260710|4208|710|31357',
    show_no: 14910,
    focus_day: '2026-07-10',
    ring_day_no: 4208,
    ring_no: 710,
    class_no: 31357,
    raw_html: '<table><tr><td>1</td><td>1027</td><td>O\'Malley 7</td><td>Anaïs Rider</td><td>Smith</td></tr></table>'
  });

  assert.equal(entries[0].entry_no, 1027);
  assert.equal(entries[0].horse, "O'Malley 7");
  assert.equal(entries[0].rider, 'Anaïs Rider');
});

test('runtime rows fan out from schedule and active-trainer entries', () => {
  const schedule = [{
    class_key: '14910|20260710|4208|710|31357',
    show_no: 14910,
    focus_day: '2026-07-10',
    ring_day_no: 4208,
    ring_no: 710,
    ring_name: 'INDOOR 6 - Brandon',
    class_no: 31357,
    class_name: '$500 1.20m Jumper II.2b',
    class_start_time: '07:30:00',
    is_preflight: false
  }];
  const entries = [{
    ...schedule[0],
    entry_no: 1027,
    entry_order: 1,
    horse: "O'Malley 7",
    rider: 'Anaïs Rider',
    trainer: 'Smith'
  }];

  const runtime = buildRuntimeRows({ schedule, entries, activeTrainers: ['Smith'] });
  assert.equal(runtime.class_start_times.length, 1);
  assert.equal(runtime.ring_status.length, 1);
  assert.equal(runtime.entry_go_times.length, 1);
});

test('unchanged state does not produce a duplicate change event', () => {
  const row = { entity_key: 'ring-710', status: 'scheduled', ring_no: 710 };
  assert.deepEqual(buildChangeEvents({ entityType: 'ring', previous: [row], current: [row], stage: 'C4B' }), []);

  const changed = buildChangeEvents({
    entityType: 'ring',
    previous: [row],
    current: [{ ...row, status: 'running' }],
    stage: 'LIVE'
  });
  assert.equal(changed.length, 1);
  assert.equal(changed[0].entity_type, 'ring');
  assert.equal(changed[0].change_type, 'updated');
});
