#!/usr/bin/env node
/**
 * skills/project-init/migrate-secrets.mjs — find every token an older onboarding left in a file, and
 * strip it once the vc-secrets copy works (`/project-init --check`, VCST-6402).
 *
 * Before VCST-6402 a GitHub / Azure DevOps / Jira token lived in `.env.local` (scaffold-secrets wrote
 * the placeholder, the operator pasted the value), in `.claude/settings.local.json` `env` (gen-mcp put
 * GITHUB_PERSONAL_ACCESS_TOKEN there for `${VAR}` expansion), sometimes literally in `.mcp.json`
 * (`--inline-secrets`), and in the remote URL of an Azure Repos checkout under `.fix-workspace/`
 * (repo-router embedded ADO_PAT in the clone URL, and git persisted it). This script finds them.
 *
 *   --scan    (default) report NAMES and LOCATIONS only — never a value. For each finding: the file,
 *             the key or path, the axis it belongs to, and whether the file is (or ever was) in git
 *             history — a token that was ever committed must be ROTATED, not just moved.
 *   --strip   for each axis whose bridge probe PASSES — the token stored in vc-secrets actually works
 *             (`node "$VC_RUN" gh api user` · `ado whoami` · `jira myself`) — remove that axis's
 *             findings: the line from the .env file, the key from the settings env, the credentials
 *             from a checkout's remote URL. An axis whose probe fails keeps its plaintext copy (it may
 *             be the only working one) and is reported. `.mcp.json` is never edited here: re-running
 *             gen-mcp.mjs rewrites it without any token.
 *
 * The value is never read into this report, never printed, never passed anywhere: the operator stores
 * the token in vc-secrets themselves (`node "<VC_SECRETS>" set <name>` at a hidden prompt), and this
 * script only decides, from the probe, whether the plaintext copy can go.
 *
 * Exit: 0 nothing found / everything stripped, 1 findings remain (the JSON says which and why).
 *
 * Usage:
 *   node migrate-secrets.mjs [--scan]
 *   node migrate-secrets.mjs --strip [--vc-run <path to vc-run.mjs>]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SECRET_PREFIX_RE } from "../../scripts/lib/redact.mjs";
import { defaultShimPath } from "../../scripts/install-bridge.mjs";
import { outputRoot } from "./lib/paths.mjs";

/** Env-style token keys → the axis that owns them. A `_<ENV>` suffix is the same key per environment. */
export const TOKEN_AXIS = {
  GITHUB_FIX_BUGS_TOKEN: "github",
  GITHUB_PERSONAL_ACCESS_TOKEN: "github",
  GIT_TOKEN: "github",
  GITHUB_TOKEN: "github",
  GH_TOKEN: "github",
  ADO_PAT: "ado",
  ADO_MCP_AUTH_TOKEN: "ado",
  JIRA_API_TOKEN: "jira",
  POSTMAN_API_KEY: "removed",
  CONTEXT7_API_KEY: "removed",
};

/** The axis of an env key (`ADO_PAT_QA` ⇒ ado), or null. Pure. */
export function axisOfKey(key) {
  for (const [k, axis] of Object.entries(TOKEN_AXIS)) if (key === k || key.startsWith(`${k}_`)) return axis;
  return null;
}

/** Token keys with a non-empty value in a dotenv text: [{ key, line }]. Pure — the value is not returned. */
export function scanEnvText(text) {
  const out = [];
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(raw);
    if (!m) return;
    const value = m[2].replace(/\s+#.*$/, "").replace(/^['"]|['"]$/g, "").trim();
    if (value && axisOfKey(m[1])) out.push({ key: m[1], line: i + 1, axis: axisOfKey(m[1]) });
  });
  return out;
}

/** The dotenv text with the given keys' lines removed. Pure. */
export function stripEnvText(text, keys) {
  const drop = new Set(keys);
  return String(text).split(/(\r?\n)/).reduce((acc, part, i, all) => {
    if (i % 2 === 1) return acc; // separators are re-attached below
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(part);
    if (m && drop.has(m[1])) return acc;
    return acc + part + (all[i + 1] ?? "");
  }, "");
}

