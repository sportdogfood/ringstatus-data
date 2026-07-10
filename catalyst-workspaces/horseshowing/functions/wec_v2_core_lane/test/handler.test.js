'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createHandler } = require('../handler');

function responseCapture() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    }
  };
}

test('status is read-only and reports scheduler disabled', async () => {
  const calls = [];
  const handler = createHandler({
    service: {
      async status() {
        calls.push('status');
        return { ready: false, scheduler_enabled: false, missing_tables: ['wec_v2_datasets'] };
      }
    }
  });
  const res = responseCapture();
  await handler({ method: 'GET', url: '/?action=status' }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, ['status']);
  assert.deepEqual(JSON.parse(res.body), {
    ok: true,
    lane: 'wec_v2_core_lane',
    action: 'status',
    ready: false,
    scheduler_enabled: false,
    missing_tables: ['wec_v2_datasets']
  });
});

test('work-one processes at most one durable item', async () => {
  const calls = [];
  const handler = createHandler({
    service: {
      async workOne() {
        calls.push('work-one');
        return { processed: 1, stage: 'C2_SCHEDULE_RING', status: 'complete' };
      }
    }
  });
  const res = responseCapture();
  await handler({ method: 'POST', url: '/?action=work-one', body: '{}' }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, ['work-one']);
  assert.equal(JSON.parse(res.body).processed, 1);
});

test('mutating action fails closed when v2 tables are missing', async () => {
  const handler = createHandler({
    service: {
      async seedDataset() {
        const error = new Error('v2_schema_not_ready');
        error.code = 'V2_SCHEMA_NOT_READY';
        throw error;
      }
    }
  });
  const res = responseCapture();
  await handler({ method: 'POST', url: '/?action=seed-dataset', body: '{}' }, res);

  assert.equal(res.statusCode, 503);
  assert.equal(JSON.parse(res.body).error, 'v2_schema_not_ready');
});

test('unknown actions do not fall through to workflow work', async () => {
  const handler = createHandler({ service: {} });
  const res = responseCapture();
  await handler({ method: 'GET', url: '/?action=legacy-core' }, res);
  assert.equal(res.statusCode, 404);
});
