// .claude/skills/ticket-context/lib/deploy.mjs — D3. No probe of its own: the PR's CI artifact comes from
// `deploy:pr` (dry-run, read-only), and whether it is on the stand from the pre-flight core via its CLI
// (`preflight --expect`). This file only maps a PR to an `expect`, folds the answers and writes blockers.
import { hasScript, runNpmJson } from "./npm.mjs";

export const O2_NOTE = "pre-release builds may not bump the live version — confirm with `npm run deploy:pr -- <KEY> --verify`";
export const baseOf = (v) => String(v).split("-")[0];

// The id and version come from a PR body's artifact URL, i.e. text anyone who can edit the PR controls.
const ID_RE = /^[A-Za-z0-9_.]+$/;
const VERSION_RE = /^[0-9A-Za-z.+_-]+$/;

export function expectFor(artifact, merged) {
  if (!artifact) return { skip: "no CI artifact resolved for this PR" };
  if (artifact.kind === "theme") return { skip: "no-live-source: the stand does not report the storefront theme version" };
  if (artifact.kind === "platform") return { skip: "no-live-source: the pre-flight core's --expect covers modules only" };
  if (!ID_RE.test(String(artifact.id ?? "")) || !VERSION_RE.test(String(artifact.version ?? ""))) return { skip: "artifact id or version has unexpected characters" };
  return { module: artifact.id, version: merged ? baseOf(artifact.version) : artifact.version };
}

export function deployedFromPreflight(json) {
  if (!json) return { deployed: "UNKNOWN", reason: "pre-flight could not run" };
  const dep = json.facts?.deployed;
  if (dep && typeof dep === "object" && "unknown" in dep) return { deployed: "UNKNOWN", reason: `deployed state unknown: ${dep.unknown}` };
  const row = (json.checks ?? []).find((c) => c.id === "expect");
  if (!row) return { deployed: "UNKNOWN", reason: "pre-flight returned no expect row" };
  return row.status === "OK" ? { deployed: "YES", reason: row.found } : { deployed: "NO", reason: row.found };
}

export function foldChain(rows) {
  if (!rows.length) return "NONE";
  if (rows.some((r) => r.deployed === "NO")) return "NO";
  if (rows.some((r) => r.deployed === "UNKNOWN")) return "UNKNOWN";
  return "YES";
}

export const blockerLine = (row) => `${row.deployed === "NO" ? "NOT DEPLOYED" : "DEPLOYMENT UNKNOWN"}: ${row.ref} — ${row.deployed_reason}`;

export function artifactsBySource(deployPrJson) {
  const m = new Map();
  for (const t of deployPrJson?.bundle ?? []) {
    const s = /^PR (\S+#\d+)$/.exec(t.source ?? "");
    if (s) m.set(s[1], { kind: t.kind, id: t.id ?? null, version: t.version ?? null });
  }
  return m;
}

export function checkDeployment({ root, key, prs, run = runNpmJson }) {
  const gaps = [];
  const counted = prs.filter((p) => !p.context_only && p.gap?.reason !== "over-cap");
  const canResolve = hasScript(root, "deploy:pr");
  const canAsk = hasScript(root, "preflight");
  if (counted.length && (!canResolve || !canAsk)) {
    gaps.push({ where: "change.deployed", reason: "not-available-in-install", detail: `needs npm scripts: ${[!canResolve && "deploy:pr", !canAsk && "preflight"].filter(Boolean).join(", ")}` });
  }
  const readable = counted.filter((p) => !p.gap);
  let artifacts = new Map();
  let resolveFailure = null;
  const noteToolMissing = () => { if (!gaps.some((g) => g.reason === "tool-missing")) gaps.push({ where: "change.deployed", reason: "tool-missing", detail: "npm CLI not found next to the node binary" }); };
  if (canResolve && canAsk && readable.length) {
    const r = run(root, ["deploy:pr", "--", key, ...readable.map((p) => `--pr=${p.ref}`), "--json"]);
    if (r.json && !r.error) artifacts = artifactsBySource(r.json);
    else {
      resolveFailure = `deploy:pr could not run (${r.error ?? `exit ${r.status}`})`;
      if (r.error === "npm-cli-not-found") noteToolMissing();
      else gaps.push({ where: "change.deployed", reason: "unreadable", detail: `deploy:pr exit ${r.status}: no artifact table` });
    }
  }
  const asked = new Map();
  const rows = [];
  for (const p of counted) {
    if (p.gap) { rows.push({ ref: p.ref, artifact: null, deployed: "UNKNOWN", deployed_reason: `PR could not be read: ${p.gap.detail ?? p.gap.reason}` }); continue; }
    if (!canResolve || !canAsk) { rows.push({ ref: p.ref, artifact: null, deployed: "UNKNOWN", deployed_reason: "pre-flight core not available in this install" }); continue; }
    if (resolveFailure) { rows.push({ ref: p.ref, artifact: null, deployed: "UNKNOWN", deployed_reason: resolveFailure }); continue; }
    const artifact = artifacts.get(p.ref) ?? null;
    const e = expectFor(artifact, p.merged);
    if (e.skip) { rows.push({ ref: p.ref, artifact, deployed: "UNKNOWN", deployed_reason: e.skip }); continue; }
    const id = `${e.module}@${e.version}`;
    if (!asked.has(id)) {
      const pf = run(root, ["preflight", "--", "--for", "ticket-fast", "--ticket", key, "--expect", id, "--json"]);
      if (pf.error === "npm-cli-not-found") noteToolMissing();
      asked.set(id, deployedFromPreflight(pf.json));
    }
    const ans = asked.get(id);
    const reason = ans.deployed === "NO" && !p.merged ? `${ans.reason}; ${O2_NOTE.replace("<KEY>", key)}` : ans.reason;
    rows.push({ ref: p.ref, artifact, deployed: ans.deployed, deployed_reason: `${id}: ${reason}` });
  }
  return { prs: rows, chain_deployed: foldChain(rows), blockers: rows.filter((r) => r.deployed !== "YES").map(blockerLine), gaps };
}