/** Credentials in a git config's remote URLs: [{ remote, line }]. Pure. */
export function scanGitConfig(text) {
  const out = [];
  let section = "";
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const s = /^\s*\[(.+?)\]\s*$/.exec(raw);
    if (s) section = s[1];
    const u = /^\s*(?:url|pushurl)\s*=\s*(\S+)/.exec(raw);
    if (u && /^[a-z][a-z0-9+.-]*:\/\/[^/@\s]+@/i.test(u[1])) out.push({ remote: section, line: i + 1 });
  });
  return out;
}

/** A URL with its userinfo removed. Pure. */
export const stripUserinfo = (url) => String(url).replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/i, "$1");

function inGit(root, file, { ever = false } = {}) {
  try {
    if (!ever) {
      execFileSync("git", ["ls-files", "--error-unmatch", "--", file], { cwd: root, stdio: "ignore" });
      return true;
    }
    const log = execFileSync("git", ["log", "--all", "--format=%h", "-1", "--", file], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return log.length > 0;
  } catch {
    return false;
  }
}

/** Every token-at-rest finding under `root`. Names and locations only. */
export function scan(root) {
  const findings = [];
  const add = (f) => findings.push({ ...f, tracked: inGit(root, f.file), everCommitted: inGit(root, f.file, { ever: true }) });

  for (const name of readdirSync(root).filter((n) => /^\.env(\..+)?$/.test(n))) {
    for (const hit of scanEnvText(readFileSync(join(root, name), "utf8"))) add({ file: name, kind: "env", ...hit });
  }
  for (const rel of [".claude/settings.local.json", ".claude/settings.json"]) {
    const p = join(root, rel);
    if (!existsSync(p)) continue;
    let doc;
    try {
      doc = JSON.parse(readFileSync(p, "utf8"));
    } catch {
      findings.push({ file: rel, kind: "unparsable" });
      continue;
    }
    for (const [key, v] of Object.entries(doc?.env || {})) {
      if (axisOfKey(key) && String(v ?? "").trim()) add({ file: rel, kind: "settings-env", key, axis: axisOfKey(key) });
      else if (SECRET_PREFIX_RE.test(String(v ?? ""))) add({ file: rel, kind: "settings-env", key, axis: "unknown" });
    }
  }
  const mcp = join(root, ".mcp.json");
  if (existsSync(mcp)) {
    const text = readFileSync(mcp, "utf8");
    if (SECRET_PREFIX_RE.test(text)) add({ file: ".mcp.json", kind: "mcp-literal", axis: "unknown" });
    try {
      for (const [name, def] of Object.entries(JSON.parse(text)?.mcpServers || {})) {
        const auth = def?.headers?.Authorization;
        if (typeof auth === "string" && !/\$\{[A-Z0-9_]+\}|<[A-Z0-9_]+>/.test(auth) && /\S+\s+\S{8,}/.test(auth)) {
          add({ file: ".mcp.json", kind: "mcp-header", key: `${name}.headers.Authorization`, axis: name === "github" ? "github" : "unknown" });
        }
      }
    } catch {
      /* unparsable .mcp.json — gen-mcp rewrites it */
    }
  }
  const ws = join(root, ".fix-workspace");
  if (existsSync(ws)) {
    for (const repo of readdirSync(ws)) {
      const cfg = join(ws, repo, ".git", "config");
      if (!existsSync(cfg)) continue;
      for (const hit of scanGitConfig(readFileSync(cfg, "utf8"))) {
        findings.push({ file: relative(root, cfg).replace(/\\/g, "/"), kind: "git-remote", key: hit.remote, line: hit.line, axis: /dev\.azure\.com|visualstudio\.com/.test(readFileSync(cfg, "utf8")) ? "ado" : "github", tracked: false, everCommitted: false });
      }
    }
  }
  const prof = join(root, "project-profile.json");
  if (existsSync(prof) && SECRET_PREFIX_RE.test(readFileSync(prof, "utf8"))) add({ file: "project-profile.json", kind: "profile-literal", axis: "unknown" });
  return findings;
}

/** Does the vc-secrets copy of this axis work? Runs the bridge's probe for it. */
function probeAxis(axis, { root, vcRun }) {
  const probes = { github: ["gh", "api", "user", "--jq", ".login"], ado: ["ado", "whoami"], jira: ["jira", "myself"] };
  if (!probes[axis]) return { ok: false, reason: "no probe for this axis" };
  if (!existsSync(vcRun)) return { ok: false, reason: `no bridge at ${vcRun} — run install-bridge.mjs` };
  const r = spawnSync(process.execPath, [vcRun, ...probes[axis]], { cwd: root, encoding: "utf8", timeout: 120000, windowsHide: true });
  return r.status === 0 ? { ok: true } : { ok: false, reason: `\`node "$VC_RUN" ${probes[axis].join(" ")}\` exited ${r.status}` };
}

function strip(root, findings, okAxes) {
  const stripped = [];
  const byFile = new Map();
  for (const f of findings) {
    if (!okAxes.has(f.axis) && f.axis !== "removed") continue;
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }
  for (const [file, list] of byFile) {
    const p = join(root, file);
    const kind = list[0].kind;
    if (kind === "env") {
      writeFileSync(p, stripEnvText(readFileSync(p, "utf8"), list.map((f) => f.key)));
      stripped.push(...list);
    } else if (kind === "settings-env") {
      const doc = JSON.parse(readFileSync(p, "utf8"));
      for (const f of list) delete doc.env[f.key];
      if (doc.env && !Object.keys(doc.env).length) delete doc.env;
      writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
      stripped.push(...list);
    } else if (kind === "git-remote") {
      const text = readFileSync(p, "utf8");
      writeFileSync(p, text.replace(/^(\s*(?:url|pushurl)\s*=\s*)(\S+)/gm, (m, lead, url) => lead + stripUserinfo(url)));
      stripped.push(...list);
    }
    // mcp-header / mcp-literal / profile-literal: not edited here — gen-mcp rewrites .mcp.json, and a
    // literal in the profile is an operator edit to undo by hand.
  }
  return stripped;
}

function main() {
  const argv = process.argv.slice(2);
  const root = outputRoot();
  const findings = scan(root);
  const view = (f) => ({ file: f.file, kind: f.kind, key: f.key, line: f.line, axis: f.axis, tracked: f.tracked, everCommitted: f.everCommitted });
  const rotate = [...new Set(findings.filter((f) => f.everCommitted || f.tracked).map((f) => f.axis))];
  if (!argv.includes("--strip")) {
    console.log(JSON.stringify({ status: findings.length ? "found" : "clean", findings: findings.map(view), rotate }, null, 2));
    process.exit(findings.length ? 1 : 0);
  }
  const at = argv.indexOf("--vc-run");
  const vcRun = at >= 0 ? argv[at + 1] : (process.env.VC_RUN || defaultShimPath());
  const axes = [...new Set(findings.map((f) => f.axis))].filter((a) => ["github", "ado", "jira"].includes(a));
  const probes = Object.fromEntries(axes.map((a) => [a, probeAxis(a, { root, vcRun })]));
  const okAxes = new Set(axes.filter((a) => probes[a].ok));
  const stripped = strip(root, findings, okAxes);
  const remaining = scan(root);
  console.log(JSON.stringify({
    status: remaining.length ? "remaining" : "clean",
    stripped: stripped.map(view),
    probes,
    remaining: remaining.map(view),
    rotate,
    next: [
      ...(remaining.some((f) => f.kind.startsWith("mcp")) ? ["re-run gen-mcp.mjs — it rewrites .mcp.json without any token"] : []),
      ...(remaining.some((f) => ["github", "ado", "jira"].includes(f.axis)) ? ["store the token(s) whose probe failed: node \"<VC_SECRETS>\" set <github-pat|ado-pat|jira-token>, then re-run --strip"] : []),
      ...(rotate.length ? [`ROTATE the ${rotate.join(", ")} token(s): a file holding them is or was in git history`] : []),
    ],
  }, null, 2));
  process.exit(remaining.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
