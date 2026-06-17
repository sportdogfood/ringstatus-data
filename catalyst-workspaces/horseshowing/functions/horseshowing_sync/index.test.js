const test = require("node:test");
const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";
const { __test__ } = require("./index.js");

function fakeApp(responses) {
  return {
    zcql() {
      return {
        async executeZCQLQuery(query) {
          if (query.includes("FROM hs_class_start_times")) return responses.classStartTimes || [];
          if (query.includes("FROM hs_classes")) return responses.classes || [];
          if (query.includes("FROM hs_class_times")) return responses.classTimes || [];
          if (query.includes("FROM hs_entry_go_times")) return responses.entryGoTimes || [];
          if (query.includes("FROM hs_entries")) return responses.entries || [];
          if (query.includes("FROM hs_result_queue")) return responses.resultQueue || [];
          if (query.includes("FROM hs_result_classes")) return responses.resultClasses || [];
          if (query.includes("FROM hs_class_results")) return responses.classResults || [];
          throw new Error(`Unexpected query: ${query}`);
        }
      };
    }
  };
}

test("schedule-json overlay prefers prepared class_start_times mobile fields when present", () => {
  const fallback = {
    class_no: "29133",
    start_display: "10:30 AM",
    class_start_time: "10:30:00",
    group_display: "Dottie (24), Doug (37)",
    sched_display: "Dottie (24), Doug (37)",
    "8778_sched_display": "Dottie (24), Doug (37)",
    trainer_rollups: [{ trainer: "Alan Korotkin", trainer_display: "CWF", horses: ["Dottie (24)", "Doug (37)"] }]
  };
  const prepared = {
    class_no: "29133",
    class_start_time: "10:45:00",
    group_display: "Dottie (31)",
    sched_display: "Dottie (31)",
    trainer_rollups: [{ trainer: "Alan Korotkin", trainer_display: "CWF", horses: ["Dottie (31)"] }]
  };

  const row = __test__.applyPreparedClassStartMobileFields(fallback, prepared);

  assert.equal(row.start_display, "10:45 AM");
  assert.equal(row.class_start_time, "10:45:00");
  assert.equal(row.group_display, "Dottie (31)");
  assert.equal(row.sched_display, "Dottie (31)");
  assert.equal(row["8778_sched_display"], "Dottie (31)");
  assert.deepEqual(row.trainer_rollups, prepared.trainer_rollups);
});

test("schedule-json overlay keeps fallback time and rollup when prepared fields are missing", () => {
  const fallback = {
    class_no: "29133",
    start_display: "10:30 AM",
    class_start_time: "10:30:00",
    group_display: "Dottie (24), Doug (37)",
    sched_display: "Dottie (24), Doug (37)",
    "8778_sched_display": "Dottie (24), Doug (37)",
    trainer_rollups: [{ trainer: "Alan Korotkin", trainer_display: "CWF", horses: ["Dottie (24)", "Doug (37)"] }]
  };

  const row = __test__.applyPreparedClassStartMobileFields(fallback, {});

  assert.equal(row.start_display, "10:30 AM");
  assert.equal(row.class_start_time, "10:30:00");
  assert.equal(row.group_display, "Dottie (24), Doug (37)");
  assert.deepEqual(row.trainer_rollups, fallback.trainer_rollups);
});

