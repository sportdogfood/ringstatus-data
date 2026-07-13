const test = require("node:test");
const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";
const { __test__ } = require("./index.js");

function sourceBlock(source, start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start) + start.length));
}

test("active Step 5 has no Airtable runtime or heartbeat mirror writers", () => {
  const source = require("node:fs").readFileSync(__filename.replace(/index\.test\.js$/, "index.js"), "utf8");
  const enrich = sourceBlock(source, "async function enrichStep5RuntimeRows", "function summarizeStep5Mirror");
  const active = sourceBlock(source, "async function runWecStep5LiveEnrichmentOnly", "async function fetchAndSyncRingDaySchedule");

  assert.doesNotMatch(enrich, /syncRawAirtableStep4RuntimeRows/);
  assert.doesNotMatch(active, /writeRawAirtableHeartbeat|syncRawAirtableStep5LiveRows|updateAirtableHsFocusShowLiveEmpty/);
  assert.match(active, /getActiveAirtableFocusShowStrict/);
});

test("horse operator listener maps Airtable fields into Catalyst without dropping ignore", () => {
  const followed = __test__.mapAirtableHorseOperatorRecord({
    id: "recFollow",
    fields: {
      horse_name: "HERMES D'ARMANVILLE",
      barn_name: "Hermes",
      horse_aka: "Hermes Darmanville",
      active: true,
      follow: true,
      status: "active"
    }
  }, "2026-07-11T02:00:00.000Z");
  const ignored = __test__.mapAirtableHorseOperatorRecord({
    id: "recIgnore",
    fields: {
      horse_name: "DF CRUSH",
      follow: true,
      sync_action: "ignore"
    }
  }, "2026-07-11T02:00:00.000Z");

  assert.equal(followed.horse_key, "hermes d'armanville");
  assert.equal(followed.barn_name, "Hermes");
  assert.equal(followed.horse_aka, "Hermes Darmanville");
  assert.equal(followed.follow, true);
  assert.equal(ignored.active, false);
  assert.equal(ignored.follow, false);
  assert.equal(ignored.status, "ignore");
});

test("horse operator listener plans only changed Catalyst rows", () => {
  const sourceRows = [{
    horse_key: "hermes",
    horse: "HERMES",
    horse_name: "HERMES",
    barn_name: "Hermes",
    horse_display: "Hermes",
    active: true,
    follow: true,
    status: "active",
    sync_action: "add",
    rec_id: "recHermes",
    last_synced_at: "2026-07-11 02:00:00"
  }, {
    horse_key: "crush",
    horse: "CRUSH",
    horse_name: "CRUSH",
    barn_name: "Crush",
    horse_display: "Crush",
    active: true,
    follow: false,
    status: "active",
    sync_action: "add",
    rec_id: "recCrush",
    last_synced_at: "2026-07-11 02:00:00"
  }];
  const catalystRows = [{
    ROWID: "1",
    ...sourceRows[0],
    follow: false,
    last_synced_at: "2026-07-05 03:00:00"
  }, {
    ROWID: "2",
    ...sourceRows[1],
    last_synced_at: "2026-07-05 03:00:00"
  }];

  const first = __test__.planHorseHelperCatalystChanges(sourceRows, catalystRows);
  assert.equal(first.inserts.length, 0);
  assert.equal(first.updates.length, 1);
  assert.equal(first.updates[0].ROWID, "1");
  assert.equal(first.unchanged, 1);

  const afterFirst = catalystRows.map((row) => row.ROWID === "1" ? { ...row, ...first.updates[0] } : row);
  const second = __test__.planHorseHelperCatalystChanges(sourceRows, afterFirst);
  assert.equal(second.inserts.length, 0);
  assert.equal(second.updates.length, 0);
  assert.equal(second.unchanged, 2);
});

