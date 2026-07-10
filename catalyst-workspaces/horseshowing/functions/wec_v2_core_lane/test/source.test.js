'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  fetchText,
  parseRingDays,
  parseUpdateSchedule
} = require('../source');

test('ring discovery returns each focus-day ring exactly once', () => {
  const payload = JSON.stringify([{
    ring_no: '710',
    ring: 'INDOOR 6 - Brandon',
    ring_days: [
      { ring_day_no: '4208', date: 'Friday, July 10, 2026' },
      { ring_day_no: '4209', date: 'Saturday, July 11, 2026' }
    ]
  }, {
    ring_no: '710',
    ring: 'INDOOR 6 - Brandon',
    ring_days: [{ ring_day_no: '4208', date: 'Friday, July 10, 2026' }]
  }, {
    ring_no: '712',
    ring: 'INDOOR 2 - Jo',
    ring_days: [{ ring_day_no: '4057', date: 'Friday, July 10, 2026' }]
  }]);

  const rows = parseRingDays(payload, { show_no: 14910, focus_day: '2026-07-10' });
  assert.deepEqual(rows.map((row) => [row.ring_no, row.ring_day_no]), [[710, 4208], [712, 4057]]);
});

test('update schedule parser preserves class identity and source count', () => {
  const html = `
    <h3 class="ring_evt" data-class="31357" data-name="638) $500 1.20m Jumper II.2b" data-time="7:30 am" data-entries="40"></h3>
    <h3 class="ring_evt" data-class="31643" data-name="9015) Ticketed Schooling- Friday" data-time="8:00am" data-entries="0"></h3>
  `;
  const rows = parseUpdateSchedule(html);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    class_no: 31357,
    class_number: 638,
    class_name: '$500 1.20m Jumper II.2b',
    time_text: '7:30 am',
    entry_count: 40
  });
});

test('bounded fetch aborts and reports source timeout', async () => {
  const neverReturns = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  await assert.rejects(
    fetchText('https://example.invalid', { fetchImpl: neverReturns, timeoutMs: 5 }),
    /source_timeout/
  );
});
