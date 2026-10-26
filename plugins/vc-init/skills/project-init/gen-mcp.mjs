#!/usr/bin/env node
/**
 * skills/project-init/gen-mcp.mjs
 *
 * Generate .mcp.json from templates/.mcp.json.example, tailored to:
 *   - the OS (the template is Windows-first `cmd /c npx`; on Linux/macOS we drop
 *     the `cmd /c` and call npx directly — per the note in the template head),
 *   - the chosen tracker/VCS (enable only the relevant servers via
 *     .claude/settings.local.json `enabledMcpjsonServers`),
 *   - the GitHub auth axis — see "Secrets" below.
 *
 * .mcp.json keeps ALL server definitions (so they're available), but only the
 * enabled subset is listed in settings.local.json.
 *
 * SECRETS — no token in ANY file this writes (VCST-6402).
 *   - GitHub on a PAT axis: .mcp.json holds `node ${VC_SECRETS} run github` and nothing else; the
 *     server is declared in .claude/vc-secrets.local.json (lib/github-mcp.mjs GITHUB_MCP_DECL, written
 *     by write-secrets-decl.mjs — this script makes sure it is there) and vc-secrets hands it the
 *     `github-pat` at launch. On a session axis it is the hosted server with OAuth on first use.
 *   - No other server takes a token: postman and context7 were removed (VCST-6402 D2), atlassian /
 *     figma / azure-mcp sign in by themselves.
 *   - settings.local.json `env` gets VC_RUN and VC_SECRETS (the two shims' paths — not secrets; the
 *     project's own setting, so ~/.claude/settings.json is never asked for). A token key it still
 *     holds from the VCST-5774 design (the PAT value for `${VAR}` expansion) is KEPT and reported:
 *     only migrate-secrets.mjs --strip removes one, after the vc-secrets copy passed its probe — a copy
 *     it kept on purpose may be the only working one. The removed servers' keys (postman, context7) go.
 *   - `--inline-secrets` is refused: it existed to write a credential literal into .mcp.json.
 *   - Every generated file is gitignored BEFORE it is written (`lib/gitignore.mjs`), and a settings
 *     file that is unparsable or already tracked halts the run (preflightWriteTargets).
 *   - There is NO `gh auth token` fallback: an operator's gh session is never copied into a file.
 *
 * Usage:
 *   node skills/project-init/gen-mcp.mjs --tracker jira --client-vcs github \
 *     [--github-auth pat|gh-cli]       (default: the profile's auth.github)
 *     [--vc-run <shim path>]           (default: the installed bridge shim)
 *     [--vc-secrets <shim path>]       (default: VC_SECRETS, else the vc-secrets shim's default path)
 *     [--with figma,devtools,azure] [--os linux|windows|mac] \
 *     [--out .mcp.json] [--settings .claude/settings.local.json] [--print] [--warm-cache]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname, resolve, isAbsolute, relative, sep } from "path";
import { execSync, execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { outputRoot, pluginRoot, resolveOutPath } from "./lib/paths.mjs";
import { emitObservations } from "./lib/diag-obs.mjs";
import { standDownIfHostGoverned } from "./lib/governance.mjs";
import { authAxes, readProjectProfile } from "../../scripts/lib/project-profile.mjs";
import { defaultShimPath } from "../../scripts/install-bridge.mjs";
import { vcSecretsShim } from "../../bridge/vc-secrets-path.mjs";
import { MCP_REMOTE_SPEC, githubMcpEntryOAuth, githubMcpEntryPat } from "./lib/github-mcp.mjs";
import { patAxesFromProfile, writeSecretsDecl } from "./write-secrets-decl.mjs";
import { EVIDENCE_INCOMING, absolutizeOutputDir, laneEntryViaBridge, preferProjectPlaywrightConfig } from "./lib/playwright-lanes.mjs";
import { declaredPasswords } from "./lib/passwords.mjs";
// The ignore rules + writer live in lib/ because FOUR scripts create secret-bearing files at
// four different onboarding steps and each must protect its own before writing it (VCST-5774
// review #4). Re-exported so the existing unit tests keep importing them from here.
import { SECRET_IGNORES, EVIDENCE_IGNORES, ignoreEntryFor, ensureGitignoreEntries, ensureProjectIgnores } from "./lib/gitignore.mjs";
export { ensureGitignoreEntries, ignoreEntryFor, SECRET_IGNORES, EVIDENCE_IGNORES };

// Read the shipped template from the plugin's own dir (works from any cwd); write
// .mcp.json / settings into the deployment project. The two roots are intentionally
// different — that is the fix. The Playwright servers are configured entirely via CLI
// flags in the template (--browser / --isolated / --viewport-size / --output-dir), so
// there are no per-project config files to copy.
const PLUGIN_ROOT = pluginRoot();

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const n = argv[i + 1];
    if (n === undefined || n.startsWith("--")) a[k] = true;
    else { a[k] = n; i++; }
  }
  return a;
}

/**
 * Read a BOOLEAN flag out of parseArgs' output (VCST-5774 review #2).
 *
 * `parseArgs` cannot know which flags are boolean, so it swallows the next token as a value:
 * `--inline-secrets false` yields the STRING "false", and `Boolean("false")` is `true`. The most
 * natural way to turn a flag off therefore turned it ON — and for `--inline-secrets` that means
 * the safety default inverts and a credential literal lands in .mcp.json. A bare `--flag` is still
 * true; an explicit false/0/no/off (any case) is false; anything else present is true.
 *
 * Applied to EVERY boolean flag, not just the one that was reported: the trap is in the parser,
 * so a second boolean flag would inherit it the day someone adds one.
 */
