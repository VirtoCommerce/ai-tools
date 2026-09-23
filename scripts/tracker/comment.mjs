#!/usr/bin/env node
// Tracker comment helper — makes AMENDING as easy as posting.
//
// Rule source: .claude/knowledge/execution/tracker-ops.md §0 (GOLDEN RULE —
// ONE tracker comment per ticket per run; amend it, never append).
//
// WHY THIS EXISTS. The Atlassian MCP exposes `addCommentToJiraIssue` and nothing
// else — no edit, no delete. So when a run needed to correct itself the only
// affordance available was "post another comment", and it took it every time.
// Measured 2026-09-17 on VCST-5378: five comments in one hour, the last
// superseding the first three. The tool made the wrong thing the easy thing.
// This script gives `--amend` the same ergonomics as `--post`, and refuses a
// second `--post` for a ticket in the same run unless the operator says why.
//
// Usage:
//   npm run tracker:comment -- --ticket VCST-1234 --body-file body.md
//   npm run tracker:comment -- --ticket VCST-1234 --amend 109824 --body-file body.md
//   npm run tracker:comment -- --ticket VCST-1234 --get 109824
//   npm run tracker:comment -- --ticket VCST-1234 --delete 109823
//   npm run tracker:comment -- --ticket VCST-1234 --body-file body.md --force-new "PO asked for a separate note"
//   (add --dry-run to any of the above)
//
// Ledger: .tracker-comments.json (gitignored) maps ticket -> {comment_id, run_id, …}.
// It is what makes the rule mechanical instead of a judgment call, and it is what
// the PreToolUse hook reads. It is also mirrored into
// reports/tickets/*/<TICKET>/summary.json as `tracker.comment_id` when that file exists.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { wikiMarkupRefusal } from "../lib/jira-body-format.mjs";
import { markdownToAdf } from "./markdown-to-adf.mjs";

// config.js loads the layered .env files — and process.exit(1)s when the repo's CORE
// vars (ADMIN_PASSWORD, USER_PASSWORD, …) are missing. Only a real Jira call needs that
// env, so it is imported LAZILY, at the first network call: the ledger guard, the
// wiki-markup refusal and --dry-run must all work where no .env.local exists — which is
// exactly where the unit suite runs in CI.
let envLoaded;
const loadEnv = () => (envLoaded ??= import("../../config.js"));

const ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const LEDGER = resolve(ROOT, ".tracker-comments.json");

// ---------- args ----------
function parseArgs(argv) {
  const a = { mode: "post" };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === "--ticket") a.ticket = next();
    else if (k === "--body-file") a.bodyFile = next();
    else if (k === "--body") a.body = next();
    else if (k === "--amend") { a.mode = "amend"; a.id = next(); }
    else if (k === "--get") { a.mode = "get"; a.id = next(); }
    else if (k === "--delete") { a.mode = "delete"; a.id = next(); }
    else if (k === "--list") a.mode = "list";
    else if (k === "--force-new") { a.forceNew = next(); }
    else if (k === "--run-id") a.runId = next();
    else if (k === "--attach") { (a.attach ??= []).push(next()); }
    else if (k === "--wiki") a.wiki = true;
    else if (k === "--dry-run") a.dryRun = true;
    else if (k === "--help" || k === "-h") a.help = true;
  }
  return a;
}

const die = (msg, code = 1) => { console.error(`\n  ✗ ${msg}\n`); process.exit(code); };

// ---------- ledger ----------
const readLedger = () => {
  try { return JSON.parse(readFileSync(LEDGER, "utf8")); } catch { return {}; }
};
const writeLedger = (l) => writeFileSync(LEDGER, JSON.stringify(l, null, 2) + "\n");

/** A "run" is a Claude Code session when we have one, else an explicit --run-id. */
const runId = (a) => a.runId ?? process.env.CLAUDE_SESSION_ID ?? "local";

