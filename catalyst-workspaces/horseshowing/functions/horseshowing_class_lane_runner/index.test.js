const test = require("node:test");
const assert = require("node:assert/strict");

const handle = require("./index");

test("focus pause gate blocks downstream actions and allows audit", () => {
  assert.equal(handle.__test__.shouldPauseAction("sync-class-start-times", { is_pause: true }), true);
  assert.equal(handle.__test__.shouldPauseAction("sync-get-orders", { fldgWn3BIdGzcGow1: true }), true);
  assert.equal(handle.__test__.shouldPauseAction("audit", { is_pause: true }), false);
  assert.equal(handle.__test__.shouldPauseAction("run", { is_pause: false }), false);
});
