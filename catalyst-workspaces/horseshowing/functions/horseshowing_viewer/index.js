const catalyst = require("zcatalyst-sdk-node");

const TABLES = {
  shows: {
    name: "hs_shows",
    columns: ["ROWID", "show_no", "show_name", "start_date", "end_date", "focus_day_date", "focus_status_cadence", "focus_day_cadence", "future_days_cadence", "zoom_cadence", "status"]
  },
  days: {
    name: "hs_days",
    columns: ["ROWID", "show_ref", "show_no", "day_label", "source_key"]
  },
  rings: {
    name: "hs_rings",
    columns: ["ROWID", "show_ref", "day_ref", "show_no", "ring_no", "ring_day_no", "ring_name", "day_label"]
  },
  classes: {
    name: "hs_classes",
    columns: ["ROWID", "show_ref", "ring_ref", "show_no", "class_no", "class_label", "class_name", "entry_count", "source_endpoint"]
  },
  class_times: {
    name: "hs_class_times",
    columns: ["ROWID", "show_ref", "day_ref", "ring_ref", "class_ref", "show_no", "ring_day_no", "class_no", "class_label", "class_time_text", "class_order", "entry_count", "current_entry_no", "current_horse", "source_endpoint"]
  },
  entries: {
    name: "hs_entries",
    columns: ["ROWID", "show_ref", "class_ref", "class_time_ref", "show_no", "class_no", "entry_no", "entry_order", "horse", "rider", "trainer", "entry_source", "order_status"]
  },
  entry_lookup: {
    name: "hs_entry_lookup",
    columns: ["ROWID", "show_ref", "show_no", "entry_no", "horse", "rider", "trainer"]
  },
  focus: {
    name: "hs_focus",
    columns: ["ROWID", "show_ref", "entry_ref", "entry_lookup_ref", "show_no"]
  }
};

function parseQuery(req) {
  const rawUrl = req.url || req.originalUrl || "";
  const query = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?") + 1) : "";
  return new URLSearchParams(query);
}

function zcqlValue(value) {
  if (value === null || value === undefined || value === "") return null;
  return `'${String(value).replace(/'/g, "''")}'`;
}