test("horse operator listener is Airtable to Catalyst only", () => {
  const source = require("node:fs").readFileSync(__filename.replace(/index\.test\.js$/, "index.js"), "utf8");
  const block = sourceBlock(
    source,
    "async function syncAirtableHorseOperatorsToCatalyst",
    "async function syncOneHelperTable"
  );

  assert.match(block, /airtableListRecords\("hs_horses"/);
  assert.match(block, /TABLES\.horses/);
  assert.doesNotMatch(block, /airtableUpsert|airtableUpdate|airtableCreate|ensureAirtableHelperMirrorTable/);
});

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

test("helper search normalizes Catalyst Search table results", () => {
  const groups = __test__.normalizeCatalystSearchGroups({
    content: {
      hs_horses: [{
        ROWID: "horse-row-1",
        horse_key: "hermes d'armanville",
        horse_name: "Hermes D'armanville",
        barn_name: "Hermes",
        active: true,
        follow: true,
        status: "active"
      }]
    }
  }, [__test__.HELPER_SEARCH_CONFIGS.horses]);

  assert.equal(groups.hs_horses.length, 1);
  const match = __test__.helperSearchRow(__test__.HELPER_SEARCH_CONFIGS.horses, groups.hs_horses[0], "Hermes");
  assert.equal(match.entity_type, "horse");
  assert.equal(match.matched_field, "barn_name");
});

test("helper search builds Catalyst Search indexed-column config", () => {
  const columns = __test__.helperSearchColumnMap([
    __test__.HELPER_SEARCH_CONFIGS.horses,
    __test__.HELPER_SEARCH_CONFIGS.riders
  ]);

  assert.deepEqual(columns.hs_horses, __test__.HELPER_SEARCH_CONFIGS.horses.searchable_fields);
  assert.deepEqual(columns.hs_riders, __test__.HELPER_SEARCH_CONFIGS.riders.searchable_fields);
});

test("horse helper search ignores related rider or trainer fields in Horse mode", () => {
  const config = __test__.HELPER_SEARCH_CONFIGS.horses;
  const relatedOnly = __test__.helperSearchRow(config, {
    horse_name: "Accelerator",
    rider_name: "Fabian Herrera",
    active: true,
    follow: false
  }, "her");
  const horsePrefix = __test__.helperSearchRow(config, {
    horse_name: "Hermes D'armanville",
    barn_name: "Hermes",
    rider_name: "Tanner Korotkin",
    trainer_name: "Alan Korotkin",
    active: true,
    follow: false
  }, "her");

  assert.equal(relatedOnly, null);
  assert.equal(horsePrefix.matched_field, "barn_name");
  assert.equal(horsePrefix.match_type, "prefix");
  assert.equal(horsePrefix.score, 160);
});

test("helper search ranking falls back to contains only when no exact or prefix matches exist", () => {
  const config = __test__.HELPER_SEARCH_CONFIGS.horses;
  const matches = __test__.helperSearchRankedMatches(config, [{
    horse_name: "Comme Il Hero Z"
  }, {
    horse_name: "Hermes D'armanville",
    barn_name: "Hermes"
  }], "her", 10);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].display_name, "Hermes");
  assert.equal(matches[0].match_type, "prefix");
});

test("horse helper ranking prioritizes barn-name prefix over legal horse-name prefix", () => {
  const config = __test__.HELPER_SEARCH_CONFIGS.horses;
  const matches = __test__.helperSearchRankedMatches(config, [{
    horse_name: "Macabu"
  }, {
    horse_name: "Forte",
    barn_name: "Macho"
  }], "Mac", 10);

  assert.equal(matches[0].display_name, "Macho");
  assert.equal(matches[0].matched_field, "barn_name");
  assert.ok(matches[0].score > matches[1].score);
});

test("helper search classifies barn-name horse queries without requiring Step 3 eligibility", () => {
  const match = __test__.helperSearchRow(__test__.HELPER_SEARCH_CONFIGS.horses, {
    ROWID: "horse-row-1",
    rec_id: "recHorse1",
    horse_key: "hermes d'armanville",
    horse_name: "Hermes D'armanville",
    barn_name: "Hermes",
    horse_display: "Hermes",
    horse_aka: "Hermes Darmanville",
    active: true,
    follow: false,
    status: "active"
  }, "Hermes");

  assert.equal(match.entity_type, "horse");
  assert.equal(match.display_name, "Hermes");
  assert.equal(match.helper_key, "hermes d'armanville");
  assert.equal(match.matched_field, "barn_name");
  assert.equal(match.matched_value, "Hermes");
  assert.equal(match.match_type, "exact");
  assert.equal(match.eligible_for_step3, false);
});

