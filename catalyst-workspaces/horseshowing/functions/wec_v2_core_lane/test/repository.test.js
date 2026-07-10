'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertV2Table,
  unwrapZcql
} = require('../repository');

test('repository rejects every legacy table name', () => {
  assert.throws(() => assertV2Table('hs_update_schedule'), /legacy_table_write_blocked/);
  assert.throws(() => assertV2Table('time_engine'), /legacy_table_write_blocked/);
  assert.equal(assertV2Table('wec_v2_update_schedule'), 'wec_v2_update_schedule');
});

test('zcql rows unwrap the named Catalyst table object', () => {
  assert.deepEqual(unwrapZcql('wec_v2_datasets', [
    { wec_v2_datasets: { dataset_key: 'one' } },
    { wec_v2_datasets: { dataset_key: 'two' } }
  ]), [{ dataset_key: 'one' }, { dataset_key: 'two' }]);
});
