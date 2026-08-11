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
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

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

// #220 — stdio MCP servers launch via npx (an npm registry lookup inside the ~30s startup budget).
// On a host that falls back slowly from a broken IPv6 route to IPv4 that lookup can hang ~150s and
// every stdio server misses the budget. Set NODE_OPTIONS to prefer IPv4 in DNS (the actual cure) +
// npm prefer-offline so a package ALREADY in the npx cache resolves without a registry round-trip
// (a cold first fetch still runs, now fast over IPv4 — this surface has no cache-warm step). ONLY
// `--dns-result-order=ipv4first`
// (NODE_OPTIONS-allowed since Node 16.4); NOT `--no-network-family-autoselection` (newer flag, fatal
// in NODE_OPTIONS on the Node-18 floor). Mirrors the plugin copy (plugins/vc-fix). Pure + idempotent.
const IPV4_NODE_OPTIONS = "--dns-result-order=ipv4first";
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

/** Windows template uses command:"cmd", args:["/c","npx",...]. On *nix call npx directly. */
function normalizeForOs(server, os) {
  if (os === "windows") return server;
  if (server.command === "cmd" && Array.isArray(server.args) && server.args[0] === "/c") {
    return { ...server, command: server.args[1], args: server.args.slice(2) };
  }
  return server;
}

/** Inject a token into any `<PLACEHOLDER>` string value within the server def. */
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
  const replace = (v) =>
    typeof v === "string" && tok[v] !== undefined && tok[v] ? tok[v] : v;
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

/** The `<PLACEHOLDER>` names injectTokens() could NOT resolve in a built server def (deduped).
 * Drives the enable decision: an optional extra still carrying one stays dormant. */
export function unresolvedPlaceholders(server) {
  if (!server) return [];
  return [...new Set(JSON.stringify(server).match(/<[A-Z0-9_]+>/g) || [])];
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
  const os = detectOs(args.os);
  const tracker = args.tracker || "jira";
  const extras = String(args.with || "").split(",").map((s) => s.trim()).filter(Boolean);

  const templatePath = join(REPO_ROOT, "templates", ".mcp.json.example");
  if (!existsSync(templatePath)) {
    console.error(`[gen-mcp] template not found: ${templatePath}`);
    process.exit(1);
  }
  const template = JSON.parse(readFileSync(templatePath, "utf-8"));
  const srcServers = template.mcpServers || {};

  // Build the tailored mcpServers (OS-normalized + tokens injected), keeping all defs.
  const mcpServers = {};
  for (const [name, def] of Object.entries(srcServers)) {
    mcpServers[name] = injectTokens(ensureNodeOptions(normalizeForOs(def, os)));
  }

  // Which servers to ENABLE (the rest stay defined but dormant).
  const enabled = new Set([
    "playwright-chrome",
    "playwright-firefox",
    "playwright-edge",
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
  // An OPTIONAL extra whose key never resolved stays DEFINED but dormant — a blank optional key
  // means "leave that server disabled", not "ship a server that cannot start". Same fix as the
  // plugins/vc-fix twin; coupling-free, so it ports as-is.
  const dormantExtras = [];
  for (const e of extras) {
    const name = extraMap[e];
    if (!name) continue;
    const missing = unresolvedPlaceholders(mcpServers[name]);
    if (missing.length) dormantExtras.push({ name, missing });
    else enabled.add(name);
  }
  // Only enable servers that actually exist in the template.
  const enabledList = [...enabled].filter((n) => mcpServers[n]);

  const outPath = args.out ? resolve(args.out) : join(REPO_ROOT, ".mcp.json");
  writeFileSync(outPath, JSON.stringify({ mcpServers }, null, 2) + "\n");
  console.log(`[gen-mcp] wrote ${outPath} (os=${os})`);

  // Sync settings.local.json enabledMcpjsonServers (gitignored).
  const settingsPath = args.settings
    ? resolve(args.settings)
    : join(REPO_ROOT, ".claude", "settings.local.json");
  let settings = {};
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, "utf-8")); } catch { settings = {}; }
  }
  settings.enabledMcpjsonServers = enabledList;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  console.log(`[gen-mcp] enabled servers: ${enabledList.join(", ")}`);
  for (const { name, missing } of dormantExtras) {
    console.log(`[gen-mcp] ${name}: defined but NOT enabled — ${missing.join(", ")} unset (optional; set it in .env.local and re-run to enable).`);
  }

  // Warn about any enabled server whose token is still a placeholder.
  for (const name of enabledList) {
    const blob = JSON.stringify(mcpServers[name]);
    const ph = blob.match(/<[A-Z0-9_]+>/g);
    if (ph) console.warn(`[gen-mcp] ⚠ ${name}: unresolved ${[...new Set(ph)].join(", ")} — set the token in .env.local or via login, then re-run.`);
  }

  console.log("[gen-mcp] ⚠ Restart the MCP servers (reload the IDE / Claude Code) for changes to take effect.");
  if (args.print) console.log(JSON.stringify({ mcpServers }, null, 2));
}

// CLI only — importing this module (e.g. a unit test importing `ensureNodeOptions`) must NOT run
// main(), which would regenerate .mcp.json / settings.local.json as an import side effect. Mirrors
// the plugin copy's main-guard; the old bare `main();` here lacked it.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
