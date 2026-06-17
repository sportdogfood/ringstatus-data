const fs = require("fs");
const path = require("path");

const base = "C:/Users/gombc/OneDrive - Sport Dog Food/github/repos/ringstatus-data/docs/horseshowing";
const reports = path.join(base, "reports");
const out = path.join(base, "normalized", "14906-2026-06-10");
fs.mkdirSync(out, { recursive: true });

const show = {
  show_no: "14906",
  show_start: "2026-06-09",
  show_end: "2026-06-14",
  focus_day: "2026-06-10"
};

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(reports, name), "utf8"));
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(name, rows, headers) {
  const body = [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n");
  fs.writeFileSync(path.join(out, name), body);
}

function uniq(rows, keyFn) {
  const seen = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (key && !seen.has(key)) seen.set(key, row);
  }
  return [...seen.values()];
}

function numberOrBlank(value) {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "";
}

function parseClassLabel(label) {
  const text = String(label || "").trim();
  const numberMatch = text.match(/^(\d+)\)\s*(.*)$/);
  const class_number = numberMatch ? Number(numberMatch[1]) : "";
  let rest = numberMatch ? numberMatch[2].trim() : text;
  const payoutMatch = rest.match(/^(\$[^\s]+)/);
  const class_payout = payoutMatch ? payoutMatch[1] : "";
  if (payoutMatch) rest = rest.slice(payoutMatch[1].length).trim();
  return { class_number, class_payout, class_name: rest };
}

function parseDateText(dateText) {
  const parsed = new Date(`${dateText} 00:00:00 UTC`);
  if (Number.isNaN(parsed.getTime())) return { dow: "", iso_date: "" };
  const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const y = parsed.getUTCFullYear();
  const m = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const d = String(parsed.getUTCDate()).padStart(2, "0");
  return { dow: dayNames[parsed.getUTCDay()], iso_date: `${y}-${m}-${d}` };
}