test("schedule-json marks horse edit eligibility only when barn_name is missing and fallback name is used", async () => {
  const app = fakeApp({
    classStartTimes: [{
      hs_class_start_times: {
        ROWID: "10",
        show_no: "14906",
        focus_day: "2026-06-12",
        ring_no: "675",
        ring_name: "INDR_1",
        ring_day_no: "9001",
        class_no: "29133",
        class_name: "1.10m Jumper",
        class_start_time: "10:45:00",
        entry_count: "3"
      }
    }],
    classes: [{
      hs_classes: {
        ROWID: "20",
        show_no: "14906",
        class_no: "29133",
        class_label: "29133) 1.10m Jumper",
        class_name: "1.10m Jumper",
        entry_count: "3"
      }
    }],
    classTimes: [],
    entries: [{
      hs_entries: {
        show_no: "14906",
        class_no: "29133",
        entry_order: "7",
        horse: "Fallback Show Name",
        trainer: "Alan Korotkin"
      }
    }, {
      hs_entries: {
        show_no: "14906",
        class_no: "29133",
        entry_order: "8",
        horse: "Mapped Show Name",
        trainer: "Alan Korotkin"
      }
    }, {
      hs_entries: {
        show_no: "14906",
        class_no: "29133",
        entry_order: "9",
        horse: "Unlisted Show Name",
        trainer: "Alan Korotkin"
      }
    }]
  });

  const result = await __test__.buildScheduleJson(app, "14906", "2026-06-12", {
    title: "WEC Ocala Summer Series 1 CSI2*",
    showStartDate: "",
    showEndDate: "",
    activeTrainers: ["Alan Korotkin"],
    hideClasses: [],
    horseDisplays: { "Mapped Show Name": "Barn" },
    horseDisplayMeta: {
      "Fallback Show Name": { barn_name_missing: true },
      "Mapped Show Name": { barn_name: "Barn", barn_name_missing: false }
    },
    trainerDisplays: { "Alan Korotkin": "CWF" },
    ringDisplays: { "675": "INDR_1" }
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].group_display, "Fallback Show Name (7), Barn (8), Unlisted Show Name (9)");
  assert.deepEqual(result[0].trainer_rollups[0].horses, [
    {
      horse: "Fallback Show Name",
      display: "Fallback Show Name",
      label: "Fallback Show Name (7)",
      entry_order: "7",
      barn_name: "",
      barn_name_missing: false
    },
    {
      horse: "Mapped Show Name",
      display: "Barn",
      label: "Barn (8)",
      entry_order: "8",
      barn_name: "Barn",
      barn_name_missing: false
    },
    {
      horse: "Unlisted Show Name",
      display: "Unlisted Show Name",
      label: "Unlisted Show Name (9)",
      entry_order: "9",
      barn_name: "",
      barn_name_missing: false
    }
  ]);
});

test("schedule-json uses prepared class_start_times fields in the mobile API row", async () => {
  const app = fakeApp({
    classStartTimes: [{
      hs_class_start_times: {
        ROWID: "10",
        show_no: "14906",
        focus_day: "2026-06-12",
        ring_no: "675",
        ring_name: "INDR_1",
        ring_day_no: "9001",
        class_no: "29133",
        class_name: "1.10m Jumper",
        class_start_time: "10:45:00",
        entry_count: "2",
        group_display: "Dottie (31)",
        trainer_rollups: JSON.stringify([
          { trainer: "Alan Korotkin", trainer_display: "CWF", horses: ["Dottie (31)"] }
        ])
      }
    }],
    classes: [{
      hs_classes: {
        ROWID: "20",
        show_no: "14906",
        class_no: "29133",
        class_label: "29133) 1.10m Jumper",
        class_name: "1.10m Jumper",
        entry_count: "2"
      }
    }],
    classTimes: [{
      hs_class_times: {
        ROWID: "30",
        show_no: "14906",
        ring_day_no: "9001",
        class_no: "29133",
        entry_count: "2",
        entries_gone: "0",
        entries_to_go: "2"
      }
    }]
  });

  const result = await __test__.buildScheduleJson(app, "14906", "2026-06-12", {
    title: "WEC Ocala Summer Series 1 CSI2*",
    showStartDate: "",
    showEndDate: "",
    activeTrainers: [],
    hideClasses: [],
    horseDisplays: {},
    trainerDisplays: {},
    ringDisplays: { "675": "INDR_1" }
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].start_display, "10:45 AM");
  assert.equal(result[0].group_display, "Dottie (31)");
  assert.deepEqual(result[0].trainer_rollups, [
    { trainer: "Alan Korotkin", trainer_display: "CWF", horses: ["Dottie (31)"] }
  ]);
});

