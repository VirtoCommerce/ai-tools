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
// second `--post` for a ticket in the same round unless the operator says why — and,
// since #360, refuses an `--amend` that would fold a NEW round (a new build, or a
// comment older than TRACKER_ROUND_HOURS) into the old comment: an edit notifies nobody.
// The decision itself lives in ./round-guard.mjs.
//
// Usage:
//   npm run tracker:comment -- --ticket VCST-1234 --artifact "<build under test>" --body-file body.md
//   npm run tracker:comment -- --ticket VCST-1234 --amend 109824 --artifact "<build under test>" --body-file body.md
//   npm run tracker:comment -- --ticket VCST-1234 --amend 109824 --body-file body.md --same-round "<reason>"
//   npm run tracker:comment -- --ticket VCST-1234 --get 109824
//   npm run tracker:comment -- --ticket VCST-1234 --delete 109823
//   npm run tracker:comment -- --ticket VCST-1234 --body-file body.md --force-new "PO asked for a separate note"
//   npm run tracker:comment -- --ticket VCST-1234 --body-file body.md --attach-file plan.md   # a FILE, linked
//   (add --dry-run to any of the above)
//
// --attach  <img>  uploads an IMAGE/GIF and embeds it inline — that forces the v2 API + wiki body (§5c).
// --attach-file <f> uploads any file (a plan, a report page, a log) and LINKS it: the body keeps its
//                   dialect and one `Attached:` line is appended. tracker-ops.md §5d — a deliverable too
//                   big for the comment travels as an attachment on the same ticket, referenced from the ONE
//                   comment. Re-attaching a same-name file is reused only when the size matches; a changed
//                   file uploads as a new attachment and the link points at the new one.
//
// Ledger: .tracker-comments.json (gitignored) maps ticket -> {comment_id, run_id, …}.
// It is what makes the rule mechanical instead of a judgment call, and it is what
// the PreToolUse hook reads. It is also mirrored into
// reports/tickets/*/<TICKET>/summary.json as `tracker.comment_id` when that file exists.

