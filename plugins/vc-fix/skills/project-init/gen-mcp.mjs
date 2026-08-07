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

// #220 — every stdio MCP server launches through `npx`, so each start performs an npm
// registry lookup inside the host's ~30s MCP startup budget. On a host that falls back
// slowly from a broken/unrouted IPv6 address to IPv4, that lookup has hung ~150s (vs ~4s
// with an IPv4-first hint), blowing the budget so ALL stdio servers fail to start and the
// browser/evidence capability is gone. Give every stdio server a NODE_OPTIONS that (a) turns
// off Happy-Eyeballs network-family autoselection and (b) makes DNS return IPv4 first, so the
// npx fetch never sits on a dead IPv6 socket. (Package versions are also pinned in the template
// so a cached package needs no registry round-trip at all.)
const IPV4_NODE_OPTIONS = "--no-network-family-autoselection --dns-result-order=ipv4first";
/**
 * Ensure a stdio (Node-launched) server carries the IPv4-first NODE_OPTIONS. Pure + idempotent:
 * an http/sse server (no local process) is untouched, an existing NODE_OPTIONS is preserved and
 * the flags are appended only if not already present, and any other env is kept. Both flags are
 * on Node's NODE_OPTIONS allow-list, so this never makes a server refuse to start.
 */
export function ensureNodeOptions(server) {
  if (server?.type && server.type !== "stdio") return server; // http/sse: no Node process to hint
  const args = Array.isArray(server?.args) ? server.args : [];
  const isNodeLaunch = server?.command === "npx" || (server?.command === "cmd" && args.includes("npx"));
  if (!isNodeLaunch) return server;
  const prev = server.env?.NODE_OPTIONS || "";
  if (prev.includes("--dns-result-order")) return server; // already hinted — don't double-append
  const NODE_OPTIONS = prev ? `${prev} ${IPV4_NODE_OPTIONS}` : IPV4_NODE_OPTIONS;
  return { ...server, env: { ...(server.env || {}), NODE_OPTIONS } };
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
    "<FIGMA_API_KEY>": process.env.FIGMA_API_KEY || "",
    "<CONTEXT7_API_KEY>": process.env.CONTEXT7_API_KEY || "",
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
    // NODE_OPTIONS (#220), tokens, and the absolute evidence dir.
    mcpServers[name] = absolutizeOutputDir(injectTokens(ensureNodeOptions(normalizeForOs(def, os))), projectRoot);
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

  console.log("[gen-mcp] ⚠ Restart the MCP servers (reload the IDE / Claude Code) for changes to take effect.");
  if (args.print) console.log(JSON.stringify({ mcpServers }, null, 2));
}

// CLI only — `ensureGitignoreEntries` / `absolutizeOutputDir` are imported by the unit tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
