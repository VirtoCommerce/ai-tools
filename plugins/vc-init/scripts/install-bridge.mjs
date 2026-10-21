#!/usr/bin/env node
// install-bridge.mjs — put the $VC_RUN shim at its stable path and print what refers to it.
//
// The vc-secrets task declarations /project-init writes start `node <stable path> --inner <group>`;
// the path must survive plugin updates (see vc-run-shim.mjs), so it lives in the plugin DATA
// directory, not the versioned cache. Mirrors vc-secrets' own install-shim.mjs, including its rule
// for a `--data-dir` value: accepted only when it names THIS plugin's directory, because an
// unsubstituted `${CLAUDE_PLUGIN_DATA}` is expanded by the shell from whichever plugin's context
// leaked into the environment — and uninstalling that plugin would delete our shim with its data.
//
// Idempotent. Prints, on stdout, one line `VC_RUN=<path>` (machine-readable, for /project-init to use
// the literal path in the session that installs it — settings.json `env` reaches only sessions started
// after it is written) followed by the human-readable report.
//
//   node scripts/install-bridge.mjs [--data-dir <dir>] [--print-path]

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SHIM_SOURCE = "vc-run-shim.mjs";
export const SHIM_NAME = "vc-run.mjs";
export const CANONICAL_DATA_ID = "vc-init-ai-tools";

/** The documented default location of the installed shim. */
export function defaultShimPath(env = process.env) {
  return path.join(env.HOME || os.homedir(), ".claude", "plugins", "data", CANONICAL_DATA_ID, SHIM_NAME);
}

function fail(message) {
  fs.writeSync(2, `install-bridge: ${message}\n`);
  process.exit(1);
}

function main() {
  const argv = process.argv.slice(2);
  const at = argv.indexOf("--data-dir");
  const joined = argv.find((a) => a.startsWith("--data-dir="));
  let declared = joined ? joined.slice("--data-dir=".length) : at >= 0 ? argv[at + 1] : null;
  if (declared !== null && declared !== undefined && declared !== "" && !path.isAbsolute(declared)) {
    fail(`--data-dir must be an absolute path, got ${JSON.stringify(declared)}`);
  }
  let how = "--data-dir";
  if (declared && !path.basename(declared).toLowerCase().startsWith("vc-init")) {
    fs.writeSync(2, `install-bridge: ignoring --data-dir=${declared} -- it names another plugin's directory, so the placeholder was not substituted\n`);
    declared = null;
  }
  const target = declared ? path.join(declared, SHIM_NAME) : defaultShimPath();
  if (!declared) how = "the documented default";

  const pluginRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const source = path.join(pluginRoot, SHIM_SOURCE);
  if (!fs.existsSync(source)) fail(`${source} not found -- this is not a complete vc-init install`);

  let state = "installed";
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) {
      state = fs.readFileSync(target, "utf8") === fs.readFileSync(source, "utf8") ? "already up to date" : "replaced a different copy";
    }
    if (state !== "already up to date") fs.copyFileSync(source, target);
  } catch (e) {
    fail(`cannot write ${target}: ${e.message}`);
  }

  if (argv.includes("--print-path")) {
    fs.writeSync(1, `${target}\n`);
    return;
  }
  fs.writeSync(1, [
    `VC_RUN=${target}`,
    "",
    `bridge: ${target} (${state}; directory chosen via ${how})`,
    "",
    "Every token-holding call goes through it:  node \"$VC_RUN\" gh … | git-gh … | ado … | jira … | onboard …",
    "/project-init writes VC_RUN into this project's .claude/settings.local.json \"env\" (a path, not a secret);",
    "until Claude Code restarts, use the literal path above.",
    "",
  ].join("\n"));
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
