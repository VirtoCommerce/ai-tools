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

/**
 * Is the fix agent permitted to push branches / open PRs to this repo?
 * The triage agent's `ROUTE_REPO:` is validated against this — the safety gate.
 * Allowed iff: org matches REPO_ORG, AND (name is pinned in `explicit`
 * OR matches an allow pattern), AND no deny pattern matches.
 */
export function isAllowedRepo(repo: string): boolean {
  const { owner, name } = repoName(repo);
  if (owner !== null && owner !== REPO_ORG) return false;
  if (CONFIG.denyPatterns.some((re) => re.test(name))) return false;
  if (name in CONFIG.explicit) return true;
  return CONFIG.allowPatterns.some((re) => re.test(name));
}

/** Classify a repo into a kind (drives the build/test profile). */
export function repoKind(repo: string): RepoKind {
  const { name } = repoName(repo);
  if (name in CONFIG.explicit) return CONFIG.explicit[name];
  return "module"; // anything matching the module pattern
}

export function repoProfile(repo: string): RepoProfile {
  if (!isAllowedRepo(repo)) throw new Error(`Repo not allowed: ${repo}`);
  return REPO_PROFILES[repoKind(repo)];
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
  return [
    `Allowed targets (org \`${REPO_ORG}\`):`,
    `- ${REPO_ORG}/vc-frontend (storefront, Vue/TS)`,
    `- ${REPO_ORG}/vc-platform (platform core, C#)`,
    `- ${REPO_ORG}/vc-module-<name> or ${REPO_ORG}/vc-module-x-<name> (any backend module, C#)`,
    ``,
    `Common domain → repo hints (pick the best fit; you are not limited to these):`,
    common,
  ].join("\n");
}

export interface Checkout {
  /** Absolute path to the checked-out repo. */
  path: string;
  /** The base branch the work branch was cut from. */
  baseBranch: string;
  /** The work branch created for the fix. */
  workBranch: string;
  repo: string;
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
 * Clone (or refresh) the target repo into `workspaceDir`, then cut a fresh work
 * branch from the default branch. Shallow clone keeps CI fast. Idempotent: an
 * existing checkout is fetched and hard-reset to the remote base.
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

  const name = repo.split("/")[1];
  const dest = join(ws, name);
  const baseBranch = detectDefaultBranch(repo, profile.defaultBranch);
  // `claude/`-prefixed so Claude Code Routines (scheduled cloud runs) can push it
  // without needing "Allow unrestricted branch pushes". The interactive /qa-fix and
  // the headless CI path share this convention.
  const workBranch = `claude/qa-autofix/${ticketKey}`;

  if (!existsSync(dest)) {
    sh(`gh repo clone ${repo} "${dest}" -- --depth 1 --branch ${baseBranch}`);
  } else {
    sh(`git fetch origin ${baseBranch} --depth 1`, dest);
    sh(`git checkout ${baseBranch}`, dest);
    sh(`git reset --hard origin/${baseBranch}`, dest);
  }

  // Cut a clean work branch (re-create if a stale one exists).
  sh(`git checkout -B ${workBranch}`, dest);

  return { path: dest, baseBranch, workBranch, repo };
}
