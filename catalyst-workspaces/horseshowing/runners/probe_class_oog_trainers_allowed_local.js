#!/usr/bin/env node

const BASE_URL = "https://www.horseshowing.com";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36";

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
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function splitList(value) {
  return String(value || "")
    .split(/[|,\n]/)
    .map(text)
    .filter(Boolean);
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
    const body = await response.text();
    return { response, body };
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
    },
    timeout_ms: 30000
  });
  cookie = mergeCookies(cookie, setCookies(show.response));
  const schedule = await fetchText(`${BASE_URL}/schedule.php`, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-encoding": "identity",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": userAgent,
      cookie
    },
    timeout_ms: 30000
  });
  cookie = mergeCookies(cookie, setCookies(schedule.response));
  return cookie;
}

async function fetchClassOogRaw({ showNo, classNo, cookie, userAgent }) {
  const result = await fetchText(`${BASE_URL}/class_oog.php?class_no=${encodeURIComponent(classNo)}`, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-encoding": "identity",
      "accept-language": "en-US,en;q=0.9",
      referer: `${BASE_URL}/schedule.php`,
      "user-agent": userAgent,
      cookie
    },
    timeout_ms: 60000
  });
  return {
    status: result.response.status,
    raw: result.body
  };
}

function escapeRegex(value) {
  return text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeProbeText(value) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D]/g, "\"")
    .toLowerCase()
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trainerTerms(trainersAllowed) {
  return splitList(trainersAllowed)
    .map((trainer) => {
      const normalized = normalizeProbeText(trainer);
      return {
        trainer,
        normalized,
        parts: normalized.split(" ").filter((part) => part.length > 2)
      };
    })
    .filter((term) => term.normalized && term.parts.length >= 2);
}

function scanTrainerCertainty(raw, terms) {
  const normalizedDoc = normalizeProbeText(raw);
  const confirmed = [];
  const possible = [];
  for (const term of terms) {
    const phrase = escapeRegex(term.normalized).replace(/\\ /g, "\\s+");
    if (new RegExp(`(^|\\s)${phrase}(\\s|$)`, "i").test(normalizedDoc)) {
      confirmed.push(term.trainer);
      continue;
    }
    if (term.parts.every((part) => new RegExp(`(^|\\s)${escapeRegex(part)}(\\s|$)`, "i").test(normalizedDoc))) {
      possible.push(term.trainer);
    }
  }
  return {
    certainty: confirmed.length ? "confirmed" : (possible.length ? "possible" : "none"),
    confirmed_trainers: confirmed,
    possible_trainers: possible
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const showNo = args["show-no"] || args.show_no || "14909";
  const classNos = splitList(args["class-nos"] || args.class_nos || args["class-no"] || args.class_no);
  const trainersAllowed = args["trainers-allowed"] || args.trainers_allowed || args.trainers || "";
  if (!classNos.length) throw new Error("required arg: --class-nos=26873,26790,...");
  if (!trainersAllowed) throw new Error("required arg: --trainers-allowed=\"Alan Korotkin|...\"");

  const userAgent = args["user-agent"] || DEFAULT_USER_AGENT;
  const suppliedCookie = args.cookie || [
    args["php-session"] ? `PHPSESSID=${args["php-session"]}` : "",
    `HscomShowNo=${showNo}`
  ].filter(Boolean).join("; ");
  const terms = trainerTerms(trainersAllowed);
  const cookie = await bootstrapCookie(showNo, userAgent, suppliedCookie);
  const startedAt = Date.now();
  const results = [];
  for (const classNo of classNos) {
    const classStartedAt = Date.now();
    try {
      const upstream = await fetchClassOogRaw({ showNo, classNo, cookie, userAgent });
      const scan = scanTrainerCertainty(upstream.raw, terms);
      results.push({
        class_no: classNo,
        http_status: upstream.status,
        char_count: String(upstream.raw || "").length,
        certainty: scan.certainty,
        confirmed_trainers: scan.confirmed_trainers,
        possible_trainers: scan.possible_trainers,
        elapsed_ms: Date.now() - classStartedAt
      });
    } catch (error) {
      results.push({
        class_no: classNo,
        http_status: null,
        char_count: 0,
        certainty: "error",
        error: error.message,
        elapsed_ms: Date.now() - classStartedAt
      });
    }
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: "local_only_no_writes",
    show_no: showNo,
    class_count: classNos.length,
    trainers_allowed: terms.map((term) => term.trainer),
    elapsed_ms: Date.now() - startedAt,
    results
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
