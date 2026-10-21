#!/usr/bin/env node
/**
 * skills/project-init/detect-governance.mjs — is this a host-governed project? (§0-host)
 *
 * Reads Claude Code's install registry and the project's `.claude/settings.json` `enabledPlugins` for a
 * known host governance plugin (lib/governance.mjs HOSTS). Prints one JSON object:
 *   { detected: { host, pluginId, installPath, source } | null, governance: <the block it would write> }
 * `--governance <host|none>` overrides detection (the operator's explicit choice wins). Read-only.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HOSTS, detectHost, governanceBlock } from "./lib/governance.mjs";
import { outputRoot } from "./lib/paths.mjs";

function main() {
  const argv = process.argv.slice(2);
  const at = argv.indexOf("--governance");
  const explicit = at >= 0 ? argv[at + 1] : null;
  if (explicit && explicit !== "none" && !HOSTS[explicit]) {
    console.error(`[detect-governance] unknown host "${explicit}" (known: ${Object.keys(HOSTS).join(", ")}, or none)`);
    process.exit(1);
  }
  const detected = detectHost({ projectRoot: outputRoot() });
  const host = explicit === "none" ? null : explicit || detected?.host || null;
  console.log(JSON.stringify({ detected, explicit, governance: governanceBlock(host) }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
