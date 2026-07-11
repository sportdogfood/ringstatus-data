"use strict";

const crypto = require("node:crypto");

const ROUTER_TABLE = "hs_router_logs";

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function catalystDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 19).replace("T", " ");
}

function compactPayload(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.stringify(value).slice(0, 10000);
  } catch (error) {
    return JSON.stringify({ serialization_error: text(error?.message || error) });
  }
}

function buildRouterLogKey(event) {
  const identity = [
    event.run_id,
    event.parent_run_id,
    event.lane,
    event.stage,
    event.event_type,
    event.sequence_no,
    event.source_function,
    event.source_action
  ].map(text).join("\u001f");
  const digest = crypto.createHash("sha256").update(identity).digest("hex");
  const prefix = text(event.run_id).replace(/[^0-9A-Za-z._-]/g, "-").slice(0, 80) || "router";
  return `${prefix}|${digest}`;
}

function zcqlValue(value) {
  return `'${text(value).replace(/'/g, "''")}'`;
}

function unwrapRows(rows) {
  return (rows || []).map((item) => item?.[ROUTER_TABLE] || item).filter(Boolean);
}

function cleanRow(row) {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined && value !== ""));
}

function normalizeEvent(base, event, sequenceNo, loggedAt) {
  const row = cleanRow({
    ...base,
    ...event,
    show_no: Number.isFinite(Number(event.show_no ?? base.show_no)) ? Number(event.show_no ?? base.show_no) : undefined,
    focus_day: text(event.focus_day ?? base.focus_day).slice(0, 10),
    sequence_no: sequenceNo,
    started_at: catalystDateTime(event.started_at),
    finished_at: catalystDateTime(event.finished_at),
    duration_ms: Number.isFinite(Number(event.duration_ms)) ? Number(event.duration_ms) : undefined,
    input_count: Number.isFinite(Number(event.input_count)) ? Number(event.input_count) : undefined,
    output_count: Number.isFinite(Number(event.output_count)) ? Number(event.output_count) : undefined,
    http_status: Number.isFinite(Number(event.http_status)) ? Number(event.http_status) : undefined,
    retryable: typeof event.retryable === "boolean" ? event.retryable : undefined,
    error_message: text(event.error_message).slice(0, 10000),
    payload_json: compactPayload(event.payload_json),
    logged_at: catalystDateTime(loggedAt)
  });
  row.router_log_key = text(event.router_log_key) || buildRouterLogKey(row);
  return row;
}

function isDuplicateError(error) {
  return /duplicate|unique/i.test(`${text(error?.code)} ${text(error?.message || error)}`);
}

async function appendRouterEvent(app, row) {
  const query = `SELECT ROWID FROM ${ROUTER_TABLE} WHERE router_log_key = ${zcqlValue(row.router_log_key)} LIMIT 1`;
  const existing = unwrapRows(await app.zcql().executeZCQLQuery(query));
  if (existing.length) return { ok: true, appended: false, duplicate: true, router_log_key: row.router_log_key };
  try {
    const inserted = await app.datastore().table(ROUTER_TABLE).insertRow(row);
    return { ok: true, appended: true, duplicate: false, router_log_key: row.router_log_key, row_id: inserted?.ROWID };
  } catch (error) {
    if (isDuplicateError(error)) {
      return { ok: true, appended: false, duplicate: true, router_log_key: row.router_log_key };
    }
    throw error;
  }
}

function createRouterRun({ app, base, now = () => new Date(), logger = console }) {
  let sequence = 0;
  const attempts = [];
  return {
    async log(event) {
      const sequenceNo = Number.isFinite(Number(event.sequence_no)) ? Number(event.sequence_no) : sequence + 1;
      sequence = Math.max(sequence, sequenceNo);
      const row = normalizeEvent(base, event, sequenceNo, now());
      try {
        const result = await appendRouterEvent(app, row);
        attempts.push({ ...result, sequence_no: sequenceNo, stage: row.stage, event_type: row.event_type });
        return result;
      } catch (error) {
        const failure = {
          ok: false,
          appended: false,
          duplicate: false,
          router_log_key: row.router_log_key,
          sequence_no: sequenceNo,
          stage: row.stage,
          event_type: row.event_type,
          error_code: text(error?.code),
          error_message: text(error?.message || error).slice(0, 1000)
        };
        attempts.push(failure);
        logger.error("[router-log] write failed", failure);
        return failure;
      }
    },
    summary() {
      const failures = attempts.filter((item) => !item.ok);
      return {
        attempted: attempts.length,
        appended: attempts.filter((item) => item.appended).length,
        duplicates: attempts.filter((item) => item.duplicate).length,
        failed_writes: failures.length,
        failures
      };
    },
    attach(result) {
      const routerLogging = this.summary();
      return result && typeof result === "object" && !Array.isArray(result)
        ? { ...result, router_logging: routerLogging }
        : { business_result: result, router_logging: routerLogging };
    }
  };
}

async function executeLoggedAction(run, spec, execute) {
  const started = new Date();
  await run.log({ ...spec, event_type: "start", status: "OPEN", started_at: started });
  try {
    const result = await execute();
    if (typeof spec.after === "function") await spec.after(result, run);
    const skipped = result?.skipped === true || text(result?.status).toUpperCase() === "SKIPPED";
    const passed = result?.ok !== false;
    const outcome = typeof spec.outcome === "function" ? spec.outcome(result) : {};
    await run.log({
      ...spec,
      ...outcome,
      event_type: skipped ? "skip" : passed ? "pass" : "error",
      status: skipped ? "SKIP" : passed ? "PASS" : "FAIL",
      started_at: started,
      finished_at: new Date(),
      duration_ms: Date.now() - started.getTime(),
      error_code: passed ? undefined : text(result?.error_code || result?.blocker || "BUSINESS_RESULT_FAIL"),
      error_message: passed ? undefined : text(result?.error || result?.blocker)
    });
    await run.log({
      ...spec,
      stage: "workflow",
      event_type: "final",
      status: skipped ? "SKIP" : passed ? "PASS" : "FAIL",
      finished_at: new Date(),
      duration_ms: Date.now() - started.getTime()
    });
    return run.attach(result);
  } catch (error) {
    await run.log({
      ...spec,
      event_type: "error",
      status: "FAIL",
      finished_at: new Date(),
      duration_ms: Date.now() - started.getTime(),
      error_code: text(error?.code || "UNHANDLED_ERROR"),
      error_message: text(error?.message || error),
      retryable: false
    });
    await run.log({ ...spec, stage: "workflow", event_type: "final", status: "FAIL", finished_at: new Date() });
    error.router_logging = run.summary();
    throw error;
  }
}

module.exports = {
  ROUTER_TABLE,
  appendRouterEvent,
  buildRouterLogKey,
  createRouterRun,
  executeLoggedAction,
  normalizeEvent
};
