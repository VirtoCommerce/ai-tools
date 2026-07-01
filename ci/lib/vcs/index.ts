/**
 * VCS factory. Resolves which code-host adapter the auto-fix pipeline should use
 * to open a PR for a given repo OWNERSHIP, and a separate adapter for filing
 * issues on the platform upstream.
 *
 * Resolution:
 *   - PR on a "platform" repo            → GitHub (upstream is always GitHub)
 *   - PR on a "client" repo, clientHost
 *       "azure-repos"                    → Azure Repos
 *       "github" (default)               → GitHub
 *   - Issue (platform bug, not fixable)  → GitHub (upstream)
 *
 * Default (no profile) ⇒ GithubVcs everywhere ⇒ pre-existing behaviour.
 */
import type { Vcs, VcsDeps } from "./vcs.js";
import { GithubVcs } from "./github-vcs.js";
import { AzureReposVcs } from "./azure-repos-vcs.js";

export type { Vcs, VcsDeps, PrSpec, IssueSpec } from "./vcs.js";

/**
 * VCS adapter for opening a PR on a repo, chosen by its resolved code host.
 * Pass `contributionPlan(repo).host` — that is per-repo aware (a client repo's
 * own `host` overrides the global `vcs.clientHost`), and it is always "github"
 * for platform repos. With no profile the host is always "github" ⇒ GithubVcs
 * ⇒ pre-existing behaviour.
 */
export function getVcs(host: "github" | "azure-repos", deps: VcsDeps): Vcs {
  return host === "azure-repos" ? new AzureReposVcs(deps) : new GithubVcs(deps);
}

/**
 * VCS for filing an issue on the platform UPSTREAM. The upstream host is always
 * GitHub (the VirtoCommerce org's repos are public GitHub), so this is always a
 * GithubVcs regardless of where the client's own code lives.
 */
export function getUpstreamVcs(deps: VcsDeps): Vcs {
  return new GithubVcs(deps);
}