test("helper search marks horse and trainer rows eligible only from explicit follow or allowed flags", () => {
  const horse = __test__.helperSearchRow(__test__.HELPER_SEARCH_CONFIGS.horses, {
    horse_key: "hermes d'armanville",
    horse_name: "Hermes D'armanville",
    barn_name: "Hermes",
    active: true,
    follow: true,
    status: "active"
  }, "Hermes");
  const trainer = __test__.helperSearchRow(__test__.HELPER_SEARCH_CONFIGS.trainers, {
    trainer_key: "alan korotkin",
    trainer_name: "Alan Korotkin",
    first_name: "Alan",
    active: true,
    allowed: true,
    status: "active"
  }, "Alan");
  const rider = __test__.helperSearchRow(__test__.HELPER_SEARCH_CONFIGS.riders, {
    rider_key: "lainey posa",
    rider_name: "Lainey Posa",
    team_name: "Lainey",
    active: true,
    follow: false,
    status: "active"
  }, "Lainey");

  assert.equal(horse.eligible_for_step3, true);
  assert.equal(trainer.eligible_for_step3, true);
  assert.equal(rider.entity_type, "rider");
  assert.equal(rider.eligible_for_step3, false);
});

test("operator helper search can report a known horse missing from current-day mapping", () => {
  const match = __test__.helperSearchRow(__test__.HELPER_SEARCH_CONFIGS.horses, {
    horse_key: "hermes d'armanville",
    horse_name: "Hermes D'armanville",
    barn_name: "Hermes",
    active: true,
    follow: false,
    status: "active"
  }, "Hermes");

  const hydrated = __test__.hydrateHelperSearchMatchFromRows(match, {
    showNo: "14909",
    focusDay: "2026-07-04",
    classOogRows: [],
    entryGoRows: [],
    classStartRows: []
  });

  assert.equal(hydrated.entity_type, "horse");
  assert.equal(hydrated.entity_key, "hermes d'armanville");
  assert.equal(hydrated.current_mapping_status, "known_entity_missing_from_current_mapping");
  assert.equal(hydrated.current_day_appearance_count, 0);
});

test("operator helper search hydrates a known horse into current-day class context when mapped", () => {
  const match = __test__.helperSearchRow(__test__.HELPER_SEARCH_CONFIGS.horses, {
    horse_key: "hermes d'armanville",
    horse_name: "Hermes D'armanville",
    barn_name: "Hermes",
    active: true,
    follow: false,
    status: "active"
  }, "Hermes");

  const hydrated = __test__.hydrateHelperSearchMatchFromRows(match, {
    showNo: "14909",
    focusDay: "2026-07-04",
    classOogRows: [{
      show_no: "14909",
      focus_day: "2026-07-04",
      ring_name_normalized: "grand",
      ring_visual_key: "640|grand",
      class_visual_key: "grand|26964",
      entry_visual_key: "grand|26964|274",
      class_no: "26964",
      entry_no: "274",
      entry_order: "29",
      horse: "Hermes D'armanville",
      rider: "Tanner Korotkin",
      trainer: "Alan Korotkin"
    }],
    entryGoRows: [],
    classStartRows: [{
      show_no: "14909",
      focus_day: "2026-07-04",
      ring_name_normalized: "grand",
      ring_visual_key: "640|grand",
      class_visual_key: "grand|26964",
      class_no: "26964",
      class_name: "FEI $85,000 Budweiser 1.45m CSI2* Grand Prix",
      class_start_time: "19:30:00",
      display_time: "7:30 PM"
    }]
  });

  assert.equal(hydrated.current_mapping_status, "mapped_current_focus");
  assert.equal(hydrated.current_day_appearance_count, 1);
  assert.equal(hydrated.appearances[0].class_no, 26964);
  assert.equal(hydrated.appearances[0].entry_no, 274);
  assert.equal(hydrated.appearances[0].class_name, "FEI $85,000 Budweiser 1.45m CSI2* Grand Prix");
});