function intInRange(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function setCors(res) {
  res.setHeader?.("access-control-allow-origin", "*");
  res.setHeader?.("access-control-allow-methods", "GET, OPTIONS");
  res.setHeader?.("access-control-allow-headers", "content-type");
}

function json(res, status, payload) {
  setCors(res);
  res.status?.(status);
  res.setHeader?.("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload, null, 2));
}

function html(res, body) {
  setCors(res);
  res.status?.(200);
  res.setHeader?.("content-type", "text/html; charset=utf-8");
  res.end(body);
}

async function execute(app, query) {
  return app.zcql().executeZCQLQuery(query);
}

function unwrapRows(result, tableName) {
  return (result || []).map((item) => item?.[tableName]).filter(Boolean);
}

async function tableRows(app, key, showNo, page, size) {
  const def = TABLES[key];
  const offset = (page - 1) * size;
  const where = showNo ? ` WHERE show_no = ${zcqlValue(showNo)}` : "";
  const countResult = await execute(app, `SELECT COUNT(ROWID) FROM ${def.name}${where}`);
  const countRow = countResult?.[0]?.[def.name] || {};
  const total = Number(countRow.ROWID || 0);
  const rows = unwrapRows(
    await execute(app, `SELECT ${def.columns.join(", ")} FROM ${def.name}${where} LIMIT ${size} OFFSET ${offset}`),
    def.name
  );
  return {
    table: key,
    source_table: def.name,
    page,
    size,
    total,
    last_page: Math.max(1, Math.ceil(total / size)),
    data: rows
  };
}

async function nestedRows(app, showNo, page, size) {
  const classTimes = await tableRows(app, "class_times", showNo, page, size);
  const classNos = [...new Set(classTimes.data.map((row) => row.class_no).filter(Boolean))].slice(0, 50);
  let entries = [];
  if (classNos.length) {
    const classWhere = classNos.map((classNo) => `class_no = ${zcqlValue(classNo)}`).join(" OR ");
    entries = unwrapRows(
      await execute(app, `SELECT ROWID, class_no, entry_no, entry_order, horse, rider, trainer, entry_source, order_status FROM ${TABLES.entries.name} WHERE show_no = ${zcqlValue(showNo)} AND (${classWhere}) LIMIT 300`),
      TABLES.entries.name
    );
  }
  const entriesByClass = new Map();
  for (const entry of entries) {
    const bucket = entriesByClass.get(entry.class_no) || [];
    bucket.push(entry);
    entriesByClass.set(entry.class_no, bucket);
  }
  return {
    table: "nested",
    page: classTimes.page,
    size: classTimes.size,
    total: classTimes.total,
    last_page: classTimes.last_page,
    data: classTimes.data.map((row) => ({
      id: row.ROWID,
      row_type: "class_time",
      binding_path: `show:${row.show_no} > ring_day:${row.ring_day_no || ""} > class:${row.class_no || ""}`,
      show_no: row.show_no,
      day_ref: row.day_ref,
      ring_ref: row.ring_ref,
      class_ref: row.class_ref,
      class_time_ref: row.ROWID,
      ring_day_no: row.ring_day_no,
      class_no: row.class_no,
      display: row.class_label,
      class_time_text: row.class_time_text,
      source_endpoint: row.source_endpoint,
      entry_count_loaded: (entriesByClass.get(row.class_no) || []).length,
      children: (entriesByClass.get(row.class_no) || [])
        .sort((a, b) => Number(a.entry_order || 0) - Number(b.entry_order || 0))
        .map((entry) => ({
          id: entry.ROWID,
          row_type: "entry",
          binding_path: `show:${row.show_no} > class:${entry.class_no || ""} > entry:${entry.entry_no || ""}`,
          show_no: row.show_no,
          day_ref: row.day_ref,
          ring_ref: row.ring_ref,
          class_ref: row.class_ref,
          class_time_ref: row.ROWID,
          ring_day_no: row.ring_day_no,
          class_no: entry.class_no,
          entry_no: entry.entry_no,
          entry_order: entry.entry_order,
          display: `${entry.entry_order || ""} ${entry.entry_no || ""} ${entry.horse || ""}`.trim(),
          horse: entry.horse,
          rider: entry.rider,
          trainer: entry.trainer,
          source_endpoint: entry.entry_source,
          order_status: entry.order_status
        }))
    }))
  };
}

function viewerHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Horseshowing Viewer</title>
  <link href="https://unpkg.com/tabulator-tables@6.4.0/dist/css/tabulator.min.css" rel="stylesheet">
  <style>
    body { font-family: Arial, sans-serif; margin: 16px; color: #17202a; }
    .bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
    input, select, button { height: 34px; padding: 0 10px; border: 1px solid #c8d0d9; border-radius: 4px; background: white; }
    button { cursor: pointer; }
    #table { height: 72vh; border: 1px solid #d8dee6; }
  </style>
</head>
<body>
  <div class="bar">
    <label>show_no <input id="showNo" value="14906"></label>
    <label>table
      <select id="tableName">
        <option value="nested">nested bindings</option>
        <option value="shows">shows</option>
        <option value="days">days</option>
        <option value="rings">rings</option>
        <option value="classes">classes</option>
        <option value="class_times">class_times</option>
        <option value="entries">entries</option>
        <option value="entry_lookup">entry_lookup</option>
        <option value="focus">focus</option>
      </select>
    </label>
    <button id="load">Load</button>
  </div>
  <div id="table"></div>
  <script src="https://unpkg.com/tabulator-tables@6.4.0/dist/js/tabulator.min.js"></script>
  <script>
    const apiBase = location.origin + location.pathname;
    let table;
    function columnsFor(name) {
      if (name === "nested") {
        return [
          {title:"type", field:"row_type", width:110, headerFilter:true},
          {title:"display", field:"display", width:420, headerFilter:true},
          {title:"ring_day_no", field:"ring_day_no", width:130, headerFilter:true},
          {title:"class_no", field:"class_no", width:110, headerFilter:true},
          {title:"entry_no", field:"entry_no", width:110, headerFilter:true},
          {title:"time", field:"class_time_text", headerFilter:true},
          {title:"loaded entries", field:"entry_count_loaded", width:130},
          {title:"rider", field:"rider", width:180, headerFilter:true},
          {title:"trainer", field:"trainer", width:180, headerFilter:true},
          {title:"binding", field:"binding_path", width:360},
          {title:"class_time_ref", field:"class_time_ref", width:170},
          {title:"class_ref", field:"class_ref"},
          {title:"ring_ref", field:"ring_ref"}
        ];
      }
      return undefined;
    }
    function loadTable() {
      const showNo = document.getElementById("showNo").value.trim();
      const name = document.getElementById("tableName").value;
      if (table) table.destroy();
      table = new Tabulator("#table", {
        layout:"fitDataStretch",
        ajaxURL: apiBase,
        ajaxParams:{ action: name === "nested" ? "nested" : "table", table: name, show_no: showNo, size: 100 },
        pagination:true,
        paginationMode:"remote",
        paginationSize:100,
        ajaxResponse:function(url, params, response){ return response; },
        dataTree: name === "nested",
        dataTreeChildField:"children",
        dataTreeStartExpanded:false,
        columns: columnsFor(name),
        autoColumns: name !== "nested",
        movableColumns:true,
        resizableColumnFit:true
      });
    }
    document.getElementById("load").addEventListener("click", loadTable);
    loadTable();
  </script>
</body>
</html>`;
}

async function handle(req, res) {
  try {
    setCors(res);
    if ((req.method || "").toUpperCase() === "OPTIONS") return res.end("");
    const app = catalyst.initialize(req);
    const query = parseQuery(req);
    const action = query.get("action") || "viewer";
    const showNo = query.get("show_no") || "14906";
    const page = intInRange(query.get("page"), 1, 1, 100000);
    const size = intInRange(query.get("size"), 100, 1, 500);
    if (action === "viewer") return html(res, viewerHtml());
    if (action === "tables") return json(res, 200, { ok: true, tables: Object.keys(TABLES) });
    if (action === "table") {
      const key = query.get("table") || "entries";
      if (!TABLES[key]) return json(res, 400, { ok: false, error: `Unknown table: ${key}` });
      return json(res, 200, { ok: true, ...(await tableRows(app, key, showNo, page, size)) });
    }
    if (action === "nested") return json(res, 200, { ok: true, ...(await nestedRows(app, showNo, page, size)) });
    return json(res, 400, { ok: false, error: `Unknown action: ${action}` });
  } catch (error) {
    return json(res, 500, { ok: false, error: String(error?.message || error), stack: String(error?.stack || "") });
  }
}

module.exports = handle;
