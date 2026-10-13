#!/usr/bin/env node
// .claude/skills/ticket-context/lib/cli.mjs — the deterministic half of /ticket-context (design §5).
// Exit: 0 ok · 1 usage · 2 gate or schema failed · 3 could not run. stdout is one JSON object; no secret is printed.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { assertKey, cacheDir, isInside, newRunDir, outputRoot, removeRunDir } from "./paths.mjs";
import { loadLayeredEnv } from "./env.mjs";
import { codeHostCredential, readProfile, resolveProfile, trackerCredential } from "./profile.mjs";
import { GAP_REASONS, SCHEMA, asGap, gap } from "./gap.mjs";
import { validateDef } from "./schema.mjs";
import { BASE_FIELDS, LINKED_FIELDS, jiraClient } from "./jira.mjs";
import { buildInventory, resolveFieldsByName } from "./inventory.mjs";
import { CAPS, envHosts, fetchPublicPage, htmlToText, planDownloads, safeName } from "./fetch.mjs";
import { extractFrames } from "./frames.mjs";
import { loadSecretValues, scrubFile } from "./scrub.mjs";
import { CONTEXT_ONLY_REPOS, collectPr, ghClient, laterPrs, runLadder } from "./github.mjs";
import { checkDeployment } from "./deploy.mjs";
import { freshnessKey, isIgnored, readCached, writeCache } from "./cache.mjs";
import { knownGround } from "./known.mjs";
import { OUT_FILES, checkAgentOutputs, compose } from "./compose.mjs";
import { checkBundle } from "./check-bundle.mjs";

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n) => { const i = argv.indexOf(`--${n}`); return i > 0 ? argv[i + 1] : undefined; };
const has = (n) => argv.includes(`--${n}`);
const out = (o) => process.stdout.write(`${JSON.stringify(o, null, 2)}\n`);
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, o) => writeFileSync(p, JSON.stringify(o, null, 2));
const USAGE = "usage: cli.mjs prepare <KEY> [--fresh] | attach --prepare <p> --ref <ref> (--file <path> | --gap <reason> [--detail <text>]) | deploy --prepare <p> | known --prepare <p> [--domain <slug>] | compose --prepare <p> | check --prepare <p> | finish --prepare <p> | redeploy <KEY> --bundle <p>";
function usage(msg) { console.error(`✗ ${msg}\n${USAGE}`); process.exit(1); }
const root = outputRoot();
const ignored = (p) => isIgnored(root, p);
const prepPath = () => flag("prepare") ?? usage("--prepare <path to prepare.json> is required");

