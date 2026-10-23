/**
 * scripts/lib/project-profile.mjs — vc-init's copy, the WRITER side of the schema.
 *
 * Single source of truth for the DEPLOYMENT PROFILE — the description of what
 * infrastructure THIS checkout of the QA plugin is wired against:
 *   - projectType: native-platform vs a client project with custom modules
 *   - tracker:     Jira vs Azure Boards (bug tracker)
 *   - vcs:         GitHub vs Azure Repos for the CLIENT's own code
 *   - auth:        how each credential axis (GitHub / Azure DevOps / Jira) authenticates
 *   - upstream:    the VirtoCommerce GitHub org (always GitHub) where platform
 *                  fixes are PR'd / platform bugs are filed as issues
 *   - repos:       the discovered client/platform repo map
 *   - perf:        vc-perf's block (written through profile-set.mjs by /perf-init)
 *
 * vc-init is the ONLY writer (VCST-6402): `/project-init` (gen-profile.mjs, reconcile-profile.mjs)
 * and profile-set.mjs, which /qa-bug and /perf-init call instead of editing the file. vc-fix and
 * vc-perf carry read-only loader copies of PROFILE_DEFAULTS; when a field is added here, the same
 * commit adds it there.
 *
 * NO SILENT DEFAULTS for a missing file any more. A consumer (vc-fix, vc-perf) that finds no
 * project-profile.json stops and says "run /project-init"; this writer-side loader is tolerant
 * only because onboarding itself has to run before the file exists (`readProjectProfile`).
 *
 * `schemaVersion` — PROFILE_SCHEMA_VERSION below. A file without it is a version-1 profile
 * (written before VCST-6402: single `vcs.auth`, tokens in .env.local) and is still READ;
 * `/project-init --check` migrates it. A file with a HIGHER version than a reader knows was
 * written by a newer vc-init, and the reader stops rather than guess.
 *
 * @typedef {Object} ProjectProfile
 * @property {number} schemaVersion
 * @property {{github:""|"pat"|"gh-cli", ado:""|"pat"|"az-login", jira:""|"pat"|"oauth"}} auth
 *   how each axis authenticates. `pat` ⇒ the token lives in vc-secrets and reaches a process only
 *   through the $VC_RUN bridge; a session value (`gh-cli`, `az-login`, `oauth`) ⇒ the tool's own
 *   login. "" ⇒ the axis does not apply to this deployment (e.g. `ado` on Jira + GitHub).
 * @property {Record<string, any>} perf  vc-perf's block — an open map, kept wholesale by reconcile
 * @property {{host:string|null, secrets:"host"|"vc-secrets", servers:Record<string,string|string[]>, stand:{writable:boolean}, websiteAuth:""|"host-secrets"|"manual-operator", envs:Record<string,string>, codeAccess:""|"none"|"read"|"write"}} governance
 *   a host-governed project (schema 3): see the PROFILE_DEFAULTS comment
 * @property {"platform"|"client"} projectType
 * @property {"virto-engineer"|"client"|"ask"} operator
 * @property {{kind:"jira"|"azure", baseUrl:string, projectKey:string,
 *   ticketKeyFormat:"prefixed"|"numeric", crossLinkToken:string,
 *   fields:Record<string, Array<{ref:string,name:string,required:boolean,type:string,
 *     allowedValues?:string[],defaultValue?:string}>>,
 *   fieldMap:Record<string,string>, fieldDefaults:Record<string,string>,
 *   azure:{organization:string, project:string, team:string, apiBase:string,
 *   projectId:string, stateMap:Record<string,string>,
 *   workItemTypes:Record<string,object>,
 *   roleStates:Record<"in-progress"|"in-review"|"ready-for-test"|"testing"|"tested"|"reopen"|"done", string>,
 *   roleStatesByType:Record<string, Record<string, string>>,
 *   transitionPolicy:"auto"|"confirm-once"|"ask",
 *   qaRoleStatesComplete:boolean}}} tracker
 * @property {{clientHost:"github"|"azure-repos", clientOrg:string,
 *   azure:{organization:string, project:string}, githubTokenKind:""|"classic"|"fine-grained"|"gh-cli"|"none",
 *   githubForkCapable:""|"yes"|"no"|"unknown"}} vcs
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

/** The profile schema this plugin writes. Bump it when a reader could misread an older shape. */
export const PROFILE_SCHEMA_VERSION = 3;

