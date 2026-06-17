const fs = require("fs");
const path = require("path");

const src = "C:/Users/gombc/OneDrive - Sport Dog Food/github/repos/ringstatus-data/docs/horseshowing/normalized/14906-2026-06-10";
const out = "C:/Users/gombc/OneDrive - Sport Dog Food/github/repos/ringstatus-data/docs/horseshowing/catalyst-import/14906-2026-06-10";
fs.mkdirSync(out, { recursive: true });

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  const [headers, ...body] = rows;
  return body.filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(headers.map((h, i) => [h, values[i] || ""])));
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(name, rows, headers) {
  const body = [headers.join(","), ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(","))].join("\n");
  fs.writeFileSync(path.join(out, name), body);
}

function read(name) {
  return parseCsv(fs.readFileSync(path.join(src, name), "utf8"));
}

function classNumber(label) {
  const match = String(label || "").match(/^(\d+)\)/);
  return match ? match[1] : "";
}

function uniq(rows, key) {
  const seen = new Map();
  for (const row of rows) {
    const value = key(row);
    if (value && !seen.has(value)) seen.set(value, row);
  }
  return [...seen.values()];
}

const showDays = read("show_days.csv");
const updateSchedule = read("update_schedule.csv");
const counts = read("counts.csv");
const classOog = read("class_oog.csv");
const getRings = read("get_rings.csv");
const getOrders = read("get_orders.csv");
const horses = read("horses.csv");
const riders = read("riders.csv");
const trainers = read("trainers.csv");
const classes = read("classes.csv");
const updateByClassNo = new Map(updateSchedule
  .filter((row) => row.class_no)
  .map((row) => [row.class_no, row]));
const countsByClassNo = new Map(counts
  .filter((row) => row.class_no)
  .map((row) => [row.class_no, row]));

writeCsv("hs_focus_show.csv", [{ focus_show_key: "14906|2026-06-10", show_no: "14906", show_start: "2026-06-09", show_end: "2026-06-14", focus_day: "2026-06-10", source: "manual_input" }], ["focus_show_key", "show_no", "show_start", "show_end", "focus_day", "source"]);
writeCsv("hs_ring_days.csv", showDays, ["ring_day_no", "show_no", "ring_no", "ring_name", "date_text", "dow", "iso_date", "focus_day_key", "is_focus_day"]);
writeCsv("hs_get_ring_days.csv", showDays.map((row) => ({ ...row, source_payload: "" })), ["ring_day_no", "show_no", "ring_no", "ring_name", "date_text", "dow", "iso_date", "focus_day_key", "source_payload"]);
writeCsv("hs_counts.csv", counts.map((row) => ({ ...row, source_payload: "" })), ["class_key", "show_no", "class_no", "class_number", "class_name", "entry_count", "source_payload"]);
writeCsv("hs_update_schedule.csv", updateSchedule.map((row) => ({ ...row, update_schedule_key: `${row.show_no}|${row.ring_day_no}|${row.class_no}`, class_start_time: row.time, source_endpoint: row.source, source_payload: "" })), ["update_schedule_key", "show_no", "ring_day_no", "ring_no", "ring_name", "date_text", "class_no", "event_id", "event_name", "class_number", "class_payout", "class_name", "time_text", "class_start_time", "dow", "focus_day", "iso_date", "entry_count", "event_type", "oc_id", "live_flag", "source_endpoint", "source_payload"]);
writeCsv("hs_class_oog.csv", classOog.map((row) => ({ ...row, class_oog_key: `${row.class_no}|${row.entry_no}`, source_endpoint: row.source, source_payload: "" })), ["class_oog_key", "ring", "ring_no", "ring_day_no", "class_order", "class_no", "class_label", "class_number", "class_payout", "class_name", "entry_order", "entry_no", "horse", "rider", "trainer", "source_endpoint", "source_payload"]);
writeCsv("hs_get_rings.csv", getRings.map((row) => ({ ...row, class_number: classNumber(row.class_text), timestamp_value: row.timestamp, status_type: row.type, source_payload: "" })), ["get_rings_key", "show_no", "ring_no", "ring_day_no", "class_no", "class_text", "class_number", "entry_no", "entry_text", "total", "n_to_go", "n_gone", "time_text", "timestamp_value", "elapsed", "status_type", "source_payload"]);
writeCsv("hs_get_orders.csv", getOrders.map((row) => ({ ...row, class_number: classNumber(row.class_text), timestamp_value: row.timestamp, source_payload: "" })), ["get_orders_key", "show_no", "ring_no", "ring_day_no", "ring_name", "day_text", "class_text", "class_number", "entry_no", "entry_text", "total", "n_to_go", "n_gone", "time_text", "timestamp_value", "elapsed", "source_payload"]);
writeCsv("hs_horses.csv", horses, ["horse", "tag", "source"]);
writeCsv("hs_riders.csv", riders, ["rider", "tag", "source"]);
writeCsv("hs_trainers.csv", trainers, ["trainer", "tag", "source"]);
writeCsv("hs_ring_names.csv", uniq(showDays.map((row) => ({ ring_name: row.ring_name })), (row) => row.ring_name), ["ring_name"]);
writeCsv("hs_dows.csv", uniq(showDays.map((row) => ({ dow: row.dow })), (row) => row.dow), ["dow"]);
writeCsv("hs_class_names.csv", uniq(classes.map((row) => ({ class_name: row.class_name })), (row) => row.class_name), ["class_name"]);
writeCsv("hs_class_start_times.csv", updateSchedule.map((row) => {
  const count = countsByClassNo.get(row.class_no) || {};
  return {
    class_start_key: `${row.show_no}|${row.focus_day}|${row.ring_day_no}|${row.class_no}|${row.time}`,
    show_no: row.show_no,
    focus_day: row.focus_day,
    ring_day_no: row.ring_day_no,
    ring_no: row.ring_no,
    ring_name: row.ring_name,
    class_no: row.class_no,
    class_name: row.class_name,
    class_start_time: row.time,
    entry_count: row.entry_count || count.entry_count || ""
  };
}), ["class_start_key", "show_no", "focus_day", "ring_day_no", "ring_no", "ring_name", "class_no", "class_name", "class_start_time", "entry_count"]);
writeCsv("hs_entry_go_times.csv", classOog.map((row) => {
  const schedule = updateByClassNo.get(row.class_no) || {};
  const count = countsByClassNo.get(row.class_no) || {};
  return {
    entry_go_key: `${row.class_no}|${row.entry_no}|${row.entry_order}`,
    show_no: schedule.show_no || "14906",
    focus_day: schedule.focus_day || "2026-06-10",
    ring_day_no: schedule.ring_day_no || row.ring_day_no,
    ring_no: schedule.ring_no || row.ring_no,
    class_no: row.class_no,
    class_start_time: schedule.time || schedule.class_start_time || "",
    display_time: schedule.time_text || "",
    entry_count: schedule.entry_count || count.entry_count || "",
    entry_no: row.entry_no,
    entry_order: row.entry_order,
    horse: row.horse,
    rider: row.rider,
    trainer: row.trainer,
    go_time: ""
  };
}), ["entry_go_key", "show_no", "focus_day", "ring_day_no", "ring_no", "class_no", "class_start_time", "display_time", "entry_count", "entry_no", "entry_order", "horse", "rider", "trainer", "go_time"]);

console.log(JSON.stringify({ out, files: fs.readdirSync(out) }, null, 2));
