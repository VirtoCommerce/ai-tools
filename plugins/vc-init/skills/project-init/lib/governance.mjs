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
 * No host is named here. A host is FOUND: a plugin bound to THIS folder (installed for it with project
 * or local scope, or enabled in its own `.claude/settings*.json`) that ships MCP servers AND a
 * `SessionStart` hook — the shape of a plugin that brings a project's rules and its approved servers.
 * A plugin installed for the whole machine is a tool, not a project's governance, and one installed
 * for another folder never counts. The operator confirms the candidate; nothing is assumed from a name.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import { join, resolve } from "node:path";
import { pluginRoot } from "./paths.mjs";

/** Roles a host server can fill. `browsers` is a list; the rest are one server key each. */
export const ROLES = ["tracker", "codeHost", "github", "telemetry", "testManagement", "browsers"];

/**
 * How a test user signs in to the client's website on a host-governed project:
 *   host-secrets     the host keeps each test user's password in a slot of its own secret wrapper and
 *                    hands it to its browser servers — the agent types the slot's NAME;
 *   manual-operator  the host declares no slots: the operator signs in by hand.
 */
export const WEBSITE_AUTH = ["host-secrets", "manual-operator"];

/** What a person may do with the client's code through the host's code-host server. */
export const CODE_ACCESS = ["none", "read", "write"];


/** A host is recorded by its plugin id: `<plugin>@<marketplace>`. */
export const PLUGIN_ID_RE = /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$/;
/** A plugin name alone — how a profile written before 0.4.0 recorded its host. */
const PLUGIN_NAME_RE = /^[A-Za-z0-9._-]+$/;

/**
 * The plugin id a recorded host means. A full id is itself. A bare name (a 0.3.x profile recorded the
 * host by its plugin name) is the one installed plugin with that name, or null when none or several
 * match — never a guess.
 */
