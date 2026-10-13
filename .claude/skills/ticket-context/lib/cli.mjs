#!/usr/bin/env node
// .claude/skills/ticket-context/lib/cli.mjs — the deterministic half of /ticket-context (design §5).
// Exit: 0 ok · 1 usage · 2 gate or schema failed · 3 could not run. stdout is one JSON object; no secret is printed.
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { assertKey, cacheDir, isInside, newRunDir, outputRoot, removeRunDir, sweepStaleRuns } from "./paths.mjs";
import { loadLayeredEnv } from "./env.mjs";
import { codeHostCredential, readProfile, resolveProfile, trackerCredential } from "./profile.mjs";
import { GAP_REASONS, SCHEMA, asGap, gap } from "./gap.mjs";
import { validateDef } from "./schema.mjs";
import { BASE_FIELDS, LINKED_FIELDS, jiraClient } from "./jira.mjs";
import { AC_FIELD_NAME_RE, buildInventory, linkedOverCap, rankLinked, resolveFieldsByName } from "./inventory.mjs";
import { CAPS, envHosts, fetchPublicPage, htmlToText, planDownloads, safeName } from "./fetch.mjs";
import { exportFigmaFrame, figmaToken } from "./figma.mjs";
import { extractFrames, extractGifFrames } from "./frames.mjs";
import { isHarText, loadSecretValues, scrubFile } from "./scrub.mjs";
import { CONTEXT_ONLY_REPOS, collectContextPr, collectPr, followCompanions, ghClient, orderPrMeta, runLadder } from "./github.mjs";
import { checkDeployment } from "./deploy.mjs";
import { freshnessKey, isIgnored, readCached, skillFingerprint, writeCache } from "./cache.mjs";
import { DOMAIN_RE, knownGround } from "./known.mjs";
import { CHANGE_PART_RE, OUT_FILES, checkAgentOutputs, compose, mergeChange } from "./compose.mjs";
import { checkBundle } from "./check-bundle.mjs";

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n) => { const i = argv.indexOf(`--${n}`); return i > 0 ? argv[i + 1] : undefined; };
const has = (n) => argv.includes(`--${n}`);
const out = (o) => process.stdout.write(`${JSON.stringify(o, null, 2)}\n`);
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, o) => writeFileSync(p, JSON.stringify(o, null, 2));
/** An output a model (or the runner) wrote: unparsable is a schema failure naming the file — the documented
 *  re-dispatch path (exit 2) — never a crash (exit 3). */
const readOutput = (dir, name, errors) => { try { return readJson(join(dir, name)); } catch { errors.push(`${name}: not valid JSON`); return undefined; } };
const USAGE = "usage: cli.mjs prepare <KEY> [--domain <slug>] [--fresh] | attach --prepare <p> --ref <ref> (--file <path> | --gap <reason> [--detail <text>]) | merge-change --prepare <p> | deploy --prepare <p> | known --prepare <p> | compose --prepare <p> | check --prepare <p> | finish --prepare <p> | abort --prepare <p> | redeploy <KEY> --bundle <p>";
function usage(msg) { console.error(`✗ ${msg}\n${USAGE}`); process.exit(1); }
const root = outputRoot();
const ignored = (p) => isIgnored(root, p);
const prepPath = () => flag("prepare") ?? usage("--prepare <path to prepare.json> is required");