test("operator helper search dedupes the same class appearance across class_oog and entry_go_times", () => {
  const match = __test__.helperSearchRow(__test__.HELPER_SEARCH_CONFIGS.horses, {
    horse_key: "hermes d'armanville",
    horse_name: "Hermes D'armanville",
    barn_name: "Hermes",
    active: true,
    follow: false,
    status: "active"
  }, "Hermes");
  const row = {
    show_no: "14909",
    focus_day: "2026-07-04",
    ring_name_normalized: "grand",
    ring_visual_key: "640|grand",
    class_visual_key: "grand|26964",
    entry_visual_key: "grand|26964|274",
    class_no: "26964",
    entry_no: "274",
    entry_order: "29",
    horse: "Hermes D'armanville",
    rider: "Tanner Korotkin",
    trainer: "Alan Korotkin"
  };

  const hydrated = __test__.hydrateHelperSearchMatchFromRows(match, {
    showNo: "14909",
    focusDay: "2026-07-04",
    classOogRows: [row],
    entryGoRows: [{ ...row, go_time: "20:02:00", live_source: "source_derived_pace.step5_live_enrichment" }],
    classStartRows: [{ class_visual_key: "grand|26964", class_no: "26964", class_start_time: "19:30:00" }]
  });

  assert.equal(hydrated.current_day_appearance_count, 1);
  assert.deepEqual(hydrated.appearances[0].source_tables, ["hs_class_oog", "hs_entry_go_times"]);
  assert.equal(hydrated.appearances[0].go_time, "20:02:00");
});

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
      barn_name_missing: true
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
      barn_name_missing: true
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

test("go-time display metadata distinguishes estimated rows from source-derived rows", () => {
  assert.deepEqual(__test__.goTimeDisplayMeta({
    go_time: "10:04:30",
    live_source: "estimated_schedule_pace.clean_step4_runtime"
  }), {
    label: "Estimated go time",
    source: "estimate"
  });
  assert.deepEqual(__test__.goTimeDisplayMeta({
    go_time: "10:04:30",
    live_source: "source_derived_pace.get_rings"
  }), {
    label: "Source-derived go time",
    source: "source_derived_pace"
  });
});

test("live ring-status history appends nothing when tracked state is unchanged", () => {
  const key = "14910|20260710|4208|710";
  const plan = __test__.planAirtableRingStatusChanges([{
    ring_status_key: key,
    show_no: "14910",
    focus_day: "2026-07-10",
    ring_no: "710",
    current_class_no: "711",
    status: "running",
    is_live: "true",
    n_gone: "5",
    n_to_go: "11",
    elapsed_seconds: "180",
    last_live_synced_at: "2026-07-10 13:30:38"
  }], [{
    id: "recNewest",
    createdTime: "2026-07-10T02:48:54.000Z",
    fields: { ring_status_key: key, status: "active" }
  }, {
    id: "recLatestObserved",
    createdTime: "2026-07-10T02:19:07.000Z",
    fields: {
      ring_status_key: key,
      current_class_no: 711,
      status: "running",
      is_live: "true",
      n_gone: 5,
      n_to_go: 11,
      elapsed_seconds: "120",
      last_live_synced_at: "2026-07-10 13:24:38"
    }
  }], {
    runId: "wec-step5-unchanged",
    observedAt: "2026-07-10 13:30:38"
  });

  assert.deepEqual(plan.creates, []);
  assert.deepEqual(plan.unchanged, [key]);
});

test("live ring-status history appends one complete five-field change", () => {
  const key = "14910|20260710|4208|710";
  const plan = __test__.planAirtableRingStatusChanges([{
    ring_status_key: key,
    show_no: "14910",
    focus_day: "2026-07-10",
    ring_day_no: "4208",
    ring_no: "710",
    current_class_no: "712",
    status: "running",
    is_live: "true",
    n_gone: "5",
    n_to_go: "11",
    elapsed_seconds: "180",
    live_source: "hs_get_rings.step5_live_enrichment",
    last_live_synced_at: "2026-07-10 13:30:38"
  }], [{
    id: "recPrior",
    createdTime: "2026-07-10T13:24:38.000Z",
    fields: {
      ring_status_key: key,
      current_class_no: 711,
      status: "waiting",
      is_live: "false",
      n_gone: 4,
      n_to_go: 12,
      last_live_synced_at: "2026-07-10 13:24:38"
    }
  }], {
    runId: "wec-step5-change",
    observedAt: "2026-07-10 13:30:38"
  });

  assert.equal(plan.creates.length, 1);
  assert.equal(plan.creates[0].ring_status_key, key);
  assert.equal(plan.creates[0].run_id, "wec-step5-change");
  assert.equal(plan.creates[0].changed_fields, "current_class_no,status,is_live,n_gone,n_to_go");
  assert.deepEqual(JSON.parse(plan.creates[0].previous_values), {
    current_class_no: 711,
    status: "waiting",
    is_live: false,
    n_gone: 4,
    n_to_go: 12
  });
});

