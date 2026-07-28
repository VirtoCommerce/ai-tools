#!/usr/bin/env node
/**
 * skills/project-init/gen-profile.mjs
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
 *   node skills/project-init/gen-profile.mjs \
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
 *   node skills/project-init/gen-profile.mjs --repos-json repos.json --merge --print
 *
 * Flags: --out <path> (default project-profile.json), --merge (layer over existing
 * profile instead of defaults), --print (echo the result).
 *
 * Self-diagnostics consent (asked in the fresh interview, symmetric with reconcile):
 *   --self-diagnostics <true|false>  local telemetry CAPTURE opt-in (persisted default FALSE)
 *   --feedback-mode <ask|auto|off>   UPSTREAM delivery consent (default ask)
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { PROFILE_DEFAULTS } from "../../scripts/lib/project-profile.mjs";
import { outputRoot, resolveOutPath } from "./lib/paths.mjs";

const ENUMS = {
  "project-type": ["platform", "client"],
  operator: ["virto-engineer", "client", "ask"],
  tracker: ["jira", "azure"],
  "client-vcs": ["github", "azure-repos"],
  "contribution-mode": ["fork", "direct"],
  "vcs-auth": ["gh-cli", "pat", "az-login"],
  "feedback-mode": ["auto", "ask", "off"],
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
  // --self-diagnostics is boolean, not an ENUM, but must still reject a malformed value: a bare
  // flag (=== true) or "true"/"false" only. Otherwise a plausible typo (`--self-diagnostics yes`,
  // `True`, `1`) used to silently coerce to `false` — writing the opt-OUT value when the operator
  // meant to opt IN — asymmetric with the enum-validated --feedback-mode.
  if (args["self-diagnostics"] !== undefined && args["self-diagnostics"] !== true && !["true", "false"].includes(args["self-diagnostics"])) {
    fail(`Invalid --self-diagnostics "${args["self-diagnostics"]}". Allowed: true | false (or the bare flag = true)`);
  }

  // Default output → the deployment project (process.cwd()), symmetric with the reader
  // loadProjectProfile() which reads project-profile.json from cwd. --out still overrides.
  const outPath = resolveOutPath(args.out, "project-profile.json");

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
  // feedback.mode — consent for upstream self-diagnostics delivery (VCST-5509).
  // Default stays "ask" (PROFILE_DEFAULTS) unless the operator picked one.
  set("feedback.mode", args["feedback-mode"]);
  // selfDiagnostics — opt-in for the passive session-telemetry CAPTURE hook
  // (VCST-5475/5509). The hook is a full no-op until this is EXPLICITLY true. The persisted
  // default is `false` (PROFILE_DEFAULTS) — opt-in fails SAFE (PR #143 R2 NA-4): a flag-less write
  // must never silently enable capture. The interview RECOMMENDS Yes (a hard-coded nudge in
  // reconcile-profile.mjs), but recommending ≠ consenting. `/project-init` asks the operator FIRST
  // (§0b) and always passes the answer — and writes the flag immediately on Yes so
  // its own run is captured. Coerce the string flag → boolean: `--self-diagnostics false` ⇒ false,
  // `--self-diagnostics true` or a bare `--self-diagnostics` ⇒ true.
  if (args["self-diagnostics"] !== undefined) {
    set("selfDiagnostics", args["self-diagnostics"] === true || args["self-diagnostics"] === "true");
  }

  // vcs.authEnv — which env var carries the WRITE credential for the client host, so the
  // interactive command doesn't guess. (github PAT ⇒ GITHUB_FIX_BUGS_TOKEN; azure-repos ⇒
  // ADO_PAT; a session/gh-cli axis ⇒ "" = use the ambient login.)
  const clientHost = args["client-vcs"];
  const vcsAuth = args["vcs-auth"];
  if (clientHost === "azure-repos") set("vcs.authEnv", vcsAuth === "pat" ? "ADO_PAT" : "");
  else if (clientHost === "github") set("vcs.authEnv", vcsAuth === "pat" ? "GITHUB_FIX_BUGS_TOKEN" : "");

  // runtime — how skills orient. When invoked with $CLAUDE_PLUGIN_ROOT set (installed
  // plugin), interactive commands read the BAKED profile facts (helpersRunnable=false);
  // in the native agentic checkout the .ts/.mjs helpers run headless (helpersRunnable=true).
  const runtimeMode = args["runtime-mode"] || (process.env.CLAUDE_PLUGIN_ROOT ? "plugin" : "agent-project");
  set("runtime.mode", runtimeMode);
  set("runtime.helpersRunnable", runtimeMode === "agent-project");

  // paths — absolute roots so skills never break on a drifted cwd. NOTE: pluginRoot is
  // deliberately NOT baked. An installed plugin lives in a VERSION-STAMPED cache dir
  // (…/vc-fix/<version>) that a baked path would freeze to a stale/deleted version after
  // any upgrade. Instead every command resolves the ACTIVE install at runtime via
  // `claude plugin list --json` (see knowledge/execution/plugin-root.md) — no field, no
  // stale link, no re-init after upgrade.
  set("paths.projectRoot", outputRoot());
  const envName = args.env || process.env.TEST_ENV || "";
  if (envName) set("paths.perEnv", `.env.${envName}`);

  // Optional repo map from discover-repos.mjs
  // ({ projectType, clientOrg, client: [...], platform: [...] }). The scan is the source
  // of projectType + clientOrg in the redesign, so ingest them here too (explicit flags
  // still win — they are applied after this block). Absent keys are left untouched.
  if (args["repos-json"]) {
    try {
      const repos = JSON.parse(readFileSync(resolve(outputRoot(), args["repos-json"]), "utf-8"));
      if (repos.client || repos.platform) {
        set("repos.client", repos.client || []);
        set("repos.platform", repos.platform || []);
      }
      if (repos.projectType && args["project-type"] === undefined) set("projectType", repos.projectType);
      if (repos.clientOrg && args["client-org"] === undefined) set("vcs.clientOrg", repos.clientOrg);
    } catch (err) {
      fail(`--repos-json: cannot read ${args["repos-json"]}: ${err.message}`);
    }
  }

  // Tracker status model from discover-tracker.mjs (Azure: per-type states + role→state map;
  // Jira: format facts only). Baked so /qa-fix transitions by role without asking.
  if (args["tracker-json"]) {
    try {
      const t = JSON.parse(readFileSync(resolve(outputRoot(), args["tracker-json"]), "utf-8"));
      if (t.ticketKeyFormat) set("tracker.ticketKeyFormat", t.ticketKeyFormat);
      if (t.crossLinkToken !== undefined) set("tracker.crossLinkToken", t.crossLinkToken);
      if (t.apiBase) set("tracker.azure.apiBase", t.apiBase);
      if (t.projectId) set("tracker.azure.projectId", t.projectId);
      if (t.workItemTypes) set("tracker.azure.workItemTypes", t.workItemTypes);
      if (t.roleStates) set("tracker.azure.roleStates", t.roleStates);
      // Default to silent role-based transitions ONLY when discover-tracker.mjs found a
      // state for every lifecycle role. A partial map (e.g. no distinct "in-review" state
      // was found) must keep "ask" — /qa-fix would otherwise transition a missing role
      // silently (writing "undefined" or a wrong-but-plausible alias) with no one noticing.
      if (t.roleStatesComplete === true) set("tracker.azure.transitionPolicy", "auto");
      // Separate QA-side completeness signal for /qa-verify-fix (testing/tested/reopen).
      // Deliberately NOT folded into roleStatesComplete/transitionPolicy above — a
      // heuristic mismatch on a QA-only role must never ride along on the fix-side
      // completeness that unlocks "auto". Bake it so /qa-verify-fix can gate its OWN
      // auto-transition behavior on QA-role confidence, independent of the fix-side policy.
      if (t.qaRoleStatesComplete !== undefined) set("tracker.azure.qaRoleStatesComplete", t.qaRoleStatesComplete);
    } catch (err) {
      fail(`--tracker-json: cannot read ${args["tracker-json"]}: ${err.message}`);
    }
  }

  // buildVerify.source keyed on the EFFECTIVE projectType (flag → repos-json → default).
  // This is the DEPLOYMENT-LEVEL default only — "ticket" is deliberately never baked
  // here. A client deployment can have BOTH module/platform repos (source =
  // modules-endpoint) AND a kind:"frontend" repo (source should be "ticket" — see
  // commands/qa-fix.md Phase 0 step 3's frontend-only exception); which one applies
  // depends on which repo the CURRENT ticket routes to at Gate 1, which isn't known
  // until /qa-fix runs. So /qa-fix's Phase 0 is the sole place that overrides this
  // default to "ticket" once Gate 1 resolves a kind:"frontend" route — do not try to
  // "fix" this by baking "ticket" here; that would wrongly apply to every repo in
  // the deployment, not just frontend-kind ones.
  const effectiveType = patch.projectType || base.projectType;
  if (effectiveType === "client") set("buildVerify.source", "modules-endpoint");
  else if (effectiveType === "platform") set("buildVerify.source", "vc-deploy-dev");

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
