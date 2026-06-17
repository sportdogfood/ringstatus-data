import * as cheerio from "cheerio";

const BASE_URL = "https://www.horseshowing.com";

const ENDPOINTS = {
  "show": { url: "/show.php", method: "GET", parser: parseShowShell, referrer: "/showsel.php" },
  "ring-days": { url: "/get_ring_days.php", method: "GET", parser: parseRingDays, referrer: "/schedule.php" },
  "update-schedule": { url: "/update_schedule.php", method: "POST", parser: parseRingDaySchedule, referrer: "/schedule.php" },
  "rings": { url: "/get_rings.php", method: "POST", parser: parseCurrentRingStatus, referrer: "/rings.php" },
  "orders": { url: "/get_orders.php", method: "POST", parser: parseCurrentOrders, referrer: "/schedule.php" },
  "counts": { url: "/counts.php", method: "GET", parser: parseClassCounts, referrer: "/schedule.php" },
  "class-oog": { url: "/class_oog.php", method: "GET", parser: parseClassOog, referrer: "/schedule.php" }
};

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36";

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function intOrNull(value) {
  const trimmed = text(value);
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseQueryFromUrl(url = "") {
  const queryIndex = String(url).indexOf("?");
  if (queryIndex === -1) return new URLSearchParams();
  return new URLSearchParams(String(url).slice(queryIndex + 1));
}

function getHeader(request, name) {
  const lowerName = name.toLowerCase();
  const headers = request?.headers || {};
  if (typeof request?.get === "function") return request.get(name) || request.get(lowerName);
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) return Array.isArray(value) ? value.join(",") : value;
  }
  return "";
}

async function readRequestBody(request) {
  if (typeof request?.body === "string") return request.body;
  if (Buffer.isBuffer(request?.body)) return request.body.toString("utf8");
  if (request?.body && typeof request.body === "object") return new URLSearchParams(request.body).toString();
  return "";
}

async function readParams(request) {
  const params = parseQueryFromUrl(request?.url || request?.originalUrl || "");
  const bodyText = await readRequestBody(request);
  if (bodyText) {
    for (const [key, value] of new URLSearchParams(bodyText)) {
      if (!params.has(key)) params.set(key, value);
    }
  }
  return params;
}

