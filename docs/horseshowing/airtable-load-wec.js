const fs = require("fs");
const path = require("path");

const BASE_ID = process.env.WEC_AIRTABLE_BASE_ID || "app6XS1RvsPNRT6os";
const TOKEN = process.env.AIRTABLE_TOKEN;
const ROOT = "C:/Users/gombc/OneDrive - Sport Dog Food/github/repos/ringstatus-data/docs/horseshowing/normalized/14906-2026-06-10";
const TABLE_IDS = {
  shows: "tblyjlXwdf0zg0mhn",
  focus_show: "tblQldkP8wwIRxd4z",
  rings: "tbl5WKTbwL6IVrjyI",
  ring_names: "tblcHfnJzCYLoBhjf",
  dows: "tblaWVt2DuChsjq42",
  show_days: "tblMw8DPVzlt3H8M7",
  classes: "tblhxn7Jhkcnetaq5",
  entries: "tblrRnqH6utOdyhSk",
  horses: "tblgWogH7B6Cvusvm",
  riders: "tbl75W08G7nB4MYAl",
  trainers: "tblB72MubQbWfEqdf",
  counts: "tblmMztUikqZJlHU1",
  update_schedule: "tblzPWt9G3VBVqVi6",
  class_oog: "tblgUbX5n8GIuiqUI"
};
const FIELD_IDS = {
  ring_names_name: "fldjEu6C3OoTpmu3Q",
  dows_name: "fldYXyKkUHDiZcc7a"
};

if (!TOKEN) {
  throw new Error("AIRTABLE_TOKEN is not set");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  return body
    .filter((values) => values.some((value) => value !== ""))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function readCsv(name) {
  return parseCsv(fs.readFileSync(path.join(ROOT, name), "utf8"));
}

function num(value) {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function text(value) {
  if (value === "" || value === null || value === undefined) return undefined;
  return String(value);
}

function clean(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

function uniq(rows, keyFn) {
  const seen = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (key && !seen.has(key)) seen.set(key, row);
  }
  return [...seen.values()];
}

async function airtable(method, table, body) {
  const tableRef = TABLE_IDS[table] || table;
  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(tableRef)}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${table} failed: ${response.status} ${JSON.stringify(json)}`);
  }
  await sleep(225);
  return json;
}

async function upsert(table, rows, mergeFields, toFields) {
  let count = 0;
  for (let i = 0; i < rows.length; i += 10) {
    const chunk = rows.slice(i, i + 10).map((row) => ({ fields: clean(toFields(row)) }));
    if (!chunk.length) continue;
    await airtable("PATCH", table, {
      performUpsert: { fieldsToMergeOn: mergeFields },
      typecast: true,
      records: chunk
    });
    count += chunk.length;
  }
  return count;
}

async function main() {
  const shows = readCsv("shows.csv");
  const ringDays = readCsv("show_days.csv");
  const rings = readCsv("rings.csv");
  const counts = readCsv("counts.csv");
  const classes = readCsv("classes.csv");
  const updateSchedule = readCsv("update_schedule.csv");
  const classOog = readCsv("class_oog.csv");
  const entries = readCsv("entries.csv");
  const horses = readCsv("horses.csv");
  const riders = readCsv("riders.csv");
  const trainers = readCsv("trainers.csv");

  const dows = uniq(ringDays.map((row) => ({ dow: row.dow })), (row) => row.dow);

  const results = {};

  results.shows = await upsert("shows", shows, ["show_id"], (row) => ({
    show_id: text(row.show_no)
  }));

  results.focus_show = await upsert("focus_show", shows, ["show_no", "focus_day"], (row) => ({
    show_no: num(row.show_no),
    show_start: text(row.show_start),
    show_end: text(row.show_end),
    focus_day: text(row.focus_day),
    source: "manual_input",
    name: `${row.show_no}|${row.focus_day}`
  }));

  results.rings = await upsert("rings", rings, ["ring_no"], (row) => ({
    ring_no: num(row.ring_no),
    ring_name: text(row.ring_name),
    source: "get_ring_days.php"
  }));

  results.ring_names = await upsert("ring_names", rings, [FIELD_IDS.ring_names_name], (row) => ({
    [FIELD_IDS.ring_names_name]: text(row.ring_name)
  }));

  results.dows = await upsert("dows", dows, [FIELD_IDS.dows_name], (row) => ({
    [FIELD_IDS.dows_name]: text(row.dow)
  }));

  results.show_days = await upsert("show_days", ringDays, ["ring_day_no"], (row) => ({
    ring_day_no: text(row.ring_day_no),
    date_text: text(row.date_text)
  }));

  results.classes = await upsert("classes", classes, ["class_no"], (row) => ({
    class_no: num(row.class_no),
    class_number: num(row.class_number),
    class_payout: text(row.class_payout),
    class_name: text(row.class_name),
    class_label: text(row.class_label),
    source: text(row.source)
  }));

  results.entries = await upsert("entries", entries, ["entry_no"], (row) => ({
    entry_no: num(row.entry_no),
    horse: text(row.horse),
    rider: text(row.rider),
    trainer: text(row.trainer),
    source: text(row.source)
  }));

  results.horses = await upsert("horses", horses, ["horse"], (row) => ({
    horse: text(row.horse),
    tag: text(row.tag),
    source: text(row.source)
  }));

  results.riders = await upsert("riders", riders, ["rider"], (row) => ({
    rider: text(row.rider),
    tag: text(row.tag),
    source: text(row.source)
  }));

  results.trainers = await upsert("trainers", trainers, ["trainer"], (row) => ({
    trainer: text(row.trainer),
    tag: text(row.tag),
    source: text(row.source)
  }));

  results.counts = await upsert("counts", counts, ["show_no", "class_no"], (row) => ({
    show_no: num(row.show_no),
    class_no: num(row.class_no),
    class_number: num(row.class_number),
    class_name: text(row.class_name),
    entry_count: num(row.entry_count)
  }));

  results.update_schedule = await upsert("update_schedule", updateSchedule, ["show_no", "days", "class_no"], (row) => ({
    show_no: num(row.show_no),
    days: num(row.ring_day_no),
    focus_day: text(row.focus_day),
    ring_no: num(row.ring_no),
    ring_name: text(row.ring_name),
    date_text: text(row.date_text),
    class_no: num(row.class_no),
    event_id: num(row.event_id),
    event_name: text(row.event_name),
    class_payout: text(row.class_payout),
    class_name: text(row.class_name),
    time_text: text(row.time_text),
    time: text(row.time),
    iso_date: text(row.iso_date),
    entry_count: num(row.entry_count),
    event_type: num(row.event_type),
    oc_id: num(row.oc_id),
    live_flag: num(row.live_flag),
    source: text(row.source)
  }));

  results.class_oog = await upsert("class_oog", classOog, ["class_no", "entry_no"], (row) => ({
    ring: text(row.ring),
    ring_no: num(row.ring_no),
    days: num(row.ring_day_no),
    class_order: num(row.class_order),
    class_no: num(row.class_no),
    class_label: text(row.class_label),
    class_payout: text(row.class_payout),
    class_name: text(row.class_name),
    entry_order: num(row.entry_order),
    entry_no: num(row.entry_no),
    horse: text(row.horse),
    rider: text(row.rider),
    trainer: text(row.trainer),
    source: text(row.source)
  }));

  console.log(JSON.stringify({ ok: true, baseId: BASE_ID, results }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