async function materialize(it, jira, runDir, secrets) {
  const file = join(runDir, `att-${it.id}-${safeName(it.filename)}`);
  try { writeFileSync(file, await jira.download(it.url)); } catch (e) { it.gap = asGap(it.ref, e); return; }
  if (["har", "log", "trace"].includes(it.kind)) {
    try {
      if (it.kind !== "har" && isHarText(readFileSync(file, "utf8"))) it.kind = "har"; // classified by content: a HAR saved as .json
      it.local_path = scrubFile(file, it.kind, secrets);
      it.scrubbed = true;
    }
    catch (e) { it.gap = gap(it.ref, "unreadable", `could not scrub: ${String(e.message).slice(0, 150)}`); }
    finally { rmSync(file, { force: true }); } // the raw file never outlives this function (S2)
    return;
  }
  if (it.kind === "video") {
    let r;
    try { r = extractFrames(file, join(runDir, `frames-${it.id}`), CAPS); }
    catch (e) { r = { gap: { reason: "unreadable", detail: `could not extract frames: ${String(e.message).slice(0, 150)}` } }; }
    finally { rmSync(file, { force: true }); } // the raw video never outlives this function (S3)
    if (r.gap) it.gap = gap(it.ref, r.gap.reason, r.gap.detail); else it.local_path = r.dir;
    return;
  }
  if (it.kind === "screenshot" || it.kind === "image") {
    // An animated GIF is a video (D4): its frames, or a tool-missing gap — never a finding from frame 1.
    let r = null;
    try { r = extractGifFrames(file, join(runDir, `frames-${it.id}`), CAPS); }
    catch (e) { r = { gap: { reason: "unreadable", detail: `could not read the GIF's frames: ${String(e.message).slice(0, 150)}` } }; }
    if (r) {
      rmSync(file, { force: true });
      it.kind = "video";
      it.animated_gif = true;
      if (r.gap) it.gap = gap(it.ref, r.gap.reason, r.gap.detail); else it.local_path = r.dir;
      return;
    }
  }
  it.local_path = file;
}

