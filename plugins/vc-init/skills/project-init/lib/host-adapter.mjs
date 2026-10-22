/**
 * skills/project-init/lib/host-adapter.mjs — read what a host governance plugin's OWN setup left behind.
 *
 * vc-init never runs or repeats the host's setup (its role question, sign-in, server toggles) and
 * knows no host by name. It READS, read-only:
 *   - which of the host's MCP servers are on for this folder: the keys the plugin ships minus the
 *     `plugin:<name>:<key>` entries in this project's `disabledMcpServers` (~/.claude.json);
 *   - what each server launches — through a wrapper (`<script> run <key>`) when the plugin declares the
 *     real command in one of its own JSON files — and so which ROLE it fills, by the MCP package it
 *     runs (an Azure DevOps or Jira server is a tracker, a TestRail one test management, …);
 *   - the test-user password slots the browser servers launch with: `<ENV>_<SLOT>_PASSWORD` set from a
 *     secret reference (`<scheme>:<name>`), never a literal.
 * A slot, server or environment the host adds shows up without a change here.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import { join, resolve } from "node:path";
import { hostServerKeys, samePath, setupCommandsOf } from "./governance.mjs";

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** The host plugin's name as it prefixes its server keys in Claude Code (`plugin:<name>:<key>`). */
export function hostPluginName(host) {
  return String(host || "").split("@")[0];
}

/** The key under which `~/.claude.json` keeps this project's state (an existing spelling wins). Pure. */
export function claudeProjectKey(projects, projectRoot) {
  for (const k of Object.keys(projects || {})) if (samePath(k, projectRoot)) return k;
  return resolve(projectRoot).replace(/\\/g, "/");
}

/** The host's server keys switched off for this folder (the `/mcp` toggle's own record). Pure. */
export function disabledHostKeys(claudeJson, projectRoot, pluginName) {
  const projects = claudeJson?.projects || {};
  const list = projects[claudeProjectKey(projects, projectRoot)]?.disabledMcpServers;
  const prefix = `plugin:${pluginName}:`;
  return (Array.isArray(list) ? list : []).filter((k) => String(k).startsWith(prefix)).map((k) => k.slice(prefix.length));
}

/** Is `file` inside `dir`? Case-insensitive on Windows. Pure. */
export function insideDir(file, dir, platform = process.platform) {
  const norm = (p) => {
    const s = resolve(String(p)).replace(/\\/g, "/").replace(/\/+$/, "");
    return platform === "win32" ? s.toLowerCase() : s;
  };
  return norm(file).startsWith(`${norm(dir)}/`);
}

/** The plugin's own JSON files (two levels deep, no node_modules) — where a wrapper declares its servers. */
function pluginJsonDocs(installPath) {
  const out = [];
  const walk = (dir, depth) => {
    let names = [];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const n of names) {
      if (n === "node_modules" || n.startsWith(".git")) continue;
      const p = join(dir, n);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory() && depth < 2) walk(p, depth + 1);
      else if (st.isFile() && n.endsWith(".json") && st.size < 512 * 1024) {
        const doc = readJson(p);
        if (doc && typeof doc === "object") out.push({ path: p, doc });
      }
    }
  };
  walk(installPath, 0);
  return out;
}

/**
 * What a host server launches. A server started as `<script inside the plugin> <verb> <key>` is a
 * wrapper: the real command, args and env are the `servers.<key>` entry of one of the plugin's own JSON
 * files. Anything else launches what its `.mcp.json` entry says. Read-only.
 * @returns {{ key: string, command: string, args: string[], env: object, wrapper: string }|null}
 */
export function resolveLaunch(installPath, key, docs = pluginJsonDocs(installPath)) {
  const spec = readJson(join(installPath, ".mcp.json"))?.mcpServers?.[key]
    || readJson(join(installPath, ".claude-plugin", "plugin.json"))?.mcpServers?.[key];
  if (!spec) return null;
  const expand = (s) => String(s).split("${CLAUDE_PLUGIN_ROOT}").join(installPath);
  const args = (spec.args || []).map(expand);
  const at = args.indexOf(key);
  const script = at >= 2 ? args[at - 2] : "";
  if (script && insideDir(script, installPath)) {
    const inner = docs.map((d) => d.doc?.servers?.[key]).find((s) => s && typeof s.command === "string");
    if (inner) return { key, command: inner.command, args: (inner.args || []).map(String), env: inner.env || {}, wrapper: script };
  }
  return { key, command: expand(spec.command || ""), args, env: spec.env || {}, wrapper: "" };
}