/** @type {ProjectProfile} */
export const PROFILE_DEFAULTS = {
  schemaVersion: PROFILE_SCHEMA_VERSION,
  projectType: "platform",
  operator: "virto-engineer",

  // runtime — how a skill orients itself. DEFAULT (a profile written without --runtime-mode) = the original
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
    // ─── the per-ORGANIZATION bug FIELD CONTRACT (VCST-5582 E) ─────────────────────────
    // `fields` is DISCOVERED (by /project-init's discover-tracker.mjs scan), `fieldMap` is
    // OPERATOR-OWNED. Together they replace the hardcoded `Custom.Environment` /
    // `Custom.Reportedby` / `Custom.Typeofbug` set that only ever existed in one org's process
    // (and was rejected or silently blank on every other one, while THAT process's required
    // fields went unfilled).
    //
    //   fields:   { "<WorkItemType>": [ { ref, name, required, type,
    //                                     allowedValues?, defaultValue? } ] }
    //             `type` (html / plainText / string / picklistString / identity / treePath /
    //             integer) makes the HTML decision DERIVED, not asserted. EMPTY ⇒ metadata was
    //             unreachable ⇒ the create path falls back to the legacy field set, clearly
    //             labelled "unverified defaults" (the E-f fallback ladder).
    //   fieldMap: { "<semantic slot>": "<field ref>" } — the operator's LAST WORD, applied on
    //             top of auto-matching. Also where an answer to "which field is Environment?"
    //             is persisted, so it is asked exactly ONCE per deployment. Slots:
    //             title/body/repro/expected/actual/severity/priority/environment/bugType/
    //             reportedBy/systemInfo/foundIn/sprint/assignee/tags (see
    //             skills/qa-fix-routing/bug-contract.mjs BUG_SLOTS).
    //   fieldDefaults: { "<field ref>": "<value>" } — per-deployment CONSTANTS the operator
    //             confirmed once (e.g. Environment = QA). A stored default, never a per-bug guess.
    fields: {},
    fieldMap: {},
    fieldDefaults: {},
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
      roleStatesByType: {},
      // Fix-side completeness signal (in-progress/in-review/ready-for-test/done all found by the
      // discover-tracker scan). Baked as a canonical boolean under tracker.azure.* so readers do
      // not have to re-derive it from transitionPolicy or the map (VCST-5582 E3). Defaults false.
      roleStatesComplete: false,
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
    // githubTokenKind / githubForkCapable — the PROBED kind of the GitHub credential
    // (VCST-5582 A), written by /project-init from probe-lib.classifyGithubTokenKind().
    //   githubTokenKind:   "" (unprobed) | "classic" | "fine-grained" | "gh-cli" | "none"
    //   githubForkCapable: "" (unprobed) | "yes" | "no" | "unknown"
    // WHY this is stored next to contributionMode: `contributionMode: "fork"` says WHERE a
    // platform PR should go, not whether this credential CAN get it there. A fine-grained PAT
    // is bound to one resource owner and is read-only on public repos it does not own, so it
    // authenticates, reads vc-platform as pull(read-only), is classified "fork", and then 403s
    // at fork/push/issue-create time. With the kind persisted, /qa-fix Gate 1 and
    // /vc-self-check deliver refuse an impossible route UP FRONT. Empty = never probed ⇒
    // consumers must treat it as unknown, never as capable.
    githubTokenKind: "",
    githubForkCapable: "",
  },
  upstream: {
    host: "github",
    org: "VirtoCommerce",
    fileIssues: true,
    contributionMode: "fork",
    clientGithubAccount: "",
  },
  repos: { client: [], platform: [] },

  // auth — HOW each credential axis authenticates (VCST-6402; replaces the single `vcs.auth`,
  // which described only the client host and said nothing about the upstream or the tracker).
  //   github: "pat" | "gh-cli"     — always applies (the platform upstream is always GitHub)
  //   ado:    "pat" | "az-login"   — Azure Boards tracker or Azure Repos code host
  //   jira:   "pat" | "oauth"      — Jira tracker (`pat` = an Atlassian API token)
  //   ""                            — the axis does not apply to this deployment
  // A `pat` axis keeps its token in vc-secrets (`github-pat` / `ado-pat` / `jira-token`) and a
  // process gets it only through `node "$VC_RUN" <tool> …`; the bridge reads this block to decide
  // whether to go through vc-secrets at all — a session axis runs the tool directly.
  auth: { github: "", ado: "", jira: "" },

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
  // run is captured. The persisted default is **false** (opt-in fails SAFE): a profile written
  // WITHOUT an explicit consent answer must never silently enable capture (PR #143 R2, NA-4).
  // The interview's *recommended* answer is a separate, hard-coded "Yes (recommended)" nudge
  // (reconcile-profile.mjs) — recommending ON is not the same as consenting ON, so it does NOT
  // live here. Every real consent path (§0b stub, the interview's step-6 rewrite) passes an
  // explicit `--self-diagnostics <answer>`; only a flag-less write inherits this safe default.
  selfDiagnostics: false,

  // feedback — consent for UPSTREAM delivery of self-diagnostics (VCST-5509). This
  // gates ONLY the outbound `deliver.mjs` step; local capture (selfDiagnostics) +
  // diagnosis (`/vc-self-check`) run without consent (nothing leaves the machine).
  //   off  = nothing is ever sent; the DIAG stays local.
  //   ask  = DEFAULT — deliver.mjs is a DRY draft + a single [Show diff]/[Send]/
  //          [Don't send] decision; sends only on Send.
  //   auto = the Issue route files automatically (scrubbed) + prints the filed URL; a PR/fork-PR
  //          is handed off as ready `gh` commands (a human always opens the PR).
  feedback: { mode: "ask" },

  // perf — vc-perf's block (aspireHostPath / backendUrl / storeId / benchmark / loadtest …). An
  // OPEN MAP here: its keys are vc-perf's to define, so reconcile keeps it wholesale and never
  // prunes it, and `/perf-init` writes it through profile-set.mjs `--merge perf=<json>`.
  perf: {},

  // governance — a HOST-GOVERNED project (VCST-6402 step 8): the client runs its own governance
  // plugin (rules, approved MCP servers, its own secret wrapper) and our plugins are a guest.
  //   host:    the host plugin's id, `<plugin>@<marketplace>` (found by vc-init lib/governance.mjs) | null (= not governed)
  //   secrets: "host" — no token path of ours runs at all (bridge refuses, no vc-secrets, no PAT, no
  //            az login) | "vc-secrets" — the normal VCST-6402 flow
  //   servers: the host's MCP server key per role — operator-confirmed, never inferred
  //   stand.writable: false on a governed project (no seeding/mutation of the client's stands)
  //   websiteAuth: how test users sign in to the client's site — "host-secrets" (passwords in the host's
  //            wrapper, typed by NAME) | "manual-operator" (the operator signs in by hand) | ""
  //   envs:    open map, `.env.<env>` name → the host's website environment (its password slots' prefix)
  //   codeAccess: what the person may do with the client's code through servers.codeHost —
  //            "none" | "read" (read for root cause, never a PR) | "write" (a PR for review) | ""
  governance: {
    host: null,
    secrets: "vc-secrets",
    servers: { tracker: "", codeHost: "", github: "", telemetry: "", testManagement: "", browsers: [] },
    stand: { writable: true },
    websiteAuth: "",
    envs: {},
    codeAccess: "",
  },
};

