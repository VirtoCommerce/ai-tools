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
 * Test-user passwords (option B, lib/passwords.mjs) — only when the declaration keeps an env's passwords in
 * vc-secrets; under option A they belong in .env.local and are not findings:
 *   --scan    also lists each `<NAME>_<ENV>` in an .env file whose NAME is declared in vc-secrets for that
 *             env (a role kept in .env.local on purpose is not listed), and `.env.playwright.local`
 *             (the option-A --secrets file, which nothing reads once the lanes run from vc-secrets).
 *   --strip   removes a password line once `vc-secrets doctor` reports its secret resolvable (stored, and
 *             the checkout trusted) — the login itself is checked by verify-access afterwards — and
 *             deletes `.env.playwright.local`.
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
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SECRET_PREFIX_RE } from "../../scripts/lib/redact.mjs";
import { defaultShimPath } from "../../scripts/install-bridge.mjs";
import { outputRoot } from "./lib/paths.mjs";
import { standDownIfHostGoverned } from "./lib/governance.mjs";
import { declaredPasswords, passwordSecret, splitSuffixedKey } from "./lib/passwords.mjs";
import { parseDoctor, runDoctor } from "./lib/vc-secrets-doctor.mjs";

const BROWSER_SECRETS_FILE = ".env.playwright.local";

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

/**
 * Option B: password keys with a value in a dotenv text whose name IS declared in vc-secrets for that
 * env — the duplicates to strip, [{ key, line, secret, declared }]. A name the declaration does not
 * carry is a role the operator keeps in .env.local (§2d asks per role) and is not a finding. Pure — no
 * value returned.
 */
export function scanPasswordText(text, passwords) {
  const envs = Object.keys(passwords || {});
  const out = [];
  if (!envs.length) return out;
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(raw);
    if (!m) return;
    const value = m[2].replace(/\s+#.*$/, "").replace(/^['"]|['"]$/g, "").trim();
    const hit = value ? splitSuffixedKey(m[1], envs) : null;
    if (hit && passwords[hit.env].includes(hit.name)) out.push({ key: m[1], name: hit.name, env: hit.env, line: i + 1, secret: passwordSecret(hit.name, hit.env), declared: passwords[hit.env].includes(hit.name) });
  });
  return out;
}

/** Credentials in a git config's remote URLs: [{ remote, line, axis }] — the axis from that URL's own host. Pure. */
export function scanGitConfig(text) {
  const out = [];
  let section = "";
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const s = /^\s*\[(.+?)\]\s*$/.exec(raw);
    if (s) section = s[1];
    const u = /^\s*(?:url|pushurl)\s*=\s*(\S+)/.exec(raw);
    if (u && /^[a-z][a-z0-9+.-]*:\/\/[^/@\s]+@/i.test(u[1])) {
      const host = (/^[a-z][a-z0-9+.-]*:\/\/[^/@\s]+@([^/:\s]+)/i.exec(u[1])?.[1] || "").toLowerCase();
      const axis = host === "github.com" ? "github"
        : host === "dev.azure.com" || host.endsWith(".visualstudio.com") ? "ado"
        : "unknown"; // GitLab, Bitbucket, … — no vc-secrets copy exists, so it is listed, never stripped
      out.push({ remote: section, line: i + 1, axis });
    }
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

  let passwords = {};
  try {
    passwords = declaredPasswords(JSON.parse(readFileSync(join(root, ".claude", "vc-secrets.local.json"), "utf8")));
  } catch {
    /* no declaration — option A, passwords are not findings */
  }
  for (const name of readdirSync(root).filter((n) => /^\.env(\..+)?$/.test(n))) {
    if (name === BROWSER_SECRETS_FILE) continue;
    const text = readFileSync(join(root, name), "utf8");
    for (const hit of scanEnvText(text)) add({ file: name, kind: "env", ...hit });
    for (const hit of scanPasswordText(text, passwords)) add({ file: name, kind: "env", axis: "password", ...hit });
  }
  if (Object.keys(passwords).length && existsSync(join(root, BROWSER_SECRETS_FILE))) {
    add({ file: BROWSER_SECRETS_FILE, kind: "browser-secrets-file", axis: "password" });
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
        findings.push({ file: relative(root, cfg).replace(/\\/g, "/"), kind: "git-remote", key: hit.remote, line: hit.line, axis: hit.axis, tracked: false, everCommitted: false });
      }
    }
  }
  const prof = join(root, "project-profile.json");
  if (existsSync(prof) && SECRET_PREFIX_RE.test(readFileSync(prof, "utf8"))) add({ file: "project-profile.json", kind: "profile-literal", axis: "unknown" });
  return findings;
}

