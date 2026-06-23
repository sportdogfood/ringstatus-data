#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_PROJECT_ID = "5614000000393031";
const DEFAULT_ENV = "Development";
const DEFAULT_ORG_ID = "700800454";
const CATALYST_TABLE = "hs_update_schedule";
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
    const query = `SELECT * FROM ${CATALYST_TABLE}${where} ORDER BY ROWID ASC LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
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

function duplicateRecord(row) {
  return {
    record_id: text(row.ROWID || row.id || row.record_id),
    update_schedule_key: text(row.update_schedule_key),
    show_no: text(row.show_no),
    focus_day: text(row.focus_day || row.iso_date || row.date_text),
    ring_day_no: text(row.ring_day_no),
    ring_no: text(row.ring_no),
    class_no: text(row.class_no),
    event_id: text(row.event_id),
    created_at: text(row.CREATEDTIME || row.CREATED_TIME || row.created_at || row.created_time),
    updated_at: text(row.MODIFIEDTIME || row.MODIFIED_TIME || row.updated_at || row.updated_time),
    completeness_score: [
      row.show_no,
      row.focus_day || row.iso_date || row.date_text,
      row.ring_day_no,
      row.ring_no,
      row.class_no,
      row.event_id,
      row.class_name,
      row.time_text
    ].filter((value) => text(value)).length
  };
}

function duplicateCandidateReport(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = text(row.update_schedule_key);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Array.from(groups.entries())
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => {
      const records = group.map(duplicateRecord)
        .sort((left, right) => {
          if (right.completeness_score !== left.completeness_score) return right.completeness_score - left.completeness_score;
          const rightTime = text(right.updated_at || right.created_at);
          const leftTime = text(left.updated_at || left.created_at);
          if (rightTime !== leftTime) return rightTime.localeCompare(leftTime);
          return text(left.record_id).localeCompare(text(right.record_id));
        });
      return {
        key,
        count: group.length,
        records,
        proposed_keep_record_id: records[0]?.record_id || null,
        proposed_delete_record_ids: Array.from(new Set(records.slice(1).map((record) => record.record_id)))
          .filter((recordId) => recordId && recordId !== records[0]?.record_id)
      };
    });
}

async function main() {
  const args = parseArgs(process.argv);
  const projectId = args["project-id"] || args.project_id || DEFAULT_PROJECT_ID;
  const env = args.env || DEFAULT_ENV;
  const orgId = args["org-id"] || args.org_id || DEFAULT_ORG_ID;
  const showNo = args["show-no"] || args.show_no || "";
  const runId = `audit-update-schedule-duplicates-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const checkpointPath = path.join(LOG_DIR, `${runId}.checkpoints.jsonl`);
  const proofPath = path.join(PROOF_DIR, `${runId}.json`);

  const rows = await readCatalystRows({ projectId, env, orgId, checkpointPath, showNo });
  const keys = rows.map((row) => text(row.update_schedule_key)).filter(Boolean);
  const uniqueKeys = new Set(keys);
  const duplicateCandidateReportRows = duplicateCandidateReport(rows);
  const summary = {
    ok: true,
    gate: "hs_update_schedule_duplicate_key_audit",
    dry_run: true,
    catalyst_table: CATALYST_TABLE,
    show_no: showNo || null,
    total_rows: rows.length,
    keyed_rows: keys.length,
    unique_keys: uniqueKeys.size,
    duplicate_keys: duplicateCandidateReportRows.length,
    duplicate_record_instances: duplicateCandidateReportRows.reduce((sum, group) => sum + group.count, 0),
    duplicate_candidate_report: duplicateCandidateReportRows,
    records_changed: 0,
    records_deleted: 0,
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
