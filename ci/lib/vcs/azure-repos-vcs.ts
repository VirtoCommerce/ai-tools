/**
 * AzureReposVcs — Vcs implementation for Azure Repos pull requests (Azure DevOps
 * Git). Used only when a CLIENT deployment's profile sets vcs.clientHost =
 * "azure-repos"; the platform upstream is ALWAYS GitHub, so platform PRs/issues
 * never reach this adapter.
 *
 * Auth is delegated to ci/lib/ado-rest (PAT via ADO_PAT, or an `az login`
 * browser/device token — no passwords). Org/project from env ADO_ORG /
 * ADO_PROJECT, falling back to the profile's vcs.azure.*.
 *
 * Azure Repos has no issues and no forks: fileIssue throws (issues route to the
 * GitHub upstream) and ensureFork is a no-op.
 */
import { readFileSync } from "fs";
import type { Vcs, VcsDeps, PrSpec, IssueSpec } from "./vcs.js";
import { adoAuthHeader, adoConfigured, adoBase } from "../ado-rest.js";
import { loadProjectProfile } from "../../../scripts/lib/project-profile.mjs";

const API_VERSION = "7.0";

/** Azure repo id = the last path segment of a profile repo `name`. */
function azureRepoName(targetRepo: string): string {
  const parts = targetRepo.split("/");
  return parts[parts.length - 1];
}

export class AzureReposVcs implements Vcs {
  readonly kind = "azure-repos" as const;
  readonly enabled: boolean;
  private org: string;
  private project: string;
  private dryRun: boolean;
  private log: (msg: string) => void;

  constructor(deps: VcsDeps) {
    const profile = loadProjectProfile();
    const az = profile.vcs?.azure || { organization: "", project: "" };
    this.org = process.env.ADO_ORG || az.organization || "";
    this.project = process.env.ADO_PROJECT || az.project || "";
    this.enabled = Boolean(this.org && this.project && adoConfigured());
    this.dryRun = deps.dryRun;
    this.log = deps.log;
  }

  private base(): string {
    return adoBase(this.org, this.project);
  }

  async openPullRequest(spec: PrSpec): Promise<string> {
    const repo = azureRepoName(spec.targetRepo);
    if (this.dryRun) {
      this.log(`ADO: (dry-run) would open PR on ${this.org}/${this.project}/${repo}: ${spec.title}`);
      return "(dry-run — no PR created)";
    }
    const description = (() => {
      try {
        return readFileSync(spec.bodyFile, "utf-8");
      } catch {
        return spec.title;
      }
    })();

    const res = await fetch(
      `${this.base()}/_apis/git/repositories/${encodeURIComponent(repo)}/pullrequests?api-version=${API_VERSION}`,
      {
        method: "POST",
        headers: {
          Authorization: await adoAuthHeader(),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sourceRefName: `refs/heads/${spec.workBranch}`,
          targetRefName: `refs/heads/${spec.baseBranch}`,
          title: spec.title,
          description,
          // Azure has no "draft PR" toggle equivalent to gh --draft; isDraft maps.
          isDraft: spec.draft,
        }),
      },
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`ADO: PR creation failed — ${res.status} ${txt.slice(0, 200)}`);
    }
    const data = (await res.json()) as { pullRequestId?: number };
    const id = data.pullRequestId;
    return `${this.base()}/_git/${encodeURIComponent(repo)}/pullrequest/${id ?? ""}`;
  }

  async fileIssue(_spec: IssueSpec): Promise<string> {
    // Azure Repos has no issues. Platform bugs that warrant an issue are always
    // filed on the GitHub upstream (the pipeline uses a GithubVcs for that), so
    // this path is never taken; throw to make a wiring mistake loud.
    throw new Error(
      "AzureReposVcs.fileIssue: issues are filed on the GitHub upstream, not on Azure Repos.",
    );
  }

  async ensureFork(_repo: string, _forkOwner: string): Promise<void> {
    // No fork concept in this flow — a client pushes directly to their own repo.
  }
}
