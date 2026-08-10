#!/usr/bin/env node
/**
 * skills/project-init/gen-mcp.mjs
 *
 * Generate .mcp.json from templates/.mcp.json.example, tailored to:
 *   - the OS (the template is Windows-first `cmd /c npx`; on Linux/macOS we drop
 *     the `cmd /c` and call npx directly — per the note in the template head),
 *   - the chosen tracker/VCS (enable only the relevant servers via
 *     .claude/settings.local.json `enabledMcpjsonServers`),
 *   - available tokens (inject placeholders that are present in the env; for the
 *     github MCP, fall back to `gh auth token` when no PAT env is set).
 *
 * .mcp.json keeps ALL server definitions (so they're available), but only the
 * enabled subset is listed in settings.local.json. Both files are gitignored.
 *
 * Usage:
 *   node skills/project-init/gen-mcp.mjs --tracker jira --client-vcs github \
 *     [--with postman,figma,context7,devtools] [--os linux|windows|mac] \
 *     [--out .mcp.json] [--settings .claude/settings.local.json] [--print]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname, resolve, isAbsolute } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { config as dotenv } from "dotenv";
import { outputRoot, pluginRoot, resolveOutPath } from "./lib/paths.mjs";
import { resolveTestEnv } from "../../scripts/lib/resolve-test-env.js";
import { emitObservations } from "./lib/diag-obs.mjs";

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
 * The official REMOTE github MCP supports interactive OAuth exactly like atlassian/figma (which
 * ship header-less). If no PAT resolved, injectTokens leaves a literal `Bearer <PLACEHOLDER>` —
 * a broken header that 401s with NO path to OAuth. So when the Authorization header is still an
 * unresolved placeholder, DROP it: the server then falls back to the OAuth flow (the behaviour the
 * template comment promises). Pure. #220 item 4.
 */