test("live ring-status history appends an initial state when no prior ring exists", () => {
  const key = "14910|20260710|4213|708";
  const plan = __test__.planAirtableRingStatusChanges([{
    ring_status_key: key,
    current_class_no: "31617",
    status: "active",
    is_live: "true",
    n_gone: "13",
    n_to_go: "20"
  }], [], {
    runId: "wec-step5-initial",
    observedAt: "2026-07-10 13:30:38"
  });

  assert.equal(plan.creates.length, 1);
  assert.equal(plan.creates[0].changed_fields, "current_class_no,status,is_live,n_gone,n_to_go");
  assert.deepEqual(JSON.parse(plan.creates[0].previous_values), {});
});

test("print layout does not prefer the retired Airtable ring_groups path", () => {
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "index.js"), "utf8");
  const branch = source.slice(source.indexOf('if (action === "wec-print-layout")'), source.indexOf('if (action === "wec-print-pdf-url")'));
  assert.doesNotMatch(branch, /getAirtablePrintLayout/);
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

function scheduleUiFixtureRows() {
  const rows = [{
    show_no: "14910",
    focus_day: "2026-07-12",
    ring_no: "740",
    ring_day_no: "4218",
    ring_name: "JUMPER ANNEX - Gary",
    ring_name_prioritized: "JUMPER ANNEX - Gary",
    ring_name_normalized: "annex",
    ring_const_key: "14910|20260712|4218|740",
    ring_visual_key: "14910|20260712|4218|740",
    class_no: "35348",
    class_number: 0,
    class_name: "812b) $750 1.05m Amateur Classic II.2b",
    class_label: "0 - 812b) $750 1.05m Amateur Classic II.2b",
    class_const_key: "14910|20260712|4218|740|35348",
    class_start_time: "11:30:00",
    display_time: "11:30 AM",
    class_status: "soon",
    starts_in_mins: 28,
    ends_in_mins: 61,
    estimated_class_end_time: "12:31:00",
    pace_seconds: 198,
    entry_count: 10,
    entry_count_now: 12,
    n_gone: 2,
    n_to_go: 10,
    is_live: false,
    tags: "starts_in_60,starts_in_30",
    entry_go_times: [{
      entry_no: "2460",
      entry_order: "8",
      entry_const_key: "14910|20260712|4218|740|35348|2460",
      entry_visual_key: "14910|20260712|4218|740|35348|2460",
      horse: "Dany Villers",
      barn_name: "Dany",
      rider: "Lainey Posa",
      trainer: "Alan Korotkin",
      entry_status: "soon",
      entry_go_time: "11:56:24",
      entry_go_time_now: "11:52:00",
      go_in_mins: 22,
      entries_ahead: 6,
      entry_order_now: 2,
      pace_seconds: 198,
      tags: "go_in_40,entry_10_away"
    }, {
      entry_no: "2460",
      entry_order: "8",
      entry_const_key: "14910|20260712|4218|740|35348|2460",
      entry_visual_key: "14910|20260712|4218|740|35348|2460",
      horse: "Dany Villers",
      barn_name: "Dany",
      rider: "Lainey Posa",
      trainer: "Alan Korotkin"
    }]
  }];
  rows.runtime_ring_status_rows = [{
    show_no: "14910",
    focus_day: "2026-07-12",
    ring_no: "740",
    ring_day_no: "4218",
    ring_name: "JUMPER ANNEX - Gary",
    ring_name_prioritized: "JUMPER ANNEX - Gary",
    ring_name_normalized: "annex",
    ring_const_key: "14910|20260712|4218|740",
    ring_status_key: "14910|20260712|4218|740",
    ring_status: "now",
    now: "35348",
    next: "35351",
    late_mins: 18,
    ends_in_mins: 61,
    estimated_pace_now: 198,
    entry_count_now: 12,
    n_gone: 2,
    n_to_go: 10,
    is_live: true,
    tags: "late15"
  }];
  return rows;
}

