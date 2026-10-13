// .claude/skills/ticket-context/lib/known.mjs — block 4, the script half (the kb half is the runner's:
// known-ground.md). Every lookup is capability-checked (M2); paths are this repo's layout and are simply
// absent on a client install.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { hasScript, runNpmJson } from "./npm.mjs";

// Values that reach an npm script's argv: an allow-list, as deploy.mjs does for an artifact id and version.
// A domain is an operator slug; an observable is a GraphQL operation or REST endpoint an AGENT read from a diff,
// so it can be anything a PR author wrote — including a leading "--" that the script would parse as a flag.
export const DOMAIN_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
export const OBSERVABLE_RE = /^[A-Za-z0-9_/{][A-Za-z0-9 _./{}:-]{0,119}$/;

export function domainState(json, slug) {
  if (!slug) return { state: "unresolved", path: null };
  const map = json?.maps?.find((m) => m.slug === slug);
  if (!map) return { state: "ABSENT", path: null };
  const codes = (json.findings ?? []).filter((f) => f.file === map.file).map((f) => f.code);
  const path = `.claude/knowledge/domain/${map.file}`;
  if (codes.includes("DOMAIN-002")) return { state: "STALE", path, expired: true }; // expired: verdicts are no longer citable
  return { state: codes.includes("DOMAIN-001") ? "STALE" : "PRESENT", path };
}

/** regression:select also picks suites by rotation, a risk floor and history; none of those is "at risk from this change". */
const NOT_CHANGE_DRIVEN = new Set(["rotation", "risk-floor", "history"]);
export function changeSelected(json) {
  return (json?.selected ?? [])
    .map((s) => ({ suite: s.id, name: s.name, reasons: (s.reasons ?? []).map((r) => r.kind).filter((k) => !NOT_CHANGE_DRIVEN.has(k)) }))
    .filter((s) => s.reasons.length);
}

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; } // missing or unreadable ⇒ nothing here
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p); else yield p;
  }
}

const list = (dir) => { try { return readdirSync(dir); } catch { return []; } };
const has = (p) => { try { return existsSync(p); } catch { return false; } };
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Prior runs mentioning the ticket. One unreadable entry is skipped, never thrown. */
export function priorRuns(root, key) {
  const out = [];
  const tickets = join(root, "reports", "tickets");
  for (const sprint of list(tickets)) if (has(join(tickets, sprint, key))) out.push(`reports/tickets/${sprint}/${key}/`);
  const models = join(root, "reports", "ba", "test-models");
  for (const f of list(models)) if (f.startsWith(`${key}-`)) out.push(`reports/ba/test-models/${f}`);
  const mention = new RegExp(`(?<![A-Za-z0-9-])${escapeRe(key)}(?!\\d)`); // VCST-62 is not VCST-6223, nor XVCST-62
  for (const f of walk(join(root, "reports", "bugs"))) {
    if (!f.endsWith(".md")) continue;
    try { if (mention.test(readFileSync(f, "utf8"))) out.push(relative(root, f).split("\\").join("/")); } catch { /* dangling link, unreadable file */ }
  }
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
  const failed = (s, r) => gaps.push({ where: `known.${s}`, reason: "unreadable", detail: r.error ? `${s} could not run (${r.error})` : `${s} exit ${r.status}` });

  if (domain && !DOMAIN_RE.test(domain)) {
    gaps.push({ where: "known.domain", reason: "unreadable", detail: "the domain slug has unexpected characters — not used" });
    domain = undefined;
  } else if (!domain) gaps.push({ where: "known.domain", reason: "not-found", detail: "no --domain given — maps, BL and tc:scope are not looked up" });
  const observables = operations.filter((o) => typeof o === "string" && OBSERVABLE_RE.test(o));
  if (observables.length < operations.length) gaps.push({ where: "known.tc:scope.observables", reason: "unreadable", detail: `${operations.length - observables.length} operation/endpoint name(s) with unexpected characters not passed to tc:scope` });
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
      const repo = String(p.repo ?? "").split("/")[1] ?? "unknown";
      try {
        const names = JSON.parse(readFileSync(p.files_path, "utf8")).map((f) => f.filename).filter(Boolean);
        byRepo.set(repo, [...(byRepo.get(repo) ?? []), ...names]);
      } catch { gaps.push({ where: `known.regression:select.${repo}`, reason: "unreadable", detail: "files list unreadable" }); } // that PR is skipped
    }
    for (const [repo, files] of byRepo) {
      const changed = join(runDir, `changed-${repo}.txt`);
      try { writeFileSync(changed, files.join("\n")); } catch { gaps.push({ where: `known.regression:select.${repo}`, reason: "unreadable", detail: "changed-files list not writable" }); continue; }
      const r = run(root, ["regression:select", "--", "--repo", repo, "--changed-files", changed, "--json"]);
      if (r.json) known.cases_at_risk.push(...changeSelected(r.json).map((s) => ({ ...s, via: `regression:select ${repo}` })));
      else failed("regression:select", r);
    }
  }
  if (domain && observables.length && need("tc:scope")) {
    const r = run(root, ["tc:scope", "--", "--domain", domain, ...observables.slice(0, 10).flatMap((o) => ["--observable", o]), "--json"]);
    if (r.json) known.cases_at_risk.push(...(r.json.hits ?? []).map((h) => ({ suite: h.suiteId, case: h.caseId, title: h.title, via: "tc:scope" })));
    else failed("tc:scope", r);
  }
  known.prior_runs = priorRuns(root, key);
  return { known, gaps };
}
