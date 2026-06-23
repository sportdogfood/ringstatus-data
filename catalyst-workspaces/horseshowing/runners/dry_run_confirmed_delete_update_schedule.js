#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_BASE_ID = "app6XS1RvsPNRT6os";
const DEFAULT_PROJECT_ID = "5614000000393031";
const DEFAULT_ENV = "Development";
const DEFAULT_ORG_ID = "700800454";
const CATALYST_TABLE = "hs_update_schedule";
const AIRTABLE_TABLE = "update_schedule";
const PAGE_SIZE = 100;
const PROOF_DIR = path.join(__dirname, "proofs");
const LOG_DIR = path.join(__dirname, "logs");

function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq === -1) args[arg.slice(2)] = "1";
    else args[arg.slice(2, eq)] = arg.slice(eq + 1);
  }
  return args;
}

function text(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(",");
  if (typeof value === "object") {
    if (value.name !== undefined) return text(value.name);
    if (value.id !== undefined) return text(value.id);
    return JSON.stringify(value);
  }
  return String(value).replace(/\s+/g, " ").trim();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function appendJsonl(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

function loadCatalystCliModule(relativePath) {
  const appData = process.env.APPDATA;
  if (!appData) throw new Error("APPDATA not found; cannot locate zcatalyst-cli");
  const modulePath = path.join(appData, "npm", "node_modules", "zcatalyst-cli", "lib", ...relativePath.split("/"));
  if (!fs.existsSync(modulePath)) throw new Error(`zcatalyst-cli module not found at ${modulePath}`);
  return require(modulePath);
}

function initCatalystCliAuth() {
  const authNeedModule = loadCatalystCliModule("command_needs/auth.js");
  const scopesModule = loadCatalystCliModule("authentication/constants/scopes.js");
  const authNeed = authNeedModule.default || authNeedModule;
  const scopes = scopesModule.default || scopesModule;
  authNeed([scopes.zcql]);
}

function loadCatalystZcqlApi() {
  return loadCatalystCliModule("endpoints/index.js").zcqlAPI;
}

async function readCatalystRows({ projectId, env, orgId, checkpointPath, showNo = "" }) {
  initCatalystCliAuth();
  const zcqlAPI = loadCatalystZcqlApi();
  const api = await zcqlAPI({ auth: true, projectId, env, org: orgId });
  const rows = [];
  for (let offset = 0, pageIndex = 0; ; offset += PAGE_SIZE, pageIndex += 1) {
    const where = showNo ? ` WHERE show_no = ${Number(showNo)}` : "";
    const query = `SELECT * FROM ${CATALYST_TABLE}${where} LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
    const data = await api.query(query);
    const page = (data || []).map((item) => item?.[CATALYST_TABLE]).filter(Boolean);
    rows.push(...page);
    appendJsonl(checkpointPath, {
      source: "Catalyst",
      table: CATALYST_TABLE,
      page_index: pageIndex,
      start: offset,
      end: offset + PAGE_SIZE,
      rows_read: page.length,
      last_key: text(page[page.length - 1]?.update_schedule_key),
      total_rows_so_far: rows.length,
      complete: page.length < PAGE_SIZE,
      at: new Date().toISOString()
    });
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeout_ms || 60000));
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const raw = await response.text();
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error(`non-JSON response ${response.status}: ${raw.slice(0, 500)}`);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 800)}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function readConfirmedDeleteRows({ baseId, token, checkpointPath }) {
  const rows = [];
  let offset = "";
  let pageIndex = 0;
  do {
    const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(AIRTABLE_TABLE)}`);
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    url.searchParams.set("filterByFormula", "{confirm_delete}=1");
    if (offset) url.searchParams.set("offset", offset);
    const payload = await fetchJson(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      timeout_ms: 60000
    });
    const page = payload.records || [];
    rows.push(...page);
    appendJsonl(checkpointPath, {
      source: "Airtable",
      table: AIRTABLE_TABLE,
      page_index: pageIndex,
      start: offset || "",
      end: payload.offset || "",
      rows_read: page.length,
      last_key: text(page[page.length - 1]?.fields?.mirror_update_schedule_key || page[page.length - 1]?.fields?.update_schedule_key),
      total_rows_so_far: rows.length,
      complete: !payload.offset,
      at: new Date().toISOString()
    });
    offset = payload.offset || "";
    pageIndex += 1;
  } while (offset);
  return rows;
}

