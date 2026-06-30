/**
 * Repo Router — maps a QA bug (domain / component / free text) to the external
 * VirtoCommerce product repository whose source code must be edited to fix it,
 * and provides deterministic clone / branch helpers for the fix pipeline.
 *
 * The bugs found by this QA system live in *external* repos (the storefront and
 * backend modules), NOT in this testing repo. `ci/run-fix-cycle.ts` uses this
 * module to (a) suggest a target repo to the triage agent, (b) validate the
 * agent's chosen repo against an allowlist, and (c) check out the source.
 */
import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { loadProjectProfile } from "../../scripts/lib/project-profile.mjs";

export type RepoKind = "frontend" | "module" | "platform";

export interface RepoProfile {
  kind: RepoKind;
  language: "ts" | "csharp";
  /** Install deps. `||` fallbacks keep it tolerant of yarn vs npm. */
  installCmd: string;
  buildCmd: string;
  typecheckCmd?: string;
  lintCmd?: string;
  /** Run unit tests (the red→green gate uses this). */
  testCmd: string;
  /** Fallback default branch if `gh repo view` detection fails. */
  defaultBranch: string;
}

export const REPO_PROFILES: Record<RepoKind, RepoProfile> = {
  frontend: {
    kind: "frontend",
    language: "ts",
    installCmd: "yarn install --frozen-lockfile || npm ci || npm install",
    buildCmd: "yarn build || npm run build",
    typecheckCmd: "yarn typecheck || npx vue-tsc --noEmit",
    lintCmd: "yarn lint || npm run lint",
    testCmd: "yarn test:unit || npx vitest run",
    defaultBranch: "dev",
  },
  // `-p:NuGetAudit=false` is required: VC modules set TreatWarningsAsErrors=true, so
  // NuGet-audit warnings (NU1903 vulnerable transitive packages) fail a vanilla
  // restore/build/test even on the UNMODIFIED dev branch (verified vc-module-inventory
  // 2026-06). CLI-only opt-out — never edit Directory.Build.props to suppress.
  module: {
    kind: "module",
    language: "csharp",
    installCmd: "dotnet restore -p:NuGetAudit=false",
    buildCmd: "dotnet build -c Debug -p:NuGetAudit=false",
    testCmd: "dotnet test --nologo -p:NuGetAudit=false",
    defaultBranch: "dev",
  },
  platform: {
    kind: "platform",
    language: "csharp",
    installCmd: "dotnet restore -p:NuGetAudit=false",
    buildCmd: "dotnet build -c Debug -p:NuGetAudit=false",
    // vc-platform: scope to the affected test project (tests/ has 7 projects incl.
    // benchmarks) — agents append the project path rather than testing the repo root.
    testCmd: "dotnet test --nologo -p:NuGetAudit=false",
    defaultBranch: "dev",
  },
};

/**
 * Repo registry — loaded from `ci/config/fix-repos.json` (override path via
 * FIX_REPOS_CONFIG). With 100+ module repos, the allowlist is PATTERN-based, not
 * an enumerated list: a repo is fixable iff its org matches and its name matches
 * an `allow.patterns` entry and no `allow.deny` entry. `explicit` pins the
 * non-module repos (vc-frontend / vc-platform) and their kinds. Everything is
 * DATA, not code — new modules / customer forks / a different org need no source
 * change. Org overridable via FIX_REPO_ORG.
 */
interface FixReposConfig {
  org: string;
  moduleIdPrefix?: string;
  allow: {
    patterns: string[];
    deny?: string[];
    explicit?: Array<{ name: string; kind: RepoKind }>;
  };
  routing: Array<{ name: string; match: string }>;
}

interface RouteRule {
  repo: string;
  match: RegExp;
}

