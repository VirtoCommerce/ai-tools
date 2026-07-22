/**
 * scripts/lib/project-profile.mjs
 *
 * Single source of truth for the DEPLOYMENT PROFILE — the description of what
 * infrastructure THIS checkout of the QA plugin is wired against:
 *   - projectType: native-platform vs a client project with custom modules
 *   - tracker:     Jira vs Azure Boards (bug tracker)
 *   - vcs:         GitHub vs Azure Repos for the CLIENT's own code
 *   - upstream:    the VirtoCommerce GitHub org (always GitHub) where platform
 *                  fixes are PR'd / platform bugs are filed as issues
 *   - repos:       the discovered client/platform repo map
 *
 * Written by `/project-init` (gen-profile.mjs). Read by:
 *   - config.js                → every skill sees it via `env.PROFILE`
 *   - ci/lib/trackers/*        → which tracker adapter to use
 *   - ci/lib/repo-router.ts    → client-vs-platform ownership routing
 *   - ci/run-fix-cycle.ts + developer agents
 *
 * SAFE DEFAULTS: when project-profile.json is ABSENT (fresh checkout, or the
 * existing VirtoCommerce-internal QA setup) this returns the exact pre-existing
 * behaviour — projectType "platform", tracker "jira", client VCS "github",
 * upstream "VirtoCommerce". No file present ⇒ nothing changes.
 *
 * @typedef {Object} ProjectProfile
 * @property {"platform"|"client"} projectType
 * @property {"virto-engineer"|"client"|"ask"} operator
 * @property {{kind:"jira"|"azure", baseUrl:string, projectKey:string,
 *   ticketKeyFormat:"prefixed"|"numeric", crossLinkToken:string,
 *   azure:{organization:string, project:string, team:string, apiBase:string,
 *   projectId:string, stateMap:Record<string,string>,
 *   workItemTypes:Record<string,object>,
 *   roleStates:Record<"in-progress"|"in-review"|"ready-for-test"|"testing"|"tested"|"reopen"|"done", string>,
 *   transitionPolicy:"auto"|"confirm-once"|"ask",
 *   qaRoleStatesComplete:boolean}}} tracker
 * @property {{clientHost:"github"|"azure-repos", clientOrg:string,
 *   azure:{organization:string, project:string}, auth:"gh-cli"|"pat"|"az-login"}} vcs
 * @property {{host:"github", org:string, fileIssues:boolean,
 *   contributionMode:"fork"|"direct", clientGithubAccount:string}} upstream
 * @property {{client:Array<ClientRepo>, platform:Array<object>}} repos
 * @property {{mode:"plugin"|"agent-project", helpersRunnable:boolean}} runtime
 * @property {{projectRoot:string, workspace:string, reports:string, secretsEnv:string, perEnv:string}} paths
 * @property {{source:""|"vc-deploy-dev"|"modules-endpoint"|"ticket"}} buildVerify
 * @property {boolean} selfDiagnostics  the passive session-telemetry CAPTURE hook is OPT-IN — it records to <outputRoot>/.vc-fix/ ONLY when this is explicitly true (and env VC_FIX_DIAG_CAPTURE is not off); absent / any non-true value ⇒ the hook is a full no-op (no `.vc-fix/`). `/project-init` asks the consent question first and writes it on Yes
 * @property {{mode:"auto"|"ask"|"off"}} feedback  consent for UPSTREAM delivery of self-diagnostics (VCST-5509). off = nothing leaves the machine; ask (default) = dry-run + a single Show-diff/Send/Don't-send decision; auto = Issue route files automatically, PR/fork-PR handed off as commands. Gates ONLY deliver.mjs — local capture (selfDiagnostics) + diagnosis need no consent
 *
 * @typedef {Object} ClientRepo
 * @property {string} name  owner/name of the client-owned repo
 * @property {"frontend"|"module"|"platform"} [kind]
 * @property {"github"|"azure-repos"} [host]
 * @property {string} [repoId]  Azure Repos repository GUID (baked so ADO REST calls skip a lookup)
 * @property {string} [defaultBranch]  the repo's default branch
 * @property {string} [integrationBranch]  the branch feature branches base off + PRs TARGET (e.g. "dev"); falls back to defaultBranch when absent
 * @property {string} [workBranchPrefix]  work-branch prefix (default "claude/qa-autofix/")
 * @property {string} [upstream]  the platform repo this was forked/derived from (provenance)
 * @property {string} [upstreamRef]  a CONCRETE, resolvable upstream tag (the fork line's base, e.g. "2.49.0") the fork was cut from (provenance anchor) — NOT the bare MAJOR.MINOR line label
 * @property {boolean} [upstreamRefResolved]  whether upstreamRef was verified to resolve in the upstream repo at discovery (false ⇒ line label/fork version kept; Gate 1b reconstructs)
 * @property {string} [forkVersion]  the fork's OWN package.json version (e.g. "2.49.7"), kept for reference — its patch is independent of upstream tags, so NOT a resolvable ref
 * @property {ContributionPlan} [contribution]  BAKED clone/PR plan so the interactive command doesn't re-derive it from repo-router.ts
 * @property {{install?:string, build?:string, typecheck?:string, lint?:string, test?:string}} [toolchain]  resolved toolchain (kind default + overrides)
 * @property {LocalVerify} [localVerify]  Gate-6 live local-verify facts (frontend forks)
 * @property {string} [installCmd]  legacy toolchain override (else the kind default)
 * @property {string} [buildCmd]
 * @property {string} [typecheckCmd]
 * @property {string} [lintCmd]
 * @property {string} [testCmd]
 *
 * @typedef {Object} ContributionPlan
 * @property {"client"|"platform"} ownership
 * @property {"direct"|"fork"} mode
 * @property {"github"|"azure-repos"} host
 * @property {"gh"|"ado-rest"|"gh-fork"} prApi  how the PR is opened
 * @property {string} [cloneUrl]  clone URL (PAT injected at runtime for azure-repos)
 * @property {string} [prTarget]  target branch for the PR (usually = integrationBranch)
 * @property {string} [authEnv]  env var holding the write credential
 * @property {string} [forkOwner]  when mode="fork": PR head owner
 *
 * @typedef {Object} LocalVerify
 * @property {string} devCmd  e.g. "yarn dev"
 * @property {string} url  e.g. "https://localhost:3000"
 * @property {boolean} [selfSignedCert]
 * @property {string} backendUrlForDev  APP_BACKEND_URL for local dev — the STOREFRONT host (resolves the store AND proxies the API), NOT the admin host
 * @property {string} [storeId]
 * @property {string} [storeDomain]
 * @property {string} [userEnv]  env var with the storefront login (default USER_EMAIL)
 * @property {string} [passEnv]  env var with the storefront password (default USER_PASSWORD)
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

/** @type {ProjectProfile} */
export const PROFILE_DEFAULTS = {
  projectType: "platform",
  operator: "virto-engineer",

  // runtime — how a skill orients itself. DEFAULT (no profile) = the original
  // VirtoCommerce-internal agentic checkout where the .ts/.mjs helpers ACTUALLY RUN
  // headless. /project-init generating a PLUGIN profile overrides this to
  // { mode:"plugin", helpersRunnable:false } so the interactive command reads the
  // baked profile facts instead of trying to execute (or mentally emulate) the helpers.
  runtime: { mode: "agent-project", helpersRunnable: true },

  // paths — absolute roots so skills never break on a drifted Bash cwd. Empty projectRoot ⇒
  // consumers fall back to process.cwd(). The relative names are resolved against projectRoot.
  // NOTE: there is no pluginRoot here — commands resolve the ACTIVE plugin install at runtime
  // via `claude plugin list --json` (knowledge/execution/plugin-root.md), never a baked path.
  paths: {
    projectRoot: "",
    workspace: ".fix-workspace",
    reports: "reports",
    secretsEnv: ".env.local",
    perEnv: "",
  },

  tracker: {
    kind: "jira",
    baseUrl: "",
    projectKey: "",
    // ticketKeyFormat: how a ticket id looks / cross-links from a commit/PR.
    //   "prefixed" = Jira `ABC-123`; "numeric" = Azure Boards bare `12345` (+ crossLinkToken "AB#").
    ticketKeyFormat: "prefixed",
    crossLinkToken: "",
    azure: {
      organization: "",
      project: "",
      team: "",
      apiBase: "", // https://dev.azure.com/<org>/<project> — baked so skills don't reassemble it
      projectId: "", // GUID — needed for policy-evaluation artifactIds etc.
      // Legacy free-form status map (kept for back-compat with any consumer that reads it).
      stateMap: {},
      // Per-work-item-type allowed states, SCANNED live by /project-init (Bug/Task/User Story
      // can each have a different set): { "Bug": { states:[...] }, ... }.
      workItemTypes: {},
      // Lifecycle role -> System.State, so /qa-fix / /qa-verify-fix transition by ROLE,
      // never a hardcoded name. Fix-side roles (used by /qa-fix): in-progress, in-review,
      // ready-for-test, done. QA-side roles (used by /qa-verify-fix): testing, tested,
      // reopen. Populated by /project-init's discover-tracker.mjs scan — default stays {}.
      // No auto-migration: a profile generated before the QA roles / heuristic existed keeps
      // its old map until /project-init (discover-tracker) is re-run to refresh it.
      roleStates: {},
      // "auto" = transition silently by role (log only); "confirm-once" = one upfront ok;
      // "ask" = ask before each transition (the original conservative behaviour).
      transitionPolicy: "ask",
      // Independent completeness signal for the QA-side roles (testing/tested/reopen —
      // used only by /qa-verify-fix). Deliberately SEPARATE from transitionPolicy: a
      // deployment can be fix-side "auto" (all 4 /qa-fix roles found) while its QA roles
      // are still unconfirmed. Defaults false (conservative) — /qa-verify-fix must treat
      // its own role→state transitions as "ask" until /project-init's discover-tracker
      // scan confirms testing/tested/reopen were all found.
      qaRoleStatesComplete: false,
    },
  },
  vcs: {
    clientHost: "github",
    clientOrg: "",
    azure: { organization: "", project: "", apiBase: "" },
    auth: "gh-cli",
    // authEnv: which env var carries the WRITE credential for the client host
    //   (github PAT ⇒ "GITHUB_FIX_BUGS_TOKEN"; azure-repos ⇒ "ADO_PAT"; empty ⇒ session/gh-cli).
    authEnv: "",
  },
  upstream: {
    host: "github",
    org: "VirtoCommerce",
    fileIssues: true,
    contributionMode: "fork",
    clientGithubAccount: "",
  },
  repos: { client: [], platform: [] },

  // buildVerify.source — where /qa-fix confirms deployed versions in Phase 0.
  //   "" (default) ⇒ auto by projectType/kind; "vc-deploy-dev" (native platform),
  //   "modules-endpoint" (client backend GET /api/platform/modules), "ticket" (a
  //   frontend-only client bug — take the storefront version from the ticket; don't
  //   hit the admin modules endpoint, which needs a token).
  buildVerify: { source: "" },

  // selfDiagnostics — the passive session-telemetry hook (hooks/session-telemetry.mjs)
  // is OPT-IN: it records per-skill signals to <outputRoot>/.vc-fix/diagnostics/ ONLY when
  // this field is EXPLICITLY true (and the env kill-switch VC_FIX_DIAG_CAPTURE is not off).
  // Absent profile / absent field / any non-true value ⇒ the hook is a FULL no-op (no
  // `.vc-fix/`). `/project-init` asks the operator the consent question as its FIRST step
  // and, on Yes, writes this flag IMMEDIATELY (before the interview) so its own remaining
  // run is captured. This default (`true`) is the RECOMMENDED answer the interview shows —
  // it is NOT the capture default: with no profile on disk, capture stays off.
  selfDiagnostics: true,

  // feedback — consent for UPSTREAM delivery of self-diagnostics (VCST-5509). This
  // gates ONLY the outbound `deliver.mjs` step; local capture (selfDiagnostics) +
  // diagnosis (`/vc-self-check`) run without consent (nothing leaves the machine).
  //   off  = nothing is ever sent; the DIAG stays local.
  //   ask  = DEFAULT — deliver.mjs is a DRY draft + a single [Show diff]/[Send]/
  //          [Don't send] decision; sends only on Send.
  //   auto = the Issue route files automatically (scrubbed) + prints the filed URL; a PR/fork-PR
  //          is handed off as ready `gh` commands (a human always opens the PR).
  feedback: { mode: "ask" },
};