export function enableOAuthIfNoPat(server) {
  const auth = server?.headers?.Authorization;
  if (typeof auth !== "string" || !/<[A-Z0-9_]+>/.test(auth)) return server;
  const headers = { ...server.headers };
  delete headers.Authorization;
  return { ...server, headers };
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
 * HERE: on @playwright/mcp 0.0.77 a bare screenshot filename resolves against the MCP server's OWN
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

/** Inject a token into any `<PLACEHOLDER>` string value within the server def.
 *
 * The substitution used to fire ONLY when the entire string equalled a placeholder — `replace(v)`
 * returned `tok[v]` keyed on the whole value — so an EMBEDDED placeholder like the Postman MCP's
 * `"Authorization": "Bearer <POSTMAN_API_KEY>"` was never touched: `tok["Bearer <POSTMAN_API_KEY>"]`
 * is `undefined`. The `.mcp.json` then shipped with a literal `Bearer <POSTMAN_API_KEY>` even when
 * `POSTMAN_API_KEY` WAS set, the server 401'd, and the WARN below fired on a key that existed
 * (reported upstream as #174 / `project-init/mcp_config`). Fix: replace every KNOWN placeholder
 * wherever it appears in the string. A placeholder whose value is empty is left in place, so the
 * genuine "unresolved" WARN + observation still fire for a truly missing token. */
function injectTokens(server) {
  const tok = {
    "<GITHUB_PERSONAL_ACCESS_TOKEN>":
      process.env.GITHUB_PERSONAL_ACCESS_TOKEN ||
      process.env.GITHUB_FIX_BUGS_TOKEN ||
      process.env.GIT_TOKEN ||
      process.env.GITHUB_TOKEN ||
      ghAuthToken(),
    "<POSTMAN_API_KEY>": process.env.POSTMAN_API_KEY || "",
    "<CONTEXT7_API_KEY>": process.env.CONTEXT7_API_KEY || "",
    // NB: no <FIGMA_API_KEY> — the remote Figma MCP is OAuth-only, so the template carries no
    // figma key placeholder to inject (#220 item 3).
  };
  const replace = (v) => {
    if (typeof v !== "string") return v;
    let out = v;
    for (const [ph, val] of Object.entries(tok)) {
      if (val && out.includes(ph)) out = out.split(ph).join(val);
    }
    return out;
  };
  const walk = (o) => {
    if (Array.isArray(o)) return o.map(walk);
    if (o && typeof o === "object") {
      const out = {};
      for (const [k, v] of Object.entries(o)) out[k] = typeof v === "object" ? walk(v) : replace(v);
      return out;
    }
    return o;
  };
  return walk(server);
}

// ─── evidence destination (VCST-5582 C) ──────────────────────────────────────────────
//
// Screenshots taken during a /qa-bug run were landing at the PROJECT ROOT and being moved
// afterwards. Two facts existed but were never connected: the template's `--output-dir` was
// RELATIVE (`test-results/<browser>`, resolved against whatever cwd the MCP server happens to
// start in — the project root, if we're lucky), while `skills/qa-evidence/output-paths.md`
// declared the destination policy `reports/bugs/screenshots/`. Nothing said HOW a screenshot
// gets from one to the other, so the path was guessed.
//
// The fix is to make the DESTINATION DETERMINISTIC rather than hope about cwd: we rewrite
// `--output-dir` to an ABSOLUTE path inside the project's own evidence tree. Whatever cwd the
// MCP server inherits, its default target can no longer be the project root — the strongest
// available guarantee, since playwright-mcp resolves a relative --output-dir against its cwd.
// `_incoming/` is the landing zone; /qa-bug performs ONE deterministic move from there into
// `reports/bugs/screenshots/<bug-slug>/` at its evidence step.
const EVIDENCE_INCOMING = ["reports", "bugs", "screenshots", "_incoming"];
/** Rewrite a Playwright server's relative --output-dir to an absolute path under the project. */
export function absolutizeOutputDir(server, root) {
  const args = server?.args;
  if (!Array.isArray(args)) return server;
  const i = args.indexOf("--output-dir");
  if (i < 0 || i + 1 >= args.length) return server;
  const current = String(args[i + 1] || "");
  if (isAbsolute(current)) return server; // already pinned (a hand-edited template)
  // Keep only the LAST path segment (the browser lane) and re-root it in the evidence tree,
  // so an older template value like `test-results/chrome` is migrated too.
  const lane = current.split(/[/\\]/).filter(Boolean).pop() || "chrome";
  const next = [...args];
  next[i + 1] = join(root, ...EVIDENCE_INCOMING, lane);
  return { ...server, args: next };
}

/**
 * Append the ignore entries the destination above implies, if missing. Idempotent, and it
 * only ever APPENDS a marked block — an existing .gitignore is never rewritten or reordered.
 * These live here rather than in a separate generator because they exist BECAUSE of the
 * --output-dir this script just wrote; keeping them together stops the two from drifting.
 */
export function ensureGitignoreEntries(root, entries) {
  const path = join(root, ".gitignore");
  const existing = existsSync(path) ? readFileSync(path, "utf-8") : "";
  const lines = new Set(existing.split(/\r?\n/).map((l) => l.trim()));
  const missing = entries.filter((e) => !lines.has(e));
  if (!missing.length) return [];
  const block = [
    existing && !existing.endsWith("\n") ? "\n" : "",
    "\n# === vc-fix (/project-init) — browser evidence landing zone ===\n",
    "# The Playwright MCP servers write raw captures here; /qa-bug moves the ones it keeps\n",
    "# into reports/bugs/screenshots/<bug-slug>/. Nothing here is evidence of record.\n",
    missing.map((e) => `${e}\n`).join(""),
  ].join("");
  writeFileSync(path, existing + block);
  return missing;
}

/**
 * Layer the deployment's env files into process.env BEFORE injectTokens() reads them (VCST-5582 E4).
 *
 * gen-mcp used to read tokens straight from process.env, but /project-init's documented flow puts
 * them in `.env.local` (scaffold-secrets.mjs tells the operator to) — a file no one has SOURCED into
 * the environment on the first pass. So GITHUB_PERSONAL_ACCESS_TOKEN / POSTMAN_API_KEY / … read as
 * unset, and the github/postman MCP shipped DISABLED (unresolved `<PLACEHOLDER>`). It only ever
 * resolved if someone re-ran the generator with the secrets already exported — which the flow never
 * tells anyone to do. Mirror derive-context.mjs exactly: `.env.defaults` → `.env.<TEST_ENV>` →
 * `.env.local`, then promote the per-env `_<ENV>` suffix, all rooted at outputRoot (the project).
 * Does NOT override a value already present in process.env (a real export wins over a file).
 */
function loadDeploymentEnv(root = outputRoot()) {
  const TEST_ENV = resolveTestEnv("vcst");
  dotenv({ path: join(root, ".env.defaults"), quiet: true });
  dotenv({ path: join(root, `.env.${TEST_ENV}`), override: true, quiet: true });
  dotenv({ path: join(root, ".env.local"), override: true, quiet: true });
  const SUF = `_${TEST_ENV.toUpperCase()}`;
  for (const [k, v] of Object.entries(process.env)) {
    if (k.endsWith(SUF) && v) process.env[k.slice(0, -SUF.length)] = v;
  }
}

let _ghToken;
function ghAuthToken() {
  if (_ghToken !== undefined) return _ghToken;
  try {
    _ghToken = execSync("gh auth token", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    _ghToken = "";
  }
  return _ghToken;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  // Load .env.defaults/.env.<env>/.env.local so a token the operator placed in .env.local (per the
  // documented flow) is actually seen on the FIRST pass — before injectTokens() reads process.env.
  loadDeploymentEnv();
  const os = detectOs(args.os);
  const tracker = args.tracker || "jira";
  const extras = String(args.with || "").split(",").map((s) => s.trim()).filter(Boolean);

  const templatePath = join(PLUGIN_ROOT, "templates", ".mcp.json.example");
  if (!existsSync(templatePath)) {
    console.error(`[gen-mcp] template not found: ${templatePath}`);
    process.exit(1);
  }
  const template = JSON.parse(readFileSync(templatePath, "utf-8"));
  const srcServers = template.mcpServers || {};

  // Build the tailored mcpServers (OS-normalized + tokens injected + evidence dir pinned to
  // an absolute project path), keeping all defs.
  const projectRoot = outputRoot();
  const mcpServers = {};
  for (const [name, def] of Object.entries(srcServers)) {
    // normalizeForOs first (so a *nix `npx` command is detectable), then inject the IPv4-first
    // NODE_OPTIONS + prefer-offline (#220), tokens, and the absolute evidence dir; for github,
    // fall back to OAuth if no PAT resolved; finally strip the template's `//` doc-comment keys
    // so they don't leak into the runtime .mcp.json.
    let built = absolutizeOutputDir(injectTokens(ensureNodeOptions(normalizeForOs(def, os))), projectRoot);
    if (name === "github") built = enableOAuthIfNoPat(built);
    mcpServers[name] = stripComments(built);
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
    postman: "postman",
    figma: "figma-remote-mcp",
    context7: "context7",
    devtools: "Chrome DevTools",
  };
  for (const e of extras) if (extraMap[e]) enabled.add(extraMap[e]);
  // Only enable servers that actually exist in the template.
  const enabledList = [...enabled].filter((n) => mcpServers[n]);

  const outPath = resolveOutPath(args.out, ".mcp.json");
  writeFileSync(outPath, JSON.stringify({ mcpServers }, null, 2) + "\n");
  console.log(`[gen-mcp] wrote ${outPath} (os=${os})`);
  console.log(`[gen-mcp] browser evidence lands in ${join(projectRoot, ...EVIDENCE_INCOMING)}\\<browser> (absolute — never the project root, whatever cwd the MCP server starts in)`);
  // VCST-5702 ITEM 4 — emit the PINNED @playwright/mcp version so a version mismatch surfaces at
  // project-init. On 0.0.77 a bare screenshot filename resolves against the server cwd, not the
  // configured --output-dir, so Stage 5 (output-paths.md) MUST reconcile the file into _incoming/.
  const pwVersion = pinnedPlaywrightVersion(mcpServers);
  if (pwVersion) {
    console.log(`[gen-mcp] @playwright/mcp pinned at ${pwVersion} — capture with a BARE filename; on 0.0.77 it lands in the server cwd, so /qa-bug reconciles it into _incoming/ (output-paths.md Stage 5).`);
  }

  // The ignore entries this destination implies. `_incoming/` is a landing zone, not evidence
  // of record; `test-results/` is kept for the legacy/hand-copied lane and any HAR output.
  const ignored = ensureGitignoreEntries(projectRoot, ["test-results/", "reports/bugs/screenshots/_incoming/"]);
  if (ignored.length) console.log(`[gen-mcp] .gitignore += ${ignored.join(", ")}`);

  // Sync settings.local.json enabledMcpjsonServers (gitignored) into the project's
  // .claude/ (created if the fresh project has none yet).
  const settingsPath = args.settings
    ? resolve(outputRoot(), args.settings)
    : join(outputRoot(), ".claude", "settings.local.json");
  mkdirSync(dirname(settingsPath), { recursive: true });
  let settings = {};
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, "utf-8")); } catch { settings = {}; }
  }
  settings.enabledMcpjsonServers = enabledList;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  console.log(`[gen-mcp] enabled servers: ${enabledList.join(", ")}`);

  // Warn about any enabled server whose token is still a placeholder — AND report it as an
  // observation (8a). `.mcp.json` is a REQUIRED output of /project-init, so shipping it with an
  // unresolved credential DEGRADES that output: the class is `degraded_artifact` on `mcp_config`,
  // not a bare warn. A visible warning that emitted no telemetry was the same blindness VCST-5582 H
  // fixed for the readiness table — self-diagnostics could not see the Postman 401 the shipped
  // `.mcp.json` guaranteed. Evidence carries the server name + placeholder NAME only (both
  // plugin-authored); the key VALUE is never in scope here (the placeholder is literally unresolved).
  const obs = [];
  for (const name of enabledList) {
    const blob = JSON.stringify(mcpServers[name]);
    const ph = blob.match(/<[A-Z0-9_]+>/g);
    if (!ph) continue;
    const names = [...new Set(ph)];
    console.warn(`[gen-mcp] ⚠ ${name}: unresolved ${names.join(", ")} — set the token in .env.local or via login, then re-run.`);
    for (const placeholder of names) {
      obs.push({ class: "degraded_artifact", subject: "mcp_config", evidence: { snippet: `${name}: unresolved ${placeholder}` } });
    }
  }
  if (obs.length) emitObservations(obs, { skill: "project-init" });

  // #220 item 5 — opt-in (--warm-cache): pre-fetch the pinned npx packages into the npm cache so
  // the first MCP start doesn't pay a registry round-trip. Opt-in because it does N network fetches;
  // it runs with the IPv4-first hint so it can't hang on a broken IPv6 route, and is best-effort.
  if (args["warm-cache"]) {
    const specs = extractNpxSpecs(mcpServers);
    console.log(`[gen-mcp] warming npm cache for ${specs.length} npx package(s): ${specs.join(", ") || "(none)"}`);
    const results = warmNpxCache(specs);
    for (const r of results) {
      if (r.ok) console.log(`[gen-mcp] warmed ${r.spec} in ${r.ms}ms`);
      else console.warn(`[gen-mcp] ⚠ could not warm ${r.spec}${r.skipped ? " (unsafe spec — skipped)" : ` (${r.ms}ms)`} — its first MCP start will hit the registry; check network/proxy.`);
    }
    const warmObs = classifyWarmResults(results);
    if (warmObs.length) emitObservations(warmObs, { skill: "project-init" });
  }

  console.log("[gen-mcp] ⚠ Restart the MCP servers (reload the IDE / Claude Code) for changes to take effect.");
  if (args.print) console.log(JSON.stringify({ mcpServers }, null, 2));
}

// CLI only — `ensureGitignoreEntries` / `absolutizeOutputDir` are imported by the unit tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
