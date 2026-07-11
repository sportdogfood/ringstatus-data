"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildRouterLogKey,
  createRouterRun,
  executeLoggedAction
} = require("../router-logger");

function fakeApp({ existingKeys = [], insertError = null } = {}) {
  const inserts = [];
  const updates = [];
  const deletes = [];
  const keys = new Set(existingKeys);
  return {
    inserts,
    updates,
    deletes,
    zcql() {
      return {
        async executeZCQLQuery(query) {
          const match = query.match(/router_log_key = '([^']+)'/);
          return match && keys.has(match[1]) ? [{ hs_router_logs: { ROWID: "1" } }] : [];
        }
      };
    },
    datastore() {
      return {
        table(name) {
          assert.equal(name, "hs_router_logs");
          return {
            async insertRow(row) {
              if (insertError) throw insertError;
              inserts.push(row);
              keys.add(row.router_log_key);
              return { ROWID: String(inserts.length), ...row };
            },
            async updateRow(row) { updates.push(row); },
            async deleteRow(row) { deletes.push(row); }
          };
        }
      };
    }
  };
}

const base = {
  run_id: "run-123",
  show_no: 14910,
  focus_day: "2026-07-10",
  lane: "core",
  source_function: "wec_stage1_3_clean_proof",
  source_action: "wec-clean-cadence-stack",
  trigger_source: "scheduled_cron"
};

test("router key is deterministic and sequence permits legitimate repeated event types", () => {
  const first = buildRouterLogKey({ ...base, stage: "stage2", event_type: "pass", sequence_no: 2 });
  const repeat = buildRouterLogKey({ ...base, stage: "stage2", event_type: "pass", sequence_no: 2 });
  const later = buildRouterLogKey({ ...base, stage: "stage2", event_type: "pass", sequence_no: 3 });

  assert.equal(first, repeat);
  assert.notEqual(first, later);
  assert.ok(first.length <= 255);
});

test("append-only duplicate detection never updates or deletes prior events", async () => {
  const app = fakeApp();
  const run = createRouterRun({ app, base, now: () => new Date("2026-07-10T20:00:00.000Z") });
  const event = { stage: "stage1", event_type: "start", status: "OPEN", sequence_no: 1 };

  const first = await run.log(event);
  const duplicate = await run.log(event);

  assert.equal(first.appended, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(app.inserts.length, 1);
  assert.equal(app.updates.length, 0);
  assert.equal(app.deletes.length, 0);
});

test("router run assigns monotonically increasing stage sequence", async () => {
  const app = fakeApp();
  const run = createRouterRun({ app, base, now: () => new Date("2026-07-10T20:00:00.000Z") });

  await run.log({ stage: "workflow", event_type: "start", status: "OPEN" });
  await run.log({ stage: "stage1", event_type: "pass", status: "PASS" });
  await run.log({ stage: "time_engine", event_type: "dispatch", status: "OPEN" });
  await run.log({ stage: "workflow", event_type: "final", status: "PASS" });

  assert.deepEqual(app.inserts.map((row) => row.sequence_no), [1, 2, 3, 4]);
  assert.deepEqual(app.inserts.map((row) => row.event_type), ["start", "pass", "dispatch", "final"]);
});

test("action-specific stage and downstream events stay between start and final outcome", async () => {
  const app = fakeApp();
  const run = createRouterRun({ app, base, now: () => new Date("2026-07-10T20:00:00.000Z") });

  await executeLoggedAction(run, {
    stage: "core",
    after: async (result, router) => {
      await router.log({ stage: "stage1", event_type: "pass", status: "PASS", output_count: result.stage1_rows });
      await router.log({ stage: "time_engine", event_type: "dispatch", status: "OPEN", next_lane: "time_engine" });
    }
  }, async () => ({ ok: true, stage1_rows: 4 }));

  assert.deepEqual(
    app.inserts.map((row) => `${row.stage}:${row.event_type}`),
    ["core:start", "stage1:pass", "time_engine:dispatch", "core:pass", "workflow:final"]
  );
});

test("business errors are captured and the original error remains authoritative", async () => {
  const app = fakeApp();
  const run = createRouterRun({ app, base, now: () => new Date("2026-07-10T20:00:00.000Z") });
  const original = Object.assign(new Error("business failed"), { code: "BUSINESS_FAIL" });

  await assert.rejects(
    executeLoggedAction(run, { stage: "results" }, async () => { throw original; }),
    (error) => error === original && error.router_logging.failed_writes === 0
  );
  assert.equal(app.inserts.at(-2).event_type, "error");
  assert.equal(app.inserts.at(-2).error_code, "BUSINESS_FAIL");
  assert.equal(app.inserts.at(-1).event_type, "final");
  assert.equal(app.inserts.at(-1).status, "FAIL");
});

test("router write failure is surfaced without replacing the business result", async () => {
  const app = fakeApp({ insertError: Object.assign(new Error("router unavailable"), { code: "ROUTER_DOWN" }) });
  const logged = [];
  const run = createRouterRun({
    app,
    base,
    now: () => new Date("2026-07-10T20:00:00.000Z"),
    logger: { error: (...args) => logged.push(args) }
  });
  const business = { ok: true, rows_written: 7 };

  const result = await executeLoggedAction(run, { stage: "live_enrichment" }, async () => business);

  assert.equal(result.ok, true);
  assert.equal(result.rows_written, 7);
  assert.ok(result.router_logging.failed_writes >= 1);
  assert.match(result.router_logging.failures[0].error_message, /router unavailable/);
  assert.ok(logged.length >= 1);
});
