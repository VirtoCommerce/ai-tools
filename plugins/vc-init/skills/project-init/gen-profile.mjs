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
 *     --upstream-account jane-doe --contribution-mode fork \
 *     --github-auth pat --jira-auth pat --print
 *
 *   # Azure DevOps (Boards + Repos):
 *   ... --tracker azure --azure-org acme --azure-project Web \
 *       --client-vcs azure-repos --github-auth gh-cli --ado-auth pat ...
 *
 * Auth axes (VCST-6402) — one flag per axis, written to `auth.*`; an axis that does not apply to the
 * chosen tracker / code host is written as "":
 *   --github-auth pat|gh-cli        always applies (the platform upstream is always GitHub)
 *   --ado-auth    pat|az-login      Azure Boards tracker or Azure Repos code host
 *   --jira-auth   pat|oauth         Jira tracker (`token`, the scaffold's old spelling, means pat)
 *   --vcs-auth    pat|gh-cli|az-login   DEPRECATED — the client host's axis only; kept so an old
 *                                       caller still lands on the right `auth.<axis>`.
 *
 * Host governance (VCST-6402 step 8; lib/governance.mjs):
 *   --governance <host|none>   write the `governance` block for a host-governed project (our token
 *                              paths stand down; auth.* is cleared) or clear it. Absent ⇒ an existing
 *                              block is kept, like `perf`.
 *   --gov-tracker <key> --gov-code-host <key> --gov-github <key> --gov-telemetry <key>
 *   --gov-test-management <key> --gov-browsers <k1,k2>   operator overrides of the host's server per role
 *   --gov-website-auth host-secrets|manual-operator   how test users sign in to the client's website
 *   --gov-envs <env>=<host env>,…   which host website environment each `.env.<env>` is (added, never dropped)
 *   --gov-code-access none|read|write   what the person may do with the client's code through --gov-code-host
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
import { PROFILE_DEFAULTS, PROFILE_SCHEMA_VERSION } from "../../scripts/lib/project-profile.mjs";
import { outputRoot, resolveOutPath } from "./lib/paths.mjs";
import { ensureGitignoreEntries, ensureProjectIgnores, removeGitignoreBlock } from "./lib/gitignore.mjs";

/** The .gitignore block a host-governed project gets for its env files (removed when it stops being one). */
const HOST_ENV_IGNORE = "vc-init (/project-init) — host-governed: env files are local";
import { CODE_ACCESS, WEBSITE_AUTH, governanceBlock, parseEnvMap, resolveHostId } from "./lib/governance.mjs";

// A work-item field whose VALUE is time-varying (a sprint/area NODE id: System.IterationId /
// System.AreaId). Persisting it as a fieldDefaults constant silently files future bugs into a
// CLOSED sprint once it rolls over (VCST-5582 A3) — never bake it. The *Path is stored instead and
// iteration resolves at create time via `--iteration current`.
const ILLEGAL_FIELDDEFAULT_REF = /(^|\.)(iteration|area)id$/i;

const ENUMS = {
  "project-type": ["platform", "client"],
  operator: ["virto-engineer", "client", "ask"],
  tracker: ["jira", "azure"],
  "client-vcs": ["github", "azure-repos"],
  "contribution-mode": ["fork", "direct"],
  "vcs-auth": ["gh-cli", "pat", "az-login"],
  "github-auth": ["pat", "gh-cli"],
  "ado-auth": ["pat", "az-login"],
  "jira-auth": ["pat", "token", "oauth"],
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

/**
 * The answers of a host-governed block besides its servers (`--gov-website-auth`,
 * `--gov-envs <env>=<host env>,…`), merged over what the block already holds: an env map ADDS
 * environments, it never drops one.
 */
function governanceExtras(args, current = {}) {
  const extras = {};
  if (args["gov-website-auth"] !== undefined) {
    if (!WEBSITE_AUTH.includes(args["gov-website-auth"])) fail(`Invalid --gov-website-auth "${args["gov-website-auth"]}". Allowed: ${WEBSITE_AUTH.join(" | ")}`);
    extras.websiteAuth = args["gov-website-auth"];
  }
  if (args["gov-code-access"] !== undefined) {
    if (!CODE_ACCESS.includes(args["gov-code-access"])) fail(`Invalid --gov-code-access "${args["gov-code-access"]}". Allowed: ${CODE_ACCESS.join(" | ")}`);
    extras.codeAccess = args["gov-code-access"];
  }
  if (args["gov-envs"] !== undefined) {
    try {
      extras.envs = { ...(current?.envs || {}), ...parseEnvMap(args["gov-envs"]) };
    } catch (e) {
      fail(`--gov-envs: ${e.message}`);
    }
  }
  return extras;
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
  let existing = null;
  if (existsSync(outPath)) {
    try {
      existing = JSON.parse(readFileSync(outPath, "utf-8"));
      delete existing._meta;
    } catch (err) {
      if (args.merge) fail(`--merge: cannot parse existing ${outPath}: ${err.message}`);
    }
  }
  if (existing && typeof existing.schemaVersion === "number" && existing.schemaVersion > PROFILE_SCHEMA_VERSION) {
    fail(`${outPath} is schemaVersion ${existing.schemaVersion}, written by a newer vc-init than this one (${PROFILE_SCHEMA_VERSION}) — update vc-init instead of overwriting it.`);
  }
  if (args.merge && existing) base = deepMerge(PROFILE_DEFAULTS, existing);
  // `perf` belongs to vc-perf (written through profile-set.mjs by /perf-init), not to this
  // interview: a fresh /project-init re-run rewrites the profile from the defaults, and that must
  // not silently delete the perf block another plugin depends on.
  else if (existing) {
    // `perf` belongs to vc-perf and `governance` to the host decision of §0-host: a fresh re-run
    // rewrites the profile from the defaults, and neither may silently disappear with it.
    base = { ...PROFILE_DEFAULTS };
    if (existing.perf && typeof existing.perf === "object") base.perf = existing.perf;
    if (existing.governance && typeof existing.governance === "object") base = deepMerge(base, { governance: existing.governance });
  }
  if (args.governance !== undefined && args.governance !== "none" && !resolveHostId(args.governance)) {
    fail(`Invalid --governance "${args.governance}". Allowed: a plugin id (<plugin>@<marketplace>), the name of one installed plugin, or none`);
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
  // The PROBED GitHub token kind (VCST-5582 A) — derive-context.mjs `github.tokenKind` /
  // `github.forkCapable`. Stored so /qa-fix Gate 1 and /vc-self-check deliver can refuse an
  // impossible upstream route instead of discovering it at push time. Unset ⇒ left "" (unprobed),
  // which every consumer must read as "unknown", never as capable.
  set("vcs.githubTokenKind", args["github-token-kind"]);
  set("vcs.githubForkCapable", args["github-fork-capable"]);
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

  // auth.* — one mode per credential axis (VCST-6402). `--vcs-auth` (the pre-split flag) still maps
  // onto the CLIENT host's axis when the per-axis flag for it is absent.
  const clientHost = args["client-vcs"];
  const vcsAuth = args["vcs-auth"];
  let githubAuth = args["github-auth"];
  let adoAuth = args["ado-auth"];
  if (vcsAuth && clientHost === "github" && githubAuth === undefined && vcsAuth !== "az-login") githubAuth = vcsAuth;
  if (vcsAuth && clientHost === "azure-repos" && adoAuth === undefined && vcsAuth !== "gh-cli") adoAuth = vcsAuth;
  set("auth.github", githubAuth);
  set("auth.ado", adoAuth);
  set("auth.jira", args["jira-auth"] === "token" ? "pat" : args["jira-auth"]);

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
      // The date-validated team whose current sprint /qa-bug stamps (VCST). Empty ⇒ the project
      // default team; the runtime resolver (ado.mjs) re-validates and can still auto-select a team
      // at create time, so an unset team is safe — just less specific.
      if (t.team) set("tracker.azure.team", t.team);
      if (t.workItemTypes) set("tracker.azure.workItemTypes", t.workItemTypes);
      if (t.roleStates) set("tracker.azure.roleStates", t.roleStates);
      if (t.roleStatesByType) set("tracker.azure.roleStatesByType", t.roleStatesByType);
      // Bake the fix-side completeness as a CANONICAL boolean under tracker.azure.* (the same
      // nested convention as roleStates / qaRoleStatesComplete) so readers — assert-profile.mjs,
      // any future consumer — have one explicit field instead of re-deriving it from transitionPolicy
      // or the map (VCST-5582 E3).
      if (t.roleStatesComplete !== undefined) set("tracker.azure.roleStatesComplete", t.roleStatesComplete);
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
      // Per-type BUG FIELD CONTRACT (VCST-5582 E-a): what THIS organization's process actually
      // has, requires, and allows — so /qa-bug builds the payload from data instead of the
      // hardcoded Custom.* set of one org. `tracker.fieldMap` stays an OPERATOR-owned override
      // (never written from the scan) and is applied on top at create time.
      if (t.fields && Object.keys(t.fields).length) set("tracker.fields", t.fields);
      // Per-type FORM LAYOUT (VCST-5702 ITEM 0): { <Type>: { htmlControls: [ref, …] } }. The create
      // path binds the `body` slot to a form-visible html control instead of assuming
      // System.Description (which may be off-form → an invisible body). Empty ⇒ legacy behaviour.
      if (t.formLayout && Object.keys(t.formLayout).length) set("tracker.formLayout", t.formLayout);
      // Per-type rule-filter accounting (VCST-5702 ITEM 0b) — scanned/kept/dropped/required, so a
      // slim persisted contract is explained rather than looking lossy. Surfaced by create-workitem.
      if (t.fieldsMeta && Object.keys(t.fieldsMeta).length) set("tracker.fieldsMeta", t.fieldsMeta);
      // A3 — a fieldDefaults carried by the scan is FILTERED: a time-varying sprint/area node id
      // (System.IterationId / System.AreaId) is never persisted (see ILLEGAL_FIELDDEFAULT_REF). The
      // guard mirrors reconcile-profile's `--set` guard so neither write path can plant the time bomb.
      if (t.fieldDefaults && typeof t.fieldDefaults === "object" && !Array.isArray(t.fieldDefaults)) {
        const clean = {};
        for (const [ref, val] of Object.entries(t.fieldDefaults)) {
          if (!ILLEGAL_FIELDDEFAULT_REF.test(ref)) clean[ref] = val;
        }
        if (Object.keys(clean).length) set("tracker.fieldDefaults", clean);
      }
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

  let profile = deepMerge(base, patch);
  // A profile written before 0.4.0 recorded the host by its plugin NAME: read it as the plugin id it
  // means (the one installed plugin with that name), so a re-run upgrades it in place.
  const current = profile.governance;
  const currentId = current?.host ? resolveHostId(current.host) || current.host : null;
  const leavingHost = args.governance === "none" && Boolean(currentId);
  if (args.governance !== undefined) {
    const host = args.governance === "none" ? null : resolveHostId(args.governance);
    const flagged = { tracker: args["gov-tracker"], codeHost: args["gov-code-host"], github: args["gov-github"], telemetry: args["gov-telemetry"], testManagement: args["gov-test-management"], browsers: args["gov-browsers"] };
    // Re-running with the SAME host (§6 after §0-host, or --check) keeps what was confirmed earlier;
    // only a flag changes a role. A different host starts EMPTY — no host has defaults here; pass every
    // role (detect-governance's state.genProfile carries them all).
    const same = host && currentId === host ? current : null;
    // Another host starts clean: its environments are not the previous host's.
    const govExtras = governanceExtras(args, same || {});
    const kept = same ? { ...same.servers, browsers: (same.servers?.browsers || []).join(",") } : {};
    const overrides = Object.fromEntries(Object.keys(flagged).map((k) => [k, flagged[k] !== undefined ? flagged[k] : kept[k]]));
    const extras = same ? { websiteAuth: same.websiteAuth, envs: same.envs, codeAccess: same.codeAccess, ...govExtras } : govExtras;
    profile = { ...profile, governance: governanceBlock(host, overrides, extras) };
  } else if (current?.host) {
    // A day-2 run (--add-env) on a governed project: fold the answers
    // into the block that is already there, and keep everything else.
    // A --gov-<role> flag changes that one role here too (e.g. the code host once §3a has scanned).
    const servers = { ...current.servers };
    for (const [flag, role] of [["gov-tracker", "tracker"], ["gov-code-host", "codeHost"], ["gov-github", "github"],
      ["gov-telemetry", "telemetry"], ["gov-test-management", "testManagement"]]) {
      if (args[flag] !== undefined) servers[role] = String(args[flag]);
    }
    if (args["gov-browsers"] !== undefined) servers.browsers = String(args["gov-browsers"]).split(",").map((s) => s.trim()).filter(Boolean);
    profile = { ...profile, governance: { ...current, host: currentId, servers, ...governanceExtras(args, current) } };
  }

  // A host-governed project is a client's, and its repo scan (§4/§5) does not run — so the defaults
  // (platform, a VirtoCommerce fork) would describe a project that is not there. Record it as a client
  // project the operator works in, and file nothing upstream: nothing leaves for VirtoCommerce from a
  // guest. An explicit flag still wins.
  if (profile.governance?.host) {
    if (!args["project-type"]) profile.projectType = "client";
    if (!args.operator) profile.operator = "client";
    profile.upstream = { ...profile.upstream, fileIssues: false };
    if (profile.projectType === "client" && profile.buildVerify?.source === "vc-deploy-dev") profile.buildVerify.source = "modules-endpoint";
  } else if (leavingHost) {
    // Leaving guest mode (`--governance none` on a profile that had a host): undo what guest mode forced,
    // so a project once taken for host-governed by mistake is a normal one again. The repo scan (§4)
    // re-derives projectType / operator; an explicit flag still wins.
    if (!args["project-type"]) profile.projectType = PROFILE_DEFAULTS.projectType;
    if (!args.operator) profile.operator = PROFILE_DEFAULTS.operator;
    profile.upstream = { ...profile.upstream, fileIssues: PROFILE_DEFAULTS.upstream.fileIssues };
    if (profile.projectType === "platform" && profile.buildVerify?.source === "modules-endpoint") profile.buildVerify.source = "vc-deploy-dev";
  }

  // Prune infra sub-objects that don't apply to the chosen tracker / code host, so the written
  // file MIRRORS THE ANSWERS — no dead `azure:{}` block in a Jira+GitHub profile. This is SAFE:
  // the discriminators are `tracker.kind` and `vcs.clientHost` (never object *presence*), and
  // loadProjectProfile() always re-layers PROFILE_DEFAULTS on read, so any consumer that does
  // touch profile.tracker.azure / profile.vcs.azure still sees the empty default at runtime.
  if (profile.tracker?.kind !== "azure") delete profile.tracker.azure;
  if (profile.vcs?.clientHost !== "azure-repos") delete profile.vcs.azure;
  // The pre-VCST-6402 single-axis fields, if a --merge carried them over: auth.* replaces them.
  delete profile.vcs.auth;
  delete profile.vcs.authEnv;
  // An axis that does not apply to this tracker / code host is "", whatever a flag or an older
  // profile said — the bridge reads `auth.<axis>` to decide whether to go through vc-secrets at all.
  const adoApplies = profile.tracker.kind === "azure" || profile.vcs.clientHost === "azure-repos";
  if (!adoApplies) profile.auth.ado = "";
  if (profile.tracker.kind !== "jira") profile.auth.jira = "";
  // A host-governed project has no token axis of ours: the host's own servers and secret wrapper own
  // every credential, so the bridge never reads auth.* there.
  if (profile.governance?.host) profile.auth = { github: "", ado: "", jira: "" };
  profile.schemaVersion = PROFILE_SCHEMA_VERSION;

  const withMeta = {
    _meta: {
      version: "1.0.0",
      generatedBy: "project-init/gen-profile.mjs",
    },
    ...profile,
  };

  // Protect BEFORE creating — the fourth and last writer of a generated local file. It is also the
  // one that turns self-diagnostics ON, so `.vc-fix/` starts filling right after (VCST-5774 #4).
  // On a host-governed project every `.env.<env>` is local too: it holds the test users' logins, and the
  // host's rules keep environment files out of the repository.
  // That rule lives in its own marked block, so leaving guest mode removes exactly it — a normal project
  // commits its `.env.<env>`.
  const ignored = ensureProjectIgnores(outputRoot());
  if (profile.governance?.host) {
    ignored.push(...ensureGitignoreEntries(outputRoot(), [".env.*"], { title: HOST_ENV_IGNORE, notes: ["Every .env.<env> here holds test-user logins; the host's rules keep env files out of git."] }));
  } else if (leavingHost) {
    const dropped = removeGitignoreBlock(outputRoot(), HOST_ENV_IGNORE);
    if (dropped.length) console.log(`[gen-profile] .gitignore -= ${dropped.join(", ")} (not host-governed any more)`);
  }
  if (ignored.length) console.log(`[gen-profile] .gitignore += ${ignored.join(", ")}`);
  writeFileSync(outPath, JSON.stringify(withMeta, null, 2) + "\n");
  console.log(`[gen-profile] wrote ${outPath}`);
  const g = profile.governance;
  console.log(g?.host
    // A guest's tracker / code host are only known once the interview filled them in — say what IS set.
    ? `[gen-profile] host-governed by ${g.host}: tracker server ${g.servers.tracker || "—"}, code host ${g.servers.codeHost || "—"}, ` +
      `test users ${g.websiteAuth || "—"}${args.tracker || args["client-vcs"] ? ` · tracker=${profile.tracker.kind} clientVcs=${profile.vcs.clientHost}` : ""}`
    : `[gen-profile] projectType=${profile.projectType} tracker=${profile.tracker.kind} ` +
      `clientVcs=${profile.vcs.clientHost} upstream=${profile.upstream.org} ` +
      `contributionMode=${profile.upstream.contributionMode}` +
      (profile.vcs.githubTokenKind ? ` githubToken=${profile.vcs.githubTokenKind}/${profile.vcs.githubForkCapable || "unknown"}` : ""),
  );
  if (args.print) console.log(JSON.stringify(withMeta, null, 2));
}

main();
