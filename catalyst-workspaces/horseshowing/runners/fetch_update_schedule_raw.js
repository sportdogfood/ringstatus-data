#!/usr/bin/env node

const BASE_URL = "https://www.horseshowing.com";
const DEFAULT_SYNC_URL = "https://horseshowing-700800454.development.catalystserverless.com/server/horseshowing_sync/";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36";

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

function mergeCookies(current, setCookieHeaders = []) {
  const jar = new Map();
  String(current || "").split(";").map((part) => part.trim()).filter(Boolean).forEach((part) => {
    const [name, ...rest] = part.split("=");
    if (name) jar.set(name, rest.join("="));
  });
  for (const header of setCookieHeaders) {
    const first = String(header || "").split(";")[0];
    const [name, ...rest] = first.split("=");
    if (name) jar.set(name.trim(), rest.join("=").trim());
  }
  return Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join("; ");
}

function setCookies(response) {
  if (typeof response.headers.getSetCookie === "function") return response.headers.getSetCookie();
  const cookie = response.headers.get("set-cookie");
  return cookie ? [cookie] : [];
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeout_ms || 30000));
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function bootstrapCookie(showNo, userAgent, suppliedCookie) {
  let cookie = suppliedCookie || `HscomShowNo=${showNo}`;
  const show = await fetchText(`${BASE_URL}/show.php?show=${encodeURIComponent(showNo)}`, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": userAgent,
      cookie
    }
  });
  cookie = mergeCookies(cookie, setCookies(show.response));
  const schedule = await fetchText(`${BASE_URL}/schedule.php`, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      referer: `${BASE_URL}/show.php?show=${encodeURIComponent(showNo)}`,
      "user-agent": userAgent,
      cookie
    }
  });
  cookie = mergeCookies(cookie, setCookies(schedule.response));
  return cookie;
}

async function fetchUpdateScheduleRaw({ showNo, ringDayNo, cookie, userAgent }) {
  const body = new URLSearchParams({ show_no: showNo, ring_day_no: ringDayNo }).toString();
  const result = await fetchText(`${BASE_URL}/update_schedule.php`, {
    method: "POST",
    headers: {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      origin: BASE_URL,
      referer: `${BASE_URL}/schedule.php`,
      "user-agent": userAgent,
      "x-requested-with": "XMLHttpRequest",
      cookie
    },
    body,
    timeout_ms: 60000
  });
  return {
    status: result.response.status,
    raw_html: result.text
  };
}

async function storeRaw({ syncUrl, payload }) {
  const url = new URL(syncUrl || DEFAULT_SYNC_URL);
  url.searchParams.set("action", "store-update-schedule-raw");
  url.searchParams.set("show_no", payload.show_no);
  const result = await fetchText(url.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload),
    timeout_ms: 60000
  });
  let json;
  try {
    json = JSON.parse(result.text);
  } catch {
    throw new Error(`Catalyst store returned non-JSON ${result.response.status}: ${result.text.slice(0, 500)}`);
  }
  if (!result.response.ok || json.ok === false) {
    throw new Error(`Catalyst store failed ${result.response.status}: ${JSON.stringify(json).slice(0, 500)}`);
  }
  return json;
}

async function main() {
  const args = parseArgs(process.argv);
  const showNo = args["show-no"] || args.show_no;
  const focusDay = args["focus-day"] || args.focus_day;
  const ringDayNo = args["ring-day-no"] || args.ring_day_no;
  if (!showNo || !focusDay || !ringDayNo) {
    throw new Error("required args: --show-no, --focus-day, --ring-day-no");
  }
  const userAgent = args["user-agent"] || DEFAULT_USER_AGENT;
  const suppliedCookie = args.cookie || [
    args["php-session"] ? `PHPSESSID=${args["php-session"]}` : "",
    `HscomShowNo=${showNo}`
  ].filter(Boolean).join("; ");
  const cookie = await bootstrapCookie(showNo, userAgent, suppliedCookie);
  const upstream = await fetchUpdateScheduleRaw({ showNo, ringDayNo, cookie, userAgent });
  const stored = await storeRaw({
    syncUrl: args["sync-url"] || args.sync_url || DEFAULT_SYNC_URL,
    payload: {
      show_no: showNo,
      focus_day: focusDay,
      ring_day_no: ringDayNo,
      ring_no: args["ring-no"] || args.ring_no || "",
      ring_name: args["ring-name"] || args.ring_name || "",
      day_label: args["day-label"] || args.day_label || focusDay,
      upstream_status: upstream.status,
      fetched_at: new Date().toISOString(),
      raw_html: upstream.raw_html
    }
  });
  process.stdout.write(`${JSON.stringify(stored, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