/** Mirror the id into the ticket's summary.json when one exists (best effort). */
function mirrorToSummary(ticket, commentId) {
  const base = resolve(ROOT, "reports/tickets");
  if (!existsSync(base)) return null;
  for (const sprint of readdirSync(base)) {
    const f = join(base, sprint, ticket, "summary.json");
    if (!existsSync(f)) continue;
    try {
      const j = JSON.parse(readFileSync(f, "utf8"));
      j.tracker = { ...(j.tracker ?? {}), comment_id: String(commentId) };
      writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
      return f;
    } catch { /* a malformed summary must not break the post */ }
  }
  return null;
}

// ---------- Jira ----------
async function jiraAuth() {
  await loadEnv();
  const email = process.env.JIRA_EMAIL, token = process.env.JIRA_API_TOKEN;
  const base = (process.env.JIRA_BASE_URL ?? process.env.JIRA_BASE ?? "").replace(/\/+$/, "");
  if (!email || !token) {
    die("JIRA_EMAIL / JIRA_API_TOKEN are not set (.env.local).\n" +
        "    Without them this helper cannot AMEND, and per tracker-ops.md §0 you may not\n" +
        "    fall back to posting a second comment. Hand the operator the corrected body instead.");
  }
  if (!base) die("JIRA_BASE_URL is not set (.env.local).");
  return { base, hdr: { Authorization: "Basic " + Buffer.from(`${email}:${token}`).toString("base64"), "Content-Type": "application/json", Accept: "application/json" } };
}