/** Recursive merge: objects merge key-by-key; arrays + scalars are replaced wholesale. */
function deepMerge(base, override) {
  if (override === undefined || override === null) return base;
  if (Array.isArray(base) || Array.isArray(override)) return override;
  if (typeof base !== "object" || typeof override !== "object") return override;
  const out = { ...base };
  for (const k of Object.keys(override)) out[k] = deepMerge(base[k], override[k]);
  return out;
}

let _cache;

/**
 * Load + memoize the deployment profile, layered over PROFILE_DEFAULTS.
 * Path: PROJECT_PROFILE_PATH env override, else <repoRoot>/project-profile.json.
 * Never throws — a missing/malformed file falls back to defaults with a warning.
 * @param {string} [repoRoot]
 * @returns {ProjectProfile}
 */
export function loadProjectProfile(repoRoot = process.cwd()) {
  if (_cache) return _cache;
  const path =
    process.env.PROJECT_PROFILE_PATH || join(repoRoot, "project-profile.json");
  let profile = PROFILE_DEFAULTS;
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf-8"));
      delete raw._meta;
      profile = deepMerge(PROFILE_DEFAULTS, raw);
    } catch (err) {
      console.warn(
        `[project-profile] Failed to read/parse ${path}: ${err.message}. Using defaults.`,
      );
    }
  }
  _cache = profile;
  return profile;
}

/** Drop the memoized profile (used by gen-profile after writing, and by tests). */
export function resetProjectProfileCache() {
  _cache = undefined;
}
