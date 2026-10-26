#!/usr/bin/env node
/**
 * skills/qa-fix-routing/jira.mjs
 *
 * Thin Jira Cloud REST CLI for the interactive bug-lifecycle commands — the REST half of
 * tracker-ops.md that the Atlassian MCP does not cover: editing a comment, attaching screenshots,
 * the v2 wiki comment that embeds them, the read-back of the rendered body, the ADF description PUT.
 * It replaces the `source .env.local` + `curl -u "$JIRA_EMAIL:$JIRA_API_TOKEN"` recipes (VCST-6402):
 *
 *   node "$VC_RUN" jira <command> …
 *
 * runs this with JIRA_API_TOKEN from vc-secrets in its environment and nowhere else — no token in a
 * file, in argv or in shell history.
 *
 * HOST PINNING: every request goes to the profile's `tracker.baseUrl` (written by /project-init) and
 * to nothing else — there is no flag and no env var that changes the host, because the process holds
 * a token and the command line is the caller's. Paths must be `/rest/…`; `request` refuses a full URL
 * and refuses DELETE (deleting tracker data is a human decision).
 *
 * Auth: Basic `JIRA_EMAIL:JIRA_API_TOKEN` (JIRA_EMAIL is an identifier, read from .env.local).
 * Prints JSON on stdout; exits non-zero on an HTTP error. NEVER prints the token.
 *
 * Commands:
 *   myself
 *   get            --key ABC-1 [--fields summary,status] [--expand renderedFields]
 *   comment        --key ABC-1 --body-file c.md [--wiki]     # --wiki: v2 API, wiki markup (inline images)
 *   edit-comment   --key ABC-1 --id 10001 --body-file c.md [--wiki]
 *   get-comment    --key ABC-1 --id 10001 [--rendered]       # renderedBody for the image check
 *   attach         --key ABC-1 --file a.png [--file b.png]   # → [{ id, filename }]
 *   media-id       --attachment 10050                        # → { uuid } (ADF media node id)
 *   update         --key ABC-1 --fields-file fields.json     # PUT { fields } (e.g. an ADF description)
 *   transitions    --key ABC-1
 *   transition     --key ABC-1 --to "In Review"              # by name or id
 *   request        --method GET|POST|PUT --path /rest/api/3/… [--body-file b.json]
 *   comments       --key ABC-1 [--rendered] [--max 500] [--newest]   # every page, one launch → { total, comments, truncated }
 *   download       --attachment 10050 --out .vc-fix/… [--max-bytes 26214400]   # → { path, bytes, contentType }
 *   dev-prs        --key ABC-1                               # the development panel's PR URLs → { issueId, urls }
 *   confluence-page --id 123456                              # a Confluence page on the same host, storage body
 *
 * The reads (comments, download, dev-prs, confluence-page) print Jira's own objects unshaped — a caller (vc-test's
 * connector) builds its raw files from them. `download` writes only inside <outputRoot>/.vc-fix/ and stops
 * at --max-bytes (raw-out.mjs): this process holds a token and its command line is the caller's.
 *
 * Without --wiki a body file that parses as JSON is sent as an ADF document; anything else is sent as
 * plain text, one paragraph per blank-line-separated block. Markdown is NOT converted — use the
 * Atlassian MCP for a Markdown comment, or --wiki for wiki markup.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLayeredEnv } from "../../scripts/lib/load-layered-env.mjs";
import { loadProjectProfile } from "../../scripts/lib/project-profile.mjs";
import { DOWNLOAD_TIMEOUT_MS, FETCH_TIMEOUT_MS, rawOutPath, timedFetch, writeCapped } from "./raw-out.mjs";

function fail(msg, code = 1) {
  console.error(`[jira] ${msg}`);
  process.exit(code);
}

/**
 * Read a `--<flag>` file — a relative path from the cwd first, then VC_FIX_HOME, like ado.mjs — or
 * exit with one line.
 * `json`: parse it too, with the same one-line failure.
 */
function readInput(flag, p, { json = false, raw = false } = {}) {
  const s = String(p);
  const candidates = isAbsolute(s) ? [s] : [resolve(process.cwd(), s), ...(process.env.VC_FIX_HOME ? [resolve(process.env.VC_FIX_HOME, s)] : [])];
  const abs = candidates.find((c) => existsSync(c)) || candidates[0];
  let data;
  try {
    data = raw ? readFileSync(abs) : readFileSync(abs, "utf8");
  } catch (e) {
    fail(`--${flag} "${p}" cannot be read (${e.code || e.message}) — looked in ${candidates.join(" and ")}`);
  }
  if (!json) return data;
  try {
    return JSON.parse(data);
  } catch (e) {
    fail(`--${flag} "${p}" is not valid JSON (${e.message})`);
  }
}