function loadConfig() {
  const configPath =
    process.env.FIX_REPOS_CONFIG || join("ci", "config", "fix-repos.json");
  if (!existsSync(configPath)) {
    throw new Error(`Auto-fix repo registry not found: ${configPath}`);
  }
  const cfg = JSON.parse(readFileSync(configPath, "utf-8")) as FixReposConfig;
  const org = process.env.FIX_REPO_ORG || cfg.org;
  if (!org) throw new Error(`No org in ${configPath} and FIX_REPO_ORG unset`);

  // Case-insensitive: real module repos are mixed-case (vc-module-CyberSource,
  // vc-module-Authorize.Net, vc-module-Paypal-*) — a lowercase-only pattern would
  // wrongly reject them and STOP Gate 1 on a valid repo.
  const allowPatterns = (cfg.allow?.patterns || []).map((p) => new RegExp(p, "i"));
  const denyPatterns = (cfg.allow?.deny || []).map((p) => new RegExp(p, "i"));
  const explicit: Record<string, RepoKind> = {};
  for (const e of cfg.allow?.explicit || []) explicit[e.name] = e.kind;

  const routing: RouteRule[] = (cfg.routing || []).map((rule) => ({
    repo: `${org}/${rule.name}`,
    match: new RegExp(rule.match, "i"),
  }));

  return { org, allowPatterns, denyPatterns, explicit, routing };
}

const CONFIG = loadConfig();

/** GitHub org these repos live under (config `org`, overridable by FIX_REPO_ORG). */
export const REPO_ORG = CONFIG.org;

/** Split `owner/name` → name (or return the bare name unchanged). */
function repoName(repo: string): { owner: string | null; name: string } {
  const i = repo.indexOf("/");
  return i >= 0
    ? { owner: repo.slice(0, i), name: repo.slice(i + 1) }
    : { owner: null, name: repo };
}

// --- Client repo awareness (from the deployment profile) ---------------------
// A native-platform deployment has NO client repos, so CLIENT_ORG is "" and
// repoOwnership() always returns "platform" ⇒ every function below behaves
// exactly as before. Only a client deployment (project-init wrote a profile with
// vcs.clientOrg + repos.client) activates the client branches. fix-repos.json is
// untouched — platform routing is unchanged.
const PROFILE = loadProjectProfile();
/** GitHub/Azure org that owns the CLIENT's custom code ("" for native platform). */
export const CLIENT_ORG: string = PROFILE.vcs.clientOrg || "";
const CLIENT_REPOS = PROFILE.repos.client || [];

export type RepoOwnership = "client" | "platform";

const CLIENT_FULL = new Set<string>();
const CLIENT_BARE = new Set<string>();
const CLIENT_KINDS = new Map<string, RepoKind>();
const CLIENT_HOSTS = new Map<string, "github" | "azure-repos">();
const CLIENT_BRANCHES = new Map<string, string>();
for (const r of CLIENT_REPOS) {
  if (!r?.name) continue;
  const bare = repoName(r.name).name;
  CLIENT_FULL.add(r.name);
  CLIENT_BARE.add(bare);
  if (r.kind) CLIENT_KINDS.set(bare, r.kind as RepoKind);
  if (r.host) CLIENT_HOSTS.set(bare, r.host);
  if (r.defaultBranch) CLIENT_BRANCHES.set(bare, r.defaultBranch);
}

/**
 * Does this repo belong to the CLIENT (custom modules / theme / storefront fork)
 * or to the native VirtoCommerce PLATFORM? Drives the fix-vs-issue decision and
 * which VCS a PR/issue targets. Always "platform" when no client is configured.
 */
export function repoOwnership(repo: string): RepoOwnership {
  const { owner, name } = repoName(repo);
  if (CLIENT_ORG && owner === CLIENT_ORG) return "client";
  if (CLIENT_FULL.has(repo) || CLIENT_BARE.has(name)) return "client";
  return "platform";
}