test("schedule UI overview exposes stable schedule identities without drawer entries", () => {
  const payload = __test__.buildScheduleUiOverviewPayload(
    "14910",
    "2026-07-12",
    { title: "WEC", showStartDate: "2026-07-07", showEndDate: "2026-07-12" },
    scheduleUiFixtureRows(),
    [{
      trigger_key: "ring-late-15",
      trigger_type: "ring_late_15",
      level: "ring",
      ring_const_key: "14910|20260712|4218|740",
      trigger_time: "2026-07-12 15:00:00"
    }],
    [],
    "2026-07-12T15:01:00.000Z"
  );

  assert.equal(payload.view, "overview");
  assert.equal(payload.show.showNo, "14910");
  assert.equal(payload.rows.length, 1);
  assert.equal(payload.rows[0].rowKey, "14910|20260712|4218|740|35348");
  assert.equal(payload.rows[0].classNumber, "812b");
  assert.equal(payload.rows[0].className, "$750 1.05m Amateur Classic II.2b");
  assert.equal(payload.rows[0].entryCount, 12);
  assert.equal(payload.rows[0].entryState, "rss-is-hydrated");
  assert.equal(payload.rows[0].entryRollups.length, 1);
  assert.equal(payload.rows[0].entryRollups[0].entries[0].entryDayKey, "14910|20260712|2460");
  assert.equal(Object.hasOwn(payload.rows[0], "entries"), false);
  assert.equal(payload.resources.ring_list.view, "ring_list");
});

test("schedule UI dense view joins and deduplicates all five lanes for one class", () => {
  const rowKey = "14910|20260712|4218|740|35348";
  const payload = __test__.buildScheduleUiDensePayload(
    "14910",
    "2026-07-12",
    { title: "WEC", showStartDate: "2026-07-07", showEndDate: "2026-07-12" },
    scheduleUiFixtureRows(),
    [{
      trigger_key: "class-30",
      trigger_type: "class_start_30",
      level: "class",
      class_const_key: rowKey,
      class_no: "35348",
      trigger_time: "2026-07-12 15:02:00"
    }, {
      trigger_key: "entry-10-away",
      trigger_type: "entry_10_away",
      level: "entry",
      class_const_key: rowKey,
      entry_const_key: `${rowKey}|2460`,
      class_no: "35348",
      entry_no: "2460",
      trigger_time: "2026-07-12 15:03:00"
    }],
    [{
      rider_result_key: `${rowKey}|2460`,
      show_no: "14910",
      focus_day: "2026-07-12",
      class_no: "35348",
      entry_no: "2460",
      horse: "Dany Villers",
      rider: "Lainey Posa",
      result_status: "placed",
      place: "2",
      score: "84",
      result_time: "72.14",
      result_source: "rider_results"
    }],
    rowKey,
    "2026-07-12T15:04:00.000Z"
  );

  assert.equal(payload.view, "dense");
  assert.equal(payload.rowKey, rowKey);
  assert.equal(payload.ringwise.length, 1);
  assert.equal(payload.classwise.length, 1);
  assert.equal(payload.entrywise.length, 1);
  assert.equal(payload.entrywise[0].entryKey, `${rowKey}|2460`);
  assert.equal(payload.entrywise[0].entryGoTimeNow, "11:52:00");
  assert.equal(payload.entrywise[0].goInMins, 22);
  assert.deepEqual(payload.entrywise[0].tags, ["go_in_40", "entry_10_away"]);
  assert.deepEqual(payload.ringwise[0].triggerTypes, []);
  assert.deepEqual(payload.classwise[0].triggerTypes, ["class_start_30"]);
  assert.deepEqual(payload.entrywise[0].triggerTypes, ["entry_10_away"]);
  assert.equal(payload.riderwise.length, 1);
  assert.equal(payload.riderwise[0].place, "2");
  assert.equal(payload.riderwise[0].finishedTime, "72.14");
  assert.deepEqual(payload.timewise.map((event) => event.triggerType), ["class_start_30", "entry_10_away"]);
});

