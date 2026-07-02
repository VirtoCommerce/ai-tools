#!/usr/bin/env node
/**
 * .claude/skills/project-init/gen-profile.mjs
 *
 * Non-interactive writer for project-profile.json. The /project-init skill runs
 * the interview (in prose, so it can explain + branch) and passes the answers as
 * flags; this script validates them and writes the profile, layered over
 * PROFILE_DEFAULTS so unspecified fields keep their safe defaults.
 *
 * Writes ONLY the profile (non-secret topology). Secrets/tokens are never passed
 * as CLI flags — they are set via `gh auth login` / `az login` or pasted into
 * .env.local by the skill. The tracker/VCS adapters read non-secret connection
 * details (baseUrl, org, project) from the profile and secrets from the env.
 *
 * Usage:
 *   node .claude/skills/project-init/gen-profile.mjs \
 *     --project-type client --operator ask \
 *     --tracker jira --tracker-base-url https://acme.atlassian.net --tracker-project ABC \
 *     --client-vcs github --client-org acme-corp \
 *     --upstream-account jane-doe --contribution-mode fork --vcs-auth gh-cli --print
 *
 *   # Azure DevOps (Boards + Repos):
 *   ... --tracker azure --azure-org acme --azure-project Web \
 *       --client-vcs azure-repos --vcs-auth pat ...
 *
 *   # Merge a discovered repo map (output of discover-repos.mjs) into an existing profile:
 *   node .claude/skills/project-init/gen-profile.mjs --repos-json repos.json --merge --print
 *
 * Flags: --out <path> (default project-profile.json), --merge (layer over existing
 * profile instead of defaults), --print (echo the result).
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { PROFILE_DEFAULTS } from "../../../scripts/lib/project-profile.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const ENUMS = {
  "project-type": ["platform", "client"],
  operator: ["virto-engineer", "client", "ask"],
  tracker: ["jira", "azure"],
  "client-vcs": ["github", "azure-repos"],
  "contribution-mode": ["fork", "direct"],
  "vcs-auth": ["gh-cli", "pat", "az-login"],
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true; // boolean flag
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function fail(msg) {
  console.error(`[gen-profile] ${msg}`);
  process.exit(1);
}

function validateEnum(args, key) {
  if (args[key] === undefined) return;
  if (!ENUMS[key].includes(args[key])) {
    fail(`Invalid --${key} "${args[key]}". Allowed: ${ENUMS[key].join(" | ")}`);
  }
}

function deepMerge(base, override) {
  if (override === undefined || override === null) return base;
  if (Array.isArray(base) || Array.isArray(override)) return override;
  if (typeof base !== "object" || typeof override !== "object") return override;
  const out = { ...base };
  for (const k of Object.keys(override)) out[k] = deepMerge(base[k], override[k]);
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  for (const k of Object.keys(ENUMS)) validateEnum(args, k);

  const outPath = args.out ? resolve(args.out) : join(REPO_ROOT, "project-profile.json");

  // Base: existing profile (with --merge) or the shipped defaults.
  let base = PROFILE_DEFAULTS;
  if (args.merge && existsSync(outPath)) {
    try {
      const raw = JSON.parse(readFileSync(outPath, "utf-8"));
      delete raw._meta;
      base = deepMerge(PROFILE_DEFAULTS, raw);
    } catch (err) {
      fail(`--merge: cannot parse existing ${outPath}: ${err.message}`);
    }
  }

  // Build the override patch from flags (only set what was provided).
  const patch = {};
  const set = (path, val) => {
    if (val === undefined) return;
    let node = patch;
    const parts = path.split(".");
    for (let i = 0; i < parts.length - 1; i++) node = node[parts[i] ??= {}] ??= {};
    node[parts[parts.length - 1]] = val;
  };

  set("projectType", args["project-type"]);
  set("operator", args.operator);
  set("tracker.kind", args.tracker);
  set("tracker.baseUrl", args["tracker-base-url"]);
  set("tracker.projectKey", args["tracker-project"]);
  set("tracker.azure.organization", args["azure-org"]);
  set("tracker.azure.project", args["azure-project"]);
  set("vcs.clientHost", args["client-vcs"]);
  set("vcs.clientOrg", args["client-org"]);
  set("vcs.azure.organization", args["azure-org"]);
  set("vcs.azure.project", args["azure-project"]);
  set("vcs.auth", args["vcs-auth"]);
  set("upstream.org", args["upstream-org"]);
  set("upstream.contributionMode", args["contribution-mode"]);
  set("upstream.clientGithubAccount", args["upstream-account"]);

  // Optional repo map from discover-repos.mjs ({ client: [...], platform: [...] }).
  if (args["repos-json"]) {
    try {
      const repos = JSON.parse(readFileSync(resolve(args["repos-json"]), "utf-8"));
      if (repos.client || repos.platform) {
        set("repos.client", repos.client || []);
        set("repos.platform", repos.platform || []);
      }
    } catch (err) {
      fail(`--repos-json: cannot read ${args["repos-json"]}: ${err.message}`);
    }
  }

  const profile = deepMerge(base, patch);

  // Prune infra sub-objects that don't apply to the chosen tracker / code host, so the written
  // file MIRRORS THE ANSWERS — no dead `azure:{}` block in a Jira+GitHub profile. This is SAFE:
  // the discriminators are `tracker.kind` and `vcs.clientHost` (never object *presence*), and
  // loadProjectProfile() always re-layers PROFILE_DEFAULTS on read, so any consumer that does
  // touch profile.tracker.azure / profile.vcs.azure still sees the empty default at runtime.
  if (profile.tracker?.kind !== "azure") delete profile.tracker.azure;
  if (profile.vcs?.clientHost !== "azure-repos") delete profile.vcs.azure;

  const withMeta = {
    _meta: {
      version: "1.0.0",
      generatedBy: "project-init/gen-profile.mjs",
    },
    ...profile,
  };

  writeFileSync(outPath, JSON.stringify(withMeta, null, 2) + "\n");
  console.log(`[gen-profile] wrote ${outPath}`);
  console.log(
    `[gen-profile] projectType=${profile.projectType} tracker=${profile.tracker.kind} ` +
      `clientVcs=${profile.vcs.clientHost} upstream=${profile.upstream.org} ` +
      `contributionMode=${profile.upstream.contributionMode}`,
  );
  if (args.print) console.log(JSON.stringify(withMeta, null, 2));
}

main();