async function prepare() {
  const key = argv[1];
  try { assertKey(key); } catch (e) { usage(e.message); }
  // S3: a run dir a crashed or STOPped run left behind (either shape) goes first, before any cache return.
  try { sweepStaleRuns(key, { root }); } catch { /* a failed sweep never blocks the run; the next prepare retries */ }
  const domain = flag("domain") ?? null; // part of the freshness key: known ground differs per domain
  if (domain !== null && !DOMAIN_RE.test(domain)) usage("--domain must be a slug: letters, digits, '-' or '_'");
  loadLayeredEnv(root);
  const profile = resolveProfile(readProfile(root));
  const tcred = trackerCredential(profile);
  if (!tcred.ok) { out({ status: "no-tracker", gap: gap("ticket", tcred.reason, tcred.detail) }); process.exit(3); }
  const jira = jiraClient(tcred);
  const gaps = [];

  const allFields = await jira.fields();
  const acFields = resolveFieldsByName(allFields, profile.fieldMap.acceptanceCriteria, AC_FIELD_NAME_RE);
  const linkFields = resolveFieldsByName(allFields, profile.fieldMap.prototype, /prototype/i);
  if (!acFields.length) gaps.push(gap("ac_fields", "not-found", "no custom field named 'Acceptance' or 'Acceptance criteria' and no tracker.fieldMap.acceptanceCriteria — ACs are read from description and comments"));
  // Comments past the first page are paged in before the inventory and ticket.json see the issue; any unread rest is a gap.
  const issue = await jira.issue(key, [...BASE_FIELDS, ...acFields.map((f) => f.id), ...linkFields.map((f) => f.id)], { gaps });
  const remote = await jira.remoteLinks(key).catch((e) => { gaps.push(asGap("remotelinks", e)); return []; });
  const devPrUrls = await jira.devPrUrls(issue.id).catch((e) => { gaps.push(asGap("dev-status", e)); return []; });
  const inv = buildInventory({ issue, remoteLinks: remote, trackerBase: tcred.base, acFieldIds: acFields.map((f) => f.id), linkFieldIds: linkFields.map((f) => f.id), devPrUrls });

  let epic = null;
  let siblings = [];
  const parent = issue.fields.parent;
  if (parent?.key) {
    epic = { key: parent.key, title: parent.fields?.summary ?? "" };
    siblings = (await jira.search(`parent = ${parent.key} AND key != ${key} ORDER BY updated DESC`, ["summary", "status"]).catch((e) => { gaps.push(asGap("siblings", e)); return []; }))
      .map((s) => ({ key: s.key, title: s.fields?.summary ?? "", status: s.fields?.status?.name ?? null, done: s.fields?.status?.statusCategory?.key === "done" }));
  }

  let linked = inv.items.filter((i) => i.kind === "ticket" && !i.gap);
  // D12: over the cap, the cap keeps the right ones — ranked by relation, then most recently updated first.
  // The dates cost one search, made only when there is something to drop.
  if (linked.length > CAPS.linkedIssues) {
    const keys = linked.map((i) => i.key);
    const updated = new Map((await jira.search(`key in (${keys.join(",")}) ORDER BY updated DESC`, ["updated"], Math.min(keys.length, 100))
      .catch((e) => { gaps.push(asGap("linked-issues.order", e)); return []; })).map((j) => [j.key, j.fields?.updated ?? ""]));
    linked = rankLinked(linked, { parentKey: issue.fields.parent?.key ?? null, subtaskKeys: (issue.fields.subtasks ?? []).map((t) => t.key), updated });
  }
  const linkedJson = new Map();
  for (const [n, it] of linked.entries()) {
    if (n >= CAPS.linkedIssues) { it.gap = linkedOverCap(it, n, CAPS.linkedIssues); continue; }
    try { linkedJson.set(it.key, await jira.issue(it.key, LINKED_FIELDS)); } catch (e) { it.gap = asGap(it.ref, e); }
  }

  const orgs = profile.repoHosts.filter((h) => h.host === "github").map((h) => h.org);
  for (const h of profile.repoHosts.filter((x) => x.host !== "github")) gaps.push(gap(`change.${h.org}`, "connector-unavailable", `${h.host} pull requests are read from Phase 5 on`));
  const gcred = codeHostCredential(profile);
  const gh = gcred.ok ? ghClient(gcred) : null;
  if (!gh) gaps.push(gap("change", gcred.reason, gcred.detail));
  const ladder = gh ? await runLadder({ gh, key, orgs, explicitRefs: inv.prRefs, gaps }) : { rung: null, refs: inv.prRefs, sameKey: [], ladder: [] };
  const prMeta = [];
  for (const r of ladder.refs) {
    if (!gh) { prMeta.push({ ...r, gap: gap(`pr:${r.ref}`, gcred.reason, gcred.detail) }); continue; }
    try { prMeta.push({ ...r, meta: await gh.pr(r.owner, r.repo, r.number) }); } catch (e) { prMeta.push({ ...r, gap: asGap(`pr:${r.ref}`, e) }); }
  }
  orderPrMeta(prMeta);
  // Named companions, one hop (github.mjs): appended after the ladder's PRs, so they take only the cap left over.
  if (gh) {
    const companions = await followCompanions({ gh, prMeta, orgs, gaps });
    ladder.ladder.push({ rung: "companion", found: companions.length });
    prMeta.push(...companions);
  }

  const fk = freshnessKey({ ticketUpdated: issue.fields.updated, domain, skill: skillFingerprint(),
    prShas: prMeta.map((p) => `${p.ref}@${p.meta?.head?.sha ?? "?"}@${p.meta?.state ?? "?"}@${p.meta?.merged_at ?? ""}`),
    linkedUpdated: [...linkedJson.values()].map((j) => `${j.key}@${j.fields?.updated}`) });
  const cachedFile = join(cacheDir(key, root), "bundle.json");
  if (!has("fresh") && readCached(cachedFile, fk)) { out({ status: "cached", bundle_path: cachedFile }); return; }

  const { dir: runDir, inProject } = newRunDir(key, { root, ignored });
  try {
    const ticketJson = join(runDir, "ticket.json");
    writeJson(ticketJson, issue);
    for (const it of linked) if (linkedJson.has(it.key)) { it.local_path = join(runDir, `issue-${it.key}.json`); writeJson(it.local_path, linkedJson.get(it.key)); }

    const secrets = loadSecretValues(root);
    // An attachment the agent cannot read is never downloaded: its outcome is recorded without the bytes.
    for (const it of inv.items) if (it.ref.startsWith("attachment:") && it.kind === "other" && !it.gap) {
      it.gap = gap(it.ref, "unreadable", "not a format the agent can read — not downloaded; ask for a PDF, an image or text");
    }
    const plan = planDownloads(inv.items.filter((i) => i.ref.startsWith("attachment:")), CAPS);
    for (const [ref, g] of plan.gaps) inv.items.find((i) => i.ref === ref).gap = g;
    for (const it of plan.toFetch) await materialize(it, jira, runDir, secrets);

    const privateHosts = new Set([...envHosts(root), new URL(tcred.base).hostname, "github.com", "api.github.com"]);
    let pages = 0;
    let figmas = 0;
    const figma = figmaToken(); // FIGMA_TOKEN after the layered loader; never printed
    for (const it of inv.items.filter((i) => i.ref.startsWith("link:") && !i.gap)) {
      if (it.kind === "confluence") {
        const id = /\/pages\/(\d+)/.exec(it.url)?.[1];
        if (!id) { it.gap = gap(it.ref, "unreadable", "no page id in the Confluence URL"); continue; }
        try {
          const page = await jira.confluencePage(id);
          it.local_path = join(runDir, `confluence-${id}.txt`);
          writeFileSync(it.local_path, htmlToText(page.body?.storage?.value ?? "").slice(0, CAPS.pageTextBytes));
        } catch (e) { it.gap = asGap(it.ref, e); }
      } else if (it.kind === "external") {
        try { it.local_path = (await fetchPublicPage(it.url, join(runDir, `page-${++pages}.txt`), { privateHosts })).path; } catch (e) { it.gap = asGap(it.ref, e); }
      } else if (it.kind === "figma" && figma) {
        try { it.local_path = await exportFigmaFrame({ url: it.url, token: figma, file: join(runDir, `figma-${++figmas}.png`) }); } catch (e) { it.gap = asGap(it.ref, e); }
      } else it.needs_connector = true; // loom · figma without FIGMA_TOKEN · claude-design — step 1 of SKILL.md
    }

    const prs = [];
    // P5: the cap is for CHANGE SURFACE. Product PRs come first (rung 1 first, then newest first) and only they count; a context-only
    // PR (ai-tools, vc-deploy-dev) gets its metadata only — no files, no diff — and never pushes a product PR over the cap.
    let product = 0;
    for (const p of prMeta) {
      const contextOnly = CONTEXT_ONLY_REPOS.includes(p.repo.toLowerCase());
      const base = { ref: p.ref, repo: `${p.owner}/${p.repo}`, number: p.number, rung: p.rung ?? null, ...(p.found_via ? { found_via: p.found_via } : {}), context_only: contextOnly };
      if (p.gap) { prs.push({ ...base, gap: p.gap }); if (!contextOnly) product++; continue; }
      if (contextOnly) {
        try { prs.push(collectContextPr(p, base, runDir, ladder.sameKey)); } catch (e) { prs.push({ ...base, gap: asGap(`pr:${p.ref}`, e) }); }
        continue;
      }
      if (product++ >= CAPS.prs) {
        prs.push({ ...base, state: p.meta.state, merged: !!p.meta.merged_at, head_sha: p.meta.head?.sha ?? null,
          gap: gap(`pr:${p.ref}`, "over-cap", `more than ${CAPS.prs} product PRs; rung 1 first, then the most recent, then the companions they name`) });
        continue;
      }
      try { prs.push(await collectPr(gh, p, runDir, { sameKey: ladder.sameKey })); } catch (e) { prs.push({ ...base, gap: asGap(`pr:${p.ref}`, e) }); }
    }

    const prepared = { schema: "ticket-context-prepare/1", ticket: key, tracker: profile.tracker, project_type: profile.projectType, domain, run_dir: runDir, run_dir_in_project: inProject,
      fetched_at: new Date().toISOString(), ticket_updated: issue.fields.updated, freshness_key: fk, ticket_json: ticketJson,
      ac_fields: acFields, link_fields: linkFields, epic, siblings, inventory: inv.items, prs, rung: ladder.rung, ladder: ladder.ladder, gaps };
    const prepPathOut = join(runDir, "prepare.json");
    writeJson(prepPathOut, prepared);
    out({ status: "prepared", prepare_path: prepPathOut, run_dir: runDir, run_dir_in_project: inProject, inventory: inv.items.length, prs: prs.length,
      rung: ladder.rung, needs_connector: inv.items.filter((i) => i.needs_connector).map((i) => i.ref), gaps: gaps.length });
  } catch (e) {
    try { removeRunDir(runDir, root); } catch { /* the original failure is the one to report */ }
    throw e;
  }
}