/**
 * Is the fix agent permitted to push branches / open PRs to this repo?
 * The triage agent's `ROUTE_REPO:` is validated against this — the safety gate.
 * Allowed iff: org matches REPO_ORG, AND (name is pinned in `explicit`
 * OR matches an allow pattern), AND no deny pattern matches.
 */
export function isAllowedRepo(repo: string): boolean {
  const { owner, name } = repoName(repo);
  // Client repos (from the profile) are allowed for their org / listed names,
  // minus the deny patterns (no *-tests / sample / demo). With no client
  // configured, repoOwnership() is always "platform" so this branch never runs.
  if (repoOwnership(repo) === "client") {
    return !CONFIG.denyPatterns.some((re) => re.test(name));
  }
  if (owner !== null && owner !== REPO_ORG) return false;
  if (CONFIG.denyPatterns.some((re) => re.test(name))) return false;
  if (name in CONFIG.explicit) return true;
  return CONFIG.allowPatterns.some((re) => re.test(name));
}

/** Classify a repo into a kind (drives the build/test profile). */
export function repoKind(repo: string): RepoKind {
  const { name } = repoName(repo);
  // Client repos: use the kind declared in the profile; else a name heuristic.
  if (repoOwnership(repo) === "client") {
    const declared = CLIENT_KINDS.get(name);
    if (declared) return declared;
    return /front|storefront|theme|vue|spa/i.test(name) ? "frontend" : "module";
  }
  if (name in CONFIG.explicit) return CONFIG.explicit[name];
  return "module"; // anything matching the module pattern
}

export function repoProfile(repo: string): RepoProfile {
  if (!isAllowedRepo(repo)) throw new Error(`Repo not allowed: ${repo}`);
  return REPO_PROFILES[repoKind(repo)];
}

/**
 * How a fix to this repo gets contributed back: where it lives (host), and
 * whether we push directly to it or to a fork.
 *
 *  - **client** repo  → push directly; host is the client's (`github` or
 *    `azure-repos`, per the repo entry / `vcs.clientHost`).
 *  - **platform** repo → always GitHub. `direct` for a VirtoCommerce engineer
 *    (and for any unconfigured / native-platform checkout), or `fork` when the
 *    operator is a client contributing from their own GitHub account
 *    (`upstream.contributionMode = "fork"` AND `upstream.clientGithubAccount`
 *    set). With no profile, `clientGithubAccount` is "" ⇒ always `direct` ⇒
 *    pre-existing behaviour.
 */
export interface ContributionPlan {
  ownership: RepoOwnership;
  host: "github" | "azure-repos";
  mode: "direct" | "fork";
  /** Fork owner when mode === "fork" (else ""). PR head = `${forkOwner}:${branch}`. */
  forkOwner: string;
  /** Azure DevOps org/project for an azure-repos host (else empty). */
  azure: { organization: string; project: string };
}

export function contributionPlan(repo: string): ContributionPlan {
  const ownership = repoOwnership(repo);
  if (ownership === "client") {
    const bare = repoName(repo).name;
    const host = CLIENT_HOSTS.get(bare) || PROFILE.vcs.clientHost || "github";
    return {
      ownership,
      host,
      mode: "direct",
      forkOwner: "",
      azure: {
        organization: PROFILE.vcs.azure?.organization || "",
        project: PROFILE.vcs.azure?.project || "",
      },
    };
  }
  // platform — always GitHub. Fork mode requires BOTH an explicit fork contribution
  // mode AND a configured account; otherwise direct (the native-platform default).
  const u = PROFILE.upstream;
  const fork = u.contributionMode === "fork" && Boolean(u.clientGithubAccount);
  return {
    ownership,
    host: "github",
    mode: fork ? "fork" : "direct",
    forkOwner: fork ? u.clientGithubAccount : "",
    azure: { organization: "", project: "" },
  };
}

/** Default branch declared for a client repo in the profile (azure-repos has no `gh`). */
function clientDefaultBranch(repo: string): string | undefined {
  return CLIENT_BRANCHES.get(repoName(repo).name);
}