function normalizeTime(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = match[2];
  const meridiem = match[3].toLowerCase();
  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}:00`;
}

const ringDaysPayload = readJson("14906-get-ring-days-2026-06-10.json");
const countsPayload = readJson("14906-counts-2026-06-10.json");
const schedulePayload = readJson("14906-focus-day-2026-06-10-combined-schedule.json");
const oogPayload = readJson("14906-class-oog-2026-06-10-combined.json");

const showRows = [{ ...show, show_key: `horseshowing|${show.show_no}`, source: "manual_input" }];

const ringDays = ringDaysPayload.rows.map((row) => {
  const parsedDate = parseDateText(row.date_text);
  return {
    show_no: row.show_no,
    ring_no: numberOrBlank(row.ring_no),
    ring_name: row.ring_name,
    date_text: row.date_text,
    ring_day_no: numberOrBlank(row.ring_day_no),
    dow: parsedDate.dow,
    iso_date: parsedDate.iso_date,
    focus_day_key: `${row.ring_day_no}|${parsedDate.dow}|${parsedDate.iso_date}`
  };
});

const rings = uniq(ringDays.map((row) => ({
  ring_no: row.ring_no,
  ring_name: row.ring_name,
  source: "get_ring_days.php"
})), (row) => row.ring_no);

const showDays = ringDays.map((row) => ({
  show_no: row.show_no,
  ring_no: row.ring_no,
  ring_name: row.ring_name,
  ring_day_no: row.ring_day_no,
  date_text: row.date_text,
  dow: row.dow,
  iso_date: row.iso_date,
  focus_day_key: row.focus_day_key,
  is_focus_day: row.iso_date === show.focus_day ? 1 : 0
}));

const counts = countsPayload.rows.map((row) => ({
  class_key: `${row.show_no}|${row.class_no}`,
  show_no: row.show_no,
  class_no: numberOrBlank(row.class_no),
  class_number: numberOrBlank(row.class_number),
  class_name: row.class_name,
  entry_count: numberOrBlank(row.entry_count)
}));

const classesFromCounts = counts.map((row) => ({
  class_no: row.class_no,
  class_number: row.class_number,
  class_payout: "",
  class_name: row.class_name,
  class_label: row.class_number ? `${row.class_number}) ${row.class_name}` : row.class_name,
  source: "counts.php"
}));

const scheduleRows = schedulePayload.rings.flatMap((ring) => ring.classes.map((row) => {
  const parsedDate = parseDateText(row.date_text);
  const parsedClass = parseClassLabel(row.event_name);
  return {
    show_no: row.show_no,
    ring_day_no: numberOrBlank(row.ring_day_no),
    ring_no: numberOrBlank(row.ring_no),
    ring_name: row.ring_name,
    date_text: row.date_text,
    class_no: numberOrBlank(row.class_no),
    event_id: numberOrBlank(row.event_id),
    event_name: row.event_name,
    class_number: parsedClass.class_number,
    class_payout: parsedClass.class_payout,
    class_name: parsedClass.class_name,
    time_text: row.time_text,
    time: normalizeTime(row.time_text),
    dow: parsedDate.dow,
    focus_day: row.date_text ? show.focus_day : "",
    iso_date: parsedDate.iso_date,
    entry_count: numberOrBlank(row.entry_count),
    event_type: numberOrBlank(row.event_type),
    oc_id: numberOrBlank(row.oc_id),
    live_flag: numberOrBlank(row.live_flag),
    source: "update_schedule.php"
  };
}));

const classesFromSchedule = scheduleRows.map((row) => ({
  class_no: row.class_no,
  class_number: row.class_number,
  class_payout: row.class_payout,
  class_name: row.class_name,
  class_label: row.event_name,
  source: "update_schedule.php"
}));

const oogRows = oogPayload.rows.map((row) => {
  const parsedClass = parseClassLabel(row.event_name);
  return {
    ring: row.ring_name,
    ring_no: numberOrBlank(row.ring_no),
    ring_day_no: numberOrBlank(row.ring_day_no),
    class_order: "",
    class_no: numberOrBlank(row.class_no),
    class_label: row.event_name,
    class_number: parsedClass.class_number,
    class_payout: parsedClass.class_payout,
    class_name: parsedClass.class_name,
    entry_order: numberOrBlank(row.entry_order),
    entry_no: numberOrBlank(row.entry_no),
    horse: row.horse,
    rider: row.rider,
    trainer: row.trainer,
    source: "class_oog.php"
  };
});

const classes = uniq([...classesFromCounts, ...classesFromSchedule], (row) => row.class_no);
const entries = uniq(oogRows.filter((row) => row.entry_no).map((row) => ({
  entry_no: row.entry_no,
  horse: row.horse,
  rider: row.rider,
  trainer: row.trainer,
  source: "class_oog.php"
})), (row) => row.entry_no);
const horses = uniq(oogRows.filter((row) => row.horse).map((row) => ({ horse: row.horse, tag: "", source: "class_oog.php" })), (row) => row.horse.toLowerCase());
const riders = uniq(oogRows.filter((row) => row.rider).map((row) => ({ rider: row.rider, tag: "", source: "class_oog.php" })), (row) => row.rider.toLowerCase());
const trainers = uniq(oogRows.filter((row) => row.trainer).map((row) => ({ trainer: row.trainer, tag: "", source: "class_oog.php" })), (row) => row.trainer.toLowerCase());

writeCsv("shows.csv", showRows, ["show_key", "show_no", "show_start", "show_end", "focus_day", "source"]);
writeCsv("rings.csv", rings, ["ring_no", "ring_name", "source"]);
writeCsv("show_days.csv", showDays, ["show_no", "ring_no", "ring_name", "ring_day_no", "date_text", "dow", "iso_date", "focus_day_key", "is_focus_day"]);
writeCsv("counts.csv", counts, ["class_key", "show_no", "class_no", "class_number", "class_name", "entry_count"]);
writeCsv("classes.csv", classes, ["class_no", "class_number", "class_payout", "class_name", "class_label", "source"]);
writeCsv("update_schedule.csv", scheduleRows, ["show_no", "ring_day_no", "ring_no", "ring_name", "date_text", "class_no", "event_id", "event_name", "class_number", "class_payout", "class_name", "time_text", "time", "dow", "focus_day", "iso_date", "entry_count", "event_type", "oc_id", "live_flag", "source"]);
writeCsv("class_oog.csv", oogRows, ["ring", "ring_no", "ring_day_no", "class_order", "class_no", "class_label", "class_number", "class_payout", "class_name", "entry_order", "entry_no", "horse", "rider", "trainer", "source"]);
writeCsv("entries.csv", entries, ["entry_no", "horse", "rider", "trainer", "source"]);
writeCsv("horses.csv", horses, ["horse", "tag", "source"]);
writeCsv("riders.csv", riders, ["rider", "tag", "source"]);
writeCsv("trainers.csv", trainers, ["trainer", "tag", "source"]);

const summary = {
  out,
  shows: showRows.length,
  rings: rings.length,
  ring_days: showDays.length,
  counts: counts.length,
  classes: classes.length,
  update_schedule: scheduleRows.length,
  class_oog: oogRows.length,
  entries: entries.length,
  horses: horses.length,
  riders: riders.length,
  trainers: trainers.length
};
fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