function catalystRowSummary(row) {
  return {
    record_id: text(row.ROWID),
    update_schedule_key: text(row.update_schedule_key),
    show_no: text(row.show_no),
    focus_day: text(row.focus_day || row.iso_date || row.date_text),
    ring_day_no: text(row.ring_day_no),
    ring_no: text(row.ring_no),
    class_no: text(row.class_no),
    event_id: text(row.event_id),
    created_at: text(row.CREATEDTIME || row.CREATED_TIME || row.created_at || row.created_time),
    updated_at: text(row.MODIFIEDTIME || row.MODIFIED_TIME || row.updated_at || row.updated_time)
  };
}

function airtableKey(record) {
  const fields = record.fields || {};
  return text(fields.mirror_update_schedule_key || fields.update_schedule_key);
}

function buildDryRunPlan(catalystRows, confirmedRows) {
  const catalystByKey = new Map();
  for (const row of catalystRows) {
    const key = text(row.update_schedule_key);
    if (!key) continue;
    if (!catalystByKey.has(key)) catalystByKey.set(key, []);
    catalystByKey.get(key).push(row);
  }
  const candidates = [];
  const missingCatalystMatches = [];
  const duplicateCatalystKeyBlockers = [];
  const missingKeys = [];
  for (const record of confirmedRows) {
    const key = airtableKey(record);
    if (!key) {
      missingKeys.push({ airtable_record_id: record.id });
      continue;
    }
    const matches = catalystByKey.get(key) || [];
    if (matches.length === 0) {
      missingCatalystMatches.push({ airtable_record_id: record.id, key });
      continue;
    }
    if (matches.length > 1) {
      duplicateCatalystKeyBlockers.push({
        airtable_record_id: record.id,
        key,
        catalyst_matches: matches.map(catalystRowSummary)
      });
      continue;
    }
    candidates.push({
      airtable_record_id: record.id,
      key,
      catalyst_delete_candidate: catalystRowSummary(matches[0])
    });
  }
  return {
    candidates,
    missing_catalyst_matches: missingCatalystMatches,
    duplicate_catalyst_key_blockers: duplicateCatalystKeyBlockers,
    missing_keys: missingKeys
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const token = args["airtable-token"] || args.airtable_token || process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error("AIRTABLE_TOKEN required");
  const baseId = args["base-id"] || args.base_id || process.env.WEC_AIRTABLE_BASE_ID || DEFAULT_BASE_ID;
  const projectId = args["project-id"] || args.project_id || DEFAULT_PROJECT_ID;
  const env = args.env || DEFAULT_ENV;
  const orgId = args["org-id"] || args.org_id || DEFAULT_ORG_ID;
  const showNo = args["show-no"] || args.show_no || "";
  const runId = `dry-run-confirmed-delete-update-schedule-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const checkpointPath = path.join(LOG_DIR, `${runId}.checkpoints.jsonl`);
  const proofPath = path.join(PROOF_DIR, `${runId}.json`);

  const catalystRows = await readCatalystRows({ projectId, env, orgId, checkpointPath, showNo });
  const confirmedRows = await readConfirmedDeleteRows({ baseId, token, checkpointPath });
  const scopedConfirmedRows = showNo
    ? confirmedRows.filter((record) => text(record.fields?.show_no) === text(showNo))
    : confirmedRows;
  const plan = buildDryRunPlan(catalystRows, scopedConfirmedRows);
  const summary = {
    ok: true,
    gate: "update_schedule_confirm_delete_dry_run",
    dry_run: true,
    catalyst_table: CATALYST_TABLE,
    airtable_table: AIRTABLE_TABLE,
    show_no: showNo || null,
    catalyst_rows_read: catalystRows.length,
    airtable_confirm_delete_rows_read: confirmedRows.length,
    scoped_confirm_delete_rows: scopedConfirmedRows.length,
    catalyst_delete_candidates: plan.candidates.length,
    missing_catalyst_matches: plan.missing_catalyst_matches,
    duplicate_catalyst_key_blockers: plan.duplicate_catalyst_key_blockers,
    missing_keys: plan.missing_keys,
    candidates: plan.candidates,
    records_changed: 0,
    catalyst_records_deleted: 0,
    airtable_records_deleted: 0,
    checkpoint_path: checkpointPath,
    proof_path: proofPath,
    completed_at: new Date().toISOString()
  };
  writeJson(proofPath, summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