test("schedule UI entity views expose list and detail contracts", () => {
  const rows = scheduleUiFixtureRows();
  const rowKey = "14910|20260712|4218|740|35348";
  const entryDayKey = "14910|20260712|2460";
  const events = [{
    trigger_key: "ring-late-15",
    trigger_type: "ring_late_15",
    level: "ring",
    ring_const_key: "14910|20260712|4218|740",
    trigger_time: "2026-07-12 15:00:00"
  }, {
    trigger_key: "entry-10-away",
    trigger_type: "entry_10_away",
    level: "entry",
    ring_const_key: "14910|20260712|4218|740",
    class_const_key: rowKey,
    entry_const_key: `${rowKey}|2460`,
    class_no: "35348",
    entry_no: "2460",
    trigger_time: "2026-07-12 15:03:00"
  }];
  const results = [{
    rider_result_key: `${rowKey}|2460`,
    show_no: "14910",
    focus_day: "2026-07-12",
    class_no: "35348",
    entry_no: "2460",
    horse: "Dany Villers",
    rider: "Lainey Posa",
    result_status: "placed",
    place: "2",
    score: "84",
    result_time: "72.14"
  }];
  const context = ["14910", "2026-07-12", { title: "WEC" }, rows, events, results, "2026-07-12T15:04:00.000Z"];

  const classList = __test__.buildScheduleUiEntityPayload("class_list", ...context, {});
  assert.equal(classList.rows.length, 1);
  assert.equal(classList.rows[0].rowKey, rowKey);
  assert.equal(classList.rows[0].entryRollups.length, 1);

  const classDetail = __test__.buildScheduleUiEntityPayload("class_detail", ...context, { rowKey });
  assert.equal(classDetail.rowKey, rowKey);
  assert.equal(classDetail.entries.length, 1);

  const entryList = __test__.buildScheduleUiEntityPayload("entry_list", ...context, {});
  assert.equal(entryList.rows.length, 1);
  assert.equal(entryList.rows[0].entryDayKey, entryDayKey);
  assert.equal(entryList.rows[0].classCount, 1);

  const entryDetail = __test__.buildScheduleUiEntityPayload("entry_detail", ...context, { entryDayKey });
  assert.equal(entryDetail.entryDayKey, entryDayKey);
  assert.equal(entryDetail.classes.length, 1);
  assert.equal(entryDetail.classes[0].result.place, "2");
  assert.deepEqual(entryDetail.classes[0].timewise.map((event) => event.triggerType), ["entry_10_away"]);

  const ringList = __test__.buildScheduleUiEntityPayload("ring_list", ...context, {});
  assert.equal(ringList.rows[0].ringKey, "14910|20260712|4218|740");
  const ringDetail = __test__.buildScheduleUiEntityPayload("ring_detail", ...context, { ringKey: "14910|20260712|4218|740" });
  assert.equal(ringDetail.classes.length, 1);

  const resultsList = __test__.buildScheduleUiEntityPayload("results_list", ...context, {});
  assert.equal(resultsList.rows[0].resultKey, `${rowKey}|2460`);
  const resultDetail = __test__.buildScheduleUiEntityPayload("result_detail", ...context, { resultKey: `${rowKey}|2460` });
  assert.equal(resultDetail.result.place, "2");

  const alertsList = __test__.buildScheduleUiEntityPayload("alerts_list", ...context, {});
  assert.equal(alertsList.rows.length, 2);
  assert.equal(alertsList.lanes.ring.length, 1);
  assert.equal(alertsList.lanes.entry.length, 1);
  assert.deepEqual(Object.keys(alertsList.lanes), ["ring", "class", "entry", "rider"]);
  const alertDetail = __test__.buildScheduleUiEntityPayload("alert_detail", ...context, { triggerKey: "entry-10-away" });
  assert.equal(alertDetail.alert.triggerType, "entry_10_away");
  assert.equal(alertDetail.entity.entryDayKey, entryDayKey);
});

test("Task 05 accepts snapshot-delta pace only from 105 through 285 seconds", () => {
  const pace = __test__.boundedSnapshotDeltaPaceSeconds;
  const prior = { class_no: 10, n_gone: 3, timestamp_value: 1_000 };

  assert.equal(pace({ class_no: 10, n_gone: 4, timestamp_value: 1_104 }, prior), null);
  assert.equal(pace({ class_no: 10, n_gone: 4, timestamp_value: 1_105 }, prior), 105);
  assert.equal(pace({ class_no: 10, n_gone: 5, timestamp_value: 1_570 }, prior), 285);
  assert.equal(pace({ class_no: 10, n_gone: 4, timestamp_value: 1_286 }, prior), null);
  assert.equal(pace({ class_no: 11, n_gone: 4, timestamp_value: 1_200 }, prior), null);
  assert.equal(pace({ class_no: 10, n_gone: 3, timestamp_value: 1_200 }, prior), null);
});

test("Task 05 recognizes explicit not-live source rows and defaults current class rows live", () => {
  assert.equal(__test__.step5SourceIsLive({ class_no: 10, status_type: "not_live" }), false);
  assert.equal(__test__.step5SourceIsLive({ class_no: 10, live_flag: false }), false);
  assert.equal(__test__.step5SourceIsLive({ class_no: 10 }), true);
  assert.equal(__test__.step5SourceIsLive({}), false);
});