async function materialize(it, jira, runDir, secrets) {
  const file = join(runDir, `att-${it.id}-${safeName(it.filename)}`);
  try { writeFileSync(file, await jira.download(it.url)); } catch (e) { it.gap = asGap(it.ref, e); return; }
  if (["har", "log", "trace"].includes(it.kind)) {
    try { it.local_path = scrubFile(file, it.kind, secrets); it.scrubbed = true; }
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
  if (it.kind === "other") {
    rmSync(file, { force: true });
    it.gap = gap(it.ref, "unreadable", "not a format the agent can read — ask for a PDF, an image or text");
    return;
  }
  it.local_path = file;
}

/** A context-only PR (ai-tools, vc-deploy-dev): metadata only, same shape as collectPr with the change-surface paths null. */
function contextPr(p, base, runDir, sameKey) {
  const m = p.meta;
  const merged_at = m.merged_at ?? null;
  const meta_path = join(runDir, `pr-${p.owner}-${p.repo}-${p.number}-meta.json`);
  writeJson(meta_path, { repo: base.repo, number: p.number, title: m.title, state: m.state, merged: !!merged_at, merged_at, created_at: m.created_at ?? null,
    head_sha: m.head?.sha ?? null, base: m.base?.ref ?? null, body: m.body ?? "", later_prs: laterPrs(sameKey, { ref: p.ref, merged_at }) });
  return { ...base, state: m.state, merged: !!merged_at, merged_at, created_at: m.created_at ?? null, head_sha: m.head?.sha ?? null,
    meta_path, files_path: null, diff_path: null, reviews_path: null, checks_path: null, gaps: [] };
}

async function prepare() {
  const key = argv[1];
  try { assertKey(key); } catch (e) { usage(e.message); }
  loadLayeredEnv(root);
  const profile = resolveProfile(readProfile(root));
  const tcred = trackerCredential(profile);
  if (!tcred.ok) { out({ status: "no-tracker", gap: gap("ticket", tcred.reason, tcred.detail) }); process.exit(3); }
  const jira = jiraClient(tcred);
  const gaps = [];

  const allFields = await jira.fields();
  const acFields = resolveFieldsByName(allFields, profile.fieldMap.acceptanceCriteria, /acceptance criteria/i);
  const linkFields = resolveFieldsByName(allFields, profile.fieldMap.prototype, /prototype/i);
  if (!acFields.length) gaps.push(gap("ac_fields", "not-found", "no custom field named like 'Acceptance criteria' and no tracker.fieldMap.acceptanceCriteria — ACs are read from description and comments"));
  const issue = await jira.issue(key, [...BASE_FIELDS, ...acFields.map((f) => f.id), ...linkFields.map((f) => f.id)]);
  const remote = await jira.remoteLinks(key).catch((e) => { gaps.push(asGap("remotelinks", e)); return []; });
  const devPrUrls = await jira.devPrUrls(issue.id).catch(() => []);
  const inv = buildInventory({ issue, remoteLinks: remote, trackerBase: tcred.base, linkFieldIds: linkFields.map((f) => f.id), devPrUrls });

  let epic = null;
  let siblings = [];
  const parent = issue.fields.parent;
  if (parent?.key) {
    epic = { key: parent.key, title: parent.fields?.summary ?? "" };
    siblings = (await jira.search(`parent = ${parent.key} AND key != ${key} ORDER BY updated DESC`, ["summary", "status"]).catch((e) => { gaps.push(asGap("siblings", e)); return []; }))
      .map((s) => ({ key: s.key, title: s.fields?.summary ?? "", status: s.fields?.status?.name ?? null, done: s.fields?.status?.statusCategory?.key === "done" }));
  }

  const linked = inv.items.filter((i) => i.kind === "ticket");
  const linkedJson = new Map();
  for (const [n, it] of linked.entries()) {
    if (n >= CAPS.linkedIssues) { it.gap = gap(it.ref, "over-cap", `more than ${CAPS.linkedIssues} linked issues`); continue; }
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
  const isContext = (p) => CONTEXT_ONLY_REPOS.includes(p.repo.toLowerCase());
  prMeta.sort((a, b) => (isContext(a) - isContext(b)) || String(b.meta?.created_at ?? "").localeCompare(String(a.meta?.created_at ?? "")));

  const fk = freshnessKey({ ticketUpdated: issue.fields.updated, prShas: prMeta.map((p) => `${p.ref}@${p.meta?.head?.sha ?? "?"}`),
    linkedUpdated: [...linkedJson.values()].map((j) => `${j.key}@${j.fields?.updated}`) });
  const cachedFile = join(cacheDir(key, root), "bundle.json");
  if (!has("fresh") && readCached(cachedFile, fk)) { out({ status: "cached", bundle_path: cachedFile }); return; }

  const { dir: runDir, inProject } = newRunDir(key, { root, ignored });
  try {
    const ticketJson = join(runDir, "ticket.json");
    writeJson(ticketJson, issue);
    for (const it of linked) if (linkedJson.has(it.key)) { it.local_path = join(runDir, `issue-${it.key}.json`); writeJson(it.local_path, linkedJson.get(it.key)); }

    const secrets = loadSecretValues(root);
    const plan = planDownloads(inv.items.filter((i) => i.ref.startsWith("attachment:")), CAPS);
    for (const [ref, g] of plan.gaps) inv.items.find((i) => i.ref === ref).gap = g;
    for (const it of plan.toFetch) await materialize(it, jira, runDir, secrets);

    const privateHosts = new Set([...envHosts(root), new URL(tcred.base).hostname, "github.com", "api.github.com"]);
    let pages = 0;
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
      } else it.needs_connector = true; // loom · figma · claude-design — step 1 of SKILL.md
    }

    const prs = [];
    // P5: the cap is for CHANGE SURFACE. Product PRs come first (newest first) and only they count; a context-only
    // PR (ai-tools, vc-deploy-dev) gets its metadata only — no files, no diff — and never pushes a product PR over the cap.
    let product = 0;
    for (const p of prMeta) {
      const contextOnly = CONTEXT_ONLY_REPOS.includes(p.repo.toLowerCase());
      const base = { ref: p.ref, repo: `${p.owner}/${p.repo}`, number: p.number, rung: p.rung ?? null, context_only: contextOnly };
      if (p.gap) { prs.push({ ...base, gap: p.gap }); if (!contextOnly) product++; continue; }
      if (contextOnly) {
        try { prs.push(contextPr(p, base, runDir, ladder.sameKey)); } catch (e) { prs.push({ ...base, gap: asGap(`pr:${p.ref}`, e) }); }
        continue;
      }
      if (product++ >= CAPS.prs) {
        prs.push({ ...base, state: p.meta.state, merged: !!p.meta.merged_at, head_sha: p.meta.head?.sha ?? null,
          gap: gap(`pr:${p.ref}`, "over-cap", `more than ${CAPS.prs} product PRs; the ${CAPS.prs} most recent are read`) });
        continue;
      }
      try { prs.push(await collectPr(gh, p, runDir, { sameKey: ladder.sameKey })); } catch (e) { prs.push({ ...base, gap: asGap(`pr:${p.ref}`, e) }); }
    }

    const prepared = { schema: "ticket-context-prepare/1", ticket: key, tracker: profile.tracker, run_dir: runDir, run_dir_in_project: inProject,
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

function deploy() {
  const prep = readJson(prepPath());
  const d = checkDeployment({ root, key: prep.ticket, prs: prep.prs });
  writeJson(join(prep.run_dir, OUT_FILES.deploy), d);
  out({ status: "deploy-checked", chain_deployed: d.chain_deployed, blockers: d.blockers });
}

function known() {
  const prep = readJson(prepPath());
  const changeFile = join(prep.run_dir, OUT_FILES.change);
  const operations = existsSync(changeFile) ? [...new Set(readJson(changeFile).prs.flatMap((x) => [...(x.operations ?? []), ...(x.endpoints ?? [])]))] : [];
  const k = knownGround({ root, key: prep.ticket, domain: flag("domain"), prs: prep.prs, operations, runDir: prep.run_dir });
  writeJson(join(prep.run_dir, OUT_FILES.known), k);
  out({ status: "known", domain_map: k.known.domain_map.state, bl: k.known.bl.length, cases_at_risk: k.known.cases_at_risk.length, prior_runs: k.known.prior_runs.length, gaps: k.gaps.length });
}

function composeCmd() {
  const prep = readJson(prepPath());
  const outs = {};
  for (const [k, f] of Object.entries(OUT_FILES)) {
    const fp = join(prep.run_dir, f);
    if (existsSync(fp)) outs[k] = readJson(fp);
    else if (k !== "kb") { console.error(`✗ missing ${f} in the run dir — run the step that writes it`); process.exit(3); }
  }
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

function redeploy() {
  const key = argv[1];
  try { assertKey(key); } catch (e) { usage(e.message); }
  const bp = flag("bundle") ?? usage("--bundle is required");
  const b = readJson(bp);
  const d = checkDeployment({ root, key, prs: b.change.prs.map((p) => ({ ref: `${p.repo}#${p.number}`, merged: p.merged, context_only: p.context_only, gap: p.gap })) });
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

const commands = { prepare, attach, deploy, known, compose: composeCmd, check, finish, redeploy };
if (!commands[cmd]) usage(cmd ? `unknown command "${cmd}"` : "no command");
try { await commands[cmd](); } catch (e) {
  console.error(`✗ ticket-context ${cmd} could not run: ${String(e?.message ?? e).slice(0, 300)}`);
  process.exit(3);
}
