"use strict";

const http = require("http");
const { URLSearchParams } = require("url");

const PORT = Number(process.env.X_ZOHO_CATALYST_LISTEN_PORT || process.env.PORT || 9000);
const SHOW_NO = process.env.WEC_SHOW_NO || "14909";
const SEARCH_URL = process.env.WEC_HELPER_SEARCH_URL || "https://horseshowing-700800454.development.catalystserverless.com/server/horseshowing_sync/";
const AIRTABLE_WEBHOOK_URL = process.env.BARN_ENTRY_AIRTABLE_WEBHOOK_URL || "https://hooks.airtable.com/workflows/v1/genericWebhook/app6XS1RvsPNRT6os/wflcCeL2hMlBHwIV3/wtrFr5HD4HlwLCT9J";
const BUILD_MARKER = "BARN-ENTRY-HELPER-APPSAIL-V1";

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

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw_body: raw };
  }
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeout_ms || 15000));
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 1000) };
    }
    return { ok: response.ok, status: response.status, payload };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeAppearances(searchPayload) {
  const top = Array.isArray(searchPayload.top_matches) ? searchPayload.top_matches : [];
  const hydrated = Array.isArray(searchPayload.hydration?.results) ? searchPayload.hydration.results : [];
  const byKey = new Map();
  for (const match of top) {
    const key = String(match.helper_key || match.display_name || match.entity_key || "").toLowerCase();
    if (!key) continue;
    byKey.set(key, {
      barn_name: match.fields?.barn_name || match.display_name || match.fields?.horse_name || "",
      horse_name: match.fields?.horse_name || match.display_name || "",
      show_name: match.fields?.horse_display || match.fields?.show_name || match.fields?.horse_name || match.display_name || "",
      helper_key: match.helper_key || "",
      is_follow: match.is_follow === true || match.follow === true,
      appearances: []
    });
  }
  for (const item of hydrated) {
    const key = String(item.entity_key || item.display_name || item.entity_name || "").toLowerCase();
    const current = byKey.get(key) || {
      barn_name: item.display_name || item.entity_name || "",
      horse_name: item.entity_name || item.display_name || "",
      show_name: item.entity_name || item.display_name || "",
      helper_key: item.entity_key || "",
      is_follow: false,
      appearances: []
    };
    current.appearances = Array.isArray(item.appearances) ? item.appearances : [];
    current.current_mapping_status = item.current_mapping_status || "";
    current.current_day_appearance_count = Number(item.current_day_appearance_count || current.appearances.length || 0);
    byKey.set(key, current);
  }
  return [...byKey.values()];
}

async function handleSearch(req, res, url) {
  const q = String(url.searchParams.get("q") || "").trim();
  if (q.length < 2) return json(res, 200, { ok: true, query: q, horses: [] });
  const searchUrl = new URL(SEARCH_URL);
  searchUrl.searchParams.set("action", "wec-helper-search");
  searchUrl.searchParams.set("type", "horses");
  searchUrl.searchParams.set("hydrate", "1");
  searchUrl.searchParams.set("hydrate_scope", "barn_entry");
  searchUrl.searchParams.set("show_no", SHOW_NO);
  searchUrl.searchParams.set("limit", "10");
  searchUrl.searchParams.set("q", q);
  const result = await fetchJson(searchUrl);
  if (!result.ok || result.payload?.ok === false) {
    return json(res, 502, {
      ok: false,
      blocker: result.payload?.blocker || "helper_search_failed",
      status: result.status,
      payload: result.payload
    });
  }
  return json(res, 200, {
    ok: true,
    query: q,
    show_no: SHOW_NO,
    source_status: result.status,
    focus_day: result.payload?.hydration?.focus_day || result.payload?.focus_day || "",
    horses: normalizeAppearances(result.payload)
  });
}

