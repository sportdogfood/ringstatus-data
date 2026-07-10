'use strict';

const cheerio = require('cheerio');

function text(value) {
  return String(value ?? '').trim();
}

function sourceDate(value) {
  const match = text(value).match(/(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/i);
  if (!match) return '';
  const month = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
  }[match[1].toLowerCase()];
  return month ? `${match[3]}-${month}-${String(match[2]).padStart(2, '0')}` : '';
}

function parseRingDays(rawPayload, focus) {
  const payload = JSON.parse(rawPayload || '[]');
  const rows = [];
  const seen = new Set();
  for (const ring of Array.isArray(payload) ? payload : []) {
    for (const day of ring.ring_days || []) {
      if (sourceDate(day.date || day.day) !== focus.focus_day) continue;
      const ringNo = Number(ring.ring_no || ring.ring || 0);
      const ringDayNo = Number(day.ring_day_no || 0);
      const key = `${ringDayNo}|${ringNo}`;
      if (!ringNo || !ringDayNo || seen.has(key)) continue;
      seen.add(key);
      rows.push({
        show_no: Number(focus.show_no || 0),
        focus_day: focus.focus_day,
        ring_day_no: ringDayNo,
        ring_no: ringNo,
        ring_name: text(ring.ring_name || ring.ring)
      });
    }
  }
  return rows.sort((a, b) => a.ring_no - b.ring_no || a.ring_day_no - b.ring_day_no);
}

function parseClassLabel(value) {
  const source = text(value);
  const match = source.match(/^(\d+)\)\s*(.*)$/);
  return {
    class_number: Number(match?.[1] || 0),
    class_name: text(match?.[2] || source)
  };
}

function parseUpdateSchedule(rawHtml) {
  const $ = cheerio.load(rawHtml || '');
  const rows = [];
  $('h3.ring_evt').each((_, node) => {
    const classNo = Number($(node).attr('data-class') || 0);
    if (!classNo) return;
    const label = parseClassLabel($(node).attr('data-name') || $(node).text());
    rows.push({
      class_no: classNo,
      class_number: label.class_number,
      class_name: label.class_name,
      time_text: text($(node).attr('data-time')),
      entry_count: Number($(node).attr('data-entries') || 0)
    });
  });
  return rows;
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 10000));
  const fetchImpl = options.fetchImpl || fetch;
  try {
    const response = await fetchImpl(url, {
      ...(options.requestOptions || {}),
      signal: controller.signal
    });
    if (!response?.ok) throw new Error(`source_http_${response?.status || 0}`);
    return await response.text();
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError' || error?.message === 'aborted') {
      throw new Error('source_timeout');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  fetchText,
  parseRingDays,
  parseUpdateSchedule,
  sourceDate
};
