#!/usr/bin/env node
/**
 * write-agent-rules.mjs — copy the plugin's always-loaded agent rules (templates/rules/*.md) into the
 * project's `.claude/rules/`.
 *
 * Why the project and not the plugin: a plugin's skills and agents are read only when invoked, and each
 * plugin carries its own. A rule that must hold for EVERY plugin in the project — including one installed
 * after onboarding — has to sit where Claude Code loads it on every turn and every subagent dispatch,
 * whichever plugin is running: the project's `.claude/rules/`. The first such rule is `vc-browser.md`
 * (browser work only through the Playwright MCP lanes — the only browser that can type a password from
 * vc-secrets / `.env.playwright.local`).
 *
 * - Owns only the files it writes: each template carries the WRITTEN_BY marker, and a same-named file
 *   without it (the operator's own) is left alone and reported. A file with the marker is overwritten,
 *   so a plugin upgrade updates the rule on the next `/project-init` or `--check`.
 * - Not gitignored on purpose: the rules are for the whole team, so they are meant to be committed.
 * - Writes nothing when the content is unchanged. Prints one line per file.
 * - Stands down on a host-governed project: the host's rules govern its browser lanes (host-governed.md).
 *
 * Usage: node write-agent-rules.mjs [--check]   # --check writes nothing, exits 1 when missing or stale
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { outputRoot, pluginRoot } from "./lib/paths.mjs";
import { standDownIfHostGoverned } from "./lib/governance.mjs";

export const WRITTEN_BY = "Written by vc-init /project-init";

/** What to do with one rule: write / unchanged / foreign (an operator file of the same name). Pure. */
export function planRule(template, existing) {
  if (existing == null) return "write";
  if (existing === template) return "unchanged";
  return existing.includes(WRITTEN_BY) ? "write" : "foreign";
}

function main() {
  standDownIfHostGoverned(outputRoot(), "write-agent-rules skipped: the host's rules govern the browser");
  const check = process.argv.includes("--check");
  const srcDir = join(pluginRoot(), "templates", "rules");
  const dstDir = join(outputRoot(), ".claude", "rules");
  let stale = false;
  for (const name of readdirSync(srcDir).filter((f) => f.endsWith(".md")).sort()) {
    const template = readFileSync(join(srcDir, name), "utf8");
    const dst = join(dstDir, name);
    const existing = existsSync(dst) ? readFileSync(dst, "utf8") : null;
    const action = planRule(template, existing);
    if (action === "unchanged") {
      console.log(`[write-agent-rules] .claude/rules/${name}: up to date`);
    } else if (action === "foreign") {
      console.log(`[write-agent-rules] .claude/rules/${name}: an existing file not written by vc-init — left alone; rename it and re-run to get the rule`);
      stale = true;
    } else if (check) {
      console.log(`[write-agent-rules] .claude/rules/${name}: ${existing == null ? "missing" : "stale"} — run without --check`);
      stale = true;
    } else {
      mkdirSync(dstDir, { recursive: true });
      writeFileSync(dst, template);
      console.log(`[write-agent-rules] .claude/rules/${name}: ${existing == null ? "written" : "updated"}`);
    }
  }
  if (check && stale) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
