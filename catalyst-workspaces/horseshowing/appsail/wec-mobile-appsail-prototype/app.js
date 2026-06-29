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

function renderHome(res, result) {
  const payload = result.payload || {};
  const focusDay = payload.show_focus_date || payload.focus_day || "";
  const showNo = payload.show_no || SHOW_NO;
  const payloadJson = JSON.stringify(payload).replace(/</g, "\\u003c");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WEC Mobile Pro AppSail Prototype</title>
  <style>
    :root {
      color-scheme: light;
      --surface-page: #f4f6f8;
      --surface-shell: #ffffff;
      --surface-raised: #fbfcfd;
      --surface-panel: #eef2f6;
      --border-soft: #d7dee8;
      --border-strong: #0e243a;
      --text-strong: #071d34;
      --text-main: #17283a;
      --text-muted: #647387;
      --ring-header-bg: #0f304c;
      --ring-header-text: #ffffff;
      --row-bg: #ffffff;
      --row-alt-bg: #f8fafc;
      --row-hover-bg: #edf6ff;
      --row-active-bg: #e8f3ff;
      --row-has-rollup-bg: #f1f8f4;
      --badge-status-soon-bg: #dfeeff;
      --badge-status-now-bg: #e5f7eb;
      --badge-status-done-bg: #eceff3;
      --badge-special-classic-bg: #e4f6eb;
      --badge-special-handy-bg: #edf0ff;
      --badge-special-medal-bg: #fff2d9;
      --badge-special-under-saddle-bg: #f0e8ff;
      --badge-type-hunter-bg: #e8f5ef;
      --badge-type-jumper-bg: #ffe9e9;
      --badge-type-equitation-bg: #e8eefb;
      --badge-detail-bg: #eef2f6;
      --diff-time-bg: #fff3d5;
      --diff-status-bg: #ffe6ec;
      --diff-go-time-bg: #e3f7ff;
      --diff-order-bg: #eee7ff;
      --row-has-diff-bg: #fff9e9;
      --flyup-diff-bg: #fff1cf;
      --rollup-bg: #e9f5ed;
      --rollup-text: #214b35;
      --drawer-shadow: 0 18px 60px rgba(8, 25, 43, .26);
      --flyup-shadow: 0 -18px 54px rgba(8, 25, 43, .28);
      --radius-sm: 7px;
      --radius-md: 12px;
      --radius-lg: 18px;
      --space-1: 4px;
      --space-2: 8px;
      --space-3: 12px;
      --space-4: 16px;
      --space-5: 20px;
      --font-xs: 10px;
      --font-sm: 11px;
      --font-md: 13px;
      --font-lg: 16px;
      --font-xl: 20px;
      --z-header: 20;
      --z-bottom-nav: 25;
      --z-scrim: 50;
      --z-drawer: 60;
      --z-flyup: 70;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background: var(--surface-page);
      color: var(--text-main);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: var(--font-md);
      letter-spacing: 0;
      overflow-x: hidden;
    }
    button, a { -webkit-tap-highlight-color: transparent; }
    button:focus-visible, a:focus-visible { outline: 3px solid rgba(23, 91, 145, .35); outline-offset: 2px; }
    .app-shell {
      width: min(100%, 760px);
      margin: 0 auto;
      min-height: 100vh;
      background: var(--surface-shell);
      box-shadow: 0 0 0 1px rgba(10, 31, 51, .05);
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: var(--z-header);
      background: rgba(255, 255, 255, .97);
      border-bottom: 1px solid var(--border-soft);
      backdrop-filter: saturate(150%) blur(10px);
    }
    .topbar-main {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 7px;
      align-items: center;
      padding: 7px 9px 6px;
    }
    h1 {
      margin: 0;
      color: var(--text-strong);
      font-size: 17px;
      line-height: 1.05;
      font-weight: 740;
      text-transform: uppercase;
    }
    .date-line {
      margin-top: 3px;
      color: var(--text-muted);
      font-size: 13px;
      line-height: 1.15;
      font-weight: 540;
    }
    .iconbar {
      display: grid;
      grid-auto-flow: column;
      gap: 5px;
    }
    .icon-btn {
      width: 36px;
      height: 36px;
      border: 1px solid var(--border-soft);
      border-radius: 999px;
      background: linear-gradient(180deg, #fff, #f7f9fb);
      color: var(--text-main);
      display: inline-grid;
      place-items: center;
      cursor: pointer;
      box-shadow: 0 1px 2px rgba(16, 37, 57, .08);
      position: relative;
    }
    .icon-btn[aria-expanded="true"], .icon-btn.is-active {
      background: var(--row-active-bg);
      border-color: #a8cbe9;
      color: #0b5b92;
    }
    .icon {
      width: 18px;
      height: 18px;
      display: block;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .filter-count {
      position: absolute;
      top: -4px;
      right: -4px;
      min-width: 17px;
      height: 17px;
      padding: 0 4px;
      border-radius: 999px;
      border: 1px solid #fff;
      background: #0c2438;
      color: #fff;
      font-size: 10px;
      font-weight: 760;
      line-height: 16px;
      text-align: center;
    }
    .push-panel {
      display: none;
      border-top: 1px solid var(--border-soft);
      background: var(--surface-panel);
      padding: 6px 9px 7px;
    }
    .push-panel.is-open { display: block; }
    .panel-title {
      margin: 0 0 8px;
      color: var(--text-strong);
      font-size: var(--font-sm);
      font-weight: 740;
      text-transform: uppercase;
    }
    .toggle-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .soft-toggle {
      min-height: 30px;
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-md);
      background: #fff;
      color: var(--text-main);
      font: inherit;
      font-size: var(--font-sm);
      font-weight: 650;
      cursor: pointer;
    }
    .soft-toggle.is-on { background: #e8f3ff; border-color: #a6cbe8; }
    .rail {
      padding: 5px 7px 4px;
      border-top: 1px solid var(--border-soft);
      background: #fff;
    }
    .rail + .rail { padding-top: 2px; }
    .rail-track {
      display: flex;
      gap: 5px;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      padding-bottom: 2px;
      scrollbar-width: none;
    }
    .rail-track::-webkit-scrollbar { display: none; }
    .bottom-nav {
      position: sticky;
      bottom: 0;
      z-index: var(--z-bottom-nav);
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 1px;
      border-top: 1px solid var(--border-soft);
      background: #dfe5ec;
    }
    .bottom-tab {
      min-width: 0;
      min-height: 34px;
      border: 0;
      background: #fff;
      color: var(--text-muted);
      font-size: 9px;
      font-weight: 720;
      line-height: 1;
      letter-spacing: .02em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .bottom-tab.is-active {
      background: var(--ring-header-bg);
      color: #fff;
    }
    .pill {
      flex: 0 0 auto;
      min-width: 49px;
      min-height: 29px;
      padding: 0 9px;
      border: 1px solid var(--border-soft);
      border-radius: 999px;
      background: #fff;
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 640;
      cursor: pointer;
    }
    .pill.is-active { background: var(--ring-header-bg); border-color: var(--ring-header-bg); color: #fff; }
    .pill.is-placeholder { color: #8492a3; background: #f8fafc; }
    .schedule {
      padding: 5px 0 22px;
      background: var(--surface-shell);
    }
    .status-note {
      margin: 0 7px 5px;
      color: var(--text-muted);
      font-size: var(--font-sm);
      line-height: 1.35;
    }
    .ring-card {
      margin: 0 0 7px;
      border-top: 2px solid var(--border-strong);
      border-bottom: 2px solid var(--border-strong);
      background: #fff;
      scroll-margin-top: 126px;
    }
    .ring-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-2);
      padding: 5px 7px 6px;
    }
    .ring-name {
      margin: 0;
      color: var(--text-strong);
      font-size: 17px;
      line-height: 1.05;
      font-weight: 790;
      text-transform: uppercase;
    }
    .ring-summary {
      display: flex;
      gap: 5px;
      align-items: center;
    }
    .ring-status-token {
      min-width: 0;
      min-height: 20px;
      padding: 0 7px;
      border-radius: 999px;
      display: none;
      place-items: center;
      background: #fff3d5;
      color: #795200;
      font-size: var(--font-xs);
      font-weight: 650;
    }
    .ring-status-token.has-value { display: inline-grid; }
    .summary-chip {
      min-width: 32px;
      height: 20px;
      border-radius: 999px;
      display: inline-grid;
      place-items: center;
      background: #d9f0de;
      color: #244532;
      font-size: var(--font-xs);
      font-weight: 640;
    }
    .class-list { border-top: 1px solid var(--border-soft); }
    .class-row {
      width: 100%;
      display: grid;
      grid-template-columns: 51px minmax(0, 1fr) 22px 22px 22px;
      gap: 3px;
      align-items: center;
      min-height: 31px;
      padding: 2px 4px 2px 6px;
      border: 0;
      border-bottom: 1px solid var(--border-soft);
      background: var(--row-bg);
      color: var(--text-main);
      text-align: left;
      font: inherit;
      cursor: pointer;
    }
    .class-row:nth-child(2n) { background: var(--row-alt-bg); }
    .class-row:hover { background: var(--row-hover-bg); }
    .class-row.has-rollup { background: var(--row-has-rollup-bg); }
    .class-row.is-current-class { background: #e8f3ff; box-shadow: inset 3px 0 0 #1b74aa; }
    .class-row.has-diff { background: var(--row-has-diff-bg); }
    .time-chip, .class-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 23px;
      border-radius: var(--radius-sm);
      background: #e7e9ea;
      color: #071d34;
      font-size: 11px;
      font-weight: 610;
      white-space: nowrap;
    }
    .class-main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .row-rollups {
      display: none;
      min-width: 0;
      gap: 3px;
      flex-wrap: wrap;
      align-items: center;
    }
    .class-row.has-rollup .row-rollups { display: flex; }
    .class-name {
      min-width: 0;
      color: var(--text-strong);
      font-size: 12px;
      line-height: 1.15;
      font-weight: 590;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .class-audit-id {
      font-size: 7px;
      font-weight: 500;
      opacity: .55;
      letter-spacing: .01em;
      white-space: nowrap;
    }
    .token-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
      margin-top: 4px;
    }
    .class-token {
      border-radius: 999px;
      background: #eef3f8;
      color: #395069;
      padding: 2px 6px;
      font-size: 10px;
      font-weight: 650;
      line-height: 1.1;
    }
    .badge {
      width: 22px;
      height: 22px;
      padding: 0;
      border-radius: 5px;
      display: inline-grid;
      place-items: center;
      font-size: 10px;
      font-weight: 650;
      color: var(--text-main);
      border: 1px solid rgba(0, 0, 0, .06);
    }
    .badge.special-classic { background: var(--badge-special-classic-bg); color: #04784a; }
    .badge.special-handy { background: var(--badge-special-handy-bg); color: #3450a0; }
    .badge.special-medal { background: var(--badge-special-medal-bg); color: #8a5a00; }
    .badge.special-under-saddle { background: var(--badge-special-under-saddle-bg); color: #6e4db1; }
    .badge.type-hunter { background: var(--badge-type-hunter-bg); color: #15724f; }
    .badge.type-jumper { background: var(--badge-type-jumper-bg); color: #9a3144; }
    .badge.type-equitation { background: var(--badge-type-equitation-bg); color: #37517f; }
    .badge.status-soon { background: var(--badge-status-soon-bg); color: #1d5f94; }
    .badge.status-now { background: var(--badge-status-now-bg); color: #13724a; }
    .badge.status-done { background: var(--badge-status-done-bg); color: #4f5b67; }
    .badge.status-placeholder, .badge.special-placeholder, .badge.type-placeholder { background: #f4f6f7; color: #8a97a3; }
    .badge.badge-empty { color: transparent; }
    .badge.diff-time { background: var(--diff-time-bg); color: #7b5200; }
    .rollup-token {
      max-width: 100%;
      border-radius: 999px;
      padding: 1px 6px;
      background: var(--rollup-bg);
      color: var(--rollup-text);
      font-size: 12px;
      font-weight: 680;
      text-transform: uppercase;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .scrim {
      position: fixed;
      inset: 0;
      z-index: var(--z-scrim);
      background: rgba(7, 24, 39, .34);
      opacity: 0;
      pointer-events: none;
      transition: opacity .18s ease;
    }
    .scrim.is-open { opacity: 1; pointer-events: auto; }
    .drawer {
      position: fixed;
      z-index: var(--z-drawer);
      top: 0;
      right: 0;
      width: min(86vw, 340px);
      height: 100vh;
      background: #fff;
      box-shadow: var(--drawer-shadow);
      transform: translateX(104%);
      transition: transform .22s ease;
      padding: 14px;
      overflow-y: auto;
    }
    .drawer.is-open { transform: translateX(0); }
    .drawer-head, .flyup-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
    }
    .drawer h2, .flyup h2 {
      margin: 0;
      color: var(--text-strong);
      font-size: 16px;
      line-height: 1.1;
    }
    .close-btn {
      width: 34px;
      height: 34px;
      border-radius: 999px;
      border: 1px solid var(--border-soft);
      background: #fff;
      color: var(--text-main);
      font-size: 18px;
      cursor: pointer;
    }
    .filter-group { margin: 0 0 12px; }
    .filter-group h3 {
      margin: 0 0 8px;
      font-size: var(--font-sm);
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .drawer-note {
      margin: -2px 0 12px;
      color: var(--text-muted);
      font-size: var(--font-xs);
      line-height: 1.28;
    }
    .filter-actions {
      display: flex;
      gap: 8px;
      margin: 0 0 14px;
    }
    .drawer-action {
      min-height: 32px;
      border: 1px solid var(--border-soft);
      border-radius: 999px;
      background: #fff;
      color: var(--text-main);
      padding: 0 12px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
    .drawer-action.is-primary {
      background: #0c2438;
      border-color: #0c2438;
      color: #fff;
    }
    .filter-chip-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .filter-chip {
      max-width: 100%;
      min-height: 30px;
      border: 1px solid var(--border-soft);
      border-radius: 999px;
      background: #fff;
      color: var(--text-main);
      padding: 4px 9px;
      font-size: 12px;
      font-weight: 650;
      line-height: 1.1;
      cursor: pointer;
    }
    .filter-chip.is-active {
      border-color: #0c2438;
      background: #0c2438;
      color: #fff;
    }
    .check-line {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 32px;
      font-size: 13px;
      font-weight: 600;
    }
    .flyup {
      position: fixed;
      z-index: var(--z-flyup);
      left: 50%;
      bottom: 0;
      width: min(100%, 760px);
      max-height: 82vh;
      transform: translate(-50%, 105%);
      background: #fff;
      border-radius: 18px 18px 0 0;
      box-shadow: var(--flyup-shadow);
      transition: transform .24s ease;
      overflow-y: auto;
      padding: 12px 12px 18px;
    }
    .flyup.is-open { transform: translate(-50%, 0); }
    .flyup-row {
      display: grid;
      grid-template-columns: 51px minmax(0, 1fr) 22px 22px 22px;
      gap: 3px;
      align-items: center;
      min-height: 31px;
      padding: 2px 0;
      border-bottom: 1px solid var(--border-soft);
    }
    .flyup-row-label {
      color: var(--text-muted);
      font-size: var(--font-xs);
      font-weight: 760;
      text-transform: uppercase;
    }
    .flyup-row-main {
      min-width: 0;
      color: var(--text-strong);
      font-size: 12px;
      font-weight: 610;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .detail-grid {
      display: grid;
      grid-template-columns: 78px minmax(0, 1fr);
      gap: 6px 10px;
      font-size: 12px;
      line-height: 1.22;
    }
    .detail-label {
      color: var(--text-muted);
      font-size: var(--font-xs);
      font-weight: 760;
      text-transform: uppercase;
    }
    .detail-value { color: var(--text-strong); font-weight: 610; }
    .detail-section {
      margin-top: 11px;
      border-top: 1px solid var(--border-soft);
      padding-top: 9px;
    }
    .detail-section h3 {
      margin: 0 0 8px;
      font-size: var(--font-sm);
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .flyup-badges {
      display: flex;
      gap: 5px;
      flex-wrap: wrap;
    }
    .entry-line {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) 34px;
      gap: 6px;
      padding: 6px;
      border-radius: var(--radius-md);
      background: var(--surface-raised);
      margin-bottom: 5px;
    }
    .entry-line.has-diff { background: var(--flyup-diff-bg); }
    .entry-order { font-weight: 680; color: var(--text-strong); }
    .entry-copy { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .entry-meta { color: var(--text-muted); font-size: var(--font-xs); text-align: right; }
    .empty-state {
      padding: 18px 12px;
      color: var(--text-muted);
      font-size: var(--font-sm);
      line-height: 1.35;
    }
    .footer-note {
      padding: 0 12px 24px;
      color: var(--text-muted);
      font-size: var(--font-xs);
      line-height: 1.35;
    }
    @media (min-width: 560px) {
      .topbar-main { padding-inline: 12px; }
      .icon-btn { width: 38px; height: 38px; }
      .rail { padding-inline: 12px; }
      .class-row, .flyup-row { grid-template-columns: 55px minmax(0, 1fr) 23px 23px 23px; padding-inline: 9px 6px; }
      .ring-head { padding-inline: 12px; }
      .status-note, .footer-note { margin-inline: 12px; padding-inline: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; }
    }
  </style>
</head>
<body>
  <div class="app-shell" id="app">
    <header class="topbar">
      <div class="topbar-main">
        <div>
          <h1>${esc(payload.show_name || "WEC Mobile Pro")}</h1>
          <div class="date-line">${esc(focusDay || "focus day unavailable")}</div>
        </div>
        <div class="iconbar" aria-label="Schedule controls">
          <button class="icon-btn" id="gearBtn" type="button" aria-label="Open preferences" aria-expanded="false" aria-controls="gearPanel">${iconGear()}</button>
          <button class="icon-btn" id="hideBtn" type="button" aria-label="Open visibility controls" aria-expanded="false" aria-controls="hidePanel">${iconEyeOff()}</button>
          <button class="icon-btn" id="filterBtn" type="button" aria-label="Open hide filters" aria-expanded="false">${iconFilter()}<span class="filter-count" id="filterCount" hidden>0</span></button>
          <a class="icon-btn" id="printBtn" aria-label="Open print PDF" href="${esc(SMARTBROWZ_PDF_URL)}" target="_blank" rel="noopener">${iconPrint()}</a>
        </div>
      </div>
      <section class="push-panel" id="gearPanel" aria-label="Preferences panel">
        <p class="panel-title">Preferences</p>
        <div class="toggle-grid">
          <button class="soft-toggle is-on" type="button" data-ui-toggle="compact">Compact rows</button>
          <button class="soft-toggle" type="button" data-ui-toggle="rollups">Emphasize rollups</button>
          <button class="soft-toggle" type="button" data-ui-toggle="diffs">Diff markers</button>
          <button class="soft-toggle" type="button" data-ui-toggle="entries">Entry flyup</button>
        </div>
      </section>
      <section class="push-panel" id="hidePanel" aria-label="Visibility panel">
        <p class="panel-title">Visibility</p>
        <div class="toggle-grid">
          <button class="soft-toggle" type="button" data-hide-flag="is_medal">Medal classes</button>
          <button class="soft-toggle" type="button" data-hide-flag="is_under_saddle">Under saddle</button>
          <button class="soft-toggle" type="button" data-hide-flag="is_jumper_classic">Jumper classics</button>
          <button class="soft-toggle" type="button" data-hide-flag="is_hunter_classic">Hunter classics</button>
        </div>
      </section>
      <nav class="rail" aria-label="Ring anchors"><div class="rail-track" id="ringRail"></div></nav>
      <nav class="rail" aria-label="Horse filters"><div class="rail-track" id="horseRail"></div></nav>
    </header>
    <main class="schedule" id="schedule"></main>
    <nav class="bottom-nav" aria-label="Primary mobile sections">
      <button class="bottom-tab is-active" type="button" data-bottom-action="start">START</button>
      <button class="bottom-tab" type="button" data-bottom-action="time">TIME</button>
      <button class="bottom-tab" type="button" data-bottom-action="rings">RINGS</button>
      <button class="bottom-tab" type="button" data-bottom-action="results">RESULTS</button>
      <button class="bottom-tab" type="button" data-bottom-action="alerts">ALERTS</button>
      <button class="bottom-tab" type="button" data-bottom-action="filters">FILTERS</button>
    </nav>
    <p class="footer-note">Prototype only. Reads the approved Development WEC mobile payload. Controls are local UI only and do not save, send, or trigger external actions.</p>
  </div>
  <div class="scrim" id="scrim" hidden></div>
  <aside class="drawer" id="filterDrawer" aria-label="Hide by Attribute drawer" aria-hidden="true">
    <div class="drawer-head"><h2>Hide by Attribute</h2><button class="close-btn" id="drawerClose" type="button" aria-label="Close filters">x</button></div>
    <p class="drawer-note">Selected values hide matching classes. This is UI-only and does not save or update source data.</p>
    <div class="filter-actions">
      <button class="drawer-action" id="clearFiltersBtn" type="button">Clear</button>
      <button class="drawer-action is-primary" id="applyFiltersBtn" type="button">Done</button>
    </div>
    <div id="filterDrawerBody"></div>
  </aside>
  <section class="flyup" id="flyup" aria-label="Class detail flyup" aria-hidden="true">
    <div class="flyup-head"><h2 id="flyupTitle">Class detail</h2><button class="close-btn" id="flyupClose" type="button" aria-label="Close class details">x</button></div>
    <div id="flyupBody"></div>
  </section>
  <script id="schedulePayload" type="application/json">${payloadJson}</script>
  <script>
    // TODO: confirm final rollup fields.
    // TODO: confirm final flyup fields.
    const payload = JSON.parse(document.getElementById("schedulePayload").textContent || "{}");
    const SMARTBROWZ_PDF_URL = ${JSON.stringify(SMARTBROWZ_PDF_URL)};
    const FILTER_GROUPS = [
      ["class_name_tokens", "Class tokens"],
      ["this_sizes", "Sizes"],
      ["this_heights", "Heights"],
      ["this_skills", "Skills"],
      ["this_levels", "Levels"],
      ["this_ages", "Ages"],
      ["this_disciplines", "Disciplines"],
      ["this_beginners", "Beginners"]
    ];
    const HIDE_FLAGS = [
      ["is_jumper_classic", "Jumper classic"],
      ["is_hunter_classic", "Hunter classic"],
      ["is_medal", "Medal"],
      ["is_under_saddle", "Under saddle"],
      ["focus_priority", "Focus priority"]
    ];
    const state = { activeRing: "", horse: "", hiddenFlags: new Set(), classFilters: new Map(), rowsByKey: new Map() };

    const truthy = (value) => value === true || value === 1 || String(value || "").toLowerCase() === "true" || String(value || "") === "1";
    const text = (value) => {
      if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
      if (value && typeof value === "object") {
        return text(value.barn_name || value.horse_display || value.horse || value.name || value.label || value.entry_display || value.class_name || value.value || "");
      }
      return String(value ?? "").trim();
    };
    const html = (value) => text(value).replace(/[&<>"']/g, (char) => {
      if (char === "&") return "&amp;";
      if (char === "<") return "&lt;";
      if (char === ">") return "&gt;";
      if (char === '"') return "&quot;";
      return "&#39;";
    });
    const rings = Array.isArray(payload.rings) ? payload.rings : [];

    function allClassRows() {
      return rings.flatMap((ring) => classRows(ring));
    }

    function splitFilterValues(value) {
      return String(value ?? "")
        .split(/[|,;\\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    function displayFilterLabel(group, value) {
      const raw = String(value || "").trim();
      if (group === "this_sizes") {
        const key = raw.toLowerCase();
        if (key === "small") return "Sm";
        if (key === "medium") return "Med";
        if (key === "large") return "Lg";
      }
      return raw;
    }

    function ringId(ring, index) {
      return "ring-" + String(ring.ring_no || ring.ring_key || ring.ring_name || index).replace(/[^a-z0-9_-]+/gi, "-");
    }

    function classRows(ring) {
      return Array.isArray(ring.classes) ? ring.classes : [];
    }

    function rowKey(row, ringIndex, rowIndex) {
      return String(row.class_key || row.class_no || row.class_id || ringIndex + "-" + rowIndex);
    }

    function classTitle(row) {
      return text(row.class_name || row.class_display || row.rs_class_name || row.class_label || "Class");
    }

    function classAuditId(row) {
      const classNo = text(row.class_no ?? row.classNo ?? "");
      const priority = text(row.class_priority_sort ?? row.classPrioritySort ?? "");
      if (classNo && priority) return classNo + "-" + priority;
      return classNo || priority;
    }

    function classAuditHtml(row) {
      const audit = classAuditId(row);
      return audit ? ' <span class="class-audit-id">(' + html(audit) + ')</span>' : "";
    }

    function classNameTokens(row) {
      const raw = row.class_name_tokens ?? row.classNameTokens ?? "";
      return splitFilterValues(raw).slice(0, 18);
    }

    function tokenStripHtml(tokens) {
      return tokens && tokens.length
        ? '<div class="token-strip">' + tokens.map((token) => '<span class="class-token">' + html(token) + '</span>').join("") + '</div>'
        : "";
    }

    function timeText(row) {
      return text(row.time_text || row.class_time_text || row.start_time_text || row.start_time || row.time || "");
    }

    function shortTime(row) {
      return timeText(row)
        .replace(/\\s+/g, " ")
        .replace(/\\bAM\\b/i, "A")
        .replace(/\\bPM\\b/i, "P")
        .replace(/\\s+([AP])$/i, "$1");
    }

    function ringLabel(ring) {
      return text(ring.ring_name_normalized || ring.ring_display || ring.ring_name || ring.ring_no || "Ring");
    }

    function safeRingStatusToken(ring) {
      // TODO: wire only when a proven fresh ring lateness/status source is present in the approved payload.
      return "";
    }

    function isCurrentClass(row) {
      // TODO: wire only when fresh/proven current-class data is present in the approved payload.
      return false;
    }

    function horseName(value) {
      return text(value && typeof value === "object"
        ? value.barn_name || value.horse_display || value.horse || value.name || value.label || value.entry_display || value.value
        : value);
    }

    function entryOrder(value, row) {
      return text((value && typeof value === "object"
        ? value.entry_order || value.order || value.order_of_go || value.draw || value.entry_no
        : "") || row.entry_order || row.order || row.order_of_go || row.draw || row.entry_no);
    }

    function entryNo(value, row) {
      return text((value && typeof value === "object"
        ? value.entry_no || value.entryNo || value.entry_number
        : "") || row.entry_no || row.entryNo || row.entry_number);
    }

    function goIn(value) {
      return text(value && typeof value === "object" ? value.go_in || value.goIn || value.entry_go_in : "");
    }

    function rollups(row) {
      const source = Array.isArray(row.rollups) ? row.rollups : Array.isArray(row.trainer_rollups) ? row.trainer_rollups : [];
      const tokens = [];
      for (const item of source) {
        const horses = Array.isArray(item.horses) ? item.horses : [item.horse || item.horse_display || item.barn_name || item.name || item.label].filter(Boolean);
        for (const horse of horses) {
          const name = horseName(horse);
          if (!name) continue;
          const order = entryOrder(horse, item);
          tokens.push(order ? (name + " (" + order + ")").toUpperCase() : name.toUpperCase());
        }
      }
      if (!tokens.length) {
        const name = horseName(row.horse_display || row.horse || row.barn_name || row.entry_display || row.current_entry_text);
        const order = entryOrder(row, row);
        if (name) tokens.push(order ? (name + " (" + order + ")").toUpperCase() : name.toUpperCase());
      }
      return Array.from(new Set(tokens)).slice(0, 12);
    }

    function entryLines(row) {
      const lines = [];
      const source = Array.isArray(row.rollups) ? row.rollups : Array.isArray(row.trainer_rollups) ? row.trainer_rollups : [];
      for (const item of source) {
        const horses = Array.isArray(item.horses) ? item.horses : [item.horse || item.horse_display || item.barn_name || item.name || item.label].filter(Boolean);
        for (const horse of horses) {
          const name = horseName(horse);
          if (!name) continue;
          lines.push({
            entry_no: entryNo(horse, item),
            horse: name.toUpperCase(),
            entry_order: entryOrder(horse, item),
            go_in: goIn(horse)
          });
        }
      }
      if (!lines.length) {
        const name = horseName(row.horse_display || row.horse || row.barn_name || row.entry_display || row.current_entry_text);
        if (name) {
          lines.push({
            entry_no: entryNo(row, row),
            horse: name.toUpperCase(),
            entry_order: entryOrder(row, row),
            go_in: ""
          });
        }
      }
      return lines.slice(0, 12);
    }

    function horseTokens(row) {
      const tokens = new Set();
      for (const value of [row.entry_display, row.current_entry_text, row.horse_display, row.horse, row.entries, row.barn_name]) {
        text(value).split(/[|,]/).map((part) => part.trim()).filter(Boolean).forEach((part) => tokens.add(part));
      }
      for (const rollup of Array.isArray(row.trainer_rollups) ? row.trainer_rollups : Array.isArray(row.rollups) ? row.rollups : []) {
        for (const horse of Array.isArray(rollup.horses) ? rollup.horses : []) tokens.add(horseName(horse));
      }
      return Array.from(tokens).filter(Boolean).slice(0, 18);
    }

    function hasDiff(row) {
      return !!text(row.diff_class || row.diffClass || row.diff_status || row.diff_time || row.diff_entries);
    }

    function diffClasses(row) {
      const raw = text(row.diff_class || row.diffClass || "");
      return raw.split(/\\s+/).filter((item) => /^diff-[a-z0-9_-]+$/i.test(item));
    }

    function statusBadge(row) {
      // TODO: keep placeholder until a proven WEC status source is present in the approved payload.
      return ["", "status-placeholder badge-empty", "No approved status source"];
    }

    function specialBadge(row) {
      if (truthy(row.is_jumper_classic) || truthy(row.is_hunter_classic)) return ["C", "special-classic", "Classic candidate"];
      if (truthy(row.is_handy)) return ["H", "special-handy", "Handy candidate"];
      if (truthy(row.is_medal)) return ["M", "special-medal", "Medal candidate"];
      if (truthy(row.is_under_saddle)) return ["U", "special-under-saddle", "Under saddle candidate"];
      return ["", "special-placeholder badge-empty", "No approved special source"];
    }

    function typeBadge(row) {
      if (truthy(row.is_hunter)) return ["H", "type-hunter", "Hunter type candidate"];
      if (truthy(row.is_jumper)) return ["J", "type-jumper", "Jumper type candidate"];
      if (truthy(row.is_equitation)) return ["E", "type-equitation", "Equitation type candidate"];
      return ["", "type-placeholder badge-empty", "No approved type source"];
    }

    function badgeHtml(badge) {
      const [label, cls, title] = badge;
      return '<span class="badge ' + html(cls) + '" title="' + html(title) + '">' + html(label) + '</span>';
    }

    function rowAllowed(row) {
      for (const flag of state.hiddenFlags) if (truthy(row[flag])) return false;
      for (const [field, selected] of state.classFilters.entries()) {
        if (!selected || selected.size === 0) continue;
        const values = splitFilterValues(row?.[field]).map((value) => value.toLowerCase());
        if (values.some((value) => selected.has(value))) return false;
      }
      if (state.horse) {
        const hay = horseTokens(row).join(" ").toLowerCase();
        if (!hay.includes(state.horse.toLowerCase())) return false;
      }
      return true;
    }

    function renderRails() {
      const ringRail = document.getElementById("ringRail");
      ringRail.innerHTML = rings.map((ring, index) => {
        const id = ringId(ring, index);
        const name = ringLabel(ring);
        return '<button class="pill' + (state.activeRing === id ? ' is-active' : '') + '" type="button" data-ring-target="' + html(id) + '">' + html(name) + '</button>';
      }).join("");

      const horseSet = new Set();
      rings.forEach((ring) => classRows(ring).forEach((row) => horseTokens(row).forEach((horse) => horseSet.add(horse))));
      const horses = Array.from(horseSet).slice(0, 20);
      const horseRail = document.getElementById("horseRail");
      if (!horses.length) {
        horseRail.innerHTML = '<button class="pill is-placeholder" type="button" disabled>Horse filters unresolved</button>';
      } else {
        horseRail.innerHTML = horses.map((horse) => '<button class="pill' + (state.horse === horse ? ' is-active' : '') + '" type="button" data-horse-filter="' + html(horse) + '">' + html(horse) + '</button>').join("");
      }
    }

    function filterChoicesFromRows(rows) {
      return FILTER_GROUPS.map(([field, label]) => {
        const values = new Map();
        for (const row of rows || []) {
          for (const value of splitFilterValues(row?.[field])) {
            const key = value.toLowerCase();
            if (!values.has(key)) values.set(key, value);
          }
        }
        return {
          field,
          label,
          values: Array.from(values.entries()).map(([key, value]) => ({ key, value }))
            .sort((a, b) => displayFilterLabel(field, a.value).localeCompare(displayFilterLabel(field, b.value), undefined, { numeric: true, sensitivity: "base" }))
        };
      }).filter((group) => group.values.length);
    }

    function activeFilterCount() {
      let count = state.hiddenFlags.size;
      for (const selected of state.classFilters.values()) count += selected.size;
      return count;
    }

    function updateFilterCount() {
      const count = activeFilterCount();
      const badge = document.getElementById("filterCount");
      const button = document.getElementById("filterBtn");
      if (badge) {
        badge.hidden = count === 0;
        badge.textContent = String(count);
      }
      if (button) button.classList.toggle("is-active", count > 0);
    }

    function renderFilterDrawer() {
      const body = document.getElementById("filterDrawerBody");
      if (!body) return;
      const flagHtml = HIDE_FLAGS.map(([flag, label]) => {
        const active = state.hiddenFlags.has(flag);
        return '<button class="filter-chip' + (active ? ' is-active' : '') + '" type="button" data-hide-flag-chip="' + html(flag) + '">' + html(label) + '</button>';
      }).join("");
      const groupHtml = filterChoicesFromRows(allClassRows()).map((group) => {
        return '<div class="filter-group" data-filter-group="' + html(group.field) + '">' +
          '<h3>' + html(group.label) + '</h3>' +
          '<div class="filter-chip-grid">' + group.values.map((item) => {
            const active = state.classFilters.get(group.field)?.has(item.key);
            return '<button class="filter-chip' + (active ? ' is-active' : '') + '" type="button" data-filter-field="' + html(group.field) + '" data-filter-value="' + html(item.value) + '">' + html(displayFilterLabel(group.field, item.value)) + '</button>';
          }).join("") + '</div>' +
        '</div>';
      }).join("");
      body.innerHTML =
        '<div class="filter-group"><h3>Class flags</h3><div class="filter-chip-grid">' + flagHtml + '</div></div>' +
        (groupHtml || '<p class="empty-state">No approved attribute filters are present in this payload.</p>');
      bindFilterDrawerControls();
      updateFilterCount();
    }

    function toggleClassFilter(field, value) {
      const key = String(field || "").trim();
      const selectedValue = String(value || "").trim().toLowerCase();
      if (!key || !selectedValue) return;
      const selected = state.classFilters.get(key) || new Set();
      if (selected.has(selectedValue)) selected.delete(selectedValue);
      else selected.add(selectedValue);
      if (selected.size) state.classFilters.set(key, selected);
      else state.classFilters.delete(key);
      renderFilterDrawer();
      renderSchedule();
    }

    function clearHideFilters() {
      state.hiddenFlags.clear();
      state.classFilters.clear();
      document.querySelectorAll("[data-hide-flag]").forEach((button) => button.classList.remove("is-on"));
      renderFilterDrawer();
      renderSchedule();
    }

    function renderSchedule() {
      state.rowsByKey.clear();
      const schedule = document.getElementById("schedule");
      if (!rings.length) {
        schedule.innerHTML = '<p class="empty-state">No rings returned from the read-only WEC mobile payload.</p>';
        return;
      }
      const sections = rings.map((ring, ringIndex) => {
        const rows = classRows(ring).filter(rowAllowed);
        const id = ringId(ring, ringIndex);
        const name = ringLabel(ring);
        const ringStatus = safeRingStatusToken(ring);
        const rowHtml = rows.map((row, rowIndex) => {
          const key = rowKey(row, ringIndex, rowIndex);
          state.rowsByKey.set(key, row);
          const rowRollups = rollups(row);
          const classList = ["class-row"];
          if (rowRollups.length) classList.push("has-rollup");
          if (isCurrentClass(row)) classList.push("is-current-class");
          if (hasDiff(row)) classList.push("has-diff");
          for (const diffClass of diffClasses(row)) classList.push(diffClass);
          return '<button class="' + classList.join(" ") + '" type="button" data-row-key="' + html(key) + '">' +
            '<span class="time-chip">' + html(shortTime(row) || "--") + '</span>' +
            '<span class="class-main">' +
              (rowRollups.length ? '<span class="row-rollups">' + rowRollups.map((item) => '<span class="rollup-token">' + html(item) + '</span>').join("") + '</span>' : '') +
              '<span class="class-name">' + html(classTitle(row)) + classAuditHtml(row) + '</span>' +
            '</span>' +
            badgeHtml(statusBadge(row)) +
            badgeHtml(specialBadge(row)) +
            badgeHtml(typeBadge(row)) +
            '</button>';
        }).join("");
        return '<section class="ring-card" id="' + html(id) + '" data-ring-section="' + html(id) + '">' +
          '<div class="ring-head"><h2 class="ring-name">' + html(name) + '</h2><div class="ring-summary">' + (ringStatus ? '<span class="ring-status-token has-value">' + html(ringStatus) + '</span>' : '<span class="ring-status-token" aria-hidden="true"></span>') + '<span class="summary-chip">' + rows.length + '</span><span class="summary-chip">' + classRows(ring).length + '</span></div></div>' +
          '<div class="class-list">' + (rowHtml || '<p class="empty-state">No classes match current UI filters.</p>') + '</div>' +
          '</section>';
      }).join("");
      schedule.innerHTML = '<p class="status-note">Focus source ' + html(payload.focus_source || "unknown") + ' | show_no ' + html(payload.show_no || "${esc(showNo)}") + ' | ' + rings.length + ' rings</p>' + sections;
      bindClassRows();
      observeRings();
    }

    function renderFlyup(row) {
      const title = classTitle(row);
      const rowRollups = rollups(row);
      const entries = entryLines(row);
      const tokens = classNameTokens(row);
      const diff = hasDiff(row);
      const flyupBadges = [statusBadge(row), specialBadge(row), typeBadge(row)].map(badgeHtml).join("");
      document.getElementById("flyupTitle").textContent = title;
      const audit = classAuditHtml(row);
      const entrySummary = [
        text(row.entry_count ?? row.entryCount ?? "") ? "entries " + text(row.entry_count ?? row.entryCount ?? "") : "",
        text(row.n_gone ?? row.nGone ?? "") ? "gone " + text(row.n_gone ?? row.nGone ?? "") : "",
        text(row.n_to_go ?? row.nToGo ?? "") ? "to go " + text(row.n_to_go ?? row.nToGo ?? "") : ""
      ].filter(Boolean).join(" · ");
      document.getElementById("flyupBody").innerHTML =
        '<div class="flyup-row"><span class="flyup-row-label">Ring</span><span class="flyup-row-main">' + html(row.ring_name_normalized || row.ring_name || row.ring_no || "Unavailable") + '</span><span></span><span></span><span></span></div>' +
        '<div class="flyup-row"><span class="flyup-row-label">Time</span><span class="flyup-row-main">' + html(shortTime(row) || "Not set") + '</span><span></span><span></span><span></span></div>' +
        '<div class="flyup-row"><span class="flyup-row-label">Class</span><span class="flyup-row-main">' + html((row.class_number || row.classNumber || "") ? text(row.class_number || row.classNumber) + " " : "") + html(title) + audit + tokenStripHtml(tokens) + '</span>' + flyupBadges + '</div>' +
        '<div class="detail-section"><h3>Entry</h3>' + (entrySummary ? '<p class="empty-state">' + html(entrySummary) + '</p>' : '') + (entries.length ? entries.map((entry) => '<div class="entry-line"><span class="entry-order">' + html(entry.entry_order || entry.entry_no || "-") + '</span><span class="entry-copy rollup-token">' + html(entry.horse) + (entry.entry_no ? ' <span class="class-audit-id">#' + html(entry.entry_no) + '</span>' : '') + '</span><span class="entry-meta">' + html(entry.go_in || "") + '</span></div>').join("") : rowRollups.length ? rowRollups.slice(0, 10).map((horse) => '<div class="entry-line"><span class="entry-order">-</span><span class="entry-copy rollup-token">' + html(horse) + '</span><span class="entry-meta"></span></div>').join("") : '<p class="empty-state">Entry details unavailable in this payload. TODO: confirm approved entry fields.</p>') + '</div>' +
        '<div class="detail-section"><h3>Result</h3><p class="empty-state">No approved result fields are present in this payload.</p></div>' +
        (diff ? '<div class="detail-section"><h3>Diffs</h3><div class="entry-line has-diff diff-time diff-status diff-go-time diff-order diff-result"><span class="entry-order">!</span><span class="entry-copy">' + html(text(row.diff_class || row.diffClass || "Diff marker present")) + '</span><span class="entry-meta"></span></div></div>' : '');
      setFlyup(true);
    }

    function setFlyup(open) {
      const flyup = document.getElementById("flyup");
      const scrim = document.getElementById("scrim");
      if (!open && flyup.contains(document.activeElement)) document.activeElement.blur();
      flyup.classList.toggle("is-open", open);
      flyup.setAttribute("aria-hidden", open ? "false" : "true");
      scrim.hidden = false;
      scrim.classList.toggle("is-open", open || document.getElementById("filterDrawer").classList.contains("is-open"));
      if (!open && !document.getElementById("filterDrawer").classList.contains("is-open")) scrim.hidden = true;
    }

    function setDrawer(open) {
      const drawer = document.getElementById("filterDrawer");
      const scrim = document.getElementById("scrim");
      if (!open && drawer.contains(document.activeElement)) document.activeElement.blur();
      drawer.classList.toggle("is-open", open);
      drawer.setAttribute("aria-hidden", open ? "false" : "true");
      document.getElementById("filterBtn").setAttribute("aria-expanded", open ? "true" : "false");
      scrim.hidden = false;
      scrim.classList.toggle("is-open", open || document.getElementById("flyup").classList.contains("is-open"));
      if (!open && !document.getElementById("flyup").classList.contains("is-open")) scrim.hidden = true;
    }

    function togglePanel(id, buttonId) {
      const panel = document.getElementById(id);
      const button = document.getElementById(buttonId);
      const open = !panel.classList.contains("is-open");
      panel.classList.toggle("is-open", open);
      button.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function bindClassRows() {
      document.querySelectorAll(".class-row[data-row-key]").forEach((button) => {
        button.addEventListener("click", () => renderFlyup(state.rowsByKey.get(button.dataset.rowKey) || {}));
      });
    }

    function observeRings() {
      const observer = new IntersectionObserver((entries) => {
        const hit = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!hit) return;
        state.activeRing = hit.target.id;
        renderRails();
        bindRails();
      }, { rootMargin: "-42% 0px -50% 0px", threshold: [0, .2, .45] });
      document.querySelectorAll("[data-ring-section]").forEach((section) => observer.observe(section));
    }

    function bindRails() {
      document.querySelectorAll("[data-ring-target]").forEach((button) => {
        button.addEventListener("click", () => {
          const target = document.getElementById(button.dataset.ringTarget);
          if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
      document.querySelectorAll("[data-horse-filter]").forEach((button) => {
        button.addEventListener("click", () => {
          const horse = button.dataset.horseFilter || "";
          state.horse = state.horse === horse ? "" : horse;
          renderRails();
          bindRails();
          renderSchedule();
        });
      });
    }

    function bindFilterDrawerControls() {
      document.querySelectorAll("[data-filter-field]").forEach((button) => {
        button.addEventListener("click", () => toggleClassFilter(button.dataset.filterField, button.dataset.filterValue));
      });
      document.querySelectorAll("[data-hide-flag-chip]").forEach((button) => {
        button.addEventListener("click", () => {
          const flag = button.dataset.hideFlagChip;
          if (state.hiddenFlags.has(flag)) state.hiddenFlags.delete(flag);
          else state.hiddenFlags.add(flag);
          document.querySelectorAll('[data-hide-flag="' + flag + '"]').forEach((toggle) => toggle.classList.toggle("is-on", state.hiddenFlags.has(flag)));
          renderFilterDrawer();
          renderSchedule();
        });
      });
    }

    function bindBottomNav() {
      document.querySelectorAll("[data-bottom-action]").forEach((button) => {
        button.addEventListener("click", () => {
          document.querySelectorAll("[data-bottom-action]").forEach((item) => item.classList.toggle("is-active", item === button));
          const action = button.dataset.bottomAction;
          if (action === "filters") return setDrawer(true);
          if (action === "rings") return document.getElementById("ringRail").scrollIntoView({ behavior: "smooth", block: "center" });
          if (action === "time" || action === "start") return document.getElementById("schedule").scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    }

    document.getElementById("gearBtn").addEventListener("click", () => togglePanel("gearPanel", "gearBtn"));
    document.getElementById("hideBtn").addEventListener("click", () => togglePanel("hidePanel", "hideBtn"));
    document.getElementById("filterBtn").addEventListener("click", () => setDrawer(true));
    document.getElementById("drawerClose").addEventListener("click", () => setDrawer(false));
    document.getElementById("applyFiltersBtn").addEventListener("click", () => setDrawer(false));
    document.getElementById("clearFiltersBtn").addEventListener("click", clearHideFilters);
    document.getElementById("flyupClose").addEventListener("click", () => setFlyup(false));
    document.getElementById("scrim").addEventListener("click", () => { setDrawer(false); setFlyup(false); });
    document.querySelectorAll("[data-ui-toggle]").forEach((button) => button.addEventListener("click", () => button.classList.toggle("is-on")));
    document.querySelectorAll("[data-hide-flag]").forEach((button) => button.addEventListener("click", () => {
      const flag = button.dataset.hideFlag;
      if (state.hiddenFlags.has(flag)) state.hiddenFlags.delete(flag);
      else state.hiddenFlags.add(flag);
      button.classList.toggle("is-on", state.hiddenFlags.has(flag));
      renderFilterDrawer();
      renderSchedule();
    }));

    const print = document.getElementById("printBtn");
    const pdf = new URL(SMARTBROWZ_PDF_URL, location.href);
    pdf.searchParams.set("show_no", payload.show_no || "${esc(showNo)}");
    pdf.searchParams.delete("focus_day");
    pdf.searchParams.delete("focus_day_date");
    print.href = pdf.toString();

    renderRails();
    bindRails();
    bindBottomNav();
    renderFilterDrawer();
    renderSchedule();
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
      return json(res, 200, {
        ok: true,
        service: "wec-mobile-pro-appsail-prototype",
        show_no: SHOW_NO,
        data_source: DATA_SOURCE,
        writes: false
      });
    }
    if (url.pathname === "/favicon.ico") {
      res.writeHead(204);
      return res.end();
    }
    if (url.pathname === "/api/schedule") {
      const result = await fetchSchedule();
      return json(res, result.ok ? 200 : 502, result);
    }
    if (url.pathname === "/" || url.pathname === "/wec-mobile-pro") {
      const result = await fetchSchedule();
      return renderHome(res, result);
    }
    return json(res, 404, { ok: false, error: "not found" });
  } catch (error) {
    return json(res, 500, { ok: false, error: String(error?.message || error) });
  }
});

server.listen(PORT, () => {
  console.log(`wec-mobile-pro-appsail-prototype listening on ${PORT}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