/** Recursive merge: objects merge key-by-key; arrays + scalars are replaced wholesale. */
export function deepMerge(base, override) {
  if (override === undefined || override === null) return base;
  if (Array.isArray(base) || Array.isArray(override)) return override;
  if (typeof base !== "object" || typeof override !== "object") return override;
  const out = { ...base };
  for (const k of Object.keys(override)) out[k] = deepMerge(base[k], override[k]);
  return out;
}

/** Where the profile lives: PROJECT_PROFILE_PATH, else <repoRoot>/project-profile.json. */
export function projectProfilePath(repoRoot = process.cwd()) {
  return process.env.PROJECT_PROFILE_PATH || join(repoRoot, "project-profile.json");
}

/**
 * Read the profile WITHOUT layering defaults or throwing — the onboarding side needs to know
 * whether a file exists before one does. `raw` is the parsed file minus `_meta`; `error` is a
 * parse failure (a malformed file is reported, never silently replaced by defaults).
 * @param {string} [repoRoot]
 * @returns {{ path: string, exists: boolean, raw: object|null, error: string|null }}
 */
export function readProjectProfile(repoRoot = process.cwd()) {
  const path = projectProfilePath(repoRoot);
  if (!existsSync(path)) return { path, exists: false, raw: null, error: null };
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    delete raw._meta;
    return { path, exists: true, raw, error: null };
  } catch (err) {
    return { path, exists: true, raw: null, error: err.message };
  }
}