/**
 * Heuristic routing rules — first match wins. Used to *suggest* a repo to the
 * triage agent (which makes the final, authoritative call from the ticket text).
 * Order (most specific → broad catch-all) is defined in the config file.
 */
const ROUTING_TABLE: RouteRule[] = CONFIG.routing;

/** Best-guess target repo from arbitrary bug text. Returns null if no rule matches. */
export function suggestRepo(text: string): string | null {
  for (const rule of ROUTING_TABLE) {
    if (rule.match.test(text)) return rule.repo;
  }
  return null;
}

/**
 * Routing reference injected into the triage prompt. With 100+ module repos we
 * describe the allowed *set* (pattern) plus the common domain→repo heuristics —
 * not an enumerated dump. The triage agent may pick ANY repo that satisfies
 * `isAllowedRepo` (validated downstream).
 */
export function routingReference(): string {
  const common = ROUTING_TABLE.map((r) => `- ${r.repo}`).join("\n");
  const lines = [
    `Allowed targets (platform org \`${REPO_ORG}\`):`,
    `- ${REPO_ORG}/vc-frontend (storefront, Vue/TS)`,
    `- ${REPO_ORG}/vc-platform (platform core, C#)`,
    `- ${REPO_ORG}/vc-module-<name> or ${REPO_ORG}/vc-module-x-<name> (any backend module, C#)`,
  ];
  if (CLIENT_REPOS.length) {
    lines.push(
      ``,
      `Client-owned repos (custom modules / theme / storefront fork — fix & PR go HERE):`,
      ...CLIENT_REPOS.map((r) => `- ${r.name}${r.kind ? ` (${r.kind})` : ""}`),
    );
  }
  lines.push(
    ``,
    `Common domain → repo hints (pick the best fit; you are not limited to these):`,
    common,
  );
  return lines.join("\n");
}

export interface Checkout {
  /** Absolute path to the checked-out repo. */
  path: string;
  /** The base branch the work branch was cut from. */
  baseBranch: string;
  /** The work branch created for the fix. */
  workBranch: string;
  repo: string;
  /** Code host of this checkout ("github" | "azure-repos"). */
  host?: "github" | "azure-repos";
  /** client vs platform (drives PR target & whether an upstream issue is an option). */
  ownership?: RepoOwnership;
  /**
   * The ref to use as the PR head: `${forkOwner}:${workBranch}` for a fork-mode
   * platform PR, else just `workBranch`. The git remote `origin` is already set
   * so the agent's `git push -u origin <branch>` reaches the right place.
   */
  headRef?: string;
}