function responseJson(response, status, payload) {
  response.status?.(status);
  response.setHeader?.("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload, null, 2));
}

function makeCookie({ phpSessionId, showNo, inboundCookie }) {
  const cookies = [];
  if (inboundCookie) cookies.push(inboundCookie);
  if (phpSessionId) cookies.push(`PHPSESSID=${phpSessionId}`);
  if (showNo) cookies.push(`HscomShowNo=${showNo}`);
  return cookies.join("; ");
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const value = headers.get("set-cookie");
  return value ? [value] : [];
}

function mergeCookies(...cookieInputs) {
  const jar = new Map();
  for (const input of cookieInputs) {
    for (const part of Array.isArray(input) ? input : String(input || "").split(";")) {
      const cookie = String(part || "").split(";")[0].trim();
      const eq = cookie.indexOf("=");
      if (eq > 0) jar.set(cookie.slice(0, eq), cookie.slice(eq + 1));
    }
  }
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function bootstrapCookie(showNo, headers) {
  if (!showNo) return "";
  const response = await fetch(`${BASE_URL}/show.php?show=${encodeURIComponent(showNo)}`, {
    method: "GET",
    headers: {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": headers["accept-language"] || "en-US,en;q=0.9",
      "referer": `${BASE_URL}/showsel.php`,
      "user-agent": headers["user-agent"] || DEFAULT_USER_AGENT
    }
  });
  return mergeCookies(getSetCookies(response.headers), `HscomShowNo=${showNo}`);
}

function buildUpstreamRequest(endpointKey, params, request) {
  const endpoint = ENDPOINTS[endpointKey];
  if (!endpoint) throw new Error(`Unknown endpoint: ${endpointKey}`);

  const showNo = params.get("show_no") || params.get("show") || "";
  const phpSessionId = getHeader(request, "x-hscom-phpsessid");
  const inboundCookie = getHeader(request, "cookie");
  const userAgent = getHeader(request, "user-agent") || DEFAULT_USER_AGENT;
  const cookie = makeCookie({ phpSessionId, showNo, inboundCookie });

  let url = `${BASE_URL}${endpoint.url}`;
  const bodyParams = new URLSearchParams();

  if (endpointKey === "show") {
    if (!showNo) throw new Error("show endpoint requires show_no or show");
    url += `?show=${encodeURIComponent(showNo)}`;
  } else if (endpointKey === "class-oog") {
    const classNo = params.get("class_no");
    if (!classNo) throw new Error("class-oog requires class_no");
    url += `?class_no=${encodeURIComponent(classNo)}`;
  } else if (endpointKey === "update-schedule") {
    const ringDayNo = params.get("ring_day_no");
    if (!showNo) throw new Error("update-schedule requires show_no");
    if (!ringDayNo) throw new Error("update-schedule requires ring_day_no");
    bodyParams.set("show_no", showNo);
    bodyParams.set("ring_day_no", ringDayNo);
  } else if (endpoint.method === "POST") {
    if (!showNo) throw new Error(`${endpointKey} requires show_no`);
    bodyParams.set("show_no", showNo);
  }

  const referrerPath = endpoint.referrer || "/show.php";
  const referrer = `${BASE_URL}${referrerPath}${endpointKey === "rings" && showNo ? `?show=${encodeURIComponent(showNo)}` : ""}`;
  const headers = {
    "accept": endpoint.method === "GET" && endpointKey !== "ring-days"
      ? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      : "application/json, text/javascript, */*; q=0.01",
    "accept-encoding": "gzip, deflate, br",
    "accept-language": "en-US,en;q=0.9",
    "origin": BASE_URL,
    "referer": referrer,
    "sec-ch-ua": "\"Microsoft Edge\";v=\"149\", \"Chromium\";v=\"149\", \"Not)A;Brand\";v=\"24\"",
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": "\"Android\"",
    "sec-fetch-dest": endpointKey === "show" || endpointKey === "counts" ? "document" : "empty",
    "sec-fetch-mode": endpointKey === "show" || endpointKey === "counts" ? "navigate" : "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": userAgent,
    "x-requested-with": endpointKey === "show" || endpointKey === "counts" ? "" : "XMLHttpRequest"
  };
  if (cookie) headers.cookie = cookie;

  let body = null;
  if (endpoint.method === "POST") {
    body = bodyParams.toString();
    headers["content-type"] = "application/x-www-form-urlencoded; charset=UTF-8";
  }
  for (const key of Object.keys(headers)) {
    if (!headers[key]) delete headers[key];
  }

  return { endpoint, url, method: endpoint.method, headers, body, showNo };
}

function table(columns, rows, warnings = []) {
  return { columns, rows, row_count: rows.length, warnings };
}

function contextWarnings(raw) {
  const warnings = [];
  if (/Select Show/i.test(raw)) warnings.push("select_show_page_returned");
  if (/Invalid parameter/i.test(raw)) warnings.push("invalid_parameter_returned");
  return warnings;
}

function parseJsonArray(raw) {
  const warnings = contextWarnings(raw);
  try {
    const parsed = JSON.parse(raw || "[]");
    return { payload: Array.isArray(parsed) ? parsed : [], warnings };
  } catch (error) {
    return { payload: [], warnings: [...warnings, `json_parse_failed:${String(error.message || error)}`] };
  }
}

function parseShowShell(raw) {
  const $ = cheerio.load(raw);
  const title = text($("title").last().text());
  const showNoMatch = raw.match(/show_no\s*=\s*(\d+)/);
  const lastUpdated = text($("#last_updated").text()).replace(/^Last Updated:\s*/i, "");
  const pdfs = [];
  $("a[href*='show_upload/']").each((_, node) => {
    pdfs.push({ href: $(node).attr("href"), label: text($(node).text()) });
  });
  return table(["show_no", "title", "last_updated", "pdfs_json"], [{
    show_no: showNoMatch?.[1] || null,
    title,
    last_updated: lastUpdated || null,
    pdfs_json: JSON.stringify(pdfs)
  }]);
}

function parseRingDays(raw, context = {}) {
  const { payload, warnings } = parseJsonArray(raw);
  const rows = [];
  for (const ring of payload) {
    for (const day of ring.ring_days || []) {
      rows.push({
        show_no: context.show_no || null,
        ring_no: text(ring.ring_no),
        ring_name: text(ring.name),
        ring_day_no: text(day.ring_day_no),
        date_text: text(day.date)
      });
    }
  }
  return table(["show_no", "ring_no", "ring_name", "ring_day_no", "date_text"], rows, warnings);
}

function parseRingDaySchedule(raw, context = {}) {
  const $ = cheerio.load(raw);
  const rows = [];
  $("h3.ring_evt").each((_, node) => {
    const classes = text($(node).attr("class"));
    const ringDayFromClass = classes.match(/\brd(\d+)\b/)?.[1] || null;
    rows.push({
      show_no: text($(node).attr("data-show")),
      ring_day_no: context.ring_day_no || ringDayFromClass,
      event_id: text($(node).attr("id")),
      class_no: text($(node).attr("data-class")),
      time_text: text($(node).attr("data-time")),
      entry_count: intOrNull($(node).attr("data-n_entries")),
      event_name: text($(node).attr("data-name")),
      event_type: text($(node).attr("data-re_type")),
      oc_id: text($(node).attr("data-oc_id")),
      live_flag: text($(node).attr("data-live"))
    });
  });
  return table(["show_no", "ring_day_no", "event_id", "class_no", "time_text", "entry_count", "event_name", "event_type", "oc_id", "live_flag"], rows);
}

function parseStatusRows(raw, includeClassNo) {
  const { payload, warnings } = parseJsonArray(raw);
  const columns = [
    "show_no", "ring_no", "ring_day_no", "ring_name", "day_text", "class_text", "entry_text",
    "total", "n_to_go", "n_gone", "time_text", "timestamp", "elapsed"
  ];
  if (includeClassNo) columns.splice(1, 0, "class_no");
  const extraColumns = includeClassNo ? ["n_standings", "type"] : [];
  const rows = payload.map((row) => {
    const out = {
      show_no: text(row.show_no),
      ring_no: text(row.ring_no),
      ring_day_no: text(row.ring_day_no),
      ring_name: text(row.ring),
      day_text: text(row.day),
      class_text: text(row.class),
      entry_text: text(row.entry),
      total: intOrNull(row.total),
      n_to_go: intOrNull(row.n_to_go),
      n_gone: intOrNull(row.n_gone),
      time_text: text(row.time),
      timestamp: intOrNull(row.timestamp),
      elapsed: intOrNull(row.elapsed)
    };
    if (includeClassNo) {
      out.class_no = text(row.class_no);
      out.n_standings = intOrNull(row.n_standings);
      out.type = text(row.type);
    }
    return out;
  });
  return table([...columns, ...extraColumns], rows, warnings);
}

function parseCurrentRingStatus(raw) {
  return parseStatusRows(raw, true);
}

function parseCurrentOrders(raw) {
  return parseStatusRows(raw, false);
}

function parseClassCounts(raw) {
  const $ = cheerio.load(raw);
  const warnings = contextWarnings(raw);
  const rows = [];
  $("tr").each((_, tr) => {
    const link = $(tr).find(".name_cell .link").first();
    if (!link.length) return;
    rows.push({
      show_no: raw.match(/session_show_no\s*=\s*(\d+)/)?.[1] || null,
      class_no: text(link.attr("data-class")),
      class_number: text(link.attr("data-num")),
      class_name: text(link.attr("data-name") || link.text()),
      entry_count: intOrNull($(tr).find(".entries_cell").first().text())
    });
  });
  const finalWarnings = rows.length
    ? warnings.filter((warning) => warning !== "select_show_page_returned")
    : warnings;
  return table(["show_no", "class_no", "class_number", "class_name", "entry_count"], rows, finalWarnings);
}

function parseClassOog(raw, context = {}) {
  const $ = cheerio.load(raw);
  const warnings = contextWarnings(raw);
  const postedOrderStatus = text($("#order_option").text());
  const tableNode = $(".lg table.orders_table").first().length
    ? $(".lg table.orders_table").first()
    : $("table.orders_table").first();
  const rows = [];
  tableNode.find("tr").each((index, tr) => {
    if (index === 0) return;
    const cells = $(tr).find("td").map((_, td) => text($(td).text())).get();
    if (cells.length < 4) return;
    rows.push({
      class_no: context.class_no || null,
      posted_order_status: postedOrderStatus,
      row_number: intOrNull(cells[0]),
      entry_no: text(cells[1]),
      horse: text(cells[2]),
      rider: text(cells[3]),
      trainer: text(cells[4])
    });
  });
  const finalWarnings = rows.length
    ? warnings.filter((warning) => warning !== "select_show_page_returned")
    : warnings;
  if (postedOrderStatus.toUpperCase().includes("NOT A POSTED ORDER")) finalWarnings.push("not_posted_order");
  return table(["class_no", "posted_order_status", "row_number", "entry_no", "horse", "rider", "trainer"], rows, finalWarnings);
}

export const parsers = {
  parseShowShell,
  parseRingDays,
  parseRingDaySchedule,
  parseCurrentRingStatus,
  parseCurrentOrders,
  parseClassCounts,
  parseClassOog
};

export default async (request, response) => {
  try {
    const params = await readParams(request);
    const endpointKey = params.get("endpoint") || "ring-days";
    const debug = params.get("debug") === "1" || params.get("debug") === "true";
    const upstream = buildUpstreamRequest(endpointKey, params, request);
    const hasPhpSession = /PHPSESSID=/i.test(upstream.headers.cookie || "");
    let bootstrapped = false;
    if (upstream.showNo && !hasPhpSession) {
      const bootstrap = await bootstrapCookie(upstream.showNo, upstream.headers);
      if (bootstrap) {
        upstream.headers.cookie = mergeCookies(upstream.headers.cookie, bootstrap);
        bootstrapped = true;
      }
    }

    const fetchOptions = {
      method: upstream.method,
      headers: upstream.headers,
      body: upstream.body
    };
    const upstreamResponse = await fetch(upstream.url, fetchOptions);
    const rawBody = await upstreamResponse.text();
    const context = {
      show_no: params.get("show_no") || params.get("show") || null,
      ring_day_no: params.get("ring_day_no") || null,
      class_no: params.get("class_no") || null
    };
    const parsed = upstream.endpoint.parser(rawBody, context);

    responseJson(response, 200, {
      message: "discover_result",
      endpoint: endpointKey,
      inbound: Object.fromEntries(params.entries()),
      upstream: {
        url: upstream.url,
        method: upstream.method,
        status: upstreamResponse.status,
        content_type: upstreamResponse.headers.get("content-type"),
        forwarded_body: upstream.body,
        sent_cookie: Boolean(upstream.headers.cookie),
        bootstrapped
      },
      raw_preview: debug ? rawBody.slice(0, 4000) : undefined,
      table: parsed
    });
  } catch (error) {
    responseJson(response, 500, {
      message: "discover_error",
      error: String(error?.message || error)
    });
  }
};
