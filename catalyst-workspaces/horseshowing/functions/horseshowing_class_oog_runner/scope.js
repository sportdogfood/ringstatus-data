function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function intOrNull(value) {
  const parsed = Number.parseInt(text(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function truthy(value) {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    return ["true", "1", "yes", "checked"].includes(value.trim().toLowerCase());
  }
  return false;
}

function yyyymmddToIso(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return "";
}

function classContextKey(row) {
  const ringDayNo = intOrNull(row.ring_day_no ?? row.days);
  const ringNo = intOrNull(row.ring_no);
  const classNo = intOrNull(row.class_no);
  return ringDayNo && ringNo && classNo ? `${ringDayNo}|${ringNo}|${classNo}` : "";
}

function stagingContextKey(row) {
  return classContextKey(row);
}

function classOogKey(row) {
  const showNo = intOrNull(row.show_no);
  const entryNo = intOrNull(row.entry_no);
  const context = classContextKey(row);
  return showNo && context && entryNo ? `${showNo}|${context}|${entryNo}` : "";
}

function selectClassOogScope(rows, { showNo, focusDay }) {
  return rows.filter((row) => {
    if (intOrNull(row.show_no) !== intOrNull(showNo)) return false;
    if (yyyymmddToIso(row.iso_date) !== yyyymmddToIso(focusDay)) return false;
    if (!truthy(row.full_lock)) return false;
    if (!intOrNull(row.class_no)) return false;
    if (!intOrNull(row.ring_day_no)) return false;
    if (!intOrNull(row.ring_no)) return false;
    return true;
  });
}

module.exports = {
  classContextKey,
  classOogKey,
  selectClassOogScope,
  stagingContextKey
};
