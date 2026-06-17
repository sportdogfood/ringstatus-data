const test = require("node:test");
const assert = require("node:assert/strict");

const handle = require("./index");

test("focus pause gate reads Airtable checkbox field and field name", () => {
  assert.equal(handle.__test__.isFocusPaused({ is_pause: true }), true);
  assert.equal(handle.__test__.isFocusPaused({ fldgWn3BIdGzcGow1: true }), true);
  assert.equal(handle.__test__.isFocusPaused({ is_pause: false }), false);
});
