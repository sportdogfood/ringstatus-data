"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "handler.js"), "utf8");

function block(start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start) + start.length));
}

test("active Core defers runtime mirrors but keeps the explicit heartbeat linkage", () => {
  const cadence = block("async function runCleanCadenceStack", "async function runCleanStage1To4Proof");
  const timeEngine = block("async function runTimeEngineOnly", "function scheduleRowForProof");
  const standaloneHeartbeat = block("async function writeStandaloneCadenceHeartbeat", "function classOogMirrorFields");

  assert.doesNotMatch(cadence, /upsertAirtableByKey|writeAirtableRowsByKey|updateAirtableRecords/);
  assert.doesNotMatch(timeEngine, /ensureAirtableMirrorTable|upsertAirtableBatchByKey/);
  assert.doesNotMatch(standaloneHeartbeat, /upsertAirtableByKey/);
  assert.match(standaloneHeartbeat, /syncAirtableActiveHeartbeatLinks/);
  assert.match(cadence, /defer_airtable_mirror:\s*true/);
});

test("Core keeps Airtable-owned focus and helper reads", () => {
  assert.match(source, /getActiveFocusShow/);
  assert.match(source, /getAirtableRecords\(TABLES\.trainers/);
});