/** Parse flags; `--file` repeats. */
export function parseArgs(argv) {
  const a = { _: [], file: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith("--")) {
      a._.push(t);
      continue;
    }
    const k = t.slice(2);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) {
      a[k] = true;
      continue;
    }
    if (k === "file") a.file.push(v);
    else a[k] = v;
    i++;
  }
  return a;
}

/** The pinned Jira origin from the profile. Pure. */
export function pinnedOrigin(profile) {
  const raw = String(profile?.tracker?.baseUrl || "").trim();
  if (!raw) return { error: "the profile has no tracker.baseUrl — run /project-init (the vc-init plugin) for this Jira project" };
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { error: `tracker.baseUrl "${raw}" is not a URL — fix it with /project-init --check` };
  }
  if (u.protocol !== "https:") return { error: `tracker.baseUrl must be https, got ${u.protocol}` };
  return { origin: u.origin };
}

/** A request path this CLI may send: `/rest/…`, no scheme, no host, no traversal. Pure. */
export function safePath(path) {
  const p = String(path || "");
  return p.startsWith("/rest/") && !p.includes("://") && !p.includes("\\") && !/(^|\/)\.\.(\/|$)/.test(p) && !/[\r\n]/.test(p);
}

/** The one Confluence path this CLI may send: a page by numeric id, storage body. Pure. */
export function safeWikiPath(path) {
  return /^\/wiki\/api\/v2\/pages\/\d{1,20}(\?body-format=storage)?$/.test(String(path || ""));
}

/** Plain text → a minimal ADF document (one paragraph per blank-line-separated block). Pure. */
export function textToAdf(text) {
  const blocks = String(text).replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return {
    type: "doc",
    version: 1,
    content: blocks.map((b) => ({ type: "paragraph", content: b.split("\n").flatMap((line, i) => (i ? [{ type: "hardBreak" }] : []).concat(line ? [{ type: "text", text: line }] : [])) })),
  };
}

/**
 * Every comment page up to `max`, in one process (a bridge launch per page would cost a vc-secrets start
 * each). An empty page ends the loop whatever `total` says; an id seen twice (a comment posted mid-read
 * shifts the window) is kept once. Pure: `fetchPage(startAt, maxResults)` does the I/O.
 * @returns {Promise<{ total: number, comments: object[], truncated: boolean }>}
 */
export async function pageComments(fetchPage, { max = 500, pageSize = 100 } = {}) {
  const comments = [];
  const seen = new Set();
  let total = null;
  let startAt = 0;
  while (comments.length < max) {
    const want = Math.min(pageSize, max - comments.length);
    const page = await fetchPage(startAt, want);
    const items = Array.isArray(page?.comments) ? page.comments : [];
    if (Number.isInteger(page?.total)) total = page.total;
    if (!items.length) break;
    let added = 0;
    for (const c of items) {
      const id = c?.id ?? JSON.stringify(c);
      if (seen.has(id) || comments.length >= max) continue;
      seen.add(id);
      comments.push(c);
      added++;
    }
    if (!added) break; // a page with nothing new: a server repeating itself ends the loop, never spins it
    startAt += items.length;
    // With a known total, a short page is a server cap, not the end; without one, it is the end.
    if (total !== null ? startAt >= total : items.length < want) break;
  }
  const known = total ?? comments.length;
  return { total: known, comments, truncated: comments.length < known };
}

/**
 * The PR URLs Jira's development panel holds for an issue (a copy of /ticket-context's `devPrUrls` — vc-fix is self-contained, so a fix to one is made to both): `detail`
 * answers only for the applicationType the integration is registered under — a wrong one is an empty 200 —
 * so the types come from `summary`, plus "GitHub". Pure: `getJson(path)` does the I/O.
 * @returns {Promise<string[]>}
 */
export async function devPrUrls(getJson, issueId) {
  const id = encodeURIComponent(issueId);
  const sum = await getJson(`/rest/dev-status/latest/issue/summary?issueId=${id}`);
  const types = new Set([...Object.keys(sum?.summary?.pullrequest?.byInstanceType ?? {}), "GitHub"]);
  const urls = new Set();
  for (const t of types) {
    const j = await getJson(`/rest/dev-status/latest/issue/detail?issueId=${id}&applicationType=${encodeURIComponent(t)}&dataType=pullrequest`);
    for (const d of j?.detail ?? []) for (const p of d.pullRequests ?? []) if (p.url) urls.add(p.url);
  }
  return [...urls];
}