test("Task 05 freezes the first observed class start", () => {
  const first = __test__.frozenLiveStartedAt({}, true, "2026-07-12 12:24:39");
  const second = __test__.frozenLiveStartedAt({ live_started_at: first }, true, "2026-07-12 12:30:40");

  assert.equal(first, "2026-07-12 12:24:39");
  assert.equal(second, first);
  assert.equal(__test__.frozenLiveStartedAt({}, false, "2026-07-12 12:30:40"), null);
});

test("Task 05 absorbs the scheduled gap before reporting ring lateness", () => {
  assert.deepEqual(__test__.step5RingTimingProjection({
    observedTime: "12:30:00",
    paceSeconds: 180,
    nToGo: 5,
    nextClassStartTime: "12:50:00"
  }), {
    estimated_end_time: "12:45:00",
    running_late_mins: 0,
    available_slack_mins: 5
  });
  assert.deepEqual(__test__.step5RingTimingProjection({
    observedTime: "12:30:00",
    paceSeconds: 180,
    nToGo: 10,
    nextClassStartTime: "12:50:00"
  }), {
    estimated_end_time: "13:00:00",
    running_late_mins: 10,
    available_slack_mins: 0
  });
});

test("Task 05 derives current entry position and go time without replacing prepared go_time", () => {
  assert.deepEqual(__test__.step5EntryTimingProjection({
    entryOrder: 8,
    nGone: 2,
    currentEntryNo: 200,
    entryNo: 2460,
    observedTime: "12:30:00",
    paceSeconds: 180
  }), {
    entry_order_now: 6,
    entries_ahead: 5,
    entry_go_time_now: "12:45:00"
  });
  assert.deepEqual(__test__.step5EntryTimingProjection({
    entryOrder: 8,
    nGone: 2,
    currentEntryNo: 2460,
    entryNo: 2460,
    observedTime: "12:30:00",
    paceSeconds: 180
  }), {
    entry_order_now: 1,
    entries_ahead: 0,
    entry_go_time_now: "12:30:00"
  });
  assert.deepEqual(__test__.step5EntryTimingProjection({
    entryOrder: 8,
    nGone: 2,
    currentEntryNo: 200,
    entryNo: 2460,
    observedTime: "12:30:00",
    paceSeconds: null
  }), {
    entry_order_now: 6,
    entries_ahead: 5,
    entry_go_time_now: null
  });
});

test("Task 05 ring change log planner emits no event for an unchanged signature", () => {
  const current = [{
    ring_status_key: "14910|20260712|4218|740",
    show_no: 14910,
    focus_day: "2026-07-12",
    ring_day_no: 4218,
    ring_no: 740,
    current_class_no: 35348,
    status: "active",
    is_live: true,
    n_gone: 8,
    n_to_go: 1
  }];
  const signature = __test__.ringStateSignature(current[0]);
  const unchanged = __test__.planCatalystRingChangeLogs(current, [{
    ring_status_key: current[0].ring_status_key,
    state_signature: signature,
    observed_at: "2026-07-12 12:24:39"
  }], { runId: "scheduled-2", observedAt: "2026-07-12 12:30:40" });
  const changed = __test__.planCatalystRingChangeLogs([{ ...current[0], n_gone: 9, n_to_go: 0 }], [{
    ring_status_key: current[0].ring_status_key,
    state_signature: signature,
    current_values: JSON.stringify(current[0]),
    observed_at: "2026-07-12 12:24:39"
  }], { runId: "scheduled-3", observedAt: "2026-07-12 12:36:40" });

  assert.equal(unchanged.creates.length, 0);
  assert.equal(unchanged.unchanged.length, 1);
  assert.equal(changed.creates.length, 1);
  assert.equal(changed.creates[0].changed_fields, "n_gone,n_to_go");
});

test("Task 05 converts a valid scheduler ISO timestamp to a Date", () => {
  const value = "2026-07-12T16:48:51.000Z";
  const converted = __test__.task05SchedulerDate(value);

  assert.equal(converted instanceof Date, true);
  assert.equal(converted.toISOString(), value);
});

test("Task 05 rejects an invalid scheduler timestamp explicitly", () => {
  assert.throws(
    () => __test__.task05SchedulerDate("not-a-scheduler-timestamp"),
    /TASK_05_INVALID_SCHEDULER_TIMESTAMP: not-a-scheduler-timestamp/
  );
});