function attach() {
  const p = prepPath();
  const prep = readJson(p);
  const ref = flag("ref") ?? usage("--ref is required");
  const it = prep.inventory.find((i) => i.ref === ref);
  if (!it) usage(`no inventory item ${ref}`);
  if (!it.needs_connector) usage(`${ref} is not a connector-only item`);
  const file = flag("file");
  const reason = flag("gap");
  if (file) {
    const abs = resolve(file);
    if (!existsSync(abs) || ![prep.run_dir, join(root, ".design-source")].some((d) => isInside(d, abs))) usage(`--file must exist under the run dir or .design-source/: ${abs}`);
    it.local_path = abs;
    delete it.gap;
  } else if (reason) {
    if (!GAP_REASONS.includes(reason)) usage(`--gap must be one of ${GAP_REASONS.join(", ")}`);
    it.gap = gap(ref, reason, flag("detail"));
  } else usage("attach needs --file or --gap");
  writeJson(p, prep);
  out({ status: "attached", ref, local_path: it.local_path ?? null, gap: it.gap ?? null });
}

/** Step 2 with one CHANGE dispatch per product PR: change.<n>.out.json (each saved verbatim) → change.out.json. */
function mergeChangeCmd() {
  const prep = readJson(prepPath());
  const names = readdirSync(prep.run_dir).filter((n) => CHANGE_PART_RE.test(n))
    .sort((a, b) => Number(CHANGE_PART_RE.exec(a)[1]) - Number(CHANGE_PART_RE.exec(b)[1]));
  if (!names.length) { console.error("✗ no change.<n>.out.json in the run dir — save each CHANGE output first"); process.exit(3); }
  const parseErrors = [];
  const parts = names.map((name) => ({ name, out: readOutput(prep.run_dir, name, parseErrors) }));
  if (parseErrors.length) { out({ status: "schema-failed", errors: parseErrors }); process.exit(2); }
  const { errors, merged } = mergeChange(parts);
  if (errors.length) { out({ status: "schema-failed", errors }); process.exit(2); }
  writeJson(join(prep.run_dir, OUT_FILES.change), merged);
  out({ status: "merged", parts: names.length, prs: merged.prs.length });
}