async function handleSave(req, res, url) {
  const body = await readJson(req);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return json(res, 400, { ok: false, blocker: "rows_required" });

  const form = new URLSearchParams();
  form.set("source", "barn-entry-helper-appsail");
  form.set("submitted_at", new Date().toISOString());
  form.set("show_no", SHOW_NO);
  form.set("row_count", String(rows.length));
  form.set("rows_json", JSON.stringify(rows));
  rows.forEach((row, index) => {
    for (const [key, value] of Object.entries(row || {})) {
      if (value === undefined || value === null) continue;
      form.set(`row_${index}_${key}`, String(value));
    }
  });

  if (url.searchParams.get("dry_run") === "1") {
    return json(res, 200, {
      ok: true,
      dry_run: true,
      row_count: rows.length,
      form_keys: [...form.keys()]
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(AIRTABLE_WEBHOOK_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    });
    const responseText = await response.text();
    return json(res, response.ok ? 200 : 502, {
      ok: response.ok,
      status: response.status,
      row_count: rows.length,
      webhook_response: responseText.slice(0, 500)
    });
  } finally {
    clearTimeout(timeout);
  }
}

function renderIndex() {
  return `<!doctype html>
<html lang="en" data-build="${BUILD_MARKER}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Barn Entry Helper</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7f8;
      --panel: #fff;
      --line: #d7dddf;
      --line-strong: #aebabc;
      --text: #102022;
      --muted: #657173;
      --accent: #14534d;
      --soft: #e9f2f0;
      --warn-bg: #fff8e8;
      --warn-line: #d8a13a;
      --danger: #9b1c1c;
      --radius: 8px;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 14px;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); }
    button, input { font: inherit; }
    .app { max-width: 680px; min-height: 100vh; margin: 0 auto; padding: 10px; background: var(--panel); }
    .lookup { position: sticky; top: 0; z-index: 3; padding: 8px 0 10px; background: var(--panel); border-bottom: 1px solid var(--line); }
    h1 { margin: 0 0 8px; font-size: 18px; font-weight: 600; }
    .search-row { display: grid; grid-template-columns: 1fr; gap: 6px; }
    input[type="search"], input[type="text"] {
      width: 100%;
      min-height: 46px;
      padding: 10px 12px;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius);
      outline: none;
      background: #fff;
    }
    input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(20, 83, 77, .14); }
    .status { margin-top: 7px; color: var(--muted); min-height: 20px; }
    .section { margin-top: 10px; }
    .horse-card, .class-card, .selected-row, .notice {
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: #fff;
      padding: 9px;
      margin-bottom: 7px;
    }
    .horse-card { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: center; }
    .horse-card.follow { background: var(--soft); border-color: #87aaa5; }
    .horse-card button, .class-card button, .link-button, .save-button, .print-button, .remove-button {
      border: 1px solid var(--line-strong);
      background: #fff;
      color: var(--text);
      border-radius: 7px;
      min-height: 36px;
      padding: 7px 10px;
      cursor: pointer;
    }
    .horse-name { color: var(--muted); font-size: 12px; }
    .class-card, .selected-row {
      display: grid;
      grid-template-columns: 52px 68px minmax(0, 1fr) 76px;
      gap: 6px;
      align-items: center;
      font-size: 12px;
    }
    .class-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .selected-row { grid-template-columns: 52px 68px minmax(0, 1fr) 76px 36px; }
    .remove-button { color: var(--danger); border-color: #e0b7b7; min-height: 30px; padding: 4px 8px; }
    .notice { background: #fbfcfc; color: var(--text); font-weight: 400; }
    .notice-title { margin-bottom: 4px; font-weight: 400; }
    .link-button { margin-top: 8px; color: var(--accent); border: 0; padding: 0; min-height: 0; text-decoration: underline; }
    .manual { display: none; border: 1px solid var(--line); padding: 9px; border-radius: var(--radius); margin-bottom: 8px; }
    .manual.show { display: block; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
    .save-button { background: var(--accent); border-color: var(--accent); color: #fff; }
    .print-button { display: none; }
    .review { display: none; }
    .review.show { display: block; }
    .form-hidden { display: none; }
    @media print {
      body { background: #fff; }
      .lookup, .results, .actions, .remove-button { display: none !important; }
      .app { max-width: none; padding: 0; }
      .review { display: block !important; }
      .selected-row { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="app">
    <div id="formShell">
      <section class="lookup">
        <h1>Barn Entry Helper</h1>
        <div class="search-row">
          <input id="horseSearch" type="search" autocomplete="off" placeholder="Search barn name">
        </div>
        <div id="status" class="status"></div>
      </section>
      <section id="horseResults" class="section results"></section>
      <section id="classResults" class="section results"></section>
      <section id="manualHorse" class="manual">
        <input id="manualHorseName" type="text" placeholder="Horse / barn name">
        <button type="button" id="manualHorseAdd">Add Horse</button>
      </section>
      <section id="manualClass" class="manual">
        <input id="manualClassNo" type="text" placeholder="Class no or class number">
        <button type="button" id="manualClassAdd">Add Class</button>
      </section>
      <section class="section">
        <div id="barnList"></div>
      </section>
      <section class="actions">
        <button class="save-button" id="saveButton" type="button">Save</button>
        <button type="button" id="addButton">Add</button>
      </section>
    </div>
    <section id="review" class="review">
      <h1>Barn Entry Review</h1>
      <div id="reviewRows"></div>
      <section class="actions">
        <button class="print-button" id="printButton" type="button">Print</button>
      </section>
    </section>
  </main>
  <script>
    const state = { horses: [], selectedHorse: null, rows: [] };
    const els = {
      search: document.getElementById('horseSearch'),
      status: document.getElementById('status'),
      horseResults: document.getElementById('horseResults'),
      classResults: document.getElementById('classResults'),
      barnList: document.getElementById('barnList'),
      manualHorse: document.getElementById('manualHorse'),
      manualHorseName: document.getElementById('manualHorseName'),
      manualHorseAdd: document.getElementById('manualHorseAdd'),
      manualClass: document.getElementById('manualClass'),
      manualClassNo: document.getElementById('manualClassNo'),
      manualClassAdd: document.getElementById('manualClassAdd'),
      save: document.getElementById('saveButton'),
      add: document.getElementById('addButton'),
      formShell: document.getElementById('formShell'),
      review: document.getElementById('review'),
      reviewRows: document.getElementById('reviewRows'),
      print: document.getElementById('printButton')
    };

    function escHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }
    function rowKey(row) {
      return [row.show_no, row.focus_day, row.class_no, row.entry_no, row.barn_name || row.horse].join('|');
    }
    function selectedClassKeysForHorse(horse) {
      const name = String(horse?.barn_name || horse?.horse_name || '').toLowerCase();
      return new Set(state.rows.filter(r => String(r.barn_name || r.horse || '').toLowerCase() === name).map(r => String(r.class_no)));
    }
    function classRowHtml(row, includeRemove) {
      return '<div class="selected-row">' +
        '<div>' + escHtml(row.ring_name_normalized || '') + '</div>' +
        '<div>' + escHtml(row.class_start_time || row.display_time || '') + '</div>' +
        '<div class="class-name" title="' + escHtml(row.class_name || '') + '">' + escHtml(row.class_no || '') + ' ' + escHtml(row.class_name || '') + '</div>' +
        '<div>' + escHtml(row.barn_name || '') + '</div>' +
        (includeRemove ? '<button class="remove-button" data-remove="' + escHtml(rowKey(row)) + '">x</button>' : '') +
      '</div>';
    }
    function renderBarnList() {
      els.barnList.innerHTML = state.rows.map(row => classRowHtml(row, true)).join('');
      els.barnList.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', () => {
          const key = btn.getAttribute('data-remove');
          state.rows = state.rows.filter(row => rowKey(row) !== key);
          renderBarnList();
          if (state.selectedHorse) renderClassResults(state.selectedHorse);
        });
      });
    }
    function renderHorseResults(horses) {
      if (!els.search.value.trim()) {
        els.horseResults.innerHTML = '';
        return;
      }
      if (!horses.length) {
        els.horseResults.innerHTML = '<div class="notice"><div class="notice-title">We could not find matches for ' + escHtml(els.search.value) + '</div><div>Clear your search and try another.</div><button class="link-button" id="showManualHorse" type="button">To add a Horse that is not listed click here</button></div>';
        document.getElementById('showManualHorse').addEventListener('click', () => {
          els.manualHorse.classList.add('show');
          els.manualHorseName.value = els.search.value;
          els.manualHorseName.focus();
        });
        return;
      }
      els.horseResults.innerHTML = horses.map((horse, index) => (
        '<button class="horse-card ' + (horse.is_follow ? 'follow' : '') + '" data-horse="' + index + '" type="button">' +
          '<div>' + escHtml(horse.barn_name || horse.horse_name || '') + '</div>' +
          '<div><span class="horse-name">' + escHtml(horse.horse_name || horse.show_name || '') + '</span></div>' +
        '</button>'
      )).join('');
      els.horseResults.querySelectorAll('[data-horse]').forEach(button => {
        button.addEventListener('click', () => selectHorse(horses[Number(button.getAttribute('data-horse'))]));
      });
      if (horses.length === 1) selectHorse(horses[0], true);
    }
    function renderClassResults(horse) {
      const appearances = Array.isArray(horse?.appearances) ? horse.appearances : [];
      const addedClassNos = selectedClassKeysForHorse(horse);
      const available = appearances.filter(item => !addedClassNos.has(String(item.class_no)));
      if (!available.length) {
        const barnName = horse?.barn_name || horse?.horse_name || els.search.value;
        els.classResults.innerHTML = '<div class="notice"><div class="notice-title">No More Classes for ' + escHtml(barnName) + '</div><div>Only classes already added were found.</div><button class="link-button" id="showManualClass" type="button">To add a class that is not listed click here</button></div>';
        document.getElementById('showManualClass').addEventListener('click', () => {
          els.manualClass.classList.add('show');
          els.manualClassNo.focus();
        });
        return;
      }
      els.classResults.innerHTML = available.map((item, index) => (
        '<button class="class-card" data-class="' + index + '" type="button">' +
          '<div>' + escHtml(item.ring_name_normalized || '') + '</div>' +
          '<div>' + escHtml(item.class_start_time || item.display_time || '') + '</div>' +
          '<div class="class-name" title="' + escHtml(item.class_name || '') + '">' + escHtml(item.class_no || '') + ' ' + escHtml(item.class_name || '') + '</div>' +
          '<div>' + escHtml(horse.barn_name || horse.horse_name || '') + '</div>' +
        '</button>'
      )).join('');
      els.classResults.querySelectorAll('[data-class]').forEach(button => {
        button.addEventListener('click', () => addClass(horse, available[Number(button.getAttribute('data-class'))]));
      });
    }
    function selectHorse(horse, soft) {
      state.selectedHorse = horse;
      els.search.value = horse.barn_name || horse.horse_name || els.search.value;
      if (!soft) els.horseResults.innerHTML = '';
      renderClassResults(horse);
    }
    function addClass(horse, item) {
      const row = {
        show_no: item.show_no || '${esc(SHOW_NO)}',
        focus_day: item.focus_day || '',
        focus_show: '',
        ring_no: item.ring_no || '',
        class_no: item.class_no || '',
        entry_no: item.entry_no || '',
        ring_name_normalized: item.ring_name_normalized || '',
        class_start_time: item.class_start_time || item.display_time || '',
        class_name: item.class_name || '',
        barn_name: horse.barn_name || horse.horse_name || '',
        horse: horse.horse_name || horse.show_name || horse.barn_name || '',
        rider: item.rider || '',
        trainer: item.trainer || '',
        source: item.source_tables ? item.source_tables.join(',') : item.source_table || 'helper_lookup'
      };
      if (!state.rows.some(existing => rowKey(existing) === rowKey(row))) state.rows.push(row);
      renderBarnList();
      renderClassResults(horse);
    }
    let searchTimer = null;
    async function search() {
      const q = els.search.value.trim();
      state.selectedHorse = null;
      els.classResults.innerHTML = '';
      if (q.length < 2) {
        els.status.textContent = '';
        els.horseResults.innerHTML = '';
        return;
      }
      els.status.textContent = 'Searching...';
      try {
        const response = await fetch('/api/search?q=' + encodeURIComponent(q));
        const payload = await response.json();
        state.horses = payload.horses || [];
        els.status.textContent = state.horses.length ? state.horses.length + ' match(es)' : '';
        renderHorseResults(state.horses);
      } catch (error) {
        els.status.textContent = 'Search failed';
      }
    }
    els.search.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(search, 180);
    });
    els.add.addEventListener('click', () => {
      state.selectedHorse = null;
      els.search.value = '';
      els.horseResults.innerHTML = '';
      els.classResults.innerHTML = '';
      els.manualHorse.classList.remove('show');
      els.manualClass.classList.remove('show');
      els.search.focus();
    });
    els.manualHorseAdd.addEventListener('click', () => {
      const name = els.manualHorseName.value.trim();
      if (!name) return;
      const horse = { barn_name: name, horse_name: name, show_name: name, appearances: [] };
      selectHorse(horse);
      els.manualHorse.classList.remove('show');
    });
    els.manualClassAdd.addEventListener('click', () => {
      const classNo = els.manualClassNo.value.trim();
      if (!classNo || !state.selectedHorse) return;
      addClass(state.selectedHorse, { class_no: classNo, class_name: 'Manual class', source_table: 'manual_class' });
      els.manualClass.classList.remove('show');
      els.manualClassNo.value = '';
    });
    els.save.addEventListener('click', async () => {
      if (!state.rows.length) {
        els.status.textContent = 'Add at least one class.';
        return;
      }
      els.save.disabled = true;
      els.status.textContent = 'Saving...';
      try {
        const response = await fetch('/api/save', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ rows: state.rows })
        });
        const payload = await response.json();
        if (!payload.ok) throw new Error(payload.blocker || 'save_failed');
        els.formShell.classList.add('form-hidden');
        els.review.classList.add('show');
        els.reviewRows.innerHTML = state.rows.map(row => classRowHtml(row, false)).join('');
        els.print.style.display = 'block';
      } catch (error) {
        els.status.textContent = 'Save failed';
        els.save.disabled = false;
      }
    });
    els.print.addEventListener('click', () => window.print());
    els.search.focus();
  </script>
</body>
</html>`;
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (req.method === "GET" && url.pathname === "/") return send(res, 200, renderIndex(), "text/html; charset=utf-8");
    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true, build: BUILD_MARKER });
    if (req.method === "GET" && url.pathname === "/api/search") return handleSearch(req, res, url);
    if (req.method === "POST" && url.pathname === "/api/save") return handleSave(req, res, url);
    return send(res, 404, "Not found");
  } catch (error) {
    return json(res, 500, { ok: false, blocker: "server_error", error: String(error?.message || error) });
  }
}

http.createServer(handle).listen(PORT, () => {
  console.log(`barn-entry-helper listening on ${PORT}`);
});
