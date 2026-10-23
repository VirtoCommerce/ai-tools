#!/usr/bin/env node
/**
 * skills/project-init/detect-governance.mjs — is this a host-governed project? (§0-host)
 *
 * Scans the plugins bound to THIS folder for one that looks like a project's governance (lib/governance.mjs
 * hostCandidates: installed for this folder or enabled in its settings, not ours, shipping MCP servers and
 * a SessionStart hook). No host is known by name. Prints one JSON object:
 *   { candidates: [...], machineWide: [...], detected: <first candidate> | null,
 *     governance: <the block it would write>, state: <what the host's own setup left here> | null }
 * `machineWide` are the same shape installed for the whole machine — never picked, only offered.
 * `inactive` are installed for this folder but no longer switched on in its settings (Claude Code does
 * not load them) — the operator re-enables one, never us.
 * `state` (lib/host-adapter.mjs hostState): `confirmed` + `likelyFresh` + `reasons` (never a verdict — the
 * operator is asked), the role `choices`, the host's own setup command(s), the
 * servers on and the role each fills, the role → server map, the test-user password slots, the website
 * environments, the wrapper path and `genProfile` (the ready gen-profile governance flags). `--governance <plugin@marketplace|none>` overrides detection (the
 * operator's choice wins). Read-only — it runs nothing of the host's.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { governanceBlock, hostCandidates, hostInstallPath, resolveHostId } from "./lib/governance.mjs";
import { hostState } from "./lib/host-adapter.mjs";
import { outputRoot } from "./lib/paths.mjs";

function main() {
  const argv = process.argv.slice(2);
  const at = argv.indexOf("--governance");
  const explicit = at >= 0 ? argv[at + 1] : null;
  if (explicit && explicit !== "none" && !resolveHostId(explicit)) {
    console.error(`[detect-governance] --governance takes a plugin id (<plugin>@<marketplace>), the name of one installed plugin, or none — got "${explicit}"`);
    process.exit(1);
  }
  const root = outputRoot();
  const all = hostCandidates({ projectRoot: root, machineWide: true });
  const candidates = all.filter((c) => c.folderBound);
  const machineWide = all.filter((c) => !c.folderBound && !c.inactive);
  const inactive = all.filter((c) => c.inactive);
  const detected = candidates[0] ? { host: candidates[0].pluginId, installPath: candidates[0].installPath, source: candidates[0].source } : null;
  const host = explicit === "none" ? null : resolveHostId(explicit) || detected?.host || null;
  const installPath = host ? hostInstallPath(host, { projectRoot: root }) : null;
  if (host && !installPath) {
    console.error(`[detect-governance] ${host} is not installed for this folder or for the whole machine`);
    process.exit(1);
  }
  const state = installPath ? hostState(host, installPath, root) : null;
  const governance = governanceBlock(host, state ? { ...state.servers, browsers: state.servers.browsers.join(",") } : {}, state ? { websiteAuth: state.websiteAuth } : {});
  console.log(JSON.stringify({ candidates, machineWide, inactive, detected, explicit, governance, state }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
