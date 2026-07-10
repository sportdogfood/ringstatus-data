'use strict';

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body || '{}'); } catch (_error) { return {}; }
  }
  if (typeof req.on !== 'function') return {};
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (_error) { resolve({}); }
    });
    req.on('error', reject);
  });
}

function createHandler({ service }) {
  return async function handler(req, res) {
    const url = new URL(req.url || '/', 'https://wec-v2.local');
    const action = url.searchParams.get('action') || 'status';
    const routes = {
      status: () => service.status(),
      audit: () => service.audit(),
      'seed-dataset': async () => service.seedDataset(await readBody(req)),
      'work-one': async () => service.workOne(await readBody(req))
    };
    if (!routes[action]) return sendJson(res, 404, {
      ok: false,
      lane: 'wec_v2_core_lane',
      action,
      error: 'action_not_found'
    });
    try {
      const result = await routes[action]();
      return sendJson(res, 200, {
        ok: true,
        lane: 'wec_v2_core_lane',
        action,
        ...result
      });
    } catch (error) {
      const statusCode = error?.code === 'V2_SCHEMA_NOT_READY' ? 503 :
        error?.code === 'INVALID_INPUT' ? 400 : 500;
      return sendJson(res, statusCode, {
        ok: false,
        lane: 'wec_v2_core_lane',
        action,
        error: String(error?.message || error)
      });
    }
  };
}

module.exports = async function catalystHandler(req, res) {
  const catalyst = require('zcatalyst-sdk-node');
  const { createRepository } = require('./repository');
  const { createService } = require('./service');
  const app = catalyst.initialize(req);
  return createHandler({ service: createService({ repository: createRepository(app) }) })(req, res);
};

module.exports.createHandler = createHandler;
module.exports.readBody = readBody;
