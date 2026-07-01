"use strict";

const http = require("http");

const PORT = Number(process.env.X_ZOHO_CATALYST_LISTEN_PORT || process.env.PORT || 9000);
const SHOW_NO = "14907";
const DATA_SOURCE = "https://horseshowing-700800454.development.catalystserverless.com/server/horseshowing_sync/?action=wec-mobile-live&show_no=14907";
const BUILD_MARKER = "WEC-MOBILE-PRO-HARD-RESET-V1";

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

function renderHome(res, result) {
  const payload = result.payload || {};
  const focusDay = payload.show_focus_date || payload.focus_day || "";
  const payloadJson = JSON.stringify(payload).replace(/</g, "\\u003c");
  const html = `<!doctype html>
<html lang="en" data-wec-mobile-pro-build="${BUILD_MARKER}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WEC Mobile Pro</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f3f5f7;
      --panel: #ffffff;
      --panel-2: #f8fafc;
      --line: #d9e0e8;
      --line-strong: #0d2944;
      --ink: #071d34;
      --text: #18293b;
      --muted: #667789;
      --quiet: #8a98a8;
      --accent: #0d2944;
      --accent-2: #eef3f8;
      --active: #102b44;
      --disabled: #eef1f4;
      --row-hover: #edf3f8;
      --row-rollup: #f6f8fa;
      --token: #eceff2;
      --token-border: #d7dde4;
      --badge-entries: #dfe8f1;
      --badge-gone: #e4ece7;
      --shadow: 0 18px 48px rgba(8, 24, 40, .24);
      --radius-xs: 4px;
      --radius-sm: 7px;
      --radius-md: 12px;
      --tap: 38px;
      --font-xs: 9px;
      --font-sm: 11px;
      --font-md: 13px;
      --font-lg: 17px;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; overflow-x: hidden; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: var(--font-md);
      letter-spacing: 0;
    }
    button, a { -webkit-tap-highlight-color: transparent; font: inherit; }
    button:focus-visible, a:focus-visible { outline: 3px solid rgba(13, 41, 68, .25); outline-offset: 2px; }
    .app-shell {
      width: min(100%, 760px);
      min-height: 100vh;
      margin: 0 auto;
      background: var(--panel);
      box-shadow: 0 0 0 1px rgba(8, 24, 40, .05);
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      background: rgba(255, 255, 255, .97);
      border-bottom: 1px solid var(--line);
      backdrop-filter: blur(10px) saturate(140%);
    }
    .topbar-main {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      padding: 8px 9px 7px;
    }
    .brand-title {
      margin: 0;
      color: var(--ink);
      font-size: 17px;
      line-height: 1.08;
      font-weight: 760;
      text-transform: uppercase;
    }
    .brand-date { margin-top: 2px; color: var(--muted); font-size: 13px; font-weight: 520; }
    .iconbar { display: grid; grid-auto-flow: column; gap: 6px; }
    .btn, .icon-btn, .chip, .nav-btn {
      border: 1px solid var(--token-border);
      background: var(--panel);
      color: var(--text);
      border-radius: 999px;
      min-height: var(--tap);
      cursor: pointer;
      transition: background .12s ease, color .12s ease, border-color .12s ease;
    }
    .btn { padding: 0 14px; font-size: 12px; font-weight: 760; }
    .btn.primary { background: var(--active); color: #fff; border-color: var(--active); }
    .icon-btn {
      width: var(--tap);
      display: inline-grid;
      place-items: center;
      box-shadow: 0 1px 2px rgba(8, 24, 40, .06);
    }
    .icon-btn[aria-expanded="true"], .chip.is-on, .nav-btn.is-active {
      background: var(--active);
      border-color: var(--active);
      color: #fff;
    }
    .icon-btn:disabled, .btn:disabled, .chip:disabled, .nav-btn:disabled {
      background: var(--disabled);
      color: var(--quiet);
      cursor: not-allowed;
      opacity: .72;
    }
    .icon { width: 18px; height: 18px; display: block; stroke: currentColor; stroke-width: 2; fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .panel {
      display: none;
      padding: 9px;
      border-top: 1px solid var(--line);
      background: var(--panel-2);
    }
    .panel.is-open { display: block; }
    .panel-title { margin: 0 0 7px; color: var(--ink); font-size: 11px; font-weight: 780; text-transform: uppercase; }
    .panel-note { margin: 0 0 8px; color: var(--muted); font-size: 11px; line-height: 1.3; }
    .rail {
      padding: 5px 7px 4px;
      border-top: 1px solid var(--line);
      background: var(--panel);
    }
    .rail-track {
      display: flex;
      gap: 5px;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scrollbar-width: none;
      padding-bottom: 1px;
    }
    .rail-track::-webkit-scrollbar { display: none; }
    .chip {
      flex: 0 0 auto;
      min-width: 50px;
      min-height: 31px;
      padding: 0 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }
    .chip.small { min-height: 28px; min-width: 0; padding: 0 9px; font-size: 10px; }
    .chip.subtle { background: var(--accent-2); color: var(--muted); }
    .main { padding-bottom: 52px; }
    .view { display: none; }
    .view.is-active { display: block; }
    .start-view { padding: 10px 9px 60px; background: var(--bg); }
    .identity {
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: var(--radius-md);
      padding: 12px;
      margin-bottom: 9px;
    }
    .identity h2 { margin: 0; color: var(--ink); font-size: 20px; line-height: 1.05; font-weight: 790; }
    .identity p { margin: 3px 0 10px; color: var(--muted); font-size: 13px; font-weight: 610; }
    .section {
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: var(--radius-md);
      margin: 0 0 9px;
      overflow: hidden;
    }
    .section-head {
      min-height: 34px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--line);
      color: var(--ink);
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .section-body { padding: 9px; }
    .chip-grid { display: flex; flex-wrap: wrap; gap: 6px; }
    .session-line {
      display: grid;
      grid-template-columns: 92px minmax(0, 1fr);
      gap: 8px;
      min-height: 27px;
      align-items: center;
      border-bottom: 1px solid var(--line);
      font-size: 12px;
    }
    .session-line:last-child { border-bottom: 0; }
    .session-label { color: var(--muted); font-size: 10px; font-weight: 780; text-transform: uppercase; }
    .session-value { min-width: 0; color: var(--ink); font-weight: 640; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .schedule-view { background: var(--panel); }
    .status-note {
      margin: 0;
      padding: 7px 8px;
      border-bottom: 1px solid var(--line);
      color: var(--muted);
      font-size: 11px;
      line-height: 1.25;
    }
    .ring-container {
      margin: 0;
      border-bottom: 2px solid var(--line-strong);
      background: var(--panel);
      scroll-margin-top: 122px;
    }
    .ring-header {
      min-height: 35px;
      display: flex;
      align-items: center;
      padding: 7px 9px 6px;
      border-bottom: 2px solid var(--line-strong);
      color: var(--ink);
      font-size: 18px;
      line-height: 1;
      font-weight: 800;
      text-transform: uppercase;
    }
    .list-container { border-bottom: 1px solid var(--line); }
    .class-line {
      width: 100%;
      min-height: 33px;
      display: grid;
      grid-template-columns: 53px minmax(0, 1fr) 28px 28px;
      align-items: center;
      gap: 5px;
      padding: 4px 7px;
      border: 0;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
      color: var(--text);
      text-align: left;
    }
    .class-line:nth-child(2n) { background: #fbfcfd; }
    .class-line.has-rollup { background: var(--row-rollup); }
    .class-line:hover { background: var(--row-hover); }
    .time-token, .badge {
      min-height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-xs);
      border: 1px solid var(--token-border);
      background: var(--token);
      color: var(--ink);
      font-size: 11px;
      font-weight: 720;
      white-space: nowrap;
    }
    .time-token { padding: 0 6px; }
    .badge { width: 28px; padding: 0; }
    .badge.entries { background: var(--badge-entries); color: #153f62; }
    .badge.gone { background: var(--badge-gone); color: #25533a; }
    .badge.is-empty { visibility: hidden; }
    .class-main { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .rollup-line { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
    .rollup-token {
      max-width: 100%;
      min-height: 17px;
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--token-border);
      border-radius: 999px;
      background: #f0f2f4;
      color: #27384a;
      padding: 0 6px;
      font-size: 10px;
      font-weight: 760;
      line-height: 1;
      text-transform: uppercase;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .class-title {
      min-width: 0;
      color: var(--ink);
      font-size: 12px;
      font-weight: 680;
      line-height: 1.15;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .audit-key {
      margin-left: 4px;
      color: var(--quiet);
      font-size: 7px;
      font-weight: 600;
      white-space: nowrap;
    }
    .bottom-nav {
      position: sticky;
      bottom: 0;
      z-index: 22;
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 5px;
      padding: 6px;
      border-top: 1px solid var(--line);
      background: rgba(255, 255, 255, .97);
      backdrop-filter: blur(10px);
    }
    .nav-btn {
      min-width: 0;
      min-height: 36px;
      font-size: 10px;
      font-weight: 790;
      letter-spacing: .02em;
      text-transform: uppercase;
    }
    .scrim {
      position: fixed;
      inset: 0;
      z-index: 50;
      background: rgba(7, 24, 39, .35);
      opacity: 0;
      pointer-events: none;
      transition: opacity .16s ease;
    }
    .scrim.is-open { opacity: 1; pointer-events: auto; }
    .sheet {
      position: fixed;
      z-index: 60;
      left: 50%;
      bottom: 0;
      width: min(100%, 760px);
      max-height: 84vh;
      overflow-y: auto;
      transform: translate(-50%, 105%);
      transition: transform .2s ease;
      background: var(--panel);
      border: 1px solid var(--line);
      border-bottom: 0;
      border-radius: 16px 16px 0 0;
      box-shadow: var(--shadow);
      padding: 8px;
    }
    .sheet.is-open { transform: translate(-50%, 0); }
    .sheet-head {
      min-height: 40px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      padding: 0 2px 7px;
      border-bottom: 1px solid var(--line);
    }
    .sheet-title { margin: 0; color: var(--ink); font-size: 15px; font-weight: 790; line-height: 1.15; }
    .sheet-close { width: 36px; min-height: 36px; }
    .fly-section { margin-top: 8px; border: 1px solid var(--line); border-radius: var(--radius-md); overflow: hidden; background: var(--panel); }
    .fly-label {
      min-height: 28px;
      display: flex;
      align-items: center;
      padding: 6px 8px;
      border-bottom: 1px solid var(--line);
      background: var(--panel-2);
      color: var(--muted);
      font-size: 10px;
      font-weight: 820;
      text-transform: uppercase;
    }
    .fly-row {
      min-height: 32px;
      display: grid;
      grid-template-columns: 76px minmax(0, 1fr);
      gap: 8px;
      align-items: center;
      padding: 6px 8px;
      border-bottom: 1px solid var(--line);
      font-size: 12px;
    }
    .fly-row:last-child { border-bottom: 0; }
    .fly-key { color: var(--muted); font-size: 10px; font-weight: 760; text-transform: uppercase; }
    .fly-value { min-width: 0; color: var(--ink); font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tag-strip { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .class-tag {
      min-height: 18px;
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      border: 1px solid var(--token-border);
      background: var(--accent-2);
      color: #35485c;
      padding: 0 6px;
      font-size: 10px;
      font-weight: 720;
    }
    .entry-line, .result-line {
      min-height: 32px;
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) auto;
      gap: 7px;
      align-items: center;
      padding: 6px 8px;
      border-bottom: 1px solid var(--line);
      font-size: 12px;
    }
    .entry-line:last-child, .result-line:last-child { border-bottom: 0; }
    .entry-order { color: var(--ink); font-weight: 760; }
    .entry-horse { min-width: 0; color: var(--ink); font-weight: 680; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; }
    .result-copy { min-width: 0; color: var(--ink); font-weight: 680; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .entry-meta { color: var(--muted); font-size: 10px; font-weight: 680; }
    .empty-row { padding: 12px 8px; color: var(--muted); font-size: 12px; line-height: 1.35; }
    .build-marker { display: block; padding: 8px; color: var(--quiet); font-size: 9px; font-weight: 750; letter-spacing: .04em; }
    @media (min-width: 560px) {
      .topbar-main, .rail, .status-note { padding-inline: 12px; }
      .class-line { grid-template-columns: 58px minmax(0, 1fr) 30px 30px; padding-inline: 10px; }
      .ring-header { padding-inline: 12px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { transition-duration: .01ms !important; scroll-behavior: auto !important; }
    }
  </style>
</head>
<body>
  <div class="app-shell" id="app" data-wec-mobile-pro-build="${BUILD_MARKER}">
    <header class="topbar">
      <div class="topbar-main">
        <div>
          <h1 class="brand-title">${esc(payload.show_name || "WEC Mobile Pro")}</h1>
          <div class="brand-date">${esc(focusDay || "focus day unavailable")}</div>
        </div>
        <div class="iconbar" aria-label="Top controls">
          <button class="icon-btn" id="gearBtn" type="button" aria-label="Preferences">${iconGear()}</button>
          <button class="icon-btn" id="hideBtn" type="button" aria-label="Hide TODO">${iconEyeOff()}</button>
          <button class="icon-btn" id="filterBtn" type="button" aria-label="Filter TODO">${iconFilter()}</button>
          <button class="icon-btn" id="printBtn" type="button" aria-label="Print TODO" disabled>${iconPrint()}</button>
        </div>
      </div>
      <section class="panel" id="todoPanel" aria-label="TODO panel">
        <p class="panel-title" id="todoTitle">TODO</p>
        <p class="panel-note" id="todoText">This control is visual only in the hard reset prototype.</p>
      </section>
      <nav class="rail" aria-label="Ring rail"><div class="rail-track" id="ringRail"></div></nav>
      <nav class="rail" aria-label="Horse rail"><div class="rail-track" id="horseRail"></div></nav>
    </header>
    <main class="main">
      <section class="view start-view" id="startView" aria-label="Start">
        <div class="identity">
          <h2>RingStatus.com</h2>
          <p>Your Show Day Schedule - Fast!</p>
          <button class="btn primary" id="startSessionBtn" type="button">Start Session</button>
        </div>
        <section class="section">
          <div class="section-head"><span>Active Horses</span><span id="horseCountLabel"></span></div>
          <div class="section-body"><div class="chip-grid" id="horseRoster"></div></div>
        </section>
        <section class="section">
          <div class="section-head"><span>Preferences</span></div>
          <div class="section-body">
            <p class="panel-title">Hide Classics</p>
            <div class="chip-grid" id="prefClassics"></div>
            <p class="panel-title" style="margin-top:10px;">Hide Medals</p>
            <div class="chip-grid" id="prefMedals"></div>
            <p class="panel-title" style="margin-top:10px;">Hide More</p>
            <div class="chip-grid" id="prefMore"></div>
            <p class="panel-title" style="margin-top:10px;">Show Only</p>
            <div class="chip-grid" id="prefShow"></div>
          </div>
        </section>
        <section class="section">
          <div class="section-head"><span>Session Details</span></div>
          <div class="section-body" id="sessionDetails"></div>
        </section>
      </section>
      <section class="view schedule-view is-active" id="ringsView" aria-label="Rings">
        <p class="status-note">Focus source ${esc(payload.focus_source || "unknown")} | show_no ${esc(payload.show_no || SHOW_NO)} | read-only Development payload</p>
        <div id="schedule"></div>
      </section>
    </main>
    <nav class="bottom-nav" aria-label="Primary mobile sections">
      <button class="nav-btn" type="button" data-view="start">START</button>
      <button class="nav-btn" type="button" data-view="time" disabled>TIME</button>
      <button class="nav-btn is-active" type="button" data-view="rings">RINGS</button>
      <button class="nav-btn" type="button" data-view="results" disabled>RESULTS</button>
      <button class="nav-btn" type="button" data-view="alerts" disabled>ALERTS</button>
    </nav>
    <span class="build-marker">${BUILD_MARKER}</span>
  </div>
  <div class="scrim" id="scrim" hidden></div>
  <section class="sheet" id="flyup" aria-label="Class detail" aria-hidden="true">
    <div class="sheet-head">
      <h2 class="sheet-title" id="flyupTitle">Class detail</h2>
      <button class="btn sheet-close" id="flyupClose" type="button" aria-label="Close">X</button>
    </div>
    <div id="flyupBody"></div>
  </section>
  <script id="schedulePayload" type="application/json">${payloadJson}</script>
  <script>
    const BUILD_MARKER = ${JSON.stringify(BUILD_MARKER)};
    const payload = JSON.parse(document.getElementById("schedulePayload").textContent || "{}");
    const DAY_MS = 24 * 60 * 60 * 1000;
    const STATE_KEY = "wec-mobile-pro-hard-reset-v1";
    const SESSION_DAYS = 6;
    const state = loadState();
    const text = (value) => {
      if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
      if (value && typeof value === "object") return text(value.barn_name || value.horse_display || value.horse || value.name || value.label || value.entry_display || value.value || "");
      return String(value ?? "").trim();
    };
    const html = (value) => text(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    const truthy = (value) => value === true || value === 1 || String(value || "").toLowerCase() === "true" || String(value || "") === "1";
    const rings = Array.isArray(payload.rings) ? payload.rings : [];
    const prefDefs = {
      classics: [
        { key: "hide_jumper_classic", label: "Jumper", field: "is_jumper_classic" },
        { key: "hide_hunter_classic", label: "Hunter", field: "is_hunter_classic" }
      ],
      medals: [
        { key: "hide_seat", label: "Seat", medal: "seat" },
        { key: "hide_ncea", label: "NCEA", medal: "ncea" },
        { key: "hide_maclay", label: "Maclay", medal: "maclay" },
        { key: "hide_nhs", label: "NHS", medal: "nhs" },
        { key: "hide_ariat", label: "Ariat", medal: "ariat" }
      ],
      more: [
        { key: "hide_under_saddle", label: "Under saddle", field: "is_under_saddle" },
        { key: "hide_handy", label: "Handy", field: "is_handy" },
        { key: "hide_beginner", label: "Beginner", field: "is_beginner" }
      ],
      show: [
        { key: "show_focus", label: "Focus", showOnly: "focus" },
        { key: "show_team", label: "Team", showOnly: "team" }
      ]
    };

    function freshState() {
      const now = Date.now();
      return {
        session_started: false,
        session_started_at: "",
        session_expires_at: new Date(now + SESSION_DAYS * DAY_MS).toISOString(),
        inactive_horses: [],
        preferences: {},
        manual_hidden_class_keys: [],
        filter_selections: {}
      };
    }

    function loadState() {
      try {
        const raw = JSON.parse(localStorage.getItem(STATE_KEY) || "null");
        if (!raw || !raw.session_expires_at || Date.now() > Date.parse(raw.session_expires_at)) return freshState();
        return { ...freshState(), ...raw, preferences: raw.preferences || {}, inactive_horses: raw.inactive_horses || [] };
      } catch {
        return freshState();
      }
    }

    function saveState() {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    }

    function splitValues(value) {
      return text(value).split(/[|,;\\n]/).map((item) => item.trim()).filter(Boolean);
    }

    function sortPriority(value) {
      const raw = text(value);
      const numeric = Number(raw);
      return Number.isFinite(numeric) ? numeric : raw.toLowerCase();
    }

    function ringSortKey(ring) {
      const rows = classRows(ring);
      const row = rows.find(Boolean) || {};
      return sortPriority(row.ring_name_prioritized || ring.ring_name_prioritized || ring.ring_priority || ring.ring_no || "");
    }

    function ringLabel(ring) {
      const rows = classRows(ring);
      const row = rows.find(Boolean) || {};
      return text(row.ring_name_normalized || ring.ring_name_normalized || ring.ring_display || ring.ring_name || ring.ring_no || "Ring");
    }

    function ringId(ring, index) {
      return "ring-" + text(ringSortKey(ring) || ringLabel(ring) || index).replace(/[^a-z0-9_-]+/gi, "-");
    }

    function classRows(ring) {
      return Array.isArray(ring.classes) ? ring.classes : [];
    }

    function allRows() {
      return rings.flatMap((ring) => classRows(ring));
    }

    function classTitle(row) {
      return text(row.class_name || "Class");
    }

    function auditKey(row) {
      return [row.ring_name_prioritized, row.class_no, row.class_priority_sort].map(text).filter(Boolean).join(" | ");
    }

    function rowKey(row, ringIndex, rowIndex) {
      return [row.ring_name_prioritized, row.class_no, row.class_priority_sort, rowIndex].map(text).filter(Boolean).join("|") || String(ringIndex) + "-" + String(rowIndex);
    }

    function timeText(row) {
      return text(row.display_time || row.time_text || row.class_time_text || row.start_time || row.time || "");
    }

    function shortTime(row) {
      return timeText(row).replace(/\\s+/g, " ").replace(/\\bAM\\b/i, "A").replace(/\\bPM\\b/i, "P").replace(/\\s+([AP])$/i, "$1");
    }

    function numeric(value) {
      const raw = text(value);
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }

    function horseName(value) {
      return text(value && typeof value === "object" ? value.barn_name || value.horse_display || value.horse || value.name || value.label || value.entry_display || value.value : value);
    }

    function entryOrder(value, row) {
      return text((value && typeof value === "object" ? value.entry_order || value.order || value.order_of_go || value.draw || value.entry_no : "") || row.entry_order || row.order || row.order_of_go || row.draw || row.entry_no);
    }

    function entryNo(value, row) {
      return text((value && typeof value === "object" ? value.entry_no || value.entryNo || value.entry_number : "") || row.entry_no || row.entryNo || row.entry_number);
    }

    function entryGoTime(value) {
      return text(value && typeof value === "object" ? value.entry_go_time || value.go_time || value.got_time : "");
    }

    function goIn(value) {
      return text(value && typeof value === "object" ? value.go_in || value.goIn || value.entry_go_in : "");
    }

    function rollups(row) {
      const source = Array.isArray(row.rollups) ? row.rollups : [];
      const out = [];
      for (const item of source) {
        const horses = Array.isArray(item.horses) ? item.horses : [item.horse || item.horse_display || item.barn_name || item.name || item.label].filter(Boolean);
        for (const horse of horses) {
          const name = horseName(horse);
          if (!name) continue;
          const order = entryOrder(horse, item);
          out.push((order ? name + " (" + order + ")" : name).toUpperCase());
        }
      }
      return Array.from(new Set(out)).slice(0, 12);
    }

    function rowHorseNames(row) {
      const names = new Set();
      const add = (value) => {
        const name = horseName(value);
        if (name) names.add(name);
      };
      if (Array.isArray(row.rollups)) {
        row.rollups.forEach((item) => {
          if (Array.isArray(item.horses)) item.horses.forEach(add);
          else add(item.horse || item.horse_display || item.barn_name || item.name || item.label);
        });
      }
      if (Array.isArray(row.entries)) row.entries.forEach(add);
      [row.horse_display, row.horse, row.barn_name, row.entry_display, row.current_entry_text].forEach((value) => splitValues(value).forEach(add));
      return Array.from(names).filter(Boolean);
    }

    function entryLines(row) {
      const source = [];
      if (Array.isArray(row.entries)) source.push(...row.entries);
      if (Array.isArray(row.rollups)) {
        for (const item of row.rollups) {
          const horses = Array.isArray(item.horses) ? item.horses : [item.horse || item.horse_display || item.barn_name || item.name || item.label].filter(Boolean);
          horses.forEach((horse) => source.push({ ...item, horse }));
        }
      }
      const lines = [];
      for (const item of source) {
        const name = horseName(item.horse || item);
        if (!name) continue;
        lines.push({
          entry_no: entryNo(item, item),
          horse: name.toUpperCase(),
          entry_order: entryOrder(item.horse || item, item),
          entry_go_time: entryGoTime(item.horse || item),
          go_in: goIn(item.horse || item)
        });
      }
      return lines.slice(0, 20);
    }

    function classTags(row) {
      const seen = new Set();
      const tags = [];
      for (const token of splitValues(row.class_name_tokens)) {
        const key = token.toLowerCase();
        if (!key || seen.has(key)) continue;
        if (/^\\d{1,2}:\\d{2}\\s*[ap]m?$/i.test(key)) continue;
        if (key === "ariat") continue;
        seen.add(key);
        tags.push(token);
        if (tags.length >= 4) break;
      }
      return tags;
    }

    function roster() {
      const horses = new Set();
      allRows().forEach((row) => rowHorseNames(row).forEach((horse) => horses.add(horse)));
      return Array.from(horses).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    }

    function horseActive(name) {
      return !state.inactive_horses.includes(name);
    }

    function setHorseActive(name, active) {
      const set = new Set(state.inactive_horses);
      if (active) set.delete(name);
      else set.add(name);
      state.inactive_horses = Array.from(set);
      saveState();
      renderAll();
    }

    function rowAllowedByHorses(row) {
      const horses = rowHorseNames(row);
      if (!horses.length) return true;
      return horses.some(horseActive);
    }

    function skillHas(row, needle) {
      return splitValues(row.this_skills).some((value) => value.toLowerCase().includes(needle));
    }

    function preferenceHides(row) {
      const prefs = state.preferences || {};
      for (const group of [prefDefs.classics, prefDefs.more]) {
        for (const pref of group) if (prefs[pref.key] && pref.field && truthy(row[pref.field])) return true;
      }
      for (const pref of prefDefs.medals) {
        if (!prefs[pref.key]) continue;
        if (truthy(row.is_medal) && skillHas(row, pref.medal)) return true;
      }
      return false;
    }

    function preferenceShowAllows(row) {
      const prefs = state.preferences || {};
      if (prefs.show_focus && !truthy(row.is_focus)) return false;
      if (prefs.show_team && !rollups(row).length) return false;
      return true;
    }

    function visibleRow(row) {
      return rowAllowedByHorses(row) && !preferenceHides(row) && preferenceShowAllows(row);
    }

    function badge1(row) {
      const value = numeric(row.entry_count);
      return value === null ? "" : '<span class="badge entries" title="entries">' + html(value) + '</span>';
    }

    function badge2(row) {
      const value = numeric(row.n_gone);
      return value === null ? '<span class="badge gone is-empty"></span>' : '<span class="badge gone" title="n_gone">' + html(value) + '</span>';
    }

    function rowHtml(row, ringIndex, rowIndex) {
      const key = rowKey(row, ringIndex, rowIndex);
      const rowRollups = rollups(row);
      const audit = auditKey(row);
      return '<button class="class-line' + (rowRollups.length ? ' has-rollup' : '') + '" type="button" data-row-key="' + html(key) + '">' +
        '<span class="time-token">' + html(shortTime(row) || "--") + '</span>' +
        '<span class="class-main">' +
          (rowRollups.length ? '<span class="rollup-line">' + rowRollups.map((item) => '<span class="rollup-token">' + html(item) + '</span>').join("") + '</span>' : '') +
          '<span class="class-title">' + html(classTitle(row)) + (audit ? '<span class="audit-key">' + html(audit) + '</span>' : '') + '</span>' +
        '</span>' +
        badge1(row) +
        badge2(row) +
      '</button>';
    }

    function orderedRings() {
      return rings.map((ring, index) => ({ ring, index })).sort((a, b) => {
        const av = ringSortKey(a.ring);
        const bv = ringSortKey(b.ring);
        if (typeof av === "number" && typeof bv === "number") return av - bv;
        return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
      });
    }

    function renderRings() {
      const schedule = document.getElementById("schedule");
      if (!rings.length) {
        schedule.innerHTML = '<p class="empty-row">No rings returned from the read-only WEC mobile payload.</p>';
        return;
      }
      schedule.innerHTML = orderedRings().map(({ ring, index }) => {
        const id = ringId(ring, index);
        const rows = classRows(ring).filter(visibleRow);
        const body = rows.map((row, rowIndex) => rowHtml(row, index, rowIndex)).join("");
        return '<section class="ring-container" id="' + html(id) + '" data-ring-section="' + html(id) + '">' +
          '<div class="ring-header">' + html(ringLabel(ring)) + '</div>' +
          '<div class="list-container">' + (body || '<p class="empty-row">No visible classes after local preferences.</p>') + '</div>' +
        '</section>';
      }).join("");
      document.querySelectorAll(".class-line[data-row-key]").forEach((button) => {
        button.addEventListener("click", () => openFlyup(button.dataset.rowKey));
      });
    }

    function renderRails() {
      const ringRail = document.getElementById("ringRail");
      ringRail.innerHTML = orderedRings().map(({ ring, index }) => {
        const id = ringId(ring, index);
        return '<button class="chip" type="button" data-ring-target="' + html(id) + '">' + html(ringLabel(ring)) + '</button>';
      }).join("");
      ringRail.querySelectorAll("[data-ring-target]").forEach((button) => {
        button.addEventListener("click", () => document.getElementById(button.dataset.ringTarget)?.scrollIntoView({ behavior: "smooth", block: "start" }));
      });
      const horses = roster().slice(0, 24);
      document.getElementById("horseRail").innerHTML = horses.length
        ? horses.map((horse) => '<button class="chip small ' + (horseActive(horse) ? '' : 'subtle') + '" type="button" disabled>' + html(horse) + '</button>').join("")
        : '<button class="chip small subtle" type="button" disabled>Horses unavailable</button>';
    }

    function renderStart() {
      const horses = roster();
      document.getElementById("horseCountLabel").textContent = horses.filter(horseActive).length + "/" + horses.length + " active";
      document.getElementById("horseRoster").innerHTML = horses.length
        ? horses.map((horse) => '<button class="chip ' + (horseActive(horse) ? 'is-on' : 'subtle') + '" type="button" data-horse-toggle="' + html(horse) + '">' + html(horse) + '</button>').join("")
        : '<span class="chip subtle">No horses in current payload</span>';
      document.querySelectorAll("[data-horse-toggle]").forEach((button) => {
        button.addEventListener("click", () => setHorseActive(button.dataset.horseToggle, !horseActive(button.dataset.horseToggle)));
      });
      renderPrefGroup("prefClassics", prefDefs.classics);
      renderPrefGroup("prefMedals", prefDefs.medals);
      renderPrefGroup("prefMore", prefDefs.more);
      renderPrefGroup("prefShow", prefDefs.show);
      document.getElementById("sessionDetails").innerHTML =
        detailLine("Started", state.session_started ? "Yes" : "No") +
        detailLine("Started at", state.session_started_at || "—") +
        detailLine("Expires at", state.session_expires_at || "—") +
        detailLine("Storage", "localStorage only") +
        detailLine("Source", "wec-mobile-live&show_no=14907");
    }

    function detailLine(label, value) {
      return '<div class="session-line"><span class="session-label">' + html(label) + '</span><span class="session-value">' + html(value) + '</span></div>';
    }

    function renderPrefGroup(id, prefs) {
      const target = document.getElementById(id);
      target.innerHTML = prefs.map((pref) => '<button class="chip small ' + (state.preferences[pref.key] ? 'is-on' : '') + '" type="button" data-pref-key="' + html(pref.key) + '">' + html(pref.label) + '</button>').join("");
      target.querySelectorAll("[data-pref-key]").forEach((button) => {
        button.addEventListener("click", () => {
          const key = button.dataset.prefKey;
          state.preferences[key] = !state.preferences[key];
          saveState();
          renderAll();
        });
      });
    }

    function setView(view) {
      const active = view === "start" ? "start" : "rings";
      document.getElementById("startView").classList.toggle("is-active", active === "start");
      document.getElementById("ringsView").classList.toggle("is-active", active === "rings");
      document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.view === active));
    }

    function startSession() {
      const now = Date.now();
      state.session_started = true;
      state.session_started_at = new Date(now).toISOString();
      state.session_expires_at = new Date(now + SESSION_DAYS * DAY_MS).toISOString();
      saveState();
      renderAll();
      setView("rings");
    }

    function allRowsByKey() {
      const map = new Map();
      orderedRings().forEach(({ ring, index }) => classRows(ring).forEach((row, rowIndex) => map.set(rowKey(row, index, rowIndex), row)));
      return map;
    }

    function openFlyup(key) {
      const row = allRowsByKey().get(key);
      if (!row) return;
      const tags = classTags(row);
      const entries = entryLines(row);
      const audit = auditKey(row);
      document.getElementById("flyupTitle").textContent = classTitle(row);
      document.getElementById("flyupBody").innerHTML =
        sectionHtml("Ring", detailLine("Ring", row.ring_name_normalized || "—")) +
        sectionHtml("Time", detailLine("Time", timeText(row) || "—")) +
        sectionHtml("Class",
          detailLine("Class", classTitle(row)) +
          detailLine("Audit", audit || "—") +
          detailLine("Class no", row.class_no || "—") +
          detailLine("Priority", row.class_priority_sort || "—") +
          '<div class="fly-row"><span class="fly-key">Tags</span><span class="fly-value"><span class="tag-strip">' + (tags.length ? tags.map((tag) => '<span class="class-tag">' + html(tag) + '</span>').join("") : '<span class="class-tag">—</span>') + '</span></span></div>' +
          detailLine("Entries", numeric(row.entry_count) === null ? "—" : row.entry_count) +
          detailLine("Gone", numeric(row.n_gone) === null ? "—" : row.n_gone)
        ) +
        sectionHtml("Entry", entries.length ? entries.map((entry) =>
          '<div class="entry-line"><span class="entry-order">' + html(entry.entry_no || entry.entry_order || "—") + '</span><span class="entry-horse">' + html(entry.horse) + '</span><span class="entry-meta">' + html([entry.entry_go_time || "—", entry.go_in].filter(Boolean).join(" ")) + '</span></div>'
        ).join("") : '<p class="empty-row">Entry details unavailable in this payload.</p>') +
        sectionHtml("Result", '<div class="result-line"><span></span><span class="result-copy">No approved result source is built yet.</span><span></span></div>');
      setFlyup(true);
    }

    function sectionHtml(label, body) {
      return '<section class="fly-section"><div class="fly-label">' + html(label) + '</div>' + body + '</section>';
    }

    function setFlyup(open) {
      const flyup = document.getElementById("flyup");
      const scrim = document.getElementById("scrim");
      flyup.classList.toggle("is-open", open);
      flyup.setAttribute("aria-hidden", open ? "false" : "true");
      scrim.hidden = !open;
      scrim.classList.toggle("is-open", open);
    }

    function openTodo(title, message) {
      const panel = document.getElementById("todoPanel");
      const open = panel.classList.contains("is-open") && document.getElementById("todoTitle").textContent === title;
      document.getElementById("todoTitle").textContent = title;
      document.getElementById("todoText").textContent = message;
      panel.classList.toggle("is-open", !open);
    }

    function renderAll() {
      renderRails();
      renderStart();
      renderRings();
    }

    document.getElementById("gearBtn").addEventListener("click", () => setView("start"));
    document.getElementById("hideBtn").addEventListener("click", () => openTodo("Hide", "Manual class hiding is TODO and is not persisted in this task."));
    document.getElementById("filterBtn").addEventListener("click", () => openTodo("Filter", "Filter drawer behavior is TODO and is not persisted in this task."));
    document.getElementById("startSessionBtn").addEventListener("click", startSession);
    document.querySelector('[data-view="start"]').addEventListener("click", () => setView("start"));
    document.querySelector('[data-view="rings"]').addEventListener("click", () => setView("rings"));
    document.getElementById("flyupClose").addEventListener("click", () => setFlyup(false));
    document.getElementById("scrim").addEventListener("click", () => setFlyup(false));
    renderAll();
  </script>
</body>
</html>`;
  send(res, result.ok ? 200 : 502, html, "text/html; charset=utf-8");
}

