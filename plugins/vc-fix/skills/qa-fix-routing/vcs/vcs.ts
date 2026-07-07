/**
 * Vcs — code-host abstraction for the auto-fix pipeline's WRITE side
 * (open a pull request, file an issue, ensure a fork exists).
 *
 * Historically run-fix-cycle.ts shelled out to `gh pr create` directly against
 * VirtoCommerce/* repos. That is exactly the GithubVcs `direct`-mode path and is
 * preserved 1:1. This interface lets a CLIENT deployment (project-init wrote a
 * profile) instead:
 *   - open the PR on a CLIENT repo that may live on Azure Repos, or
 *   - open a cross-fork PR to the VirtoCommerce upstream (operator = client), or
 *   - file a GitHub Issue upstream when a platform bug is real but not auto-fixable.
 *
 * Default resolution (see ./index.ts) is GitHub + direct mode, so an
 * unconfigured / VirtoCommerce-internal checkout behaves exactly as before.
 */

export interface VcsDeps {
  /** When true, mutating ops (PR/issue creation) are logged and skipped. */
  dryRun: boolean;
  /** Pipeline logger (timestamped). */
  log: (msg: string) => void;
}

export interface PrSpec {
  /**
   * The repo the PR is opened ON (owner/name). In fork mode this is the UPSTREAM
   * repo (VirtoCommerce/...), and the branch lives on the fork (see forkOwner).
   */
  targetRepo: string;
  /** Base branch to merge into (the repo's default branch). */
  baseBranch: string;
  /** Work branch name, no owner prefix (e.g. claude/qa-autofix/VCST-1234). */
  workBranch: string;
  /**
   * Cross-fork PR: the fork owner. When set, the GitHub PR head is
   * `${forkOwner}:${workBranch}`. Omitted/empty ⇒ same-repo PR (direct mode).
   */
  forkOwner?: string;
  title: string;
  /** Path to a markdown file holding the PR body. */
  bodyFile: string;
  /** Draft PR (CI default true; interactive opens a normal PR). */
  draft: boolean;
  labels?: string[];
}

export interface IssueSpec {
  /** owner/name the issue is filed on (always a GitHub upstream repo). */
  repo: string;
  title: string;
  /** Path to a markdown file holding the issue body. */
  bodyFile: string;
  labels?: string[];
}

export interface Vcs {
  /** Short kind label for logs: "github" | "azure-repos". */
  readonly kind: "github" | "azure-repos";
  /** True iff this host has the creds/config to push & open PRs. */
  readonly enabled: boolean;
  /** Open a pull request. Returns the PR web URL. Throws on hard failure. */
  openPullRequest(spec: PrSpec): Promise<string>;
  /**
   * File an issue (used for platform bugs that are real but not auto-fixable).
   * Returns the issue web URL. Hosts without issues (Azure Repos) throw — the
   * pipeline always routes issues to the GitHub upstream, never here.
   */
  fileIssue(spec: IssueSpec): Promise<string>;
  /** Ensure `forkOwner` has a fork of `repo` (idempotent). No-op for hosts without forks. */
  ensureFork(repo: string, forkOwner: string): Promise<void>;
}
