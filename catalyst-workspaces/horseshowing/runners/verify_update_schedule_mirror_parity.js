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
    if (eq === -1) {
      args[arg.slice(2)] = "1";
    } else {
      args[arg.slice(2, eq)] = arg.slice(eq + 1);
    }
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
  if (!fs.existsSync(modulePath)) {
    throw new Error(`zcatalyst-cli module not found at ${modulePath}`);
  }
  return require(modulePath);
}

function loadCatalystZcqlApi() {
  return loadCatalystCliModule("endpoints/index.js").zcqlAPI;
}

function initCatalystCliAuth() {
  const authNeedModule = loadCatalystCliModule("command_needs/auth.js");
  const scopesModule = loadCatalystCliModule("authentication/constants/scopes.js");
  const authNeed = authNeedModule.default || authNeedModule;
  const scopes = scopesModule.default || scopesModule;
  authNeed([scopes.zcql]);
}

async function readCatalystRows({ projectId, env, orgId, checkpointPath }) {
  initCatalystCliAuth();
  const zcqlAPI = loadCatalystZcqlApi();
  const api = await zcqlAPI({
    auth: true,
    projectId,
    env,
    org: orgId
  });
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
      total_keys_so_far: rows.filter((row) => text(row.update_schedule_key)).length,
      mismatch_count_so_far: 0,
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
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 800)}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function readAirtableRows({ baseId, token, checkpointPath }) {
  const rows = [];
  let offset = "";
  let pageIndex = 0;
  do {
    const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(AIRTABLE_TABLE)}`);
    url.searchParams.set("pageSize", String(PAGE_SIZE));
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
      total_keys_so_far: rows.filter((record) => text(record.fields?.mirror_update_schedule_key || record.fields?.update_schedule_key)).length,
      mismatch_count_so_far: 0,
      complete: !payload.offset,
      at: new Date().toISOString()
    });
    offset = payload.offset || "";
    pageIndex += 1;
  } while (offset);
  return rows;
}

function duplicateReport(rows, keyFn) {
  const counts = new Map();
  for (const row of rows) {
    const key = text(keyFn(row));
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));
}

function groupRows(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = text(keyFn(row));
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function catalystComparable(row) {
  const normalized = {};
  for (const [catalystField, airtableField, kind] of FIELD_MAP) {
    normalized[airtableField] = normalize(row[catalystField], kind);
  }
  return normalized;
}

function airtableComparable(record) {
  const fields = record.fields || {};
  const normalized = {};
  for (const [, airtableField, kind] of FIELD_MAP) {
    normalized[airtableField] = normalize(fields[airtableField], kind);
  }
  return normalized;
}

function signature(fields) {
  return JSON.stringify(fields);
}

function compareRows(catalystRows, airtableRecords) {
  const catalystByKey = groupRows(catalystRows, (row) => row.update_schedule_key);
  const airtableByKey = groupRows(airtableRecords, (record) => {
    const fields = record.fields || {};
    return fields.mirror_update_schedule_key || fields.update_schedule_key;
  });
  const keys = Array.from(new Set([...catalystByKey.keys(), ...airtableByKey.keys()])).sort();
  const missingInAirtable = [];
  const extraInAirtable = [];
  const fieldMismatches = [];
  const duplicateCountMismatches = [];
  for (const key of keys) {
    const catalystGroup = catalystByKey.get(key) || [];
    const airtableGroup = airtableByKey.get(key) || [];
    if (airtableGroup.length < catalystGroup.length) {
      for (let i = airtableGroup.length; i < catalystGroup.length; i += 1) missingInAirtable.push(key);
    }
    if (airtableGroup.length > catalystGroup.length) {
      for (let i = catalystGroup.length; i < airtableGroup.length; i += 1) extraInAirtable.push(key);
    }
    if (airtableGroup.length !== catalystGroup.length) {
      duplicateCountMismatches.push({ key, catalyst_count: catalystGroup.length, airtable_count: airtableGroup.length });
    }
    if (!catalystGroup.length || !airtableGroup.length) continue;

    const catalystCounts = new Map();
    for (const row of catalystGroup) {
      const sig = signature(catalystComparable(row));
      catalystCounts.set(sig, (catalystCounts.get(sig) || 0) + 1);
    }
    const airtableCounts = new Map();
    for (const record of airtableGroup) {
      const sig = signature(airtableComparable(record));
      airtableCounts.set(sig, (airtableCounts.get(sig) || 0) + 1);
    }
    for (const [sig, count] of catalystCounts.entries()) {
      const airtableCount = airtableCounts.get(sig) || 0;
      if (airtableCount !== count) {
        fieldMismatches.push({
          key,
          catalyst_signature_count: count,
          airtable_signature_count: airtableCount,
          mapped_fields: JSON.parse(sig)
        });
      }
    }
  }
  return {
    missing_in_airtable: missingInAirtable,
    extra_in_airtable: extraInAirtable,
    mapped_field_mismatches: fieldMismatches,
    duplicate_catalyst_keys: duplicateReport(catalystRows, (row) => row.update_schedule_key),
    duplicate_airtable_keys: duplicateReport(airtableRecords, (record) => {
      const fields = record.fields || {};
      return fields.mirror_update_schedule_key || fields.update_schedule_key;
    }),
    duplicate_count_mismatches: duplicateCountMismatches
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
  const runId = `verify-update-schedule-mirror-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const checkpointPath = path.join(LOG_DIR, `${runId}.checkpoints.jsonl`);
  const proofPath = path.join(PROOF_DIR, `${runId}.json`);

  const catalystRows = await readCatalystRows({ projectId, env, orgId, checkpointPath });
  const airtableRows = await readAirtableRows({ baseId, token, checkpointPath });
  const comparison = compareRows(catalystRows, airtableRows);
  const ok = comparison.missing_in_airtable.length === 0
    && comparison.extra_in_airtable.length === 0
    && comparison.mapped_field_mismatches.length === 0
    && comparison.duplicate_count_mismatches.length === 0
    && comparison.duplicate_catalyst_keys.length === 0
    && comparison.duplicate_airtable_keys.length === 0
    && catalystRows.length === airtableRows.length;

  const summary = {
    ok,
    gate: "hs_update_schedule_to_update_schedule_full_mirror_parity",
    mirror_type: "full-table",
    catalyst_table: CATALYST_TABLE,
    airtable_table: AIRTABLE_TABLE,
    catalyst_full_count: catalystRows.length,
    airtable_full_count: airtableRows.length,
    mirror_key: "Catalyst update_schedule_key -> Airtable mirror_update_schedule_key, fallback update_schedule_key",
    mapped_fields: FIELD_MAP.map(([catalystField, airtableField]) => ({ catalyst: catalystField, airtable: airtableField })),
    missing_in_airtable_count: comparison.missing_in_airtable.length,
    extra_in_airtable_count: comparison.extra_in_airtable.length,
    mapped_field_mismatch_count: comparison.mapped_field_mismatches.length,
    duplicate_catalyst_key_count: comparison.duplicate_catalyst_keys.length,
    duplicate_airtable_key_count: comparison.duplicate_airtable_keys.length,
    duplicate_catalyst_record_instances: comparison.duplicate_catalyst_keys.reduce((sum, group) => sum + group.count, 0),
    duplicate_airtable_record_instances: comparison.duplicate_airtable_keys.reduce((sum, group) => sum + group.count, 0),
    duplicate_count_mismatch_count: comparison.duplicate_count_mismatches.length,
    checkpoint_path: checkpointPath,
    proof_path: proofPath,
    completed_at: new Date().toISOString(),
    ...comparison
  };
  writeJson(proofPath, summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!ok) {
    throw new Error("update_schedule full mirror parity failed");
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
