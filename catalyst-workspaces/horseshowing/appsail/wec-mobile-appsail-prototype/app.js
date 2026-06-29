"use strict";

const http = require("http");

const PORT = Number(process.env.X_ZOHO_CATALYST_LISTEN_PORT || process.env.PORT || 9000);
const SHOW_NO = "14907";
const DATA_SOURCE = "https://horseshowing-700800454.development.catalystserverless.com/server/horseshowing_sync/?action=wec-mobile-live&show_no=14907";
const SMARTBROWZ_PDF_URL = "https://horseshowing-700800454.development.catalystserverless.com/server/horseshowing_sync/?action=wec-print-smartbrowz-pdf&show_no=14907";

function send(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store"
  });
  res.end(body);
}

function json(res, status, payload) {
  send(res, status, JSON.stringify(payload, null, 2), "application/json; charset=utf-8");
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

async function fetchSchedule() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(DATA_SOURCE, {
      method: "GET",
      signal: controller.signal,
      headers: { accept: "application/json" }
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { parse_error: text.slice(0, 500) };
    }
    return {
      ok: response.ok && payload?.ok !== false,
      status: response.status,
      data_source: DATA_SOURCE,
      payload
    };
  } finally {
    clearTimeout(timeout);
  }
}

function classRows(ring) {
  return Array.isArray(ring?.classes) ? ring.classes : [];
}

function entryText(row) {
  const values = [
    row.entry_display,
    row.current_entry_text,
    row.horse_display,
    row.horse,
    row.entry_name,
    row.entries
  ];
  return values.map((value) => Array.isArray(value) ? value.join(", ") : value).find((value) => String(value || "").trim()) || "";
}

function classTitle(row) {
  return row.class_name || row.class_label || row.class_display || row.rs_class_name || "Class";
}

function renderSchedule(payload) {
  const rings = Array.isArray(payload?.rings) ? payload.rings : [];
  if (!rings.length) return "<section class=\"empty\">No rings returned.</section>";
  return rings.map((ring) => {
    const rows = classRows(ring);
    const body = rows.map((row) => {
      const entries = entryText(row);
      return `<article class="class-row">
        <div class="class-main">
          <span class="time">${esc(row.time_text || row.class_time_text || row.time || "")}</span>
          <span class="class-name">${esc(classTitle(row))}</span>
        </div>
        ${entries ? `<div class="entries">${esc(entries)}</div>` : ""}
      </article>`;
    }).join("");
    return `<section class="ring">
      <h2>${esc(ring.ring_display || ring.ring_name || ring.ring_name_normalized || ring.ring_no || "Ring")}</h2>
      ${body || "<div class=\"empty\">No classes returned.</div>"}
    </section>`;
  }).join("");
}

async function renderHome(res) {
  const result = await fetchSchedule();
  const payload = result.payload || {};
  const focusDay = payload.show_focus_date || payload.focus_day || "";
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WEC Mobile AppSail Prototype</title>
  <style>
    :root{color-scheme:light;--ink:#151515;--muted:#5f6670;--line:#d9dde3;--accent:#7e4f72;--bg:#f6f7f9;--card:#fff}
    *{box-sizing:border-box}
    body{margin:0;font-family:Arial,Helvetica,sans-serif;background:var(--bg);color:var(--ink)}
    header{position:sticky;top:0;z-index:2;background:#fff;border-bottom:1px solid var(--line);padding:12px 14px}
    h1{font-size:18px;line-height:1.15;margin:0 0 4px}
    .meta{font-size:12px;color:var(--muted);display:flex;gap:8px;flex-wrap:wrap}
    .actions{display:flex;gap:8px;margin-top:10px}
    .btn{display:inline-flex;min-height:40px;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:6px;background:#fff;color:#151515;text-decoration:none;font-weight:700;padding:0 12px;font-size:14px}
    main{padding:12px;display:grid;gap:12px}
    .ring{background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:hidden}
    .ring h2{margin:0;background:var(--accent);color:#fff;font-size:15px;padding:9px 10px;letter-spacing:.02em}
    .class-row{padding:10px;border-top:1px solid var(--line)}
    .class-row:first-of-type{border-top:0}
    .class-main{display:grid;grid-template-columns:72px 1fr;gap:8px;align-items:start}
    .time{font-weight:700;font-size:13px}
    .class-name{font-size:14px;line-height:1.25}
    .entries{margin:7px 0 0 80px;color:var(--muted);font-size:13px;line-height:1.25}
    .empty{padding:14px;color:var(--muted)}
    .source{font-size:11px;color:var(--muted);word-break:break-all;padding:0 14px 14px}
    @media (min-width:720px){main{grid-template-columns:repeat(2,minmax(0,1fr));max-width:980px;margin:0 auto}.source,header>div{max-width:980px;margin:0 auto}}
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${esc(payload.show_name || "WEC Mobile AppSail Prototype")}</h1>
      <div class="meta">
        <span>show_no ${esc(payload.show_no || SHOW_NO)}</span>
        <span>focus_day ${esc(focusDay || "unknown")}</span>
        <span>source ${esc(payload.focus_source || "wec-mobile-live")}</span>
      </div>
      <div class="actions">
        <a class="btn" href="${SMARTBROWZ_PDF_URL}" target="_blank" rel="noopener">PDF</a>
        <a class="btn" href="/api/schedule">JSON</a>
      </div>
    </div>
  </header>
  <main>${result.ok ? renderSchedule(payload) : `<section class="ring"><h2>Load failed</h2><div class="empty">${esc(JSON.stringify(payload).slice(0, 800))}</div></section>`}</main>
  <div class="source">Data source: ${esc(DATA_SOURCE)}</div>
</body>
</html>`;
  send(res, result.ok ? 200 : 502, html, "text/html; charset=utf-8");
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/health") {
      return json(res, 200, {
        ok: true,
        service: "wec-mobile-appsail-prototype",
        show_no: SHOW_NO,
        data_source: DATA_SOURCE
      });
    }
    if (url.pathname === "/api/schedule") {
      const result = await fetchSchedule();
      return json(res, result.ok ? 200 : 502, result);
    }
    if (url.pathname === "/") return renderHome(res);
    return json(res, 404, { ok: false, error: "not found" });
  } catch (error) {
    return json(res, 500, { ok: false, error: String(error?.message || error) });
  }
});

server.listen(PORT, () => {
  console.log(`wec-mobile-appsail-prototype listening on ${PORT}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