test("schedule-json prefers current entry_go_times rows over stale hs_entries rollups", async () => {
  const app = fakeApp({
    classStartTimes: [{
      hs_class_start_times: {
        ROWID: "10",
        show_no: "14906",
        focus_day: "2026-06-14",
        ring_no: "684",
        ring_name: "INDOOR 6",
        ring_day_no: "3917",
        class_no: "29479",
        class_name: "NAL 1.25m FreeRide Equestrian Jr/Am Classic II.2b",
        class_start_time: "14:00:00",
        entry_count: "27"
      }
    }],
    classes: [{
      hs_classes: {
        ROWID: "20",
        show_no: "14906",
        class_no: "29479",
        class_label: "851) NAL 1.25m FreeRide Equestrian Jr/Am Classic II.2b",
        class_name: "NAL 1.25m FreeRide Equestrian Jr/Am Classic II.2b",
        entry_count: "27"
      }
    }],
    classTimes: [],
    entries: [{
      hs_entries: {
        show_no: "14906",
        class_no: "29479",
        entry_order: "2",
        horse: "Dodicci",
        trainer: "Alan Korotkin"
      }
    }, {
      hs_entries: {
        show_no: "14906",
        class_no: "29479",
        entry_order: "3",
        horse: "King Z",
        trainer: "Alan Korotkin"
      }
    }, {
      hs_entries: {
        show_no: "14906",
        class_no: "29479",
        entry_order: "9",
        horse: "Choco Du Reverdy",
        trainer: "Alan Korotkin"
      }
    }]
  });

  const result = await __test__.buildScheduleJson(app, "14906", "2026-06-14", {
    title: "WEC Ocala Summer Series 1 CSI2*",
    showStartDate: "",
    showEndDate: "",
    activeTrainers: ["Alan Korotkin"],
    hideClasses: [],
    horseDisplays: {
      Dodicci: "Dottie",
      "King Z": "King",
      "Choco Du Reverdy": "Choco"
    },
    horseDisplayMeta: {},
    trainerDisplays: { "Alan Korotkin": "CWF" },
    ringDisplays: { "684": "INDR_6" },
    entryGoTimesByClass: new Map([["29479", [
      { class_no: "29479", entry_order: "20", entry_no: "1025", horse: "Dodicci", trainer: "Alan Korotkin" },
      { class_no: "29479", entry_order: "15", entry_no: "1039", horse: "King Z", trainer: "Alan Korotkin" },
      { class_no: "29479", entry_order: "2", entry_no: "2388", horse: "Choco Du Reverdy", trainer: "Alan Korotkin" }
    ]]])
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].group_display, "Dottie (20), King (15), Choco (2)");
});

test("schedule-json prefers current class_start_times over stale Catalyst class time", async () => {
  const app = fakeApp({
    classStartTimes: [{
      hs_class_start_times: {
        ROWID: "10",
        show_no: "14906",
        focus_day: "2026-06-14",
        ring_no: "684",
        ring_name: "INDOOR 6",
        ring_day_no: "4181",
        class_no: "29479",
        class_name: "NAL 1.25m FreeRide Equestrian Jr/Am Classic II.2b",
        class_start_time: "15:28:00",
        entry_count: "34"
      }
    }],
    classes: [{
      hs_classes: {
        ROWID: "20",
        show_no: "14906",
        class_no: "29479",
        class_label: "851) NAL 1.25m FreeRide Equestrian Jr/Am Classic II.2b",
        class_name: "NAL 1.25m FreeRide Equestrian Jr/Am Classic II.2b",
        entry_count: "36"
      }
    }],
    classTimes: [],
    entries: []
  });

  const result = await __test__.buildScheduleJson(app, "14906", "2026-06-14", {
    title: "WEC Ocala Summer Series 1 CSI2*",
    showStartDate: "",
    showEndDate: "",
    activeTrainers: ["Alan Korotkin"],
    hideClasses: [],
    horseDisplays: {},
    horseDisplayMeta: {},
    trainerDisplays: { "Alan Korotkin": "CWF" },
    ringDisplays: { "684": "INDR_6" },
    classStartTimesByClass: new Map([["4181|29479", {
      show_no: "14906",
      focus_day: "2026-06-14",
      ring_day_no: "4181",
      ring_no: "684",
      ring_name: "INDOOR 6 - Brandon",
      class_no: "29479",
      class_name: "NAL 1.25m FreeRide Equestrian Jr/Am Classic II.2b",
      class_start_time: "13:45:00",
      entry_count: 36,
      n_gone: 33,
      n_to_go: 0,
      elapsed_seconds: 448,
      current_entry_no: "2526",
      current_horse: "Bonnie M Z",
      live_source: "get_orders.php"
    }]])
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].class_start_time, "13:45:00");
  assert.equal(result[0].start_display, "1:45 PM");
  assert.equal(result[0].entry_count, 36);
  assert.equal(result[0].n_gone, 33);
  assert.equal(result[0].current_entry_no, "2526");
});