/** The role a launch fills, by the MCP package it runs — product knowledge, not a host's names. Pure. */
export function classifyLaunch(launch) {
  if (!launch) return "other";
  const text = [launch.command, ...launch.args].join(" ");
  if (/@azure-devops\/mcp|azure-devops-mcp|mcp-atlassian|atlassian|jira/i.test(text)) return "tracker";
  if (/testrail|zephyr|xray|qase/i.test(text)) return "testManagement";
  if (/@playwright\/mcp|playwright-mcp/i.test(text)) return "browsers";
  if (/github-mcp-server|server-github|githubcopilot\.com\/mcp/i.test(text)) return "github";
  if (/azure\.mcp|@azure\/mcp|azure-mcp/i.test(text) && /monitor|applicationinsights/i.test(text)) return "telemetry";
  return "other";
}

/**
 * The role → server map from the servers that are ON, by kind. A role with more than one server on
 * is ambiguous (the host's setup has not picked one for this person); telemetry prefers a non-prod
 * server. The code host is never inferred — whether the tracker's server reaches code is the person's
 * role on the host, so the operator says so. Pure.
 */
export function serversFromLaunches(launches) {
  const of = (kind) => launches.filter((l) => l.kind === kind).map((l) => l.key);
  const ambiguous = [];
  const one = (kind) => {
    const on = of(kind);
    if (on.length > 1) ambiguous.push(kind);
    return on.length === 1 ? on[0] : "";
  };
  const telemetry = of("telemetry");
  return {
    servers: {
      tracker: one("tracker"),
      codeHost: "",
      github: one("github"),
      telemetry: telemetry.find((k) => !/prod/i.test(k)) || telemetry[0] || "",
      testManagement: one("testManagement"),
      browsers: of("browsers"),
    },
    ambiguous: ambiguous.filter((k) => k !== "github"),
  };
}

const SLOT_VAR = /^([A-Z][A-Z0-9]*)_([A-Z][A-Z0-9_]*)_PASSWORD$/;
const SECRET_REF = /^[a-z][a-z0-9-]*:([A-Za-z0-9._-]+)$/;

/**
 * The test-user password slots the browser servers launch with: every env entry
 * `<ENV>_<SLOT>_PASSWORD` whose value is a secret REFERENCE (`<scheme>:<name>`). Pure.
 * @returns {{ hostEnv: string, slot: string, password: string, secret: string }[]}
 */
export function slotsFromLaunches(launches) {
  const out = new Map();
  for (const l of launches.filter((x) => x.kind === "browsers")) {
    for (const [name, value] of Object.entries(l.env || {})) {
      const m = SLOT_VAR.exec(name);
      const ref = SECRET_REF.exec(String(value));
      if (m && ref) out.set(name, { hostEnv: m[1].toLowerCase(), slot: m[2], password: name, secret: ref[1] });
    }
  }
  return [...out.values()].sort((a, b) => a.hostEnv.localeCompare(b.hostEnv) || a.slot.localeCompare(b.slot, undefined, { numeric: true }));
}

/** The host's website environments, in slot order. Pure. */
export function hostEnvsOf(slots) {
  return [...new Set(slots.map((s) => s.hostEnv))];
}

/**
 * How the operator stores one secret with the host's wrapper: `node "<wrapper>" set <name>` when the
 * wrapper's own usage line offers a `set` verb, else null (the host's setup command documents it). Spawns.
 */
export function storeCommand(wrapper, secret) {
  if (!wrapper) return null;
  const r = spawnSync(process.execPath, [wrapper], { encoding: "utf8", timeout: 10000 });
  const usage = `${r.stdout || ""}\n${r.stderr || ""}`.split(/\r?\n/).find((l) => /usage/i.test(l)) || "";
  return /[<|\s]set[|>\s]/.test(usage) ? `node "${wrapper}" set ${secret}` : null;
}

/**
 * Has the host's own setup run for this folder, and what did it leave? Read-only.
 * A role with more than one server on means the host's setup has not picked this person's.
 */
export function hostState(host, installPath, projectRoot, home = os.homedir()) {
  const shipped = [...hostServerKeys(installPath)];
  const disabled = disabledHostKeys(readJson(join(home, ".claude.json")), projectRoot, hostPluginName(host));
  const enabled = shipped.filter((k) => !disabled.includes(k));
  const docs = pluginJsonDocs(installPath);
  const launches = enabled.map((k) => resolveLaunch(installPath, k, docs)).filter(Boolean).map((l) => ({ ...l, kind: classifyLaunch(l) }));
  const { servers, ambiguous } = serversFromLaunches(launches);
  const slots = slotsFromLaunches(launches);
  const wrapper = launches.find((l) => l.kind === "browsers" && l.wrapper)?.wrapper || launches.find((l) => l.wrapper)?.wrapper || "";
  const setupCommands = setupCommandsOf(installPath);
  return {
    setUp: ambiguous.length === 0,
    reasons: ambiguous.map((k) => `more than one ${k} server is on`),
    setupCommands,
    enabled: launches.map(({ key, kind }) => ({ key, kind })),
    disabled,
    servers,
    websiteAuth: slots.length ? "host-secrets" : "manual-operator",
    hostEnvs: hostEnvsOf(slots),
    slots,
    wrapper,
  };
}
