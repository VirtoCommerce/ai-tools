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
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { execSync } from "child_process";
import { outputRoot, pluginRoot, resolveOutPath } from "./lib/paths.mjs";

// Read the shipped template + source playwright configs from the plugin's own dir
// (works from any cwd); write .mcp.json / settings / per-project configs into the
// deployment project. The two roots are intentionally different — that is the fix.
const PLUGIN_ROOT = pluginRoot();

// Playwright MCP servers reference their config by a RELATIVE path (config/…). The MCP
// server process is spawned by Claude Code with cwd = the project dir, so a relative
// --config resolves there. We therefore COPY the shipped configs into the project so a
// portable relative reference resolves — rather than pointing at the versioned plugin
// cache (which would break on upgrade, and ${CLAUDE_PLUGIN_ROOT} does NOT expand inside
// a project-level .mcp.json). Copy-if-absent so per-project edits (HAR path, viewport)
// survive a re-run.
const PLAYWRIGHT_CONFIGS = [
  "mcp-playwright-chrome.config.json",
  "mcp-playwright-firefox.config.json",
  "mcp-playwright-edge.config.json",
];

function copyPlaywrightConfigs() {
  const srcDir = join(PLUGIN_ROOT, "config");
  const destDir = join(outputRoot(), "config");
  const copied = [];
  const kept = [];
  const missing = [];
  for (const name of PLAYWRIGHT_CONFIGS) {
    const src = join(srcDir, name);
    const dest = join(destDir, name);
    if (!existsSync(src)) { missing.push(name); continue; }
    if (existsSync(dest)) { kept.push(name); continue; }
    mkdirSync(destDir, { recursive: true });
    copyFileSync(src, dest);
    copied.push(name);
  }
  if (copied.length) console.log(`[gen-mcp] copied playwright configs → ${destDir}: ${copied.join(", ")}`);
  if (kept.length) console.log(`[gen-mcp] playwright configs already present (kept): ${kept.join(", ")}`);
  if (missing.length) console.warn(`[gen-mcp] ⚠ source config missing in plugin: ${missing.join(", ")}`);
}

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

  const templatePath = join(PLUGIN_ROOT, "templates", ".mcp.json.example");
  if (!existsSync(templatePath)) {
    console.error(`[gen-mcp] template not found: ${templatePath}`);
    process.exit(1);
  }
  const template = JSON.parse(readFileSync(templatePath, "utf-8"));
  const srcServers = template.mcpServers || {};

  // Build the tailored mcpServers (OS-normalized + tokens injected), keeping all defs.
  const mcpServers = {};
  for (const [name, def] of Object.entries(srcServers)) {
    mcpServers[name] = injectTokens(normalizeForOs(def, os));
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
  for (const e of extras) if (extraMap[e]) enabled.add(extraMap[e]);
  // Only enable servers that actually exist in the template.
  const enabledList = [...enabled].filter((n) => mcpServers[n]);

  // Copy the per-project playwright configs the relative --config refs resolve against.
  copyPlaywrightConfigs();

  const outPath = resolveOutPath(args.out, ".mcp.json");
  writeFileSync(outPath, JSON.stringify({ mcpServers }, null, 2) + "\n");
  console.log(`[gen-mcp] wrote ${outPath} (os=${os})`);

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

  // Warn about any enabled server whose token is still a placeholder.
  for (const name of enabledList) {
    const blob = JSON.stringify(mcpServers[name]);
    const ph = blob.match(/<[A-Z0-9_]+>/g);
    if (ph) console.warn(`[gen-mcp] ⚠ ${name}: unresolved ${[...new Set(ph)].join(", ")} — set the token in .env.local or via login, then re-run.`);
  }

  console.log("[gen-mcp] ⚠ Restart the MCP servers (reload the IDE / Claude Code) for changes to take effect.");
  if (args.print) console.log(JSON.stringify({ mcpServers }, null, 2));
}

main();