function deploy() {
  const prep = readJson(prepPath());
  const d = checkDeployment({ root, key: prep.ticket, prs: prep.prs });
  writeJson(join(prep.run_dir, OUT_FILES.deploy), d);
  out({ status: "deploy-checked", chain_deployed: d.chain_deployed, blockers: d.blockers });
}

function known() {
  if (has("domain")) usage("--domain is given to prepare (it is part of the cache key); known reads it from prepare.json");
  const prep = readJson(prepPath());
  const changeFile = join(prep.run_dir, OUT_FILES.change);
  let operations = [];
  const extra = [];
  if (existsSync(changeFile)) {
    // A malformed CHANGE output means no observables, said as a gap — never a crash of this step.
    try {
      const c = readJson(changeFile);
      if (!Array.isArray(c?.prs)) throw new Error("no prs[]");
      const list = (v) => (Array.isArray(v) ? v : []);
      operations = [...new Set(c.prs.flatMap((x) => [...list(x?.operations), ...list(x?.endpoints)]))];
    } catch { extra.push(gap("known.observables", "unreadable", "change.out.json is not valid CHANGE output — no operations or endpoints passed to tc:scope")); }
  }
  const k = knownGround({ root, key: prep.ticket, domain: prep.domain ?? undefined, prs: prep.prs, operations, runDir: prep.run_dir });
  k.gaps.push(...extra);
  writeJson(join(prep.run_dir, OUT_FILES.known), k);
  out({ status: "known", domain_map: k.known.domain_map.state, bl: k.known.bl.length, cases_at_risk: k.known.cases_at_risk.length, prior_runs: k.known.prior_runs.length, gaps: k.gaps.length });
}