/**
 * Load the deployment profile layered over PROFILE_DEFAULTS — the writer side's view. A missing
 * or unparsable file yields the defaults (with a warning for the second): onboarding scripts run
 * before the file exists, and verify-access reports the missing file as its own FAIL row. Not
 * memoized — a defaults object cached at the start of /project-init would outlive the profile
 * the same run then writes.
 * @param {string} [repoRoot]
 * @returns {ProjectProfile}
 */
export function loadProjectProfile(repoRoot = process.cwd()) {
  const { path, raw, error } = readProjectProfile(repoRoot);
  if (error) console.warn(`[project-profile] Failed to parse ${path}: ${error}. Using defaults.`);
  return raw ? deepMerge(PROFILE_DEFAULTS, raw) : PROFILE_DEFAULTS;
}

/** Kept for callers written against the memoized loader; there is no cache any more. */
export function resetProjectProfileCache() {}

/**
 * Which credential axes apply to this deployment, and how each authenticates. Reads `auth.*`
 * (schema 2) and falls back to what a version-1 profile recorded — `vcs.auth` described only the
 * client host, so an axis it does not cover comes back as mode "" (unknown) while still applying.
 * @param {object} profile  a raw or layered profile
 * @returns {{ github:{applies:boolean,mode:string}, ado:{applies:boolean,mode:string}, jira:{applies:boolean,mode:string} }}
 */
export function authAxes(profile) {
  const p = profile || {};
  const tracker = p.tracker?.kind || "jira";
  const host = p.vcs?.clientHost || "github";
  const legacy = p.vcs?.auth;
  const a = p.auth || {};
  const githubLegacy = host === "github" && (legacy === "pat" || legacy === "gh-cli") ? legacy
    : p.vcs?.githubTokenKind === "gh-cli" ? "gh-cli"
      : ["classic", "fine-grained"].includes(p.vcs?.githubTokenKind) ? "pat" : "";
  const adoApplies = tracker === "azure" || host === "azure-repos";
  const adoLegacy = host === "azure-repos" && (legacy === "pat" || legacy === "az-login") ? legacy : "";
  return {
    github: { applies: true, mode: a.github || githubLegacy },
    ado: { applies: adoApplies, mode: adoApplies ? (a.ado || adoLegacy) : "" },
    jira: { applies: tracker === "jira", mode: tracker === "jira" ? (a.jira || "") : "" },
  };
}