async function jira(method, path, body) {
  const { base, hdr } = await jiraAuth();
  const r = await fetch(`${base}${path}`, { method, headers: hdr, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* DELETE returns empty */ }
  if (!r.ok) die(`Jira ${method} ${path} -> ${r.status}\n    ${text.slice(0, 400)}`);
  return json;
}

/**
 * Upload files to the issue. The Atlassian MCP has NO attachment tool (§5c), so this
 * is the only path. Checks what is already attached first — a blind retry after a
 * broken output pipe duplicates every attachment.
 */
async function attachFiles(ticket, paths) {
  const { base, hdr } = await jiraAuth();
  const issue = await jira("GET", `/rest/api/3/issue/${ticket}?fields=attachment`);
  const already = new Map((issue?.fields?.attachment ?? []).map(x => [x.filename, x]));
  const out = [];
  for (const p of paths) {
    const abs = resolve(ROOT, p);
    if (!existsSync(abs)) die(`--attach: file not found: ${abs}`);
    const name = abs.split(/[\\/]/).pop();
    if (already.has(name)) {
      out.push({ name, id: already.get(name).id, reused: true });
      continue;
    }
    const fd = new FormData();
    fd.append("file", new Blob([readFileSync(abs)]), name);
    const r = await fetch(`${base}/rest/api/3/issue/${ticket}/attachments`, {
      method: "POST",
      headers: { Authorization: hdr.Authorization, "X-Atlassian-Token": "no-check" },
      body: fd,
    });
    const t = await r.text();
    if (!r.ok) die(`attach ${name} -> ${r.status}\n    ${t.slice(0, 300)}`);
    const j = JSON.parse(t);
    out.push({ name: j[0]?.filename ?? name, id: j[0]?.id, size: j[0]?.size, mime: j[0]?.mimeType });
  }
  return out;
}

/**
 * Read back ?expand=renderedBody and decide whether the media actually rendered.
 * reports.md §5.0 / tracker-ops.md §5c: a 200 OK proves nothing — an `external` media
 * node posts 201 and then renders "Can only create thumbnails for attached images".
 */
async function verifyRender(ticket, id, names) {
  const c = await jira("GET", `/rest/api/3/issue/${ticket}/comment/${id}?expand=renderedBody`);
  const html = c?.renderedBody ?? "";
  // The rendered <img src> carries the ATTACHMENT ID, never the filename — so the
  // filename is NOT a positive signal (measured 2026-09-17). The reliable per-file
  // signal is the absence of a surviving literal `!name!`.
  const imgs = (html.match(/<img[^>]+attachment\/content\//g) ?? []).length;
  const errors = (html.match(/<span class="error">/g) ?? []).length;
  // A legacy QuickTime/ActiveX plugin object — what .mp4/.webm degrade to. Not a player.
  const plugins = (html.match(/<div class="embeddedObject">/g) ?? []).length;
  const perFile = names.map(n => ({
    name: n,
    literalLeft: html.includes(`!${n}|`) || html.includes(`!${n}!`),
  }));
  return { imgs, errors, plugins, perFile, html };
}

// ---------- main ----------
const a = parseArgs(process.argv.slice(2));

if (a.help) {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").filter(l => l.startsWith("//")).map(l => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(0);
}

const ledger = readLedger();

if (a.mode === "list") {
  const rows = Object.entries(ledger);
  if (!rows.length) console.log("\n  (ledger empty — no comment posted from this checkout yet)\n");
  else {
    console.log("");
    for (const [t, e] of rows) console.log(`  ${t.padEnd(14)} comment ${String(e.comment_id).padEnd(10)} run=${e.run_id}  ${e.posted_at}`);
    console.log("");
  }
  process.exit(0);
}

if (!a.ticket) die("--ticket <KEY> is required.");

const profile = (() => {
  try { return JSON.parse(readFileSync(resolve(ROOT, "project-profile.json"), "utf8")); } catch { return {}; }
})();
const kind = profile?.tracker?.kind ?? "jira";
if (kind !== "jira") {
  die(`tracker.kind is "${kind}". This helper implements Jira only.\n` +
      `    For Azure Boards use the plugin's ado.mjs (\`ado.mjs comment --id <n> --text-file <path>\`),\n` +
      `    and amend with PATCH /comments/{id} (api-version 7.1-preview.4). The GOLDEN RULE is identical.`);
}

if (a.mode === "get") {
  const c = await jira("GET", `/rest/api/3/issue/${a.ticket}/comment/${a.id}`);
  console.log(typeof c?.body === "string" ? c.body : JSON.stringify(c?.body, null, 2));
  process.exit(0);
}

if (a.mode === "delete") {
  if (a.dryRun) { console.log(`\n  [dry-run] DELETE comment ${a.id} on ${a.ticket}\n`); process.exit(0); }
  await jira("DELETE", `/rest/api/3/issue/${a.ticket}/comment/${a.id}`);
  if (ledger[a.ticket]?.comment_id === String(a.id)) { delete ledger[a.ticket]; writeLedger(ledger); }
  console.log(`\n  ✓ deleted comment ${a.id} on ${a.ticket}\n`);
  process.exit(0);
}

// post / amend both need a body
const body = a.body ?? (a.bodyFile ? readFileSync(resolve(ROOT, a.bodyFile), "utf8") : null);
if (!body) die("--body-file <path> or --body <text> is required.");
// Two APIs, two formats (§5a + §5c): v3 takes MARKDOWN and cannot embed images;
// v2 takes WIKI markup and is the only path that renders an attachment inline.
// --attach therefore implies v2, and there the wiki check must NOT fire.
const useWiki = Boolean(a.wiki || a.attach?.length);
if (!useWiki) {
  const wiki = wikiMarkupRefusal(body);   // one detection, shared with the PreToolUse hook
  if (wiki) die(wiki);
}
const API = useWiki ? "2" : "3";

// v2 takes a WIKI-markup STRING; v3 takes ADF and REFUSES a string
// (`400 {"errors":{"comment":"Comment body is not valid!"}}`). The Atlassian MCP converts on POST,
// which is why posting worked and `--amend` did not — measured 2026-09-22 on VCST-5378, and it
// broke the one path tracker-ops.md §0 routes every correction through.
const wireBody = useWiki ? body : markdownToAdf(body);

const existing = ledger[a.ticket];
const thisRun = runId(a);

if (a.mode === "post" && existing && existing.run_id === thisRun && !a.forceNew) {
  die(`GOLDEN RULE (tracker-ops.md §0): ${a.ticket} already has a comment from this run.\n\n` +
      `    comment_id : ${existing.comment_id}\n` +
      `    posted_at  : ${existing.posted_at}\n\n` +
      `    Amend it instead of appending:\n` +
      `      npm run tracker:comment -- --ticket ${a.ticket} --amend ${existing.comment_id} --body-file <path>\n\n` +
      `    A genuinely separate comment needs the operator to ask, and a stated reason:\n` +
      `      … --force-new "<reason>"`);
}

// ---- attachments first: a wiki reference only resolves once the file is on the issue
let attached = [];
if (a.attach?.length) {
  if (a.dryRun) console.log(`\n  [dry-run] would attach: ${a.attach.join(", ")}`);
  else {
    attached = await attachFiles(a.ticket, a.attach);
    for (const f of attached) {
      console.log(`  ${f.reused ? "= already attached" : "✓ attached"}  ${f.name}${f.size ? `  ${(f.size / 1024).toFixed(0)} KB` : ""}${f.mime ? `  ${f.mime}` : ""}`);
    }
  }
}
const mediaNames = (a.attach ?? []).map(p => resolve(ROOT, p).split(/[\\/]/).pop());

async function reportRender(id) {
  if (!mediaNames.length) return;
  const v = await verifyRender(a.ticket, id, mediaNames);
  console.log(`\n    renderedBody check (§5c — a 200 OK proves nothing):`);
  console.log(`      <img …attachment/content/…> : ${v.imgs}`);
  console.log(`      <span class="error">        : ${v.errors}`);
  if (v.plugins) console.log(`      legacy plugin <object>      : ${v.plugins}`);
  for (const f of v.perFile) {
    console.log(`      ${f.literalLeft ? "✗" : "✓"} ${f.name}${f.literalLeft ? "  — LITERAL !name! survived: it did NOT render" : ""}`);
  }
  if (v.plugins) {
    console.log(`\n    ⚠ a video attachment rendered as a QuickTime ActiveX/NPAPI <object> — dead in every`);
    console.log(`      current browser. Use an animated GIF for motion evidence (reports-policy.md §5.2).`);
  }
  if (v.errors || v.perFile.some(f => f.literalLeft)) {
    console.log(`\n    ✗ media did NOT render. Do not post a corrected copy — amend this one.`);
  }
}

if (a.mode === "amend") {
  if (a.dryRun) { console.log(`\n  [dry-run] PUT (api v${API}) comment ${a.id} on ${a.ticket} (${body.length} chars)\n`); process.exit(0); }
  await jira("PUT", `/rest/api/${API}/issue/${a.ticket}/comment/${a.id}`, { body: wireBody });
  ledger[a.ticket] = { ...(existing ?? {}), comment_id: String(a.id), run_id: thisRun, amended_at: new Date().toISOString() };
  writeLedger(ledger);
  console.log(`\n  ✓ amended comment ${a.id} on ${a.ticket} (api v${API}) — no new notification thread`);
  await reportRender(a.id);
  console.log("");
  process.exit(0);
}

// post
if (a.dryRun) { console.log(`\n  [dry-run] POST (api v${API}) comment on ${a.ticket} (${body.length} chars)${a.forceNew ? ` — force-new: ${a.forceNew}` : ""}\n`); process.exit(0); }
const created = await jira("POST", `/rest/api/${API}/issue/${a.ticket}/comment`, { body: wireBody });
ledger[a.ticket] = {
  comment_id: String(created.id), run_id: thisRun, posted_at: new Date().toISOString(),
  ...(a.forceNew ? { force_new_reason: a.forceNew } : {}),
};
writeLedger(ledger);
const mirrored = mirrorToSummary(a.ticket, created.id);
console.log(`\n  ✓ posted comment ${created.id} on ${a.ticket} (api v${API})`);
console.log(`    ledger   : .tracker-comments.json`);
if (mirrored) console.log(`    summary  : ${mirrored.replace(ROOT + "\\", "").replace(ROOT + "/", "")}`);
await reportRender(created.id);
console.log(`\n    Any further change to this ticket in this run must AMEND:`);
console.log(`      npm run tracker:comment -- --ticket ${a.ticket} --amend ${created.id} --body-file <path>\n`);