function readBody(args) {
  if (!args["body-file"]) fail("--body-file required");
  const text = readInput("body-file", args["body-file"]);
  if (args.wiki) return { v: 2, body: { body: text } };
  try {
    const doc = JSON.parse(text);
    if (doc && doc.type === "doc") return { v: 3, body: { body: doc } };
  } catch {
    /* not JSON — plain text */
  }
  return { v: 3, body: { body: textToAdf(text) } };
}

function main() {
  try {
    loadLayeredEnv("vcst");
  } catch {
    /* non-fatal — the ambient env is used */
  }
  let profile;
  try {
    profile = loadProjectProfile(process.cwd(), { walkUp: true });
  } catch (e) {
    fail(e.message);
  }
  const pin = pinnedOrigin(profile);
  if (pin.error) fail(pin.error);
  const token = process.env.JIRA_API_TOKEN || "";
  const email = process.env.JIRA_EMAIL || process.env.JIRA_USER || "";
  if (!token) fail("no JIRA_API_TOKEN in this process. The token is stored in vc-secrets and reaches this script only as `node \"$VC_RUN\" jira …`; on an Atlassian-OAuth axis use the Atlassian MCP instead. Not set up yet: /project-init --check.");
  if (!email) fail("no JIRA_EMAIL — set it in .env.local (an identifier, not a secret — the same for every env)");
  const auth = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;

  const call = async (method, path, { body, headers = {}, raw = false, redirect = "follow", timeout = FETCH_TIMEOUT_MS, wiki = false } = {}) => {
    if (wiki ? method !== "GET" || !safeWikiPath(path) : !safePath(path)) fail(`refusing path ${JSON.stringify(path)} — only /rest/… on ${pin.origin}`);
    const res = await timedFetch(`${pin.origin}${path}`, {
      method,
      redirect,
      headers: { Authorization: auth, Accept: "application/json", ...(body !== undefined && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    }, timeout, `${method} ${path}`, { buffer: !raw });
    if (raw) return res;
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      fail(`HTTP ${res.status} for ${method} ${path} — the Jira token was rejected. Store a fresh one: node "<VC_SECRETS>" set jira-token`);
    }
    if (!res.ok) fail(`HTTP ${res.status} for ${method} ${path}: ${text.slice(0, 300)}`);
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { _raw: text };
    }
  };

  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const args = parseArgs(argv.slice(1));
  const key = () => {
    if (!args.key || !/^[A-Z][A-Z0-9_]*-\d+$/.test(String(args.key))) fail("--key ABC-123 required");
    return args.key;
  };
  const intArg = (name, dflt) => {
    if (args[name] === undefined) return dflt;
    if (!/^\d+$/.test(String(args[name])) || Number(args[name]) < 1) fail(`--${name} must be a positive integer`);
    return Number(args[name]);
  };
  const commands = {
    myself: () => call("GET", "/rest/api/3/myself").then((m) => ({ accountId: m.accountId, displayName: m.displayName, emailAddress: m.emailAddress })),
    get: () => {
      const q = new URLSearchParams();
      if (args.fields) q.set("fields", args.fields);
      if (args.expand) q.set("expand", args.expand);
      return call("GET", `/rest/api/3/issue/${key()}${q.size ? `?${q}` : ""}`);
    },
    comment: () => {
      const { v, body } = readBody(args);
      return call("POST", `/rest/api/${v}/issue/${key()}/comment`, { body }).then((c) => ({ id: c.id, ok: true }));
    },
    "edit-comment": () => {
      if (!args.id || !/^\d+$/.test(String(args.id))) fail("--id <comment id> required");
      const { v, body } = readBody(args);
      return call("PUT", `/rest/api/${v}/issue/${key()}/comment/${args.id}`, { body }).then((c) => ({ id: c.id, ok: true }));
    },
    "get-comment": () => {
      if (!args.id || !/^\d+$/.test(String(args.id))) fail("--id <comment id> required");
      return call("GET", `/rest/api/3/issue/${key()}/comment/${args.id}${args.rendered ? "?expand=renderedBody" : ""}`);
    },
    attach: async () => {
      if (!args.file.length) fail("--file <path> required (repeatable)");
      const form = new FormData();
      for (const f of args.file) form.append("file", new Blob([readInput("file", f, { raw: true })]), basename(f));
      const out = await call("POST", `/rest/api/3/issue/${key()}/attachments`, { body: form, headers: { "X-Atlassian-Token": "no-check" }, timeout: DOWNLOAD_TIMEOUT_MS });
      return (Array.isArray(out) ? out : []).map((a) => ({ id: a.id, filename: a.filename }));
    },
    "media-id": async () => {
      if (!args.attachment || !/^\d+$/.test(String(args.attachment))) fail("--attachment <id> required");
      const res = await call("GET", `/rest/api/3/attachment/content/${args.attachment}`, { raw: true, redirect: "manual" });
      const loc = res.headers.get("location") || "";
      const m = /\/file\/([0-9a-f-]{36})\//i.exec(loc);
      if (!m) fail(`no media id in the content redirect (HTTP ${res.status})`);
      return { uuid: m[1] };
    },
    update: () => {
      if (!args["fields-file"]) fail("--fields-file required");
      const parsed = readInput("fields-file", args["fields-file"], { json: true });
      const body = parsed && parsed.fields ? parsed : { fields: parsed };
      return call("PUT", `/rest/api/3/issue/${key()}`, { body }).then(() => ({ ok: true }));
    },
    transitions: () => call("GET", `/rest/api/3/issue/${key()}/transitions`).then((d) => (d.transitions || []).map((t) => ({ id: t.id, name: t.name, to: t.to?.name }))),
    transition: async () => {
      if (!args.to) fail("--to <transition name or id> required");
      const list = (await call("GET", `/rest/api/3/issue/${key()}/transitions`)).transitions || [];
      const t = list.find((x) => x.id === String(args.to) || x.name.toLowerCase() === String(args.to).toLowerCase());
      if (!t) fail(`no transition "${args.to}" — available: ${list.map((x) => x.name).join(", ")}`);
      await call("POST", `/rest/api/3/issue/${key()}/transitions`, { body: { transition: { id: t.id } } });
      return { ok: true, transition: t.name, to: t.to?.name };
    },
    comments: () => {
      const max = intArg("max", 500);
      const order = args.newest ? "-created" : "created";
      const expand = args.rendered ? "&expand=renderedBody" : "";
      return pageComments((startAt, maxResults) => call("GET", `/rest/api/3/issue/${key()}/comment?startAt=${startAt}&maxResults=${maxResults}&orderBy=${order}${expand}`), { max });
    },
    download: async () => {
      if (!args.attachment || !/^\d+$/.test(String(args.attachment))) fail("--attachment <id> required");
      let out;
      try {
        out = rawOutPath(String(args.out ?? ""));
      } catch (e) {
        fail(e.message);
      }
      let res = await call("GET", `/rest/api/3/attachment/content/${args.attachment}`, { raw: true, redirect: "manual", headers: { Accept: "*/*" }, timeout: DOWNLOAD_TIMEOUT_MS });
      // Jira answers with a redirect to its media host. Follow it ourselves, https only and WITHOUT the token,
      // instead of trusting the runtime's fetch to drop Authorization on the cross-origin hop.
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        const next = loc ? new URL(loc, pin.origin) : null;
        if (!next || next.protocol !== "https:") fail(`HTTP ${res.status} for the attachment ${args.attachment} with no https Location`);
        res = await timedFetch(next.href, { headers: { Accept: "*/*" } }, DOWNLOAD_TIMEOUT_MS, "the attachment download");
      }
      if (!res.ok) fail(`HTTP ${res.status} for the attachment ${args.attachment}`);
      try {
        return { path: out, ...(await writeCapped(res, out, intArg("max-bytes", 25 * 2 ** 20))) };
      } catch (e) {
        fail(e.message);
      }
    },
    "dev-prs": async () => {
      const issue = await call("GET", `/rest/api/3/issue/${key()}?fields=id`);
      return { issueId: String(issue.id), urls: await devPrUrls((path) => call("GET", path), issue.id) };
    },
    "confluence-page": () => {
      const id = String(args.id ?? "");
      if (!/^\d{1,20}$/.test(id)) fail(`refusing --id ${JSON.stringify(id)} — a Confluence page id is digits only`);
      return call("GET", `/wiki/api/v2/pages/${id}?body-format=storage`, { wiki: true });
    },
    request: () => {
      const method = String(args.method || "GET").toUpperCase();
      if (!["GET", "POST", "PUT"].includes(method)) fail(`--method ${method} is not allowed (GET, POST, PUT)`);
      const body = args["body-file"] ? readInput("body-file", args["body-file"], { json: true }) : undefined;
      return call(method, String(args.path || ""), { body });
    },
  };
  if (!commands[cmd]) fail(`unknown command "${cmd || ""}". Available: ${Object.keys(commands).join(", ")}`);
  Promise.resolve(commands[cmd]())
    .then((out) => {
      if (out && out._raw !== undefined) process.stdout.write(out._raw);
      else console.log(JSON.stringify(out, null, 2));
    })
    .catch((e) => fail(e?.message || String(e)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
