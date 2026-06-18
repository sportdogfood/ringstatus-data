const test = require("node:test");
const assert = require("node:assert/strict");

const handle = require("./index");

test("focus pause gate blocks downstream actions and allows audit", () => {
  assert.equal(handle.__test__.shouldPauseAction("sync-class-start-times", { is_pause: true }), true);
  assert.equal(handle.__test__.shouldPauseAction("sync-get-orders", { fldgWn3BIdGzcGow1: true }), true);
  assert.equal(handle.__test__.shouldPauseAction("audit", { is_pause: true }), false);
  assert.equal(handle.__test__.shouldPauseAction("run", { is_pause: false }), false);
});

test("paused class lane logs use existing Airtable status option", () => {
  const detail = handle.__test__.pausedLogDetail("sync-get-orders", {
    show_no: "14907",
    focus_day: "2026-06-17",
    record_id: "rec123"
  });
  assert.equal(detail.status, "skipped");
  assert.equal(detail.payload.reason, "focus_show.is_pause");
});