function iconGear() {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.05.05a2 2 0 0 1-2.83 2.83l-.05-.05A1.7 1.7 0 0 0 15 19.36a1.7 1.7 0 0 0-1 .58V20a2 2 0 0 1-4 0v-.07a1.7 1.7 0 0 0-1-.58 1.7 1.7 0 0 0-1.87.34l-.05.05a2 2 0 0 1-2.83-2.83l.05-.05A1.7 1.7 0 0 0 4.64 15a1.7 1.7 0 0 0-.58-1H4a2 2 0 0 1 0-4h.07a1.7 1.7 0 0 0 .58-1 1.7 1.7 0 0 0-.34-1.87l-.05-.05a2 2 0 0 1 2.83-2.83l.05.05A1.7 1.7 0 0 0 9 4.64a1.7 1.7 0 0 0 1-.58V4a2 2 0 0 1 4 0v.07a1.7 1.7 0 0 0 1 .58 1.7 1.7 0 0 0 1.87-.34l.05-.05a2 2 0 0 1 2.83 2.83l-.05.05A1.7 1.7 0 0 0 19.36 9c.25.34.44.68.58 1H20a2 2 0 0 1 0 4h-.07a1.7 1.7 0 0 0-.53 1Z"/></svg>`;
}

function iconEyeOff() {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c5 0 8.5 4.1 10 8-.45 1.18-1.15 2.35-2.06 3.38"/><path d="M6.1 6.1C4.16 7.4 2.8 9.57 2 12c1.5 3.9 5 8 10 8 1.9 0 3.6-.6 5.05-1.55"/></svg>`;
}

function iconFilter() {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6.6 7.5v5.2L10.6 19v-6.5L4 5Z"/></svg>`;
}

function iconPrint() {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3h10v5"/><path d="M7 17H5a2 2 0 0 1-2-2v-4a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v4a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7z"/><path d="M17 11h.01"/></svg>`;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/health") {
      json(res, 200, {
        ok: true,
        service: "wec-mobile-pro-appsail-prototype",
        show_no: SHOW_NO,
        data_source: DATA_SOURCE,
        build_marker: BUILD_MARKER,
        working_directory: process.cwd(),
        served_file: __filename,
        writes: false
      });
      return;
    }
    if (url.pathname === "/api/schedule") {
      json(res, 200, await fetchSchedule());
      return;
    }
    if (url.pathname === "/" || url.pathname === "/wec-mobile-pro") {
      renderHome(res, await fetchSchedule());
      return;
    }
    json(res, 404, { ok: false, error: "not_found" });
  } catch (error) {
    json(res, 500, { ok: false, error: String(error && error.message ? error.message : error) });
  }
});

server.listen(PORT, () => {
  console.log(`WEC mobile AppSail prototype listening on ${PORT}`);
});