export function resolveHostId(host, { home = process.env.HOME || os.homedir() } = {}) {
  const h = String(host || "");
  if (PLUGIN_ID_RE.test(h)) return h;
  if (!PLUGIN_NAME_RE.test(h)) return null;
  const ids = Object.keys(readRegistry(home) || {});
  const hits = ids.filter((id) => id.split("@")[0] === h);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * The marketplaces our own plugins come from — never a candidate host. Read, not listed: the
 * marketplace this plugin was installed from (its cache path, or the install record whose files are
 * this plugin's), so a rename or a mirror needs no change here.
 */
export function ownMarketplaces({ home = process.env.HOME || os.homedir(), root = pluginRoot() } = {}) {
  const out = new Set();
  const parts = resolve(root).split(/[\\/]/);
  const at = parts.lastIndexOf("cache");
  if (at >= 0 && parts[at + 1]) out.add(parts[at + 1]);
  const registry = readRegistry(home) || {};
  for (const [id, records] of Object.entries(registry)) {
    for (const r of Array.isArray(records) ? records : []) {
      if (r && typeof r.installPath === "string" && samePath(r.installPath, root)) out.add(id.split("@")[1]);
    }
  }
  return [...out].filter(Boolean);
}

/** The governance block for a host (or none). Pure. */
export function governanceBlock(host, overrides = {}, extras = {}) {
  if (!host) return { host: null, secrets: "vc-secrets", servers: emptyServers(), stand: { writable: true }, ...emptyExtras() };
  if (!PLUGIN_ID_RE.test(String(host))) throw new Error(`governance host "${host}" is not a plugin id (<plugin>@<marketplace>)`);
  const servers = emptyServers();
  for (const role of ROLES) {
    if (overrides[role] === undefined) continue;
    servers[role] = role === "browsers"
      ? String(overrides[role]).split(",").map((s) => s.trim()).filter(Boolean)
      : String(overrides[role]);
  }
  return { host, secrets: "host", servers, stand: { writable: false }, ...emptyExtras(), ...cleanExtras(extras) };
}

export function emptyServers() {
  return { tracker: "", codeHost: "", github: "", telemetry: "", testManagement: "", browsers: [] };
}

/** The answers a host-governed block carries besides the servers. */
export function emptyExtras() {
  return { websiteAuth: "", envs: {}, codeAccess: "" };
}

function cleanExtras(extras) {
  const out = {};
  if (typeof extras.websiteAuth === "string") out.websiteAuth = extras.websiteAuth;
  if (typeof extras.codeAccess === "string") out.codeAccess = extras.codeAccess;
  if (extras.envs && typeof extras.envs === "object") out.envs = { ...extras.envs };
  return out;
}

/** Parse `ours=host,ours2=host2` into an env map. Throws on a malformed pair. Pure. */
export function parseEnvMap(text) {
  const out = {};
  for (const pair of String(text || "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = /^([a-z0-9_]+)=([a-z0-9_]+)$/.exec(pair);
    if (!m) throw new Error(`env map "${pair}" is not <env>=<host env> ([a-z0-9_]+ on both sides)`);
    out[m[1]] = m[2];
  }
  return out;
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

/** One spelling for a directory, so a registry `projectPath` and the project root compare. Pure. */
export function samePath(a, b, platform = process.platform) {
  if (!a || !b) return false;
  const norm = (p) => {
    const s = resolve(String(p)).replace(/[\\/]+$/, "");
    return platform === "win32" ? s.replace(/\//g, "\\").toLowerCase() : s;
  };
  return norm(a) === norm(b);
}

/** The install record bound to THIS folder: project or local scope for exactly it. Pure. */
export function folderRecord(records, projectRoot) {
  const list = (Array.isArray(records) ? records : []).filter((r) => r && typeof r === "object");
  return list.find((r) => (r.scope === "project" || r.scope === "local") && samePath(r.projectPath, projectRoot)) || null;
}

/** The project's settings `enabledPlugins` (local wins over shared): id → boolean. */
function enabledInSettings(projectRoot) {
  const out = {};
  for (const file of ["settings.json", "settings.local.json"]) {
    const map = readJson(join(resolve(projectRoot), ".claude", file))?.enabledPlugins;
    if (map && typeof map === "object") for (const [id, v] of Object.entries(map)) if (typeof v === "boolean") out[id] = v;
  }
  return out;
}

/**
 * Claude Code's install registry, `plugins` map — read once per home per process (a single run asks
 * it many times). Read-only.
 */
const registryCache = new Map();
export function readRegistry(home) {
  if (!registryCache.has(home)) registryCache.set(home, readJson(join(home, ".claude", "plugins", "installed_plugins.json"))?.plugins || {});
  return registryCache.get(home);
}

/**
 * A plugin.json field that may be inline or a path to a JSON file inside the plugin (`"mcpServers":
 * "./mcp.json"`); returns the object, unwrapping a `{ <field>: … }` file. Read-only.
 */
function manifestField(installPath, field) {
  const v = readJson(join(installPath, ".claude-plugin", "plugin.json"))?.[field];
  if (typeof v === "string") {
    const doc = readJson(resolve(installPath, v));
    return doc && typeof doc === "object" ? (doc[field] && typeof doc[field] === "object" ? doc[field] : doc) : null;
  }
  return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}

/** Every MCP server a plugin ships: its `.mcp.json` and its plugin.json `mcpServers` (inline or a file). */
export function pluginMcpServers(installPath) {
  if (!installPath) return {};
  return { ...(readJson(join(installPath, ".mcp.json"))?.mcpServers || {}), ...(manifestField(installPath, "mcpServers") || {}) };
}

/** The MCP server keys a plugin ships (read-only). */
export function hostServerKeys(installPath) {
  return new Set(Object.keys(pluginMcpServers(installPath)));
}

/** Does a plugin run something at session start (`hooks/hooks.json`, or plugin.json `hooks` inline or a file)? */
export function hasSessionStartHook(installPath) {
  if (!installPath) return false;
  for (const hooks of [readJson(join(installPath, "hooks", "hooks.json"))?.hooks, manifestField(installPath, "hooks")]) {
    if (hooks && typeof hooks === "object" && Array.isArray(hooks.SessionStart) && hooks.SessionStart.length) return true;
  }
  return false;
}

/** A plugin's own setup command(s): its skills and commands named for setup / init / onboarding. */
export function setupCommandsOf(installPath) {
  const out = [];
  if (!installPath) return out;
  const names = (dir, strip) => {
    try {
      return readdirSync(join(installPath, dir)).map((n) => n.replace(strip, ""));
    } catch {
      return [];
    }
  };
  for (const n of [...names("skills", /$/), ...names("commands", /\.md$/)]) {
    if (/(^|[-_])(setup|init|onboard|onboarding|bootstrap)([-_]|$)/i.test(n) && !out.includes(`/${n}`)) out.push(`/${n}`);
  }
  return out;
}

/**
 * Every plugin bound to THIS folder that looks like a project's governance: installed for it (project
 * or local scope) or enabled in its own settings, not switched off there, not one of ours, and shipping
 * MCP servers plus a `SessionStart` hook. Ordered: an install for this folder first.
 * @returns {{ pluginId: string, installPath: string|null, source: string, servers: string[], setupCommands: string[] }[]}
 */
export function hostCandidates({ projectRoot = process.cwd(), home = process.env.HOME || os.homedir(), machineWide = false } = {}) {
  const registry = readRegistry(home) || {};
  const enabled = enabledInSettings(projectRoot);
  const ours = ownMarketplaces({ home });
  const ids = new Set([...Object.keys(registry), ...Object.keys(enabled).filter((id) => enabled[id])]);
  const out = [];
  for (const id of ids) {
    if (!PLUGIN_ID_RE.test(id) || ours.includes(id.split("@")[1]) || enabled[id] === false) continue;
    const bound = folderRecord(registry[id], projectRoot);
    const userWide = (Array.isArray(registry[id]) ? registry[id] : []).find((r) => r && r.scope === "user");
    // How the plugin is bound here, strongest first: installed for this folder AND switched on in its
    // settings (2), switched on in its settings only (1), installed for the whole machine (0 — only ever
    // offered). An install record for this folder whose settings no longer switch it on (the settings
    // file was removed or edited) is NOT loaded by Claude Code: it is reported as `inactive`, never used.
    const inactive = Boolean(bound) && enabled[id] !== true;
    const binding = inactive ? -1 : bound ? 2 : enabled[id] === true ? 1 : machineWide && userWide ? 0 : -2;
    if (binding < -1) continue;
    const source = inactive ? `installed for this folder (${bound.scope} scope) but not switched on in its .claude/settings — Claude Code does not load it`
      : binding === 2 ? `installed for this folder (${bound.scope} scope)`
        : binding === 1 ? "enabled in this folder's .claude/settings" : "installed for the whole machine (user scope)";
    const installPath = hostInstallPath(id, { projectRoot, home });
    const servers = [...hostServerKeys(installPath)];
    if (!servers.length || !hasSessionStartHook(installPath)) continue;
    out.push({ pluginId: id, installPath, source, binding, inactive, folderBound: binding > 0, servers, setupCommands: setupCommandsOf(installPath) });
  }
  return out.sort((a, b) => b.binding - a.binding);
}

/**
 * The install path of a host plugin as this folder runs it: its install for THIS folder, else its
 * machine-wide (user scope) install. An install made for another folder is never used — those files
 * may be another version, and they are another project's. A bare plugin name (a 0.3.x profile) is
 * resolved first.
 */
export function hostInstallPath(host, { projectRoot = process.cwd(), home = process.env.HOME || os.homedir() } = {}) {
  const id = resolveHostId(host, { home });
  if (!id) return null;
  const records = readRegistry(home)?.[id];
  const usable = (r) => r && typeof r.installPath === "string" && existsSync(r.installPath);
  const bound = folderRecord(records, projectRoot);
  if (usable(bound)) return bound.installPath;
  const userWide = (Array.isArray(records) ? records : []).find((r) => r?.scope === "user" && usable(r));
  return userWide?.installPath || null;
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
