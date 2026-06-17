import { readFileSync } from "node:fs";
import { parsers } from "./index.js";

const attachmentRoot = "C:/Users/gombc/.codex/attachments";

const scheduleHtml = readFileSync(
  `${attachmentRoot}/c3c5c5e0-f1d6-4e6d-8a73-acebc8c8dad2/pasted-text.txt`,
  "utf8"
);
const countsHtml = readFileSync(
  `${attachmentRoot}/8cc3e458-49f8-4d4a-b0c8-270dbb2c3174/pasted-text.txt`,
  "utf8"
);
const showHtml = readFileSync(
  `${attachmentRoot}/e3bfca48-709c-4bff-bffc-319800b1cb4e/pasted-text.txt`,
  "utf8"
);

const classOogHtml = `
<div id="order_option"><b>NOT A POSTED ORDER</b></div>
<div class="lg">
<table class="table-condensed orders_table">
<tr><th>#</th><th>Entry No.</th><th>Horse</th><th>Rider</th><th>Trainer</th></tr>
<tr><td>1</td><td>1856</td><td>Zara Www</td><td>Kate Phillips</td><td>Manuel G. Torres</td></tr>
<tr><td>2</td><td>1939</td><td>Harry D'ete RW</td><td>Amanda Carroll</td><td>Christoph Schroeder</td></tr>
</table>
</div>`;

const ringDaysJson = JSON.stringify([
  {
    ring_no: "665",
    name: "Indoor 4 - Gary",
    ring_days: [{ ring_day_no: "3834", date: "Saturday, June 6, 2026" }]
  }
]);

const statusJson = JSON.stringify([
  {
    show_no: "14905",
    class_no: "28785",
    ring_no: "665",
    ring_day_no: "3834",
    ring: "Indoor 4 - Gary",
    day: "Saturday, June 6, 2026",
    class: "756) $500 1.10m Amateur Jumper II.2d",
    entry: "#2017, United Del Coco<br>In ring at 2:48pm",
    total: "29",
    n_to_go: "22",
    n_gone: "7",
    time: "2:48pm",
    timestamp: 1780771717,
    elapsed: 37,
    orders: [],
    gone: [],
    n_standings: "31",
    type: "X"
  }
]);

const checks = [
  ["show", parsers.parseShowShell(showHtml).row_count, 1],
  ["ring_days", parsers.parseRingDays(ringDaysJson, { show_no: "14905" }).row_count, 1],
  ["ring_day_schedule", parsers.parseRingDaySchedule(scheduleHtml, { ring_day_no: "3828" }).row_count, 1],
  ["current_ring_status", parsers.parseCurrentRingStatus(statusJson).row_count, 1],
  ["current_orders", parsers.parseCurrentOrders(statusJson).row_count, 1],
  ["class_counts", parsers.parseClassCounts(countsHtml).row_count, 1],
  ["class_oog", parsers.parseClassOog(classOogHtml, { class_no: "28587" }).row_count, 2]
];

let failed = false;
for (const [name, actual, minimum] of checks) {
  const ok = actual >= minimum;
  console.log(`${ok ? "ok" : "fail"} ${name}: ${actual}`);
  if (!ok) failed = true;
}

if (failed) process.exit(1);
