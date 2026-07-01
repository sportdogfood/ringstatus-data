function truthy(value) {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    return ["true", "1", "yes", "checked"].includes(value.trim().toLowerCase());
  }
  return false;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function classNumberFromLabel(label) {
  const match = String(label || "").trim().match(/^(\d+)\)/);
  return match ? Number(match[1]) : null;
}

function classNameFromLabel(label) {
  const text = String(label || "").trim();
  const match = text.match(/^\d+\)\s*(.+)$/);
  return match ? match[1].trim() : text;
}

function parseTimeParts(value) {
  const raw = String(value || "").trim();
  if (!raw || /^check\s*time$/i.test(raw)) return null;

  const hhmmss = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hhmmss) {
    const hour = Number(hhmmss[1]);
    const minute = Number(hhmmss[2]);
    const second = Number(hhmmss[3] || 0);
    if (hour <= 23 && minute <= 59 && second <= 59) return { hour, minute, second };
  }

  const ampm = raw.toUpperCase().replace(/\s+/g, "").replace(/\./g, "");
  const match = ampm.match(/^(\d{1,2})(?::?(\d{2}))?(AM|PM|A|P)$/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const suffix = match[3][0];
  if (hour < 1 || hour > 12 || minute > 59) return null;
  if (suffix === "A" && hour === 12) hour = 0;
  if (suffix === "P" && hour !== 12) hour += 12;
  return { hour, minute, second: 0 };
}

function normalizeTime(value) {
  const parts = parseTimeParts(value);
  if (!parts) return "";
  return [
    String(parts.hour).padStart(2, "0"),
    String(parts.minute).padStart(2, "0"),
    String(parts.second).padStart(2, "0")
  ].join(":");
}

