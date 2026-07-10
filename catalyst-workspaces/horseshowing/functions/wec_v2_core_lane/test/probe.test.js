'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { processProbePayload } = require('../pipeline');

test('Catalyst probe processing scans a supplied payload and performs no network work', async () => {
  const events = [];
  const repository = {
    async saveWork(item) {
      events.push(`save:${item.status}:${item.probe_attempt_count || 0}`);
    },
    async saveRaw() {
      events.push('save:raw');
    }
  };
  const result = await processProbePayload({
    work: {
      status: 'awaiting_payload',
      probe_attempt_count: 0,
      max_probe_attempts: 3,
      entity_key: 'class-1'
    },
    repository,
    rawPayload: '<table><tr><td>1</td><td>1027</td><td>Horse</td><td>Rider</td><td>Other Trainer</td></tr></table>',
    evidence: { trainers: ['Smith'] },
    now: () => '2026-07-10T01:00:00.000Z'
  });

  assert.deepEqual(events, ['save:probing:1', 'save:complete:1']);
  assert.equal(result.status, 'complete');
  assert.equal(result.outcome, 'checked_no_match');
  assert.equal(result.probe_attempt_count, 1);
});

test('probe stores raw payload only when trainer evidence is present', async () => {
  const saved = [];
  const repository = {
    async saveWork(item) { saved.push({ type: 'work', item }); },
    async saveRaw(item) { saved.push({ type: 'raw', item }); }
  };

  const result = await processProbePayload({
    work: {
      status: 'awaiting_payload',
      probe_attempt_count: 0,
      max_probe_attempts: 3,
      entity_key: 'class-2'
    },
    repository,
    rawPayload: '<table><tr><td>1</td><td>1027</td><td>O\'Malley 7</td><td>Anaïs Rider</td><td>Smith</td></tr></table>',
    evidence: { trainers: ['Smith'] },
    now: () => '2026-07-10T01:00:00.000Z'
  });

  assert.equal(result.status, 'complete');
  assert.equal(result.probe_attempt_count, 1);
  assert.equal(saved.filter((item) => item.type === 'raw').length, 1);
});