test("rich API joins schedule, entry, live, and result indexes for consumers", async () => {
  const app = fakeApp({
    classStartTimes: [{
      hs_class_start_times: {
        ROWID: "10",
        show_no: "14907",
        focus_day: "2026-06-17",
        ring_no: "675",
        ring_name: "INDOOR 1",
        ring_day_no: "4224",
        class_no: "29784",
        class_name: "1.10m Jumper",
        class_start_time: "10:45:00",
        entry_count: "25",
        n_gone: "12",
        n_to_go: "13",
        current_entry_no: "1296",
        current_horse: "Calou Us",
        live_source: "get_orders.php"
      }
    }],
    classes: [{
      hs_classes: {
        ROWID: "20",
        show_no: "14907",
        class_no: "29784",
        class_label: "624) 1.10m Jumper",
        class_name: "1.10m Jumper",
        entry_count: "25"
      }
    }],
    classTimes: [{
      hs_class_times: {
        ROWID: "30",
        show_no: "14907",
        ring_day_no: "4224",
        class_no: "29784",
        entry_count: "25",
        entries_gone: "12",
        entries_to_go: "13",
        current_entry_no: "1296",
        current_horse: "Calou Us",
        elapsed_seconds: "480",
        source_endpoint: "get_orders.php"
      }
    }],
    entryGoTimes: [{
      hs_entry_go_times: {
        ROWID: "40",
        entry_go_key: "14907|2026-06-17|4224|29784|1296",
        show_no: "14907",
        focus_day: "2026-06-17",
        ring_day_no: "4224",
        class_no: "29784",
        entry_no: "1296",
        entry_order: "5",
        horse: "Calou Us",
        rider: "Tanner Korotkin",
        trainer: "Alan Korotkin",
        go_time: "10:53:00"
      }
    }],
    resultQueue: [{
      hs_result_queue: {
        result_queue_key: "14907|2026-06-17|29784",
        show_no: "14907",
        focus_day: "2026-06-17",
        class_no: "29784",
        status: "completed",
        result_rows: "25",
        completed_at: "2026-06-17 22:10:14"
      }
    }],
    resultClasses: [{
      hs_result_classes: {
        result_class_key: "14907|29784",
        show_no: "14907",
        focus_day: "2026-06-17",
        class_no: "29784",
        result_entry_count: "25",
        completed_at: "2026-06-17 22:10:14"
      }
    }],
    classResults: [{
      hs_class_results: {
        class_result_key: "14907|29784|1296|Calou Us|Tanner Korotkin",
        show_no: "14907",
        focus_day: "2026-06-17",
        class_no: "29784",
        entry_no: "1296",
        horse: "Calou Us",
        rider: "Tanner Korotkin",
        score: "82",
        completed_at: "2026-06-17 22:10:14"
      }
    }]
  });

  const result = await __test__.buildRichApiPayload(app, "14907", "2026-06-17", {
    title: "WEC Ocala Summer Series 2 CSI2*",
    showStartDate: "2026-06-17",
    showEndDate: "2026-06-22",
    activeTrainers: ["Alan Korotkin"],
    hideClasses: [],
    horseDisplays: { "Calou Us": "Calou" },
    horseDisplayMeta: {},
    trainerDisplays: { "Alan Korotkin": "CWF" },
    ringDisplays: { "675": "INDR_1" },
    reconcileEntryGoTimes: false
  });

  assert.equal(result.show_no, "14907");
  assert.equal(result.sources.backbone, "update_schedule_staging.lock_schedule");
  assert.equal(result.outputs.wec_mobile.rings.length, 1);
  assert.equal(result.outputs.wec_mobile_pro.rings[0].classes[0].status, "completed");
  assert.equal(result.outputs.wec_mobile_pro.rings[0].classes[0].entries[0].horse_display, "Calou");
  assert.equal(result.outputs.wec_mobile_pro.rings[0].classes[0].results[0].score, "82");
  assert.equal(result.outputs.wec_print.rows[0].status, "completed");
  assert.equal(result.outputs.wec_alerts.classes[0].status, "completed");
  assert.equal(result.indexes.by_ring.INDR_1[0], "29784");
  assert.equal(result.indexes.by_class_no["29784"].status, "completed");
  assert.equal(result.indexes.by_entry_no["1296"][0].horse_display, "Calou");
  assert.equal(result.indexes.by_horse.calou[0].class_no, "29784");
  assert.equal(result.indexes.by_rider["tanner korotkin"][0].entry_no, "1296");
});
