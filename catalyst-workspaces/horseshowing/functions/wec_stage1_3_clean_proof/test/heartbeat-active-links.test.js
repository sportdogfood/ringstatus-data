"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const handler = require("../handler");

test("heartbeat active linkage updates the active focus and every view record", () => {
  const plan = handler.__test.buildHeartbeatActiveLinkUpdates(
    "recy3nqxqlvdzMrCf",
    "recHeartbeatLatest",
    [{ id: "recFocusDataA", fields: { rec_id: "recFocusDataA" } }, { id: "recFocusDataB", fields: { rec_id: "recFocusDataB" } }]
  );

  assert.deepEqual(plan.focus_show_update, {
    id: "recy3nqxqlvdzMrCf",
    fields: { hs_heartbeat: ["recHeartbeatLatest"] }
  });
  assert.deepEqual(plan.focus_data_updates, [{
    id: "recFocusDataA",
    fields: {
      hs_heartbeat: ["recHeartbeatLatest"],
      focus_show: ["recy3nqxqlvdzMrCf"]
    }
  }, {
    id: "recFocusDataB",
    fields: {
      hs_heartbeat: ["recHeartbeatLatest"],
      focus_show: ["recy3nqxqlvdzMrCf"]
    }
  }]);
});

test("heartbeat active linkage ignores view rows without real Airtable record IDs", () => {
  const plan = handler.__test.buildHeartbeatActiveLinkUpdates(
    "recFocus",
    "recHeartbeat",
    [{ fields: { rec_id: "formula-only" } }, null]
  );

  assert.equal(plan.focus_data_updates.length, 0);
});
