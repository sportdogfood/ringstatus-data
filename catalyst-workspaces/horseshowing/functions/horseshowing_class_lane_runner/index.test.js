"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const handle = require("./index");

test("estimated schedule pace rows remain eligible for entry alerts", () => {
  assert.equal(typeof handle.__test__.isAlertableEntryGoTime, "function");
  assert.equal(handle.__test__.isAlertableEntryGoTime({
    go_time: "10:04:30",
    pace_seconds: 198,
    live_source: "estimated_schedule_pace.clean_step4_runtime"
  }), true);
});

test("successful alert writes append a workflow audit row", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  assert.match(source, /await logRun\(baseId, token, \{\s*action: "sync-class-alerts"/);
});
