#!/usr/bin/env node
/**
 * next-steps.mjs — the closing message of /project-init: the project is ready, and what the operator
 * can do now, built from the profile and the plugins actually installed.
 *
 * Onboarding serves every plugin that reads the profile (vc-fix, vc-perf, …), not one of them, so the
 * close names the everyday asks the tracker connection already supports (a ticket, the sprint) and then
 * each installed plugin's entry points. A plugin that is not installed gets one line with its install
 * command, never its commands.
 *
 * Usage:
 *   node next-steps.mjs [--plugins vc-fix,vc-perf]   # --plugins overrides detection (tests, dry runs)
 * Reads <outputRoot>/project-profile.json (or PROJECT_PROFILE_PATH) and TEST_ENV. Read-only.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { outputRoot } from "./lib/paths.mjs";

const MARKETPLACE = "ai-tools";

/** What each plugin adds, in the order an operator meets it. `{KEY}` becomes a ticket key example. */
export const PLUGIN_ACTIONS = {
  "vc-fix": {
    what: "the bug lifecycle (reproduce, fix, verify)",
    actions: [
      ["/qa-bug <what is wrong>", "reproduce a bug in the browser, capture evidence, file a ticket"],
      ["/qa-fix {KEY}", "fix a filed bug in the right repo and open a PR for review (never merges)"],
      ["/qa-verify-fix {KEY}", "re-check a fix on the deployed build and move the ticket"],
      ["/qa-env-check", "quick check of env vars, stands and tracker / code-host access"],
    ],
  },
  "vc-perf": {
    what: "performance diagnostics (benchmark, load, trace)",
    actions: [
      ["/perf-init", "add the perf settings to this project (run once)", (p) => !hasPerf(p)],
      ["/perf-loop <operation>", "find why an operation is slow (load + trace)", (p) => hasPerf(p)],
      ["/perf-benchmark <operation>", "before/after benchmark of your change", (p) => hasPerf(p)],
    ],
  },
};

const hasPerf = (p) => Boolean(p && p.perf && typeof p.perf === "object" && Object.keys(p.perf).length);

/** Installed + enabled plugin names from this marketplace: `claude plugin list --json`, else the registry. */
export function detectPlugins({ home = process.env.HOME || os.homedir() } = {}) {
  try {
    const list = JSON.parse(execSync("claude plugin list --json", { stdio: ["ignore", "pipe", "ignore"], timeout: 20000 }).toString());
    if (Array.isArray(list)) {
      return list.filter((x) => x && x.enabled && String(x.id || "").endsWith(`@${MARKETPLACE}`)).map((x) => String(x.id).split("@")[0]);
    }
  } catch {
    /* no claude CLI in this shell — fall back to the install registry */
  }
  try {
    const reg = JSON.parse(readFileSync(join(home, ".claude", "plugins", "installed_plugins.json"), "utf8"));
    return Object.keys(reg?.plugins || {}).filter((id) => id.endsWith(`@${MARKETPLACE}`)).map((id) => id.split("@")[0]);
  } catch {
    return [];
  }
}

/** A ticket key in this tracker's shape, for the examples. */
export function keyExample(profile) {
  const t = profile?.tracker || {};
  if (t.kind === "azure") return "1234";
  return `${t.projectKey || "PROJ"}-123`;
}

export function renderNextSteps(profile, plugins, { env = "" } = {}) {
  const t = profile?.tracker || {};
  const trackerName = t.kind === "azure" ? "Azure Boards" : "Jira";
  const hostName = profile?.vcs?.clientHost === "azure-repos" ? "Azure Repos" : "GitHub";
  const gov = profile?.governance?.host ? profile.governance : null;
  const key = keyExample(profile);
  const facts = [env && `env \`${env}\``, `tracker ${trackerName}${t.projectKey ? ` (${t.projectKey})` : ""}`, `code host ${hostName}`,
    gov && `host-governed by \`${gov.host}\``].filter(Boolean).join(" · ");
  const via = gov && gov.servers?.tracker ? ` (through the \`${gov.servers.tracker}\` MCP server)` : "";

  const rows = [
    [`Show ${key}`, `open a ticket — summary, status, assignee, latest comments${via}`],
    ["What is in the current sprint?", `the active sprint's tickets grouped by status${via}`],
    ["My open tickets", `tickets assigned to you that are not done${via}`],
  ];
  const installed = new Set(plugins);
  for (const [name, spec] of Object.entries(PLUGIN_ACTIONS)) {
    if (!installed.has(name)) continue;
    for (const [cmd, what, when] of spec.actions) {
      if (when && !when(profile)) continue;
      rows.push([cmd.replace("{KEY}", key), what]);
    }
  }
  rows.push(["/project-init --add-env", "add another environment (URLs + test-user passwords)"]);
  rows.push(["/project-init --check", "after a plugin update: bring the profile up to date and re-verify"]);

  const out = [
    `**The project is ready to work with** — ${facts}.`,
    "",
    "What you can do now — type a request in your own words, or run a command:",
    "",
    "| Ask or run | What it does |",
    "|---|---|",
    ...rows.map(([a, b]) => `| \`${a}\` | ${b} |`),
  ];
  const missing = Object.entries(PLUGIN_ACTIONS).filter(([n]) => !installed.has(n));
  if (missing.length) {
    out.push("", "Not installed: " + missing.map(([n, s]) => `**${n}** — ${s.what} (\`/plugin install ${n}@${MARKETPLACE}\`)`).join("; ") + ".");
  }
  return out.join("\n") + "\n";
}

function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--plugins");
  const plugins = i >= 0 ? String(argv[i + 1] || "").split(",").map((s) => s.trim()).filter(Boolean) : detectPlugins();
  const path = process.env.PROJECT_PROFILE_PATH || join(outputRoot(), "project-profile.json");
  let profile = null;
  try {
    profile = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    console.error(`[next-steps] no readable profile at ${path} — run /project-init first`);
    process.exit(1);
  }
  process.stdout.write(renderNextSteps(profile, plugins, { env: process.env.TEST_ENV || "" }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
