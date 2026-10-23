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
import { readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { pluginMcpServers, samePath, setupCommandsOf } from "./governance.mjs";

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
 * What a host server launches. A server started as `<script inside the plugin> <verb> <name>` is a
 * wrapper: the real command, args and env are the `servers.<name>` entry of one of the plugin's own JSON
 * files. `<name>` need not be the server's key — an OS twin such as `<x>-linux` runs the wrapper with
 * `<x>`. Anything else launches what its own entry says. Read-only.
 * @returns {{ key: string, command: string, args: string[], env: object, wrapper: string }|null}
 */
export function resolveLaunch(installPath, key, docs = pluginJsonDocs(installPath), declared = pluginMcpServers(installPath)) {
  const spec = declared[key];
  if (!spec) return null;
  const expand = (s) => String(s).split("${CLAUDE_PLUGIN_ROOT}").join(installPath);
  const args = (spec.args || []).map(expand);
  const at = args.findIndex((a) => /\.[cm]?js$/i.test(a) && insideDir(a, installPath));
  const name = at >= 0 && /^[a-z][a-z-]*$/i.test(args[at + 1] || "") ? args[at + 2] : "";
  if (name) {
    const script = args[at];
    // The declarations next to the wrapper first — the file it reads — then the rest of the plugin.
    const near = (d) => samePath(dirname(d.path), dirname(script));
    const ordered = [...docs.filter(near), ...docs.filter((d) => !near(d))];
    const inner = ordered.map((d) => d.doc?.servers?.[name]).find((s) => s && typeof s.command === "string");
    if (inner) return { key, command: inner.command, args: (inner.args || []).map(String), env: inner.env || {}, wrapper: script, url: "" };
  }
  // A remote server (`type: "http" | "sse"`) has a `url` and no command; it is classified by that URL.
  return { key, command: expand(spec.command || ""), args, env: spec.env || {}, wrapper: "", url: expand(spec.url || "") };
}

/** The role a launch fills, by the MCP package it runs — product knowledge, not a host's names. Pure. */
export function classifyLaunch(launch) {
  if (!launch) return "other";
  // A remote (HTTP / SSE) server is known by its URL; a local one by the package it runs. Browsers first:
  // a browser lane's arguments may name anything (a Jira start page), its package may not.
  const text = [launch.command, ...launch.args, launch.url || ""].join(" ");
  if (/@playwright\/mcp|playwright-mcp/i.test(text)) return "browsers";
  if (/@azure-devops\/mcp|azure-devops-mcp|mcp-atlassian|@atlassian\/|mcp\.atlassian\.com|jira-mcp|mcp-jira/i.test(text)) return "tracker";
  if (/testrail|zephyr|xray|qase/i.test(text)) return "testManagement";
  if (/github-mcp-server|server-github|githubcopilot\.com\/mcp/i.test(text)) return "github";
  if (/azure\.mcp|@azure\/mcp|azure-mcp/i.test(text) && /monitor|applicationinsights/i.test(text)) return "telemetry";
  return "other";
}

/**
 * The role → server map from the servers that are ON, by kind. A role with more than one server on is
 * left empty and listed in `choices` — the operator picks (a person may legitimately keep two, e.g. one
 * per access level). Telemetry is no exception: which of several telemetry servers is production is not
 * guessed from a name — the operator says. The code host is never inferred — whether the tracker's server
 * reaches code is the person's role on the host, so the operator says so. Pure.
 */
export function serversFromLaunches(launches) {
  const of = (kind) => launches.filter((l) => l.kind === kind).map((l) => l.key);
  const choices = {};
  const one = (kind) => {
    const on = of(kind);
    if (on.length > 1) choices[kind] = on;
    return on.length === 1 ? on[0] : "";
  };
  return {
    servers: {
      tracker: one("tracker"),
      codeHost: "",
      github: one("github"),
      telemetry: one("telemetry"),
      testManagement: one("testManagement"),
      browsers: of("browsers"),
    },
    choices,
  };
}

/** gen-profile's governance flags for a host and a server map. Empty roles are passed as "". Pure. */
export function genProfileFlags(host, servers, websiteAuth) {
  const q = (v) => (v ? v : '""');
  return [
    `--governance ${host}`,
    `--gov-tracker ${q(servers.tracker)}`, `--gov-code-host ${q(servers.codeHost)}`, `--gov-github ${q(servers.github)}`,
    `--gov-telemetry ${q(servers.telemetry)}`, `--gov-test-management ${q(servers.testManagement)}`,
    `--gov-browsers ${q((servers.browsers || []).join(","))}`, `--gov-website-auth ${websiteAuth}`,
  ].join(" ");
}

// The slot is the LAST segment before _PASSWORD; the environment is everything before it, so a
// multi-word environment (PRE_PROD_USER1_PASSWORD → pre_prod / USER1) keeps its name.
const SLOT_VAR = /^([A-Z][A-Z0-9_]*?)_([A-Z][A-Z0-9]*)_PASSWORD$/;
const SECRET_REF = /^([a-z][a-z0-9-]*):([a-z0-9][a-z0-9._-]*)$/;

/**
 * The reference schemes the host's declarations actually use (`secret:` in `secret:<name>`): a scheme
 * counts when a NON-slot env value uses it too, or when at least two slots do — so one literal password
 * that merely contains a colon is never read as a reference, and never echoed. Pure.
 */
export function referenceSchemes(launches) {
  const outside = new Set();
  const inSlots = new Map();
  for (const l of launches) {
    for (const [name, value] of Object.entries(l.env || {})) {
      const ref = SECRET_REF.exec(String(value));
      if (!ref) continue;
      // Distinct slot NAMES: the same slot repeated on every browser server is still one value.
      if (SLOT_VAR.test(name)) inSlots.set(ref[1], (inSlots.get(ref[1]) || new Set()).add(name));
      else outside.add(ref[1]);
    }
  }
  for (const [scheme, names] of inSlots) if (names.size >= 2) outside.add(scheme);
  return outside;
}

/**
 * The test-user password slots the browser servers launch with: every env entry
 * `<ENV>_<SLOT>_PASSWORD` whose value is a REFERENCE in a scheme the host uses elsewhere too
 * (`<scheme>:<name>`, referenceSchemes). `launches` are all the servers that are on. Pure.
 * @returns {{ hostEnv: string, slot: string, password: string, secret: string }[]}
 */
export function slotsFromLaunches(launches) {
  const schemes = referenceSchemes(launches);
  const out = new Map();
  for (const l of launches.filter((x) => x.kind === "browsers")) {
    for (const [name, value] of Object.entries(l.env || {})) {
      const m = SLOT_VAR.exec(name);
      const ref = SECRET_REF.exec(String(value));
      if (m && ref && schemes.has(ref[1])) out.set(name, { hostEnv: m[1].toLowerCase(), slot: m[2], password: name, secret: ref[2] });
    }
  }
  return [...out.values()].sort((a, b) => a.hostEnv.localeCompare(b.hostEnv) || a.slot.localeCompare(b.slot, undefined, { numeric: true }));
}

/** The host's website environments, in slot order. Pure. */
export function hostEnvsOf(slots) {
  return [...new Set(slots.map((s) => s.hostEnv))];
}

/** Does a wrapper's source carry a usage line with a `set` verb? Pure over the text. */
export function usageOffersSet(source) {
  return String(source || "").split(/\r?\n/).some((l) => /usage/i.test(l) && /[<|\s]set[|>\s]/.test(l));
}

/**
 * How the operator stores one secret with the host's wrapper: `node "<wrapper>" set <name>` when the
 * usage text in the wrapper's SOURCE offers a `set` verb, else null (the host's setup command documents
 * it). Reads the file; never runs it.
 */
export function storeCommand(wrapper, secret) {
  if (!wrapper) return null;
  let source = "";
  try {
    source = readFileSync(wrapper, "utf8");
  } catch {
    return null;
  }
  return usageOffersSet(source) ? `node "${wrapper}" set ${secret}` : null;
}

/**
 * What the host's own setup left in this folder. Read-only, and it never decides on its own that the
 * setup has not run — without knowing the host that is a guess, so it only says how sure it is:
 *   confirmed    — the setup left a trace here (some of the host's servers switched off);
 *   likelyFresh  — no trace AND a role still has several servers on, the look of an untouched install.
 *                  The operator is ASKED whether the host's setup ran; a person may keep several
 *                  servers on legitimately (`choices`), so this is never a block by itself.
 */
export function hostState(host, installPath, projectRoot, home = process.env.HOME || os.homedir()) {
  const declared = pluginMcpServers(installPath);
  const shipped = Object.keys(declared);
  const disabled = disabledHostKeys(readJson(join(home, ".claude.json")), projectRoot, hostPluginName(host));
  const enabled = shipped.filter((k) => !disabled.includes(k));
  const docs = pluginJsonDocs(installPath);
  const launches = enabled.map((k) => resolveLaunch(installPath, k, docs, declared)).filter(Boolean).map((l) => ({ ...l, kind: classifyLaunch(l) }));
  const { servers, choices } = serversFromLaunches(launches);
  const slots = slotsFromLaunches(launches);
  const wrapper = launches.find((l) => l.kind === "browsers" && l.wrapper)?.wrapper || launches.find((l) => l.wrapper)?.wrapper || "";
  const setupCommands = setupCommandsOf(installPath);
  const confirmed = disabled.length > 0;
  const crowded = Object.keys(choices).filter((k) => k !== "github");
  const likelyFresh = !confirmed && crowded.length > 0;
  const websiteAuth = slots.length ? "host-secrets" : "manual-operator";
  return {
    confirmed,
    likelyFresh,
    reasons: likelyFresh ? ["none of the host's servers is switched off here", ...crowded.map((k) => `more than one ${k} server is on`)] : [],
    setupCommands,
    enabled: launches.map(({ key, kind }) => ({ key, kind })),
    disabled,
    servers,
    choices,
    websiteAuth,
    hostEnvs: hostEnvsOf(slots),
    slots,
    wrapper,
    genProfile: genProfileFlags(host, servers, websiteAuth),
    facts: hostFacts(launches, hostMarketplaceUrl(host, projectRoot, home), hostEnvsOf(slots)),
  };
}

/** The host's marketplace source URL (Claude Code's registry, else this folder's settings). */
export function hostMarketplaceUrl(host, projectRoot, home = process.env.HOME || os.homedir()) {
  const marketplace = String(host || "").split("@")[1];
  if (!marketplace) return "";
  const known = readJson(join(home, ".claude", "plugins", "known_marketplaces.json"))?.[marketplace]?.source?.url;
  const local = readJson(join(resolve(projectRoot), ".claude", "settings.json"))?.extraKnownMarketplaces?.[marketplace]?.source?.url;
  return String(known || local || "");
}

/**
 * Answers the interview need not ask, read from what the host itself declares — each with the place it
 * was read from, so the operator is TOLD what was filled in, never asked. Pure over the inputs:
 *   tracker    — the kind of the tracker server that is on (by its MCP package);
 *   adoOrg     — the organization an Azure DevOps server is started for (its first positional argument),
 *                else the org of the host's marketplace URL;
 *   adoProject — the project in the host's marketplace URL when it is on that same org;
 *   clientVcs  — Azure Repos when the host's own repository lives on Azure DevOps, GitHub when on github.com;
 *   envs       — the host's website environments (its password slots), proposed as the env names.
 * A fact not read from the host is absent — then the interview asks.
 */
export function hostFacts(launches, marketplaceUrl, hostEnvs) {
  const facts = {};
  const tracker = launches.find((l) => l.kind === "tracker");
  const text = tracker ? [tracker.command, ...tracker.args].join(" ") : "";
  if (/@azure-devops\/mcp|azure-devops-mcp/i.test(text)) facts.tracker = { value: "azure", from: `the ${tracker.key} server runs the Azure DevOps MCP` };
  else if (/atlassian|jira/i.test(text)) facts.tracker = { value: "jira", from: `the ${tracker.key} server runs a Jira MCP` };
  if (facts.tracker?.value === "azure") {
    const at = tracker.args.findIndex((a) => /@azure-devops\/mcp/i.test(a));
    const org = at >= 0 && /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(tracker.args[at + 1] || "") ? tracker.args[at + 1] : "";
    if (org) facts.adoOrg = { value: org, from: `the ${tracker.key} server is started for it` };
  }
  const ado = /^https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\//i.exec(marketplaceUrl || "");
  if (ado) {
    if (!facts.adoOrg) facts.adoOrg = { value: decodeURIComponent(ado[1]), from: "the host's marketplace URL" };
    if (facts.adoOrg.value.toLowerCase() === decodeURIComponent(ado[1]).toLowerCase()) facts.adoProject = { value: decodeURIComponent(ado[2]), from: "the host's marketplace URL" };
    facts.clientVcs = { value: "azure-repos", from: "the host's own repository is on Azure DevOps" };
  } else if (/^https:\/\/github\.com\//i.test(marketplaceUrl || "")) {
    facts.clientVcs = { value: "github", from: "the host's own repository is on GitHub" };
  }
  if (hostEnvs?.length) facts.envs = { value: [...hostEnvs], from: "the host's test-user password slots" };
  return facts;
}

/**
 * Does a profile role point at a server that is ON and fills that role? `browsers` checks each. A role
 * the operator chose among `choices`, or corrected, is fine as long as the server is on. Pure.
 */
export function roleDrift(governance, state) {
  const on = new Map(state.enabled.map((e) => [e.key, e.kind]));
  const out = [];
  // The kind a role's server must run: the code host is reached through a tracker-kind server.
  const kindOf = { tracker: "tracker", codeHost: "tracker", github: "github", telemetry: "telemetry", testManagement: "testManagement" };
  for (const role of ["tracker", "codeHost", "github", "telemetry", "testManagement"]) {
    const v = governance?.servers?.[role] || "";
    if (v && !on.has(v)) out.push(`${role}: ${v} is not on here`);
    else if (v && on.get(v) !== kindOf[role]) out.push(`${role}: ${v} does not run a ${kindOf[role]} server`);
    else if (!v && state.servers[role]) out.push(`${role}: none recorded, ${state.servers[role]} is on`);
  }
  for (const b of governance?.servers?.browsers || []) {
    if (!on.has(b)) out.push(`browsers: ${b} is not on here`);
    else if (on.get(b) !== "browsers") out.push(`browsers: ${b} is not a browser server`);
  }
  return out;
}
