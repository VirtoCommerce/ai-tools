/**
 * skills/project-init/lib/governance.mjs — host-governed projects (VCST-6402 step 8).
 *
 * Some client projects run their OWN governance plugin: it injects binding rules into every session,
 * ships its own approved MCP servers, and keeps secrets in its own wrapper. On such a project our
 * plugins are a GUEST — no MCP server of ours to the client's resources, no secret store of ours, no
 * PAT, no `az login`; the host's rules win. vc-init records that in the profile's `governance` block,
 * and every token path (the $VC_RUN bridge, gen-mcp, write-secrets-decl, migrate-secrets, the
 * discovery probes, self-diagnostics delivery) stands down.
 *
 * The registry below is the only place a host is described: its plugin id(s) and the MCP server KEYS
 * it ships, per role. Nothing else — no org, URL or tenant belongs here. Adding a host is one entry.
 * The role→server mapping is a DEFAULT the operator confirms or overrides during /project-init; which
 * server serves the tracker and which the code host is the operator's answer, never inferred.
 */
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import { join, resolve } from "node:path";

/** Roles a host server can fill. `browsers` is a list; the rest are one server key each. */
export const ROLES = ["tracker", "codeHost", "github", "telemetry", "testManagement", "browsers"];

export const HOSTS = Object.freeze({
  "opus-governance": {
    pluginIds: ["opus-governance@opus-tools"],
    servers: {
      tracker: "azure-mcp-work",
      codeHost: "azure-mcp-dev",
      github: "github",
      telemetry: "azure-monitor",
      testManagement: "testrail",
      browsers: ["playwright-chrome", "playwright-edge", "playwright-firefox"],
    },
  },
});

/** The governance block for a host (or none). Pure. */
export function governanceBlock(host, overrides = {}) {
  if (!host) return { host: null, secrets: "vc-secrets", servers: emptyServers(), stand: { writable: true } };
  const reg = HOSTS[host];
  if (!reg) throw new Error(`unknown governance host "${host}" (known: ${Object.keys(HOSTS).join(", ")})`);
  const servers = { ...reg.servers, browsers: [...reg.servers.browsers] };
  for (const role of ROLES) {
    if (overrides[role] === undefined) continue;
    servers[role] = role === "browsers"
      ? String(overrides[role]).split(",").map((s) => s.trim()).filter(Boolean)
      : String(overrides[role]);
  }
  return { host, secrets: "host", servers, stand: { writable: false } };
}

export function emptyServers() {
  return { tracker: "", codeHost: "", github: "", telemetry: "", testManagement: "", browsers: [] };
}

/** Is this profile (raw or layered) host-governed? Pure. */
export function isHostGoverned(profile) {
  return Boolean(profile?.governance?.host) || profile?.governance?.secrets === "host";
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Find an installed host governance plugin: Claude Code's install registry (a record for one of the
 * host's plugin ids), or the project's `.claude/settings.json` `enabledPlugins`. Returns the first match.
 * @returns {{ host: string, pluginId: string, installPath: string|null, source: string } | null}
 */
export function detectHost({ projectRoot = process.cwd(), home = process.env.HOME || os.homedir() } = {}) {
  const registry = readJson(join(home, ".claude", "plugins", "installed_plugins.json"));
  const settings = readJson(join(resolve(projectRoot), ".claude", "settings.json"));
  for (const [host, reg] of Object.entries(HOSTS)) {
    for (const id of reg.pluginIds) {
      const records = Array.isArray(registry?.plugins?.[id]) ? registry.plugins[id].filter((r) => r && typeof r === "object") : [];
      if (records.length) {
        const withPath = records.find((r) => typeof r.installPath === "string" && existsSync(r.installPath));
        return { host, pluginId: id, installPath: withPath ? withPath.installPath : null, source: "installed_plugins.json" };
      }
      if (settings?.enabledPlugins && settings.enabledPlugins[id]) {
        return { host, pluginId: id, installPath: null, source: ".claude/settings.json enabledPlugins" };
      }
    }
  }
  return null;
}

/** The install path of a host's plugin from the registry, or null. */
export function hostInstallPath(host, { home = process.env.HOME || os.homedir() } = {}) {
  const reg = HOSTS[host];
  if (!reg) return null;
  const registry = readJson(join(home, ".claude", "plugins", "installed_plugins.json"));
  for (const id of reg.pluginIds) {
    const recs = Array.isArray(registry?.plugins?.[id]) ? registry.plugins[id] : [];
    const r = recs.find((x) => x && typeof x.installPath === "string" && existsSync(x.installPath));
    if (r) return r.installPath;
  }
  return null;
}

/** The MCP server keys a host plugin ships: its `.mcp.json` and its plugin.json `mcpServers` (read-only). */
export function hostServerKeys(installPath) {
  const keys = new Set();
  if (!installPath) return keys;
  for (const doc of [readJson(join(installPath, ".mcp.json")), readJson(join(installPath, ".claude-plugin", "plugin.json"))]) {
    const servers = doc?.mcpServers;
    if (servers && typeof servers === "object" && !Array.isArray(servers)) for (const k of Object.keys(servers)) keys.add(k);
  }
  return keys;
}

/** The one line a token path prints when it stands down on a host-governed project. */
export function hostLine(profile, what) {
  const g = profile?.governance || {};
  return `host-governed (${g.host || "host"}): ${what} — done through the host's MCP servers at run time (project-profile.json governance.servers); the host's rules win.`;
}

/**
 * Stand a token / MCP-config path down on a host-governed project: print the one host line (or a JSON
 * object, for a script whose stdout is parsed) and exit 0 — a correct skip, not a failure. Never falls
 * back to a PAT, `az login` or a file. The profile is read from <root>/project-profile.json (or
 * PROJECT_PROFILE_PATH); no profile ⇒ not governed, carry on.
 */
export function standDownIfHostGoverned(root, what, { json = false } = {}) {
  const path = process.env.PROJECT_PROFILE_PATH || join(resolve(root), "project-profile.json");
  const profile = readJson(path);
  if (!isHostGoverned(profile)) return;
  const line = hostLine(profile, what);
  if (json) console.log(JSON.stringify({ status: "skipped-host-governed", hostGoverned: true, host: profile.governance.host, reason: line }, null, 2));
  else console.log(`[${what.split(" ")[0]}] ${line}`);
  process.exit(0);
}