/**
 * Does the vc-secrets copy of this axis work? Runs the bridge's probe for it — and only when the axis's
 * task `vc-init-<axis>` is declared: without it the bridge runs the tool directly, on a session login
 * (or whatever the tool finds on its own), so a pass would prove nothing about vc-secrets and the
 * plaintext copy must stay. With it the bridge takes the task, whose token comes from vc-secrets alone
 * (an injected token wins over a file copy, and gh gets an empty config directory).
 */
function probeAxis(axis, { root, vcRun }) {
  const probes = { github: ["gh", "api", "user", "--jq", ".login"], ado: ["ado", "whoami"], jira: ["jira", "myself"] };
  if (!probes[axis]) return { ok: false, reason: "no probe for this axis" };
  let declaredTask = false;
  for (const f of [".claude/vc-secrets.local.json", ".claude/vc-secrets.json"]) {
    try {
      if (JSON.parse(readFileSync(join(root, f), "utf8"))?.tasks?.[`vc-init-${axis}`]) declaredTask = true;
    } catch {
      /* absent or unreadable */
    }
  }
  if (!declaredTask) return { ok: false, reason: `vc-init-${axis} is not declared in vc-secrets — run write-secrets-decl.mjs --from-profile; a probe without it would pass on a session login` };
  if (!existsSync(vcRun)) return { ok: false, reason: `no bridge at ${vcRun} — run install-bridge.mjs` };
  const r = spawnSync(process.execPath, [vcRun, ...probes[axis]], { cwd: root, encoding: "utf8", timeout: 120000, windowsHide: true });
  return r.status === 0 ? { ok: true } : { ok: false, reason: `\`node "$VC_RUN" ${probes[axis].join(" ")}\` exited ${r.status}` };
}

function strip(root, findings, okAxes, storedSecrets = new Set()) {
  const stripped = [];
  const byFile = new Map();
  for (const f of findings) {
    const passwordOk = f.axis === "password" && (f.kind === "browser-secrets-file" || (f.declared && storedSecrets.has(f.secret)));
    if (!okAxes.has(f.axis) && f.axis !== "removed" && !passwordOk) continue;
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }
  for (const [file, list] of byFile) {
    const p = join(root, file);
    const kind = list[0].kind;
    if (kind === "browser-secrets-file") {
      rmSync(p, { force: true });
      stripped.push(...list);
    } else if (kind === "env") {
      writeFileSync(p, stripEnvText(readFileSync(p, "utf8"), list.map((f) => f.key)));
      stripped.push(...list);
    } else if (kind === "settings-env") {
      const doc = JSON.parse(readFileSync(p, "utf8"));
      for (const f of list) delete doc.env[f.key];
      if (doc.env && !Object.keys(doc.env).length) delete doc.env;
      writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
      stripped.push(...list);
    } else if (kind === "git-remote") {
      // Only the lines of the axes whose probe passed — another remote in the same file keeps its URL.
      const lines = new Set(list.map((f) => f.line));
      const text = readFileSync(p, "utf8");
      const out = text.split(/(\r?\n)/).map((part, i) => (i % 2 === 0 && lines.has(i / 2 + 1)
        ? part.replace(/^(\s*(?:url|pushurl)\s*=\s*)(\S+)/, (m, lead, url) => lead + stripUserinfo(url))
        : part)).join("");
      writeFileSync(p, out);
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
  standDownIfHostGoverned(root, "migrate-secrets skipped: secrets are the host's to manage", { json: true });
  const findings = scan(root);
  const view = (f) => ({ file: f.file, kind: f.kind, key: f.key, line: f.line, axis: f.axis, ...(f.secret ? { secret: f.secret, declared: f.declared } : {}), tracked: f.tracked, everCommitted: f.everCommitted });
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
  // Passwords: stored in vc-secrets (doctor: resolvable, which also means the checkout is trusted).
  let stored = new Set();
  if (findings.some((f) => f.axis === "password" && f.secret)) {
    const doctor = runDoctor({ cwd: root });
    if (doctor.available) stored = new Set(parseDoctor(doctor.text).resolvable);
  }
  const stripped = strip(root, findings, okAxes, stored);
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
      ...remaining.filter((f) => f.axis === "password" && f.declared).map((f) => `store ${f.key}: node "<VC_SECRETS>" set ${f.secret} (and \`trust\` if doctor asks), then re-run --strip`),
      ...remaining.filter((f) => f.kind === "git-remote" && f.axis === "unknown").map((f) => `${f.file} remote ${f.key}: a credential for a host no vc-init axis covers — remove it from the URL by hand (git remote set-url)`),
      ...(rotate.length ? [`ROTATE the ${rotate.join(", ")} ${rotate.includes("password") ? "secret" : "token"}(s): a file holding them is or was in git history`] : []),
    ],
  }, null, 2));
  process.exit(remaining.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