function composeCmd() {
  const prep = readJson(prepPath());
  const outs = {};
  const parseErrors = [];
  for (const [k, f] of Object.entries(OUT_FILES)) {
    const fp = join(prep.run_dir, f);
    if (existsSync(fp)) outs[k] = readOutput(prep.run_dir, f, parseErrors);
    else if (k !== "kb") { console.error(`✗ missing ${f} in the run dir — run the step that writes it`); process.exit(3); }
  }
  if (parseErrors.length) { out({ status: "schema-failed", errors: parseErrors }); process.exit(2); }
  const errors = checkAgentOutputs(outs);
  if (errors.length) { out({ status: "schema-failed", errors }); process.exit(2); }
  const bp = join(prep.run_dir, "bundle.json");
  writeJson(bp, compose(prep, outs));
  out({ status: "composed", bundle_path: bp });
}

function gate(prep) {
  const bundle = readJson(join(prep.run_dir, "bundle.json"));
  return { bundle, errors: checkBundle(bundle, prep, { secrets: loadSecretValues(root) }) };
}

function check() {
  const { errors } = gate(readJson(prepPath()));
  out({ status: errors.length ? "gate-failed" : "gate-passed", errors });
  process.exit(errors.length ? 2 : 0);
}

function finish() {
  const prep = readJson(prepPath());
  const { bundle, errors } = gate(prep);
  if (errors.length) { out({ status: "gate-failed", errors }); process.exit(2); }
  const target = join(cacheDir(prep.ticket, root), "bundle.json");
  const c = writeCache(root, target, bundle, ignored);
  const final = c.cached ? target : join(tmpdir(), `ticket-context-${prep.ticket}-bundle.json`);
  if (!c.cached) writeJson(final, bundle);
  removeRunDir(prep.run_dir, root);
  out({ status: "done", bundle_path: final, cached: c.cached, ...(c.cached ? {} : { reason: c.reason }) });
}

/** Every STOP after prepare: the run dir (raw client data) is deleted now, not left for the 24 h sweep. */
function abort() {
  const dir = dirname(resolve(prepPath())); // prepare.json sits at the run dir's root
  removeRunDir(dir, root); // refuses anything that is not a run dir of this skill
  out({ status: "aborted", run_dir: dir });
}

function redeploy() {
  const key = argv[1];
  try { assertKey(key); } catch (e) { usage(e.message); }
  const bp = flag("bundle") ?? usage("--bundle is required");
  const b = readJson(bp);
  // Script values only: compose took repo, number, state, merged and gap from prepare, never from an agent.
  const d = checkDeployment({ root, key, prs: b.change.prs.map((p) => ({ ref: `${p.repo}#${p.number}`, number: p.number, state: p.state, merged: p.merged,
    context_only: p.context_only, gap: p.gap })) });
  const byRef = new Map(d.prs.map((r) => [r.ref, r]));
  for (const p of b.change.prs) {
    const r = byRef.get(`${p.repo}#${p.number}`);
    if (r) Object.assign(p, { artifact: r.artifact, deployed: r.deployed, deployed_reason: r.deployed_reason });
  }
  b.change.chain_deployed = d.chain_deployed;
  b.blockers = [...b.blockers.filter((l) => !/^(NOT DEPLOYED|DEPLOYMENT UNKNOWN): /.test(l)), ...d.blockers];
  const errors = validateDef(b, SCHEMA, "bundle");
  if (errors.length) { out({ status: "schema-failed", errors }); process.exit(2); }
  writeJson(bp, b);
  out({ status: "redeployed", bundle_path: bp, chain_deployed: d.chain_deployed, blockers: d.blockers });
}

const commands = { prepare, attach, "merge-change": mergeChangeCmd, deploy, known, compose: composeCmd, check, finish, abort, redeploy };
if (!commands[cmd]) usage(cmd ? `unknown command "${cmd}"` : "no command");
try { await commands[cmd](); } catch (e) {
  console.error(`✗ ticket-context ${cmd} could not run: ${String(e?.message ?? e).slice(0, 300)}`);
  process.exit(3);
}
