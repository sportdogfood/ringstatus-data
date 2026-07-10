"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const handler = require("../handler");

test("Stage 2 preserves data-name and does not parse class_number", () => {
  const className = "737b) $200 1.00m Junior Jumper II.1";
  const html = `<h3 class="ring_evt" data-name="${className}" data-class="35349" data-time="10:45 am" data-n_entries="0"></h3>`;
  const rows = handler.__test.parseUpdateScheduleRows(
    html,
    { show_no: 14910, focus_day: "2026-07-10" },
    { ring_day_no: 4216, ring_no: 740, ring_name: "WEC Grand Arena" }
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].class_no, 35349);
  assert.equal(rows[0].class_name, className);
  assert.equal(Object.hasOwn(rows[0], "class_number"), false);
});