function displayTime(value) {
  const parts = parseTimeParts(value);
  if (!parts) return "check time";
  const suffix = parts.hour >= 12 ? "P" : "A";
  let hour = parts.hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${String(parts.minute).padStart(2, "0")}${suffix}`;
}

function classStartKey(row) {
  const showNo = numberOrNull(row.show_no);
  const ringDayNo = numberOrNull(row.ring_day_no);
  const ringNo = numberOrNull(row.ring_no);
  const eventId = numberOrNull(row.event_id);
  const classNo = numberOrNull(row.class_no);
  return [showNo, ringDayNo, ringNo, eventId, classNo].join("|");
}

function buildClassStartRows(stagingRows) {
  return stagingRows
    .filter((row) => truthy(row.full_lock))
    .filter((row) => Number(numberOrNull(row.class_no)) > 0)
    .map((row) => {
      const label = row.class_name || row.event_name || row.class_label || "";
      const startTime = normalizeTime(row.time_text || row.time || row.class_start_time);
      const classNumber = numberOrNull(row.class_number) || classNumberFromLabel(label);
      return {
        record_id: row.record_id,
        class_start_key: row.staging_key || classStartKey(row),
        show_no: numberOrNull(row.show_no),
        focus_day: row.focus_day || row.iso_date || row.focus_date,
        ring_day_no: numberOrNull(row.ring_day_no),
        ring_no: numberOrNull(row.ring_no),
        ring_name: row.ring_name || row.ring || "",
        event_id: numberOrNull(row.event_id),
        class_no: numberOrNull(row.class_no),
        class_number: classNumber,
        class_name: classNameFromLabel(label),
        class_start_time: startTime,
        display_time: startTime ? displayTime(startTime) : "check time",
        entry_count: numberOrNull(row.entry_count),
        source: "update_schedule_staging.lock",
        status: startTime ? "upcoming" : "check_time"
      };
    });
}

function sameScope(orderRow, classStart) {
  return String(orderRow.show_no) === String(classStart.show_no)
    && String(orderRow.focus_day || "") === String(classStart.focus_day || "")
    && String(orderRow.ring_day_no || "") === String(classStart.ring_day_no || "")
    && String(orderRow.ring_no || "") === String(classStart.ring_no || "");
}

function matchGetOrdersToClassStart(orderRows, classStarts) {
  const byClassNo = new Map();
  const byClassNumber = new Map();

  for (const row of classStarts) {
    const classNo = numberOrNull(row.class_no);
    if (classNo) byClassNo.set(`${row.show_no}|${row.focus_day}|${classNo}`, row);
    const classNumber = numberOrNull(row.class_number);
    if (classNumber) {
      byClassNumber.set(`${row.show_no}|${row.focus_day}|${row.ring_day_no}|${row.ring_no}|${classNumber}`, row);
    }
  }

  return orderRows
    .map((order) => {
      const classNo = numberOrNull(order.class_no);
      let target = classNo ? byClassNo.get(`${order.show_no}|${order.focus_day}|${classNo}`) : null;
      const classNumber = numberOrNull(order.class_number);
      if (!target && classNumber) {
        target = byClassNumber.get(`${order.show_no}|${order.focus_day}|${order.ring_day_no}|${order.ring_no}|${classNumber}`);
      }
      if (!target || !sameScope(order, target)) return null;
      return {
        class_start_key: target.class_start_key,
        order,
        updates: {
          n_gone: numberOrNull(order.n_gone),
          n_to_go: numberOrNull(order.n_to_go),
          total: numberOrNull(order.total),
          elapsed_seconds: numberOrNull(order.elapsed),
          source_timestamp: numberOrNull(order.timestamp),
          live_source: "get_orders"
        }
      };
    })
    .filter(Boolean);
}

function matchGetRingsToClassStart(ringRows, classStarts) {
  const byClassNo = new Map();
  const byClassNumber = new Map();

  for (const row of classStarts) {
    const classNo = numberOrNull(row.class_no);
    if (classNo) byClassNo.set(`${row.show_no}|${row.focus_day}|${classNo}`, row);
    const classNumber = numberOrNull(row.class_number);
    if (classNumber) {
      byClassNumber.set(`${row.show_no}|${row.focus_day}|${row.ring_day_no}|${row.ring_no}|${classNumber}`, row);
    }
  }

  return ringRows
    .map((ring) => {
      const classNo = numberOrNull(ring.class_no);
      let target = classNo ? byClassNo.get(`${ring.show_no}|${ring.focus_day}|${classNo}`) : null;
      const classNumber = numberOrNull(ring.class_number);
      if (!target && classNumber) {
        target = byClassNumber.get(`${ring.show_no}|${ring.focus_day}|${ring.ring_day_no}|${ring.ring_no}|${classNumber}`);
      }
      if (!target || !sameScope(ring, target)) return null;
      return {
        class_start_key: target.class_start_key,
        ring,
        updates: {
          n_gone: numberOrNull(ring.n_gone),
          n_to_go: numberOrNull(ring.n_to_go),
          total: numberOrNull(ring.total),
          elapsed_seconds: numberOrNull(ring.elapsed),
          source_timestamp: numberOrNull(ring.timestamp),
          live_source: "get_rings"
        }
      };
    })
    .filter(Boolean);
}

function easternParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    minutes: Number(map.hour) * 60 + Number(map.minute)
  };
}

function timeMinutes(timeValue) {
  const parts = parseTimeParts(timeValue);
  return parts ? parts.hour * 60 + parts.minute : null;
}

function airtableRecordLink(recordId) {
  return recordId ? [recordId] : undefined;
}

function airtableRecordLinks(recordIds) {
  const ids = [...new Set((recordIds || []).filter(Boolean))];
  return ids.length ? ids : undefined;
}

function logTypeForAction(action) {
  return {
    class_start_times: "class_start_times",
    class_oog_rollups: "core_class_oog",
    get_orders_class_start_enrichment: "get-orders",
    get_orders_linkback_enrichment: "get-orders",
    get_rings_class_start_enrichment: "get-rings",
    get_rings_linkback_enrichment: "get-rings",
    class_alerts: "class_start_times",
    "sync-class-start-times": "class_start_times",
    "sync-class-oog-rollups": "core_class_oog",
    "sync-get-orders-linkback": "get-orders",
    "sync-get-orders": "get-orders",
    "sync-get-rings-linkback": "get-rings",
    "sync-get-rings": "get-rings",
    "repair-active-focus-helper-links": "get-orders",
    "sync-class-alerts": "class_start_times",
    run: "class_start_times"
  }[action] || action;
}

function compareKeySets(expected, actual) {
  const expectedKeys = [...new Set((expected || []).filter(Boolean))].sort();
  const actualKeys = [...new Set((actual || []).filter(Boolean))].sort();
  const actualSet = new Set(actualKeys);
  const expectedSet = new Set(expectedKeys);
  const missing = expectedKeys.filter((key) => !actualSet.has(key));
  const extra = actualKeys.filter((key) => !expectedSet.has(key));
  return {
    expected_count: expectedKeys.length,
    actual_count: actualKeys.length,
    missing,
    extra,
    ok: missing.length === 0 && extra.length === 0
  };
}

function buildClassAlerts(classStarts, now = new Date(), { windowed = true } = {}) {
  const current = easternParts(now);
  const windows = [60, 30];
  const alerts = [];

  for (const row of classStarts) {
    if (windowed && String(row.focus_day) !== current.date) continue;
    const startMinutes = timeMinutes(row.class_start_time || row.display_time);
    if (startMinutes === null) continue;
    const timeTill = startMinutes - current.minutes;
    for (const threshold of windows) {
      if (windowed && !inAlertWindow(timeTill, threshold)) continue;
      const alertType = `class_start_${threshold}`;
      alerts.push({
        alert_key: `${row.show_no}|${row.focus_day}|${row.class_no}|${alertType}`,
        show_no: numberOrNull(row.show_no),
        focus_day: row.focus_day,
        class_no: numberOrNull(row.class_no),
        class_start_times_record_id: row.record_id || "",
        shows: row.shows || [],
        focus_show: row.focus_show || [],
        ring_days: row.ring_days || [],
        rings: row.rings || [],
        classes: row.classes || [],
        class_start_time: row.class_start_time,
        alert_type: alertType,
        alert_lane: "class_start_times",
        trigger_minutes: threshold,
        time_till: timeTill,
        target_time: `${row.focus_day} ${row.class_start_time}`,
        alert_subject: row.class_name || `Class ${row.class_no}`,
        message: `${row.display_time || row.class_start_time} ${row.class_name || ""}`.trim(),
        status: "open",
        source_table: "class_start_times"
      });
    }
  }

  return alerts;
}

function inAlertWindow(minutesUntil, threshold, windowMinutes = 12) {
  if (minutesUntil === null || minutesUntil === undefined || !Number.isFinite(Number(minutesUntil))) return false;
  return Number(minutesUntil) <= threshold && Number(minutesUntil) > threshold - windowMinutes;
}

function buildEntryAlerts(entryGoTimes, now = new Date(), { windowed = true } = {}) {
  const current = easternParts(now);
  const windows = [40, 20];
  const alerts = [];

  for (const row of entryGoTimes) {
    if (windowed && String(row.focus_day) !== current.date) continue;
    const goMinutes = timeMinutes(row.entry_go_time);
    if (goMinutes === null) continue;
    const timeTill = goMinutes - current.minutes;
    for (const threshold of windows) {
      if (windowed && !inAlertWindow(timeTill, threshold)) continue;
      const alertType = `entry_go_${threshold}`;
      const horseDisplay = row.horse_display || row.horse || `Entry ${row.entry_no}`;
      alerts.push({
        alert_key: `${row.show_no}|${row.focus_day}|${row.class_no}|${row.entry_no}|${alertType}`,
        show_no: numberOrNull(row.show_no),
        focus_day: row.focus_day,
        class_no: numberOrNull(row.class_no),
        class_number: numberOrNull(row.class_number),
        class_name: row.class_name || "",
        entry_no: numberOrNull(row.entry_no),
        entry_go_times_record_id: row.record_id || "",
        class_start_times: row.class_start_times || [],
        shows: row.shows || [],
        focus_show: row.focus_show || [],
        ring_days: row.ring_days || [],
        rings: row.rings || [],
        classes: row.classes || [],
        entries: row.entries || [],
        horses: row.horses || [],
        riders: row.riders || [],
        trainers: row.trainers || [],
        entry_order: numberOrNull(row.entry_order),
        horse: row.horse || "",
        horse_display: horseDisplay,
        rider: row.rider || "",
        trainer: row.trainer || "",
        trainer_display: row.trainer_display || row.trainer || "",
        class_start_time: row.class_start_time || "",
        entry_go_time: row.entry_go_time,
        pace_seconds: numberOrNull(row.pace_seconds),
        n_gone: numberOrNull(row.n_gone),
        elapsed_seconds: numberOrNull(row.elapsed_seconds),
        alert_type: alertType,
        alert_lane: "entry_go_times",
        trigger_minutes: threshold,
        time_till: timeTill,
        target_time: `${row.focus_day} ${row.entry_go_time}`,
        alert_subject: `${horseDisplay} (${row.entry_no})`,
        message: `${horseDisplay} entry ${row.entry_no} estimated go in about ${threshold} minutes.`,
        status: "open",
        source_table: "entry_go_times"
      });
    }
  }

  return alerts;
}

module.exports = {
  truthy,
  normalizeTime,
  displayTime,
  buildClassStartRows,
  matchGetOrdersToClassStart,
  matchGetRingsToClassStart,
  buildClassAlerts,
  buildEntryAlerts,
  airtableRecordLink,
  airtableRecordLinks,
  logTypeForAction,
  compareKeySets
};