function sh(cmd: string, cwd?: string): string {
  return execSync(cmd, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function detectDefaultBranch(repo: string, fallback: string): string {
  try {
    return sh(`gh repo view ${repo} --json defaultBranchRef -q .defaultBranchRef.name`);
  } catch {
    return fallback;
  }
}

/**
 * Build the Azure Repos clone/push URL. When ADO_PAT is present it is embedded so
 * a later `git push` authenticates without a credential helper — the workspace
 * (`.fix-workspace`) is gitignored and ephemeral. With `az login` (no PAT) we
 * fall back to a plain URL and rely on the Git Credential Manager / `az` helper.
 */
function azureGitUrl(org: string, project: string, name: string): string {
  const pat = process.env.ADO_PAT || "";
  const cred = pat ? `${encodeURIComponent("x-token")}:${pat}@` : "";
  return `https://${cred}dev.azure.com/${org}/${encodeURIComponent(project)}/_git/${encodeURIComponent(name)}`;
}

/**
 * Clone (or refresh) the target repo into `workspaceDir`, then cut a fresh work
 * branch from the default branch. Shallow clone keeps CI fast. Idempotent: an
 * existing checkout is fetched and hard-reset to the remote base.
 *
 * Routed by the deployment profile (see contributionPlan):
 *  - **default** (platform direct / GitHub, or a client repo on GitHub): the
 *    original `gh repo clone <repo>` path — UNCHANGED.
 *  - **fork** (platform, operator = client): ensure the client's fork, clone it as
 *    `origin`, add `upstream`, and branch from `upstream/<base>`. PR head is
 *    `<forkOwner>:<branch>`.
 *  - **azure-repos** (client on Azure DevOps): `git clone` the Azure Git URL.
 */
export function checkoutForFix(
  repo: string,
  ticketKey: string,
  workspaceDir: string,
): Checkout {
  if (!isAllowedRepo(repo)) {
    throw new Error(`Refusing to checkout repo not in allowlist: ${repo}`);
  }
  const profile = repoProfile(repo);
  const ws = resolve(workspaceDir);
  mkdirSync(ws, { recursive: true });

  const name = repo.split("/").pop() || repo;
  const dest = join(ws, name);
  const plan = contributionPlan(repo);
  // `claude/`-prefixed so Claude Code Routines (scheduled cloud runs) can push it
  // without needing "Allow unrestricted branch pushes". The interactive /qa-fix and
  // the headless CI path share this convention.
  const workBranch = `claude/qa-autofix/${ticketKey}`;

  // --- Azure Repos client checkout (clientHost = "azure-repos") ---
  if (plan.host === "azure-repos") {
    const baseBranch = clientDefaultBranch(repo) || "main";
    const url = azureGitUrl(plan.azure.organization, plan.azure.project, name);
    if (!existsSync(dest)) {
      sh(`git clone --depth 1 --branch ${baseBranch} ${JSON.stringify(url)} "${dest}"`);
    } else {
      sh(`git fetch origin ${baseBranch} --depth 1`, dest);
      sh(`git checkout ${baseBranch}`, dest);
      sh(`git reset --hard origin/${baseBranch}`, dest);
    }
    sh(`git checkout -B ${workBranch}`, dest);
    return {
      path: dest, baseBranch, workBranch, repo,
      host: "azure-repos", ownership: plan.ownership, headRef: workBranch,
    };
  }

  // --- GitHub fork-mode checkout (client contributing to the VC upstream) ---
  if (plan.mode === "fork") {
    const baseBranch = detectDefaultBranch(repo, profile.defaultBranch);
    const forkFull = `${plan.forkOwner}/${name}`;
    sh(`gh repo fork ${repo} --clone=false`); // idempotent: succeeds if fork exists
    if (!existsSync(dest)) {
      sh(`gh repo clone ${forkFull} "${dest}"`);
    }
    // Branch from the UPSTREAM base (the fork may be stale).
    try {
      sh(`git remote add upstream https://github.com/${repo}.git`, dest);
    } catch {
      /* upstream remote already present */
    }
    sh(`git fetch upstream ${baseBranch} --depth 1`, dest);
    sh(`git checkout -B ${workBranch} upstream/${baseBranch}`, dest);
    return {
      path: dest, baseBranch, workBranch, repo,
      host: "github", ownership: plan.ownership, headRef: `${plan.forkOwner}:${workBranch}`,
    };
  }

  // --- Default: direct GitHub clone (UNCHANGED from the original path) ---
  const baseBranch = detectDefaultBranch(repo, profile.defaultBranch);
  if (!existsSync(dest)) {
    sh(`gh repo clone ${repo} "${dest}" -- --depth 1 --branch ${baseBranch}`);
  } else {
    sh(`git fetch origin ${baseBranch} --depth 1`, dest);
    sh(`git checkout ${baseBranch}`, dest);
    sh(`git reset --hard origin/${baseBranch}`, dest);
  }

  // Cut a clean work branch (re-create if a stale one exists).
  sh(`git checkout -B ${workBranch}`, dest);

  return {
    path: dest, baseBranch, workBranch, repo,
    host: "github", ownership: plan.ownership, headRef: workBranch,
  };
}
