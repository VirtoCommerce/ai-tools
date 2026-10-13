// .claude/skills/ticket-context/lib/known.mjs — block 4, the script half (the kb half is the runner's:
// known-ground.md). Every lookup is capability-checked (M2); paths are this repo's layout and are simply
// absent on a client install.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { hasScript, runNpmJson } from "./npm.mjs";

export function domainState(json, slug) {
  if (!slug) return { state: "unresolved", path: null };
  const map = json?.maps?.find((m) => m.slug === slug);
  if (!map) return { state: "ABSENT", path: null };
  const stale = (json.findings ?? []).some((f) => f.file === map.file && f.code === "DOMAIN-001");
  return { state: stale ? "STALE" : "PRESENT", path: `.claude/knowledge/domain/${map.file}` };
}

/** regression:select also picks suites by staleness rotation; those are not "at risk from this change". */
export function changeSelected(json) {
  return (json?.selected ?? [])
    .map((s) => ({ suite: s.id, name: s.name, reasons: (s.reasons ?? []).map((r) => r.kind).filter((k) => k !== "rotation") }))
    .filter((s) => s.reasons.length);
}

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p); else yield p;
  }
}

export function priorRuns(root, key) {
  const out = [];
  const tickets = join(root, "reports", "tickets");
  if (existsSync(tickets)) for (const sprint of readdirSync(tickets)) if (existsSync(join(tickets, sprint, key))) out.push(`reports/tickets/${sprint}/${key}/`);
  const models = join(root, "reports", "ba", "test-models");
  if (existsSync(models)) for (const f of readdirSync(models)) if (f.startsWith(`${key}-`)) out.push(`reports/ba/test-models/${f}`);
  for (const f of walk(join(root, "reports", "bugs"))) if (f.endsWith(".md") && readFileSync(f, "utf8").includes(key)) out.push(relative(root, f).split("\\").join("/"));
  return out;
}

export function knownGround({ root, key, domain, prs, operations = [], runDir, run = runNpmJson }) {
  const gaps = [];
  const known = { domain_map: { state: "unresolved", path: null }, mind_map: { path: null }, bl: [], cases_at_risk: [], kb: [], prior_runs: [] };
  const need = (s) => {
    if (hasScript(root, s)) return true;
    gaps.push({ where: `known.${s}`, reason: "not-available-in-install", detail: `npm script ${s} is not declared in this install` });
    return false;
  };
  const failed = (s, r) => gaps.push({ where: `known.${s}`, reason: "unreadable", detail: `${s} exit ${r.status}` });

  if (!domain) gaps.push({ where: "known.domain", reason: "not-found", detail: "no --domain given — maps, BL and tc:scope are not looked up" });
  if (domain && need("domain:check")) {
    const r = run(root, ["domain:check", "--", "--json"]);
    if (r.json) {
      known.domain_map = domainState(r.json, domain);
      const mm = known.domain_map.path?.replace(/\.md$/, ".mind-map.json");
      known.mind_map.path = mm && existsSync(join(root, mm)) ? mm : null;
    } else failed("domain:check", r);
  }
  if (domain && need("bl:extract")) {
    const r = run(root, ["bl:extract", "--", "--domain", domain, "--json"]);
    if (r.json) known.bl = (r.json.invariants ?? []).map((i) => ({ id: i.id, title: i.title, severity: i.severity }));
    else failed("bl:extract", r);
  }
  const product = prs.filter((p) => p.files_path && !p.context_only && !p.gap);
  if (product.length && need("regression:select")) {
    const byRepo = new Map();
    for (const p of product) {
      const repo = p.repo.split("/")[1];
      byRepo.set(repo, [...(byRepo.get(repo) ?? []), ...JSON.parse(readFileSync(p.files_path, "utf8")).map((f) => f.filename)]);
    }
    for (const [repo, files] of byRepo) {
      const list = join(runDir, `changed-${repo}.txt`);
      writeFileSync(list, files.join("\n"));
      const r = run(root, ["regression:select", "--", "--repo", repo, "--changed-files", list, "--json"]);
      if (r.json) known.cases_at_risk.push(...changeSelected(r.json).map((s) => ({ ...s, via: `regression:select ${repo}` })));
      else failed("regression:select", r);
    }
  }
  if (domain && operations.length && need("tc:scope")) {
    const r = run(root, ["tc:scope", "--", "--domain", domain, ...operations.slice(0, 10).flatMap((o) => ["--observable", o]), "--json"]);
    if (r.json) known.cases_at_risk.push(...(r.json.hits ?? []).map((h) => ({ suite: h.suiteId, case: h.caseId, title: h.title, via: "tc:scope" })));
    else failed("tc:scope", r);
  }
  known.prior_runs = priorRuns(root, key);
  return { known, gaps };
}