export function asBool(v) {
  if (v === undefined) return false;
  if (typeof v === "boolean") return v;
  return !/^(false|0|no|off)$/i.test(String(v).trim());
}

/** Is `absPath` a path git ALREADY TRACKS? `git ls-files --error-unmatch` exits 0 only for a
 *  tracked path; 1 for untracked, 128 outside a work tree. Both non-zero answers mean "not
 *  tracked here", which is the safe reading. Never throws. */
export function gitTracked(projectRoot, absPath) {
  try {
    // execFileSync with an argv array — NO shell. `absPath` comes from `--out`/`--settings`, so
    // interpolating it into a shell string (as this first did) makes a path containing a quote,
    // `;`, `&` or `$(…)` execute as a command. Nobody would pass such a path on purpose, but a
    // shell-quoting bug inside a security fix is not a thing to leave standing, and the argv form
    // is also simply correct for paths with spaces.
    execFileSync("git", ["ls-files", "--error-unmatch", "--", absPath], { cwd: projectRoot, stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch { return false; }
}

/**
 * Everything that must be TRUE before this run writes a single byte (VCST-5774 review #1 + #3).
 * Pure except for the two reads; returns blockers instead of exiting, so it is testable.
 *
 * TWO WAYS THIS GENERATOR USED TO DESTROY OR EXPOSE SOMETHING, both silently:
 *
 * #1 — a settings.local.json that failed to parse was replaced WHOLESALE. The read was
 * `try { JSON.parse(…) } catch { settings = {} }`, and the file was then rewritten from that
 * empty object, so one stray comma cost the operator every other key in it — including
 * `permissions.deny: ["Bash(gh pr merge:*)", …]`, which is guard #1 of the three-way
 * never-auto-merge interlock (quality-gates.md §2). This PR makes that strictly worse by turning
 * the same file into the credential's home: we would be writing a secret into a file we had just
 * proven we cannot read. So an unparsable settings file now HALTS the run. Refusing to write is
 * the only safe move — we cannot merge into a structure we cannot see, and we must not flatten it.
 *
 * #3 — a `.gitignore` rule CANNOT untrack a file git already tracks. Writing the credential into
 * an ALREADY-TRACKED settings.local.json therefore stages it for the next commit, while the run
 * printed a reassuring `.gitignore += …` line. That is the same false-reassurance shape as the
 * original defect. verify-access's `gradeSecretHygiene` already knew about this trap and had a
 * dedicated `git rm --cached` remediation for it; the producer did not. Now both do.
 *
 * `.mcp.json` being tracked is only a blocker under `--inline-secrets` (the sole mode that puts a
 * credential in it); otherwise it holds `${VAR}` references and is merely untidy, so it WARNS.
 *
 * @returns {{ settings: object, blockers: string[], warnings: string[] }}
 */
export function preflightWriteTargets({ projectRoot, outPath, settingsPath, inlineSecrets = false, readFile = readFileSync, exists = existsSync, tracked = gitTracked }) {
  const blockers = [];
  const warnings = [];
  let settings = {};
  if (exists(settingsPath)) {
    try {
      const parsed = JSON.parse(readFile(settingsPath, "utf-8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not a JSON object");
      settings = parsed;
    } catch (e) {
      blockers.push(`${settingsPath} is not valid JSON (${e.message}). Refusing to touch it: rewriting it would DELETE every key it holds — including any \`permissions.deny\` rules, which are part of the never-auto-merge interlock — and this run would then write a credential into a file it cannot read. Fix the JSON (or move the file aside) and re-run.`);
    }
  }
  // The credential's destination must not already be under version control.
  if (tracked(projectRoot, settingsPath)) {
    blockers.push(`${settingsPath} is already tracked by git, so no .gitignore rule can protect it and this run would stage a credential for your next commit. Run \`git rm --cached "${settingsPath}"\` and commit that removal first, then re-run. If it was ever pushed, rotate the credential too.`);
  }
  if (tracked(projectRoot, outPath)) {
    const msg = `${outPath} is already tracked by git — a .gitignore rule cannot untrack it. Run \`git rm --cached "${outPath}"\` and commit that removal.`;
    if (inlineSecrets) blockers.push(`${msg} Refusing to write, because --inline-secrets would put a credential LITERAL into it.`);
    else warnings.push(`${msg} Not blocking: the file carries no credential (since VCST-6402 at most a vc-secrets launcher call).`);
  }
  return { settings, blockers, warnings };
}

function detectOs(flag) {
  if (flag) return flag;
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "mac";
  return "linux";
}

// #220 — every stdio MCP server launches through `npx`, so each start performs an npm registry
// lookup inside the host's ~30s MCP startup budget. On a host that falls back slowly from a
// broken/unrouted IPv6 address to IPv4, that lookup has hung ~150s (vs ~4s with an IPv4-first
// hint), blowing the budget so ALL stdio servers fail to start and the browser/evidence
// capability is gone. So on every stdio server we (a) set NODE_OPTIONS to make DNS return IPv4
// first — the npx fetch never sits on a dead IPv6 socket — and (b) set npm_config_prefer_offline
// so a pinned+cached package resolves WITHOUT a registry round-trip at all.
//
// We use ONLY `--dns-result-order=ipv4first` (NODE_OPTIONS-allowed since Node 16.4). We do NOT add
// `--no-network-family-autoselection`: that form is newer (absent on the Node-18 floor this plugin
// supports), and an UNKNOWN flag in NODE_OPTIONS is FATAL — Node exits `bad option` before running,
// which would make every stdio server refuse to start, i.e. INVERT this very fix. IPv4-first
// ordering alone fixes the reported broken-IPv6 case: Node connects to the working IPv4 address
// first instead of stalling on the dead IPv6 one.
const IPV4_NODE_OPTIONS = "--dns-result-order=ipv4first";
/**
 * Ensure a stdio (Node-launched) server carries the IPv4-first NODE_OPTIONS + prefer-offline npm
 * config. Pure. An http/sse server (no local process) is untouched; any other env is kept. Our
 * `--dns-result-order=ipv4first` is appended LAST (the last occurrence of a repeated NODE_OPTIONS
 * flag wins) so a conflicting host-set DNS order is overridden rather than silently honoured, and
 * it is not double-appended on a re-run. The flag is NODE_OPTIONS-allowed since Node 16.4, so this
 * never makes a server refuse to start.
 */
export function ensureNodeOptions(server) {
  if (server?.type && server.type !== "stdio") return server; // http/sse: no Node process to hint
  const args = Array.isArray(server?.args) ? server.args : [];
  const isNodeLaunch = server?.command === "npx" || (server?.command === "cmd" && args.includes("npx"));
  if (!isNodeLaunch) return server;
  const prevEnv = server.env || {};
  const prev = prevEnv.NODE_OPTIONS || "";
  const NODE_OPTIONS = prev.includes(IPV4_NODE_OPTIONS) ? prev : prev ? `${prev} ${IPV4_NODE_OPTIONS}` : IPV4_NODE_OPTIONS;
  return { ...server, env: { ...prevEnv, NODE_OPTIONS, npm_config_prefer_offline: "true" } };
}

/** Drop `//` doc-comment keys from a server def so template comments don't leak into runtime .mcp.json. Pure. */
function stripComments(server) {
  if (!server || typeof server !== "object" || Array.isArray(server)) return server;
  const out = {};
  for (const [k, v] of Object.entries(server)) if (!k.startsWith("//")) out[k] = v;
  return out;
}

/**
 * Extract the npx PACKAGE SPECS from the generated servers (e.g. `chrome-devtools-mcp@1.6.0`,
 * `@azure/mcp@3.0.0-beta.32`, `@playwright/mcp@0.0.77`). Pure. The first non-flag token after
 * `npx` is the spec; `-y`/`--yes`/`--…` are skipped and non-stdio servers (no npx) are ignored.
 * Used by --warm-cache so the first real MCP start resolves a PINNED spec from cache instead of
 * a registry round-trip (#220 item 5).
 */
export function extractNpxSpecs(servers) {
  const specs = new Set();
  for (const def of Object.values(servers || {})) {
    if (def?.type && def.type !== "stdio") continue;
    const args = Array.isArray(def?.args) ? def.args : [];
    const npxIdx = def?.command === "npx" ? -1 : args.indexOf("npx");
    if (def?.command !== "npx" && npxIdx < 0) continue;
    for (let i = def?.command === "npx" ? 0 : npxIdx + 1; i < args.length; i++) {
      const a = args[i];
      if (typeof a !== "string") continue;
      if (a === "-y" || a === "--yes" || a.startsWith("--")) continue;
      specs.add(a); // first non-flag token after npx is the package spec
      break;
    }
  }
  return [...specs];
}

/**
 * The PINNED @playwright/mcp version from the generated servers (VCST-5702 ITEM 4). Emitted at
 * project-init so a mismatch between the pinned spec and the version actually installed surfaces
 * HERE: on @playwright/mcp 0.0.77 and 0.0.83 (re-observed 2026-10-21) a bare screenshot filename resolves against the MCP server's OWN
 * cwd, NOT the configured absolute --output-dir (VCST-5582 C), so the exact version is load-bearing.
 * Pure. Returns "" when no playwright server is present, "unpinned" when the spec carries no @version.
 */
export function pinnedPlaywrightVersion(servers) {
  for (const spec of extractNpxSpecs(servers)) {
    const m = /^(@playwright\/mcp)(?:@(.+))?$/.exec(spec);
    if (m) return m[2] || "unpinned";
  }
  return "";
}

// A safe npm package-spec charset (scoped names, versions, dist-tags) — NO shell metacharacters.
// warmNpxCache interpolates the spec into a shell `npm cache add`; specs come from the trusted
// pinned template today, but validating here keeps that exec safe by construction.
const NPX_SPEC_RE = /^[@a-zA-Z0-9._/+-]+$/;

/**
 * Best-effort: pre-populate the npm cache for each pinned npx spec so a prefer-offline start
 * resolves it WITHOUT a registry round-trip (#220 item 5). The fetch runs with the SAME IPv4-first
 * NODE_OPTIONS so warming itself can't hang on a broken IPv6 route. The per-spec timeout is aligned
 * to the ~30s MCP startup budget — a fetch that can't beat the budget isn't worth waiting longer
 * for. A spec with unsafe characters is skipped (never shelled out). Fully swallowed per spec —
 * warming NEVER blocks or fails onboarding. Returns [{ spec, ok, ms, skipped? }].
 */
function warmNpxCache(specs, { perSpecTimeoutMs = 30000 } = {}) {
  const env = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ? process.env.NODE_OPTIONS + " " : ""}${IPV4_NODE_OPTIONS}` };
  const out = [];
  for (const spec of specs) {
    if (!NPX_SPEC_RE.test(spec)) { out.push({ spec, ok: false, ms: 0, skipped: true }); continue; }
    const t0 = process.hrtime.bigint();
    let ok = true;
    try {
      execSync(`npm cache add ${spec}`, { stdio: "ignore", timeout: perSpecTimeoutMs, env });
    } catch {
      ok = false;
    }
    out.push({ spec, ok, ms: Math.round(Number(process.hrtime.bigint() - t0) / 1e6) });
  }
  return out;
}

/**
 * Pure: map warm results → self-diagnostics observations. A warm that FAILED (or was skipped for
 * an unsafe spec) means the generated .mcp.json ships without a warmed cache for that server, so
 * its first start will hit the registry — a `degraded_artifact` on `mcp_config`. A successful warm
 * produces nothing. Kept pure + exported so this telemetry mapping is unit-tested without network.
 */
export function classifyWarmResults(results) {
  return (results || [])
    .filter((r) => !r.ok)
    .map((r) => ({
      class: "degraded_artifact",
      subject: "mcp_config",
      evidence: { snippet: r.skipped ? `npx spec skipped (unsafe): ${r.spec}` : `npx cache warm failed: ${r.spec}` },
    }));
}

/** Windows template uses command:"cmd", args:["/c","npx",...]. On *nix call npx directly. */
function normalizeForOs(server, os) {
  if (os === "windows") return server;
  if (server.command === "cmd" && Array.isArray(server.args) && server.args[0] === "/c") {
    return { ...server, command: server.args[1], args: server.args.slice(2) };
  }
  return server;
}

/**
 * Token env keys gen-mcp may find in settings.local.json `env` and must remove (VCST-6402). The
 * VCST-5774 design wrote a PAT VALUE there so .mcp.json could reference it as `${VAR}`; tokens now
 * live in vc-secrets, so any of these in a settings `env` is a credential at rest in a file and an
 * export to every session subprocess. The list is the names that design wrote plus the runtime token
 * names, which never belonged in a settings file either.
 */
export const TOKEN_ENV_KEYS = [
  "GITHUB_PERSONAL_ACCESS_TOKEN", "POSTMAN_API_KEY", "CONTEXT7_API_KEY",
  "GITHUB_FIX_BUGS_TOKEN", "GIT_TOKEN", "GITHUB_TOKEN", "GH_TOKEN",
  "ADO_PAT", "ADO_MCP_AUTH_TOKEN", "JIRA_API_TOKEN",
];

/** Servers removed from onboarding (VCST-6402 D2): each needed an API key in a file. */
export const REMOVED_SERVERS = ["postman", "context7"];
/** Their keys: no server reads them any more, so they are removed outright. */
export const REMOVED_SERVER_KEYS = ["POSTMAN_API_KEY", "CONTEXT7_API_KEY"];

/**
 * The settings object with VC_RUN + VC_SECRETS set and the removed servers' keys pruned from `env`.
 * Every other token key stays (`kept`): deleting one is migrate-secrets' job, after a live probe. Pure.
 * VC_SECRETS lives here, in the project, not in ~/.claude/settings.json: it is what `${VC_SECRETS}`
 * in this project's .mcp.json expands from, and nothing outside the project needs it.
 * @returns {{ settings: object, pruned: string[], kept: string[] }}
 */
export function pruneSettingsEnv(settings, { vcRun, vcSecrets } = {}) {
  const next = { ...settings };
  const env = { ...(settings.env || {}) };
  const pruned = REMOVED_SERVER_KEYS.filter((k) => k in env);
  const kept = TOKEN_ENV_KEYS.filter((k) => k in env && !REMOVED_SERVER_KEYS.includes(k));
  for (const k of pruned) delete env[k];
  if (vcRun) env.VC_RUN = vcRun;
  if (vcSecrets) env.VC_SECRETS = vcSecrets;
  if (Object.keys(env).length) next.env = env;
  else delete next.env;
  if (Array.isArray(next.enabledMcpjsonServers)) {
    next.enabledMcpjsonServers = next.enabledMcpjsonServers.filter((n) => !REMOVED_SERVERS.includes(n));
  }
  return { settings: next, pruned, kept };
}

/** The github server entry for the axis: a vc-secrets call (PAT) or the hosted server (session). Pure. */
export function githubEntryFor(githubAuth) {
  return githubAuth === "pat" ? githubMcpEntryPat() : githubMcpEntryOAuth();
}

/** The `<PLACEHOLDER>` names left unresolved in a built server def (deduped) — the template carries none
 * since VCST-6402; this stays as a guard against a hand-edited template that adds one.
 *
 * Single source of truth for "this server is missing a credential", used by BOTH the enable
 * decision (an optional extra with a missing key stays dormant) and the degraded-artifact WARN
 * below (which now only ever sees servers we actually enabled). Keeping one helper is what stops
 * the two from drifting — the bug it replaced was exactly that divergence: the enable side checked
 * nothing while the warn side checked for placeholders. */
export function unresolvedPlaceholders(server) {
  if (!server) return [];
  return [...new Set(JSON.stringify(server).match(/<[A-Z0-9_]+>/g) || [])];
}

// ─── evidence destination (VCST-5582 C) + project lane configs ─────────────────────────
// Moved to lib/playwright-lanes.mjs, which write-secrets-decl.mjs shares (option B lanes); re-exported
// here for the callers and tests that import them from gen-mcp.
export { EVIDENCE_INCOMING, absolutizeOutputDir, preferProjectPlaywrightConfig } from "./lib/playwright-lanes.mjs";

/** The project's local vc-secrets declaration, parsed; null when absent or unreadable. */
function readLocalDecl(root) {
  try {
    return JSON.parse(readFileSync(join(root, ".claude", "vc-secrets.local.json"), "utf8"));
  } catch {
    return null;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  standDownIfHostGoverned(outputRoot(), "gen-mcp skipped: .mcp.json and the .claude/settings*.json servers/env are the host's — nothing written or pruned");
  if (args["inline-secrets"] !== undefined && asBool(args["inline-secrets"])) {
    console.error("[gen-mcp] ✗ --inline-secrets was removed (VCST-6402): it wrote a credential literal into .mcp.json, and no token is written into any file now. "
      + "A GitHub PAT reaches its MCP server through vc-secrets (`node ${VC_SECRETS} run github`). To move a token that is still in a file, run /project-init --check.");
    process.exit(1);
  }
  const os = detectOs(args.os);
  const tracker = args.tracker || "jira";
  const extras = String(args.with || "").split(",").map((s) => s.trim()).filter(Boolean);
  const projectRoot = outputRoot();

  // The GitHub axis decides the github server's shape: the flag, else the profile §6 just wrote.
  const profile = readProjectProfile(projectRoot).raw;
  const githubAuth = args["github-auth"] || (profile ? authAxes(profile).github.mode : "") || "gh-cli";
  if (!["pat", "gh-cli"].includes(githubAuth)) {
    console.error(`[gen-mcp] invalid --github-auth "${githubAuth}" (pat | gh-cli)`);
    process.exit(1);
  }
  const vcRun = typeof args["vc-run"] === "string" ? args["vc-run"] : defaultShimPath();
  const vcSecrets = typeof args["vc-secrets"] === "string" ? args["vc-secrets"] : vcSecretsShim().path;

  const templatePath = join(PLUGIN_ROOT, "templates", ".mcp.json.example");
  if (!existsSync(templatePath)) {
    console.error(`[gen-mcp] template not found: ${templatePath}`);
    process.exit(1);
  }
  const template = JSON.parse(readFileSync(templatePath, "utf-8"));
  const srcServers = template.mcpServers || {};

  // Build the tailored mcpServers (OS-normalized + evidence dir pinned to an absolute project path),
  // keeping all defs. The github entry is replaced by its axis shape; a removed server never ships.
  const mcpServers = {};
  for (const [name, def] of Object.entries(srcServers)) {
    if (REMOVED_SERVERS.includes(name)) continue;
    if (name === "github") {
      mcpServers[name] = githubEntryFor(githubAuth);
      continue;
    }
    // normalizeForOs first (so a *nix `npx` command is detectable), then the IPv4-first NODE_OPTIONS
    // + prefer-offline (#220) and the absolute evidence dir; finally strip the template's `//`
    // doc-comment keys so they don't leak into the runtime .mcp.json.
    const built = preferProjectPlaywrightConfig(absolutizeOutputDir(ensureNodeOptions(normalizeForOs(def, os)), projectRoot), name, projectRoot);
    mcpServers[name] = stripComments(built);
  }

  // The Playwright pin and specs are read from the lanes as the template builds them, before option B
  // below replaces those entries with a bridge call that names no package.
  const pwVersion = pinnedPlaywrightVersion(mcpServers);
  const pwSpecs = extractNpxSpecs(Object.fromEntries(Object.entries(mcpServers).filter(([n]) => /^playwright-/.test(n))));
  // Option B (lib/passwords.mjs): the declaration keeps the test-user passwords in vc-secrets, so each
  // lane is `node ${VC_RUN} playwright <lane>` — the bridge runs the current env's declared lane server,
  // and no --secrets file is passed or needed. The declaration is the switch; /project-init writes it.
  const passwordEnvs = Object.keys(declaredPasswords(readLocalDecl(projectRoot))).sort();
  if (passwordEnvs.length) {
    for (const name of Object.keys(mcpServers)) {
      if (/^playwright-[a-z0-9]+$/.test(name)) mcpServers[name] = laneEntryViaBridge(name.slice("playwright-".length));
    }
  }

  // Which servers to ENABLE (the rest stay defined but dormant). Only playwright-chrome
  // is enabled by default; playwright-firefox / playwright-edge stay DEFINED in .mcp.json
  // so the client can opt into cross-browser runs by adding them to enabledMcpjsonServers.
  const enabled = new Set([
    "playwright-chrome",
    "github",
  ]);
  if (tracker === "jira") enabled.add("atlassian");
  if (tracker === "azure" || extras.includes("azure")) enabled.add("azure-mcp");
  const extraMap = {
    figma: "figma-remote-mcp",
    devtools: "Chrome DevTools",
  };
  for (const e of extras) {
    if (REMOVED_SERVERS.includes(e)) {
      console.log(`[gen-mcp] --with ${e}: that server was removed from onboarding (VCST-6402) — it needed an API key in a file. Skipped.`);
      continue;
    }
    if (extraMap[e]) enabled.add(extraMap[e]);
  }
  // Only enable servers that actually exist in the template.
  const enabledList = [...enabled].filter((n) => mcpServers[n]);

  // Ignore EVERY file this run generates BEFORE writing any of them, so `.mcp.json` never exists
  // un-ignored — not even for the duration of this function (VCST-5774 D2). Two labelled blocks:
  // the local config, then the browser evidence landing zone. Resolve both destinations FIRST: the
  // ignore entries are derived from where the files will actually land.
  const outPath = resolveOutPath(args.out, ".mcp.json");
  const settingsPath = args.settings
    ? resolve(outputRoot(), args.settings)
    : join(outputRoot(), ".claude", "settings.local.json");
  // NOTHING has been written yet — this is the last point where refusing costs nothing. An
  // unparsable settings file would be flattened (taking `permissions.deny` with it), and an
  // already-TRACKED one cannot be protected by any .gitignore rule (review #1 + #3).
  const { settings: existingSettings, blockers, warnings } = preflightWriteTargets({ projectRoot, outPath, settingsPath });
  for (const w of warnings) console.warn(`[gen-mcp] ⚠ ${w}`);
  if (blockers.length) {
    for (const b of blockers) console.error(`[gen-mcp] ✗ ${b}`);
    emitObservations(
      blockers.map((b) => ({ class: "self_reported_fail", subject: "mcp_config", evidence: { snippet: b.slice(0, 300) } })),
      { skill: "project-init" },
    );
    console.error("[gen-mcp] nothing was written.");
    process.exit(1);
  }

  const generatedEntries = [outPath, settingsPath].map((f) => ignoreEntryFor(projectRoot, f));
  for (const [i, entry] of generatedEntries.entries()) {
    if (!entry) console.warn(`[gen-mcp] ⚠ ${[outPath, settingsPath][i]} is OUTSIDE the project root — no .gitignore entry can cover it. Make sure it is not committed.`);
  }
  const ignoredSecrets = ensureProjectIgnores(projectRoot, generatedEntries);
  const ignoredEvidence = ensureGitignoreEntries(projectRoot, EVIDENCE_IGNORES);
  const ignored = [...ignoredSecrets, ...ignoredEvidence];
  if (ignored.length) console.log(`[gen-mcp] .gitignore += ${ignored.join(", ")}`);

  // The github server on a PAT axis is declared in vc-secrets; make sure that declaration exists and
  // matches the shipped shape. Idempotent — /project-init §3c normally wrote it already, so this
  // changes nothing and asks no new trust. All axes come from the profile, so a call here never
  // drops another axis's task.
  let decl = null;
  if (githubAuth === "pat" || passwordEnvs.length) {
    // Option B's lane servers are rebuilt here too, from the same builder §3c used — unchanged unless a
    // lane config appeared or moved since.
    const pat = profile ? patAxesFromProfile(profile) : { github: githubAuth === "pat", ado: false, jira: false };
    if (githubAuth === "pat") pat.github = true;
    try {
      decl = writeSecretsDecl({ root: projectRoot, pat, shim: vcRun });
    } catch (e) {
      console.error(`[gen-mcp] ✗ ${e.message}`);
      process.exit(1);
    }
  }

  writeFileSync(outPath, JSON.stringify({ mcpServers }, null, 2) + "\n");
  console.log(`[gen-mcp] wrote ${outPath} (os=${os})`);
  console.log(`[gen-mcp] github MCP: ${githubAuth === "pat" ? "github-pat via vc-secrets (node ${VC_SECRETS} run github)" : "hosted server, OAuth on first use (gh-cli axis)"}`);
  if (decl?.trustNeeded) {
    console.warn(`[gen-mcp] ⚠ the vc-secrets declarations changed (${decl.path}) — run \`node "<VC_SECRETS>" trust\` in a terminal before restarting.`);
  }
  console.log(passwordEnvs.length
    ? `[gen-mcp] browser passwords: vc-secrets for ${passwordEnvs.join(", ")} — each lane runs \`node \${VC_RUN} playwright <lane>\`, which starts the declared server playwright-<lane>.<TEST_ENV>; no password file`
    : `[gen-mcp] browser passwords: ${existsSync(join(projectRoot, ".env.playwright.local")) ? ".env.playwright.local, passed as --secrets" : "no .env.playwright.local yet — run sync-browser-secrets.mjs, then gen-mcp again"}`);
  console.log(`[gen-mcp] browser evidence lands in ${join(projectRoot, ...EVIDENCE_INCOMING)}\\<browser> (absolute — never the project root, whatever cwd the MCP server starts in)`);
  // VCST-5702 ITEM 4 — emit the PINNED @playwright/mcp version so a version mismatch surfaces at
  // project-init. On 0.0.77 and 0.0.83 a bare screenshot filename resolves against the server cwd, not the
  // configured --output-dir, so Stage 5 (output-paths.md) MUST reconcile the file into _incoming/.
  if (pwVersion) {
    console.log(`[gen-mcp] @playwright/mcp pinned at ${pwVersion} — capture with a BARE filename; on 0.0.77–0.0.83 it lands in the server cwd, so /qa-bug reconciles it into _incoming/ (output-paths.md Stage 5).`);
  }

  // settings.local.json (gitignored): the enabled set, VC_RUN, and NO token. Already read + validated
  // by the preflight above; an unparsable file halted the run there rather than being replaced (#1).
  mkdirSync(dirname(settingsPath), { recursive: true });
  const { settings, pruned, kept } = pruneSettingsEnv(existingSettings, { vcRun, vcSecrets });
  settings.enabledMcpjsonServers = enabledList;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  console.log(`[gen-mcp] enabled servers: ${enabledList.join(", ")}`);
  console.log(`[gen-mcp] ${settingsPath} env: VC_RUN=${vcRun}${vcSecrets ? `, VC_SECRETS=${vcSecrets}` : ""} (paths, not secrets)`);
  if (!vcSecrets && githubAuth === "pat") {
    console.warn("[gen-mcp] ⚠ no vc-secrets shim found, so VC_SECRETS was not written and the github server (`node ${VC_SECRETS} run github`) cannot start — run /project-init --check (§0d installs the shim).");
  }
  if (pruned.length) {
    console.log(`[gen-mcp] removed ${pruned.join(", ")} from ${settingsPath} — their servers are no longer generated (VCST-6402).`);
  }
  if (kept.length) {
    // Kept, not deleted: it may be the only working copy (migrate-secrets keeps one whose vc-secrets probe failed).
    console.warn(`[gen-mcp] ⚠ ${settingsPath} still holds ${kept.join(", ")} in plaintext — tokens live in vc-secrets now (VCST-6402). Store it with \`node "<VC_SECRETS>" set <name>\`, then /project-init --check (migrate-secrets --strip removes it once the vc-secrets copy works); rotate it — it sat in a file exported to every session.`);
    emitObservations([{ class: "self_reported_warn", subject: "plaintext_token_in_settings", code: "NONE", evidence: { snippet: `${kept.length} token key(s) still in settings env` } }], { skill: "project-init" });
  }

  // A server whose definition still carries a `<PLACEHOLDER>` cannot start — a guard for a hand-edited
  // template; the shipped one carries none. Reported as a degraded artifact (8a).
  const obs = [];
  for (const name of enabledList) {
    const names = unresolvedPlaceholders(mcpServers[name]);
    if (!names.length) continue;
    console.warn(`[gen-mcp] ⚠ ${name}: unresolved ${names.join(", ")} in the template — fix templates/.mcp.json.example.`);
    for (const placeholder of names) {
      obs.push({ class: "degraded_artifact", subject: "mcp_config", evidence: { snippet: `${name}: unresolved ${placeholder}` } });
    }
  }
  if (obs.length) emitObservations(obs, { skill: "project-init" });

  // #220 item 5 — opt-in (--warm-cache): pre-fetch the pinned npx packages into the npm cache so
  // the first MCP start doesn't pay a registry round-trip. The github server on a PAT axis runs
  // mcp-remote from its vc-secrets declaration, so that spec is added by hand.
  if (asBool(args["warm-cache"])) {
    const specs = extractNpxSpecs(mcpServers);
    if (githubAuth === "pat") specs.push(MCP_REMOTE_SPEC);
    if (passwordEnvs.length) specs.push(...pwSpecs.filter((p) => !specs.includes(p)));
    console.log(`[gen-mcp] warming npm cache for ${specs.length} npx package(s): ${specs.join(", ") || "(none)"}`);
    const results = warmNpxCache(specs);
    for (const r of results) {
      if (r.ok) console.log(`[gen-mcp] warmed ${r.spec} in ${r.ms}ms`);
      else console.warn(`[gen-mcp] ⚠ could not warm ${r.spec}${r.skipped ? " (unsafe spec — skipped)" : ` (${r.ms}ms)`} — its first MCP start will hit the registry; check network/proxy.`);
    }
    const warmObs = classifyWarmResults(results);
    if (warmObs.length) emitObservations(warmObs, { skill: "project-init" });
  }

  console.log("[gen-mcp] ⚠ Restart Claude Code for the MCP servers, VC_RUN and VC_SECRETS to take effect.");
  if (asBool(args.print)) console.log(JSON.stringify({ mcpServers }, null, 2));
}

// CLI only — `ensureGitignoreEntries` / `absolutizeOutputDir` are imported by the unit tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
