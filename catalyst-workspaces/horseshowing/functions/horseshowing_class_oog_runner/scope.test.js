const assert = require("node:assert/strict");
const test = require("node:test");

const {
  classContextKey,
  selectClassOogScope,
  classOogKey
} = require("./scope");

test("selectClassOogScope uses only update_schedule_staging.full_lock rows for focus day", () => {
  const rows = [
    { record_id: "rec1", show_no: 14907, iso_date: "2026-06-17", class_no: 100, ring_day_no: 4224, ring_no: 685, full_lock: true },
    { record_id: "rec2", show_no: 14907, iso_date: "2026-06-17", class_no: 101, ring_day_no: 4224, ring_no: 685, lock: true, full_lock: false },
    { record_id: "rec3", show_no: 14907, iso_date: "2026-06-18", class_no: 102, ring_day_no: 4225, ring_no: 685, full_lock: true },
    { record_id: "rec4", show_no: 14907, iso_date: "2026-06-17", class_no: 0, ring_day_no: 4224, ring_no: 685, full_lock: true }
  ];

  const selected = selectClassOogScope(rows, { showNo: 14907, focusDay: "2026-06-17" });

  assert.deepEqual(selected.map((row) => row.record_id), ["rec1"]);
});

test("class_oog context and record keys include ring_no", () => {
  const row = { show_no: 14907, ring_day_no: 4224, ring_no: 685, class_no: 29679, entry_no: 3100 };

  assert.equal(classContextKey(row), "4224|685|29679");
  assert.equal(classOogKey(row), "14907|4224|685|29679|3100");
});
