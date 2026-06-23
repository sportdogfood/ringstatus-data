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
const AIRTABLE_BATCH_SIZE = 10;

const PROOF_DIR = path.join(__dirname, "proofs");
const LOG_DIR = path.join(__dirname, "logs");

const FIELD_MAP = [
  ["show_no", "show_no"],
  ["class_no", "class_no"],
  ["ring_day_no", "ring_day_no"],
  ["ring_no", "ring_no"],
  ["ring_name", "ring_name"],
  ["date_text", "date_text"],
  ["iso_date", "iso_date", "date"],
  ["event_id", "event_id"],
  ["event_name", "event_name"],
  ["class_name", "class_name"],
  ["time_text", "time_text"],
  ["entry_count", "entry_count"],
  ["event_type", "event_type"],
  ["oc_id", "oc_id"],
  ["live_flag", "live_flag"],
  ["source_endpoint", "source"]
];

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

function dateKey(value) {
  const raw = text(value);
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return [
    parsed.getUTCFullYear(),
    String(parsed.getUTCMonth() + 1).padStart(2, "0"),
    String(parsed.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function normalize(value, kind = "") {
  if (kind === "date") return dateKey(value);
  return text(value);
}

function airtableValue(value, kind = "") {
  if (value === undefined || value === null) return null;
  if (kind === "date") return dateKey(value) || null;
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  return value;
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

async function readCatalystRows({ projectId, env, orgId, checkpointPath }) {
  initCatalystCliAuth();
  const zcqlAPI = loadCatalystZcqlApi();
  const api = await zcqlAPI({ auth: true, projectId, env, org: orgId });
  const rows = [];
  for (let offset = 0, pageIndex = 0; ; offset += PAGE_SIZE, pageIndex += 1) {
    const query = `SELECT * FROM ${CATALYST_TABLE} LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
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
      total_keys_so_far: rows.length,
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
    const body = await response.text();
    let payload;
    try {
      payload = body ? JSON.parse(body) : {};
    } catch {
      payload = { raw: body };
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${body.slice(0, 500)}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function airtableUrl(baseId, extra = "") {
  const encodedTable = encodeURIComponent(AIRTABLE_TABLE);
  return `https://api.airtable.com/v0/${baseId}/${encodedTable}${extra}`;
}

async function readAirtableRows({ baseId, token, checkpointPath }) {
  const rows = [];
  let offset = "";
  let pageIndex = 0;
  do {
    const params = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
    if (offset) params.set("offset", offset);
    const payload = await fetchJson(airtableUrl(baseId, `?${params.toString()}`), {
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
      total_keys_so_far: rows.length,
      complete: !payload.offset,
      at: new Date().toISOString()
    });
    offset = payload.offset || "";
    pageIndex += 1;
  } while (offset);
  return rows;
}

function catalystKey(row) {
  return text(row.update_schedule_key);
}

function airtableKey(record) {
  const fields = record.fields || {};
  return text(fields.mirror_update_schedule_key || fields.update_schedule_key);
}

function payloadFromCatalyst(row) {
  const fields = {
    mirror_update_schedule_key: catalystKey(row)
  };
  for (const [catalystField, airtableField, kind] of FIELD_MAP) {
    fields[airtableField] = airtableValue(row[catalystField], kind);
  }
  return fields;
}

function comparableSignature(fields) {
  const normalized = {
    mirror_update_schedule_key: text(fields.mirror_update_schedule_key || fields.update_schedule_key)
  };
  for (const [, airtableField, kind] of FIELD_MAP) {
    normalized[airtableField] = normalize(fields[airtableField], kind);
  }
  return JSON.stringify(normalized);
}

function groupBy(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

async function airtableBatch({ baseId, token, method, records }) {
  const results = [];
  for (let i = 0; i < records.length; i += AIRTABLE_BATCH_SIZE) {
    const batch = records.slice(i, i + AIRTABLE_BATCH_SIZE);
    let payload;
    if (method === "DELETE") {
      const params = new URLSearchParams();
      for (const record of batch) params.append("records[]", record.id);
      payload = await fetchJson(airtableUrl(baseId, `?${params.toString()}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        timeout_ms: 60000
      });
    } else {
      payload = await fetchJson(airtableUrl(baseId), {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ records: batch, typecast: true }),
        timeout_ms: 60000
      });
    }
    results.push(...(payload.records || []));
  }
  return results;
}

function planRemediation(catalystRows, airtableRows) {
  const catalystGroups = groupBy(catalystRows, catalystKey);
  const airtableGroups = groupBy(airtableRows, airtableKey);
  const creates = [];
  const updates = [];
  const deletes = [];

  for (const [key, catalystGroup] of catalystGroups.entries()) {
    const catalystPayloads = catalystGroup.map(payloadFromCatalyst);
    const remainingAirtable = [...(airtableGroups.get(key) || [])];
    for (const payload of catalystPayloads) {
      const signature = comparableSignature(payload);
      const exactIndex = remainingAirtable.findIndex((record) => comparableSignature(record.fields || {}) === signature);
      if (exactIndex !== -1) {
        remainingAirtable.splice(exactIndex, 1);
        continue;
      }
      const reusableRecord = remainingAirtable.shift();
      if (reusableRecord) {
        updates.push({ id: reusableRecord.id, fields: payload });
      } else {
        creates.push({ fields: payload });
      }
    }
    deletes.push(...remainingAirtable);
  }

  for (const [key, records] of airtableGroups.entries()) {
    if (!catalystGroups.has(key)) deletes.push(...records);
  }

  return { creates, updates, deletes };
}

async function main() {
  const args = parseArgs(process.argv);
  const token = args["airtable-token"] || args.airtable_token || process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error("AIRTABLE_TOKEN required");
  const baseId = args["base-id"] || args.base_id || process.env.WEC_AIRTABLE_BASE_ID || DEFAULT_BASE_ID;
  const projectId = args["project-id"] || args.project_id || DEFAULT_PROJECT_ID;
  const env = args.env || DEFAULT_ENV;
  const orgId = args["org-id"] || args.org_id || DEFAULT_ORG_ID;
  const dryRun = args["dry-run"] === "1" || args.dry_run === "1";
  const runId = `remediate-update-schedule-mirror-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const checkpointPath = path.join(LOG_DIR, `${runId}.checkpoints.jsonl`);
  const proofPath = path.join(PROOF_DIR, `${runId}.json`);

  const catalystRows = await readCatalystRows({ projectId, env, orgId, checkpointPath });
  const airtableRows = await readAirtableRows({ baseId, token, checkpointPath });
  const plan = planRemediation(catalystRows, airtableRows);

  let created = [];
  let updated = [];
  let deleted = [];
  if (!dryRun) {
    created = await airtableBatch({ baseId, token, method: "POST", records: plan.creates });
    appendJsonl(checkpointPath, { action: "Airtable create", records: created.length, complete: true, at: new Date().toISOString() });
    updated = await airtableBatch({ baseId, token, method: "PATCH", records: plan.updates });
    appendJsonl(checkpointPath, { action: "Airtable update", records: updated.length, complete: true, at: new Date().toISOString() });
    deleted = await airtableBatch({ baseId, token, method: "DELETE", records: plan.deletes.map((record) => ({ id: record.id })) });
    appendJsonl(checkpointPath, { action: "Airtable delete", records: deleted.length, complete: true, at: new Date().toISOString() });
  }

  const summary = {
    ok: true,
    gate: "hs_update_schedule_to_update_schedule_mirror_remediation",
    dry_run: dryRun,
    catalyst_rows_read: catalystRows.length,
    airtable_rows_read_before: airtableRows.length,
    creates_planned: plan.creates.length,
    updates_planned: plan.updates.length,
    deletes_planned: plan.deletes.length,
    records_created: created.length,
    records_updated: updated.length,
    records_deleted: deleted.length,
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
