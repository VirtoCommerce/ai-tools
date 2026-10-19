#!/usr/bin/env node
/**
 * scripts/profile-get.mjs — vc-perf's READ-ONLY view of the deployment profile.
 *
 * vc-init owns project-profile.json and is its only writer (VCST-6402); /perf-init writes the `perf`
 * block through vc-init's profile-set.mjs. vc-perf's skills only ever READ it, and used to do so with
 * bare `jq` — which reads a missing file as an empty value and a too-new schema as whatever shape it
 * happens to have. This reader stops instead, with the instruction that fixes it:
 *
 *   node "$pluginRoot/scripts/profile-get.mjs" perf.backendUrl            # prints the value
 *   node "$pluginRoot/scripts/profile-get.mjs" perf.currencyCode USD       # with a default
 *   node "$pluginRoot/scripts/profile-get.mjs" --join , perf.loadtest.fixtures.productIds
 *   node "$pluginRoot/scripts/profile-get.mjs" --check                     # exit 0 = readable
 *
 * A string prints bare, an array with --join prints joined, anything else prints as JSON; an absent
 * path prints the default (or nothing). Exit codes: 0 ok, 2 no profile (run /project-init, then
 * /perf-init), 3 unreadable / written by a newer vc-init, 4 the path is absent and no default given
 * under --required.
 *
 * Profile location: PROJECT_PROFILE_PATH, else VC_FIX_HOME/project-profile.json, else
 * ./project-profile.json — the same order every vc-fix reader uses.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** Highest profile schema this reader understands — vc-init's PROFILE_SCHEMA_VERSION when this was written. */
const SUPPORTED_SCHEMA = 3;

function profilePath() {
  if (process.env.PROJECT_PROFILE_PATH) return process.env.PROJECT_PROFILE_PATH;
  if (process.env.VC_FIX_HOME) return join(resolve(process.env.VC_FIX_HOME), "project-profile.json");
  return resolve("project-profile.json");
}

function stop(code, message) {
  process.stderr.write(`profile-get: ${message}\n`);
  process.exit(code);
}

const argv = process.argv.slice(2);
let join_ = null;
let required = false;
let check = false;
const rest = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--join") join_ = argv[++i] ?? ",";
  else if (argv[i] === "--required") required = true;
  else if (argv[i] === "--check") check = true;
  else rest.push(argv[i]);
}

const path = profilePath();
if (!existsSync(path)) stop(2, `no deployment profile at ${path} — run /project-init (vc-init), then /perf-init`);
let profile;
try {
  profile = JSON.parse(readFileSync(path, "utf8"));
} catch (e) {
  stop(3, `${path} is not valid JSON (${e.message}) — run /project-init --check`);
}
const version = profile.schemaVersion === undefined ? 1 : profile.schemaVersion;
if (typeof version !== "number" || version < 1 || version > SUPPORTED_SCHEMA) {
  stop(3, `${path} is schemaVersion ${JSON.stringify(version)}; this vc-perf reads up to ${SUPPORTED_SCHEMA} — update vc-perf, or run /project-init --check`);
}
if (check) process.exit(0);

const [dotted, fallback] = rest;
if (!dotted) stop(1, "usage: profile-get.mjs [--join <sep>] [--required] <dotted.path> [default] | --check");
let value = profile;
for (const key of dotted.split(".")) value = value !== null && typeof value === "object" ? value[key] : undefined;
if (value === undefined || value === null || value === "") {
  if (fallback !== undefined) value = fallback;
  else if (required) stop(4, `${dotted} is not set in ${path} — run /perf-init`);
  else process.exit(0);
}
if (Array.isArray(value) && join_ !== null) process.stdout.write(value.join(join_) + "\n");
else process.stdout.write((typeof value === "string" ? value : JSON.stringify(value)) + "\n");