import "../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { wikiMarkupRefusal } from "../lib/jira-body-format.mjs";
import { markdownToAdf } from "./markdown-to-adf.mjs";
import { decide, roundHours, sessionRunId, effectiveEntry, ledgerAfterAmend } from "./round-guard.mjs";

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
    else if (k === "--artifact") a.artifact = next();
    else if (k === "--same-round") a.sameRound = next();
    else if (k === "--attach") { (a.attach ??= []).push(next()); }
    else if (k === "--attach-file") { (a.attachFile ??= []).push(next()); }
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
const runId = (a) => a.runId ?? sessionRunId();

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
async function attachFiles(ticket, paths, { flag = "--attach", matchSize = false } = {}) {
  const { base, hdr } = await jiraAuth();
  const issue = await jira("GET", `/rest/api/3/issue/${ticket}?fields=attachment`);
  // Newest last, so a later same-name upload wins the lookup.
  const already = new Map((issue?.fields?.attachment ?? [])
    .sort((x, y) => String(x.created).localeCompare(String(y.created)))
    .map(x => [x.filename, x]));
  const out = [];
  for (const p of paths) {
    const abs = resolve(ROOT, p);
    if (!existsSync(abs)) die(`${flag}: file not found: ${abs}`);
    const name = abs.split(/[\\/]/).pop();
    const prev = already.get(name);
    // --attach keeps its old rule (a same-name image is the same image: a wiki `!name!` cannot
    // tell two apart). --attach-file links by id, so a CHANGED file is uploaded, not silently reused.
    if (prev && (!matchSize || Number(prev.size) === statSync(abs).size)) {
      out.push({ name, id: prev.id, reused: true });
      continue;
    }
    if (prev) console.log(`  ! ${name}: an older attachment with this name exists (id ${prev.id}, ${prev.size} B) — uploading the changed file`);
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
let body = a.body ?? (a.bodyFile ? readFileSync(resolve(ROOT, a.bodyFile), "utf8") : null);
if (!body) die("--body-file <path> or --body <text> is required.");
// Fail before any network call or ledger decision, never half-way through a post.
for (const [flag, list] of [["--attach", a.attach], ["--attach-file", a.attachFile]]) {
  for (const p of list ?? []) if (!existsSync(resolve(ROOT, p))) die(`${flag}: file not found: ${resolve(ROOT, p)}`);
}
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
// Built after the uploads below, because an --attach-file link needs the attachment id.
const toWire = (b) => (useWiki ? b : markdownToAdf(b));

const thisRun = runId(a);
// The ledger is per checkout: an amend of a comment it does not know (another worktree or clone
// posted it), or one whose entry has no posted_at, takes its age from Jira itself. Skipped on
// --dry-run, which must stay offline.
const recorded = ledger[a.ticket];
const needsRemote = a.mode === "amend" && !a.dryRun &&
  !(recorded && String(recorded.comment_id) === String(a.id) && recorded.posted_at);
const remote = needsRemote ? await jira("GET", `/rest/api/3/issue/${a.ticket}/comment/${a.id}`) : null;
const existing = a.mode === "amend" ? effectiveEntry(recorded, a.id, remote) : recorded;

// One decision for BOTH directions (round-guard.mjs) — the unguarded --amend is what let
// VCST-5883's round 2 vanish into round 1's comment.
const hours = roundHours();
const verdict = decide({ mode: a.mode, entry: existing, commentId: a.id, run: thisRun, artifact: a.artifact, hours, forceNew: a.forceNew, sameRound: a.sameRound });
const artifactArg = a.artifact ? `--artifact "${a.artifact.trim()}"` : `--artifact "<build under test>"`;
const REFUSAL = {
  SAME_ROUND: `GOLDEN RULE (tracker-ops.md §0): ${a.ticket} already has a comment for this build.\n\n` +
    `    comment_id : ${existing?.comment_id}\n    artifact   : ${existing?.artifact}\n    posted_at  : ${existing?.posted_at}\n\n` +
    `    Amend it instead of appending:\n      npm run tracker:comment -- --ticket ${a.ticket} --amend ${existing?.comment_id} ${artifactArg} --body-file <path>\n\n` +
    `    A genuinely separate comment needs the operator to ask, and a stated reason:\n      … --force-new "<reason>"`,
  SAME_RUN: `GOLDEN RULE (tracker-ops.md §0): ${a.ticket} already has a comment from this run.\n\n` +
    `    comment_id : ${existing?.comment_id}\n    posted_at  : ${existing?.posted_at}\n\n` +
    `    Same build (a correction)? Amend it:\n      npm run tracker:comment -- --ticket ${a.ticket} --amend ${existing?.comment_id} --artifact "<build under test>" --body-file <path>\n\n` +
    `    NEW build (a retest — rule 5)? Name it, and the post is allowed as a new round:\n      … ${artifactArg}\n\n` +
    `    Otherwise a separate comment needs the operator to ask:  … --force-new "<reason>"`,
  NEW_ROUND_AMEND: `NEW ROUND (tracker-ops.md §0 rule 5): comment ${a.id} records build "${existing?.artifact}", you tested "${a.artifact?.trim()}".\n` +
    `    An amend notifies nobody — the developer and PO would never learn this retest happened.\n\n` +
    `    Post a new comment for the new round:\n      npm run tracker:comment -- --ticket ${a.ticket} ${artifactArg} --body-file <path>`,
  OTHER_RUN_AMEND: `Comment ${a.id} was posted by another session (${existing?.posted_at}) — is this a new round?
` +
    `    An amend notifies nobody. A retest of a new build needs a NEW comment:
` +
    `      npm run tracker:comment -- --ticket ${a.ticket} ${artifactArg} --body-file <path>

` +
    `    Continuing the SAME round from a new session: … --same-round "<reason>"`,
  NO_ARTIFACT_AMEND: `Comment ${a.id} records build "${existing?.artifact}" and this amend names no build.\n` +
    `    Without one the round cannot be checked, and an amend notifies nobody.\n\n` +
    `    Same build (a correction):  … --amend ${a.id} --artifact "${existing?.artifact}" --body-file <path>\n` +
    `    A NEW build (a retest):     npm run tracker:comment -- --ticket ${a.ticket} --artifact "<build under test>" --body-file <path>\n` +
    `    Same round, no build to name:  … --same-round "<reason>"`,
  STALE_AMEND: `Comment ${a.id} is from ${existing?.posted_at} (older than ${hours} h) — is this a new round?\n` +
    `    An amend notifies nobody. A retest of a new build needs a NEW comment:\n` +
    `      npm run tracker:comment -- --ticket ${a.ticket} ${artifactArg} --body-file <path>\n\n` +
    `    A correction of the SAME round: pass the build (${artifactArg}) or a reason:  … --same-round "<reason>"`,
};
if (!verdict.ok) die(REFUSAL[verdict.code]);
if (verdict.code === "NEW_ROUND") console.log(`\n  ↻ new round: ${existing.artifact} → ${a.artifact.trim()}`);
if (verdict.code === "STALE") console.log(`\n  ↻ new round by age: the last comment is from ${existing.posted_at} (older than ${hours} h). Pass --artifact next time.`);

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

// ---- files: upload (or reuse), then ONE appended `Attached:` line that links each by id
let linked = [];
if (a.attachFile?.length) {
  const jiraBase = (process.env.JIRA_BASE_URL ?? process.env.JIRA_BASE ?? "<jira>").replace(/\/+$/, "");
  if (a.dryRun) {
    linked = a.attachFile.map(p => ({ name: resolve(ROOT, p).split(/[\\/]/).pop(), id: "<id>" }));
    console.log(`\n  [dry-run] would attach and link: ${linked.map(f => f.name).join(", ")}`);
  } else {
    linked = await attachFiles(a.ticket, a.attachFile, { flag: "--attach-file", matchSize: true });
    for (const f of linked) {
      console.log(`  ${f.reused ? "= already attached" : "✓ attached"}  ${f.name}  (id ${f.id})${f.size ? `  ${(f.size / 1024).toFixed(0)} KB` : ""}`);
    }
  }
  // `(` `)` survive encodeURIComponent and would end a Markdown link early.
  const url = f => `${jiraBase}/secure/attachment/${f.id}/${encodeURIComponent(f.name).replace(/[()]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
  const links = linked.map(f => (useWiki ? `[${f.name}|${url(f)}]` : `[${f.name}](${url(f)})`)).join(" · ");
  body = `${body.replace(/\s+$/, "")}\n\n${useWiki ? "*Attached:*" : "**Attached:**"} ${links}\n`;
  if (a.dryRun) console.log(`  [dry-run] appended: ${body.trim().split("\n").pop()}`);
}
const wireBody = toWire(body);

async function reportRender(id) {
  if (linked.length) {
    const c = await jira("GET", `/rest/api/3/issue/${a.ticket}/comment/${id}?expand=renderedBody`);
    const html = c?.renderedBody ?? "";
    console.log(`\n    renderedBody check (--attach-file links):`);
    for (const f of linked) {
      const ok = html.includes(`/secure/attachment/${f.id}/`);
      console.log(`      ${ok ? "✓" : "✗"} ${f.name} → attachment ${f.id}${ok ? "" : "  — link NOT found in the rendered comment"}`);
    }
  }
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
  // Amending an OLDER comment must not erase the current round's entry (round-guard.mjs ledgerAfterAmend).
  ledger[a.ticket] = ledgerAfterAmend(recorded, existing, { id: a.id, run: thisRun, artifact: a.artifact, sameRound: a.sameRound });
  writeLedger(ledger);
  console.log(`\n  ✓ amended comment ${a.id} on ${a.ticket} (api v${API}) — an edit notifies NOBODY; a new build is a new comment (--artifact)`);
  await reportRender(a.id);
  console.log("");
  process.exit(0);
}

// post
if (a.dryRun) { console.log(`\n  [dry-run] POST (api v${API}) comment on ${a.ticket} (${body.length} chars)${a.forceNew ? ` — force-new: ${a.forceNew}` : ""}\n`); process.exit(0); }
const created = await jira("POST", `/rest/api/${API}/issue/${a.ticket}/comment`, { body: wireBody });
ledger[a.ticket] = {
  comment_id: String(created.id), run_id: thisRun, posted_at: new Date().toISOString(),
  ...(a.artifact ? { artifact: a.artifact.trim() } : {}),
  ...(a.forceNew ? { force_new_reason: a.forceNew } : {}),
};
writeLedger(ledger);
const mirrored = mirrorToSummary(a.ticket, created.id);
console.log(`\n  ✓ posted comment ${created.id} on ${a.ticket} (api v${API})`);
console.log(`    ledger   : .tracker-comments.json`);
if (mirrored) console.log(`    summary  : ${mirrored.replace(ROOT + "\\", "").replace(ROOT + "/", "")}`);
await reportRender(created.id);
console.log(`\n    Any further change to this ticket in this run must AMEND:`);
console.log(`      npm run tracker:comment -- --ticket ${a.ticket} --amend ${created.id} --artifact "<build under test>" --body-file <path>\n`);
